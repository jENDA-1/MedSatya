import { useEffect, useRef } from "react";
import maplibregl, { Map as MlMap, Marker, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { ShortlistResult } from "@/lib/api";
import type { LatLon } from "@/lib/geo";

const OSM_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

const MARKER_COLORS: Record<string, string> = {
  strongly_supported: "#00634B",
  partially_supported: "#C99A2E",
  claim_only: "#6B7280",
  contradictory: "#B4232A",
  not_enough_data: "#94A3B8",
};

interface MapViewProps {
  results: ShortlistResult[];
  userLocation: LatLon;
  selectedId?: string | null;
  onMarkerClick?: (uniqueId: string) => void;
}

/**
 * Accessible-optional map enhancement — the facility list remains the
 * primary interface. Facilities with invalid coordinates are excluded here
 * (they still appear in the list, flagged).
 */
export default function MapView({ results, userLocation, selectedId, onMarkerClick }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const onMarkerClickRef = useRef(onMarkerClick);
  onMarkerClickRef.current = onMarkerClick;

  // Initialise the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: [userLocation.lon, userLocation.lat],
      zoom: 11,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // User location marker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const el = document.createElement("div");
    el.setAttribute("aria-hidden", "true");
    el.style.width = "18px";
    el.style.height = "18px";
    el.style.borderRadius = "50%";
    el.style.background = "#071B4F";
    el.style.border = "3px solid white";
    el.style.boxShadow = "0 0 0 2px #071B4F";
    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([userLocation.lon, userLocation.lat])
      .setPopup(new maplibregl.Popup({ closeButton: false }).setText("Your location"))
      .addTo(map);
    return () => {
      marker.remove();
    };
  }, [userLocation.lat, userLocation.lon]);

  // Facility markers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current.clear();

    const withCoords = results.filter(
      (r) => r.coord_valid && r.latitude !== null && r.longitude !== null
    );

    for (const r of withCoords) {
      const color = MARKER_COLORS[r.evidence.status] ?? MARKER_COLORS.not_enough_data;
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", `${r.name} — ${r.evidence.status_label}`);
      el.style.width = "20px";
      el.style.height = "20px";
      el.style.borderRadius = "50% 50% 50% 0";
      el.style.transform = "rotate(-45deg)";
      el.style.background = color;
      el.style.border = "2px solid white";
      el.style.boxShadow = "0 1px 3px rgba(0,0,0,0.4)";
      el.style.cursor = "pointer";
      el.style.padding = "0";

      el.addEventListener("click", () => {
        onMarkerClickRef.current?.(r.unique_id);
      });

      const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([r.longitude as number, r.latitude as number])
        .setPopup(new maplibregl.Popup({ closeButton: false, offset: 16 }).setText(r.name))
        .addTo(map);

      markersRef.current.set(r.unique_id, marker);
    }

    if (withCoords.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      bounds.extend([userLocation.lon, userLocation.lat]);
      withCoords.forEach((r) => bounds.extend([r.longitude as number, r.latitude as number]));
      map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 0 });
    }
  }, [results, userLocation.lat, userLocation.lon]);

  // Highlight selected marker.
  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      const el = marker.getElement();
      el.style.outline = id === selectedId ? "3px solid #071B4F" : "none";
      el.style.zIndex = id === selectedId ? "10" : "0";
    });
  }, [selectedId]);

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="Map of nearby facilities (optional — full results are listed below)"
      className="h-64 w-full overflow-hidden rounded-2xl border border-navy/15 sm:h-80"
    />
  );
}
