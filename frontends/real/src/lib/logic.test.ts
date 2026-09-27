import { describe, expect, it } from "vitest";
import type { Crossing, Hub, Origin, Rate } from "../data/types";
import { alertText, assignHubs, busesNeeded, busPlan, canGetHome, ceilSafe, cycleHours, pickRoute, situation, stranded, supplies, totalBuses } from "./logic";
import { fixtureRoutes } from "./__fixtures__/transit";
import { stepSlot } from "./time";

const O = (name: string, group: Origin["group"], crossings: string[] = []): Origin => ({
  name, group, crossings, lat: null, lng: null,
});
const origins: Origin[] = [
  O("Downtown", "vancouver"),
  O("UBC", "vancouver"),
  O("Burnaby", "metro", []),
  O("North Vancouver", "metro", ["seabus", "lions_gate", "ironworkers"]),
  O("Richmond", "metro", ["canada_line", "oak_st"]),
  O("Ontario", "outside"),
];
const crossings: Crossing[] = [
  { id: "seabus", name: "SeaBus", kind: "transit", lat: 49.29, lng: -123.1, drivebc_road: null },
  { id: "lions_gate", name: "Lions Gate Bridge", kind: "bridge", lat: 49.31, lng: -123.14, drivebc_road: "Highway 99" },
  { id: "ironworkers", name: "Ironworkers Memorial Bridge", kind: "bridge", lat: 49.29, lng: -123.03, drivebc_road: "Highway 1" },
  { id: "canada_line", name: "Canada Line", kind: "transit", lat: 49.2, lng: -123.12, drivebc_road: null },
  { id: "oak_st", name: "Oak Street Bridge", kind: "bridge", lat: 49.2, lng: -123.13, drivebc_road: "Highway 99" },
];
const site = { id: "waterfront", name: "Waterfront Station", lat: 49.2857, lng: -123.1115 };
const hubs: Hub[] = [
  { id: "far", name: "Far Hub", address: "2 Far St", lat: 49.22, lng: -123.1 },
  { id: "near", name: "Near Hub", address: "1 Near St", lat: 49.29, lng: -123.12 },
];
const rate = (p: Partial<Rate> & Pick<Rate, "id">): Rate => ({
  label: p.id, unit: "", rate: 1, per_day: false, applies_to: "all", source: "test", ...p,
});

describe("situation", () => {
  it("skips null cells and counts them", () => {
    const s = situation(
      [
        { origin: "Downtown", present: 100 },
        { origin: "UBC", present: null },
        { origin: "Ontario", present: 40 },
        { origin: "Burnaby", present: null },
      ],
      origins,
    );
    expect(s.total).toBe(140);
    expect(s.skipped).toBe(2);
    expect(s.byGroup).toEqual({ vancouver: 100, metro: 0, outside: 40 });
  });
});

describe("canGetHome", () => {
  const none = new Set<string>();
  it("vancouver goes home, outside needs lodging", () => {
    expect(canGetHome(origins[0], none)).toBe("home");
    expect(canGetHome(origins[5], none)).toBe("lodging");
  });
  it("metro with an empty crossing list gets home by road even when everything is closed", () => {
    expect(canGetHome(origins[2], new Set(crossings.map((c) => c.id)))).toBe("home");
  });
  it("metro with one crossing open gets home; with all closed it waits", () => {
    const nv = origins[3];
    expect(canGetHome(nv, new Set(["lions_gate", "ironworkers"]))).toBe("home");
    expect(canGetHome(nv, new Set(["seabus", "lions_gate", "ironworkers"]))).toBe("waiting");
  });
});

describe("assignHubs", () => {
  it("sorts by walking time and overflows into the next hub", () => {
    const plan = assignHubs(site, hubs, 300, 400, 500);
    expect(plan.active.map((a) => a.hub.id)).toEqual(["near", "far"]);
    expect(plan.active[0]).toMatchObject({ waiting: 300, lodging: 200, total: 500 });
    expect(plan.active[1]).toMatchObject({ waiting: 0, lodging: 200, total: 200 });
    expect(plan.active[0].walkMin).toBeLessThan(plan.active[1].walkMin);
    expect(plan.unplaced).toBe(0);
  });
  it("reports people who don't fit", () => {
    expect(assignHubs(site, hubs, 0, 1200, 500).unplaced).toBe(200);
  });
});

describe("supplies", () => {
  const water = rate({ id: "water", rate: 4, per_day: true });
  const n95 = rate({ id: "n95" });
  const cooled = rate({ id: "cooled_floor_space", rate: 4.5 });
  const cots = rate({ id: "cots", applies_to: "lodging" });
  const blankets = rate({ id: "blankets", applies_to: "lodging" });
  const charging = rate({ id: "charging", rate: 0.1 });

  it("heat hazard uses only its resources, and cots vanish when nobody is lodging", () => {
    const heat = [water, n95, cooled, cots];
    const rows = supplies({ waiting: 100, lodging: 0, total: 100 }, heat, 72);
    expect(rows.map((r) => r.rate.id)).toEqual(["water", "n95", "cooled_floor_space"]);
    const withLodging = supplies({ waiting: 100, lodging: 5, total: 105 }, heat, 72);
    expect(withLodging.map((r) => r.rate.id)).toContain("cots");
    expect(withLodging.map((r) => r.rate.id)).not.toContain("blankets");
  });

  it("cots apply to lodging only; water scales with duration", () => {
    const rows = supplies({ waiting: 10, lodging: 5, total: 15 }, [water, cots, blankets], 72);
    expect(rows.find((r) => r.rate.id === "water")!.needed).toBe(15 * 4 * 3);
    expect(rows.find((r) => r.rate.id === "cots")!.needed).toBe(5);
  });

  it("subtracts on-hand stock; empty on-hand means deliver everything", () => {
    const rows = supplies({ waiting: 0, lodging: 10, total: 10 }, [cots, blankets], 72, { cots: 4 });
    expect(rows[0]).toMatchObject({ needed: 10, onHand: 4, toDeliver: 6 });
    expect(rows[1]).toMatchObject({ needed: 10, onHand: null, toDeliver: 10 });
    const over = supplies({ waiting: 0, lodging: 10, total: 10 }, [cots], 72, { cots: 50 });
    expect(over[0].toDeliver).toBe(0);
  });

  it("rounds up, without floating-point dust", () => {
    expect(supplies({ waiting: 654, lodging: 0, total: 654 }, [charging], 72)[0].needed).toBe(66);
    expect(supplies({ waiting: 650, lodging: 0, total: 650 }, [charging], 72)[0].needed).toBe(65);
    expect(supplies({ waiting: 3, lodging: 0, total: 3 }, [cooled], 72)[0].needed).toBe(14);
    expect(ceilSafe(0.1 * 650)).toBe(65);
  });
});

describe("alertText", () => {
  const rows = [
    { origin: "Downtown", present: 50 },
    { origin: "Burnaby", present: 30 },
    { origin: "North Vancouver", present: 40 },
    { origin: "Ontario", present: 20 },
  ];
  const s = situation(rows, origins);
  const build = (closed: Set<string>) => {
    const st = stranded(s.byOrigin, closed);
    return alertText(s.byOrigin, crossings, closed, assignHubs(site, hubs, st.waiting, st.lodging, 500));
  };

  it("changes when a crossing is toggled", () => {
    const partly = build(new Set(["seabus"]));
    expect(partly).toContain("If you live in North Vancouver: Lions Gate Bridge is open — go home that way.");
    const nextOpen = build(new Set(["seabus", "lions_gate"]));
    expect(nextOpen).toContain("Ironworkers Memorial Bridge is open");
    const all = build(new Set(["seabus", "lions_gate", "ironworkers"]));
    expect(all).toContain("If you live in North Vancouver: crossings are closed. Go to Near Hub, 1 Near St.");
    expect(all).not.toContain("is open");
  });

  it("has a line per group", () => {
    const t = build(new Set());
    expect(t).toContain("If you live in Vancouver: head home — no bridge or crossing needed.");
    expect(t).toContain("If you live in Burnaby: head home by road");
    expect(t).toContain("Visiting from outside Metro Vancouver: go to Near Hub, 1 Near St for overnight shelter.");
  });
});

describe("time", () => {
  it("steps across midnight on minutes-of-day", () => {
    expect(stepSlot("2026-08-22", "23:30", 1)).toEqual({ date: "2026-08-23", slot: "00:00" });
    expect(stepSlot("2026-03-01", "00:00", -1)).toEqual({ date: "2026-02-28", slot: "23:30" });
  });
});

describe("buses home", () => {
  const dispatch = [
    { origin: "North Vancouver", present: 400, departing_30m: 150 },
    { origin: "Richmond", present: 300, departing_30m: 90 },
    { origin: "Burnaby", present: 200, departing_30m: 80 },
  ];

  it("picks a bus over rail, then the most scheduled trips", () => {
    expect(pickRoute(fixtureRoutes, "North Vancouver", "lions_gate")!.route_short_name).toBe("B");
    expect(pickRoute(fixtureRoutes, "North Vancouver", "ironworkers")).toBeNull();
  });

  it("sizes buses from riders per hour, capacity and round trip", () => {
    expect(cycleHours(30, 5)).toBeCloseTo(70 / 60);
    // 300 riders/h ÷ 60 per bus × 70/60 h = 5.83 → 6
    expect(busesNeeded(300, 60, 30, 5)).toBe(6);
    expect(busesNeeded(0, 60, 30, 5)).toBe(0);
    expect(busesNeeded(120, 60, 25, 5)).toBe(ceilSafe(2 * (60 / 60)));
  });

  it("leaves Burnaby out (no crossing) and marks the usual way as normal", () => {
    const rows = busPlan(origins, dispatch, fixtureRoutes, new Set(), 60, 5);
    expect(rows.map((r) => r.origin.name).sort()).toEqual(["North Vancouver", "Richmond"]);
    expect(rows.every((r) => r.status === "normal" && r.buses === null)).toBe(true);
    expect(totalBuses(rows)).toBe(0);
  });

  it("diverts North Vancouver onto a Lions Gate bus when SeaBus closes", () => {
    const rows = busPlan(origins, dispatch, fixtureRoutes, new Set(["seabus"]), 60, 5);
    const nv = rows.find((r) => r.origin.name === "North Vancouver")!;
    expect(nv).toMatchObject({ status: "diverted", via: "lions_gate", ridersPerHour: 300 });
    expect(nv.route!.route_short_name).toBe("B");
    expect(nv.buses).toBe(busesNeeded(300, 60, 30, 5));
    expect(rows[0].origin.name).toBe("North Vancouver"); // diverted rows first
  });

  it("reports no number when no scheduled route uses the open crossing", () => {
    const rows = busPlan(origins, dispatch, fixtureRoutes, new Set(["seabus", "lions_gate"]), 60, 5);
    const nv = rows.find((r) => r.origin.name === "North Vancouver")!;
    expect(nv).toMatchObject({ status: "diverted", via: "ironworkers", route: null, buses: null });
  });

  it("marks all-closed as stranded, and keeps working without a dispatch snapshot", () => {
    const all = new Set(["seabus", "lions_gate", "ironworkers"]);
    expect(busPlan(origins, dispatch, fixtureRoutes, all, 60, 5).find((r) => r.origin.name === "North Vancouver")!.status).toBe("stranded");
    const noData = busPlan(origins, null, fixtureRoutes, new Set(["seabus"]), 60, 5);
    expect(noData.find((r) => r.origin.name === "North Vancouver")).toMatchObject({ status: "diverted", ridersPerHour: null, buses: null });
  });
});
