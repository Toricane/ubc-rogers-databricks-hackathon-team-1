import { CircleMarker, Marker, Tooltip } from "react-leaflet";
import { MapFrame } from "../components/MapFrame";
import { waterfrontIcon } from "../components/icons";
import { fmt, type Model } from "../model";

export function SituationTab({ m, offline }: { m: Model; offline: boolean }) {
  const { sit, st, ref } = m;
  const mapped = sit.byOrigin.filter((o) => o.origin.lat !== null && o.origin.lng !== null);
  const max = Math.max(1, ...mapped.map((o) => o.present));
  const labelled = new Set(mapped.slice(0, 6).map((o) => o.origin.name));
  const outside = sit.byOrigin.filter((o) => o.origin.group === "outside").slice(0, 3);
  const points: [number, number][] = [[ref.site.lat, ref.site.lng], ...mapped.map((o) => [o.origin.lat!, o.origin.lng!] as [number, number])];

  return (
    <>
      <h1 className="headline">
        <span className="num">{fmt(sit.total)}</span> people are in the Waterfront area at <span className="num">{m.slot}</span>.
      </h1>

      <div className="group-cards">
        <div className="card group-card g-vancouver">
          <div className="card-title"><span className="dot g-vancouver" />Vancouver</div>
          <div className="big num">{fmt(sit.byGroup.vancouver)}</div>
          <div className="status ok"><span aria-hidden>✓</span> Go home: no bridge or crossing needed</div>
        </div>
        <div className="card group-card g-metro">
          <div className="card-title"><span className="dot g-metro" />Metro</div>
          <div className="big num">{fmt(sit.byGroup.metro)}</div>
          <div className="status-line">
            <span className="status ok"><span aria-hidden>✓</span> <span className="num">{fmt(st.metroHome)}</span> can get home</span>
            <span className="status critical"><span aria-hidden>✕</span> <span className="num">{fmt(st.waiting)}</span> stranded (crossing closed)</span>
          </div>
        </div>
        <div className="card group-card g-outside">
          <div className="card-title"><span className="dot g-outside" />Outside Metro</div>
          <div className="big num">{fmt(sit.byGroup.outside)}</div>
          <div className="status critical"><span aria-hidden>✕</span> Need overnight lodging</div>
        </div>
      </div>

      <div className="split split-side">
        <MapFrame
          points={points}
          offline={offline}
          legend={
            <>
              <div className="legend-row"><span className="legend-pin wf-pin" /> Waterfront</div>
              <div className="legend-row"><span className="legend-dot g-vancouver" /> Vancouver home areas</div>
              <div className="legend-row"><span className="legend-dot g-metro" /> Metro home areas</div>
              <div className="legend-row muted">Bigger circle = more people</div>
            </>
          }
        >
          {mapped.map(({ origin, present }) => (
            <CircleMarker
              key={origin.name}
              center={[origin.lat!, origin.lng!]}
              radius={5 + 22 * Math.sqrt(present / max)}
              className={`home-circle g-${origin.group}`}
            >
              {labelled.has(origin.name) ? (
                <Tooltip permanent direction="center" className="circle-label">{fmt(present)}</Tooltip>
              ) : (
                <Tooltip>{origin.name}: {fmt(present)}</Tooltip>
              )}
            </CircleMarker>
          ))}
          <Marker position={[ref.site.lat, ref.site.lng]} icon={waterfrontIcon(`Waterfront · ${fmt(sit.total)}`)} />
        </MapFrame>

        <div className="card side-list g-outside">
          <div className="card-title"><span className="dot g-outside" />Outside Metro: top home areas</div>
          {outside.length === 0 && <p className="muted">No one from outside Metro right now.</p>}
          <ol className="rank">
            {outside.map(({ origin, present }) => (
              <li key={origin.name}>
                <span>{origin.name}</span>
                <span className="num strong">{fmt(present)}</span>
              </li>
            ))}
          </ol>
          <p className="muted small">Provinces and "International" have no single point, so they are not on the map.</p>
        </div>
      </div>
    </>
  );
}
