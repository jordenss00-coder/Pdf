// Tema: varsayılan Windows/tarayıcı ayarıdır. Düğme o an görünen temanın tersine geçer;
// bu sistem ayarıyla aynıysa sabitleme kaldırılır (index.html ilk boyamadan önce uygular).
import { icon } from "./ui.js";

const KEY = "pdf-theme";
const media = matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set();

function stored() {
  try { const v = localStorage.getItem(KEY); return v === "light" || v === "dark" ? v : null; } catch { return null; }
}
const system = () => (media.matches ? "dark" : "light");
export const current = () => stored() || system();
export const followsSystem = () => !stored();

function apply(pin) {
  const root = document.documentElement;
  if (pin) root.dataset.theme = pin; else delete root.dataset.theme;
  document.querySelector('meta[name="color-scheme"]').content = pin || "light dark";
  listeners.forEach((fn) => fn());
}

export function toggleTheme() {
  const next = current() === "dark" ? "light" : "dark";
  const pin = next === system() ? null : next;
  try { if (pin) localStorage.setItem(KEY, pin); else localStorage.removeItem(KEY); } catch { /* depolama kapalı */ }
  apply(pin);
}

export const nextLabel = () => (current() === "dark" ? "Açık temaya geç" : "Koyu temaya geç");

export function onThemeChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

media.addEventListener("change", () => listeners.forEach((fn) => fn()));

export function mountThemeButton(btn) {
  const sync = () => {
    btn.replaceChildren(icon(current() === "dark" ? "sun" : "moon"));
    btn.title = nextLabel();
    btn.setAttribute("aria-label", nextLabel());
  };
  btn.addEventListener("click", toggleTheme);
  onThemeChange(sync);
  sync();
}
