import React, { useMemo, useState } from 'react';
import { Banner, Cols, Dash, PassFail, ResultsHeader, StatusChip, UtilValue, pct } from 'engineering-ui';
import { ChevronDown } from 'lucide-react';
import type { BridgeModel } from '../model/build';
import type { SolverError } from '../model/useAnalysis';
import { comboLabel, bucklingLabel, uFrameLength, type AnalysisResults, type MemberDesign, type PrecamberResult } from '../model/analysis';
import { GROUP_INFO, GROUPS, type BridgeInput, type GroupKey } from '../model/types';

const S: React.FC<{ s: string; sub?: string }> = ({ s, sub }) => (
  <>
    <i>{s}</i>
    {sub && <sub>{sub}</sub>}
  </>
);
const f0 = (v: number) => (Math.abs(v) < 0.5 ? '0' : v.toFixed(0).replace('-', '−'));
const f1 = (v: number) => v.toFixed(1).replace('-', '−');
const f2 = (v: number) => v.toFixed(2).replace('-', '−');

export interface Summary {
  maxUtil: number;
  failing: { name: string; util: number }[];
  deflOk: boolean;
  vibOk: boolean;
  lambdaMin: number | null;
  fVert: number | null;
  fLat: number | null;
  dynWarnings: string[];
}

export function summarise(model: BridgeModel, r: AnalysisResults, input: BridgeInput): Summary {
  const maxUtil = r.design.reduce((m, d) => Math.max(m, d.util), 0);
  const failing = r.design.filter((d) => d.util > 1 + 1e-9).sort((a, b) => b.util - a.util).map((d) => ({ name: model.members[d.member].name, util: d.util }));
  const deflOk = r.sls.every(
    (s) =>
      (s.limit === null || s.maxVert <= s.limit + 1e-9) &&
      (!s.stringer || s.stringer.maxRel <= s.stringer.limit + 1e-9) &&
      (!s.horizontal || s.horizontal.value <= s.horizontal.limit + 1e-9)
  ) && (!r.precamber || r.precamber.ok);
  const lambdaMin = r.buckling.reduce<number | null>((m, b) => (b.values.length ? Math.min(m ?? Infinity, b.values[0]) : m), null);
  const v = r.vibration;
  const fv = v?.f0 ?? null, fl = v?.fLat ?? null;
  const vibOk = !v || v.ok;
  const dynWarnings: string[] = [];
  if (v && !v.latOk)
    dynWarnings.push(`The first lateral frequency (${fl!.toFixed(2)} Hz) is below ${input.freqLatMin} Hz: special consideration of lateral excitation by pedestrians is required (AS 5100.2 Cl. 13.4.1).`);
  return { maxUtil, failing, deflOk, vibOk, lambdaMin, fVert: fv, fLat: fl, dynWarnings };
}

export const Results: React.FC<{
  model: BridgeModel;
  input: BridgeInput;
  results: AnalysisResults | null;
  stale: boolean;
  solving: boolean;
  error: SolverError | null;
  selected: number | null;
  onSelect: (id: number | null) => void;
}> = ({ model, input, results, stale, solving, error, selected, onSelect }) => {
  const r = results;
  const sum = useMemo(() => (r && !r.errors.length ? summarise(model, r, input) : null), [model, r, input]);
  const warnings = [...model.warnings, ...(r?.warnings.filter((w) => !model.warnings.includes(w)) ?? []), ...(sum?.dynWarnings ?? [])];
  let chip: React.ReactNode;
  if (solving) chip = <StatusChip kind="neutral">Solving…</StatusChip>;
  else if (!r) chip = <StatusChip kind="neutral">{stale ? 'Inputs Changed — click Solve to update' : 'Not Solved — click Solve to run the analysis'}</StatusChip>;
  else if (r.errors.length || !sum) chip = <StatusChip kind="fail">Analysis Error</StatusChip>;
  else {
    const pass = !sum.failing.length && sum.deflOk && sum.vibOk;
    chip = pass ? (
      <StatusChip kind="pass">Implemented Checks Satisfied (Max Util: {pct(sum.maxUtil)})</StatusChip>
    ) : (
      <StatusChip kind="fail">
        Checks Not Satisfied ({[...sum.failing.slice(0, 3).map((f) => `${f.name} ${pct(f.util)}`), ...(sum.deflOk ? [] : ['Deflection']), ...(sum.vibOk ? [] : ['Vibration'])].join(', ')}
        {sum.failing.length > 3 ? ', …' : ''})
      </StatusChip>
    );
  }

  return (
    <>
      <section className="panel">
        <ResultsHeader>
          {warnings.length > 0 && <StatusChip kind="warn">{warnings.length} warning{warnings.length > 1 ? 's' : ''}</StatusChip>}
          {chip}
        </ResultsHeader>
        {model.errors.length > 0 && <Banner kind="error" title="Input errors" items={model.errors} />}
        {error && (
          <Banner kind="error" title="Solver error">
            {error.message}
            {error.reload && (
              <div className="mt-2">
                <button type="button" className="btn !h-7" onClick={() => window.location.reload()}>
                  Reload
                </button>
              </div>
            )}
          </Banner>
        )}
        {r && r.errors.length > 0 && <Banner kind="error" title="Analysis errors" items={r.errors} />}
        {warnings.length > 0 && <Banner kind="warning" title="Warnings" items={warnings} />}
        {r && sum && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label="Max Utilisation" value={pct(sum.maxUtil)} bad={sum.maxUtil > 1} />
              <Stat label={<>Lowest Buckling Factor <S s="λ" sub="c" /></>} value={sum.lambdaMin !== null ? sum.lambdaMin.toFixed(2) : '—'} bad={(sum.lambdaMin ?? 0) < 1} />
              <Stat label="First Vertical Frequency" value={sum.fVert !== null ? `${sum.fVert.toFixed(2)} Hz` : '—'} bad={!sum.vibOk} />
              <Stat label="Steel Mass" value={`${model.steelMass.toFixed(2)} t`} />
            </div>
            <GoverningTable model={model} r={r} onSelect={onSelect} />
          </>
        )}
      </section>
      {r && sum && selected !== null && r.design[selected] && <MemberDetail model={model} r={r} d={r.design[selected]} onClose={() => onSelect(null)} />}
      {r && sum && (
        <>
          <ServiceabilityPanel model={model} r={r} input={input} />
          <BucklingPanel model={model} r={r} />
          <AllMembers model={model} r={r} onSelect={onSelect} selected={selected} />
        </>
      )}
    </>
  );
};

const Stat: React.FC<{ label: React.ReactNode; value: string; bad?: boolean; warn?: boolean }> = ({ label, value, bad, warn }) => (
  <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
    <div className="text-[11px] font-medium text-slate-600">{label}</div>
    <div className={`text-sm font-semibold tabular-nums ${bad ? 'text-rose-700' : warn ? 'text-amber-800' : 'text-slate-800'}`}>{value}</div>
  </div>
);

const GoverningTable: React.FC<{ model: BridgeModel; r: AnalysisResults; onSelect: (id: number) => void }> = ({ model, r, onSelect }) => {
  const rows = GROUPS.map((g) => {
    const ds = r.design.filter((d) => model.members[d.member].group === g);
    if (!ds.length) return null;
    return { g, d: ds.reduce((a, b) => (b.util > a.util ? b : a)) };
  }).filter(Boolean) as { g: GroupKey; d: MemberDesign }[];
  return (
    <div>
      <h3 className="card-title mb-1">Governing Member of Each Group (ULS)</h3>
      <div className="overflow-x-auto">
        <table className="rtable min-w-[760px]">
          <Cols w={[11, 7, 15, 17, 17, 10, 10, 13]} />
          <thead>
            <tr>
              <th>Group</th>
              <th>Member</th>
              <th>Section</th>
              <th>Governing Check</th>
              <th>Combination</th>
              <th><S s="N" />* (kN)</th>
              <th><S s="M" />*<sub>x</sub> (kNm)</th>
              <th>Utilisation</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ g, d }) => {
              const m = model.members[d.member];
              return (
                <tr key={g} className="cursor-pointer" onClick={() => onSelect(m.id)}>
                  <td>{GROUP_INFO[g].label}</td>
                  <td className="font-medium text-blue-700">{m.name}</td>
                  <td>{m.sp.def.name}</td>
                  <td>{d.governing}</td>
                  <td className="truncate" title={d.combo >= 0 ? comboLabel(r.combos[d.combo]) : ''}>{d.combo >= 0 ? comboLabel(r.combos[d.combo]) : <Dash />}</td>
                  <td>{f0(d.N)}</td>
                  <td>{f1(d.Mx)}</td>
                  <td>
                    <UtilValue value={d.util} highlight />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500 mt-1">Click a row or a member in the 3D view for its design checks. <S s="N" />* positive in tension.</p>
    </div>
  );
};

/** Where a member end is: the node position along the span and its level. */
function endLabel(model: BridgeModel, m: BridgeModel['members'][number], end: 0 | 1): string {
  const p = end ? m.b : m.a;
  return `x = ${p[0].toFixed(2)} m, z = ${p[2].toFixed(2)} m`;
}

/** End condition of a member as analysed: from the releases and springs of its end element. */
function endCondition(model: BridgeModel, m: BridgeModel['members'][number], end: 0 | 1): string {
  const e = model.fe.elements[end ? m.elements[m.elements.length - 1] : m.elements[0]];
  const released = end ? e.relJ : e.relI;
  const spring = end ? e.springJ : e.springI;
  const axial = end && e.relAxialJ ? ', axial released' : '';
  if (released) return `Pinned (bending released${axial})`;
  if (spring) {
    const k = (v: number) => Math.round(v).toLocaleString('en-AU');
    return `Semi-rigid, k = ${k(spring[0])} / ${k(spring[1])} kNm/rad (major / minor)${axial}`;
  }
  return `Rigid${axial}`;
}

const MemberDetail: React.FC<{ model: BridgeModel; r: AnalysisResults; d: MemberDesign; onClose: () => void }> = ({ model, r, d, onClose }) => {
  const m = model.members[d.member];
  const sp = m.sp;
  const comp = d.comp;
  const uf = d.leMethod === 'U-Frame' ? uFrameLength(model) : null;
  return (
    <section className="panel">
      <div className="panel-header">
        <h2 className="text-[13px] font-bold text-slate-800">
          Member {m.name} — {GROUP_INFO[m.group].label}, {sp.def.name} {sp.spec.grade}
        </h2>
        <button type="button" className="text-slate-400 hover:text-slate-700 text-lg leading-none px-1" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-2">
          <h3 className="card-title">Section and Member</h3>
          <table className="rtable">
            <Cols w={[55, 45]} />
            <tbody>
              <KV k="Length" v={`${m.length.toFixed(3)} m`} />
              <KV k={<><S s="A" sub="g" /></>} v={`${f0(sp.A)} mm²`} />
              <KV k={<><S s="I" sub="x" /> / <S s="I" sub="y" /></>} v={`${(sp.Ix / 1e6).toFixed(1)} / ${(sp.Iy / 1e6).toFixed(1)} × 10⁶ mm⁴`} />
              <KV k={<><S s="f" sub="y" /> / <S s="k" sub="f" /></>} v={`${sp.fy} MPa / ${sp.kf.toFixed(3)}`} />
              <KV k={<><S s="Z" sub="ex" /> / <S s="Z" sub="ey" /></>} v={`${f0(sp.Zex / 1e3)} / ${f0(sp.Zey / 1e3)} × 10³ mm³ (${sp.classX}, ${sp.classY})`} />
              <KV k={<><S s="α" sub="b" /></>} v={f2(sp.alphaB)} />
              <KV k={`End at ${endLabel(model, m, 0)}`} v={endCondition(model, m, 0)} />
              <KV k={`End at ${endLabel(model, m, 1)}`} v={endCondition(model, m, 1)} />
              <KV k="Governing Combination" v={d.combo >= 0 ? comboLabel(r.combos[d.combo]) : '—'} />
            </tbody>
          </table>
          {comp && (
            <>
              <h3 className="card-title">Compression Member Capacity (Cl. 6.3.3)</h3>
              <table className="rtable">
                <Cols w={[55, 45]} />
                <tbody>
                  <KV k="Effective Length Method" v={d.leMethod} />
                  {d.leMethod === 'Buckling Analysis' && (
                    <KV
                      k="Buckling Mode Major / Minor"
                      v={([[d.modeMajor, d.fallbackMajor], [d.modeMinor, d.fallbackMinor]] as const)
                        .map(([k, fb]) => (k !== null ? `Mode ${k}` : fb === 'euler' ? 'Euler (k = 1)' : `Above Mode ${r.buckling.find((x) => x.combo === (r.combos[d.combo].base ?? d.combo))?.values.length ?? ''}`))
                        .join(' / ')}
                    />
                  )}
                  {uf && <KV k="U-Frame Flexibility δ" v={`${(uf.delta * 1000).toFixed(3)} mm/kN (d₁ = ${uf.d1.toFixed(3)} m, d₂ = ${uf.d2.toFixed(3)} m${uf.Ld ? `, L_d = ${uf.Ld.toFixed(3)} m` : ''})`} />}
                  {d.compMajor && d.compMinor ? (
                    <KV k={<>Elastic Buckling Load <S s="N" sub="om" /> Major / Minor</>} v={`${f0(d.compMajor.Nom)} / ${f0(d.compMinor.Nom)} kN`} />
                  ) : (
                    <KV k={<>Elastic Buckling Load <S s="N" sub="om" /></>} v={`${f0(comp.Nom)} kN`} />
                  )}
                  <KV k={<><S s="l" sub="e" /> Major / Minor</>} v={`${d.leMajor.toFixed(2)} / ${d.leMinor.toFixed(2)} m (${(d.leMajor / m.length).toFixed(2)}L / ${(d.leMinor / m.length).toFixed(2)}L)`} />
                  <KV k={<><S s="l" sub="e" />/<S s="r" />, <S s="λ" sub="n" /></>} v={`${f1(comp.slenderness)}, ${f1(comp.lambdaN)}`} />
                  <KV k={<><S s="α" sub="c" /></>} v={comp.alphaC.toFixed(3)} />
                  <KV k={<><S s="φN" sub="s" /> / <S s="φN" sub="c" /></>} v={`${f0(comp.phiNs)} / ${f0(comp.phiNc)} kN`} />
                  <KV k={<>Amplification <S s="δ" /></>} v={d.delta.toFixed(3)} />
                </tbody>
              </table>
            </>
          )}
        </div>
        <div className="space-y-2">
          <h3 className="card-title">Design Checks (AS 5100.6)</h3>
          <table className="rtable">
            <Cols w={[33, 14, 19, 19, 15]} />
            <thead>
              <tr>
                <th>Check</th>
                <th>Clause</th>
                <th>Action</th>
                <th>Capacity</th>
                <th>Util.</th>
              </tr>
            </thead>
            <tbody>
              {d.items.map((it) => (
                <tr key={it.key}>
                  <td>{it.label}</td>
                  <td>{it.clause}</td>
                  <td>{it.unit === 'L/r' ? f0(it.action) : it.unit ? `${f1(it.action)} ${it.unit}` : it.action.toFixed(3)}</td>
                  <td>{it.unit === 'L/r' ? f0(it.capacity) : it.unit ? `${f1(it.capacity)}` : <Dash />}</td>
                  <td>
                    <UtilValue value={it.util} highlight={it.label === d.governing} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-slate-500">
            Actions are the largest along the member; <S s="M" />*<sub>x</sub> in the combined member check includes <S s="δ" />. <S s="α" sub="m" /> = {d.alphaM.toFixed(2)}, <S s="φM" sub="bx" /> = {f1(d.phiMbx)} kNm.
          </p>
          <h3 className="card-title">Utilisation by Combination</h3>
          <table className="rtable">
            <Cols w={[70, 30]} />
            <tbody>
              {d.byCombo.map((u, ci) =>
                u === undefined ? null : (
                  <tr key={ci}>
                    <td className="!text-left">{comboLabel(r.combos[ci])}</td>
                    <td>
                      <UtilValue value={u} highlight={ci === d.combo} />
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};

const KV: React.FC<{ k: React.ReactNode; v: React.ReactNode }> = ({ k, v }) => (
  <tr>
    <td className="!text-left text-slate-600">{k}</td>
    <td className="!text-left">{v}</td>
  </tr>
);

const PrecamberTable: React.FC<{ p: PrecamberResult; input: BridgeInput }> = ({ p, input }) => {
  // panel points from the support to midspan (the profile is symmetric for symmetric loads)
  const half = p.ordinates.filter((o) => o.x <= input.span / 2 + 1e-6);
  return (
    <>
      <h3 className="card-title mt-2 mb-1">Precamber (Permanent Loads)</h3>
      <table className="rtable">
        <Cols w={[30, 19, 18, 18, 15]} />
        <thead>
          <tr>
            <th>Check</th>
            <th>Precamber (mm)</th>
            <th>Limit (mm)</th>
            <th>Ratio</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="!text-left">Maximum, Bottom Chord</td>
            <td>{f1(p.max * 1000)}</td>
            <td>{f1(p.limit * 1000)}</td>
            <td>{p.max > 1e-9 ? `L / ${f0(input.span / p.max)}` : <Dash />}</td>
            <td>
              <PassFail pass={p.ok} />
            </td>
          </tr>
        </tbody>
      </table>
      <p className="text-[11px] text-slate-500 mt-1">
        Hog to build in at the bottom chord panel points, so that no sag remains under G1 + G2 (AS 5100.2 Cl. 8.4), limit span / {input.precamberLimit}. From the support to midspan:{' '}
        {half.map((o) => `${f0(o.dz * 1000)}`).join(', ')} mm at {half.map((o) => o.x.toFixed(2)).join(', ')} m.
      </p>
    </>
  );
};

const ServiceabilityPanel: React.FC<{ model: BridgeModel; r: AnalysisResults; input: BridgeInput }> = ({ model, r, input }) => (
  <section className="panel">
    <div className="panel-header">
      <h2 className="text-[13px] font-bold text-slate-800">Serviceability</h2>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <h3 className="card-title mb-1">Deflection</h3>
        <table className="rtable">
          <Cols w={[30, 19, 18, 18, 15]} />
          <thead>
            <tr>
              <th>Combination</th>
              <th>Vertical (mm)</th>
              <th>Lateral (mm)</th>
              <th>Limit (mm)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {r.sls.map((s) => (
              <tr key={s.combo}>
                <td className="!text-left">{comboLabel(r.combos[s.combo])}</td>
                <td>{f1(s.maxVert * 1000)}</td>
                <td>{f1(s.maxLat * 1000)}</td>
                <td>{s.limit !== null ? f1(s.limit * 1000) : <Dash />}</td>
                <td>{s.limit !== null ? <PassFail pass={s.maxVert <= s.limit + 1e-9} /> : <Dash />}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[11px] text-slate-500 mt-1">Vertical deflection of the trusses, limit span / {input.deflLimit}.</p>
        {r.precamber && <PrecamberTable p={r.precamber} input={input} />}
        {r.sls.some((s) => s.horizontal) && (
          <>
            <h3 className="card-title mt-2 mb-1">Horizontal Deflection (Wind)</h3>
            <table className="rtable">
              <Cols w={[26, 15, 15, 15, 15, 14]} />
              <thead>
                <tr>
                  <th>Combination</th>
                  <th>Top Chord (mm)</th>
                  <th>Bottom Chord (mm)</th>
                  <th>Average (mm)</th>
                  <th>Limit (mm)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {r.sls
                  .filter((s) => s.horizontal)
                  .map((s) => {
                    const h = s.horizontal!;
                    return (
                      <tr key={s.combo}>
                        <td className="!text-left">{comboLabel(r.combos[s.combo])}</td>
                        <td>{f1(h.top * 1000)}</td>
                        <td>{f1(h.bottom * 1000)}</td>
                        <td>{f1(h.value * 1000)}</td>
                        <td>{f1(h.limit * 1000)}</td>
                        <td>
                          <PassFail pass={h.value <= h.limit + 1e-9} />
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            <p className="text-[11px] text-slate-500 mt-1">At midspan, the average of the top and bottom chord displacements of each truss (the truss twists under wind); the larger truss is shown. Limit span / {input.latDeflLimit}.</p>
          </>
        )}
        {r.sls.some((s) => s.stringer) && (
          <>
            <h3 className="card-title mt-2 mb-1">Stringer Deflection (Relative to Cross Girders)</h3>
            <table className="rtable">
              <Cols w={[30, 19, 18, 18, 15]} />
              <thead>
                <tr>
                  <th>Combination</th>
                  <th>Deflection (mm)</th>
                  <th>Stringer</th>
                  <th>Limit (mm)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {r.sls
                  .filter((s) => s.stringer)
                  .map((s) => (
                    <tr key={s.combo}>
                      <td className="!text-left">{comboLabel(r.combos[s.combo])}</td>
                      <td>{f1(s.stringer!.maxRel * 1000)}</td>
                      <td>{model.members[s.stringer!.member].name}</td>
                      <td>{f1(s.stringer!.limit * 1000)}</td>
                      <td>
                        <PassFail pass={s.stringer!.maxRel <= s.stringer!.limit + 1e-9} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <p className="text-[11px] text-slate-500 mt-1">Deflection of each stringer span from the line between its supports on the cross girders; limit panel length / {input.deflLimit}.</p>
          </>
        )}
      </div>
      <div>
        <h3 className="card-title mb-1">Natural Frequencies</h3>
        <table className="rtable">
          <Cols w={[16, 22, 30, 32]} />
          <thead>
            <tr>
              <th>Mode</th>
              <th>Frequency (Hz)</th>
              <th>Type</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {r.modal.freqs.map((f, i) => {
              const k = r.modal.kinds[i];
              const first = r.modal.kinds.indexOf(k) === i;
              const flag = first && ((k === 'Vertical' && f < 5) || (k === 'Lateral' && f < input.freqLatMin));
              return (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{f.toFixed(2)}</td>
                  <td>{k}</td>
                  <td>{flag ? <span className="font-semibold text-amber-800">{k === 'Vertical' ? 'Below 5 Hz: check' : 'Special consideration'}</span> : <Dash />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-[11px] text-slate-500 mt-1">
          Mass from G1 and G2{input.modalQ > 0 ? ` and ${input.modalQ}% of the pedestrian load; the vertical vibration check uses f₀ from the permanent mass alone` : ''}.
        </p>
      </div>
    </div>
    {r.vibration && <VibrationTable v={r.vibration} />}
  </section>
);

/** Vertical vibration, AS 5100.2 Cl. 13.4.2. */
const VibrationTable: React.FC<{ v: NonNullable<AnalysisResults['vibration']> }> = ({ v }) => (
  <div>
    <h3 className="card-title mb-1">Vertical Vibration (AS 5100.2 Cl. 13.4)</h3>
    <div className="overflow-x-auto">
      <table className="rtable min-w-[640px]">
        <Cols w={[14, 14, 12, 12, 16, 16, 16]} />
        <thead>
          <tr>
            <th>
              <S s="f" sub="0" /> (Hz)
            </th>
            <th>
              <S s="y" /> (mm)
            </th>
            <th>
              <S s="δ" />
            </th>
            <th>
              <S s="Ψ" />
            </th>
            <th>
              <S s="a" /> (m/s²)
            </th>
            <th>Limit (m/s²)</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{v.f0 !== null ? v.f0.toFixed(2) : <Dash />}</td>
            <td>{(v.y * 1000).toFixed(3)}</td>
            <td>{v.delta.toFixed(2)}</td>
            <td>{v.psi.toFixed(2)}</td>
            <td>{v.required ? v.a.toFixed(3) : <Dash />}</td>
            <td>{v.required ? v.limit.toFixed(3) : <Dash />}</td>
            <td>{v.f0 === null ? <Dash /> : v.required ? <PassFail pass={v.ok} /> : <span className="font-semibold text-emerald-700">Not Required</span>}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p className="text-[11px] text-slate-500 mt-1">
      Required when <S s="f" sub="0" /> &lt; 5 Hz: <S s="a" /> = 4π<sup>2</sup>
      <S s="f" sub="0" />
      <sup>2</sup>
      <S s="y" />
      <S s="Ψ" /> ≤ 0.25<S s="f" sub="0" />
      <sup>0.78</sup>. <S s="f" sub="0" /> is the first vertical mode of the 3D model with the permanent mass alone; <S s="y" /> is its static deflection under a 700 N pedestrian at midspan; <S s="Ψ" /> from Figure 13.4.2 for the span.
    </p>
  </div>
);

const BucklingPanel: React.FC<{ model: BridgeModel; r: AnalysisResults }> = ({ model, r }) => {
  const nCols = Math.min(4, Math.max(...r.buckling.map((b) => b.values.length), 1));
  const dominant = (bi: number, k: number) => {
    const p = r.buckling[bi].participation[k];
    let best = 0;
    for (let i = 1; i < p.length; i++) if (p[i] > p[best]) best = i;
    return model.members[best];
  };
  return (
    <section className="panel">
      <div className="panel-header">
        <h2 className="text-[13px] font-bold text-slate-800">Elastic Buckling (Load Factors <S s="λ" sub="c" />)</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="rtable min-w-[640px]">
          <Cols w={[28, ...Array(nCols).fill(46 / nCols), 26]} />
          <thead>
            <tr>
              <th>Combination</th>
              {Array.from({ length: nCols }, (_, k) => (
                <th key={k}>Mode {k + 1}</th>
              ))}
              <th>Mode 1 Most Strained Member</th>
            </tr>
          </thead>
          <tbody>
            {r.buckling.map((b, bi) => (
              <tr key={bi}>
                <td className="!text-left">{bucklingLabel(r.combos[b.combo])}</td>
                {Array.from({ length: nCols }, (_, k) => (
                  <td key={k} className={k === 0 && b.values[0] < 1 ? 'text-rose-700 font-semibold' : ''}>
                    {b.values[k] !== undefined ? b.values[k].toFixed(2) : <Dash />}
                  </td>
                ))}
                <td>{b.values.length ? `${dominant(bi, 0).name} (${GROUP_INFO[dominant(bi, 0).group].label})` : <Dash />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500">Linearised buckling of the whole structure under each ULS combination. Shapes in the 3D view (Buckling).</p>
    </section>
  );
};

const AllMembers: React.FC<{ model: BridgeModel; r: AnalysisResults; onSelect: (id: number) => void; selected: number | null }> = ({ model, r, onSelect, selected }) => {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<GroupKey | 'all'>('all');
  const rows = r.design.filter((d) => group === 'all' || model.members[d.member].group === group).sort((a, b) => b.util - a.util);
  return (
    <section className="panel">
      <div className="panel-header">
        <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1.5 text-[13px] font-bold text-slate-800">
          All Members ({r.design.length})
          <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <select className="control-sm" value={group} onChange={(e) => setGroup(e.target.value as GroupKey | 'all')}>
            <option value="all">All Groups</option>
            {GROUPS.map((g) => (
              <option key={g} value={g}>
                {GROUP_INFO[g].label}
              </option>
            ))}
          </select>
        )}
      </div>
      {open && (
        <div className="overflow-x-auto max-h-[480px] overflow-y-auto scroll-thin">
          <table className="rtable min-w-[760px]">
            <Cols w={[9, 15, 18, 8, 8, 8, 10, 12, 12]} />
            <thead className="sticky top-0">
              <tr>
                <th>Member</th>
                <th>Section</th>
                <th>Governing Check</th>
                <th><S s="N" />* (kN)</th>
                <th><S s="M" />*<sub>x</sub> (kNm)</th>
                <th><S s="M" />*<sub>y</sub> (kNm)</th>
                <th><S s="l" sub="e" /> (m)</th>
                <th><S s="φN" sub="c" /> (kN)</th>
                <th>Utilisation</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const m = model.members[d.member];
                return (
                  <tr key={d.member} className={`cursor-pointer ${selected === d.member ? 'bg-blue-50' : ''}`} onClick={() => onSelect(m.id)}>
                    <td className="font-medium">{m.name}</td>
                    <td>{m.sp.def.name}</td>
                    <td>{d.governing}</td>
                    <td>{f0(d.N)}</td>
                    <td>{f1(d.Mx)}</td>
                    <td>{f1(d.My)}</td>
                    <td>{d.comp ? Math.min(d.leMajor, d.leMinor).toFixed(2) : <Dash />}</td>
                    <td>{d.comp ? f0(d.comp.phiNc) : <Dash />}</td>
                    <td>
                      <UtilValue value={d.util} highlight />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
