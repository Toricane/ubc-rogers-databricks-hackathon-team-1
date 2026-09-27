// DriveBC Open511 client — adapted from teammate's map (vancouver-disaster-map.html):
// same fetch → normalise → bbox-filter → fallback-snapshot flow, plus pagination,
// a 5-minute cache, and crossing matching.
// Licence: Open Government Licence – British Columbia.
// No email address or personal data is sent; browsers set their own User-Agent.

import type { Crossing, CrossingStatus } from "../data/types";
import { haversineKm } from "./geo";

export interface RoadEvent {
  id: string;
  headline: string;
  description: string;
  severity: string;
  event_type: string;
  updated: string;
  road: string;
  geometry: { type: string; coordinates: any };
  url: string;
}

/** Metro Vancouver. Teammate's box, extended east to -122.50 so Port Mann and Pitt River fall inside. */
export const BBOX = { minLng: -123.42, minLat: 49.0, maxLng: -122.5, maxLat: 49.4 };

const BASE = "https://api.open511.gov.bc.ca/events";
const PAGE = 500;
const CACHE_MS = 5 * 60 * 1000;
export const MATCH_KM = 1;

/** Captured by teammate from a real Open511 query (see his map). Used when the live request fails. */
export const FALLBACK_SNAPSHOT: RoadEvent[] = [
  {
    id: "drivebc.ca/RIDE-102273",
    headline: "Bridge closed overnight — Gilbert Rd / Dinsmore Bridge, Richmond",
    description: "Dinsmore Bridge closed 10pm–6am, Mon–Thu & Sun, through Dec 31. Detour via No. 2 Rd. Bridge.",
    severity: "MINOR",
    event_type: "CONSTRUCTION",
    updated: "2026-09-11",
    road: "Gilbert Road / Dinsmore Bridge",
    geometry: { type: "Point", coordinates: [-123.15117, 49.1809] },
    url: "https://api.open511.gov.bc.ca/events/drivebc.ca/RIDE-102273",
  },
  {
    id: "drivebc.ca/RIDE-102762",
    headline: "Crosswalk construction — University Blvd, UBC",
    description: "Shoulder closed weekdays 7:30am–5:30pm through Oct 30 for crosswalk installation.",
    severity: "MINOR",
    event_type: "CONSTRUCTION",
    updated: "2026-09-24",
    road: "University Boulevard",
    geometry: { type: "Point", coordinates: [-123.23536, 49.26566] },
    url: "https://api.open511.gov.bc.ca/events/drivebc.ca/RIDE-102762",
  },
  {
    id: "drivebc.ca/RIDE-101988",
    headline: "Exit ramp closed — River Rd, Delta",
    description: "Overnight exit-ramp closure through Oct 1 for construction work.",
    severity: "MAJOR",
    event_type: "CONSTRUCTION",
    updated: "2026-09-02",
    road: "River Road",
    geometry: { type: "Point", coordinates: [-123.06579, 49.11368] },
    url: "https://api.open511.gov.bc.ca/events/drivebc.ca/RIDE-101988",
  },
];

function points(geom: RoadEvent["geometry"]): [number, number][] {
  if (!geom) return [];
  if (geom.type === "Point") return [geom.coordinates];
  if (geom.type === "LineString" || geom.type === "MultiPoint") return geom.coordinates;
  if (geom.type === "MultiLineString" || geom.type === "Polygon") return geom.coordinates.flat();
  return [];
}

export function inBbox(geom: RoadEvent["geometry"]): boolean {
  return points(geom).some(
    ([lng, lat]) => lng >= BBOX.minLng && lng <= BBOX.maxLng && lat >= BBOX.minLat && lat <= BBOX.maxLat,
  );
}

export function normalizeEvent(raw: any): RoadEvent {
  return {
    id: raw.id,
    headline: raw.headline ?? "",
    description: String(raw.description ?? "").replace(/\s+/g, " ").slice(0, 220),
    severity: raw.severity ?? "UNKNOWN",
    event_type: raw.event_type ?? "",
    updated: String(raw.updated ?? "").slice(0, 10),
    road: raw.roads?.[0]?.name ?? "",
    geometry: raw.geography,
    url: raw.url ?? "",
  };
}

let cache: { at: number; events: RoadEvent[]; source: "live" | "fallback" } | null = null;

export async function fetchMajorEvents(now = Date.now()): Promise<{ events: RoadEvent[]; source: "live" | "fallback" }> {
  if (cache && now - cache.at < CACHE_MS) return cache;
  try {
    const bbox = [BBOX.minLng, BBOX.minLat, BBOX.maxLng, BBOX.maxLat].join(",");
    const all: any[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const url = `${BASE}?format=json&status=ACTIVE&severity=MAJOR&bbox=${bbox}&limit=${PAGE}&offset=${offset}`;
      const res = await fetch(url, { credentials: "omit", referrerPolicy: "no-referrer" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const page: any[] = data.events ?? [];
      all.push(...page);
      if (page.length < PAGE || !data.pagination?.next_url) break;
    }
    const events = all.map(normalizeEvent).filter((e) => e.geometry && inBbox(e.geometry));
    cache = { at: now, events, source: "live" };
  } catch {
    cache = { at: now, events: FALLBACK_SNAPSHOT.filter((e) => e.severity === "MAJOR"), source: "fallback" };
  }
  return cache;
}

/** "live" or "fallback" for the most recent fetch, or null if none yet. */
export function lastFetchSource(): "live" | "fallback" | null {
  return cache?.source ?? null;
}

/** An event closes a crossing when it is within 1 km and (the crossing has no road name, or the names match). */
export function matchCrossings(events: RoadEvent[], crossings: Crossing[]): CrossingStatus[] {
  return crossings.map((c) => {
    const hit = events.find(
      (e) =>
        (c.drivebc_road === null || e.road === c.drivebc_road) &&
        points(e.geometry).some(([lng, lat]) => haversineKm({ lat, lng }, c) <= MATCH_KM),
    );
    return hit
      ? { id: c.id, closed: true, source: "drivebc" as const, detail: hit.headline }
      : { id: c.id, closed: false, source: "drivebc" as const };
  });
}
