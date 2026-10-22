import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AnalysisResults } from './analysis';
import type { OptimiseResult } from './optimise';
import type { BridgeInput } from './types';

/**
 * Runs the analysis in a Web Worker on request (Solve). Results are kept with the inputs they were solved for;
 * after an input change they are reported as out of date (null) until the next solve.
 */
export function useAnalysis(input: BridgeInput) {
  const key = useMemo(() => JSON.stringify(input), [input]);
  const [solved, setSolved] = useState<{ key: string; results: AnalysisResults } | null>(null);
  const [solving, setSolving] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const worker = useRef<Worker | null>(null);
  const reqId = useRef(0);
  const inputRef = useRef(input);
  inputRef.current = input;

  useEffect(() => () => worker.current?.terminate(), []);

  const cancel = useCallback(() => {
    worker.current?.terminate();
    worker.current = null;
    setSolving(false);
    setProgress('');
  }, []);

  /** Runs the analysis, or (optimise) refines the sections and then analyses; onOptimised receives the sections. */
  const run = useCallback((kind: 'solve' | 'optimise', onOptimised?: (r: OptimiseResult) => void) => {
    worker.current?.terminate();
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    const id = ++reqId.current;
    let solveKey = JSON.stringify(inputRef.current);
    setSolving(true);
    setError(null);
    setProgress('Starting');
    w.onmessage = (ev: MessageEvent<{ id: number; progress?: string; results?: AnalysisResults; optimised?: OptimiseResult; error?: string }>) => {
      if (ev.data.id !== id) return;
      if (ev.data.progress) return setProgress(ev.data.progress);
      if (ev.data.optimised) {
        // the results belong to the inputs with the optimised sections
        solveKey = JSON.stringify({ ...inputRef.current, sections: ev.data.optimised.sections });
        onOptimised?.(ev.data.optimised);
      }
      if (ev.data.results) setSolved({ key: solveKey, results: ev.data.results });
      else setError(ev.data.error ?? 'Unknown solver error');
      setSolving(false);
      setProgress('');
      w.terminate();
      if (worker.current === w) worker.current = null;
    };
    w.onerror = (ev) => {
      setError(ev.message || 'The analysis failed.');
      setSolving(false);
      w.terminate();
    };
    w.postMessage({ id, input: inputRef.current, kind });
  }, []);
  const solve = useCallback(() => run('solve'), [run]);
  const optimise = useCallback((onOptimised: (r: OptimiseResult) => void) => run('optimise', onOptimised), [run]);

  const current = solved && solved.key === key ? solved.results : null;
  return { results: current, stale: !!solved && solved.key !== key, solving, progress, error, solve, optimise, cancel };
}
