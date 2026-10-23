/// <reference lib="webworker" />
import { runAnalysis } from './analysis';
import { optimiseSections } from './optimise';
import type { BridgeInput } from './types';

// tells the app that this script has loaded (an error before this is a failure to load it)
self.postMessage({ ready: true });

self.onmessage = (ev: MessageEvent<{ id: number; input: BridgeInput; kind?: 'solve' | 'optimise' }>) => {
  const { id, input, kind } = ev.data;
  const progress = (msg: string) => self.postMessage({ id, progress: msg });
  try {
    if (kind === 'optimise') {
      const opt = optimiseSections(input, 0.9, 4, progress);
      // final analysis with the selected sections
      const { results } = runAnalysis({ ...input, sections: opt.sections }, (m) => progress(`Final analysis: ${m}`));
      self.postMessage({ id, results, optimised: opt });
    } else {
      const { results } = runAnalysis(input, progress);
      self.postMessage({ id, results });
    }
  } catch (e) {
    console.error(e);
    // the message with where it happened, so that a report identifies the fault
    const where = e instanceof Error && e.stack ? e.stack.split('\n').find((l) => /\.(ts|js)/.test(l))?.trim() : undefined;
    self.postMessage({ id, error: `${e instanceof Error ? e.message : String(e)}${where ? ` [${where.replace(/^at\s+/, '')}]` : ''}` });
  }
};
