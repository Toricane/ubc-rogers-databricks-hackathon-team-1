// Mock presence: made-up numbers with a plausible daily shape over the real 36 origin labels.
// Not derived from the table. Every screen shows the "Mock data" badge while this is in use.
import type { PresenceRow } from "./types";
import { toMin } from "../lib/time";

export const SUPPRESS_BELOW = 10;

// Arbitrary relative weights for the mock only.
const WEIGHT: Record<string, number> = {
  Ontario: 14, Surrey: 8, Burnaby: 7, Richmond: 6, "North Vancouver": 6, International: 6,
  Downtown: 5, "West End": 4, Alberta: 4, "British Columbia Other": 4,
  "New Westminster": 3, Delta: 3, Langley: 3, "West Vancouver": 3, UBC: 3, "Port Moody": 2,
  "Maple Ridge": 2, "Pitt Meadows": 1, Fairview: 2, Kitsilano: 2, "Mount Pleasant": 2,
  "Grandview-Woodland": 2, "Hastings-Sunrise": 1.5, "Kensington-Cedar Cottage": 1.5, Strathcona: 1.5,
  "Renfrew-Collingwood": 1.5, Sunset: 1, Killarney: 1, Marpole: 1, Oakridge: 1, "Victoria-Fraserview": 1,
  "Dunbar-Southlands": 1, "Arbutus Ridge": 0.6, "Atlantic Canada": 1.5, Manitoba: 1,
  "Saskatchewan and Territories": 0.8,
};
const FAR = new Set(["Ontario", "International", "Alberta", "Atlantic Canada", "Manitoba", "Saskatchewan and Territories", "British Columbia Other"]);

const PEAK_TOTAL = 4500;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rand(seed: string): number {
  let t = (hash(seed) + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Daily curve peaking mid-afternoon (clock as recorded), with a flatter floor for far-away origins. */
function curve(slot: string, far: boolean): number {
  const h = toMin(slot) / 60 + 0.25;
  const peak = Math.exp(-((h - 17) ** 2) / (2 * 4.5 ** 2));
  return far ? 0.25 + 0.75 * peak : 0.05 + 0.95 * peak;
}

export function mockPresence(origins: string[], date: string, slot: string): PresenceRow[] {
  const total = origins.reduce((s, o) => s + (WEIGHT[o] ?? 1), 0);
  const day = 0.9 + 0.2 * rand(date);
  return origins.map((origin) => {
    const noise = 0.85 + 0.3 * rand(`${date}|${slot}|${origin}`);
    const v = Math.round((PEAK_TOTAL * (WEIGHT[origin] ?? 1)) / total * curve(slot, FAR.has(origin)) * day * noise);
    return { origin, present: v < SUPPRESS_BELOW ? null : v };
  });
}

export function mockDates(): string[] {
  // Same span as the table: 2025-11-01 through 2026-08-31.
  const out: string[] = [];
  const start = Date.UTC(2025, 10, 1);
  const end = Date.UTC(2026, 7, 31);
  for (let t = start; t <= end; t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}
