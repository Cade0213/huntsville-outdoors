// Season calendar: "today" agenda (open now + coming up) and a month grid.
// Reads SEASON_SCOPES / GAME from seasons.js and the shared game filter from script.js.

const UPCOMING_WINDOW_DAYS = 60;
const EVENT_LABELS = { open: "Opens", close: "Closes", single: "One day" };

const cal = {
  scope: "alHuntsvilleArea",
  month: new Date(TODAY.getFullYear(), TODAY.getMonth(), 1),
  selected: TODAY,
};

function selectedGames() {
  return appState.game === "all" ? Object.keys(GAME) : [appState.game];
}

function dot(game) {
  return `<span class="game-dot" style="background:${GAME[game].color}"></span>`;
}

function relativeDays(date) {
  const n = daysBetween(TODAY, date);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

// Seasons (with the specific segment) open on a given day in the current scope.
function openOn(date) {
  const games = selectedGames();
  const result = [];
  for (const s of SEASON_SCOPES[cal.scope].seasons) {
    if (s.none || !games.includes(s.game)) continue;
    const range = s.dates.find((r) => inRange(date, r));
    if (range) result.push({ season: s, range });
  }
  return result;
}

function seasonLabel(s) {
  return `<strong>${GAME[s.game].label}</strong> — ${escapeHtml(s.name)}`;
}

// ---------- Agenda ----------

function renderAgenda() {
  document.getElementById("today-label").textContent = formatDay(TODAY, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const games = selectedGames();
  const allVaries = games.every((g) => gameStatus(cal.scope, g, TODAY).kind === "varies");
  const emptyHint = allVaries ? " See the zone notes above." : "";

  const open = openOn(TODAY);
  document.getElementById("open-now").innerHTML = open.length
    ? open
        .map(({ season, range }) => {
          const end = parseDay(range[1]);
          const left = daysBetween(TODAY, end);
          const timing =
            range[0] === range[1]
              ? "One day only"
              : `Through ${formatDay(end)} · ${left === 0 ? "last day" : `${left} day${left === 1 ? "" : "s"} left`}`;
          return `<li>${dot(season.game)}<div>${seasonLabel(season)}
            <span class="sub">${timing}</span></div></li>`;
        })
        .join("")
    : `<li class="empty">Nothing open today for this selection.${emptyHint}</li>`;

  const events = seasonEvents(cal.scope, selectedGames());
  const windowEnd = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + UPCOMING_WINDOW_DAYS);
  let upcoming = events.filter((e) => e.date >= TODAY && e.date <= windowEnd);
  let heading = `Coming up · next ${UPCOMING_WINDOW_DAYS} days`;
  if (!upcoming.length) {
    const next = events.find((e) => e.date > windowEnd);
    upcoming = next ? [next] : [];
    heading = "Next change";
  }
  document.getElementById("upcoming-heading").textContent = heading;

  document.getElementById("upcoming").innerHTML = upcoming.length
    ? upcoming
        .slice(0, 14)
        .map(
          (e) => `<li class="evt-${e.type}">
            <time class="date-badge"><span>${formatDay(e.date, { month: "short" })}</span>${e.date.getDate()}</time>
            <div>${dot(e.season.game)}<span class="evt-type">${EVENT_LABELS[e.type]}</span> ${seasonLabel(e.season)}
            <span class="sub">${relativeDays(e.date)} · ${formatRange(e.range)}</span></div></li>`
        )
        .join("")
    : `<li class="empty">No more ${SEASON_SCOPES[cal.scope].seasonYear} dates for this selection.${emptyHint}</li>`;
}

// ---------- Month grid ----------

function renderMonth() {
  const { month } = cal;
  document.getElementById("month-title").textContent = formatDay(month, { month: "long", year: "numeric" });

  const events = seasonEvents(cal.scope, selectedGames());
  const firstWeekday = month.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [];

  ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach((d) => cells.push(`<div class="dow">${d}</div>`));
  for (let i = 0; i < firstWeekday; i++) cells.push(`<div class="day blank"></div>`);

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(month.getFullYear(), month.getMonth(), d);
    const games = [...new Set(openOn(date).map((o) => o.season.game))];
    const opens = events.some((e) => e.type !== "close" && +e.date === +date);
    const closes = events.some((e) => e.type === "close" && +e.date === +date);

    const classes = ["day"];
    if (+date === +TODAY) classes.push("today");
    if (+date === +cal.selected) classes.push("selected");

    const bars = games.map((g) => `<span style="background:${GAME[g].color}" title="${GAME[g].label}"></span>`).join("");
    const flags = `${opens ? '<i class="flag open" title="Season opens">▲</i>' : ""}${closes ? '<i class="flag close" title="Season closes">▼</i>' : ""}`;

    cells.push(`<button type="button" class="${classes.join(" ")}" data-day="${d}"
      aria-label="${formatDay(date, { weekday: "long", month: "long", day: "numeric" })}: ${games.length} season(s) open">
      <span class="num">${d}</span><span class="flags">${flags}</span><span class="bars">${bars}</span></button>`);
  }
  document.getElementById("month-grid").innerHTML = cells.join("");
  renderDayDetail();
}

function renderDayDetail() {
  const date = cal.selected;
  const open = openOn(date);
  const events = seasonEvents(cal.scope, selectedGames()).filter((e) => +e.date === +date);

  const eventList = events
    .map((e) => `<li>${dot(e.season.game)}<span class="evt-type">${e.type === "close" ? "Last day" : EVENT_LABELS[e.type]}</span> ${seasonLabel(e.season)}</li>`)
    .join("");
  const openList = open
    .map(({ season, range }) => `<li>${dot(season.game)}${seasonLabel(season)} <span class="sub">${formatRange(range)}</span>
      ${season.note ? `<span class="note">${escapeHtml(season.note)}</span>` : ""}</li>`)
    .join("");

  document.getElementById("day-detail").innerHTML = `
    <h4>${formatDay(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
      <span class="sub">${relativeDays(date)}</span></h4>
    ${eventList ? `<ul class="detail-events">${eventList}</ul>` : ""}
    ${openList ? `<ul>${openList}</ul>` : `<p class="empty">No seasons open this day for this selection.</p>`}`;
}

// ---------- Scope info, legend, controls ----------

function renderScopeInfo() {
  const scope = SEASON_SCOPES[cal.scope];
  const noSeason = scope.seasons.filter((s) => s.none).map((s) => GAME[s.game].label);
  const varies = scope.seasons.filter((s) => s.varies);

  document.querySelectorAll("[data-cal-year]").forEach((el) => (el.textContent = scope.seasonYear));
  document.querySelectorAll("[data-cal-area]").forEach((el) => (el.textContent = scope.short));

  const variesHtml = varies.length
    ? `<ul class="scope-varies">${varies
        .map(
          (s) => `<li><span class="game-dot" style="background:${GAME[s.game].color}"></span>
            <strong>${GAME[s.game].label}${s.name ? ` — ${escapeHtml(s.name)}` : ""}:</strong>
            ${escapeHtml(s.note || "Dates vary — see the official source.")}
            ${s.verifyUrl ? `<a href="${escapeHtml(s.verifyUrl)}" target="_blank" rel="noopener">Verify &rarr;</a>` : ""}</li>`
        )
        .join("")}</ul>`
    : "";

  document.getElementById("scope-summary").innerHTML = `
    ${escapeHtml(scope.summary)}
    ${noSeason.length ? `<br><strong>No open season:</strong> ${noSeason.join(", ")}.` : ""}
    <br>Zone, unit and WMA-specific dates can differ from this summary.
    <a href="${escapeHtml(scope.sourceUrl)}" target="_blank" rel="noopener">Official ${escapeHtml(scope.state)} regulations &rarr;</a>
    ${variesHtml}`;

  renderFinePrint(scope);
}

function renderFinePrint(scope) {
  const el = document.getElementById("cal-fine-print");
  if (!el) return;
  el.innerHTML =
    scope.tier === "detail"
      ? `<strong>Not official.</strong> Dates are summarized from ADCNR's ${scope.seasonYear} season pages, WMA AREA permits,
         and the Wheeler NWR hunt permit. Bag limits, legal weapons, zone boundaries, quota hunts and hunt-day
         restrictions are not fully listed. ADCNR notes federal waterfowl frameworks were not final at printing.`
      : `<strong>Not official.</strong> This is a statewide summary — it does not capture every zone, unit, WMA or
         refuge-specific rule. Retrieved ${formatDay(parseDay(scope.retrieved))} from the official source linked above.
         Always verify current seasons, permits and regulations before you hunt.`;
}

function populateScopeSelect(ids) {
  const select = document.getElementById("cal-scope");
  select.innerHTML = ids.map((id) => `<option value="${id}">${escapeHtml(SEASON_SCOPES[id].name)}</option>`).join("");
  select.value = cal.scope;
}

function renderCalendar() {
  const ids = scopesForSearch(appState.search);
  const covered = ids.length > 0;
  document.getElementById("cal-content").hidden = !covered;
  document.getElementById("cal-empty").hidden = covered;
  if (!covered) {
    renderCalendarEmpty();
    return;
  }
  if (!ids.includes(cal.scope)) cal.scope = ids[0];
  populateScopeSelect(ids);
  renderScopeInfo();
  renderAgenda();
  renderMonth();
}

// Shown when the searched city has neither a North AL detail scope nor a statewide scope: we don't
// invent dates for uncovered states.
function renderCalendarEmpty() {
  document.querySelectorAll("[data-cal-year]").forEach((el) => (el.textContent = ""));
  document.querySelectorAll("[data-cal-area]").forEach((el) => (el.textContent = ""));

  const { search } = appState;
  if (!search) {
    document.getElementById("cal-empty").innerHTML = `
      <div class="empty-state">
        <div class="empty-icon" aria-hidden="true">📅</div>
        <h3>Search a location to see its seasons</h3>
        <p>Season dates depend on the state and area you hunt. Enter a U.S. city or town above.</p>
      </div>`;
    return;
  }
  const abbrs = appState.areaStates.length ? appState.areaStates : [search.state].filter(Boolean);
  const agencyLinks = abbrs
    .filter((a) => STATES[a])
    .flatMap((a) => STATES[a].agencies.map(([name, url]) => `<li><a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(name)}</a></li>`))
    .join("");
  const coveredStates = [...new Set(Object.values(SEASON_SCOPES).filter((s) => s.tier === "statewide").map((s) => s.state))].sort();
  document.getElementById("cal-empty").innerHTML = `
    <div class="empty-state">
      <div class="empty-icon" aria-hidden="true">📅</div>
      <h3>Season dates aren't built in for ${escapeHtml(search.label)} yet</h3>
      <p>We have hand-checked seasons for ${DETAIL_AREAS.map((a) => escapeHtml(a.label)).join(", ")} and statewide summaries for
      ${coveredStates.length ? coveredStates.join(", ") : "a growing list of states"}. Rather than guess for other areas, we point you
      to the official source. Season dates, zones and bag limits are set by each state:</p>
      ${agencyLinks ? `<ul class="agency-links">${agencyLinks}</ul>` : ""}
      ${DETAIL_AREAS.map((a) => `<button type="button" class="btn-secondary" data-sample-area="${escapeHtml(a.id)}">See the ${escapeHtml(a.label)} calendar</button>`).join("")}
    </div>`;
}

function setCalendarScope(scopeId) {
  cal.scope = scopeId;
  document.getElementById("cal-scope").value = scopeId;
  renderCalendar();
}

function initCalendar() {
  document.getElementById("cal-scope").addEventListener("change", (e) => setCalendarScope(e.target.value));

  document.getElementById("cal-legend").innerHTML = Object.values(GAME)
    .map((g) => `<span><span class="game-dot" style="background:${g.color}"></span>${g.label}</span>`)
    .join("") + `<span><i class="flag open">▲</i> Opens</span><span><i class="flag close">▼</i> Closes</span>`;

  const shiftMonth = (delta) => {
    cal.month = new Date(cal.month.getFullYear(), cal.month.getMonth() + delta, 1);
    renderMonth();
  };
  document.getElementById("month-prev").addEventListener("click", () => shiftMonth(-1));
  document.getElementById("month-next").addEventListener("click", () => shiftMonth(1));
  document.getElementById("month-today").addEventListener("click", () => {
    cal.month = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
    cal.selected = TODAY;
    renderMonth();
  });

  document.getElementById("month-grid").addEventListener("click", (e) => {
    const cell = e.target.closest("[data-day]");
    if (!cell) return;
    cal.selected = new Date(cal.month.getFullYear(), cal.month.getMonth(), Number(cell.dataset.day));
    renderMonth();
  });

  // Warn when "today" falls outside the season year this data describes.
  const outOfRange = TODAY < parseDay("2026-09-01") || TODAY > parseDay(SEASON_DATA_THROUGH);
  document.getElementById("stale-warning").hidden = !outOfRange;

  renderCalendar();
}
