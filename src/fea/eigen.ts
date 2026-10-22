/**
 * Generalised symmetric eigenproblems K φ = λ B φ, K positive definite (factorised), B symmetric (mass, or −K_G for
 * buckling): the m eigenpairs with the smallest positive λ (largest μ = 1/λ).
 */
import { SkylineMatrix } from './skyline';

/** Eigen-decomposition of a small symmetric matrix (cyclic Jacobi). Returns values and column eigenvectors. */
export function jacobiEigen(Ain: number[][]): { values: number[]; vectors: number[][] } {
  const n = Ain.length;
  const A = Ain.map((r) => r.slice());
  const V: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
    if (off < 1e-30) break;
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-300) continue;
        const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = A[k][p], akq = A[k][q];
          A[k][p] = c * akp - s * akq;
          A[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p][k], aqk = A[q][k];
          A[p][k] = c * apk - s * aqk;
          A[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k][p], vkq = V[k][q];
          V[k][p] = c * vkp - s * vkq;
          V[k][q] = s * vkp + c * vkq;
        }
      }
  }
  return { values: A.map((r, i) => r[i]), vectors: V };
}

/**
 * Eigen-decomposition of a symmetric tridiagonal matrix (diagonal d, off-diagonal e) by the implicit QL method
 * (tql2). Returns values and column eigenvectors (vectors[row][col]).
 */
export function tridiagEigen(dIn: number[], eIn: number[]): { values: number[]; vectors: number[][] } {
  const n = dIn.length;
  const d = dIn.slice(), e = [...eIn, 0];
  const z: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let l = 0; l < n; l++) {
    let iter = 0;
    for (;;) {
      let m = l;
      for (; m < n - 1; m++) {
        const dd = Math.abs(d[m]) + Math.abs(d[m + 1]);
        if (Math.abs(e[m]) <= 1e-15 * dd) break;
      }
      if (m === l || iter++ > 60) break;
      let g = (d[l + 1] - d[l]) / (2 * e[l]);
      let r = Math.hypot(g, 1);
      g = d[m] - d[l] + e[l] / (g + (g >= 0 ? r : -r));
      let s = 1, c = 1, p = 0;
      let i = m - 1;
      for (; i >= l; i--) {
        let f = s * e[i];
        const b = c * e[i];
        r = Math.hypot(f, g);
        e[i + 1] = r;
        if (r === 0) {
          d[i + 1] -= p;
          e[m] = 0;
          break;
        }
        s = f / r;
        c = g / r;
        g = d[i + 1] - p;
        r = (d[i] - g) * s + 2 * c * b;
        p = s * r;
        d[i + 1] = g + p;
        g = c * r - b;
        for (let k = 0; k < n; k++) {
          f = z[k][i + 1];
          z[k][i + 1] = s * z[k][i] + c * f;
          z[k][i] = c * z[k][i] - s * f;
        }
      }
      if (r === 0 && i >= l) continue;
      d[l] -= p;
      e[l] = g;
      e[m] = 0;
    }
  }
  return { values: d, vectors: z };
}

export interface EigenResult {
  /** λ in ascending order (only positive values). */
  values: number[];
  /** Eigenvectors (length n each, normalised to unit maximum component). */
  vectors: Float64Array[];
  iterations: number;
  converged: boolean;
}

/** Deterministic pseudo-random numbers (mulberry32) for repeatable starting vectors. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296 - 0.5;
  };
}

/**
 * Lanczos method with full reorthogonalisation for K φ = λ B φ (K positive definite, B symmetric and possibly
 * indefinite), on the operator K⁻¹B, self-adjoint in the K inner product. Both ends of the spectrum of μ = 1/λ
 * converge quickly; the m eigenpairs with the smallest positive λ are returned. Clustered eigenvalues (the near
 * identical lateral buckling modes of the two top chords) are resolved by the full reorthogonalisation.
 */
export function lanczos(
  K: SkylineMatrix,
  Kmul: (x: Float64Array, y: Float64Array) => void,
  Bmul: (x: Float64Array, y: Float64Array) => void,
  m: number,
  opts: { start?: Float64Array; maxSteps?: number; tol?: number } = {}
): EigenResult {
  const n = K.n;
  const maxSteps = Math.min(n, opts.maxSteps ?? Math.max(60, 12 * m + 40));
  const tol = opts.tol ?? 1e-8;
  const rand = rng(987);
  const Q: Float64Array[] = []; // K-orthonormal Lanczos vectors
  const KQ: Float64Array[] = []; // K q_i
  const alpha: number[] = [], beta: number[] = [];
  let r = new Float64Array(n);
  for (let i = 0; i < n; i++) r[i] = rand() + (opts.start ? opts.start[i] : 0);
  const Kr = new Float64Array(n);
  const Bq = new Float64Array(n);
  let result: EigenResult = { values: [], vectors: [], iterations: 0, converged: false };
  const ritz = (k: number) => tridiagEigen(alpha.slice(0, k), beta.slice(0, k - 1));
  for (let j = 0; j < maxSteps; j++) {
    // normalise r in the K norm (reorthogonalising twice against the previous vectors)
    for (let pass = 0; pass < 2; pass++)
      for (let i = 0; i < Q.length; i++) {
        let c = 0;
        const z = KQ[i];
        for (let t = 0; t < n; t++) c += r[t] * z[t];
        if (c) {
          const q = Q[i];
          for (let t = 0; t < n; t++) r[t] -= c * q[t];
        }
      }
    Kmul(r, Kr);
    let b = 0;
    for (let t = 0; t < n; t++) b += r[t] * Kr[t];
    b = Math.sqrt(Math.max(0, b));
    if (j > 0) beta.push(b);
    if (b < 1e-14 * (Math.abs(alpha[0] ?? 1) || 1)) {
      // invariant subspace: restart with a new random vector
      if (j === 0) break;
      for (let i = 0; i < n; i++) r[i] = rand();
      beta[beta.length - 1] = 0;
      for (let pass = 0; pass < 2; pass++)
        for (let i = 0; i < Q.length; i++) {
          let c = 0;
          for (let t = 0; t < n; t++) c += r[t] * KQ[i][t];
          for (let t = 0; t < n; t++) r[t] -= c * Q[i][t];
        }
      Kmul(r, Kr);
      b = 0;
      for (let t = 0; t < n; t++) b += r[t] * Kr[t];
      b = Math.sqrt(b);
    }
    const q = r.map((v) => v / b);
    const kq = Kr.map((v) => v / b);
    Q.push(q);
    KQ.push(kq);
    // w = K⁻¹ B q
    Bmul(q, Bq);
    let a = 0;
    for (let t = 0; t < n; t++) a += q[t] * Bq[t];
    alpha.push(a);
    r = K.solve(Float64Array.from(Bq));

    // check convergence every few steps once there are enough vectors
    const k = Q.length;
    if ((k >= 2 * m + 4 && k % 5 === 0) || k === maxSteps || k === n) {
      // residual of each Ritz pair ≈ β_k |s_k|, with β_k the norm of the next Lanczos vector
      const rr = Float64Array.from(r);
      for (let pass = 0; pass < 2; pass++)
        for (let i = 0; i < k; i++) {
          let c = 0;
          for (let t = 0; t < n; t++) c += rr[t] * KQ[i][t];
          for (let t = 0; t < n; t++) rr[t] -= c * Q[i][t];
        }
      const Krr = new Float64Array(n);
      Kmul(rr, Krr);
      let bk = 0;
      for (let t = 0; t < n; t++) bk += rr[t] * Krr[t];
      bk = Math.sqrt(Math.max(0, bk));
      const { values, vectors } = ritz(k);
      const idx = values.map((_, i) => i).filter((i) => values[i] > 0).sort((x, y) => values[y] - values[x]).slice(0, m);
      const done = idx.length >= Math.min(m, k) && idx.every((i) => bk * Math.abs(vectors[k - 1][i]) <= tol * Math.abs(values[i]) * 1e3 || bk * Math.abs(vectors[k - 1][i]) < 1e-10);
      if (done || k === maxSteps || k === n) {
        result = {
          values: idx.map((i) => 1 / values[i]),
          vectors: idx.map((i) => {
            const v = new Float64Array(n);
            for (let c = 0; c < k; c++) {
              const s = vectors[c][i];
              const qc = Q[c];
              for (let t = 0; t < n; t++) v[t] += s * qc[t];
            }
            let mx = 0;
            for (let t = 0; t < n; t++) if (Math.abs(v[t]) > Math.abs(mx)) mx = v[t];
            return v.map((x) => x / (mx || 1));
          }),
          iterations: k,
          converged: done
        };
        break;
      }
    }
  }
  return result;
}
