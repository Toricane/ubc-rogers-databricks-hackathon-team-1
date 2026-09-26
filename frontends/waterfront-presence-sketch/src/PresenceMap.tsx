import { useEffect, useRef } from "react";
import L from "leaflet";

export type MapPoint = {
  name: string;
  latitude: number;
  longitude: number;
  count: number;
};

type PresenceMapProps = {
  center: [number, number];
  zoom: number;
  points: MapPoint[];
  maxCount: number;
  station?: { name: string; latitude: number; longitude: number } | null;
};

export function PresenceMap({ center, zoom, points, maxCount, station = null }: PresenceMapProps) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markers = useRef(new globalThis.Map<string, L.CircleMarker>());
  const stationRef = useRef<L.CircleMarker | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const map = L.map(host.current, { zoomControl: true }).setView(center, zoom);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 18,
    }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markers.current.clear();
      stationRef.current = null;
    };
    // Initial frame only. Playback must not rebuild the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const seen = new Set<string>();
    for (const point of points) {
      seen.add(point.name);
      const radius = point.count === 0 || maxCount === 0 ? 0 : 4 + 22 * Math.sqrt(point.count / maxCount);
      let marker = markers.current.get(point.name);
      if (!marker) {
        marker = L.circleMarker([point.latitude, point.longitude], {
          radius,
          color: "#143d40",
          weight: 1,
          fillColor: "#1f7a72",
          fillOpacity: 0.8,
        }).addTo(map);
        markers.current.set(point.name, marker);
      }
      marker.setLatLng([point.latitude, point.longitude]);
      marker.setRadius(radius);
      marker.setStyle({ opacity: radius === 0 ? 0 : 1, fillOpacity: radius === 0 ? 0 : 0.8 });
      const tip = `${point.name}: ${point.count.toLocaleString("en-CA")} active visits`;
      if (marker.getTooltip()) marker.setTooltipContent(tip);
      else marker.bindTooltip(tip);
    }
    for (const [name, marker] of [...markers.current]) {
      if (!seen.has(name)) {
        marker.remove();
        markers.current.delete(name);
      }
    }
    if (station && !stationRef.current) {
      stationRef.current = L.circleMarker([station.latitude, station.longitude], {
        radius: 6,
        color: "#fffaf3",
        weight: 2,
        fillColor: "#c2410c",
        fillOpacity: 1,
      })
        .addTo(map)
        .bindTooltip(station.name);
    }
  }, [points, maxCount, station]);

  return <div ref={host} className="map-host" />;
}
