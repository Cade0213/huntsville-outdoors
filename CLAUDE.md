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
- `?date=YYYY-MM-DD` — overrides `TODAY` in `seasons.js` to preview season status on another day.

## Architecture

### Everything is a global, and load order is load-bearing

No modules. Every top-level `const` and `function` lands in the shared global scope, so the
`<script>` order in `index.html` is a real dependency graph:

```
states.js → seasons.js → data.js → live.js → resources.js → calendar.js → script.js
          → draws-data.js → draws.js
```

- `data.js` references `SEASON_SCOPES` from `seasons.js`, so it must come after it.
- **`draws.js` must stay after `script.js`** — it uses `escapeHtml`, `restoreSplit` and `map`,
  all defined there. Moving it earlier throws a ReferenceError at load.
- `script.js` ends with top-level `initCalendar(); runSearch(...)`. `draws.js` ends with
  `initDraws()`. There is no single entry point.

### File roles

| File | Role |
|---|---|
| `script.js` | App shell: `appState`, Leaflet map, search, results list, detail card, panel tabs, resizable split |
| `live.js` | All network I/O (PAD-US, TIGERweb, Photon/Nominatim, Overpass) + geometry math |
| `data.js` | Hand-written curated Huntsville places (`LOCATIONS`) |
| `seasons.js` | Alabama season dates, `GAME`, and the shared date helpers (`parseDay`, `TODAY`, `daysBetween`, `formatDay`) |
| `calendar.js` | Season calendar tab; reads `appState` |
| `resources.js` | Licenses & gear tab; reads `appState` |
| `states.js` | Per-state agency links |
| `draws-data.js` / `draws.js` | Hunting Draws dataset / its UI, plus top-level view switching |

`appState` in `script.js` is the shared mutable store; `calendar.js` and `resources.js` read it
directly. `refreshAll()` re-renders everything that depends on it.

### Two tab systems — do not mix them

- **Top-level views**: `.site-tab` + `.view` with `data-view`, switched by `setView()` in
  `draws.js`. Map Locator vs Hunting Draws.
- **Panel tabs inside Map Locator**: `.tab` + `.tab-panel` with `data-tab`, switched by
  `setTab()` in `script.js`.

`script.js` binds `document.querySelectorAll(".tab")` globally. **Reusing `.tab` or `.tab-panel`
for anything new will hijack the panel tabs.** Same for the ids `calendar.js` owns by name
(`#month-grid`, `#cal-*`, `.month-grid`, `.cal-legend`).

`setView("map")` must call `restoreSplit()` and `map.invalidateSize()`, because `#app` is
`display:none` while the Draws tab is showing and Leaflet loses its size.

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

PAD-US boundary fidelity is tuned by two params in `fetchPublicLands()` (`live.js`):
`maxAllowableOffset` (degrees, tiered by search radius) and `geometryPrecision: 5`. Coarser values
produce visible stair-stepping. Leaflet's `smoothFactor` is left at its default `1` on purpose —
it is a *screen-pixel* tolerance, so it is already visually lossless, and lowering it only adds
per-frame cost. A 100-mile search in a dense forest state (e.g. Missoula, MT) pulls ~180 parcels
and pans at ~400 ms/frame; that is a pre-existing limit, not a regression.

`fetchStatesInArea()` uses much coarser geometry on purpose — those polygons are only used for
point-in-polygon state assignment and are never drawn.

### Other conventions worth knowing

- `writeUrl()` calls `history.replaceState` with only `location.pathname + search`, which **drops
  any hash**. Don't put tab state in the URL hash.
- Split ratio persists in `localStorage` under `plw.splitRatio`. All reads and writes are wrapped
  in try/catch because the app is expected to run from `file://`.
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
