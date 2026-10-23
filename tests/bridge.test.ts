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

test('stringers outside the cross girders are an input error, not a mechanism', async () => {
  const { buildModel } = await import('../src/model/build');
  const m = buildModel({ ...DEFAULT_INPUT, stringerCount: 5, stringerSpacing: 0.9 });
  assert.equal(m.errors.length, 1);
  const r = runAnalysis({ ...DEFAULT_INPUT, stringerCount: 5, stringerSpacing: 0.9 }).results;
  assert.ok(r.errors[0].includes('outside the cross girders'));
  assert.equal(buildModel({ ...DEFAULT_INPUT, stringerCount: 5, stringerSpacing: 0.7 }).errors.length, 0);
});

test('horizontal deflection under SLS wind: midspan average of the top and bottom chords', () => {
  const ci = results.combos.findIndex((c) => c.type === 'SLS' && c.factors.W !== 0);
  const h = results.sls.find((s) => s.combo === ci)!.horizontal!;
  assert.ok(h.top > 0 && h.bottom > 0);
  assert.ok(Math.abs(h.value - (h.top + h.bottom) / 2) < 1e-12);
  assert.equal(h.limit, DEFAULT_INPUT.span / DEFAULT_INPUT.latDeflLimit);
  // only combinations with wind are checked
  assert.ok(results.sls.filter((s) => results.combos[s.combo].factors.W === 0).every((s) => s.horizontal === null));
});

test('default ULS combinations: pedestrian 1.5 (Table 8.3), barrier 1.8 with SLS pedestrian (Table 12.5, Cl. 12.5), barrier load 0.75 kN/m', async () => {
  const { DEFAULT_COMBOS } = await import('../src/model/types');
  const ped = DEFAULT_COMBOS.find((c) => c.type === 'ULS' && c.q > 0 && c.b === 0)!;
  const bar = DEFAULT_COMBOS.find((c) => c.type === 'ULS' && c.b > 0)!;
  assert.equal(ped.q, 1.5);
  assert.equal(bar.b, 1.8);
  assert.equal(bar.q, 1.0);
  assert.equal(DEFAULT_INPUT.barrier, 0.75);
});

test('buckling analysis method: N_om for each axis, top chord in-plane from its Euler load (k = 1)', () => {
  const tc = results.design.filter((d) => model.members[d.member].group === 'topChord' && d.comp).reduce((a, d) => (d.util > a.util ? d : a));
  const m = model.members[tc.member];
  // the top chord buckles laterally (minor axis) in mode 1; in plane its nodes are braced by the triangulation
  assert.equal(tc.modeMinor, 1);
  assert.equal(tc.fallbackMajor, 'euler');
  const euler = (Math.PI ** 2 * 200000 * m.sp.Ix) / (m.length * 1000) ** 2 / 1000;
  assert.ok(Math.abs(tc.compMajor!.Nom / euler - 1) < 1e-6);
  assert.ok(tc.compMinor!.Nom < tc.compMajor!.Nom);
  assert.equal(tc.comp, tc.compMinor);
  // no qualifying mode: never below the member's pin-ended Euler load
  for (const d of results.design) {
    if (!d.compMajor || !d.compMinor) continue;
    const sp = model.members[d.member].sp, Lm = model.members[d.member].length * 1000;
    if (d.modeMajor === null) assert.ok(d.compMajor.Nom >= (Math.PI ** 2 * 200000 * sp.Ix) / Lm ** 2 / 1000 - 1e-6);
    if (d.modeMinor === null) assert.ok(d.compMinor.Nom >= (Math.PI ** 2 * 200000 * sp.Iy) / Lm ** 2 / 1000 - 1e-6);
  }
});

test('precamber: hog for the permanent loads at the bottom chord panel points, limit span / 300', () => {
  const p = results.precamber!;
  assert.equal(p.ordinates.length, model.bottomNodes[0].length);
  assert.ok(Math.abs(p.ordinates[0].dz) < 1e-6, 'zero at the supports');
  const mid = p.ordinates[Math.floor(p.ordinates.length / 2)];
  assert.ok(Math.abs(mid.dz - p.max) < 1e-9, 'largest at midspan');
  assert.ok(Math.abs(p.limit - DEFAULT_INPUT.span / 300) < 1e-12);
});

test('vertical vibration: f0 and the acceleration do not depend on the pedestrian mass for the natural frequencies', () => {
  const withQ = runAnalysis({ ...DEFAULT_INPUT, restraintPct: 0, modalQ: 50 }).results;
  assert.ok(Math.abs(withQ.vibration!.f0! / results.vibration!.f0! - 1) < 1e-6);
  assert.ok(Math.abs(withQ.vibration!.a / results.vibration!.a - 1) < 1e-6);
  // the natural frequencies themselves include the pedestrian mass
  assert.ok(withQ.modal.freqs[0] < results.modal.freqs[0]);
});

test('web members wider than the chords are flagged', async () => {
  const { webWidthWarning } = await import('../src/model/build');
  assert.equal(webWidthWarning(DEFAULT_INPUT), null);
  const wide = { ...DEFAULT_INPUT, sections: { ...DEFAULT_INPUT.sections, vertical: { ...DEFAULT_INPUT.sections.vertical, name: '300×300×8.0 SHS' } } };
  assert.match(webWidthWarning(wide) ?? '', /verticals \(300 mm\)/);
  // a Warren truss has no verticals
  assert.equal(webWidthWarning({ ...wide, trussType: 'warren' }), null);
});

test('stringers carry no axial force: their nodes are not shared with the plan bracing', () => {
  const inp = { ...DEFAULT_INPUT, stringerCount: 3, stringerSpacing: 0.9, restraintPct: 2.5 };
  const r = runAnalysis(inp);
  for (const m of r.model.members.filter((x) => x.group === 'stringer'))
    for (const sf of r.results.forces) for (let s = 0; s < m.stations.length; s++) assert.ok(Math.abs(sf[m.id][s * 6]) < 1e-3, `${m.name} N = ${sf[m.id][s * 6]}`);
});

test('optimiser keeps the section types and the web members within the chord widths', async () => {
  const { optimiseSections } = await import('../src/model/optimise');
  const { transverseWidth } = await import('../src/model/build');
  const r = optimiseSections(DEFAULT_INPUT);
  for (const g of Object.keys(r.sections) as (keyof typeof r.sections)[]) assert.equal(r.sections[g].category, DEFAULT_INPUT.sections[g].category);
  const chord = Math.min(transverseWidth(r.sections.topChord, 'chord'), transverseWidth(r.sections.bottomChord, 'chord'));
  assert.ok(transverseWidth(r.sections.vertical, 'web') <= chord + 1e-6);
  assert.ok(transverseWidth(r.sections.diagonal, 'web') <= chord + 1e-6);
  assert.ok(Object.values(r.governs).length > 0);
});

test('slenderness limit of the truss members: L/r ≤ 300 (AISC 360-16 D1)', async () => {
  const { sectionsOf } = await import('../src/data/sections');
  const small = sectionsOf('SHS').slice().sort((a, b) => a.massPerMetre - b.massPerMetre)[0].name;
  const inp = { ...DEFAULT_INPUT, sections: { ...DEFAULT_INPUT.sections, diagonal: { ...DEFAULT_INPUT.sections.diagonal, name: small } } };
  const r = runAnalysis(inp);
  const d = r.results.design.find((x) => r.model.members[x.member].group === 'diagonal')!;
  const m = r.model.members[d.member];
  const it = d.items.find((x) => x.key === 'Lr')!;
  assert.ok(Math.abs(it.action - (m.length * 1000) / Math.min(m.sp.rx, m.sp.ry)) < 1e-9);
  assert.equal(it.capacity, 300);
  // not applied to the cross girders, stringers or bracing
  const cg = r.results.design.find((x) => r.model.members[x.member].group === 'crossGirder')!;
  assert.ok(!cg.items.some((x) => x.key === 'Lr'));
});

test('semi-rigid joints: the springs soften the structure; AS 5100.6 welded joints by default', () => {
  const lam = (jointModel: 'rigid' | 'ec3' | 'flex' | 'as5100', f = 0) => runAnalysis({ ...DEFAULT_INPUT, restraintPct: 0, jointModel, uFrameJointFlex: f }).results.buckling[0].values[0];
  const rigid = lam('rigid');
  // the default is AS 5100.6 Cl. 5.6.3 (c), welded: f = 0.1 × 10⁻¹⁰ rad/Nmm = 0.01 mrad/kNm
  assert.equal(DEFAULT_INPUT.jointModel, 'as5100');
  assert.ok(Math.abs(lam('as5100') - lam('flex', 0.01)) < 1e-9);
  assert.ok(Math.abs(results.buckling[0].values[0] - lam('as5100')) < 1e-9);
  const ec3 = lam('ec3'), flex = lam('flex', 1);
  assert.ok(ec3 < rigid && flex < ec3, `${rigid} ${ec3} ${flex}`);
  // f = 0 is rigid
  assert.ok(Math.abs(lam('flex', 0) - rigid) < 1e-9);
});
