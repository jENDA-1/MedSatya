import { useEffect, useRef, useState } from "react";
import maplibregl, { Map as MlMap, Marker, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
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

interface LocationPickerProps {
  initialCenter: LatLon;
  onConfirm: (loc: LatLon) => void;
}

/** Optional enhancement for Step 1: tap the map to drop a pin instead of
 * using "Use my location" or a preset city. */
export default function LocationPicker({ initialCenter, onConfirm }: LocationPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [picked, setPicked] = useState<LatLon | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: [initialCenter.lon, initialCenter.lat],
      zoom: 10,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("click", (e) => {
      const loc = { lat: e.lngLat.lat, lon: e.lngLat.lng };
      setPicked(loc);
      if (markerRef.current) {
        markerRef.current.setLngLat([loc.lon, loc.lat]);
      } else {
        markerRef.current = new maplibregl.Marker({ color: "#071B4F" })
          .setLngLat([loc.lon, loc.lat])
          .addTo(map);
      }
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div
        ref={containerRef}
        role="region"
        aria-label="Tap the map to set your location"
        className="h-48 w-full overflow-hidden rounded-2xl border border-navy/15"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs text-navy/60">Tap anywhere on the map to drop a pin.</p>
        <button
          type="button"
          disabled={!picked}
          onClick={() => picked && onConfirm(picked)}
          className="min-h-[40px] rounded-xl bg-navy px-4 text-sm font-semibold text-white disabled:opacity-40"
        >
          Use this spot
        </button>
      </div>
    </div>
  );
}
