/**
 * UK geographies, as far down as the evidence goes and no further.
 *
 * The list stops at the twelve ONS regions and countries because that is the
 * level ASHE publishes earnings by occupation at. Helix could produce a
 * city-level figure by arithmetic, and it would be fiction: nothing in the
 * evidence distinguishes Manchester from Blackburn, and a number that looks
 * local invites a decision that the data cannot support.
 *
 * Northern Ireland is in the list. ONS suppresses it for several occupation
 * groups, and the interface says so for that career rather than quietly showing
 * the UK figure under a Northern Ireland heading.
 */

export const UK = { key: "uk", label: "United Kingdom", short: "UK", nation: "uk" };

export const REGIONS = [
  UK,
  { key: "london", label: "London", short: "London", nation: "england" },
  { key: "south_east", label: "South East", short: "South East", nation: "england" },
  { key: "south_west", label: "South West", short: "South West", nation: "england" },
  { key: "east_of_england", label: "East of England", short: "East of England",
    nation: "england" },
  { key: "west_midlands", label: "West Midlands", short: "West Midlands",
    nation: "england" },
  { key: "east_midlands", label: "East Midlands", short: "East Midlands",
    nation: "england" },
  { key: "north_west", label: "North West", short: "North West", nation: "england" },
  { key: "north_east", label: "North East", short: "North East", nation: "england" },
  { key: "yorkshire_and_the_humber", label: "Yorkshire and The Humber",
    short: "Yorkshire", nation: "england" },
  { key: "scotland", label: "Scotland", short: "Scotland", nation: "scotland" },
  { key: "wales", label: "Wales", short: "Wales", nation: "wales" },
  { key: "northern_ireland", label: "Northern Ireland", short: "Northern Ireland",
    nation: "northern_ireland" },
];

const BY_KEY = new Map(REGIONS.map((region) => [region.key, region]));

export function region(key) {
  return BY_KEY.get(key) || null;
}

export function regionLabel(key) {
  const found = BY_KEY.get(key);
  return found ? found.label : "United Kingdom";
}

/** A stored value forced back onto a region Helix recognises. */
export function normaliseRegion(value) {
  return BY_KEY.has(value) ? value : UK.key;
}

export function isUk(key) {
  return !key || key === UK.key;
}

/**
 * Which pay framework applies where.
 *
 * Not a salary — a statement about which official body sets public-sector pay in
 * that country, so a user in Scotland is not pointed at an England pay circular.
 */
export const PAY_FRAMEWORK_BY_NATION = {
  england: "NHS Agenda for Change (England)",
  scotland: "NHS Agenda for Change (Scotland)",
  wales: "NHS Agenda for Change (Wales)",
  northern_ireland: "HSC Agenda for Change (Northern Ireland)",
  uk: "NHS Agenda for Change",
};
