// Pure decision logic. No React, no fetch.
import type { Crossing, DispatchRow, Group, Hub, Origin, Place, PresenceRow, Rate, TransitRoute } from "../data/types";
import { haversineKm, walkMinutes } from "./geo";

// ---------- situation ----------

export interface OriginCount {
  origin: Origin;
  present: number;
}

export interface Situation {
  total: number;
  byGroup: Record<Group, number>;
  byOrigin: OriginCount[]; // non-null cells only, largest first
  skipped: number; // null (suppressed) cells
}

export function situation(rows: PresenceRow[], origins: Origin[]): Situation {
  const lookup = new Map(origins.map((o) => [o.name, o]));
  const byGroup: Record<Group, number> = { vancouver: 0, metro: 0, outside: 0 };
  const byOrigin: OriginCount[] = [];
  let skipped = 0;
  for (const r of rows) {
    if (r.present === null) {
      skipped++;
      continue;
    }
    const o = lookup.get(r.origin);
    if (!o) continue;
    byGroup[o.group] += r.present;
    byOrigin.push({ origin: o, present: r.present });
  }
  byOrigin.sort((a, b) => b.present - a.present);
  return { total: byGroup.vancouver + byGroup.metro + byGroup.outside, byGroup, byOrigin, skipped };
}

// ---------- can they get home ----------

export type HomeStatus = "home" | "waiting" | "lodging";

export function canGetHome(origin: Origin, closed: ReadonlySet<string>): HomeStatus {
  if (origin.group === "vancouver") return "home";
  if (origin.group === "outside") return "lodging";
  if (origin.crossings.length === 0) return "home";
  return origin.crossings.some((c) => !closed.has(c)) ? "home" : "waiting";
}

/** First open crossing in the origin's list (list order = preferred way home). */
export function openCrossingFor(origin: Origin, closed: ReadonlySet<string>): string | null {
  return origin.crossings.find((c) => !closed.has(c)) ?? null;
}

export interface Stranded {
  metroHome: number;
  waiting: number;
  lodging: number;
  total: number; // waiting + lodging
}

export function stranded(byOrigin: OriginCount[], closed: ReadonlySet<string>): Stranded {
  let metroHome = 0, waiting = 0, lodging = 0;
  for (const { origin, present } of byOrigin) {
    const s = canGetHome(origin, closed);
    if (s === "waiting") waiting += present;
    else if (s === "lodging") lodging += present;
    else if (origin.group === "metro") metroHome += present;
  }
  return { metroHome, waiting, lodging, total: waiting + lodging };
}

/** People in the area whose home list includes this crossing. */
export function reliance(byOrigin: OriginCount[], crossingId: string): number {
  return byOrigin.reduce((s, { origin, present }) => (origin.crossings.includes(crossingId) ? s + present : s), 0);
}

/** Metro residents with at least one of their crossings closed. */
export function affected(byOrigin: OriginCount[], closed: ReadonlySet<string>): number {
  return byOrigin.reduce(
    (s, { origin, present }) =>
      origin.group === "metro" && origin.crossings.some((c) => closed.has(c)) ? s + present : s,
    0,
  );
}

// ---------- hubs ----------

export interface HubAssignment {
  hub: Hub;
  km: number;
  walkMin: number;
  waiting: number;
  lodging: number;
  total: number;
}

export interface HubPlan {
  ranked: HubAssignment[]; // every hub, nearest first, with its assignment (0 if unused)
  active: HubAssignment[]; // hubs with total > 0
  unplaced: number;
}

/** Nearest hub first (straight line at 5 km/h). Fill each up to maxPerHub: waiting first, then lodging. */
export function assignHubs(site: Place, hubs: Hub[], waiting: number, lodging: number, maxPerHub: number): HubPlan {
  const ranked: HubAssignment[] = hubs
    .map((hub) => {
      const km = haversineKm(site, hub);
      return { hub, km, walkMin: walkMinutes(km), waiting: 0, lodging: 0, total: 0 };
    })
    .sort((a, b) => a.km - b.km);
  let w = Math.max(0, waiting), l = Math.max(0, lodging);
  const cap = Math.max(1, Math.floor(maxPerHub));
  for (const a of ranked) {
    if (w + l === 0) break;
    const tw = Math.min(w, cap);
    const tl = Math.min(l, cap - tw);
    a.waiting = tw;
    a.lodging = tl;
    a.total = tw + tl;
    w -= tw;
    l -= tl;
  }
  return { ranked, active: ranked.filter((a) => a.total > 0), unplaced: w + l };
}

// ---------- supplies ----------

export interface SupplyRow {
  rate: Rate;
  needed: number;
  onHand: number | null;
  toDeliver: number;
}

/** Round up, ignoring floating-point dust (0.1 × 650 = 65.00000000000001 → 65). */
export function ceilSafe(x: number): number {
  return Math.ceil(x - 1e-9);
}

export function needed(rate: Rate, people: number, durationH: number): number {
  return ceilSafe(people * rate.rate * (rate.per_day ? durationH / 24 : 1));
}

export function supplies(
  a: { waiting: number; lodging: number; total: number },
  rates: Rate[],
  durationH: number,
  onHand: Record<string, number | undefined> = {},
): SupplyRow[] {
  const rows: SupplyRow[] = [];
  for (const rate of rates) {
    const people = rate.applies_to === "lodging" ? a.lodging : a.total;
    if (rate.applies_to === "lodging" && people === 0) continue;
    const n = needed(rate, people, durationH);
    const have = onHand[rate.id];
    const h = have === undefined || Number.isNaN(have) ? null : Math.max(0, have);
    rows.push({ rate, needed: n, onHand: h, toDeliver: Math.max(0, n - (h ?? 0)) });
  }
  return rows;
}

export function supplyTotals(perHub: SupplyRow[][]): { rate: Rate; needed: number; toDeliver: number }[] {
  const acc = new Map<string, { rate: Rate; needed: number; toDeliver: number }>();
  for (const rows of perHub)
    for (const r of rows) {
      const t = acc.get(r.rate.id) ?? { rate: r.rate, needed: 0, toDeliver: 0 };
      t.needed += r.needed;
      t.toDeliver += r.toDeliver;
      acc.set(r.rate.id, t);
    }
  return [...acc.values()];
}

// ---------- alert ----------

function list(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function hubsText(hubs: Hub[]): string {
  return hubs.map((h) => `${h.name}, ${h.address}`).join(" or ");
}

export function alertText(
  byOrigin: OriginCount[],
  crossings: Crossing[],
  closed: ReadonlySet<string>,
  plan: HubPlan,
): string {
  const present = byOrigin.filter((o) => o.present > 0).map((o) => o.origin);
  const names = (os: Origin[]) => os.map((o) => o.name).sort((a, b) => a.localeCompare(b));
  const crossingName = new Map(crossings.map((c) => [c.id, c.name]));
  const lines: string[] = [];

  if (present.some((o) => o.group === "vancouver"))
    lines.push("If you live in Vancouver: head home — no bridge or crossing needed.");

  const metro = present.filter((o) => o.group === "metro");
  const byRoad = metro.filter((o) => o.crossings.length === 0);
  if (byRoad.length) lines.push(`If you live in ${list(names(byRoad))}: head home by road — no bridge or crossing needed.`);

  const byOpen = new Map<string, Origin[]>();
  for (const o of metro) {
    if (o.crossings.length === 0) continue;
    const c = openCrossingFor(o, closed);
    if (c) byOpen.set(c, [...(byOpen.get(c) ?? []), o]);
  }
  for (const [c, os] of [...byOpen].sort((a, b) => (crossingName.get(a[0]) ?? "").localeCompare(crossingName.get(b[0]) ?? "")))
    lines.push(`If you live in ${list(names(os))}: ${crossingName.get(c) ?? c} is open — go home that way.`);

  const waitHubs = plan.active.filter((a) => a.waiting > 0).map((a) => a.hub);
  const shut = metro.filter((o) => canGetHome(o, closed) === "waiting");
  if (shut.length && waitHubs.length)
    lines.push(`If you live in ${list(names(shut))}: crossings are closed. Go to ${hubsText(waitHubs)}.`);

  const lodgeHubs = plan.active.filter((a) => a.lodging > 0).map((a) => a.hub);
  if (present.some((o) => o.group === "outside") && lodgeHubs.length)
    lines.push(`Visiting from outside Metro Vancouver: go to ${hubsText(lodgeHubs)} for overnight shelter.`);

  return lines.join("\n");
}

// ---------- buses home (tab 2) ----------

export type BusStatus = "normal" | "diverted" | "stranded";

export interface BusRow {
  origin: Origin;
  status: BusStatus;
  preferred: string; // first crossing in the origin's list
  via: string | null; // open crossing used when diverted
  present: number | null;
  departing30: number | null;
  ridersPerHour: number | null; // departing30 × 2, diverted only
  route: TransitRoute | null; // chosen route when diverted
  routes: TransitRoute[]; // every scheduled route toward this origin
  buses: number | null; // null when diverted with no matching route or no departures
  cycleH: number | null;
}

/** Route toward `origin` that crosses `crossingId`: buses first, then the most scheduled trips per hour. */
export function pickRoute(routes: TransitRoute[], origin: string, crossingId: string): TransitRoute | null {
  const rank = (r: TransitRoute) => [r.mode === "bus" ? 1 : 0, r.trips_per_hour_pm ?? -1];
  const c = routes.filter((r) => r.origin === origin && r.crossing_id === crossingId);
  c.sort((a, b) => {
    const [ma, ta] = rank(a), [mb, tb] = rank(b);
    return mb - ma || tb - ta;
  });
  return c[0] ?? null;
}

/** Round trip in hours: (2 × one-way + 2 × layover) ÷ 60. */
export function cycleHours(oneWayMin: number, layoverMin: number): number {
  return (2 * oneWayMin + 2 * layoverMin) / 60;
}

/** Buses to run continuously so riders/hour fit: ceil(riders ÷ capacity × cycle hours). */
export function busesNeeded(ridersPerHour: number, capacity: number, oneWayMin: number, layoverMin: number): number {
  if (ridersPerHour <= 0) return 0;
  return ceilSafe((ridersPerHour / Math.max(1, capacity)) * cycleHours(oneWayMin, layoverMin));
}

/**
 * One row per Metro home area that needs a crossing.
 * normal: its first crossing is open. diverted: first crossing closed, another open (riders need buses that way).
 * stranded: all closed (the hub logic handles them). `dispatch` may be null when no snapshot exists.
 */
export function busPlan(
  origins: Origin[],
  dispatch: DispatchRow[] | null,
  routes: TransitRoute[],
  closed: ReadonlySet<string>,
  capacity: number,
  layoverMin: number,
): BusRow[] {
  const byOrigin = new Map((dispatch ?? []).map((d) => [d.origin, d]));
  const rows: BusRow[] = [];
  for (const o of origins) {
    if (o.group !== "metro" || o.crossings.length === 0) continue;
    const d = byOrigin.get(o.name);
    const preferred = o.crossings[0];
    const mine = routes.filter((r) => r.origin === o.name);
    const base = {
      origin: o, preferred, present: d?.present ?? null, departing30: d?.departing_30m ?? null,
      routes: mine, ridersPerHour: null, route: null, buses: null, cycleH: null,
    };
    if (!closed.has(preferred)) {
      rows.push({ ...base, status: "normal", via: preferred });
      continue;
    }
    const via = openCrossingFor(o, closed);
    if (!via) {
      rows.push({ ...base, status: "stranded", via: null });
      continue;
    }
    const route = pickRoute(routes, o.name, via);
    const riders = d?.departing_30m == null ? null : d.departing_30m * 2;
    rows.push({
      ...base,
      status: "diverted",
      via,
      ridersPerHour: riders,
      route,
      cycleH: route ? cycleHours(route.one_way_min, layoverMin) : null,
      buses: route && riders !== null ? busesNeeded(riders, capacity, route.one_way_min, layoverMin) : null,
    });
  }
  const order: Record<BusStatus, number> = { diverted: 0, stranded: 1, normal: 2 };
  return rows.sort((a, b) => order[a.status] - order[b.status] || (b.present ?? 0) - (a.present ?? 0));
}

export function totalBuses(rows: BusRow[]): number {
  return rows.reduce((s, r) => s + (r.buses ?? 0), 0);
}
