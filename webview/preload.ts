import { isSupportedSteamURL, mountTranslator } from './translator';

export default async function main() {
  if (window.top !== window) return;
  if (document.readyState === 'loading') await new Promise<void>(resolve =>
    document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }));
  let cleanup: (() => void) | undefined;
  let previous = '';
  const sync = () => {
    if (location.href === previous) return;
    previous = location.href;
    cleanup?.(); cleanup = undefined;
    if (isSupportedSteamURL(location.href)) cleanup = mountTranslator(document,
      text => backend.translateText(text), () => backend.clearTranslationCache(),
      (texts, provider) => backend.translateTexts(JSON.stringify({ texts, provider: provider || 'auto' })),
      { importDictionary: payload => backend.importDictionary(payload) });
  };
  sync();
  // Covers React navigation without replacing Steam's history functions.
  const timer = setInterval(sync, 1200);
  window.addEventListener('pagehide', () => { clearInterval(timer); cleanup?.(); }, { once: true });
}
