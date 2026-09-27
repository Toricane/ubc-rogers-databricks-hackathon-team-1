import { Marker, Polyline, Tooltip } from "react-leaflet";
import { MapFrame } from "../components/MapFrame";
import { arrowIcon, hubIcon, waterfrontIcon } from "../components/icons";
import { bearingDeg } from "../lib/geo";
import { fmt, type Model } from "../model";

export function SendPeopleTab({
  m, offline, maxPerHub, onMaxPerHub,
}: {
  m: Model;
  offline: boolean;
  maxPerHub: number;
  onMaxPerHub: (n: number) => void;
}) {
  const { plan, st, ref } = m;
  const active = plan.active;
  const activeIds = new Set(active.map((a) => a.hub.id));
  const maxTotal = Math.max(1, ...active.map((a) => a.total));
  const points: [number, number][] = [
    [ref.site.lat, ref.site.lng],
    ...(active.length ? active : plan.ranked).map((a) => [a.hub.lat, a.hub.lng] as [number, number]),
  ];

  return (
    <>
      <h1 className="headline">
        {st.total === 0 ? (
          "No one needs a hub right now."
        ) : (
          m.needs.sendHeadline(fmt(st.total), active.length)
        )}
      </h1>

      <div className="split split-wide">
        <MapFrame
          points={points}
          offline={offline}
          legend={
            <>
              <div className="legend-row"><span className="legend-pin wf-pin" /> Waterfront</div>
              <div className="legend-row"><span className="hub active" /> Hub in use</div>
              <div className="legend-row"><span className="hub idle" /> Hub not in use</div>
              <div className="legend-row"><span className="legend-line" /> Assignment (not a route)</div>
            </>
          }
        >
          {plan.ranked
            .filter((a) => !activeIds.has(a.hub.id))
            .map((a) => (
              <Marker key={a.hub.id} position={[a.hub.lat, a.hub.lng]} icon={hubIcon(null)}>
                <Tooltip>{a.hub.name}</Tooltip>
              </Marker>
            ))}
          {active.map((a) => {
            const tip: [number, number] = [
              ref.site.lat + (a.hub.lat - ref.site.lat) * 0.86,
              ref.site.lng + (a.hub.lng - ref.site.lng) * 0.86,
            ];
            return (
              <Polyline
                key={`line-${a.hub.id}`}
                positions={[[ref.site.lat, ref.site.lng], tip]}
                className="assign-line"
                pathOptions={{ weight: 3 + 3 * (a.total / maxTotal) }}
              >
                <Tooltip permanent direction="center" className="line-label">assignment</Tooltip>
              </Polyline>
            );
          })}
          {active.map((a) => {
            const tip: [number, number] = [
              ref.site.lat + (a.hub.lat - ref.site.lat) * 0.86,
              ref.site.lng + (a.hub.lng - ref.site.lng) * 0.86,
            ];
            return <Marker key={`arrow-${a.hub.id}`} position={tip} icon={arrowIcon(bearingDeg(ref.site, a.hub))} interactive={false} />;
          })}
          {active.map((a) => (
            <Marker key={a.hub.id} position={[a.hub.lat, a.hub.lng]} icon={hubIcon(a.total)} zIndexOffset={500}>
              <Tooltip direction="top" offset={[0, -14]}>{a.hub.name}</Tooltip>
            </Marker>
          ))}
          <Marker position={[ref.site.lat, ref.site.lng]} icon={waterfrontIcon("Waterfront")} zIndexOffset={1000} />
        </MapFrame>

        <div className="card list-card">
          <div className="list-head">
            <label className="setting">
              Max people per hub
              <input
                className="num-input num"
                type="number"
                min={1}
                step={50}
                value={maxPerHub}
                onChange={(e) => onMaxPerHub(Math.max(1, Number(e.target.value) || 1))}
              />
            </label>
            <span className="muted small">team assumption; hub capacities not published</span>
          </div>
          {plan.unplaced > 0 && (
            <p className="status critical"><span aria-hidden>✕</span> {fmt(plan.unplaced)} people don't fit in any hub at this limit.</p>
          )}
          {active.length === 0 ? (
            <p className="muted">Everyone in the area can get home.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Hub</th>
                  <th className="r">Walk</th>
                  <th className="r">{m.needs.waitingColumn}</th>
                  <th className="r">{m.needs.lodgingColumn}</th>
                  <th className="r">Total</th>
                </tr>
              </thead>
              <tbody>
                {active.map((a) => (
                  <tr key={a.hub.id}>
                    <td>
                      <div className="strong">{a.hub.name}</div>
                      <div className="muted small">{a.hub.address}</div>
                    </td>
                    <td className="r num">{a.walkMin} min</td>
                    <td className="r num">{fmt(a.waiting)}</td>
                    <td className="r num">{fmt(a.lodging)}</td>
                    <td className="r num strong">{fmt(a.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="muted small">Walking time is straight-line distance at 5 km/h (an estimate, not directions).</p>
        </div>
      </div>
    </>
  );
}
