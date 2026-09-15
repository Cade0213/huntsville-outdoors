// State wildlife agencies (homepages checked 2026-09-14). These are where hunters and anglers
// find licenses, seasons and regulations for each state.

const STATES = {
  AL: { name: "Alabama", agencies: [["Alabama Dept. of Conservation & Natural Resources (Outdoor Alabama)", "https://www.outdooralabama.com"]] },
  AK: { name: "Alaska", agencies: [["Alaska Dept. of Fish and Game", "https://www.adfg.alaska.gov"]] },
  AZ: { name: "Arizona", agencies: [["Arizona Game and Fish Department", "https://www.azgfd.com"]] },
  AR: { name: "Arkansas", agencies: [["Arkansas Game and Fish Commission", "https://www.agfc.com"]] },
  CA: { name: "California", agencies: [["California Dept. of Fish and Wildlife", "https://wildlife.ca.gov"]] },
  CO: { name: "Colorado", agencies: [["Colorado Parks and Wildlife", "https://cpw.state.co.us"]] },
  CT: { name: "Connecticut", agencies: [["Connecticut DEEP – Fish & Wildlife", "https://portal.ct.gov/deep"]] },
  DE: { name: "Delaware", agencies: [["Delaware Division of Fish and Wildlife", "https://dnrec.delaware.gov/fish-wildlife/"]] },
  DC: { name: "District of Columbia", agencies: [["DC Dept. of Energy & Environment – Fishing", "https://doee.dc.gov/service/fishdc"]] },
  FL: { name: "Florida", agencies: [["Florida Fish and Wildlife Conservation Commission", "https://myfwc.com"]] },
  GA: { name: "Georgia", agencies: [["Georgia DNR – Wildlife Resources Division", "https://georgiawildlife.com"]] },
  HI: { name: "Hawaii", agencies: [["Hawaii Dept. of Land and Natural Resources", "https://dlnr.hawaii.gov"]] },
  ID: { name: "Idaho", agencies: [["Idaho Fish and Game", "https://idfg.idaho.gov"]] },
  IL: { name: "Illinois", agencies: [["Illinois Dept. of Natural Resources", "https://dnr.illinois.gov"]] },
  IN: { name: "Indiana", agencies: [["Indiana DNR – Fish & Wildlife", "https://www.in.gov/dnr/fish-and-wildlife/"]] },
  IA: { name: "Iowa", agencies: [["Iowa Dept. of Natural Resources", "https://www.iowadnr.gov"]] },
  KS: { name: "Kansas", agencies: [["Kansas Dept. of Wildlife and Parks", "https://ksoutdoors.gov"]] },
  KY: { name: "Kentucky", agencies: [["Kentucky Dept. of Fish & Wildlife Resources", "https://fw.ky.gov"]] },
  LA: { name: "Louisiana", agencies: [["Louisiana Dept. of Wildlife and Fisheries", "https://www.wlf.louisiana.gov"]] },
  ME: { name: "Maine", agencies: [["Maine Dept. of Inland Fisheries and Wildlife", "https://www.maine.gov/ifw/"]] },
  MD: { name: "Maryland", agencies: [["Maryland Dept. of Natural Resources", "https://dnr.maryland.gov"]] },
  MA: { name: "Massachusetts", agencies: [["MassWildlife", "https://www.mass.gov/orgs/division-of-fisheries-and-wildlife"]] },
  MI: { name: "Michigan", agencies: [["Michigan Dept. of Natural Resources", "https://www.michigan.gov/dnr"]] },
  MN: { name: "Minnesota", agencies: [["Minnesota Dept. of Natural Resources", "https://www.dnr.state.mn.us"]] },
  MS: { name: "Mississippi", agencies: [["Mississippi Dept. of Wildlife, Fisheries, and Parks", "https://www.mdwfp.com"]] },
  MO: { name: "Missouri", agencies: [["Missouri Dept. of Conservation", "https://mdc.mo.gov"]] },
  MT: { name: "Montana", agencies: [["Montana Fish, Wildlife & Parks", "https://fwp.mt.gov"]] },
  NE: { name: "Nebraska", agencies: [["Nebraska Game and Parks Commission", "https://outdoornebraska.gov"]] },
  NV: { name: "Nevada", agencies: [["Nevada Dept. of Wildlife", "https://www.ndow.org"]] },
  NH: { name: "New Hampshire", agencies: [["New Hampshire Fish and Game", "https://www.wildlife.nh.gov"]] },
  NJ: { name: "New Jersey", agencies: [["New Jersey Fish & Wildlife", "https://dep.nj.gov/njfw/"]] },
  NM: { name: "New Mexico", agencies: [["New Mexico Dept. of Game and Fish", "https://wildlife.dgf.nm.gov"]] },
  NY: { name: "New York", agencies: [["New York State DEC", "https://dec.ny.gov"]] },
  NC: { name: "North Carolina", agencies: [["NC Wildlife Resources Commission", "https://www.ncwildlife.gov"]] },
  ND: { name: "North Dakota", agencies: [["North Dakota Game and Fish", "https://gf.nd.gov"]] },
  OH: { name: "Ohio", agencies: [["Ohio Dept. of Natural Resources", "https://ohiodnr.gov"]] },
  OK: { name: "Oklahoma", agencies: [["Oklahoma Dept. of Wildlife Conservation", "https://www.wildlifedepartment.com"]] },
  OR: { name: "Oregon", agencies: [["Oregon Dept. of Fish and Wildlife", "https://myodfw.com"]] },
  PA: {
    name: "Pennsylvania",
    agencies: [
      ["Pennsylvania Game Commission (hunting)", "https://www.pa.gov/agencies/pgc"],
      ["Pennsylvania Fish & Boat Commission (fishing)", "https://www.pa.gov/agencies/fishandboat"],
    ],
  },
  RI: { name: "Rhode Island", agencies: [["Rhode Island DEM – Fish & Wildlife", "https://dem.ri.gov"]] },
  SC: { name: "South Carolina", agencies: [["South Carolina Dept. of Natural Resources", "https://www.dnr.sc.gov"]] },
  SD: { name: "South Dakota", agencies: [["South Dakota Game, Fish and Parks", "https://gfp.sd.gov"]] },
  TN: { name: "Tennessee", agencies: [["Tennessee Wildlife Resources Agency", "https://www.tn.gov/twra"]] },
  TX: { name: "Texas", agencies: [["Texas Parks and Wildlife Department", "https://tpwd.texas.gov"]] },
  UT: { name: "Utah", agencies: [["Utah Division of Wildlife Resources", "https://wildlife.utah.gov"]] },
  VT: { name: "Vermont", agencies: [["Vermont Fish & Wildlife", "https://vtfishandwildlife.com"]] },
  VA: { name: "Virginia", agencies: [["Virginia Dept. of Wildlife Resources", "https://dwr.virginia.gov"]] },
  WA: { name: "Washington", agencies: [["Washington Dept. of Fish & Wildlife", "https://wdfw.wa.gov"]] },
  WV: { name: "West Virginia", agencies: [["West Virginia Division of Natural Resources", "https://wvdnr.gov"]] },
  WI: { name: "Wisconsin", agencies: [["Wisconsin Dept. of Natural Resources", "https://dnr.wisconsin.gov"]] },
  WY: { name: "Wyoming", agencies: [["Wyoming Game and Fish Department", "https://wgfd.wyo.gov"]] },
};

const STATE_BY_NAME = Object.fromEntries(Object.entries(STATES).map(([abbr, s]) => [s.name.toLowerCase(), abbr]));

function stateAbbr(name) {
  if (!name) return null;
  if (STATES[name.toUpperCase()]) return name.toUpperCase();
  return STATE_BY_NAME[name.toLowerCase()] || null;
}

function primaryAgency(abbr) {
  const s = STATES[abbr];
  return s ? { name: s.agencies[0][0], url: s.agencies[0][1] } : null;
}
