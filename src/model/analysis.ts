/**
 * Analysis of the bridge model: linear static load cases combined into the load combinations, U-frame restraint
 * forces, linearised elastic buckling for every ULS combination, natural frequencies, member design checks to
 * AS 5100.6 and the serviceability checks.
 */
import { FrameSolver, type Vec3 } from '../fea/frame';
import { lanczos } from '../fea/eigen';
import { buildModel, CASES, effectiveSections, type BridgeModel, type CaseKey, type Member } from './build';
import { jointFlex, type BridgeInput, type GroupKey } from './types';
import { alphaM, compressionFromNom, majorBending, tensionCapacity, E_STEEL, type CompressionCapacity } from '../design/capacity';
import { PHI } from '../design/section';

export interface ComboDef {
  name: string;
  type: 'ULS' | 'SLS';
  factors: Record<CaseKey, number>;
  deflection: boolean;
  /** Wind pressure (kPa) used for the W factor. */
  windQ: number;
  /** For a U-frame restraint pattern added to a ULS combination: that combination (its buckling analysis). */
  base?: number;
}

export const windPressure = (V: number) => (0.6 * V * V) / 1000; // kPa, ρ = 1.2 kg/m³

export function expandCombos(input: BridgeInput): ComboDef[] {
  return input.combos.map((c) => {
    const windQ = windPressure(c.type === 'ULS' ? input.windUls : input.windSls);
    return { name: `${c.type} ${c.name}`, type: c.type, factors: { G1s: c.g1s, G1d: c.g1d, G2: c.g2, Q: c.q, W: c.w * windQ, B: c.b }, deflection: c.deflection, windQ };
  });
}

export const comboLabel = (c: ComboDef) => c.name;
/** Label of a combination for its buckling analysis (made without the U-frame restraint forces). */
export const bucklingLabel = (c: ComboDef) => c.name.replace(/ \+ U-Frame Inward$/, '');

/** Internal actions at the stations of a member: N, Vy, Vz, T, My (major), Mz (minor) per station. */
export type StationForces = Float32Array; // stations × 6

export interface BucklingResult {
  combo: number;
  values: number[];
  /** Mode shapes, 6 per node, max component 1. */
  modes: Float32Array[];
  /** Destabilising energy of each member in each mode, relative to the member with the most. */
  participation: Float32Array[];
  /**
   * The same, split by buckling plane (bending about the member's major axis and about its minor axis), and zero
   * where the member restrains the mode in that plane rather than buckles in it: its own bending strain energy
   * exceeds λ times its destabilising energy (it would be stable on its own at that load factor).
   */
  participationMajor: Float32Array[];
  participationMinor: Float32Array[];
  converged: boolean;
}

export interface ModalResult {
  freqs: number[];
  modes: Float32Array[];
  kinds: ('Vertical' | 'Torsional' | 'Lateral' | 'Longitudinal' | 'Stringers (Local)')[];
  massRatio: number[]; // share of the mass moving in the dominant direction
}

export interface CheckItem {
  key: string;
  label: string;
  clause: string;
  action: number;
  capacity: number;
  unit: 'kN' | 'kNm' | 'L/r' | '';
  util: number;
}

export interface MemberDesign {
  member: number;
  util: number;
  /** Largest utilisation without the 999% display cap (to rank sections in the optimiser). */
  utilRaw: number;
  combo: number;
  governing: string;
  N: number; // kN, tension positive
  Mx: number; // design major moment (kNm, amplified)
  My: number;
  Vy: number;
  Vx: number;
  comp: CompressionCapacity | null;
  compMajor: CompressionCapacity | null;
  compMinor: CompressionCapacity | null;
  leMethod: string;
  leMajor: number; // m
  leMinor: number;
  mode: number | null; // buckling mode used (governing axis)
  lambdaCr: number | null;
  /** Buckling analysis method, each axis: the mode used, or null when no computed mode qualifies (fallback). */
  modeMajor: number | null;
  modeMinor: number | null;
  /**
   * Buckling analysis method, each axis with no qualifying mode among those computed: N_om from the last mode
   * computed (a lower bound) or from the member's Euler load (k = 1, ends braced).
   */
  fallbackMajor: 'bound' | 'euler' | null;
  fallbackMinor: 'bound' | 'euler' | null;
  delta: number;
  phiNt: number;
  phiMsx: number;
  phiMsy: number;
  phiMbx: number;
  alphaM: number;
  items: CheckItem[];
  /** Utilisation for each ULS combination. */
  byCombo: number[];
}

export interface SlsResult {
  combo: number;
  maxVert: number; // m (downward positive)
  maxLat: number; // m
  node: number;
  limit: number | null; // m
  /** Stringers: largest deflection relative to the cross girders (the chord between the span ends), limit a / x. */
  stringer: { maxRel: number; member: number; limit: number } | null;
  /**
   * Horizontal deflection under wind (SLS combinations with wind): at midspan, the average of the top and bottom
   * chord lateral displacements of each truss (the larger truss governs), against span / limit.
   */
  horizontal: { top: number; bottom: number; value: number; side: 'A' | 'B'; limit: number } | null;
}

/** Vertical vibration check, AS 5100.2 Cl. 13.4. */
export interface PrecamberResult {
  ordinates: { x: number; dz: number }[]; // m along the span, m upwards
  max: number; // m
  limit: number; // span / precamberLimit (m)
  ok: boolean;
}

export interface VibrationResult {
  f0: number | null; // first vertical frequency (Hz)
  y: number; // static deflection under 700 N at midspan (m)
  delta: number;
  psi: number;
  a: number; // m/s²
  limit: number; // 0.25 f0^0.78 (m/s²)
  required: boolean; // f0 < 5 Hz
  ok: boolean;
  fLat: number | null;
  latOk: boolean; // f_h ≥ limit
}

/**
 * Dynamic response factor Ψ (AS 5100.2 Figure 13.4.2), as quadratic fits to the curves for δ = 0.03, 0.04 and
 * 0.05 (linear between them), for spans up to 50 m (the largest span the app accepts); below 10 m the fits are
 * extrapolated.
 */
export function dynamicResponseFactor(span: number, delta: number): number {
  const L = Math.min(50, Math.max(0, span));
  const fit: [number, number, number, number][] = [
    [0.03, 0.991, 0.432, -0.00294],
    [0.04, 1.445, 0.367, -0.00265],
    [0.05, 1.496, 0.338, -0.00275]
  ];
  const val = ([, a, b, c]: (typeof fit)[number]) => a + b * L + c * L * L;
  const d = Math.min(0.05, Math.max(0.03, delta));
  const i = d <= 0.04 ? 0 : 1;
  const t = (d - fit[i][0]) / (fit[i + 1][0] - fit[i][0]);
  return val(fit[i]) * (1 - t) + val(fit[i + 1]) * t;
}

export interface AnalysisResults {
  combos: ComboDef[];
  disp: Float32Array[]; // per combo, 6 per node
  forces: StationForces[][]; // [combo][member]
  caseDisp: Record<CaseKey, Float32Array>;
  buckling: BucklingResult[];
  modal: ModalResult;
  design: MemberDesign[];
  sls: SlsResult[];
  vibration: VibrationResult | null;
  /**
   * Precamber: the deflection of the trusses under the permanent loads (G1 + G2, unfactored), to be built in as a
   * hog so that no sag remains under them, at the bottom chord panel points (average of the two trusses).
   */
  precamber: PrecamberResult | null;
  errors: string[];
  warnings: string[];
  dofs: number;
  timeMs: number;
}

const PARTICIPATION_FLOOR = 1e-12;
/** Members of the trusses, for the slenderness limit. */
const TRUSS_GROUPS: GroupKey[] = ['topChord', 'bottomChord', 'endPost', 'vertical', 'diagonal'];
/** Margin on U ≤ λ G for a member to count as buckling (not restraining) in a mode. */
const RESTRAINED = 1.05;

export function runAnalysis(input: BridgeInput, progress: (msg: string) => void = () => {}): { model: BridgeModel; results: AnalysisResults } {
  const t0 = performance.now();
  const model = buildModel(input);
  const errors: string[] = [];
  const warnings: string[] = [...model.warnings];
  const solver = new FrameSolver(model.fe);
  progress(`Factorising stiffness (${solver.nEq} DOF)`);
  const bad = model.errors[0] ?? solver.factor();
  const combos = expandCombos(input);
  const nNodes = model.fe.nodes.length;
  const empty: AnalysisResults = {
    combos, disp: [], forces: [], caseDisp: {} as Record<CaseKey, Float32Array>, buckling: [],
    modal: { freqs: [], modes: [], kinds: [], massRatio: [] }, design: [], sls: [], vibration: null, precamber: null, errors, warnings, dofs: solver.nEq, timeMs: 0
  };
  if (bad) {
    errors.push(bad);
    return { model, results: empty };
  }

  // ---------------------------------------------------------- load cases
  progress('Solving load cases');
  const caseU: Record<CaseKey, Float64Array> = {} as Record<CaseKey, Float64Array>;
  for (const c of CASES) caseU[c] = solver.expand(solver.K.solve(solver.loadVector(model.cases[c])));
  const nEl = model.fe.elements.length;
  const elForces = (disp: Float64Array, loadsOf: (el: number) => Vec3 | null) => {
    const out = new Float64Array(nEl * 12);
    for (let e = 0; e < nEl; e++) out.set(solver.endForces(e, disp, loadsOf(e)), e * 12);
    return out;
  };
  const caseF: Record<CaseKey, Float64Array> = {} as Record<CaseKey, Float64Array>;
  for (const c of CASES) {
    const q = model.elLoads[c];
    caseF[c] = elForces(caseU[c], (e) => (q[e * 3] || q[e * 3 + 1] || q[e * 3 + 2] ? [q[e * 3], q[e * 3 + 1], q[e * 3 + 2]] : null));
  }

  const combine = (f: Record<CaseKey, number>, src: Record<CaseKey, Float64Array>, len: number) => {
    const out = new Float64Array(len);
    for (const c of CASES) {
      const k = f[c];
      if (!k) continue;
      const s = src[c];
      for (let i = 0; i < len; i++) out[i] += k * s[i];
    }
    return out;
  };

  /** Station forces of every member from element end forces. */
  const stationForces = (ef: Float64Array): StationForces[] =>
    model.members.map((m) => {
      const ns = m.stations.length;
      const out = new Float32Array(ns * 6);
      for (let s = 0; s < ns; s++) {
        const useJ = s === ns - 1;
        const el = m.elements[useJ ? s - 1 : s];
        for (let d = 0; d < 6; d++) out[s * 6 + d] = useJ ? ef[el * 12 + 6 + d] : -ef[el * 12 + d];
      }
      return out;
    });

  // ---------------------------------------------------------- combinations (with U-frame restraint forces)
  progress('Combining load cases');
  const disp: Float32Array[] = [];
  const forces: StationForces[][] = [];
  const axial: Float64Array[] = []; // element axial forces per combo (for buckling), tension positive
  const tcMembers = model.members.filter((m) => m.group === 'topChord');
  const combU: Float64Array[] = [], combEf: Float64Array[] = [];
  combos.forEach((c) => {
    const u = combine(c.factors, caseU, nNodes * 6);
    const ef = combine(c.factors, caseF, nEl * 12);
    const N = new Float64Array(nEl);
    for (let e = 0; e < nEl; e++) N[e] = -ef[e * 12];
    axial.push(N);
    combU.push(u);
    combEf.push(ef);
    disp.push(Float32Array.from(u));
    forces.push(stationForces(ef));
  });

  // ---------------------------------------------------------- elastic buckling (each ULS combination)
  const buckling: BucklingResult[] = [];
  const nModes = Math.max(1, Math.min(20, Math.round(input.bucklingModes)));
  let start: Float64Array | undefined;
  const Kmul = (x: Float64Array, y: Float64Array) => void solver.K0.multiply(x, y);
  // participation of a member in a mode: the work done by its compression through the mode shape (its share of
  // the destabilising energy), which identifies the members whose buckling the mode represents
  const memberEnergy = (vec: Float64Array, N: Float64Array, lambda: number) => {
    const full = solver.expand(vec);
    const en = new Float64Array(model.members.length);
    const enMajor = new Float64Array(model.members.length), enMinor = new Float64Array(model.members.length);
    model.members.forEach((m, i) => {
      let gMi = 0, gMa = 0, uMi = 0, uMa = 0;
      for (const el of m.elements) {
        en[i] += Math.max(0, solver.elementGeometricEnergy(full, el, N[el]));
        const [mi, ma] = solver.elementGeometricEnergyAxes(full, el, N[el]);
        const [si, sa] = solver.elementStrainEnergyAxes(full, el);
        gMi += mi;
        gMa += ma;
        uMi += si;
        uMa += sa;
      }
      // a member buckles in a plane when it needs restraint there: U < λ G (with a margin for the restraint it gets
      // from its neighbours being small); one that is stiffer than that restrains the mode
      enMinor[i] = gMi > 0 && uMi <= RESTRAINED * lambda * gMi ? gMi : 0;
      enMajor[i] = gMa > 0 && uMa <= RESTRAINED * lambda * gMa ? gMa : 0;
    });
    return { full, en, enMajor, enMinor };
  };
  combos.forEach((c, ci) => {
    if (c.type !== 'ULS') return;
    progress(`Buckling analysis: ${comboLabel(c)}`);
    // rigid links (offsets to the cross girders and stringer seats) are modelling devices: no geometric stiffness
    // and tension-only rods carry no compression: a rod in compression is slack
    const Nb = axial[ci].map((v, e) => (model.elMember[e] < 0 || (v < 0 && model.members[model.elMember[e]].sp.kind === 'ROD') ? 0 : v));
    const B = solver.negGeometric(Nb);
    const r = lanczos(solver.K, Kmul, (x, y) => void B.multiply(x, y), nModes, { start });
    start = r.vectors[0];
    const modes: Float32Array[] = [];
    const participation: Float32Array[] = [], participationMajor: Float32Array[] = [], participationMinor: Float32Array[] = [];
    r.vectors.forEach((v, k) => {
      const { full, en, enMajor, enMinor } = memberEnergy(v, Nb, r.values[k]);
      let mx = 0;
      for (let i = 0; i < full.length; i += 1) if (i % 6 < 3) mx = Math.max(mx, Math.abs(full[i]));
      modes.push(Float32Array.from(full, (x) => x / (mx || 1)));
      const emax = Math.max(...en, PARTICIPATION_FLOOR);
      participation.push(Float32Array.from(en, (x) => x / emax));
      participationMajor.push(Float32Array.from(enMajor, (x) => x / emax));
      participationMinor.push(Float32Array.from(enMinor, (x) => x / emax));
    });
    if (!r.converged) warnings.push(`The buckling analysis for ${comboLabel(c)} did not fully converge.`);
    buckling.push({ combo: ci, values: r.values, modes, participation, participationMajor, participationMinor, converged: r.converged });
  });

  // ---------------------------------------------------------- U-frame restraint forces (ULS)
  // A lateral force at each top chord node, a share of the larger adjacent chord compression (AS 5100.6 Cl. 6.6.1),
  // amplified for the U-frame flexibility by 1 / (1 − 1/λ), λ the lowest buckling factor of the combination in which
  // the top chords take part. The force is a design force for each restraint: the patterns act at every U-frame
  // but alternate along the span where they would otherwise add up to a fictitious global side load. Three patterns,
  // each a design case: both trusses inwards at every U-frame (cross girders in single curvature); both trusses in
  // the same direction (sway, cross girders in double curvature), alternating from one U-frame to the next; and
  // inwards and outwards alternating along the span (multi-wave).
  const nBase = combos.length;
  if (input.restraintPct > 0) {
    const nodeX = (nd: number) => model.fe.nodes[nd].x;
    const xs = [...new Set(model.topNodes.map((t) => Math.round(nodeX(t.node) * 1000)))].sort((p, q) => p - q);
    const patterns: { label: string; sign: (side: 'A' | 'B', node: number) => number }[] = [
      { label: 'U-Frame Inward', sign: (side) => (side === 'A' ? 1 : -1) },
      { label: 'U-Frame Sway', sign: (_side, node) => (xs.indexOf(Math.round(nodeX(node) * 1000)) % 2 ? -1 : 1) },
      { label: 'U-Frame Alternating', sign: (side, node) => (side === 'A' ? 1 : -1) * (xs.indexOf(Math.round(nodeX(node) * 1000)) % 2 ? -1 : 1) }
    ];
    for (let ci = 0; ci < nBase; ci++) {
      const c = combos[ci];
      if (c.type !== 'ULS') continue;
      const b = buckling.find((x) => x.combo === ci);
      const thr = input.participation / 100;
      let lam = b?.values[0] ?? Infinity;
      if (b) {
        const k = b.values.findIndex((_, i) => tcMembers.some((m) => b.participation[i][m.id] >= thr));
        if (k >= 0) lam = b.values[k];
      }
      const amp = lam > 1.05 ? 1 / (1 - 1 / lam) : 20;
      const N = axial[ci];
      const Fat = (node: number, side: 'A' | 'B') => {
        let Nc = 0;
        for (const m of tcMembers) {
          if (m.side !== side) continue;
          if (m.nodes[0] !== node && m.nodes[m.nodes.length - 1] !== node) continue;
          for (const el of m.elements) Nc = Math.max(Nc, -N[el]);
        }
        return (input.restraintPct / 100) * Nc * amp;
      };
      patterns.forEach((pat, pi) => {
        const nodal = model.topNodes.map(({ node, side }) => ({ node, f: [0, pat.sign(side, node) * Fat(node, side), 0, 0, 0, 0] as [number, number, number, number, number, number] }));
        const ur = solver.expand(solver.K.solve(solver.loadVector({ nodal, elements: [] })));
        const fr = elForces(ur, () => null);
        const u = Float64Array.from(combU[ci], (v, i) => v + ur[i]);
        const ef = Float64Array.from(combEf[ci], (v, i) => v + fr[i]);
        const name = `${c.name} + ${pat.label}`;
        if (pi === 0) {
          // the first pattern replaces the combination without restraint forces
          combos[ci] = { ...c, name };
          disp[ci] = Float32Array.from(u);
          forces[ci] = stationForces(ef);
        } else {
          combos.push({ ...c, name, base: ci });
          axial.push(N);
          disp.push(Float32Array.from(u));
          forces.push(stationForces(ef));
        }
      });
    }
  }

  // ---------------------------------------------------------- natural frequencies
  progress('Natural frequencies');
  // nodes that belong only to stringers: modes with most of their kinetic energy there are local stringer modes
  const stringerNode = new Uint8Array(model.fe.nodes.length);
  for (const m of model.members) if (m.group === 'stringer') for (const nd of m.nodes) stringerNode[nd] = 1;
  for (const m of model.members) if (m.group !== 'stringer') for (const nd of m.nodes) stringerNode[nd] = 0;
  const sideOf = model.fe.nodes.map((nd) => (nd.y < -1e-6 ? -1 : nd.y > 1e-6 ? 1 : 0));
  const modalAnalysis = (nodeMass: Float64Array): ModalResult => {
    const M = solver.massMatrix(nodeMass);
    const mr = lanczos(solver.K, Kmul, (x, y) => void M.multiply(x, y), model.geo.stringerYs.length ? 12 : 6);
    const modal: ModalResult = { freqs: [], modes: [], kinds: [], massRatio: [] };
    mr.values.forEach((lam, k) => {
      const full = solver.expand(mr.vectors[k]);
      let ex = 0, ey = 0, ez = 0, mx = 0, corr = 0, za = 0, zb = 0, est = 0;
      nodeMass.forEach((m, nd) => {
        const ux = full[nd * 6], uy = full[nd * 6 + 1], uz = full[nd * 6 + 2];
        ex += m * ux * ux;
        ey += m * uy * uy;
        ez += m * uz * uz;
        if (stringerNode[nd]) est += m * (ux * ux + uy * uy + uz * uz);
        if (sideOf[nd] < 0) za += m * uz;
        if (sideOf[nd] > 0) zb += m * uz;
        mx = Math.max(mx, Math.abs(ux), Math.abs(uy), Math.abs(uz));
      });
      corr = za * zb;
      const tot = ex + ey + ez || 1;
      const kind =
        est > 0.5 * tot ? 'Stringers (Local)' : ez >= ey && ez >= ex ? (corr < 0 ? 'Torsional' : 'Vertical') : ey >= ex ? 'Lateral' : 'Longitudinal';
      modal.freqs.push(Math.sqrt(lam) / (2 * Math.PI));
      modal.modes.push(Float32Array.from(full, (x) => x / (mx || 1)));
      modal.kinds.push(kind);
      modal.massRatio.push(Math.max(ex, ey, ez) / tot);
    });
    return modal;
  };
  const modal = modalAnalysis(model.nodeMass);
  // the single-pedestrian check (Cl. 13.4) is for the bridge itself: with pedestrian mass in the natural frequencies,
  // f0 comes from a second analysis with the permanent mass alone (a = 4π² f0² y Ψ is inversely proportional to it)
  const modalG = input.modalQ > 0 ? modalAnalysis(model.nodeMassG) : modal;

  // ---------------------------------------------------------- vertical vibration (AS 5100.2 Cl. 13.4)
  // static deflection under one 700 N pedestrian at midspan, shared by the two bottom chords
  const mid = model.fe.nodes
    .map((nd, i) => ({ nd, i }))
    .filter(({ nd }) => Math.abs(nd.z) < 1e-6 && Math.abs(Math.abs(nd.y) - model.geo.s / 2) < 1e-6)
    .sort((p, q) => Math.abs(p.nd.x - input.span / 2) - Math.abs(q.nd.x - input.span / 2))
    .slice(0, 2)
    .map(({ i }) => i);
  const uP = solver.expand(solver.K.solve(solver.loadVector({ nodal: mid.map((node) => ({ node, f: [0, 0, -0.35, 0, 0, 0] as [number, number, number, number, number, number] })), elements: [] })));
  const yP = Math.max(...mid.map((nd) => -uP[nd * 6 + 2]));
  const f0 = modalG.freqs.find((_, i) => modalG.kinds[i] === 'Vertical') ?? null;
  const fLat = modal.freqs.find((_, i) => modal.kinds[i] === 'Lateral') ?? null;
  const psi = dynamicResponseFactor(input.span, input.vibDecrement);
  const accel = f0 !== null ? 4 * Math.PI ** 2 * f0 * f0 * yP * psi : 0;
  const aLim = f0 !== null ? 0.25 * f0 ** 0.78 : 0;
  const vibration: VibrationResult = {
    f0, y: yP, delta: input.vibDecrement, psi, a: accel, limit: aLim,
    required: f0 !== null && f0 < 5,
    ok: f0 === null || f0 >= 5 || accel <= aLim + 1e-12,
    fLat,
    latOk: fLat === null || fLat >= input.freqLatMin
  };
  if (f0 === null) warnings.push('No vertical mode was found among the computed natural frequencies; the vertical vibration check could not be made.');
  if (input.span < 10) warnings.push(`The dynamic response factor Ψ (AS 5100.2 Figure 13.4.2) is extrapolated below the 10 m span of the figure (Ψ = ${psi.toFixed(2)} at ${input.span} m).`);

  // ---------------------------------------------------------- member design
  progress('Member design checks');
  const design = model.members.map((m) => designMember(model, m, combos, forces, axial, buckling, input));

  // ---------------------------------------------------------- serviceability
  const sls: SlsResult[] = [];
  // the bridge deflection is that of the truss members (chords, verticals, diagonals, end posts) only; the
  // cross girders and stringers are not included (the stringers are checked on their own below)
  const trussNode = new Uint8Array(nNodes);
  for (const m of model.members) if (m.group === 'topChord' || m.group === 'bottomChord' || m.group === 'vertical' || m.group === 'diagonal' || m.group === 'endPost') for (const nd of m.nodes) trussNode[nd] = 1;
  const stringers = model.members.filter((m) => m.group === 'stringer');
  combos.forEach((c, ci) => {
    if (c.type !== 'SLS') return;
    let maxVert = 0, maxLat = 0, nodeAt = 0;
    const u = disp[ci];
    let stringer: SlsResult['stringer'] = null;
    if (c.deflection && stringers.length) {
      stringer = { maxRel: 0, member: stringers[0].id, limit: model.geo.a / input.deflLimit };
      for (const m of stringers) {
        const za = u[m.nodes[0] * 6 + 2], zb = u[m.nodes[m.nodes.length - 1] * 6 + 2];
        m.nodes.forEach((nd, i) => {
          const f = m.stations[i];
          const rel = za + f * (zb - za) - u[nd * 6 + 2];
          if (rel > stringer!.maxRel) stringer = { ...stringer!, maxRel: rel, member: m.id };
        });
      }
    }
    for (let nd = 0; nd < nNodes; nd++) {
      if (!trussNode[nd]) continue;
      if (-u[nd * 6 + 2] > maxVert) {
        maxVert = -u[nd * 6 + 2];
        nodeAt = nd;
      }
      maxLat = Math.max(maxLat, Math.abs(u[nd * 6 + 1]));
    }
    let horizontal: SlsResult['horizontal'] = null;
    if (c.factors.W !== 0)
      for (const side of ['A', 'B'] as const) {
        const top = Math.abs(lateralAt(model, u, 'topChord', side, input.span / 2));
        const bottom = Math.abs(lateralAt(model, u, 'bottomChord', side, input.span / 2));
        const value = (top + bottom) / 2;
        if (!horizontal || value > horizontal.value) horizontal = { top, bottom, value, side, limit: input.span / input.latDeflLimit };
      }
    sls.push({ combo: ci, maxVert, maxLat, node: nodeAt, limit: c.deflection ? input.span / input.deflLimit : null, stringer, horizontal });
  });

  // ---------------------------------------------------------- precamber (permanent loads)
  const perm = (nd: number) => -(caseU.G1s[nd * 6 + 2] + caseU.G1d[nd * 6 + 2] + caseU.G2[nd * 6 + 2]);
  const ordinates = model.bottomNodes[0].map((nA, k) => ({ x: model.fe.nodes[nA].x, dz: (perm(nA) + perm(model.bottomNodes[1][k])) / 2 }));
  const pcMax = Math.max(0, ...ordinates.map((o) => o.dz));
  const precamber: PrecamberResult = { ordinates, max: pcMax, limit: input.span / input.precamberLimit, ok: pcMax <= input.span / input.precamberLimit + 1e-12 };

  for (const b of buckling) {
    if (!b.values.length) errors.push(`No positive buckling load factor was found for ${comboLabel(combos[b.combo])}.`);
    else if (b.values[0] < 1) errors.push(`${comboLabel(combos[b.combo])}: the elastic buckling load factor is ${b.values[0].toFixed(2)} (< 1); the structure is unstable under the design loads.`);
  }

  const caseDisp = Object.fromEntries(CASES.map((c) => [c, Float32Array.from(caseU[c])])) as Record<CaseKey, Float32Array>;
  return {
    model,
    results: { combos, disp, forces, caseDisp, buckling, modal, design, sls, vibration, precamber, errors, warnings, dofs: solver.nEq, timeMs: performance.now() - t0 }
  };
}

/** Lateral (Y) displacement of a chord of one truss at position x along the span, linear between its nodes. */
function lateralAt(model: BridgeModel, u: Float32Array, group: 'topChord' | 'bottomChord', side: 'A' | 'B', x: number): number {
  const nodes = model.fe.nodes;
  const pts: { x: number; uy: number }[] = [];
  for (const m of model.members) if (m.group === group && m.side === side) for (const nd of m.nodes) pts.push({ x: nodes[nd].x, uy: u[nd * 6 + 1] });
  pts.sort((p, q) => p.x - q.x);
  for (let i = 0; i < pts.length - 1; i++)
    if (x >= pts[i].x - 1e-9 && x <= pts[i + 1].x + 1e-9) {
      const t = (x - pts[i].x) / (pts[i + 1].x - pts[i].x || 1);
      return pts[i].uy * (1 - t) + pts[i + 1].uy * t;
    }
  return 0;
}

/** Value of station data (component d) at fraction f along the member, linear between stations. */
function interp(m: Member, sf: StationForces, d: number, f: number) {
  const st = m.stations;
  for (let i = 0; i < st.length - 1; i++)
    if (f <= st[i + 1] + 1e-9) {
      const t = (f - st[i]) / (st[i + 1] - st[i] || 1);
      return sf[i * 6 + d] * (1 - t) + sf[(i + 1) * 6 + d] * t;
    }
  return sf[(st.length - 1) * 6 + d];
}

/**
 * U-frame flexibility δ (m/kN) and effective length of the top chord between U-frames (Engesser, BS 5400-3
 * Cl. 9.6.4.1.3): δ = d1³/(3EI1) + s d2²/(2EI2) + f d2² for a vertical on a cross girder (cross girder in single
 * curvature, which is conservative), with f the flexibility of the vertical to cross girder joint. In a Warren truss
 * the U-frame at a top chord node is the two diagonals meeting there, each a cantilever of its inclined length L_d,
 * on two cross girders: δ = L_d³/(6EI1) + s d2²/(4EI2) + f d2²/2. Lengths are node to node, as for all members:
 * d1 = d2 = H (bottom chord node to top chord node) and L_d = √(H² + (a/2)²).
 */
export function uFrameLength(model: BridgeModel): { le: number; delta: number; d1: number; d2: number; I1: number; I2: number; Ic: number; Ld: number | null } {
  const { geo, input } = model;
  const warren = !geo.verticals;
  const web = model.members.find((m) => m.group === (warren ? 'diagonal' : 'vertical')) ?? model.members.find((m) => m.group === 'endPost')!;
  const secs = effectiveSections(input);
  const cg = model.members.find((m) => m.group === 'crossGirder')!;
  const tc = model.members.find((m) => m.group === 'topChord')!;
  const E = E_STEEL * 1000; // kPa
  const I1 = (secs[web.group].rotate ? web.sp.Iy : web.sp.Ix) * 1e-12;
  const I2 = (input.sections.crossGirder.rotate ? cg.sp.Iy : cg.sp.Ix) * 1e-12;
  const Ic = (input.sections.topChord.rotate ? tc.sp.Ix : tc.sp.Iy) * 1e-12;
  // node to node: from the cross girder connection (the bottom chord node, or the vertical where the cross girders
  // are raised onto the verticals) to the top chord node
  const d1 = geo.H - (geo.cgOnVerticals ? geo.zCG : 0), d2 = d1;
  const f = jointFlex(input) / 1000; // rad/kNm
  let delta: number, Ld: number | null = null;
  if (warren) {
    Ld = Math.hypot(geo.H, geo.a / 2);
    delta = Ld ** 3 / (6 * E * I1) + (geo.s * d2 * d2) / (4 * E * I2) + (f * d2 * d2) / 2;
  } else delta = d1 ** 3 / (3 * E * I1) + (geo.s * d2 * d2) / (2 * E * I2) + f * d2 * d2;
  const le = Math.max(geo.a, 2.5 * (E * Ic * geo.a * delta) ** 0.25);
  return { le, delta, d1, d2, I1, I2, Ic, Ld };
}

/**
 * Design checks of a member for every ULS combination. nomScale is the ratio of the second moments of area about the
 * major and minor axes of a trial section to those analysed (the section optimiser estimates the effect of a change
 * of section with it): the elastic buckling load from a mode in which the member buckles between its nodes
 * (l_e ≤ 1.1 L) scales with I, and from one in which it buckles over several panels on elastic restraints (a top
 * chord on its U-frames, l_e ∝ I^0.25) with √I.
 */
export function designMember(
  model: BridgeModel,
  m: Member,
  combos: ComboDef[],
  forces: StationForces[][],
  axial: Float64Array[],
  buckling: BucklingResult[],
  input: BridgeInput,
  nomScale: { major: number; minor: number } = { major: 1, minor: 1 }
): MemberDesign {
  const sp = m.sp;
  const set = input.design[m.group as GroupKey];
  const phiNt = tensionCapacity(sp);
  const phiMsx = (PHI * sp.fy * sp.Zex) / 1e6, phiMsy = (PHI * sp.fy * sp.Zey) / 1e6;
  const phiNs = (PHI * sp.kf * sp.A * sp.fy) / 1000;
  const rx = sp.rx, ry = sp.ry;
  const uf = set.method === 'uframe' && m.group === 'topChord' ? uFrameLength(model) : null;
  let best: MemberDesign | null = null;
  const byCombo: number[] = [];
  let utilRaw = 0;
  // rods: tension-only X-bracing. A rod in compression goes slack, and the other rod of its X takes that force in
  // addition to its own: N* = N − min(0, N_other), and no compression in a rod
  const rod = sp.kind === 'ROD';
  const other = rod ? model.members.find((x) => x.group === m.group && x.panel === m.panel && x.id !== m.id) : undefined;
  combos.forEach((c, ci) => {
    if (c.type !== 'ULS') return;
    const sf = forces[ci][m.id];
    const ns = m.stations.length;
    let Nmax = 0, Nmin = 0, Mx = 0, My = 0, Vy = 0, Vx = 0;
    for (let s = 0; s < ns; s++) {
      Nmax = Math.max(Nmax, sf[s * 6]);
      Nmin = Math.min(Nmin, sf[s * 6]);
      Vx = Math.max(Vx, Math.abs(sf[s * 6 + 1]));
      Vy = Math.max(Vy, Math.abs(sf[s * 6 + 2]));
      Mx = Math.max(Mx, Math.abs(sf[s * 6 + 4]));
      My = Math.max(My, Math.abs(sf[s * 6 + 5]));
    }
    if (rod) {
      let Nother = 0;
      if (other) {
        const so = forces[ci][other.id];
        for (let s = 0; s < so.length; s += 6) Nother = Math.min(Nother, so[s]);
      }
      Nmax = Math.max(0, Nmax - Nother);
      Nmin = 0;
    }
    const compression = -Nmin > Nmax && -Nmin > 1e-3; // no axial force: checked as in tension (no amplification)
    const N = compression ? Nmin : Nmax;

    // compression capacity from the chosen effective length method
    let comp: CompressionCapacity | null = null, compMajor: CompressionCapacity | null = null, compMinor: CompressionCapacity | null = null;
    let leMethod = '', leMajor = 0, leMinor = 0, mode: number | null = null, lambdaCr: number | null = null, NomMajor = Infinity, NomMinor = Infinity;
    let modeMajor: number | null = null, modeMinor: number | null = null;
    let fallbackMajor: MemberDesign['fallbackMajor'] = null, fallbackMinor: MemberDesign['fallbackMinor'] = null;
    const L = m.length;
    if (compression) {
      if (set.method === 'buckling') {
        const b = buckling.find((x) => x.combo === (c.base ?? ci));
        leMethod = 'Buckling Analysis';
        if (b && b.values.length) {
          // each axis takes N_om from the lowest mode in which the member buckles about that axis; with none among
          // the computed modes, its own pin-ended Euler load for its length between nodes (k = 1), or the lower bound
          // from the last mode computed (λ N*, the member's own factor being higher) where that is higher
          const thr = input.participation / 100, last = b.values.length - 1;
          const axis = (part: Float32Array[], I: number, scale: number) => {
            const k = b.values.findIndex((_, i) => part[i][m.id] >= thr);
            const at = (j: number) => {
              const Nom0 = b.values[j] * Math.abs(N);
              if (scale === 1) return Nom0;
              const le0 = Math.PI * Math.sqrt((E_STEEL * (I / scale)) / (Nom0 * 1000)) / 1000;
              return Nom0 * scale ** (le0 > 1.1 * L ? 0.5 : 1);
            };
            if (k >= 0) return { k, Nom: at(k), fb: null };
            const bound = at(last);
            const euler = (Math.PI ** 2 * E_STEEL * I) / (L * 1000) ** 2 / 1000;
            return euler >= bound ? { k: -1, Nom: euler, fb: 'euler' as const } : { k: -1, Nom: bound, fb: 'bound' as const };
          };
          const ma = axis(b.participationMajor, sp.Ix, nomScale.major);
          const mi = axis(b.participationMinor, sp.Iy, nomScale.minor);
          NomMajor = ma.Nom;
          NomMinor = mi.Nom;
          modeMajor = ma.k >= 0 ? ma.k + 1 : null;
          modeMinor = mi.k >= 0 ? mi.k + 1 : null;
          fallbackMajor = ma.fb;
          fallbackMinor = mi.fb;
          compMajor = compressionFromNom(sp, NomMajor, rx);
          compMinor = compressionFromNom(sp, NomMinor, ry);
          const minorGov = compMinor.phiNc <= compMajor.phiNc;
          comp = minorGov ? compMinor : compMajor;
          const kg = minorGov ? mi.k : ma.k;
          mode = kg >= 0 ? kg + 1 : null;
          lambdaCr = kg >= 0 ? b.values[kg] : null;
          leMajor = compMajor.le;
          leMinor = compMinor.le;
        }
      } else {
        const lat = m.group === 'topChord' && uf;
        // the out-of-plane (lateral) axis of a chord is the minor axis unless the chord is rotated
        const rot = effectiveSections(input)[m.group].rotate;
        if (lat) {
          leMethod = 'U-Frame';
          const inPlane = set.kMajor * L;
          leMajor = rot ? uf!.le : inPlane;
          leMinor = rot ? inPlane : uf!.le;
        } else {
          leMethod = 'Factor';
          leMajor = set.kMajor * L;
          leMinor = set.kMinor * L;
        }
        NomMajor = (Math.PI ** 2 * E_STEEL * sp.Ix) / (leMajor * 1000) ** 2 / 1000;
        NomMinor = (Math.PI ** 2 * E_STEEL * sp.Iy) / (leMinor * 1000) ** 2 / 1000;
        compMajor = compressionFromNom(sp, NomMajor, rx);
        compMinor = compressionFromNom(sp, NomMinor, ry);
        comp = compMajor.phiNc <= compMinor.phiNc ? compMajor : compMinor;
      }
    }
    const Nabs = Math.abs(N);
    const deltaX = compression && input.amplify ? 1 / Math.max(1e-3, 1 - Nabs / NomMajor) : 1;
    const deltaY = compression && input.amplify ? 1 / Math.max(1e-3, 1 - Nabs / NomMinor) : 1;
    // δ amplifies the moment between the member ends (taken at mid-length); the end moments, from joint
    // continuity, are held by the joints and enter unamplified: the design moment is the larger of the two
    const MxD = Math.max(Mx, deltaX * Math.abs(interp(m, sf, 4, 0.5)));
    const MyD = Math.max(My, deltaY * Math.abs(interp(m, sf, 5, 0.5)));

    // major-axis member moment capacity
    const q = (f: number) => Math.abs(interp(m, sf, 4, f));
    const am = alphaM(Mx, q(0.25), q(0.5), q(0.75));
    const mb = majorBending(sp, set.kLtb * L, am);

    // section combined actions (station by station)
    let sectionComb = 0;
    for (let s = 0; s < ns; s++) {
      const n_ = sf[s * 6], mx_ = Math.abs(sf[s * 6 + 4]), my_ = Math.abs(sf[s * 6 + 5]);
      const v = Math.abs(n_) / (n_ >= 0 ? phiNt : phiNs) + mx_ / phiMsx + my_ / phiMsy;
      sectionComb = Math.max(sectionComb, v);
    }
    const items: CheckItem[] = [];
    const add = (key: string, label: string, clause: string, action: number, capacity: number, unit: CheckItem['unit']) =>
      items.push({ key, label, clause, action, capacity, unit, util: capacity > 0 ? Math.min(9.99, action / capacity) : action > 1e-9 ? 9.99 : 0 });
    if (!compression) add('Nt', rod ? 'Axial Tension (Tension-Only Rod)' : 'Axial Tension', 'Cl. 7.2', Nabs, phiNt, 'kN');
    else {
      add('Ns', 'Section Compression', 'Cl. 6.2', Nabs, phiNs, 'kN');
      if (comp) add('Nc', 'Member Compression', 'Cl. 6.3.3', Nabs, comp.phiNc, 'kN');
    }
    add('Msx', 'Section Bending (Major)', 'Cl. 5.2', Mx, phiMsx, 'kNm');
    add('Msy', 'Section Bending (Minor)', 'Cl. 5.2', My, phiMsy, 'kNm');
    if (mb.Mo !== Infinity) add('Mbx', 'Member Bending (Major)', 'Cl. 5.6', Mx, mb.phiMb, 'kNm');
    add('Vy', 'Shear (Major Axis)', 'Cl. 5.11', Vy, sp.phiVy, 'kN');
    add('Vx', 'Shear (Minor Axis)', 'Cl. 5.11', Vx, sp.phiVx, 'kN');
    items.push({ key: 'Cs', label: 'Combined Section', clause: 'Cl. 8.3.4', action: sectionComb, capacity: 1, unit: '', util: Math.min(9.99, sectionComb) });
    const memberComb = compression
      ? Nabs / (comp?.phiNc ?? phiNs) + MxD / mb.phiMb + MyD / phiMsy
      : Nabs / phiNt + Mx / mb.phiMb + My / phiMsy;
    items.push({ key: 'Cm', label: compression ? 'Combined Member (Compression)' : 'Combined Member (Tension)', clause: 'Cl. 8.4', action: memberComb, capacity: 1, unit: '', util: Math.min(9.99, memberComb) });
    // largest slenderness of the truss members, tension or compression (AISC 360-16 Section D1, User Note: L/r
    // preferably not above 300), with L the length between nodes and r the least radius of gyration
    if (TRUSS_GROUPS.includes(m.group as GroupKey) && input.maxSlenderness > 0)
      add('Lr', 'Slenderness L/r', 'AISC 360 D1', (L * 1000) / Math.min(rx, ry), input.maxSlenderness, 'L/r');
    const gov = items.reduce((x, y) => (y.util > x.util ? y : x));
    byCombo[ci] = gov.util;
    utilRaw = Math.max(utilRaw, ...items.map((it) => (it.unit ? (it.capacity > 0 ? it.action / it.capacity : it.action > 1e-9 ? Infinity : 0) : it.action)));
    if (!best || gov.util > best.util)
      best = {
        member: m.id,
        util: gov.util,
        utilRaw: 0,
        combo: ci,
        governing: gov.label,
        N,
        Mx: MxD,
        My: MyD,
        Vy,
        Vx,
        comp,
        compMajor,
        compMinor,
        leMethod,
        leMajor,
        leMinor,
        mode,
        lambdaCr,
        modeMajor,
        modeMinor,
        fallbackMajor,
        fallbackMinor,
        delta: Math.max(deltaX, deltaY),
        phiNt,
        phiMsx,
        phiMsy,
        phiMbx: mb.phiMb,
        alphaM: am,
        items,
        byCombo
      };
  });
  if (!best)
    best = {
      member: m.id, util: 0, utilRaw: 0, combo: -1, governing: '—', N: 0, Mx: 0, My: 0, Vy: 0, Vx: 0, comp: null, compMajor: null, compMinor: null,
      leMethod: '', leMajor: 0, leMinor: 0, mode: null, lambdaCr: null, modeMajor: null, modeMinor: null, fallbackMajor: null, fallbackMinor: null, delta: 1, phiNt, phiMsx, phiMsy, phiMbx: phiMsx, alphaM: 1, items: [], byCombo
    };
  (best as MemberDesign).byCombo = byCombo;
  (best as MemberDesign).utilRaw = utilRaw;
  return best;
}
