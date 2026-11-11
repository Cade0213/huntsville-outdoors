# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page static site that maps public hunting and fishing land near any U.S. city, plus a
second tab listing hunting draw deadlines. There is **no build system, no package manager, no
bundler, no test suite, and no `package.json`**. `index.html` loads plain `<script>` tags and
Leaflet from a CDN. Editing a file and reloading the browser is the whole dev loop.

## Running and checking work

```bash
# Serve it (any static server works; the app also runs from file://)
python3 -m http.server 8777
```

Chrome caches `script.js` hard enough that a normal reload can keep running old code — this has
produced false "the fix didn't work" results. When a change doesn't seem to take effect, either
hard-reload (Cmd+Shift+R) or serve with no-store headers:

```python
# /tmp/nocache_server.py
import http.server, os
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        super().end_headers()
os.chdir("/path/to/repo"); http.server.ThreadingHTTPServer(("127.0.0.1", 8788), H).serve_forever()
```

There is no linter or test runner. **Node is not installed on this machine**, but macOS ships
JavaScriptCore, which is enough for a syntax check:

```bash
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
$JSC -e "try { new Function(readFile('script.js')); print('OK') } catch(e) { print('FAIL '+e) }"
```

Verification is done by driving the real page in a browser and asserting against live state
(`appState`, `visiblePlaces()`, computed styles, `getBoundingClientRect()`), not by unit tests.

Useful URL parameters for manual testing:
- `?q=&lat=&lng=&st=&r=` — restores a search (`r` must be 10, 25, 50 or 100).
- `&p=<place id>` — opens that place once the search has loaded it (what the Share button copies).
- `?view=draws|almanac|calibers|archery` — opens on that section.
- `?date=YYYY-MM-DD` — overrides `TODAY` in `seasons.js` to preview season status on another day.

The site has a light and a dark theme and follows the OS setting until the visitor uses the toggle,
so check a visual change in both. In DevTools: Rendering → "Emulate CSS media feature
prefers-color-scheme", or set `document.documentElement.dataset.theme` to `"light"` / `"dark"`.

## Architecture

### Everything is a global, and load order is load-bearing

No modules. Every top-level `const` and `function` lands in the shared global scope, so the
`<script>` order in `index.html` is a real dependency graph:

```
ui.js → states.js → seasons.js → data.js → coverage.js → live.js → resources.js → calendar.js → almanac.js → calibers.js → archery.js → script.js
      → draws-data.js → draws.js
```

- `ui.js` is first and depends on nothing: icons (`icon()`), storage helpers, the theme toggle,
  toasts, `bindTabKeys()`, and the recent-search / saved-place lists. It runs `hydrateIcons()` and
  `initTheme()` at load, which only touch markup that is already in the page.
- `data.js` references `SEASON_SCOPES` from `seasons.js`, so it must come after it.
- `coverage.js` references `LOCATIONS` and `HUNTSVILLE` from `data.js`, so it must come after it.
- `almanac.js` sits **before** `script.js`, like `calendar.js` and `resources.js`: it defines
  `renderAlmanac()` / `initAlmanac()` for `refreshAll()` and the start block to call, and runs
  nothing at load. Keep it that way — a top-level call there would hit `escapeHtml`/`appState`
  before `script.js` has defined them.
- **The Draws, Almanac and Calibers tabs build their shell once and update in place.** Controls
  (sliders, chips, expanded rows) live in markup that is never re-rendered, and UI state lives in
  `drawFilters`/`drawUi`, `almanacUi` and `bgState`. `renderAlmanac()` has four callers that can
  fire mid-interaction — `refreshAll()`, script.js after the area's states resolve,
  `ensureWeather()` when NWS answers, and `ensureLive()` when water or wildfire data lands — so it only refills the location- and weather-dependent
  containers. Don't add a whole-body `innerHTML` re-render to any of these tabs.
- `calibers.js` follows the same rule: `initCalibers()` is called from script.js's start block,
  and `renderCalibers()` from `refreshAll()` only refreshes its official-links section, so a
  new search never re-renders (and resets) the slider or compare state.
- `archery.js` is the same shape and sits right after `calibers.js`, because it reuses
  `BG_PHOTOS`, `bgPhoto` and `bgSizeDots` from it. `initArchery()` is called from script.js's start
  block; `renderArchery()` from `refreshAll()` only refreshes its official-links section.
- **`draws.js` must stay after `script.js`** — it uses `escapeHtml`, `restoreSplit` and `map`,
  all defined there. Moving it earlier throws a ReferenceError at load.
- `script.js` ends with top-level `initCalendar(); initAlmanac(); initCalibers(); initArchery();`, then `runSearch(...)` if the URL
  carries a search, else `refreshAll()`. With no search, `appState.search` is `null` and every renderer shows a
  "search a location" empty state. `draws.js` ends with `initDraws()`. There is no single entry point.

### File roles

| File | Role |
|---|---|
| `ui.js` | Shared helpers with no dependencies: icons, `localStorage` wrappers, theme, toasts, tab arrow keys, recent searches, saved places |
| `script.js` | App shell: `appState`, Leaflet map, search, welcome panel, results list, detail card, panel tabs, resizable split, phone sheet |
| `live.js` | All network I/O (PAD-US, TIGERweb, Photon/Nominatim, Overpass, NWS weather and alerts, USGS gauges, NOAA tides, NIFC wildfires, USFS MVUM) + geometry math |
| `data.js` | Hand-written curated Huntsville places (`LOCATIONS`) |
| `seasons.js` | Alabama season dates, `GAME`, and the shared date helpers (`parseDay`, `TODAY`, `daysBetween`, `formatDay`) |
| `coverage.js` | `DETAIL_AREAS`, `STATE_LAYERS` (official state agency GIS layers, e.g. Montana FWP) and `coverageLevel()` |
| `calendar.js` | Season calendar tab; reads `appState` |
| `resources.js` | Licenses & gear tab; reads `appState` |
| `states.js` | Per-state agency links |
| `draws-data.js` / `draws.js` | Hunting Draws dataset / its UI (tile map, month bars, pinned plan), plus top-level view switching |
| `almanac.js` | Almanac tab: sun/moon/solunar math, 30-day day planner, general seasonal guidance, NWS weather, official links |
| `calibers.js` | Big Game & Calibers tab: species picker, distance slider, cartridge energy lineup, compare chart |
| `archery.js` | Archery tab: shot placement by angle, broadhead fit, pin gaps / sight picture, practice drill |

`appState` in `script.js` is the shared mutable store; `calendar.js`, `resources.js` and
`almanac.js` read it directly. `refreshAll()` re-renders everything that depends on it.

### Two tab systems — do not mix them

- **Top-level views**: `.site-tab` + `.view` with `data-view`, switched by `setView()` in
  `draws.js`. Map Locator vs Hunting Draws vs Almanac vs Big Game & Calibers vs Archery. `setView()` is generic over
  `.view[data-view]`, so adding a section needs no change there.
- **Panel tabs inside Map Locator**: `.tab` + `.tab-panel` with `data-tab`, switched by
  `setTab()` in `script.js`.

`script.js` binds `document.querySelectorAll(".tab")` globally. **Reusing `.tab` or `.tab-panel`
for anything new will hijack the panel tabs.** Same for the ids `calendar.js` owns by name
(`#month-grid`, `#cal-*`, `.month-grid`, `.cal-legend`).

`setView("map")` must call `restoreSplit()` and `map.invalidateSize()`, because `#app` is
`display:none` while the Draws tab is showing and Leaflet loses its size.

Both tab strips use a roving tabindex (only the selected tab is in the Tab order), so each needs
its `bindTabKeys()` call or the other tabs cannot be reached from the keyboard.

### Map Locator states

- **No search yet**: `renderList()` keeps `body.no-search` in step with `appState.search`. CSS uses
  that one class to show the welcome panel and hide the filters, list and map key. Don't add a
  second flag.
- **With a search**: the area card (`.area-card`) shows the label, the result count and four
  condition tiles. `renderConditions()` fills the tiles from `almanacState` and is called at the
  end of `renderAlmanac()`, so it follows the same weather fetch — it never fetches on its own.
- **A place to open later**: `pendingPlaceId` (set from `?p=` or a saved place) is resolved by
  `resolvePendingPlace()` after each data source lands. It waits for PAD-US *and* the state layers,
  because a PAD-US parcel can still be swapped for its agency twin under a different id.
- **Phones**: the panel is a sheet with three heights in `data-sheet` on `#app` (`map`, `split`,
  `list`), laid out in CSS and set only through `setSheet()`.

### Search radius semantics

The radius is enforced in **`visiblePlaces()`**, not in `curatedPlaces()`. `curatedPlaces()`
deliberately keeps every hand-checked place and only flags `outsideRadius`, because
`mergeLands()` may later swap a rough placeholder outline for the real PAD-US boundary and
recompute the distance — filtering earlier would use the wrong number.

Two distances matter and are easy to confuse:
- `place.distanceMi` — straight-line to the *nearest edge* of a polygon. This is what the radius
  filter uses, and it is correct for "is any of this land within N miles".
- `markerPoint(place)` in `script.js` — where the dot is drawn. A large parcel can reach into the
  radius while its interior centre sits far outside it, so when that happens the marker anchors to
  the nearest boundary point instead. Polygon *outlines* legitimately extend past the search
  circle; only markers and the list are radius-constrained.

### Map rendering

Markers and polygons use exactly two colours: orange (`--hunting`) for anything huntable, blue
(`--fishing`) otherwise, via `activityKey()`. There is no third "both" colour.

Selecting or hovering a place restyles only that place's layers through `emphasizePlace()`.
`renderMapLayers()` rebuilds every layer and is for when the *set* of places changes (new data, a
filter); the name filter debounces it. Don't call it for a selection change.

PAD-US boundary fidelity is tuned by two params in `fetchPublicLands()` (`live.js`):
`maxAllowableOffset` (degrees, tiered by search radius) and `geometryPrecision: 5`. Coarser values
produce visible stair-stepping. Leaflet's `smoothFactor` is left at its default `1` on purpose —
it is a *screen-pixel* tolerance, so it is already visually lossless, and lowering it only adds
per-frame cost. A 100-mile search in a dense forest state (e.g. Missoula, MT) pulls ~180 parcels
and pans at ~400 ms/frame; that is a pre-existing limit, not a regression.

The optional "Forest roads & trails (USFS)" overlay in the layers control is the Forest Service's
Motor Vehicle Use Map, drawn by the Service as one `export` image per view (`refreshMvum()` in
`script.js`, pane `mvum` under the place shapes) — no road geometry is downloaded. It only draws at
zoom 11+, the Service's own scale limit. A click looks up the route with `fetchMvumRoute()`; a place
shape's click handler tries that first and selects the place only when no route is under the pointer.

`fetchStatesInArea()` uses much coarser geometry on purpose — those polygons are only used for
point-in-polygon state assignment and are never drawn.

### Other conventions worth knowing

- `writeUrl()` calls `history.replaceState` with only `location.pathname + search`, which **drops
  any hash**. Don't put tab state in the URL hash; `setView()` uses the `view` query parameter,
  which `writeUrl()` preserves because it starts from the current query string.
- `localStorage` keys, all optional conveniences: `plw.splitRatio`, `plw.theme`,
  `plw.recentSearches`, `plw.savedPlaces`, `plw.drawPins`, `plw.calibers`, `plw.archery`. All reads
  and writes are wrapped in try/catch because the app is expected to run from `file://`; new code
  should use `loadStored()` / `saveStored()` from `ui.js`.
- `styles.css` is one file with a numbered contents list at the top. Colours come from the tokens
  in its first section, and the dark theme only re-points those tokens, so a new rule should not
  need a hex value. Two things to know: `--forest` / `--forest-dark` are brand *fills* that never
  flip (use `--heading` / `--link` for text and `--select` for an "on" state), and
  `.leaflet-container` re-declares the light text tokens because the map is always a light sheet.
- Icons are inline SVG from `icon(name, size)` in `ui.js`; static markup asks for one with
  `<span data-icon="name">`. No emoji as UI icons — they render differently on every platform.
- `parseDay()` builds dates with `new Date(y, m-1, d)` (local midnight), so there is no UTC
  off-by-one. Reuse it rather than writing new date parsing.
- Overpass community mirrors are frequently overloaded; `errors.osm` is often transient. Before
  concluding an OSM change broke something, A/B against the unmodified code.

## Data trust levels — read this before touching data

The owner's standing rule: **all project data must come from official government sources**, with
the exact source and retrieval date recorded. Priority order is USGS PAD-US → official state
sources (ADCNR / outdooralabama.com for Alabama) → other federal agencies (USFWS, USFS, BLM, TVA).
No third-party sites, blogs, or aggregators. If a fact cannot be verified from an official source,
leave it out or mark it unavailable rather than inferring it.

Against that rule, the existing `.js` data does **not** qualify and should be treated as a guide to
the *shape* of the data, not a trustworthy source of its *content*:

- `data.js` `LOCATIONS` — hand-written, includes unverifiable entries.
- `seasons.js` — summarized from ADCNR PDFs.
- `draws-data.js` — model-generated sample data with approximate odds and deadlines. Its own
  header comment says so, and the UI shows a persistent "Sample data" banner.
- `calibers.js` — hand-written typical factory-load figures and per-species energy rules of thumb,
  with energy computed from a simplified drag model. Like the Almanac's guidance it carries its own
  fixed disclaimer and makes no legal claims; legal method-of-take rules are linked to the state
  agency, not carried.
- `archery.js` — hand-written body proportions, vital-zone sizes and aim points drawn from one
  parametric silhouette, a heuristic broadhead rating, and arrow speed/drop/energy from a simplified
  drag model. Same standing as `calibers.js`: fixed disclaimer, no legal claims, broadhead and
  equipment legality linked to the state agency.
- `images/species/*.jpg` — the Big Game tab's animal photos. Each is a cropped, resized copy of a
  U.S. Fish & Wildlife Service photo whose FWS.gov media page reads "Media Usage Rights/License:
  Public Domain"; `BG_PHOTOS` in `calibers.js` records each page, credit and the retrieval date, and
  the tab prints the credits. Many FWS.gov photos are instead "Copyrighted … Used by Permission" —
  check the rights field on the page before adding or swapping one.

`STATE_LAYERS` in `coverage.js` is the exception: it is queried live from official state agency
ArcGIS services (20 states so far — each entry's comment says which agency statement its hunting or fishing tag rests on), and a place is marked huntable only from the agency's own
hunting field. Records the agency marks as no-hunting or closed are fetched but hidden, and still
remove their same-named PAD-US twin in `mergeStateLands()`. A layer whose ID column is not `OBJECTID` needs `oidField`, or paging fails. States were left out where the agency layer has no hunting field (e.g. TX, FL, CA, ME, PA) or the service could not be confirmed as the agency's own. Each place keeps its exact request
URLs and retrieval time in `place.provenance`.

A key distinction the data model must preserve: PAD-US is authoritative for who manages a parcel
and whether the public may enter, but it explicitly **does not** say whether hunting or fishing is
legal there.

## SQLite migration (in progress, not yet wired to the frontend)

`tools/build_database.py` builds `data/outdoors.sqlite` from live official services. Stdlib only —
`sqlite3` + `urllib`, no dependencies.

```bash
python3 tools/build_database.py --list-regions
python3 tools/build_database.py --rebuild             # drop and reload everything
python3 tools/build_database.py --region wy           # one region, straight from the network
python3 tools/build_database.py --dry-run             # fetch and report, write nothing

# Two-phase workflow for many regions. --fetch-only touches no database, so any number of
# these can run concurrently; --from-cache then writes in one serial process.
python3 tools/build_database.py --region mt --fetch-only     # -> data/cache/mt.json
python3 tools/build_database.py --from-cache --region mt
```

Loads 16 regions: `huntsville_al` (a 50-mile radius region) plus 15 statewide regions —
AL MS LA FL GA TN AR SC NC MT WY AZ OR ND SD. 24,420 protected areas, 1,026 counties,
~225 MB. The frontend still reads the `.js` files; nothing consumes the database yet.

`data/outdoors.sqlite` (~225 MB) and `data/cache/` (~200 MB) are build artifacts and are
almost certainly `.gitignore` candidates rather than things to commit.

Design points that matter if you extend it:
- Idempotency comes from upserting on `feature_key` (a content hash of identifying attributes plus
  geometry) **plus** a retire pass that sets `retired_at` on rows that stop coming back. PAD-US has
  no usable stable ID — `BndryID` is literally `"Not Applicable"` and `OBJECTID` is re-issued
  between releases.
- Every data row carries a `retrieval_id` into an append-only `retrievals` table holding the exact
  replayable request URL. That traceability is the whole point; preserve it.
- `area_activities` records hunting/fishing as `status='unverified'` with a `verify_url`. That is
  the deliberate encoding of what PAD-US cannot tell us — don't "improve" it by guessing values.
- Geometry is stored full-resolution as GeoJSON TEXT. Nationwide with the same filter this would be
  ~375 MB (52,555 features); 433 parcels over 100k acres account for over half of that.
- Adding a region means adding an entry to `REGIONS` (or one line in `STATE_REGIONS` for a
  whole state); adding a data type means adding to `SOURCES`, a table with
  `region_code`/`source_code`/`retrieval_id`, and a `load_*()` function. The script's module
  docstring spells this out.
- **Statewide regions are selected geometrically**, by intersecting the official Census state
  boundary, because PAD-US has no usable state attribute (`ST_Name` is `'Not Applicable'` on
  every feature, exactly like `BndryID`). The boundary polygon is too large for a GET query
  string, which is why all ArcGIS calls go out as POST.
- Counties for a statewide region filter on **state FIPS**, not the boundary: neighbouring
  states share that boundary line, so a spatial `intersects` returned 133 counties for North
  Carolina instead of 100.
- `feature_key` includes `region_code`, so a parcel straddling a state line is stored once per
  state and correctly attributed to each. Chattahoochee National Forest appears under GA, TN,
  SC and NC.
- **Watch for silent truncation.** ArcGIS reports `exceededTransferLimit` at the top level for
  `f=json` but nests it under `properties` for `f=geojson`. Checking only the top level
  truncated Wyoming to exactly 1,000 of its 18,641 parcels, and the load looked perfectly
  healthy. `arcgis_query()` now checks both places, keeps paging on a full page, and
  `verify_arcgis_count()` re-asks the service with `returnCountOnly` and raises rather than
  write a partial dataset. A round number of rows is the tell.

## Scope discipline

The owner consistently asks for tightly scoped changes and calls out when work strays beyond what
was requested. Make the change asked for, verify it in the browser, and report what was and wasn't
touched — rather than refactoring adjacent code, renaming things, or "cleaning up" while passing
through.
