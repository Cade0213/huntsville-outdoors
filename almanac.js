// Almanac tab: a general-guidance companion to the map, keyed to whatever city is searched.
//
// Reads `appState.search` / `appState.areaStates` (script.js) and re-renders from refreshAll(),
// exactly like calendar.js and resources.js. Nothing runs at load — script.js calls initAlmanac().
//
// Where the numbers come from:
//   Sun & moon    calculated in this file (mean astronomical formulas, approximate by design)
//   Solunar       DERIVED from the moon times below. Solunar theory is folklore, not science;
//                 it is presented as a planning convention and labelled as such.
//   Weather       NOAA / National Weather Service via fetchWeather() in live.js — official
//   Agencies      states.js — official state wildlife agency sites
//   Guidance      hand-written GENERAL patterns below. Deliberately contains no dates, bag
//                 limits or legal claims: those belong to the state agency, not to this app.

// The exact wording required on this tab. Rendered verbatim at the top of the Almanac.
const ALMANAC_DISCLAIMER =
  "This Almanac provides general guidance only. It is not an official source for hunting or " +
  "fishing regulations. Seasons, bag limits, and rules vary by location and change regularly. " +
  "Always verify with the official state wildlife agency.";

// ---------- Regional guidance ----------
// Broad region per state. Only used to pick which general paragraph to show — nothing here is a
// regulatory boundary, and no state is split across regions even where its geography would.
const ALMANAC_REGIONS = {
  southeast: {
    label: "the Southeast",
    states: ["AL", "AR", "FL", "GA", "KY", "LA", "MS", "NC", "SC", "TN", "VA", "WV"],
    rut: "Whitetail rut activity generally runs from late October into January, and it varies by zone within a single state more than most hunters expect.",
    waters: "Warm-water reservoirs, tailwaters and coastal marsh. Largemouth bass, crappie, catfish and bream inland; redfish and speckled trout on the coast.",
  },
  northeast: {
    label: "the Northeast",
    states: ["CT", "DC", "DE", "MA", "MD", "ME", "NH", "NJ", "NY", "PA", "RI", "VT"],
    rut: "Whitetail rut activity is usually concentrated in November and is fairly consistent year to year.",
    waters: "Cold-water streams, glacial lakes and tidal estuaries. Trout, smallmouth bass and landlocked salmon inland; striped bass and flounder on the coast.",
  },
  midwest: {
    label: "the Midwest",
    states: ["IA", "IL", "IN", "MI", "MN", "MO", "OH", "WI"],
    rut: "Whitetail rut activity peaks in November across most of the region, a little earlier in the north.",
    waters: "Natural lakes, big rivers and the Great Lakes. Walleye, muskie, smallmouth bass, panfish and channel catfish.",
  },
  plains: {
    label: "the Great Plains",
    states: ["KS", "ND", "NE", "OK", "SD", "TX"],
    rut: "Whitetail and mule deer rut activity is generally November, with pronghorn much earlier in September.",
    waters: "Impoundments, prairie rivers and stock ponds. Walleye, white bass, catfish and crappie; striped bass in the larger reservoirs.",
  },
  mountain: {
    label: "the Mountain West",
    states: ["AZ", "CO", "ID", "MT", "NM", "NV", "UT", "WY"],
    rut: "Elk bugle through September; deer and pronghorn rut later, generally October into November. Most quality hunts here are limited-entry draws applied for months in advance.",
    waters: "Freestone rivers, high lakes and tailwaters. Trout of every kind, plus kokanee and warm-water species in the lower reservoirs.",
  },
  pacific: {
    label: "the Pacific states",
    states: ["CA", "OR", "WA"],
    rut: "Blacktail and mule deer rut activity is mostly November; Roosevelt elk bugle in September.",
    waters: "Coastal rivers, the Columbia system and the Pacific itself. Salmon and steelhead runs drive the calendar; trout, sturgeon and bass fill the rest of the year.",
  },
  alaska: {
    label: "Alaska",
    states: ["AK"],
    rut: "Moose rut in September and caribou migrate in late summer and fall. Seasons and unit rules here are unusually specific — read the unit, not the state.",
    waters: "Salmon runs define the season, with rainbow trout, char and grayling around them.",
  },
  hawaii: {
    label: "Hawaii",
    states: ["HI"],
    rut: "Game here is introduced species — axis deer, pigs, goats and birds — on a very different calendar from the mainland.",
    waters: "Nearshore and offshore saltwater. Bottom fish, ulua and pelagics; a handful of freshwater reservoirs.",
  },
};

const REGION_BY_STATE = Object.fromEntries(
  Object.entries(ALMANAC_REGIONS).flatMap(([key, r]) => r.states.map((s) => [s, key]))
);

// General month-by-month patterns. Northern-hemisphere temperate defaults — the region block
// above adds the local qualifier. No dates, no limits, no "you may hunt" claims.
const MONTH_GUIDANCE = [
  { wildlife: "Late-season conditions. Deer and other game move on a food-first pattern and feed hardest in the warmest part of a cold day. Waterfowl concentrate wherever water stays open.", fishing: "Cold water slows almost everything down. Fish deep and slow; crappie and perch school tightly, and tailwater trout stay reliable." },
  { wildlife: "The leanest stretch of the year for wildlife. Animals conserve energy and hold close to cover and food. A good month for scouting sign, shed antlers and next year's stand sites.", fishing: "Still cold and still slow, but pre-spawn movement begins in the south. Late-winter walleye and crappie start staging." },
  { wildlife: "Green-up begins and animals spread out. Turkeys begin gobbling and flocks break up; bears emerge in northern regions.", fishing: "Warming water wakes fish up. Pre-spawn bass move shallow, crappie push to the banks, and trout streams come alive with early hatches." },
  { wildlife: "Spring turkey activity is at its strongest in much of the country, and nesting season is underway for most birds.", fishing: "One of the best months of the year. Spawning brings bass, crappie and bream into shallow water where they are catchable all day." },
  { wildlife: "Nesting, fawning and calving. Most big-game hunting is closed and this is the season to stay out of bedding and nesting cover.", fishing: "Post-spawn and prime. Fish feed aggressively in comfortable water temperatures; early morning and late evening are the strongest windows." },
  { wildlife: "Antler growth and young animals on the ground. Almost entirely a scouting, habitat-work and trail-camera month.", fishing: "Warm and productive, but daytime heat pushes fish deeper. Fish low light and moving water; topwater is at its best at dawn." },
  { wildlife: "The hottest, quietest stretch. Wildlife moves mostly at night. Food plots, water sources and stand preparation are the work of the month.", fishing: "Heat drives fish deep or to current. Night fishing, deep structure and cool tailwaters are where the reliable catches are." },
  { wildlife: "Bachelor groups of bucks are visible and patternable, doves gather on harvested fields, and early seasons begin in some regions.", fishing: "Still hot. Deep and nocturnal patterns continue; catfish stay strong and stripers school in the reservoirs." },
  { wildlife: "The season turns. Early archery, dove and waterfowl activity begins in many regions, elk are bugling in the West, and animals shift to fall food sources.", fishing: "Cooling water pulls fish shallow again. A genuinely good month almost everywhere as fish begin feeding for winter." },
  { wildlife: "Peak fall movement. Rut activity builds through the month in much of the country and pressure from other hunters starts to shape where animals go.", fishing: "The fall feed is on. Bass, walleye and pike chase bait aggressively, and trout in many waters are spawning and should be given room." },
  { wildlife: "The busiest hunting month of the year in most states. Rut activity peaks across much of the whitetail range and daytime movement is at its highest.", fishing: "Cooling fast. Fish are grouped and predictable on deeper structure; fewer bites but often larger fish." },
  { wildlife: "Post-rut and late season. Animals are worn down and food-driven, and cold fronts produce the best movement. Waterfowl hunting is often at its peak.", fishing: "Winter patterns set in. Slow presentations, deep water, and ice fishing where it is safe and legal in northern states." },
];

// Official federal resources — general, nationwide, and all first-party .gov sources.
const ALMANAC_FEDERAL = [
  ["Federal Duck Stamp (USFWS)", "https://www.fws.gov/program/federal-duck-stamp", "Required nationwide for migratory waterfowl hunters 16 and older, in addition to state licenses."],
  ["Hunting & fishing on National Wildlife Refuges (USFWS)", "https://www.fws.gov/refuges/hunting-fishing", "Refuge-specific rules and permits, which are separate from state regulations."],
  ["Recreation.gov", "https://www.recreation.gov", "Permits, reservations and lotteries for federal lands and waters."],
];

// ---------- Astronomy ----------
// Deliberately compact mean-value formulas. Sun times are good to roughly a minute; the moon
// times are an approximation that ignores lunar orbital eccentricity and declination and can be
// off by up to about an hour. The UI says so rather than implying precision the math lacks.

const SYNODIC_MONTH = 29.530588853; // mean days from new moon to new moon
const NEW_MOON_EPOCH = Date.UTC(2000, 0, 6, 18, 14); // a known new moon, UTC
const J1970 = 2440587.5;

const toJulian = (ms) => ms / 86400000 + J1970;
const fromJulian = (j) => (j - J1970) * 86400000;
const deg = Math.PI / 180;

// Sunrise / sunset / solar noon for a calendar day at a point, as absolute UTC instants.
// Standard "sunrise equation" (mean solar time, -0.833° horizon for refraction and solar radius).
function sunTimes(day, lat, lng) {
  const n = Math.round(toJulian(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), 12)) - 2451545.0);
  const jStar = n - lng / 360;
  const m = (357.5291 + 0.98560028 * jStar) % 360;
  const c = 1.9148 * Math.sin(m * deg) + 0.02 * Math.sin(2 * m * deg) + 0.0003 * Math.sin(3 * m * deg);
  const lambda = (m + c + 180 + 102.9372) % 360;
  const jTransit = 2451545.0 + jStar + 0.0053 * Math.sin(m * deg) - 0.0069 * Math.sin(2 * lambda * deg);

  const sinDec = Math.sin(lambda * deg) * Math.sin(23.44 * deg);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosOmega = (Math.sin(-0.833 * deg) - Math.sin(lat * deg) * sinDec) / (Math.cos(lat * deg) * cosDec);
  const solarNoon = fromJulian(jTransit);

  // |cosOmega| > 1 means the sun never rises or never sets that day (high latitudes only).
  if (Math.abs(cosOmega) > 1) return { solarNoon, sunrise: null, sunset: null, polar: cosOmega < -1 ? "up" : "down" };

  const omega = Math.acos(cosOmega) / deg;
  return { solarNoon, sunrise: fromJulian(jTransit - omega / 360), sunset: fromJulian(jTransit + omega / 360), polar: null };
}

const MOON_PHASES = [
  { name: "New Moon", glyph: "🌑" },
  { name: "Waxing Crescent", glyph: "🌒" },
  { name: "First Quarter", glyph: "🌓" },
  { name: "Waxing Gibbous", glyph: "🌔" },
  { name: "Full Moon", glyph: "🌕" },
  { name: "Waning Gibbous", glyph: "🌖" },
  { name: "Last Quarter", glyph: "🌗" },
  { name: "Waning Crescent", glyph: "🌘" },
];

// Moon age, phase and illumination for a calendar day, measured at 12:00 UTC on that day.
function moonInfo(day) {
  const at = Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), 12);
  const elapsed = (at - NEW_MOON_EPOCH) / 86400000;
  const age = ((elapsed % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH;
  const cycle = age / SYNODIC_MONTH; // 0 = new, 0.5 = full
  return {
    age,
    cycle,
    ...MOON_PHASES[Math.floor(cycle * 8 + 0.5) % 8],
    illumination: (1 - Math.cos(2 * Math.PI * cycle)) / 2,
    daysToFull: (SYNODIC_MONTH / 2 - age + SYNODIC_MONTH) % SYNODIC_MONTH,
    daysToNew: (SYNODIC_MONTH - age) % SYNODIC_MONTH,
  };
}

// Solunar periods for a day, derived from the moon's position rather than looked up.
//
// The moon transits (passes overhead) later each day by its elongation from the sun, so the lag
// behind solar noon is a full 24 hours over one lunation: zero at new moon, twelve hours at full.
// Moonrise and moonset are then taken as six hours either side of that transit. Major periods are
// the two hours around overhead and underfoot, minor periods the hour around rise and set.
function solunarPeriods(day, lat, lng, zone) {
  const { solarNoon } = sunTimes(day, lat, lng);
  const { cycle } = moonInfo(day);
  const transit = solarNoon + cycle * 86400000;

  const dayStart = Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()) - zone.offsetMin * 60000;
  // Slide each period into the searched location's own calendar day, so the list reads as "today".
  const intoDay = (ms) => {
    let t = ms;
    while (t < dayStart) t += 86400000;
    while (t >= dayStart + 86400000) t -= 86400000;
    return t;
  };
  const window = (centre, halfMin) => ({ start: centre - halfMin * 60000, end: centre + halfMin * 60000, centre });

  return [
    { kind: "major", label: "Moon overhead", ...window(intoDay(transit), 60) },
    { kind: "major", label: "Moon underfoot", ...window(intoDay(transit + 12 * 3600000), 60) },
    { kind: "minor", label: "Moonrise", ...window(intoDay(transit - 6 * 3600000), 30) },
    { kind: "minor", label: "Moonset", ...window(intoDay(transit + 6 * 3600000), 30) },
  ].sort((a, b) => a.start - b.start);
}

// The common solunar convention that new and full moons are the strongest days. Presented as a
// convention, not a forecast — there is no official source that rates a day for game movement.
function solunarRating(moon) {
  const strength = Math.abs(Math.cos(2 * Math.PI * moon.cycle)); // 1 at new/full, 0 at the quarters
  if (strength > 0.85) return { label: "Peak", detail: "Near a new or full moon — traditionally the strongest days." };
  if (strength > 0.55) return { label: "Strong", detail: "Building toward a new or full moon." };
  if (strength > 0.25) return { label: "Moderate", detail: "Between the quarter and the new or full moon." };
  return { label: "Quiet", detail: "Near a quarter moon — traditionally the weakest days." };
}

// ---------- Time zone ----------
// Sun and moon times belong to the searched city, not to the browser. When the NWS point lookup
// succeeds it hands back an IANA zone and Intl does the rest, daylight saving included. Without
// it we fall back to a longitude-derived offset, which the UI then labels as solar time.
function tzOffsetMinutes(ms, tz) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return Math.round((asUtc - ms) / 60000);
}

function zoneFor(center, weather) {
  const now = Date.now();
  if (weather?.timeZone) {
    try {
      return { tz: weather.timeZone, offsetMin: tzOffsetMinutes(now, weather.timeZone), exact: true };
    } catch {
      // An unrecognised zone id — fall through to the longitude estimate rather than throw.
    }
  }
  return { tz: null, offsetMin: Math.round(center[1] / 15) * 60, exact: false };
}

function formatClock(ms, zone) {
  if (ms == null) return "—";
  const opts = { hour: "numeric", minute: "2-digit" };
  return zone.tz
    ? new Date(ms).toLocaleTimeString("en-US", { ...opts, timeZone: zone.tz })
    : new Date(ms + zone.offsetMin * 60000).toLocaleTimeString("en-US", { ...opts, timeZone: "UTC" });
}

function formatSpan(start, end, zone) {
  return `${formatClock(start, zone)} – ${formatClock(end, zone)}`;
}

// ---------- Weather fetching ----------
// Keyed on the search centre so the repeated refreshAll() calls behind every filter change
// re-render from cache instead of re-hitting api.weather.gov.
const almanacState = { key: null, status: "idle", weather: null, error: null };

const weatherKey = (center) => `${center[0].toFixed(3)},${center[1].toFixed(3)}`;

function ensureWeather(center) {
  const key = weatherKey(center);
  if (almanacState.key === key) return;
  almanacState.key = key;
  almanacState.status = "loading";
  almanacState.weather = null;
  almanacState.error = null;

  fetchWeather(center)
    .then((weather) => {
      // A newer search may have started while this was in flight; only the current key may paint.
      if (almanacState.key !== key) return;
      almanacState.status = "ready";
      almanacState.weather = weather;
    })
    .catch((err) => {
      if (almanacState.key !== key) return;
      almanacState.status = "error";
      almanacState.error = err.name === "TimeoutError" ? "timed out" : err.message;
    })
    .finally(() => {
      if (almanacState.key === key) renderAlmanac();
    });
}

// ---------- Section rendering ----------
function almanacStates() {
  const { search, areaStates } = appState;
  const list = (areaStates.length ? areaStates : [search.state]).filter((a) => STATES[a]);
  return list;
}

function overviewSection(zone, sun, moon) {
  const { search } = appState;
  const abbrs = almanacStates();
  const stateNames = abbrs.map((a) => STATES[a].name);
  const places = visiblePlaces().length;
  const scopes = scopesForSearch(search);

  // Only claim something about seasons where this app actually holds transcribed season data.
  let seasonLine;
  if (scopes.length) {
    const scope = SEASON_SCOPES[scopes[0]];
    const openNow = Object.keys(GAME).filter((g) => gameStatus(scopes[0], g, TODAY).kind === "open");
    seasonLine = openNow.length
      ? `<strong>${openNow.map((g) => GAME[g].label).join(", ")}</strong> show as open today in ${escapeHtml(scope.name)}.`
      : `No general seasons show as open today in ${escapeHtml(scope.name)}.`;
    seasonLine += ` <button type="button" class="link-btn" data-almanac-seasons>Open the season calendar</button>`;
  } else {
    seasonLine = stateNames.length
      ? `Season dates for ${escapeHtml(stateNames.join(" and "))} are not carried in this app — use the official links below.`
      : `Search a city to see season guidance for its state.`;
  }

  const dayLength = sun.sunrise != null && sun.sunset != null
    ? `${Math.floor((sun.sunset - sun.sunrise) / 3600000)}h ${Math.round(((sun.sunset - sun.sunrise) % 3600000) / 60000)}m`
    : sun.polar === "up" ? "24h (sun does not set)" : "0h (sun does not rise)";

  return `
    <section class="alm-section">
      <div class="panel-heading">
        <h2>Current Overview <span class="pill">${escapeHtml(search.label)}</span></h2>
        <p class="sub">${formatDay(TODAY, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          · ${stateNames.length ? escapeHtml(stateNames.join(", ")) : "United States"}
          · ${search.radius}-mile search area</p>
      </div>
      <div class="alm-stats">
        <div class="alm-stat"><span class="alm-stat-k">Sunrise</span><span class="alm-stat-v">${formatClock(sun.sunrise, zone)}</span></div>
        <div class="alm-stat"><span class="alm-stat-k">Sunset</span><span class="alm-stat-v">${formatClock(sun.sunset, zone)}</span></div>
        <div class="alm-stat"><span class="alm-stat-k">Daylight</span><span class="alm-stat-v">${dayLength}</span></div>
        <div class="alm-stat"><span class="alm-stat-k">Moon</span><span class="alm-stat-v">${moon.glyph} ${Math.round(moon.illumination * 100)}%</span></div>
        <div class="alm-stat"><span class="alm-stat-k">Public places mapped</span><span class="alm-stat-v">${places}</span></div>
      </div>
      <p class="alm-line">${seasonLine}</p>
      <p class="alm-foot">Times are for ${escapeHtml(search.label)}${zone.exact ? "" : " in approximate local solar time — a time zone could not be confirmed, so they may be off by an hour"}.</p>
    </section>`;
}

function moonSection(zone, moon, periods) {
  const rating = solunarRating(moon);
  const row = (p) => `
    <li class="alm-period ${p.kind}">
      <span class="alm-period-tag">${p.kind === "major" ? "Major" : "Minor"}</span>
      <span class="alm-period-time">${formatSpan(p.start, p.end, zone)}</span>
      <span class="alm-period-label">${escapeHtml(p.label)}</span>
    </li>`;

  return `
    <section class="alm-section">
      <div class="panel-heading">
        <h2>Moon &amp; Solunar</h2>
        <p class="sub">Calculated for this location. Approximate — not an ephemeris.</p>
      </div>
      <div class="alm-moon">
        <span class="alm-moon-glyph" aria-hidden="true">${moon.glyph}</span>
        <div>
          <h3>${escapeHtml(moon.name)}</h3>
          <p>${Math.round(moon.illumination * 100)}% illuminated · day ${Math.floor(moon.age)} of the lunar cycle</p>
          <p class="alm-moon-next">Full moon in ~${Math.round(moon.daysToFull)} day${Math.round(moon.daysToFull) === 1 ? "" : "s"}
            · new moon in ~${Math.round(moon.daysToNew)} day${Math.round(moon.daysToNew) === 1 ? "" : "s"}</p>
        </div>
        <span class="alm-rating" title="${escapeHtml(rating.detail)}">${escapeHtml(rating.label)}</span>
      </div>
      <ul class="alm-periods">${periods.map(row).join("")}</ul>
      <p class="alm-line"><strong>${escapeHtml(rating.label)} day.</strong> ${escapeHtml(rating.detail)}</p>
      <p class="alm-foot">
        Major periods are the two hours around the moon passing overhead and underfoot; minor periods the hour
        around moonrise and moonset. The moon times are estimated from its phase alone, so the minor periods in
        particular can be off by an hour or more. Solunar theory is a long-standing planning convention among
        hunters and anglers, not a scientific prediction of game movement — and no wildlife agency publishes it.
        Weather, pressure and hunting pressure routinely matter more.
      </p>
    </section>`;
}

function guidanceSection() {
  const month = TODAY.getMonth();
  const g = MONTH_GUIDANCE[month];
  const abbrs = almanacStates();
  const region = ALMANAC_REGIONS[REGION_BY_STATE[abbrs[0]]] || null;
  const monthName = formatDay(TODAY, { month: "long" });

  return `
    <section class="alm-section">
      <div class="panel-heading">
        <h2>Seasonal Guidance</h2>
        <p class="sub">${escapeHtml(monthName)}${region ? ` in ${escapeHtml(region.label)}` : ""} — general activity patterns, not regulations.</p>
      </div>
      <div class="alm-cards">
        <article class="alm-card hunting">
          <h3>Wildlife activity</h3>
          <p>${escapeHtml(g.wildlife)}</p>
          ${region ? `<p class="alm-card-note">${escapeHtml(region.rut)}</p>` : ""}
        </article>
        <article class="alm-card fishing">
          <h3>Fishing activity</h3>
          <p>${escapeHtml(g.fishing)}</p>
          ${region ? `<p class="alm-card-note">${escapeHtml(region.waters)}</p>` : ""}
        </article>
      </div>
      <p class="alm-foot">
        These are broad seasonal patterns for ${region ? escapeHtml(region.label) : "the United States"}, written to help
        with planning. They say nothing about what is open, legal or permitted where you are. Check the official
        links below before you go.
      </p>
    </section>`;
}

function weatherSection() {
  const { search } = appState;
  const { status, weather, error } = almanacState;

  let body;
  if (status === "loading") {
    body = `<p class="loading-line"><span class="spinner"></span>Loading the National Weather Service forecast…</p>`;
  } else if (status === "error" || !weather) {
    body = `<p class="notice">Couldn't reach the National Weather Service${error ? ` (${escapeHtml(error)})` : ""}.
      <button type="button" class="link-btn" data-almanac-retry>Try again</button></p>`;
  } else {
    const now = weather.now;
    const cells = now
      ? [
          ["Temperature", `${now.temperature}°${now.temperatureUnit}`],
          ["Conditions", now.shortForecast || "—"],
          ["Wind", `${now.windSpeed || "—"} ${now.windDirection || ""}`.trim()],
          ["Chance of precip.", now.probabilityOfPrecipitation?.value != null ? `${now.probabilityOfPrecipitation.value}%` : "—"],
          ["Humidity", now.relativeHumidity?.value != null ? `${now.relativeHumidity.value}%` : "—"],
        ]
      : [];

    body = `
      ${cells.length ? `<div class="alm-stats">${cells
        .map(([k, v]) => `<div class="alm-stat"><span class="alm-stat-k">${escapeHtml(k)}</span><span class="alm-stat-v">${escapeHtml(v)}</span></div>`)
        .join("")}</div>` : ""}
      ${weather.periods.length ? `<ul class="alm-forecast">${weather.periods
        .map((p) => `<li><strong>${escapeHtml(p.name)}</strong> <span class="alm-temp">${p.temperature}°${escapeHtml(p.temperatureUnit)}</span>
          <span>${escapeHtml(p.detailedForecast || p.shortForecast || "")}</span></li>`)
        .join("")}</ul>` : ""}`;
  }

  return `
    <section class="alm-section">
      <div class="panel-heading">
        <h2>Weather</h2>
        <p class="sub">National Weather Service forecast for ${escapeHtml(weather?.pointName || search.label)}.</p>
      </div>
      ${body}
      <div class="alm-links inline">
        <a href="${escapeHtml(weather?.forecastUrl || "https://www.weather.gov")}" target="_blank" rel="noopener">Full NWS forecast &rarr;</a>
        <a href="https://www.ncei.noaa.gov/access/us-climate-normals/" target="_blank" rel="noopener">NOAA climate normals &rarr;</a>
      </div>
      <p class="alm-foot">
        <strong>Typical averages for this date are not shown.</strong> NOAA publishes 30-year climate normals through
        NCEI, which needs an API token this static site does not carry, so the link above goes to the official tool
        rather than an estimate. Forecast data is live from api.weather.gov, which covers the U.S. only.
      </p>
    </section>`;
}

function resourcesSection() {
  const abbrs = almanacStates();
  const agencyCards = abbrs.flatMap((a) =>
    STATES[a].agencies.map(
      ([name, url]) => `
        <a class="alm-agency" href="${escapeHtml(url)}" target="_blank" rel="noopener">
          <span class="alm-agency-abbr" aria-hidden="true">${escapeHtml(a)}</span>
          <span class="alm-agency-body">
            <strong>${escapeHtml(name)}</strong>
            <span>Licenses, seasons, bag limits and regulations for ${escapeHtml(STATES[a].name)}.</span>
          </span>
          <span class="alm-agency-go" aria-hidden="true">&rarr;</span>
        </a>`
    )
  );

  return `
    <section class="alm-section" id="almanac-official">
      <div class="panel-heading">
        <h2>Official Resources</h2>
        <p class="sub">${abbrs.length > 1
          ? `Your search area crosses ${abbrs.length} states. Each one writes its own rules.`
          : `The authoritative source for everything on this page.`}</p>
      </div>
      ${agencyCards.length
        ? `<div class="alm-agencies">${agencyCards.join("")}</div>`
        : `<p class="notice">Search a U.S. city to see its state wildlife agency.</p>`}
      <h3 class="mini-head">Federal</h3>
      <div class="alm-links">
        ${ALMANAC_FEDERAL.map(
          ([name, url, detail]) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">
            <strong>${escapeHtml(name)}</strong><span>${escapeHtml(detail)}</span></a>`
        ).join("")}
      </div>
    </section>`;
}

// ---------- Entry points ----------
function renderAlmanac() {
  const root = document.getElementById("almanac-body");
  if (!root) return;

  const { search } = appState;
  ensureWeather(search.center);

  const zone = zoneFor(search.center, almanacState.weather);
  const sun = sunTimes(TODAY, search.center[0], search.center[1]);
  const moon = moonInfo(TODAY);
  const periods = solunarPeriods(TODAY, search.center[0], search.center[1], zone);

  root.innerHTML =
    overviewSection(zone, sun, moon) +
    moonSection(zone, moon, periods) +
    guidanceSection() +
    weatherSection() +
    resourcesSection();
}

function initAlmanac() {
  document.getElementById("almanac-disclaimer").textContent = ALMANAC_DISCLAIMER;

  document.getElementById("almanac-body").addEventListener("click", (e) => {
    if (e.target.closest("[data-almanac-retry]")) {
      almanacState.key = null; // force ensureWeather() to re-fetch the same centre
      return renderAlmanac();
    }
    if (e.target.closest("[data-almanac-seasons]")) {
      setView("map");
      setTab("seasons");
    }
  });
}
