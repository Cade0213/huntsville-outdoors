// Shared UI helpers: icons, per-browser storage, theme, toasts, recent searches and saved places.
// Loaded first, before every other script, and depends on none of them. Nothing here touches
// project data — it only remembers what this visitor did, in this browser.

// ---------- Icons ----------
// One stroke style for the whole site (24px grid, 1.8 stroke), so nothing depends on how a
// platform draws emoji. `icon()` returns markup; pass the pixel size you want.
const ICON_PATHS = {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  locate: '<path d="M20.5 3.5 3.5 10.6l6.7 3.2 3.2 6.7z"/>',
  hunt: '<circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v5M12 16.5v5M2.500 12h5M16.500 12h5"/>',
  fish: '<path d="M7 12c2.200-3.600 5.400-5.200 8.200-5.200 2.600 0 4.600 1.800 5.800 5.200-1.200 3.400-3.200 5.200-5.800 5.200-2.800 0-6-1.600-8.200-5.200z"/><path d="M7 12 3 8.500v7L7 12z"/><circle cx="16.600" cy="10.800" r="0.600" fill="currentColor"/>',
  star: '<path d="M12 3.600l2.600 5.300 5.800.800-4.200 4.100 1 5.800L12 16.900l-5.200 2.700 1-5.800-4.200-4.100 5.800-.800z"/>',
  starFilled: '<path fill="currentColor" d="M12 3.600l2.600 5.300 5.800.800-4.200 4.100 1 5.800L12 16.900l-5.200 2.700 1-5.800-4.200-4.100 5.800-.800z"/>',
  share: '<path d="M12 15V3.500M7.500 8 12 3.500 16.500 8M5 12.500v6A1.500 1.500 0 0 0 6.500 20h11a1.500 1.500 0 0 0 1.500-1.500v-6"/>',
  copy: '<rect x="8.500" y="8.500" width="11" height="11" rx="2"/><path d="M15.500 8.500v-2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
  directions: '<path d="M12 2.800 21.200 12 12 21.200 2.800 12z"/><path d="M9 14.500v-2.200A1.300 1.300 0 0 1 10.300 11H15M13 8.800l2.200 2.200-2.200 2.200"/>',
  zoom: '<path d="M4 9V5.500A1.500 1.500 0 0 1 5.500 4H9M15 4h3.500A1.500 1.500 0 0 1 20 5.500V9M20 15v3.500a1.500 1.500 0 0 1-1.500 1.500H15M9 20H5.500A1.500 1.500 0 0 1 4 18.500V15"/><circle cx="12" cy="12" r="2.500"/>',
  external: '<path d="M14 4.500h5.500V10M19.500 4.500 11 13M17.500 13.500V18a1.500 1.500 0 0 1-1.500 1.500H6A1.500 1.500 0 0 1 4.500 18V8A1.500 1.500 0 0 1 6 6.500h4.500"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  forward: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.500V5M12 19v2.500M2.500 12H5M19 12h2.500M5.300 5.300 7 7M17 17l1.700 1.700M18.700 5.300 17 7M7 17l-1.700 1.700"/>',
  moon: '<path d="M20.400 14.300A8.600 8.600 0 0 1 9.700 3.600a8.500 8.500 0 1 0 10.700 10.700z"/>',
  calendar: '<path d="M7 3v3M17 3v3M4 9h16M5.500 5.500h13A1.500 1.500 0 0 1 20 7v12a1.500 1.500 0 0 1-1.500 1.500h-13A1.500 1.500 0 0 1 4 19V7a1.500 1.500 0 0 1 1.500-1.500z"/>',
  check: '<path d="M5 12.500l4.500 4.500L19 7.500"/>',
  info: '<circle cx="12" cy="12" r="9.200"/><circle cx="12" cy="7.800" r="0.700" fill="currentColor"/><path d="M12 11v6.200"/>',
  alert: '<path d="M12 3.500 2.800 19.500h18.400L12 3.500z"/><path d="M12 10v4.500"/><circle cx="12" cy="17" r="0.600" fill="currentColor"/>',
  clock: '<circle cx="12" cy="12" r="8.500"/><path d="M12 7.500V12l3 2"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  pin: '<path d="M12 21s-6.500-5.800-6.500-11a6.500 6.500 0 0 1 13 0c0 5.200-6.500 11-6.500 11z"/><circle cx="12" cy="10" r="2.400"/>',
  phone: '<path d="M6.500 3.500h3l1.500 4-2 1.300a11 11 0 0 0 5.200 5.200l1.300-2 4 1.500v3a2 2 0 0 1-2.200 2A16 16 0 0 1 4.500 5.700a2 2 0 0 1 2-2.200z"/>',
  map: '<path d="M9 3.500 3.500 6v14.500L9 18l6 2.500 5.500-2.500V3.500L15 6 9 3.500zM9 3.500V18M15 6v14.500"/>',
  license: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.500" cy="11" r="2"/><path d="M5.500 16c.600-1.500 1.700-2.200 3-2.200s2.400.700 3 2.200M14.500 9.500h4M14.500 13h4"/>',
  list: '<path d="M8.500 6.500h11M8.500 12h11M8.500 17.500h11"/><circle cx="4.500" cy="6.500" r="0.700" fill="currentColor"/><circle cx="4.500" cy="12" r="0.700" fill="currentColor"/><circle cx="4.500" cy="17.500" r="0.700" fill="currentColor"/>',
};

function icon(name, size = 18, cls = "") {
  return `<svg class="ico${cls ? ` ${cls}` : ""}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON_PATHS[name] || ""}</svg>`;
}

// Static markup in index.html asks for an icon with <span data-icon="name" data-size="18">, so the
// paths live in one place. Run once at load; safe to call again on a subtree.
function hydrateIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    if (!el.firstChild) el.innerHTML = icon(el.dataset.icon, Number(el.dataset.size) || 18);
  });
}

// Arrow keys, Home and End move between the tabs of a tablist and activate the one they land on.
// This is the roving-tabindex pattern: only the selected tab is in the Tab order, so without it
// the other tabs cannot be reached from the keyboard at all.
function bindTabKeys(list, selector, activate) {
  list.addEventListener("keydown", (e) => {
    const tabs = [...list.querySelectorAll(selector)];
    const at = tabs.indexOf(document.activeElement);
    if (at < 0) return;
    const to = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (to == null) return;
    e.preventDefault();
    const tab = tabs[(to + tabs.length) % tabs.length];
    activate(tab);
    tab.focus();
  });
}

// ---------- Storage ----------
// The app is expected to run from file:// and in private windows, where storage can throw. Every
// read falls back and every write is allowed to fail: nothing stored here is needed to render.
function loadStored(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function saveStored(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// ---------- Theme ----------
// index.html sets <html data-theme> before first paint (a stored choice wins, otherwise the OS
// setting). This wires the toggle and keeps following the OS until the visitor picks a side.
const THEME_KEY = "plw.theme";
const THEME_CHROME = "#1f3325"; // the masthead is forest green in both themes

function storedTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : null;
  } catch {
    return null;
  }
}

function currentTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function applyTheme(theme, persist = false) {
  document.documentElement.dataset.theme = theme;
  const btn = document.getElementById("theme-toggle");
  if (btn) {
    const next = theme === "dark" ? "light" : "dark";
    btn.setAttribute("aria-label", `Switch to ${next} theme`);
    btn.title = `Switch to ${next} theme`;
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_CHROME);
  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {}
  }
}

function initTheme() {
  applyTheme(currentTheme());
  document.getElementById("theme-toggle")?.addEventListener("click", () => applyTheme(currentTheme() === "dark" ? "light" : "dark", true));
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", (e) => {
    if (!storedTheme()) applyTheme(e.matches ? "dark" : "light");
  });
}

// ---------- Toasts ----------
// One polite live region for short confirmations ("Link copied") and soft failures.
let toastTimer = null;
function showToast(message, ms = 3600) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  // Next frame, so the transition runs from the hidden state.
  requestAnimationFrame(() => el.classList.add("is-shown"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove("is-shown");
    toastTimer = setTimeout(() => (el.hidden = true), 220);
  }, ms);
}

// Clipboard with a fallback for file:// and other non-secure contexts, where the async API is absent.
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {}
    ta.remove();
    return ok;
  }
}

// ---------- Recent searches & saved places ----------
// Both are per-browser conveniences. A saved place keeps the search it was found in, because
// places come from live lookups: getting back to one means re-running that search.
const RECENT_KEY = "plw.recentSearches";
const RECENT_MAX = 6;
const SAVED_KEY = "plw.savedPlaces";
const SAVED_MAX = 40;
const SEARCH_RADII = [10, 25, 50, 100];

function validSearch(s) {
  return !!s && typeof s.label === "string" && !!s.label && Array.isArray(s.center) && s.center.length === 2 &&
    s.center.every(Number.isFinite) && SEARCH_RADII.includes(s.radius);
}

function plainSearch(s) {
  return { label: s.label, center: [s.center[0], s.center[1]], state: s.state || null, radius: s.radius };
}

function recentSearches() {
  const list = loadStored(RECENT_KEY, []);
  return Array.isArray(list) ? list.filter(validSearch) : [];
}

function rememberSearch(search) {
  if (!validSearch(search)) return;
  const rest = recentSearches().filter((s) => s.label !== search.label);
  saveStored(RECENT_KEY, [plainSearch(search), ...rest].slice(0, RECENT_MAX));
}

function clearRecentSearches() {
  saveStored(RECENT_KEY, []);
}

function savedPlaces() {
  const list = loadStored(SAVED_KEY, []);
  return Array.isArray(list) ? list.filter((p) => p && typeof p.id === "string" && typeof p.name === "string" && validSearch(p.search)) : [];
}

function isSavedPlace(id) {
  return savedPlaces().some((p) => p.id === id);
}

// Returns true when the place is saved after the call, false when it was removed.
function toggleSavedPlace(place, search) {
  const list = savedPlaces();
  const at = list.findIndex((p) => p.id === place.id);
  if (at >= 0) {
    list.splice(at, 1);
    saveStored(SAVED_KEY, list);
    return false;
  }
  list.unshift({
    id: place.id,
    name: place.name,
    typeLabel: place.typeLabel || "",
    source: place.source || null, // "curated" / "state" are confirmed; it picks the row's icon style
    activities: place.activities || [],
    state: place.state || search.state || null,
    search: plainSearch(search),
    savedAt: new Date().toISOString(),
  });
  saveStored(SAVED_KEY, list.slice(0, SAVED_MAX));
  return true;
}

function removeSavedPlace(id) {
  saveStored(SAVED_KEY, savedPlaces().filter((p) => p.id !== id));
}

hydrateIcons();
initTheme();
