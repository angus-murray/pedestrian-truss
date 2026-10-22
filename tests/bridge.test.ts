import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAnalysis } from '../src/model/analysis';
import { DEFAULT_INPUT } from '../src/model/types';

const { model, results } = runAnalysis({ ...DEFAULT_INPUT, restraintPct: 0 });
const caseForce = (name: string, combo: number) => {
  const m = model.members.find((x) => x.name === name)!;
  const sf = results.forces[combo][m.id];
  return sf[Math.floor(sf.length / 12) * 6]; // N near mid-length
};

test('midspan chord forces match the simple beam moment / truss depth', () => {
  // SLS "Pedestrian" combination: Q only, 5 kPa on 3.0 m, shared by two trusses
  const ci = results.combos.findIndex((c) => c.type === 'SLS' && c.deflection);
  const w = (DEFAULT_INPUT.pedestrian * DEFAULT_INPUT.clearWidth) / 2;
  const L = DEFAULT_INPUT.span, h = DEFAULT_INPUT.depth;
  const M = (x: number) => (w * x * (L - x)) / 2;
  // Pratt: top chord panel 6 takes the moment at midspan (node 6), bottom chord panel 6 the moment at node 5
  const tc = caseForce('TC6A', ci), bc = caseForce('BC6A', ci);
  assert.ok(Math.abs(-tc / (M(L / 2) / h) - 1) < 0.05, `top chord ${tc} vs ${-M(L / 2) / h}`);
  assert.ok(Math.abs(bc / (M(L / 2 - L / 12) / h) - 1) < 0.05, `bottom chord ${bc} vs ${M(L / 2 - L / 12) / h}`);
});

test('midspan deflection is close to the truss estimate and buckling factors exceed 1', () => {
  assert.equal(results.errors.length, 0);
  for (const b of results.buckling) assert.ok(b.values[0] > 1);
  // frequencies are positive and ordered
  const f = results.modal.freqs;
  for (let i = 1; i < f.length; i++) assert.ok(f[i] >= f[i - 1] - 1e-9);
  // flexural deflection of the chords alone, 5wL⁴/(384 E I_eff), I_eff = 2 A (h/2)²
  const A = model.members.find((m) => m.group === 'topChord')!.sp.A * 1e-6;
  const w = (DEFAULT_INPUT.pedestrian * DEFAULT_INPUT.clearWidth) / 2;
  const I = 2 * A * (DEFAULT_INPUT.depth / 2) ** 2;
  const est = (5 * w * DEFAULT_INPUT.span ** 4) / (384 * 200e6 * I);
  const sls = results.sls.find((s) => s.limit !== null)!;
  // web and shear deformation add to the chord-only estimate
  assert.ok(sls.maxVert > est && sls.maxVert < 1.6 * est, `${sls.maxVert} vs ${est}`);
});
