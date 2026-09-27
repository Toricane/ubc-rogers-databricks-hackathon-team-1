// One interface, three implementations. Pick with ?data=mock|static|databricks or VITE_DATA_SOURCE.
// Default is "static", which falls back to mock (with the badge) when internal files are missing.
import type { FiveBarsData, HazardId, PresenceRow } from "./types";
import { loadCrossingStatus, loadHazards, loadIncidents, loadRates, loadReference } from "./external";
import { mockDates, mockPresence } from "./mock";

export type { FiveBarsData } from "./types";

abstract class ExternalBase {
  getReference() { return loadReference(); }
  getRates(hazard: HazardId) { return loadRates(hazard); }
  getHazards() { return loadHazards(); }
  getIncidents() { return loadIncidents(); }
  getCrossingStatus(mode: "live" | "incident", incidentId?: string) { return loadCrossingStatus(mode, incidentId); }
}

export class MockAdapter extends ExternalBase implements FiveBarsData {
  readonly kind = "mock" as const;
  isMock() { return true; }
  async getDates() { return mockDates(); }
  async getPresence(date: string, slot: string): Promise<PresenceRow[]> {
    const { origins } = await loadReference();
    return mockPresence(origins.map((o) => o.name), date, slot);
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

export class StaticAdapter extends ExternalBase implements FiveBarsData {
  readonly kind = "static" as const;
  private fellBack = false;
  private mock = new MockAdapter();
  private days = new Map<string, Promise<{ slot_start: string; origin: string; present: number | null }[] | null>>();

  isMock() { return this.fellBack; }

  async getDates() {
    const dates = await tryJson<string[]>(`${INTERNAL}dates.json`);
    if (!Array.isArray(dates) || dates.length === 0) {
      this.fellBack = true;
      return this.mock.getDates();
    }
    return dates;
  }

  async getPresence(date: string, slot: string): Promise<PresenceRow[]> {
    if (this.fellBack) return this.mock.getPresence(date, slot);
    if (!this.days.has(date)) this.days.set(date, tryJson(`${INTERNAL}presence/${date}.json`));
    const rows = await this.days.get(date)!;
    if (!rows) {
      this.fellBack = true;
      return this.mock.getPresence(date, slot);
    }
    return rows.filter((r) => r.slot_start === slot).map(({ origin, present }) => ({ origin, present }));
  }
}

/** Stub only. Intended endpoints: GET /api/dates, GET /api/presence?date=&slot=. Not implemented. */
export class DatabricksAdapter extends ExternalBase implements FiveBarsData {
  readonly kind = "databricks" as const;
  isMock() { return false; }
  async getDates(): Promise<string[]> {
    throw new Error("DatabricksAdapter is a stub (/api/dates). See NEXT_STEPS.md.");
  }
  async getPresence(_date: string, _slot: string): Promise<PresenceRow[]> {
    throw new Error("DatabricksAdapter is a stub (/api/presence). See NEXT_STEPS.md.");
  }
}

export function createAdapter(search = window.location.search): FiveBarsData {
  const choice = new URLSearchParams(search).get("data") ?? import.meta.env.VITE_DATA_SOURCE ?? "static";
  if (choice === "mock") return new MockAdapter();
  if (choice === "databricks") return new DatabricksAdapter();
  return new StaticAdapter();
}
