import React, { useMemo, useState } from 'react';
import { Banner, Cols, Dash, PassFail, ResultsHeader, StatusChip, UtilValue, pct } from 'engineering-ui';
import { ChevronDown } from 'lucide-react';
import type { BridgeModel } from '../model/build';
import { comboLabel, uFrameLength, type AnalysisResults, type MemberDesign } from '../model/analysis';
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
  lambdaMin: number | null;
  fVert: number | null;
  fLat: number | null;
  dynWarnings: string[];
}

export function summarise(model: BridgeModel, r: AnalysisResults, input: BridgeInput): Summary {
  const maxUtil = r.design.reduce((m, d) => Math.max(m, d.util), 0);
  const failing = r.design.filter((d) => d.util > 1 + 1e-9).sort((a, b) => b.util - a.util).map((d) => ({ name: model.members[d.member].name, util: d.util }));
  const deflOk = r.sls.every((s) => s.limit === null || s.maxVert <= s.limit + 1e-9);
  const lambdaMin = r.buckling.reduce<number | null>((m, b) => (b.values.length ? Math.min(m ?? Infinity, b.values[0]) : m), null);
  const fv = r.modal.freqs.find((_, i) => r.modal.kinds[i] === 'Vertical') ?? null;
  const fl = r.modal.freqs.find((_, i) => r.modal.kinds[i] === 'Lateral') ?? null;
  const dynWarnings: string[] = [];
  if (fv !== null && fv >= input.freqVertMin && fv <= input.freqVertMax)
    dynWarnings.push(`The first vertical frequency (${fv.toFixed(2)} Hz) is between ${input.freqVertMin} and ${input.freqVertMax} Hz: a dynamic assessment of pedestrian-induced vibration is required.`);
  if (fl !== null && fl < input.freqLatMin) dynWarnings.push(`The first lateral frequency (${fl.toFixed(2)} Hz) is below ${input.freqLatMin} Hz: a dynamic assessment of lateral vibration is required.`);
  return { maxUtil, failing, deflOk, lambdaMin, fVert: fv, fLat: fl, dynWarnings };
}

export const Results: React.FC<{
  model: BridgeModel;
  input: BridgeInput;
  results: AnalysisResults | null;
  stale: boolean;
  solving: boolean;
  error: string | null;
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
    const pass = !sum.failing.length && sum.deflOk;
    chip = pass ? (
      <StatusChip kind="pass">PASS (Max Util: {pct(sum.maxUtil)})</StatusChip>
    ) : (
      <StatusChip kind="fail">
        FAIL ({[...sum.failing.slice(0, 3).map((f) => `${f.name} ${pct(f.util)}`), ...(sum.deflOk ? [] : ['Deflection'])].join(', ')}
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
        {error && <Banner kind="error" title="Solver error">{error}</Banner>}
        {r && r.errors.length > 0 && <Banner kind="error" title="Analysis errors" items={r.errors} />}
        {warnings.length > 0 && <Banner kind="warning" title="Warnings" items={warnings} />}
        {r && sum && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label="Max Utilisation" value={pct(sum.maxUtil)} bad={sum.maxUtil > 1} />
              <Stat label={<>Lowest Buckling Factor <S s="λ" sub="c" /></>} value={sum.lambdaMin !== null ? sum.lambdaMin.toFixed(2) : '—'} bad={(sum.lambdaMin ?? 0) < 1} />
              <Stat label="First Vertical Frequency" value={sum.fVert !== null ? `${sum.fVert.toFixed(2)} Hz` : '—'} warn={sum.dynWarnings.some((w) => w.includes('vertical'))} />
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
          <Cols w={[13, 7, 14, 17, 21, 8, 8, 12]} />
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
              <KV k="End Connections" v={m.relA || m.relB ? 'Pinned (bending released)' : 'Rigid'} />
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
                  {d.mode !== null && <KV k="Buckling Mode Used" v={`Mode ${d.mode}, λ = ${d.lambdaCr!.toFixed(3)}`} />}
                  {uf && <KV k="U-Frame Flexibility δ" v={`${(uf.delta * 1000).toFixed(3)} mm/kN (d₁ = ${uf.d1.toFixed(3)} m, d₂ = ${uf.d2.toFixed(3)} m)`} />}
                  <KV k={<>Elastic Buckling Load <S s="N" sub="om" /></>} v={`${f0(comp.Nom)} kN`} />
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
                  <td>{it.unit ? `${f1(it.action)} ${it.unit}` : it.action.toFixed(3)}</td>
                  <td>{it.unit ? `${f1(it.capacity)}` : <Dash />}</td>
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
            <Cols w={[75, 25]} />
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

const ServiceabilityPanel: React.FC<{ model: BridgeModel; r: AnalysisResults; input: BridgeInput }> = ({ r, input }) => (
  <section className="panel">
    <div className="panel-header">
      <h2 className="text-[13px] font-bold text-slate-800">Serviceability</h2>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <h3 className="card-title mb-1">Deflection</h3>
        <table className="rtable">
          <Cols w={[40, 18, 16, 14, 12]} />
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
        <p className="text-[11px] text-slate-500 mt-1">Deflection limit span / {input.deflLimit}. The dead load deflection indicates the precamber.</p>
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
              const flag = (k === 'Vertical' && f >= input.freqVertMin && f <= input.freqVertMax) || (k === 'Lateral' && f < input.freqLatMin);
              return (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{f.toFixed(2)}</td>
                  <td>{k}</td>
                  <td>{flag ? <span className="font-semibold text-amber-800">Dynamic assessment</span> : <Dash />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-[11px] text-slate-500 mt-1">Mass from G1 and G2{input.modalQ > 0 ? ` and ${input.modalQ}% of the pedestrian load` : ''}.</p>
      </div>
    </div>
  </section>
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
          <Cols w={[34, ...Array(nCols).fill(36 / nCols), 30]} />
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
                <td className="!text-left">{comboLabel(r.combos[b.combo])}</td>
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
