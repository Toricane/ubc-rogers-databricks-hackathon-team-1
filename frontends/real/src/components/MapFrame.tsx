import { useEffect, type ReactNode } from "react";
import { MapContainer, TileLayer, ZoomControl, useMap } from "react-leaflet";
import L from "leaflet";

// Esri World Street Map, full colour — same tiles as teammate's map (OSM's own servers block app use).
const ESRI_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTR = "Tiles &copy; Esri — Esri, HERE, Garmin, FAO, NOAA, USGS, OpenStreetMap contributors";

function FitBounds({ points, zoom }: { points: [number, number][]; zoom: number }) {
  const map = useMap();
  const key = JSON.stringify(points);
  useEffect(() => {
    // Desktop leaves 130px at the bottom for the overlaid legend. On a phone the legend
    // sits under the map, so that padding would crush the routes into the top of a short map.
    const mq = window.matchMedia("(max-width: 900px)");
    const apply = () => {
      map.invalidateSize();
      if (points.length === 0) return;
      if (points.length === 1) map.setView(points[0], zoom);
      else map.fitBounds(L.latLngBounds(points), {
        paddingTopLeft: [36, 36],
        paddingBottomRight: [36, mq.matches ? 36 : 130],
        maxZoom: 15,
      });
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key, zoom]);
  return null;
}

export function MapFrame({
  points,
  offline,
  legend,
  focus,
  zoom = 14,
  children,
}: {
  points: [number, number][];
  offline: boolean;
  legend?: ReactNode;
  /** Highlight one group of home-area circles (the rest fade). */
  focus?: string | null;
  /** Zoom used when the map is centred on a single point. */
  zoom?: number;
  children: ReactNode;
}) {
  return (
    <div className="map-wrap" data-focus={focus ?? undefined}>
      <MapContainer
        className="map"
        center={[49.2857, -123.1115]}
        zoom={12}
        zoomControl={false}
        attributionControl
        scrollWheelZoom
      >
        {!offline && <TileLayer url={ESRI_URL} attribution={ESRI_ATTR} maxZoom={19} />}
        <FitBounds points={points} zoom={zoom} />
        <ZoomControl position="topright" zoomInTitle="Zoom in" zoomOutTitle="Zoom out" />
        {children}
      </MapContainer>
      {legend && <div className="legend">{legend}</div>}
    </div>
  );
}
