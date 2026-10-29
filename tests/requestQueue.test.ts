import { test, expect } from 'bun:test';
import { queueRequest } from '../webview/requestQueue';
const tick = () => new Promise(resolve => setTimeout(resolve, 5));

test('cancelled in-flight request keeps its slot until native work settles', async () => {
  const first = new AbortController(), next = new AbortController();
  let release!: (v: number) => void, calls = 0;
  const a = queueRequest(() => { calls++; return new Promise<number>(r => release = r); }, first.signal);
  const error = a.catch(e => e.message);
  first.abort();
  const b = queueRequest(async () => { calls++; return 2; }, next.signal);
  expect(await error).toContain('已取消'); await tick(); expect(calls).toBe(1);
  release(1); expect(await b).toBe(2); expect(calls).toBe(2);
});

test('queue recovers after rejected native work and cancels pending callers promptly', async () => {
  const controller = new AbortController(), pending = new AbortController();
  let release!: (v: unknown) => void;
  const a = queueRequest(() => new Promise(r => release = r), controller.signal);
  const b = queueRequest(async () => { throw new Error('must not dispatch'); }, pending.signal).catch(e => e.message);
  pending.abort(); expect(await b).toContain('已取消');
  release(1); await a;
  await expect(queueRequest(async () => { throw new Error('network'); }, controller.signal)).rejects.toThrow('network');
  expect(await queueRequest(async () => 3, controller.signal)).toBe(3);
});
