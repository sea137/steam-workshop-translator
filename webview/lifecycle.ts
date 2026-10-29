import { isSupportedSteamDocument, mountTranslator, Translate, TranslateBatch } from './translator';

type Services = {
  translate: Translate;
  clearCache: () => Promise<unknown>;
  translateBatch: TranslateBatch;
  importDictionary: (payload: string) => Promise<unknown>;
  prepareOffline?: () => Promise<unknown>;
};

/** The library opens news in-place, without a URL change or a WebKit navigation. */
export function watchSteamDocument(doc: Document, services: Services) {
  const win = doc.defaultView!;
  let cleanup: (() => void) | undefined;
  let previous = '';
  let disposed = false;
  let pending: ReturnType<typeof setTimeout> | undefined;
  const sync = () => {
    if (disposed) return;
    const supported = isSupportedSteamDocument(doc);
    if (cleanup && (!supported || previous !== doc.URL || !doc.querySelector('#swt-panel'))) {
      cleanup(); cleanup = undefined;
    }
    previous = doc.URL;
    if (supported && !cleanup) cleanup = mountTranslator(doc, services.translate, services.clearCache,
      services.translateBatch, { importDictionary: services.importDictionary, prepareOffline: services.prepareOffline });
  };
  const observer = new win.MutationObserver(changes => {
    if (changes.every(c => (c.target as Element).closest?.('[data-swt-owned]'))) return;
    if (pending !== undefined) return;
    pending = setTimeout(() => { pending = undefined; sync(); }, 80);
  });
  observer.observe(doc.body, { childList: true, subtree: true });
  const timer = setInterval(sync, 1200);
  sync();
  const stop = () => {
    disposed = true; clearInterval(timer); clearTimeout(pending); observer.disconnect(); cleanup?.();
    win.removeEventListener('pagehide', stop);
  };
  win.addEventListener('pagehide', stop, { once: true });
  return stop;
}
