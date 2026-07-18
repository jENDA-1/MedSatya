// Geolocation helpers — opt-in browser location + preset city fallbacks.

export interface LatLon {
  lat: number;
  lon: number;
}

export interface PresetCity extends LatLon {
  name: string;
}

export const PRESET_CITIES: PresetCity[] = [
  { name: "Patna", lat: 25.594, lon: 85.137 },
  { name: "New Delhi", lat: 28.6139, lon: 77.209 },
  { name: "Mumbai", lat: 19.076, lon: 72.8777 },
  { name: "Kolkata", lat: 22.5726, lon: 88.3639 },
  { name: "Chennai", lat: 13.0827, lon: 80.2707 },
  { name: "Ranchi", lat: 23.3441, lon: 85.3096 },
];

/**
 * Ask the browser for the user's current location. Rejects with a
 * human-readable message on denial, timeout, or when geolocation is
 * unsupported — callers should fall back to a preset city.
 */
export function requestLocation(): Promise<LatLon> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocation is not supported on this device."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(new Error("Location access was denied. Pick a city instead."));
        } else if (err.code === err.TIMEOUT) {
          reject(new Error("Location request timed out. Pick a city instead."));
        } else {
          reject(new Error("Could not determine your location. Pick a city instead."));
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 }
    );
  });
}
