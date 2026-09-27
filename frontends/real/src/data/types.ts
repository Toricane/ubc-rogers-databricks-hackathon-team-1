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

export interface CellSafeData {
  readonly kind: "mock" | "static" | "databricks";
  isMock(): boolean;
  getDates(): Promise<string[]>; // INTERNAL
  getPresence(date: string, slot: string): Promise<PresenceRow[]>; // INTERNAL
  getReference(): Promise<Reference>; // EXTERNAL
  getRates(hazard: HazardId): Promise<Rate[]>; // EXTERNAL
  getHazards(): Promise<Hazard[]>; // EXTERNAL
  getIncidents(): Promise<Incident[]>; // EXTERNAL
  getCrossingStatus(mode: "live" | "incident", incidentId?: string): Promise<CrossingStatus[]>; // EXTERNAL
}
