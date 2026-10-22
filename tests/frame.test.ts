import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FrameSolver, FEElement, FENode } from '../src/fea/frame';
import { lanczos } from '../src/fea/eigen';

const E = 200e6, G = 80e6;
function column(n: number, L: number) {
  const nodes: FENode[] = Array.from({ length: n + 1 }, (_, i) => ({ x: 0, y: 0, z: (L * i) / n }));
  const elements: FEElement[] = Array.from({ length: n }, (_, i) => ({ i, j: i + 1, E, G, A: 0.01, Iy: 2e-5, Iz: 1e-5, J: 3e-5, ref: [0, 1, 0] }));
  const restraints = nodes.map((_, i) => (i === 0 ? [true, true, true, false, false, true] : i === n ? [true, true, false, false, false, true] : [false, false, false, false, false, false]));
  return { nodes, elements, restraints };
}

test('pin-ended column: Euler load about the weak axis', () => {
  const L = 5, m = column(8, L);
  const s = new FrameSolver(m);
  assert.equal(s.factor(), null);
  const N = new Float64Array(8).fill(-1); // 1 kN compression
  const B = s.negGeometric(N);
  const r = lanczos(s.K, (x, y) => void s.K0.multiply(x, y), (x, y) => void B.multiply(x, y), 2);
  const Pe = (Math.PI ** 2 * E * 1e-5) / L ** 2;
  assert.ok(Math.abs(r.values[0] / Pe - 1) < 0.002, `${r.values[0]} vs ${Pe}`);
  assert.ok(Math.abs(r.values[1] / ((Math.PI ** 2 * E * 2e-5) / L ** 2) - 1) < 0.002, `${r.values[1]}`);
});

test('simply supported beam under UDL: deflection, moment and released ends', () => {
  const L = 6, n = 6;
  const nodes: FENode[] = Array.from({ length: n + 1 }, (_, i) => ({ x: (L * i) / n, y: 0, z: 0 }));
  const elements: FEElement[] = Array.from({ length: n }, (_, i) => ({ i, j: i + 1, E, G, A: 0.01, Iy: 1e-4, Iz: 1e-5, J: 1e-5, ref: [0, 0, 1], relI: i === 0, relJ: i === n - 1 }));
  // ends restrained in translation and torsion only, with rotations held at the end nodes (the releases free the beam)
  const restraints = nodes.map((_, i) => (i === 0 ? [true, true, true, true, true, true] : i === n ? [false, true, true, true, true, true] : [false, false, false, false, false, false]));
  const s = new FrameSolver({ nodes, elements, restraints });
  assert.equal(s.factor(), null);
  const w = 10;
  const lc = { nodal: [], elements: elements.map((_, el) => ({ el, q: [0, 0, -w] as [number, number, number] })) };
  const u = s.expand(s.K.solve(s.loadVector(lc)));
  const mid = u[(n / 2) * 6 + 2];
  const exact = (-5 * w * L ** 4) / (384 * E * 1e-4);
  assert.ok(Math.abs(mid / exact - 1) < 1e-6, `${mid} vs ${exact}`);
  const f = s.endForces(n / 2, u, [0, 0, -w]);
  const My = -f[4]; // internal moment at i of the element starting at midspan
  assert.ok(Math.abs(Math.abs(My) - (w * L * L) / 8) < 1e-6, `${My}`);
  const f0 = s.endForces(0, u, [0, 0, -w]);
  assert.ok(Math.abs(f0[4]) < 1e-6, `released end moment ${f0[4]}`);
});
