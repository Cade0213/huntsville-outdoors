#!/usr/bin/env python3
"""
Build / refresh the SQLite source-of-truth database for the Public Lands & Waters site.

    python3 tools/build_database.py                  # create or update data/outdoors.sqlite
    python3 tools/build_database.py --rebuild        # drop everything and reload from scratch
    python3 tools/build_database.py --region huntsville_al
    python3 tools/build_database.py --dry-run        # fetch and report, write nothing
    python3 tools/build_database.py --list-regions

OFFICIAL SOURCES ONLY
---------------------
Every row in this database comes from a government service that can be re-queried by
anyone. The exact request URL used for each load is stored in the `retrievals` table, so
any row can be traced back to a replayable query. Nothing here is scraped from blogs,
aggregators, or hand-written notes.

Sources used by this loader (see the SOURCES registry below for the full records):
  1. USGS PAD-US Public Access  — land boundaries, manager, and public access status
  2. U.S. Census Bureau TIGERweb — county context for a region's extent

WHAT THIS LOADER DELIBERATELY DOES NOT DO
-----------------------------------------
PAD-US states who owns/manages a parcel and whether the public may enter. It does NOT
state whether hunting or fishing is legal there. That is set by state regulation and is
published as PDFs and HTML, not as a machine-readable government service. Rather than
guess, every protected area gets rows in `area_activities` with status='unverified' and a
`verify_url` pointing at the responsible agency. See load_area_activities().

IDEMPOTENCY
-----------
Running this repeatedly is safe and converges to the same state:
  * `sources`, `regions`, `agencies`, reference tables  -> upsert on their natural keys.
  * `protected_areas` -> upsert on `feature_key`, a content hash of the identifying
    attributes plus the geometry (see make_feature_key).
  * Anything previously loaded for the same (region, source) that did NOT come back in
    this run is marked `retired_at` rather than deleted, so the audit trail survives.
  * `retrievals` is an append-only log. New rows there on every run are intentional
    history, not duplicates.

ADDING A NEW REGION
-------------------
Add an entry to REGIONS below and run with --region <code>. Nothing else changes; the
fetch filters are all expressed relative to the region's centre and radius.

ADDING A NEW DATA TYPE
----------------------
1. Add a record to SOURCES describing the official service.
2. Add a CREATE TABLE to SCHEMA_SQL with `region_code`, `source_code` and `retrieval_id`
   columns so the row can be traced (copy the shape of `protected_areas`).
3. Write a `load_<thing>()` that calls arcgis_query()/http_get_json(), logs a retrieval
   with log_retrieval(), and upserts on a stable natural key.
4. Call it from load_region().
`hunting_draws` is created empty as a worked example of this pattern. A future
`migration_corridors` table would follow the same shape once an official corridor
service is identified (USGS publishes corridor data for some western states; nothing
official covers Alabama today, so no table is created for it yet).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB = REPO_ROOT / "data" / "outdoors.sqlite"
USER_AGENT = "huntsville-outdoors-db-loader/1.0 (+https://github.com/; contact: repo owner)"
HTTP_TIMEOUT = 180

# --------------------------------------------------------------------------------------
# Source registry. One entry per official service. `authority_tier` encodes the priority
# order the project requires: 1 = USGS PAD-US, 2 = official state, 3 = other federal.
# --------------------------------------------------------------------------------------
SOURCES = {
    "usgs_padus_public_access": {
        "name": "PAD-US Public Access (Protected Areas Database of the United States)",
        "publisher": "U.S. Geological Survey, Gap Analysis Project",
        "publisher_type": "federal",
        "authority_tier": 1,
        "landing_url": "https://www.usgs.gov/programs/gap-analysis-project/science/protected-areas",
        "service_url": (
            "https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/"
            "PADUS_Public_Access/FeatureServer/0"
        ),
        "citation": (
            "U.S. Geological Survey (USGS) Gap Analysis Project (GAP), Protected Areas "
            "Database of the United States (PAD-US), Public Access feature service."
        ),
        "license": "Public domain (U.S. Government work).",
        "notes": (
            "Authoritative for boundary, managing agency and public access status. "
            "Explicitly NOT authoritative for whether hunting or fishing is permitted."
        ),
    },
    "census_tigerweb_states": {
        "name": "TIGERweb State_County (States layer)",
        "publisher": "U.S. Census Bureau",
        "publisher_type": "federal",
        "authority_tier": 3,
        "landing_url": "https://tigerweb.geo.census.gov/tigerwebmain/TIGERweb_apps.html",
        "service_url": (
            "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/"
            "State_County/MapServer/0"
        ),
        "citation": "U.S. Census Bureau, TIGERweb REST services, State_County/States layer.",
        "license": "Public domain (U.S. Government work).",
        "notes": (
            "Supplies the official state boundary used as the spatial filter for statewide "
            "regions. PAD-US cannot be filtered by state attribute: its ST_Name field is "
            "'Not Applicable' on every feature, so state selection must be geometric."
        ),
    },
    "census_tigerweb_counties": {
        "name": "TIGERweb State_County (Counties layer)",
        "publisher": "U.S. Census Bureau",
        "publisher_type": "federal",
        "authority_tier": 3,
        "landing_url": "https://tigerweb.geo.census.gov/tigerwebmain/TIGERweb_apps.html",
        "service_url": (
            "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/"
            "State_County/MapServer/1"
        ),
        "citation": "U.S. Census Bureau, TIGERweb REST services, State_County/Counties layer.",
        "license": "Public domain (U.S. Government work).",
        "notes": "Used only to record which counties a region's search radius touches.",
    },
    # Reference-only sources. No facts are derived from these by the loader; they are
    # recorded so that `area_activities.verify_url` and `agencies.url` point somewhere
    # official, and so the DB documents where a human should go to confirm regulations.
    "adcnr_outdoor_alabama": {
        "name": "Alabama Department of Conservation and Natural Resources (Outdoor Alabama)",
        "publisher": "Alabama Department of Conservation and Natural Resources",
        "publisher_type": "state",
        "authority_tier": 2,
        "landing_url": "https://www.outdooralabama.com",
        "service_url": None,
        "citation": "Alabama Department of Conservation and Natural Resources, outdooralabama.com.",
        "license": "State of Alabama; consult site terms.",
        "notes": (
            "Authoritative for Alabama seasons, licences and WMA rules. Published as HTML "
            "and PDF only — there is no machine-readable service, so this loader stores "
            "links for verification and does not extract any values from it."
        ),
    },
    "usfws_wheeler_nwr": {
        "name": "Wheeler National Wildlife Refuge",
        "publisher": "U.S. Fish and Wildlife Service",
        "publisher_type": "federal",
        "authority_tier": 3,
        "landing_url": "https://www.fws.gov/refuge/wheeler",
        "service_url": None,
        "citation": "U.S. Fish and Wildlife Service, Wheeler National Wildlife Refuge.",
        "license": "Public domain (U.S. Government work).",
        "notes": (
            "Reference link for refuge-specific hunt rules. The refuge boundary itself "
            "comes from PAD-US. gis.fws.gov was returning HTTP 502 at the time of "
            "writing, so no FWS service is queried directly."
        ),
    },
    "tva_public_lands": {
        "name": "Tennessee Valley Authority public land information",
        "publisher": "Tennessee Valley Authority",
        "publisher_type": "federal",
        "authority_tier": 3,
        "landing_url": "https://www.tva.com/environment/recreation",
        "service_url": None,
        "citation": "Tennessee Valley Authority, recreation and public land information.",
        "license": "U.S. Government corporation work.",
        "notes": (
            "Reference link. TVA-managed tracts near Huntsville are carried in PAD-US "
            "with MngNm_Desc = 'Tennessee Valley Authority'."
        ),
    },
}

# --------------------------------------------------------------------------------------
# Region registry. To add a region, copy a block and change the values.
#   center/radius_mi define the spatial query sent to every service.
#   padus_filter is the PAD-US attribute filter; it is stored on the region row so the
#   database records exactly which subset of PAD-US was loaded.
# --------------------------------------------------------------------------------------
PADUS_HUNT_FISH_FILTER = (
    "MngTp_Desc IN ('Federal','State','Regional Agency Special District') "
    "AND Pub_Access IN ('OA','RA') "
    "AND FeatClass = 'Fee'"
)

# Statewide regions. These select PAD-US geometrically, using the official Census state
# boundary, because PAD-US has no usable state attribute (ST_Name is 'Not Applicable'
# everywhere, exactly like BndryID). A parcel that straddles a state line intersects both
# boundaries and is therefore loaded once per state — see make_feature_key().
STATE_REGIONS = {
    "al": "Alabama",      "ms": "Mississippi",   "la": "Louisiana",
    "fl": "Florida",      "ga": "Georgia",       "tn": "Tennessee",
    "ar": "Arkansas",     "sc": "South Carolina", "nc": "North Carolina",
    "mt": "Montana",      "wy": "Wyoming",       "az": "Arizona",
    "or": "Oregon",       "nd": "North Dakota",  "sd": "South Dakota",
}

REGIONS = {
    "huntsville_al": {
        "name": "Huntsville, Alabama and surrounding area",
        "state_abbr": "AL",
        "center_lat": 34.7304,
        "center_lng": -86.5861,
        "radius_mi": 50.0,
        "padus_filter": PADUS_HUNT_FISH_FILTER,
        "notes": (
            "Initial test region. 50-mile radius matches the website's default search "
            "radius and covers Wheeler NWR, Swan Creek, Mallard-Fox Creek and Skyline WMAs."
        ),
        # Official agencies a user should consult for this region, with their role.
        "agencies": [
            ("adcnr", "Alabama Department of Conservation and Natural Resources", "state", "AL",
             "https://www.outdooralabama.com", "Seasons, licences, WMA regulations",
             "adcnr_outdoor_alabama"),
            ("usfws_wheeler", "U.S. Fish and Wildlife Service — Wheeler NWR", "federal", "AL",
             "https://www.fws.gov/refuge/wheeler", "Refuge hunt permits and closures",
             "usfws_wheeler_nwr"),
            ("tva", "Tennessee Valley Authority", "federal", None,
             "https://www.tva.com/environment/recreation", "TVA reservoir land and access",
             "tva_public_lands"),
        ],
    },
}

# Expand STATE_REGIONS into full region records. Adding a state is a one-line edit above.
for _code, _name in STATE_REGIONS.items():
    REGIONS[_code] = {
        "name": f"{_name} (statewide)",
        "state_abbr": _code.upper(),
        "kind": "state",
        "state_name": _name,
        "center_lat": None,
        "center_lng": None,
        "radius_mi": None,
        "padus_filter": PADUS_HUNT_FISH_FILTER,
        "notes": (
            f"All PAD-US public-access land in {_name} matching the standard filter. "
            "Selected by intersecting the official Census state boundary."
        ),
        "agencies": [],
    }

# PAD-US Pub_Access domain values. The feature service does not publish a coded-value
# domain (checked: no `domain` on any field), so the labels below are recorded with a
# citation to the PAD-US data dictionary and `definition` is intentionally left NULL
# rather than paraphrased.
PADUS_ACCESS_CODES = [
    ("OA", "Open Access"),
    ("RA", "Restricted Access"),
    ("XA", "Closed"),
    ("UK", "Unknown"),
]
PADUS_DATA_DICTIONARY_URL = (
    "https://www.usgs.gov/programs/gap-analysis-project/pad-us-data-manual"
)

# --------------------------------------------------------------------------------------
# Schema
# --------------------------------------------------------------------------------------
SCHEMA_SQL = """
PRAGMA foreign_keys = ON;

-- Every official service this database draws on.
CREATE TABLE IF NOT EXISTS sources (
    source_code     TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    publisher       TEXT NOT NULL,
    publisher_type  TEXT,                 -- federal | state | regional
    authority_tier  INTEGER,              -- 1 = PAD-US, 2 = official state, 3 = other federal
    landing_url     TEXT,                 -- human-readable official page
    service_url     TEXT,                 -- machine endpoint, NULL if not machine-readable
    citation        TEXT,
    license         TEXT,
    notes           TEXT,
    last_updated    TEXT                  -- when this row was last written
);

-- Append-only audit log: one row per service call, with the exact replayable URL.
CREATE TABLE IF NOT EXISTS retrievals (
    retrieval_id    INTEGER PRIMARY KEY AUTOINCREMENT,
    source_code     TEXT NOT NULL REFERENCES sources(source_code),
    region_code     TEXT REFERENCES regions(region_code),
    data_type       TEXT NOT NULL,        -- protected_areas | region_counties | ...
    retrieved_at    TEXT NOT NULL,        -- ISO-8601 UTC
    request_url     TEXT NOT NULL,        -- endpoint; replay with:  curl --data "<request_params>" <request_url>
    request_params  TEXT,                 -- urlencoded POST body, so the query stays replayable
    http_status     INTEGER,
    record_count    INTEGER,
    status          TEXT NOT NULL,        -- ok | error
    message         TEXT
);
CREATE INDEX IF NOT EXISTS idx_retrievals_scope ON retrievals(region_code, source_code, data_type);

-- A named study area. Adding a region means adding a row here (via REGIONS).
CREATE TABLE IF NOT EXISTS regions (
    region_code     TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    state_abbr      TEXT,
    kind            TEXT NOT NULL DEFAULT 'radius',  -- radius | state
    -- centre/radius apply to kind='radius'; state regions use boundary_geojson instead
    center_lat      REAL,
    center_lng      REAL,
    radius_mi       REAL,
    boundary_geojson TEXT,                -- official Census state boundary (kind='state')
    boundary_source_code TEXT REFERENCES sources(source_code),
    bbox_min_lat    REAL, bbox_min_lng REAL, bbox_max_lat REAL, bbox_max_lng REAL,
    padus_filter    TEXT,                 -- the exact PAD-US WHERE clause loaded
    notes           TEXT,
    created_at      TEXT,
    last_updated    TEXT
);

-- Counties touched by a region's radius (U.S. Census TIGERweb).
CREATE TABLE IF NOT EXISTS region_counties (
    region_code     TEXT NOT NULL REFERENCES regions(region_code),
    geoid           TEXT NOT NULL,
    name            TEXT NOT NULL,
    state_fips      TEXT,
    county_fips     TEXT,
    source_code     TEXT NOT NULL REFERENCES sources(source_code),
    retrieval_id    INTEGER NOT NULL REFERENCES retrievals(retrieval_id),
    last_updated    TEXT,
    PRIMARY KEY (region_code, geoid)
);

-- Core dataset: one row per PAD-US feature (a managed tract), stored verbatim.
CREATE TABLE IF NOT EXISTS protected_areas (
    protected_area_id  INTEGER PRIMARY KEY AUTOINCREMENT,
    feature_key        TEXT NOT NULL UNIQUE,   -- content hash; see make_feature_key()
    region_code        TEXT NOT NULL REFERENCES regions(region_code),
    source_code        TEXT NOT NULL REFERENCES sources(source_code),
    retrieval_id       INTEGER NOT NULL REFERENCES retrievals(retrieval_id),
    source_object_id   INTEGER,                -- PAD-US OBJECTID; NOT stable across releases
    data_type          TEXT NOT NULL DEFAULT 'protected_area',
    unit_name          TEXT NOT NULL,
    designation        TEXT,                   -- DesTp_Desc
    manager_name       TEXT,                   -- MngNm_Desc
    manager_type       TEXT,                   -- MngTp_Desc
    owner_category     TEXT,                   -- Category
    feature_class      TEXT,                   -- FeatClass
    public_access_code TEXT REFERENCES padus_access_codes(code),
    gap_status_code    TEXT,                   -- GAP_Sts
    gis_acres          REAL,
    state_name         TEXT,
    centroid_lat       REAL,                   -- bounding-box centre, for indexing only
    centroid_lng       REAL,
    geometry_geojson   TEXT NOT NULL,          -- full-resolution GeoJSON geometry
    geometry_srid      INTEGER NOT NULL DEFAULT 4326,
    first_seen_at      TEXT,
    last_updated       TEXT,
    retired_at         TEXT                    -- set when a row stops coming back
);
CREATE INDEX IF NOT EXISTS idx_pa_region ON protected_areas(region_code, retired_at);
CREATE INDEX IF NOT EXISTS idx_pa_unit   ON protected_areas(unit_name);

-- What PAD-US does NOT tell us. One row per area per activity, explicitly unverified,
-- with a pointer to the agency that can confirm it.
CREATE TABLE IF NOT EXISTS area_activities (
    protected_area_id  INTEGER NOT NULL REFERENCES protected_areas(protected_area_id) ON DELETE CASCADE,
    activity           TEXT NOT NULL,          -- hunting | fishing
    status             TEXT NOT NULL,          -- unverified | permitted | prohibited
    verify_source_code TEXT REFERENCES sources(source_code),
    verify_url         TEXT,
    notes              TEXT,
    last_updated       TEXT,
    PRIMARY KEY (protected_area_id, activity)
);

-- Reference lookup for PAD-US public access codes.
CREATE TABLE IF NOT EXISTS padus_access_codes (
    code         TEXT PRIMARY KEY,
    label        TEXT NOT NULL,
    definition   TEXT,                         -- NULL unless quoted from an official document
    source_code  TEXT REFERENCES sources(source_code),
    source_url   TEXT
);

-- Official agencies to consult, and which regions they cover.
CREATE TABLE IF NOT EXISTS agencies (
    agency_code  TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    level        TEXT,                         -- federal | state
    state_abbr   TEXT,
    url          TEXT,
    role         TEXT,
    source_code  TEXT REFERENCES sources(source_code),
    last_updated TEXT
);
CREATE TABLE IF NOT EXISTS region_agencies (
    region_code TEXT NOT NULL REFERENCES regions(region_code),
    agency_code TEXT NOT NULL REFERENCES agencies(agency_code),
    PRIMARY KEY (region_code, agency_code)
);

-- Extension example. Created empty: no official machine-readable source for Alabama
-- draw data has been identified, and the site's current draw list is not government-sourced.
-- Populate it with a load_hunting_draws() that follows the protected_areas pattern.
CREATE TABLE IF NOT EXISTS hunting_draws (
    draw_id            INTEGER PRIMARY KEY AUTOINCREMENT,
    draw_key           TEXT NOT NULL UNIQUE,
    region_code        TEXT REFERENCES regions(region_code),
    source_code        TEXT NOT NULL REFERENCES sources(source_code),
    retrieval_id       INTEGER REFERENCES retrievals(retrieval_id),
    data_type          TEXT NOT NULL DEFAULT 'hunting_draw',
    state_abbr         TEXT NOT NULL,
    species            TEXT,
    hunt_name          TEXT,
    application_opens  TEXT,                   -- ISO-8601 date
    application_closes TEXT,
    draw_odds_pct      REAL,                   -- NULL when the state publishes none
    cost_usd           REAL,
    point_system       TEXT,
    official_url       TEXT,
    first_seen_at      TEXT,
    last_updated       TEXT,
    retired_at         TEXT
);
"""


# --------------------------------------------------------------------------------------
# Small helpers
# --------------------------------------------------------------------------------------
def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def http_get_json(url: str) -> tuple[dict, int]:
    """GET a URL and parse JSON. Returns (payload, http_status)."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
        return json.load(resp), resp.status


def http_post_json(url: str, params: dict) -> tuple[dict, int]:
    """POST a form-encoded ArcGIS query. Used because a state-boundary polygon filter is
    far too large for a GET query string."""
    body = urllib.parse.urlencode(params).encode()
    req = urllib.request.Request(
        url, data=body,
        headers={"User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
        return json.load(resp), resp.status


def arcgis_query(service_url: str, params: dict) -> tuple[list, str, str, int]:
    """
    Query an ArcGIS REST FeatureServer/MapServer layer, following pagination.

    ArcGIS silently truncates large responses. A source-of-truth loader must never accept
    a silent truncation, so this pages on `exceededTransferLimit` and raises if the
    service reports an error.

    Returns (features, endpoint_url, first_page_params, http_status).
    """
    features: list = []
    endpoint = f"{service_url}/query"
    first_params = ""
    status = 0
    offset = 0
    page_size = int(params.get("resultRecordCount") or 0)

    while True:
        page = dict(params)
        page["resultOffset"] = offset
        if not first_params:
            first_params = urllib.parse.urlencode(page)

        payload, status = http_post_json(endpoint, page)
        if "error" in payload:
            raise RuntimeError(f"ArcGIS error: {payload['error'].get('message')} ({endpoint})")

        batch = payload.get("features", [])
        features.extend(batch)
        if not batch:
            break

        # Where the truncation flag lives depends on the output format: f=json puts
        # exceededTransferLimit at the top level, f=geojson buries it under "properties".
        # Checking only the top level silently truncated Wyoming at one page of 1000.
        more = bool(payload.get("exceededTransferLimit")
                    or (payload.get("properties") or {}).get("exceededTransferLimit"))
        # Belt and braces: a full page almost certainly means there is another one, whatever
        # the service chose to report.
        if not more and not (page_size and len(batch) == page_size):
            break
        offset += len(batch)

    verify_arcgis_count(endpoint, params, len(features))
    return features, endpoint, first_params, status


def verify_arcgis_count(endpoint: str, params: dict, fetched: int) -> None:
    """
    Assert we got everything the service says exists.

    Silent truncation is the worst possible failure for a source-of-truth loader: the
    database looks fine and is quietly missing rows. This re-asks the same query with
    returnCountOnly and refuses to proceed on a mismatch.
    """
    count_params = {k: v for k, v in params.items()
                    if k not in ("outFields", "returnGeometry", "outSR", "geometryPrecision",
                                 "resultRecordCount", "resultOffset", "orderByFields", "f")}
    count_params.update({"returnCountOnly": "true", "f": "json"})
    payload, _ = http_post_json(endpoint, count_params)
    expected = payload.get("count")
    if expected is None:
        return  # service declined to count; nothing to check against
    if fetched != expected:
        raise RuntimeError(
            f"TRUNCATED FETCH: got {fetched} features but the service reports {expected} "
            f"for this query ({endpoint}). Refusing to write incomplete data."
        )


def state_boundary(state_name: str) -> tuple[dict, str]:
    """Official Census state boundary (+ FIPS), simplified enough to send as a spatial filter."""
    feats, _, _, _ = arcgis_query(
        SOURCES["census_tigerweb_states"]["service_url"],
        {"where": f"NAME = \'{state_name}\'", "outFields": "NAME,STUSAB,STATE",
         "returnGeometry": "true", "outSR": 4326,
         "maxAllowableOffset": 0.01, "geometryPrecision": 5, "f": "json"},
    )
    if not feats:
        raise RuntimeError(f"Census returned no boundary for {state_name}")
    return ({"rings": feats[0]["geometry"]["rings"], "spatialReference": {"wkid": 4326}},
            feats[0]["attributes"]["STATE"])


def county_params(region: dict) -> dict:
    """
    Counties for a region.

    For a statewide region this filters on the state FIPS code rather than intersecting the
    boundary: two states that share a border also share that boundary line, so a spatial
    'intersects' returns every border county in the neighbouring states too (North Carolina
    came back with 133 counties instead of 100).
    """
    if region.get("kind") == "state":
        return {"where": f"STATE = \'{region['_fips']}\'"}
    return {"where": "1=1", **spatial_params(region)}


def spatial_params(region: dict) -> dict:
    """The spatial half of a PAD-US/TIGERweb query, per region kind."""
    if region.get("kind") == "state":
        return {
            "geometry": json.dumps(region["_boundary"]),
            "geometryType": "esriGeometryPolygon",
            "inSR": 4326,
            "spatialRel": "esriSpatialRelIntersects",
        }
    return {
        "geometry": f"{region['center_lng']},{region['center_lat']}",
        "geometryType": "esriGeometryPoint",
        "inSR": 4326,
        "distance": region["radius_mi"],
        "units": "esriSRUnit_StatuteMile",
        "spatialRel": "esriSpatialRelIntersects",
    }


def make_feature_key(region_code: str, source_code: str, attrs: dict, geometry: dict) -> str:
    """
    Deterministic identity for a PAD-US tract.

    PAD-US does not give us a usable stable ID: BndryID is literally 'Not Applicable' on
    every Huntsville-area feature, and OBJECTID is re-issued between releases. Name +
    manager + designation is not unique either — several tracts of one WMA are carried
    under the same manager.

    So identity is the identifying attributes PLUS the geometry. A re-digitised boundary
    therefore produces a NEW row and the old one is retired, which is the correct
    behaviour for a source of truth: you want a boundary change to be visible, not
    silently overwritten.

    region_code is part of the key so each region is a self-contained extract. A parcel
    straddling a state line intersects both boundaries and is stored once per state,
    correctly attributed to each, rather than flip-flopping between them.
    """
    payload = json.dumps(
        {
            "region": region_code,
            "source": source_code,
            "unit_name": attrs.get("Unit_Nm"),
            "manager_name": attrs.get("MngNm_Desc"),
            "manager_type": attrs.get("MngTp_Desc"),
            "designation": attrs.get("DesTp_Desc"),
            "geometry": geometry,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def geometry_bbox_centre(geometry: dict) -> tuple[float | None, float | None]:
    """Bounding-box centre of a GeoJSON geometry. Indexing aid only, not a true centroid."""
    lats: list[float] = []
    lngs: list[float] = []

    def walk(node):
        if isinstance(node, (list, tuple)):
            if len(node) >= 2 and all(isinstance(v, (int, float)) for v in node[:2]):
                lngs.append(float(node[0]))
                lats.append(float(node[1]))
            else:
                for child in node:
                    walk(child)

    walk(geometry.get("coordinates", []))
    if not lats:
        return None, None
    return (min(lats) + max(lats)) / 2, (min(lngs) + max(lngs)) / 2


def bbox_for_region(region: dict) -> tuple[float, float, float, float]:
    """Approximate lat/lng bounding box for a centre + radius, for metadata only."""
    lat, lng, r = region["center_lat"], region["center_lng"], region["radius_mi"]
    dlat = r / 69.0
    import math

    dlng = r / (69.0 * max(math.cos(math.radians(lat)), 0.01))
    return lat - dlat, lng - dlng, lat + dlat, lng + dlng


# --------------------------------------------------------------------------------------
# Writers
# --------------------------------------------------------------------------------------
def init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA_SQL)


def upsert_sources(conn: sqlite3.Connection) -> None:
    now = utc_now()
    for code, s in SOURCES.items():
        conn.execute(
            """
            INSERT INTO sources (source_code, name, publisher, publisher_type, authority_tier,
                                 landing_url, service_url, citation, license, notes, last_updated)
            VALUES (:code, :name, :publisher, :publisher_type, :authority_tier,
                    :landing_url, :service_url, :citation, :license, :notes, :now)
            ON CONFLICT(source_code) DO UPDATE SET
                name=excluded.name, publisher=excluded.publisher,
                publisher_type=excluded.publisher_type, authority_tier=excluded.authority_tier,
                landing_url=excluded.landing_url, service_url=excluded.service_url,
                citation=excluded.citation, license=excluded.license,
                notes=excluded.notes, last_updated=excluded.last_updated
            """,
            {"code": code, "now": now, **s},
        )

    for code, label in PADUS_ACCESS_CODES:
        conn.execute(
            """
            INSERT INTO padus_access_codes (code, label, definition, source_code, source_url)
            VALUES (?, ?, NULL, 'usgs_padus_public_access', ?)
            ON CONFLICT(code) DO UPDATE SET label=excluded.label, source_url=excluded.source_url
            """,
            (code, label, PADUS_DATA_DICTIONARY_URL),
        )


def upsert_region(conn: sqlite3.Connection, code: str, region: dict) -> None:
    now = utc_now()
    kind = region.get("kind", "radius")
    if kind == "state":
        # Bounding box comes from the official boundary itself.
        pts = [pt for ring in region["_boundary"]["rings"] for pt in ring]
        lngs = [p[0] for p in pts]
        lats = [p[1] for p in pts]
        min_lat, min_lng, max_lat, max_lng = min(lats), min(lngs), max(lats), max(lngs)
        boundary = json.dumps({"type": "Polygon", "coordinates": region["_boundary"]["rings"]},
                              separators=(",", ":"))
        boundary_src = "census_tigerweb_states"
    else:
        min_lat, min_lng, max_lat, max_lng = bbox_for_region(region)
        boundary, boundary_src = None, None

    conn.execute(
        """
        INSERT INTO regions (region_code, name, state_abbr, kind, center_lat, center_lng, radius_mi,
                             boundary_geojson, boundary_source_code,
                             bbox_min_lat, bbox_min_lng, bbox_max_lat, bbox_max_lng,
                             padus_filter, notes, created_at, last_updated)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(region_code) DO UPDATE SET
            name=excluded.name, state_abbr=excluded.state_abbr, kind=excluded.kind,
            center_lat=excluded.center_lat, center_lng=excluded.center_lng,
            radius_mi=excluded.radius_mi, boundary_geojson=excluded.boundary_geojson,
            boundary_source_code=excluded.boundary_source_code,
            bbox_min_lat=excluded.bbox_min_lat,
            bbox_min_lng=excluded.bbox_min_lng, bbox_max_lat=excluded.bbox_max_lat,
            bbox_max_lng=excluded.bbox_max_lng, padus_filter=excluded.padus_filter,
            notes=excluded.notes, last_updated=excluded.last_updated
        """,
        (code, region["name"], region["state_abbr"], kind,
         region["center_lat"], region["center_lng"], region["radius_mi"],
         boundary, boundary_src,
         min_lat, min_lng, max_lat, max_lng,
         region["padus_filter"], region["notes"], now, now),
    )

    for (acode, name, level, st, url, role, src) in region.get("agencies", []):
        conn.execute(
            """
            INSERT INTO agencies (agency_code, name, level, state_abbr, url, role, source_code, last_updated)
            VALUES (?,?,?,?,?,?,?,?)
            ON CONFLICT(agency_code) DO UPDATE SET
                name=excluded.name, level=excluded.level, state_abbr=excluded.state_abbr,
                url=excluded.url, role=excluded.role, source_code=excluded.source_code,
                last_updated=excluded.last_updated
            """,
            (acode, name, level, st, url, role, src, now),
        )
        conn.execute(
            "INSERT OR IGNORE INTO region_agencies (region_code, agency_code) VALUES (?,?)",
            (code, acode),
        )


def log_retrieval(conn, source_code, region_code, data_type, request_url, request_params,
                  http_status, record_count, status="ok", message=None, retrieved_at=None) -> int:
    cur = conn.execute(
        """
        INSERT INTO retrievals (source_code, region_code, data_type, retrieved_at, request_url,
                                request_params, http_status, record_count, status, message)
        VALUES (?,?,?,?,?,?,?,?,?,?)
        """,
        (source_code, region_code, data_type, retrieved_at or utc_now(), request_url,
         request_params, http_status, record_count, status, message),
    )
    return cur.lastrowid


def retire_missing(conn, table, region_code, source_code, live_keys, key_col) -> int:
    """
    Mark rows in (region, source) that did not come back in this run.

    This is what makes re-running *correct* and not merely duplicate-free: without it, a
    parcel removed from PAD-US would linger in the database forever.
    """
    rows = conn.execute(
        f"SELECT {key_col} FROM {table} WHERE region_code=? AND source_code=? AND retired_at IS NULL",
        (region_code, source_code),
    ).fetchall()
    stale = [r[0] for r in rows if r[0] not in live_keys]
    for key in stale:
        conn.execute(
            f"UPDATE {table} SET retired_at=? WHERE {key_col}=?", (utc_now(), key)
        )
    return len(stale)


# --------------------------------------------------------------------------------------
# Loaders
# --------------------------------------------------------------------------------------
def load_protected_areas(conn, region_code, region, dry_run=False, cached=None) -> dict:
    """USGS PAD-US -> protected_areas + area_activities."""
    source_code = "usgs_padus_public_access"
    service = SOURCES[source_code]["service_url"]

    params = {
        "where": region["padus_filter"],
        **spatial_params(region),
        "outFields": ("OBJECTID,Unit_Nm,Pub_Access,DesTp_Desc,MngNm_Desc,MngTp_Desc,"
                      "GIS_Acres,ST_Name,Category,FeatClass,GAP_Sts"),
        "returnGeometry": "true",
        "outSR": 4326,
        # Full resolution on purpose: this is the source of truth. Downstream consumers
        # can simplify; nothing can un-simplify.
        "geometryPrecision": 6,
        "f": "geojson",
        "resultRecordCount": 1000,
    }

    if cached is not None:
        features = cached["features"]
        url, req_params = cached["request_url"], cached["request_params"]
        http_status, fetched_at = cached["http_status"], cached["retrieved_at"]
    else:
        features, url, req_params, http_status = arcgis_query(service, params)
        fetched_at = utc_now()
    print(f"  PAD-US: {len(features)} features")
    if dry_run:
        return {"fetched": len(features), "written": 0, "retired": 0}

    retrieval_id = log_retrieval(conn, source_code, region_code, "protected_areas",
                                 url, req_params, http_status, len(features),
                                 retrieved_at=fetched_at)

    now = utc_now()
    live_keys, written = set(), 0
    for feat in features:
        attrs = feat.get("properties") or {}
        geom = feat.get("geometry")
        if not geom:
            continue  # a feature with no geometry cannot be placed; skip rather than guess

        key = make_feature_key(region_code, source_code, attrs, geom)
        live_keys.add(key)
        lat, lng = geometry_bbox_centre(geom)

        conn.execute(
            """
            INSERT INTO protected_areas (
                feature_key, region_code, source_code, retrieval_id, source_object_id,
                unit_name, designation, manager_name, manager_type, owner_category,
                feature_class, public_access_code, gap_status_code, gis_acres, state_name,
                centroid_lat, centroid_lng, geometry_geojson, first_seen_at, last_updated, retired_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)
            ON CONFLICT(feature_key) DO UPDATE SET
                retrieval_id=excluded.retrieval_id,
                source_object_id=excluded.source_object_id,
                public_access_code=excluded.public_access_code,
                gap_status_code=excluded.gap_status_code,
                gis_acres=excluded.gis_acres,
                owner_category=excluded.owner_category,
                last_updated=excluded.last_updated,
                retired_at=NULL
            """,
            (key, region_code, source_code, retrieval_id, attrs.get("OBJECTID"),
             attrs.get("Unit_Nm"), attrs.get("DesTp_Desc"), attrs.get("MngNm_Desc"),
             attrs.get("MngTp_Desc"), attrs.get("Category"), attrs.get("FeatClass"),
             attrs.get("Pub_Access"), attrs.get("GAP_Sts"), attrs.get("GIS_Acres"),
             attrs.get("ST_Name"), lat, lng,
             json.dumps(geom, separators=(",", ":")), now, now),
        )
        written += 1

    retired = retire_missing(conn, "protected_areas", region_code, source_code,
                             live_keys, "feature_key")
    load_area_activities(conn, region_code, region)
    return {"fetched": len(features), "written": written, "retired": retired}


def load_area_activities(conn, region_code, region) -> None:
    """
    Record hunting/fishing status as EXPLICITLY UNVERIFIED for every live area.

    This is the honest encoding of a real limitation: PAD-US tells us a parcel is public
    and whether the public may enter, but says nothing about whether hunting or fishing
    is legal there. Alabama's rules live in ADCNR PDFs and refuge-specific permits, none
    of which are machine-readable, so the loader refuses to infer a value and instead
    stores where to go and confirm.

    When an official machine-readable source appears, set status='permitted'/'prohibited'
    here and point verify_source_code at it.
    """
    now = utc_now()
    rows = conn.execute(
        "SELECT protected_area_id, manager_name FROM protected_areas "
        "WHERE region_code=? AND retired_at IS NULL",
        (region_code,),
    ).fetchall()

    for area_id, manager in rows:
        # Point at the most specific official authority we can name for this manager.
        if manager and "Fish and Wildlife Service" in manager:
            src, url = "usfws_wheeler_nwr", "https://www.fws.gov/refuge/wheeler"
        elif manager and "Tennessee Valley Authority" in manager:
            src, url = "tva_public_lands", "https://www.tva.com/environment/recreation"
        else:
            src, url = "adcnr_outdoor_alabama", "https://www.outdooralabama.com"

        for activity in ("hunting", "fishing"):
            conn.execute(
                """
                INSERT INTO area_activities (protected_area_id, activity, status,
                                             verify_source_code, verify_url, notes, last_updated)
                VALUES (?,?,'unverified',?,?,?,?)
                ON CONFLICT(protected_area_id, activity) DO UPDATE SET
                    verify_source_code=excluded.verify_source_code,
                    verify_url=excluded.verify_url,
                    last_updated=excluded.last_updated
                """,
                (area_id, activity, src, url,
                 "PAD-US does not state whether this activity is permitted. "
                 "Confirm with the linked agency before relying on it.", now),
            )


def load_region_counties(conn, region_code, region, dry_run=False, cached=None) -> dict:
    """U.S. Census TIGERweb -> region_counties."""
    source_code = "census_tigerweb_counties"
    service = SOURCES[source_code]["service_url"]
    params = {
        **county_params(region),
        "outFields": "GEOID,NAME,STATE,COUNTY",
        "returnGeometry": "false",
        "f": "json",
    }
    if cached is not None:
        features = cached["features"]
        url, req_params = cached["request_url"], cached["request_params"]
        http_status, fetched_at = cached["http_status"], cached["retrieved_at"]
    else:
        features, url, req_params, http_status = arcgis_query(service, params)
        fetched_at = utc_now()
    print(f"  TIGERweb counties: {len(features)}")
    if dry_run:
        return {"fetched": len(features), "written": 0}

    retrieval_id = log_retrieval(conn, source_code, region_code, "region_counties",
                                 url, req_params, http_status, len(features),
                                 retrieved_at=fetched_at)
    now = utc_now()
    for feat in features:
        a = feat.get("attributes", {})
        conn.execute(
            """
            INSERT INTO region_counties (region_code, geoid, name, state_fips, county_fips,
                                         source_code, retrieval_id, last_updated)
            VALUES (?,?,?,?,?,?,?,?)
            ON CONFLICT(region_code, geoid) DO UPDATE SET
                name=excluded.name, retrieval_id=excluded.retrieval_id,
                last_updated=excluded.last_updated
            """,
            (region_code, a.get("GEOID"), a.get("NAME"), a.get("STATE"), a.get("COUNTY"),
             source_code, retrieval_id, now),
        )
    return {"fetched": len(features), "written": len(features)}


# --------------------------------------------------------------------------------------
# Fetch cache.
#
# SQLite takes one writer at a time, so fetching many regions concurrently against a single
# database is not safe. The split below is what makes parallelism work: --fetch-only does
# the slow, network-bound half and writes a self-contained JSON payload per region; a later
# --from-cache pass does all the database writing in one serial process. The cached payload
# carries the endpoint, the exact POST body and the retrieval timestamp, so provenance
# survives the round trip and `retrievals` still points at a replayable query.
# --------------------------------------------------------------------------------------
CACHE_DIR = REPO_ROOT / "data" / "cache"


def cache_path(region_code: str) -> Path:
    return CACHE_DIR / f"{region_code}.json"


def prepare_region(region_code: str) -> dict:
    """Resolve anything a region needs before querying (e.g. its official boundary)."""
    region = dict(REGIONS[region_code])
    if region.get("kind") == "state":
        region["_boundary"], region["_fips"] = state_boundary(region["state_name"])
    return region


def fetch_region(region_code: str) -> dict:
    """Fetch every dataset for a region and return a cacheable payload. No DB access."""
    region = prepare_region(region_code)
    payload = {"region_code": region_code, "fetched_at": utc_now(), "datasets": {}}
    if region.get("kind") == "state":
        payload["boundary"] = region["_boundary"]
        payload["fips"] = region["_fips"]

    jobs = [
        ("region_counties", SOURCES["census_tigerweb_counties"]["service_url"],
         {**county_params(region), "outFields": "GEOID,NAME,STATE,COUNTY",
          "returnGeometry": "false", "f": "json"}),
        ("protected_areas", SOURCES["usgs_padus_public_access"]["service_url"],
         {"where": region["padus_filter"], **spatial_params(region),
          "outFields": ("OBJECTID,Unit_Nm,Pub_Access,DesTp_Desc,MngNm_Desc,MngTp_Desc,"
                        "GIS_Acres,ST_Name,Category,FeatClass,GAP_Sts"),
          "returnGeometry": "true", "outSR": 4326, "geometryPrecision": 6,
          "f": "geojson", "resultRecordCount": 1000}),
    ]
    for name, service, params in jobs:
        feats, url, req_params, status = arcgis_query(service, params)
        payload["datasets"][name] = {
            "features": feats, "request_url": url, "request_params": req_params,
            "http_status": status, "retrieved_at": utc_now(),
        }
    return payload


def write_cache(region_code: str, payload: dict) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = cache_path(region_code)
    tmp = path.with_suffix(".json.tmp")
    with open(tmp, "w") as fh:
        json.dump(payload, fh, separators=(",", ":"))
    tmp.replace(path)  # atomic, so a half-written cache is never consumed
    return path


def read_cache(region_code: str) -> dict:
    path = cache_path(region_code)
    if not path.exists():
        raise FileNotFoundError(f"no cache for '{region_code}' — run --fetch-only first ({path})")
    with open(path) as fh:
        return json.load(fh)


def load_region(conn, region_code, dry_run=False, use_cache=False) -> None:
    region = prepare_region(region_code) if not use_cache else dict(REGIONS[region_code])
    cache = None
    if use_cache:
        cache = read_cache(region_code)
        if region.get("kind") == "state":
            region["_boundary"] = cache["boundary"]
            region["_fips"] = cache["fips"]

    print(f"\nRegion: {region_code} — {region['name']}")
    if region.get("kind") == "state":
        print(f"  statewide, official Census boundary" + (" (from cache)" if use_cache else ""))
    else:
        print(f"  centre {region['center_lat']}, {region['center_lng']}  radius {region['radius_mi']} mi")

    if not dry_run:
        upsert_sources(conn)
        upsert_region(conn, region_code, region)

    ds = (cache or {}).get("datasets", {})
    counties = load_region_counties(conn, region_code, region, dry_run, ds.get("region_counties"))
    areas = load_protected_areas(conn, region_code, region, dry_run, ds.get("protected_areas"))

    print(f"  -> protected_areas: {areas['written']} written, {areas['retired']} retired")
    print(f"  -> region_counties: {counties['written']} written")


# --------------------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------------------
def summarise(conn) -> None:
    print("\nDatabase contents")
    print("-" * 60)
    for table in ("sources", "regions", "region_counties", "protected_areas",
                  "area_activities", "padus_access_codes", "agencies",
                  "region_agencies", "retrievals", "hunting_draws"):
        n = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        print(f"  {table:<20} {n:>6}")
    live = conn.execute(
        "SELECT COUNT(*) FROM protected_areas WHERE retired_at IS NULL").fetchone()[0]
    retired = conn.execute(
        "SELECT COUNT(*) FROM protected_areas WHERE retired_at IS NOT NULL").fetchone()[0]
    print(f"\n  protected_areas live={live} retired={retired}")


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Build/refresh the official-sources SQLite database.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("--db", type=Path, default=DEFAULT_DB, help=f"database path (default {DEFAULT_DB})")
    ap.add_argument("--region", action="append", help="region code (repeatable; default all)")
    ap.add_argument("--rebuild", action="store_true", help="delete the database file first")
    ap.add_argument("--dry-run", action="store_true", help="fetch and report, write nothing")
    ap.add_argument("--list-regions", action="store_true", help="list configured regions and exit")
    ap.add_argument("--fetch-only", action="store_true",
                    help="fetch to data/cache/<region>.json and exit; safe to run in parallel")
    ap.add_argument("--from-cache", action="store_true",
                    help="load from data/cache/ instead of the network (single writer)")
    args = ap.parse_args()

    if args.list_regions:
        for code, r in REGIONS.items():
            extent = "statewide" if r.get("kind") == "state" else f"{r['radius_mi']:.0f} mi radius"
            print(f"{code:<18} {r['name']:<34} {extent}")
        return 0

    codes = args.region or list(REGIONS)
    unknown = [c for c in codes if c not in REGIONS]
    if unknown:
        print(f"Unknown region(s): {', '.join(unknown)}", file=sys.stderr)
        print(f"Known: {', '.join(REGIONS)}", file=sys.stderr)
        return 2

    # Fetch-only: no database is opened at all, so any number of these can run at once.
    if args.fetch_only:
        rc = 0
        for code in codes:
            try:
                payload = fetch_region(code)
                path = write_cache(code, payload)
                counts = {k: len(v["features"]) for k, v in payload["datasets"].items()}
                print(f"{code}: {counts} -> {path} ({path.stat().st_size/1e6:.1f} MB)")
            except Exception as exc:
                print(f"{code}: FETCH FAILED: {exc}", file=sys.stderr)
                rc = 1
        return rc

    if args.rebuild and args.db.exists() and not args.dry_run:
        print(f"--rebuild: removing {args.db}")
        args.db.unlink()

    args.db.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(args.db)
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        init_schema(conn)
        for code in codes:
            load_region(conn, code, dry_run=args.dry_run, use_cache=args.from_cache)
        if args.dry_run:
            print("\n--dry-run: no changes written")
            conn.rollback()
        else:
            conn.commit()
            summarise(conn)
            print(f"\nWrote {args.db}  ({args.db.stat().st_size / 1_048_576:.1f} MB)")
    except Exception as exc:
        conn.rollback()
        print(f"\nFAILED: {exc}", file=sys.stderr)
        return 1
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
