// Light / dark: follows the system until the user picks one; the pick is remembered in this browser only.
const KEY = 'flw-theme';
const safe = (fn) => { try { return fn(); } catch { return null; } };
export const currentTheme = () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
export function setTheme(t) { document.documentElement.dataset.theme = t; safe(() => localStorage.setItem(KEY, t)); }
export function initTheme() { const t = safe(() => localStorage.getItem(KEY)); if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t; }
// Saved account preference: 'auto' follows the system again.
export function applyThemePref(pref) { if (pref === 'light' || pref === 'dark') setTheme(pref); else { delete document.documentElement.dataset.theme; safe(() => localStorage.removeItem(KEY)); } }
