import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { NumberField, SelectField, Check, Segmented, Modal } from 'engineering-ui';
import { ChevronDown, ChevronUp, Plus, Trash2, Wand2 } from 'lucide-react';
import { CATEGORIES, sectionsOf, type SectionCategory } from '../data/sections';
import { defaultGrade, gradesFor } from '../data/grades';
import { sectionProps } from '../design/section';
import {
  DECK_INFO,
  DEFAULT_COMBOS,
  GROUP_INFO,
  GROUPS,
  type BridgeInput,
  type Combination,
  type DeckType,
  type Finish,
  type GroupKey,
  type JointModel,
  type RailFinish,
  type ScreenType,
  SCREEN_INFO,
  type AsJoint,
  AS5100_JOINT_FLEX,
  type LeMethod,
  type TrussType
} from '../model/types';
import { panelCount, type BridgeModel } from '../model/build';
import type { OptimiseResult } from '../model/optimise';
import { windPressure, type AnalysisResults } from '../model/analysis';
import { FINISH } from './viewer/scene';

type Set = <K extends keyof BridgeInput>(k: K, v: BridgeInput[K]) => void;

const S: React.FC<{ s: string; sub?: string }> = ({ s, sub }) => (
  <>
    <i>{s}</i>
    {sub && <sub>{sub}</sub>}
  </>
);

const Readout: React.FC<{ label: React.ReactNode; value: React.ReactNode; title?: string }> = ({ label, value, title }) => (
  <div className="readout" title={title}>
    <span>{label}</span>
    <span className="readout-value">{value}</span>
  </div>
);

export const InputPanels: React.FC<{
  input: BridgeInput;
  set: Set;
  model: BridgeModel;
  onOptimise: () => void;
  optimiseLog: Pick<OptimiseResult, 'log' | 'governs'> | null;
  solving: boolean;
  /** Results for the current inputs (null when not solved or out of date). */
  results: AnalysisResults | null;
}> = ({ input, set, model, onOptimise, optimiseLog, solving, results }) => {
  const { geo } = model;
  const n = panelCount(input);
  return (
    <>
      {/* ---------------------------------------------------------------- geometry */}
      <section className="panel">
        <h2 className="panel-title" title="Pony (half-through) truss: two parallel trusses with a deck on cross girders at the bottom chord panel points. The top chords are restrained laterally only by the U-frames formed by the verticals and cross girders.">
          Geometry
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label={<>Span <S s="L" /> (m)</>} value={input.span} onChange={(v) => set('span', v)} min={6} max={50} step={0.5} title="Centre to centre of bearings" />
          <NumberField label={<>Truss Depth <S s="h" /> (m)</>} value={input.depth} onChange={(v) => set('depth', v)} min={0.6} max={4} step={0.05} decimals={2} title="Centroid of the bottom chord to centroid of the top chord" />
        </div>
        <div>
          <label className="label">Truss Type</label>
          <Segmented<TrussType>
            value={input.trussType}
            onChange={(v) => set('trussType', v)}
            options={[
              { value: 'warren', label: 'Warren' },
              { value: 'pratt', label: 'Pratt' },
              { value: 'howe', label: 'Howe' }
            ]}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 items-end">
          <NumberField label="Number of Panels" value={input.panels} onChange={(v) => set('panels', 2 * Math.max(1, Math.round(v / 2)))} min={2} max={40} step={2} title="An even number, so that the trusses are symmetric" />
          <div className="pb-1">
            <Readout label={<>Panel Length <S s="a" /></>} value={`${(input.span / n).toFixed(3)} m`} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Clear Width (m)" value={input.clearWidth} onChange={(v) => set('clearWidth', v)} min={1} max={8} step={0.1} decimals={2} title="Between the inside faces of the handrails" />
          <NumberField label="Handrail Offset (mm)" value={input.handrailWidth} onChange={(v) => set('handrailWidth', v)} min={0} max={400} step={10} title="Inside face of the truss (its widest member) to the inside face of the handrail" />
        </div>
        <Readout label="Truss Width" value={`${(geo.trussWidth * 1000).toFixed(0)} mm`} title="Width across the bridge of the widest truss member" />
        <Readout label={<>Truss Spacing <S s="s" /> (Centres)</>} value={`${geo.s.toFixed(3)} m`} title="Clear width + 2 × handrail offset + truss width" />
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Cross Girder Level (mm)" value={input.cgLevel} onChange={(v) => set('cgLevel', v)} min={-600} max={600} step={5} title="Top of the cross girders relative to the top of the bottom chord: positive raises them, negative drops them. Their underside may not be below the underside of the bottom chord. Within the bottom chord depth they are connected to the bottom chord nodes by rigid links; raised above it (Pratt and Howe only, cross girders no wider than the verticals) they connect to the verticals at their own level." />
          <SelectField
            label="Plan Bracing"
            value={input.bracing}
            onChange={(v) => set('bracing', v as BridgeInput['bracing'])}
            options={[
              { value: 'x', label: 'X-Bracing' },
              { value: 'single', label: 'Single Diagonals' },
              { value: 'none', label: 'None' }
            ]}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Stringers"
            value={input.stringerCount}
            onChange={(v) => set('stringerCount', Math.max(0, Math.round(v)))}
            min={0}
            max={12}
            step={1}
            title="Longitudinal stringers simply supported on the cross girders, carrying the deck and pedestrian load by tributary width. They take no axial force from the chords. With none, the deck spans along the bridge between the cross girders."
          />
          {input.stringerCount > 0 ? (
            <NumberField label="Stringer Spacing (m)" value={input.stringerSpacing} onChange={(v) => set('stringerSpacing', v)} min={0.2} max={3} step={0.05} decimals={2} />
          ) : (
            <NumberField label="Stringer Spacing (m)" value={undefined} onChange={() => {}} disabled disabledText="–" />
          )}
        </div>
        <Check
          checked={input.stringerCount > 0 && input.chordsSupportDeck}
          disabled={input.stringerCount === 0}
          onChange={(v) => set('chordsSupportDeck', v)}
          title="With stringers, the deck spans across the bridge and also bears on the bottom chords, which then carry the width halfway to the outer stringers. Without stringers the deck spans along the bridge between the cross girders."
        >
          Bottom Chords Support Deck
        </Check>
      </section>

      {/* ---------------------------------------------------------------- deck and furniture */}
      <section className="panel">
        <h2 className="panel-title">Deck &amp; Furniture</h2>
        <div className="grid grid-cols-2 gap-2">
          <SelectField
            label="Deck"
            value={input.deckType}
            onChange={(v) => {
              const d = DECK_INFO[v as DeckType];
              set('deckType', v as DeckType);
              set('deckThickness', d.thickness);
              set('deckDensity', d.density);
              // grating and boards span across between stringers
              if ((v === 'frp' || v === 'timber') && input.stringerCount === 0) set('stringerCount', 4);
            }}
            options={(Object.keys(DECK_INFO) as DeckType[]).map((k) => ({ value: k, label: DECK_INFO[k].label }))}
          />
          <NumberField label={<>Thickness <S s="t" sub="d" /> (mm)</>} value={input.deckThickness} onChange={(v) => set('deckThickness', v)} min={5} max={300} step={5} />
        </div>
        <div className="grid grid-cols-2 gap-2 items-end">
          <NumberField label="Unit Weight (kN/m³)" value={input.deckDensity} onChange={(v) => set('deckDensity', v)} min={1} max={80} step={0.5} />
          <div className="pb-2">
            <Readout label="Deck Weight" value={`${((input.deckThickness / 1000) * input.deckDensity).toFixed(2)} kPa`} />
          </div>
        </div>
        <Readout
          label="Deck Span (Max)"
          value={`${deckSpan(model).toFixed(3)} m`}
          title="Without stringers: the panel length (the deck spans along the bridge between the cross girders). With stringers: the largest span of the deck across the bridge between its supports (centres), or the overhang beyond the outer stringers."
        />
        <NumberField label="Services (kN/m)" value={input.services} onChange={(v) => set('services', v)} min={0} max={10} step={0.1} decimals={2} title="Total for the bridge, shared equally by the bottom chords" />
        <div>
          <label className="label">Handrails (Each Side)</label>
          <Segmented<'1' | '2'>
            value={String(input.handrails) as '1' | '2'}
            onChange={(v) => set('handrails', v === '2' ? 2 : 1)}
            options={[
              { value: '1', label: 'One' },
              { value: '2', label: 'Two' }
            ]}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label={input.handrails === 2 ? 'Lower Rail Height (m)' : 'Handrail Height (m)'} value={input.handrailHeight1} onChange={(v) => set('handrailHeight1', v)} min={0.5} max={1.8} step={0.05} decimals={2} title="Above the deck" />
          {input.handrails === 2 ? (
            <NumberField label="Upper Rail Height (m)" value={input.handrailHeight2} onChange={(v) => set('handrailHeight2', v)} min={0.5} max={1.8} step={0.05} decimals={2} title="Above the deck" />
          ) : (
            <NumberField label="Upper Rail Height (m)" value={undefined} onChange={() => {}} disabled disabledText="–" />
          )}
        </div>
        <NumberField label="Handrail Weight (kN/m per Rail)" value={input.handrailLoad} onChange={(v) => set('handrailLoad', v)} min={0} max={2} step={0.05} decimals={2} />
        <SelectField
          label="Handrail Finish"
          value={input.railFinish}
          onChange={(v) => set('railFinish', v as RailFinish)}
          options={[
            { value: 'galvanised', label: 'Galvanised' },
            { value: 'stainless', label: 'Stainless Steel' },
            { value: 'steelwork', label: 'As Steelwork' }
          ]}
        />
        <Check checked={input.screens} onChange={(v) => set('screens', v)}>
          Screens
        </Check>
        {input.screens && (
          <div className="nested">
            <SelectField
              label="Screen Type"
              value={input.screenType}
              onChange={(v) => {
                const t = v as ScreenType;
                set('screenType', t);
                set('screenSolidity', SCREEN_INFO[t].solidity);
                set('screenLoad', SCREEN_INFO[t].load);
              }}
              options={(Object.keys(SCREEN_INFO) as ScreenType[]).map((k) => ({ value: k, label: SCREEN_INFO[k].label }))}
            />
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Height Above Deck (m)" value={input.screenHeight} onChange={(v) => set('screenHeight', v)} min={0.5} max={4} step={0.1} decimals={2} />
              <NumberField label="Weight (kPa)" value={input.screenLoad} onChange={(v) => set('screenLoad', v)} min={0} max={2} step={0.05} decimals={2} />
            </div>
            <NumberField label="Solidity (%)" value={Math.round(input.screenSolidity * 100)} onChange={(v) => set('screenSolidity', v / 100)} min={0} max={100} step={5} title="Solid area of the screen as a share of its area (for wind): typically 40% for wire mesh, 60% for perforated plate, 100% for a solid panel" />
          </div>
        )}
        <SelectField label="Steel Finish" value={input.finish} onChange={(v) => set('finish', v as Finish)} options={(Object.keys(FINISH) as Finish[]).map((k) => ({ value: k, label: FINISH[k].label }))} />
      </section>

      {/* ---------------------------------------------------------------- sections */}
      <section className="panel">
        <h2 className="panel-title" title="Section depth direction: the direction of the section depth (d) in the bridge.">Sections</h2>
        {GROUPS.filter((g) => g !== 'vertical' || input.trussType !== 'warren')
          .filter((g) => g !== 'stringer' || input.stringerCount > 0)
          .map((g, i) =>
            g === 'endPost' ? (
              <div key={g} className="section !space-y-1">
                <h3 className="card-title">{GROUP_INFO[g].label}</h3>
                <Readout label="Raking End Posts" value="As Top Chord" />
              </div>
            ) : (
              <SectionRow key={g} group={g} input={input} set={set} first={i === 0} />
            )
          )}
        <Readout label="Steel Mass (Incl. Connections)" value={`${model.steelMass.toFixed(2)} t`} />
        <NumberField
          label="Optimiser Target Utilisation (%)"
          value={input.optimiseTarget}
          onChange={(v) => set('optimiseTarget', v)}
          min={50}
          max={100}
          step={5}
          title="The optimiser selects the lightest section of each group with a strength utilisation of at most this; deflection and vibration are kept within their limits"
        />
        <div>
          <SelectField
            label="Optimiser Preference"
            value={input.optimiseCompact ? 'compact' : 'mass'}
            onChange={(v) => set('optimiseCompact', v === 'compact')}
            options={[
              { value: 'compact', label: 'Compact Sections' },
              { value: 'mass', label: 'Least Mass' }
            ]}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Min Web / Chord Width"
            value={input.minWebRatio}
            onChange={(v) => set('minWebRatio', v)}
            min={0}
            max={1}
            step={0.05}
            decimals={2}
            title="The optimiser keeps the verticals and diagonals at least this fraction of the width of the wider chord across the bridge, so that the members stay proportionate"
          />
          <NumberField
            label="Max Web / Chord Width"
            value={input.maxWebRatio}
            onChange={(v) => set('maxWebRatio', v)}
            min={0}
            max={1}
            step={0.05}
            decimals={2}
            title="The optimiser keeps the verticals and diagonals at most this fraction of the width of the narrower chord across the bridge"
          />
        </div>
        <button
          type="button"
          className="btn w-full"
          onClick={onOptimise}
          disabled={solving}
          title="Keeps the geometry, loads, section types and grades, and selects for each group the most compact section for its mass (or the lightest) with a utilisation of at most the target, keeping the web members proportionate to the chords, with the chords stiff enough for the deflection and vertical vibration checks and the stringers for their deflection check, in up to four analysis iterations (and up to two more, upsizing only, if a check still fails), with the verticals and diagonals no wider than the chords. Groups sized by deflection or vibration are then refined with full analyses. The model is then solved."
        >
          <Wand2 className="w-3.5 h-3.5" />
          Optimise Sections ({input.optimiseTarget}% Target)
        </button>
        {optimiseLog && (
          <>
            <Readout
              label="Last Optimisation"
              value={`${optimiseLog.log.filter((l) => l.includes('→')).length} changes`}
              title={optimiseLog.log.join('\n')}
            />
            {optimiseLog.log
              .filter((l) => l.startsWith('Before optimising') || l.startsWith('Not optimised'))
              .map((l) => (
                <p key={l} className={`text-[11px] leading-snug ${l.startsWith('Not') ? 'text-amber-800' : 'text-slate-500'}`}>
                  {l}
                </p>
              ))}
            {Object.keys(optimiseLog.governs).length > 0 && (
              <p className="text-[11px] text-slate-500 leading-snug">
                Sizes set by:{' '}
                {GROUPS.filter((g) => optimiseLog.governs[g])
                  .map((g) => `${GROUP_INFO[g].label} ${optimiseLog.governs[g]}`)
                  .join('; ')}
                .
              </p>
            )}
          </>
        )}
      </section>

      {/* ---------------------------------------------------------------- loads */}
      <LoadsPanel input={input} set={set} model={model} />

      {/* ---------------------------------------------------------------- design */}
      <DesignPanel input={input} set={set} model={model} results={results} />
    </>
  );
};

/** Largest span of the deck across the bridge between its supports, or its overhang beyond the outer supports. */
function deckSpan(model: BridgeModel): number {
  // without stringers the deck spans along the bridge between the cross girders
  if (!model.geo.deckShares.length) return model.geo.a;
  const ys = model.geo.deckShares.map((d) => d.y);
  let span = 0;
  for (let i = 1; i < ys.length; i++) span = Math.max(span, ys[i] - ys[i - 1]);
  const overhang = model.geo.deckWidth / 2 - Math.max(...ys.map(Math.abs));
  return Math.max(span, overhang);
}

const SectionRow: React.FC<{ group: GroupKey; input: BridgeInput; set: Set; first: boolean }> = ({ group, input, set, first }) => {
  const g = input.sections[group];
  const info = GROUP_INFO[group];
  const list = sectionsOf(g.category);
  const update = (patch: Partial<typeof g>) => set('sections', { ...input.sections, [group]: { ...g, ...patch } });
  const sp = sectionProps(g);
  const idx = list.findIndex((s) => s.name === g.name);
  return (
    <div className={first ? 'space-y-2' : 'section !space-y-2'}>
      <div className="flex items-baseline justify-between">
        <h3 className="card-title">{info.label}</h3>
        <span className="text-[11px] text-slate-500 tabular-nums">{sp.mass.toFixed(1)} kg/m</span>
      </div>
      <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-2">
        <SelectField
          value={g.category}
          onChange={(v) => {
            const c = v as SectionCategory;
            const opts = sectionsOf(c);
            const near = opts.reduce((a, s) => (Math.abs(s.depth - sp.d) < Math.abs(a.depth - sp.d) ? s : a), opts[0]);
            update({ category: c, name: near.name, grade: defaultGrade(c) });
          }}
          options={CATEGORIES.map((c) => ({ value: c, label: c }))}
        />
        <div className="relative">
          <select className="control !pr-11" value={g.name} onChange={(e) => update({ name: e.target.value })}>
            {list.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
          <div className="spin !right-6">
            <button type="button" tabIndex={-1} className="spin-btn" title="Next size" onClick={() => idx < list.length - 1 && update({ name: list[idx + 1].name })}>
              <ChevronUp size={11} strokeWidth={2.5} />
            </button>
            <button type="button" tabIndex={-1} className="spin-btn" title="Previous size" onClick={() => idx > 0 && update({ name: list[idx - 1].name })}>
              <ChevronDown size={11} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <SelectField value={g.grade} onChange={(v) => update({ grade: v })} options={gradesFor(g.category).map((x) => ({ value: x.name, label: x.name }))} />
        <SelectField
          value={g.rotate ? 'r' : 'd'}
          onChange={(v) => update({ rotate: v === 'r' })}
          options={[
            { value: 'd', label: `Depth ${info.depthDir}` },
            { value: 'r', label: `Depth ${info.rotDir}` }
          ]}
        />
      </div>
    </div>
  );
};

const LoadsPanel: React.FC<{ input: BridgeInput; set: Set; model: BridgeModel }> = ({ input, set, model }) => {
  const [edit, setEdit] = useState(false);
  return (
    <section className="panel">
      <h2 className="panel-title" title="Load values and factors are inputs; confirm them against AS 5100.2 and the project requirements.">
        Loads
      </h2>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Pedestrian Load (kPa)" value={input.pedestrian} onChange={(v) => set('pedestrian', v)} min={0} max={20} step={0.5} decimals={1} title="On the clear width" />
        <NumberField label="Connections (% of Steel)" value={input.connectionAllowance} onChange={(v) => set('connectionAllowance', v)} min={0} max={30} step={1} />
      </div>
      <div className="section">
        <div className="grid grid-cols-2 gap-2">
          <NumberField label={<>ULS Wind Speed <S s="V" sub="u" /> (m/s)</>} value={input.windUls} onChange={(v) => set('windUls', v)} min={0} max={90} step={1} />
          <NumberField label={<>SLS Wind Speed <S s="V" sub="s" /> (m/s)</>} value={input.windSls} onChange={(v) => set('windSls', v)} min={0} max={90} step={1} />
        </div>
        <Readout label="Wind Pressure ULS / SLS" value={`${windPressure(input.windUls).toFixed(2)} / ${windPressure(input.windSls).toFixed(2)} kPa`} title="q = 0.6 V² / 1000" />
        <div className="grid grid-cols-2 gap-2">
          <NumberField label={<>Drag Coefficient <S s="C" sub="d" /></>} value={input.dragCoeff} onChange={(v) => set('dragCoeff', v)} min={0} max={4} step={0.05} decimals={2} title="For one truss, on its projected solid area (members and screen), and on the deck edge and kerb" />
          <NumberField label={<>Leeward Shielding <S s="K" sub="sh" /></>} value={input.leewardShielding} onChange={(v) => set('leewardShielding', v)} min={0} max={1} step={0.05} decimals={2} title="Factor on the drag of the leeward truss, shielded by the windward one (confirm against AS/NZS 1170.2 for the solidity and spacing)" />
        </div>
        <div className="grid grid-cols-2 gap-2 items-end">
          <NumberField label={<>Lift Coefficient <S s="C" sub="L" /></>} value={input.liftCoeff} onChange={(v) => set('liftCoeff', v)} min={0} max={2} step={0.05} decimals={2} title="Uplift on the deck plan area" />
          <div className="pb-2">
            <Readout label={<><S s="C" sub="d" /> × Depth</>} value={`${model.geo.windDepth.toFixed(2)} m`} title="Total lateral wind load per metre of span = q × this (both trusses, deck edge and exposed cross girder)" />
          </div>
        </div>
      </div>
      <div className="section">
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Barrier Load (kN/m)" value={input.barrier} onChange={(v) => set('barrier', v)} min={0} max={10} step={0.25} decimals={2} title="Nominal (unfactored) pedestrian barrier load, horizontal, outwards, at the top handrail: 0.75 kN/m, or 3.0 kN/m where crowd loading or panic is possible. The default combination factors it by 1.8 (AS 5100.2 Table 12.5) with the serviceability pedestrian load (Cl. 12.5)." />
          <NumberField label="Barrier Vertical (kN/m)" value={input.barrierVertical} onChange={(v) => set('barrierVertical', v)} min={0} max={10} step={0.25} decimals={2} title="Nominal vertical load on the barrier, downwards on the handrail line, acting with the horizontal barrier load (AS 5100.2 Cl. 12.5)" />
          <NumberField label="U-Frame Restraint (%)" value={input.restraintPct} onChange={(v) => set('restraintPct', v)} min={0} max={10} step={0.5} decimals={1} title="Lateral force at each top chord node, as a percentage of the top chord compression, acting inwards (ULS combinations). 0 = not applied." />
        </div>
        <button type="button" className="btn w-full" onClick={() => setEdit(true)}>
          Load Combinations ({input.combos.length})…
        </button>
      </div>
      {edit && <CombosDialog combos={input.combos} onChange={(c) => set('combos', c)} onClose={() => setEdit(false)} />}
    </section>
  );
};

const CombosDialog: React.FC<{ combos: Combination[]; onChange: (c: Combination[]) => void; onClose: () => void }> = ({ combos, onChange, onClose }) => {
  const upd = (i: number, patch: Partial<Combination>) => onChange(combos.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const num = (i: number, k: 'g1s' | 'g1d' | 'g2' | 'q' | 'w' | 'b') => (
    <input
      type="text"
      inputMode="decimal"
      className="control-sm w-full text-center tabular-nums"
      defaultValue={String(combos[i][k])}
      key={`${i}-${k}-${combos[i][k]}`}
      onBlur={(e) => {
        const v = parseFloat(e.target.value.replace('−', '-'));
        if (Number.isFinite(v)) upd(i, { [k]: v });
        else e.target.value = String(combos[i][k]);
      }}
    />
  );
  // rendered on the document body, above the sticky input column and the 3D view
  return createPortal(
    <Modal title="Load Combinations" onClose={onClose} variant="page">
      <div className="panel">
        <div className="overflow-x-auto">
          <table className="rtable min-w-[760px]">
            <colgroup>
              {[26, 9, 8, 8, 8, 8, 8, 8, 9, 8].map((w, i) => (
                <col key={i} style={{ width: `${w}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th title="Steel self-weight">G1 Steel</th>
                <th title="Deck self-weight">G1 Deck</th>
                <th title="Superimposed dead load">G2</th>
                <th title="Pedestrian load">Q</th>
                <th title="Wind, factor on the ULS or SLS wind pressure">W</th>
                <th title="Barrier load">B</th>
                <th title="SLS: check the vertical deflection against the limit">Deflection Check</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {combos.map((c, i) => (
                <tr key={i}>
                  <td>
                    <input type="text" className="control-sm w-full" defaultValue={c.name} key={`${i}-n-${c.name}`} onBlur={(e) => upd(i, { name: e.target.value || c.name })} />
                  </td>
                  <td>
                    <select className="control-sm w-full" value={c.type} onChange={(e) => upd(i, { type: e.target.value as Combination['type'] })}>
                      <option value="ULS">ULS</option>
                      <option value="SLS">SLS</option>
                    </select>
                  </td>
                  <td>{num(i, 'g1s')}</td>
                  <td>{num(i, 'g1d')}</td>
                  <td>{num(i, 'g2')}</td>
                  <td>{num(i, 'q')}</td>
                  <td>{num(i, 'w')}</td>
                  <td>{num(i, 'b')}</td>
                  <td>
                    <input type="checkbox" className="checkbox" disabled={c.type === 'ULS'} checked={c.type === 'SLS' && c.deflection} onChange={(e) => upd(i, { deflection: e.target.checked })} />
                  </td>
                  <td>
                    <button type="button" className="text-slate-400 hover:text-rose-600" title="Delete" onClick={() => onChange(combos.filter((_, j) => j !== i))}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-2 justify-between">
          <button type="button" className="btn" onClick={() => onChange([...combos, { name: 'New', type: 'ULS', g1s: 1.1, g1d: 1.2, g2: 1.4, q: 0, w: 0, b: 0, deflection: false }])}>
            <Plus className="w-3.5 h-3.5" />
            Add Combination
          </button>
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={() => onChange(DEFAULT_COMBOS)}>
              Restore Defaults
            </button>
            <button type="button" className="btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </Modal>,
    document.body
  );
};

const LE_OPTIONS: { value: LeMethod; label: string }[] = [
  { value: 'buckling', label: 'Buckling Analysis' },
  { value: 'factor', label: 'Factor × Length' },
  { value: 'uframe', label: 'U-Frame' }
];

/**
 * Effective length factors l_e / L found by the analysis for the governing compression member of each group (the
 * compression member with the highest utilisation), with its name.
 */
function computedFactors(model: BridgeModel, results: AnalysisResults | null) {
  const out: Partial<Record<GroupKey, { kx: number; ky: number; name: string; util: number }>> = {};
  if (!results) return out;
  for (const d of results.design) {
    const m = model.members[d.member];
    if (!d.comp || !m) continue;
    const cur = out[m.group];
    if (!cur || d.util > cur.util) out[m.group] = { kx: d.leMajor / m.length, ky: d.leMinor / m.length, name: m.name, util: d.util };
  }
  return out;
}

const DesignPanel: React.FC<{ input: BridgeInput; set: Set; model: BridgeModel; results: AnalysisResults | null }> = ({ input, set, model, results }) => {
  const upd = (g: GroupKey, patch: Partial<BridgeInput['design'][GroupKey]>) => set('design', { ...input.design, [g]: { ...input.design[g], ...patch } });
  const calc = useMemo(() => computedFactors(model, results), [model, results]);
  const k = (g: GroupKey, key: 'kMajor' | 'kMinor' | 'kLtb', disabled: boolean) => {
    // a factor found by the analysis is shown read-only once solved
    const c = calc[g];
    if (disabled && c && key !== 'kLtb') {
      const v = key === 'kMajor' ? c.kx : c.ky;
      return (
        <input
          type="text"
          readOnly
          value={v.toFixed(2)}
          title={`From the analysis: ${c.name}, the governing compression member of the group (l_e / L)`}
          className="control-sm w-full text-center tabular-nums px-1 bg-slate-50 text-slate-700"
        />
      );
    }
    return (
    <input
      type="text"
      inputMode="decimal"
      disabled={disabled}
      className="control-sm w-full text-center tabular-nums px-1 disabled:bg-slate-100 disabled:text-slate-400"
      defaultValue={disabled ? '–' : input.design[g][key].toFixed(2)}
      key={`${g}-${key}-${input.design[g][key]}-${disabled}`}
      onBlur={(e) => {
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v) && v > 0) upd(g, { [key]: v });
        else e.target.value = input.design[g][key].toFixed(2);
      }}
    />
    );
  };
  const rows = useMemo(() => GROUPS.filter((g) => (g !== 'vertical' || input.trussType !== 'warren') && (g !== 'stringer' || input.stringerCount > 0)), [input.trussType, input.stringerCount]);
  return (
    <section className="panel">
      <h2 className="panel-title" title="Effective lengths for member compression capacity (AS 5100.6 Cl. 6.3.3): from the elastic buckling analysis (l_e = π√(EI/N_om), N_om = λ_c N*), as a factor on the member length, or for the top chord from the U-frame stiffness. k_LTB sets the segment length for lateral–torsional buckling.">
        Member Design
      </h2>
      <table className="w-full text-[11px] text-slate-600 border-separate border-spacing-y-1">
        <colgroup>
          <col style={{ width: '25%' }} />
          <col style={{ width: '36%' }} />
          <col style={{ width: '13%' }} />
          <col style={{ width: '13%' }} />
          <col style={{ width: '13%' }} />
        </colgroup>
        <thead>
          <tr className="font-medium">
            <th className="text-left font-medium">Member</th>
            <th className="text-left font-medium">Effective Length</th>
            <th className="font-medium" title="Effective length factor, major axis">
              <S s="k" sub="x" />
            </th>
            <th className="font-medium" title="Effective length factor, minor axis">
              <S s="k" sub="y" />
            </th>
            <th className="font-medium" title="Lateral–torsional buckling segment length factor">
              <S s="k" sub="LTB" />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => {
            const d = input.design[g];
            const uOk = g === 'topChord';
            return (
              <tr key={g}>
                <td className="font-medium pr-1">{GROUP_INFO[g].label}</td>
                <td className="pr-1">
                  <select className="control-sm w-full" value={d.method} onChange={(e) => upd(g, { method: e.target.value as LeMethod })}>
                    {LE_OPTIONS.filter((o) => o.value !== 'uframe' || uOk).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-0.5">{k(g, 'kMajor', d.method === 'buckling')}</td>
                <td className="px-0.5">{k(g, 'kMinor', d.method !== 'factor')}</td>
                <td className="px-0.5">{k(g, 'kLtb', false)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Buckling Modes" value={input.bucklingModes} onChange={(v) => set('bucklingModes', Math.round(v))} min={1} max={20} step={1} title="Number of buckling modes computed for each ULS combination" />
        <NumberField label="Participation (%)" value={input.participation} onChange={(v) => set('participation', v)} min={1} max={100} step={1} title="About each axis, a member takes its buckling load from the lowest mode in which its destabilising energy from bending about that axis is at least this share of that of the member with the most" />
      </div>
      <SelectField
        label="Web and Cross Girder Joints"
        value={input.jointModel}
        onChange={(v) => set('jointModel', v as JointModel)}
        options={[
          { value: 'rigid', label: 'Rigid' },
          { value: 'as5100', label: 'Semi-Rigid, AS 5100.6 Cl. 5.6.3' },
          { value: 'flex', label: 'Semi-Rigid, Joint Flexibility f' },
          { value: 'ec3', label: 'Semi-Rigid, EN 1993-1-8 Rigid Limit (8EI/L)' }
        ]}
      />
      {input.jointModel === 'as5100' ? (
        <>
          <SelectField
            label="Connection (AS 5100.6 Cl. 5.6.3)"
            value={input.jointAsType}
            onChange={(v) => set('jointAsType', v as AsJoint)}
            options={(Object.keys(AS5100_JOINT_FLEX) as AsJoint[]).map((k) => ({ value: k, label: AS5100_JOINT_FLEX[k].label }))}
          />
          <Readout
            label="Joint Flexibility f"
            value={`${AS5100_JOINT_FLEX[input.jointAsType].f.toFixed(2)} mrad/kNm (k = ${(1000 / AS5100_JOINT_FLEX[input.jointAsType].f).toLocaleString('en-AU')} kNm/rad)`}
            title="AS 5100.6 Cl. 5.6.3: f = 0.5, 0.2 or 0.1 × 10⁻¹⁰ rad/Nmm for connection types (a), (b) and (c); used for the joint springs and the U-frame effective length method"
          />
        </>
      ) : (
      <NumberField
        label="Joint Flexibility f (mrad/kNm)"
        value={input.uFrameJointFlex}
        onChange={(v) => set('uFrameJointFlex', v)}
        min={0}
        max={10}
        step={0.01}
        decimals={2}
        disabled={input.design.topChord.method !== 'uframe' && input.jointModel !== 'flex'}
        disabledText="–"
        title="Rotational flexibility of the welded joints: of the vertical (or diagonal) to cross girder joint in the U-frame effective length method, and of every web member and cross girder end with the 'Joint Flexibility f' joints; 0 for a rigid joint"
      />
      )}
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Elements per Member" value={input.elementsPerMember} onChange={(v) => set('elementsPerMember', Math.round(v))} min={2} max={10} step={1} />
        <NumberField
          label="Max Slenderness L/r"
          value={input.maxSlenderness}
          onChange={(v) => set('maxSlenderness', v)}
          min={0}
          max={1000}
          step={10}
          title="Largest slenderness L/r of the truss members (chords, end posts, verticals, diagonals), in tension or compression, with L the length between nodes and r the least radius of gyration: 300 after AISC 360-16 Section D1 (User Note). 0 = not checked."
        />
        <div className="flex items-end pb-2">
          <Check checked={input.amplify} onChange={(v) => set('amplify', v)} title="Moments in compression members amplified by 1 / (1 − N*/N_om)">
            Moment Amplification
          </Check>
        </div>
      </div>
      <div className="section">
        <h3 className="card-title">Serviceability</h3>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Vertical Limit (L / …)" value={input.deflLimit} onChange={(v) => set('deflLimit', v)} min={100} max={2000} step={50} title="Vertical deflection of the trusses in the SLS combinations marked for the deflection check (pedestrian load); also the stringers, relative to the cross girders, over the panel length" />
          <NumberField label="Horizontal Limit (L / …)" value={input.latDeflLimit} onChange={(v) => set('latDeflLimit', v)} min={100} max={2000} step={50} title="Horizontal deflection in the SLS combinations with wind: at midspan, the average of the top and bottom chord displacements of each truss" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Precamber Limit (L / …)" value={input.precamberLimit} onChange={(v) => set('precamberLimit', v)} min={100} max={2000} step={50} title="Precamber (hog) to offset the deflection under the permanent loads, so that no sag remains under them (AS 5100.2 Cl. 8.4)" />
          <NumberField label="Mass From Q (%)" value={input.modalQ} onChange={(v) => set('modalQ', v)} min={0} max={100} step={5} title="Share of the pedestrian load included as mass for the natural frequencies (the vertical vibration check uses the permanent mass alone)" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <SelectField
            label="Damping (Log Decrement δ)"
            value={String(input.vibDecrement)}
            onChange={(v) => set('vibDecrement', +v)}
            options={[
              { value: '0.03', label: '0.03 Steel, Surfaced' },
              { value: '0.04', label: '0.04 Composite' },
              { value: '0.05', label: '0.05' }
            ]}
          />
          <NumberField label="Lateral Min (Hz)" value={input.freqLatMin} onChange={(v) => set('freqLatMin', v)} min={0} max={10} step={0.1} decimals={1} title="A lateral frequency below this needs special consideration (AS 5100.2 Cl. 13.4.1: 1.5 Hz)" />
        </div>
      </div>
    </section>
  );
};
