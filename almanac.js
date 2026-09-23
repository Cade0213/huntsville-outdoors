// Almanac tab: a general-guidance companion to the map, keyed to whatever city is searched.
//
// Reads `appState.search` / `appState.areaStates` (script.js). Nothing runs at load — script.js
// calls initAlmanac(), which builds the tab's shell and controls ONCE. renderAlmanac() then only
// fills the location- and weather-dependent parts, and it has three callers that can fire while
// someone is mid-interaction: refreshAll() (every Map-tab filter change), script.js once the
// search area's states resolve, and ensureWeather() when the NWS response lands. Because the day
// slider, outlook grid and month chips live in the shell, none of those re-renders touch them.
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
// UI state that survives every renderAlmanac(). `offset` is days after TODAY (so ?date= still
// works); `month` is null while the guidance follows the selected day, else a month the user picked.
const ALMANAC_DAYS = 30;
const almanacUi = { offset: 0, month: null };

const $a = (id) => document.getElementById(id);

function almanacStates() {
  const { search, areaStates } = appState;
  const list = (areaStates.length ? areaStates : [search.state]).filter((a) => STATES[a]);
  return list;
}

function almanacDay(offset = almanacUi.offset) {
  return new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + offset);
}

// zoneFor() measures the UTC offset at this moment. A day on the far side of a daylight-saving
// change needs its own offset, or solunar windows land an hour off when bucketed into the day.
function zoneForDay(zone, day) {
  if (!zone.tz) return zone;
  try {
    return { ...zone, offsetMin: tzOffsetMinutes(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), 12), zone.tz) };
  } catch {
    return zone;
  }
}

// True only on the one calendar day nearest the exact full / new moon, so the outlook, the jump
// buttons and the "full moon in ~N days" figure all agree (the 8-way phase name spans ~3 days).
const nearFull = (m) => Math.min(m.daysToFull, SYNODIC_MONTH - m.daysToFull) < 0.5;
const nearNew = (m) => Math.min(m.daysToNew, SYNODIC_MONTH - m.daysToNew) < 0.5;

function dayLabel(offset, opts = { weekday: "short", month: "short", day: "numeric" }) {
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  return formatDay(almanacDay(offset), opts);
}

// Moon drawn from its cycle position: a dark disc, then the lit part bounded by the limb on one
// side and the terminator (an ellipse of half-width r·|cos 2πc|) on the other.
function moonSvg(cycle, size) {
  const r = size / 2 - 1, c = size / 2;
  const k = Math.cos(2 * Math.PI * cycle); // 1 at new, −1 at full
  const waxing = cycle < 0.5;
  const rx = Math.abs(k) * r;
  const outer = waxing ? 1 : 0;
  const inner = waxing ? (k > 0 ? 0 : 1) : (k > 0 ? 1 : 0);
  const lit = cycle < 0.01 || cycle > 0.99 ? "" :
    `<path d="M${c},${c - r} A${r},${r} 0 0 ${outer} ${c},${c + r} A${rx.toFixed(2)},${r} 0 0 ${inner} ${c},${c - r}Z" class="lit"/>`;
  return `<svg class="alm-moon-svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
    <circle cx="${c}" cy="${c}" r="${r}" class="dark"/>${lit}</svg>`;
}

// ---------- Shell (built once) ----------
function almanacShell() {
  const ticks = [0, 7, 14, 21, 29];
  const outlook = Array.from({ length: ALMANAC_DAYS }, (_, i) => {
    const day = almanacDay(i);
    const moon = moonInfo(day);
    const rating = solunarRating(moon);
    const phaseTag = nearFull(moon) ? "Full" : nearNew(moon) ? "New" : "";
    return `
      <button type="button" class="alm-od ${rating.label.toLowerCase()}" data-offset="${i}" aria-pressed="false"
        aria-label="${escapeHtml(formatDay(day, { weekday: "long", month: "long", day: "numeric" }))}: ${escapeHtml(moon.name)}, ${escapeHtml(rating.label)} solunar day">
        <span class="alm-od-dow">${i === 0 ? "Today" : formatDay(day, { weekday: "short" })}</span>
        ${moonSvg(moon.cycle, 26)}
        <span class="alm-od-num">${day.getDate()}</span>
        <span class="alm-od-tag">${phaseTag || rating.label}</span>
      </button>`;
  }).join("");

  return `
    <section class="bg-focus alm-hero" aria-label="Selected day">
      <div>
        <span class="bg-k" id="alm-where"></span>
        <div class="alm-hero-head">
          <span class="alm-hero-moon" id="alm-hero-moon"></span>
          <div>
            <h2 id="alm-hero-date"></h2>
            <p id="alm-hero-moon-line"></p>
          </div>
        </div>
        <div class="bg-focus-stats alm-hero-stats" id="alm-hero-stats"></div>
      </div>
      <div class="bg-range">
        <label for="alm-day" class="bg-range-label">
          <span>Plan a day</span>
          <output id="alm-day-out" for="alm-day"></output>
        </label>
        <input type="range" id="alm-day" min="0" max="${ALMANAC_DAYS - 1}" step="1" value="0" />
        <div class="bg-ticks" aria-hidden="true">${ticks.map((t) => `<span>${t === 0 ? "Today" : `+${t}d`}</span>`).join("")}</div>
        <div class="bg-presets" role="group" aria-label="Jump to a day">
          <button type="button" class="bg-chip" data-jump="today">Today</button>
          <button type="button" class="bg-chip" data-jump="peak">Next peak day</button>
          <button type="button" class="bg-chip" data-jump="full">Full moon</button>
          <button type="button" class="bg-chip" data-jump="new">New moon</button>
        </div>
        <p class="bg-live" id="alm-live" aria-live="polite"></p>
      </div>
    </section>

    <section class="bg-section" aria-labelledby="alm-glance-h">
      <div class="panel-heading">
        <h2 id="alm-glance-h">Day at a glance</h2>
        <p class="sub" id="alm-glance-sub"></p>
      </div>
      <div class="alm-dial-wrap">
        <div class="alm-dial" id="alm-dial"></div>
        <div class="alm-dial-read" id="alm-dial-read" aria-hidden="true"></div>
      </div>
      <div class="alm-dial-axis" aria-hidden="true"><span>12 AM</span><span>6 AM</span><span>Noon</span><span>6 PM</span><span>12 AM</span></div>
      <ul class="alm-dial-key" aria-label="Key">
        <li><span class="k-major"></span>Major period</li>
        <li><span class="k-minor"></span>Minor period</li>
        <li><span class="k-now"></span>Now</li>
      </ul>
      <ul class="alm-periods" id="alm-periods"></ul>
      <p class="alm-line" id="alm-rating-line"></p>
      <p class="alm-foot">
        Major periods are the two hours around the moon passing overhead and underfoot; minor periods the hour
        around moonrise and moonset. The moon times are estimated from its phase alone, so the minor periods in
        particular can be off by an hour or more. Solunar theory is a long-standing planning convention among
        hunters and anglers, not a scientific prediction of game movement — and no wildlife agency publishes it.
        Weather, pressure and hunting pressure routinely matter more.
      </p>
    </section>

    <section class="bg-section" aria-labelledby="alm-outlook-h">
      <div class="panel-heading">
        <h2 id="alm-outlook-h">30-day moon outlook</h2>
        <p class="sub">Tap a day to plan it. Ratings follow the solunar convention that new and full moons are
          strongest — a tradition, not a forecast of game movement.</p>
      </div>
      <div class="alm-outlook" id="alm-outlook" role="group" aria-label="Choose a day">${outlook}</div>
    </section>

    <div class="bg-grid alm-grid">
      <div id="alm-overview"></div>
      <div id="alm-weather"></div>
    </div>

    <section class="bg-section" aria-labelledby="alm-guide-h">
      <div class="panel-heading">
        <h2 id="alm-guide-h">Seasonal guidance</h2>
        <p class="sub" id="alm-guide-sub"></p>
      </div>
      <div class="alm-months" id="alm-months" role="group" aria-label="Choose a month">
        ${Array.from({ length: 12 }, (_, m) => `<button type="button" class="alm-mo" data-month="${m}" aria-pressed="false">${
          formatDay(new Date(2000, m, 1), { month: "short" })}</button>`).join("")}
      </div>
      <div class="alm-cards" id="alm-guide-cards"></div>
      <p class="alm-foot" id="alm-guide-foot"></p>
    </section>

    <div id="alm-official"></div>`;
}

// ---------- Day-dependent parts ----------
function renderAlmanacDay() {
  if (!$a("alm-day")) return;
  const { search } = appState;
  const offset = almanacUi.offset;
  const day = almanacDay(offset);
  const zone = zoneForDay(zoneFor(search.center, almanacState.weather), day);
  const sun = sunTimes(day, search.center[0], search.center[1]);
  const moon = moonInfo(day);
  const rating = solunarRating(moon);
  const periods = solunarPeriods(day, search.center[0], search.center[1], zone);
  const longDate = formatDay(day, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const dayLength = sun.sunrise != null && sun.sunset != null
    ? `${Math.floor((sun.sunset - sun.sunrise) / 3600000)}h ${Math.round(((sun.sunset - sun.sunrise) % 3600000) / 60000)}m`
    : sun.polar === "up" ? "24h (sun does not set)" : "0h (sun does not rise)";

  // Hero.
  $a("alm-where").textContent = `Almanac · ${search.label}`;
  $a("alm-hero-date").textContent = offset === 0 ? `Today, ${formatDay(day, { month: "long", day: "numeric" })}` : longDate;
  $a("alm-hero-moon").innerHTML = moonSvg(moon.cycle, 64);
  $a("alm-hero-moon-line").innerHTML =
    `${escapeHtml(moon.name)} · ${Math.round(moon.illumination * 100)}% lit · <span class="alm-rating">${escapeHtml(rating.label)} solunar day</span>`;
  $a("alm-hero-stats").innerHTML = [
    ["Sunrise", formatClock(sun.sunrise, zone)],
    ["Sunset", formatClock(sun.sunset, zone)],
    ["Daylight", dayLength],
  ].map(([k, v]) => `<div><span class="bg-k">${k}</span><span class="bg-v">${escapeHtml(v)}</span></div>`).join("");

  const slider = $a("alm-day");
  slider.value = String(offset);
  slider.style.setProperty("--pct", `${(offset / (ALMANAC_DAYS - 1)) * 100}%`);
  slider.setAttribute("aria-valuetext", longDate);
  $a("alm-day-out").textContent = dayLabel(offset);
  $a("alm-live").textContent = `${longDate}: ${moon.name}, ${rating.label.toLowerCase()} solunar day, sunrise ${formatClock(sun.sunrise, zone)}.`;
  document.querySelectorAll("[data-jump]").forEach((b) => b.classList.toggle("is-on", b.dataset.jump === "today" && offset === 0));

  // Outlook selection.
  document.querySelectorAll("#alm-outlook .alm-od").forEach((b) =>
    b.setAttribute("aria-pressed", String(Number(b.dataset.offset) === offset)));

  // Dial.
  $a("alm-glance-sub").textContent =
    `${dayLabel(offset, { weekday: "long", month: "long", day: "numeric" })} in ${search.label}. Hover or touch the bar to read any time.`;
  renderAlmanacDial(day, zone, sun, periods, offset);

  const row = (p) => `
    <li class="alm-period ${p.kind}">
      <span class="alm-period-tag">${p.kind === "major" ? "Major" : "Minor"}</span>
      <span class="alm-period-time">${formatSpan(p.start, p.end, zone)}</span>
      <span class="alm-period-label">${escapeHtml(p.label)}</span>
    </li>`;
  $a("alm-periods").innerHTML = periods.map(row).join("");
  $a("alm-rating-line").innerHTML = `<strong>${escapeHtml(rating.label)} day.</strong> ${escapeHtml(rating.detail)}`;

  renderAlmanacOverview(day, zone, sun, moon, offset);
  renderAlmanacGuidance();
}

// 24-hour bar for the selected day in the searched location's own time: night, twilight and day
// as a gradient, solunar windows as blocks, and a "now" marker when the day is today.
function renderAlmanacDial(day, zone, sun, periods, offset) {
  const dayStart = Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()) - zone.offsetMin * 60000;
  const pct = (ms) => Math.min(100, Math.max(0, ((ms - dayStart) / 86400000) * 100));
  const TW = 35 / 1440 * 100; // ~35 min of twilight each side, for the gradient only

  let bg;
  if (sun.sunrise == null || sun.sunset == null) {
    bg = sun.polar === "up" ? "var(--alm-day)" : "var(--alm-night)";
  } else {
    const r = pct(sun.sunrise), st = pct(sun.sunset);
    bg = `linear-gradient(90deg, var(--alm-night) ${Math.max(0, r - TW)}%, var(--alm-dawn) ${r}%, var(--alm-day) ${Math.min(100, r + TW)}%,
      var(--alm-day) ${Math.max(0, st - TW)}%, var(--alm-dawn) ${st}%, var(--alm-night) ${Math.min(100, st + TW)}%)`;
  }

  const blocks = periods.map((p) => {
    const a = pct(p.start), b = pct(p.end);
    return `<span class="alm-dial-p ${p.kind}" style="left:${a}%;width:${Math.max(0.6, b - a)}%"
      title="${escapeHtml(`${p.label}: ${formatSpan(p.start, p.end, zone)}`)}"></span>`;
  }).join("");

  const sunMarks = [["Sunrise", sun.sunrise], ["Sunset", sun.sunset]]
    .filter(([, t]) => t != null)
    .map(([label, t]) => `<span class="alm-dial-sun" style="left:${pct(t)}%"><em>${label} ${formatClock(t, zone)}</em></span>`).join("");

  const now = Date.now();
  const nowMark = offset === 0 && now >= dayStart && now < dayStart + 86400000
    ? `<span class="alm-dial-now" style="left:${pct(now)}%"></span>` : "";

  const dial = $a("alm-dial");
  dial.style.background = bg;
  dial.innerHTML = blocks + sunMarks + nowMark;
  dial.dataset.start = String(dayStart);
  dial._ctx = { zone, sun, periods };
}

function almanacDialPointer(e) {
  const dial = $a("alm-dial");
  const read = $a("alm-dial-read");
  if (!dial._ctx || e.type === "pointerleave") { read.hidden = true; return; }
  const box = dial.getBoundingClientRect();
  const f = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
  const t = Number(dial.dataset.start) + f * 86400000;
  const { zone, sun, periods } = dial._ctx;
  const light = sun.sunrise == null || sun.sunset == null
    ? (sun.polar === "up" ? "Daylight" : "Dark")
    : t >= sun.sunrise && t <= sun.sunset ? "Daylight" : "Dark";
  const inPeriod = periods.find((p) => t >= p.start && t <= p.end);
  read.innerHTML = `<strong>${formatClock(t, zone)}</strong> ${light}${inPeriod ? ` · <b class="${inPeriod.kind}">${escapeHtml(inPeriod.label)}</b>` : ""}`;
  read.hidden = false;
  read.style.left = `${Math.min(box.width - read.offsetWidth, Math.max(0, f * box.width - read.offsetWidth / 2))}px`;
}

function renderAlmanacOverview(day, zone, sun, moon, offset) {
  const root = $a("alm-overview");
  if (!root) return;
  const { search } = appState;
  const abbrs = almanacStates();
  const stateNames = abbrs.map((a) => STATES[a].name);
  const places = visiblePlaces().length;
  const scopes = scopesForSearch(search);
  const when = offset === 0 ? "today" : `on ${formatDay(day, { weekday: "short", month: "short", day: "numeric" })}`;

  // Only claim something about seasons where this app actually holds transcribed season data.
  let seasonLine;
  if (scopes.length) {
    const scope = SEASON_SCOPES[scopes[0]];
    const openNow = Object.keys(GAME).filter((g) => gameStatus(scopes[0], g, day).kind === "open");
    seasonLine = openNow.length
      ? `<strong>${openNow.map((g) => GAME[g].label).join(", ")}</strong> show as open ${when} in ${escapeHtml(scope.name)}.`
      : `No general seasons show as open ${when} in ${escapeHtml(scope.name)}.`;
    seasonLine += ` <button type="button" class="link-btn" data-almanac-seasons>Open the season calendar</button>`;
  } else {
    seasonLine = stateNames.length
      ? `Season dates for ${escapeHtml(stateNames.join(" and "))} are not carried in this app — use the official links below.`
      : `Search a city to see season guidance for its state.`;
  }

  root.innerHTML = `
    <section class="bg-section">
      <div class="panel-heading">
        <h2>Around ${escapeHtml(search.label)}</h2>
        <p class="sub">${stateNames.length ? escapeHtml(stateNames.join(", ")) : "United States"} · ${search.radius}-mile search area</p>
      </div>
      <div class="alm-stats">
        <div class="alm-stat"><span class="alm-stat-k">Moon</span><span class="alm-stat-v">${Math.round(moon.illumination * 100)}% · day ${Math.floor(moon.age)}</span></div>
        <div class="alm-stat"><span class="alm-stat-k">Full moon</span><span class="alm-stat-v">in ~${Math.round(moon.daysToFull)} day${Math.round(moon.daysToFull) === 1 ? "" : "s"}</span></div>
        <div class="alm-stat"><span class="alm-stat-k">New moon</span><span class="alm-stat-v">in ~${Math.round(moon.daysToNew)} day${Math.round(moon.daysToNew) === 1 ? "" : "s"}</span></div>
        <div class="alm-stat"><span class="alm-stat-k">Public places mapped</span><span class="alm-stat-v">${places}</span></div>
      </div>
      <p class="alm-line">${seasonLine}</p>
      <p class="alm-foot">Times are for ${escapeHtml(search.label)}${zone.exact ? "" : " in approximate local solar time — a time zone could not be confirmed, so they may be off by an hour"}.
        Moon figures are calculated here and approximate — not an ephemeris.</p>
    </section>`;
}

function renderAlmanacGuidance() {
  const month = almanacUi.month ?? almanacDay().getMonth();
  const g = MONTH_GUIDANCE[month];
  const abbrs = almanacStates();
  const region = ALMANAC_REGIONS[REGION_BY_STATE[abbrs[0]]] || null;
  const monthName = formatDay(new Date(2000, month, 1), { month: "long" });

  document.querySelectorAll("#alm-months .alm-mo").forEach((b) => {
    const m = Number(b.dataset.month);
    b.setAttribute("aria-pressed", String(m === month));
    b.classList.toggle("is-now", m === TODAY.getMonth());
  });
  $a("alm-guide-sub").textContent =
    `${monthName}${region ? ` in ${region.label}` : ""} — general activity patterns, not regulations.` +
    (almanacUi.month == null ? " Follows the day you're planning; tap a month to look ahead." : "");
  $a("alm-guide-cards").innerHTML = `
    <article class="alm-card hunting">
      <h3>Wildlife activity</h3>
      <p>${escapeHtml(g.wildlife)}</p>
      ${region ? `<p class="alm-card-note">${escapeHtml(region.rut)}</p>` : ""}
    </article>
    <article class="alm-card fishing">
      <h3>Fishing activity</h3>
      <p>${escapeHtml(g.fishing)}</p>
      ${region ? `<p class="alm-card-note">${escapeHtml(region.waters)}</p>` : ""}
    </article>`;
  $a("alm-guide-foot").textContent =
    `These are broad seasonal patterns for ${region ? region.label : "the United States"}, written to help with planning. ` +
    "They say nothing about what is open, legal or permitted where you are. Check the official links below before you go.";
}

// Weather is only ever the CURRENT forecast from today — it never follows the day slider.
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
      ${weather.periods.length ? `<div class="alm-fc-list">${weather.periods
        .map((p, i) => `<details class="alm-fc ${p.isDaytime === false ? "night" : "day"}"${i === 0 ? " open" : ""}>
          <summary><strong>${escapeHtml(p.name)}</strong><span class="alm-temp">${p.temperature}°${escapeHtml(p.temperatureUnit)}</span>
            <span class="alm-fc-short">${escapeHtml(p.shortForecast || "")}</span></summary>
          <p>${escapeHtml(p.detailedForecast || p.shortForecast || "")}</p>
        </details>`)
        .join("")}</div>` : ""}`;
  }

  return `
    <section class="bg-section">
      <div class="panel-heading">
        <h2>Weather</h2>
        <p class="sub">Current National Weather Service forecast for ${escapeHtml(weather?.pointName || search.label)} —
          from today, whatever day you're planning above.</p>
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
    <section class="bg-section" id="almanac-official">
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
// Fills only the location- and weather-dependent containers; see the header comment for callers.
function renderAlmanac() {
  if (!$a("alm-day")) return;
  ensureWeather(appState.search.center);
  $a("alm-weather").innerHTML = weatherSection();
  $a("alm-official").innerHTML = resourcesSection();
  renderAlmanacDay();
}

function setAlmanacDay(offset) {
  almanacUi.offset = Math.min(ALMANAC_DAYS - 1, Math.max(0, offset));
  renderAlmanacDay();
}

// First day in the outlook window (after the selected one, wrapping to the start) matching `test`.
function findAlmanacDay(test) {
  for (let i = 1; i <= ALMANAC_DAYS; i++) {
    const o = (almanacUi.offset + i) % ALMANAC_DAYS;
    if (test(moonInfo(almanacDay(o)))) return o;
  }
  return almanacUi.offset;
}

function initAlmanac() {
  $a("almanac-disclaimer").textContent = ALMANAC_DISCLAIMER;
  const root = $a("almanac-body");
  root.innerHTML = almanacShell();

  let raf = 0;
  $a("alm-day").addEventListener("input", (e) => {
    almanacUi.offset = Number(e.target.value);
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(renderAlmanacDay);
  });

  const dial = $a("alm-dial");
  dial.addEventListener("pointermove", almanacDialPointer);
  dial.addEventListener("pointerdown", almanacDialPointer); // a tap on touch screens
  dial.addEventListener("pointerleave", almanacDialPointer);
  $a("alm-dial-read").hidden = true;

  root.addEventListener("click", (e) => {
    if (e.target.closest("[data-almanac-retry]")) {
      almanacState.key = null; // force ensureWeather() to re-fetch the same centre
      return renderAlmanac();
    }
    if (e.target.closest("[data-almanac-seasons]")) {
      setView("map");
      setTab("seasons");
      return;
    }
    const od = e.target.closest("[data-offset]");
    if (od) return setAlmanacDay(Number(od.dataset.offset));
    const jump = e.target.closest("[data-jump]");
    if (jump) {
      const k = jump.dataset.jump;
      if (k === "today") return setAlmanacDay(0);
      if (k === "peak") return setAlmanacDay(findAlmanacDay((m) => solunarRating(m).label === "Peak"));
      if (k === "full") return setAlmanacDay(findAlmanacDay(nearFull));
      if (k === "new") return setAlmanacDay(findAlmanacDay(nearNew));
    }
    const mo = e.target.closest("[data-month]");
    if (mo) {
      const m = Number(mo.dataset.month);
      // Tapping the month already shown hands control back to the day slider.
      almanacUi.month = almanacUi.month === m ? null : m;
      renderAlmanacGuidance();
    }
  });
}
