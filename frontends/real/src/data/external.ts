// Loads the reviewed external reference files from public/data/external/.
import type { CrossingStatus, Hazard, HazardId, Incident, Rate, Reference, Transport, TransportParam } from "./types";
import { fetchMajorEvents, matchCrossings } from "../lib/drivebc";

const BASE = `${import.meta.env.BASE_URL}data/external/`;

async function getJson<T>(file: string): Promise<T> {
  const res = await fetch(BASE + file);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return res.json();
}

let refP: Promise<Reference> | null = null;
export function loadReference(): Promise<Reference> {
  refP ??= Promise.all([getJson<any>("hubs.json"), getJson<any>("crossings.json"), getJson<any>("origins.json")]).then(
    ([h, c, o]) => ({ site: h.site, hubs: h.hubs, crossings: c.crossings, origins: o.origins }),
  );
  return refP;
}

let ratesP: Promise<{ duration_h: number; resources: Rate[] }> | null = null;
export function loadRatesFile() {
  ratesP ??= getJson<any>("rates.json").then((r) => ({ duration_h: r.duration_h.value, resources: r.resources }));
  return ratesP;
}

let hazP: Promise<Hazard[]> | null = null;
export function loadHazards(): Promise<Hazard[]> {
  hazP ??= getJson<any>("hazards.json").then((h) => h.hazards);
  return hazP;
}

export async function loadRates(hazard: HazardId): Promise<Rate[]> {
  const [{ resources }, hazards] = await Promise.all([loadRatesFile(), loadHazards()]);
  const ids = hazards.find((h) => h.id === hazard)?.resources ?? [];
  return ids.map((id) => resources.find((r) => r.id === id)).filter((r): r is Rate => !!r);
}

let transportP: Promise<Transport> | null = null;
/** Bus capacity and layover for tab 2. Each value names its source (or "team_assumption"). */
export function loadTransport(): Promise<Transport> {
  transportP ??= getJson<any>("transport.json").catch(() => {
    throw new Error("Bus settings missing: public/data/external/transport.json could not be read.");
  }).then((t) => {
    const withTitle = (p: TransportParam): TransportParam => ({
      ...p,
      source_title: p.source_title ?? t.sources?.[p.source ?? ""]?.title ?? p.source,
      source_url: p.source_url ?? t.sources?.[p.source ?? ""]?.url ?? undefined,
    });
    if (typeof t?.bus_capacity?.value !== "number" || typeof t?.layover_min?.value !== "number")
      throw new Error("transport.json: bus_capacity.value and layover_min.value are required");
    return { ...t, bus_capacity: withTitle(t.bus_capacity), layover_min: withTitle(t.layover_min) };
  });
  transportP.catch(() => (transportP = null));
  return transportP;
}

let incP: Promise<Incident[]> | null = null;
export function loadIncidents(): Promise<Incident[]> {
  incP ??= getJson<any>("incidents.json").then((i) => i.incidents);
  return incP;
}

export async function loadCrossingStatus(mode: "live" | "incident", incidentId?: string): Promise<CrossingStatus[]> {
  const { crossings } = await loadReference();
  if (mode === "live") {
    const { events } = await fetchMajorEvents();
    return matchCrossings(events, crossings);
  }
  const inc = (await loadIncidents()).find((i) => i.id === incidentId);
  const closed = new Set(inc?.closed_crossings ?? []);
  return crossings.map((c) =>
    closed.has(c.id) ? { id: c.id, closed: true, source: "incident" } : { id: c.id, closed: false, source: "none" },
  );
}
