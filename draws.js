// Hunting Draws tab: filters, deadline cards and a 12-month deadline overview.
// Data lives in draws-data.js. Date helpers (parseDay, TODAY, daysBetween, formatDay) and
// escapeHtml come from seasons.js / script.js — this file adds no date parsing of its own.

const SOON_DAYS_DRAW = 30; // "closing soon" window, mirrors SOON_DAYS in the season calendar

const drawFilters = { state: "all", species: "all", month: "all", residency: "all", text: "" };

const $d = (id) => document.getElementById(id);

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

// ---------- Filtering ----------
function visibleDraws() {
  const q = drawFilters.text.trim().toLowerCase();
  return HUNTING_DRAWS.filter((d) => {
    if (drawFilters.state !== "all" && d.state !== drawFilters.state) return false;
    if (drawFilters.species !== "all" && d.species !== drawFilters.species) return false;
    if (drawFilters.month !== "all" && monthKey(drawDeadline(d)) !== drawFilters.month) return false;
    if (drawFilters.residency !== "all" && d.residency !== drawFilters.residency && d.residency !== "both") return false;
    if (q && !`${d.state} ${d.species} ${d.hunt} ${d.notes.join(" ")}`.toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => {
    // Open deadlines first, soonest at the top; already-closed rows fall to the bottom.
    const ca = drawStatus(a).kind === "closed";
    const cb = drawStatus(b).kind === "closed";
    return ca - cb || drawDeadline(a) - drawDeadline(b);
  });
}

// ---------- Rendering ----------
function drawStatusChip(draw) {
  const { kind, days } = drawStatus(draw);
  if (kind === "closed") return `<span class="chip chip-closed">Closed for ${DRAW_CYCLE}</span>`;
  if (kind === "soon") return `<span class="chip chip-soon">${days === 0 ? "Closes today" : `Closes in ${days} day${days === 1 ? "" : "s"}`}</span>`;
  return `<span class="chip chip-open">${days} days left</span>`;
}

function drawCard(draw) {
  const closed = drawStatus(draw).kind === "closed";
  return `
    <article class="draw-card ${closed ? "is-closed" : ""}">
      <header class="draw-card-head">
        <span class="draw-state" aria-hidden="true">${escapeHtml(draw.state)}</span>
        <div class="draw-title">
          <h3>${escapeHtml(draw.species)}<span class="sr-only"> in ${escapeHtml(draw.state)}</span></h3>
          <p class="draw-hunt">${escapeHtml(draw.hunt)}</p>
        </div>
        ${costGlyphs(draw.cost)}
      </header>

      <dl class="draw-facts">
        <div>
          <dt>Deadline</dt>
          <dd>${formatDay(drawDeadline(draw), { month: "short", day: "numeric", year: "numeric" })}</dd>
        </div>
        <div>
          <dt>Draw odds</dt>
          <dd>${oddsText(draw)}
            <span class="odds-bar" aria-hidden="true"><i style="width:${oddsBarPct(draw)}%"></i></span>
          </dd>
        </div>
        <div>
          <dt>Applies to</dt>
          <dd>${draw.residency === "both" ? "Both" : draw.residency === "nonresident" ? "Nonresident" : "Resident"}</dd>
        </div>
      </dl>

      <p class="draw-odds-note">${escapeHtml(draw.oddsNote)}</p>
      <p class="draw-points">${escapeHtml(POINT_SYSTEMS[draw.points] || "")}</p>

      <div class="draw-tags">
        ${drawStatusChip(draw)}
        ${draw.notes.map((n) => `<span class="draw-note">${escapeHtml(n)}</span>`).join("")}
      </div>

      <p class="res-link"><a href="${escapeHtml(draw.url)}" target="_blank" rel="noopener">${escapeHtml(draw.agency)} &rarr;</a></p>
    </article>`;
}

// Twelve-month strip: one cell per month with a count of deadlines. Doubles as the month filter.
function renderDrawMonths() {
  const counts = new Map();
  for (const d of HUNTING_DRAWS) {
    const k = monthKey(drawDeadline(d));
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const cells = upcomingMonths().map((m) => {
    const n = counts.get(m.key) || 0;
    const selected = drawFilters.month === m.key;
    return `
      <button type="button" class="draw-month ${n ? "has-deadlines" : ""} ${selected ? "is-selected" : ""}"
              data-draw-month="${m.key}" aria-pressed="${selected}"
              ${n ? "" : "disabled"}
              aria-label="${m.label} ${m.year}: ${n} deadline${n === 1 ? "" : "s"}">
        <span class="dm-name">${m.label}</span>
        <span class="dm-year">${String(m.year).slice(2)}</span>
        <span class="dm-count">${n || "—"}</span>
      </button>`;
  });
  $d("draw-months").innerHTML = cells.join("");
}

function renderDrawFilters() {
  const opts = (values, current, allLabel) =>
    `<option value="all">${allLabel}</option>` +
    values.map((v) => `<option value="${escapeHtml(v)}" ${v === current ? "selected" : ""}>${escapeHtml(v)}</option>`).join("");

  // Filter options are derived from the dataset, so adding a row to draws-data.js is enough.
  const states = [...new Set(HUNTING_DRAWS.map((d) => d.state))].sort();
  const species = [...new Set(HUNTING_DRAWS.map((d) => d.species))].sort();
  $d("draw-state").innerHTML = opts(states, drawFilters.state, "All states");
  $d("draw-species").innerHTML = opts(species, drawFilters.species, "All species");
}

function renderDraws() {
  const list = visibleDraws();
  const open = list.filter((d) => drawStatus(d).kind !== "closed");
  const next = open[0];

  $d("draw-summary").innerHTML = list.length
    ? `<strong>${list.length}</strong> draw${list.length === 1 ? "" : "s"}` +
      (drawFilters.month !== "all" ? ` deadline in ${formatDay(parseDay(`${drawFilters.month}-01`), { month: "long", year: "numeric" })}` : "") +
      (next ? ` · next deadline <strong>${escapeHtml(next.state)} ${escapeHtml(next.species)}</strong> on ${formatDay(drawDeadline(next), { month: "short", day: "numeric" })}` : "")
    : `No draws match these filters.`;

  $d("draw-list").innerHTML = list.length
    ? list.map(drawCard).join("")
    : `<p class="notice">Nothing matches these filters. Try “All states”, “All species”, or clear the month.</p>`;

  renderDrawMonths();
}

// ---------- Events ----------
function initDraws() {
  renderDrawFilters();
  renderDraws();

  $d("draw-state").addEventListener("change", (e) => { drawFilters.state = e.target.value; renderDraws(); });
  $d("draw-species").addEventListener("change", (e) => { drawFilters.species = e.target.value; renderDraws(); });
  $d("draw-residency").addEventListener("change", (e) => { drawFilters.residency = e.target.value; renderDraws(); });
  $d("draw-filter").addEventListener("input", (e) => { drawFilters.text = e.target.value; renderDraws(); });

  $d("draw-months").addEventListener("click", (e) => {
    const cell = e.target.closest("[data-draw-month]");
    if (!cell) return;
    // Clicking the selected month clears the filter, so the strip is a toggle.
    drawFilters.month = drawFilters.month === cell.dataset.drawMonth ? "all" : cell.dataset.drawMonth;
    renderDraws();
  });

  $d("draw-reset").addEventListener("click", () => {
    Object.assign(drawFilters, { state: "all", species: "all", month: "all", residency: "all", text: "" });
    $d("draw-filter").value = "";
    $d("draw-residency").value = "all";
    renderDrawFilters();
    renderDraws();
  });

  $d("draw-reviewed").textContent = formatDay(parseDay(DRAW_DATA_REVIEWED), { month: "long", day: "numeric", year: "numeric" });
  document.querySelectorAll("[data-draw-cycle]").forEach((el) => (el.textContent = DRAW_CYCLE));

  $d("cost-legend-list").innerHTML = Object.entries(COST_SCALE)
    .map(([level, s]) => `<li><span class="cost"><span class="cost-on">${s.label}</span><span class="cost-off">${"$".repeat(4 - level)}</span></span>
      <strong>${escapeHtml(s.name)}</strong> — ${escapeHtml(s.detail)}</li>`)
    .join("");
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
