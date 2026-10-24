import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppHeader, Banner, Modal, ReportDialog, today } from 'engineering-ui';
import { FolderOpen, RotateCcw, Save } from 'lucide-react';
import { DEFAULT_INPUT, type BridgeInput } from './model/types';
import { loadInput, toSaved, type LoadedInput } from './model/migrate';
import { buildModel } from './model/build';
import type { OptimiseResult } from './model/optimise';
import { useAnalysis } from './model/useAnalysis';
import { InputPanels } from './components/InputPanels';
import { Results } from './components/Results';
import { Viewer3D, type ViewCapture } from './components/viewer/Viewer3D';
import { AboutPage } from './components/About';
import { generateReport, REPORT_INFO_FIELDS, type ReportInfo } from './utils/report';

const STORE = 'pedtruss-input-v5';

function loadSaved(): LoadedInput {
  try {
    const s = localStorage.getItem(STORE);
    if (s) return loadInput(JSON.parse(s));
  } catch {
    // storage blocked or invalid: defaults
  }
  return { input: DEFAULT_INPUT, notes: [] };
}

/** PedTruss: design and checking of steel pony truss footbridges to AS 5100. */
export default function App() {
  const [initial] = useState(loadSaved);
  const [input, setInput] = useState<BridgeInput>(initial.input);
  const [loadNotes, setLoadNotes] = useState<string[]>(initial.notes);
  const set = useCallback(<K extends keyof BridgeInput>(k: K, v: BridgeInput[K]) => setInput((p) => ({ ...p, [k]: v })), []);
  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(toSaved(input)));
    } catch {
      // storage blocked: inputs are not remembered
    }
  }, [input]);
  const model = useMemo(() => buildModel(input), [input]);
  const { results, stale, solving, progress, error, solve, optimise, cancel } = useAnalysis(input);
  const [optLog, setOptLog] = useState<Pick<OptimiseResult, 'log' | 'governs'> | null>(null);
  const onOptimise = () => {
    setOptLog(null);
    optimise((r) => {
      setInput((p) => ({ ...p, sections: r.sections }));
      setOptLog({ log: r.log, governs: r.governs });
    });
  };
  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => {
    if (selected !== null && selected >= model.members.length) setSelected(null);
  }, [model, selected]);
  const [showAbout, setShowAbout] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [info, setInfo] = useState<ReportInfo>(() => ({ projectName: '', projectNumber: '', structure: '', location: '', designer: '', date: today() }));
  const captureRef = useRef<(() => ViewCapture | null) | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const saveFile = () => {
    const blob = new Blob([JSON.stringify(toSaved(input), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pedtruss.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const openFile = (f: File) =>
    f.text().then((t) => {
      try {
        const loaded = loadInput(JSON.parse(t));
        setInput(loaded.input);
        setLoadNotes(loaded.notes);
      } catch {
        alert('The file could not be read.');
      }
    });

  const blocked = model.members.length === 0 ? 'The model has no members.' : model.errors[0];
  const solveState = solving ? 'solving' : blocked ? 'blocked' : results ? 'solved' : 'idle';
  const actions = (
    <div className="hidden sm:flex items-center gap-1">
      <button type="button" className="btn !h-8" onClick={() => fileRef.current?.click()} title="Open inputs from a file">
        <FolderOpen className="w-3.5 h-3.5" />
        Open
      </button>
      <button type="button" className="btn !h-8" onClick={saveFile} title="Save the inputs to a file">
        <Save className="w-3.5 h-3.5" />
        Save
      </button>
      <button type="button" className="btn !h-8" onClick={() => confirm('Reset all inputs to the defaults?') && setInput(DEFAULT_INPUT)} title="Reset all inputs to the defaults">
        <RotateCcw className="w-3.5 h-3.5" />
      </button>
      <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => e.target.files?.[0] && openFile(e.target.files[0]).finally(() => (e.target.value = ''))} />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 font-sans flex flex-col">
      {/* the PDF report is hidden for now: pass onReport={() => setShowReport(true)} to show its button again */}
      <AppHeader name="PedTruss" onAbout={() => setShowAbout(true)} actions={actions} />
      <main className="flex-1 max-w-7xl w-full mx-auto p-3">
        {loadNotes.length > 0 && (
          <div className="mb-3">
            <Banner kind="warning" title="Saved inputs were updated on loading: please review" items={loadNotes}>
              <button type="button" className="btn !h-7 mt-1" onClick={() => setLoadNotes([])}>
                Dismiss
              </button>
            </Banner>
          </div>
        )}
        <div className="tab-grid">
          <fieldset className="input-column scroll-thin" disabled={solving} style={{ opacity: solving ? 0.6 : 1 }}>
            <InputPanels input={input} set={set} model={model} onOptimise={onOptimise} optimiseLog={optLog} solving={solving} results={results} />
          </fieldset>
          <div className="results-column">
            <div className="h-[560px] lg:h-[calc(100vh-330px)] lg:min-h-[420px] lg:max-h-[900px]">
              <Viewer3D
                model={model}
                results={results}
                selected={selected}
                onSelect={setSelected}
                solveState={solveState}
                progress={progress}
                onSolve={solve}
                onCancel={cancel}
                blockedReason={blocked}
                captureRef={captureRef}
              />
            </div>
            <Results model={model} input={input} results={results} stale={stale} solving={solving} error={error} selected={selected} onSelect={setSelected} />
          </div>
        </div>
      </main>
      {showAbout && (
        <Modal title="About" variant="page" onClose={() => setShowAbout(false)}>
          <AboutPage />
        </Modal>
      )}
      {showReport && (
        <ReportDialog
          fields={REPORT_INFO_FIELDS}
          info={info}
          setInfo={setInfo}
          onGenerate={async () => {
            if (!results) return 'Solve the model before generating the report.';
            await generateReport({ input, model, results, image: captureRef.current?.() ?? null }, info);
          }}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}
