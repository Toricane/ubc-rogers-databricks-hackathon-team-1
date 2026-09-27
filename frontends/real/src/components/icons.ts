// Leaflet divIcons. Colours come from tokens via CSS classes in map.css.
import L from "leaflet";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function waterfrontIcon(label: string) {
  return L.divIcon({
    className: "wf-icon",
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    html: `<span class="wf-pulse"></span><span class="wf-pin"></span><span class="wf-chip">${esc(label)}</span>`,
  });
}

export function crossingIcon(closed: boolean) {
  return L.divIcon({
    className: "xing-icon",
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `<span class="xing ${closed ? "closed" : "open"}">${closed ? "✕" : "✓"}</span>`,
  });
}

export function hubIcon(count: number | null) {
  if (count === null)
    return L.divIcon({ className: "hub-icon", iconSize: [12, 12], iconAnchor: [6, 6], html: `<span class="hub idle"></span>` });
  return L.divIcon({
    className: "hub-icon",
    iconSize: [40, 28],
    iconAnchor: [20, 14],
    html: `<span class="hub active num">${count.toLocaleString("en-CA")}</span>`,
  });
}

export function arrowIcon(bearing: number, extraClass = "") {
  return L.divIcon({
    className: `arrow-icon ${extraClass}`.trim(),
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    html: `<span class="arrow" style="transform: rotate(${bearing.toFixed(0)}deg)"></span>`,
  });
}

/** Label chip anchored at a route's end (the home-area side). `html` must already be escaped. */
export function routeChipIcon(html: string, cls: "diverted" | "closed" | "normal", left = false, up = false) {
  return L.divIcon({
    className: "route-chip-icon",
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    html: `<span class="route-chip ${cls}${left ? " left" : ""}${up ? " up" : ""}">${html}</span>`,
  });
}
