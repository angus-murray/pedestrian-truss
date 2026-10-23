/**
 * Linear elastic 3D frame: 12-DOF Euler–Bernoulli beam elements with optional bending releases at either end,
 * consistent geometric stiffness for the linearised (eigenvalue) buckling analysis, and lumped mass.
 *
 * Units: kN, m. Element local axes: x along the member (i → j), z the section depth direction, y = z × x.
 * Iy is about local y (resists w, the major axis of a section whose depth is along z), Iz about local z.
 * DOF order per node: ux, uy, uz, rx, ry, rz.
 */
import { SkylineMatrix, SparseSym } from './skyline';

export type Vec3 = [number, number, number];

export interface FENode {
  x: number;
  y: number;
  z: number;
}

export interface FEElement {
  i: number;
  j: number;
  E: number;
  G: number;
  A: number;
  Iy: number;
  Iz: number;
  J: number;
  /** Global direction of the section depth (local z), not parallel to the element. */
  ref: Vec3;
  /** Bending (ry, rz) released at end i / end j. */
  relI?: boolean;
  relJ?: boolean;
  /** Axial force released at end j (a sliding end). */
  relAxialJ?: boolean;
  /**
   * Rotational springs (semi-rigid joints) at end i / end j, about local y and local z (kNm/rad), in series between
   * the node and the element end. Ignored where the end is released.
   */
  springI?: [number, number];
  springJ?: [number, number];
}

/** Uniform load on an element, global components (kN/m). */
export interface ElementLoad {
  el: number;
  q: Vec3;
}

export interface NodalLoad {
  node: number;
  f: [number, number, number, number, number, number];
}

export interface LoadCase {
  nodal: NodalLoad[];
  elements: ElementLoad[];
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Local axes (rows ex, ey, ez) and length of an element. */
export function elementAxes(nodes: FENode[], e: FEElement): { R: number[][]; L: number } {
  const a: Vec3 = [nodes[e.i].x, nodes[e.i].y, nodes[e.i].z];
  const b: Vec3 = [nodes[e.j].x, nodes[e.j].y, nodes[e.j].z];
  const d = sub(b, a);
  const L = Math.hypot(d[0], d[1], d[2]);
  const ex = norm(d);
  let r = e.ref;
  if (Math.abs(dot(norm(r), ex)) > 0.999) r = Math.abs(ex[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
  const p = dot(r, ex);
  const ez = norm([r[0] - p * ex[0], r[1] - p * ex[1], r[2] - p * ex[2]]);
  const ey = cross(ez, ex);
  return { R: [ex, ey, ez], L };
}

/** Local elastic stiffness (12 × 12, row-major). */
export function localStiffness(e: FEElement, L: number): Float64Array {
  const k = new Float64Array(144);
  const s = (i: number, j: number, v: number) => {
    k[i * 12 + j] += v;
    if (i !== j) k[j * 12 + i] += v;
  };
  const EA = (e.E * e.A) / L, GJ = (e.G * e.J) / L;
  const z = e.E * e.Iz, y = e.E * e.Iy, L2 = L * L, L3 = L2 * L;
  s(0, 0, EA); s(6, 6, EA); s(0, 6, -EA);
  s(3, 3, GJ); s(9, 9, GJ); s(3, 9, -GJ);
  // v – θz (EIz)
  s(1, 1, (12 * z) / L3); s(1, 5, (6 * z) / L2); s(1, 7, (-12 * z) / L3); s(1, 11, (6 * z) / L2);
  s(5, 5, (4 * z) / L); s(5, 7, (-6 * z) / L2); s(5, 11, (2 * z) / L);
  s(7, 7, (12 * z) / L3); s(7, 11, (-6 * z) / L2); s(11, 11, (4 * z) / L);
  // w – θy (EIy)
  s(2, 2, (12 * y) / L3); s(2, 4, (-6 * y) / L2); s(2, 8, (-12 * y) / L3); s(2, 10, (-6 * y) / L2);
  s(4, 4, (4 * y) / L); s(4, 8, (6 * y) / L2); s(4, 10, (2 * y) / L);
  s(8, 8, (12 * y) / L3); s(8, 10, (6 * y) / L2); s(10, 10, (4 * y) / L);
  return k;
}

/** Local geometric stiffness for axial force N (tension positive). */
export function localGeometric(e: FEElement, L: number, N: number): Float64Array {
  const k = new Float64Array(144);
  const c = N / L;
  const s = (i: number, j: number, v: number) => {
    k[i * 12 + j] += c * v;
    if (i !== j) k[j * 12 + i] += c * v;
  };
  const L2 = L * L;
  s(1, 1, 6 / 5); s(1, 5, L / 10); s(1, 7, -6 / 5); s(1, 11, L / 10);
  s(5, 5, (2 * L2) / 15); s(5, 7, -L / 10); s(5, 11, -L2 / 30);
  s(7, 7, 6 / 5); s(7, 11, -L / 10); s(11, 11, (2 * L2) / 15);
  s(2, 2, 6 / 5); s(2, 4, -L / 10); s(2, 8, -6 / 5); s(2, 10, -L / 10);
  s(4, 4, (2 * L2) / 15); s(4, 8, L / 10); s(4, 10, -L2 / 30);
  s(8, 8, 6 / 5); s(8, 10, L / 10); s(10, 10, (2 * L2) / 15);
  const ip = (e.Iy + e.Iz) / e.A;
  s(3, 3, ip); s(9, 9, ip); s(3, 9, -ip);
  return k;
}

/** Released local DOFs of an element. */
/** End springs of an element as local DOF and stiffness: a release is a spring of zero stiffness. */
const endSprings = (e: FEElement): { dof: number; k: number }[] => {
  const out: { dof: number; k: number }[] = [];
  const end = (rel: boolean | undefined, sp: [number, number] | undefined, dy: number) => {
    if (rel) out.push({ dof: dy, k: 0 }, { dof: dy + 1, k: 0 });
    else if (sp)
      sp.forEach((k, a) => {
        if (Number.isFinite(k) && k > 0) out.push({ dof: dy + a, k });
      });
  };
  end(e.relI, e.springI, 4);
  if (e.relAxialJ) out.push({ dof: 6, k: 0 });
  end(e.relJ, e.springJ, 10);
  return out;
};

/** Solves a small dense system in place (Gaussian elimination with partial pivoting). */
function solveDense(A: number[][], B: number[][]): number[][] {
  const n = A.length, m = B[0]?.length ?? 0;
  const a = A.map((r) => r.slice()), b = B.map((r) => r.slice());
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    [a[c], a[p]] = [a[p], a[c]];
    [b[c], b[p]] = [b[p], b[c]];
    const d = a[c][c] || 1e-30;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = a[r][c] / d;
      if (!f) continue;
      for (let k = c; k < n; k++) a[r][k] -= f * a[c][k];
      for (let k = 0; k < m; k++) b[r][k] -= f * b[c][k];
    }
  }
  return b.map((row, r) => row.map((v) => v / (a[r][r] || 1e-30)));
}

/**
 * Condensation of released DOFs: u_full = T u (released DOFs expressed in terms of the others), so a condensed
 * matrix is Tᵀ K T. Returns null for an element without releases.
 */
/**
 * Condensation of end springs (and releases, zero stiffness). At each spring DOF r the element end has its own
 * displacement φ_r, joined to the node by the spring k_r. With the element displacements u_e = T u (u the node
 * displacements), φ = (K_rr + k)⁻¹ (k u_r − K_rc u_c), and the stiffness at the nodes is Tᵀ K T plus the spring
 * energy Σ k_r (u_r − φ_r)².
 */
function springTransform(k: Float64Array, sp: { dof: number; k: number }[]): { T: Float64Array; kc: Float64Array } | null {
  if (!sp.length) return null;
  const rel = sp.map((s) => s.dof);
  const keep = Array.from({ length: 12 }, (_, i) => i).filter((i) => !rel.includes(i));
  const A = rel.map((r, a) => rel.map((c, b) => k[r * 12 + c] + (a === b ? sp[a].k : 0)));
  // right-hand sides: −K_rc for the kept DOFs, k_r for the node DOF of each spring
  const B = rel.map((r, a) => [...keep.map((c) => -k[r * 12 + c]), ...rel.map((_, b) => (a === b ? sp[a].k : 0))]);
  const X = solveDense(A, B);
  const T = new Float64Array(144);
  for (const i of keep) T[i * 12 + i] = 1;
  rel.forEach((r, a) => {
    keep.forEach((c, b) => (T[r * 12 + c] = X[a][b]));
    rel.forEach((c, b) => (T[r * 12 + c] = X[a][keep.length + b]));
  });
  const kc = congruence(k, T);
  sp.forEach(({ dof: r, k: kr }) => {
    if (!kr) return;
    // spring elongation u_r − φ_r = (e_r − T_r) u
    const d = new Float64Array(12);
    for (let c = 0; c < 12; c++) d[c] = (c === r ? 1 : 0) - T[r * 12 + c];
    for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) kc[i * 12 + j] += kr * d[i] * d[j];
  });
  return { T, kc };
}

/** Tᵀ K T for 12 × 12 matrices. */
function congruence(K: Float64Array, T: Float64Array): Float64Array {
  const KT = new Float64Array(144), out = new Float64Array(144);
  for (let i = 0; i < 12; i++)
    for (let j = 0; j < 12; j++) {
      let s = 0;
      for (let m = 0; m < 12; m++) s += K[i * 12 + m] * T[m * 12 + j];
      KT[i * 12 + j] = s;
    }
  for (let i = 0; i < 12; i++)
    for (let j = 0; j < 12; j++) {
      let s = 0;
      for (let m = 0; m < 12; m++) s += T[m * 12 + i] * KT[m * 12 + j];
      out[i * 12 + j] = s;
    }
  return out;
}

/** Global matrix from local: Λᵀ k Λ, Λ = blockdiag(R, R, R, R). */
function toGlobal(k: Float64Array, R: number[][]): Float64Array {
  const out = new Float64Array(144), tmp = new Float64Array(144);
  // tmp = k Λ
  for (let i = 0; i < 12; i++)
    for (let bj = 0; bj < 4; bj++)
      for (let c = 0; c < 3; c++) {
        let s = 0;
        for (let m = 0; m < 3; m++) s += k[i * 12 + bj * 3 + m] * R[m][c];
        tmp[i * 12 + bj * 3 + c] = s;
      }
  // out = Λᵀ tmp
  for (let bi = 0; bi < 4; bi++)
    for (let r = 0; r < 3; r++)
      for (let j = 0; j < 12; j++) {
        let s = 0;
        for (let m = 0; m < 3; m++) s += R[m][r] * tmp[(bi * 3 + m) * 12 + j];
        out[(bi * 3 + r) * 12 + j] = s;
      }
  return out;
}

const toLocalVec = (v: ArrayLike<number>, R: number[][]): Float64Array => {
  const out = new Float64Array(12);
  for (let b = 0; b < 4; b++)
    for (let r = 0; r < 3; r++) out[b * 3 + r] = R[r][0] * v[b * 3] + R[r][1] * v[b * 3 + 1] + R[r][2] * v[b * 3 + 2];
  return out;
};
const toGlobalVec = (v: ArrayLike<number>, R: number[][]): Float64Array => {
  const out = new Float64Array(12);
  for (let b = 0; b < 4; b++)
    for (let c = 0; c < 3; c++) out[b * 3 + c] = R[0][c] * v[b * 3] + R[1][c] * v[b * 3 + 1] + R[2][c] * v[b * 3 + 2];
  return out;
};

/** Equivalent nodal loads (local) of a uniform local load q = (qx, qy, qz). */
function equivalentLoads(q: Vec3, L: number): Float64Array {
  const [qx, qy, qz] = q;
  const L2 = L * L;
  return Float64Array.from([
    (qx * L) / 2, (qy * L) / 2, (qz * L) / 2, 0, (-qz * L2) / 12, (qy * L2) / 12,
    (qx * L) / 2, (qy * L) / 2, (qz * L) / 2, 0, (qz * L2) / 12, (-qy * L2) / 12
  ]);
}

interface ElementData {
  R: number[][];
  L: number;
  k: Float64Array; // local, condensed for the end springs and releases
  kFull: Float64Array;
  T: Float64Array | null;
  dofs: Int32Array; // global equation numbers (−1 restrained)
  springs: { dof: number; k: number }[];
}

export interface FrameModel {
  nodes: FENode[];
  elements: FEElement[];
  /** Restrained DOFs per node: 6 flags. */
  restraints: boolean[][];
}

/** Reverse Cuthill–McKee node order (reduces the profile of the stiffness matrix). */
function rcmOrder(nNodes: number, elements: FEElement[], nodes: FENode[]): number[] {
  const adj: number[][] = Array.from({ length: nNodes }, () => []);
  for (const e of elements) {
    adj[e.i].push(e.j);
    adj[e.j].push(e.i);
  }
  const visited = new Uint8Array(nNodes);
  const order: number[] = [];
  const byX = Array.from({ length: nNodes }, (_, i) => i).sort((a, b) => nodes[a].x - nodes[b].x || adj[a].length - adj[b].length);
  for (const s of byX) {
    if (visited[s]) continue;
    const queue = [s];
    visited[s] = 1;
    while (queue.length) {
      const v = queue.shift()!;
      order.push(v);
      const nb = adj[v].filter((w) => !visited[w]).sort((a, b) => adj[a].length - adj[b].length);
      for (const w of nb) {
        if (visited[w]) continue;
        visited[w] = 1;
        queue.push(w);
      }
    }
  }
  return order.reverse();
}

export class FrameSolver {
  readonly model: FrameModel;
  readonly nEq: number;
  /** Equation number of each node DOF (−1 restrained). */
  readonly eq: Int32Array;
  private els: ElementData[];
  readonly K: SkylineMatrix;
  /** Unfactorised copy of K, for products. */
  readonly K0: SkylineMatrix;

  constructor(model: FrameModel) {
    this.model = model;
    const { nodes, elements, restraints } = model;
    const order = rcmOrder(nodes.length, elements, nodes);
    this.eq = new Int32Array(nodes.length * 6).fill(-1);
    let n = 0;
    for (const node of order) for (let d = 0; d < 6; d++) if (!restraints[node]?.[d]) this.eq[node * 6 + d] = n++;
    this.nEq = n;

    this.els = elements.map((e) => {
      const { R, L } = elementAxes(nodes, e);
      const kFull = localStiffness(e, L);
      const springs = endSprings(e);
      const st = springTransform(kFull, springs);
      const T = st ? st.T : null;
      const k = st ? st.kc : kFull;
      const dofs = new Int32Array(12);
      for (let d = 0; d < 6; d++) {
        dofs[d] = this.eq[e.i * 6 + d];
        dofs[6 + d] = this.eq[e.j * 6 + d];
      }
      return { R, L, k, kFull, T, dofs, springs };
    });

    const first = new Int32Array(n);
    for (let i = 0; i < n; i++) first[i] = i;
    for (const ed of this.els) {
      let m = Infinity;
      for (const d of ed.dofs) if (d >= 0) m = Math.min(m, d);
      for (const d of ed.dofs) if (d >= 0 && m < first[d]) first[d] = m;
    }
    this.K = new SkylineMatrix(first);
    for (const ed of this.els) this.scatter(this.K, toGlobal(ed.k, ed.R), ed.dofs);
    this.K0 = new SkylineMatrix(first);
    this.K0.data.set(this.K.data);
  }

  private scatter(M: { add(i: number, j: number, v: number): void }, kg: Float64Array, dofs: Int32Array) {
    for (let a = 0; a < 12; a++) {
      const r = dofs[a];
      if (r < 0) continue;
      for (let b = 0; b <= a; b++) {
        const c = dofs[b];
        if (c < 0) continue;
        const v = kg[a * 12 + b];
        if (v === 0) continue;
        if (r === c) M.add(r, c, a === b ? v : 2 * v);
        else M.add(r, c, v);
      }
    }
  }

  /** Factorises K; returns a description of the unstable node, or null. */
  factor(): string | null {
    const bad = this.K.factor();
    if (bad < 0) return null;
    const idx = Array.from(this.eq).indexOf(bad);
    const node = Math.floor(idx / 6), dof = ['X', 'Y', 'Z', 'RX', 'RY', 'RZ'][idx % 6];
    return `The structure is unstable (mechanism) at node ${node}, DOF ${dof}.`;
  }

  /** Global load vector of a load case (equivalent nodal loads of element loads included). */
  loadVector(lc: LoadCase): Float64Array {
    const F = new Float64Array(this.nEq);
    for (const nl of lc.nodal)
      for (let d = 0; d < 6; d++) {
        const q = this.eq[nl.node * 6 + d];
        if (q >= 0) F[q] += nl.f[d];
      }
    for (const el of lc.elements) {
      const ed = this.els[el.el];
      const P = this.localEquivalent(el.el, el.q);
      const Pg = toGlobalVec(P, ed.R);
      for (let a = 0; a < 12; a++) if (ed.dofs[a] >= 0) F[ed.dofs[a]] += Pg[a];
    }
    return F;
  }

  /** Equivalent nodal loads (local) of an element load, condensed for releases. */
  private localEquivalent(el: number, q: Vec3): Float64Array {
    const ed = this.els[el];
    const ql: Vec3 = [dot(ed.R[0] as Vec3, q), dot(ed.R[1] as Vec3, q), dot(ed.R[2] as Vec3, q)];
    const P = equivalentLoads(ql, ed.L);
    if (!ed.T) return P;
    // P_c = Tᵀ P (released DOFs carry no load once condensed)
    const out = new Float64Array(12);
    for (let i = 0; i < 12; i++) {
      let s = 0;
      for (let m = 0; m < 12; m++) s += ed.T[m * 12 + i] * P[m];
      out[i] = s;
    }
    return out;
  }

  /** Nodal displacement vector (6 per node, zero at restraints) from the solution vector. */
  expand(u: Float64Array): Float64Array {
    const out = new Float64Array(this.model.nodes.length * 6);
    for (let i = 0; i < out.length; i++) if (this.eq[i] >= 0) out[i] = u[this.eq[i]];
    return out;
  }

  /**
   * Element end forces in local axes (12 values: forces on the element at i then j), including element loads.
   * Internal actions at end i are −f[0..5], at end j +f[6..11].
   */
  endForces(el: number, disp: Float64Array, loads: Vec3 | null): Float64Array {
    const ed = this.els[el], e = this.model.elements[el];
    const ug = new Float64Array(12);
    for (let d = 0; d < 6; d++) {
      ug[d] = disp[e.i * 6 + d];
      ug[6 + d] = disp[e.j * 6 + d];
    }
    let ul = toLocalVec(ug, ed.R);
    const ql: Vec3 = loads ? [dot(ed.R[0] as Vec3, loads), dot(ed.R[1] as Vec3, loads), dot(ed.R[2] as Vec3, loads)] : [0, 0, 0];
    const P = equivalentLoads(ql, ed.L);
    if (ed.T) {
      // recover the element end displacements at the springs and releases: φ = (K_rr + k)⁻¹ (P_r + k u_r − K_rc u_c)
      const rel = ed.springs.map((s) => s.dof);
      const keep = Array.from({ length: 12 }, (_, i) => i).filter((i) => !rel.includes(i));
      const Krr = rel.map((r, a) => rel.map((c, b) => ed.kFull[r * 12 + c] + (a === b ? ed.springs[a].k : 0)));
      const rhs = rel.map((r, a) => [P[r] + ed.springs[a].k * ul[r] - keep.reduce((s, c) => s + ed.kFull[r * 12 + c] * ul[c], 0)]);
      const ur = solveDense(Krr, rhs);
      ul = Float64Array.from(ul);
      rel.forEach((r, a) => (ul[r] = ur[a][0]));
    }
    const f = new Float64Array(12);
    for (let i = 0; i < 12; i++) {
      let s = -P[i];
      for (let m = 0; m < 12; m++) s += ed.kFull[i * 12 + m] * ul[m];
      f[i] = s;
    }
    return f;
  }

  /** Geometric stiffness for element axial forces N (tension positive), assembled as −Kg (positive in compression). */
  negGeometric(N: Float64Array): SparseSym {
    const M = new SparseSym(this.nEq);
    this.els.forEach((ed, i) => {
      if (!N[i]) return;
      let kg = localGeometric(this.model.elements[i], ed.L, -N[i]);
      if (ed.T) kg = congruence(kg, ed.T);
      this.scatterSparse(M, toGlobal(kg, ed.R), ed.dofs);
    });
    return M;
  }

  private scatterSparse(M: SparseSym, kg: Float64Array, dofs: Int32Array) {
    for (let a = 0; a < 12; a++) {
      const r = dofs[a];
      if (r < 0) continue;
      for (let b = 0; b <= a; b++) {
        const c = dofs[b];
        if (c < 0) continue;
        const v = kg[a * 12 + b];
        if (v === 0) continue;
        if (r === c && a !== b) M.add(r, c, 2 * v);
        else M.add(r, c, v);
      }
    }
  }

  /** Lumped (diagonal) mass matrix from translational nodal masses (t). */
  massMatrix(nodeMass: Float64Array): SparseSym {
    const M = new SparseSym(this.nEq);
    nodeMass.forEach((m, node) => {
      if (!m) return;
      for (let d = 0; d < 3; d++) {
        const q = this.eq[node * 6 + d];
        if (q >= 0) M.add(q, q, m);
      }
    });
    return M;
  }

  /** Strain energy ½ uᵀ k u of each element for a displacement vector (6 per node). */
  elementEnergy(disp: Float64Array, el: number): number {
    const ed = this.els[el], e = this.model.elements[el];
    const ug = new Float64Array(12);
    for (let d = 0; d < 6; d++) {
      ug[d] = disp[e.i * 6 + d];
      ug[6 + d] = disp[e.j * 6 + d];
    }
    const ul = toLocalVec(ug, ed.R);
    let s = 0;
    for (let i = 0; i < 12; i++) {
      let r = 0;
      for (let m = 0; m < 12; m++) r += ed.k[i * 12 + m] * ul[m];
      s += ul[i] * r;
    }
    return s / 2;
  }

  /** Work of the axial force N (tension positive) through a mode: −½ uᵀ k_G u, positive when N destabilises. */
  elementGeometricEnergy(disp: Float64Array, el: number, N: number): number {
    if (!N) return 0;
    const ed = this.els[el], e = this.model.elements[el];
    const ug = new Float64Array(12);
    for (let d = 0; d < 6; d++) {
      ug[d] = disp[e.i * 6 + d];
      ug[6 + d] = disp[e.j * 6 + d];
    }
    const ul = toLocalVec(ug, ed.R);
    let kg = localGeometric(e, ed.L, N);
    if (ed.T) kg = congruence(kg, ed.T);
    let s = 0;
    for (let i = 0; i < 12; i++) {
      let r = 0;
      for (let m = 0; m < 12; m++) r += kg[i * 12 + m] * ul[m];
      s += ul[i] * r;
    }
    return -s / 2;
  }

  /**
   * Destabilising energy of an element split by buckling plane: [minor axis (local v, about z), major axis
   * (local w, about y)]. The planes are uncoupled in the geometric stiffness (and in the condensation of releases).
   */
  elementGeometricEnergyAxes(disp: Float64Array, el: number, N: number): [number, number] {
    if (!N) return [0, 0];
    const ed = this.els[el], e = this.model.elements[el];
    const ug = new Float64Array(12);
    for (let d = 0; d < 6; d++) {
      ug[d] = disp[e.i * 6 + d];
      ug[6 + d] = disp[e.j * 6 + d];
    }
    const ul = toLocalVec(ug, ed.R);
    let kg = localGeometric(e, ed.L, N);
    if (ed.T) kg = congruence(kg, ed.T);
    const plane = (dofs: number[]) => {
      let s = 0;
      for (const i of dofs) for (const m of dofs) s += ul[i] * kg[i * 12 + m] * ul[m];
      return -s / 2;
    };
    return [plane([1, 5, 7, 11]), plane([2, 4, 8, 10])];
  }

  /** Elastic bending strain energy of an element by plane, as elementGeometricEnergyAxes: [minor axis, major axis]. */
  elementStrainEnergyAxes(disp: Float64Array, el: number): [number, number] {
    const ed = this.els[el], e = this.model.elements[el];
    const ug = new Float64Array(12);
    for (let d = 0; d < 6; d++) {
      ug[d] = disp[e.i * 6 + d];
      ug[6 + d] = disp[e.j * 6 + d];
    }
    const ul = toLocalVec(ug, ed.R);
    const plane = (dofs: number[]) => {
      let s = 0;
      for (const i of dofs) for (const m of dofs) s += ul[i] * ed.k[i * 12 + m] * ul[m];
      return s / 2;
    };
    return [plane([1, 5, 7, 11]), plane([2, 4, 8, 10])];
  }

  elementLength(el: number) {
    return this.els[el].L;
  }
  elementAxes(el: number) {
    return this.els[el].R;
  }
}
