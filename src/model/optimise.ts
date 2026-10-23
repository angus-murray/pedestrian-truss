/**
 * Section optimiser: with the geometry and loads fixed, refines the section of each member group (within its
 * section type and grade) towards a target utilisation, in a few analysis iterations.
 *
 * Each iteration analyses the bridge, then for each group re-checks every member with each candidate section
 * using that analysis's member actions (the elastic buckling load scaled by the change in the smaller second
 * moment of area), and takes the lightest section whose largest utilisation is at most the target. The chords are
 * also kept stiff enough for the deflection limit (deflection taken as inversely proportional to the chord area). Member actions and buckling loads change with the sections,
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
  for (it = 1; it <= maxIter; it++) {
    const { model, results } = runAnalysis(cur, (m) => progress(`Iteration ${it}: ${m}`));
    // a buckling load factor below 1 is not a reason to stop: the members concerned fail their checks and are
    // upsized; an input error or a mechanism is
    if (!results.design.length) {
      log.push(`Iteration ${it}: analysis error (${results.errors[0]}); stopped.`);
      break;
    }
    progress(`Iteration ${it}: selecting sections`);
    // deflection: chord area needed for the deflection limit (deflection taken as inversely proportional to it)
    const defl = results.sls.filter((x) => x.limit !== null).reduce((r, x) => Math.max(r, x.maxVert / (x.limit as number)), 0);
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
        // narrower chords bring the trusses closer: the stringers must still be on the cross girders
        if ((g === 'topChord' || g === 'bottomChord') && stringerFitError(cur, { ...next, [g]: { ...spec, name: c.name } })) continue;
        const scale = Math.min(sp.Ix, sp.Iy) / Math.min(old.Ix, old.Iy);
        let u = 0;
        for (const m of members) u = Math.max(u, designMember(model, { ...m, sp }, results.combos, results.forces, [], results.buckling, cur, scale).utilRaw);
        // chords: deflection (inversely proportional to the chord area) to stay within 98% of the limit
        if (chord) u = Math.max(u, ((defl * old.A) / sp.A / 0.98) * target);
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
      log.push(`Iteration ${it}: no further changes.`);
      break;
    }
    cur = { ...cur, sections: next };
  }
  return { sections: cur.sections, iterations: Math.min(it, maxIter), log };
}

const groupLabel = (g: GroupKey) => g.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
