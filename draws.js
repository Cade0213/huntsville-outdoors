// Hunting Draws tab: a filterable, pinnable view of limited-entry draw deadlines.
// Data lives in draws-data.js. Date helpers (parseDay, TODAY, daysBetween, formatDay) and
// escapeHtml come from seasons.js / script.js — this file adds no date parsing of its own.
//
// Rendering follows the Big Game tab's pattern: initDraws() builds every row, tile and bar ONCE,
// and applyDraws() only toggles `hidden`, reorders (FLIP-animated) and updates counts. Nothing is
// re-rendered with innerHTML on a filter change, so an expanded row, keyboard focus and the budget
// slider all survive every keystroke. Two small blocks are rebuilt: the hero (only when the next
// deadline changes; its pin button is otherwise updated in place) and the plan, whose unpin
// buttons hand focus to a neighbour after a rebuild so keyboard users are never dropped.

const SOON_DAYS_DRAW = 30; // "closing soon" window, mirrors SOON_DAYS in the season calendar
const DRAW_RING_DAYS = 120; // a countdown ring is full at this many days out

const drawFilters = { state: "all", species: "all", month: "all", residency: "all", text: "", maxCost: 4, sort: "deadline" };
const drawUi = { pinned: [], heroId: undefined }; // pinned: draw ids in pin order; heroId: draw the hero shows
const DRAW_PIN_KEY = "plw.drawPins";

const $d = (id) => document.getElementById(id);

// Tile-grid map of the U.S., [column, row]. Layout only — it carries no data of its own.
const DRAW_TILES = {
  AK: [0, 0], ME: [11, 0],
  WI: [6, 1], VT: [10, 1], NH: [11, 1],
  WA: [1, 2], ID: [2, 2], MT: [3, 2], ND: [4, 2], MN: [5, 2], IL: [6, 2], MI: [7, 2], NY: [9, 2], MA: [10, 2],
  OR: [1, 3], NV: [2, 3], WY: [3, 3], SD: [4, 3], IA: [5, 3], IN: [6, 3], OH: [7, 3], PA: [8, 3], NJ: [9, 3], CT: [10, 3], RI: [11, 3],
  CA: [1, 4], UT: [2, 4], CO: [3, 4], NE: [4, 4], MO: [5, 4], KY: [6, 4], WV: [7, 4], VA: [8, 4], MD: [9, 4], DE: [10, 4],
  AZ: [2, 5], NM: [3, 5], KS: [4, 5], AR: [5, 5], TN: [6, 5], NC: [7, 5], SC: [8, 5], DC: [9, 5],
  OK: [4, 6], LA: [5, 6], MS: [6, 6], AL: [7, 6], GA: [8, 6],
  HI: [0, 7], TX: [4, 7], FL: [9, 7],
};

// ---------- Derived helpers ----------
function drawDeadline(draw) {
  return parseDay(draw.deadline);
}

// "closed" once the deadline has passed, "soon" inside SOON_DAYS_DRAW, else "open".
function drawStatus(draw) {
  const days = daysBetween(TODAY, drawDeadline(draw));
  if (days < 0) return { kind: "closed", days };
  if (days <= SOON_DAYS_DRAW) return { kind: "soon", days };
  return { kind: "open", days };
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// The next 12 months starting with the current one — the spine of the overview strip.
function upcomingMonths() {
  const out = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(TODAY.getFullYear(), TODAY.getMonth() + i, 1);
    out.push({ key: monthKey(d), date: d, label: formatDay(d, { month: "short" }), year: d.getFullYear() });
  }
  return out;
}

function oddsText(draw) {
  if (!draw.odds) return "Varies";
  const pct = draw.odds.pct * 100;
  return pct < 1 ? `~${pct.toFixed(1)}%` : `~${Math.round(pct)}%`;
}

// Odds bar width is scaled with a square root so the sub-1% lotteries stay visible.
function oddsBarPct(draw) {
  if (!draw.odds) return 0;
  return Math.max(2, Math.round(Math.sqrt(draw.odds.pct) * 100));
}

function costGlyphs(level) {
  const scale = COST_SCALE[level];
  if (!scale) return "";
  return `<span class="cost" role="img" aria-label="Cost: ${level} of 4 — ${escapeHtml(scale.name)}">
    <span class="cost-on">${scale.label}</span><span class="cost-off">${"$".repeat(4 - level)}</span>
  </span>`;
}

function drawById(id) {
  return HUNTING_DRAWS.find((d) => d.id === id);
}

const drawDate = (date, withYear = true) =>
  formatDay(date, withYear ? { month: "short", day: "numeric", year: "numeric" } : { month: "short", day: "numeric" });

// ---------- Filtering ----------
// `skip` names one filter to ignore, so the map, species chips and month bars can show how many
// draws each choice WOULD give you with everything else held as it is.
function drawMatches(d, skip) {
  const f = drawFilters;
  const q = f.text.trim().toLowerCase();
  if (skip !== "state" && f.state !== "all" && d.state !== f.state) return false;
  if (skip !== "species" && f.species !== "all" && d.species !== f.species) return false;
  if (skip !== "month" && f.month !== "all" && monthKey(drawDeadline(d)) !== f.month) return false;
  if (f.residency !== "all" && d.residency !== f.residency && d.residency !== "both") return false;
  if (d.cost > f.maxCost) return false;
  if (q && !`${d.state} ${STATES[d.state]?.name || ""} ${d.species} ${d.hunt} ${d.notes.join(" ")}`.toLowerCase().includes(q)) return false;
  return true;
}

function drawSortKey(a, b) {
  // Closed rows always fall to the bottom, whatever the sort.
  const ca = drawStatus(a).kind === "closed";
  const cb = drawStatus(b).kind === "closed";
  if (ca !== cb) return ca - cb;
  if (drawFilters.sort === "odds") {
    // "Varies" (odds: null) has no number to rank, so it goes last rather than pretending.
    if (!a.odds !== !b.odds) return !a.odds - !b.odds;
    if (a.odds && b.odds && a.odds.pct !== b.odds.pct) return b.odds.pct - a.odds.pct;
  }
  if (drawFilters.sort === "cost" && a.cost !== b.cost) return a.cost - b.cost;
  return drawDeadline(a) - drawDeadline(b);
}

function visibleDraws() {
  return HUNTING_DRAWS.filter((d) => drawMatches(d)).sort(drawSortKey);
}

// ---------- Pins (per-viewer convenience only) ----------
function loadDrawPins() {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAW_PIN_KEY) || "[]");
    // Rows get replaced when the dataset is updated, so drop any id that no longer exists.
    if (Array.isArray(saved)) drawUi.pinned = saved.filter((id) => drawById(id));
  } catch {}
}
function saveDrawPins() {
  try { localStorage.setItem(DRAW_PIN_KEY, JSON.stringify(drawUi.pinned)); } catch {}
}
function toggleDrawPin(id) {
  const i = drawUi.pinned.indexOf(id);
  if (i >= 0) drawUi.pinned.splice(i, 1);
  else drawUi.pinned.push(id);
  saveDrawPins();
  applyDraws();
}

// ---------- Pieces ----------
function drawStatusChip(draw) {
  const { kind, days } = drawStatus(draw);
  if (kind === "closed") return `<span class="chip chip-closed">Closed for ${DRAW_CYCLE}</span>`;
  if (kind === "soon") return `<span class="chip chip-soon">${days === 0 ? "Closes today" : `Closes in ${days} day${days === 1 ? "" : "s"}`}</span>`;
  return `<span class="chip chip-open">${days} days left</span>`;
}

// Countdown ring: fills with the time left until the deadline (full at DRAW_RING_DAYS out).
function drawRing(draw) {
  const { kind, days } = drawStatus(draw);
  const r = 17, circ = 2 * Math.PI * r;
  const frac = kind === "closed" ? 0 : Math.min(1, Math.max(0.03, days / DRAW_RING_DAYS));
  return `
    <span class="dw-ring ${kind}" role="img" aria-label="${kind === "closed" ? "Deadline passed" : `${days} days until the deadline`}">
      <svg viewBox="0 0 42 42" width="42" height="42" aria-hidden="true">
        <circle cx="21" cy="21" r="${r}" class="track"/>
        <circle cx="21" cy="21" r="${r}" class="fill" stroke-dasharray="${(frac * circ).toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90 21 21)"/>
      </svg>
      <span class="dw-ring-n">${kind === "closed" ? "—" : days}</span>
      <span class="dw-ring-u">${kind === "closed" ? "closed" : days === 1 ? "day" : "days"}</span>
    </span>`;
}

function drawOddsMeter(draw) {
  return `
    <span class="dw-odds ${draw.odds ? "" : "varies"}">
      <strong>${oddsText(draw)}</strong>
      <span class="dw-odds-bar" aria-hidden="true"><i style="width:${draw.odds ? oddsBarPct(draw) : 100}%"></i></span>
      <span class="dw-odds-k">draw odds</span>
    </span>`;
}

// Application window: opens → deadline, with today's position. Deadline-only when `opens` is null.
function drawWindow(draw) {
  const end = drawDeadline(draw);
  const start = draw.opens ? parseDay(draw.opens) : null;
  if (!start || start >= end) {
    return `<div class="dw-window only-deadline">
      <span>Application opening date not published</span>
      <span>Deadline <strong>${drawDate(end)}</strong></span>
    </div>`;
  }
  const total = daysBetween(start, end);
  const done = Math.min(total, Math.max(0, daysBetween(start, TODAY)));
  const pct = (done / total) * 100;
  const before = TODAY < start;
  const label = before ? `Opens in ${daysBetween(TODAY, start)} days`
    : TODAY > end ? "Window closed" : "Applications open now";
  return `
    <div class="dw-window">
      <div class="dw-window-bar" aria-hidden="true">
        <i style="width:${pct}%"></i>
        ${before || TODAY > end ? "" : `<b style="left:${pct}%"></b>`}
      </div>
      <div class="dw-window-labels">
        <span>Opens <strong>${drawDate(start, false)}</strong></span>
        <span class="dw-window-now">${label}</span>
        <span>Deadline <strong>${drawDate(end, false)}</strong></span>
      </div>
    </div>`;
}

function drawRow(draw) {
  const closed = drawStatus(draw).kind === "closed";
  const detailId = `dw-detail-${draw.id}`;
  return `
    <article class="dw-row ${closed ? "is-closed" : ""}" data-id="${escapeHtml(draw.id)}">
      <div class="dw-row-top">
        <button type="button" class="dw-row-main" aria-expanded="false" aria-controls="${detailId}">
          <span class="draw-state" aria-hidden="true">${escapeHtml(draw.state)}</span>
          <span class="dw-row-title">
            <strong>${escapeHtml(draw.species)}<span class="sr-only"> in ${escapeHtml(STATES[draw.state]?.name || draw.state)}</span></strong>
            <span>${escapeHtml(draw.hunt)} · ${drawDate(drawDeadline(draw), false)}</span>
          </span>
          ${drawRing(draw)}
          ${drawOddsMeter(draw)}
          ${costGlyphs(draw.cost)}
          <span class="dw-chev" aria-hidden="true"></span>
        </button>
        <button type="button" class="dw-pin" data-pin="${escapeHtml(draw.id)}" aria-pressed="false"
          aria-label="Pin ${escapeHtml(draw.state)} ${escapeHtml(draw.species)} to your plan">☆</button>
      </div>
      <div class="dw-detail" id="${detailId}" hidden>
        ${drawWindow(draw)}
        <dl class="dw-facts">
          <div><dt>Deadline</dt><dd>${drawDate(drawDeadline(draw))}</dd></div>
          <div><dt>Applies to</dt><dd>${draw.residency === "both" ? "Both" : draw.residency === "nonresident" ? "Nonresident" : "Resident"}</dd></div>
          <div><dt>Cost</dt><dd>${escapeHtml(COST_SCALE[draw.cost]?.name || "Not listed")}</dd></div>
        </dl>
        <p class="draw-odds-note">${escapeHtml(draw.oddsNote)}</p>
        <p class="draw-points">${escapeHtml(POINT_SYSTEMS[draw.points] || "")}</p>
        <div class="draw-tags">
          ${drawStatusChip(draw)}
          ${draw.notes.map((n) => `<span class="draw-note">${escapeHtml(n)}</span>`).join("")}
        </div>
        <p class="res-link"><a href="${escapeHtml(draw.url)}" target="_blank" rel="noopener">${escapeHtml(draw.agency)} &rarr;</a></p>
      </div>
    </article>`;
}

// ---------- Build once ----------
function buildDraws() {
  $d("draw-list").innerHTML = HUNTING_DRAWS.map(drawRow).join("");

  const cols = Math.max(...Object.values(DRAW_TILES).map(([c]) => c)) + 1;
  const rows = Math.max(...Object.values(DRAW_TILES).map(([, r]) => r)) + 1;
  const map = $d("dw-map");
  map.style.setProperty("--cols", cols);
  map.style.setProperty("--rows", rows);
  map.innerHTML = Object.entries(DRAW_TILES).map(([abbr, [c, r]]) => `
    <button type="button" class="dw-tile" data-state="${abbr}" style="grid-column:${c + 1};grid-row:${r + 1}"
      aria-pressed="false" title="${escapeHtml(STATES[abbr]?.name || abbr)}">
      <span>${abbr}</span><small></small>
    </button>`).join("");

  const species = [...new Set(HUNTING_DRAWS.map((d) => d.species))].sort();
  $d("dw-species").innerHTML = ["all", ...species].map((s) => `
    <button type="button" class="dw-sp" data-species="${escapeHtml(s)}" aria-pressed="false">
      ${s === "all" ? "All species" : escapeHtml(s)} <small></small>
    </button>`).join("");

  $d("draw-months").innerHTML = upcomingMonths().map((m) => `
    <button type="button" class="dw-month" data-draw-month="${m.key}" aria-pressed="false">
      <span class="dw-month-bar"><i></i><b></b></span>
      <span class="dw-month-name">${m.label}</span>
      <span class="dw-month-year">${String(m.year).slice(2)}</span>
    </button>`).join("");
}

// ---------- Apply filters in place ----------
function applyDraws() {
  const f = drawFilters;
  const list = visibleDraws();
  const ids = new Set(list.map((d) => d.id));
  const open = list.filter((d) => drawStatus(d).kind !== "closed");
  const next = open[0];

  // Rows: toggle, reorder, pin state.
  const container = $d("draw-list");
  const rows = new Map([...container.children].map((el) => [el.dataset.id, el]));
  const animate = window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
  const before = animate ? new Map([...rows].filter(([, el]) => !el.hidden).map(([id, el]) => [id, el.getBoundingClientRect().top])) : null;
  for (const [id, el] of rows) {
    el.hidden = !ids.has(id);
    const pinned = drawUi.pinned.includes(id);
    const pin = el.querySelector(".dw-pin");
    pin.setAttribute("aria-pressed", String(pinned));
    pin.textContent = pinned ? "★" : "☆";
    el.classList.toggle("is-pinned", pinned);
  }
  const order = [...list, ...HUNTING_DRAWS.filter((d) => !ids.has(d.id))];
  if (order.some((d, i) => container.children[i]?.dataset.id !== d.id)) {
    order.forEach((d) => container.appendChild(rows.get(d.id)));
    if (animate) {
      for (const [id, top] of before) {
        const el = rows.get(id);
        if (el.hidden) continue;
        const dy = top - el.getBoundingClientRect().top;
        if (dy) el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 280, easing: "cubic-bezier(.2,.8,.2,1)" });
      }
    }
  }
  $d("dw-none").hidden = list.length > 0;

  // Summary line.
  const hiddenVaries = f.sort === "odds" ? list.filter((d) => !d.odds).length : 0;
  $d("draw-summary").innerHTML = list.length
    ? `<strong>${list.length}</strong> of ${HUNTING_DRAWS.length} draws` +
      (f.state !== "all" ? ` in ${escapeHtml(STATES[f.state]?.name || f.state)}` : "") +
      (f.month !== "all" ? ` with a deadline in ${formatDay(parseDay(`${f.month}-01`), { month: "long", year: "numeric" })}` : "") +
      (hiddenVaries ? ` · ${hiddenVaries} with unpublished odds sorted last` : "") +
      `. Tap a row for the application window and details.`
    : "No draws match these filters.";

  // Hero: next deadline. Rebuilt only when the draw changes, so its buttons keep focus.
  const heroId = next ? next.id : null;
  if (heroId === drawUi.heroId && next) {
    const pinned = drawUi.pinned.includes(next.id);
    const btn = $d("dw-next").querySelector(".dw-next-pin");
    btn.setAttribute("aria-pressed", String(pinned));
    btn.textContent = pinned ? "★ Pinned" : "☆ Pin to plan";
  } else if (next) {
    drawUi.heroId = heroId;
    const { days, kind } = drawStatus(next);
    const pinned = drawUi.pinned.includes(next.id);
    $d("dw-next").innerHTML = `
      <span class="bg-k">Hunting Draws · next deadline${list.length < HUNTING_DRAWS.length ? " in your filters" : ""}</span>
      <div class="dw-count">
        ${days === 0
          ? `<span class="dw-count-n soon">Closes today</span>`
          : `<span class="dw-count-n ${kind}">${days}</span><span class="dw-count-u">day${days === 1 ? "" : "s"} left</span>`}
      </div>
      <h2>${escapeHtml(STATES[next.state]?.name || next.state)} ${escapeHtml(next.species)}</h2>
      <p>${escapeHtml(next.hunt)} · closes ${drawDate(drawDeadline(next))} · ${next.odds ? `${oddsText(next)} odds` : "odds vary"}</p>
      <div class="dw-next-actions">
        <button type="button" class="bg-chip dw-next-pin" data-pin="${escapeHtml(next.id)}" aria-pressed="${pinned}">${pinned ? "★ Pinned" : "☆ Pin to plan"}</button>
        <button type="button" class="bg-chip" data-open="${escapeHtml(next.id)}">Details</button>
        <a class="bg-chip" href="${escapeHtml(next.url)}" target="_blank" rel="noopener">${escapeHtml(next.agency)} &rarr;</a>
      </div>`;
  } else if (drawUi.heroId !== null) {
    drawUi.heroId = null;
    $d("dw-next").innerHTML = `
      <span class="bg-k">Hunting Draws</span>
      <h2>No open deadlines in these filters</h2>
      <p>Loosen a filter or reset to see what's coming up.</p>`;
  }

  // Hero stats.
  const soon = open.filter((d) => drawStatus(d).kind === "soon").length;
  $d("dw-stats").innerHTML = `
    <div><span class="bg-k">Open</span><span class="bg-v">${open.length}</span></div>
    <div><span class="bg-k">Closing ≤ ${SOON_DAYS_DRAW} days</span><span class="bg-v">${soon}</span></div>
    <div><span class="bg-k">Pinned</span><span class="bg-v">${drawUi.pinned.length}</span></div>`;

  // Budget readout.
  const budget = $d("dw-budget");
  budget.value = String(f.maxCost);
  budget.style.setProperty("--pct", `${((f.maxCost - 1) / 3) * 100}%`);
  const scale = COST_SCALE[f.maxCost];
  $d("dw-budget-out").textContent = f.maxCost === 4 ? "Any" : `Up to ${scale.label}`;
  budget.setAttribute("aria-valuetext", f.maxCost === 4 ? "Any budget" : `Up to ${scale.name}, ${scale.detail}`);

  // Map tiles: count per state with every other filter held.
  const byState = new Map();
  for (const d of HUNTING_DRAWS) if (drawMatches(d, "state")) byState.set(d.state, (byState.get(d.state) || 0) + 1);
  const maxState = Math.max(1, ...byState.values());
  const hasData = new Set(HUNTING_DRAWS.map((d) => d.state));
  document.querySelectorAll("#dw-map .dw-tile").forEach((t) => {
    const n = byState.get(t.dataset.state) || 0;
    const selected = f.state === t.dataset.state;
    const level = n ? 0.25 + 0.75 * (n / maxState) : 0;
    t.style.setProperty("--level", `${Math.round(level * 100)}%`);
    t.classList.toggle("dark", level > 0.55); // white text only where the fill is dark enough
    t.classList.toggle("has", n > 0);
    t.classList.toggle("no-data", !hasData.has(t.dataset.state));
    t.disabled = !n && !selected;
    t.setAttribute("aria-pressed", String(selected));
    t.querySelector("small").textContent = n || "";
    const name = STATES[t.dataset.state]?.name || t.dataset.state;
    t.title = `${name}: ${n} draw${n === 1 ? "" : "s"}`;
    t.setAttribute("aria-label", t.title);
  });
  $d("dw-state-all").hidden = f.state === "all";

  // Species chips.
  const bySpecies = new Map();
  let allSpecies = 0;
  for (const d of HUNTING_DRAWS) if (drawMatches(d, "species")) { bySpecies.set(d.species, (bySpecies.get(d.species) || 0) + 1); allSpecies++; }
  document.querySelectorAll("#dw-species .dw-sp").forEach((b) => {
    const s = b.dataset.species;
    const n = s === "all" ? allSpecies : bySpecies.get(s) || 0;
    const selected = f.species === s;
    b.setAttribute("aria-pressed", String(selected));
    b.querySelector("small").textContent = n;
    b.disabled = !n && !selected;
  });

  // Month bars.
  const byMonth = new Map();
  for (const d of HUNTING_DRAWS) if (drawMatches(d, "month")) {
    const k = monthKey(drawDeadline(d));
    byMonth.set(k, (byMonth.get(k) || 0) + 1);
  }
  const maxMonth = Math.max(1, ...byMonth.values());
  const thisMonth = monthKey(TODAY);
  document.querySelectorAll("#draw-months .dw-month").forEach((b) => {
    const n = byMonth.get(b.dataset.drawMonth) || 0;
    const selected = f.month === b.dataset.drawMonth;
    b.querySelector(".dw-month-bar i").style.transform = `scaleY(${n / maxMonth})`;
    b.querySelector(".dw-month-bar b").textContent = n || "";
    b.classList.toggle("has", n > 0);
    b.classList.toggle("is-now", b.dataset.drawMonth === thisMonth);
    b.setAttribute("aria-pressed", String(selected));
    b.disabled = !n && !selected;
    const label = formatDay(parseDay(`${b.dataset.drawMonth}-01`), { month: "long", year: "numeric" });
    b.setAttribute("aria-label", `${label}: ${n} deadline${n === 1 ? "" : "s"}`);
    b.title = b.getAttribute("aria-label");
  });

  renderDrawPlan();
}

// ---------- Application plan (pinned draws on one timeline) ----------
function renderDrawPlan() {
  const root = $d("dw-plan");
  const pins = drawUi.pinned.map(drawById).filter(Boolean).sort((a, b) => drawDeadline(a) - drawDeadline(b));
  if (!pins.length) {
    root.innerHTML = `<div class="bg-empty"><p><strong>Nothing pinned yet.</strong> Tap ☆ on any draw to see its
      application window here, lined up against everything else you plan to apply for.</p></div>`;
    return;
  }
  const months = upcomingMonths();
  const start = months[0].date;
  const end = new Date(TODAY.getFullYear(), TODAY.getMonth() + 12, 1);
  const span = daysBetween(start, end);
  const pos = (date) => Math.min(100, Math.max(0, (daysBetween(start, date) / span) * 100));
  const todayPct = pos(TODAY);

  const rows = pins.map((d) => {
    const dl = drawDeadline(d);
    const op = d.opens ? parseDay(d.opens) : null;
    const closed = drawStatus(d).kind === "closed";
    const outOfRange = dl < start || dl >= end;
    const a = op && op < dl ? pos(op) : null;
    const b = pos(dl);
    const tip = `${d.state} ${d.species}: ${op ? `opens ${drawDate(op)}, ` : ""}deadline ${drawDate(dl)}`;
    return `
      <li class="dw-plan-row ${closed ? "is-closed" : ""}">
        <span class="dw-plan-name"><strong>${escapeHtml(d.state)} ${escapeHtml(d.species)}</strong>
          <span>${closed ? "Closed" : `${drawStatus(d).days} days`} · ${drawDate(dl, false)}</span></span>
        <span class="dw-plan-track" title="${escapeHtml(tip)}">
          ${outOfRange ? `<em>${closed ? "Deadline passed" : "Beyond the next 12 months"}</em>` : `
            ${a != null ? `<i style="left:${a}%;width:${Math.max(0.8, b - a)}%"></i>` : ""}
            <b style="left:${b}%"></b>`}
        </span>
        <button type="button" class="bg-x" data-pin="${escapeHtml(d.id)}" aria-label="Unpin ${escapeHtml(d.state)} ${escapeHtml(d.species)}">×</button>
      </li>`;
  }).join("");

  root.innerHTML = `
    <div class="dw-plan">
      <div class="dw-plan-axis" aria-hidden="true"><span></span><span class="dw-plan-months">${months.map((m) =>
        `<span>${m.label}</span>`).join("")}</span><span></span></div>
      <ul class="dw-plan-rows" style="--today:${todayPct}%">${rows}</ul>
      <p class="dw-plan-key"><span class="k-win"></span>Application window <span class="k-dl"></span>Deadline
        <span class="k-today"></span>Today · sample dates, verify with each agency</p>
    </div>`;
}

// ---------- Events ----------
function initDraws() {
  loadDrawPins();
  buildDraws();

  const setFilter = (key, value) => { drawFilters[key] = value; applyDraws(); };

  document.querySelectorAll('input[name="dw-res"]').forEach((r) =>
    r.addEventListener("change", (e) => setFilter("residency", e.target.value)));
  document.querySelectorAll('input[name="dw-sort"]').forEach((r) =>
    r.addEventListener("change", (e) => setFilter("sort", e.target.value)));
  $d("dw-budget").addEventListener("input", (e) => setFilter("maxCost", Number(e.target.value)));
  $d("draw-filter").addEventListener("input", (e) => setFilter("text", e.target.value));

  $d("dw-map").addEventListener("click", (e) => {
    const t = e.target.closest("[data-state]");
    if (t) setFilter("state", drawFilters.state === t.dataset.state ? "all" : t.dataset.state);
  });
  $d("dw-state-all").addEventListener("click", () => setFilter("state", "all"));
  $d("dw-species").addEventListener("click", (e) => {
    const b = e.target.closest("[data-species]");
    if (b) setFilter("species", drawFilters.species === b.dataset.species ? "all" : b.dataset.species);
  });
  $d("draw-months").addEventListener("click", (e) => {
    const cell = e.target.closest("[data-draw-month]");
    // Clicking the selected month clears the filter, so the strip is a toggle.
    if (cell) setFilter("month", drawFilters.month === cell.dataset.drawMonth ? "all" : cell.dataset.drawMonth);
  });

  $d("draws-view").addEventListener("click", (e) => {
    const pin = e.target.closest("[data-pin]");
    if (pin) {
      const fromPlan = pin.closest("#dw-plan");
      const index = fromPlan ? [...$d("dw-plan").querySelectorAll("[data-pin]")].indexOf(pin) : -1;
      toggleDrawPin(pin.dataset.pin);
      if (fromPlan) {
        // The plan was rebuilt under the button; move focus to the next unpin button, or back to
        // the row's own pin when the plan is now empty.
        const rest = $d("dw-plan").querySelectorAll("[data-pin]");
        const target = rest[Math.min(index, rest.length - 1)] ||
          $d("draw-list").querySelector(`.dw-pin[data-pin="${CSS.escape(pin.dataset.pin)}"]`);
        target?.focus({ preventScroll: true });
      }
      return;
    }
    const opener = e.target.closest("[data-open]");
    const main = e.target.closest(".dw-row-main");
    const row = opener
      ? $d("draw-list").querySelector(`.dw-row[data-id="${CSS.escape(opener.dataset.open)}"]`)
      : main?.closest(".dw-row");
    if (!row) return;
    const btn = row.querySelector(".dw-row-main");
    const open = opener ? true : btn.getAttribute("aria-expanded") !== "true";
    btn.setAttribute("aria-expanded", String(open));
    row.querySelector(".dw-detail").hidden = !open;
    row.classList.toggle("is-open", open);
    if (opener) {
      // Scroll only the draws scroller; scrollIntoView would also nudge the overflow:hidden body.
      const scroller = $d("draws-view").querySelector(".draws-scroll");
      const top = row.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 12;
      scroller.scrollTo({ top, behavior: window.matchMedia("(prefers-reduced-motion: no-preference)").matches ? "smooth" : "auto" });
      btn.focus({ preventScroll: true });
    }
  });

  $d("draw-reset").addEventListener("click", () => {
    Object.assign(drawFilters, { state: "all", species: "all", month: "all", residency: "all", text: "", maxCost: 4, sort: "deadline" });
    $d("draw-filter").value = "";
    document.querySelector('input[name="dw-res"][value="all"]').checked = true;
    document.querySelector('input[name="dw-sort"][value="deadline"]').checked = true;
    applyDraws();
  });

  $d("draw-reviewed").textContent = formatDay(parseDay(DRAW_DATA_REVIEWED), { month: "long", day: "numeric", year: "numeric" });
  document.querySelectorAll("[data-draw-cycle]").forEach((el) => (el.textContent = DRAW_CYCLE));

  $d("cost-legend-list").innerHTML = Object.entries(COST_SCALE)
    .map(([level, s]) => `<li><span class="cost"><span class="cost-on">${s.label}</span><span class="cost-off">${"$".repeat(4 - level)}</span></span>
      <strong>${escapeHtml(s.name)}</strong> — ${escapeHtml(s.detail)}</li>`)
    .join("");

  applyDraws();
}

// ---------- Top-level view switching (Map Locator / Hunting Draws) ----------
// Deliberately uses its own classes (.site-tab / .view). The panel's own tab strip inside the
// Map Locator uses .tab / .tab-panel and is wired separately in script.js.
function setView(name) {
  document.querySelectorAll(".site-tab").forEach((t) => {
    const on = t.dataset.view === name;
    t.setAttribute("aria-selected", String(on));
    t.tabIndex = on ? 0 : -1;
  });
  document.querySelectorAll(".view").forEach((v) => (v.hidden = v.dataset.view !== name));
  document.body.classList.toggle("on-draws", name === "draws");

  if (name === "map") {
    // The map was display:none, so Leaflet needs its size back, and the saved split has to be
    // re-applied in case the window was resized while this view was hidden.
    restoreSplit();
    map.invalidateSize();
  }
}

document.querySelectorAll(".site-tab").forEach((tab) =>
  tab.addEventListener("click", () => setView(tab.dataset.view))
);

initDraws();
