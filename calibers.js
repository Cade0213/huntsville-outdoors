// Big Game & Calibers tab: pick an animal, drag a shot distance, and watch which common cartridges
// still carry enough energy there. Up to three can be compared on an energy-vs-distance chart.
//
// Same shape as almanac.js: loaded before script.js and runs nothing at load. script.js calls
// initCalibers() from its start block and renderCalibers() from refreshAll() — the latter only
// refreshes the official-links section, so dragging the slider never fights a re-render.
//
// Where the numbers come from — NONE of this is official government data:
//   Species       hand-written size classes and an energy RULE OF THUMB per animal. Hunting
//                 folklore for orientation, not a legal minimum anywhere.
//   Cartridges    typical factory-load figures (bullet weight, muzzle velocity, G1 ballistic
//                 coefficient). Approximate; real loads vary by manufacturer and barrel.
//   Energy        COMPUTED here: E = grains · fps² / 450,436, with velocity decayed by a
//                 simplified exponential drag model (see bgVelocity), loosely fitted to a few
//                 spitzer rifle loads. Accuracy is unmeasured, and it is least reliable for slow,
//                 low-BC projectiles (12 ga slug, .45-70, .350 Legend) — the slug past ~150 yd
//                 especially. Good for comparing, not for dope.
//   Photos        U.S. Fish & Wildlife Service, each marked "Public Domain" on its FWS.gov media
//                 page (BG_PHOTOS below records the page, credit and retrieval date). Cropped and
//                 resized into images/species/; the originals are unaltered on FWS.gov.
//   Legal rules   not carried at all. Legal firearms, calibers and methods of take belong to the
//                 state agency; the official section links there from states.js.

const CALIBERS_DISCLAIMER =
  "Big Game & Calibers is general guidance only, not an official source. Cartridge figures are " +
  "typical factory-load values, energy is estimated with a simplified model, and the energy " +
  "thresholds are a common hunting rule of thumb, not a legal standard. Legal firearms, calibers " +
  "and methods of take vary by state, season and zone. Always verify with the official state " +
  "wildlife agency.";

// size: 1–5 for the size dots. minE: rule-of-thumb impact energy in ft·lb.
const BG_SPECIES = [
  { id: "pronghorn", tag: "PR", name: "Pronghorn", size: 1, sizeLabel: "Light-framed", minE: 1000,
    note: "Thin-skinned and light, but wary and usually found in open country, so shots tend to run long." },
  { id: "whitetail", tag: "WT", name: "Whitetail deer", size: 2, sizeLabel: "Medium", minE: 1000,
    note: "Hunted almost everywhere. In the woods most shots are close; field edges and crop fields stretch them out." },
  { id: "muledeer", tag: "MD", name: "Mule deer", size: 2, sizeLabel: "Medium", minE: 1000,
    note: "Built like a big whitetail, but often hunted across canyons and open slopes at longer range." },
  { id: "hog", tag: "HG", name: "Feral hog", size: 2, sizeLabel: "Medium · stocky", minE: 1000,
    note: "Mature boars carry a thick shoulder shield. Bullet construction and placement matter as much as energy." },
  { id: "blackbear", tag: "BB", name: "Black bear", size: 3, sizeLabel: "Large", minE: 1500,
    note: "Heavy muscle and fat. A bullet that holds together and penetrates matters more than speed." },
  { id: "elk", tag: "EL", name: "Elk", size: 4, sizeLabel: "Very large", minE: 1500,
    note: "Big, tough and often shot across a drainage. Many hunters step up a cartridge class for elk." },
  { id: "moose", tag: "MO", name: "Moose", size: 5, sizeLabel: "Huge", minE: 2000,
    note: "The largest deer. Shots are often close, but there is a lot of animal to get through." },
  { id: "brownbear", tag: "GB", name: "Brown / grizzly bear", size: 5, sizeLabel: "Huge · dangerous", minE: 2500,
    note: "Dangerous game. Heavy, deep-penetrating bullets at close range are the norm." },
];

// One public-domain USFWS photo per species. `page` is the FWS.gov media page that states the
// rights; every one read "Media Usage Rights/License: Public Domain" when retrieved.
const BG_PHOTO_RETRIEVED = "2026-09-22";
const BG_PHOTOS = {
  pronghorn: { credit: "Tom Koerner/USFWS", page: "https://www.fws.gov/media/pronghorn-0" },
  whitetail: { credit: "Irene Hinke-Sacilotto/USFWS", page: "https://www.fws.gov/media/white-tailed-buck-marsh-0" },
  muledeer: { credit: "Gannon Castle/USFWS", page: "https://www.fws.gov/media/mule-deer-buck-0" },
  hog: { credit: "Waccamaw NWR/USFWS", page: "https://www.fws.gov/media/feral-hogs-invasive-species" },
  blackbear: { credit: "Beverly Meekins, Pocosin Lakes NWR (USFWS)", page: "https://www.fws.gov/media/black-bear-stands-pocosin-lakes-refuge" },
  elk: { credit: "Lane Wintermute/USFWS", page: "https://www.fws.gov/media/bull-elk-0" },
  moose: { credit: "Tom Koerner/USFWS", page: "https://www.fws.gov/media/bull-moose" },
  brownbear: { credit: "U.S. Fish and Wildlife Service", page: "https://www.fws.gov/media/grizzly-bear-greater-yellowstone-ecosystem" },
};

function bgPhoto(id, cls) {
  return `<img class="${cls}" src="images/species/${id}.jpg" width="480" height="360" alt="" loading="lazy" decoding="async" />`;
}

// Typical factory loads (approximate). recoil: 1 (mild) – 5 (heavy), a felt-recoil class.
const BG_CARTRIDGES = [
  { id: "243",    name: ".243 Win",        gr: 100, fps: 2960, bc: 0.405, recoil: 1, kind: "Rifle" },
  { id: "65cm",   name: "6.5 Creedmoor",   gr: 143, fps: 2700, bc: 0.625, recoil: 1, kind: "Rifle" },
  { id: "350l",   name: ".350 Legend",     gr: 180, fps: 2100, bc: 0.23,  recoil: 1, kind: "Straight-wall" },
  { id: "7mm08",  name: "7mm-08 Rem",      gr: 140, fps: 2800, bc: 0.45,  recoil: 2, kind: "Rifle" },
  { id: "270",    name: ".270 Win",        gr: 130, fps: 3060, bc: 0.435, recoil: 2, kind: "Rifle" },
  { id: "308",    name: ".308 Win",        gr: 150, fps: 2820, bc: 0.40,  recoil: 2, kind: "Rifle" },
  { id: "3006",   name: ".30-06 Sprg",     gr: 180, fps: 2700, bc: 0.48,  recoil: 3, kind: "Rifle" },
  { id: "450bm",  name: ".450 Bushmaster", gr: 250, fps: 2200, bc: 0.20,  recoil: 3, kind: "Straight-wall" },
  { id: "7rm",    name: "7mm Rem Mag",     gr: 160, fps: 2950, bc: 0.53,  recoil: 3, kind: "Magnum" },
  { id: "300wm",  name: ".300 Win Mag",    gr: 180, fps: 2960, bc: 0.50,  recoil: 4, kind: "Magnum" },
  { id: "4570",   name: ".45-70 Govt",     gr: 300, fps: 1850, bc: 0.23,  recoil: 4, kind: "Straight-wall" },
  { id: "338wm",  name: ".338 Win Mag",    gr: 225, fps: 2780, bc: 0.45,  recoil: 5, kind: "Magnum" },
  { id: "375hh",  name: ".375 H&H",        gr: 300, fps: 2530, bc: 0.40,  recoil: 5, kind: "Magnum" },
  { id: "12slug", name: "12 ga slug",      gr: 437, fps: 1600, bc: 0.10,  recoil: 5, kind: "Shotgun" },
];

const BG_MAX_YARDS = 500;
const BG_MAX_COMPARE = 3;
// Categorical slots for the compare chart. A cartridge keeps its slot while it stays selected,
// so removing one never repaints the others.
const BG_SERIES = ["#2a78d6", "#eb6834", "#1baf7a"];
const BG_PRESETS = [
  [75, "Thick woods"],
  [200, "Field edge"],
  [350, "Open country"],
];

const bgState = { species: "whitetail", yards: 150, sort: "energy", compare: [] }; // compare: [{ id, slot }]
const BG_STORE_KEY = "plw.calibers";

const $bg = (id) => document.getElementById(id);
const bgNum = (n) => Math.round(n).toLocaleString("en-US");

// ---------- Ballistics (simplified) ----------
// Exponential velocity decay, v = v0 · e^(−k·feet), with k = 1.23e-4 / BC. Loosely fitted to a few
// spitzer loads (.308 150 gr, 6.5 CM 143 gr, .30-06 180 gr); approximate by design.
function bgVelocity(c, yards) {
  return c.fps * Math.exp((-1.23e-4 / c.bc) * yards * 3);
}
function bgEnergy(c, yards) {
  const v = bgVelocity(c, yards);
  return (c.gr * v * v) / 450436;
}
// Farthest distance (5 yd steps, capped) the cartridge still meets the rule of thumb. 0 = never.
function bgReach(c, minE) {
  let reach = 0;
  for (let y = 0; y <= 800; y += 5) {
    if (bgEnergy(c, y) >= minE) reach = y;
    else break;
  }
  return reach;
}
function bgRating(energy, minE) {
  if (energy < minE * 0.85) return { key: "short", label: "Falls short", icon: "✕" };
  if (energy < minE) return { key: "marginal", label: "Borderline", icon: "!" };
  if (energy > minE * 3) return { key: "plenty", label: "More than enough", icon: "▲" };
  return { key: "good", label: "Good match", icon: "✓" };
}

const BG_SCALE_MAX = Math.max(...BG_CARTRIDGES.map((c) => bgEnergy(c, 0)));

function bgSpecies() {
  return BG_SPECIES.find((s) => s.id === bgState.species) || BG_SPECIES[1];
}
function bgCartridge(id) {
  return BG_CARTRIDGES.find((c) => c.id === id);
}

// Lightest-recoiling cartridge that is a "Good match" at the current distance; ties go to energy.
function bgBestPick() {
  const sp = bgSpecies();
  return BG_CARTRIDGES
    .map((c) => ({ c, e: bgEnergy(c, bgState.yards) }))
    .filter(({ e }) => bgRating(e, sp.minE).key === "good")
    .sort((a, b) => a.c.recoil - b.c.recoil || b.e - a.e)[0]?.c || null;
}

// ---------- Persistence (per-viewer convenience only) ----------
function bgLoad() {
  try {
    const saved = JSON.parse(localStorage.getItem(BG_STORE_KEY) || "null");
    if (!saved) return;
    if (BG_SPECIES.some((s) => s.id === saved.species)) bgState.species = saved.species;
    if (Number.isFinite(saved.yards)) bgState.yards = Math.min(BG_MAX_YARDS, Math.max(0, saved.yards));
    if (["energy", "recoil", "name"].includes(saved.sort)) bgState.sort = saved.sort;
    if (Array.isArray(saved.compare)) {
      bgState.compare = saved.compare
        .filter((e) => e && bgCartridge(e.id) && e.slot >= 0 && e.slot < BG_MAX_COMPARE)
        .slice(0, BG_MAX_COMPARE);
    }
  } catch {}
}
function bgSave() {
  try { localStorage.setItem(BG_STORE_KEY, JSON.stringify(bgState)); } catch {}
}

// ---------- Static shell ----------
function bgSizeDots(n) {
  return `<span class="bg-dots" aria-hidden="true">${[1, 2, 3, 4, 5]
    .map((i) => `<i class="${i <= n ? "on" : ""}"></i>`).join("")}</span>`;
}

function bgRecoilDots(n) {
  return `<span class="bg-recoil" role="img" aria-label="Recoil ${n} of 5">${[1, 2, 3, 4, 5]
    .map((i) => `<i class="${i <= n ? "on" : ""}"></i>`).join("")}</span>`;
}

function bgShell() {
  return `
    <section class="bg-section" aria-labelledby="bg-pick-h">
      <div class="panel-heading">
        <h2 id="bg-pick-h">Pick your animal</h2>
        <p class="sub">Everything below re-scores itself for the animal you choose.</p>
      </div>
      <div class="bg-species" id="bg-species" role="radiogroup" aria-labelledby="bg-pick-h">
        ${BG_SPECIES.map((s) => `
          <button type="button" class="bg-animal" role="radio" data-species="${s.id}" aria-checked="false" tabindex="-1">
            <span class="bg-animal-art">${bgPhoto(s.id, "bg-photo")}</span>
            <span class="bg-animal-name">${escapeHtml(s.name)}</span>
            <span class="bg-animal-size">${bgSizeDots(s.size)}<span>${escapeHtml(s.sizeLabel)}</span></span>
          </button>`).join("")}
      </div>
    </section>

    <section class="bg-focus" aria-label="Selected animal and shot distance">
      <div class="bg-focus-main">
        <div class="bg-focus-head">
          <figure class="bg-focus-art">
            <img id="bg-focus-img" class="bg-photo" width="480" height="360" alt="" decoding="async" />
            <figcaption id="bg-focus-credit"></figcaption>
          </figure>
          <div>
            <h2 id="bg-focus-name"></h2>
            <p id="bg-focus-note"></p>
          </div>
        </div>
        <div class="bg-focus-stats">
          <div><span class="bg-k">Rule of thumb</span><span class="bg-v" id="bg-focus-min"></span></div>
          <div><span class="bg-k">Good matches here</span><span class="bg-v" id="bg-focus-count"></span></div>
          <div class="bg-best"><span class="bg-k">Lightest-recoil match</span><span class="bg-v" id="bg-focus-best"></span></div>
        </div>
      </div>
      <div class="bg-range">
        <label for="bg-yards" class="bg-range-label">
          <span>Shot distance</span>
          <output id="bg-yards-out" for="bg-yards"></output>
        </label>
        <input type="range" id="bg-yards" min="0" max="${BG_MAX_YARDS}" step="25" />
        <div class="bg-ticks" aria-hidden="true">${[0, 100, 200, 300, 400, 500].map((y) => `<span>${y}</span>`).join("")}</div>
        <div class="bg-presets" role="group" aria-label="Distance presets">
          ${BG_PRESETS.map(([y, label]) => `<button type="button" class="bg-chip" data-yards="${y}">${label} <small>${y} yd</small></button>`).join("")}
        </div>
        <p class="bg-live" id="bg-live" aria-live="polite"></p>
      </div>
    </section>

    <div class="bg-grid">
      <section class="bg-section" aria-labelledby="bg-lineup-h">
        <div class="bg-section-head">
          <div class="panel-heading">
            <h2 id="bg-lineup-h">Cartridge lineup</h2>
            <p class="sub">Energy left at your distance. The notch marks the rule of thumb. Tap <b>+</b> to compare.</p>
          </div>
          <div class="bg-sort" role="radiogroup" aria-label="Sort cartridges">
            ${[["energy", "Energy"], ["recoil", "Recoil"], ["name", "A–Z"]].map(([k, l]) =>
              `<label><input type="radio" name="bg-sort" value="${k}" /><span>${l}</span></label>`).join("")}
          </div>
        </div>
        <ul class="bg-lineup" id="bg-lineup">
          ${BG_CARTRIDGES.map((c) => `
            <li class="bg-row" data-id="${c.id}">
              <div class="bg-row-name">
                <strong>${escapeHtml(c.name)}</strong>
                <span>${c.gr} gr · ${escapeHtml(c.kind)} ${bgRecoilDots(c.recoil)}</span>
              </div>
              <div class="bg-bar" aria-hidden="true"><i></i><b></b></div>
              <div class="bg-row-e"><strong></strong><span>ft·lb</span></div>
              <span class="bg-rate"></span>
              <button type="button" class="bg-add" data-compare="${c.id}" aria-pressed="false"
                aria-label="Compare ${escapeHtml(c.name)}">+</button>
            </li>`).join("")}
        </ul>
        <ul class="bg-legend" aria-label="Rating key">
          <li><span class="bg-rate good"><span aria-hidden="true">✓</span>Good match</span> meets the rule of thumb</li>
          <li><span class="bg-rate marginal"><span aria-hidden="true">!</span>Borderline</span> within 15% under it</li>
          <li><span class="bg-rate short"><span aria-hidden="true">✕</span>Falls short</span> well under it</li>
          <li><span class="bg-rate plenty"><span aria-hidden="true">▲</span>More than enough</span> 3× or more, usually more recoil than needed</li>
        </ul>
      </section>

      <section class="bg-section bg-compare" aria-labelledby="bg-compare-h">
        <div class="panel-heading">
          <h2 id="bg-compare-h">Head to head</h2>
          <p class="sub" id="bg-compare-sub"></p>
        </div>
        <div id="bg-compare-body"></div>
      </section>
    </div>

    <div id="bg-official"></div>

    <p class="fine-print">
      Energy is only one part of a clean, ethical shot. Bullet construction, shot placement, practice and knowing
      your own limits matter at least as much. Figures here are estimates from typical factory loads and a
      simplified drag model; your rifle and ammunition will differ.
    </p>
    <p class="fine-print bg-credits">
      <strong>Photos:</strong> U.S. Fish &amp; Wildlife Service, public domain (retrieved ${BG_PHOTO_RETRIEVED}) —
      ${BG_SPECIES.map((sp) => `<a href="${BG_PHOTOS[sp.id].page}" target="_blank" rel="noopener">${escapeHtml(sp.name)}</a>
        (${escapeHtml(BG_PHOTOS[sp.id].credit)})`).join(", ")}.
    </p>`;
}

// ---------- Live updates ----------
function bgUpdateSpecies() {
  const sp = bgSpecies();
  document.querySelectorAll("#bg-species .bg-animal").forEach((b) => {
    const on = b.dataset.species === sp.id;
    b.setAttribute("aria-checked", String(on));
    b.tabIndex = on ? 0 : -1;
  });
  const img = $bg("bg-focus-img");
  img.src = `images/species/${sp.id}.jpg`;
  img.alt = sp.name;
  $bg("bg-focus-credit").textContent = `Photo: ${BG_PHOTOS[sp.id].credit}`;
  $bg("bg-focus-name").textContent = sp.name;
  $bg("bg-focus-note").textContent = sp.note;
  $bg("bg-focus-min").textContent = `${bgNum(sp.minE)} ft·lb`;
}

function bgUpdateRows() {
  const sp = bgSpecies();
  const y = bgState.yards;
  let good = 0;
  const threshold = `${(sp.minE / BG_SCALE_MAX) * 100}%`;

  document.querySelectorAll("#bg-lineup .bg-row").forEach((row) => {
    const c = bgCartridge(row.dataset.id);
    const e = bgEnergy(c, y);
    const r = bgRating(e, sp.minE);
    if (r.key === "good") good++;
    row.dataset.rate = r.key;
    row.dataset.energy = String(e);
    row.querySelector(".bg-bar i").style.transform = `scaleX(${Math.min(1, e / BG_SCALE_MAX)})`;
    row.querySelector(".bg-bar b").style.left = threshold;
    row.querySelector(".bg-row-e strong").textContent = bgNum(e);
    const rate = row.querySelector(".bg-rate");
    rate.className = `bg-rate ${r.key}`;
    rate.innerHTML = `<span aria-hidden="true">${r.icon}</span>${r.label}`;
    const inCompare = bgState.compare.some((x) => x.id === c.id);
    const btn = row.querySelector(".bg-add");
    btn.setAttribute("aria-pressed", String(inCompare));
    btn.textContent = inCompare ? "✓" : "+";
    btn.disabled = !inCompare && bgState.compare.length >= BG_MAX_COMPARE;
    const slot = bgState.compare.find((x) => x.id === c.id)?.slot;
    row.style.setProperty("--series", slot == null ? "transparent" : BG_SERIES[slot]);
    row.classList.toggle("is-compared", inCompare);
  });

  const best = bgBestPick();
  $bg("bg-focus-count").textContent = `${good} of ${BG_CARTRIDGES.length}`;
  $bg("bg-focus-best").innerHTML = best
    ? `<button type="button" class="bg-best-btn" data-compare="${best.id}"${
        bgState.compare.length >= BG_MAX_COMPARE && !bgState.compare.some((x) => x.id === best.id)
          ? ` disabled title="Compare is full — remove one to add this"` : ""}>${escapeHtml(best.name)}</button>`
    : "None at this distance";
  $bg("bg-yards-out").textContent = `${y} yd`;
  $bg("bg-yards").value = String(y);
  $bg("bg-yards").setAttribute("aria-valuetext", `${y} yards`);
  $bg("bg-yards").style.setProperty("--pct", `${(y / BG_MAX_YARDS) * 100}%`);
  document.querySelectorAll(".bg-presets .bg-chip").forEach((b) =>
    b.classList.toggle("is-on", Number(b.dataset.yards) === y));
  $bg("bg-live").textContent =
    `At ${y} yards, ${good} of ${BG_CARTRIDGES.length} cartridges are a good match for ${sp.name.toLowerCase()}.`;

  bgSortRows();
}

// Reorder rows by the chosen sort. FLIP-animated so rows glide rather than jump.
function bgSortRows() {
  const list = $bg("bg-lineup");
  const rows = [...list.children];
  const key = bgState.sort;
  const sorted = [...rows].sort((a, b) => {
    const ca = bgCartridge(a.dataset.id), cb = bgCartridge(b.dataset.id);
    if (key === "name") return ca.name.replace(/^\W+/, "").localeCompare(cb.name.replace(/^\W+/, ""), "en", { numeric: true });
    if (key === "recoil") return ca.recoil - cb.recoil || Number(b.dataset.energy) - Number(a.dataset.energy);
    return Number(b.dataset.energy) - Number(a.dataset.energy);
  });
  if (sorted.every((r, i) => r === rows[i])) return;

  const animate = window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
  const before = animate ? new Map(rows.map((r) => [r, r.getBoundingClientRect().top])) : null;
  sorted.forEach((r) => list.appendChild(r));
  if (!animate) return;
  sorted.forEach((r) => {
    const dy = before.get(r) - r.getBoundingClientRect().top;
    if (!dy) return;
    r.animate([{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }],
      { duration: 280, easing: "cubic-bezier(.2,.8,.2,1)" });
  });
}

// ---------- Compare chart + table ----------
function bgNiceMax(v) {
  const step = v > 3000 ? 1000 : 500;
  return Math.ceil(v / step) * step;
}

function bgCompareChart(width) {
  const sp = bgSpecies();
  const picks = bgState.compare.map((x) => ({ ...x, c: bgCartridge(x.id) }));
  const W = Math.max(280, Math.round(width));
  const H = W < 480 ? 220 : 260;
  const m = { t: 14, r: W < 480 ? 78 : 104, b: 30, l: 46 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const yMax = bgNiceMax(Math.max(sp.minE * 1.2, ...picks.map((p) => bgEnergy(p.c, 0))));
  const x = (yd) => m.l + (yd / BG_MAX_YARDS) * iw;
  const y = (e) => m.t + ih - (e / yMax) * ih;
  const yStep = yMax > 3000 ? 1000 : 500;

  let grid = "";
  for (let e = 0; e <= yMax; e += yStep) {
    grid += `<line x1="${m.l}" x2="${m.l + iw}" y1="${y(e)}" y2="${y(e)}" class="${e ? "g" : "base"}"/>
      <text x="${m.l - 6}" y="${y(e) + 4}" text-anchor="end" class="t">${e ? bgNum(e) : "0"}</text>`;
  }
  for (let yd = 0; yd <= BG_MAX_YARDS; yd += 100) {
    grid += `<text x="${x(yd)}" y="${H - 10}" text-anchor="middle" class="t">${yd}${yd === BG_MAX_YARDS ? " yd" : ""}</text>`;
  }

  const lines = picks.map((p) => {
    let d = "";
    for (let yd = 0; yd <= BG_MAX_YARDS; yd += 10) d += `${yd ? "L" : "M"}${x(yd).toFixed(1)},${y(bgEnergy(p.c, yd)).toFixed(1)}`;
    return `<path d="${d}" class="ln" stroke="${BG_SERIES[p.slot]}"/>`;
  }).join("");

  // Direct labels at the right end, nudged apart so they never overlap.
  const labels = picks
    .map((p) => ({ p, ly: y(bgEnergy(p.c, BG_MAX_YARDS)) }))
    .sort((a, b) => a.ly - b.ly);
  for (let i = 1; i < labels.length; i++) labels[i].ly = Math.max(labels[i].ly, labels[i - 1].ly + 14);
  const labelSvg = labels.map(({ p, ly }) =>
    `<text x="${m.l + iw + 8}" y="${ly + 4}" class="dl">${escapeHtml(p.c.name)}</text>`).join("");

  const cur = bgState.yards;
  const curDots = picks.map((p) =>
    `<circle cx="${x(cur)}" cy="${y(bgEnergy(p.c, cur))}" r="4.5" fill="${BG_SERIES[p.slot]}" class="dot"/>`).join("");

  return `
    <svg class="bg-chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img"
      aria-label="Energy versus distance for ${escapeHtml(picks.map((p) => p.c.name).join(", "))}. Details in the table below.">
      ${grid}
      <line x1="${m.l}" x2="${m.l + iw}" y1="${y(sp.minE)}" y2="${y(sp.minE)}" class="thr"/>
      <text x="${m.l + 4}" y="${y(sp.minE) - 5}" class="thr-t">${escapeHtml(sp.name)} rule of thumb · ${bgNum(sp.minE)}</text>
      <line x1="${x(cur)}" x2="${x(cur)}" y1="${m.t}" y2="${m.t + ih}" class="cur"/>
      ${lines}${curDots}${labelSvg}
      <line class="hair" x1="0" x2="0" y1="${m.t}" y2="${m.t + ih}" visibility="hidden"/>
      <rect class="hit" x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" data-l="${m.l}" data-w="${iw}"/>
    </svg>
    <div class="bg-tip" hidden></div>`;
}

function bgCompareTable() {
  const sp = bgSpecies();
  const picks = bgState.compare.map((x) => ({ ...x, c: bgCartridge(x.id) }));
  const rowsDef = [
    ["Bullet", (c) => `${c.gr} gr`],
    ["Muzzle velocity", (c) => `${bgNum(c.fps)} fps`],
    ["Muzzle energy", (c) => `${bgNum(bgEnergy(c, 0))} ft·lb`],
    [`Energy at ${bgState.yards} yd`, (c) => {
      const e = bgEnergy(c, bgState.yards);
      const r = bgRating(e, sp.minE);
      return `${bgNum(e)} ft·lb <span class="bg-rate ${r.key}"><span aria-hidden="true">${r.icon}</span>${r.label}</span>`;
    }],
    [`Meets ${bgNum(sp.minE)} ft·lb to`, (c) => {
      const reach = bgReach(c, sp.minE);
      return reach === 0 ? "Never" : reach > BG_MAX_YARDS ? `${BG_MAX_YARDS}+ yd` : `~${reach} yd`;
    }],
    ["Recoil", (c) => bgRecoilDots(c.recoil)],
    ["Type", (c) => escapeHtml(c.kind)],
  ];
  return `
    <div class="bg-table-wrap">
      <table class="bg-table">
        <thead><tr><th scope="col"><span class="sr-only">Measure</span></th>${picks.map((p) => `
          <th scope="col"><span class="bg-swatch" style="background:${BG_SERIES[p.slot]}"></span>${escapeHtml(p.c.name)}
            <button type="button" class="bg-x" data-compare="${p.c.id}" aria-label="Remove ${escapeHtml(p.c.name)}">×</button></th>`).join("")}
        </tr></thead>
        <tbody>${rowsDef.map(([label, fn]) => `
          <tr><th scope="row">${label}</th>${picks.map((p) => `<td>${fn(p.c)}</td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function bgRenderCompare() {
  const body = $bg("bg-compare-body");
  const n = bgState.compare.length;
  $bg("bg-compare-sub").textContent = n
    ? `Energy from muzzle to ${BG_MAX_YARDS} yards. Hover or tap the chart to read it, or click to set the distance.`
    : "";
  if (!n) {
    body.innerHTML = `
      <div class="bg-empty">
        <p><strong>Pick up to three cartridges</strong> with <b>+</b> to see their energy curves side by side.</p>
        <div class="bg-quick">
          <button type="button" class="bg-chip" data-set="243,308,3006">Classic deer trio</button>
          <button type="button" class="bg-chip" data-set="65cm,7rm,300wm">Long-range elk</button>
          <button type="button" class="bg-chip" data-set="350l,450bm,4570">Straight-wall</button>
        </div>
      </div>`;
    return;
  }
  const width = body.clientWidth || 600;
  body.innerHTML = `<div class="bg-chart-wrap">${bgCompareChart(width)}</div>${bgCompareTable()}`;
}

function bgToggleCompare(id) {
  const i = bgState.compare.findIndex((x) => x.id === id);
  if (i >= 0) bgState.compare.splice(i, 1);
  else if (bgState.compare.length < BG_MAX_COMPARE) {
    const used = new Set(bgState.compare.map((x) => x.slot));
    const slot = [0, 1, 2].find((s) => !used.has(s));
    bgState.compare.push({ id, slot });
  }
  bgRefresh();
}

function bgRefresh() {
  bgUpdateSpecies();
  bgUpdateRows();
  bgRenderCompare();
  bgSave();
}

// Chart hover: crosshair + tooltip reading every series at the pointer's distance.
function bgChartPointer(e) {
  const hit = e.target.closest(".bg-chart .hit");
  const wrap = $bg("bg-compare-body").querySelector(".bg-chart-wrap");
  if (!wrap) return null;
  const svg = wrap.querySelector("svg");
  const tip = $bg("bg-compare-body").querySelector(".bg-tip");
  if (!hit) {
    svg.querySelector(".hair").setAttribute("visibility", "hidden");
    tip.hidden = true;
    return null;
  }
  const box = svg.getBoundingClientRect();
  const scale = box.width / svg.viewBox.baseVal.width;
  const l = Number(hit.dataset.l), w = Number(hit.dataset.w);
  const px = (e.clientX - box.left) / scale;
  const yd = Math.round(Math.min(1, Math.max(0, (px - l) / w)) * BG_MAX_YARDS / 5) * 5;
  const hx = l + (yd / BG_MAX_YARDS) * w;
  const hair = svg.querySelector(".hair");
  hair.setAttribute("x1", hx);
  hair.setAttribute("x2", hx);
  hair.setAttribute("visibility", "visible");

  const sp = bgSpecies();
  tip.innerHTML = `<strong>${yd} yd</strong>` + bgState.compare.map((x) => {
    const c = bgCartridge(x.id);
    const en = bgEnergy(c, yd);
    return `<span><i style="background:${BG_SERIES[x.slot]}"></i>${escapeHtml(c.name)}<b>${bgNum(en)}</b>${en >= sp.minE ? "" : " <em>below</em>"}</span>`;
  }).join("");
  tip.hidden = false;
  const wrapBox = wrap.getBoundingClientRect();
  const left = hx * scale + (box.left - wrapBox.left);
  const tipW = tip.offsetWidth;
  tip.style.left = `${Math.min(wrapBox.width - tipW - 4, Math.max(4, left + 12 + tipW > wrapBox.width ? left - tipW - 12 : left + 12))}px`;
  return yd;
}

// ---------- Official links (re-rendered from refreshAll) ----------
function renderCalibers() {
  const root = $bg("bg-official");
  if (!root) return;
  const { search, areaStates } = appState;
  const abbrs = (areaStates.length ? areaStates : [search.state]).filter((a) => STATES[a]);
  const cards = abbrs.flatMap((a) =>
    STATES[a].agencies.map(([name, url]) => `
      <a class="alm-agency" href="${escapeHtml(url)}" target="_blank" rel="noopener">
        <span class="alm-agency-abbr" aria-hidden="true">${escapeHtml(a)}</span>
        <span class="alm-agency-body">
          <strong>${escapeHtml(name)}</strong>
          <span>Legal firearms, cartridges and methods of take for ${escapeHtml(STATES[a].name)}.</span>
        </span>
        <span class="alm-agency-go" aria-hidden="true">&rarr;</span>
      </a>`)
  );
  root.innerHTML = `
    <section class="bg-section bg-official" aria-labelledby="bg-official-h">
      <div class="panel-heading">
        <h2 id="bg-official-h">What's legal where you hunt</h2>
        <p class="sub">This page makes no legal claims. Which firearms, cartridges and methods of take are allowed is
          set by each state and often changes by season, zone and land type. Check before you choose a rifle.</p>
      </div>
      ${cards.length
        ? `<div class="alm-agencies">${cards.join("")}</div>`
        : `<p class="notice">Search a U.S. city to see its state wildlife agency.</p>`}
    </section>`;
}

function initCalibers() {
  const body = $bg("calibers-body");
  if (!body) return;
  $bg("calibers-disclaimer").textContent = CALIBERS_DISCLAIMER;
  bgLoad();
  body.innerHTML = bgShell();
  const sortInput = body.querySelector(`input[name="bg-sort"][value="${bgState.sort}"]`);
  if (sortInput) sortInput.checked = true;

  const species = $bg("bg-species");
  species.addEventListener("click", (e) => {
    const b = e.target.closest(".bg-animal");
    if (!b) return;
    bgState.species = b.dataset.species;
    bgRefresh();
  });
  // Roving tabindex radiogroup: arrows move and select.
  species.addEventListener("keydown", (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const i = BG_SPECIES.findIndex((s) => s.id === bgState.species);
    const n = BG_SPECIES.length;
    const next = e.key === "Home" ? 0 : e.key === "End" ? n - 1 : (i + step + n) % n;
    bgState.species = BG_SPECIES[next].id;
    bgRefresh();
    species.querySelector(`[data-species="${bgState.species}"]`).focus();
  });

  let raf = 0;
  $bg("bg-yards").addEventListener("input", (e) => {
    bgState.yards = Number(e.target.value);
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(bgRefresh);
  });

  body.addEventListener("change", (e) => {
    if (e.target.name === "bg-sort") {
      bgState.sort = e.target.value;
      bgSortRows();
      bgSave();
    }
  });

  body.addEventListener("click", (e) => {
    const preset = e.target.closest("[data-yards]");
    if (preset) { bgState.yards = Number(preset.dataset.yards); return bgRefresh(); }
    const set = e.target.closest("[data-set]");
    if (set) {
      bgState.compare = set.dataset.set.split(",").map((id, slot) => ({ id, slot }));
      return bgRefresh();
    }
    const cmp = e.target.closest("[data-compare]");
    if (cmp) {
      // The best-pick shortcut only ever adds; the lineup and table buttons toggle.
      if (cmp.classList.contains("bg-best-btn") && bgState.compare.some((x) => x.id === cmp.dataset.compare)) return;
      return bgToggleCompare(cmp.dataset.compare);
    }
    if (e.target.closest(".bg-chart .hit")) {
      const yd = bgChartPointer(e);
      if (yd != null) { bgState.yards = Math.round(yd / 25) * 25; bgRefresh(); }
    }
  });

  const cmpBody = $bg("bg-compare-body");
  cmpBody.addEventListener("pointermove", bgChartPointer);
  cmpBody.addEventListener("pointerleave", () => bgChartPointer({ target: cmpBody }));

  // The chart is drawn at its real pixel width so text stays legible on phones. Redraw when the
  // box changes size — including the first time the view is shown (it starts display:none).
  let lastW = 0;
  new ResizeObserver(([entry]) => {
    const w = Math.round(entry.contentRect.width);
    if (w && Math.abs(w - lastW) > 8) { lastW = w; bgRenderCompare(); }
  }).observe(cmpBody);

  bgRefresh();
  renderCalibers();
}
