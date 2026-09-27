import { Marker, Tooltip } from "react-leaflet";
import { MapFrame } from "../components/MapFrame";
import { crossingIcon } from "../components/icons";
import { fmt, type Model } from "../model";
import type { StatusSource } from "../data/types";

const SOURCE_LABEL: Record<StatusSource, string> = {
  drivebc: "DriveBC",
  officer: "Set by officer",
  incident: "Incident record",
  none: "No report",
};

export function CrossingsTab({
  m, offline, live, onToggle, onRefresh, refreshing, refreshNote,
}: {
  m: Model;
  offline: boolean;
  live: boolean;
  onToggle: (id: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
  refreshNote: string | null;
}) {
  const closedCount = m.closed.size;
  const total = m.crossings.length;
  const points = m.crossings.map((c) => [c.crossing.lat, c.crossing.lng] as [number, number]);

  return (
    <>
      <h1 className="headline">
        {closedCount === 0 ? (
          <>All <span className="num">{total}</span> crossings are open.</>
        ) : (
          <>
            <span className="num">{closedCount}</span> of <span className="num">{total}</span> crossings closed.{" "}
            <span className="num">{fmt(m.affected)}</span> Metro residents affected.
          </>
        )}
      </h1>

      <div className="split split-wide">
        <MapFrame
          points={points}
          offline={offline}
          legend={
            <>
              <div className="legend-row"><span className="xing open">✓</span> Open</div>
              <div className="legend-row"><span className="xing closed">✕</span> Closed</div>
              <div className="legend-row muted">Click a crossing to open or close it</div>
            </>
          }
        >
          {m.crossings.map((c) => (
            <Marker
              key={`${c.crossing.id}-${c.closed}`}
              position={[c.crossing.lat, c.crossing.lng]}
              icon={crossingIcon(c.closed)}
              eventHandlers={{ click: () => onToggle(c.crossing.id) }}
              keyboard
              title={`${c.crossing.name}: ${c.closed ? "Closed" : "Open"}`}
            >
              <Tooltip direction="top" offset={[0, -12]}>{c.crossing.name}</Tooltip>
            </Marker>
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
          <table className="table">
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
        </div>
      </div>
    </>
  );
}
