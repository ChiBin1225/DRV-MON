// ============================================================
// utils.js — pure helper functions, no DOM/state coupling
// ============================================================

/** Format large numbers with K/M/B/T suffix */
export function fNum(n, digits = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return '–';
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(digits) + 'T';
  if (abs >= 1e9)  return (n / 1e9).toFixed(digits) + 'B';
  if (abs >= 1e6)  return (n / 1e6).toFixed(digits) + 'M';
  if (abs >= 1e3)  return (n / 1e3).toFixed(digits) + 'K';
  return n.toFixed(digits);
}

/** Format a price with adaptive decimal precision (cheap coins need more decimals) */
export function fPrice(p) {
  if (p === null || p === undefined || Number.isNaN(p)) return '–';
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  if (p >= 1)    return p.toFixed(4);
  if (p >= 0.01) return p.toFixed(6);
  return p.toFixed(8);
}

export function fPct(p, digits = 2) {
  if (p === null || p === undefined || Number.isNaN(p)) return '–';
  const sign = p >= 0 ? '+' : '';
  return `${sign}${p.toFixed(digits)}%`;
}

export function clsForVal(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return 'c-dim';
  return v > 0 ? 'c-pos' : v < 0 ? 'c-neg' : 'c-dim';
}

export function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

/**
 * Flash a DOM node green/red briefly to indicate an up/down tick.
 *
 * Uses the Web Animations API instead of a CSS class toggle. A class-toggle
 * flash needs `void el.offsetWidth` to force a synchronous reflow before
 * re-adding the class (otherwise back-to-back ticks on the same cell don't
 * retrigger the animation) — with ~150 symbols ticking roughly once a
 * second, that's up to ~150 forced synchronous layout flushes per second,
 * which is real, measurable jank. `el.animate()` starts an independent,
 * compositor-driven animation on every call with no reflow needed, so
 * repeated ticks on the same cell just layer cleanly with no main-thread cost.
 */
const FLASH_KEYFRAMES = {
  1:  [{ backgroundColor: 'rgba(23,201,141,.28)' }, { backgroundColor: 'rgba(23,201,141,0)' }],
  '-1': [{ backgroundColor: 'rgba(242,69,90,.28)' }, { backgroundColor: 'rgba(242,69,90,0)' }],
};
export function flash(el, direction) {
  if (!el || typeof el.animate !== 'function') return;
  el.animate(FLASH_KEYFRAMES[direction > 0 ? 1 : -1], { duration: 500, easing: 'linear' });
}

/** Simple exponential backoff generator for reconnect logic */
export function backoffMs(attempt, base = 500, max = 20000) {
  return Math.min(max, base * 2 ** attempt) + Math.random() * 250;
}

/** Debounce helper for search inputs etc. */
export function debounce(fn, wait = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/** Tiny pub/sub event bus used to decouple modules */
export class EventBus {
  constructor() { this._h = new Map(); }
  on(evt, fn) {
    if (!this._h.has(evt)) this._h.set(evt, new Set());
    this._h.get(evt).add(fn);
    return () => this._h.get(evt)?.delete(fn);
  }
  emit(evt, payload) {
    this._h.get(evt)?.forEach((fn) => {
      try { fn(payload); } catch (e) { console.error(`[EventBus:${evt}]`, e); }
    });
  }
}
