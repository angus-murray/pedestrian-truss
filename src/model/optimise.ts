/**
 * Section optimiser: with the geometry and loads fixed, refines the section of each member group (within its
 * section type and grade) towards a target utilisation, in a few analysis iterations.
 *
 * Each iteration analyses the bridge, then for each group re-checks every member with each candidate section
 * using that analysis's member actions (the elastic buckling load about each axis scaled by the change in the second
 * moment of area), and takes the lightest section whose largest utilisation is at most the target. The chords are
 * also kept stiff enough for the deflection limit and the vertical vibration check (AS 5100.2 Cl. 13.4), and the
 * stringers for their deflection limit, from estimates scaled from the last analysis: truss stiffness from the chord
 * areas, f0 ∝ √(k / M), acceleration ∝ 1 / M, stringer deflection ∝ 1 / I_x. Member actions and buckling loads change with the sections,
 * so the analysis is repeated until the selection stops changing or the iteration limit is reached.
 */
import { sectionProps } from '../design/section';
import { sectionsOf } from '../data/sections';
import { designMember, runAnalysis } from './analysis';
import { buildModel, cgLevelError, effectiveSections, stringerFitError, transverseWidth } from './build';

const isChord = (g: GroupKey) => g === 'topChord' || g === 'bottomChord';
const isWeb = (g: GroupKey) => g === 'vertical' || g === 'diagonal';

/** Outer size of a section (m): across the bridge for the chords and web members, otherwise the larger dimension. */
function sizeOf(spec: GroupSection, g: GroupKey): number {
  if (isChord(g)) return transverseWidth(spec, 'chord');
  if (isWeb(g)) return transverseWidth(spec, 'web');
  const sp = sectionProps(spec);
  return Math.max(sp.d, sp.b) / 1000;
}

/**
 * Ranking of the candidate sections: by mass, or (compact, the default) by mass × √(outer size), which prefers a
 * more compact, thicker section to a wide thin one of similar mass and keeps the members proportionate.
 */
function cost(input: BridgeInput, spec: GroupSection, g: GroupKey): number {
  return sectionProps(spec).mass * (input.optimiseCompact ? Math.sqrt(sizeOf(spec, g)) : 1);
}

/**
 * The top chord at least as large as the bottom chord: wider across the bridge, or as wide and at least as heavy.
 */
function chordOrderOk(sections: BridgeInput['sections']): boolean {
  const wt = transverseWidth(sections.topChord, 'chord'), wb = transverseWidth(sections.bottomChord, 'chord');
  if (Math.abs(wt - wb) > 1e-6) return wt > wb;
  return sectionProps(sections.topChord).mass >= sectionProps(sections.bottomChord).mass - 1e-9;
}

/**
 * The web members within the chord widths: at most maxWebRatio × the narrower chord, and at least minWebRatio × the wider
 * chord (a Warren truss has no verticals).
 */
function proportionsOk(input: BridgeInput): boolean {
  const s = effectiveSections(input);
  const wt = transverseWidth(s.topChord, 'chord'), wb = transverseWidth(s.bottomChord, 'chord');
  const webs: GroupKey[] = input.trussType === 'warren' ? ['diagonal'] : input.trussType === 'vierendeel' ? ['vertical'] : ['vertical', 'diagonal'];
  return webs.every((g) => {
    const w = transverseWidth(s[g], 'web');
    return w <= input.maxWebRatio * Math.min(wt, wb) + 1e-6 && w >= input.minWebRatio * Math.max(wt, wb) - 1e-6;
  });
}
import { GROUPS, type BridgeInput, type GroupKey, type GroupSection } from './types';

export interface OptimiseResult {
  sections: BridgeInput['sections'];
  iterations: number;
  log: string[];
  /** The check that set the size of each group in the last selection (strength, deflection, vibration…). */
  governs: Partial<Record<GroupKey, string>>;
}

/**
 * Section changes that clear the warnings which stop the analysis and depend on the sections (web members wider
 * than the chords, cross girders deeper than the bottom chord or wider than the verticals, stringers off the cross
 * girders): one group at a time, the section of the same type nearest in mass that leaves fewer warnings.
 */
function repairSections(input: BridgeInput, log: string[]): BridgeInput {
  let cur = input;
  let errs = buildModel(cur).errors;
  const order: GroupKey[] = ['crossGirder', 'vertical', 'diagonal', 'bottomChord', 'topChord', 'stringer'];
  for (let pass = 0; pass < 8 && errs.length; pass++) {
    let improved = false;
    for (const g of order) {
      if (!errs.length) break;
      const spec = cur.sections[g];
      const m0 = sectionProps(spec).mass;
      const cands = sectionsOf(spec.category)
        .filter((c) => c.name !== spec.name)
        .sort((a, b) => Math.abs(sectionProps({ ...spec, name: a.name }).mass - m0) - Math.abs(sectionProps({ ...spec, name: b.name }).mass - m0));
      for (const c of cands) {
        const trial = { ...cur, sections: { ...cur.sections, [g]: { ...spec, name: c.name } } };
        const e = buildModel(trial).errors;
        if (e.length < errs.length) {
          log.push(`Before optimising: ${groupLabel(g)} ${spec.name} → ${c.name}, to clear a warning.`);
          cur = trial;
          errs = e;
          improved = true;
          break;
        }
      }
    }
    if (!improved) break;
  }
  return cur;
}

export function optimiseSections(input: BridgeInput, target = 0.9, maxIter = 4, progress: (msg: string) => void = () => {}): OptimiseResult {
  const log: string[] = [];
  // warnings that stop the analysis: cleared by section changes where they depend on the sections
  let cur = input;
  if (buildModel(cur).errors.length) {
    progress('Clearing the warnings that depend on the sections');
    cur = repairSections(cur, log);
    const left = buildModel(cur).errors;
    if (left.length) {
      log.push(`Not optimised: these warnings do not depend on the sections and must be resolved first: ${left.join(' ')}`);
      return { sections: cur.sections, iterations: 0, log, governs: {} };
    }
  }
  const governs: Partial<Record<GroupKey, string>> = {};
  // sections used by each group in earlier iterations, and groups held after they started to alternate
  const history: Partial<Record<GroupKey, string[]>> = {};
  const held = new Set<GroupKey>();
  let it = 0;
  let last: ReturnType<typeof runAnalysis> | null = null; // analysis of the current sections
  // web members are kept no wider than the chords: the narrowest width (m) at which the verticals and diagonals
  // reach the target, from the last iteration, is the least width of the chords
  let webNeed = 0;
  const extra = 2; // verification iterations after maxIter, only when the design still fails a check (upsizing only)
  for (it = 1; it <= maxIter + extra; it++) {
    last = runAnalysis(cur, (m) => progress(`Iteration ${it}: ${m}`));
    const { model, results } = last;
    const verifying = it > maxIter;
    if (verifying && !failsChecks(results)) {
      log.push(`Iteration ${it}: all checks met.`);
      break;
    }
    // a buckling load factor below 1 is not a reason to stop: the members concerned fail their checks and are
    // upsized; an input error or a mechanism is
    if (!results.design.length) {
      log.push(`Iteration ${it}: analysis error (${results.errors[0]}); stopped.`);
      break;
    }
    progress(`Iteration ${it}: selecting sections`);
    // deflection: chord area needed for the deflection limit (deflection taken as inversely proportional to it)
    const defl = results.sls.filter((x) => x.limit !== null).reduce((r, x) => Math.max(r, x.maxVert / (x.limit as number)), 0);
    // stringer deflection relative to the cross girders, as a ratio to its limit (inversely proportional to I_x)
    // horizontal deflection under wind: the bottom chords and plan bracing form the horizontal truss, so taken as
    // inversely proportional to the bottom chord area
    const horizDefl = results.sls.reduce((r, x) => (x.horizontal ? Math.max(r, x.horizontal.value / x.horizontal.limit) : r), 0);
    const stringerDefl = results.sls.reduce((r, x) => (x.stringer ? Math.max(r, x.stringer.maxRel / x.stringer.limit) : r), 0);
    // vertical vibration: truss bending stiffness ∝ A_t A_b / (A_t + A_b) from the chords, f0 ∝ √(k / M) and,
    // as f0² y is independent of the stiffness, a ∝ 1 / M; the check is needed only below 5 Hz
    const vib = results.vibration;
    const massTotal = model.nodeMassG.reduce((t, m) => t + m, 0); // t, the mass of the vibration check
    const chordStiff = (st: BridgeInput['sections']) => {
      const at = sectionProps(st.topChord).A, ab = sectionProps(st.bottomChord).A;
      return (at * ab) / (at + ab);
    };
    const groupLength = (gk: GroupKey) => model.members.filter((m) => m.group === gk || (gk === 'topChord' && m.group === 'endPost')).reduce((t, m) => t + m.length, 0);
    const k0 = chordStiff(cur.sections);
    const next = { ...cur.sections };
    let changed = false;
    let webNeedNext = 0;
    for (const g of GROUPS) {
      // the end posts take the top chord section; held groups are revisited (upsizing only) when verifying
      if (g === 'endPost' || (held.has(g) && !verifying)) continue;
      const members = model.members.filter((m) => m.group === g || (g === 'topChord' && m.group === 'endPost'));
      if (!members.length) continue;
      const spec = cur.sections[g];
      const old = sectionProps(spec);
      const chord = g === 'topChord' || g === 'bottomChord';
      const costOf = (name: string) => cost(cur, { ...spec, name }, g);
      const cands = sectionsOf(spec.category)
        .map((c) => ({ name: c.name, cost: costOf(c.name) }))
        .sort((a, b) => a.cost - b.cost);
      // first section in order of cost (mass, or mass × size) at or below the target; failing that, the one with
      // the lowest utilisation
      let pick: string | null = null, bestU = Infinity, bestName = spec.name;
      const webGroup = g === 'vertical' || g === 'diagonal';
      const chordWidth = Math.min(transverseWidth(next.topChord, 'chord'), transverseWidth(next.bottomChord, 'chord'));
      const chordWidthMax = Math.max(transverseWidth(next.topChord, 'chord'), transverseWidth(next.bottomChord, 'chord'));
      let narrowestOk = Infinity, narrowestBest = { w: 0, u: Infinity };
      let pickWhy = '', bestWhy = '', widthSkipped = false;
      // a chord that would make the bottom chord larger than the top chord is taken only if no other meets the target
      let deferred: { name: string; why: string } | null = null;
      for (const c of cands) {
        const sp = sectionProps({ category: spec.category, name: c.name, grade: spec.grade });
        if (verifying && sp.mass < old.mass - 1e-9) continue;
        const width = transverseWidth({ ...spec, name: c.name }, chord ? 'chord' : 'web');
        // narrower chords bring the trusses closer: the stringers must still be on the cross girders
        if ((g === 'topChord' || g === 'bottomChord') && stringerFitError(cur, { ...next, [g]: { ...spec, name: c.name } })) continue;
        // the cross girders must stay within the bottom chord depth (or on verticals at least as wide, when raised)
        if ((g === 'bottomChord' || g === 'crossGirder' || g === 'vertical' || g === 'topChord') && cgLevelError(cur, { ...next, [g]: { ...spec, name: c.name } }) && !cgLevelError(cur, next)) continue;
        const scale = { major: sp.Ix / old.Ix, minor: sp.Iy / old.Iy };
        let u = 0, why = 'strength';
        const bump = (v: number, w: string) => {
          if (v > u) {
            u = v;
            why = w;
          }
        };
        for (const m of members) bump(designMember(model, { ...m, sp }, results.combos, results.forces, [], results.buckling, cur, scale).utilRaw, 'strength');
        // chords: deflection (inversely proportional to the chord area) to stay within 98% of the limit
        if (chord) {
          // deflection and vibration with this chord (the other chord as selected so far)
          const trial = { ...next, [g]: { ...spec, name: c.name } };
          const kr = chordStiff(trial) / k0;
          bump((defl / kr / SLS_MARGIN) * target, 'deflection');
          if (vib?.f0) {
            const mr = massTotal / (massTotal + ((sp.mass - old.mass) * groupLength(g) * (1 + cur.connectionAllowance / 100)) / 1000);
            const f = vib.f0 * Math.sqrt(kr * mr);
            if (f < 5) bump(((vib.a * mr) / (0.25 * f ** 0.78) / SLS_MARGIN) * target, 'vibration');
          }
        }
        if (g === 'bottomChord' && horizDefl > 0) bump(((horizDefl * old.A) / sp.A / SLS_MARGIN) * target, 'horizontal deflection');
        if (g === 'stringer' && stringerDefl > 0) bump(((stringerDefl * old.Ix) / sp.Ix / SLS_MARGIN) * target, 'stringer deflection');
        // chords no narrower than the web members need (a lighter chord that met the target otherwise is noted)
        if (chord && width * cur.maxWebRatio < webNeed - 1e-6) {
          if (u <= target) widthSkipped = true;
          continue;
        }
        if (webGroup) {
          // the width the chords need for this web group, whether or not the present chords provide it
          if (u <= target) narrowestOk = Math.min(narrowestOk, width);
          if (u < narrowestBest.u) narrowestBest = { w: width, u };
          if (width > cur.maxWebRatio * chordWidth + 1e-6 || width < cur.minWebRatio * chordWidthMax - 1e-6) continue;
        }
        if (u <= target) {
          if (chord && !chordOrderOk({ ...next, [g]: { ...spec, name: c.name } })) {
            deferred ??= { name: c.name, why };
            continue;
          }
          pick = c.name;
          pickWhy = why;
          break;
        }
        if (u < bestU) {
          bestU = u;
          bestName = c.name;
          bestWhy = why;
        }
      }
      if (webGroup) webNeedNext = Math.max(webNeedNext, narrowestOk < Infinity ? narrowestOk : narrowestBest.w);
      if (pick === null && deferred) {
        pick = deferred.name;
        pickWhy = deferred.why;
      }
      let choice = pick ?? bestName;
      governs[g] = widthSkipped ? 'width of the web members' : pick !== null ? pickWhy : bestWhy || 'strength';
      const hist = (history[g] ??= [spec.name]);
      // alternating between two sizes: take the heavier and hold it
      if (choice !== spec.name && hist.length >= 2 && hist[hist.length - 2] === choice) {
        const mass = (n: string) => sectionProps({ ...spec, name: n }).mass;
        choice = mass(choice) >= mass(spec.name) ? choice : spec.name;
        held.add(g);
        log.push(`Iteration ${it}: ${groupLabel(g)} alternating; held at ${choice}`);
      }
      if (choice !== spec.name) {
        changed = true;
        log.push(`Iteration ${it}: ${groupLabel(g)} ${spec.name} → ${choice} (${governs[g]}${pick === null ? `; no ${spec.category} reaches ${Math.round(target * 100)}%` : ''})`);
        next[g] = { ...spec, name: choice };
      }
      hist.push(choice);
    }
    // with webs that need wider chords, the chords are reviewed again
    if (webNeedNext > webNeed + 1e-6) changed = true;
    webNeed = webNeedNext;
    if (!changed) {
      // the estimates found nothing to change but the design still fails a check: verify and upsize
      if (!verifying && failsChecks(results)) {
        it = maxIter;
        continue;
      }
      log.push(`Iteration ${it}: no further changes.`);
      break;
    }
    cur = { ...cur, sections: next };
    last = null;
  }
  cur = trim(cur, last, target, governs, held, log, progress);
  return { sections: cur.sections, iterations: Math.min(it, maxIter + extra), log, governs };
}

/** Largest utilisation of each group. */
function groupMax(r: ReturnType<typeof runAnalysis>): Partial<Record<GroupKey, number>> {
  const out: Partial<Record<GroupKey, number>> = {};
  for (const d of r.results.design) {
    const g = r.model.members[d.member].group as GroupKey;
    out[g] = Math.max(out[g] ?? 0, d.util);
  }
  return out;
}

/**
 * Final refinement with full analyses, as a designer would by hand: the groups sized by a serviceability estimate
 * (deflection, vibration) or held after alternating take the next lighter sections of their type in turn (up to
 * TRIM_TRIES each) while every check is still met, no group exceeds the target (or its utilisation before the step,
 * if higher), and the web members stay within the chord widths.
 */
function trim(input: BridgeInput, analysed: ReturnType<typeof runAnalysis> | null, target: number, governs: Partial<Record<GroupKey, string>>, held: Set<GroupKey>, log: string[], progress: (msg: string) => void): BridgeInput {
  const order: GroupKey[] = ['topChord', 'bottomChord', 'crossGirder', 'stringer', 'vertical', 'diagonal', 'bracing'];
  // strength and the stringer deflection (∝ 1 / I_x) are checked exactly in the selection; the truss deflection,
  // vibration and horizontal deflection are estimates
  const estimated = ['deflection', 'vibration', 'horizontal deflection'];
  const groups = order.filter((g) => held.has(g) || estimated.includes(governs[g] ?? ''));
  if (!groups.length) return input;
  let cur = input;
  progress('Refining: checking the design');
  let base = analysed ?? runAnalysis(cur);
  if (failsChecks(base.results)) return cur;
  let baseMax = groupMax(base);
  for (const g of groups) {
    const spec = cur.sections[g];
    if (!base.model.members.some((m) => m.group === g)) continue;
    const costOf = (name: string) => cost(cur, { ...spec, name }, g);
    const lighter = sectionsOf(spec.category)
      .map((c) => ({ name: c.name, cost: costOf(c.name) }))
      .filter((c) => c.cost < costOf(spec.name) - 1e-9)
      .sort((a, b) => b.cost - a.cost);
    let tries = 0;
    for (const c of lighter) {
      if (tries >= TRIM_TRIES) break;
      const sections = { ...cur.sections, [g]: { ...spec, name: c.name } };
      const trial = { ...cur, sections };
      if (stringerFitError(trial) || (cgLevelError(trial) && !cgLevelError(cur)) || (!proportionsOk(trial) && proportionsOk(cur)) || (!chordOrderOk(sections) && chordOrderOk(cur.sections))) continue;
      tries++;
      progress(`Refining: ${groupLabel(g)} ${c.name}`);
      const r = runAnalysis(trial);
      if (failsChecks(r.results)) continue;
      const mx = groupMax(r);
      if ((Object.keys(mx) as GroupKey[]).some((k) => (mx[k] ?? 0) > Math.max(target, baseMax[k] ?? 0) + 1e-9)) continue;
      log.push(`Refinement: ${groupLabel(g)} ${cur.sections[g].name} → ${c.name} (checked by analysis)`);
      cur = trial;
      base = r;
      baseMax = mx;
      tries = 0;
    }
  }
  return cur;
}

/** Lighter sections tried in turn for each group in the final refinement. */
const TRIM_TRIES = 2;

/** Margin on the deflection and vibration estimates (they are scaled from the last analysis). */
const SLS_MARGIN = 0.95;

/** Whether a design fails a strength, deflection, stringer deflection or vibration check. */
function failsChecks(r: ReturnType<typeof runAnalysis>['results']): boolean {
  if (r.errors.length) return true;
  if (r.design.some((d) => d.util > 1)) return true;
  if (r.sls.some((x) => (x.limit !== null && x.maxVert > x.limit) || (x.stringer && x.stringer.maxRel > x.stringer.limit) || (x.horizontal && x.horizontal.value > x.horizontal.limit))) return true;
  return !!r.vibration && !r.vibration.ok;
}

const groupLabel = (g: GroupKey) => g.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
