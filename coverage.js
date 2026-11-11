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

const WY_GFD = "Wyoming Game and Fish Department";
const WY_GFD_SERVICES = "https://services6.arcgis.com/cWzdqIyxbijuhPLw/arcgis/rest/services";
const WY_FOOTNOTES = ["Footnote_1", "Footnote_2", "Footnote_3", "Footnote_4", "Footnote_5", "Footnote_6", "Footnote_7", "Footnote_8", "Footnote_9", "Footnote_10", "Footnote_Special"];
const ND_GFD = "North Dakota Game and Fish Department";
const IA_DNR = "Iowa Department of Natural Resources";
const AGREEMENT_DAY = { month: "short", day: "numeric", year: "numeric" };

// Game and Fish stores each area's page as an HTML snippet (<a href=URL><img …></a>); keep the URL only.
function hrefIn(html) {
  const m = /href=["']?(https?:\/\/[^"'\s>]+)/i.exec(html || "");
  return m ? m[1] : null;
}

// The rules Game and Fish attaches to a walk-in area, as one sentence run.
function wyRules(d) {
  return WY_FOOTNOTES.map((f) => cleanText(d[f])).filter(Boolean).join(" ");
}

// Agencies store links loosely (blank, padded, or not a URL at all); keep only real web addresses.
function httpLink(url) {
  const u = cleanText(url);
  return /^https?:\/\//i.test(u) ? u : null;
}

// Iowa's atlas names are all capitals ("ADAIR WILDLIFE AREA").
function properCase(str) {
  return str.toLowerCase().replace(/(^|[\s\-\/(.])([a-z])/g, (m, pre, c) => pre + c.toUpperCase());
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

  // ---- Wyoming: Game and Fish Department public access layers ----
  // Each has a boundary layer and a matching "locations" layer that carries the rules, joined on
  // the area's name. Portions the Department types as CLOSED are never requested.
  WY: {
    agency: WY_GFD,
    summary: "walk-in hunting areas, walk-in fishing areas and wildlife habitat management areas",
    layers: [
      {
        id: "wy-wih",
        name: "Walk-In Hunting Area Boundaries",
        url: `${WY_GFD_SERVICES}/WIH_Edit_PublicView/FeatureServer/3`,
        where: "PublicView = 'Public' AND Type <> 'CLOSED'",
        outFields: "WIH_Name,COUNTY,Type,AccessDates,Acres,Species,MoreInfoLink",
        geometry: "polygon",
        groupBy: (a) => a.WIH_Name,
        detailLayer: {
          name: "Walk-In Hunting Area Locations",
          url: `${WY_GFD_SERVICES}/WIH_Edit_PublicView/FeatureServer/0`,
          keyField: "WIH_Name",
          from: (a) => a.WIH_Name,
          outFields: `WIH_Name,AccessDates,Species,TotalAcres,AlertMessage,${WY_FOOTNOTES.join(",")}`,
        },
        toPlace: (a, { detail, records }) => {
          const d = detail || {};
          // Parts of an area can carry their own weapon restriction ("Archery Only").
          const limits = [...new Set(records.map((r) => cleanText(r.Type)).filter((t) => t && t !== "Boundary" && t !== "Other"))];
          return {
            name: `${cleanText(a.WIH_Name)} Walk-In Hunting Area`,
            typeLabel: "Walk-In Hunting Area",
            manager: `Private landowner, enrolled with ${WY_GFD}`,
            activities: ["hunting"],
            description:
              `Private land enrolled in the Access Yes walk-in program run by the ${WY_GFD}: the owner allows the public ` +
              "to walk in and hunt the species and dates listed. Areas can change at any time.",
            pageLink: hrefIn(a.MoreInfoLink) && ["Game and Fish area page", hrefIn(a.MoreInfoLink)],
            facts: [
              cleanText(d.AlertMessage) && ["Alert", cleanText(d.AlertMessage)],
              ["Ownership", "Private land (walk-in access)"],
              cleanText(d.AccessDates || a.AccessDates) && ["Access dates", cleanText(d.AccessDates || a.AccessDates)],
              cleanText(d.Species || a.Species) && ["Species", cleanText(d.Species || a.Species)],
              limits.length && ["Part of this area", limits.join("; ")],
              a.COUNTY && ["County", cleanText(a.COUNTY)],
              wyRules(d) && ["Area rules", wyRules(d)],
            ],
            acres: d.TotalAcres || records.reduce((sum, r) => sum + (r.Acres || 0), 0),
          };
        },
      },
      {
        id: "wy-wif",
        name: "Walk-In Fishing Area Boundaries",
        url: `${WY_GFD_SERVICES}/WIF_Edit_PublicView/FeatureServer/3`,
        where: "PublicView = 'Public' AND Type <> 'CLOSED'",
        outFields: "WIF_Name,DRAINAGE,Type,Acres,WaterName,RiverMiles,MoreInfoLink",
        geometry: "polygon",
        groupBy: (a) => a.WIF_Name,
        detailLayer: {
          name: "Walk-In Fishing Area Locations",
          url: `${WY_GFD_SERVICES}/WIF_Edit_PublicView/FeatureServer/0`,
          keyField: "WIF_Name",
          from: (a) => a.WIF_Name,
          // "Footenote_1" is the Department's own spelling of that column.
          outFields: `WIF_Name,SpeciesAvailable,AccessType,AccessDates,TotalAcres,WaterName,RiverMiles,AlertMessage,${WY_FOOTNOTES.join(",").replace("Footnote_1,", "Footenote_1,")}`,
        },
        toPlace: (a, { detail }) => {
          const d = detail || {};
          return {
            name: `${cleanText(a.WIF_Name)} Walk-In Fishing Area`,
            typeLabel: "Walk-In Fishing Area",
            manager: `Private landowner, enrolled with ${WY_GFD}`,
            activities: ["fishing"],
            description:
              `Private land enrolled in the Access Yes walk-in program run by the ${WY_GFD}: the owner allows the public ` +
              "to walk in to the water to fish. Areas can change at any time.",
            pageLink: hrefIn(a.MoreInfoLink) && ["Game and Fish area page", hrefIn(a.MoreInfoLink)],
            facts: [
              cleanText(d.AlertMessage) && ["Alert", cleanText(d.AlertMessage)],
              ["Ownership", "Private land (walk-in access)"],
              cleanText(d.WaterName || a.WaterName) && ["Water", [cleanText(d.WaterName || a.WaterName), cleanText(d.AccessType)].filter(Boolean).join(" — ")],
              cleanText(d.SpeciesAvailable) && ["Fish", cleanText(d.SpeciesAvailable)],
              cleanText(d.AccessDates) && ["Access dates", cleanText(d.AccessDates)],
              cleanText(d.RiverMiles || a.RiverMiles) && ["Stream miles", cleanText(d.RiverMiles || a.RiverMiles)],
              a.DRAINAGE && ["Drainage", cleanText(a.DRAINAGE)],
              wyRules({ ...d, Footnote_1: d.Footenote_1 }) && ["Area rules", wyRules({ ...d, Footnote_1: d.Footenote_1 })],
            ],
            acres: d.TotalAcres || a.Acres,
          };
        },
      },
      {
        id: "wy-whma",
        name: "Wildlife Habitat Management Area Boundaries",
        url: `${WY_GFD_SERVICES}/WHMA_Editor_PublicView/FeatureServer/5`,
        where: "PublicView = 'Public'",
        outFields: "WHMA_Name,Acres,MoreInfoLink",
        geometry: "polygon",
        groupBy: (a) => a.WHMA_Name,
        detailLayer: {
          name: "Wildlife Habitat Management Area Locations",
          url: `${WY_GFD_SERVICES}/WHMA_Editor_PublicView/FeatureServer/0`,
          keyField: "WHMA_Name",
          from: (a) => a.WHMA_Name,
          outFields: "WHMA_Name,AccessDates,Exceptions,AreaRegulations,SeasonalClosure,Recreation,Amenities,Notes,Acres,County,FireBan",
        },
        toPlace: (a, { detail }) => {
          const d = detail || {};
          // The Department lists each area's recreation in one field; only what it names counts.
          const recreation = cleanText(d.Recreation);
          const activities = [/hunting/i.test(recreation) && "hunting", /fishing/i.test(recreation) && "fishing"].filter(Boolean);
          return {
            name: `${cleanText(a.WHMA_Name)} Wildlife Habitat Management Area`,
            typeLabel: "Wildlife Habitat Management Area",
            activities,
            hidden: !activities.length,
            description:
              `Wildlife habitat management area managed by the ${WY_GFD}. The Department lists it for: ${recreation.replace(/\.$/, "").toLowerCase()}. ` +
              "Parts of an area can be closed — see its Game and Fish page.",
            pageLink: hrefIn(a.MoreInfoLink) && ["Game and Fish area page", hrefIn(a.MoreInfoLink)],
            facts: [
              cleanText(d.FireBan) && ["Fire", cleanText(d.FireBan)],
              cleanText(d.AccessDates) && ["Access", cleanText(d.AccessDates)],
              cleanText(d.SeasonalClosure) && ["Seasonal closure", cleanText(d.SeasonalClosure)],
              cleanText(d.Exceptions) && ["Exceptions", cleanText(d.Exceptions)],
              cleanText(d.AreaRegulations) && ["Area regulations", cleanText(d.AreaRegulations)],
              cleanText(d.Amenities) && ["Amenities", cleanText(d.Amenities)],
              cleanText(d.Notes) && ["Notes", cleanText(d.Notes)],
              cleanText(d.County) && ["County", cleanText(d.County)],
            ],
            acres: d.Acres || a.Acres,
          };
        },
      },
    ],
  },

  // ---- North Dakota: Game and Fish Department PLOTS (Private Land Open To Sportsmen) ----
  ND: {
    agency: ND_GFD,
    summary: "PLOTS tracts (Private Land Open To Sportsmen)",
    layers: [
      {
        id: "nd-plots",
        name: "NDGF PLOTS (PLOTS Guide)",
        url: "https://ndgishub.nd.gov/arcgis/rest/services/Applications/GNF_PLOTSGuide/MapServer/18",
        where: "Status = 'Active'",
        outFields: "agreement,Unit_Type,County_Name,Section,Township,Range,Approximate_Location,Total_Acres,StartDate,EndDate,Status",
        geometry: "polygon",
        groupBy: (a) => a.agreement,
        toPlace: (a) => {
          // Agreement dates arrive as "2025-04-01 00:00:00.000". A tract is shown only while today
          // falls inside its agreement; one with unreadable dates is not shown at all.
          const day = (v) => (/^\d{4}-\d{2}-\d{2}/.test(v || "") ? parseDay(v.slice(0, 10)) : null);
          const start = day(a.StartDate);
          const end = day(a.EndDate);
          const current = !!start && !!end && start <= TODAY && TODAY <= end;
          const legal = [cleanText(a.Approximate_Location), a.Section && `Sec. ${Number(a.Section)}`, a.Township && `T${Number(a.Township)}N`, a.Range && `R${Number(a.Range)}W`].filter(Boolean).join(", ");
          return {
            name: `PLOTS tract ${a.agreement}${a.County_Name ? ` (${cleanText(a.County_Name)} County)` : ""}`,
            typeLabel: "PLOTS tract",
            manager: `Private landowner, enrolled with ${ND_GFD}`,
            activities: current ? ["hunting"] : [],
            hidden: !current,
            description:
              `Private land enrolled in a ${ND_GFD} PLOTS (Private Land Open To Sportsmen) program, which gives the public ` +
              "walk-in access for hunting. Follow the signs posted on the tract.",
            facts: [
              ["Ownership", "Private land (PLOTS walk-in access)"],
              current && ["Agreement", `${formatDay(start, AGREEMENT_DAY)} – ${formatDay(end, AGREEMENT_DAY)}`],
              legal && ["Legal location", legal],
              a.Unit_Type && ["Program code", cleanText(a.Unit_Type)],
            ],
            acres: a.Total_Acres,
          };
        },
      },
    ],
  },

  // ---- Iowa: Department of Natural Resources hunting atlas ----
  IA: {
    agency: IA_DNR,
    summary: "public hunting areas from the Iowa DNR hunting atlas",
    layers: [
      {
        id: "ia-hunt",
        name: "Public Hunting Areas (Public Lands Open to Public Hunting)",
        url: "https://services2.arcgis.com/r6iFVcMJeA4kB4GC/arcgis/rest/services/Atlas_Web_Application/FeatureServer/2",
        outFields: "AREA_NAME,County,Acres,MANAGE,OWNER,Species,HABITAT,NOTES,Non_Toxic,Directions,Contact,Contact_Number,Map_Link,More_Info",
        geometry: "polygon",
        groupBy: (a) => `${cleanText(a.AREA_NAME)}|${cleanText(a.County)}`,
        toPlace: (a, { records }) => {
          const link = (url) => (/^https?:\/\//i.test(cleanText(url)) ? cleanText(url) : null);
          const contact = [cleanText(a.Contact), cleanText(a.Contact_Number)].filter(Boolean).join(", ");
          return {
            name: properCase(cleanText(a.AREA_NAME)),
            typeLabel: "Public Hunting Area",
            manager: cleanText(a.MANAGE) || cleanText(a.OWNER) || undefined,
            // The atlas layer is hunting only; it says nothing about fishing, so we don't either.
            activities: ["hunting"],
            description: `Listed in the ${IA_DNR} hunting atlas as public land open to public hunting.`,
            mapUrl: link(a.Map_Link),
            pageLink: link(a.More_Info) && ["Iowa DNR page", link(a.More_Info)],
            facts: [
              cleanText(a.NOTES) && ["Notes", cleanText(a.NOTES)],
              cleanText(a.Species) && ["Species listed", cleanText(a.Species)],
              cleanText(a.HABITAT) && ["Habitat", cleanText(a.HABITAT)],
              /^yes$/i.test(cleanText(a.Non_Toxic)) && ["Shot", "Non-toxic shot required"],
              cleanText(a.Directions) && ["Directions", cleanText(a.Directions)],
              contact && ["Contact", contact],
              cleanText(a.County) && ["County", properCase(cleanText(a.County))],
            ],
            acres: records.reduce((sum, r) => sum + (r.Acres || 0), 0),
          };
        },
      },
    ],
  },

  // ---- The states below each have one or two agency layers. For every one, the comment says which
  // ---- of the agency's own statements a place's hunting or fishing tag rests on.

  // Tennessee: TWRA's "lands available for hunting" layer; only records it marks HUNT = 'Y'.
  TN: {
    agency: "Tennessee Wildlife Resources Agency",
    summary: "TWRA lands open to hunting",
    layers: [
      {
        id: "tn-hunt",
        name: "HuntingAllowed (TWRA lands available for hunting)",
        url: "https://services3.arcgis.com/PWXNAH2YKmZY7lBq/arcgis/rest/services/HuntingAllowed/FeatureServer/0",
        oidField: "OBJECTID_1",
        where: "HUNT = 'Y'",
        outFields: "NAME,MANAGEMENT,ACRES,REGION,HUNT,Category",
        geometry: "polygon",
        groupBy: (a) => a.NAME,
        toPlace: (a, { records }) => ({
          name: cleanText(a.NAME),
          typeLabel: "TWRA hunting land",
          // TWRA's layer also covers land other bodies manage (its codes: USFS, TVA, COE…).
          manager: /^TWRA$/i.test(cleanText(a.MANAGEMENT)) || !cleanText(a.MANAGEMENT) ? undefined : `${cleanText(a.MANAGEMENT)} (TWRA's code for the manager)`,
          activities: ["hunting"],
          description: "Listed by the Tennessee Wildlife Resources Agency among its owned and managed lands available for hunting.",
          facts: [
            cleanText(a.Category) && ["TWRA category", cleanText(a.Category).replace("HuntingAllowed", "Hunting Allowed")],
            cleanText(a.REGION) && ["TWRA region", `Region ${cleanText(a.REGION)}`],
          ],
          acres: records.reduce((sum, r) => sum + (Number(r.ACRES) || 0), 0),
        }),
      },
    ],
  },

  // North Carolina: the Commission describes game lands as managed "for public hunting, trapping,
  // inland fishing". The layer has no per-area fishing field, so only hunting is tagged.
  NC: {
    agency: "North Carolina Wildlife Resources Commission",
    summary: "game lands",
    layers: [
      {
        id: "nc-gameland",
        name: "NCWRC Game Lands - general",
        url: "https://services1.arcgis.com/YfqBAUM5nWR3yhGP/arcgis/rest/services/gamelands_general/FeatureServer/21",
        outFields: "GML_HAB,SUM_ACRES,GameLandID",
        geometry: "polygon",
        groupBy: (a) => a.GameLandID ?? a.GML_HAB,
        toPlace: (a, { records }) => ({
          name: `${cleanText(a.GML_HAB)} Game Land`,
          typeLabel: "Game Land",
          activities: ["hunting"],
          description:
            "Game land designated and managed by the North Carolina Wildlife Resources Commission for public hunting, trapping, inland fishing and related activities. Rules differ by game land.",
          acres: records.reduce((sum, r) => sum + (r.SUM_ACRES || 0), 0),
        }),
      },
    ],
  },

  // New Hampshire: Fish and Game's online WMA guide, with HUNTING and FISHING columns of 'Y'.
  NH: {
    agency: "New Hampshire Fish and Game Department",
    summary: "wildlife management areas",
    layers: [
      {
        id: "nh-wma",
        name: "NHFG Wildlife Management Areas",
        url: "https://services8.arcgis.com/hg1B9Egwk1I5p300/arcgis/rest/services/NHFG_WMA_online/FeatureServer/2",
        oidField: "OBJECTID_1",
        outFields: "NAME,TOWN,GISACRES,HUNTING,FISHING,SPECIES,NOTES,FISHNOTES,OnlineWMA",
        geometry: "polygon",
        groupBy: (a) => `${a.NAME}|${a.TOWN}`,
        toPlace: (a) => {
          const activities = [cleanText(a.HUNTING) === "Y" && "hunting", cleanText(a.FISHING) === "Y" && "fishing"].filter(Boolean);
          return {
            name: cleanText(a.NAME),
            typeLabel: "Wildlife Management Area",
            activities,
            hidden: !activities.length,
            description: `Wildlife management area of the New Hampshire Fish and Game Department, which lists it for ${activities.join(" and ")}.`,
            pageLink: httpLink(a.OnlineWMA) && ["Fish and Game WMA guide", httpLink(a.OnlineWMA)],
            facts: [
              cleanText(a.SPECIES) && ["Species listed", cleanText(a.SPECIES)],
              cleanText(a.NOTES) && ["Notes", cleanText(a.NOTES)],
              cleanText(a.FISHNOTES) && ["Fishing notes", cleanText(a.FISHNOTES)],
              cleanText(a.TOWN) && ["Town", cleanText(a.TOWN)],
            ],
            acres: a.GISACRES,
          };
        },
      },
    ],
  },

  // Michigan: Hunter Access Program parcels (private land leased for public hunting); Active only.
  MI: {
    agency: "Michigan Department of Natural Resources",
    summary: "Hunter Access Program properties",
    layers: [
      {
        id: "mi-hap",
        name: "Hunter Access Program Polygon",
        url: "https://services3.arcgis.com/Jdnp1TjADvSDxMAX/arcgis/rest/services/DNRWILDLandsOPENDATA/FeatureServer/0",
        where: "ActiveOrInactive = 'Active'",
        outFields: "COUNTY,HAPID,ActiveOrInactive,acres,SpecialComment,HAPInfo,HuntType",
        geometry: "polygon",
        groupBy: (a) => a.HAPID,
        toPlace: (a, { records }) => ({
          name: `Hunter Access Program property ${a.HAPID}${a.COUNTY ? ` (${cleanText(a.COUNTY)} County)` : ""}`,
          typeLabel: "Hunter Access Program property",
          manager: "Private landowner, enrolled with Michigan Department of Natural Resources",
          activities: ["hunting"],
          description:
            "Private land enrolled as active in the Michigan DNR Hunter Access Program, which leases it for public hunting. Check in as the property requires.",
          facts: [
            ["Ownership", "Private land (Hunter Access Program)"],
            cleanText(a.HuntType) && ["Open for", cleanText(a.HuntType)],
            cleanText(a.HAPInfo) && ["Check-in", cleanText(a.HAPInfo)],
            cleanText(a.SpecialComment) && ["Notes", cleanText(a.SpecialComment)],
          ],
          acres: records.reduce((sum, r) => sum + (r.acres || 0), 0),
        }),
      },
    ],
  },

  // Utah: Division of Wildlife Resources public access properties. Hunting or fishing is tagged
  // from the property's activity list, or from the Division's own "Hunter Access" / "Angler Access" type.
  UT: {
    agency: "Utah Division of Wildlife Resources",
    summary: "wildlife management areas, walk-in access and angler access properties",
    layers: [
      {
        id: "ut-access",
        name: "Public Access Properties (WMAs)",
        url: "https://services.arcgis.com/ZzrwjTRez6FJiOq4/arcgis/rest/services/ULTRA_Properties_2_view/FeatureServer/0",
        outFields: "id,name,type_,county,acres,purpose,closureDates,restrictions,activityType,licenseRequiredType",
        geometry: "polygon",
        groupBy: (a) => a.id,
        toPlace: (a) => {
          const listed = cleanText(a.activityType);
          const type = cleanText(a.type_);
          const activities = [
            (/hunting/i.test(listed) || type === "Hunter Access") && "hunting",
            (/fishing/i.test(listed) || type === "Angler Access") && "fishing",
          ].filter(Boolean);
          const text = (v) => (/^(null|none)?$/i.test(cleanText(v)) ? "" : cleanText(v)); // the layer stores "null" as text
          return {
            name: cleanText(a.name),
            typeLabel: type || "Public access property",
            activities,
            hidden: !activities.length,
            description: `Public access property of the Utah Division of Wildlife Resources${listed ? `, listed for: ${listed.toLowerCase()}` : ""}.`,
            facts: [
              text(a.closureDates) && ["Seasonal closure", text(a.closureDates)],
              text(a.restrictions) && ["Restrictions", text(a.restrictions)],
              text(a.licenseRequiredType) && ["License or authorization required", text(a.licenseRequiredType)],
              text(a.purpose) && ["Purpose", text(a.purpose)],
              text(a.county) && ["County", text(a.county)],
            ],
            acres: a.acres,
          };
        },
      },
    ],
  },

  // South Carolina: DNR public properties, with Hunting and Fishing columns of "Yes" / "No".
  SC: {
    agency: "South Carolina Department of Natural Resources",
    summary: "DNR wildlife management areas and other public properties",
    layers: [
      {
        id: "sc-lands",
        name: "SCDNR Public Properties View",
        url: "https://services.arcgis.com/acgZYxoN5Oj8pDLa/arcgis/rest/services/DEV_-_SCDNR_Public_Lands_Viewer/FeatureServer/3",
        outFields: "PropertyID,PropertyName,PropertyTract,PropertyUse,PropertyManager,WMA_SpecialActivity,PublicAccess,Comments,County,GIS_TractAcres,Hunting,Fishing,prop_page_url",
        geometry: "polygon",
        groupBy: (a) => a.PropertyID,
        toPlace: (a) => {
          const open = cleanText(a.PublicAccess) !== "Closed";
          const activities = open ? [a.Hunting === "Yes" && "hunting", a.Fishing === "Yes" && "fishing"].filter(Boolean) : [];
          const tract = cleanText(a.PropertyTract);
          const special = cleanText(a.WMA_SpecialActivity);
          return {
            name: tract && tract !== cleanText(a.PropertyName) ? `${cleanText(a.PropertyName)} – ${tract}` : cleanText(a.PropertyName),
            typeLabel: cleanText(a.PropertyUse) === "WMA" ? "Wildlife Management Area" : "SCDNR public property",
            manager: cleanText(a.PropertyManager) || undefined,
            activities,
            hidden: !activities.length,
            description: `Public property listed by the South Carolina Department of Natural Resources for ${activities.join(" and ")}.`,
            pageLink: httpLink(a.prop_page_url) && ["SCDNR property page", httpLink(a.prop_page_url)],
            facts: [
              cleanText(a.PublicAccess) && ["Public access (SCDNR code)", cleanText(a.PublicAccess)],
              special && !/^(none|na)$/i.test(special) && ["Special designation (SCDNR code)", special],
              cleanText(a.Comments) && ["Notes", cleanText(a.Comments)],
              cleanText(a.County) && ["County", cleanText(a.County)],
            ],
            acres: a.GIS_TractAcres,
          };
        },
      },
    ],
  },

  // Idaho: Access Yes! agreements (private land, with per-activity flags and access dates) and the
  // Department's WMAs, which it describes as "available for hunting, fishing and other public enjoyment".
  ID: {
    agency: "Idaho Department of Fish and Game",
    summary: "Access Yes! properties and wildlife management areas",
    layers: [
      {
        id: "id-accessyes",
        name: "Access Yes! 2026 (public)",
        url: "https://gisportal-idfg.idaho.gov/hosting/rest/services/Hosted/Access_Yes_2026_public/FeatureServer/0",
        oidField: "objectid",
        where: "active = 'Y' AND agreementstatus = 'Active' AND publishstatus = 'PUBLISHED'",
        outFields: "id,name,generalarea,description,directions,acreage,accessbegin,accessend,biggame,uplandgame,smallgame,waterfowl,trapping,fishing,noveh,nocamp,nofire",
        geometry: "polygon",
        groupBy: (a) => a.id,
        toPlace: (a) => {
          // Access dates arrive as epoch milliseconds; shown only while today is inside them.
          const inDates = Number.isFinite(a.accessbegin) && Number.isFinite(a.accessend) && a.accessbegin <= TODAY.getTime() && TODAY.getTime() <= a.accessend;
          const game = [a.biggame === 1 && "big game", a.uplandgame === 1 && "upland game", a.smallgame === 1 && "small game", a.waterfowl === 1 && "waterfowl"].filter(Boolean);
          const activities = inDates ? [game.length && "hunting", a.fishing === 1 && "fishing"].filter(Boolean) : [];
          const rules = [a.noveh === 1 && "no motor vehicles", a.nocamp === 1 && "no camping", a.nofire === 1 && "no fires"].filter(Boolean);
          return {
            name: `${cleanText(a.name || a.generalarea)} (Access Yes!)`,
            typeLabel: "Access Yes! property",
            manager: "Private landowner, enrolled with Idaho Department of Fish and Game",
            activities,
            hidden: !activities.length,
            description: "Private land with an active Access Yes! agreement with the Idaho Department of Fish and Game, which opens it to the public for the uses listed.",
            pageLink: ["Access Yes! program", "https://idfg.idaho.gov/yes"],
            facts: [
              ["Ownership", "Private land (Access Yes!)"],
              game.length && ["Hunting listed for", game.join(", ")],
              a.trapping === 1 && ["Trapping", "Listed"],
              inDates && ["Access dates", `${formatDay(new Date(a.accessbegin), AGREEMENT_DAY)} – ${formatDay(new Date(a.accessend), AGREEMENT_DAY)}`],
              rules.length && ["Rules", rules.join("; ")],
              cleanText(a.description) && ["Land", cleanText(a.description)],
              cleanText(a.directions) && ["Directions", cleanText(a.directions)],
            ],
            acres: a.acreage,
          };
        },
      },
      {
        id: "id-wma",
        name: "Wildlife Management Areas",
        url: "https://services.arcgis.com/FjJI5xHF2dUPVrgK/arcgis/rest/services/WildlifeManagementAreas/FeatureServer/0",
        outFields: "WMAID,Name,Acres",
        geometry: "polygon",
        groupBy: (a) => a.WMAID,
        toPlace: (a) => ({
          name: properCase(cleanText(a.Name)).replace(/\bWma\b/, "WMA"),
          typeLabel: "Wildlife Management Area",
          // The Department's statement covers its WMAs as a group; fishing differs by area, so only hunting is tagged.
          activities: ["hunting"],
          description:
            "One of the wildlife management areas the Idaho Department of Fish and Game describes as established to protect wildlife habitat and available for hunting, fishing and other public enjoyment of wildlife.",
          pageLink: ["Idaho WMAs", "https://idfg.idaho.gov/visit/wma"],
          acres: a.Acres,
        }),
      },
    ],
  },

  // Wisconsin: land leased for public hunting under the DNR's Voluntary Public Access and Turkey
  // Hunting Access programs.
  WI: {
    agency: "Wisconsin Department of Natural Resources",
    summary: "leased public hunting land (Voluntary Public Access and Turkey Hunting Access programs)",
    layers: [
      {
        id: "wi-vpa",
        name: "Leased Hunting Land (VPA-HIP and THAP)",
        url: "https://dnrmaps.wi.gov/arcgis/rest/services/WM_VPA/WM_VPA_HUNT_LEASE_LAND_WTM/MapServer/0",
        outFields: "COUNTY_NAME,PROPERTY_ACRE_AMT,REC_NO,PROGRAM,PDF_MAP",
        geometry: "polygon",
        groupBy: (a) => a.REC_NO,
        toPlace: (a, { records }) => {
          const turkey = cleanText(a.PROGRAM) === "THP";
          return {
            name: `${turkey ? "Turkey Hunting Access" : "Voluntary Public Access"} property ${cleanText(a.REC_NO)}${a.COUNTY_NAME ? ` (${cleanText(a.COUNTY_NAME)} County)` : ""}`,
            typeLabel: turkey ? "Turkey Hunting Access Program land" : "Voluntary Public Access land",
            manager: "Private landowner, enrolled with Wisconsin Department of Natural Resources",
            activities: ["hunting"],
            description: `Private land enrolled in the Wisconsin DNR ${turkey ? "Turkey Hunting Access Program" : "Voluntary Public Access & Habitat Incentive Program"} and shown by the DNR as leased hunting land.`,
            mapUrl: httpLink(a.PDF_MAP),
            pageLink: ["Wisconsin DNR public access lands", "https://dnr.wisconsin.gov/topic/lands/vpa"],
            facts: [["Ownership", "Private land (leased for public access)"], ["Program", turkey ? "Turkey Hunting Access Program" : "Voluntary Public Access"]],
            acres: records.reduce((sum, r) => sum + (r.PROPERTY_ACRE_AMT || 0), 0),
          };
        },
      },
    ],
  },

  // Kentucky: KDFWR's public hunting areas layer, records it marks AreaOpen = 'Yes'. Its separate
  // layer of no-hunting and restricted portions is not drawn, which the description says.
  KY: {
    agency: "Kentucky Department of Fish & Wildlife Resources",
    summary: "public hunting areas",
    layers: [
      {
        id: "ky-hunt",
        name: "Hunting Areas (Ky Public Hunting Areas)",
        url: "https://kygisserver.ky.gov/arcgis/rest/services/WGS84WM_Services/Ky_Public_Hunting_Areas_WGS84WM/MapServer/1",
        where: "AreaOpen = 'Yes'",
        outFields: "KDFWR_ID,AREANAME,DETAIL,ACRES_CAL,WMA,ElkPermit,MANAGER,AreaOpen,Counties",
        geometry: "polygon",
        groupBy: (a) => a.KDFWR_ID ?? a.AREANAME,
        toPlace: (a, { records }) => ({
          name: cleanText(a.AREANAME),
          typeLabel: a.WMA === "Yes" ? "Wildlife Management Area" : "Public hunting area",
          // The layer includes federal, state and private land KDFWR lists as open; it gives ownership as a one-word code.
          manager: /^KDFW/i.test(cleanText(a.MANAGER)) || !cleanText(a.MANAGER) ? undefined : `${cleanText(a.MANAGER)} ownership (per KDFWR)`,
          activities: ["hunting"],
          description:
            "Listed as open by the Kentucky Department of Fish & Wildlife Resources in its public hunting areas layer. Parts of an area can be closed to hunting or restricted — see its KDFWR page.",
          pageLink: httpLink(a.DETAIL) && ["KDFWR area page", httpLink(a.DETAIL)],
          facts: [
            a.ElkPermit === "Yes" && ["Elk", "Elk permit area"],
            cleanText(a.Counties) && ["Counties", cleanText(a.Counties)],
          ],
          acres: records.reduce((sum, r) => sum + (r.ACRES_CAL || 0), 0),
        }),
      },
    ],
  },

  // Indiana: DNR hunting area boundaries; shown only when the DNR's access field starts with OPEN.
  IN: {
    agency: "Indiana Department of Natural Resources",
    summary: "DNR hunting areas",
    layers: [
      {
        id: "in-hunt",
        name: "DNR Hunting Area Polygons",
        url: "https://gisdata.in.gov/server/rest/services/Hosted/Hunting_Areas_RO/FeatureServer/0",
        oidField: "objectid",
        outFields: "property,subunit,access_,acres,checkin,checknotes,mngdby,moreinfo,contact,huntfor,website",
        geometry: "polygon",
        groupBy: (a) => `${a.property}|${a.subunit}`,
        toPlace: (a, { records }) => {
          const access = cleanText(a.access_);
          const open = /^open/i.test(access);
          return {
            name: cleanText(a.property) || properCase(cleanText(a.subunit)),
            typeLabel: "DNR hunting area",
            manager: cleanText(a.mngdby) || undefined,
            activities: open ? ["hunting"] : [],
            hidden: !open,
            description: "Listed by the Indiana Department of Natural Resources in its hunting areas layer.",
            pageLink: (httpLink(a.website) || httpLink(a.moreinfo)) && ["Property page", httpLink(a.website) || httpLink(a.moreinfo)],
            facts: [
              access && ["Access (DNR)", properCase(access)],
              cleanText(a.huntfor) && ["Hunting listed for", cleanText(a.huntfor)],
              a.checkin === "Y" && ["Check-in", cleanText(a.checknotes) ? `Required — ${cleanText(a.checknotes)}` : "Required"],
              cleanText(a.contact) && ["Contact", cleanText(a.contact)],
            ],
            acres: records.reduce((sum, r) => sum + (Number(r.acres) || 0), 0),
          };
        },
      },
    ],
  },

  // Minnesota: Walk-In Access sites — private land the DNR describes as open to the public for
  // walk-in hunting from September 1 to May 31.
  MN: {
    agency: "Minnesota Department of Natural Resources",
    summary: "Walk-In Access sites",
    layers: [
      {
        id: "mn-wia",
        name: "Minnesota Walk-In Access Sites",
        url: "https://gis.dnr.state.mn.us/appserver/rest/services/webGDRS/bdry_dnr_walk_in_access_sites/MapServer/0",
        oidField: "objectid",
        outFields: "map_title,wia_id,acres,cty_name,usernotes",
        geometry: "polygon",
        groupBy: (a) => a.wia_id,
        toPlace: (a, { records }) => ({
          name: cleanText(a.map_title) || `Walk-In Access site ${a.wia_id}`,
          typeLabel: "Walk-In Access site",
          manager: "Private landowner, enrolled with Minnesota Department of Natural Resources",
          activities: ["hunting"],
          description:
            "Private land in the Minnesota DNR Walk-In Access program, open to the public for walk-in (foot travel only) hunting during legal hunting seasons from September 1 to May 31.",
          pageLink: ["Walk-In Access program", "https://www.dnr.state.mn.us/walkin/index.html"],
          facts: [
            ["Ownership", "Private land (Walk-In Access)"],
            cleanText(a.usernotes) && cleanText(a.usernotes) !== "check" && ["Notes", cleanText(a.usernotes)],
            cleanText(a.cty_name) && ["County", cleanText(a.cty_name)],
          ],
          acres: records.reduce((sum, r) => sum + (r.acres || 0), 0),
        }),
      },
    ],
  },

  // Missouri: Missouri Outdoor Recreational Access Program lands; tagged from the Department's access type.
  MO: {
    agency: "Missouri Department of Conservation",
    summary: "Missouri Outdoor Recreational Access Program (MRAP) lands",
    layers: [
      {
        id: "mo-mrap",
        name: "MRAP Lands",
        url: "https://gisblue.mdc.mo.gov/arcgis/rest/services/Discover_Nature/MDC_Administrative_Areas/FeatureServer/1",
        outFields: "Area_Name,Acres,Access_Typ,County,Map_Link",
        geometry: "polygon",
        groupBy: (a) => a.Area_Name,
        toPlace: (a, { records }) => {
          const type = cleanText(a.Access_Typ);
          const activities = [/hunting/i.test(type) && "hunting", /fishing/i.test(type) && "fishing"].filter(Boolean);
          return {
            name: `${cleanText(a.Area_Name)} (MRAP)`,
            typeLabel: "MRAP land",
            manager: "Private landowner, enrolled with Missouri Department of Conservation",
            activities,
            hidden: !activities.length,
            description: "Private land opened to the public through the Missouri Department of Conservation's Missouri Outdoor Recreational Access Program, for the access type listed.",
            mapUrl: httpLink(a.Map_Link),
            pageLink: ["MRAP program", "https://mdc.mo.gov/mrap"],
            facts: [["Ownership", "Private land (MRAP)"], type && ["Access type", type], cleanText(a.County) && ["County", cleanText(a.County)]],
            acres: records.reduce((sum, r) => sum + (r.Acres || 0), 0),
          };
        },
      },
    ],
  },

  // Colorado: Walk-In Access Program tracts. Tracts carry no names in the data.
  CO: {
    agency: "Colorado Parks and Wildlife",
    summary: "Walk-In Access Program tracts",
    layers: [
      {
        id: "co-wia",
        name: "CPW Walk In Access Program",
        url: "https://services5.arcgis.com/ttNGmDvKQA7oeDQ3/arcgis/rest/services/CPWAdminData/FeatureServer/12",
        oidField: "FID",
        outFields: "FID,COVER,URL,CLOSEDATE,BigGame",
        geometry: "polygon",
        groupBy: (a) => a.FID,
        toPlace: (a) => ({
          name: `Walk-In Access tract ${a.FID}`,
          typeLabel: "Walk-In Access tract",
          manager: "Private landowner, enrolled with Colorado Parks and Wildlife",
          activities: ["hunting"],
          description:
            "Land enrolled in the Colorado Parks and Wildlife Walk-In Access Program for public walk-in hunting. See the Walk-In Access brochure for the rules and season for each tract.",
          pageLink: httpLink(a.URL) && ["Walk-In Access program", httpLink(a.URL)],
          facts: [
            cleanText(a.COVER) && ["Cover", cleanText(a.COVER)],
            cleanText(a.CLOSEDATE) && ["Closes", cleanText(a.CLOSEDATE)],
            a.BigGame === "Y" && ["Big game", "Enrolled for big game access"],
          ],
        }),
      },
    ],
  },

  // Virginia: the Department's "Public Huntable Lands" layer.
  VA: {
    agency: "Virginia Department of Wildlife Resources",
    summary: "public huntable lands",
    layers: [
      {
        id: "va-hunt",
        name: "DWR Public Huntable Lands",
        url: "https://services.dwr.virginia.gov/arcgis/rest/services/HUB_Layers/DWR_Public_Huntable_Lands/FeatureServer/0",
        outFields: "ID,Label",
        geometry: "polygon",
        groupBy: (a) => a.Label ?? a.ID,
        toPlace: (a) => ({
          name: cleanText(a.Label),
          typeLabel: "Public hunting land",
          // The layer mixes owners (DWR, state parks and forests, federal), so no single manager is named.
          manager: "See the Virginia DWR listing",
          activities: ["hunting"],
          description: "Included in the Virginia Department of Wildlife Resources layer of public hunting lands. Seasons and permits differ by property.",
        }),
      },
    ],
  },

  // Oklahoma: Oklahoma Land Access Program tracts the Department marks open to the public. The
  // service name carries its publish date, so it will need updating when the Department republishes.
  OK: {
    agency: "Oklahoma Department of Wildlife Conservation",
    summary: "Oklahoma Land Access Program (OLAP) walk-in hunting and fishing tracts",
    layers: [
      {
        id: "ok-olap",
        name: "OLAP Access (public view)",
        url: "https://services1.arcgis.com/jRf8jjFwxedITdFe/arcgis/rest/services/OLAP_UpdatedLayers_062626_PublicView/FeatureServer/7",
        where: "OpenToPublic = 'Yes' AND (AccessType IS NULL OR AccessType <> 'Property Removed from OLAP')",
        outFields: "OLAPID,WIACAT,OpenToPublic,WIASeason,AccessType,Acres,Species,Cover,Comment,NumHuntersAllowed",
        geometry: "polygon",
        groupBy: (a) => a.OLAPID,
        toPlace: (a, { records }) => {
          const category = cleanText(a.WIACAT);
          const activities = [/hunting/i.test(category) && "hunting", /fishing|stream access/i.test(category) && "fishing"].filter(Boolean);
          return {
            name: `OLAP ${cleanText(a.OLAPID).replace(/_/g, " ")}`,
            typeLabel: category || "OLAP tract",
            manager: "Private landowner, enrolled with Oklahoma Department of Wildlife Conservation",
            activities,
            hidden: !activities.length,
            description: "Private land enrolled in the Oklahoma Land Access Program and marked open to the public by the Oklahoma Department of Wildlife Conservation.",
            pageLink: ["Oklahoma Land Access Program", "https://www.wildlifedepartment.com/lands-and-minerals/olap"],
            facts: [
              ["Ownership", "Private land (OLAP)"],
              cleanText(a.WIASeason) && ["Open", cleanText(a.WIASeason)],
              cleanText(a.Species) && ["Species", cleanText(a.Species)],
              cleanText(a.Cover) && ["Cover", cleanText(a.Cover)],
              /^\d+$/.test(cleanText(a.NumHuntersAllowed)) && ["Hunters allowed", cleanText(a.NumHuntersAllowed)],
              cleanText(a.Comment) && ["Notes", cleanText(a.Comment)],
            ],
            acres: records.reduce((sum, r) => sum + (r.Acres || 0), 0),
          };
        },
      },
    ],
  },

  // New Mexico: Open Gate properties with Active status. A property whose stated term has a full
  // expiry date in the past is not shown.
  NM: {
    agency: "New Mexico Department of Game and Fish",
    summary: "Open Gate properties",
    layers: [
      {
        id: "nm-opengate",
        name: "Open Gate Properties (public view)",
        url: "https://services2.arcgis.com/CjbW1bVhK4dB3WOa/arcgis/rest/services/NM_Open_Gate_Public_View/FeatureServer/0",
        where: "OG_status = 'Active'",
        outFields: "NAME,PropertyID,County,GMU,Activities,MORE_INFO,Term,Acres,OG_status",
        geometry: "polygon",
        groupBy: (a) => a.PropertyID,
        toPlace: (a, { records }) => {
          const listed = cleanText(a.Activities);
          const expiry = /Expires ([A-Z][a-z]+ \d{1,2}, \d{4})/.exec(cleanText(a.Term));
          const expired = !!expiry && new Date(expiry[1]) < TODAY;
          const activities = expired ? [] : [/hunting/i.test(listed) && "hunting", /fishing/i.test(listed) && "fishing"].filter(Boolean);
          return {
            name: `${cleanText(a.NAME)} (Open Gate)`,
            typeLabel: "Open Gate property",
            manager: "Private landowner, enrolled with New Mexico Department of Game and Fish",
            activities,
            hidden: !activities.length,
            description: "Private land leased through the New Mexico Department of Game and Fish Open Gate program for the public uses listed.",
            pageLink: httpLink(a.MORE_INFO) ? ["Property information and map", httpLink(a.MORE_INFO)] : ["Open Gate program", "https://wildlife.dgf.nm.gov/hunting/maps/open-gate-program/"],
            facts: [
              ["Ownership", "Private land (Open Gate)"],
              listed && ["Open for", listed],
              cleanText(a.Term) && ["Lease term", cleanText(a.Term)],
              cleanText(a.GMU) && ["Game management unit", cleanText(a.GMU)],
              cleanText(a.County) && ["County", cleanText(a.County)],
            ],
            acres: records.reduce((sum, r) => sum + (r.Acres || 0), 0),
          };
        },
      },
    ],
  },
};

// ---------- Official federal agency layers ----------
// Same shape as a STATE_LAYERS entry, but queried for every search regardless of state. Federal
// polygons are authoritative boundaries, so `ownBoundary` keeps them instead of borrowing the PAD-US
// twin's outline (the twin is still dropped).
const FWS = "U.S. Fish & Wildlife Service";
const FWS_HUNT_UNITS = "https://services.arcgis.com/QVENGdaPbd4LUkLV/arcgis/rest/services/FWS_NWRS_HQ_PublicHuntUnits_view/FeatureServer/0";
const FWS_HUNT_FISH = "https://services.arcgis.com/QVENGdaPbd4LUkLV/arcgis/rest/services/FWS_NWRS_HQ_HuntFishCentroids/FeatureServer/0";

// The Service's per-station columns that are an explicit "yes"/"no", and what each one is called.
const FWS_HUNT_KINDS = [
  ["BigGame", "big game"],
  ["SmallGame", "small game"],
  ["Waterfowl", "waterfowl"],
  ["MigratoryB", "migratory birds"],
  ["UplandBird", "upland birds"],
  ["Turkey", "turkey"],
];
const FWS_FISH_KINDS = [
  ["Freshwater", "freshwater"],
  ["TidalFishi", "tidal"],
  ["Shellfishi", "shellfish"],
];

const FEDERAL_LAYERS = {
  agency: FWS,
  layers: [
    {
      id: "fws-hunt",
      name: "National Hunt Units (50 CFR Part 32)",
      url: FWS_HUNT_UNITS,
      outFields: "Organization_Code,Organization_Name,Organization_Type,Hunt_Unit_Name,Huntable,Station_Website,Hunting_Website,State",
      geometry: "polygon",
      ownBoundary: true,
      // One record per station with what the Service lists there (species groups, fishing, permits).
      // Looked up by station code rather than by distance, because a refuge's centre point can sit
      // outside the search circle while its hunt units reach in.
      detailLayer: {
        name: "Hunting and Fishing Opportunities by Station",
        url: FWS_HUNT_FISH,
        keyField: "OrgCode",
        from: (a) => a.Organization_Code,
        outFields:
          "OrgCode,BigGame,SmallGame,Waterfowl,MigratoryB,UplandBird,Turkey,FishingOpe,Freshwater,TidalFishi,Shellfishi,PermitRequ,PermitObta,UrlFishing",
      },
      // Units the Service marks Huntable "No" are kept apart from huntable ones, so a refuge with
      // both gets a shown place (huntable units only) and a hidden one that still removes the PAD-US twin.
      groupBy: (a) => `${cleanText(a.Organization_Name)}|${a.Huntable && a.Huntable !== "No" ? "hunt" : "no"}`,
      toPlace: (a, { detail }) => {
        const hunting = !!a.Huntable && a.Huntable !== "No";
        const isRefuge = a.Organization_Type === "NWR";
        const link = (url) => (url && url.trim().startsWith("http") ? url.trim() : null);
        // Only an explicit "yes" counts; a blank or missing column says nothing.
        const d = detail || {};
        const listed = (kinds) => kinds.filter(([field]) => d[field] === "yes").map(([, label]) => label).join(", ");
        const huntKinds = listed(FWS_HUNT_KINDS);
        const fishKinds = listed(FWS_FISH_KINDS);
        return {
          name: cleanText(a.Organization_Name),
          typeLabel: isRefuge ? "National Wildlife Refuge" : "Fish & Wildlife Service land",
          // The outline is hunt units only. The Service's fishing flag is for the station as a whole,
          // not these units, so it is shown as a fact below and never as a fishing place.
          activities: hunting ? ["hunting"] : [],
          hidden: !hunting,
          state: a.State || undefined,
          description: `Managed by the ${FWS}. The Service lists the hunt units shown here as open to hunting under its station-specific regulations (50 CFR Part 32).`,
          pageLink: link(a.Hunting_Website) ? ["Refuge hunting page", link(a.Hunting_Website)] : link(a.Station_Website) ? ["Refuge page", link(a.Station_Website)] : null,
          extraLinks: [link(d.UrlFishing) && ["Refuge fishing page", link(d.UrlFishing)]],
          facts: [
            a.Huntable === "Special Regulations Apply" && ["Hunting", "Special regulations apply"],
            huntKinds && ["Hunting listed for", huntKinds],
            d.FishingOpe === "yes" && ["Fishing", `Listed for this station${fishKinds ? ` (${fishKinds})` : ""} — see its fishing rules for where`],
            d.PermitRequ === "yes" && ["Refuge permit", cleanText(d.PermitObta) ? `Required — ${cleanText(d.PermitObta)}` : "Required"],
          ],
        };
      },
    },
  ],
};

function stateLayersFor(stateAbbrev) {
  return STATE_LAYERS[stateAbbrev] || null;
}
