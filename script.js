// App shell: city search, map, results list, detail panel and tabs.
// Data: data.js (hand-checked places), seasons.js (AL season dates), live.js (nationwide lookups),
// states.js (state agencies), resources.js (licenses & gear), calendar.js (season calendar),
// almanac.js (almanac tab). ui.js supplies icons, storage, toasts, recent searches and saved places.

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
  sort: "distance", // "distance" | "size" | "name"; confirmed places always list first
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

function placeById(id) {
  return appState.places.find((p) => p.id === id) || null;
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

// Optional overlay: the Forest Service's Motor Vehicle Use Map (live.js). It is drawn by the Service
// as one image per view, in its own pane under the public-land shapes so those stay clickable.
map.createPane("mvum").style.zIndex = 250;
map.getPane("mvum").style.pointerEvents = "none";
const mvumLayer = L.layerGroup();
let mvumImage = null;
let mvumAbort = null;

const mvumActive = () => map.hasLayer(mvumLayer);

function refreshMvum() {
  const key = $("mvum-key");
  key.hidden = !mvumActive();
  if (!mvumActive()) return;
  const zoomedIn = map.getZoom() >= MVUM_MIN_ZOOM;
  $("mvum-key-text").textContent = zoomedIn ? "Forest roads & motor trails — click one for details" : "Zoom in to see forest roads & trails";
  if (!zoomedIn) {
    mvumLayer.clearLayers();
    mvumImage = null;
    return;
  }
  const bounds = map.getBounds();
  const crs = map.options.crs;
  const next = L.imageOverlay(mvumImageUrl(crs.project(bounds.getSouthWest()), crs.project(bounds.getNorthEast()), map.getSize()), bounds, {
    pane: "mvum",
    opacity: 0.9,
  });
  // Keep the previous image up until the new one has loaded, so panning doesn't blank the roads.
  const previous = mvumImage;
  mvumImage = next;
  next.on("load", () => previous && mvumLayer.removeLayer(previous));
  next.on("error", () => mvumLayer.removeLayer(next));
  mvumLayer.addLayer(next);
}

// The designated road or trail under a map click, shown in a popup. Resolves true when one was
// shown; silent (false) when there is none or the overlay is off.
async function showMvumRoute(latlng) {
  if (!mvumActive() || map.getZoom() < MVUM_MIN_ZOOM) return false;
  mvumAbort?.abort();
  mvumAbort = new AbortController();
  // About 8 screen pixels either side of the pointer, in metres on the ground.
  const metersPerPixel = (40075016.686 * Math.cos((latlng.lat * Math.PI) / 180)) / (256 * 2 ** map.getZoom());
  let route;
  try {
    route = await fetchMvumRoute(latlng, metersPerPixel * 8, mvumAbort.signal);
  } catch {
    return false;
  }
  if (!route) return false;
  const title = [route.kind, route.number].filter(Boolean).join(" ") + (route.name ? ` · ${route.name}` : "");
  const rows = [
    route.designation && ["Designation", route.designation],
    ...route.open.map((o) => [`Open ${o.dates}`, o.vehicles.join(", ")]),
    route.surface && ["Surface", route.surface.toLowerCase()],
    route.maintenance && ["Maintained for", route.maintenance.toLowerCase()],
    (route.forest || route.district) && ["Forest", [route.forest, route.district].filter(Boolean).join(", ")],
  ].filter(Boolean);
  const when = new Date(route.retrievedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  L.popup({ maxWidth: 300 })
    .setLatLng(latlng)
    .setContent(
      `<div class="mvum-popup">
        <strong>${escapeHtml(title)}</strong>
        <dl>${rows.map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join("")}</dl>
        <p>Dates are as published on the Motor Vehicle Use Map. Temporary closure orders are not included — check with the ranger district.</p>
        <p>Data: U.S. Forest Service, <a href="${escapeHtml(ENDPOINTS.usfsMvum)}" target="_blank" rel="noopener">Motor Vehicle Use Map</a>, retrieved ${escapeHtml(when)}.</p>
      </div>`
    )
    .openOn(map);
  return true;
}

L.control.layers(baseMaps, { "Forest roads &amp; trails (USFS)": mvumLayer }, { position: "topright" }).addTo(map);
map.on("overlayadd overlayremove moveend", refreshMvum);
map.on("click", (e) => showMvumRoute(e.latlng));
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
  // A hand-checked place already covers its refuge/WMA (matched by padusName); don't list it twice.
  const curatedNames = new Set(places.filter((p) => p.source === "curated" && p.padusName).map((p) => normalizeName(p.padusName)));
  for (const s of stateLands) {
    if (curatedNames.has(normalizeName(s.name))) continue;
    const twin = padusByName.get(normalizeName(s.name));
    if (twin) {
      drop.add(twin.id);
    }
    if (twin && !s.ownBoundary) {
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

// The orderings the list offers. Each falls back to distance, so ties never shuffle.
const PLACE_SORTS = {
  distance: (a, b) => a.distanceMi - b.distanceMi,
  size: (a, b) => (b.acres || 0) - (a.acres || 0) || a.distanceMi - b.distanceMi,
  name: (a, b) => a.name.localeCompare(b.name, "en", { numeric: true }) || a.distanceMi - b.distanceMi,
};

function visiblePlaces() {
  const q = normalizeName(appState.filterText);
  const order = PLACE_SORTS[appState.sort] || PLACE_SORTS.distance;
  return appState.places
    .filter(
      (p) =>
        !p.outsideRadius &&
        (appState.activity === "both" || p.activities.includes(appState.activity)) &&
        (appState.showUnconfirmed || isConfirmed(p)) &&
        (!q || normalizeName(p.name).includes(q))
    )
    // Confirmed places first (hand-checked or official agency records), then everything else in the chosen order.
    .sort((a, b) => (isConfirmed(a) ? 0 : 1) - (isConfirmed(b) ? 0 : 1) || order(a, b));
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

// A place is drawn in one of three states: plain, "hover" (its list row is under the pointer or has
// keyboard focus) or "selected". Both functions below take that state, so emphasizePlace() can
// restyle one place in place instead of rebuilding every layer.
const DOT_RADIUS = { selected: 9, hover: 8 };

function markerFor(place, state) {
  const key = activityKey(place);
  const color = COLORS[key];
  const point = markerPoint(place);
  if (isConfirmed(place)) {
    return L.marker(point, {
      title: place.name,
      riseOnHover: true,
      zIndexOffset: state ? 1000 : 0,
      icon: L.divIcon({
        className: "",
        html: `<div class="pin ${key} ${state || ""}"></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }),
    });
  }
  return L.circleMarker(point, {
    bubblingMouseEvents: false,
    radius: DOT_RADIUS[state] || 6,
    color: "#fff",
    weight: 2,
    fillColor: color,
    fillOpacity: 1,
  });
}

function shapeStyle(place, state) {
  const color = COLORS[activityKey(place)];
  const confirmed = isConfirmed(place);
  const selected = state === "selected";
  const hover = state === "hover";
  return {
    color,
    weight: selected ? 3 : hover ? 2.6 : confirmed ? 2 : 1.2,
    opacity: selected || hover ? 1 : 0.8,
    fillColor: color,
    fillOpacity: selected ? 0.28 : hover ? 0.24 : confirmed ? 0.16 : 0.08,
    dashArray: place.placeholderBoundary ? "6 6" : null,
  };
}

function shapeFor(place, state) {
  return L.polygon(place.polygons, { bubblingMouseEvents: false, ...shapeStyle(place, state) });
}

// Restyle one place's shape and marker for `state` ("selected", "hover" or null). Selecting or
// hovering a place used to rebuild every layer on the map; this touches only the one that changed.
function emphasizePlace(id, state) {
  const layers = layerById.get(id);
  const place = layers && placeById(id);
  if (!place) return;
  layers.shape?.setStyle(shapeStyle(place, state));
  const marker = layers.marker;
  if (!marker) return;
  if (marker instanceof L.CircleMarker) {
    marker.setRadius(DOT_RADIUS[state] || 6);
    if (state) marker.bringToFront();
  } else {
    const pin = marker.getElement()?.firstElementChild;
    if (pin) {
      pin.classList.toggle("selected", state === "selected");
      pin.classList.toggle("hover", state === "hover");
    }
    marker.setZIndexOffset(state ? 1000 : 0);
  }
}

// The list row under the pointer (or with keyboard focus) lights up its place on the map.
let hoverId = null;
function setHoverPlace(id) {
  if (id === hoverId) return;
  if (hoverId && hoverId !== appState.selectedId) emphasizePlace(hoverId, null);
  hoverId = id;
  if (id && id !== appState.selectedId) emphasizePlace(id, "hover");
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
  hoverId = null;
  const places = visiblePlaces();
  const stateOf = (place) => (place.id === appState.selectedId ? "selected" : null);
  updateStateAttribution(places);
  const bind = (layer, place) =>
    layer
      .bindTooltip(escapeHtml(place.name), { direction: "top", offset: [0, -8], sticky: layer instanceof L.Polygon })
      .on("click", async (e) => {
        L.DomEvent.stopPropagation(e);
        // With the forest-roads overlay on, a click on a road inside a parcel is for the road.
        if (await showMvumRoute(e.latlng)) return;
        selectPlace(place.id, { fromMap: true });
      });

  // Shapes first so dots draw on top of them on the shared canvas.
  for (const place of places) {
    if (!place.polygons) continue;
    // A rough hand-drawn outline must never stand in for a real boundary. Places that have an
    // official PAD-US twin show only their dot until the real polygon arrives (or if it never does).
    if (place.placeholderBoundary && place.padusName) continue;
    const shape = bind(shapeFor(place, stateOf(place)), place);
    placesLayer.addLayer(shape);
    layerById.set(place.id, { shape });
  }
  for (const place of places) {
    const marker = bind(markerFor(place, stateOf(place)), place);
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

// Where a place's hunting or fishing status comes from, in a word. The list is grouped the same way.
function confidenceBadge(place) {
  if (place.source === "curated") return `<span class="badge verified">${icon("check", 11)}Hand-checked</span>`;
  if (place.source === "state") return `<span class="badge verified">${icon("check", 11)}Agency record</span>`;
  return `<span class="badge unconfirmed">Unconfirmed</span>`;
}

// The coloured tile beside a place's name: filled when its status is confirmed, outlined when it
// is not — the same split the map makes between a large pin and a small dot.
function placeIcon(place) {
  const key = activityKey(place);
  return `<span class="result-icon ${key}${isConfirmed(place) ? "" : " soft"}" aria-hidden="true">${icon(key === "hunting" ? "hunt" : "fish", 20)}</span>`;
}

function resultRow(p, search, savedIds) {
  const [dist, unit] = formatMiles(p.distanceMi).split(" ");
  const sub = [p.typeLabel, p.acres ? `${p.acres.toLocaleString()} acres` : null, p.state && p.state !== search.state ? p.state : null]
    .filter(Boolean)
    .map(escapeHtml)
    .join(" · ");
  const saved = savedIds.has(p.id) ? `<span class="badge saved">${icon("starFilled", 10)}Saved</span>` : "";
  return `
      <li>
        <button type="button" class="result ${p.id === appState.selectedId ? "is-selected" : ""}" data-id="${escapeHtml(p.id)}">
          ${placeIcon(p)}
          <span class="result-main">
            <span class="result-name">${escapeHtml(p.name)}</span>
            <span class="result-sub">${sub}</span>
            <span class="result-tags">${activityChips(p)}${statusChip(p)}${saved}</span>
          </span>
          <span class="result-dist"><b>${dist}</b><small>${unit}</small></span>
        </button>
      </li>`;
}

// Search presets for the welcome panel. Approximate city-centre coordinates — a starting point for
// a live search, not project data. Chosen to show each level of coverage (see coverage.js).
const EXAMPLE_SEARCHES = [
  { label: "Huntsville, AL", center: HUNTSVILLE, state: "AL" },
  { label: "Asheville, NC", center: [35.5951, -82.5515], state: "NC" },
  { label: "Chattanooga, TN", center: [35.0456, -85.3097], state: "TN" },
  { label: "Bozeman, MT", center: [45.677, -111.0429], state: "MT" },
  { label: "Lander, WY", center: [42.833, -108.7307], state: "WY" },
  { label: "Moab, UT", center: [38.5733, -109.5498], state: "UT" },
];

// First-visit panel: the saved places and recent searches kept in this browser, plus the examples.
function renderWelcome() {
  const saved = savedPlaces();
  $("welcome-saved").hidden = !saved.length;
  $("saved-list").innerHTML = saved
    .map(
      (p) => `
      <li class="saved-item">
        <button type="button" class="saved-open" data-saved="${escapeHtml(p.id)}">
          ${placeIcon(p)}
          <span class="result-main">
            <span class="result-name">${escapeHtml(p.name)}</span>
            <span class="result-sub">${escapeHtml([p.typeLabel, `near ${p.search.label}`].filter(Boolean).join(" · "))}</span>
          </span>
        </button>
        <button type="button" class="saved-remove" data-unsave="${escapeHtml(p.id)}" aria-label="Remove ${escapeHtml(p.name)} from saved places">${icon("close", 15)}</button>
      </li>`
    )
    .join("");

  const recent = recentSearches();
  $("welcome-recent").hidden = !recent.length;
  $("recent-list").innerHTML = recent
    .map((s, i) => `<button type="button" class="bg-chip" data-recent="${i}">${escapeHtml(s.label)} <small>${s.radius} mi</small></button>`)
    .join("");
  $("example-list").innerHTML = EXAMPLE_SEARCHES.map((s, i) => `<button type="button" class="bg-chip" data-example="${i}">${escapeHtml(s.label)}</button>`).join("");
}

// The four tiles in the area card: what it is like there right now. Weather is the live NWS
// forecast the Almanac already fetched (almanac.js); sun times are calculated there too.
function renderConditions() {
  const el = $("area-now");
  const { search } = appState;
  if (!el || !search) return;
  const { status, weather } = almanacState;
  const zone = zoneFor(search.center, weather);
  const sun = sunTimes(TODAY, search.center[0], search.center[1]);
  const now = weather?.now;
  const waiting = status === "loading" || status === "idle";
  const blank = waiting ? "…" : "—";
  const tiles = [
    ["Now", now ? `${now.temperature}°${now.temperatureUnit}` : blank],
    [now?.windDirection ? `Wind · ${now.windDirection}` : "Wind", now?.windSpeed ? now.windSpeed.replace(" to ", "–") : blank],
    ["Sunrise", formatClock(sun.sunrise, zone)],
    ["Sunset", formatClock(sun.sunset, zone)],
  ];
  el.innerHTML = tiles
    .map(([k, v]) => `<span class="area-stat${v === "…" ? " is-loading" : ""}"><span class="bg-k">${escapeHtml(k)}</span><span class="bg-v">${escapeHtml(v)}</span></span>`)
    .join("");
  const spoken = [
    now && `${now.temperature} degrees${now.shortForecast ? `, ${now.shortForecast}` : ""}`,
    now?.windSpeed && `wind ${now.windSpeed} ${now.windDirection || ""}`.trim(),
    sun.sunrise != null && `sunrise ${formatClock(sun.sunrise, zone)}`,
    sun.sunset != null && `sunset ${formatClock(sun.sunset, zone)}`,
  ].filter(Boolean);
  el.setAttribute("aria-label", `Conditions in ${search.label} now: ${spoken.join(", ") || "not available"}. Open the Almanac.`);
  el.title = now?.shortForecast ? `${now.shortForecast} — open the Almanac` : "Open the Almanac";
}

const filtersActive = () => appState.activity !== "both" || !!appState.filterText.trim() || !appState.showUnconfirmed;

function resetFilters() {
  Object.assign(appState, { activity: "both", filterText: "", showUnconfirmed: true });
  $("list-filter").value = "";
  $("show-unconfirmed").checked = true;
  document.querySelector('input[name="activity"][value="both"]').checked = true;
  refreshAll();
}

function renderList() {
  const places = visiblePlaces();
  const { search, loading, errors } = appState;
  document.body.classList.toggle("no-search", !search);
  renderCoverageNote();
  if (!search) {
    $("tab-count").textContent = "";
    $("results-summary").textContent = "";
    $("results-status").innerHTML = "";
    $("results-list").innerHTML = "";
    renderWelcome();
    return;
  }

  $("tab-count").textContent = places.length ? places.length : "";
  $("area-title").textContent = search.label;
  $("results-summary").innerHTML = places.length
    ? `<strong>${places.length}</strong> place${places.length === 1 ? "" : "s"} within ${search.radius} miles`
    : `${loading.lands ? "Searching" : "No places yet"} within ${search.radius} miles`;

  const lines = [];
  if (loading.lands) lines.push(`<p class="loading-line"><span class="spinner"></span>Searching federal &amp; state public lands…</p>`);
  if (loading.stateLands && appState.areaStates.some(stateLayersFor))
    lines.push(`<p class="loading-line"><span class="spinner"></span>Loading official state wildlife agency lands…</p>`);
  if (loading.osm) lines.push(`<p class="loading-line"><span class="spinner"></span>Finding fishing piers &amp; access spots…</p>`);
  if (errors.lands) lines.push(`<p class="notice">Couldn't load public lands (${escapeHtml(errors.lands)}). <button type="button" class="link-btn" data-retry>Try again</button></p>`);
  if (errors.stateLands) lines.push(`<p class="notice">Couldn't load official state agency lands (${escapeHtml(errors.stateLands)}). Areas below may be missing hunting status and official maps. <button type="button" class="link-btn" data-retry>Try again</button></p>`);
  if (errors.osm) lines.push(`<p class="notice">Fishing spots & shops are temporarily unavailable (OpenStreetMap servers are busy). <button type="button" class="link-btn" data-retry>Try again</button></p>`);
  if (!loading.lands && !loading.osm && !places.length && !errors.lands)
    lines.push(
      filtersActive()
        ? `<p class="notice">Nothing matches these filters. <button type="button" class="link-btn" data-reset-filters>Reset filters</button> or try a larger radius.</p>`
        : `<p class="notice">No public hunting or fishing places turned up within ${search.radius} miles. Try a larger radius.</p>`
    );
  $("results-status").innerHTML = lines.join("");

  // Placeholders stand in for the list until the first source answers.
  if (!places.length && loading.lands) {
    $("results-list").innerHTML = `<li class="result-skeleton" aria-hidden="true"></li>`.repeat(4);
    return;
  }

  // Confirmed places lead (visiblePlaces() sorts them first); a heading says why.
  const shown = places.slice(0, LIST_LIMIT);
  const savedIds = new Set(savedPlaces().map((s) => s.id));
  const nConfirmed = places.filter(isConfirmed).length;
  const group = (title, note, count) => `<li class="results-group"><span>${title}</span><small>${note}</small><b>${count}</b></li>`;
  let html = "";
  shown.forEach((p, i) => {
    if (i === 0 && nConfirmed) html += group("Confirmed", "hand-checked or agency record", nConfirmed);
    if (i === nConfirmed && nConfirmed < places.length) html += group("Unconfirmed", "public, but check the rules", places.length - nConfirmed);
    html += resultRow(p, search, savedIds);
  });
  if (places.length > LIST_LIMIT)
    html += `<li class="list-more">Showing the first ${LIST_LIMIT} of ${places.length}. Narrow the radius or filter by name to see others.</li>`;
  $("results-list").innerHTML = html;
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
    ...(place.facts || []).map(([k, v]) => [escapeHtml(k), escapeHtml(v)]),
  ].filter(Boolean);

  const actions = [];
  const officialUrl = place.mapUrl || place.sourceUrl || (agency && agency.url);
  if (officialUrl) actions.push(`<a class="btn-primary block" href="${escapeHtml(officialUrl)}" target="_blank" rel="noopener">Official Map &amp; Rules${icon("external", 16)}</a>`);
  if (place.pageLink) actions.push(`<a class="btn-secondary" href="${escapeHtml(place.pageLink[1])}" target="_blank" rel="noopener">${escapeHtml(place.pageLink[0])}</a>`);
  for (const [label, url] of place.extraLinks || []) actions.push(`<a class="btn-secondary" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`);
  actions.push(`<a class="btn-secondary" href="https://www.google.com/maps/dir/?api=1&destination=${place.point[0]},${place.point[1]}" target="_blank" rel="noopener">${icon("directions", 16)}Directions</a>`);
  if (place.osmUrl) actions.push(`<a class="btn-secondary" href="${escapeHtml(place.osmUrl)}" target="_blank" rel="noopener">View on OpenStreetMap</a>`);
  actions.push(`<button type="button" class="btn-secondary" data-zoom="${escapeHtml(place.id)}" data-fk="zoom">${icon("zoom", 16)}Zoom to</button>`);
  const coords = `${place.point[0].toFixed(5)}, ${place.point[1].toFixed(5)}`;
  actions.push(`<button type="button" class="btn-secondary" data-copy-coords="${coords}" data-fk="coords">${icon("copy", 16)}Copy coordinates</button>`);

  // This view is re-rendered whenever new data lands. If focus was inside it, put it back on the
  // same control afterwards (data-fk), so a keyboard user is never dropped to the top of the page.
  const detailEl = $("place-detail");
  const focusKey = detailEl.contains(document.activeElement) ? document.activeElement.dataset.fk : null;
  const saved = isSavedPlace(place.id);
  const where = [place.typeLabel, place.state && STATES[place.state] ? STATES[place.state].name : null].filter(Boolean).join(" · ");

  detailEl.innerHTML = `
    <div class="detail-nav">
      <button type="button" class="back-btn" data-back data-fk="back">${icon("back", 17)}All places</button>
      <div class="detail-tools">
        <button type="button" class="tool-btn" data-save="${escapeHtml(place.id)}" data-fk="save" aria-pressed="${saved}">${icon(saved ? "starFilled" : "star", 16)}<span>${saved ? "Saved" : "Save"}</span></button>
        <button type="button" class="tool-btn" data-share-place data-fk="share">${icon("share", 16)}<span>Share</span></button>
      </div>
    </div>
    <header class="detail-head">
      ${placeIcon(place)}
      <div>
        <h2 id="detail-title" tabindex="-1" data-fk="title">${escapeHtml(place.name)}</h2>
        <p class="detail-type">${escapeHtml(where)}</p>
      </div>
    </header>
    <div class="result-tags">${activityChips(place)}${statusChip(place)}${confidenceBadge(place)}</div>
    <p class="detail-desc">${escapeHtml(place.description)}</p>
    <dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>
    ${!isConfirmed(place) ? `<div class="notice warn"><strong>Not confirmed open to hunting or fishing.</strong> ${escapeHtml(landNote(place))}</div>` : ""}
    ${place.placeholderBoundary && place.padusName
      ? `<p class="notice">${appState.loading.lands ? "Loading the official boundary…" : "The official boundary couldn't be loaded, so no outline is drawn. Search again to retry."}</p>`
      : place.placeholderBoundary ? `<p class="notice">The dashed shape is a rough placeholder, not the official boundary. Search again to load the real boundary.</p>` : ""}
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
  if (focusKey) detailEl.querySelector(`[data-fk="${focusKey}"]`)?.focus({ preventScroll: true });
}

// ---------- Panel view switching ----------
let listScrollTop = 0;

function showPanel() {
  const { tab, selectedId } = appState;
  const place = selectedId && placeById(selectedId);
  document.querySelectorAll(".tab").forEach((t) => {
    const on = t.dataset.tab === tab;
    t.setAttribute("aria-selected", String(on));
    t.tabIndex = on ? 0 : -1; // roving tabindex: arrow keys move between tabs (bindTabKeys in ui.js)
  });
  $("panel-body").setAttribute("aria-labelledby", `tab-${tab}`);
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
  if (sheetState() === "map") setSheet("split"); // phones: a collapsed sheet opens for the tab you tapped
  showPanel();
  $("panel-body").scrollTop = tab === "places" && !appState.selectedId ? listScrollTop : 0;
}

function selectPlace(id, { fromMap = false } = {}) {
  if (!appState.selectedId && appState.tab === "places") listScrollTop = $("panel-body").scrollTop;
  const previous = appState.selectedId;
  appState.selectedId = id;
  appState.tab = "places";
  const place = placeById(id);
  // Only the two places whose state changed are restyled; the other layers stay as they are.
  hoverId = null;
  if (previous && previous !== id) emphasizePlace(previous, null);
  emphasizePlace(id, "selected");
  if (sheetState() === "map") setSheet("split"); // phones: a tap on the map must bring the detail into view
  showPanel();
  $("panel-body").scrollTop = 0;
  syncUrl();
  if (place) $("detail-title")?.focus({ preventScroll: true });
  if (place && !fromMap) zoomToPlace(place);
  else if (place && !map.getBounds().contains(place.point)) map.panTo(place.point);
}

// Back to the list. Focus returns to the row the detail was opened from, unless the caller says
// the pointer is elsewhere (a click on empty map).
function clearSelection({ refocus = true } = {}) {
  const previous = appState.selectedId;
  appState.selectedId = null;
  if (previous) emphasizePlace(previous, null);
  renderList();
  showPanel();
  $("panel-body").scrollTop = listScrollTop;
  syncUrl();
  if (refocus && previous) document.querySelector(`.result[data-id="${CSS.escape(previous)}"]`)?.focus({ preventScroll: true });
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
  renderArchery();
  if (appState.selectedId && !placeById(appState.selectedId)) appState.selectedId = null;
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
// A place to open as soon as it arrives: from a shared link (?p=) or a saved place. Places come
// from live lookups, so "open this place" means run its search and select it when it turns up.
let pendingPlaceId = null;

function resolvePendingPlace() {
  if (!pendingPlaceId) return;
  const { loading } = appState;
  const landsSettled = !loading.lands && !loading.stateLands;
  const place = placeById(pendingPlaceId);
  // Wait for both land sources: a PAD-US parcel can still be swapped for its agency twin, and a
  // hand-checked place may be about to receive its real boundary.
  if (place && landsSettled) {
    const id = pendingPlaceId;
    pendingPlaceId = null;
    selectPlace(id);
  } else if (landsSettled && !loading.osm) {
    pendingPlaceId = null;
    syncUrl();
    showToast("That place isn't in these results any more.");
  }
}

async function runSearch(search, { fit = true, updateUrl = true, placeId = null } = {}) {
  const token = ++searchToken;
  searchAbort?.abort();
  searchAbort = new AbortController();
  const { signal } = searchAbort;

  appState.search = { ...search }; // seasonsAvailable() reads this
  pendingPlaceId = placeId;
  rememberSearch(appState.search);
  $("map-prompt").hidden = true;
  $("map-search-here").hidden = true;
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
      resolvePendingPlace();
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
    resolvePendingPlace();
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
      resolvePendingPlace();
    });
}

// Wipes the current search and everything it loaded, returning to the first-visit state.
function clearSearch() {
  searchToken++; // any request still in flight is now stale and its results are ignored
  searchAbort?.abort();
  pendingPlaceId = null;
  Object.assign(appState, {
    search: null,
    places: [],
    shops: [],
    areaStates: [],
    areaStatePolys: [],
    loading: { lands: false, osm: false, states: false, stateLands: false },
    errors: {},
    selectedId: null,
    filterText: "",
  });
  $("city-search").value = "";
  $("list-filter").value = "";
  closeSuggestions();
  map.closePopup();
  searchLayer.clearLayers();
  $("map-prompt").hidden = false;
  $("map-search-here").hidden = true;
  map.fitBounds(US_BOUNDS);
  try {
    const params = new URLSearchParams(location.search);
    ["q", "lat", "lng", "st", "r", "p"].forEach((k) => params.delete(k));
    const rest = params.toString();
    history.replaceState(null, "", location.pathname + (rest ? `?${rest}` : ""));
  } catch {
    // history can be blocked on file:// pages; the app works without it.
  }
  refreshAll();
  $("city-search").focus();
}
$("search-clear").addEventListener("click", clearSearch);

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
  // The open place, so a copied link lands on it (see pendingPlaceId).
  if (appState.selectedId) params.set("p", appState.selectedId);
  else params.delete("p");
  try {
    history.replaceState(null, "", `${location.pathname}?${params}`);
  } catch {
    // Some browsers block history changes on file:// pages; the app still works without it.
  }
}

// Re-write the address bar after the selection changes. A no-op before the first search.
function syncUrl() {
  if (appState.search) writeUrl();
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
  searchInput.removeAttribute("aria-activedescendant");
  activeIndex = -1;
}

// One list serves both the geocoder's cities and the shortcuts shown before anything is typed
// (quickSuggestions). `kind` says what choosing a row does; `group` starts a labelled section.
function renderSuggestions(message) {
  if (message) {
    suggestionsEl.innerHTML = `<li class="suggestion-msg" role="presentation">${escapeHtml(message)}</li>`;
  } else {
    let group = null;
    suggestionsEl.innerHTML = suggestions
      .map((s, i) => {
        const heading = s.group && s.group !== group ? `<li class="suggestion-group" role="presentation">${escapeHtml(s.group)}</li>` : "";
        group = s.group || null;
        return `${heading}<li role="option" id="sugg-${i}" class="suggestion${s.kind === "locate" ? " is-action" : ""}${i === activeIndex ? " active" : ""}" data-index="${i}" aria-selected="${i === activeIndex}">
          <span class="suggestion-icon" aria-hidden="true">${icon(s.icon || "pin", 17)}</span>
          <span class="s-name">${escapeHtml(s.label)}</span><span class="s-detail">${escapeHtml(s.detail)}</span></li>`;
      })
      .join("");
  }
  suggestionsEl.hidden = false;
  searchInput.setAttribute("aria-expanded", "true");
  if (activeIndex >= 0) searchInput.setAttribute("aria-activedescendant", `sugg-${activeIndex}`);
  else searchInput.removeAttribute("aria-activedescendant");
  // Keep the keyboard's row in view inside the list's own scroller.
  const active = suggestionsEl.querySelector(".suggestion.active");
  if (active) {
    if (active.offsetTop < suggestionsEl.scrollTop) suggestionsEl.scrollTop = active.offsetTop;
    else if (active.offsetTop + active.offsetHeight > suggestionsEl.scrollTop + suggestionsEl.clientHeight)
      suggestionsEl.scrollTop = active.offsetTop + active.offsetHeight - suggestionsEl.clientHeight;
  }
}

// Offered when the box is focused and empty: your location, then where you have been.
function quickSuggestions() {
  const items = [{ kind: "locate", icon: "locate", label: "Use my location", detail: "Search public land around you" }];
  for (const search of recentSearches())
    items.push({ kind: "recent", icon: "clock", group: "Recent searches", label: search.label, detail: `${search.radius}-mile search`, search });
  for (const saved of savedPlaces().slice(0, 5))
    items.push({ kind: "saved", icon: "star", group: "Saved places", label: saved.name, detail: [saved.typeLabel, `near ${saved.search.label}`].filter(Boolean).join(" · "), saved });
  return items;
}

function openQuickSuggestions() {
  suggestions = quickSuggestions();
  activeIndex = -1; // nothing preselected, so Enter on an empty box does nothing by surprise
  renderSuggestions();
}

function chooseSuggestion(s) {
  closeSuggestions();
  searchInput.blur();
  if (s.kind === "locate") return locateAndSearch();
  if (s.kind === "saved") return openSavedPlace(s.saved);
  if (s.kind === "recent") return runSearch({ ...s.search });
  runSearch({ label: s.label, center: s.center, state: s.state, radius: +$("radius-select").value });
}

searchInput.addEventListener("focus", () => {
  if (!searchInput.value.trim()) openQuickSuggestions();
});

searchInput.addEventListener("input", () => {
  clearTimeout(suggestTimer);
  suggestAbort?.abort();
  const text = searchInput.value.trim();
  if (text.length < 3) {
    suggestions = [];
    if (text) closeSuggestions();
    else openQuickSuggestions();
    return;
  }
  suggestTimer = setTimeout(async () => {
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
  if (e.key === "ArrowDown" && suggestionsEl.hidden && !searchInput.value.trim()) {
    e.preventDefault();
    openQuickSuggestions();
    activeIndex = 0;
    return renderSuggestions();
  }
  if (suggestionsEl.hidden || !suggestions.length) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const n = suggestions.length;
    activeIndex = e.key === "ArrowDown" ? (activeIndex + 1) % n : (activeIndex <= 0 ? n : activeIndex) - 1;
    renderSuggestions();
  } else if (e.key === "Escape") {
    closeSuggestions();
  }
});

suggestionsEl.addEventListener("mousedown", (e) => {
  e.preventDefault(); // keep focus in the box, so a click on the list's padding doesn't close it
  const li = e.target.closest("[data-index]");
  if (li) chooseSuggestion(suggestions[+li.dataset.index]);
});

searchInput.addEventListener("blur", () => setTimeout(closeSuggestions, 150));

// ---------- Ways into a search other than typing ----------
// "Use my location": the browser's position, placed in a state the same way a map click is.
let locating = false;
async function locateAndSearch() {
  if (locating) return;
  if (!navigator.geolocation) return showToast("This browser can't share its location. Search a city instead.");
  const btn = $("locate-btn");
  const label = btn.lastElementChild;
  locating = true;
  btn.disabled = true;
  label.textContent = "Finding you…";
  const done = () => {
    locating = false;
    btn.disabled = false;
    label.textContent = "Use my location";
  };
  let position;
  try {
    position = await new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 })
    );
  } catch (err) {
    done();
    return showToast(err.code === 1 ? "Location access was declined. Search a city instead." : "Couldn't get your location. Search a city instead.");
  }
  const search = await searchAtPoint({ lat: position.coords.latitude, lng: position.coords.longitude }).catch(() => null);
  done();
  if (!search) return showToast("Your location doesn't appear to be in a U.S. state.");
  runSearch(search);
}

// Open a saved place: straight away when it is in the current results, otherwise by re-running
// the search it was saved from and selecting it once it arrives.
function openSavedPlace(saved) {
  const { search } = appState;
  const sameSearch = search && search.radius === saved.search.radius && milesBetween(search.center, saved.search.center) < 0.05;
  if (sameSearch && placeById(saved.id)) return selectPlace(saved.id);
  runSearch({ ...saved.search }, { placeId: saved.id });
}

// Copy (or, on a phone, share) the current address, which carries the search and any open place.
async function shareCurrentLink(title) {
  syncUrl();
  const url = location.href;
  if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
    try {
      return await navigator.share({ title, url });
    } catch (err) {
      if (err.name === "AbortError") return; // the share sheet was dismissed
    }
  }
  showToast((await copyText(url)) ? "Link copied" : "Couldn't copy the link. Copy it from the address bar.");
}

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

// The list answers every keystroke; the map's layers are rebuilt once typing pauses, because a
// rebuild re-creates every polygon in the search.
let filterTimer = null;
$("list-filter").addEventListener("input", (e) => {
  appState.filterText = e.target.value;
  renderList();
  clearTimeout(filterTimer);
  filterTimer = setTimeout(renderMapLayers, 140);
});

$("list-sort").addEventListener("change", (e) => {
  appState.sort = e.target.value;
  renderList(); // order only: what is on the map does not change
});

$("show-unconfirmed").addEventListener("change", (e) => {
  appState.showUnconfirmed = e.target.checked;
  renderMapLayers();
  renderList();
});

// The "unconfirmed" explainer shows on hover and keyboard focus through CSS; the click toggle is
// for touch screens, where neither exists.
$("unconfirmed-info").addEventListener("click", (e) => {
  const btn = e.currentTarget;
  btn.setAttribute("aria-expanded", String(btn.getAttribute("aria-expanded") !== "true"));
});
document.addEventListener("click", (e) => {
  if (!e.target.closest("#unconfirmed-info")) $("unconfirmed-info").setAttribute("aria-expanded", "false");
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") $("unconfirmed-info").setAttribute("aria-expanded", "false");
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
bindTabKeys(document.querySelector(".tabs"), ".tab", (tab) => setTab(tab.dataset.tab));

// A list row under the pointer, or holding keyboard focus, lights up its place on the map.
const resultsEl = $("results-list");
const rowId = (target) => target?.closest?.(".result[data-id]")?.dataset.id || null;
resultsEl.addEventListener("mouseover", (e) => setHoverPlace(rowId(e.target)));
resultsEl.addEventListener("mouseleave", () => setHoverPlace(null));
resultsEl.addEventListener("focusin", (e) => setHoverPlace(rowId(e.target)));
resultsEl.addEventListener("focusout", () => setHoverPlace(null));

document.addEventListener("click", (e) => {
  const t = e.target;
  const result = t.closest(".result[data-id]");
  if (result) return selectPlace(result.dataset.id);
  if (t.closest("[data-back]")) return clearSelection();
  const zoom = t.closest("[data-zoom]");
  if (zoom) {
    const place = placeById(zoom.dataset.zoom);
    if (place) zoomToPlace(place);
    return;
  }
  const save = t.closest("[data-save]");
  if (save) {
    const place = placeById(save.dataset.save);
    if (!place) return;
    const saved = toggleSavedPlace(place, appState.search);
    renderDetail(place); // refreshes the button; focus stays on it (data-fk)
    return showToast(saved ? "Saved. Find it under the search box, or on the start screen." : "Removed from saved places");
  }
  if (t.closest("[data-share-place]")) {
    const place = placeById(appState.selectedId);
    return place && shareCurrentLink(place.name);
  }
  const coords = t.closest("[data-copy-coords]");
  if (coords) return copyText(coords.dataset.copyCoords).then((ok) => showToast(ok ? `Copied ${coords.dataset.copyCoords}` : "Couldn't copy the coordinates"));
  if (t.closest("[data-reset-filters]")) return resetFilters();
  const recent = t.closest("[data-recent]");
  if (recent) {
    const search = recentSearches()[+recent.dataset.recent];
    return search && runSearch({ ...search });
  }
  const example = t.closest("[data-example]");
  if (example) return runSearch({ ...EXAMPLE_SEARCHES[+example.dataset.example], radius: +$("radius-select").value });
  const savedBtn = t.closest("[data-saved]");
  if (savedBtn) {
    const saved = savedPlaces().find((p) => p.id === savedBtn.dataset.saved);
    return saved && openSavedPlace(saved);
  }
  const unsave = t.closest("[data-unsave]");
  if (unsave) {
    removeSavedPlace(unsave.dataset.unsave);
    return renderWelcome();
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

// "Search a city" buttons send you to the real search box.
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-focus-search]")) $("city-search").focus();
});

$("locate-btn").addEventListener("click", locateAndSearch);
$("recent-clear").addEventListener("click", () => {
  clearRecentSearches();
  renderWelcome();
});
$("area-share").addEventListener("click", () => appState.search && shareCurrentLink(`Public land near ${appState.search.label}`));
$("area-now").addEventListener("click", () => setView("almanac"));

// "/" jumps to the search box from anywhere that isn't already a text field.
document.addEventListener("keydown", (e) => {
  if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  if (document.body.classList.contains("on-draws")) return; // the search box is hidden on the Draws tab
  e.preventDefault();
  searchInput.focus();
  searchInput.select();
});

// The skip link lands on whichever view is showing; on the map view, on the panel's content.
$("skip-link").addEventListener("click", (e) => {
  e.preventDefault();
  const view = document.querySelector(".view:not([hidden])");
  (view?.id === "app" ? $("panel-body") : view)?.focus();
});

// Click on empty map closes the detail view.
map.on("click", () => {
  if (appState.selectedId) clearSelection({ refocus: false });
});

// "Search this area": offered once the map has been dragged well away from the current search.
function updateSearchHere() {
  const { search } = appState;
  const c = map.getCenter();
  $("map-search-here").hidden = !search || milesBetween(search.center, [c.lat, c.lng]) < search.radius * 0.6;
}
map.on("dragend", updateSearchHere);
$("map-search-here").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  const label = btn.lastElementChild;
  btn.disabled = true;
  label.textContent = "Searching…";
  const search = await searchAtPoint(map.getCenter()).catch(() => null);
  btn.disabled = false;
  label.textContent = "Search this area";
  if (!search) return showToast("That spot isn't in a U.S. state. Try a spot on land in the U.S.");
  runSearch(search);
});

// Re-centre the search on a map point, keeping the current radius. The state comes from the Census
// boundaries (what the rest of the app keys agencies and seasons on) and the name from a reverse
// lookup; either may fail on its own, and the point is only refused when no U.S. state contains it.
async function searchAtPoint(latlng) {
  const center = [+latlng.lat.toFixed(5), +latlng.lng.toFixed(5)];
  const radius = appState.search ? appState.search.radius : +$("radius-select").value;
  const reverse = fetchJson(
    `https://nominatim.openstreetmap.org/reverse?${queryString({ lat: center[0], lon: center[1], format: "jsonv2", zoom: 10, addressdetails: 1 })}`,
    { timeoutMs: 8000 }
  );
  const [states, place] = await Promise.allSettled([fetchStatesInArea(center, 1), reverse]);
  const addr = place.status === "fulfilled" ? place.value.address || {} : {};
  const state =
    (states.status === "fulfilled" && stateForPoint(center, states.value, null)) || (addr.country_code === "us" ? stateAbbr(addr.state) : null);
  if (!state || !STATES[state]) return null;
  const name = addr.city || addr.town || addr.village || addr.hamlet || addr.county;
  const label = name ? `${name}, ${state}` : `${center[0].toFixed(3)}, ${center[1].toFixed(3)} (${state})`;
  return { label, center, state, radius };
}

// Right-click (long-press on touch) on the map: search around that spot, or open it in Google Maps.
map.on("contextmenu", (e) => {
  const lat = e.latlng.lat.toFixed(5);
  const lng = e.latlng.lng.toFixed(5);
  const box = document.createElement("div");
  box.className = "map-menu";

  const here = document.createElement("button");
  here.type = "button";
  here.className = "btn-primary small";
  here.textContent = "Search this location";
  const note = document.createElement("div");
  note.className = "map-menu-note";
  note.setAttribute("role", "status");
  here.addEventListener("click", async () => {
    here.disabled = true;
    here.textContent = "Searching…";
    const search = await searchAtPoint(e.latlng).catch(() => null);
    if (!search) {
      here.disabled = false;
      here.textContent = "Search this location";
      note.textContent = "Couldn't place that spot in a U.S. state. Try a spot on land in the U.S.";
      return;
    }
    map.closePopup();
    runSearch(search);
  });

  const link = document.createElement("a");
  link.href = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = "Open in Google Maps";
  const coords = document.createElement("div");
  coords.className = "map-menu-coords";
  coords.textContent = `${lat}, ${lng}`;
  box.append(here, link, coords, note);
  L.popup({ closeButton: false }).setLatLng(e.latlng).setContent(box).openOn(map);
});

// ---------- Phone layout: the panel is a sheet under the map ----------
// Three heights, held in data-sheet on #app and laid out in CSS: "map" (the sheet is down to its
// tab strip), "split" (the default) and "list" (the sheet takes most of the screen). The handle on
// the sheet's top edge steps between them with a swipe or a tap; the button on the map toggles
// map / split. None of it applies on desktop, where the handle and button are hidden.
const SHEET_STATES = ["map", "split", "list"];

function sheetState() {
  return $("app").dataset.sheet || "split";
}

function setSheet(state) {
  $("app").dataset.sheet = state;
  $("map-toggle").setAttribute("aria-pressed", String(state === "map"));
  $("map-toggle").textContent = state === "map" ? "Show list" : state === "list" ? "Show map" : "Expand map";
}

// From either extreme the button returns to the split; from the split it gives the map the screen.
$("map-toggle").addEventListener("click", () => setSheet(sheetState() === "split" ? "map" : "split"));

const sheetHandle = $("sheet-handle");
let sheetDragY = null;
let sheetDragged = false;
sheetHandle.addEventListener("pointerdown", (e) => {
  sheetDragY = e.clientY;
  sheetDragged = false;
  sheetHandle.setPointerCapture(e.pointerId);
});
sheetHandle.addEventListener("pointerup", (e) => {
  if (sheetDragY == null) return;
  const dy = e.clientY - sheetDragY;
  sheetDragY = null;
  if (Math.abs(dy) < 12) return; // a tap: the click handler below takes it
  sheetDragged = true;
  const at = SHEET_STATES.indexOf(sheetState());
  setSheet(SHEET_STATES[Math.min(SHEET_STATES.length - 1, Math.max(0, at + (dy < 0 ? 1 : -1)))]);
});
sheetHandle.addEventListener("pointercancel", () => (sheetDragY = null));
sheetHandle.addEventListener("click", () => {
  if (sheetDragged) return void (sheetDragged = false); // the swipe already moved it
  setSheet(sheetState() === "split" ? "list" : "split");
});

// The disclaimer's full text shows on hover and keyboard focus through CSS; the click toggle is
// for touch screens, where neither exists.
function setDisclaimerOpen(open) {
  $("disclaimer").classList.toggle("open", open);
  $("disclaimer-toggle").setAttribute("aria-expanded", String(open));
}
$("disclaimer-toggle").addEventListener("click", () => setDisclaimerOpen(!$("disclaimer").classList.contains("open")));
document.addEventListener("click", (e) => {
  if (!e.target.closest("#disclaimer")) setDisclaimerOpen(false);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") setDisclaimerOpen(false);
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
initArchery();
const initialSearch = readUrl();
// ?p= names a place to open once the search has loaded it (a shared link).
if (initialSearch) runSearch(initialSearch, { updateUrl: false, placeId: new URLSearchParams(location.search).get("p") });
else refreshAll();
