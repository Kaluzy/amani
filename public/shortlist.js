const KEY = 'amani:workbench:v1';
const LIMIT = 24;
let memory = [];
let persistent = true;
const valid = name => typeof name === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(name) && !name.split('/').some(part => part === '.' || part === '..');
export function savedNames() {
  if (typeof window === 'undefined') return [];
  if (!persistent) return [...memory];
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '[]');
    memory = Array.isArray(parsed) ? [...new Set(parsed.filter(valid))].slice(0, LIMIT) : [];
  } catch { persistent = false; }
  return [...memory];
}
export function storageIsPersistent() { return persistent; }
export function setSaved(name, saved) {
  if (!valid(name)) return { ok: false, message: 'This repository name is not valid.' };
  const names = savedNames().filter(item => item !== name);
  if (saved && names.length >= LIMIT) return { ok: false, message: 'Your workbench holds 24 repositories. Remove one before saving another.' };
  if (saved) names.push(name);
  memory = names;
  try { localStorage.setItem(KEY, JSON.stringify(names)); persistent = true; } catch { persistent = false; }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('amani:saved-change'));
  return { ok: true, message: persistent ? (saved ? 'Saved to your workbench on this browser.' : 'Removed from your workbench.') : 'Browser storage is unavailable. Changes last until this tab is reloaded or closed.' };
}
export function refreshSaveButtons(root = document) {
  const names = savedNames();
  for (const button of root.querySelectorAll('[data-save-repo]')) {
    const saved = names.includes(button.dataset.saveRepo);
    button.setAttribute('aria-pressed', String(saved));
    button.textContent = saved ? '✓ Saved to workbench' : '＋ Save to workbench';
  }
  const count = document.getElementById('savedCount');
  if (count) count.textContent = String(names.length);
}
