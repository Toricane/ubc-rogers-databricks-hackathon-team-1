import { useState } from "react";
import { CircleMarker, Marker, Tooltip } from "react-leaflet";
import type { Group } from "../data/types";
import { MapFrame } from "../components/MapFrame";
import { waterfrontIcon } from "../components/icons";
import { fmt, type Model } from "../model";

const SITE_ZOOM = 13;

export function SituationTab({ m, offline }: { m: Model; offline: boolean }) {
  const { sit, st, ref } = m;
  const mapped = sit.byOrigin.filter((o) => o.origin.lat !== null && o.origin.lng !== null);
  const max = Math.max(1, ...mapped.map((o) => o.present));
  const labelled = new Set(mapped.slice(0, 6).map((o) => o.origin.name));
  const outside = sit.byOrigin.filter((o) => o.origin.group === "outside");
  const outsideTotal = Math.max(1, sit.byGroup.outside);
  const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
  // Hovering (or focusing) a KPI highlights that group on the map.
  const [focus, setFocus] = useState<Group | null>(null);
  const hover = (g: Group) => ({
    tabIndex: 0,
    onMouseEnter: () => setFocus(g),
    onMouseLeave: () => setFocus(null),
    onFocus: () => setFocus(g),
    onBlur: () => setFocus(null),
    "aria-describedby": "kpi-hint",
    className: `stat group-card stat-${g}${focus === g ? " is-focus" : ""}`,
  });
  // Open centred on Waterfront, zoomed in; the officer can pan or zoom out to see the wider region.
  const points: [number, number][] = [[ref.site.lat, ref.site.lng]];

  return (
    <>
      <h1 className="headline">
        <span className="num">{fmt(sit.total)}</span> people are in the Waterfront area at <span className="num">{m.slot}</span>.
      </h1>
      {m.needs.heat && (
        <div className="alert-bar" role="status">
          <strong>Heat warning in effect</strong>
          {m.incident.description && <span>· {m.incident.description}</span>}
        </div>
      )}

      <div className={`stat-strip group-cards${focus ? " has-focus" : ""}`}>
        <span id="kpi-hint" hidden>Highlights this group on the map</span>
        <div {...hover("vancouver")}>
          <div className="stat-label">Vancouver</div>
          <div className="stat-value">{fmt(sit.byGroup.vancouver)}</div>
          <div className="stat-note">Can go home — no crossing needed</div>
        </div>
        <div {...hover("metro")}>
          <div className="stat-label">Metro</div>
          <div className="stat-value">{fmt(sit.byGroup.metro)}</div>
          <div className="stat-note">
            {fmt(st.metroHome)} can go home
            {st.waiting > 0 && (
              <>
                <span className="sep">·</span>
                <span className="action">{fmt(st.waiting)} {m.needs.metroClosed}</span>
              </>
            )}
          </div>
        </div>
        <div {...hover("outside")}>
          <div className="stat-label">Outside Metro</div>
          <div className="stat-value">{fmt(sit.byGroup.outside)}</div>
          <div className="stat-note">
            {sit.byGroup.outside > 0 ? (
              <span className="action">{fmt(sit.byGroup.outside)} {lower(m.needs.outsideNeed)}</span>
            ) : (
              "No one from outside Metro"
            )}
          </div>
        </div>
      </div>

      <div className="split split-side">
        <MapFrame
          points={points}
          offline={offline}
          focus={focus}
          zoom={SITE_ZOOM}
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
                <Tooltip permanent direction="center" className={`circle-label g-${origin.group}`}>{fmt(present)}</Tooltip>
              ) : (
                <Tooltip>{origin.name}: {fmt(present)}</Tooltip>
              )}
            </CircleMarker>
          ))}
          <Marker position={[ref.site.lat, ref.site.lng]} icon={waterfrontIcon(`Waterfront · ${fmt(sit.total)}`)} />
        </MapFrame>

        <aside className={`region-panel${focus === "outside" ? " is-focus" : ""}`} aria-label="Outside Metro by home region">
          <div className="panel-title">Outside Metro by home region</div>
          {outside.length === 0 ? (
            <p className="muted small">No one from outside Metro right now.</p>
          ) : (
            <table className="region-table">
              <thead>
                <tr>
                  <th>Region</th>
                  <th className="r">People</th>
                  <th className="bar-cell">Share</th>
                </tr>
              </thead>
              <tbody>
                {outside.map(({ origin, present }) => (
                  <tr key={origin.name}>
                    <td>{origin.name}</td>
                    <td className="r num">{fmt(present)}</td>
                    <td className="bar-cell" title={`${Math.round((present / outsideTotal) * 100)}% of Outside Metro`}>
                      <span className="share"><span style={{ width: `${(present / outsideTotal) * 100}%` }} /></span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="footnote" title='Provinces and "International" have no single point, so they are not drawn on the map.'>
            Not on the map: no single point for these regions.
          </p>
        </aside>
      </div>
    </>
  );
}
