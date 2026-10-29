// One bridge call at a time within this frontend runtime, including across Steam documents.
// Cancelling the caller cannot stop native inference: keep the slot until it actually settles.
type Job = { start: () => void; signal: AbortSignal; reject: (reason: unknown) => void; cancel: () => void };
const waiting: Job[] = [];
let active = false;
const cancelled = () => new Error('已取消本次翻译。');

function drain() {
  if (active) return;
  const job = waiting.shift();
  if (!job) return;
  if (job.signal.aborted) { job.cancel(); drain(); return; }
  active = true; job.start();
}

export function queueRequest<T>(task: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(cancelled()); return; }
    const job: Job = { signal, reject, cancel: () => {
      const index = waiting.indexOf(job);
      if (index >= 0) { waiting.splice(index, 1); signal.removeEventListener('abort', job.cancel); }
      reject(cancelled());
    }, start: () => {
      let result: Promise<T>;
      try { result = task(); } catch (error) { result = Promise.reject(error); }
      result.then(resolve, reject).finally(() => {
        signal.removeEventListener('abort', job.cancel); active = false; drain();
      });
    } };
    signal.addEventListener('abort', job.cancel, { once: true });
    waiting.push(job); drain();
  });
}
