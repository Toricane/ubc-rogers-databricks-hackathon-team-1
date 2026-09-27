// What stranded groups need depends on the hazard. Heat and smoke: a cooling / cleaner-air space
// during the day, not overnight lodging. Storm, lightning, snow and ice: wait for a crossing or lodge overnight.
import type { HazardId } from "../data/types";

export interface NeedWords {
  heat: boolean;
  /** Outside Metro card status on tab 1. */
  outsideNeed: string;
  /** Metro card, after the count of people whose crossings are all closed. */
  metroClosed: string;
  /** Tab 3 table columns. */
  waitingColumn: string;
  lodgingColumn: string;
  /** Supplies card note after the lodging count, e.g. "(40 overnight)". */
  lodgingNote: string;
  /** Tab 3 headline. */
  sendHeadline: (people: string, hubs: number) => string;
  /** Alert lines. */
  alertClosed: (who: string, hubs: string) => string;
  alertOutside: (hubs: string) => string;
}

const HEAT: NeedWords = {
  heat: true,
  outsideNeed: "Need a cooling / cleaner-air space",
  metroClosed: "wait at a cooling space (crossing closed)",
  waitingColumn: "Waiting (crossing closed)",
  lodgingColumn: "Cooling / cleaner air",
  lodgingNote: "need cooling",
  sendHeadline: (people) => `Send ${people} people to cooling spaces.`,
  alertClosed: (who, hubs) => `If you live in ${who}: crossings are closed. Wait at a cooling space: ${hubs}.`,
  alertOutside: (hubs) => `Visiting from outside Metro Vancouver: go to ${hubs} to cool down and breathe cleaner air.`,
};

const SHELTER: NeedWords = {
  heat: false,
  outsideNeed: "Need overnight lodging",
  metroClosed: "stranded (crossing closed)",
  waitingColumn: "Waiting for a crossing",
  lodgingColumn: "Overnight lodging",
  lodgingNote: "overnight",
  sendHeadline: (people, hubs) => `Send ${people} people to ${hubs} ${hubs === 1 ? "hub" : "hubs"}.`,
  alertClosed: (who, hubs) => `If you live in ${who}: crossings are closed. Go to ${hubs}.`,
  alertOutside: (hubs) => `Visiting from outside Metro Vancouver: go to ${hubs} for overnight shelter.`,
};

export function needsFor(hazard: HazardId | undefined): NeedWords {
  return hazard === "heat_smoke" ? HEAT : SHELTER;
}
