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

// Season dates only exist for North Alabama. The calendar and map season rings are shown only when
// the searched city is inside this area; everywhere else we link to the state agency instead.
const SEASON_COVERAGE = {
  state: "AL",
  center: [34.7304, -86.5861], // Huntsville
  radiusMi: 60, // Madison/Limestone zones; farther south (e.g. Birmingham) uses different deer & turkey zones
  label: "North Alabama",
};

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
  statewide: {
    name: "Statewide – Huntsville area",
    short: "Statewide (Madison Co.)",
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
function gameStatus(scopeId, game, date) {
  const seasons = SEASON_SCOPES[scopeId].seasons.filter((s) => s.game === game);
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
