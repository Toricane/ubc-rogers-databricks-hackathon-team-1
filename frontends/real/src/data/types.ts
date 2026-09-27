// Shared shapes for internal (presence) and external (reference) data.
// Times are "HH:MM" strings. Never build Date objects from them.

export type Group = "vancouver" | "metro" | "outside";
export type HazardId = "storm" | "heat_smoke" | "lightning" | "snow_ice";

export interface PresenceRow {
  origin: string;
  present: number | null; // null = fewer than 10 visits (suppressed)
}

export interface Origin {
  name: string;
  group: Group;
  lat: number | null;
  lng: number | null;
  crossings: string[]; // crossing ids; empty for metro = can get home by road
}

export interface Place {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface Hub extends Place {
  address: string;
}

export interface Crossing extends Place {
  kind: "bridge" | "tunnel" | "transit";
  drivebc_road: string | null;
}

export interface Reference {
  site: Place;
  origins: Origin[];
  hubs: Hub[];
  crossings: Crossing[];
}

export interface Rate {
  id: string;
  label: string;
  unit: string;
  rate: number;
  per_day: boolean;
  applies_to: "all" | "lodging";
  source: string;
  source_url?: string;
  quote?: string;
  note?: string;
}

export interface Hazard {
  id: HazardId;
  label: string;
  resources: string[];
}

export interface Incident {
  id: string;
  date: string; // YYYY-MM-DD
  hazard: HazardId;
  title: string;
  description: string;
  slot_start: string | null; // "HH:MM"
  closed_crossings: string[];
  duration_h: number;
  source_url: string | null;
}

export type StatusSource = "drivebc" | "officer" | "incident" | "none";

export interface CrossingStatus {
  id: string;
  closed: boolean;
  source: StatusSource;
  detail?: string; // e.g. DriveBC headline
}

// ---------- dispatch (tab 2: getting home) ----------

/** One home area at one slot, from public/data/internal/dispatch/{date}.json. */
export interface DispatchRow {
  origin: string;
  present: number | null;
  departing_30m: number | null; // sessions that end in [slot, slot + 30 min)
}

export interface TransitStop {
  name: string;
  lat: number;
  lng: number;
}

/** A scheduled TransLink route from the Waterfront area toward a home area (GTFS static, not real-time). */
export interface TransitRoute {
  origin: string;
  crossing_id: string | null;
  route_short_name: string;
  route_long_name: string;
  mode: "bus" | "rail" | "ferry";
  board: TransitStop;
  alight: TransitStop;
  one_way_min: number;
  trips_per_hour_pm: number | null;
  shape: [number, number][];
}

export interface Transit {
  feed: { version: string | null; start: string | null; end: string | null; url: string | null };
  routes: TransitRoute[];
}

/** A sourced (or labelled team-assumption) parameter from public/data/external/transport.json. */
export interface TransportParam {
  value: number;
  unit?: string;
  source?: string;
  source_title?: string;
  source_url?: string;
  quote?: string;
  note?: string;
}

export interface Transport {
  bus_capacity: TransportParam;
  layover_min: TransportParam;
  gtfs?: { url?: string | null; title?: string | null; version?: string | null; fetched?: string | null };
}

export interface FiveBarsData {
  readonly kind: "mock" | "static" | "databricks";
  isMock(): boolean;
  getDates(): Promise<string[]>; // INTERNAL
  getPresence(date: string, slot: string): Promise<PresenceRow[]>; // INTERNAL
  getReference(): Promise<Reference>; // EXTERNAL
  getRates(hazard: HazardId): Promise<Rate[]>; // EXTERNAL
  getHazards(): Promise<Hazard[]>; // EXTERNAL
  getIncidents(): Promise<Incident[]>; // EXTERNAL
  getCrossingStatus(mode: "live" | "incident", incidentId?: string): Promise<CrossingStatus[]>; // EXTERNAL
  getDispatch(date: string, slot: string): Promise<DispatchRow[]>; // INTERNAL (gold_route_demand export)
  getTransit(): Promise<Transit>; // INTERNAL (gold_route_transit export, GTFS-derived)
  getTransport(): Promise<Transport>; // EXTERNAL
}
