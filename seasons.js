// 2026–27 hunting season dates, transcribed on 2026-09-14 from:
//   - ADCNR statewide seasons: https://www.outdooralabama.com/hunting/seasons-and-bag-limits
//   - ADCNR 2026–27 WMA AREA Permit PDFs (Swan Creek/Mallard-Fox Creek, Black Warrior, J.D. Martin-Skyline)
//   - USFWS Wheeler NWR Hunt Permit 2026–2027
//
// Dates are inclusive "YYYY-MM-DD" ranges. A season with `dates: []` and `none: true` means
// "no open season" on that area. This is a SUMMARY — bag limits, legal weapons, zone
// boundaries, hunt-day restrictions and quota rules are in the official documents.

const SEASON_YEAR = "2026–27";
const SEASON_DATA_THROUGH = "2027-08-31"; // AL licenses & WMA permits expire Aug 31

// Which areas get which scopes (detail vs statewide) is decided in coverage.js.

const GAME = {
  deer:      { label: "Deer",              color: "#8a4b1f" },
  turkey:    { label: "Turkey",            color: "#c0392b" },
  waterfowl: { label: "Waterfowl",         color: "#0e7c86" },
  dove:      { label: "Dove",              color: "#7b5ea7" },
  smallGame: { label: "Squirrel & Rabbit", color: "#5a8f29" },
  quail:     { label: "Quail",             color: "#c79a1e" },
};

// Statewide segments reused by areas that follow "State Season".
const STATE = {
  dove: [
    ["2026-09-05", "2026-10-18"],
    ["2026-11-21", "2026-11-29"],
    ["2026-12-12", "2027-01-17"],
  ],
  teal: [["2026-09-12", "2026-09-20"]],
  duck: [
    ["2026-11-27", "2026-11-28"],
    ["2026-12-05", "2027-01-31"],
  ],
  geese: [
    ["2026-09-05", "2026-10-04"],
    ["2026-10-17", "2026-10-31"],
    ["2026-11-27", "2026-11-28"],
    ["2026-12-05", "2027-01-31"],
  ],
  youthWaterfowl: [
    ["2026-11-21", "2026-11-21"],
    ["2027-02-06", "2027-02-06"],
  ],
};

const WATERFOWL_NOTE =
  "ADCNR notes federal waterfowl guidelines were not final at printing — check for updates.";

const SEASON_SCOPES = {
  alHuntsvilleArea: {
    name: "North Alabama (Madison/Limestone Zones)",
    short: "N. Alabama (Madison Co.)",
    tier: "detail",
    state: "AL",
    seasonYear: SEASON_YEAR,
    retrieved: "2026-09-14",
    summary:
      "Private/leased land and open-permit public land in Madison & Limestone counties: Deer Zone A, Turkey Zone 2, Dove North Zone. WMAs and the refuge set their own dates.",
    sourceUrl: "https://www.outdooralabama.com/hunting/seasons-and-bag-limits",
    seasons: [
      { game: "deer", name: "Archery", dates: [["2026-10-15", "2027-02-10"]], note: "Either sex." },
      { game: "deer", name: "Special youth gun (under 16)", dates: [["2026-11-13", "2026-11-16"]] },
      { game: "deer", name: "Muzzleloader & air rifle", dates: [["2026-11-16", "2026-11-20"]], note: "Stalk hunting only." },
      {
        game: "deer",
        name: "Gun",
        dates: [["2026-11-21", "2027-02-10"]],
        note: "Either sex on private/leased land. Open-permit public land: bucks only except Dec 12 – Jan 3 (either sex).",
      },
      { game: "turkey", name: "Special youth hunt", dates: [["2027-03-20", "2027-03-21"]] },
      { game: "turkey", name: "Special disabled hunt", dates: [["2027-03-26", "2027-03-26"]] },
      {
        game: "turkey",
        name: "Spring (gobblers)",
        dates: [["2027-03-27", "2027-05-03"]],
        note: "Zone 2. Jackson County is Zone 1: Mar 20 – May 3.",
      },
      { game: "waterfowl", name: "Special teal", dates: STATE.teal, note: WATERFOWL_NOTE },
      { game: "waterfowl", name: "Geese", dates: STATE.geese, note: WATERFOWL_NOTE },
      { game: "waterfowl", name: "Youth / military / veteran days", dates: STATE.youthWaterfowl },
      { game: "waterfowl", name: "Duck, coot & merganser", dates: STATE.duck, note: WATERFOWL_NOTE },
      { game: "dove", name: "Dove (North Zone)", dates: STATE.dove, note: "Opening day (Sep 5) noon to sunset only." },
      { game: "smallGame", name: "Squirrel & rabbit", dates: [["2026-09-12", "2027-02-28"]] },
      { game: "quail", name: "Bobwhite quail", dates: [["2026-11-07", "2027-02-28"]] },
    ],
  },

  wheeler: {
    name: "Wheeler National Wildlife Refuge",
    short: "Wheeler NWR",
    tier: "detail",
    state: "AL",
    seasonYear: SEASON_YEAR,
    retrieved: "2026-09-14",
    summary:
      "Refuge hunt permit required. Hunting Monday–Saturday only (no Sundays). Deer & hog: archery and flintlock only. No waterfowl, turkey or dove hunting.",
    sourceUrl: "https://www.fws.gov/media/wheeler-nwr-hunt-permit-2026-2027",
    seasons: [
      { game: "deer", name: "Archery (deer & feral hog)", dates: [["2026-10-15", "2027-02-10"]], note: "Either sex." },
      { game: "deer", name: "Flintlock", dates: [["2027-01-04", "2027-01-16"]], note: "Antlered bucks only; .40 cal or larger." },
      {
        game: "smallGame",
        name: "Squirrel & rabbit",
        dates: [["2026-09-12", "2026-10-14"], ["2027-02-01", "2027-02-27"]],
        note: "Prohibited west of Flint Creek. Lead shot prohibited.",
      },
      { game: "quail", name: "Quail", dates: [["2027-02-01", "2027-02-27"]], note: "Prohibited west of Flint Creek." },
      { game: "turkey", none: true, dates: [] },
      { game: "waterfowl", none: true, dates: [] },
      { game: "dove", none: true, dates: [] },
    ],
  },

  swanMallard: {
    name: "Swan Creek & Mallard-Fox Creek WMA",
    short: "Swan Creek / Mallard-Fox",
    tier: "detail",
    state: "AL",
    seasonYear: SEASON_YEAR,
    retrieved: "2026-09-14",
    summary:
      "WMA License + AREA permit and daily check-in required. Dewatering Unit waterfowl blinds are by limited-quota drawing.",
    sourceUrl:
      "https://www.outdooralabama.com/sites/default/files/PDF%20documents/WMA%20Mamps/2026-2027/2026_27_D1-Swan%20Creek%2C%20Mallard%2C%20Fox%20Creek%20WMA%20ADA.pdf",
    seasons: [
      { game: "deer", name: "Archery", dates: [["2026-10-15", "2026-11-20"]], note: "Archery only on this WMA." },
      { game: "turkey", none: true, dates: [] },
      { game: "waterfowl", name: "Special teal", dates: STATE.teal },
      { game: "waterfowl", name: "Geese", dates: STATE.geese },
      { game: "waterfowl", name: "Youth / military / veteran days", dates: STATE.youthWaterfowl },
      { game: "waterfowl", name: "Duck, coot & merganser", dates: STATE.duck, note: WATERFOWL_NOTE },
      { game: "dove", name: "Dove (state season)", dates: STATE.dove, note: "Noon to sunset only — no morning hunting." },
      { game: "smallGame", name: "Squirrel & rabbit", dates: [["2026-09-12", "2027-02-28"]], note: "Fox squirrel closed in February." },
      { game: "quail", none: true, dates: [] },
    ],
  },

  blackWarrior: {
    name: "Black Warrior WMA",
    short: "Black Warrior WMA",
    tier: "detail",
    state: "AL",
    seasonYear: SEASON_YEAR,
    retrieved: "2026-09-14",
    summary:
      "WMA License + AREA permit and daily check-in required. No dog deer hunting, no buckshot. Zone B bucks need 4+ points on one side. Mandatory check-station days apply.",
    sourceUrl:
      "https://www.outdooralabama.com/sites/default/files/PDF%20documents/WMA%20Mamps/2026-2027/2026_27_D1%20Black%20Warrior%20WMA%20ADA.pdf",
    seasons: [
      {
        game: "deer",
        name: "Archery",
        dates: [["2026-10-01", "2027-01-27"]],
        note: "Either sex Oct 1 – Jan 15; antlered bucks only Jan 16–27.",
      },
      { game: "deer", name: "Youth", dates: [["2026-10-31", "2026-11-01"]] },
      { game: "deer", name: "Primitive weapons", dates: [["2026-11-02", "2026-11-06"]] },
      { game: "deer", name: "Gun (Zones A & B)", dates: [["2026-11-07", "2026-11-08"]], note: "Either sex." },
      {
        game: "deer",
        name: "Gun – Zone A (bucks)",
        dates: [["2026-11-12", "2026-11-15"], ["2026-11-26", "2026-11-29"], ["2026-12-10", "2026-12-13"]],
      },
      {
        game: "deer",
        name: "Gun – Zone B (bucks)",
        dates: [["2026-11-19", "2026-11-22"], ["2026-12-03", "2026-12-06"], ["2026-12-17", "2026-12-20"]],
      },
      { game: "turkey", name: "Youth", dates: [["2027-03-20", "2027-03-20"]] },
      { game: "turkey", name: "Physically disabled", dates: [["2027-03-26", "2027-03-26"]] },
      { game: "turkey", name: "Spring (gobblers)", dates: [["2027-03-27", "2027-05-03"]], note: "Daylight until 1 p.m." },
      { game: "waterfowl", none: true, dates: [] },
      { game: "dove", none: true, dates: [] },
      {
        game: "smallGame",
        name: "Squirrel & rabbit",
        dates: [["2026-09-12", "2027-02-28"]],
        note: "No hunting on youth, primitive-weapon or gun deer hunt days.",
      },
      { game: "quail", none: true, dates: [] },
    ],
  },

  skyline: {
    name: "James D. Martin-Skyline WMA",
    short: "Skyline WMA",
    tier: "detail",
    state: "AL",
    seasonYear: SEASON_YEAR,
    retrieved: "2026-09-14",
    summary:
      "WMA License + AREA permit and daily check-in required. No dog deer hunting, no buckshot. Bucks need 3+ points on one side. Mandatory check-station days apply.",
    sourceUrl:
      "https://www.outdooralabama.com/sites/default/files/PDF%20documents/WMA%20Mamps/2026-2027/2026_27_D2-James%20D.%20Martin-Skyline%20WMA5%20ADA.pdf",
    seasons: [
      { game: "deer", name: "Archery", dates: [["2026-10-15", "2027-02-10"]] },
      { game: "deer", name: "Youth", dates: [["2026-11-14", "2026-11-15"]] },
      { game: "deer", name: "Primitive weapons", dates: [["2026-11-16", "2026-11-20"], ["2026-12-03", "2026-12-06"]] },
      { game: "deer", name: "Gun (either sex)", dates: [["2026-11-21", "2026-11-22"], ["2026-11-28", "2026-11-29"]] },
      {
        game: "deer",
        name: "Gun (bucks only)",
        dates: [
          ["2026-12-10", "2026-12-13"],
          ["2026-12-17", "2026-12-20"],
          ["2026-12-24", "2026-12-27"],
          ["2026-12-31", "2027-01-03"],
          ["2027-01-07", "2027-01-10"],
          ["2027-01-21", "2027-01-24"],
        ],
      },
      { game: "turkey", name: "Youth", dates: [["2027-03-13", "2027-03-13"]] },
      { game: "turkey", name: "Physically disabled", dates: [["2027-03-19", "2027-03-19"]] },
      { game: "turkey", name: "Spring (gobblers)", dates: [["2027-03-20", "2027-05-03"]], note: "Daylight until 1 p.m." },
      {
        game: "waterfowl",
        name: "Waterfowl (state season)",
        // Goose segments cover the teal and duck dates, so they span the whole state waterfowl season.
        dates: STATE.geese,
        note: "Teal Sep 12–20; ducks Nov 27–28 & Dec 5 – Jan 31; geese all listed dates. No hunting on primitive-weapon or gun deer hunt days.",
      },
      { game: "dove", name: "Dove (state season)", dates: STATE.dove, note: "Wednesdays & Saturdays only." },
      {
        game: "smallGame",
        name: "Squirrel & rabbit",
        dates: [["2026-10-01", "2027-02-28"]],
        note: "Rabbit in Zone B: Feb 1–28 only. No hunting on deer hunt days.",
      },
      { game: "quail", name: "Quail", dates: [["2026-11-07", "2027-02-28"]], note: "No hunting on deer hunt days." },
    ],
  },

  // ---------- Statewide tier ----------
  // One summarized entry per state: general, non-zoned game only gets real dates; anything that is
  // legitimately set per zone/unit, or that this session could not verify from an official source,
  // is `varies: true` with a `verifyUrl` rather than a guessed date range (see CLAUDE.md's data-trust
  // rule). Add a new state by adding one more `"XX-statewide"` entry here — nothing else needs to change.
  "AL-statewide": {
    name: "Alabama – Statewide",
    short: "Alabama statewide",
    tier: "statewide",
    state: "AL",
    seasonYear: SEASON_YEAR,
    retrieved: "2026-09-14",
    summary:
      "General statewide framework for non-zoned game. Deer (4 zones) and turkey (2 zones) run on different dates by zone, and dove differs between the North and South zones.",
    sourceUrl: "https://www.outdooralabama.com/hunting/seasons-and-bag-limits",
    seasons: [
      { game: "deer", name: "Deer (4 zones)", varies: true, dates: [], note: "Zones A–D open on different dates and have different either-sex days.", verifyUrl: "https://www.outdooralabama.com/hunting/seasons-and-bag-limits" },
      { game: "turkey", name: "Turkey (2 zones)", varies: true, dates: [], note: "Zone 1 (Jackson Co.) opens Mar 20; Zone 2 (rest of state) opens Mar 27.", verifyUrl: "https://www.outdooralabama.com/hunting/seasons-and-bag-limits" },
      { game: "waterfowl", name: "Special teal", dates: STATE.teal, note: WATERFOWL_NOTE },
      { game: "waterfowl", name: "Geese", dates: STATE.geese, note: WATERFOWL_NOTE },
      { game: "waterfowl", name: "Youth / military / veteran days", dates: STATE.youthWaterfowl },
      { game: "waterfowl", name: "Duck, coot & merganser", dates: STATE.duck, note: WATERFOWL_NOTE },
      { game: "dove", name: "Dove (North/South zones differ)", varies: true, dates: [], note: "North Zone opens Sep 5; South Zone opens later — see official source for exact dates.", verifyUrl: "https://www.outdooralabama.com/hunting/seasons-and-bag-limits" },
      { game: "smallGame", name: "Squirrel & rabbit", dates: [["2026-09-12", "2027-02-28"]] },
      { game: "quail", name: "Bobwhite quail", dates: [["2026-11-07", "2027-02-28"]] },
    ],
  },

  "TN-statewide": {
    name: "Tennessee – Statewide",
    short: "Tennessee statewide",
    tier: "statewide",
    state: "TN",
    seasonYear: "2026–27",
    retrieved: "2026-09-17",
    summary:
      "General statewide framework from TWRA. Deer antlerless bag limits differ across Units 1–6, and duck/goose seasons use a tiered zone/application system.",
    sourceUrl: "https://www.tn.gov/twra/hunting/tennessee-hunting-seasons-summary.html",
    seasons: [
      { game: "deer", name: "Deer (unit limits vary)", varies: true, dates: [], note: "Archery Sep 26–Oct 30 & Nov 2–6, 2026; gun/muzzleloader/archery Nov 21, 2026–Jan 3, 2027 statewide — but antlerless bag limits differ across Units 1–6.", verifyUrl: "https://www.tn.gov/twra/hunting/tennessee-hunting-seasons-summary.html" },
      { game: "turkey", name: "Fall archery", dates: [["2026-09-26", "2026-10-30"], ["2026-11-02", "2026-11-06"]], note: "Statewide; some WMA exceptions." },
      { game: "turkey", name: "Spring youth hunt", dates: [["2027-03-27", "2027-03-28"]] },
      { game: "turkey", name: "Spring general season", dates: [["2027-04-03", "2027-05-16"]], note: "Statewide; some WMA exceptions." },
      { game: "waterfowl", name: "Duck & goose (zone/application system)", varies: true, dates: [], note: "Uses a tiered zone and application system rather than one statewide date range.", verifyUrl: "https://www.tn.gov/twra/hunting/tennessee-hunting-seasons-summary.html" },
      { game: "waterfowl", name: "Special teal", dates: [["2026-09-12", "2026-09-16"]] },
      { game: "dove", name: "Dove", dates: [["2026-09-01", "2026-09-28"], ["2026-10-10", "2026-11-01"], ["2026-12-08", "2027-01-15"]] },
      { game: "smallGame", name: "Squirrel", dates: [["2026-08-22", "2027-03-15"]] },
      { game: "smallGame", name: "Rabbit", dates: [["2026-11-07", "2027-02-28"]] },
      { game: "quail", name: "Quail", dates: [["2026-11-07", "2027-02-28"]], note: "Nov 1 – Jan 15 on WMAs." },
    ],
  },

  "FL-statewide": {
    name: "Florida – Statewide",
    short: "Florida statewide",
    tier: "statewide",
    state: "FL",
    seasonYear: "2026–27",
    retrieved: "2026-09-17",
    summary:
      "General statewide framework from FWC. Deer and turkey run on different dates in each of Florida's zones (A–D).",
    sourceUrl: "https://myfwc.com/hunting/season-dates/",
    seasons: [
      { game: "deer", name: "Deer (zones A–D)", varies: true, dates: [], note: "Archery, gun and muzzleloader windows differ by zone, roughly Aug through Feb.", verifyUrl: "https://myfwc.com/hunting/season-dates/" },
      { game: "turkey", name: "Turkey (zones vary)", varies: true, dates: [], note: "Fall season differs by zone; spring splits at State Road 70 (Mar 20–Apr 25 north, Mar 6–Apr 11 south).", verifyUrl: "https://myfwc.com/hunting/season-dates/" },
      { game: "dove", name: "Dove", varies: true, dates: [], note: "Not listed on the statewide season-dates page at time of retrieval.", verifyUrl: "https://myfwc.com/hunting/season-dates/" },
      { game: "waterfowl", name: "Waterfowl", varies: true, dates: [], note: "Set under separate migratory-bird regulations.", verifyUrl: "https://myfwc.com/hunting/season-dates/" },
      { game: "smallGame", name: "Gray squirrel", varies: true, dates: [], note: "No closed season statewide; daily bag limit 12.", verifyUrl: "https://myfwc.com/hunting/season-dates/" },
      { game: "quail", name: "Quail", dates: [["2026-11-14", "2027-03-07"]] },
    ],
  },

  "GA-statewide": {
    name: "Georgia – Statewide",
    short: "Georgia statewide",
    tier: "statewide",
    state: "GA",
    seasonYear: "2026–27",
    retrieved: "2026-09-17",
    summary: "Confirmed dove dates from an official DNR release. Other 2026–27 season dates were not confirmed from an official source at time of retrieval.",
    sourceUrl: "https://georgiawildlife.com/hunting",
    seasons: [
      { game: "deer", name: "Deer", varies: true, dates: [], note: "2026–27 dates not confirmed from an official source at time of retrieval.", verifyUrl: "https://georgiawildlife.com/hunting" },
      { game: "turkey", name: "Turkey", varies: true, dates: [], note: "Spring 2027 dates had not been announced at time of retrieval.", verifyUrl: "https://georgiawildlife.com/turkey-info" },
      { game: "dove", name: "Dove", dates: [["2026-09-05", "2026-10-11"], ["2026-11-21", "2026-11-29"], ["2026-12-19", "2027-01-31"]] },
      { game: "smallGame", name: "Squirrel & rabbit", varies: true, dates: [], note: "2026–27 dates not confirmed from an official source at time of retrieval.", verifyUrl: "https://georgiawildlife.com/hunting" },
      { game: "quail", name: "Quail", varies: true, dates: [], note: "2026–27 dates not confirmed from an official source at time of retrieval.", verifyUrl: "https://georgiawildlife.com/hunting" },
      { game: "waterfowl", name: "Waterfowl", varies: true, dates: [], note: "2026–27 dates not confirmed from an official source at time of retrieval.", verifyUrl: "https://georgiawildlife.com/hunting" },
    ],
  },

  "SC-statewide": {
    name: "South Carolina – Statewide",
    short: "South Carolina statewide",
    tier: "statewide",
    state: "SC",
    seasonYear: "2026–27",
    retrieved: "2026-09-17",
    summary: "South Carolina's seasons are set per game zone (1–4). The full 2026–27 regulations guide was not reachable from this session — see the official source below.",
    sourceUrl: "https://www.dnr.sc.gov/hunting.html",
    seasons: [
      { game: "deer", name: "Deer (4 zones)", varies: true, dates: [], note: "Zone 4 traditionally opens earliest (mid-August); Zone 1 latest (October). See the official regulations guide.", verifyUrl: "https://www.dnr.sc.gov/hunting.html" },
      { game: "turkey", name: "Turkey", varies: true, dates: [], note: "2026–27 dates not confirmed from an official source at time of retrieval.", verifyUrl: "https://www.dnr.sc.gov/hunting.html" },
      { game: "dove", name: "Dove", varies: true, dates: [], note: "Traditionally opens Labor Day weekend; exact 2026–27 dates not confirmed from an official source at time of retrieval.", verifyUrl: "https://www.dnr.sc.gov/hunting.html" },
      { game: "smallGame", name: "Squirrel & rabbit", varies: true, dates: [], note: "2026–27 dates not confirmed from an official source at time of retrieval.", verifyUrl: "https://www.dnr.sc.gov/hunting.html" },
      { game: "quail", name: "Quail", varies: true, dates: [], note: "2026–27 dates not confirmed from an official source at time of retrieval.", verifyUrl: "https://www.dnr.sc.gov/hunting/quail.html" },
      { game: "waterfowl", name: "Waterfowl", varies: true, dates: [], note: "2026–27 dates not confirmed from an official source at time of retrieval.", verifyUrl: "https://www.dnr.sc.gov/hunting/waterfowl.html" },
    ],
  },

  "NC-statewide": {
    name: "North Carolina – Statewide",
    short: "North Carolina statewide",
    tier: "statewide",
    state: "NC",
    seasonYear: "2026–27",
    retrieved: "2026-09-17",
    summary: "General statewide framework from the NCWRC season-dates reference. Deer runs on different archery/blackpowder/gun dates in each of 6 zones.",
    sourceUrl: "https://www.ncwildlife.gov/regulations/2026-2027-season-dates-glance/download?attachment=",
    seasons: [
      { game: "deer", name: "Deer (6 zones)", varies: true, dates: [], note: "Archery/blackpowder/gun windows differ by zone, roughly Sep through Jan 1.", verifyUrl: "https://www.ncwildlife.gov/regulations/2026-2027-season-dates-glance/download?attachment=" },
      { game: "turkey", name: "Youth season", dates: [["2027-04-10", "2027-04-11"]] },
      { game: "turkey", name: "Statewide spring season", dates: [["2027-04-17", "2027-05-15"]] },
      { game: "smallGame", name: "Squirrel & rabbit", dates: [["2026-10-12", "2027-02-28"]] },
      { game: "quail", name: "Quail", dates: [["2026-11-21", "2027-02-28"]] },
      { game: "dove", name: "Dove", varies: true, dates: [], note: "Set under separate migratory-bird regulations.", verifyUrl: "https://www.ncwildlife.gov/hunting/fishing-hunting-trapping-regulations" },
      { game: "waterfowl", name: "Waterfowl", varies: true, dates: [], note: "Set under separate migratory-bird regulations.", verifyUrl: "https://www.ncwildlife.gov/hunting/fishing-hunting-trapping-regulations" },
    ],
  },

  "KY-statewide": {
    name: "Kentucky – Statewide",
    short: "Kentucky statewide",
    tier: "statewide",
    state: "KY",
    seasonYear: "2026–27",
    retrieved: "2026-09-17",
    summary: "General statewide framework from the KDFWR season poster. Rabbit, quail and one early goose segment differ between the Eastern and Western zones.",
    sourceUrl: "https://fw.ky.gov/Hunt/Documents/Hunting_Poster.pdf",
    seasons: [
      { game: "deer", name: "Archery", dates: [["2026-09-05", "2027-01-18"]], note: "CWD Zone has an additional antlerless-only season Sep 25–28, 2026." },
      { game: "deer", name: "Crossbow", dates: [["2026-09-19", "2027-01-18"]] },
      { game: "deer", name: "Youth-only firearms", dates: [["2026-10-10", "2026-10-18"]] },
      { game: "deer", name: "Muzzleloader", dates: [["2026-10-17", "2026-10-18"], ["2026-12-12", "2026-12-20"]] },
      { game: "deer", name: "Modern firearms", dates: [["2026-11-14", "2026-11-29"]] },
      { game: "deer", name: "Free youth weekend", dates: [["2026-12-26", "2026-12-27"]] },
      { game: "turkey", name: "Fall shotgun", dates: [["2026-10-24", "2026-10-30"], ["2026-12-05", "2026-12-11"]] },
      { game: "turkey", name: "Fall archery", dates: [["2026-09-05", "2027-01-18"]] },
      { game: "turkey", name: "Fall crossbow", dates: [["2026-10-01", "2026-10-18"], ["2026-11-14", "2026-12-31"]] },
      { game: "smallGame", name: "Squirrel", dates: [["2026-08-15", "2026-11-13"], ["2026-11-16", "2027-02-28"]] },
      { game: "smallGame", name: "Rabbit (Eastern/Western zones)", varies: true, dates: [], note: "Eastern Zone: Nov 1–13 & Nov 16, 2026–Jan 31, 2027. Western Zone: Nov 16, 2026–Feb 10, 2027.", verifyUrl: "https://fw.ky.gov/Hunt/Documents/Hunting_Poster.pdf" },
      { game: "quail", name: "Quail (Eastern/Western zones)", varies: true, dates: [], note: "Eastern Zone: Nov 1–13 & Nov 16, 2026–Jan 31, 2027. Western Zone: Nov 16, 2026–Feb 10, 2027.", verifyUrl: "https://fw.ky.gov/Hunt/Documents/Hunting_Poster.pdf" },
      { game: "dove", name: "Dove", dates: [["2026-09-01", "2026-10-26"], ["2026-11-26", "2026-12-06"], ["2026-12-19", "2027-01-10"]] },
      { game: "waterfowl", name: "Teal & wood duck", dates: [["2026-09-19", "2026-09-23"]] },
      { game: "waterfowl", name: "September Canada goose (zones differ)", varies: true, dates: [], note: "Western Zone: Sep 1–15, 2026. Eastern Zone: Sep 16–30, 2026.", verifyUrl: "https://fw.ky.gov/Hunt/Documents/Hunting_Poster.pdf" },
      { game: "waterfowl", name: "Duck, coot & merganser", dates: [["2026-11-26", "2026-11-29"], ["2026-12-07", "2027-01-31"]] },
      { game: "waterfowl", name: "Canada/cackling/white-fronted/snow/Ross's goose", dates: [["2026-11-26", "2027-02-15"]] },
      { game: "waterfowl", name: "Light goose conservation order", dates: [["2027-02-16", "2027-03-31"]] },
      { game: "waterfowl", name: "Youth-only days", dates: [["2026-11-21", "2026-11-21"], ["2027-02-13", "2027-02-13"]] },
      { game: "waterfowl", name: "Military/veteran-only days", dates: [["2026-11-22", "2026-11-22"], ["2027-02-14", "2027-02-14"]] },
    ],
  },

  "AR-statewide": {
    name: "Arkansas – Statewide",
    short: "Arkansas statewide",
    tier: "statewide",
    state: "AR",
    seasonYear: "2026–27",
    retrieved: "2026-09-17",
    summary: "General statewide framework from AGFC. Deer (17 zones) and turkey (new 2026–27 zone structure) run on different dates by zone.",
    sourceUrl: "https://www.agfc.com/hunting/",
    seasons: [
      { game: "deer", name: "Deer (17 zones)", varies: true, dates: [], note: "Most zones: early buck archery Aug 29–31; regular archery Sep 26, 2026–Feb 28, 2027; modern gun Nov 14–Dec 6 & Dec 26–28, 2026 — but firearm windows differ by zone.", verifyUrl: "https://www.agfc.com/hunting/deer/deer-seasons-and-limits-by-zone/" },
      { game: "turkey", name: "Turkey (zones vary)", varies: true, dates: [], note: "New 2026–27 zone structure; spring 2027 dates range roughly Apr 12 – May 9 depending on zone.", verifyUrl: "https://www.agfc.com/hunting/turkey/turkey-dates-rules-regulations/" },
      { game: "dove", name: "Dove", dates: [["2026-09-05", "2026-10-25"], ["2026-12-08", "2027-01-15"]] },
      { game: "smallGame", name: "Squirrel", dates: [["2026-05-15", "2027-02-28"]] },
      { game: "quail", name: "Quail", dates: [["2026-11-01", "2027-02-07"]], note: "Private land; WMAs may differ." },
      { game: "waterfowl", name: "Special early teal", dates: [["2026-09-19", "2026-09-27"]] },
      { game: "waterfowl", name: "Duck, coot & merganser", dates: [["2026-11-21", "2026-11-29"], ["2026-12-10", "2026-12-23"], ["2026-12-26", "2027-01-31"]] },
      { game: "waterfowl", name: "Canada goose (early)", dates: [["2026-09-01", "2026-10-15"]] },
      { game: "waterfowl", name: "Canada goose (regular)", dates: [["2026-11-21", "2026-11-29"], ["2026-12-10", "2026-12-23"], ["2026-12-26", "2027-01-31"]] },
      { game: "waterfowl", name: "White-fronted & light geese", dates: [["2026-10-31", "2026-11-08"], ["2026-11-21", "2026-11-29"], ["2026-12-10", "2026-12-23"], ["2026-12-26", "2027-01-31"]] },
      { game: "waterfowl", name: "Light goose conservation order", dates: [["2027-02-01", "2027-02-05"], ["2027-02-08", "2027-04-25"]] },
    ],
  },

  "MS-statewide": {
    name: "Mississippi – Statewide",
    short: "Mississippi statewide",
    tier: "statewide",
    state: "MS",
    seasonYear: "2026–27",
    retrieved: "2026-09-17",
    summary: "Mississippi sets deer by 4 management units (Delta, North Central, Hills, Southeast). This session could only confirm the unit map from MDWFP's official 2026–27 PDF — other dates were not reachable from this session.",
    sourceUrl: "https://www.mdwfp.com/sites/default/files/2026-06/2026-2027%20hunting%20seasons.pdf",
    seasons: [
      { game: "deer", name: "Deer (4 units)", varies: true, dates: [], note: "Delta, North Central, Hills and Southeast units have different legal-buck rules and dates.", verifyUrl: "https://www.mdwfp.com/sites/default/files/2026-06/2026-2027%20hunting%20seasons.pdf" },
      { game: "turkey", name: "Turkey", varies: true, dates: [], note: "2026–27 dates not reachable from this session — see the official PDF.", verifyUrl: "https://www.mdwfp.com/sites/default/files/2026-06/2026-2027%20hunting%20seasons.pdf" },
      { game: "dove", name: "Dove", varies: true, dates: [], note: "2026–27 dates not reachable from this session — see the official PDF.", verifyUrl: "https://www.mdwfp.com/sites/default/files/2026-06/2026-2027%20hunting%20seasons.pdf" },
      { game: "smallGame", name: "Squirrel & rabbit", varies: true, dates: [], note: "2026–27 dates not reachable from this session — see the official PDF.", verifyUrl: "https://www.mdwfp.com/sites/default/files/2026-06/2026-2027%20hunting%20seasons.pdf" },
      { game: "quail", name: "Quail", varies: true, dates: [], note: "2026–27 dates not reachable from this session — see the official PDF.", verifyUrl: "https://www.mdwfp.com/sites/default/files/2026-06/2026-2027%20hunting%20seasons.pdf" },
      { game: "waterfowl", name: "Waterfowl", varies: true, dates: [], note: "2026–27 dates not reachable from this session — see the official PDF.", verifyUrl: "https://www.mdwfp.com/sites/default/files/2026-06/2026-2027%20hunting%20seasons.pdf" },
    ],
  },

  "LA-statewide": {
    name: "Louisiana – Statewide",
    short: "Louisiana statewide",
    tier: "statewide",
    state: "LA",
    seasonYear: "2026–27",
    retrieved: "2026-09-17",
    summary: "LDWF's seasons-and-regulations pages were not reachable from this session (blocked automated access). See the official source below for current dates.",
    sourceUrl: "https://www.wlf.louisiana.gov/page/seasons-and-regulations",
    seasons: [
      { game: "deer", name: "Deer", varies: true, dates: [], note: "Dates vary by deer area — not reachable from this session.", verifyUrl: "https://www.wlf.louisiana.gov/page/seasons-and-regulations" },
      { game: "turkey", name: "Turkey", varies: true, dates: [], note: "Dates vary by area — not reachable from this session.", verifyUrl: "https://www.wlf.louisiana.gov/page/seasons-and-regulations" },
      { game: "dove", name: "Dove", varies: true, dates: [], note: "Dates vary by zone — not reachable from this session.", verifyUrl: "https://www.wlf.louisiana.gov/page/seasons-and-regulations" },
      { game: "smallGame", name: "Squirrel & rabbit", varies: true, dates: [], note: "Not reachable from this session.", verifyUrl: "https://www.wlf.louisiana.gov/page/seasons-and-regulations" },
      { game: "quail", name: "Quail", varies: true, dates: [], note: "Not reachable from this session.", verifyUrl: "https://www.wlf.louisiana.gov/page/seasons-and-regulations" },
      { game: "waterfowl", name: "Waterfowl", varies: true, dates: [], note: "Not reachable from this session.", verifyUrl: "https://www.wlf.louisiana.gov/page/seasons-and-regulations" },
    ],
  },
};

// ---------- Date helpers (all dates are local calendar days) ----------

function parseDay(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// "Today" for season status. Add ?date=YYYY-MM-DD to the page URL to preview another day.
const TODAY = (() => {
  const override = new URLSearchParams(location.search).get("date");
  return override && /^\d{4}-\d{2}-\d{2}$/.test(override) ? parseDay(override) : startOfDay(new Date());
})();

function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
}

function formatDay(date, opts = { month: "short", day: "numeric" }) {
  return date.toLocaleDateString("en-US", opts);
}

function formatRange([start, end]) {
  const s = parseDay(start);
  const e = parseDay(end);
  if (start === end) return formatDay(s);
  return `${formatDay(s)} – ${formatDay(e)}`;
}

function inRange(date, [start, end]) {
  const t = startOfDay(date).getTime();
  return t >= parseDay(start).getTime() && t <= parseDay(end).getTime();
}

// Status of one game within one scope on a given date:
//   { kind: "open", seasons } | { kind: "upcoming", date, season } | { kind: "closed" } | { kind: "none" }
//   | { kind: "varies", seasons }
function gameStatus(scopeId, game, date) {
  const seasons = SEASON_SCOPES[scopeId].seasons.filter((s) => s.game === game);
  const varying = seasons.filter((s) => s.varies);
  if (varying.length) return { kind: "varies", seasons: varying };
  const active = seasons.filter((s) => !s.none);
  if (!active.length) return { kind: "none" };

  const openNow = active.filter((s) => s.dates.some((r) => inRange(date, r)));
  if (openNow.length) return { kind: "open", seasons: openNow };

  let next = null;
  for (const s of active) {
    for (const [start] of s.dates) {
      const d = parseDay(start);
      if (d > date && (!next || d < next.date)) next = { date: d, season: s };
    }
  }
  return next ? { kind: "upcoming", ...next } : { kind: "closed" };
}

// Every open/close event in a scope, sorted by date. One-day seasons are a single "single" event. Adjacent segments of the same
// season (e.g. Nov 21–29 then Dec 12) still produce separate events.
function seasonEvents(scopeId, games) {
  const events = [];
  for (const s of SEASON_SCOPES[scopeId].seasons) {
    if (s.none || (games && !games.includes(s.game))) continue;
    for (const range of s.dates) {
      if (range[0] === range[1]) {
        events.push({ type: "single", date: parseDay(range[0]), season: s, range });
        continue;
      }
      events.push({ type: "open", date: parseDay(range[0]), season: s, range });
      events.push({ type: "close", date: parseDay(range[1]), season: s, range });
    }
  }
  const order = { open: 0, single: 1, close: 2 };
  return events.sort((a, b) => a.date - b.date || order[a.type] - order[b.type]);
}
