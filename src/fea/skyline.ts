/**
 * Symmetric positive definite matrix in variable-band (envelope) storage, factorised in place by Cholesky
 * (Jennings' method). Row i holds the entries from its first non-zero column first[i] up to the diagonal.
 */
export class SkylineMatrix {
  readonly n: number;
  readonly first: Int32Array;
  readonly start: Int32Array;
  readonly data: Float64Array;
  factored = false;

  /** first[i]: the lowest column index coupled to row i (≤ i). */
  constructor(first: Int32Array) {
    this.n = first.length;
    this.first = first;
    this.start = new Int32Array(this.n + 1);
    for (let i = 0; i < this.n; i++) this.start[i + 1] = this.start[i] + (i - first[i] + 1);
    this.data = new Float64Array(this.start[this.n]);
  }

  /** Adds v to entry (i, j) of the lower triangle (i ≥ j). */
  add(i: number, j: number, v: number) {
    if (j > i) [i, j] = [j, i];
    this.data[this.start[i] + j - this.first[i]] += v;
  }

  get(i: number, j: number): number {
    if (j > i) [i, j] = [j, i];
    if (j < this.first[i]) return 0;
    return this.data[this.start[i] + j - this.first[i]];
  }

  /** y = A x (before factorisation). */
  multiply(x: Float64Array, y: Float64Array = new Float64Array(this.n)): Float64Array {
    y.fill(0);
    const { n, first, start, data } = this;
    for (let i = 0; i < n; i++) {
      const f = first[i], s = start[i] - f;
      let acc = 0;
      for (let j = f; j < i; j++) {
        const a = data[s + j];
        acc += a * x[j];
        y[j] += a * x[i];
      }
      y[i] += acc + data[s + i] * x[i];
    }
    return y;
  }

  /**
   * In-place Cholesky factorisation A = L Lᵀ. Returns the index of the first row whose pivot is not positive (a
   * mechanism or an instability), or -1 on success.
   */
  factor(): number {
    const { n, first, start, data } = this;
    for (let i = 0; i < n; i++) {
      const fi = first[i], si = start[i] - fi;
      for (let j = fi; j <= i; j++) {
        const fj = first[j], sj = start[j] - fj;
        const k0 = Math.max(fi, fj);
        let s = data[si + j];
        for (let k = k0; k < j; k++) s -= data[si + k] * data[sj + k];
        if (j < i) data[si + j] = s / data[sj + j];
        else {
          if (!(s > 0)) return i;
          data[si + i] = Math.sqrt(s);
        }
      }
    }
    this.factored = true;
    return -1;
  }

  /** Solves A x = b in place using the factor. */
  solve(b: Float64Array): Float64Array {
    const { n, first, start, data } = this;
    // forward: L y = b
    for (let i = 0; i < n; i++) {
      const f = first[i], s = start[i] - f;
      let acc = b[i];
      for (let k = f; k < i; k++) acc -= data[s + k] * b[k];
      b[i] = acc / data[s + i];
    }
    // backward: Lᵀ x = y
    for (let i = n - 1; i >= 0; i--) {
      const f = first[i], s = start[i] - f;
      const xi = (b[i] /= data[s + i]);
      for (let k = f; k < i; k++) b[k] -= data[s + k] * xi;
    }
    return b;
  }
}

/** Sparse symmetric matrix (coordinate lists merged per row) for products with the mass or geometric stiffness. */
export class SparseSym {
  readonly n: number;
  private rows: Map<number, number>[];
  private compiled: { idx: Int32Array; val: Float64Array; ptr: Int32Array } | null = null;
  constructor(n: number) {
    this.n = n;
    this.rows = Array.from({ length: n }, () => new Map());
  }
  /** Adds v to (i, j) and (j, i) (once when i = j). */
  add(i: number, j: number, v: number) {
    const r = this.rows[i];
    r.set(j, (r.get(j) ?? 0) + v);
    if (i !== j) {
      const c = this.rows[j];
      c.set(i, (c.get(i) ?? 0) + v);
    }
    this.compiled = null;
  }
  private compile() {
    let nnz = 0;
    for (const r of this.rows) nnz += r.size;
    const idx = new Int32Array(nnz), val = new Float64Array(nnz), ptr = new Int32Array(this.n + 1);
    let p = 0;
    this.rows.forEach((r, i) => {
      for (const [j, v] of r) {
        idx[p] = j;
        val[p++] = v;
      }
      ptr[i + 1] = p;
    });
    this.compiled = { idx, val, ptr };
    return this.compiled;
  }
  multiply(x: Float64Array, y: Float64Array = new Float64Array(this.n)): Float64Array {
    const { idx, val, ptr } = this.compiled ?? this.compile();
    for (let i = 0; i < this.n; i++) {
      let s = 0;
      for (let p = ptr[i]; p < ptr[i + 1]; p++) s += val[p] * x[idx[p]];
      y[i] = s;
    }
    return y;
  }
}
