import type { Model } from "../model";
import type { SnapshotManifest } from "../data/adapter";

const SOURCES: { label: string; url: string; what: string }[] = [
  { label: "City of Vancouver VanMap — Disaster Support Hubs", url: "https://vanmapp1.vancouver.ca/googleKml/DisasterSupportHubs/", what: "25 hub names, addresses, locations" },
  { label: "City of Vancouver Open Data — local-area-boundary", url: "https://opendata.vancouver.ca/explore/dataset/local-area-boundary/information/", what: "Vancouver home-area points" },
  { label: "Statistics Canada 2021 boundary files", url: "https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/index2021-eng.cfm", what: "Metro home-area points" },
  { label: "Wikipedia crossing articles", url: "https://en.wikipedia.org/", what: "Crossing locations and highway names" },
  { label: "DriveBC Open511", url: "https://api.open511.gov.bc.ca/", what: "Live major road events. Open Government Licence – British Columbia" },
  { label: "Canada.ca — Emergency kits", url: "https://www.canada.ca/en/services/policing/emergencies/preparedness/get-prepared/emergency-kits.html", what: "About 4 L water per person per day; 72 hours" },
  { label: "The Sphere Handbook 2018", url: "https://spherestandards.org/wp-content/uploads/Sphere-Handbook-2018-EN.pdf", what: "4.5–5.5 m² floor space per person (cold or urban)" },
  { label: "BC Gov News 2026HLTH0071-000954", url: "https://news.gov.bc.ca/releases/2026HLTH0071-000954", what: "2026 free Red Cross masks were in Interior Health, not Vancouver" },
  { label: "BC Hydro, Dec 17, 2025", url: "https://www.bchydro.com/news/press_centre/news_releases/2025/strong-wind-and-heavy-rain-leave-about-120-000-bc-hydro-customer.html", what: "Dec 17 storm" },
  { label: "Anywhere Vancouver, Jul 22, 2026", url: "https://anywherevancouver.com/heat-air-quality-warnings-metro-vancouver-july-22-2026/", what: "Jul 22 heat and smoke" },
  { label: "CP24, Aug 23, 2026", url: "https://www.cp24.com/news/canada/2026/08/23/lightning-thunderstorm-impact-operations-at-vancouver-airport/", what: "Aug 22 lightning storm, YVR ground stop" },
  { label: "Esri World Street Map", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer", what: "Map tiles, full colour" },
];

export function InfoDrawer({
  open, onClose, m, mock, manifest,
}: { open: boolean; onClose: () => void; m: Model | null; mock: boolean; manifest: SnapshotManifest | null }) {
  if (!open) return null;
  return (
    <div className="drawer-scrim" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} aria-label="About this data">
        <div className="drawer-head">
          <h2>About this data</h2>
          <button className="btn" onClick={onClose} aria-label="Close">Close</button>
        </div>

        <section>
          <h3>What the numbers are</h3>
          <ul>
            <li>
              <strong>Sessions, not verified people.</strong> Each count is the number of mobile attachment sessions active
              at Waterfront Station at that exact minute (start ≤ time ≤ start + dwell time), from one carrier's data.
              Screens say "people" to keep them short. "Stranded" is the tool's estimate from home area and open crossings.
            </li>
            {mock ? (
              <li><strong>Mock numbers.</strong> These are made up for development, not Databricks results.</li>
            ) : (
              <li>
                <strong>Historical snapshot.</strong> Exported from Databricks
                {manifest && <> table <code>{manifest.source.presence_table}</code> on {manifest.exported_at_utc.slice(0, 10)}</>}
                , and checked slot by slot against <code>gold_activity_minute</code>. Source period November 2025 to August 2026.
                {manifest && <> Dates available: {manifest.dates.join(", ")}.</>}
              </li>
            )}
            <li>Times are shown as recorded. The clock is assumed to be Vancouver local time; that is not confirmed.</li>
            <li>
              {mock
                ? "Mock home areas below 10 sessions are hidden."
                : "Counts are actual values. Nothing is hidden or rounded."}
              {m && m.sit.skipped > 0 && (
                <>
                  {" "}At <span className="num">{m.slot}</span>, <strong className="num">{m.sit.skipped}</strong> hidden home
                  {m.sit.skipped === 1 ? " area is" : " areas are"} left out of the totals.
                </>
              )}
            </li>
          </ul>
        </section>

        <section>
          <h3>How the tool decides</h3>
          <ul>
            <li>Vancouver (including UBC): can go home without a bridge or crossing.</li>
            <li>Metro: can go home if any of its crossings is open. Burnaby, New Westminster and Port Moody can go home by road. Otherwise they wait at a hub.</li>
            <li>Outside Metro (other provinces, rest of BC, international): need overnight lodging.</li>
            <li>Hubs are filled nearest first, up to the "max people per hub" setting. Waiting people are placed before lodging.</li>
            <li>Supplies: people × rate, × days for water, rounded up, minus what's on hand.</li>
            <li>The officer's crossing settings always override DriveBC.</li>
          </ul>
        </section>

        <section>
          <h3>Scenario assumptions</h3>
          <ul>
            <li>Groups differ from the Databricks buckets: UBC counts as Vancouver here, and Downtown and West End are part of Vancouver.</li>
            <li>Walking time is straight-line distance at 5 km/h.</li>
            <li>Max people per hub is a team setting. The City doesn't publish hub capacities.</li>
            <li>Which crossings each Metro area needs is a team judgement.</li>
            <li>Cots and blankets: 1 per person staying overnight. N95 masks: 1 per person during smoke. Charging: 1 point per 10 people. All team assumptions.</li>
            <li>The deadline is the incident time plus 1 hour, as a target.</li>
          </ul>
        </section>

        <section>
          <h3>Sources</h3>
          <ul className="sources">
            {SOURCES.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a>
                <span className="muted small block">{s.what}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3>Privacy</h3>
          <ul>
            <li>The table is synthetic. It holds no device, subscriber, or visit IDs, and rows are never linked into people.</li>
            <li>Only totals by home area are shown. No row-level data reaches the browser.</li>
            <li>DriveBC requests carry no personal data.</li>
            <li>The alert is an area broadcast draft, not targeted messaging.</li>
          </ul>
        </section>
      </aside>
    </div>
  );
}
