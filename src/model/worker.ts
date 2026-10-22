/// <reference lib="webworker" />
import { runAnalysis } from './analysis';
import type { BridgeInput } from './types';

self.onmessage = (ev: MessageEvent<{ id: number; input: BridgeInput }>) => {
  const { id, input } = ev.data;
  try {
    const { results } = runAnalysis(input, (msg) => self.postMessage({ id, progress: msg }));
    self.postMessage({ id, results });
  } catch (e) {
    console.error(e);
    self.postMessage({ id, error: e instanceof Error ? e.message : String(e) });
  }
};
