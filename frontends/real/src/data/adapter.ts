// One interface, three implementations. Pick with ?data=mock|static|databricks or VITE_DATA_SOURCE.
// Default is "static" (exported Databricks snapshots). Mock is only used when asked for explicitly.
import type { DispatchRow, CellSafeData, HazardId, PresenceRow, Transit } from "./types";
import { loadCrossingStatus, loadHazards, loadIncidents, loadRates, loadReference, loadTransport } from "./external";
import { mockDates, mockPresence } from "./mock";

export type { CellSafeData } from "./types";

abstract class ExternalBase {
  getReference() { return loadReference(); }
  getRates(hazard: HazardId) { return loadRates(hazard); }
  getHazards() { return loadHazards(); }
  getIncidents() { return loadIncidents(); }
  getCrossingStatus(mode: "live" | "incident", incidentId?: string) { return loadCrossingStatus(mode, incidentId); }
  getTransport() { return loadTransport(); }
}

export class MockAdapter extends ExternalBase implements CellSafeData {
  readonly kind = "mock" as const;
  isMock() { return true; }
  async getDates() { return mockDates(); }
  async getPresence(date: string, slot: string): Promise<PresenceRow[]> {
    const { origins } = await loadReference();
    return mockPresence(origins.map((o) => o.name), date, slot);
  }
  // No mock dispatch numbers: tab 2 shows routes only.
  async getDispatch(_date: string, _slot: string): Promise<DispatchRow[]> { return []; }
  async getTransit(): Promise<Transit> {
    return { feed: { version: null, start: null, end: null, url: null }, routes: [] };
  }
}

const INTERNAL = `${import.meta.env.BASE_URL}data/internal/`;

/** Returns parsed JSON, or null when the file is missing (Vite's dev server answers 404s with index.html). */
async function tryJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return JSON.parse(await res.text()) as T;
  } catch {
    return null;
  }
}

/**
 * Exported Databricks snapshots. Never falls back to mock: a missing file is an error the UI shows.
 * Each day's JSON is fetched once and kept in memory; the server lets the browser cache it too.
 */
export class StaticAdapter extends ExternalBase implements CellSafeData {
  readonly kind = "static" as const;
  private dates: Promise<string[]> | null = null;
  private manifest: Promise<SnapshotManifest | null> | null = null;
  private days = new Map<string, Promise<{ slot_start: string; origin: string; present: number | null }[] | null>>();

  isMock() { return false; }

  getDates() {
    this.dates ??= tryJson<string[]>(`${INTERNAL}dates.json`).then((d) => {
      if (!Array.isArray(d) || d.length === 0)
        throw new Error("No exported Databricks data: public/data/internal/dates.json is missing. Run scripts/export_databricks.py.");
      return d;
    });
    return this.dates;
  }

  getManifest() {
    this.manifest ??= tryJson<SnapshotManifest>(`${INTERNAL}manifest.json`);
    return this.manifest;
  }

  async getPresence(date: string, slot: string): Promise<PresenceRow[]> {
    const dates = await this.getDates();
    if (!dates.includes(date)) throw new MissingSnapshotError(date);
    if (!this.days.has(date)) this.days.set(date, tryJson(`${INTERNAL}presence/${date}.json`));
    const rows = await this.days.get(date)!;
    if (!Array.isArray(rows)) {
      this.days.delete(date);
      throw new MissingSnapshotError(date);
    }
    const at = rows.filter((r) => r.slot_start === slot);
    if (at.length === 0) throw new Error(`The ${date} snapshot has no rows for ${slot}.`);
    return at.map(({ origin, present }) => ({ origin, present }));
  }

  private dispatchDates: Promise<string[]> | null = null;
  private dispatchDays = new Map<string, Promise<({ slot_start: string } & DispatchRow)[] | null>>();
  private transit: Promise<Transit> | null = null;

  getDispatchDates() {
    this.dispatchDates ??= tryJson<string[]>(`${INTERNAL}dispatch/dates.json`).then((d) => (Array.isArray(d) ? d : []));
    return this.dispatchDates;
  }

  async getDispatch(date: string, slot: string): Promise<DispatchRow[]> {
    const dates = await this.getDispatchDates();
    if (!dates.includes(date)) throw new MissingDispatchError(date);
    if (!this.dispatchDays.has(date)) this.dispatchDays.set(date, tryJson(`${INTERNAL}dispatch/${date}.json`));
    const rows = await this.dispatchDays.get(date)!;
    if (!Array.isArray(rows)) {
      this.dispatchDays.delete(date);
      throw new MissingDispatchError(date);
    }
    const at = rows.filter((r) => r.slot_start === slot);
    if (at.length === 0) throw new Error(`The ${date} dispatch snapshot has no rows for ${slot}.`);
    return at.map(({ origin, present, departing_30m }) => ({ origin, present, departing_30m }));
  }

  getTransit() {
    this.transit ??= tryJson<Transit>(`${INTERNAL}dispatch/transit.json`).then((t) => {
      if (!t || !Array.isArray(t.routes)) {
        this.transit = null;
        throw new Error("No TransLink route export: public/data/internal/dispatch/transit.json is missing.");
      }
      return t;
    });
    return this.transit;
  }
}

export class MissingDispatchError extends Error {
  constructor(readonly date: string) {
    super(`No dispatch snapshot for ${date}.`);
  }
}

export class MissingSnapshotError extends Error {
  constructor(readonly date: string) {
    super(`No exported snapshot for ${date}.`);
  }
}

export interface SnapshotManifest {
  kind: string;
  source: { presence_table: string; check_table: string };
  metric: string;
  clock: string;
  counts: string;
  source_period: string;
  exported_at_utc: string;
  dates: string[];
}

/** Stub only. Intended endpoints: GET /api/dates, GET /api/presence?date=&slot=. Not implemented. */
export class DatabricksAdapter extends ExternalBase implements CellSafeData {
  readonly kind = "databricks" as const;
  isMock() { return false; }
  async getDates(): Promise<string[]> {
    throw new Error("DatabricksAdapter is a stub (/api/dates). See NEXT_STEPS.md.");
  }
  async getPresence(_date: string, _slot: string): Promise<PresenceRow[]> {
    throw new Error("DatabricksAdapter is a stub (/api/presence). See NEXT_STEPS.md.");
  }
  async getDispatch(_date: string, _slot: string): Promise<DispatchRow[]> {
    throw new Error("DatabricksAdapter is a stub (/api/dispatch). See NEXT_STEPS.md.");
  }
  async getTransit(): Promise<Transit> {
    throw new Error("DatabricksAdapter is a stub (/api/transit). See NEXT_STEPS.md.");
  }
}

export function createAdapter(search = window.location.search): CellSafeData {
  const choice = new URLSearchParams(search).get("data") ?? import.meta.env.VITE_DATA_SOURCE ?? "static";
  if (choice === "mock") return new MockAdapter();
  if (choice === "databricks") return new DatabricksAdapter();
  return new StaticAdapter();
}
