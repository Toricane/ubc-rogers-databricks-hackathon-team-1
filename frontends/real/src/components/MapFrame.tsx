import { useEffect, type ReactNode } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";

// Esri World Street Map, full colour — same tiles as teammate's map (OSM's own servers block app use).
const ESRI_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTR = "Tiles &copy; Esri — Esri, HERE, Garmin, FAO, NOAA, USGS, OpenStreetMap contributors";

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = JSON.stringify(points);
  useEffect(() => {
    map.invalidateSize();
    if (points.length === 0) return;
    if (points.length === 1) map.setView(points[0], 14);
    else map.fitBounds(L.latLngBounds(points), { paddingTopLeft: [36, 36], paddingBottomRight: [36, 130], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

export function MapFrame({
  points,
  offline,
  legend,
  children,
}: {
  points: [number, number][];
  offline: boolean;
  legend?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="map-wrap">
      <MapContainer
        className="map"
        center={[49.2857, -123.1115]}
        zoom={12}
        zoomControl={false}
        attributionControl
        scrollWheelZoom
      >
        {!offline && <TileLayer url={ESRI_URL} attribution={ESRI_ATTR} maxZoom={19} />}
        <FitBounds points={points} />
        {children}
      </MapContainer>
      {legend && <div className="legend">{legend}</div>}
    </div>
  );
}
