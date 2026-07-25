// ============================================================
// utils.js — pure helpers used across every module. No DOM
// lookups here except the flash() animation itself, no state.
// ============================================================

/** Minimal pub/sub so modules never touch each other's DOM directly. */
export function createEventBus() {
  const listeners = new Map();
  return {
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(fn);
      return () => listeners.get(event)?.delete(fn);
    },
    emit(event, payload) {
      listeners.get(event)?.forEach((fn) => fn(payload));
    },
  };
}

export const bus = createEventBus();

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** 63984.6 -> "63,984.60" style, auto-decimals for small-cap coins */
export function fmtPrice(n) {
  if (n == null || Number.isNaN(n)) return '–';
  const abs = Math.abs(n);
  let decimals = 2;
  if (abs < 0.001) decimals = 8;
  else if (abs < 0.1) decimals = 6;
  else if (abs < 1) decimals = 4;
  else if (abs < 10) decimals = 3;
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** 1234567 -> "$1.23M", 950000000 -> "$950.00M", 7630000000 -> "$7.63B" */
export function fmtCompact(n, prefix = '$') {
  if (n == null || Number.isNaN(n)) return '–';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}${prefix}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${prefix}${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}${prefix}${(abs / 1e3).toFixed(2)}K`;
  return `${sign}${prefix}${abs.toFixed(2)}`;
}

export function fmtPct(n, withSign = true) {
  if (n == null || Number.isNaN(n)) return '–';
  const s = withSign && n > 0 ? '+' : '';
  return `${s}${n.toFixed(2)}%`;
}

export function pctClass(n) {
  if (n == null || Number.isNaN(n)) return '';
  return n > 0 ? 'c-pos' : n < 0 ? 'c-neg' : '';
}

/**
 * Flash an element green/red on update WITHOUT forcing synchronous
 * reflow (no class-toggle + offsetWidth trick). Uses the Web
 * Animations API — each call is an independent animation that runs
 * on the compositor and never blocks the main thread, so it stays
 * smooth even with ~150 elements ticking every second.
 */
const FLASH_KEYFRAMES = {
  up: [
    { backgroundColor: 'rgba(46, 213, 115, 0.35)' },
    { backgroundColor: 'rgba(46, 213, 115, 0)' },
  ],
  down: [
    { backgroundColor: 'rgba(255, 71, 87, 0.35)' },
    { backgroundColor: 'rgba(255, 71, 87, 0)' },
  ],
};
export function flash(el, direction) {
  if (!el || typeof el.animate !== 'function') return;
  el.animate(FLASH_KEYFRAMES[direction] || FLASH_KEYFRAMES.up, {
    duration: 650,
    easing: 'ease-out',
  });
}

export function nowHHMMSS() {
  return new Date().toLocaleTimeString('vi-VN', { hour12: false });
}

/** Simple async sleep for batched/paced REST polling loops. */
export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
