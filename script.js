// App shell: city search, map, results list, detail panel and tabs.
// Data: data.js (hand-checked places), seasons.js (AL season dates), live.js (nationwide lookups),
// states.js (state agencies), resources.js (licenses & gear), calendar.js (season calendar),
// almanac.js (almanac tab).

// Required disclaimer. In Alabama it names ADCNR verbatim; elsewhere it names that state's wildlife agency.
const AL_AGENCY_NAME = "Alabama Department of Conservation and Natural Resources (Outdoor Alabama)";

function agencyForDisclaimer(stateAbbrev) {
  if (stateAbbrev === "AL" || !STATES[stateAbbrev]) return { name: AL_AGENCY_NAME, url: "https://www.outdooralabama.com" };
  return primaryAgency(stateAbbrev);
}

function disclaimerText(stateAbbrev) {
  return `This is not an official source. Always verify current seasons, permits, regulations, and access with the ${agencyForDisclaimer(stateAbbrev).name} and the managing agency. Regulations change.`;
}

const COLORS = { hunting: "#c0621f", fishing: "#1f6fa3" };
const SOON_DAYS = 30;
const LIST_LIMIT = 250;

// Shared UI state (also read by calendar.js and resources.js).
const appState = {
  search: null, // null until the first search; every renderer shows a "search to begin" state
  activity: "both",
  game: "all",
  filterText: "",
  showUnconfirmed: true,
  tab: "places",
  selectedId: null,
  places: [],
  shops: [],
  areaStates: [], // state abbreviations touching the search radius
  areaStatePolys: [],
  loading: { lands: false, osm: false, states: false, stateLands: false },
  errors: {},
};

const $ = (id) => document.getElementById(id);

// ---------- Small helpers ----------
function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

function milesBetween([lat1, lng1], [lat2, lng2]) {
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function formatMiles(mi) {
  if (mi < 0.05) return "0 mi";
  if (mi < 1) return "<1 mi";
  return `${Math.round(mi)} mi`;
}

// Map and list indicators use one colour per activity: anything huntable is orange, the rest blue.
function activityKey(place) {
  return place.activities.includes("hunting") ? "hunting" : "fishing";
}

// Ordered season-calendar scope ids to offer for a search: a detail area's own scopes inside that
// area, otherwise the searched state's statewide scope when one exists. Never both — a detail area's
// data stands in for its state's statewide entry there. See coverage.js.
function scopesForSearch(search) {
  const area = detailAreaFor(search);
  if (area) return area.scopes;
  const swId = statewideScopeFor(search?.state);
  return swId ? [swId] : [];
}

function seasonsAvailable() {
  return scopesForSearch(appState.search).length > 0;
}

function curatedTypeLabel(loc) {
  if (/visitor center/i.test(loc.name)) return "Refuge visitor center";
  if (/wildlife refuge/i.test(loc.name)) return "National Wildlife Refuge";
  if (/WMA/.test(loc.name)) return "Wildlife Management Area";
  if (/fishing lake/i.test(loc.name)) return "State public fishing lake";
  if (/ramp|landing/i.test(loc.name)) return "Boat launch";
  return "River access";
}

// ---------- Map ----------
// Opens on the contiguous U.S. with no search; the #map-prompt overlay asks for a location.
const US_BOUNDS = [[24.5, -125], [49.5, -66.9]];
const map = L.map("map", { zoomControl: false, zoomSnap: 0.25, preferCanvas: true }).fitBounds(US_BOUNDS);
L.control.zoom({ position: "topright" }).addTo(map);

// We avoid tile.openstreetmap.org (blocks requests with no Referer, e.g. file://) and CARTO (API key).
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const baseMaps = {
  Topo: L.tileLayer(`${ESRI}/World_Topo_Map/MapServer/tile/{z}/{y}/{x}`, {
    maxZoom: 19,
    attribution: "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, USGS, NGA, EPA, USDA, NPS · Data: USGS PAD-US, U.S. Census, &copy; OpenStreetMap",
  }),
  Satellite: L.tileLayer(`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, {
    maxZoom: 19,
    attribution: "Tiles &copy; Esri &mdash; Esri, Maxar, Earthstar Geographics, USDA, USGS",
  }),
  "USGS Topo": L.tileLayer("https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}", {
    maxNativeZoom: 16,
    maxZoom: 19,
    attribution: 'Tiles courtesy of the <a href="https://www.usgs.gov/">U.S. Geological Survey</a>',
  }),
};
baseMaps.Topo.addTo(map);
L.control.layers(baseMaps, null, { position: "topright" }).addTo(map);
L.control.scale({ position: "bottomleft", imperial: true, metric: false }).addTo(map);

const searchLayer = L.layerGroup().addTo(map);
const placesLayer = L.layerGroup().addTo(map);
const layerById = new Map();

// Leaflet needs to be told when its container changes size (panel toggle, orientation change).
new ResizeObserver(() => map.invalidateSize()).observe($("map"));

// ---------- Season status (hand-checked places in a detail area only) ----------
function selectedGamesList() {
  return appState.game === "all" ? Object.keys(GAME) : [appState.game];
}

function placeSeasonStatus(place) {
  if (!scopeShownForPlace(place, appState.search)) return null;
  const statuses = selectedGamesList().map((g) => gameStatus(place.seasonScope, g, TODAY));
  if (statuses.some((s) => s.kind === "open")) return "open";
  if (statuses.some((s) => s.kind === "upcoming" && daysBetween(TODAY, s.date) <= SOON_DAYS)) return "soon";
  if (statuses.every((s) => s.kind === "none")) return "none";
  return "later";
}

function statusText(scopeId, game) {
  const st = gameStatus(scopeId, game, TODAY);
  switch (st.kind) {
    case "open": {
      const names = st.seasons.map((s) => s.name).join(", ");
      const end = Math.max(...st.seasons.map((s) => parseDay(s.dates.find((r) => inRange(TODAY, r))[1]).getTime()));
      return `<span class="st st-open">Open</span> ${escapeHtml(names)} · through ${formatDay(new Date(end))}`;
    }
    case "upcoming": {
      const days = daysBetween(TODAY, st.date);
      const cls = days <= SOON_DAYS ? "st-soon" : "st-closed";
      return `<span class="st ${cls}">Opens ${formatDay(st.date)}</span> ${escapeHtml(st.season.name)} · in ${days} day${days === 1 ? "" : "s"}`;
    }
    case "closed":
      return `<span class="st st-closed">Closed</span> for ${SEASON_YEAR}`;
    case "varies":
      return `<span class="st st-closed">Varies</span> ${escapeHtml(st.seasons[0].note || "check the official source")}`;
    default:
      return `<span class="st st-none">No season here</span>`;
  }
}

function statusChip(place) {
  const status = placeSeasonStatus(place);
  if (status === "open") return `<span class="chip chip-open">Season open</span>`;
  if (status === "soon") return `<span class="chip chip-soon">Opens soon</span>`;
  return "";
}

// Hand-checked places and official state agency records (coverage.js) say this land is open to
// hunting or fishing. PAD-US and OpenStreetMap results only say it is public land or water.
function isConfirmed(place) {
  return place.source === "curated" || place.source === "state";
}

// ---------- Building the place list ----------
// Every hand-checked place, each flagged with whether it falls inside the search radius.
// Nothing is dropped here: mergeLands() may later replace a rough placeholder outline with the
// real PAD-US boundary and recompute the distance, so the radius is enforced in visiblePlaces().
function curatedPlaces(center, radius) {
  return DETAIL_AREAS.flatMap((area) => area.places.map((loc) => {
    const polygons = loc.kind === "zone" ? [[loc.coords]] : null;
    const point = polygons ? markerPointFor(polygons) : loc.coords;
    return {
      ...loc,
      source: "curated",
      polygons,
      point,
      typeLabel: curatedTypeLabel(loc),
      state: area.state,
      distanceMi: polygons ? milesToPolygons(center, polygons) : milesBetween(center, point),
    };
  }))
    .map((p) => ({ ...p, outsideRadius: p.distanceMi > radius }));
}

// Real PAD-US boundaries replace hand-drawn placeholders; the duplicate PAD-US entry is dropped.
function mergeLands(places, lands, center) {
  const byName = new Map(lands.map((l) => [normalizeName(l.name), l]));
  const used = new Set();
  for (const p of places) {
    if (!p.padusName) continue;
    const land = byName.get(normalizeName(p.padusName));
    if (!land) continue;
    used.add(land.id);
    p.polygons = land.polygons;
    p.kind = "zone";
    p.placeholderBoundary = false;
    p.acres = land.acres;
    p.point = land.point;
    p.distanceMi = milesToPolygons(center, land.polygons);
    p.outsideRadius = p.distanceMi > appState.search.radius;
  }
  return [...places, ...lands.filter((l) => !used.has(l.id))];
}

// Official agency records replace their PAD-US twin (same name). The PAD-US boundary is kept when
// there is one, since PAD-US is the preferred boundary source; the agency record supplies the
// hunting status, facts and links. Hidden records (FWP "NO HUNTING", closed BMAs) still remove
// their twin, so PAD-US can't list that land as likely hunting ground by name alone.
function mergeStateLands(places, stateLands, center) {
  const padusByName = new Map(places.filter((p) => p.source === "padus").map((p) => [normalizeName(p.name), p]));
  const drop = new Set();
  const shown = [];
  for (const s of stateLands) {
    const twin = padusByName.get(normalizeName(s.name));
    if (twin) {
      drop.add(twin.id);
      s.polygons = twin.polygons;
      s.kind = "zone";
      s.point = twin.point;
      s.acres = s.acres || twin.acres;
      s.distanceMi = milesToPolygons(center, twin.polygons);
      s.boundaryFrom = "padus";
    }
    if (!s.hidden) shown.push({ ...s, outsideRadius: s.distanceMi > appState.search.radius });
  }
  const shownIds = new Set(shown.map((s) => s.id));
  return [...places.filter((p) => !drop.has(p.id) && !shownIds.has(p.id)), ...shown];
}

function assignStates() {
  for (const p of appState.places) p.state = stateForPoint(p.point, appState.areaStatePolys, p.state || appState.search.state);
}

function visiblePlaces() {
  const q = normalizeName(appState.filterText);
  return appState.places
    .filter(
      (p) =>
        !p.outsideRadius &&
        (appState.activity === "both" || p.activities.includes(appState.activity)) &&
        (appState.showUnconfirmed || isConfirmed(p)) &&
        (!q || normalizeName(p.name).includes(q))
    )
    // Confirmed places first (hand-checked or official agency records), then everything else by distance.
    .sort((a, b) => (isConfirmed(a) ? 0 : 1) - (isConfirmed(b) ? 0 : 1) || a.distanceMi - b.distanceMi);
}

// ---------- Map layers ----------
// A large parcel can reach into the search radius while its interior centre sits well outside it
// (Bankhead NF, or Wheeler NWR's river corridor). Those places belong in the results — they are
// public land within the radius — but drawing the dot at the centre puts a marker outside the
// search circle, which reads as a bug. Anchor it at the nearest point on the boundary instead.
function markerPoint(place) {
  const { center, radius } = appState.search;
  if (!place.polygons || milesBetween(center, place.point) <= radius) return place.point;
  let best = place.point;
  let bestMi = Infinity;
  for (const poly of place.polygons) {
    for (const pt of poly[0]) {
      const mi = milesBetween(center, pt);
      if (mi < bestMi) {
        bestMi = mi;
        best = pt;
      }
    }
  }
  return best;
}

function markerFor(place, selected) {
  const key = activityKey(place);
  const color = COLORS[key];
  const point = markerPoint(place);
  if (isConfirmed(place)) {
    return L.marker(point, {
      title: place.name,
      riseOnHover: true,
      zIndexOffset: selected ? 1000 : 0,
      icon: L.divIcon({
        className: "",
        html: `<div class="pin ${key} ${selected ? "selected" : ""}"></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }),
    });
  }
  return L.circleMarker(point, {
    bubblingMouseEvents: false,
    radius: selected ? 9 : 6,
    color: "#fff",
    weight: 2,
    fillColor: color,
    fillOpacity: 1,
  });
}

function shapeFor(place, selected) {
  const color = COLORS[activityKey(place)];
  const curated = isConfirmed(place);
  return L.polygon(place.polygons, {
    bubblingMouseEvents: false,
    color,
    weight: selected ? 3 : curated ? 2 : 1.2,
    opacity: selected ? 1 : 0.8,
    fillColor: color,
    fillOpacity: selected ? 0.28 : curated ? 0.16 : 0.08,
    dashArray: place.placeholderBoundary ? "6 6" : null,
  });
}

// Credits whichever state agencies' records are on the map right now, next to the tile credits.
let stateAttribution = "";
function updateStateAttribution(places) {
  const agencies = [...new Set(places.filter((p) => p.source === "state").map((p) => p.provenance.agency))];
  const text = agencies.map(escapeHtml).join(", ");
  if (text === stateAttribution) return;
  if (stateAttribution) map.attributionControl.removeAttribution(stateAttribution);
  if (text) map.attributionControl.addAttribution(text);
  stateAttribution = text;
}

function renderMapLayers() {
  placesLayer.clearLayers();
  layerById.clear();
  const places = visiblePlaces();
  updateStateAttribution(places);
  const bind = (layer, place) =>
    layer
      .bindTooltip(escapeHtml(place.name), { direction: "top", offset: [0, -8], sticky: layer instanceof L.Polygon })
      .on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        selectPlace(place.id, { fromMap: true });
      });

  // Shapes first so dots draw on top of them on the shared canvas.
  for (const place of places) {
    if (!place.polygons) continue;
    const shape = bind(shapeFor(place, place.id === appState.selectedId), place);
    placesLayer.addLayer(shape);
    layerById.set(place.id, { shape });
  }
  for (const place of places) {
    const marker = bind(markerFor(place, place.id === appState.selectedId), place);
    placesLayer.addLayer(marker);
    layerById.set(place.id, { ...(layerById.get(place.id) || {}), marker });
  }
}

function renderSearchLayer() {
  const { center, radius, label } = appState.search;
  searchLayer.clearLayers();
  const circle = L.circle(center, {
    radius: radius * MILES_TO_METERS,
    color: "#2f4a36",
    weight: 2,
    dashArray: "8 6",
    fill: true,
    fillOpacity: 0.03,
    interactive: false,
  }).addTo(searchLayer);
  L.marker(center, {
    keyboard: false,
    interactive: true,
    icon: L.divIcon({ className: "", html: '<div class="pin home"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }),
  })
    .bindTooltip(`${escapeHtml(label)} · ${radius} mi radius`, { direction: "top", offset: [0, -8] })
    .addTo(searchLayer);
  return circle;
}

// ---------- Results list ----------
function activityChips(place) {
  return place.activities.map((a) => `<span class="act act-${a}">${a === "hunting" ? "Hunt" : "Fish"}</span>`).join("");
}

function renderList() {
  const places = visiblePlaces();
  const { search, loading, errors } = appState;
  renderCoverageNote();
  if (!search) {
    $("tab-count").textContent = "";
    $("results-summary").innerHTML = "";
    $("results-status").innerHTML = `
      <div class="empty-state">
        <div class="empty-icon" aria-hidden="true">🗺️</div>
        <h3>Search a location to get started</h3>
        <p>Enter a U.S. city or town above to see public hunting and fishing land nearby.</p>
      </div>`;
    $("results-list").innerHTML = "";
    return;
  }

  $("tab-count").textContent = places.length ? places.length : "";
  $("results-summary").innerHTML = places.length
    ? `<strong>${places.length}</strong> place${places.length === 1 ? "" : "s"} within ${search.radius} mi of <strong>${escapeHtml(search.label)}</strong>`
    : `No places yet within ${search.radius} mi of <strong>${escapeHtml(search.label)}</strong>`;

  const lines = [];
  if (loading.lands) lines.push(`<p class="loading-line"><span class="spinner"></span>Searching federal &amp; state public lands…</p>`);
  if (loading.stateLands && appState.areaStates.some(stateLayersFor))
    lines.push(`<p class="loading-line"><span class="spinner"></span>Loading official state wildlife agency lands…</p>`);
  if (loading.osm) lines.push(`<p class="loading-line"><span class="spinner"></span>Finding fishing piers &amp; access spots…</p>`);
  if (errors.lands) lines.push(`<p class="notice">Couldn't load public lands (${escapeHtml(errors.lands)}). <button type="button" class="link-btn" data-retry>Try again</button></p>`);
  if (errors.stateLands) lines.push(`<p class="notice">Couldn't load official state agency lands (${escapeHtml(errors.stateLands)}). Areas below may be missing hunting status and official maps. <button type="button" class="link-btn" data-retry>Try again</button></p>`);
  if (errors.osm) lines.push(`<p class="notice">Fishing spots & shops are temporarily unavailable (OpenStreetMap servers are busy). <button type="button" class="link-btn" data-retry>Try again</button></p>`);
  if (!loading.lands && !loading.osm && !places.length && !errors.lands)
    lines.push(`<p class="notice">Nothing matches these filters. Try a larger radius, “Both”, or clear the name filter.</p>`);
  $("results-status").innerHTML = lines.join("");

  $("results-list").innerHTML =
    places
      .slice(0, LIST_LIMIT)
      .map(
        (p) => `
      <li>
        <button type="button" class="result ${p.id === appState.selectedId ? "is-selected" : ""}" data-id="${escapeHtml(p.id)}">
          <span class="result-icon ${activityKey(p)}" aria-hidden="true"></span>
          <span class="result-main">
            <span class="result-name">${escapeHtml(p.name)}</span>
            <span class="result-sub">${escapeHtml(p.typeLabel)}${p.state && p.state !== search.state ? ` · ${p.state}` : ""}${p.outsideRadius ? ` · outside ${search.radius}-mi radius` : ""}</span>
            <span class="result-tags">${activityChips(p)}${statusChip(p)}</span>
          </span>
          <span class="result-dist">${formatMiles(p.distanceMi)}</span>
        </button>
      </li>`
      )
      .join("") +
    (places.length > LIST_LIMIT
      ? `<li class="list-more">Showing the closest ${LIST_LIMIT} of ${places.length}. Narrow the radius or filter by name to see others.</li>`
      : "");
}

// How much this site knows about the searched state (coverage.js), stated plainly above the list.
function renderCoverageNote() {
  const el = $("coverage-note");
  const { search } = appState;
  const level = coverageLevel(search);
  el.hidden = !level;
  if (!level) return;
  const stateName = STATES[search.state]?.name || "this state";
  const agency = primaryAgency(search.state);
  const agencyLink = agency
    ? `<a href="${escapeHtml(agency.url)}" target="_blank" rel="noopener">${escapeHtml(agency.name)}</a>`
    : "the state wildlife agency";
  const statewide = statewideScopeFor(search.state);
  const [tag, text] =
    level === "detail"
      ? ["Detailed", `Hand-checked places with their own season dates for ${escapeHtml(detailAreaFor(search).label)}.`]
      : level === "stateLands"
        ? [
            "Official state lands",
            `${escapeHtml(stateLayersFor(search.state).summary.replace(/^./, (c) => c.toUpperCase()))} come straight from ${agencyLink}, ` +
              `including whether hunting is allowed. ` +
              (statewide ? "Season dates are a statewide summary." : "Season dates aren't built in yet."),
          ]
      : level === "statewide"
        ? ["Statewide seasons", `Season dates for ${escapeHtml(stateName)} are a statewide summary. Area-specific rules aren't built in.`]
        : ["Boundaries only", `Season dates for ${escapeHtml(stateName)} aren't built in yet. Check ${agencyLink}.`];
  el.innerHTML = `<span class="coverage-tag coverage-${level}">${tag}</span> ${text}`;
}

// ---------- Detail panel ----------
// Where an agency record came from, and when: the layer (linked to its official service page) and the
// retrieval time. The exact request URLs are kept on place.provenance.requests.
function stateCredit(place) {
  const { agency, layerName, layerUrl, retrievedAt } = place.provenance;
  const when = new Date(retrievedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const boundary = place.boundaryFrom === "padus"
    ? ' Boundary: <a href="https://www.usgs.gov/programs/gap-analysis-project/science/protected-areas" target="_blank" rel="noopener">USGS PAD-US</a> (simplified).'
    : "";
  return `Data: ${escapeHtml(agency)}, <a href="${escapeHtml(layerUrl)}" target="_blank" rel="noopener">${escapeHtml(layerName)}</a>, retrieved ${escapeHtml(when)}.${boundary}`;
}

function landNote(place) {
  if (place.source === "osm")
    return "Mapped by OpenStreetMap volunteers. It may be private, closed, or out of date, and fishing rules still apply. Confirm access before you go.";
  const t = place.typeLabel;
  let specific = "";
  if (t === "National Forest") specific = " National forest land is generally open to hunting and fishing under state regulations, with local closures.";
  else if (t === "BLM public land") specific = " BLM land is generally open to hunting and fishing under state regulations, with local closures.";
  else if (t === "National Wildlife Refuge") specific = " Many refuges allow hunting or fishing only in certain units and seasons, and some allow none — check the refuge's own rules.";
  else if (t === "Wildlife Management Area") specific = " Wildlife management areas usually require extra permits and have their own season dates.";
  return `This is public land from the USGS Protected Areas Database. The database shows who owns it and whether the public can get in. It does not say whether hunting or fishing is allowed.${specific}`;
}

function seasonsBlock(place) {
  if (!place.seasonScope) return "";
  if (!scopeShownForPlace(place, appState.search))
    return `<p class="notice">Season dates are only shown when you search inside ${escapeHtml(detailAreaForScope(place.seasonScope)?.label || "this area")}.</p>`;
  const rows = selectedGamesList()
    .map(
      (g) => `<li><span class="game-dot" style="background:${GAME[g].color}"></span>
        <span class="g-label">${GAME[g].label}</span><span class="g-status">${statusText(place.seasonScope, g)}</span></li>`
    )
    .join("");
  return `
    <section class="detail-seasons">
      <div class="detail-seasons-head">
        <h3>${SEASON_YEAR} seasons <span class="sub">as of ${formatDay(TODAY)}</span></h3>
        <button type="button" class="btn-secondary small icon-btn" data-cal-scope="${place.seasonScope}"
          aria-label="Open full season calendar" title="Open full season calendar">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
            <path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
              d="M7 3v3M17 3v3M4 9h16M5.5 5.5h13a1.5 1.5 0 011.5 1.5v12a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 19V7a1.5 1.5 0 011.5-1.5z"/>
            <rect x="7.5" y="12" width="3" height="3" rx="0.6" fill="currentColor"/>
          </svg>
        </button>
      </div>
      <ul>${rows}</ul>
    </section>`;
}

function renderDetail(place) {
  const { search } = appState;
  const agency = primaryAgency(place.state || search.state);
  const facts = [
    ["Distance", `${formatMiles(place.distanceMi)} from ${escapeHtml(search.label)}<small>${place.polygons ? "straight-line to nearest edge" : "straight-line"}</small>`],
    ["Managed by", escapeHtml(place.manager)],
    place.access && ["Access", escapeHtml(place.access)],
    place.acres ? ["Size", `~${place.acres.toLocaleString()} acres`] : null,
    place.state && STATES[place.state] ? ["State", STATES[place.state].name] : null,
    ...(place.facts || []).map(([k, v]) => [escapeHtml(k), escapeHtml(v)]),
  ].filter(Boolean);

  const actions = [];
  const officialUrl = place.mapUrl || place.sourceUrl || (agency && agency.url);
  if (officialUrl) actions.push(`<a class="btn-primary block" href="${escapeHtml(officialUrl)}" target="_blank" rel="noopener">Official Map &amp; Rules &rarr;</a>`);
  if (place.pageLink) actions.push(`<a class="btn-secondary" href="${escapeHtml(place.pageLink[1])}" target="_blank" rel="noopener">${escapeHtml(place.pageLink[0])}</a>`);
  actions.push(`<a class="btn-secondary" href="https://www.google.com/maps/dir/?api=1&destination=${place.point[0]},${place.point[1]}" target="_blank" rel="noopener">Directions</a>`);
  if (place.osmUrl) actions.push(`<a class="btn-secondary" href="${escapeHtml(place.osmUrl)}" target="_blank" rel="noopener">View on OpenStreetMap</a>`);
  actions.push(`<button type="button" class="btn-secondary" data-zoom="${escapeHtml(place.id)}">Zoom to</button>`);


  $("place-detail").innerHTML = `
    <div class="detail-nav"><button type="button" class="back-btn" data-back>&larr; All places</button></div>
    <header class="detail-head">
      <div class="result-tags">${activityChips(place)}${statusChip(place)}</div>
      <h2>${escapeHtml(place.name)}</h2>
      <p class="detail-type">${escapeHtml(place.typeLabel)}</p>
    </header>
    <p class="detail-desc">${escapeHtml(place.description)}</p>
    <dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>
    ${!isConfirmed(place) ? `<div class="notice warn"><strong>Not confirmed open to hunting or fishing.</strong> ${escapeHtml(landNote(place))}</div>` : ""}
    ${place.placeholderBoundary ? `<p class="notice">The dashed shape is a rough placeholder, not the official boundary. Search again to load the real boundary.</p>` : ""}
    ${seasonsBlock(place)}
    <div class="detail-actions">${actions.join("")}</div>
    <div class="popup-warning"><strong>Not official.</strong> ${escapeHtml(disclaimerText(place.state || search.state))}</div>
    <p class="data-credit">${
      place.source === "curated"
        ? "Listed place. Coordinates are approximate."
        : place.source === "state"
          ? stateCredit(place)
        : place.source === "padus"
          ? 'Boundary: <a href="https://www.usgs.gov/programs/gap-analysis-project/science/protected-areas" target="_blank" rel="noopener">USGS PAD-US</a> (simplified).'
          : 'Location: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">&copy; OpenStreetMap contributors</a>.'
    }</p>`;
}

// ---------- Panel view switching ----------
let listScrollTop = 0;

function showPanel() {
  const { tab, selectedId } = appState;
  const place = selectedId && appState.places.find((p) => p.id === selectedId);
  document.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === tab)));
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    const name = panel.dataset.panel;
    panel.hidden = !(
      (tab === "places" && name === (place ? "detail" : "places")) ||
      (tab !== "places" && name === tab)
    );
  });
  if (tab === "places" && place) renderDetail(place);
}

function setTab(tab) {
  if (appState.tab === "places" && !appState.selectedId) listScrollTop = $("panel-body").scrollTop;
  appState.tab = tab;
  showPanel();
  $("panel-body").scrollTop = tab === "places" && !appState.selectedId ? listScrollTop : 0;
}

function selectPlace(id, { fromMap = false } = {}) {
  if (!appState.selectedId && appState.tab === "places") listScrollTop = $("panel-body").scrollTop;
  appState.selectedId = id;
  appState.tab = "places";
  const place = appState.places.find((p) => p.id === id);
  renderMapLayers();
  showPanel();
  $("panel-body").scrollTop = 0;
  if (place && !fromMap) zoomToPlace(place);
  else if (place && !map.getBounds().contains(place.point)) map.panTo(place.point);
}

function clearSelection() {
  appState.selectedId = null;
  renderMapLayers();
  renderList();
  showPanel();
  $("panel-body").scrollTop = listScrollTop;
}

function zoomToPlace(place) {
  const layers = layerById.get(place.id);
  if (layers?.shape) map.fitBounds(layers.shape.getBounds(), { padding: [40, 40], maxZoom: 13 });
  else map.setView(place.point, Math.max(map.getZoom(), 13));
}

// ---------- Rendering everything that depends on state ----------
function refreshAll() {
  const gameVisible = seasonsAvailable() && appState.activity !== "fishing";
  $("map-game-wrap").hidden = !gameVisible;
  renderMapLayers();
  renderList();
  renderCalendar();
  renderResources();
  renderAlmanac();
  renderCalibers();
  if (appState.selectedId && !appState.places.some((p) => p.id === appState.selectedId)) appState.selectedId = null;
  showPanel();
  renderDisclaimerAgency();
}

function renderDisclaimerAgency() {
  const link = $("disclaimer-agency");
  if (!appState.search) {
    link.textContent = "state wildlife agency";
    link.removeAttribute("href");
    return;
  }
  const agency = agencyForDisclaimer(appState.search.state);
  link.textContent = agency.name;
  link.href = agency.url;
}

// ---------- Search ----------
let searchToken = 0;
let searchAbort = null;

async function runSearch(search, { fit = true, updateUrl = true } = {}) {
  const token = ++searchToken;
  searchAbort?.abort();
  searchAbort = new AbortController();
  const { signal } = searchAbort;

  appState.search = { ...search }; // seasonsAvailable() reads this
  $("map-prompt").hidden = true;
  appState.selectedId = null;
  appState.places = curatedPlaces(search.center, search.radius);
  appState.shops = [];
  appState.areaStates = [search.state].filter(Boolean);
  appState.areaStatePolys = [];
  appState.loading = { lands: true, osm: true, states: true, stateLands: true };
  appState.errors = {};

  $("city-search").value = search.label;
  $("radius-select").value = String(search.radius);
  if (updateUrl) writeUrl();

  const circle = renderSearchLayer();
  if (fit) map.fitBounds(circle.getBounds(), { padding: [16, 16] });
  if (appState.tab === "places") $("panel-body").scrollTop = 0;
  refreshAll();

  const stale = () => token !== searchToken;

  const statesTask = fetchStatesInArea(search.center, search.radius, signal)
    .then((states) => {
      if (stale()) return;
      appState.areaStatePolys = states;
      appState.areaStates = [...new Set([search.state, ...states.map((s) => s.abbr)].filter((a) => STATES[a]))];
      assignStates();
    })
    .catch(() => {})
    .finally(() => {
      if (stale()) return;
      appState.loading.states = false;
      renderResources();
      renderAlmanac(); // its Official Resources section lists an agency per state in the area
      renderList();
      if (appState.tab === "seasons") renderCalendar();
    });

  const landsTask = fetchPublicLands(search.center, search.radius, signal)
    .then(async (lands) => {
      if (stale()) return;
      await statesTask;
      if (stale()) return;
      appState.places = mergeLands(appState.places, lands, search.center);
      assignStates();
    })
    .catch((err) => {
      if (!stale() && !signal.aborted) appState.errors.lands = err.name === "TimeoutError" ? "timed out" : err.message;
    })
    .finally(() => {
      if (stale()) return;
      appState.loading.lands = false;
      renderMapLayers();
      renderList();
    });

  // Official agency layers for every state in the area that has any (coverage.js). They merge only
  // once PAD-US has also settled, because they replace PAD-US twins by name.
  let stateLands = [];
  const stateLandsTask = statesTask
    .then(() => (stale() ? [] : fetchStateLands(appState.areaStates, search.center, search.radius, signal)))
    .then((lands) => (stateLands = lands))
    .catch((err) => {
      if (!stale() && !signal.aborted) appState.errors.stateLands = err.name === "TimeoutError" ? "timed out" : err.message;
    });
  const mergeTask = Promise.allSettled([landsTask, stateLandsTask]).then(() => {
    if (stale()) return;
    appState.places = mergeStateLands(appState.places, stateLands, search.center);
    assignStates();
    appState.loading.stateLands = false;
    renderMapLayers();
    renderList();
  });

  fetchOsmFeatures(search.center, search.radius, signal)
    .then(async ({ water, shops }) => {
      if (stale()) return;
      await Promise.allSettled([statesTask, landsTask, mergeTask]);
      if (stale()) return;
      // Skip mapped spots that duplicate a confirmed fishing place or a same-named public land (e.g. a fishing access site).
      const curatedFishing = appState.places.filter((p) => isConfirmed(p) && p.activities.includes("fishing"));
      const lands = appState.places.filter((p) => (p.source === "padus" || p.source === "state") && p.polygons);
      const fresh = water.filter((w) => {
        if (curatedFishing.some((c) => milesBetween(c.point, w.point) < 0.3)) return false;
        const key = normalizeName(w.name);
        return !lands.some((l) => normalizeName(l.name).startsWith(key) && milesToPolygons(w.point, l.polygons) < 1);
      });
      appState.places = [...appState.places, ...fresh];
      appState.shops = shops;
      assignStates();
    })
    .catch(() => {
      if (!stale() && !signal.aborted) appState.errors.osm = true;
    })
    .finally(() => {
      if (stale()) return;
      appState.loading.osm = false;
      renderMapLayers();
      renderList();
      renderResources();
    });
}

function retrySearch() {
  runSearch(appState.search, { fit: false, updateUrl: false });
}

// ---------- URL state (shareable links; ?date= preview is preserved) ----------
function writeUrl() {
  const { label, center, state, radius } = appState.search;
  const params = new URLSearchParams(location.search);
  params.set("q", label);
  params.set("lat", center[0].toFixed(5));
  params.set("lng", center[1].toFixed(5));
  params.set("st", state);
  params.set("r", radius);
  try {
    history.replaceState(null, "", `${location.pathname}?${params}`);
  } catch {
    // Some browsers block history changes on file:// pages; the app still works without it.
  }
}

function readUrl() {
  const p = new URLSearchParams(location.search);
  const lat = parseFloat(p.get("lat"));
  const lng = parseFloat(p.get("lng"));
  const radius = [10, 25, 50, 100].includes(+p.get("r")) ? +p.get("r") : 50;
  if (!p.get("q") || Number.isNaN(lat) || Number.isNaN(lng)) return null; // no search yet: show the prompt
  return { label: p.get("q"), center: [lat, lng], state: stateAbbr(p.get("st")), radius };
}

// ---------- City autocomplete ----------
const searchInput = $("city-search");
const suggestionsEl = $("city-suggestions");
let suggestions = [];
let activeIndex = -1;
let suggestTimer = null;
let suggestAbort = null;

function closeSuggestions() {
  suggestionsEl.hidden = true;
  searchInput.setAttribute("aria-expanded", "false");
  activeIndex = -1;
}

function renderSuggestions(message) {
  if (message) {
    suggestionsEl.innerHTML = `<li class="suggestion-msg">${escapeHtml(message)}</li>`;
  } else {
    suggestionsEl.innerHTML = suggestions
      .map(
        (s, i) => `<li role="option" id="sugg-${i}" class="suggestion ${i === activeIndex ? "active" : ""}" data-index="${i}" aria-selected="${i === activeIndex}">
          <span class="s-name">${escapeHtml(s.label)}</span><span class="s-detail">${escapeHtml(s.detail)}</span></li>`
      )
      .join("");
  }
  suggestionsEl.hidden = false;
  searchInput.setAttribute("aria-expanded", "true");
  searchInput.setAttribute("aria-activedescendant", activeIndex >= 0 ? `sugg-${activeIndex}` : "");
}

function chooseSuggestion(s) {
  closeSuggestions();
  searchInput.blur();
  runSearch({ label: s.label, center: s.center, state: s.state, radius: +$("radius-select").value });
}

searchInput.addEventListener("input", () => {
  clearTimeout(suggestTimer);
  const text = searchInput.value.trim();
  if (text.length < 3) {
    suggestions = [];
    closeSuggestions();
    return;
  }
  suggestTimer = setTimeout(async () => {
    suggestAbort?.abort();
    suggestAbort = new AbortController();
    try {
      suggestions = await geocodeCities(text, suggestAbort.signal);
      activeIndex = suggestions.length ? 0 : -1;
      renderSuggestions(suggestions.length ? null : "No U.S. cities found");
    } catch (err) {
      if (err.name !== "AbortError") renderSuggestions("City search is unavailable — press Enter to try again");
    }
  }, 300);
});

searchInput.addEventListener("keydown", (e) => {
  if (suggestionsEl.hidden || !suggestions.length) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    activeIndex = (activeIndex + (e.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length;
    renderSuggestions();
  } else if (e.key === "Escape") {
    closeSuggestions();
  }
});

suggestionsEl.addEventListener("mousedown", (e) => {
  const li = e.target.closest("[data-index]");
  if (!li) return;
  e.preventDefault(); // keep focus so the click lands
  chooseSuggestion(suggestions[+li.dataset.index]);
});

searchInput.addEventListener("blur", () => setTimeout(closeSuggestions, 150));

$("search-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearTimeout(suggestTimer);
  const text = searchInput.value.trim();
  if (!suggestionsEl.hidden && suggestions[activeIndex]) return chooseSuggestion(suggestions[activeIndex]);
  if (appState.search && text === appState.search.label) return runSearch({ ...appState.search, radius: +$("radius-select").value });
  if (text.length < 2) return;

  renderSuggestions("Searching…");
  try {
    let results = [];
    try {
      results = await geocodeCities(text);
    } catch {
      results = await geocodeFallback(text);
    }
    if (!results.length) results = await geocodeFallback(text);
    if (results.length) chooseSuggestion(results[0]);
    else renderSuggestions(`Couldn't find “${text}” in the U.S.`);
  } catch {
    renderSuggestions("City search is unavailable right now. Try again shortly.");
  }
});

$("radius-select").addEventListener("change", (e) => {
  if (!appState.search) return; // nothing searched yet; the new radius applies to the first search
  runSearch({ ...appState.search, radius: +e.target.value });
});

// ---------- Filters, tabs & panel events ----------
document.querySelectorAll('input[name="activity"]').forEach((input) =>
  input.addEventListener("change", (e) => {
    appState.activity = e.target.value;
    refreshAll();
  })
);

$("list-filter").addEventListener("input", (e) => {
  appState.filterText = e.target.value;
  renderMapLayers();
  renderList();
});

$("show-unconfirmed").addEventListener("change", (e) => {
  appState.showUnconfirmed = e.target.checked;
  renderMapLayers();
  renderList();
});

document.querySelectorAll(".game-select").forEach((sel) => {
  sel.innerHTML =
    `<option value="all">All game seasons</option>` +
    Object.entries(GAME).map(([id, g]) => `<option value="${id}">${g.label}</option>`).join("");
  sel.addEventListener("change", (e) => {
    appState.game = e.target.value;
    document.querySelectorAll(".game-select").forEach((s) => (s.value = appState.game));
    refreshAll();
  });
});

document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => setTab(tab.dataset.tab)));

document.addEventListener("click", (e) => {
  const t = e.target;
  const result = t.closest(".result[data-id]");
  if (result) return selectPlace(result.dataset.id);
  if (t.closest("[data-back]")) return clearSelection();
  const zoom = t.closest("[data-zoom]");
  if (zoom) {
    const place = appState.places.find((p) => p.id === zoom.dataset.zoom);
    if (place) zoomToPlace(place);
    return;
  }
  const calBtn = t.closest("[data-cal-scope]");
  if (calBtn) {
    setCalendarScope(calBtn.dataset.calScope);
    return setTab("seasons");
  }
  if (t.closest("[data-retry]")) return retrySearch();
  const sample = t.closest("[data-sample-area]");
  if (sample) {
    const area = DETAIL_AREAS.find((a) => a.id === sample.dataset.sampleArea);
    if (area) return runSearch({ ...area.sampleSearch });
  }
});

// Click on empty map closes the detail view.
map.on("click", () => {
  if (appState.selectedId) clearSelection();
});

// Phone layout: let the map take most of the screen.
$("map-toggle").addEventListener("click", () => {
  const expanded = $("app").classList.toggle("map-expanded");
  $("map-toggle").setAttribute("aria-pressed", String(expanded));
  $("map-toggle").textContent = expanded ? "Show list" : "Expand map";
});

// Disclaimer "More" toggle (the full text is clamped on small screens).
$("disclaimer-toggle").addEventListener("click", () => {
  const open = $("disclaimer").classList.toggle("open");
  $("disclaimer-toggle").setAttribute("aria-expanded", String(open));
  $("disclaimer-toggle").textContent = open ? "Less" : "More";
});

// ---------- Resizable split between the panel and the map ----------
// The handle drives --panel-w on #app (the grid's first column). Only the desktop layout uses it;
// on phones the panel sits under the map and the handle is hidden.
const SPLIT_KEY = "plw.splitRatio";
const MIN_PANEL_W = 300;
const MIN_MAP_W = 320;
const appEl = $("app");
const resizerEl = $("resizer");

const splitActive = () => getComputedStyle(resizerEl).display !== "none";

function storedSplitRatio() {
  try {
    const v = parseFloat(localStorage.getItem(SPLIT_KEY));
    return v > 0 && v < 1 ? v : null;
  } catch {
    // Storage can be unavailable (private mode, some file:// contexts); the split just isn't remembered.
    return null;
  }
}

function reportSplit(width) {
  resizerEl.setAttribute("aria-valuenow", String(Math.round((width / appEl.clientWidth) * 100)));
}

// Sets the panel width in px, clamped so neither side can collapse. `save` records the ratio.
function applySplit(px, save = false) {
  const total = appEl.clientWidth;
  const max = total - MIN_MAP_W - resizerEl.offsetWidth;
  if (!total || max < MIN_PANEL_W) return; // window too narrow to honour both minimums
  const width = Math.min(Math.max(px, MIN_PANEL_W), max);
  appEl.style.setProperty("--panel-w", `${Math.round(width)}px`);
  reportSplit(width);
  if (save) {
    try {
      localStorage.setItem(SPLIT_KEY, String(width / total));
    } catch {}
  }
}

function restoreSplit() {
  if (!splitActive()) {
    appEl.style.removeProperty("--panel-w");
    return;
  }
  const panelW = $("panel").getBoundingClientRect().width;
  const ratio = storedSplitRatio();
  if (ratio != null) applySplit(ratio * appEl.clientWidth);
  // No stored ratio (storage blocked) but the user has dragged: re-clamp the live width, or a
  // wide panel would stay frozen and squeeze the map under its minimum in a narrower window.
  else if (appEl.style.getPropertyValue("--panel-w")) applySplit(panelW);
  else reportSplit(panelW); // untouched: leave the CSS default responsive
}

resizerEl.addEventListener("pointerdown", (e) => {
  if (!splitActive()) return;
  e.preventDefault();
  resizerEl.setPointerCapture(e.pointerId);
  appEl.classList.add("is-resizing");
});

resizerEl.addEventListener("pointermove", (e) => {
  if (!appEl.classList.contains("is-resizing")) return;
  applySplit(e.clientX - appEl.getBoundingClientRect().left);
});

const endResize = (e) => {
  if (!appEl.classList.contains("is-resizing")) return;
  appEl.classList.remove("is-resizing");
  try {
    resizerEl.releasePointerCapture(e.pointerId);
  } catch {} // already released, e.g. on a cancelled drag
  applySplit($("panel").getBoundingClientRect().width, true);
};
resizerEl.addEventListener("pointerup", endResize);
resizerEl.addEventListener("pointercancel", endResize);

resizerEl.addEventListener("keydown", (e) => {
  const step = e.key === "ArrowLeft" ? -24 : e.key === "ArrowRight" ? 24 : 0;
  if (!step || !splitActive()) return;
  e.preventDefault();
  applySplit($("panel").getBoundingClientRect().width + step, true);
});

window.addEventListener("resize", restoreSplit);
restoreSplit();

// ---------- Start ----------
initCalendar();
initAlmanac();
initCalibers();
const initialSearch = readUrl();
if (initialSearch) runSearch(initialSearch, { updateUrl: false });
else refreshAll();
