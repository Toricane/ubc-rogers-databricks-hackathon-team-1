export type OriginPoint = {
  name: string;
  map: "canada" | "metro" | "none";
  longitude: number | null;
  latitude: number | null;
  crosswalk: string;
};

export type OriginsFile = {
  sources: { id: string; title: string; url: string }[];
  origins: OriginPoint[];
};

export type ActivityMeta = {
  t0: number;
  stepSeconds: number;
  nBins: number;
  origins: string[];
  station: { name: string; longitude: number; latitude: number };
  definition: string;
};

export type Bucket = {
  id: string;
  label: string;
  total: number;
  bins: number;
  byOrigin: number[];
};

export type Loaded = {
  meta: ActivityMeta;
  counts: Uint16Array;
  originsFile: OriginsFile;
  halfHours: Bucket[];
  weekdays: Bucket[];
  months: Bucket[];
  recommendation: string[];
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function halfHourLabel(index: number): string {
  const hour = Math.floor(index / 2);
  const minute = index % 2 === 0 ? "00" : "30";
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

export function binDate(meta: ActivityMeta, bin: number): Date {
  return new Date((meta.t0 + bin * meta.stepSeconds) * 1000);
}

export function formatBin(meta: ActivityMeta, bin: number): string {
  const iso = binDate(meta, bin).toISOString().slice(0, 16);
  return `${iso.slice(0, 10)} ${iso.slice(11)} UTC`;
}

export function countAt(data: Loaded, bin: number, originIndex: number): number {
  return data.counts[bin * data.meta.origins.length + originIndex];
}

function weekdayIndex(date: Date): number {
  return (date.getUTCDay() + 6) % 7;
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-");
  return `${MONTHS[Number(month) - 1]} ${year}`;
}

export function binMatches(data: Loaded, bin: number, kind: "half" | "weekday" | "month", id: string): boolean {
  const date = binDate(data.meta, bin);
  if (kind === "half") return String(date.getUTCHours() * 2 + (date.getUTCMinutes() >= 30 ? 1 : 0)) === id;
  if (kind === "weekday") return String(weekdayIndex(date)) === id;
  return monthKey(date) === id;
}

export function busiestBin(data: Loaded, kind: "half" | "weekday" | "month", id: string): number {
  const n = data.meta.origins.length;
  let best = 0;
  let bestTotal = -1;
  for (let bin = 0; bin < data.meta.nBins; bin += 1) {
    if (!binMatches(data, bin, kind, id)) continue;
    let total = 0;
    const start = bin * n;
    for (let i = 0; i < n; i += 1) total += data.counts[start + i];
    if (total > bestTotal) {
      bestTotal = total;
      best = bin;
    }
  }
  return best;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-CA").format(Math.round(value));
}

function perDay(bucket: Bucket): number {
  return bucket.total / (bucket.bins / 48);
}

function buildRecommendation(halfHours: Bucket[], weekdays: Bucket[], months: Bucket[], originNames: string[]): string[] {
  const rankedHours = [...halfHours].sort((a, b) => b.total - a.total);
  const peak = rankedHours[0];
  const quiet = rankedHours[rankedHours.length - 1];
  const topFive = rankedHours.slice(0, 5);
  const presence = halfHours.reduce((sum, bucket) => sum + bucket.total, 0);
  const topFiveTotal = topFive.reduce((sum, bucket) => sum + bucket.total, 0);

  const originTotals = originNames.map((name, index) => ({
    name,
    total: halfHours.reduce((sum, bucket) => sum + bucket.byOrigin[index], 0),
  }));
  originTotals.sort((a, b) => b.total - a.total);
  const top = originTotals.slice(0, 3).map((item) => {
    const share = (100 * item.total) / presence;
    return `${item.name} (${share.toFixed(1)}%)`;
  });

  const weekdayDays = weekdays.slice(0, 5).reduce((sum, bucket) => sum + bucket.bins, 0) / 48;
  const weekendDays = (weekdays[5].bins + weekdays[6].bins) / 48;
  const weekdayPerDay = weekdays.slice(0, 5).reduce((sum, bucket) => sum + bucket.total, 0) / weekdayDays;
  const weekendPerDay = (weekdays[5].total + weekdays[6].total) / weekendDays;
  const busier = weekdayPerDay >= weekendPerDay ? "weekday" : "weekend day";
  const quieter = busier === "weekday" ? "weekend day" : "weekday";
  const ratio = Math.max(weekdayPerDay, weekendPerDay) / Math.min(weekdayPerDay, weekendPerDay);

  const rankedMonths = [...months].sort((a, b) => perDay(b) - perDay(a));
  const busiestMonth = rankedMonths[0];
  const quietestMonth = rankedMonths[rankedMonths.length - 1];

  return [
    `Presence is highest at ${peak.label} UTC, about ${(peak.total / quiet.total).toFixed(1)} times the quietest clock (${quiet.label} UTC). The five busiest clocks are ${topFive.map((bucket) => bucket.label).join(", ")} UTC, together ${((100 * topFiveTotal) / presence).toFixed(1)}% of active-visit counts.`,
    `The largest home-area totals are ${top.join(", ")}. Those shares are of active-visit counts, so a longer dwell is counted in more bins.`,
    `A ${busier} carries about ${ratio.toFixed(2)} times the presence of a ${quieter} (${formatCount(weekdayPerDay)} per weekday, ${formatCount(weekendPerDay)} per weekend day).`,
    `${busiestMonth.label} has the most presence per day and ${quietestMonth.label} the least (${formatCount(perDay(busiestMonth))} versus ${formatCount(perDay(quietestMonth))} active-visit counts per day).`,
  ];
}

export async function loadData(): Promise<Loaded> {
  const [meta, originsFile, buffer] = await Promise.all([
    fetch("/data/activity-meta.json").then((response) => response.json() as Promise<ActivityMeta>),
    fetch("/data/origins.json").then((response) => response.json() as Promise<OriginsFile>),
    fetch("/data/activity.bin").then((response) => response.arrayBuffer()),
  ]);
  const counts = new Uint16Array(buffer);
  const n = meta.origins.length;
  if (counts.length !== meta.nBins * n) {
    throw new Error(`Activity file has ${counts.length} values, expected ${meta.nBins * n}.`);
  }

  const halfHours: Bucket[] = Array.from({ length: 48 }, (_, index) => ({
    id: String(index),
    label: halfHourLabel(index),
    total: 0,
    bins: 0,
    byOrigin: Array(n).fill(0),
  }));
  const weekdays: Bucket[] = WEEKDAYS.map((label, index) => ({
    id: String(index),
    label,
    total: 0,
    bins: 0,
    byOrigin: Array(n).fill(0),
  }));
  const monthMap = new Map<string, Bucket>();

  for (let bin = 0; bin < meta.nBins; bin += 1) {
    const date = binDate(meta, bin);
    const half = halfHours[date.getUTCHours() * 2 + (date.getUTCMinutes() >= 30 ? 1 : 0)];
    const day = weekdays[weekdayIndex(date)];
    const key = monthKey(date);
    let month = monthMap.get(key);
    if (!month) {
      month = { id: key, label: monthLabel(key), total: 0, bins: 0, byOrigin: Array(n).fill(0) };
      monthMap.set(key, month);
    }
    half.bins += 1;
    day.bins += 1;
    month.bins += 1;
    const start = bin * n;
    for (let origin = 0; origin < n; origin += 1) {
      const value = counts[start + origin];
      half.byOrigin[origin] += value;
      half.total += value;
      day.byOrigin[origin] += value;
      day.total += value;
      month.byOrigin[origin] += value;
      month.total += value;
    }
  }

  const months = [...monthMap.values()];
  return {
    meta,
    counts,
    originsFile,
    halfHours,
    weekdays,
    months,
    recommendation: buildRecommendation(halfHours, weekdays, months, meta.origins),
  };
}
