// Test-only fixture. Route names and numbers are placeholders for unit tests, not app data.
import type { TransitRoute } from "../../data/types";

const stop = (name: string, lat: number, lng: number) => ({ name, lat, lng });

const route = (p: Partial<TransitRoute> & Pick<TransitRoute, "origin" | "crossing_id" | "route_short_name">): TransitRoute => ({
  route_long_name: `Route ${p.route_short_name}`,
  mode: "bus",
  board: stop("Board", 49.2857, -123.1115),
  alight: stop("Alight", 49.32, -123.07),
  one_way_min: 20,
  trips_per_hour_pm: 4,
  shape: [[49.2857, -123.1115], [49.32, -123.07]],
  ...p,
});

export const fixtureRoutes: TransitRoute[] = [
  route({ origin: "North Vancouver", crossing_id: "seabus", route_short_name: "SeaBus", mode: "ferry", one_way_min: 12, trips_per_hour_pm: 4 }),
  route({ origin: "North Vancouver", crossing_id: "lions_gate", route_short_name: "A", one_way_min: 25, trips_per_hour_pm: 3 }),
  route({ origin: "North Vancouver", crossing_id: "lions_gate", route_short_name: "B", one_way_min: 30, trips_per_hour_pm: 6 }),
  route({ origin: "North Vancouver", crossing_id: "lions_gate", route_short_name: "Train", mode: "rail", one_way_min: 10, trips_per_hour_pm: 12 }),
  route({ origin: "Richmond", crossing_id: "canada_line", route_short_name: "Canada Line", mode: "rail", one_way_min: 25, trips_per_hour_pm: 10 }),
];
