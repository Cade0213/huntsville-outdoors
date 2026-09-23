// What the site knows about a searched area beyond the nationwide layers (USGS PAD-US boundaries,
// OpenStreetMap fishing spots), which every search gets.
//
// Coverage levels, best first:
//   detail     — the search is inside a DETAIL_AREA: hand-checked places (data.js) whose own season
//                scopes (seasons.js) drive the per-place season chips and the calendar.
//   stateLands — the searched state has official agency land layers (STATE_LAYERS below): places
//                come from the agency with its own hunting status and map links.
//   statewide  — the searched state has a "XX-statewide" scope in seasons.js. Adding one needs no
//                change here.
//   lands      — public land boundaries only; seasons link out to the state agency.
//
// Adding a detail area = one entry in DETAIL_AREAS, plus its places and season scopes.
// Loaded after seasons.js and data.js (it references LOCATIONS and SEASON_SCOPES), before script.js.

const DETAIL_AREAS = [
  {
    id: "north-al",
    label: "North Alabama",
    state: "AL",
    center: HUNTSVILLE,
    radiusMi: 60, // Madison/Limestone zones; farther south (e.g. Birmingham) uses different deer & turkey zones
    places: LOCATIONS,
    scopes: ["alHuntsvilleArea", "wheeler", "swanMallard", "blackWarrior", "skyline"],
    // The search the calendar's "See the North Alabama calendar" button runs.
    sampleSearch: { label: "Huntsville, AL", center: HUNTSVILLE, state: "AL", radius: 50 },
  },
];

// The detail area a search sits inside, or null.
function detailAreaFor(search) {
  if (!search) return null;
  return DETAIL_AREAS.find((a) => a.state === search.state && milesBetween(search.center, a.center) <= a.radiusMi) || null;
}

// The detail area that owns a season scope, or null for statewide scopes.
function detailAreaForScope(scopeId) {
  return DETAIL_AREAS.find((a) => a.scopes.includes(scopeId)) || null;
}

function statewideScopeFor(stateAbbrev) {
  const id = stateAbbrev ? `${stateAbbrev}-statewide` : null;
  return id && SEASON_SCOPES[id] ? id : null;
}

function coverageLevel(search) {
  if (!search) return null;
  if (detailAreaFor(search)) return "detail";
  if (stateLayersFor(search.state)) return "stateLands";
  if (statewideScopeFor(search.state)) return "statewide";
  return "lands";
}

// A hand-checked place's season status is shown only when the search is inside the area that owns
// its scope — the same rule the calendar follows.
function scopeShownForPlace(place, search) {
  const area = detailAreaFor(search);
  return !!(place.seasonScope && area && area.scopes.includes(place.seasonScope));
}

// ---------- Official state agency layers ----------
// Queried live for every state that touches the search area, alongside PAD-US. Each layer maps an
// agency record straight to a place, using only what the agency's own fields say. Nothing is inferred:
// a place is marked huntable only when the agency's hunting field says so. A layer may also return
// records that are *not* shown (`hidden: true`, e.g. an FWP "NO HUNTING" WMA or a closed BMA); they
// still suppress their PAD-US twin, so PAD-US can't claim hunting there by name alone.
//
// Where a same-named PAD-US unit exists, its boundary is kept (PAD-US is the preferred boundary
// source) and the agency record supplies the facts and links. See mergeStateLands() in script.js.
//
// Adding a state = one entry here. The fetch, paging and truncation guard are in live.js
// (fetchStateLayer), and nothing else needs to change.

const MT_FWP = "Montana Fish, Wildlife & Parks";
const MT_FWP_LANDS = "https://fwp-gis.mt.gov/arcgis/rest/services/fwplnd/fwpLands/MapServer";
const MT_FWP_BMA = "https://fwp-gis.mt.gov/arcgis/rest/services/wild/hpNewBMA_MIL/MapServer";

// FWP free-text fields sometimes carry Windows line breaks and doubled spaces.
function cleanText(str) {
  return String(str || "").replace(/\s+/g, " ").trim();
}

const STATE_LAYERS = {
  MT: {
    agency: MT_FWP,
    summary: "wildlife management areas, fishing access sites and Block Management Areas",
    layers: [
      {
        id: "mt-wma",
        name: "Wildlife Management Area Boundaries",
        url: `${MT_FWP_LANDS}/8`,
        outFields: "NAME,WEB_PAGE,PDFMAP,HUNTING,HUNT_ACCESS,FWPREG,ACRES",
        geometry: "polygon",
        groupBy: (a) => a.NAME,
        toPlace: (a) => {
          const hunting = a.HUNTING === "HUNTING ALLOWED";
          return {
            name: `${cleanText(a.NAME)} Wildlife Management Area`,
            typeLabel: "Wildlife Management Area",
            // FWP's layer says nothing about fishing on WMAs, so we don't either.
            activities: hunting ? ["hunting"] : [],
            hidden: !hunting,
            description: `Wildlife management area owned or managed by ${MT_FWP}. FWP lists it as open to hunting.`,
            mapUrl: a.PDFMAP,
            pageLink: a.WEB_PAGE && ["FWP site page", a.WEB_PAGE],
            facts: [
              a.HUNT_ACCESS && ["Hunting access", cleanText(a.HUNT_ACCESS)],
              a.FWPREG && ["FWP region", `Region ${a.FWPREG}`],
            ],
            acres: a.ACRES,
          };
        },
      },
      {
        id: "mt-fas",
        name: "Fishing Access Site Locations",
        url: `${MT_FWP_LANDS}/1`,
        outFields: "NAME,WEB_PAGE,PDFMAP,HUNTING,HUNT_ACCESS,BOAT_FAC,CAMPING,LMS_ID",
        geometry: "point",
        groupBy: (a) => a.LMS_ID ?? a.NAME,
        toPlace: (a) => {
          // A null HUNTING field is not a "yes"; only FWP's explicit "HUNTING ALLOWED" counts.
          const hunting = a.HUNTING === "HUNTING ALLOWED";
          return {
            name: `${cleanText(a.NAME)} Fishing Access Site`,
            typeLabel: "Fishing Access Site",
            activities: hunting ? ["hunting", "fishing"] : ["fishing"],
            description: `Fishing access site owned or managed by ${MT_FWP}.${
              hunting ? " FWP lists hunting as allowed here." : a.HUNTING === "NO HUNTING" ? " FWP lists no hunting here." : ""
            }`,
            mapUrl: a.PDFMAP,
            pageLink: a.WEB_PAGE && ["FWP site page", a.WEB_PAGE],
            facts: [
              a.BOAT_FAC && ["Boat facilities", cleanText(a.BOAT_FAC)],
              a.CAMPING && ["Camping", cleanText(a.CAMPING)],
              hunting && a.HUNT_ACCESS && ["Hunting access", cleanText(a.HUNT_ACCESS)],
            ],
          };
        },
      },
      {
        id: "mt-bma",
        name: "Block Management Boundary",
        url: `${MT_FWP_BMA}/5`,
        outFields: "BMANUM,BMANAME,PTYPE,PDFMAP,ACCESSINFO,REGION",
        geometry: "polygon",
        groupBy: (a) => `${a.REGION}-${a.BMANUM}-${a.BMANAME}`,
        // FWP keeps closed BMAs in the boundary layer and lists them separately in layer 4
        // ("Access Closed or Restricted", STATUS = 'Closed'). Those are hidden, never shown as huntable.
        closedLayer: { url: `${MT_FWP_BMA}/4`, where: "STATUS = 'Closed'", outFields: "BMANUM,BMANAME,REGION" },
        toPlace: (a, { closed }) => ({
          name: `${cleanText(a.BMANAME)} Block Management Area`,
          typeLabel: "Block Management Area",
          manager: `Private landowner, enrolled with ${MT_FWP}`,
          activities: closed ? [] : ["hunting"],
          hidden: closed,
          description:
            `Private land enrolled in the Block Management program run by ${MT_FWP}, which provides the public ` +
            "hunting access to private land, primarily during fall hunting. Rules for this area are on its FWP map.",
          mapUrl: a.PDFMAP,
          pageLink: a.ACCESSINFO && ["Block Management program", a.ACCESSINFO],
          facts: [
            ["Ownership", "Private land (Block Management)"],
            a.PTYPE === 1 && ["Permission", "Administered by the hunter (Type 1)"],
            a.PTYPE === 2 && ["Permission", "Administered by the landowner or FWP staff (Type 2)"],
            a.REGION && ["FWP region", `Region ${a.REGION}`],
            ["BMA number", String(a.BMANUM)],
          ],
        }),
      },
    ],
  },
};

function stateLayersFor(stateAbbrev) {
  return STATE_LAYERS[stateAbbrev] || null;
}
