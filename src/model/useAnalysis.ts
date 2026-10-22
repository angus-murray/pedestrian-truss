import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AnalysisResults } from './analysis';
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

  const solve = useCallback(() => {
    worker.current?.terminate();
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    const id = ++reqId.current;
    const solveKey = JSON.stringify(inputRef.current);
    setSolving(true);
    setError(null);
    setProgress('Starting');
    w.onmessage = (ev: MessageEvent<{ id: number; progress?: string; results?: AnalysisResults; error?: string }>) => {
      if (ev.data.id !== id) return;
      if (ev.data.progress) return setProgress(ev.data.progress);
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
    w.postMessage({ id, input: inputRef.current });
  }, []);

  const current = solved && solved.key === key ? solved.results : null;
  return { results: current, stale: !!solved && solved.key !== key, solving, progress, error, solve, cancel };
}
