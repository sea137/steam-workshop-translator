import { watchSteamDocument } from './lifecycle';

export default async function main() {
  if (window.top !== window) return;
  if (document.readyState === 'loading') await new Promise<void>(resolve =>
    document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }));
  watchSteamDocument(document, {
    translate: text => backend.translateText(text), clearCache: () => backend.clearTranslationCache(),
    translateBatch: (texts, provider) => backend.translateTexts(JSON.stringify({ texts, provider: provider || 'auto' })),
    importDictionary: payload => backend.importDictionary(payload),
    prepareOffline: () => backend.prepareOffline(),
  });
}
