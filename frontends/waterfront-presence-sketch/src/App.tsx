import { useEffect, useMemo, useState } from "react";
import { PresenceMap, type MapPoint } from "./PresenceMap";
import {
  type Bucket,
  type Loaded,
  binMatches,
  busiestBin,
  countAt,
  formatBin,
  loadData,
} from "./data";

type Period = { kind: "half" | "weekday" | "month"; id: string; label: string };

const SPEEDS = [
  { step: 1, label: "30 min" },
  { step: 48, label: "1 day" },
  { step: 336, label: "1 week" },
];

export function App() {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bin, setBin] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(48);
  const [period, setPeriod] = useState<Period | null>(null);

  useEffect(() => {
    loadData().then(setData).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Could not load the extract.");
    });
  }, []);

  useEffect(() => {
    if (!playing || !data) return;
    const timer = window.setInterval(() => {
      setBin((current) => {
        const next = current + speed;
        if (next >= data.meta.nBins) {
          setPlaying(false);
          return data.meta.nBins - 1;
        }
        return next;
      });
      setPeriod(null);
    }, 280);
    return () => window.clearInterval(timer);
  }, [playing, speed, data]);

  const frame = useMemo(() => {
    if (!data) return null;
    const n = data.meta.origins.length;
    const byName = data.meta.origins.map((name, index) => ({
      name,
      count: countAt(data, bin, index),
    }));
    const periodMix = period
      ? data.meta.origins.map((name, index) => {
          let count = 0;
          for (let cursor = 0; cursor < data.meta.nBins; cursor += 1) {
            if (binMatches(data, cursor, period.kind, period.id)) count += countAt(data, cursor, index);
          }
          return { name, count };
        })
      : byName;
    const geo = new Map(data.originsFile.origins.map((origin) => [origin.name, origin]));
    const pointsFor = (mapName: "canada" | "metro"): MapPoint[] =>
      byName.flatMap((item) => {
        const origin = geo.get(item.name);
        if (!origin || origin.map !== mapName || origin.latitude == null || origin.longitude == null || item.count === 0) return [];
        return [{ name: item.name, latitude: origin.latitude, longitude: origin.longitude, count: item.count }];
      });
    const canada = pointsFor("canada");
    const metro = pointsFor("metro");
    const maxCount = Math.max(1, ...canada.map((point) => point.count), ...metro.map((point) => point.count));
    return { byName, periodMix, canada, metro, maxCount };
  }, [data, bin, period]);

  if (error) {
    return <main className="page"><p className="error">{error}</p></main>;
  }
  if (!data || !frame) {
    return <main className="page"><p>Loading Waterfront visits…</p></main>;
  }

  const station = data.meta.station;
  const mix = [...frame.periodMix].sort((a, b) => b.count - a.count);
  const mixTotal = mix.reduce((sum, item) => sum + item.count, 0) || 1;
  const clock = data.halfHours[new Date((data.meta.t0 + bin * data.meta.stepSeconds) * 1000).getUTCHours() * 2
    + (new Date((data.meta.t0 + bin * data.meta.stepSeconds) * 1000).getUTCMinutes() >= 30 ? 1 : 0)];
  const weekday = data.weekdays[(new Date((data.meta.t0 + bin * data.meta.stepSeconds) * 1000).getUTCDay() + 6) % 7];
  const monthKey = formatBin(data.meta, bin).slice(0, 7);

  function choose(kind: Period["kind"], bucket: Bucket) {
    setPlaying(false);
    setPeriod({ kind, id: bucket.id, label: bucket.label });
    setBin(busiestBin(data!, kind, bucket.id));
  }

  return (
    <main className="page">
      <header>
        <p className="eyebrow">Working sketch</p>
        <h1>Waterfront Station presence</h1>
        <p className="lede">
          Each circle is how many synthetic visits from that home area are active in the current 30-minute UTC bin.
          A visit stays active from <code>timestamp</code> for <code>dwell_time</code> minutes. These are not distinct people.
        </p>
      </header>

      <section className="maps">
        <figure>
          <figcaption>Canada</figcaption>
          <PresenceMap center={[62, -96]} zoom={3} points={frame.canada} maxCount={frame.maxCount} />
        </figure>
        <figure>
          <figcaption>Metro Vancouver</figcaption>
          <PresenceMap
            center={[49.25, -123.05]}
            zoom={10}
            points={frame.metro}
            maxCount={frame.maxCount}
            station={{ name: station.name, latitude: station.latitude, longitude: station.longitude }}
          />
        </figure>
      </section>
      <p className="note">
        Circle area uses one scale on both maps. Largest this bin: {frame.maxCount.toLocaleString("en-CA")}. The orange dot is Waterfront Station.
        Home-area dots are boundary centroids, not the table’s longitude and latitude. {frame.byName.find((item) => item.name === "International") ? "International has no Canadian point and appears only in the bars." : ""}
      </p>

      <section className="player">
        <div className="player-row">
          <button type="button" onClick={() => setPlaying((value) => !value)}>{playing ? "Pause" : "Play"}</button>
          {SPEEDS.map((option) => (
            <button
              key={option.step}
              type="button"
              className={speed === option.step ? "on" : ""}
              onClick={() => setSpeed(option.step)}
            >
              {option.label}
            </button>
          ))}
          <strong>{formatBin(data.meta, bin)}</strong>
        </div>
        <input
          type="range"
          min={0}
          max={data.meta.nBins - 1}
          value={bin}
          onChange={(event) => {
            setPlaying(false);
            setPeriod(null);
            setBin(Number(event.target.value));
          }}
        />
      </section>

      <section className="panels">
        <div>
          <h2>{period ? `Origin mix for ${period.label}` : "Origin mix for this bin"}</h2>
          <p className="note">
            {period
              ? "Bars sum every bin in that period. The map jumped to the busiest bin in it."
              : "Bars are the active visits in the bin on the clock."}
          </p>
          <ul className="origins">
            {mix.map((item) => (
              <li key={item.name}>
                <span>{item.name}</span>
                <span className="track"><span style={{ width: `${(100 * item.count) / (mix[0].count || 1)}%` }} /></span>
                <span className="num">{item.count.toLocaleString("en-CA")}</span>
                <span className="num">{((100 * item.count) / mixTotal).toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="charts">
          <Chart title="Time of day, UTC" buckets={data.halfHours} activeId={clock.id} onPick={(bucket) => choose("half", bucket)} />
          <Chart title="Day of week" buckets={data.weekdays} activeId={weekday.id} onPick={(bucket) => choose("weekday", bucket)} />
          <Chart title="Time of year" buckets={data.months} activeId={monthKey} onPick={(bucket) => choose("month", bucket)} />
        </div>
      </section>

      <section>
        <h2>What stands out</h2>
        <ul className="findings">
          {data.recommendation.map((line) => <li key={line}>{line}</li>)}
        </ul>
      </section>
    </main>
  );
}

function Chart({
  title,
  buckets,
  activeId,
  onPick,
}: {
  title: string;
  buckets: Bucket[];
  activeId: string;
  onPick: (bucket: Bucket) => void;
}) {
  const max = Math.max(...buckets.map((bucket) => bucket.total));
  return (
    <section>
      <h2>{title}</h2>
      <div className="bars">
        {buckets.map((bucket) => (
          <button
            key={bucket.id}
            type="button"
            className={bucket.id === activeId ? "on" : ""}
            style={{ height: `${Math.max(4, (100 * bucket.total) / max)}%` }}
            title={`${bucket.label}: ${bucket.total.toLocaleString("en-CA")}`}
            onClick={() => onPick(bucket)}
          />
        ))}
      </div>
      <div className="bar-labels">
        <span>{buckets[0].label}</span>
        <span>{buckets[Math.floor(buckets.length / 2)].label}</span>
        <span>{buckets[buckets.length - 1].label}</span>
      </div>
    </section>
  );
}
