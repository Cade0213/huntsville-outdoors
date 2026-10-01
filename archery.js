// Archery tab: one shot, three tools. Pick an animal, a distance and an angle, and the whole page
// answers the same question from three sides — where to aim (anatomy + arrow path), which
// broadhead fits (energy for this animal, distance and angle), and how to hold it (your pins,
// drawn to scale over the animal). A practice drill reuses all three.
//
// Same shape as calibers.js: loaded after it and before script.js, and runs nothing at load.
// script.js calls initArchery() from its start block and renderArchery() from refreshAll() — the
// latter only refreshes the official-links section, so a search never resets the controls.
//
// Where the numbers come from — NONE of this is official government data:
//   Anatomy       simplified illustrations. Body proportions, vital-zone sizes and aim points are
//                 hand-written approximations for orientation, drawn from one parametric silhouette.
//   Angles        the quartering and treestand views are a flat projection of that silhouette:
//                 near-side parts shift one way and far-side parts the other. Not a 3D model.
//   Arrow flight  COMPUTED here: speed decays as v = v0 · e^(−k·feet) with k = 5e-4 · 425/grains
//                 (about 6% lost over 40 yd for a 425 gr arrow), drop = ½·g·t². Sight geometry is
//                 fixed at 32 in eye-to-pin and 4 in pin-over-arrow. Good for comparing, not for
//                 sighting in — only shooting your own bow sets your pins.
//   Energy tiers  KE = grains · fps² / 450,240. The ft·lb tiers are a common hunting rule of thumb,
//                 not a legal minimum anywhere.
//   Broadheads    generic style descriptions with typical cut sizes. The fit rating is a heuristic
//                 in arHeadFit(), not a test result.
//   Photos        reuses the Big Game tab's public-domain USFWS photos (BG_PHOTOS in calibers.js).
//   Legal rules   not carried at all. Legal bows, draw weights, broadhead types and cutting widths
//                 belong to the state agency; the official section links there from states.js.

const ARCHERY_DISCLAIMER =
  "Archery is general guidance only, not an official source. Anatomy is a simplified illustration, " +
  "arrow speed and drop are estimated with a simplified model, and the energy tiers are a common " +
  "hunting rule of thumb, not a legal standard. Legal bows, draw weights, broadhead types, cutting " +
  "widths and archery seasons vary by state. Always verify with the official state wildlife agency.";

// Body measurements in inches (L torso length, D chest depth, H withers height, W chest width).
// vital: rough diameter of the heart–lung zone. ax/ay: aim point as a fraction of L back from the
// brisket and D down from the top line. minKE: rule-of-thumb arrow energy tier in ft·lb.
const AR_SPECIES = [
  { id: "whitetail", name: "Whitetail deer", kind: "deer", L: 44, D: 17, H: 38, W: 13, vital: 8, ax: 0.19, ay: 0.64,
    minKE: 25, size: 2, sizeLabel: "Medium", coat: "#94704f", neck: [16, 50, 9], head: [11, 6, 32], ear: 5,
    antler: "deer", tip: "Tight behind the front leg, a third of the way up the chest. Deer often drop at the shot, so many bowhunters hold toward the lower half of the vitals." },
  { id: "muledeer", name: "Mule deer", kind: "deer", L: 48, D: 20, H: 40, W: 15, vital: 9, ax: 0.19, ay: 0.63,
    minKE: 25, size: 2, sizeLabel: "Medium", coat: "#8a7563", neck: [17, 48, 10], head: [12, 7, 30], ear: 8,
    antler: "mule", tip: "Built like a big whitetail and often shot across open slopes, so judging distance is usually the hard part." },
  { id: "pronghorn", name: "Pronghorn", kind: "deer", L: 38, D: 15, H: 35, W: 11, vital: 7, ax: 0.18, ay: 0.66,
    minKE: 25, size: 1, sizeLabel: "Light-framed", coat: "#b98a52", neck: [15, 55, 7], head: [10, 5.5, 30], ear: 4.5,
    antler: "pronghorn", tip: "Small vitals sitting low in the chest. Most bow shots come from blinds at water, where distances are known." },
  { id: "hog", name: "Feral hog", kind: "hog", L: 42, D: 18, H: 28, W: 14, vital: 7, ax: 0.14, ay: 0.68, tough: 0.1,
    minKE: 42, size: 2, sizeLabel: "Medium · stocky", coat: "#4d423b", neck: [6, 12, 16], head: [15, 10, 24], ear: 4,
    tip: "The vitals sit lower and farther forward than a deer's, tucked right behind the front leg. Mature boars carry a tough shoulder shield." },
  { id: "blackbear", name: "Black bear", kind: "bear", L: 50, D: 22, H: 30, W: 18, vital: 9, ax: 0.18, ay: 0.6, tough: 0.05,
    minKE: 42, size: 3, sizeLabel: "Large", coat: "#2f2925", neck: [10, 20, 16], head: [13, 10, 18], ear: 3.2,
    tip: "Thick fur hides the leg and makes the body look deeper than it is. Wait for the near front leg to step forward, then aim tight behind it." },
  { id: "elk", name: "Elk", kind: "deer", L: 70, D: 29, H: 56, W: 22, vital: 13, ax: 0.2, ay: 0.62, tough: 0.1,
    minKE: 42, size: 4, sizeLabel: "Very large", coat: "#a47a51", neck: [24, 45, 15], head: [19, 9, 34], ear: 8,
    antler: "elk", tip: "A heavy shoulder blade covers the front of the lungs. Aim a hand's width behind the shoulder crease, in the lower half of the chest." },
  { id: "moose", name: "Moose", kind: "moose", L: 78, D: 34, H: 70, W: 26, vital: 16, ax: 0.2, ay: 0.6, tough: 0.15,
    minKE: 42, size: 5, sizeLabel: "Huge", coat: "#3d3128", neck: [20, 35, 18], head: [26, 12, 55], ear: 9, hump: 5, rumpDrop: 6,
    antler: "moose", tip: "Long legs make the chest look higher off the ground than you expect. The vitals are big, but there is a lot of animal to get through." },
];

// yaw: degrees the head is turned away from you (negative = toward you). The stand angle's pitch
// is not fixed — it comes from AR_STAND_FT and the distance, so close shots are steeper.
const AR_ANGLES = [
  { id: "broadside", name: "Broadside", yaw: 0, rate: "good", verdict: "Take it",
    advice: "The classic bow shot. Both lungs sit side by side behind the shoulder, so an arrow that passes through reaches both." },
  { id: "away", name: "Quartering away", yaw: 32, rate: "good", verdict: "Best angle",
    advice: "The near shoulder has swung forward, out of the way. Aim through the vitals toward the far front leg, which puts the entry on the near side farther back than a broadside hold." },
  { id: "to", name: "Quartering to", yaw: -32, rate: "short", verdict: "Pass on it",
    advice: "The near shoulder blade and leg bones cover the vitals. Most bowhunting guidance says wait for the animal to turn broadside or quartering away." },
  { id: "stand", name: "From a stand", yaw: 0, rate: "marginal", verdict: "Aim higher",
    advice: "The arrow travels downward, so aim a little higher on the near side for a low exit on the far side and a pass through both lungs. Very close, steep shots can catch only one lung." },
];
const AR_STAND_FT = 20;

// cost: relative penetration cost (drag of blades, energy spent opening). cut: typical inches.
const AR_HEADS = [
  { id: "two", name: "Fixed 2-blade", kind: "Cut-on-contact", cut: 1.1, blades: 2, cost: 0,
    good: "The most penetration for the energy. It splits bone instead of catching on it." },
  { id: "three", name: "Fixed 3-blade", kind: "Fixed blade", cut: 1.15, blades: 3, cost: 0.8,
    good: "A durable all-rounder with three cutting edges. No moving parts to fail." },
  { id: "four", name: "Fixed 4-blade", kind: "Fixed blade", cut: 1.25, blades: 4, cost: 1.2,
    good: "More cutting edges than a 3-blade, for a little more drag." },
  { id: "hybrid", name: "Hybrid", kind: "Fixed + expanding", cut: 1.75, blades: 4, cost: 1.8, expands: true,
    good: "A fixed blade that always cuts, plus blades that open for a wider hole. Some states restrict expandable heads — check the rules." },
  { id: "mech", name: "Mechanical", kind: "Expandable", cut: 2, blades: 2, cost: 2.5, expands: true,
    good: "The widest cut, and it flies like a field point, but opening the blades spends energy. Some states restrict expandable heads — check the rules." },
];

const AR_PINS = [20, 30, 40, 50, 60];
const AR_PIN_COLORS = ["#48d05a", "#f3d03e", "#ff5b4f", "#48d05a", "#f3d03e"];
const AR_MIN_YD = 10;
const AR_MAX_YD = 70;
const AR_EYE_IN = 32;   // eye to sight pin
const AR_SIGHT_IN = 4;  // sight pin above the arrow
const AR_G = 386.09;    // gravity, in/s²
const AR_RAD = Math.PI / 180;

const AR_KE_TIERS = [
  [0, "Small game"],
  [25, "Deer-sized"],
  [42, "Elk, moose, bear, hog"],
  [65, "Largest game"],
];
const AR_KE_MAX = 100;

const AR_SETUPS = [
  { name: "Youth / low draw", fps: 225, grains: 360 },
  { name: "Typical compound", fps: 280, grains: 425 },
  { name: "Heavy arrow", fps: 265, grains: 520 },
  { name: "Light & fast", fps: 310, grains: 380 },
];

const arState = { species: "whitetail", yards: 25, angle: "broadside", fps: 280, grains: 425, head: "auto", vitals: true, mode: "guided" };
const AR_STORE_KEY = "plw.archery";

const $ar = (id) => document.getElementById(id);
const arFix = (n, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toFixed(d);

// ---------- Arrow physics (simplified) ----------
function arK(grains = arState.grains) { return 5e-4 * (425 / grains); } // per foot
function arVel(yd, s = arState) { return s.fps * Math.exp(-arK(s.grains) * yd * 3); }
function arKE(yd, s = arState) { const v = arVel(yd, s); return (s.grains * v * v) / 450240; }
function arMomentum(yd, s = arState) { return (s.grains * arVel(yd, s)) / 225218; }
// Time of flight for v = v0·e^(−kx): t = (e^(kx) − 1) / (k·v0).
function arTime(yd, s = arState) {
  const k = arK(s.grains);
  return (Math.exp(k * yd * 3) - 1) / (k * s.fps);
}
// Angle (radians) the bow must be raised above the line of sight to hit at `yd`.
function arAim(yd, s = arState) {
  const t = arTime(yd, s);
  return (0.5 * AR_G * t * t + AR_SIGHT_IN) / (yd * 36);
}
// Inches the arrow lands above (+) or below (−) the spot when pin `pin` is held on it at `yd`.
function arPinError(pin, yd, s = arState) {
  return (arAim(pin, s) - arAim(yd, s)) * yd * 36;
}
// Distance whose aim angle matches `a` (bisection; arAim rises with distance past ~12 yd).
function arYardsForAim(a, s = arState) {
  let lo = 12, hi = 120;
  if (a <= arAim(lo, s)) return lo;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (arAim(mid, s) < a) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

function arPitch(losYd) {
  return Math.asin(Math.min(0.7, AR_STAND_FT / 3 / losYd)) / AR_RAD;
}
// The distance the pins care about: horizontal for a stand shot, line of sight otherwise.
function arEffYards(losYd, angleId) {
  return angleId === "stand" ? losYd * Math.cos(arPitch(losYd) * AR_RAD) : losYd;
}

function arSpecies(id = arState.species) { return AR_SPECIES.find((s) => s.id === id) || AR_SPECIES[0]; }
function arShotAngle(id = arState.angle) { return AR_ANGLES.find((a) => a.id === id) || AR_ANGLES[0]; }

// Which pin to use, in the words an archer would say it.
function arHold(yd, s = arState) {
  const pins = AR_PINS;
  const near = pins.find((p) => Math.abs(arPinError(p, yd, s)) <= 0.75);
  if (near) {
    const e = arPinError(near, yd, s);
    return { pin: near, label: `${near}-yd pin`, detail: Math.abs(e) < 0.25 ? "right on" : `lands ${arFix(Math.abs(e))} in ${e > 0 ? "high" : "low"}` };
  }
  if (yd < pins[0]) {
    const e = arPinError(pins[0], yd, s);
    return { pin: pins[0], label: `${pins[0]}-yd pin`, detail: `lands ${arFix(Math.abs(e))} in ${e > 0 ? "high" : "low"}` };
  }
  const last = pins[pins.length - 1];
  if (yd > last) {
    return { pin: null, beyond: true, label: `Past your ${last}-yd pin`, detail: `${last} pin lands ${arFix(-arPinError(last, yd, s))} in low` };
  }
  const i = pins.findIndex((p) => p > yd);
  const lo = pins[i - 1], hi = pins[i];
  const f = (arAim(yd, s) - arAim(lo, s)) / (arAim(hi, s) - arAim(lo, s));
  const label = f < 0.4 ? `${lo} pin, a touch high` : f > 0.6 ? `${hi} pin, a touch low` : `Split ${lo} & ${hi}`;
  return { between: [lo, hi], f, label, detail: `${Math.round(f * 100)}% of the way from ${lo} to ${hi} on your sight` };
}

// Distances where holding `pin` dead-on keeps the arrow inside a vital zone of radius r.
// Grows outward from the pin's own distance, so a short-range coincidence never counts.
function arPinWindow(pin, r, s = arState) {
  let a = pin, b = pin;
  while (a > 5 && Math.abs(arPinError(pin, a - 0.5, s)) <= r) a -= 0.5;
  while (b < 90 && Math.abs(arPinError(pin, b + 0.5, s)) <= r) b += 0.5;
  return [a, b];
}

// ---------- Broadhead fit (heuristic) ----------
function arHeadFit(h, sp = arSpecies(), yd = arEffYards(arState.yards, arState.angle), angleId = arState.angle) {
  const ke = arKE(yd);
  const extra = angleId === "away" ? 0.15 : angleId === "stand" ? 0.1 : 0;
  const need = sp.minKE * (1 + 0.12 * h.cost + extra + (sp.tough || 0));
  const ratio = ke / need;
  let key = ratio < 0.85 ? "short" : ratio < 1 ? "marginal" : "good";
  let why = key === "good" ? h.good
    : `Wants about ${Math.round(need)} ft·lb for ${sp.name.toLowerCase()} here. Your arrow carries ${Math.round(ke)}.`;
  if (h.expands && sp.size >= 4 && key === "good") {
    key = "marginal";
    why = "Energy is there, but many hunters pick a fixed head for animals this big, to get through heavy bone.";
  }
  const labels = { good: ["✓", "Good fit"], marginal: ["!", "Borderline"], short: ["✕", "Not enough"] };
  return { key, icon: labels[key][0], label: labels[key][1], why, need, ke };
}

// Auto pick: for deer-sized game the widest cut that still fits; for bigger animals the most
// penetration. Falls back to the lowest-cost head if nothing rates "good".
function arBestHead(sp = arSpecies()) {
  const good = AR_HEADS.filter((h) => arHeadFit(h, sp).key === "good");
  if (!good.length) return { head: AR_HEADS[0], reason: "nothing fits well — most penetration" };
  if (sp.size <= 2) return { head: good.reduce((a, b) => (b.cut > a.cut ? b : a)), reason: "widest cut that fits" };
  return { head: good.reduce((a, b) => (b.cost < a.cost ? b : a)), reason: "most penetration" };
}
function arCurrentHead() {
  if (arState.head !== "auto") return { head: AR_HEADS.find((h) => h.id === arState.head) || AR_HEADS[0], auto: false };
  return { ...arBestHead(), auto: true };
}

// ---------- Persistence (per-viewer convenience only) ----------
function arLoad() {
  try {
    const saved = JSON.parse(localStorage.getItem(AR_STORE_KEY) || "null");
    if (!saved) return;
    if (AR_SPECIES.some((s) => s.id === saved.species)) arState.species = saved.species;
    if (AR_ANGLES.some((a) => a.id === saved.angle)) arState.angle = saved.angle;
    if (Number.isFinite(saved.yards)) arState.yards = Math.min(AR_MAX_YD, Math.max(AR_MIN_YD, Math.round(saved.yards)));
    if (Number.isFinite(saved.fps)) arState.fps = Math.min(340, Math.max(200, saved.fps));
    if (Number.isFinite(saved.grains)) arState.grains = Math.min(700, Math.max(300, saved.grains));
    if (saved.head === "auto" || AR_HEADS.some((h) => h.id === saved.head)) arState.head = saved.head;
    if (typeof saved.vitals === "boolean") arState.vitals = saved.vitals;
  } catch {}
}
function arSave() {
  try { localStorage.setItem(AR_STORE_KEY, JSON.stringify({ ...arState, mode: undefined })); } catch {}
}

// ---------- Silhouette (inches, facing right, ground at y = 0) ----------
// Catmull-Rom through the points, as closed cubic Béziers.
function arSpline(pts) {
  const n = pts.length;
  const f = (p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
  let d = `M${f(pts[0])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    d += `C${f([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6])} ` +
      `${f([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6])} ${f(p2)}`;
  }
  return d + "Z";
}
function arLine(pts) {
  return pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
}

const AR_HEAD_SHAPES = {
  deer: [[-0.2, -0.35], [0.15, -0.5], [0.5, -0.32], [0.95, -0.12], [1, 0.1], [0.9, 0.22], [0.5, 0.3], [0.15, 0.5], [-0.2, 0.35]],
  moose: [[-0.2, -0.35], [0.15, -0.5], [0.55, -0.32], [0.95, -0.18], [1.03, 0.2], [0.9, 0.45], [0.6, 0.36], [0.2, 0.5], [-0.2, 0.35]],
  bear: [[-0.25, -0.45], [0.1, -0.55], [0.45, -0.35], [0.8, -0.2], [1, -0.02], [0.95, 0.18], [0.55, 0.3], [0.15, 0.5], [-0.25, 0.4]],
  hog: [[-0.2, -0.4], [0.15, -0.5], [0.6, -0.26], [1, -0.14], [1.03, 0.2], [0.7, 0.3], [0.3, 0.46], [-0.2, 0.4]],
};

// Antler/horn strokes relative to the top of the skull, in inches.
const AR_ANTLERS = {
  deer: { stroke: [[[0, 0], [-3, -6], [-2, -11], [3, -14], [9, -13], [12, -10]], [[-2.4, -9], [-3, -15]], [[2, -13.6], [2.6, -19]],
    [[7, -13.4], [8, -18]], [[-1.2, -3], [0, -6]]] },
  mule: { stroke: [[[0, 0], [-2, -8], [-1, -15]], [[-1, -15], [-5, -21]], [[-1, -15], [4, -20]], [[-2, -8], [4, -12]],
    [[4, -12], [5, -17]], [[4, -12], [8, -13]]] },
  elk: { stroke: [[[0, 0], [-6, -12], [-16, -24], [-24, -36], [-27, -44]], [[-1, -2], [8, -6]], [[-3, -6], [6, -10]],
    [[-9, -16], [-2, -26]], [[-15, -23], [-8, -34]], [[-21, -32], [-15, -41]]] },
  moose: { fill: [[0, -1], [-4, -3], [-12, -2], [-22, -5], [-27, -10], [-23, -12], [-20, -10], [-17, -14], [-13, -11], [-9, -15], [-6, -10], [-2, -13], [2, -8], [3, -4]] },
  pronghorn: { stroke: [[[0, 0], [0.6, -6], [0, -10], [-2.5, -11.5]], [[0.4, -5], [2.8, -6.6]]], dark: true },
};

// Builds the animal for a yaw (quartering) or pitch (from above). Parts carry a depth z (+ toward
// the viewer); projecting shifts near parts one way and far parts the other, which is enough to
// show why quartering-to puts the near shoulder over the vitals.
function arBuild(sp, yawDeg = 0, pitchDeg = 0) {
  const { L, D, H, W } = sp;
  const T = -H, G = H - D;
  const cy = Math.cos(yawDeg * AR_RAD), sy = Math.sin(yawDeg * AR_RAD);
  const cp = Math.cos(pitchDeg * AR_RAD), spt = Math.sin(pitchDeg * AR_RAD);
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  const P = (p, z = 0) => {
    const q = [p[0] * cy + z * sy, p[1] * cp + z * spt];
    bounds[0] = Math.min(bounds[0], q[0]); bounds[1] = Math.min(bounds[1], q[1]);
    bounds[2] = Math.max(bounds[2], q[0]); bounds[3] = Math.max(bounds[3], q[1]);
    return q;
  };
  const hump = sp.hump || 0, drop = sp.rumpDrop || 0;
  const torso = [
    [-0.16 * L, T - hump], [-0.36 * L, T + 0.04 * D + drop * 0.3], [-0.6 * L, T + 0.06 * D + drop * 0.6],
    [-0.86 * L, T + 0.02 * D + drop], [-1.0 * L, T + 0.3 * D + drop], [-0.98 * L, T + 0.62 * D],
    [-0.8 * L, T + 0.86 * D], [-0.5 * L, T + 0.94 * D], [-0.2 * L, T + D], [-0.04 * L, T + 0.88 * D],
    [0.02 * L, T + 0.6 * D], [-0.02 * L, T + 0.3 * D], [-0.08 * L, T + 0.06 * D - hump * 0.6],
  ];

  const [nLen, nAng, nThick] = sp.neck;
  const base = [-0.02 * L, T + 0.32 * D];
  const dir = [Math.cos(nAng * AR_RAD), -Math.sin(nAng * AR_RAD)];
  const nrm = [-dir[1], dir[0]];
  const end = [base[0] + dir[0] * nLen, base[1] + dir[1] * nLen];
  const mid = [(base[0] + end[0]) / 2, (base[1] + end[1]) / 2];
  const mw = nThick * 0.5;
  const neck = [
    [-0.24 * L, T + 0.02 * D - hump], [mid[0] - nrm[0] * mw, mid[1] - nrm[1] * mw],
    [end[0] - nrm[0] * nThick * 0.5, end[1] - nrm[1] * nThick * 0.5], [end[0] + nrm[0] * nThick * 0.5, end[1] + nrm[1] * nThick * 0.5],
    [mid[0] + nrm[0] * mw * 1.1, mid[1] + nrm[1] * mw * 1.1], [0.03 * L, T + 0.62 * D],
  ];

  const [hl, hd, droop] = sp.head;
  const hdir = [Math.cos(droop * AR_RAD), Math.sin(droop * AR_RAD)];
  const hperp = [-hdir[1], hdir[0]];
  const H2W = (u, v) => [end[0] + u * hl * hdir[0] + v * hd * hperp[0], end[1] + u * hl * hdir[1] + v * hd * hperp[1]];
  const head = (AR_HEAD_SHAPES[sp.kind] || AR_HEAD_SHAPES.deer).map(([u, v]) => H2W(u, v));

  const earBase = H2W(0.02, -0.45);
  const ed = sp.kind === "hog" ? [0.35, -0.94] : [-0.45, -0.89];
  const eq = [-ed[1], ed[0]];
  const el = sp.ear;
  const ear = sp.kind === "bear" ? null : [
    [earBase[0] + eq[0] * el * 0.12, earBase[1] + eq[1] * el * 0.12],
    [earBase[0] + ed[0] * el * 0.55 + eq[0] * el * 0.24, earBase[1] + ed[1] * el * 0.55 + eq[1] * el * 0.24],
    [earBase[0] + ed[0] * el, earBase[1] + ed[1] * el],
    [earBase[0] + ed[0] * el * 0.55 - eq[0] * el * 0.24, earBase[1] + ed[1] * el * 0.55 - eq[1] * el * 0.24],
    [earBase[0] - eq[0] * el * 0.12, earBase[1] - eq[1] * el * 0.12],
  ];

  const lw = { deer: 0.07, moose: 0.075, bear: 0.13, hog: 0.1 }[sp.kind] * L / 2;
  const frontLeg = (xc, w) => [
    [xc - 1.9 * w, T + 0.42 * D], [xc + 1.5 * w, T + 0.45 * D], [xc + 1.1 * w, -G * 0.85], [xc + 0.6 * w, -G * 0.45],
    [xc + 0.45 * w, -G * 0.08], [xc + 0.75 * w, 0], [xc - 0.5 * w, 0], [xc - 0.45 * w, -G * 0.1],
    [xc - 0.55 * w, -G * 0.45], [xc - 1.0 * w, -G * 0.9], [xc - 1.6 * w, -G - 0.1 * D],
  ];
  const hindLeg = (xc, w) => sp.kind === "bear" || sp.kind === "hog" ? frontLeg(xc, w * 1.1) : [
    [xc + 0.12 * L, T + 0.35 * D], [xc + 0.09 * L, -G * 0.95], [xc + 0.03 * L, -G * 0.62], [xc - 0.01 * L + 0.4 * w, -G * 0.42],
    [xc + 0.02 * L + 0.45 * w, -G * 0.08], [xc + 0.02 * L + 0.75 * w, 0], [xc + 0.02 * L - 0.5 * w, 0],
    [xc - 0.45 * w, -G * 0.12], [xc - 0.04 * L - 0.7 * w, -G * 0.45], [xc - 0.07 * L, -G * 0.72],
    [xc - 0.13 * L, T + 0.6 * D], [xc - 0.08 * L, T + 0.2 * D],
  ];

  const zLeg = 0.35 * W, zSide = 0.45 * W;
  const proj = (pts, z) => pts.map((p) => P(p, z));
  const far = [arSpline(proj(frontLeg(-0.13 * L, lw), -zLeg)), arSpline(proj(hindLeg(-0.8 * L, lw), -zLeg))];
  const body = [
    arSpline(proj(torso, -zSide)), arSpline(proj(torso, zSide)), arSpline(proj(torso, 0)),
    arSpline(proj(neck, 0)), arSpline(proj(head, 0)),
  ];
  if (ear) body.push(arSpline(proj(ear, 0)));
  const circles = [];
  if (sp.kind === "bear") {
    const c = P([earBase[0] - 1, earBase[1] - el * 0.5], 0);
    circles.push([c[0], c[1], el * 0.62]);
  }
  if (sp.kind === "deer") {
    body.push(arSpline(proj([[-0.99 * L, T + 0.22 * D + drop], [-L - 3.5, T + 0.26 * D + drop], [-L - 2.6, T + 0.5 * D], [-0.98 * L, T + 0.42 * D]], 0)));
  }
  if (sp.kind === "moose") {
    const t = H2W(0.15, 0.5);
    body.push(arSpline(proj([[t[0] + 1.5, t[1]], [t[0] + 1, t[1] + 8], [t[0] - 2, t[1] + 9], [t[0] - 2.5, t[1] + 1]], 0)));
  }
  const near = [arSpline(proj(frontLeg(-0.07 * L, lw), zLeg)), arSpline(proj(hindLeg(-0.86 * L, lw), zLeg))];

  const antlers = { stroke: [], fill: [], dark: false };
  const a = sp.antler && AR_ANTLERS[sp.antler];
  if (a) {
    const top = H2W(0.08, -0.48);
    const off = (pts) => pts.map(([x, y]) => P([top[0] + x, top[1] + y], 0));
    (a.stroke || []).forEach((pts) => antlers.stroke.push(arLine(off(pts))));
    if (a.fill) antlers.fill.push(arSpline(off(a.fill)));
    antlers.dark = !!a.dark;
  }
  const tail = sp.kind === "hog" ? arLine(proj([[-L, T + 0.3 * D], [-L - 2, T + 0.36 * D], [-L - 1.3, T + 0.5 * D], [-L - 2.5, T + 0.58 * D]], 0)) : "";

  const aimB = [-sp.ax * L, T + sp.ay * D];
  const ell = (x, y, rx, ry) => { const c = P([x, y], 0); return { cx: c[0], cy: c[1], rx: rx * cy, ry: ry * cp }; };
  const vitals = {
    lungs: ell(-(sp.ax + 0.01) * L, T + (sp.ay - 0.08) * D, 0.14 * L, 0.3 * D),
    heart: ell(-(sp.ax - 0.02) * L, T + (sp.ay + 0.2) * D, 0.11 * D, 0.11 * D),
    liver: ell(-(sp.ax + 0.19) * L, T + (sp.ay - 0.02) * D, 0.06 * L, 0.25 * D),
  };
  const scap = arSpline(proj([[-0.18 * L, T + 0.12 * D], [-0.07 * L, T + 0.05 * D], [0, T + 0.55 * D], [-0.05 * L, T + 0.64 * D]], 0.42 * W));
  const shadow = { cx: -0.5 * L * cy, rx: 0.62 * L * cy + W * Math.abs(sy) * 0.5, ry: 1.5 + W * spt * 0.5 };

  return { far, body, circles, near, antlers, tail, vitals, scap, aim: P(aimB, 0), bounds, shadow };
}

// SVG markup for a built animal. `show` = draw the vitals overlay.
function arAnimalSvg(sp, b, show) {
  const v = b.vitals;
  const e = (o, cls) => `<ellipse class="${cls}" cx="${o.cx.toFixed(1)}" cy="${o.cy.toFixed(1)}" rx="${o.rx.toFixed(1)}" ry="${o.ry.toFixed(1)}"/>`;
  return `
    <ellipse class="ar-shadow" cx="${b.shadow.cx.toFixed(1)}" cy="0" rx="${b.shadow.rx.toFixed(1)}" ry="${b.shadow.ry.toFixed(1)}"/>
    <g class="ar-far" style="fill:${sp.coat}">${b.far.map((d) => `<path d="${d}"/>`).join("")}</g>
    <g class="ar-coat" style="fill:${sp.coat}">
      ${b.body.map((d) => `<path d="${d}"/>`).join("")}
      ${b.circles.map(([x, y, r]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"/>`).join("")}
    </g>
    ${b.tail ? `<path class="ar-tail" d="${b.tail}" style="stroke:${sp.coat}"/>` : ""}
    <g class="ar-near" style="fill:${sp.coat}">${b.near.map((d) => `<path d="${d}"/>`).join("")}</g>
    <g class="ar-antler${b.antlers.dark ? " dark" : ""}">
      ${b.antlers.fill.map((d) => `<path class="fill" d="${d}"/>`).join("")}
      ${b.antlers.stroke.map((d) => `<path d="${d}"/>`).join("")}
    </g>
    <g class="ar-vitals"${show ? "" : " hidden"}>
      ${e(v.liver, "liver")}${e(v.lungs, "lungs")}${e(v.heart, "heart")}
      <path class="scap" d="${b.scap}"/>
    </g>`;
}

// ---------- Small drawings ----------
// Broadhead seen from the front: blades radiating inside its cut circle, drawn to scale.
function arHeadIcon(h) {
  const r = (h.cut / 2) * 26;
  const n = h.blades;
  let blades = "";
  if (h.id === "hybrid") {
    blades = [0, 90, 180, 270].map((deg, i) => {
      const len = i % 2 ? r : 7.5;
      return `<line x1="0" y1="0" x2="${(Math.cos(deg * AR_RAD) * len).toFixed(1)}" y2="${(Math.sin(deg * AR_RAD) * len).toFixed(1)}"/>`;
    }).join("");
  } else {
    for (let i = 0; i < n; i++) {
      const deg = -90 + (360 / n) * i + (n === 2 ? 90 : 0);
      blades += `<line x1="0" y1="0" x2="${(Math.cos(deg * AR_RAD) * r).toFixed(1)}" y2="${(Math.sin(deg * AR_RAD) * r).toFixed(1)}"/>`;
    }
  }
  return `<svg class="ar-head-icon" viewBox="-28 -28 56 56" aria-hidden="true">
    <circle class="cut" r="${r.toFixed(1)}"/>${blades}<circle class="ferrule" r="3.2"/></svg>`;
}

// ---------- Static shell ----------
function arShell() {
  const credits = AR_SPECIES.map((sp) => `<a href="${BG_PHOTOS[sp.id].page}" target="_blank" rel="noopener">${escapeHtml(sp.name)}</a>
    (${escapeHtml(BG_PHOTOS[sp.id].credit)})`).join(", ");
  return `
    <section class="bg-section" aria-labelledby="ar-pick-h">
      <div class="panel-heading">
        <h2 id="ar-pick-h">Pick your animal</h2>
        <p class="sub">The aim point, broadhead fit and pin picture below all re-draw for the animal you choose.</p>
      </div>
      <div class="bg-species ar-species" id="ar-species" role="radiogroup" aria-labelledby="ar-pick-h">
        ${AR_SPECIES.map((s) => `
          <button type="button" class="bg-animal" role="radio" data-species="${s.id}" aria-checked="false" tabindex="-1">
            <span class="bg-animal-art">${bgPhoto(s.id, "bg-photo")}</span>
            <span class="bg-animal-name">${escapeHtml(s.name)}</span>
            <span class="bg-animal-size">${bgSizeDots(s.size)}<span>~${s.vital} in vitals</span></span>
          </button>`).join("")}
      </div>
    </section>

    <section class="bg-focus ar-focus" aria-label="Your shot">
      <div class="bg-focus-main">
        <div class="bg-focus-head">
          <figure class="bg-focus-art">
            <img id="ar-focus-img" class="bg-photo" width="480" height="360" alt="" decoding="async" />
            <figcaption id="ar-focus-credit"></figcaption>
          </figure>
          <div>
            <h2 id="ar-focus-name"></h2>
            <p id="ar-focus-tip"></p>
          </div>
        </div>
        <div class="bg-focus-stats ar-stats">
          <div><span class="bg-k">Vital zone</span><span class="bg-v" id="ar-st-vital"></span></div>
          <div><span class="bg-k">This angle</span><span class="bg-v" id="ar-st-angle"></span></div>
          <div><span class="bg-k">Hold</span><span class="bg-v" id="ar-st-hold"></span></div>
          <div><span class="bg-k">Broadhead</span><span class="bg-v" id="ar-st-head"></span></div>
        </div>
      </div>
      <div class="bg-range">
        <label for="ar-yards" class="bg-range-label">
          <span>Distance</span>
          <output id="ar-yards-out" for="ar-yards"></output>
        </label>
        <input type="range" id="ar-yards" min="${AR_MIN_YD}" max="${AR_MAX_YD}" step="1" />
        <div class="bg-ticks" aria-hidden="true">${[10, 20, 30, 40, 50, 60, 70].map((y) => `<span>${y}</span>`).join("")}</div>
        <div class="bg-presets ar-angles" role="group" aria-label="Shot angle">
          ${AR_ANGLES.map((a) => `<button type="button" class="bg-chip" data-angle="${a.id}" aria-pressed="false">${a.name}</button>`).join("")}
        </div>
        <p class="bg-live" id="ar-live" aria-live="polite"></p>
      </div>
    </section>

    <div class="bg-grid ar-grid">
      <section class="bg-section" aria-labelledby="ar-aim-h">
        <div class="bg-section-head">
          <div class="panel-heading">
            <h2 id="ar-aim-h">Where to aim</h2>
            <p class="sub">The orange ring is the vital zone. Change the angle above to see how the shoulder moves.</p>
          </div>
          <span class="bg-rate" id="ar-verdict"></span>
        </div>
        <svg class="ar-scene" id="ar-scene" viewBox="0 0 420 250" role="img" aria-labelledby="ar-aim-h"></svg>
        <ul class="bg-legend ar-key" aria-label="Anatomy key">
          <li><i class="k-lungs"></i>Lungs</li>
          <li><i class="k-heart"></i>Heart</li>
          <li><i class="k-liver"></i>Liver</li>
          <li><i class="k-scap"></i>Near shoulder blade</li>
          <li><i class="k-aim"></i>Aim point &amp; vital zone</li>
        </ul>
        <div class="ar-path">
          <svg class="ar-inset" id="ar-inset" viewBox="0 0 140 120" aria-hidden="true">
            <g id="ar-top">
              <g transform="translate(70 56)"><g id="ar-top-body"></g></g>
              <line class="ar-arrow" id="ar-top-arrow" x1="0" x2="0" y1="116" y2="6" marker-end="url(#ar-tip)"/>
              <text class="ar-inset-t" x="70" y="117" text-anchor="middle">you</text>
            </g>
            <g id="ar-front" hidden></g>
            <defs><marker id="ar-tip" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10z" fill="var(--hunting)"/></marker></defs>
          </svg>
          <div>
            <h3 class="mini-head" id="ar-path-h"></h3>
            <p class="ar-path-text" id="ar-path-text"></p>
          </div>
        </div>
      </section>

      <section class="bg-section ar-sight-card" aria-labelledby="ar-sight-h">
        <div class="bg-section-head">
          <div class="panel-heading">
            <h2 id="ar-sight-h">Through your sight</h2>
            <p class="sub" id="ar-sight-sub"></p>
          </div>
          <div class="bg-sort" role="radiogroup" aria-label="Sight mode">
            <label><input type="radio" name="ar-mode" value="guided" checked /><span>Guided</span></label>
            <label><input type="radio" name="ar-mode" value="practice" /><span>Practice</span></label>
          </div>
        </div>
        <div class="ar-scope-wrap">
          <svg class="ar-scope" id="ar-scope" viewBox="-60 -60 120 120" role="img" aria-label="Sight picture"></svg>
          <div class="ar-scope-hud" id="ar-hud"></div>
        </div>
        <div id="ar-guided-tools" class="ar-scope-tools">
          <button type="button" class="bg-chip" id="ar-vitals-btn" aria-pressed="true">Show vitals</button>
          <p class="ar-scope-note" id="ar-scope-note"></p>
        </div>
        <div id="ar-drill-tools" class="ar-drill" hidden>
          <p class="ar-drill-q" id="ar-drill-q"></p>
          <div class="ar-drill-btns">
            <button type="button" class="btn-primary small" id="ar-release">Release</button>
            <button type="button" class="btn-secondary small" id="ar-pass">Pass on it</button>
            <button type="button" class="bg-chip" id="ar-next" hidden>Next animal →</button>
            <button type="button" class="bg-chip" id="ar-load" hidden>Study this shot</button>
            <span class="ar-score" id="ar-score"></span>
          </div>
          <p class="ar-drill-result" id="ar-drill-result" aria-live="polite"></p>
        </div>
      </section>
    </div>

    <div class="bg-grid ar-grid">
      <section class="bg-section" aria-labelledby="ar-head-h">
        <div class="bg-section-head">
          <div class="panel-heading">
            <h2 id="ar-head-h">Broadhead match</h2>
            <p class="sub">Rated for this animal, distance and angle with your arrow. Tap one to carry it through the page.</p>
          </div>
          <button type="button" class="bg-chip" id="ar-head-auto" aria-pressed="true">Auto pick</button>
        </div>
        <div class="ar-setup">
          <div class="bg-range ar-paper">
            <label for="ar-fps" class="bg-range-label"><span>Arrow speed</span><output id="ar-fps-out" for="ar-fps"></output></label>
            <input type="range" id="ar-fps" min="200" max="340" step="5" />
          </div>
          <div class="bg-range ar-paper">
            <label for="ar-grains" class="bg-range-label"><span>Arrow weight</span><output id="ar-grains-out" for="ar-grains"></output></label>
            <input type="range" id="ar-grains" min="300" max="700" step="10" />
          </div>
        </div>
        <div class="bg-presets ar-setups" role="group" aria-label="Arrow setup presets">
          ${AR_SETUPS.map((s, i) => `<button type="button" class="bg-chip" data-setup="${i}">${s.name} <small>${s.fps} fps · ${s.grains} gr</small></button>`).join("")}
        </div>
        <div class="ar-ke">
          <div class="ar-ke-head"><strong id="ar-ke-val"></strong><span id="ar-ke-sub"></span></div>
          <div class="ar-ke-bar" aria-hidden="true">
            ${AR_KE_TIERS.map(([from], i) => {
              const to = AR_KE_TIERS[i + 1]?.[0] ?? AR_KE_MAX;
              return `<span class="t${i}" style="left:${(from / AR_KE_MAX) * 100}%;width:${((to - from) / AR_KE_MAX) * 100}%"></span>`;
            }).join("")}
            <b id="ar-ke-need"></b><i id="ar-ke-mark"></i>
          </div>
          <div class="ar-ke-labels" aria-hidden="true">
            ${AR_KE_TIERS.map(([from, label]) => `<span style="left:${(from / AR_KE_MAX) * 100}%">${from ? `${from}+ ` : ""}${label}</span>`).join("")}
          </div>
        </div>
        <ul class="ar-heads" id="ar-heads" role="group" aria-label="Broadhead styles">
          ${AR_HEADS.map((h) => `
            <li><button type="button" class="ar-head" data-head="${h.id}" aria-pressed="false">
              ${arHeadIcon(h)}
              <span class="ar-head-name"><strong>${h.name}</strong><span>${h.kind} · ~${h.cut}″ cut</span></span>
              <span class="bg-rate"></span>
              <span class="ar-head-why"></span>
            </button></li>`).join("")}
        </ul>
      </section>

      <section class="bg-section" aria-labelledby="ar-pins-h">
        <div class="panel-heading">
          <h2 id="ar-pins-h">Pin gaps</h2>
          <p class="sub" id="ar-pins-sub"></p>
        </div>
        <div class="ar-pins" id="ar-pins" role="group" aria-label="Pins">
          ${AR_PINS.map((p, i) => `
            <button type="button" class="ar-pin-row" data-yards="${p}">
              <span class="ar-pin-name"><i style="background:${AR_PIN_COLORS[i]}"></i>${p} yd</span>
              <span class="ar-pin-track"><span class="ar-pin-win"></span><b></b></span>
              <span class="ar-pin-gap"></span>
            </button>`).join("")}
          <div class="ar-pin-axis" aria-hidden="true">
            <span></span>
            <span class="ar-pin-ticks">${[0, 10, 20, 30, 40, 50, 60, 70].map((y) => `<span style="left:${(y / AR_MAX_YD) * 100}%">${y}</span>`).join("")}</span>
            <span></span>
          </div>
        </div>
        <p class="ar-wrong" id="ar-wrong"></p>
        <p class="alm-foot">Sight gaps assume the pins sit about ${AR_EYE_IN} in from your eye and ${AR_SIGHT_IN} in above the arrow.
          They are for comparing setups. Only shooting your own bow sets real pins.</p>
      </section>
    </div>

    <div id="ar-official"></div>

    <p class="fine-print">
      Shot placement, a sharp broadhead and a tuned bow matter more than any single number here. Practice at the
      distances and angles you will hunt, know your own effective range, and pass on any shot you are not sure of.
      Arrow figures are estimates from a simplified model; your bow and arrows will differ.
    </p>
    <p class="fine-print bg-credits">
      <strong>Photos:</strong> U.S. Fish &amp; Wildlife Service, public domain (retrieved ${BG_PHOTO_RETRIEVED}) — ${credits}.
    </p>`;
}

// ---------- Anatomy scene ----------
function arFit(b, box) {
  const [x0, y0, x1] = b.bounds;
  const w = x1 - x0, h = 0 - y0;
  const k = Math.min((box.w - 2 * box.pad) / w, (box.h - box.pad - box.ground) / h);
  return { k, tx: box.w / 2 - ((x0 + x1) / 2) * k, ty: box.h - box.ground };
}

function arRenderScene() {
  const sp = arSpecies();
  const ang = arShotAngle();
  const pitch = ang.id === "stand" ? arPitch(arState.yards) : 0;
  const b = arBuild(sp, ang.yaw, pitch);
  const f = arFit(b, { w: 420, h: 250, pad: 16, ground: 16 });
  const [ax, ay] = b.aim;
  const r = sp.vital / 2;
  $ar("ar-scene").innerHTML = `
    <line class="ar-ground" x1="0" x2="420" y1="${f.ty}" y2="${f.ty}"/>
    <g transform="translate(${f.tx.toFixed(1)} ${f.ty}) scale(${f.k.toFixed(3)})">
      ${arAnimalSvg(sp, b, true)}
      <g class="ar-aim">
        <circle class="ring" cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="${r}" style="stroke-width:${(2.2 / f.k).toFixed(2)}"/>
        <circle class="dot" cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="${(3 / f.k).toFixed(2)}"/>
      </g>
    </g>
    <text class="ar-scene-t" x="12" y="20">${escapeHtml(sp.name)} · ${escapeHtml(ang.name.toLowerCase())}${
      pitch ? ` · ${Math.round(pitch)}° down` : ""}</text>`;

  const v = $ar("ar-verdict");
  v.className = `bg-rate ${ang.rate}`;
  v.innerHTML = `<span aria-hidden="true">${{ good: "✓", marginal: "!", short: "✕" }[ang.rate]}</span>${ang.verdict}`;
  $ar("ar-scene").setAttribute("aria-label",
    `${sp.name}, ${ang.name.toLowerCase()}. Aim point marked with a ${sp.vital}-inch vital zone.`);
}

// The arrow's path from above (or from the front, for a stand shot).
function arRenderPath() {
  const sp = arSpecies();
  const ang = arShotAngle();
  const s = 118 / (sp.L * 1.3);
  const L = sp.L * s, W = sp.W * s;
  const vx = (0.5 - sp.ax) * L;
  const stand = ang.id === "stand";
  $ar("ar-top").toggleAttribute("hidden", stand);
  $ar("ar-front").toggleAttribute("hidden", !stand);

  if (!stand) {
    const body = $ar("ar-top-body");
    if (body.dataset.species !== sp.id) {
      body.dataset.species = sp.id;
      body.innerHTML = `
        <ellipse class="t-body" rx="${(L / 2).toFixed(1)}" ry="${(W / 2).toFixed(1)}"/>
        <ellipse class="t-body" cx="${(L * 0.62).toFixed(1)}" rx="${(L * 0.16).toFixed(1)}" ry="${(W * 0.22).toFixed(1)}"/>
        <ellipse class="t-vital" cx="${vx.toFixed(1)}" rx="${(L * 0.14).toFixed(1)}" ry="${(W * 0.36).toFixed(1)}"/>
        <ellipse class="t-bone" cx="${(L * 0.4).toFixed(1)}" cy="${(W * 0.36).toFixed(1)}" rx="${(L * 0.08).toFixed(1)}" ry="${(W * 0.12).toFixed(1)}"/>
        <ellipse class="t-bone far" cx="${(L * 0.4).toFixed(1)}" cy="${(-W * 0.36).toFixed(1)}" rx="${(L * 0.08).toFixed(1)}" ry="${(W * 0.12).toFixed(1)}"/>`;
    }
    body.style.transform = `rotate(${-ang.yaw}deg)`;
    $ar("ar-top-arrow").style.transform = `translateX(${(70 + vx * Math.cos(ang.yaw * AR_RAD)).toFixed(1)}px)`;
  } else {
    const pitch = arPitch(arState.yards);
    const k = 80 / (sp.D * 1.25);
    const w = sp.W * k, d = sp.D * k;
    const cx = 74, cy = 64, py = cy + (sp.ay - 0.5) * d * 0.6;
    const t = Math.tan(pitch * AR_RAD);
    const x0 = 6, x1 = 136;
    $ar("ar-front").innerHTML = `
      <ellipse class="t-body" cx="${cx}" cy="${cy}" rx="${(w / 2).toFixed(1)}" ry="${(d / 2).toFixed(1)}"/>
      <ellipse class="t-vital" cx="${cx - w * 0.17}" cy="${py}" rx="${(w * 0.17).toFixed(1)}" ry="${(d * 0.28).toFixed(1)}"/>
      <ellipse class="t-vital" cx="${cx + w * 0.17}" cy="${py}" rx="${(w * 0.17).toFixed(1)}" ry="${(d * 0.28).toFixed(1)}"/>
      <circle class="t-bone" cx="${cx}" cy="${cy - d / 2 + 5}" r="3.2"/>
      <line class="ar-arrow" x1="${x0}" y1="${(py + (x0 - cx) * t).toFixed(1)}" x2="${x1}" y2="${(py + (x1 - cx) * t).toFixed(1)}" marker-end="url(#ar-tip)"/>
      <text class="ar-inset-t" x="6" y="12">you · ${AR_STAND_FT} ft up</text>`;
  }

  $ar("ar-path-h").textContent = stand ? "Arrow path from the front" : "Arrow path from above";
  let extra = "";
  if (ang.id === "away") {
    const back = (sp.W / 2) * Math.tan(ang.yaw * AR_RAD);
    extra = ` On a ${sp.name.toLowerCase()} that is roughly ${Math.round(back)} in back.`;
  } else if (ang.id === "stand") {
    const eff = arEffYards(arState.yards, "stand");
    extra = ` At ${arState.yards} yd from ${AR_STAND_FT} ft up the angle is about ${Math.round(arPitch(arState.yards))}°, and the arrow only drops over the flat ${arFix(eff)} yd — use that pin.`;
  }
  $ar("ar-path-text").textContent = ang.advice + extra;
}

// ---------- Sight picture ----------
function arScopeGeometry(s = arState) {
  const a20 = arAim(AR_PINS[0], s), aLast = arAim(AR_PINS[AR_PINS.length - 1], s);
  const ref = (a20 + aLast) / 2;
  const pinY = AR_PINS.map((p) => (arAim(p, s) - ref) * 1000);
  const R = Math.max(22, (pinY[pinY.length - 1] - pinY[0]) / 2 + 8);
  return { ref, pinY, R };
}

function arScopeSvg({ sp, angleId, los, show, housing = [0, 0], animalAt = null, hold = null, activePin = null, impact = null }) {
  const ang = arShotAngle(angleId);
  const pitch = angleId === "stand" ? arPitch(los) : 0;
  const b = arBuild(sp, ang.yaw, pitch);
  const g = arScopeGeometry();
  const k = 1000 / (los * 36);
  const eff = arEffYards(los, angleId);
  const holdY = (arAim(eff) - g.ref) * 1000;
  const at = animalAt || [housing[0], housing[1] + holdY];
  const [ax, ay] = b.aim;
  const groundY = at[1] - ay * k;
  const [hx, hy] = housing;
  const pins = AR_PINS.map((p, i) => {
    const y = g.pinY[i];
    const on = p === activePin;
    return `<g class="ar-pin${on ? " on" : ""}">
      <line x1="${g.R}" x2="1.4" y1="${y.toFixed(2)}" y2="${y.toFixed(2)}"/>
      <circle cx="0" cy="${y.toFixed(2)}" r="${on ? 1.35 : 1.05}" style="fill:${AR_PIN_COLORS[i]}"/>
      <text x="${g.R + 3}" y="${(y + 1.4).toFixed(2)}">${p}</text></g>`;
  }).join("");
  const holdMark = hold != null
    ? `<circle class="ar-hold" cx="0" cy="${hold.toFixed(2)}" r="2.2"/>` : "";
  return `
    <defs>
      <clipPath id="ar-peep-${animalAt ? "d" : "g"}"><circle r="57"/></clipPath>
      <linearGradient id="ar-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9d6cf"/><stop offset="1" stop-color="#ebe4cf"/></linearGradient>
    </defs>
    <rect class="ar-scope-bg" x="-60" y="-60" width="120" height="120"/>
    <g clip-path="url(#ar-peep-${animalAt ? "d" : "g"})">
      <rect x="-60" y="-60" width="120" height="120" fill="url(#ar-sky)"/>
      <rect class="ar-grass" x="-60" y="${Math.min(60, groundY).toFixed(2)}" width="120" height="${Math.max(0, 60 - groundY + 1).toFixed(2)}"/>
      <g transform="translate(${at[0].toFixed(2)} ${at[1].toFixed(2)}) scale(${k.toFixed(4)}) translate(${(-ax).toFixed(2)} ${(-ay).toFixed(2)})">
        ${arAnimalSvg(sp, b, show)}
        ${show ? `<circle class="ar-zone" cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="${sp.vital / 2}" style="stroke-width:${(0.6 / k).toFixed(2)}"/>` : ""}
      </g>
      ${impact ? `<g transform="translate(${impact[0].toFixed(2)} ${impact[1].toFixed(2)})"><g class="ar-impact"><circle r="1.6"/><circle class="halo" r="3.4"/></g></g>` : ""}
      <g class="ar-housing" transform="translate(${hx.toFixed(2)} ${hy.toFixed(2)})">
        <circle class="ring" r="${g.R.toFixed(1)}"/><circle class="ring2" r="${(g.R - 1.6).toFixed(1)}"/>
        ${pins}${holdMark}
        <g class="ar-level" transform="translate(0 ${(g.R - 5).toFixed(1)})"><rect x="-5" y="-1.4" width="10" height="2.8" rx="1.4"/><circle r="0.95"/></g>
      </g>
    </g>
    <circle class="ar-peep" r="57"/>`;
}

function arRenderScope() {
  if (arState.mode !== "guided") return;
  const sp = arSpecies();
  const eff = arEffYards(arState.yards, arState.angle);
  const g = arScopeGeometry();
  const hold = arHold(eff);
  const holdY = (arAim(eff) - g.ref) * 1000;
  $ar("ar-scope").innerHTML = arScopeSvg({
    sp, angleId: arState.angle, los: arState.yards, show: arState.vitals,
    hold: hold.pin ? null : holdY, activePin: hold.pin,
  });
  $ar("ar-hud").innerHTML = `<span>${arState.yards} yd${arState.angle === "stand" ? ` <small>(${arFix(eff)} flat)</small>` : ""}</span><strong>${escapeHtml(hold.label)}</strong>`;
  $ar("ar-sight-sub").textContent =
    `Your pins and the ${sp.name.toLowerCase()} drawn to the same scale, so you can see how much room the vitals give you at this distance.`;
  const gapIn = (arAim(AR_PINS[1]) - arAim(AR_PINS[0])) * eff * 36;
  $ar("ar-scope-note").textContent = hold.beyond
    ? `${hold.detail}. That's farther than your sight is set up for.`
    : `Vitals here are about ${arFix(sp.vital / Math.max(1, Math.abs(gapIn)), 1)}× the 20-to-30 pin gap tall. ${hold.pin ? `Holding the ${hold.pin} pin ${hold.detail}.` : `Holding between pins: ${hold.detail}.`}`;
}

// ---------- Broadheads + energy ----------
function arRenderHeads() {
  const sp = arSpecies();
  const eff = arEffYards(arState.yards, arState.angle);
  const cur = arCurrentHead();
  document.querySelectorAll("#ar-heads .ar-head").forEach((btn) => {
    const h = AR_HEADS.find((x) => x.id === btn.dataset.head);
    const fit = arHeadFit(h, sp);
    btn.dataset.rate = fit.key;
    const on = cur.head.id === h.id;
    btn.setAttribute("aria-pressed", String(on));
    btn.classList.toggle("is-auto", on && cur.auto);
    const rate = btn.querySelector(".bg-rate");
    rate.className = `bg-rate ${fit.key}`;
    rate.innerHTML = `<span aria-hidden="true">${fit.icon}</span>${fit.label}`;
    btn.querySelector(".ar-head-why").textContent = fit.why;
  });
  $ar("ar-head-auto").setAttribute("aria-pressed", String(arState.head === "auto"));
  $ar("ar-head-auto").classList.toggle("is-on", arState.head === "auto");

  const ke = arKE(eff);
  $ar("ar-ke-val").textContent = `${Math.round(ke)} ft·lb`;
  $ar("ar-ke-sub").textContent =
    ` at ${arFix(eff, eff % 1 ? 1 : 0)} yd · ${Math.round(arVel(eff))} fps · ${arFix(arMomentum(eff), 2)} slug·ft/s momentum. ` +
    `${sp.name} sits in the ${sp.minKE}+ ft·lb tier.`;
  $ar("ar-ke-mark").style.left = `${Math.min(100, (ke / AR_KE_MAX) * 100)}%`;
  $ar("ar-ke-need").style.left = `${(sp.minKE / AR_KE_MAX) * 100}%`;
  $ar("ar-fps-out").textContent = `${arState.fps} fps`;
  $ar("ar-grains-out").textContent = `${arState.grains} gr`;
  [["ar-fps", arState.fps, 200, 340], ["ar-grains", arState.grains, 300, 700]].forEach(([id, v, lo, hi]) => {
    const el = $ar(id);
    el.value = String(v);
    el.style.setProperty("--pct", `${((v - lo) / (hi - lo)) * 100}%`);
  });
  document.querySelectorAll(".ar-setups .bg-chip").forEach((b) => {
    const s = AR_SETUPS[Number(b.dataset.setup)];
    b.classList.toggle("is-on", s.fps === arState.fps && s.grains === arState.grains);
  });
}

// ---------- Pins ----------
function arRenderPins() {
  const sp = arSpecies();
  const eff = arEffYards(arState.yards, arState.angle);
  const hold = arHold(eff);
  const r = sp.vital / 2;
  document.querySelectorAll("#ar-pins .ar-pin-row").forEach((row, i) => {
    const p = AR_PINS[i];
    const [a, b] = arPinWindow(p, r);
    const win = row.querySelector(".ar-pin-win");
    win.style.left = `${(a / AR_MAX_YD) * 100}%`;
    win.style.width = `${(Math.min(b, AR_MAX_YD) - Math.min(a, AR_MAX_YD)) / AR_MAX_YD * 100}%`;
    row.querySelector(".ar-pin-track b").style.left = `${(Math.min(eff, AR_MAX_YD) / AR_MAX_YD) * 100}%`;
    const active = hold.pin === p || (hold.between || []).includes(p);
    row.classList.toggle("is-on", active);
    const gap = i ? (arAim(p) - arAim(AR_PINS[i - 1])) * AR_EYE_IN : null;
    row.querySelector(".ar-pin-gap").innerHTML = gap == null
      ? `<small>top pin</small>` : `+${arFix(gap, 2)}″ <small>gap</small>`;
    row.setAttribute("aria-label", `${p} yard pin: stays in the vitals from ${Math.round(a)} to ${Math.round(b)} yards. Set distance to ${p}.`);
  });
  $ar("ar-pins-sub").textContent =
    `Each bar is where holding that pin dead-on still lands inside a ${sp.vital}-in ${sp.name.toLowerCase()} vital zone with your arrow. ` +
    `Gaps between bars are where you hold between pins. Tap a pin to shoot its distance.`;

  const lower = [...AR_PINS].reverse().find((p) => p < eff - 0.5);
  const wrong = lower ? arPinError(lower, eff) : null;
  $ar("ar-wrong").innerHTML = wrong == null
    ? `Inside your top pin's distance, the ${AR_PINS[0]} pin ${escapeHtml(hold.detail)}.`
    : `<strong>Misjudged by one pin?</strong> At ${arFix(eff, eff % 1 ? 1 : 0)} yd, the ${lower} pin lands <strong>${arFix(-wrong)} in low</strong>` +
      ` — ${-wrong > r ? "outside" : "inside"} the ${sp.vital}-in vital zone.`;
}

// ---------- Focus panel ----------
function arRenderFocus() {
  const sp = arSpecies();
  const ang = arShotAngle();
  const eff = arEffYards(arState.yards, arState.angle);
  const hold = arHold(eff);
  const cur = arCurrentHead();
  const fit = arHeadFit(cur.head, sp);

  document.querySelectorAll("#ar-species .bg-animal").forEach((b) => {
    const on = b.dataset.species === sp.id;
    b.setAttribute("aria-checked", String(on));
    b.tabIndex = on ? 0 : -1;
  });
  const img = $ar("ar-focus-img");
  if (!img.src.endsWith(`/${sp.id}.jpg`)) img.src = `images/species/${sp.id}.jpg`;
  img.alt = sp.name;
  $ar("ar-focus-credit").textContent = `Photo: ${BG_PHOTOS[sp.id].credit}`;
  $ar("ar-focus-name").textContent = sp.name;
  $ar("ar-focus-tip").textContent = sp.tip;

  $ar("ar-st-vital").textContent = `~${sp.vital} in`;
  $ar("ar-st-angle").innerHTML = `<span class="ar-dot ${ang.rate}"></span>${escapeHtml(ang.verdict)}`;
  $ar("ar-st-hold").textContent = hold.label;
  $ar("ar-st-head").innerHTML = `<span class="ar-dot ${fit.key}"></span>${escapeHtml(cur.head.name)}${cur.auto ? ` <small>auto</small>` : ""}`;

  $ar("ar-yards-out").textContent = `${arState.yards} yd`;
  const y = $ar("ar-yards");
  y.value = String(arState.yards);
  y.setAttribute("aria-valuetext", `${arState.yards} yards`);
  y.style.setProperty("--pct", `${((arState.yards - AR_MIN_YD) / (AR_MAX_YD - AR_MIN_YD)) * 100}%`);
  document.querySelectorAll(".ar-angles .bg-chip").forEach((b) => {
    const on = b.dataset.angle === ang.id;
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-pressed", String(on));
  });

  const who = sp.name.toLowerCase();
  const an = /^[aeiou]/.test(who) ? "An" : "A";
  $ar("ar-live").textContent = ang.id === "to"
    ? `${an} ${who} quartering to you at ${arState.yards} yd: let it turn. The shoulder covers the vitals.`
    : `${an} ${who} ${ang.id === "stand" ? "below your stand" : ang.name.toLowerCase()} at ${arState.yards} yd: ` +
      `${hold.label.toLowerCase()}, ${cur.head.name.toLowerCase()} is ${fit.key === "good" ? "a " : ""}${fit.label.toLowerCase()} with ${Math.round(fit.ke)} ft·lb.`;
}

function arRefresh({ scene = true } = {}) {
  arRenderFocus();
  if (scene || arState.angle === "stand") { arRenderScene(); arRenderPath(); }
  arRenderScope();
  // Mid-drill, the pins must follow a changed arrow setup, or Release would score against pins
  // the picture isn't showing.
  if (arState.mode === "practice" && arDrill.sc && !arDrill.done) arRenderDrill();
  arRenderHeads();
  arRenderPins();
  arSave();
}

// ---------- Practice drill ----------
// Its own random shot, so the answers elsewhere on the page stay hidden while you play. Uses
// your arrow setup, so the pin spacing is yours.
const arDrill = { sc: null, housing: [0, 0], done: false, shots: 0, good: 0 };

function arNewScenario() {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const r = Math.random();
  const angle = r < 0.4 ? "broadside" : r < 0.7 ? "away" : r < 0.85 ? "to" : "stand";
  const yards = angle === "stand" ? 12 + Math.floor(Math.random() * 16) : 12 + Math.floor(Math.random() * 37);
  arDrill.sc = {
    sp: pick(AR_SPECIES), angle, yards,
    at: [Math.round((Math.random() - 0.5) * 30), Math.round((Math.random() - 0.3) * 24)],
  };
  arDrill.housing = [0, -8];
  arDrill.done = false;
  $ar("ar-drill-result").textContent = "";
  $ar("ar-release").hidden = false;
  $ar("ar-pass").hidden = false;
  $ar("ar-next").hidden = true;
  $ar("ar-load").hidden = true;
  arRenderDrill();
}

function arRenderDrill(impact = null) {
  const sc = arDrill.sc;
  const eff = arEffYards(sc.yards, sc.angle);
  $ar("ar-scope").innerHTML = arScopeSvg({
    sp: sc.sp, angleId: sc.angle, los: sc.yards, show: arDrill.done,
    housing: arDrill.housing, animalAt: sc.at, impact,
  });
  $ar("ar-hud").innerHTML = `<span>Rangefinder: ${sc.yards} yd${sc.angle === "stand" ? ` <small>(${arFix(eff)} flat)</small>` : ""}</span>`;
  const ang = arShotAngle(sc.angle);
  $ar("ar-drill-q").innerHTML =
    `<strong>${escapeHtml(sc.sp.name)}</strong>, ${escapeHtml(sc.angle === "stand" ? `below your ${AR_STAND_FT} ft stand` : ang.name.toLowerCase())}. ` +
    (arDrill.done ? "" : "Drag the sight (or use arrow keys) to put the right spot of your pins on the vitals, then release — or pass.");
  $ar("ar-score").textContent = arDrill.shots ? `${arDrill.good} / ${arDrill.shots} good calls` : "";
  $ar("ar-sight-sub").textContent = "Vitals are hidden. Judge the hold from the rangefinder and your pins, just like in the field.";
}

function arFinishDrill(shot) {
  const sc = arDrill.sc;
  const eff = arEffYards(sc.yards, sc.angle);
  const g = arScopeGeometry();
  const [hx, hy] = arDrill.housing;
  const trueY = (arAim(eff) - g.ref) * 1000;
  const inch = (sc.yards * 36) / 1000;
  const r = sc.sp.vital / 2;
  let impact = null, msg, ok;
  if (!shot) {
    ok = true;
    msg = sc.angle === "to"
      ? "Good call. It was quartering to you, and the shoulder was covering the vitals."
      : "Passing is never wrong. This one was makeable, though — see where the vitals were.";
    if (sc.angle !== "to") ok = null;
  } else {
    impact = [hx, hy + trueY];
    const dx = (impact[0] - sc.at[0]) * inch, dy = (impact[1] - sc.at[1]) * inch;
    const miss = Math.hypot(dx, dy);
    const heldFor = arYardsForAim(g.ref + (sc.at[1] - hy) / 1000);
    const heldTxt = Math.abs(heldFor - eff) >= 1.5 ? ` You held for about ${Math.round(heldFor)} yd; the pins needed ${Math.round(eff)}.` : "";
    const dir = Math.abs(dy) > Math.abs(dx) ? (dy > 0 ? "low" : "high") : (dx > 0 ? "forward" : "back");
    if (sc.angle === "to") {
      ok = false;
      msg = `That one should have been a pass. Quartering to, the arrow meets the shoulder before the vitals.${heldTxt}`;
    } else if (miss <= r) {
      ok = true;
      msg = `In the vitals, ${arFix(miss)} in from the center.${heldTxt}`;
    } else {
      ok = false;
      msg = `Missed the vitals by ${arFix(miss - r)} in (${dir}).${heldTxt}`;
    }
  }
  arDrill.done = true;
  if (ok !== null) { arDrill.shots++; if (ok) arDrill.good++; }
  arRenderDrill(impact);
  const res = $ar("ar-drill-result");
  res.className = `ar-drill-result ${ok ? "good" : ok === false ? "short" : "marginal"}`;
  res.textContent = msg;
  $ar("ar-release").hidden = true;
  $ar("ar-pass").hidden = true;
  $ar("ar-next").hidden = false;
  $ar("ar-load").hidden = false;
}

function arSetMode(mode) {
  arState.mode = mode;
  const practice = mode === "practice";
  $ar("ar-guided-tools").hidden = practice;
  $ar("ar-drill-tools").hidden = !practice;
  const scope = $ar("ar-scope");
  scope.classList.toggle("is-drag", practice);
  scope.tabIndex = practice ? 0 : -1;
  scope.setAttribute("aria-label", practice ? "Sight picture. Drag, or use the arrow keys, to move your sight." : "Sight picture");
  const radio = document.querySelector(`input[name="ar-mode"][value="${mode}"]`);
  if (radio) radio.checked = true;
  if (practice) { if (!arDrill.sc || arDrill.done) arNewScenario(); else arRenderDrill(); }
  else arRenderScope();
}

function arBindDrill() {
  const scope = $ar("ar-scope");
  let drag = null;
  const pt = (e) => {
    const m = scope.getScreenCTM();
    if (!m) return [0, 0];
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [p.x, p.y];
  };
  const clamp = (v) => Math.max(-50, Math.min(50, v));
  scope.addEventListener("pointerdown", (e) => {
    if (arState.mode !== "practice" || arDrill.done) return;
    drag = { start: pt(e), from: [...arDrill.housing] };
    scope.setPointerCapture(e.pointerId);
  });
  let raf = 0;
  scope.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const p = pt(e);
    arDrill.housing = [clamp(drag.from[0] + p[0] - drag.start[0]), clamp(drag.from[1] + p[1] - drag.start[1])];
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => arRenderDrill());
  });
  const end = () => { drag = null; };
  scope.addEventListener("pointerup", end);
  scope.addEventListener("pointercancel", end);
  scope.addEventListener("keydown", (e) => {
    if (arState.mode !== "practice" || arDrill.done) return;
    const step = e.shiftKey ? 2 : 0.5;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); return arFinishDrill(true); }
    if (!d) return;
    e.preventDefault();
    arDrill.housing = [clamp(arDrill.housing[0] + d[0]), clamp(arDrill.housing[1] + d[1])];
    arRenderDrill();
  });
  $ar("ar-release").addEventListener("click", () => arFinishDrill(true));
  $ar("ar-pass").addEventListener("click", () => arFinishDrill(false));
  $ar("ar-next").addEventListener("click", arNewScenario);
  $ar("ar-load").addEventListener("click", () => {
    const sc = arDrill.sc;
    arState.species = sc.sp.id;
    arState.angle = sc.angle;
    arState.yards = sc.yards;
    arSetMode("guided");
    arRefresh();
    document.querySelector(".ar-focus")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

// ---------- Official links (re-rendered from refreshAll) ----------
function renderArchery() {
  const root = $ar("ar-official");
  if (!root) return;
  const { search, areaStates } = appState;
  const abbrs = (areaStates.length ? areaStates : [search?.state]).filter((a) => STATES[a]);
  const cards = abbrs.flatMap((a) =>
    STATES[a].agencies.map(([name, url]) => `
      <a class="alm-agency" href="${escapeHtml(url)}" target="_blank" rel="noopener">
        <span class="alm-agency-abbr" aria-hidden="true">${escapeHtml(a)}</span>
        <span class="alm-agency-body">
          <strong>${escapeHtml(name)}</strong>
          <span>Archery seasons, legal bows and draw weights, and broadhead rules for ${escapeHtml(STATES[a].name)}.</span>
        </span>
        <span class="alm-agency-go" aria-hidden="true">&rarr;</span>
      </a>`)
  );
  root.innerHTML = `
    <section class="bg-section bg-official" aria-labelledby="ar-official-h">
      <div class="panel-heading">
        <h2 id="ar-official-h">What's legal where you hunt</h2>
        <p class="sub">This page makes no legal claims. Some states restrict expandable broadheads, set a minimum cutting
          width or draw weight, or limit crossbows and lighted nocks, and the rules change by season and zone.</p>
      </div>
      ${cards.length
        ? `<div class="alm-agencies">${cards.join("")}</div>`
        : `<p class="notice">Search a U.S. city to see its state wildlife agency.</p>`}
    </section>`;
}

function initArchery() {
  const body = $ar("archery-body");
  if (!body) return;
  $ar("archery-disclaimer").textContent = ARCHERY_DISCLAIMER;
  arLoad();
  body.innerHTML = arShell();
  $ar("ar-vitals-btn").setAttribute("aria-pressed", String(arState.vitals));

  const species = $ar("ar-species");
  species.addEventListener("click", (e) => {
    const b = e.target.closest(".bg-animal");
    if (!b) return;
    arState.species = b.dataset.species;
    arRefresh();
  });
  species.addEventListener("keydown", (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const i = AR_SPECIES.findIndex((s) => s.id === arState.species);
    const n = AR_SPECIES.length;
    arState.species = AR_SPECIES[e.key === "Home" ? 0 : e.key === "End" ? n - 1 : (i + step + n) % n].id;
    arRefresh();
    species.querySelector(`[data-species="${arState.species}"]`).focus();
  });

  // Sliders update on the next frame; only the stand angle's drawing depends on distance.
  let raf = 0;
  const onSlide = (key) => (e) => {
    arState[key] = Number(e.target.value);
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => arRefresh({ scene: false }));
  };
  $ar("ar-yards").addEventListener("input", onSlide("yards"));
  $ar("ar-fps").addEventListener("input", onSlide("fps"));
  $ar("ar-grains").addEventListener("input", onSlide("grains"));

  body.addEventListener("click", (e) => {
    const a = e.target.closest("[data-angle]");
    if (a) { arState.angle = a.dataset.angle; return arRefresh(); }
    const pin = e.target.closest(".ar-pin-row");
    if (pin) { arState.yards = Number(pin.dataset.yards); return arRefresh({ scene: false }); }
    const setup = e.target.closest("[data-setup]");
    if (setup) {
      const s = AR_SETUPS[Number(setup.dataset.setup)];
      arState.fps = s.fps;
      arState.grains = s.grains;
      return arRefresh({ scene: false });
    }
    const head = e.target.closest(".ar-head");
    if (head) { arState.head = head.dataset.head; return arRefresh({ scene: false }); }
    if (e.target.closest("#ar-head-auto")) { arState.head = "auto"; return arRefresh({ scene: false }); }
    if (e.target.closest("#ar-vitals-btn")) {
      arState.vitals = !arState.vitals;
      $ar("ar-vitals-btn").setAttribute("aria-pressed", String(arState.vitals));
      arRenderScope();
      arSave();
    }
  });
  body.addEventListener("change", (e) => {
    if (e.target.name === "ar-mode") arSetMode(e.target.value);
  });
  arBindDrill();

  arRefresh();
  arSetMode("guided");
  renderArchery();
}
