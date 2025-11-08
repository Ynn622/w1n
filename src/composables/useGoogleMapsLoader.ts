import { Loader } from '@googlemaps/js-api-loader';

let loaderPromise: Promise<typeof google> | null = null;
const DEFAULT_MAP_ID = import.meta.env.VITE_GOOGLE_MAP_ID || 'DEMO_MAP_ID';

export const loadGoogleMaps = (mapId?: string): Promise<typeof google> => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps can only be loaded in browser environments.'));
  }

  if (window.google?.maps) {
    return Promise.resolve(window.google);
  }

  if (!import.meta.env.VITE_GOOGLE_MAPS_API_KEY) {
    return Promise.reject(new Error('缺少 Google Maps API Key，請設定 VITE_GOOGLE_MAPS_API_KEY。'));
  }

  if (!loaderPromise) {
    const effectiveMapId = mapId ?? DEFAULT_MAP_ID;
    const loader = new Loader({
      apiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
      version: 'weekly',
      libraries: ['marker', 'geometry', 'places'],
      mapIds: effectiveMapId ? [effectiveMapId] : undefined
    });
    loaderPromise = loader.load();
  }

  return loaderPromise;
};
