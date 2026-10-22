import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tridiagEigen, jacobiEigen } from '../src/fea/eigen';

test('tridiagonal QL agrees with Jacobi', () => {
  const d = [2, -1, 3, 0.5, 4, 1], e = [1, 0.5, -2, 0.3, 1.2];
  const T = d.map((_, i) => d.map((_, j) => (i === j ? d[i] : Math.abs(i - j) === 1 ? e[Math.min(i, j)] : 0)));
  const a = tridiagEigen(d, e), b = jacobiEigen(T);
  assert.deepEqual(a.values.slice().sort((x, y) => x - y).map((v) => v.toFixed(9)), b.values.slice().sort((x, y) => x - y).map((v) => v.toFixed(9)));
  // T v = λ v for every pair
  a.values.forEach((lam, k) => {
    for (let i = 0; i < d.length; i++) {
      let s = 0;
      for (let j = 0; j < d.length; j++) s += T[i][j] * a.vectors[j][k];
      assert.ok(Math.abs(s - lam * a.vectors[i][k]) < 1e-9);
    }
  });
});
