/**
 * Loading saved inputs (browser storage or a file). Files carry a version; inputs saved by earlier versions are
 * brought up to date by explicit, versioned migrations, and every change made on loading is reported to the user
 * rather than applied silently. Inputs missing from the file (added in later versions) take their defaults, and are
 * listed too.
 */
import { DEFAULT_INPUT, SUPERSEDED_COMBOS, type BridgeInput, type Combination } from './types';

/** Version of the saved input format. 1: files without a version (before migrations were recorded). */
export const FILE_VERSION = 2;

export interface LoadedInput {
  input: BridgeInput;
  /** Changes made on loading, for the user to review. */
  notes: string[];
}

/** Names of inputs added after the first version, for the notes. */
const LABELS: Partial<Record<keyof BridgeInput, string>> = {
  barrierVertical: 'Barrier vertical load',
  precamberLimit: 'Precamber limit',
  optimiseTarget: 'Optimiser target utilisation',
  maxSlenderness: 'Maximum slenderness L/r',
  jointModel: 'Web and cross girder joints',
  jointAsType: 'AS 5100.6 connection type',
  latDeflLimit: 'Horizontal deflection limit',
  vibDecrement: 'Logarithmic decrement',
  uFrameJointFlex: 'Joint flexibility f',
  chordsSupportDeck: 'Bottom chords support deck',
  leewardShielding: 'Leeward shielding factor'
};

const show = (v: unknown) => (typeof v === 'object' ? '' : ` (${String(v)})`);

/** The saved data with its version, as written to storage or a file. */
export function toSaved(input: BridgeInput): BridgeInput & { fileVersion: number } {
  return { ...input, fileVersion: FILE_VERSION };
}

export function loadInput(raw: Partial<BridgeInput> & { fileVersion?: number }): LoadedInput {
  const notes: string[] = [];
  const version = raw.fileVersion ?? 1;
  const { fileVersion: _v, ...x } = raw; // eslint-disable-line @typescript-eslint/no-unused-vars

  // inputs added since the file was saved take their defaults
  for (const k of Object.keys(DEFAULT_INPUT) as (keyof BridgeInput)[])
    if (x[k] === undefined && LABELS[k]) notes.push(`${LABELS[k]} was not in the saved inputs and is set to the default${show(DEFAULT_INPUT[k])}.`);

  let combos: Combination[] = x.combos?.length ? x.combos : DEFAULT_INPUT.combos;
  let barrier = x.barrier ?? DEFAULT_INPUT.barrier;

  if (version < 2) {
    // version 1 → 2: default ULS factors of AS 5100.2 (pedestrian 1.5, barrier 1.8 with the SLS pedestrian load)
    // and the default barrier load of 0.75 kN/m, where the saved values were the old defaults
    const same = (a: Combination, b: Combination) => (Object.keys(a) as (keyof Combination)[]).every((k) => a[k] === b[k]);
    combos = combos.map((c) => {
      const upd = SUPERSEDED_COMBOS.find(([old]) => same(old, c));
      if (!upd) return c;
      notes.push(`Combination "${c.type} ${c.name}" (the default of an earlier version) was replaced by "${upd[1].type} ${upd[1].name}" with Q × ${upd[1].q} and B × ${upd[1].b}. Restore it in Load Combinations if the earlier factors were intended.`);
      return upd[1];
    });
    if (barrier === 1.5) {
      barrier = DEFAULT_INPUT.barrier;
      notes.push(`The barrier load of 1.5 kN/m (the default of an earlier version) was changed to ${DEFAULT_INPUT.barrier} kN/m. Re-enter 1.5 kN/m if it was intended.`);
    }
  }

  // spans are limited to 50 m (the range of the vibration dynamic response factor)
  let span = x.span ?? DEFAULT_INPUT.span;
  if (span > 50) {
    notes.push(`The span of ${span} m is beyond the 50 m limit of the app and was reduced to 50 m.`);
    span = 50;
  }

  return {
    input: {
      ...DEFAULT_INPUT,
      ...x,
      sections: { ...DEFAULT_INPUT.sections, ...(x.sections ?? {}) },
      design: { ...DEFAULT_INPUT.design, ...(x.design ?? {}) },
      combos,
      barrier,
      span
    },
    notes
  };
}
