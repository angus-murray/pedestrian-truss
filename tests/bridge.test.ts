import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAnalysis, dynamicResponseFactor } from '../src/model/analysis';
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

test('stringer deflection relative to the cross girders matches 5wL⁴/384EI', () => {
  const inp = { ...DEFAULT_INPUT, deckType: 'frp' as const, deckThickness: 38, deckDensity: 6, stringerCount: 4, chordsSupportDeck: false };
  const { model: m, results: r } = runAnalysis(inp);
  const s = r.sls.find((x) => x.stringer)!.stringer!;
  const st = m.members.find((x) => x.group === 'stringer')!;
  const w = inp.pedestrian * inp.stringerSpacing, L = m.geo.a;
  const exact = (5 * w * L ** 4) / (384 * 200e6 * st.sp.Ix * 1e-12);
  assert.ok(Math.abs(s.maxRel / exact - 1) < 0.02, `${s.maxRel} vs ${exact}`);
  assert.equal(s.limit, L / inp.deflLimit);
  // deck soffit at the cross girder top, stringer tops level with it
  assert.equal(m.geo.deckSoffit, m.geo.cgTop);
  assert.ok(Math.abs(m.geo.zST + m.geo.dST / 2 - m.geo.cgTop) < 1e-9);
});

test('vertical vibration to AS 5100.2 Cl. 13.4', () => {
  // Ψ fits as the vibration spreadsheet: δ = 0.03 at 41.5 m
  assert.ok(Math.abs(dynamicResponseFactor(41.5, 0.03) - (0.991 + 0.432 * 41.5 - 0.00294 * 41.5 ** 2)) < 1e-9);
  assert.ok(Math.abs(dynamicResponseFactor(30, 0.035) - (dynamicResponseFactor(30, 0.03) + dynamicResponseFactor(30, 0.04)) / 2) < 1e-9);
  const v = results.vibration!;
  assert.ok(v.f0! > 0 && v.y > 0);
  assert.ok(Math.abs(v.a - 4 * Math.PI ** 2 * v.f0! ** 2 * v.y * v.psi) < 1e-12);
  assert.ok(Math.abs(v.limit - 0.25 * v.f0! ** 0.78) < 1e-12);
  // y close to the simply supported chord estimate PL³/48EI (web deformation adds a little)
  const A = model.members.find((m) => m.group === 'topChord')!.sp.A * 1e-6;
  // two trusses, each with chords of area A at ± h/2: I = 2 × A (h/2)² × 2 = A h²
  const est = (0.7 * DEFAULT_INPUT.span ** 3) / (48 * 200e6 * A * DEFAULT_INPUT.depth ** 2);
  assert.ok(v.y > est && v.y < 1.3 * est, `${v.y} vs ${est}`);
});
