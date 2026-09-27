"""TransLink scheduled service from Waterfront Station to each Metro home area (static GTFS, not real-time).

Plain Python module (stdlib + pandas). Import it from a Databricks notebook or run it locally:

    python notebooks/dispatch_transit.py /tmp/gtfs/google_transit.zip

Rules (documented so the output can be checked):
- Service day: one representative weekday active in the feed (default 2026-10-07, a Wednesday with no
  holiday). The feed does not cover July 2026; the schedule stands in for a typical weekday.
- Board stop: on each trip, the stop closest to the site among stops within BOARD_RADIUS_M of it.
- Alight stop: the stop after the board stop that is closest to the origin's centroid, within ALIGHT_MAX_KM
  of it and at least MIN_PROGRESS_KM closer to it than the board stop. Big municipalities have centroids
  far from their stations, hence the 10 km limit.
- A trip pattern "crosses" a crossing when its board-to-alight shape passes within CROSSING_RADIUS_KM of the
  crossing point with at least BEYOND_KM of route still to go (so a trip that ends just before a bridge
  doesn't count).
- A pattern is kept for an origin when (a) it does not pass within FOREIGN_RADIUS_KM of a crossing outside
  that origin's list (tighter than CROSSING_RADIUS_KM so shoreline rail near a bridge doesn't count), and
  (b) either it crosses one of the origin's crossings and no other Metro origin listing that crossing would
  be closer to the alight stop while the trip continues on to that rival's nearest stop (North vs West
  Vancouver both list Lions Gate), or it crosses nothing and the alight stop's nearest
  home-area centroid (all labels with coordinates) is this origin. This drops trips that end in Vancouver
  neighbourhoods or on the wrong side of Burrard Inlet or the Fraser.
- Known limitation: centroids stand in for municipal boundaries, so a stop near a border can be assigned to
  the neighbouring area (e.g. SFU, in Burnaby, sits nearer the Port Moody centroid).
- crossing_id: the origin's crossing the pattern passes closest to; null if it crosses none.
- Window: trips departing the board stop 16:00 to 19:00 (feed clock). one_way_min is the median scheduled
  board-to-alight time; trips_per_hour_pm is kept trips / 3.
- Keep the TOP_N routes per origin by trips_per_hour_pm. An origin with no kept trip has no rows.
"""
from __future__ import annotations

import io
import json
import math
import sys
import zipfile

import pandas as pd

SERVICE_DATE = "20261007"
BOARD_RADIUS_M = 800
ALIGHT_MAX_KM = 10.0
MIN_PROGRESS_KM = 2.0
CROSSING_RADIUS_KM = 1.2
FOREIGN_RADIUS_KM = 0.2
BEYOND_KM = 0.5
WINDOW = (16 * 3600, 19 * 3600)
TOP_N = 4
MAX_SHAPE_POINTS = 150
MODE = {0: "rail", 1: "rail", 2: "rail", 3: "bus", 4: "ferry", 715: "bus"}

COLUMNS = ["origin", "crossing_id", "route_id", "route_short_name", "route_long_name", "mode",
           "board_stop_name", "board_lat", "board_lng", "alight_stop_name", "alight_lat", "alight_lng",
           "one_way_min", "trips_per_hour_pm", "shape_json", "feed_version"]


def _km(lat1, lng1, lat2, lng2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(h))


def _secs(t: str) -> int:
    h, m, s = (int(x) for x in str(t).strip().split(":"))
    return h * 3600 + m * 60 + s


def _read(z: zipfile.ZipFile, name: str, **kw) -> pd.DataFrame:
    with z.open(name) as f:
        return pd.read_csv(io.TextIOWrapper(f, encoding="utf-8-sig"), **kw)


def _active_services(z: zipfile.ZipFile, date: str) -> set[str]:
    cal = _read(z, "calendar.txt", dtype=str)
    wd = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"][
        pd.Timestamp(date).weekday()]
    on = cal[(cal[wd] == "1") & (cal["start_date"] <= date) & (cal["end_date"] >= date)]
    active = set(on["service_id"])
    if "calendar_dates.txt" in z.namelist():
        cd = _read(z, "calendar_dates.txt", dtype=str)
        cd = cd[cd["date"] == date]
        active |= set(cd.loc[cd["exception_type"] == "1", "service_id"])
        active -= set(cd.loc[cd["exception_type"] == "2", "service_id"])
    return active


def _simplify(pts: list[list[float]], n: int = MAX_SHAPE_POINTS) -> list[list[float]]:
    if len(pts) <= n:
        return pts
    step = (len(pts) - 1) / (n - 1)
    return [pts[round(i * step)] for i in range(n)]


def _cut_shape(shape: pd.DataFrame, a: tuple[float, float], b: tuple[float, float]) -> list[list[float]]:
    lat, lng = shape["lat"].to_numpy(), shape["lng"].to_numpy()

    def nearest(p):
        d = (lat - p[0]) ** 2 + ((lng - p[1]) * math.cos(math.radians(p[0]))) ** 2
        return int(d.argmin())

    i, j = nearest(a), nearest(b)
    if j < i:
        i, j = j, i
    return [[round(float(x), 5), round(float(y), 5)] for x, y in zip(lat[i:j + 1], lng[i:j + 1])]


def _crossed(line: list[list[float]], crossings: list[dict], radius: float = CROSSING_RADIUS_KM) -> dict[str, float]:
    """Crossing id -> closest distance (km) for crossings the line passes with BEYOND_KM of route left."""
    seg = [0.0] + [_km(a[0], a[1], b[0], b[1]) for a, b in zip(line, line[1:])]
    cum, total, acc = [], sum(seg), 0.0
    for s in seg:
        acc += s
        cum.append(acc)
    out = {}
    for c in crossings:
        d = [_km(c["lat"], c["lng"], p[0], p[1]) for p in line]
        k = min(range(len(d)), key=d.__getitem__)
        if d[k] <= radius and total - cum[k] >= BEYOND_KM:
            out[c["id"]] = d[k]
    return out


def _nearest_stop(trip_stops: pd.DataFrame, origin: dict) -> str:
    d = [_km(origin["lat"], origin["lng"], a, b) for a, b in zip(trip_stops["stop_lat"], trip_stops["stop_lon"])]
    return trip_stops["stop_id"].iloc[min(range(len(d)), key=d.__getitem__)]


def feed_info(gtfs_zip_path: str) -> dict:
    with zipfile.ZipFile(gtfs_zip_path) as z:
        if "feed_info.txt" not in z.namelist():
            return {}
        return _read(z, "feed_info.txt", dtype=str).iloc[0].to_dict()


def build_transit(gtfs_zip_path: str, origins: list[dict], crossings: list[dict], site: dict,
                  service_date: str = SERVICE_DATE) -> pd.DataFrame:
    metro = [o for o in origins if o.get("group") == "metro" and o.get("lat") is not None]
    placed = [o for o in origins if o.get("lat") is not None]

    def nearest_origin(lat, lng):
        return min(placed, key=lambda o: _km(lat, lng, o["lat"], o["lng"]))["name"]
    with zipfile.ZipFile(gtfs_zip_path) as z:
        version = feed_info(gtfs_zip_path).get("feed_version")
        services = _active_services(z, service_date)
        routes = _read(z, "routes.txt", dtype={"route_id": str, "route_short_name": str})
        trips = _read(z, "trips.txt", dtype={"route_id": str, "service_id": str, "trip_id": str, "shape_id": str})
        stops = _read(z, "stops.txt", dtype={"stop_id": str})
        st = _read(z, "stop_times.txt", dtype={"trip_id": str, "stop_id": str},
                   usecols=["trip_id", "departure_time", "arrival_time", "stop_id", "stop_sequence"])
        shapes = _read(z, "shapes.txt", dtype={"shape_id": str})

    trips = trips[trips["service_id"].isin(services)]
    stops["site_m"] = [_km(site["lat"], site["lng"], a, b) * 1000 for a, b in zip(stops["stop_lat"], stops["stop_lon"])]
    near = stops[stops["site_m"] <= BOARD_RADIUS_M].set_index("stop_id")["site_m"]

    st = st[st["trip_id"].isin(trips["trip_id"])]
    board = st[st["stop_id"].isin(near.index)].copy()
    board["site_m"] = board["stop_id"].map(near)
    board = board.sort_values(["trip_id", "site_m"]).drop_duplicates("trip_id")
    board["dep_s"] = board["departure_time"].map(_secs)
    board = board[(board["dep_s"] >= WINDOW[0]) & (board["dep_s"] < WINDOW[1])]
    board = board.rename(columns={"stop_id": "board_stop", "stop_sequence": "board_seq"})[
        ["trip_id", "board_stop", "board_seq", "dep_s"]]

    after = st.merge(board, on="trip_id")
    after = after[after["stop_sequence"] > after["board_seq"]]
    after = after.merge(stops[["stop_id", "stop_lat", "stop_lon"]], on="stop_id")
    after["arr_s"] = after["arrival_time"].map(_secs)

    t_info = trips.set_index("trip_id")[["route_id", "shape_id"]]
    stop_info = stops.set_index("stop_id")
    shapes = shapes.sort_values(["shape_id", "shape_pt_sequence"]).rename(
        columns={"shape_pt_lat": "lat", "shape_pt_lon": "lng"})
    shape_by_id = {k: g for k, g in shapes.groupby("shape_id")}
    route_info = routes.set_index("route_id")

    def line_for(board_stop, alight_stop, shape_id):
        bs, al = stop_info.loc[board_stop], stop_info.loc[alight_stop]
        a, b = (bs["stop_lat"], bs["stop_lon"]), (al["stop_lat"], al["stop_lon"])
        if isinstance(shape_id, str) and shape_id in shape_by_id:
            return _cut_shape(shape_by_id[shape_id], a, b)
        return [[round(float(a[0]), 5), round(float(a[1]), 5)], [round(float(b[0]), 5), round(float(b[1]), 5)]]

    rows = []
    for o in metro:
        own = set(o.get("crossings", []))
        d_origin = [_km(o["lat"], o["lng"], a, b) for a, b in zip(after["stop_lat"], after["stop_lon"])]
        a2 = after.assign(d_origin=d_origin)
        a2 = a2.sort_values(["trip_id", "d_origin"]).drop_duplicates("trip_id")
        a2 = a2[a2["d_origin"] <= ALIGHT_MAX_KM]
        board_d = {s: _km(o["lat"], o["lng"], r["stop_lat"], r["stop_lon"]) for s, r in stop_info.loc[
            a2["board_stop"].unique()].iterrows()} if not a2.empty else {}
        a2 = a2[[board_d[b] - d >= MIN_PROGRESS_KM for b, d in zip(a2["board_stop"], a2["d_origin"])]]
        if a2.empty:
            continue
        a2 = a2.join(t_info, on="trip_id")
        a2["minutes"] = (a2["arr_s"] - a2["dep_s"]) / 60

        # Decide per trip pattern (route, board, alight, shape), then keep the trips of accepted patterns.
        keep, pattern_line, pattern_xing = [], {}, {}
        for key, g in a2.groupby(["route_id", "board_stop", "stop_id", "shape_id"], dropna=False):
            line = line_for(key[1], key[2], key[3])
            if set(_crossed(line, crossings, FOREIGN_RADIUS_KM)) - own:
                continue
            mine = {c: d for c, d in _crossed(line, crossings).items() if c in own}
            al = stop_info.loc[key[2]]
            here = (al["stop_lat"], al["stop_lon"])
            if mine:
                rivals = [m for m in metro if m["name"] != o["name"] and set(m.get("crossings", [])) & set(mine)]
                d_me = _km(*here, o["lat"], o["lng"])
                trip_stops = after[after["trip_id"] == g["trip_id"].iloc[0]]
                seq = trip_stops.set_index("stop_id")["stop_sequence"]
                # Drop when a rival area is nearer this stop and the trip goes on into that rival area.
                if any(_km(*here, m["lat"], m["lng"]) < d_me and seq[_nearest_stop(trip_stops, m)] >= seq[key[2]]
                       for m in rivals):
                    continue
            elif nearest_origin(*here) != o["name"]:
                continue
            keep.append(g)
            pattern_line[key] = _simplify(line)
            pattern_xing[key] = min(mine, key=mine.get) if mine else None
        if not keep:
            continue
        a3 = pd.concat(keep)

        for route_id, g in a3.groupby("route_id"):
            r = route_info.loc[route_id]
            # Most common accepted pattern for this route toward the origin.
            key = (route_id, *g.groupby(["board_stop", "stop_id", "shape_id"], dropna=False).size().idxmax())
            bs, al = stop_info.loc[key[1]], stop_info.loc[key[2]]
            line, crossing = pattern_line[key], pattern_xing[key]
            short = r["route_short_name"]
            short = r["route_long_name"] if pd.isna(short) else (str(short).lstrip("0") or "0")
            rows.append({
                "origin": o["name"], "crossing_id": crossing, "route_id": route_id,
                "route_short_name": short,
                "route_long_name": r["route_long_name"], "mode": MODE.get(int(r["route_type"]), "bus"),
                "board_stop_name": bs["stop_name"], "board_lat": round(float(bs["stop_lat"]), 6),
                "board_lng": round(float(bs["stop_lon"]), 6),
                "alight_stop_name": al["stop_name"], "alight_lat": round(float(al["stop_lat"]), 6),
                "alight_lng": round(float(al["stop_lon"]), 6),
                "one_way_min": round(float(g["minutes"].median()), 1),
                "trips_per_hour_pm": round(g["trip_id"].nunique() / 3, 2),
                "shape_json": json.dumps(line, separators=(",", ":")), "feed_version": version,
            })
    out = pd.DataFrame(rows, columns=COLUMNS)
    if out.empty:
        return out
    out = out.sort_values(["origin", "trips_per_hour_pm"], ascending=[True, False])
    return out.groupby("origin", group_keys=False).head(TOP_N).reset_index(drop=True)


def load_reference(external_dir: str) -> tuple[list[dict], list[dict], dict]:
    def j(name):
        with open(f"{external_dir}/{name}", encoding="utf-8") as f:
            return json.load(f)
    return j("origins.json")["origins"], j("crossings.json")["crossings"], j("hubs.json")["site"]


if __name__ == "__main__":
    import os
    zip_path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/gtfs/google_transit.zip"
    ext = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontends", "real", "public", "data", "external")
    origins, crossings, site = load_reference(ext)
    df = build_transit(zip_path, origins, crossings, site)
    print(feed_info(zip_path))
    with pd.option_context("display.width", 200, "display.max_columns", 20):
        print(df.drop(columns=["shape_json"]).to_string(index=False))
    if len(sys.argv) > 2:
        df.to_csv(sys.argv[2], index=False)
