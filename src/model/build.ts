/**
 * Structural model of the pony truss footbridge generated from the inputs.
 *
 * Global axes: X along the span (0 at the left bearings), Y across the bridge (truss A at −s/2, truss B at +s/2),
 * Z vertical with 0 at the bottom chord centroid. Units: m, kN.
 *
 * Members: top and bottom chords (continuous), end posts, verticals, diagonals, cross girders at every bottom chord
 * panel point (forming U-frames with the verticals), plan bracing at cross girder level. Each member is divided
 * into several beam elements so that member buckling is captured by the buckling analysis.
 */
import { sectionProps, type SectionProps } from '../design/section';
import { E_STEEL, G_STEEL } from '../design/capacity';
import type { FEElement, FENode, FrameModel, LoadCase, Vec3 } from '../fea/frame';
import type { BridgeInput, GroupKey } from './types';

export type CaseKey = 'G1s' | 'G1d' | 'G2' | 'Q' | 'W' | 'B';
export const CASES: CaseKey[] = ['G1s', 'G1d', 'G2', 'Q', 'W', 'B'];
export const CASE_LABELS: Record<CaseKey, string> = {
  G1s: 'G1 Steel Self-Weight',
  G1d: 'G1 Deck',
  G2: 'G2 Superimposed Dead',
  Q: 'Pedestrian',
  W: 'Wind (per kPa)',
  B: 'Barrier Load'
};

export interface Member {
  id: number;
  name: string;
  group: GroupKey;
  side: 'A' | 'B' | null;
  panel: number;
  a: Vec3;
  b: Vec3;
  length: number;
  /** Global direction of the section depth. */
  depthDir: Vec3;
  sp: SectionProps;
  /** FE elements from a to b, and the FE nodes and fractions of length at their ends. */
  elements: number[];
  nodes: number[];
  stations: number[];
  relA: boolean;
  relB: boolean;
}

export interface Geometry {
  L: number;
  n: number;
  a: number; // panel length
  s: number; // truss spacing, centre to centre
  chordWidth: number; // m
  H: number; // truss depth
  dTC: number; // vertical dimension of the top chord (m)
  dBC: number;
  wTC: number; // horizontal dimension of the top chord (m)
  wBC: number;
  zCG: number; // cross girder centroid
  dCG: number; // cross girder depth (m)
  cgTop: number;
  /** Stringers: centroid level, depth (m) and positions across the deck. */
  zST: number;
  dST: number;
  stringerYs: number[];
  deckSoffit: number;
  deckTop: number;
  /** Handrail heights above the deck (m), lowest first. */
  handrailHeights: number[];
  /** Deck supports across the bridge (y) and the width each carries (deck and clear width), m. */
  deckShares: { y: number; deck: number; clear: number }[];
  deckWidth: number;
  clearWidth: number;
  handrailY: number; // y of the inside face of the handrail (+ side)
  topX0: number; // extent of the top chord
  topX1: number;
  verticals: boolean;
  solidity: number;
  windDepth: number; // projected depth per unit pressure × C_d (m)
}

export interface BridgeModel {
  input: BridgeInput;
  geo: Geometry;
  members: Member[];
  fe: FrameModel;
  /** Member of each FE element (−1 for rigid links). */
  elMember: Int32Array;
  cases: Record<CaseKey, LoadCase>;
  /** UDL per element per case (global, 3 per element) for force recovery. */
  elLoads: Record<CaseKey, Float64Array>;
  nodeMass: Float64Array; // t
  supports: number[];
  /** Top chord node of each panel point (for restraint forces): [x index][side]. */
  topNodes: { node: number; side: 'A' | 'B'; x: number }[];
  steelMass: number; // t
  warnings: string[];
  /** Input errors that stop the analysis (for example stringers outside the cross girders). */
  errors: string[];
}

const GAMMA_STEEL = 77; // kN/m³ (7850 kg/m³)
const g = 9.81;

const hdim = (sp: SectionProps, depthVertical: boolean) => (depthVertical ? sp.b : sp.d) / 1000;
const vdim = (sp: SectionProps, depthVertical: boolean) => (depthVertical ? sp.d : sp.b) / 1000;

/** Sections of each group as built: the raking end posts take the top chord section. */
export function effectiveSections(input: BridgeInput): BridgeInput['sections'] {
  return { ...input.sections, endPost: input.sections.topChord };
}

/** Stringer positions across the deck (m from the centreline). */
export function stringerPositions(input: BridgeInput): number[] {
  const n = Math.max(0, Math.round(input.stringerCount));
  if (!n) return [];
  return Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * input.stringerSpacing);
}

/**
 * Error message when the outer stringers are not on the cross girders between the bottom chords (the stringers
 * must be inside the inside faces of the chords, with 20 mm to spare), or null.
 */
export function stringerFitError(input: BridgeInput, sections: BridgeInput['sections'] = input.sections): string | null {
  const ys = stringerPositions(input);
  if (!ys.length) return null;
  const secs = effectiveSections({ ...input, sections });
  const tc = sectionProps(secs.topChord), bc = sectionProps(secs.bottomChord);
  const wTC = hdim(tc, !secs.topChord.rotate), wBC = hdim(bc, !secs.bottomChord.rotate);
  const s = input.clearWidth + (2 * input.handrailWidth) / 1000 + Math.max(wTC, wBC);
  const limit = s / 2 - wBC / 2 - 0.02;
  const outer = Math.max(...ys.map(Math.abs));
  if (outer <= limit) return null;
  return `The outer stringers (±${outer.toFixed(3)} m from the centreline) are outside the cross girders, which span ±${limit.toFixed(3)} m between the bottom chords. Reduce the number or the spacing of the stringers.`;
}

export function panelCount(input: BridgeInput): number {
  return 2 * Math.max(2, Math.round(input.span / (2 * Math.max(0.5, input.panelTarget))));
}

export function buildModel(input: BridgeInput): BridgeModel {
  const warnings: string[] = [];
  const L = input.span;
  const n = panelCount(input);
  const a = L / n;
  const H = input.depth;
  const secs = effectiveSections(input);
  const sp: Record<GroupKey, SectionProps> = Object.fromEntries((Object.keys(secs) as GroupKey[]).map((k) => [k, sectionProps(secs[k])])) as Record<GroupKey, SectionProps>;
  const tcVert = !secs.topChord.rotate, bcVert = !secs.bottomChord.rotate, cgVert = !secs.crossGirder.rotate;
  const wTC = hdim(sp.topChord, tcVert), wBC = hdim(sp.bottomChord, bcVert);
  const dTC = vdim(sp.topChord, tcVert), dBC = vdim(sp.bottomChord, bcVert);
  const chordWidth = Math.max(wTC, wBC);
  const s = input.clearWidth + (2 * input.handrailWidth) / 1000 + chordWidth;
  const dCG = vdim(sp.crossGirder, cgVert);
  const cgTop = dBC / 2 + input.cgLevel / 1000;
  let zCG = cgTop - dCG / 2;
  if (Math.abs(zCG) < 0.002) zCG = 0;
  const stringerYs = stringerPositions(input);
  const dST = stringerYs.length ? vdim(sp.stringer, !secs.stringer.rotate) : 0;
  // stringers framed between the cross girders with their tops level with the cross girder tops
  const zST = cgTop - dST / 2;
  const deckT = input.deckThickness / 1000;
  const deckSoffit = cgTop;
  const deckTop = deckSoffit + deckT;
  const deckWidth = s - chordWidth;
  const verticals = input.trussType !== 'warren';
  const handrailHeights = (input.handrails === 2 ? [input.handrailHeight1, input.handrailHeight2] : [input.handrailHeight1]).slice().sort((x, y) => x - y);
  const hrTop = handrailHeights[handrailHeights.length - 1];
  const nSeg = Math.max(2, Math.round(input.elementsPerMember));

  // ------------------------------------------------------------ nodes and elements
  const nodes: FENode[] = [];
  const nodeKey = new Map<string, number>();
  const node = (x: number, y: number, z: number) => {
    const k = `${Math.round(x * 1000)},${Math.round(y * 1000)},${Math.round(z * 1000)}`;
    let i = nodeKey.get(k);
    if (i === undefined) {
      i = nodes.length;
      nodes.push({ x, y, z });
      nodeKey.set(k, i);
    }
    return i;
  };
  const elements: FEElement[] = [];
  const elMember: number[] = [];
  const members: Member[] = [];
  const P = (i: number): Vec3 => [nodes[i].x, nodes[i].y, nodes[i].z];

  const addMember = (
    name: string,
    group: GroupKey,
    side: 'A' | 'B' | null,
    panel: number,
    na: number,
    nb: number,
    depthDir: Vec3,
    opts: { relA?: boolean; relB?: boolean; axialB?: boolean; extra?: number[] } = {}
  ) => {
    const A = P(na), B = P(nb);
    const length = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
    // equal divisions, with extra nodes (handrail level, stringer seats) replacing the nearest division points
    const extra = (opts.extra ?? []).filter((e) => e > 0.02 && e < 0.98);
    const tol = 0.35 / nSeg;
    let fr = Array.from({ length: nSeg + 1 }, (_, i) => i / nSeg).filter((f, i) => i === 0 || i === nSeg || extra.every((e) => Math.abs(e - f) > tol));
    fr = [...fr, ...extra].sort((x, y) => x - y).filter((f, i, arr) => i === 0 || f - arr[i - 1] > 1e-6);
    const ns = fr.map((f, i) => (i === 0 ? na : i === fr.length - 1 ? nb : node(A[0] + f * (B[0] - A[0]), A[1] + f * (B[1] - A[1]), A[2] + f * (B[2] - A[2]))));
    const id = members.length;
    const s0 = sp[group];
    const els: number[] = [];
    for (let i = 0; i < ns.length - 1; i++) {
      els.push(elements.length);
      elMember.push(id);
      elements.push({
        i: ns[i],
        j: ns[i + 1],
        E: E_STEEL * 1000,
        G: G_STEEL * 1000,
        A: s0.A * 1e-6,
        Iy: s0.Ix * 1e-12,
        Iz: s0.Iy * 1e-12,
        J: s0.J * 1e-12,
        ref: depthDir,
        relI: i === 0 && !!opts.relA,
        relJ: i === ns.length - 2 && !!opts.relB,
        relAxialJ: i === ns.length - 2 && !!opts.axialB
      });
    }
    members.push({ id, name, group, side, panel, a: A, b: B, length, depthDir, sp: s0, elements: els, nodes: ns, stations: fr, relA: !!opts.relA, relB: !!opts.relB });
    return id;
  };

  const link = (na: number, nb: number) => {
    elMember.push(-1);
    elements.push({ i: na, j: nb, E: E_STEEL * 1000, G: G_STEEL * 1000, A: 0.5, Iy: 0.05, Iz: 0.05, J: 0.05, ref: [1, 0, 0] });
  };

  const sides: ['A' | 'B', number][] = [['A', -s / 2], ['B', s / 2]];
  const X = (k: number) => k * a;
  const Z: Vec3 = [0, 0, 1], Yd: Vec3 = [0, 1, 0], Xd: Vec3 = [1, 0, 0];
  const chordDir = (rot: boolean): Vec3 => (rot ? Yd : Z);
  const webDir = (rot: boolean, A: Vec3, B: Vec3): Vec3 => {
    if (!rot) return Yd;
    const d: Vec3 = [B[0] - A[0], 0, B[2] - A[2]];
    const l = Math.hypot(d[0], d[2]) || 1;
    return [-d[2] / l, 0, d[0] / l]; // in the truss plane, perpendicular to the member
  };

  const bot: number[][] = [[], []]; // [side][k]
  const top: number[][] = [[], []];
  // top chord nodes: panel points 1 to n − 1 (Pratt, Howe) or mid-panel (Warren); raking end posts at both ends
  const topXs: number[] = verticals ? Array.from({ length: n - 1 }, (_, k) => X(k + 1)) : Array.from({ length: n }, (_, k) => X(k + 0.5));
  sides.forEach(([, y], si) => {
    for (let k = 0; k <= n; k++) bot[si][k] = node(X(k), y, 0);
    topXs.forEach((x, k) => (top[si][k] = node(x, y, H)));
  });

  const hrFrac = (deckTop + hrTop) / H;
  const webRel = input.webPinned;
  sides.forEach(([side, ], si) => {
    // chords
    for (let k = 0; k < n; k++) addMember(`BC${k + 1}${side}`, 'bottomChord', side, k + 1, bot[si][k], bot[si][k + 1], chordDir(!bcVert));
    for (let k = 0; k < topXs.length - 1; k++) addMember(`TC${k + 1}${side}`, 'topChord', side, k + 1, top[si][k], top[si][k + 1], chordDir(!tcVert));
    if (verticals) {
      // Pratt and Howe: raking end posts in the end panels, verticals at panel points 1 to n − 1
      const T = (k: number) => top[si][k - 1];
      addMember(`EPL${side}`, 'endPost', side, 1, bot[si][0], T(1), webDir(secs.endPost.rotate, P(bot[si][0]), P(T(1))), { extra: [hrFrac] });
      addMember(`EPR${side}`, 'endPost', side, n, T(n - 1), bot[si][n], webDir(secs.endPost.rotate, P(T(n - 1)), P(bot[si][n])), { extra: [1 - hrFrac] });
      for (let k = 1; k < n; k++) {
        const A = P(bot[si][k]), B = P(T(k));
        addMember(`V${k}${side}`, 'vertical', side, k, bot[si][k], T(k), webDir(secs.vertical.rotate, A, B), { extra: [hrFrac] });
      }
      for (let k = 1; k < n - 1; k++) {
        let na: number, nb: number;
        const left = k < n / 2;
        if (input.trussType === 'pratt') [na, nb] = left ? [T(k), bot[si][k + 1]] : [bot[si][k], T(k + 1)];
        else [na, nb] = left ? [bot[si][k], T(k + 1)] : [T(k), bot[si][k + 1]];
        addMember(`D${k + 1}${side}`, 'diagonal', side, k + 1, na, nb, webDir(secs.diagonal.rotate, P(na), P(nb)), { relA: webRel, relB: webRel });
      }
    } else {
      // Warren: no verticals; raking end posts and diagonals to the mid-panel top chord nodes
      for (let k = 0; k < n; k++) {
        const up = [bot[si][k], top[si][k]], down = [top[si][k], bot[si][k + 1]];
        const g1: GroupKey = k === 0 ? 'endPost' : 'diagonal';
        const g2: GroupKey = k === n - 1 ? 'endPost' : 'diagonal';
        addMember(k === 0 ? `EPL${side}` : `D${2 * k + 1}${side}`, g1, side, k + 1, up[0], up[1], webDir(secs[g1].rotate, P(up[0]), P(up[1])), { relA: webRel && g1 === 'diagonal', relB: webRel && g1 === 'diagonal', extra: [hrFrac] });
        addMember(k === n - 1 ? `EPR${side}` : `D${2 * k + 2}${side}`, g2, side, k + 1, down[0], down[1], webDir(secs[g2].rotate, P(down[0]), P(down[1])), { relA: webRel && g2 === 'diagonal', relB: webRel && g2 === 'diagonal', extra: [1 - hrFrac] });
      }
    }
  });

  // cross girders (with rigid links down from the bottom chord when offset) and plan bracing
  const cgEnd: number[][] = [[], []];
  for (let k = 0; k <= n; k++) {
    sides.forEach(([, y], si) => {
      if (zCG === 0) cgEnd[si][k] = bot[si][k];
      else {
        cgEnd[si][k] = node(X(k), y, zCG);
        link(bot[si][k], cgEnd[si][k]);
      }
    });
    addMember(`CG${k}`, 'crossGirder', null, k, cgEnd[0][k], cgEnd[1][k], secs.crossGirder.rotate ? Xd : Z, { extra: stringerYs.map((y) => (y + s / 2) / s) });
  }
  // stringers: simply supported on the cross girders, modelled on the cross girder axis (drawn with their tops
  // level with the cross girder tops);
  // bending released at both ends and axial force released at one end, so they take no load from the chords
  if (stringerYs.length) {
    const seat = stringerYs.map((y) => Array.from({ length: n + 1 }, (_, k) => node(X(k), y, zCG)));
    for (let k = 0; k < n; k++)
      stringerYs.forEach((_, i) => addMember(`ST${k + 1}-${i + 1}`, 'stringer', null, k + 1, seat[i][k], seat[i][k + 1], secs.stringer.rotate ? Yd : Z, { relA: true, relB: true, axialB: true }));
  }
  const brDir: Vec3 = secs.bracing.rotate ? Yd : Z;
  const pr = input.bracingPinned;
  for (let k = 0; k < n; k++) {
    if (input.bracing === 'x') {
      addMember(`PB${k + 1}a`, 'bracing', null, k + 1, cgEnd[0][k], cgEnd[1][k + 1], brDir, { relA: pr, relB: pr });
      addMember(`PB${k + 1}b`, 'bracing', null, k + 1, cgEnd[1][k], cgEnd[0][k + 1], brDir, { relA: pr, relB: pr });
    } else if (input.bracing === 'single') {
      const left = k < n / 2;
      const [na, nb] = left ? [cgEnd[0][k], cgEnd[1][k + 1]] : [cgEnd[1][k], cgEnd[0][k + 1]];
      addMember(`PB${k + 1}`, 'bracing', null, k + 1, na, nb, brDir, { relA: pr, relB: pr });
    }
  }

  // supports: left bearings fixed longitudinally, truss A bearings guided laterally
  const restraints = nodes.map(() => [false, false, false, false, false, false]);
  const fix = (nd: number, dofs: number[]) => dofs.forEach((d) => (restraints[nd][d] = true));
  fix(bot[0][0], [0, 1, 2]);
  fix(bot[1][0], [0, 2]);
  fix(bot[0][n], [1, 2]);
  fix(bot[1][n], [2]);
  const supports = [bot[0][0], bot[1][0], bot[0][n], bot[1][n]];

  // ------------------------------------------------------------ loads
  const nEl = elements.length;
  const elLoads = Object.fromEntries(
    CASES.map((c) => [c, new Float64Array(nEl * 3)])
  ) as Record<CaseKey, Float64Array>;
  const nodal: Record<CaseKey, LoadCase['nodal']> = { G1s: [], G1d: [], G2: [], Q: [], W: [], B: [] };
  const addUdl = (c: CaseKey, m: Member, q: Vec3) => {
    for (const el of m.elements) for (let d = 0; d < 3; d++) elLoads[c][el * 3 + d] += q[d];
  };
  const byGroup = (gk: GroupKey) => members.filter((m) => m.group === gk);

  // G1 steel
  let steelMass = 0;
  for (const m of members) {
    const w = m.sp.A * 1e-6 * GAMMA_STEEL * (1 + input.connectionAllowance / 100);
    steelMass += (w * m.length) / g;
    addUdl('G1s', m, [0, 0, -w]);
  }
  // deck, pedestrian load and wind uplift: the deck spans across the bridge between its supports (the bottom
  // chords and/or the stringers); each support carries the width halfway to its neighbours, the outer ones to the
  // edge of the loaded width
  const deckQ = deckT * input.deckDensity;
  const chordSupport = !stringerYs.length || input.chordsSupportDeck;
  const deckSupports = [
    ...(chordSupport ? [{ y: -s / 2, members: members.filter((m) => m.group === 'bottomChord' && m.side === 'A') }, { y: s / 2, members: members.filter((m) => m.group === 'bottomChord' && m.side === 'B') }] : []),
    ...stringerYs.map((y) => ({ y, members: members.filter((m) => m.group === 'stringer' && Math.abs(m.a[1] - y) < 1e-6) }))
  ].sort((p, q) => p.y - q.y);
  const share = (i: number, y0: number, y1: number) => {
    const lo = i === 0 ? -Infinity : (deckSupports[i - 1].y + deckSupports[i].y) / 2;
    const hi = i === deckSupports.length - 1 ? Infinity : (deckSupports[i].y + deckSupports[i + 1].y) / 2;
    return Math.max(0, Math.min(hi, y1) - Math.max(lo, y0));
  };
  const deckShares = deckSupports.map((sup, i) => ({ y: sup.y, deck: share(i, -deckWidth / 2, deckWidth / 2), clear: share(i, -input.clearWidth / 2, input.clearWidth / 2) }));
  deckSupports.forEach((sup, i) => {
    const { deck, clear } = deckShares[i];
    for (const m of sup.members) {
      addUdl('G1d', m, [0, 0, -deckQ * deck]);
      addUdl('Q', m, [0, 0, -input.pedestrian * clear]);
      addUdl('W', m, [0, 0, input.liftCoeff * deck]);
    }
  });
  // screens, handrails, services on the bottom chords
  const lineG2 = (input.screens ? input.screenLoad * input.screenHeight : 0) + input.handrailLoad * handrailHeights.length + input.services / 2;
  for (const m of byGroup('bottomChord')) addUdl('G2', m, [0, 0, -lineG2]);

  // wind: projected depth of truss A (members and screens), lateral +Y, and uplift on the deck
  const Henv = H + dTC / 2 + dBC / 2;
  let projected = 0;
  for (const m of members) {
    if (m.side !== 'A') continue;
    const dv = m.depthDir;
    const vis = Math.abs(dv[1]) > 0.5 ? m.sp.b / 1000 : m.sp.d / 1000;
    const horiz = Math.hypot(m.b[0] - m.a[0], m.b[2] - m.a[2]);
    projected += vis * horiz;
  }
  const solidity = Math.min(1, projected / (L * Henv));
  const screenDepth = input.screens ? Math.min(input.screenHeight, Math.max(0, H + dTC / 2 - deckTop)) * input.screenSolidity * (1 - solidity) : 0;
  const trussDepth = solidity * Henv + screenDepth;
  const cgExposed = Math.max(0, -dBC / 2 - (zCG - dCG / 2));
  const windDepth = trussDepth + cgExposed;
  const cd = input.dragCoeff;
  for (const m of members) {
    if (m.side !== 'A') continue;
    if (m.group === 'topChord') addUdl('W', m, [0, (cd * trussDepth) / 2, 0]);
    if (m.group === 'bottomChord') addUdl('W', m, [0, cd * (trussDepth / 2 + cgExposed), 0]);
  }

  // barrier load at the top handrail on the web members that carry the handrail brackets, outwards
  if (input.barrier > 0)
    for (const m of members) {
      if (m.group !== 'vertical' && m.group !== 'endPost' && !(m.group === 'diagonal' && !verticals)) continue;
      const zt = deckTop + hrTop;
      const i = m.nodes.findIndex((nd) => Math.abs(nodes[nd].z - zt) < 1e-6);
      const nd = i >= 0 ? m.nodes[i] : m.a[2] > m.b[2] ? m.nodes[0] : m.nodes[m.nodes.length - 1];
      const trib = verticals && m.group === 'vertical' ? a : a / 2;
      nodal.B.push({ node: nd, f: [0, (m.side === 'A' ? -1 : 1) * input.barrier * trib, 0, 0, 0, 0] });
    }

  const cases = Object.fromEntries(
    CASES.map((c) => {
      const els: LoadCase['elements'] = [];
      for (let e = 0; e < nEl; e++) {
        const q: Vec3 = [elLoads[c][e * 3], elLoads[c][e * 3 + 1], elLoads[c][e * 3 + 2]];
        if (q[0] || q[1] || q[2]) els.push({ el: e, q });
      }
      return [c, { nodal: nodal[c], elements: els }];
    })
  ) as Record<CaseKey, LoadCase>;

  // lumped mass from the permanent loads (and a share of the pedestrian load)
  const nodeMass = new Float64Array(nodes.length);
  const lump = (c: CaseKey, f: number) => {
    for (let e = 0; e < nEl; e++) {
      const qz = elLoads[c][e * 3 + 2];
      if (!qz) continue;
      const el = elements[e];
      const len = Math.hypot(nodes[el.j].x - nodes[el.i].x, nodes[el.j].y - nodes[el.i].y, nodes[el.j].z - nodes[el.i].z);
      const m = (Math.abs(qz) * len * f) / (2 * g);
      nodeMass[el.i] += m;
      nodeMass[el.j] += m;
    }
  };
  lump('G1s', 1);
  lump('G1d', 1);
  lump('G2', 1);
  if (input.modalQ > 0) lump('Q', input.modalQ / 100);

  const topNodes: BridgeModel['topNodes'] = [];
  sides.forEach(([side], si) => top[si].forEach((nd) => topNodes.push({ node: nd, side, x: nodes[nd].x })));

  if (deckTop + hrTop > H + dTC / 2 + 0.3) warnings.push('The top handrail is more than 300 mm above the top of the top chord.');
  if (hrFrac >= 1) warnings.push('The top handrail is above the top chord: the barrier load is applied at the top chord.');
  const errors: string[] = [];
  const fit = stringerFitError(input);
  if (fit) errors.push(fit);
  const ang = (Math.atan2(H, verticals ? a : a / 2) * 180) / Math.PI;
  if (ang < 30 || ang > 65) warnings.push(`Diagonals are at ${ang.toFixed(0)}° to the horizontal (30° to 65° is usual).`);

  const geo: Geometry = {
    L, n, a, s, chordWidth, H, dTC, dBC, wTC, wBC, zCG, dCG, cgTop, zST, dST, stringerYs, deckSoffit, deckTop, handrailHeights, deckShares, deckWidth,
    clearWidth: input.clearWidth,
    handrailY: input.clearWidth / 2,
    topX0: topXs[0],
    topX1: topXs[topXs.length - 1],
    verticals,
    solidity,
    windDepth: cd * windDepth
  };
  return { input, geo, members, fe: { nodes, elements, restraints }, elMember: Int32Array.from(elMember), cases, elLoads, nodeMass, supports, topNodes, steelMass, warnings, errors };
}
