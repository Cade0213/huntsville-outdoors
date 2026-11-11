// Live, nationwide data. Every service here is free, needs no API key, and allows browser (CORS) requests.
//
//   City search      Photon (OpenStreetMap geocoder by Komoot), Nominatim fallback on submit only
//   Public lands     USGS Protected Areas Database (PAD-US) – Public Access layer
//   State lines      U.S. Census TIGERweb – used to show the right state agencies for each result
//   Fishing & shops  OpenStreetMap via the Overpass API (community mirrors; best-effort)
//   Weather          NOAA / National Weather Service api.weather.gov (official, U.S. only), incl. active alerts
//   Refuge detail    U.S. Fish & Wildlife Service – hunting and fishing opportunities by station (coverage.js)
//   Water            USGS Water Services – current streamflow, gauge height and water temperature
//   Tides            NOAA CO-OPS (tidesandcurrents.noaa.gov) – high/low tide predictions
//   Wildfires        National Interagency Fire Center – WFIGS current interagency fire perimeters
//   Forest roads     U.S. Forest Service – Motor Vehicle Use Map roads and trails (optional map overlay)
//
// PAD-US says a parcel is public and whether access is open or restricted. It does NOT say whether
// hunting or fishing is allowed, so everything from here is labeled "unconfirmed" in the UI.

const ENDPOINTS = {
  photon: "https://photon.komoot.io/api/",
  nominatim: "https://nominatim.openstreetmap.org/search",
  padus: "https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/PADUS_Public_Access/FeatureServer/0/query",
  tigerStates: "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/0/query",
  nws: "https://api.weather.gov/points/",
  nwsAlerts: "https://api.weather.gov/alerts/active",
  usgsIv: "https://waterservices.usgs.gov/nwis/iv/",
  coopsStations: "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json",
  coopsData: "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter",
  usfsMvum: "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_01/MapServer",
  nifcFires: "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer/0",
  overpass: [
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass-api.de/api/interpreter",
  ],
};

const MILES_TO_METERS = 1609.344;

async function fetchJson(url, { signal, timeoutMs = 20000, ...opts } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException("Request timed out", "TimeoutError")), timeoutMs);
  const onAbort = () => ctrl.abort(signal.reason);
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

function queryString(params) {
  return new URLSearchParams(params).toString();
}

// ---------------- City search ----------------

const PLACE_TYPES = new Set(["city", "town", "village", "hamlet", "borough", "suburb", "municipality", "locality"]);

async function geocodeCities(text, signal) {
  const url = `${ENDPOINTS.photon}?${queryString({
    q: text,
    limit: 15,
    lang: "en",
    layer: "city",
    lat: 39.8,
    lon: -98.6,
    location_bias_scale: 0.1,
  })}`;
  const data = await fetchJson(url, { signal, timeoutMs: 8000 });
  const seen = new Set();
  const results = [];
  for (const f of data.features || []) {
    const p = f.properties;
    const state = stateAbbr(p.state);
    if (p.countrycode !== "US" || !state || !p.name) continue;
    const key = `${p.name}|${state}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      label: `${p.name}, ${state}`,
      detail: [p.county && !/county$/i.test(p.county) ? `${p.county} County` : p.county, STATES[state].name]
        .filter(Boolean)
        .join(", "),
      center: [f.geometry.coordinates[1], f.geometry.coordinates[0]],
      state,
      rank: PLACE_TYPES.has(p.osm_value) ? 0 : 1,
    });
  }
  return results.sort((a, b) => a.rank - b.rank).slice(0, 7);
}

// Used only when the user presses Enter and Photon is unavailable (Nominatim forbids autocomplete use).
async function geocodeFallback(text, signal) {
  const url = `${ENDPOINTS.nominatim}?${queryString({
    q: text,
    countrycodes: "us",
    format: "jsonv2",
    addressdetails: 1,
    limit: 5,
  })}`;
  const data = await fetchJson(url, { signal, timeoutMs: 10000 });
  return data
    .map((r) => {
      const a = r.address || {};
      const state = stateAbbr(a.state);
      const name = a.city || a.town || a.village || a.hamlet || r.name;
      if (!state || !name) return null;
      return { label: `${name}, ${state}`, detail: STATES[state].name, center: [+r.lat, +r.lon], state };
    })
    .filter(Boolean);
}

// ---------------- Geometry helpers ----------------

// GeoJSON Polygon/MultiPolygon -> array of polygons, each an array of rings of [lat, lng].
function geometryToPolygons(geom) {
  if (!geom) return [];
  const flip = (ring) => ring.map(([x, y]) => [y, x]);
  if (geom.type === "Polygon") return [geom.coordinates.map(flip)];
  if (geom.type === "MultiPolygon") return geom.coordinates.map((p) => p.map(flip));
  return [];
}

function pointInRing([lat, lng], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointInPolygons(pt, polygons) {
  return polygons.some(([outer, ...holes]) => pointInRing(pt, outer) && !holes.some((h) => pointInRing(pt, h)));
}

function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][1] + ring[i][1]) * (ring[j][0] - ring[i][0]);
  return Math.abs(a / 2);
}

// Straight-line miles from `from` to the nearest edge of the polygons (0 if inside).
function milesToPolygons(from, polygons) {
  if (pointInPolygons(from, polygons)) return 0;
  let best = Infinity;
  for (const poly of polygons) for (const pt of poly[0]) best = Math.min(best, milesBetween(from, pt));
  return best;
}

function distToSegment([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function minEdgeDistance(pt, rings) {
  let min = Infinity;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) min = Math.min(min, distToSegment(pt, ring[j], ring[i]));
  }
  return min;
}

// A point well inside the largest polygon, for placing its marker. A plain bbox-center or
// vertex-average centroid can land outside a concave or donut-shaped parcel (Bankhead NF's private
// inholdings, a river-corridor refuge) -- this used to fall back to outer[0], a vertex on the
// boundary, which puts the pin right on the edge of the land instead of inside it. Grid-search
// instead for the interior point farthest from any edge: a coarse pass over the bounding box, then
// a finer pass around the best candidate.
function markerPointFor(polygons) {
  const largest = polygons.reduce((a, b) => (ringArea(b[0]) > ringArea(a[0]) ? b : a));
  const outer = largest[0];
  const lats = outer.map((p) => p[0]);
  const lngs = outer.map((p) => p[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  let best = null;
  let bestDist = -Infinity;
  const search = (loLat, hiLat, loLng, hiLng, steps) => {
    for (let i = 0; i <= steps; i++) {
      const lat = loLat + ((hiLat - loLat) * i) / steps;
      for (let j = 0; j <= steps; j++) {
        const lng = loLng + ((hiLng - loLng) * j) / steps;
        const pt = [lat, lng];
        if (!pointInPolygons(pt, [largest])) continue;
        const d = minEdgeDistance(pt, largest);
        if (d > bestDist) {
          bestDist = d;
          best = pt;
        }
      }
    }
  };
  search(minLat, maxLat, minLng, maxLng, 12);
  if (best) {
    const spanLat = (maxLat - minLat) / 6 || 0.01;
    const spanLng = (maxLng - minLng) / 6 || 0.01;
    search(best[0] - spanLat, best[0] + spanLat, best[1] - spanLng, best[1] + spanLng, 8);
  }
  if (best) return best;

  // Degenerate shape (a sliver too thin for the grid to land inside) -- fall back to any point on it.
  const bboxCenter = [(minLat + maxLat) / 2, (minLng + maxLng) / 2];
  if (pointInPolygons(bboxCenter, [largest])) return bboxCenter;
  const avg = [lats.reduce((s, v) => s + v, 0) / lats.length, lngs.reduce((s, v) => s + v, 0) / lngs.length];
  if (pointInPolygons(avg, [largest])) return avg;
  return outer[0];
}

function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function titleCase(str) {
  // PAD-US names are sometimes oddly cased ("Mallard-fox Creek"); only fix words that are all-lower after a hyphen.
  return String(str).replace(/-([a-z])/g, (m, c) => `-${c.toUpperCase()}`).trim();
}

// ---------------- State boundaries ----------------

async function fetchStatesInArea(center, radiusMi, signal) {
  const url = `${ENDPOINTS.tigerStates}?${queryString({
    geometry: `${center[1]},${center[0]}`,
    geometryType: "esriGeometryPoint",
    inSR: 4326,
    distance: radiusMi,
    units: "esriSRUnit_StatuteMile",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "NAME,STUSAB",
    returnGeometry: true,
    maxAllowableOffset: 0.01,
    geometryPrecision: 3,
    outSR: 4326,
    f: "geojson",
  })}`;
  const data = await fetchJson(url, { signal, timeoutMs: 15000 });
  return (data.features || []).map((f) => ({
    abbr: f.properties.STUSAB,
    name: f.properties.NAME,
    polygons: geometryToPolygons(f.geometry),
  }));
}

function stateForPoint(pt, areaStates, fallback) {
  const hit = areaStates.find((s) => pointInPolygons(pt, s.polygons));
  return hit ? hit.abbr : fallback;
}

// ---------------- Public lands (PAD-US) ----------------

// Designation types that can plausibly include public hunting or fishing. City parks, easements,
// historic sites, national parks/monuments, military land etc. are left out entirely.
const PADUS_DESIGNATIONS = [
  "National Forest",
  "National Grassland",
  "National Public Lands",
  "National Wildlife Refuge",
  "National Recreation Area",
  "State Conservation Area",
  "State Resource Management Area",
  "State Recreation Area",
  "State Wilderness",
  "State Other or Unknown",
  "Conservation Area",
  "Resource Management Area",
  "Recreation Management Area",
  "Wilderness Area",
  "Access Area",
  "Watershed Protection Area",
];

const RE = {
  exclude: /submerged lands|closing order|golf|school|church|cemetery|airport|country club|fairground|dog park|playground|rifle range|shooting range|gun club/i,
  likelyHunting: /wildlife management area|\bwma\b|game land|game management|hunting|wildlife area|waterfowl|habitat (area|management)|public use area|state forest|hunt unit/i,
  noHunting: /natural area|nature preserve|preserve$|sanctuary|nature center|arboretum|botanical|cave|fish hatchery|state park|campground|visitor center/i,
  water: /lake|reservoir|river\b|pond|fishing|access site|boat|marina|landing|\bdam\b|bay\b|slough|marsh|bayou|lagoon/i,
  // PAD-US sometimes names a parcel after its owner/office instead of a place.
  generic: /^(state of|.*department of|.*field office|.*district office|.*ranger district|.*state land board|state lands?$)/i,
  fishingAccess: /fishing access|fishing area|public fishing|boat (ramp|launch|access)|access site/i,
};

const LIKELY_HUNTING_DESIGNATIONS = new Set(["National Forest", "National Grassland", "National Public Lands"]);

// PAD-US's designation type (`DesTp_Desc`) is too coarse on its own to rule out hunting: a zoo,
// a botanical garden, a city beach, or an urban greenway lands in the same broad "State Other or
// Unknown" / "State Resource Management Area" / "Conservation Area" bucket PAD-US uses whenever
// the source data doesn't have a more specific type, right alongside real wildlife management
// areas that share the same bucket for the same reason. `MngNm_Desc` (Manager Name Description)
// -- the specific agency that runs the parcel -- is the official attribute that actually tells
// them apart, so outside the small set of designations that are unambiguous on their own (a
// National Forest or National Grassland is federal multi-use land by definition), a parcel only
// counts as huntable when it's run by an agency whose mandate is wildlife, game, or general-purpose
// public land -- not a parks-and-rec department, a city/county/regional government, or the Park
// Service, all of whom mostly run day-use civic sites (parks, zoos, gardens, beaches, museums).
const HUNTING_CAPABLE_MANAGERS = new Set([
  "State Fish and Wildlife",
  "State Department of Conservation",
  "State Department of Natural Resources",
  "State Department of Land",
  "State Land Board",
  "Forest Service",
  "Bureau of Land Management",
  "U.S. Fish and Wildlife Service",
  "Tennessee Valley Authority",
  "Army Corps of Engineers",
  "Bureau of Reclamation",
]);

function classifyLand(name, designation, managerName) {
  if (RE.exclude.test(name)) return null;
  const generic = RE.generic.test(name);
  const activities = [];
  let huntingTier = null;
  let fishingTier = null;

  if (!RE.noHunting.test(name)) {
    const managerOk = HUNTING_CAPABLE_MANAGERS.has(managerName);
    // The designation-only path trusts "National Forest/Grassland/Public Lands" as federal
    // multi-use land, but PAD-US also files stray federal scraps with unresolved ownership under
    // those same designations (e.g. "Other or Unknown Federal Land") -- gate it on manager too.
    // The name-match path is left ungated: manager attribution is frequently "Unknown" even for
    // well-established, unambiguously-named wildlife management areas.
    if (RE.likelyHunting.test(name) || (managerOk && LIKELY_HUNTING_DESIGNATIONS.has(designation))) huntingTier = "likely";
    else if (managerOk) huntingTier = "check";
  }
  if (RE.fishingAccess.test(name)) fishingTier = "likely";
  else if ((!generic && RE.water.test(name)) || designation === "Access Area") fishingTier = "check";

  // Recreation areas without a hunting-ish name are usually day-use; keep them only for fishing.
  if (huntingTier === "check" && /Recreation Area/.test(designation) && fishingTier) huntingTier = null;

  if (huntingTier) activities.push("hunting");
  if (fishingTier) activities.push("fishing");
  if (!activities.length) return null;
  return { activities, tier: huntingTier === "likely" || fishingTier === "likely" ? "likely" : "check" };
}

function friendlyType(designation, name) {
  if (/wildlife management area|\bwma\b/i.test(name)) return "Wildlife Management Area";
  if (/game land/i.test(name)) return "Game Lands";
  if (designation === "National Public Lands") return "BLM public land";
  if (/^State (Other or Unknown|Resource Management Area)$/.test(designation)) return "State public land";
  return designation;
}

function displayName(name, typeLabel) {
  return RE.generic.test(name) ? `${typeLabel} (${name})` : name;
}

function landDescription(place) {
  const access = place.access === "Restricted"
    ? "Access is restricted — a permit, fee, or seasonal closure may apply."
    : "Listed as open to public access.";
  return `${place.typeLabel} managed by ${place.manager}. ${access}`;
}

// How far a generalized edge may sit from the true boundary, in degrees (~111 km each).
// Sized to about one screen pixel at the zoom each radius is usually read at, so boundaries
// follow the real parcel lines instead of being cut into long chords. The old blanket
// radiusMi/8000 worked out to ~700 m at the default 50 mi, which is ~44 px at zoom 13.
// 100 mi stays coarse on purpose: it opens near zoom 6.5 (~1.2 km/px), where anything finer
// is sub-pixel, and those searches can pull 179 parcels / 130k+ vertices in forested states.
function geometryOffset(radiusMi) {
  return radiusMi <= 10 ? 0.00015 : radiusMi <= 25 ? 0.0002 : radiusMi <= 50 ? 0.0004 : 0.006;
}

async function fetchPublicLands(center, radiusMi, signal) {
  const minAcres = radiusMi <= 10 ? 5 : radiusMi <= 25 ? 20 : radiusMi <= 50 ? 40 : 100;
  const designations = PADUS_DESIGNATIONS.map((d) => `'${d}'`).join(",");
  const where =
    `Pub_Access IN ('OA','RA') AND FeatClass = 'Fee' AND DesTp_Desc IN (${designations}) ` +
    `AND (GIS_Acres >= ${minAcres} OR Unit_Nm LIKE '%Access%' OR Unit_Nm LIKE '%Boat%' OR Unit_Nm LIKE '%Fishing%')`;

  const url = `${ENDPOINTS.padus}?${queryString({
    where,
    geometry: `${center[1]},${center[0]}`,
    geometryType: "esriGeometryPoint",
    inSR: 4326,
    distance: radiusMi,
    units: "esriSRUnit_StatuteMile",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "Unit_Nm,DesTp_Desc,MngNm_Desc,MngTp_Desc,Pub_Access,GIS_Acres",
    returnGeometry: true,
    maxAllowableOffset: geometryOffset(radiusMi),
    // 5 decimal places is ~1 m. At 4 (~11 m) coordinates snapped to a grid coarser than a pixel
    // at zoom 14, which stair-stepped the edges no matter how fine the tolerance above was.
    geometryPrecision: 5,
    outSR: 4326,
    orderByFields: "GIS_Acres DESC",
    resultRecordCount: 400,
    f: "geojson",
  })}`;
  const data = await fetchJson(url, { signal, timeoutMs: 30000 });

  // Group the many PAD-US parcels that share a name (different managers / tracts) into one place.
  const groups = new Map();
  for (const f of data.features || []) {
    const p = f.properties;
    const name = titleCase(p.Unit_Nm || "");
    const cls = classifyLand(name, p.DesTp_Desc, p.MngNm_Desc);
    if (!cls) continue;
    const polygons = geometryToPolygons(f.geometry);
    if (!polygons.length) continue;

    const key = normalizeName(name);
    let g = groups.get(key);
    if (!g) {
      g = {
        id: `padus-${key.replace(/ /g, "-")}`,
        name,
        source: "padus",
        activities: new Set(),
        tier: cls.tier,
        designation: p.DesTp_Desc,
        managers: new Set(),
        restricted: false,
        acres: 0,
        polygons: [],
      };
      groups.set(key, g);
    }
    cls.activities.forEach((a) => g.activities.add(a));
    if (cls.tier === "likely") g.tier = "likely";
    if (p.MngNm_Desc) g.managers.add(p.MngNm_Desc);
    if (p.Pub_Access === "RA") g.restricted = true;
    g.acres += p.GIS_Acres || 0;
    g.polygons.push(...polygons);
  }

  return [...groups.values()].map((g) => {
    const typeLabel = friendlyType(g.designation, g.name);
    const place = {
      id: g.id,
      name: displayName(g.name, typeLabel),
      source: "padus",
      activities: [...g.activities],
      tier: g.tier,
      kind: "zone",
      polygons: g.polygons,
      point: markerPointFor(g.polygons),
      typeLabel,
      manager: [...g.managers].join(" / ") || "Unknown",
      access: g.restricted ? "Restricted" : "Open",
      acres: Math.round(g.acres),
      distanceMi: milesToPolygons(center, g.polygons),
    };
    place.description = landDescription(place);
    return place;
  });
}

// ---------------- Official state agency layers (see STATE_LAYERS in coverage.js) ----------------

// One ArcGIS layer query, paged until complete. ArcGIS flags a truncated page with
// `exceededTransferLimit` at the top level for f=json but under `properties` for f=geojson, so both
// are checked; missing that once silently cut a statewide load to exactly 1,000 rows.
async function arcgisQueryAll(layerUrl, params, signal, oidField = "OBJECTID") {
  const features = [];
  const requests = [];
  for (let offset = 0; ; ) {
    const url = `${layerUrl}/query?${queryString({ ...params, orderByFields: oidField, resultOffset: offset, f: "geojson" })}`;
    requests.push(url);
    const data = await fetchJson(url, { signal, timeoutMs: 30000 });
    if (data.error) throw new Error(data.error.message || "ArcGIS error");
    const page = data.features || [];
    features.push(...page);
    const truncated = data.exceededTransferLimit || data.properties?.exceededTransferLimit;
    if (!truncated || !page.length) break;
    offset += page.length;
  }
  return { features, requests };
}

// Every record of one agency layer within `radiusMi` of `center`, as places (hidden ones included —
// the caller uses them for de-duplication). Each place records the exact request(s) and time.
async function fetchStateLayer(stateAbbrev, agency, layer, center, radiusMi, signal) {
  const spatial = {
    geometry: `${center[1]},${center[0]}`,
    geometryType: "esriGeometryPoint",
    inSR: 4326,
    distance: radiusMi,
    units: "esriSRUnit_StatuteMile",
    spatialRel: "esriSpatialRelIntersects",
    outSR: 4326,
  };
  const closedKeys = new Set();
  if (layer.closedLayer) {
    const { features } = await arcgisQueryAll(
      layer.closedLayer.url,
      { where: layer.closedLayer.where, outFields: layer.closedLayer.outFields, returnGeometry: false, ...spatial },
      signal
    );
    features.forEach((f) => closedKeys.add(String(layer.groupBy(f.properties))));
  }
  const { features, requests } = await arcgisQueryAll(
    layer.url,
    {
      where: layer.where || "1=1",
      outFields: layer.outFields,
      returnGeometry: true,
      ...(layer.geometry === "polygon" ? { maxAllowableOffset: geometryOffset(radiusMi), geometryPrecision: 5 } : {}),
      ...spatial,
    },
    signal,
    layer.oidField // paging sorts on the layer's id column, which is not always called OBJECTID
  );
  // Optional per-record detail from a second layer of the same agency, joined on a shared code.
  const details = new Map();
  if (layer.detailLayer) {
    const dl = layer.detailLayer;
    const codes = [...new Set(features.map((f) => dl.from(f.properties)).filter((c) => Number.isFinite(c) || (typeof c === "string" && c)))];
    if (codes.length) {
      // Numeric codes go in bare; names are quoted, with any apostrophe doubled.
      const sqlValue = (c) => (typeof c === "number" ? c : `'${c.replace(/'/g, "''")}'`);
      const res = await arcgisQueryAll(
        dl.url,
        { where: `${dl.keyField} IN (${codes.map(sqlValue).join(",")})`, outFields: dl.outFields, returnGeometry: false },
        signal,
        dl.oidField
      );
      res.features.forEach((f) => details.set(f.properties[dl.keyField], f.properties));
      requests.push(...res.requests);
      // A code with no match means the two layers have drifted apart; say so rather than
      // quietly showing the place without its detail.
      const missing = codes.filter((c) => !details.has(c));
      if (missing.length) console.warn(`${layer.id}: no ${dl.name} record for ${dl.keyField} ${missing.join(", ")}`);
    }
  }
  const retrievedAt = new Date().toISOString();

  // A WMA or BMA can come back as several polygons; group them into one place like PAD-US parcels.
  const groups = new Map();
  for (const f of features) {
    if (!f.geometry) continue;
    const key = String(layer.groupBy(f.properties));
    const g = groups.get(key) || { attrs: f.properties, records: [], polygons: [], point: null };
    g.records.push(f.properties);
    if (layer.geometry === "polygon") g.polygons.push(...geometryToPolygons(f.geometry));
    else if (!g.point) g.point = [f.geometry.coordinates[1], f.geometry.coordinates[0]];
    groups.set(key, g);
  }

  return [...groups.entries()].map(([key, g]) => {
    const detail = layer.detailLayer ? details.get(layer.detailLayer.from(g.attrs)) : undefined;
    const p = layer.toPlace(g.attrs, { closed: closedKeys.has(key), detail, records: g.records });
    const polygons = g.polygons.length ? g.polygons : null;
    const point = polygons ? markerPointFor(polygons) : g.point;
    return {
      ...p,
      id: `${layer.id}-${normalizeName(key).replace(/ /g, "-")}`,
      source: "state",
      state: p.state || stateAbbrev,
      ownBoundary: !!layer.ownBoundary,
      manager: p.manager || agency,
      kind: polygons ? "zone" : "point",
      polygons,
      point,
      acres: p.acres ? Math.round(p.acres) : undefined,
      facts: (p.facts || []).filter(Boolean),
      extraLinks: (p.extraLinks || []).filter(Boolean),
      distanceMi: polygons ? milesToPolygons(center, polygons) : milesBetween(center, point),
      provenance: { agency, layerName: layer.name, layerUrl: layer.url, requests, retrievedAt },
    };
  });
}

// All agency layers for every state in `stateAbbrevs` that has any. One failing layer fails the
// whole set, so a half-loaded state never looks complete.
async function fetchStateLands(stateAbbrevs, center, radiusMi, signal) {
  const jobs = stateAbbrevs.flatMap((abbr) => {
    const cfg = stateLayersFor(abbr);
    return cfg ? cfg.layers.map((layer) => fetchStateLayer(abbr, cfg.agency, layer, center, radiusMi, signal)) : [];
  });
  // Federal layers apply to every search, whatever states it touches.
  jobs.push(...FEDERAL_LAYERS.layers.map((layer) => fetchStateLayer(stateAbbrevs[0], FEDERAL_LAYERS.agency, layer, center, radiusMi, signal)));
  return (await Promise.all(jobs)).flat();
}

// ---------------- Fishing piers, fishing spots & shops (OpenStreetMap) ----------------

// Community Overpass mirrors are often overloaded. Start with the first; if it hasn't answered in
// HEDGE_MS (or fails), also try the next one. The first good response wins and the rest are cancelled.
const HEDGE_MS = 4000;

function overpass(query, signal) {
  return new Promise((resolve, reject) => {
    const controllers = [];
    const timers = [];
    let failures = 0;
    let started = 0;
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      timers.forEach(clearTimeout);
      controllers.forEach((c) => c.abort());
      fn(value);
    };
    signal?.addEventListener("abort", () => finish(reject, signal.reason), { once: true });

    const startNext = () => {
      if (settled || started >= ENDPOINTS.overpass.length) return;
      const endpoint = ENDPOINTS.overpass[started++];
      const ctrl = new AbortController();
      controllers.push(ctrl);
      timers.push(setTimeout(startNext, HEDGE_MS));
      fetchJson(endpoint, {
        method: "POST",
        body: `data=${encodeURIComponent(query)}`,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: ctrl.signal,
        timeoutMs: 25000,
      })
        .then((data) => finish(resolve, data))
        .catch((err) => {
          if (settled) return;
          failures++;
          if (failures === ENDPOINTS.overpass.length) finish(reject, err);
          else startNext();
        });
    };
    startNext();
  });
}

const SHOP_TYPES = {
  hunting: "Hunting store",
  weapons: "Gun shop",
  fishing: "Fishing & tackle",
  outdoor: "Outdoor store",
};

function osmAddress(t) {
  const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
  const cityLine = [t["addr:city"], t["addr:state"]].filter(Boolean).join(", ");
  return [street, cityLine].filter(Boolean).join(", ") || null;
}

async function fetchOsmFeatures(center, radiusMi, signal) {
  const meters = Math.round(radiusMi * MILES_TO_METERS);
  const shopMeters = Math.round(Math.min(radiusMi, 50) * MILES_TO_METERS);
  const around = `(around:${meters},${center[0]},${center[1]})`;
  const query = `[out:json][timeout:25];
(
  nwr["leisure"="fishing"]${around};
  nwr["man_made"="pier"]["fishing"~"^(yes|designated)$"]${around};
  nwr["shop"~"^(hunting|weapons|fishing|outdoor)$"](around:${shopMeters},${center[0]},${center[1]});
);
out center tags 2000;`;
  const data = await overpass(query, signal);

  const water = [];
  const shops = [];
  for (const el of data.elements || []) {
    const t = el.tags || {};
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat == null || /^(private|no|customers)$/.test(t.access || "")) continue;
    const point = [lat, lng];
    const osmUrl = `https://www.openstreetmap.org/${el.type}/${el.id}`;

    if (t.shop) {
      shops.push({
        id: `osm-${el.type}-${el.id}`,
        name: t.name || SHOP_TYPES[t.shop],
        typeLabel: SHOP_TYPES[t.shop],
        address: osmAddress(t),
        phone: t.phone || t["contact:phone"] || null,
        website: t.website || t["contact:website"] || null,
        point,
        distanceMi: milesBetween(center, point),
        osmUrl,
        hasName: !!t.name,
      });
      continue;
    }

    // Guides and outfitters sometimes tag their business as a fishing spot.
    if (t.name && /\b(llc|inc|outfitters?|guides?|guide service|charters?|lodge|club)\b/i.test(t.name)) continue;
    const typeLabel = t.man_made === "pier" ? "Fishing pier" : "Fishing spot";
    const details = [
      t.operator && `Operated by ${t.operator}.`,
      t.fee === "yes" && "A fee may be charged.",
      t.fee === "no" && "Tagged as free to use.",
      t.opening_hours && `Hours: ${t.opening_hours}.`,
    ].filter(Boolean);
    water.push({
      id: `osm-${el.type}-${el.id}`,
      name: t.name || `Unnamed ${typeLabel.toLowerCase()}`,
      source: "osm",
      activities: ["fishing"],
      tier: "check",
      kind: "point",
      point,
      typeLabel,
      manager: t.operator || "Unknown",
      access: t.access === "permissive" || t.access === "yes" || !t.access ? "Public (per map data)" : t.access,
      description: `${typeLabel} mapped by OpenStreetMap volunteers. ${details.join(" ")}`.trim(),
      osmUrl,
      distanceMi: milesBetween(center, point),
    });
  }

  return { water: dedupeNearby(water, 0.08), shops: dedupeNearby(shops, 0.05) };
}

// The same spot is often mapped more than once; keep one per name within `miles`.
function dedupeNearby(items, miles) {
  const kept = [];
  for (const item of items.sort((a, b) => a.distanceMi - b.distanceMi)) {
    const dup = kept.some(
      (k) => normalizeName(k.name) === normalizeName(item.name) && milesBetween(k.point, item.point) < miles
    );
    if (!dup) kept.push(item);
  }
  return kept;
}

// ---------------- Weather (NOAA / National Weather Service) ----------------
// api.weather.gov is the official U.S. government forecast service: free, no key, CORS-open,
// and it covers the U.S. and its territories only. Two round trips:
//   1. /points/{lat},{lng}  -> the grid cell, its IANA time zone and the two forecast URLs
//   2. the hourly + daily forecasts for that cell, fetched together
// `timeZone` is the reason the points call is worth making on its own: it is what lets the
// Almanac print sun and moon times in the searched city's clock time instead of the browser's.
//
// NOT AVAILABLE HERE: 30-year climate normals ("typical for this date"). NOAA publishes them
// through NCEI, which requires an API token, so the Almanac links out instead of guessing.
async function fetchWeather(center, signal) {
  const [lat, lng] = center;
  const point = await fetchJson(`${ENDPOINTS.nws}${lat.toFixed(4)},${lng.toFixed(4)}`, { signal, timeoutMs: 12000 });
  const props = point.properties || {};
  if (!props.forecast) throw new Error("No NWS forecast grid for this point");

  const [hourly, daily, active] = await Promise.allSettled([
    fetchJson(props.forecastHourly, { signal, timeoutMs: 12000 }),
    fetchJson(props.forecast, { signal, timeoutMs: 12000 }),
    fetchJson(`${ENDPOINTS.nwsAlerts}?point=${lat.toFixed(4)},${lng.toFixed(4)}`, { signal, timeoutMs: 12000 }),
  ]);
  const hourlyPeriods = hourly.status === "fulfilled" ? hourly.value.properties?.periods || [] : [];
  const dailyPeriods = daily.status === "fulfilled" ? daily.value.properties?.periods || [] : [];

  return {
    timeZone: props.timeZone || null,
    pointName: props.relativeLocation?.properties
      ? `${props.relativeLocation.properties.city}, ${props.relativeLocation.properties.state}`
      : null,
    now: hourlyPeriods[0] || null,
    periods: dailyPeriods.slice(0, 4),
    // null (not []) when the alerts call failed, so the UI never reads a failure as "no alerts".
    alerts:
      active.status === "fulfilled"
        ? (active.value.features || []).map((f) => ({
            event: f.properties.event,
            severity: f.properties.severity,
            headline: f.properties.headline,
            ends: f.properties.ends || f.properties.expires || null,
          }))
        : null,
    forecastUrl: `https://forecast.weather.gov/MapClick.php?lat=${lat.toFixed(4)}&lon=${lng.toFixed(4)}`,
  };
}

// ---------------- Water conditions (USGS) and tides (NOAA CO-OPS) ----------------
// Both are official, free, keyless and CORS-open. The two halves settle independently, and each
// comes back as { ok, ... } so a failed service is reported as unavailable instead of as "none".

const WATER_RADIUS_MI = 25;
const WATER_MAX_GAUGES = 8;
const TIDE_RADIUS_MI = 30;
// USGS parameter codes: discharge, gauge height, water temperature (°C).
const USGS_PARAMS = { "00060": "flow", "00065": "height", "00010": "tempC" };

async function fetchGauges(center, signal) {
  const [lat, lng] = center;
  const dLat = WATER_RADIUS_MI / 69;
  const dLng = WATER_RADIUS_MI / (69 * Math.cos((lat * Math.PI) / 180));
  const url = `${ENDPOINTS.usgsIv}?${queryString({
    format: "json",
    bBox: [lng - dLng, lat - dLat, lng + dLng, lat + dLat].map((n) => n.toFixed(4)).join(","),
    parameterCd: Object.keys(USGS_PARAMS).join(","),
    siteStatus: "active",
    // Streams and lakes only; without this, groundwater wells show up reporting "water temperature".
    siteType: "ST,LK",
  })}`;
  const data = await fetchJson(url, { signal, timeoutMs: 20000 });

  const sites = new Map();
  for (const ts of data.value?.timeSeries || []) {
    const info = ts.sourceInfo || {};
    const code = info.siteCode?.[0]?.value;
    const geo = info.geoLocation?.geogLocation;
    const field = USGS_PARAMS[ts.variable?.variableCode?.[0]?.value];
    const reading = ts.values?.[0]?.value?.[0];
    const value = reading ? Number(reading.value) : NaN;
    if (!code || !geo || !field || !Number.isFinite(value) || value === ts.variable.noDataValue) continue;
    const point = [geo.latitude, geo.longitude];
    const site = sites.get(code) || {
      id: code,
      name: info.siteName || code, // as USGS publishes it
      point,
      distanceMi: milesBetween(center, point),
      url: `https://waterdata.usgs.gov/monitoring-location/USGS-${code}/`,
      readAt: reading.dateTime,
    };
    site[field] = value;
    if (reading.dateTime > site.readAt) site.readAt = reading.dateTime;
    sites.set(code, site);
  }
  const all = [...sites.values()].filter((g) => g.distanceMi <= WATER_RADIUS_MI).sort((a, b) => a.distanceMi - b.distanceMi);
  return { gauges: all.slice(0, WATER_MAX_GAUGES), total: all.length, request: url };
}

// The CO-OPS station list is one ~3,500-row file; fetch it once per page load.
let tideStationsPromise = null;
function tideStations(signal) {
  if (!tideStationsPromise) {
    tideStationsPromise = fetchJson(`${ENDPOINTS.coopsStations}?type=tidepredictions`, { signal, timeoutMs: 20000 })
      .then((d) => d.stations || [])
      .catch((err) => {
        tideStationsPromise = null; // let the next search try again
        throw err;
      });
  }
  return tideStationsPromise;
}

// High/low predictions for the nearest tide station, or `station: null` when none is within range.
async function fetchTides(center, signal) {
  const stations = await tideStations(signal);
  let nearest = null;
  for (const st of stations) {
    const d = milesBetween(center, [st.lat, st.lng]);
    if (d <= TIDE_RADIUS_MI && (!nearest || d < nearest.distanceMi)) nearest = { id: st.id, name: st.name, state: st.state, distanceMi: d };
  }
  if (!nearest) return { station: null, predictions: [] };

  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const url = `${ENDPOINTS.coopsData}?${queryString({
    product: "predictions",
    station: nearest.id,
    begin_date: ymd,
    range: 48,
    datum: "MLLW",
    interval: "hilo",
    units: "english",
    time_zone: "lst_ldt", // the station's own clock time
    format: "json",
    application: "public-lands-finder",
  })}`;
  const data = await fetchJson(url, { signal, timeoutMs: 15000 });
  if (data.error) throw new Error(data.error.message || "CO-OPS error");
  return {
    station: { ...nearest, url: `https://tidesandcurrents.noaa.gov/noaatidepredictions.html?id=${nearest.id}` },
    predictions: (data.predictions || []).map((p) => ({ time: p.t, feet: Number(p.v), high: p.type === "H" })),
    request: url,
  };
}

async function fetchWaterConditions(center, signal) {
  const [gauges, tides] = await Promise.allSettled([fetchGauges(center, signal), fetchTides(center, signal)]);
  const settle = (r) => (r.status === "fulfilled" ? { ok: true, ...r.value } : { ok: false, error: r.reason?.name === "TimeoutError" ? "timed out" : r.reason?.message });
  return { gauges: settle(gauges), tides: settle(tides), retrievedAt: new Date().toISOString() };
}

// ---------------- Wildfires (National Interagency Fire Center) ----------------
// Current WFIGS perimeters that reach within `radiusMi`. Fully contained fires can still be in
// the layer, so callers should show percent contained.
async function fetchWildfires(center, radiusMi, signal) {
  const { features, requests } = await arcgisQueryAll(
    ENDPOINTS.nifcFires,
    {
      where: "1=1",
      geometry: `${center[1]},${center[0]}`,
      geometryType: "esriGeometryPoint",
      inSR: 4326,
      distance: radiusMi,
      units: "esriSRUnit_StatuteMile",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "poly_IncidentName,attr_IncidentSize,attr_PercentContained,poly_DateCurrent",
      returnGeometry: false,
    },
    signal
  );
  const fires = features
    .map((f) => ({
      name: titleCase(cleanText(f.properties.poly_IncidentName) || "Unnamed fire"),
      acres: f.properties.attr_IncidentSize,
      contained: f.properties.attr_PercentContained,
      updated: f.properties.poly_DateCurrent,
    }))
    .sort((a, b) => (b.acres || 0) - (a.acres || 0));
  return { fires, requests, retrievedAt: new Date().toISOString() };
}

// ---------------- Forest roads and trails (U.S. Forest Service Motor Vehicle Use Map) ----------------
// The roads and trails each national forest has designated for motor vehicles (36 CFR 212.56).
// The map overlay is the Service's own rendering, requested one screen at a time as an image, so
// the page never downloads road geometry. A click looks up the route under the pointer.

// The Service only draws its MVUM symbology closer in than 1:300,000, which is zoom 11 here.
const MVUM_MIN_ZOOM = 11;
const MVUM_LAYERS = { 1: "Road", 2: "Trail" };

// `min`/`max` are Web Mercator corners; `size` is the map's pixel size, so the image fits exactly.
function mvumImageUrl(min, max, size) {
  return `${ENDPOINTS.usfsMvum}/export?${queryString({
    bbox: [min.x, min.y, max.x, max.y].join(","),
    bboxSR: 3857,
    imageSR: 3857,
    size: `${size.x},${size.y}`,
    layers: `show:${Object.keys(MVUM_LAYERS).join(",")}`,
    transparent: true,
    format: "png32",
    f: "image",
  })}`;
}

// The vehicle classes the MVUM gives its own open/closed column and dates for.
const MVUM_VEHICLES = [
  ["passengervehicle", "passenger vehicles"],
  ["highclearancevehicle", "high-clearance vehicles"],
  ["truck", "trucks"],
  ["bus", "buses"],
  ["motorhome", "motorhomes"],
  ["fourwd_gt50inches", "4WD over 50 in. wide"],
  ["twowd_gt50inches", "2WD over 50 in. wide"],
  ["tracked_ohv_gt50inches", "tracked OHVs over 50 in."],
  ["other_ohv_gt50inches", "other OHVs over 50 in."],
  ["atv", "ATVs"],
  ["motorcycle", "motorcycles"],
  ["otherwheeled_ohv", "other wheeled OHVs"],
  ["tracked_ohv_lt50inches", "tracked OHVs under 50 in."],
  ["other_ohv_lt50inches", "other OHVs under 50 in."],
];

// The designated route within `meters` of a point, or null. Only classes the Service marks "open"
// are listed, each with the dates it publishes; nothing is worked out from them.
async function fetchMvumRoute(latlng, meters, signal) {
  const outFields = [
    "id", "name", "mvum_symbol_name", "seasonal", "forestname", "districtname", "surfacetype", "operationalmaintlevel",
    ...MVUM_VEHICLES.flatMap(([f]) => [f, `${f.replace("inches", "")}_datesopen`]),
  ];
  const hits = await Promise.all(
    Object.keys(MVUM_LAYERS).map(async (layerId) => {
      // Trails carry no surface or maintenance-level columns.
      const fields = layerId === "1" ? outFields : outFields.filter((f) => f !== "surfacetype" && f !== "operationalmaintlevel");
      const url = `${ENDPOINTS.usfsMvum}/${layerId}/query?${queryString({
        where: "1=1",
        geometry: `${latlng.lng},${latlng.lat}`,
        geometryType: "esriGeometryPoint",
        inSR: 4326,
        distance: Math.max(1, Math.round(meters)),
        units: "esriSRUnit_Meter",
        spatialRel: "esriSpatialRelIntersects",
        outFields: fields.join(","),
        returnGeometry: false,
        resultRecordCount: 1,
        f: "json",
      })}`;
      const data = await fetchJson(url, { signal, timeoutMs: 15000 });
      if (data.error) throw new Error(data.error.message || "ArcGIS error");
      const a = data.features?.[0]?.attributes;
      return a ? { a, kind: MVUM_LAYERS[layerId], request: url } : null;
    })
  );
  const hit = hits.find(Boolean);
  if (!hit) return null;
  const { a } = hit;

  // Classes that share the same dates are listed together.
  const byDates = new Map();
  for (const [field, label] of MVUM_VEHICLES) {
    if (a[field] !== "open") continue;
    const dates = cleanText(a[`${field.replace("inches", "")}_datesopen`]) || "dates not given";
    byDates.set(dates, [...(byDates.get(dates) || []), label]);
  }
  const afterCode = (v) => cleanText(v).replace(/^[A-Z0-9]+ - /, ""); // "NAT - NATIVE MATERIAL" -> "NATIVE MATERIAL"
  return {
    kind: hit.kind,
    number: cleanText(a.id),
    name: cleanText(a.name),
    designation: cleanText(a.mvum_symbol_name),
    forest: cleanText(a.forestname),
    district: cleanText(a.districtname),
    surface: afterCode(a.surfacetype),
    maintenance: afterCode(a.operationalmaintlevel),
    open: [...byDates.entries()].map(([dates, vehicles]) => ({ dates, vehicles })),
    request: hit.request,
    retrievedAt: new Date().toISOString(),
  };
}
