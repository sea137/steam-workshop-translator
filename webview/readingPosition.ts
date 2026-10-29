function scrollSurface(el: Element, doc: Document): Element | null {
  for (let p = el.parentElement; p && p !== doc.body && p !== doc.documentElement; p = p.parentElement) {
    const overflow = doc.defaultView?.getComputedStyle(p).overflowY || '';
    if (/(auto|scroll|overlay)/.test(overflow) && p.scrollHeight > p.clientHeight) return p;
  }
  return doc.scrollingElement;
}

export function readingDistance(el: Element): number {
  const doc = el.ownerDocument, win = doc.defaultView;
  const rect = el.getBoundingClientRect(), surface = scrollSurface(el, doc);
  const clip = surface && surface !== doc.scrollingElement ? surface.getBoundingClientRect() : null;
  const top = Math.max(0, clip?.top ?? 0), bottom = Math.min(win?.innerHeight ?? 0, clip?.bottom ?? Infinity);
  return rect.bottom < top ? top - rect.bottom : rect.top > bottom ? rect.top - bottom : 0;
}

// Capture immediately before synchronous DOM writes. Native scroll anchoring may have
// already compensated by the time we measure again; apply only the remaining delta.
export function keepReadingPosition(doc: Document, candidates: Element[], write: () => void) {
  const win = doc.defaultView;
  let anchor: Element | undefined, surface: Element | null = null, top = 0;
  if (win) for (const el of candidates) {
    if (!el.isConnected) continue;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    const scroller = scrollSurface(el, doc);
    const clip = scroller && scroller !== doc.scrollingElement ? scroller.getBoundingClientRect() : null;
    const upper = Math.max(0, clip?.top ?? 0), lower = Math.min(win.innerHeight, clip?.bottom ?? win.innerHeight);
    if (rect.bottom <= upper || rect.top >= lower) continue;
    if (!anchor || (rect.top >= upper && (top < upper || rect.top < top))) {
      anchor = el; surface = scroller; top = rect.top;
    }
  }
  write();
  if (!anchor?.isConnected || !surface?.isConnected) return;
  const delta = anchor.getBoundingClientRect().top - top;
  if (!Number.isFinite(delta) || Math.abs(delta) < 1) return;
  const previous = (surface as HTMLElement).style.scrollBehavior;
  (surface as HTMLElement).style.scrollBehavior = 'auto';
  surface.scrollTop += delta;
  (surface as HTMLElement).style.scrollBehavior = previous;
}
