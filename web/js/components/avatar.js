import { h } from '../lib/dom.js';

// Profile photo or the first letter of the name. The photo keeps the same URL when replaced, so a version is added
// on the client to show the new one at once (the database keeps only the clean URL).
let version = Date.now();
export const bumpAvatar = () => { version = Date.now(); };
export function Avatar(user, size = 44, cls = 'avatar') {
  const box = h('span', { class: cls, style: `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.4)}px`, 'aria-hidden': 'true' });
  if (user?.avatarUrl) { const img = new Image(); img.alt = ''; img.width = size; img.height = size; img.className = 'avatar-img'; img.onerror = () => { img.remove(); box.textContent = (user.name || '?').trim()[0]?.toUpperCase() || '?'; }; img.src = `${user.avatarUrl}?v=${version}`; box.append(img); }
  else box.textContent = (user?.name || '?').trim()[0]?.toUpperCase() || '?';
  return box;
}
