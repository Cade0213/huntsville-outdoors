// Hardcoded location data for the MVP.
//
// All coordinates are APPROXIMATE and should be verified before relying on them.
// Polygons marked `placeholderBoundary: true` are rough illustrative shapes, NOT real boundaries.
//
// Shape of each entry:
//   id           unique string
//   name         display name
//   activities   ["hunting"], ["fishing"], or both
//   kind         "zone" (polygon) or "point" (marker)
//   coords       [lat, lng] for points; array of [lat, lng] rings for zones
//   description  short summary
//   manager      managing agency
//   sourceUrl    official page to verify details
//   seasonScope  (hunting only) key into SEASON_SCOPES in seasons.js
//   mapUrl       (optional) official map / regulations document
//   padusName    (optional) matching Unit_Nm in the USGS PAD-US database; when a live search
//                returns that unit, its real boundary replaces the placeholder / point and the
//                duplicate "unconfirmed" PAD-US result is dropped

const HUNTSVILLE = [34.7304, -86.5861];
const DEFAULT_SEARCH = { label: "Huntsville, AL", center: HUNTSVILLE, state: "AL", radius: 50 };

const SOURCES = {
  wmaHub: "https://www.outdooralabama.com/hunting/wildlife-management-areas",
  boatingAccess: "https://www.outdooralabama.com/freshwater-boating-access",
  wheelerNwr: "https://www.fws.gov/refuge/wheeler",
};

const LOCATIONS = [
  // ---------------- Hunting ----------------
  {
    id: "wheeler-nwr-zone",
    name: "Wheeler National Wildlife Refuge",
    activities: ["hunting"],
    kind: "zone",
    placeholderBoundary: true,
    // Rough corridor along the Tennessee River from south of Decatur toward Redstone Arsenal.
    // The real refuge boundary is highly irregular — see the refuge hunt permit map.
    coords: [
      [34.585, -86.965],
      [34.640, -86.930],
      [34.660, -86.880],
      [34.650, -86.780],
      [34.640, -86.700],
      [34.610, -86.620],
      [34.560, -86.600],
      [34.570, -86.700],
      [34.575, -86.800],
      [34.560, -86.900],
      [34.520, -86.970],
    ],
    description:
      "Federal refuge along Wheeler Lake between Decatur and Huntsville. ~18,000 acres open to hunting under refuge rules; archery/flintlock deer and small game.",
    manager: "U.S. Fish & Wildlife Service",
    sourceUrl: SOURCES.wheelerNwr,
    seasonScope: "wheeler",
    mapUrl: "https://www.fws.gov/media/wheeler-nwr-hunt-permit-2026-2027",
    padusName: "Wheeler National Wildlife Refuge",
  },
  {
    id: "wheeler-nwr-vc",
    name: "Wheeler NWR Visitor Center",
    activities: ["hunting"],
    kind: "point",
    coords: [34.5554, -86.9516],
    description:
      "Refuge visitor center off AL-67 in Decatur. Good first stop for refuge maps and hunt information. The area around the visitor center is closed to hunting.",
    manager: "U.S. Fish & Wildlife Service",
    sourceUrl: SOURCES.wheelerNwr,
    seasonScope: "wheeler",
    mapUrl: "https://www.fws.gov/media/wheeler-nwr-hunt-permit-2026-2027",
  },
  {
    id: "swan-creek-wma",
    name: "Swan Creek WMA",
    activities: ["hunting"],
    kind: "point",
    coords: [34.665, -86.955],
    description:
      "State WMA on the Tennessee River near Tanner and US-31 (Limestone County). Known for waterfowl, dove and small game; deer is archery only.",
    manager: "ADCNR Wildlife & Freshwater Fisheries (with TVA)",
    sourceUrl: SOURCES.wmaHub,
    seasonScope: "swanMallard",
    mapUrl: SEASON_SCOPES.swanMallard.sourceUrl,
    padusName: "Swan Creek Wildlife Management Area",
  },
  {
    id: "mallard-fox-creek-wma",
    name: "Mallard-Fox Creek WMA",
    activities: ["hunting"],
    kind: "point",
    coords: [34.655, -87.105],
    description:
      "State WMA units on Wheeler Lake west of Decatur (Lawrence/Morgan counties), managed with Swan Creek. Primarily waterfowl habitat.",
    manager: "ADCNR Wildlife & Freshwater Fisheries (with TVA)",
    sourceUrl: SOURCES.wmaHub,
    seasonScope: "swanMallard",
    mapUrl: SEASON_SCOPES.swanMallard.sourceUrl,
    padusName: "Mallard-Fox Creek Wildlife Management Area",
  },
  {
    id: "black-warrior-wma",
    name: "Black Warrior WMA",
    activities: ["hunting"],
    kind: "point",
    coords: [34.33, -87.37],
    description:
      "Large WMA within the Bankhead National Forest (Lawrence/Winston counties). Deer, turkey and small game.",
    manager: "ADCNR Wildlife & Freshwater Fisheries / USDA Forest Service",
    sourceUrl: SOURCES.wmaHub,
    seasonScope: "blackWarrior",
    mapUrl: SEASON_SCOPES.blackWarrior.sourceUrl,
  },
  {
    id: "skyline-wma",
    name: "James D. Martin-Skyline WMA",
    activities: ["hunting"],
    kind: "point",
    coords: [34.865, -86.10],
    description:
      "Mountainous WMA on the Cumberland Plateau in Jackson County near Skyline. Deer, turkey, small game and quail.",
    manager: "ADCNR Wildlife & Freshwater Fisheries",
    sourceUrl: SOURCES.wmaHub,
    seasonScope: "skyline",
    mapUrl: SEASON_SCOPES.skyline.sourceUrl,
    padusName: "James D. Martin - Skyline Wildlife Management Area",
  },

  // ---------------- Fishing ----------------
  {
    id: "ditto-landing",
    name: "Ditto Landing (Tennessee River)",
    activities: ["fishing"],
    kind: "point",
    coords: [34.581, -86.563],
    description:
      "Marina and public boat launch on Wheeler Lake / Tennessee River, south of Huntsville off Hobbs Island Rd.",
    manager: "Huntsville-Madison County Marina & Port Authority",
    sourceUrl: "https://www.dittolanding.com",
  },
  {
    id: "triana-ramp",
    name: "Triana Boat Ramp (Tennessee River)",
    activities: ["fishing"],
    kind: "point",
    coords: [34.586, -86.738],
    description:
      "Public boat ramp in the Town of Triana with access to Wheeler Lake near the Indian Creek confluence.",
    manager: "Town of Triana",
    sourceUrl: SOURCES.boatingAccess,
  },
  {
    id: "madison-county-lake",
    name: "Madison County Public Fishing Lake",
    activities: ["fishing"],
    kind: "point",
    coords: [34.79, -86.40],
    description:
      "105-acre state public fishing lake in Gurley, ~11 miles east of Huntsville. Boat ramp and pier; state lake permit required.",
    manager: "ADCNR Wildlife & Freshwater Fisheries",
    sourceUrl: "https://www.outdooralabama.com/public-fishing-lakes/madison-county-pfl",
  },
  {
    id: "flint-river-hwy72",
    name: "Flint River Access (US-72 area)",
    activities: ["fishing"],
    kind: "point",
    coords: [34.745, -86.455],
    description:
      "Flint River near Brownsboro. Popular for bank and paddle fishing. Confirm the exact public put-in and parking before going.",
    manager: "Verify locally (Madison County / ADCNR)",
    sourceUrl: SOURCES.boatingAccess,
  },
];
