/**
 * Section optimiser: with the geometry and loads fixed, refines the section of each member group (within its
 * section type and grade) towards a target utilisation, in a few analysis iterations.
 *
 * Each iteration analyses the bridge, then for each group re-checks every member with each candidate section
 * using that analysis's member actions (the elastic buckling load scaled by the change in the smaller second
 * moment of area), and takes the lightest section whose largest utilisation is at most the target. The chords are
 * also kept stiff enough for the deflection limit and the vertical vibration check (AS 5100.2 Cl. 13.4), and the
 * stringers for their deflection limit, from estimates scaled from the last analysis: truss stiffness from the chord
 * areas, f0 ∝ √(k / M), acceleration ∝ 1 / M, stringer deflection ∝ 1 / I_x. Member actions and buckling loads change with the sections,
 * so the analysis is repeated until the selection stops changing or the iteration limit is reached.
 */
import { sectionProps } from '../design/section';
import { sectionsOf } from '../data/sections';
import { designMember, runAnalysis } from './analysis';
import { stringerFitError } from './build';
import { GROUPS, type BridgeInput, type GroupKey } from './types';

export interface OptimiseResult {
  sections: BridgeInput['sections'];
  iterations: number;
  log: string[];
}

export function optimiseSections(input: BridgeInput, target = 0.9, maxIter = 4, progress: (msg: string) => void = () => {}): OptimiseResult {
  let cur = input;
  const log: string[] = [];
  // sections used by each group in earlier iterations, and groups held after they started to alternate
  const history: Partial<Record<GroupKey, string[]>> = {};
  const held = new Set<GroupKey>();
  let it = 0;
  const extra = 2; // verification iterations after maxIter, only when the design still fails a check (upsizing only)
  for (it = 1; it <= maxIter + extra; it++) {
    const { model, results } = runAnalysis(cur, (m) => progress(`Iteration ${it}: ${m}`));
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
    const stringerDefl = results.sls.reduce((r, x) => (x.stringer ? Math.max(r, x.stringer.maxRel / x.stringer.limit) : r), 0);
    // vertical vibration: truss bending stiffness ∝ A_t A_b / (A_t + A_b) from the chords, f0 ∝ √(k / M) and,
    // as f0² y is independent of the stiffness, a ∝ 1 / M; the check is needed only below 5 Hz
    const vib = results.vibration;
    const massTotal = model.nodeMass.reduce((t, m) => t + m, 0); // t
    const chordStiff = (st: BridgeInput['sections']) => {
      const at = sectionProps(st.topChord).A, ab = sectionProps(st.bottomChord).A;
      return (at * ab) / (at + ab);
    };
    const groupLength = (gk: GroupKey) => model.members.filter((m) => m.group === gk || (gk === 'topChord' && m.group === 'endPost')).reduce((t, m) => t + m.length, 0);
    const k0 = chordStiff(cur.sections);
    const next = { ...cur.sections };
    let changed = false;
    for (const g of GROUPS) {
      if (g === 'endPost' || held.has(g)) continue; // the end posts take the top chord section
      const members = model.members.filter((m) => m.group === g || (g === 'topChord' && m.group === 'endPost'));
      if (!members.length) continue;
      const spec = cur.sections[g];
      const old = sectionProps(spec);
      const chord = g === 'topChord' || g === 'bottomChord';
      const cands = sectionsOf(spec.category).slice().sort((a, b) => a.massPerMetre - b.massPerMetre);
      // lightest section at or below the target; failing that, the one with the lowest utilisation
      let pick: string | null = null, bestU = Infinity, bestName = spec.name;
      for (const c of cands) {
        const sp = sectionProps({ category: spec.category, name: c.name, grade: spec.grade });
        if (verifying && sp.mass < old.mass - 1e-9) continue;
        // narrower chords bring the trusses closer: the stringers must still be on the cross girders
        if ((g === 'topChord' || g === 'bottomChord') && stringerFitError(cur, { ...next, [g]: { ...spec, name: c.name } })) continue;
        const scale = Math.min(sp.Ix, sp.Iy) / Math.min(old.Ix, old.Iy);
        let u = 0;
        for (const m of members) u = Math.max(u, designMember(model, { ...m, sp }, results.combos, results.forces, [], results.buckling, cur, scale).utilRaw);
        // chords: deflection (inversely proportional to the chord area) to stay within 98% of the limit
        if (chord) {
          // deflection and vibration with this chord (the other chord as selected so far)
          const trial = { ...next, [g]: { ...spec, name: c.name } };
          const kr = chordStiff(trial) / k0;
          u = Math.max(u, (defl / kr / SLS_MARGIN) * target);
          if (vib?.f0) {
            const mr = massTotal / (massTotal + ((sp.mass - old.mass) * groupLength(g) * (1 + cur.connectionAllowance / 100)) / 1000);
            const f = vib.f0 * Math.sqrt(kr * mr);
            if (f < 5) u = Math.max(u, ((vib.a * mr) / (0.25 * f ** 0.78) / SLS_MARGIN) * target);
          }
        }
        if (g === 'stringer' && stringerDefl > 0) u = Math.max(u, ((stringerDefl * old.Ix) / sp.Ix / SLS_MARGIN) * target);
        if (u <= target) {
          pick = c.name;
          break;
        }
        if (u < bestU) {
          bestU = u;
          bestName = c.name;
        }
      }
      let choice = pick ?? bestName;
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
        log.push(`Iteration ${it}: ${groupLabel(g)} ${spec.name} → ${choice}${pick === null ? ` (no ${spec.category} reaches ${Math.round(target * 100)}%)` : ''}`);
        next[g] = { ...spec, name: choice };
      }
      hist.push(choice);
    }
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
  }
  return { sections: cur.sections, iterations: Math.min(it, maxIter + extra), log };
}

/** Margin on the deflection and vibration estimates (they are scaled from the last analysis). */
const SLS_MARGIN = 0.95;

/** Whether a design fails a strength, deflection, stringer deflection or vibration check. */
function failsChecks(r: ReturnType<typeof runAnalysis>['results']): boolean {
  if (r.errors.length) return true;
  if (r.design.some((d) => d.util > 1)) return true;
  if (r.sls.some((x) => (x.limit !== null && x.maxVert > x.limit) || (x.stringer && x.stringer.maxRel > x.stringer.limit))) return true;
  return !!r.vibration && !r.vibration.ok;
}

const groupLabel = (g: GroupKey) => g.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
