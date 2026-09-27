// Everything the tabs need, derived from the current incident, time, and crossing toggles.
import type { Crossing, CrossingStatus, Hazard, Incident, Rate, Reference, StatusSource } from "./data/types";
import {
  affected, alertText, assignHubs, reliance, situation, stranded, supplies, supplyTotals,
  type HubPlan, type Situation, type Stranded, type SupplyRow,
} from "./lib/logic";
import type { PresenceRow } from "./data/types";

export interface CrossingView {
  crossing: Crossing;
  closed: boolean;
  source: StatusSource;
  detail?: string;
  relying: number;
}

export interface Model {
  ref: Reference;
  incident: Incident;
  hazard: Hazard | undefined;
  date: string;
  slot: string;
  sit: Situation;
  closed: Set<string>;
  crossings: CrossingView[];
  affected: number;
  st: Stranded;
  plan: HubPlan;
  maxPerHub: number;
  rates: Rate[];
  supplyRows: SupplyRow[][]; // aligned with plan.active
  totals: ReturnType<typeof supplyTotals>;
  alert: string;
}

export function buildModel(args: {
  ref: Reference;
  incident: Incident;
  hazard: Hazard | undefined;
  date: string;
  slot: string;
  rows: PresenceRow[];
  base: CrossingStatus[];
  overrides: Record<string, boolean>;
  maxPerHub: number;
  rates: Rate[];
  onHand: Record<string, Record<string, number | undefined>>;
}): Model {
  const { ref, rows, base, overrides, maxPerHub, rates, onHand, incident } = args;
  const sit = situation(rows, ref.origins);
  const baseById = new Map(base.map((b) => [b.id, b]));
  const crossingsRaw = ref.crossings.map((c) => {
    const b = baseById.get(c.id);
    const o = overrides[c.id];
    return o === undefined
      ? { crossing: c, closed: b?.closed ?? false, source: b?.source ?? ("none" as StatusSource), detail: b?.detail }
      : { crossing: c, closed: o, source: "officer" as StatusSource };
  });
  const closed = new Set(crossingsRaw.filter((c) => c.closed).map((c) => c.crossing.id));
  const crossings = crossingsRaw.map((c) => ({ ...c, relying: reliance(sit.byOrigin, c.crossing.id) }));
  const st = stranded(sit.byOrigin, closed);
  const plan = assignHubs(ref.site, ref.hubs, st.waiting, st.lodging, maxPerHub);
  const supplyRows = plan.active.map((a) => supplies(a, rates, incident.duration_h, onHand[a.hub.id]));
  return {
    ...args,
    sit,
    closed,
    crossings,
    affected: affected(sit.byOrigin, closed),
    st,
    plan,
    supplyRows,
    totals: supplyTotals(supplyRows),
    alert: alertText(sit.byOrigin, ref.crossings, closed, plan),
  };
}

export const fmt = (n: number) => n.toLocaleString("en-CA");

export function incidentName(inc: Incident, shortDate: (d: string) => string): string {
  return `${shortDate(inc.date)} · ${inc.title.replace(", ", " · ")}`;
}

export function formatAmount(n: number, unit: string): string {
  return unit === "L" || unit === "m²" ? `${fmt(n)} ${unit}` : fmt(n);
}
