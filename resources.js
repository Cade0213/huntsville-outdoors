// Licenses, permits, and local retailers.
// RESOURCES is hand-checked Huntsville / Alabama info (verified 2026-09-14 against each business or
// agency website). Everywhere else we show the state agencies for the search area plus shops from
// OpenStreetMap, which are community-mapped and may be incomplete.

const RESOURCES = {
  licenses: [
    {
      name: "My Outdoor Alabama (buy online)",
      detail:
        "ADCNR's official license system for buying and printing hunting & fishing licenses and permits. Also available through the Outdoor AL mobile app.",
      phone: "1-888-848-6887",
      url: "https://myoutdooralabama.com",
      tag: "Official",
    },
    {
      name: "Madison County License Department",
      detail:
        "Hunting & fishing licenses in person at the Madison County Service Center. Non-resident hunting licenses are sold at the Courthouse (100 North Side Square) only.",
      address: "1918 Memorial Pkwy NW, Huntsville, AL",
      phone: "256-532-3323",
      url: "https://www.madisoncountyal.gov/departments/license-department/hunting",
      tag: "In person",
    },
    {
      name: "Wheeler NWR Hunt Permit 2026–27",
      detail:
        "Printable refuge permit — must be signed and carried while hunting the refuge, in addition to your state license.",
      url: "https://www.fws.gov/media/wheeler-nwr-hunt-permit-2026-2027",
      tag: "Refuge",
    },
    {
      name: "WMA rules & AREA permits",
      detail:
        "Deer, turkey and waterfowl on WMAs require a WMA License plus the area's AREA permit and daily check-in (paper or Outdoor AL app).",
      url: "https://www.outdooralabama.com/WMARules",
      tag: "WMA",
    },
    {
      name: "Federal Duck Stamp",
      detail: "Required (ages 16+) for migratory waterfowl, along with HIP certification and the state waterfowl stamp.",
      url: "https://www.fws.gov/program/federal-duck-stamp",
      tag: "Waterfowl",
    },
    {
      name: "Hunter Education",
      detail: "Required before buying your first license if born on or after August 1, 1977.",
      url: "https://www.outdooralabama.com/hunting/hunter-education-alabama",
      tag: "Required",
    },
  ],

  // Shown when Huntsville is inside the search radius.
  gear: [
    {
      name: "Bass Pro Shops (Huntsville)",
      detail: "Hunting, fishing & boating superstore with a gun library and indoor archery test area.",
      address: "7090 Cabela Dr NW, Huntsville, AL 35806",
      phone: "(256) 517-7200",
      url: "https://stores.basspro.com/us/al/huntsville/7090-cabela-drive-nw.html",
    },
    {
      name: "Academy Sports + Outdoors",
      detail: "Sporting goods chain with hunting firearms, ammo, archery and outdoor gear.",
      address: "2900 Memorial Pkwy SW, Huntsville, AL",
      phone: "(256) 539-1133",
      url: "https://www.academy.com/storelocator/alabama/huntsville/store-0265",
    },
    {
      name: "Larry's Pistol & Pawn",
      detail: "Local firearms dealer — new & used guns, ammo, and an indoor shooting range.",
      address: "2405 N Memorial Pkwy, Huntsville, AL 35810",
      phone: "256-534-1000",
      url: "https://www.pistolandpawn.com/huntsville",
    },
    {
      name: "Rural King",
      detail: "Farm & outdoor store with rifles, shotguns, handguns and ammo.",
      address: "3418 N Memorial Pkwy, Huntsville, AL 35810",
      phone: "(256) 898-0523",
      url: "https://www.rkguns.com/stores/bd/rural-king-guns-huntsville-al-118/",
    },
  ],
};

const FEDERAL_RESOURCES = [
  {
    name: "Federal Duck Stamp",
    detail: "Required nationwide (ages 16+) to hunt migratory waterfowl, along with your state's HIP certification.",
    url: "https://www.fws.gov/program/federal-duck-stamp",
    tag: "Waterfowl",
  },
];

function directionsUrl(query) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function resourceCard(r) {
  const tag = r.tag ? `<span class="res-tag">${escapeHtml(r.tag)}</span>` : "";
  const distance = r.distanceMi != null ? `<span class="res-distance">${formatMiles(r.distanceMi)}</span>` : "";
  const directionsQuery = r.address || (r.point && r.point.join(","));
  const address = directionsQuery
    ? `<div class="res-line">📍 <a href="${directionsUrl(directionsQuery)}" target="_blank" rel="noopener">${escapeHtml(r.address || "Directions")}</a></div>`
    : "";
  const phone = r.phone
    ? `<div class="res-line">📞 <a href="tel:${r.phone.replace(/[^\d+]/g, "")}">${escapeHtml(r.phone)}</a></div>`
    : "";
  const link = r.url
    ? `<a class="res-link" href="${escapeHtml(r.url)}" target="_blank" rel="noopener">${escapeHtml(r.linkText || "Visit website")} &rarr;</a>`
    : "";
  return `
    <article class="res-card">
      <div class="res-title"><h4>${escapeHtml(r.name)} ${tag}</h4>${distance}</div>
      ${r.detail ? `<p>${escapeHtml(r.detail)}</p>` : ""}
      ${address}${phone}
      ${link}
    </article>`;
}

function agencyCards(abbrs) {
  return abbrs
    .filter((a) => STATES[a])
    .flatMap((a) =>
      STATES[a].agencies.map(([name, url]) => ({
        name,
        detail: `Licenses, seasons, regulations and public hunting & fishing areas for ${STATES[a].name}.`,
        url,
        tag: STATES[a].name,
        linkText: "Official website",
      }))
    );
}

// Rendered into the "Licenses & Gear" tab whenever the search, area states or shops change.
function renderResources() {
  const { search, areaStates, shops, loading, errors } = appState;
  const abbrs = areaStates.length ? areaStates : [search.state].filter(Boolean);
  const inAlabama = abbrs.includes("AL");
  const nearHuntsville = milesBetween(search.center, HUNTSVILLE) <= search.radius;

  const licenseCards = [
    ...agencyCards(abbrs),
    ...(inAlabama ? RESOURCES.licenses.filter((r) => !/Wheeler|WMA rules|Madison County/.test(r.name) || nearHuntsville) : []),
    ...FEDERAL_RESOURCES.filter((f) => !(inAlabama && RESOURCES.licenses.some((r) => r.name === f.name))),
  ];
  document.getElementById("license-intro").textContent = abbrs.length > 1
    ? `Your ${search.radius}-mile search area crosses ${abbrs.length} states. Each state sells its own licenses — you need the license for the state you hunt or fish in.`
    : `Licenses are sold by each state. Buy from the official agency site or an authorized license agent.`;
  document.getElementById("license-list").innerHTML = licenseCards.map(resourceCard).join("");

  // Gear: hand-checked Huntsville stores first, then OpenStreetMap shops (minus duplicates).
  const curated = nearHuntsville ? RESOURCES.gear : [];
  const curatedKeys = curated.map((g) => normalizeName(g.name).split(" ").slice(0, 2).join(" "));
  const osmShops = shops
    .filter((s) => s.hasName && !curatedKeys.some((k) => normalizeName(s.name).startsWith(k)))
    .slice(0, 40)
    .map((s) => ({
      name: s.name,
      detail: s.typeLabel,
      address: s.address,
      point: s.point,
      phone: s.phone,
      url: s.website || s.osmUrl,
      linkText: s.website ? "Visit website" : "View on OpenStreetMap",
      distanceMi: s.distanceMi,
    }));

  let status = "";
  if (loading.osm) status = `<p class="loading-line"><span class="spinner"></span>Looking for gun, hunting and tackle shops…</p>`;
  else if (errors.osm) status = `<p class="notice">Couldn't reach the OpenStreetMap servers for nearby shops. Try again in a minute.</p>`;
  else if (!osmShops.length && !curated.length) status = `<p class="notice">No hunting, gun or tackle shops are mapped in OpenStreetMap within ${Math.min(search.radius, 50)} miles. Try a larger radius or a web search.</p>`;

  document.getElementById("gear-list").innerHTML =
    (curated.length ? `<h4 class="res-subhead">Huntsville-area picks <span class="badge verified">Checked</span></h4>${curated.map(resourceCard).join("")}` : "") +
    (osmShops.length ? `<h4 class="res-subhead">Mapped nearby <span class="badge unconfirmed">OpenStreetMap</span></h4>${osmShops.map(resourceCard).join("")}` : "") +
    status;
}
