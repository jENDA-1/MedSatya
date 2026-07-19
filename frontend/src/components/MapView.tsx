/// <reference types="vite/client" />
import { useEffect, useRef } from "react";
import maplibregl, { Map as MlMap, Marker, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { ShortlistResult } from "@/lib/api";
import type { LatLon } from "@/lib/geo";
import type { Feature, FeatureCollection, LineString, Polygon } from "geojson";

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

// Evidence palette as CSS custom properties (defined in src/index.css), NOT fixed hex — so the
// markers track the active theme like every other evidence-coloured surface: high-contrast AND the
// colourblind-safe (Okabe–Ito) palette. The vars inherit from :root, so toggling accessibility modes
// recolours the markers LIVE, with no need to re-run the marker effect.
const MARKER_COLORS: Record<string, string> = {
  strongly_supported: "rgb(var(--ev-strong))",
  partially_supported: "rgb(var(--ev-partial))",
  claim_only: "rgb(var(--ev-claim))",
  contradictory: "rgb(var(--ev-contra))",
  not_enough_data: "rgb(var(--ev-unknown))",
};

// Distance channel — deliberately NOT the evidence-color palette above. Concentric
// "isochrone-style" rings around the user's location, rendered as thin dashed navy
// outlines with a faint fill, so distance reads as a visual channel distinct from
// the evidence-colored facility markers.
const DISTANCE_RINGS_KM = [5, 10, 25] as const;
const RING_COLOR = "#071B4F"; // matches the user-location dot — ties the rings to "your location"
const RING_FILL_SOURCE_ID = "distance-rings-fill";
const RING_FILL_LAYER_ID = "distance-rings-fill-layer";
const RING_LINE_SOURCE_ID = "distance-rings-line";
const RING_LINE_LAYER_ID = "distance-rings-line-layer";
const EARTH_RADIUS_KM = 6371;

/** Point at `radiusKm` from `center`, along compass bearing `bearingRad` (0 = north, clockwise). */
function ringPoint(center: LatLon, radiusKm: number, bearingRad: number): [number, number] {
  const latRad = (center.lat * Math.PI) / 180;
  const dLat = (radiusKm / EARTH_RADIUS_KM) * (180 / Math.PI) * Math.cos(bearingRad);
  const dLon =
    ((radiusKm / EARTH_RADIUS_KM) * (180 / Math.PI) * Math.sin(bearingRad)) / Math.cos(latRad);
  return [center.lon + dLon, center.lat + dLat];
}

/** Closed polygon ring approximating a `radiusKm` as-the-crow-flies circle around `center`. */
function circleRing(center: LatLon, radiusKm: number, steps = 72): [number, number][] {
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    coords.push(ringPoint(center, radiusKm, (i / steps) * 2 * Math.PI));
  }
  return coords;
}

interface MapViewProps {
  results: ShortlistResult[];
  userLocation: LatLon;
  selectedId?: string | null;
  onMarkerClick?: (uniqueId: string) => void;
  /** Override the container sizing (e.g. absolute fill inside a full-screen results view). */
  className?: string;
}

/**
 * Accessible-optional map enhancement — the facility list remains the
 * primary interface. Facilities with invalid coordinates are excluded here
 * (they still appear in the list, flagged).
 */
export default function MapView({
  results,
  userLocation,
  selectedId,
  onMarkerClick,
  className,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const ringLabelMarkersRef = useRef<Marker[]>([]);
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
    if (import.meta.env.DEV) (window as unknown as { __map?: MlMap }).__map = map;

    // Insurance: if the container is laid out (or grows) a frame after init — common inside a
    // just-mounted full-screen/absolute container on mobile Safari — force the canvas to catch up.
    const raf = requestAnimationFrame(() => map.resize());
    map.once("load", () => map.resize());

    // Keep the canvas correct when the container resizes (full-screen ⇄ sidebar, sheet drags).
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
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

  // Distance rings — concentric as-the-crow-flies circles around the user's location.
  // userLocation is a required prop, so it's always known once this component mounts;
  // this effect repositions the rings whenever it changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const draw = () => {
      const fillData: FeatureCollection<Polygon, { km: number }> = {
        type: "FeatureCollection",
        features: [...DISTANCE_RINGS_KM]
          .sort((a, b) => b - a) // largest first, so the layered fill fades in toward the center
          .map((km): Feature<Polygon, { km: number }> => ({
            type: "Feature",
            properties: { km },
            geometry: { type: "Polygon", coordinates: [circleRing(userLocation, km)] },
          })),
      };
      const lineData: FeatureCollection<LineString, { km: number }> = {
        type: "FeatureCollection",
        features: DISTANCE_RINGS_KM.map((km): Feature<LineString, { km: number }> => ({
          type: "Feature",
          properties: { km },
          geometry: { type: "LineString", coordinates: circleRing(userLocation, km) },
        })),
      };

      if (!map.getSource(RING_FILL_SOURCE_ID)) {
        map.addSource(RING_FILL_SOURCE_ID, { type: "geojson", data: fillData });
      }
      if (!map.getLayer(RING_FILL_LAYER_ID)) {
        map.addLayer({
          id: RING_FILL_LAYER_ID,
          type: "fill",
          source: RING_FILL_SOURCE_ID,
          paint: { "fill-color": RING_COLOR, "fill-opacity": 0.045 },
        });
      }
      if (!map.getSource(RING_LINE_SOURCE_ID)) {
        map.addSource(RING_LINE_SOURCE_ID, { type: "geojson", data: lineData });
      }
      if (!map.getLayer(RING_LINE_LAYER_ID)) {
        map.addLayer({
          id: RING_LINE_LAYER_ID,
          type: "line",
          source: RING_LINE_SOURCE_ID,
          paint: {
            "line-color": RING_COLOR,
            "line-width": 1.25,
            "line-opacity": 0.5,
            "line-dasharray": [2, 2],
          },
        });
      }

      ringLabelMarkersRef.current.forEach((m) => m.remove());
      ringLabelMarkersRef.current = DISTANCE_RINGS_KM.map((km) => {
        const el = document.createElement("div");
        el.setAttribute("aria-hidden", "true");
        el.textContent = `${km} km`;
        el.style.fontSize = "10px";
        el.style.fontWeight = "600";
        el.style.lineHeight = "1";
        el.style.color = RING_COLOR;
        el.style.background = "rgba(255,255,255,0.88)";
        el.style.padding = "2px 6px";
        el.style.borderRadius = "999px";
        el.style.border = `1px solid ${RING_COLOR}`;
        el.style.opacity = "0.8";
        el.style.pointerEvents = "none";
        el.style.whiteSpace = "nowrap";
        // Southeast point of the ring — stays clear of the top-right nav control.
        return new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat(ringPoint(userLocation, km, (3 * Math.PI) / 4))
          .addTo(map);
      });
    };

    if (map.isStyleLoaded()) {
      draw();
    } else {
      map.once("load", draw);
    }

    return () => {
      map.off("load", draw);
      ringLabelMarkersRef.current.forEach((m) => m.remove());
      ringLabelMarkersRef.current = [];
      // On unmount (leaving the results step) React runs the map-init effect's
      // cleanup first, which calls map.remove() and drops the style. Any style
      // read below (getLayer/getSource) would then throw on the destroyed map and
      // crash the whole tree to a blank screen — breaking the "Change care type /
      // location" return. Guard the teardown so it no-ops once the map is gone.
      try {
        if (map.getLayer(RING_FILL_LAYER_ID)) map.removeLayer(RING_FILL_LAYER_ID);
        if (map.getLayer(RING_LINE_LAYER_ID)) map.removeLayer(RING_LINE_LAYER_ID);
        if (map.getSource(RING_FILL_SOURCE_ID)) map.removeSource(RING_FILL_SOURCE_ID);
        if (map.getSource(RING_LINE_SOURCE_ID)) map.removeSource(RING_LINE_SOURCE_ID);
      } catch {
        // Map already destroyed by its own effect cleanup — nothing to tear down.
      }
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
      // Secondary, optional distance cue: nearer facilities stay fully opaque, farther
      // ones fade slightly. The evidence color itself (above) is never altered.
      if (r.distance_km !== null) {
        const fade = Math.min(r.distance_km / 40, 1);
        el.style.opacity = String(1 - fade * 0.3);
      }

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
      // Frame the ~10km middle ring around the user, NOT all facility markers. The shortlist bbox spans
      // ~±2° (~220km) and can hold facilities 100–200km away; framing over them blew the viewport open to
      // "whole state". Far facilities stay on the map — the user pans/zooms out to reach them. Expand to
      // the nearest facility if it sits beyond 10km, but never past the outer 25km ring.
      const dists = withCoords
        .map((r) => r.distance_km)
        .filter((d): d is number => d !== null);
      const nearestKm = dists.length ? Math.min(...dists) : DISTANCE_RINGS_KM[1];
      const framedKm = Math.min(Math.max(DISTANCE_RINGS_KM[1], nearestKm), DISTANCE_RINGS_KM[2]);
      const bounds = new maplibregl.LngLatBounds();
      [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].forEach((bearing) =>
        bounds.extend(ringPoint(userLocation, framedKm, bearing))
      );
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
      className={
        // Fill mode: size via `absolute inset-0` (inset-based, uses the parent's *used* height) rather
        // than `h-full` (percentage) — a `position:fixed` parent sized only by top/bottom insets is not
        // an "explicitly specified" height, so `height:100%` collapses to 0 and the map goes blank
        // (notably in mobile Safari). Standalone mode keeps its own fixed height.
        className
          ? `absolute inset-0 overflow-hidden ${className}`
          : "relative h-64 w-full overflow-hidden rounded-2xl border border-navy/15 sm:h-80"
      }
    >
      <div
        ref={containerRef}
        role="region"
        aria-label="Map of nearby facilities (optional — full results are listed below)"
        // MapLibre forces `.maplibregl-map { position: relative }`, which would defeat a plain
        // `absolute` here (inset-0 then stops sizing it → height collapses to 0 and the map goes
        // blank). `!absolute` keeps our absolute + inset-0 sizing, so the canvas fills the wrapper.
        className="!absolute inset-0"
      />
      <div className="pointer-events-none absolute bottom-1.5 left-1.5 z-10 max-w-[80%] rounded-md bg-white/90 px-2 py-1 text-[10px] leading-tight text-navy/70 shadow-sm">
        Rings show straight-line (as-the-crow-flies) distance — not travel time.
      </div>
    </div>
  );
}
