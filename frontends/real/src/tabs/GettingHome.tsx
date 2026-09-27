import { CircleMarker, Marker, Polyline, Tooltip } from "react-leaflet";
import { MapFrame } from "../components/MapFrame";
import { arrowIcon, crossingIcon, routeChipIcon, waterfrontIcon } from "../components/icons";
import { bearingDeg } from "../lib/geo";
import { fmt, type Model } from "../model";
import type { StatusSource, TransitRoute } from "../data/types";
import { pickRoute, type BusRow } from "../lib/logic";

const SOURCE_LABEL: Record<StatusSource, string> = {
  drivebc: "DriveBC",
  officer: "Set by officer",
  incident: "Incident record",
  none: "No report",
};

const routeKey = (r: TransitRoute) => `${r.origin}|${r.crossing_id}|${r.route_short_name}|${r.board.name}`;
const busWord = (n: number) => (n === 1 ? "bus" : "buses");

function Headline({ m }: { m: Model }) {
  const total = m.crossings.length;
  const closedNames = m.crossings.filter((c) => c.closed).map((c) => c.crossing.name);
  if (closedNames.length === 0)
    return <>All <span className="num">{total}</span> crossings are open.</>;
  const prefix =
    closedNames.length === 1 ? (
      <>{closedNames[0]} closed</>
    ) : (
      <><span className="num">{closedNames.length}</span> of <span className="num">{total}</span> crossings closed</>
    );
  const sized = (m.buses ?? []).filter((r) => r.status === "diverted" && r.buses !== null && r.buses > 0 && r.route);
  const riders = sized.reduce((s, r) => s + (r.ridersPerHour ?? 0), 0);
  if (sized.length === 1) {
    const r = sized[0];
    return (
      <>
        {prefix}: send <span className="num">{fmt(r.buses!)}</span> {busWord(r.buses!)} on route{" "}
        <span className="num">{r.route!.route_short_name}</span> for <span className="num">{fmt(riders)}</span> people leaving per hour.
      </>
    );
  }
  if (sized.length > 1) {
    const routes = new Set(sized.map((r) => r.route!.route_short_name)).size;
    return (
      <>
        {prefix}: send <span className="num">{fmt(m.busesNeeded)}</span> {busWord(m.busesNeeded)} on{" "}
        <span className="num">{routes}</span> routes for <span className="num">{fmt(riders)}</span> people leaving per hour.
      </>
    );
  }
  return <>{prefix}. <span className="num">{fmt(m.affected)}</span> Metro residents affected.</>;
}

function StatusCell({ r, name }: { r: BusRow; name: (id: string | null) => string }) {
  if (r.status === "normal") return <span className="status ok"><span aria-hidden>✓</span> Usual way · {name(r.preferred)}</span>;
  if (r.status === "diverted") return <span className="status divert"><span aria-hidden>↻</span> Via {name(r.via)}</span>;
  return <span className="status critical"><span aria-hidden>✕</span> Stranded · to a hub</span>;
}

export function GettingHomeTab({
  m, offline, live, onToggle, onRefresh, refreshing, refreshNote, setupError,
}: {
  m: Model;
  offline: boolean;
  live: boolean;
  onToggle: (id: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
  refreshNote: string | null;
  setupError: string | null;
}) {
  const nameById = new Map(m.crossings.map((c) => [c.crossing.id, c.crossing.name]));
  const name = (id: string | null) => (id ? nameById.get(id) ?? id : "");
  const routes = m.transit?.routes ?? [];
  const rows = m.buses ?? [];
  const rowByOrigin = new Map(rows.map((r) => [r.origin.name, r]));
  const chosen = new Set(rows.filter((r) => r.route).map((r) => routeKey(r.route!)));

  // Home areas with at least one scheduled route get a labelled dot.
  const originNames = new Set(routes.map((r) => r.origin));
  const originDots = m.ref.origins.filter((o) => originNames.has(o.name) && o.lat !== null && o.lng !== null);

  const routeClass = (r: TransitRoute): "diverted" | "closed" | "normal" =>
    chosen.has(routeKey(r)) ? "diverted" : r.crossing_id && m.closed.has(r.crossing_id) ? "closed" : "normal";
  // Faint lines first, highlighted last so they sit on top.
  const weight = { closed: 0, normal: 1, diverted: 2 } as const;
  const drawOrder = [...routes].filter((r) => r.shape.length >= 2).sort((a, b) => weight[routeClass(a)] - weight[routeClass(b)]);

  // One chip per home area, at the end of its main route (the diverted one, else the most frequent).
  // Skipped for home areas whose main route is normal rail or ferry service.
  // Areas west of Waterfront put the chip to the left of the point so neighbours don't collide.
  type Chip = { at: [number, number]; origin: string; html: string; cls: "diverted" | "closed" | "normal"; left: boolean; up: boolean };
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const chips: Chip[] = [];
  for (const origin of originNames) {
    const mine = drawOrder.filter((r) => r.origin === origin);
    if (!mine.length) continue;
    const main =
      mine.find((r) => routeClass(r) === "diverted") ??
      [...mine].sort((a, b) => weight[routeClass(b)] - weight[routeClass(a)] || (b.trips_per_hour_pm ?? 0) - (a.trips_per_hour_pm ?? 0))[0];
    const cls = routeClass(main);
    // Normal rail/ferry lines need no chip (the home-area label names them); buses and changed routes do.
    if (cls === "normal" && main.mode !== "bus") continue;
    const end = main.shape[main.shape.length - 1];
    let html: string;
    if (cls === "diverted") {
      const busN = rowByOrigin.get(origin)?.buses;
      html = `${esc(main.route_short_name)} · ${busN != null ? `${fmt(busN)} ${busWord(busN)}` : "buses unknown"} → ${esc(origin)}`;
    } else {
      const names: string[] = [];
      for (const r of [main, ...mine]) {
        const n = routeClass(r) === "closed" ? `<s>${esc(r.route_short_name)}</s>` : esc(r.route_short_name);
        if (!names.includes(n)) names.push(n);
      }
      const shown = names.slice(0, 2).join(", ") + (names.length > 2 ? ` +${names.length - 2}` : "");
      html = `${shown} → ${esc(origin)}`;
    }
    chips.push({ at: end, origin, html, cls, left: false, up: false });
  }
  // Chips face inward: west of Waterfront → left of the point; the far east of the view → left as well.
  if (chips.length) {
    const lngs = chips.map((c) => c.at[1]);
    const maxLng = Math.max(...lngs, m.ref.site.lng);
    const span = maxLng - Math.min(...lngs, m.ref.site.lng);
    for (const c of chips) {
      const farEast = c.at[1] > maxLng - span * 0.25;
      c.left = c.at[1] < m.ref.site.lng || farEast;
      c.up = farEast; // lifted so it clears chips ending at the same latitude further west
    }
  }

  // Fit to Waterfront and the route shapes only, so toggling a crossing never moves the map.
  // Built from `routes` (stable order), not from state-dependent chips or draw order.
  const points: [number, number][] = [
    [m.ref.site.lat, m.ref.site.lng],
    ...routes.filter((r) => r.shape.length >= 2).flatMap((r) => r.shape.filter((_, i) => i % 10 === 0 || i === r.shape.length - 1)),
    // Room for chips that sit left of route ends west of Waterfront, so they are not clipped at the edge.
    ...routes
      .filter((r) => r.shape.length >= 2 && r.shape[r.shape.length - 1][1] < m.ref.site.lng)
      .map((r) => [r.shape[r.shape.length - 1][0], r.shape[r.shape.length - 1][1] - 0.2] as [number, number]),
  ];

  /** Point ~90% along the shape and the bearing of the last stretch, for a direction arrow near the end. */
  const arrowAt = (shape: [number, number][]) => {
    const i = Math.max(1, Math.floor(shape.length * 0.9));
    const a = shape[Math.max(0, i - 3)];
    const b = shape[Math.min(shape.length - 1, i)];
    return { at: b, bearing: bearingDeg({ lat: a[0], lng: a[1] }, { lat: b[0], lng: b[1] }) };
  };

  const feed = m.transit?.feed;
  const cap = m.transport?.bus_capacity;
  const lay = m.transport?.layover_min;

  return (
    <>
      {/* One line so the map box keeps its size when the headline changes; full text on hover. */}
      <h1 className="headline one-line" onMouseEnter={(e) => (e.currentTarget.title = e.currentTarget.textContent ?? "")}>
        <Headline m={m} />
      </h1>

      <div className="split split-wide">
        <MapFrame
          points={points}
          offline={offline}
          legend={
            <>
              <div className="legend-row"><span className="legend-pin wf-pin" /> Waterfront</div>
              <div className="legend-row"><span className="xing open">✓</span> Crossing open · <span className="xing closed">✕</span> closed</div>
              <div className="legend-row"><span className="legend-route" /> Scheduled route home</div>
              <div className="legend-row"><span className="legend-route diverted" /> Route to add buses on</div>
              <div className="legend-row"><span className="legend-route closed" /> Route via a closed crossing</div>
              <div className="legend-row"><span className="legend-chip">240 → area</span> Route number, end stop</div>
              <div className="legend-row"><span className="legend-origin" /> Home area</div>
              <div className="legend-row muted">Click a crossing to open or close it</div>
            </>
          }
        >
          {drawOrder.filter((r) => routeClass(r) === "diverted").map((r) => (
            <Polyline key={`casing-${routeKey(r)}`} positions={r.shape} className="route-casing" pathOptions={{ weight: 11 }} interactive={false} />
          ))}
          {drawOrder.map((r) => {
            const cls = routeClass(r);
            return (
              <Polyline
                key={`${routeKey(r)}-${cls}`}
                positions={r.shape}
                className={`route-line ${cls}`}
                pathOptions={{ weight: cls === "diverted" ? 7 : cls === "closed" ? 3 : 4 }}
              >
                <Tooltip sticky>
                  {r.route_short_name} {r.route_long_name} → {r.origin}
                  {cls === "closed" ? " (crossing closed)" : ""}
                </Tooltip>
              </Polyline>
            );
          })}
          {drawOrder.map((r) => {
            const { at, bearing } = arrowAt(r.shape);
            return (
              <Marker
                key={`arrow-${routeKey(r)}`}
                position={at}
                icon={arrowIcon(bearing, `route-arrow ${routeClass(r)}`)}
                interactive={false}
              />
            );
          })}
          {originDots.map((o) => {
            const st = rowByOrigin.get(o.name)?.status ?? "normal";
            return (
              <CircleMarker key={o.name} center={[o.lat!, o.lng!]} radius={6} className={`origin-dot ${st}`}>
                <Tooltip permanent direction="bottom" offset={[0, 4]} className="origin-label">{o.name}</Tooltip>
              </CircleMarker>
            );
          })}
          {m.crossings.map((c) => (
            <Marker
              key={`${c.crossing.id}-${c.closed}`}
              position={[c.crossing.lat, c.crossing.lng]}
              icon={crossingIcon(c.closed)}
              eventHandlers={{ click: () => onToggle(c.crossing.id) }}
              keyboard
              title={`${c.crossing.name}: ${c.closed ? "Closed" : "Open"}`}
              zIndexOffset={500}
            >
              <Tooltip direction="top" offset={[0, -12]}>{c.crossing.name}</Tooltip>
            </Marker>
          ))}
          <Marker position={[m.ref.site.lat, m.ref.site.lng]} icon={waterfrontIcon("Waterfront")} zIndexOffset={1000} />
          {chips.map((c) => (
            <Marker
              key={`chip-${c.origin}-${c.cls}`}
              position={c.at}
              icon={routeChipIcon(c.html, c.cls, c.left, c.up)}
              zIndexOffset={c.cls === "diverted" ? 3000 : 2000}
              interactive={false}
            />
          ))}
        </MapFrame>

        <div className="card list-card">
          <div className="list-head">
            {live ? (
              <>
                <button className="btn-primary" onClick={onRefresh} disabled={refreshing}>
                  {refreshing ? "Checking DriveBC…" : "Refresh from DriveBC"}
                </button>
                {refreshNote && <span className="muted small">{refreshNote}</span>}
              </>
            ) : (
              <span className="muted">Historical road data unavailable — set crossings manually.</span>
            )}
          </div>
          <div className="card-title">Buses home</div>
          {setupError && <p className="status critical"><span aria-hidden>✕</span> {setupError}</p>}
          {m.dispatchError && <p className="status critical"><span aria-hidden>✕</span> {m.dispatchError} Bus counts need it; routes still show.</p>}
          {m.buses && (
            <table className="table compact bus-table">
              <thead>
                <tr>
                  <th>Home area</th>
                  <th>Status</th>
                  <th>Route</th>
                  <th className="r">Leaving /h</th>
                  <th className="r">Buses</th>
                  <th className="r">One way</th>
                  <th className="r">Sched. /h</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const shown = r.status === "diverted" ? r.route : r.status === "normal" ? pickRoute(routes, r.origin.name, r.preferred) : null;
                  const leaving = r.departing30 === null ? null : r.departing30 * 2;
                  return (
                    <tr key={r.origin.name} className={r.status === "diverted" ? "row-divert" : r.status === "stranded" ? "row-closed" : ""}>
                      <td className="strong">{r.origin.name}</td>
                      <td><StatusCell r={r} name={name} /></td>
                      <td>
                        {shown ? (
                          <span className="num" title={shown.route_long_name}>{shown.route_short_name}</span>
                        ) : r.status === "diverted" ? (
                          <span className="muted small">no scheduled route via {name(r.via)}</span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td className="r num">{leaving === null ? "—" : fmt(leaving)}</td>
                      <td className="r num strong">{r.status === "diverted" && r.buses !== null ? fmt(r.buses) : "—"}</td>
                      <td className="r num">{shown ? `${fmt(Math.round(shown.one_way_min))} min` : "—"}</td>
                      <td className="r num">{shown?.trips_per_hour_pm == null ? "—" : fmt(shown.trips_per_hour_pm)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <div className="card-title">Crossings</div>
          <table className="table compact xing-table">
            <thead>
              <tr>
                <th>Crossing</th>
                <th>Status</th>
                <th>Source</th>
                <th className="r">People who use it</th>
              </tr>
            </thead>
            <tbody>
              {m.crossings.map((c) => (
                <tr key={c.crossing.id} className={c.closed ? "row-closed" : ""}>
                  <td title={c.detail}>{c.crossing.name}</td>
                  <td>
                    <button
                      className={`toggle ${c.closed ? "closed" : "open"}`}
                      onClick={() => onToggle(c.crossing.id)}
                      aria-pressed={c.closed}
                      aria-label={`${c.crossing.name}: ${c.closed ? "Closed" : "Open"}. Click to ${c.closed ? "open" : "close"}.`}
                    >
                      <span aria-hidden>{c.closed ? "✕" : "✓"}</span> {c.closed ? "Closed" : "Open"}
                    </button>
                  </td>
                  <td className="muted">{SOURCE_LABEL[c.source]}</td>
                  <td className="r num">{fmt(c.relying)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="muted small">
            Counts are sessions, not verified people. Leaving /h = sessions ending in the next 30 min × 2. Buses = leaving /h ÷
            capacity × round trip (2 × one way + 2 × layover).
            {cap && <> Capacity {fmt(cap.value)} per bus ({cap.source_title ?? cap.source ?? "unsourced"}).</>}
            {lay && <> Layover {fmt(lay.value)} min ({lay.source_title ?? lay.source ?? "unsourced"}).</>}
            {feed && <> TransLink GTFS static schedule{feed.version ? ` ${feed.version}` : ""}, not real-time.</>}
          </p>
        </div>
      </div>
    </>
  );
}
