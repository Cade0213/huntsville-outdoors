// Live, nationwide data. Every service here is free, needs no API key, and allows browser (CORS) requests.
//
//   City search      Photon (OpenStreetMap geocoder by Komoot), Nominatim fallback on submit only
//   Public lands     USGS Protected Areas Database (PAD-US) – Public Access layer
//   State lines      U.S. Census TIGERweb – used to show the right state agencies for each result
//   Fishing & shops  OpenStreetMap via the Overpass API (community mirrors; best-effort)
//
// PAD-US says a parcel is public and whether access is open or restricted. It does NOT say whether
// hunting or fishing is allowed, so everything from here is labeled "unconfirmed" in the UI.

const ENDPOINTS = {
  photon: "https://photon.komoot.io/api/",
  nominatim: "https://nominatim.openstreetmap.org/search",
  padus: "https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/PADUS_Public_Access/FeatureServer/0/query",
  tigerStates: "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/0/query",
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

// A point guaranteed to sit on/inside the largest polygon, for placing its marker.
function markerPointFor(polygons) {
  const largest = polygons.reduce((a, b) => (ringArea(b[0]) > ringArea(a[0]) ? b : a));
  const outer = largest[0];
  const lats = outer.map((p) => p[0]);
  const lngs = outer.map((p) => p[1]);
  const bboxCenter = [(Math.min(...lats) + Math.max(...lats)) / 2, (Math.min(...lngs) + Math.max(...lngs)) / 2];
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

function classifyLand(name, designation) {
  if (RE.exclude.test(name)) return null;
  const generic = RE.generic.test(name);
  const activities = [];
  let huntingTier = null;
  let fishingTier = null;

  if (!RE.noHunting.test(name)) {
    if (RE.likelyHunting.test(name) || LIKELY_HUNTING_DESIGNATIONS.has(designation)) huntingTier = "likely";
    else huntingTier = "check";
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
    // How far a generalized edge may sit from the true boundary, in degrees (~111 km each).
    // Sized to about one screen pixel at the zoom each radius is usually read at, so boundaries
    // follow the real parcel lines instead of being cut into long chords. The old blanket
    // radiusMi/8000 worked out to ~700 m at the default 50 mi, which is ~44 px at zoom 13.
    // 100 mi stays coarse on purpose: it opens near zoom 6.5 (~1.2 km/px), where anything finer
    // is sub-pixel, and those searches can pull 179 parcels / 130k+ vertices in forested states.
    maxAllowableOffset: radiusMi <= 10 ? 0.00015 : radiusMi <= 25 ? 0.0002 : radiusMi <= 50 ? 0.0004 : 0.006,
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
    const cls = classifyLand(name, p.DesTp_Desc);
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
