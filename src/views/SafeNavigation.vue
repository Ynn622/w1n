<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import BottomNav from '@/components/BottomNav.vue';
import Input from '@/components/base/Input.vue';
import Button from '@/components/base/Button.vue';
import GoogleMap from '@/components/common/GoogleMap.vue';
import { fetchRoadRiskSegments, geocodeAddress, getSafeNavigationData } from '@/utils/api';
import { loadGoogleMaps } from '@/composables/useGoogleMapsLoader';
import type { SafeRouteSegment } from '@/utils/api';
import type { LatLng, MapMarkerDescriptor, MapPolylineDescriptor } from '@/types/maps';

const {
  defaultStart,
  defaultEnd,
  segments,
  mapEmbedUrl
} = getSafeNavigationData();

const DEBUG_SAFE_NAV = true;
const logSafeNav = (...messages: unknown[]) => {
  if (DEBUG_SAFE_NAV) {
    console.info('[SafeNavigation]', ...messages);
  }
};

const origin = ref(defaultStart);
const destination = ref(defaultEnd);
const originCoords = ref<LatLng | null>(null);
const destinationCoords = ref<LatLng | null>(null);
const selectedSegment = ref<SafeRouteSegment | null>(null);
const defaultSafeCenter: LatLng = { lat: 25.0375198, lng: 121.5636796 };
const userCoords = ref<LatLng | null>(null);
const mapCenter = ref<LatLng>(defaultSafeCenter);
const isLocating = ref(false);
const locationError = ref<string | null>(null);
const canUseGeolocation = typeof window !== 'undefined' && 'geolocation' in navigator;
const isOriginGeocoding = ref(false);
const isDestinationGeocoding = ref(false);
const originMarkerHint = ref('尚未標記出發點');
const destinationMarkerHint = ref('尚未標記目的地');
const isSegmentModalOpen = ref(false);
const isSegmentLoading = ref(false);
const segmentError = ref<string | null>(null);
const hazardSegments = ref<SafeRouteSegment[]>(segments);
const safeRoutePath = ref<LatLng[]>([]);
const routeWaypoints = ref<LatLng[]>([]);
const interferingSegments = ref<SafeRouteSegment[]>([]);
const isRoutePlanning = ref(false);
const routeError = ref<string | null>(null);
let googleMapsApi: typeof google | null = null;
let directionsService: google.maps.DirectionsService | null = null;
let routeTaskId = 0;
const routeLegPaths = ref<LatLng[][]>([]);

if (segments.length) {
  selectedSegment.value = segments[0];
}

const EARTH_RADIUS = 6371000; // meters
const RISK_BUFFER_METERS = 350;
const MAX_DETOUR_WAYPOINTS = 8;
const SCOOTER_TRAVEL_MODE = 'driving';
const SCOOTER_MODE_PARAM = 'two_wheeler';
const SCOOTER_DIR_FLAG = 'm';

type RouteComputationResult = {
  overviewPath: LatLng[];
  legPaths: LatLng[][];
};

const canNavigate = computed(() => Boolean(origin.value && destination.value));
const hazardCount = computed(() => hazardSegments.value.length);

const toXY = (point: LatLng) => {
  const latRad = (point.lat * Math.PI) / 180;
  const lngRad = (point.lng * Math.PI) / 180;
  return {
    x: EARTH_RADIUS * lngRad * Math.cos(latRad),
    y: EARTH_RADIUS * latRad
  };
};

const distancePointToSegmentMeters = (point: LatLng, start: LatLng, end: LatLng) => {
  const p = toXY(point);
  const a = toXY(start);
  const b = toXY(end);
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const abLenSq = abx * abx + aby * aby;
  if (abLenSq === 0) {
    return Math.hypot(apx, apy);
  }
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq));
  const projX = a.x + abx * t;
  const projY = a.y + aby * t;
  return Math.hypot(p.x - projX, p.y - projY);
};

const segmentDistanceMeters = (segA: { start: LatLng; end: LatLng }, segB: { start: LatLng; end: LatLng }) => {
  const candidates = [
    distancePointToSegmentMeters(segA.start, segB.start, segB.end),
    distancePointToSegmentMeters(segA.end, segB.start, segB.end),
    distancePointToSegmentMeters(segB.start, segA.start, segA.end),
    distancePointToSegmentMeters(segB.end, segA.start, segA.end)
  ];
  return Math.min(...candidates);
};

const computeMidpoint = (start: LatLng, end: LatLng): LatLng => ({
  lat: (start.lat + end.lat) / 2,
  lng: (start.lng + end.lng) / 2
});

const buildDetourPoint = (segment: SafeRouteSegment): LatLng | null => {
  if (!segment.start || !segment.end) {
    return null;
  }
  const midpoint = computeMidpoint(segment.start, segment.end);
  const dirLat = segment.end.lat - segment.start.lat;
  const dirLng = segment.end.lng - segment.start.lng;
  const perpLat = -dirLng;
  const perpLng = dirLat;
  const length = Math.hypot(perpLat, perpLng) || 1;
  const offsetMeters = 0.002 + (segment.riskLevel ? segment.riskLevel * 0.0003 : 0.0015);
  return {
    lat: midpoint.lat + (perpLat / length) * offsetMeters,
    lng: midpoint.lng + (perpLng / length) * offsetMeters
  };
};

const isSegmentAffectingRoute = (segment: SafeRouteSegment): boolean => {
  if (!segment.start || !segment.end || !originCoords.value || !destinationCoords.value) {
    return false;
  }
  const routeSegment = { start: originCoords.value, end: destinationCoords.value };
  const hazardSegment = { start: segment.start, end: segment.end };
  const distance = segmentDistanceMeters(routeSegment, hazardSegment);
  return distance <= RISK_BUFFER_METERS;
};

const dedupeWaypoints = (points: (LatLng | null)[]): LatLng[] => {
  const seen = new Set<string>();
  const unique: LatLng[] = [];
  points.forEach((point) => {
    if (!point) return;
    const key = `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(point);
    }
  });
  return unique;
};

const ensureDirectionsService = async () => {
  if (!googleMapsApi) {
    googleMapsApi = await loadGoogleMaps();
    logSafeNav('Google Maps API loaded');
  }
  if (!directionsService) {
    directionsService = new googleMapsApi.maps.DirectionsService();
    logSafeNav('DirectionsService initialized');
  }
  return { googleMaps: googleMapsApi, service: directionsService };
};

const decodePolylinePoints = (
  googleMaps: typeof google,
  polyline?: google.maps.DirectionsPolyline | { points?: string } | string
): LatLng[] => {
  const encoded =
    typeof polyline === 'string' ? polyline : typeof polyline?.points === 'string' ? polyline.points : '';
  if (!encoded || !googleMaps.maps.geometry?.encoding) {
    return [];
  }
  return googleMaps.maps.geometry.encoding
    .decodePath(encoded)
    .map((point) => ({ lat: point.lat(), lng: point.lng() }));
};

const extractLegPath = (googleMaps: typeof google, leg: google.maps.DirectionsLeg): LatLng[] => {
  const points: LatLng[] = [];
  if (leg.steps?.length) {
    leg.steps.forEach((step) => {
      if (step.polyline) {
        points.push(...decodePolylinePoints(googleMaps, step.polyline));
      } else if (step.path?.length) {
        points.push(...step.path.map((p) => ({ lat: p.lat(), lng: p.lng() })));
      }
    });
  }
  if (!points.length) {
    points.push(
      { lat: leg.start_location.lat(), lng: leg.start_location.lng() },
      { lat: leg.end_location.lat(), lng: leg.end_location.lng() }
    );
  }
  return points;
};

const requestRoadAwareRoute = async (waypoints: LatLng[]): Promise<RouteComputationResult> => {
  const { googleMaps, service } = await ensureDirectionsService();
  logSafeNav('Requesting Directions', {
    origin: originCoords.value,
    destination: destinationCoords.value,
    waypointCount: waypoints.length
  });
  const waypointPayload =
    waypoints.length > 0
      ? waypoints.map((point) => ({
          location: { lat: point.lat, lng: point.lng },
          stopover: false
        }))
      : [];

  const runDirections = (payload: google.maps.DirectionsWaypoint[]) =>
    new Promise<RouteComputationResult>((resolve, reject) => {
      service.route(
        {
          origin: { lat: originCoords.value!.lat, lng: originCoords.value!.lng },
          destination: { lat: destinationCoords.value!.lat, lng: destinationCoords.value!.lng },
          travelMode: googleMaps.maps.TravelMode.DRIVING,
          provideRouteAlternatives: false,
          waypoints: payload,
          region: 'TW',
          avoidFerries: true,
          avoidTolls: false,
          avoidHighways: false
        },
        (result, status) => {
          if (status === googleMaps.maps.DirectionsStatus.OK && result?.routes?.length) {
            const route = result.routes[0];
            let overviewPath = decodePolylinePoints(googleMaps, route.overview_polyline);
            if ((!overviewPath || !overviewPath.length) && route.overview_path?.length) {
              overviewPath = route.overview_path.map((point) => ({
                lat: point.lat(),
                lng: point.lng()
              }));
            }
            const legPaths =
              route.legs?.map((leg) => extractLegPath(googleMaps, leg)) ?? [];
            logSafeNav('Directions success', {
              overviewPoints: overviewPath.length,
              legs: legPaths.length,
              warnings: route.warnings
            });
            resolve({
              overviewPath,
              legPaths: legPaths.length ? legPaths : []
            });
          } else {
            logSafeNav('Directions failed', status, result);
            reject(
              Object.assign(new Error(`Directions failed: ${status}`), {
                status
              })
            );
          }
        }
      );
    });

  try {
    return await runDirections(waypointPayload);
  } catch (error) {
    const status =
      (error as { status?: string }).status ??
      (error instanceof Error ? error.message : '');
    if (
      status?.includes('ZERO_RESULTS') &&
      waypointPayload.length > 0
    ) {
      logSafeNav('ZERO_RESULTS with detours, retry without waypoints');
      return await runDirections([]);
    }
    throw error;
  }
};

const buildFallbackLegPaths = (stops: LatLng[]): LatLng[][] => {
  const paths: LatLng[][] = [];
  for (let i = 0; i < stops.length - 1; i += 1) {
    paths.push([stops[i], stops[i + 1]]);
  }
  return paths;
};

const recomputeSafeRoute = async () => {
  routeError.value = null;
  const requestId = ++routeTaskId;
  if (!originCoords.value || !destinationCoords.value) {
    safeRoutePath.value = [];
    routeWaypoints.value = [];
    interferingSegments.value = [];
    return;
  }
  isRoutePlanning.value = true;
  try {
    const affecting = hazardSegments.value.filter(isSegmentAffectingRoute);
    interferingSegments.value = affecting;
    const detours = dedupeWaypoints(
      affecting
        .slice(0, MAX_DETOUR_WAYPOINTS)
        .map((segment) => buildDetourPoint(segment))
    );
    logSafeNav('Route recompute triggered', {
      affectingCount: affecting.length,
      detourCount: detours.length
    });
    routeWaypoints.value = detours;
    const stops: LatLng[] = [originCoords.value, ...detours, destinationCoords.value];
    let overviewPath: LatLng[] = [];
    let legPaths: LatLng[][] = [];
    try {
      const result = await requestRoadAwareRoute(detours);
      overviewPath = result.overviewPath;
      legPaths = result.legPaths;
    } catch (error) {
      console.warn('[SafeNavigation] directions failed, fallback to straight line', error);
      overviewPath = stops;
      routeError.value = '路線以近似直線呈現，請留意地圖。';
    }
    if (requestId !== routeTaskId) {
      return;
    }
    safeRoutePath.value = overviewPath;
    routeLegPaths.value = legPaths.length ? legPaths : buildFallbackLegPaths(stops);
    logSafeNav('Route updated', {
      overviewPoints: safeRoutePath.value.length,
      legSegments: routeLegPaths.value.length
    });
    activeRouteStepIndex.value = null;
    const pathMidpoint = safeRoutePath.value[Math.floor(safeRoutePath.value.length / 2)];
    if (pathMidpoint) {
      mapCenter.value = pathMidpoint;
    }
  } catch (error) {
    if (requestId !== routeTaskId) {
      return;
    }
    routeError.value = error instanceof Error ? error.message : '規劃路線時發生錯誤';
    const fallbackStops = [
      originCoords.value,
      ...routeWaypoints.value,
      destinationCoords.value
    ].filter((coord): coord is LatLng => Boolean(coord));
    safeRoutePath.value = fallbackStops;
    routeLegPaths.value = buildFallbackLegPaths(fallbackStops);
    logSafeNav('Route fallback applied', {
      reason: routeError.value,
      fallbackSegments: routeLegPaths.value.length
    });
  } finally {
    if (requestId === routeTaskId) {
      isRoutePlanning.value = false;
      logSafeNav('Route planning finished');
    }
  }
};

watch(
  [originCoords, destinationCoords, () => hazardSegments.value],
  () => {
    void recomputeSafeRoute();
  },
  { deep: true }
);

const routeSummaryText = computed(() => {
  if (!originCoords.value || !destinationCoords.value) {
    return '請先輸入並標記出發點與目的地';
  }
  if (routeError.value) {
    return routeError.value;
  }
  if (isRoutePlanning.value) {
    return '路線規劃中...';
  }
  if (interferingSegments.value.length) {
    return `已避開 ${interferingSegments.value.length} 段 Level 5 風險路段`;
  }
  if (hazardCount.value) {
    return '目前規劃路線未與高風險區域重疊，可直接前往。';
  }
  return '目前無 Level 5 風險路段，建議按原計畫行駛。';
});

const focusRouteStep = (stepIndex: number) => {
  const step = routeStepDetails.value[stepIndex];
  if (!step) {
    return;
  }
  mapCenter.value = step.midpoint;
  activeRouteStepIndex.value = stepIndex;
};
const resetNavigation = () => {
  origin.value = '';
  destination.value = '';
  originCoords.value = null;
  destinationCoords.value = null;
  selectedSegment.value = null;
  originMarkerHint.value = '尚未標記出發點';
  destinationMarkerHint.value = '尚未標記目的地';
  safeRoutePath.value = [];
  routeWaypoints.value = [];
  interferingSegments.value = [];
};

const formatCoord = (coord: LatLng) => `${coord.lat},${coord.lng}`;

const startNavigation = () => {
  if (!canNavigate.value) {
    return;
  }
  if (originCoords.value && destinationCoords.value) {
    const params = new URLSearchParams({
      api: '1',
      travelmode: SCOOTER_TRAVEL_MODE,
      origin: formatCoord(originCoords.value),
      destination: formatCoord(destinationCoords.value)
    });
    if (routeWaypoints.value.length) {
      params.set('waypoints', routeWaypoints.value.map(formatCoord).join('|'));
    }
    params.set('layer', 'traffic');
    params.set('mode', SCOOTER_MODE_PARAM);
    params.set('dirflg', SCOOTER_DIR_FLAG);
    window.open(`https://www.google.com/maps/dir/?${params.toString()}`, '_blank');
    return;
  }
  const fallbackUrl = `https://www.google.com/maps/dir/?api=1&travelmode=${SCOOTER_TRAVEL_MODE}&mode=${SCOOTER_MODE_PARAM}&dirflg=${SCOOTER_DIR_FLAG}&origin=${encodeURIComponent(origin.value)}&destination=${encodeURIComponent(destination.value)}`;
  window.open(fallbackUrl, '_blank');
};

const focusSegmentOnMap = (segment: SafeRouteSegment) => {
  if (segment.start && segment.end) {
    mapCenter.value = computeMidpoint(segment.start, segment.end);
  }
};

const selectSegment = (segment: SafeRouteSegment) => {
  selectedSegment.value = segment;
  focusSegmentOnMap(segment);
};

const openSegmentModal = () => {
  activeRouteStepIndex.value = null;
  isSegmentModalOpen.value = true;
};

const closeSegmentModal = () => {
  isSegmentModalOpen.value = false;
};

const getWindSegments = (speed: number) => {
  const segments = 5;
  const maxSpeed = 15;
  const ratio = Math.min(speed, maxSpeed) / maxSpeed;
  return Array.from({ length: segments }, (_, index) => ratio >= (index + 1) / segments);
};

const openSafeMap = () => {
  const targetUrl = userCoords.value
    ? `https://www.google.com/maps/search/?api=1&query=${userCoords.value.lat},${userCoords.value.lng}`
    : mapEmbedUrl;
  if (!targetUrl) {
    return;
  }
  window.open(targetUrl, '_blank', 'noopener');
};

const locationLabel = computed(() => {
  if (!userCoords.value) {
    return '尚未鎖定座標';
  }
  return `緯度 ${userCoords.value.lat.toFixed(5)}、經度 ${userCoords.value.lng.toFixed(5)}`;
});

const hazardPolylines = computed<MapPolylineDescriptor[]>(() =>
  hazardSegments.value
    .filter((segment) => segment.start && segment.end)
    .map((segment, index) => ({
      id: `hazard-line-${segment.id ?? index}`,
      path: [segment.start!, segment.end!],
      color: '#EA580C',
      weight: 4,
      opacity: 0.95,
      zIndex: 25,
      dashed: true,
      dashSpacing: '12px'
    }))
);

const ROUTE_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const hazardMarkers = computed<MapMarkerDescriptor[]>(() =>
  hazardSegments.value
    .filter((segment) => segment.start && segment.end)
    .map((segment, index) => {
      const start = segment.start!;
      const end = segment.end!;
      const midpoint: LatLng = {
        lat: (start.lat + end.lat) / 2,
        lng: (start.lng + end.lng) / 2
      };
      const shortLabel = segment.name.length > 6 ? `${segment.name.slice(0, 6)}…` : segment.name;
      return {
        id: `hazard-${segment.id ?? index}`,
        position: midpoint,
        color: '#F97316',
        label: shortLabel,
        zIndex: 15,
        meta: { segment }
      };
    })
);

const routeStops = computed<LatLng[]>(() => {
  if (!originCoords.value || !destinationCoords.value) {
    return [];
  }
  return [originCoords.value, ...routeWaypoints.value, destinationCoords.value];
});

const isRouteReady = computed(() => routeStops.value.length >= 2);

const haversineDistanceMeters = (a: LatLng, b: LatLng) => {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const lat1 = rad(a.lat);
  const lat2 = rad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
};

const formatDistance = (meters: number) => {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.max(1, Math.round(meters))} m`;
};

const computePathLength = (path: LatLng[]): number => {
  if (path.length < 2) {
    return 0;
  }
  let total = 0;
  for (let i = 0; i < path.length - 1; i += 1) {
    total += haversineDistanceMeters(path[i], path[i + 1]);
  }
  return total;
};

const routeStepMarkers = computed<MapMarkerDescriptor[]>(() =>
  routeStops.value.map((point, index) => {
    const label = ROUTE_LABELS[index] ?? `P${index + 1}`;
    const isDestination = index === routeStops.value.length - 1;
    return {
      id: `route-step-${index}`,
      position: point,
      color: isDestination ? '#2DD4BF' : '#0EA5E9',
      label,
      zIndex: 45,
      meta: { type: 'route-step', order: index }
    };
  })
);

type RouteStepDetail = {
  id: string;
  label: string;
  fromLabel: string;
  toLabel: string;
  start: LatLng;
  end: LatLng;
  midpoint: LatLng;
  distance: number;
};

const routeStepDetails = computed<RouteStepDetail[]>(() => {
  const stops = routeStops.value;
  if (stops.length < 2) {
    return [];
  }
  return stops.slice(0, -1).map((start, index) => {
    const end = stops[index + 1];
    const path = routeLegPaths.value[index] ?? [start, end];
    return {
      id: `route-step-${index}`,
      label: `${ROUTE_LABELS[index] ?? `P${index + 1}`} → ${
        ROUTE_LABELS[index + 1] ?? `P${index + 2}`
      }`,
      fromLabel: ROUTE_LABELS[index] ?? `P${index + 1}`,
      toLabel: ROUTE_LABELS[index + 1] ?? `P${index + 2}`,
      start,
      end,
      midpoint: path[Math.floor(path.length / 2)] ?? computeMidpoint(start, end),
      distance: computePathLength(path)
    };
  });
});

const activeRouteStepIndex = ref<number | null>(null);

const routeLabelChain = computed(() => {
  if (!routeStops.value.length) {
    return '';
  }
  const labels = routeStops.value.map((_, index) => ROUTE_LABELS[index] ?? `P${index + 1}`);
  return labels.join(' → ');
});

const safeMapMarkers = computed<MapMarkerDescriptor[]>(() => {
  const markers: MapMarkerDescriptor[] = [...hazardMarkers.value];
  if (routeStepMarkers.value.length) {
    markers.push(...routeStepMarkers.value);
  } else {
    if (originCoords.value) {
      markers.push({
        id: 'safe-origin',
        position: originCoords.value,
        color: '#0EA5E9',
        label: '出發點',
        zIndex: 40
      });
    }
    if (destinationCoords.value) {
      markers.push({
        id: 'safe-destination',
        position: destinationCoords.value,
        color: '#2DD4BF',
        label: '目的地',
        zIndex: 40
      });
    }
  }
  if (userCoords.value) {
    markers.push({
      id: 'safe-user',
      position: userCoords.value,
      color: '#1F8A70',
      label: '目前定位',
      zIndex: 50
    });
  }
  return markers;
});

const routeLegPolylines = computed<MapPolylineDescriptor[]>(() =>
  routeLegPaths.value.map((path, index) => ({
    id: `route-leg-${index}`,
    path,
    color: activeRouteStepIndex.value === index ? '#0C8DD8' : '#0EA5E9',
    weight: activeRouteStepIndex.value === index ? 6 : 4,
    opacity: 0.95,
    zIndex: activeRouteStepIndex.value === index ? 60 : 45
  }))
);

const mapPolylines = computed<MapPolylineDescriptor[]>(() => [
  ...hazardPolylines.value,
  ...routeLegPolylines.value
]);

const applyMarkerFromInput = async (type: 'origin' | 'destination') => {
  const targetValue = type === 'origin' ? origin.value.trim() : destination.value.trim();
  if (!targetValue) {
    if (type === 'origin') {
      originMarkerHint.value = '請先輸入出發點';
    } else {
      destinationMarkerHint.value = '請先輸入目的地';
    }
    return;
  }

  const loadingRef = type === 'origin' ? isOriginGeocoding : isDestinationGeocoding;
  const hintRef = type === 'origin' ? originMarkerHint : destinationMarkerHint;
  const coordRef = type === 'origin' ? originCoords : destinationCoords;

  loadingRef.value = true;
  hintRef.value = '定位中...';

  const coords = await geocodeAddress(targetValue);
  loadingRef.value = false;

  if (!coords) {
    hintRef.value = '無法標記，請確認地址';
    return;
  }

  coordRef.value = coords;
  mapCenter.value = coords;
  hintRef.value = `已標記：${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;
};

const loadHazardSegments = async () => {
  isSegmentLoading.value = true;
  segmentError.value = null;
  try {
    const remoteSegments = await fetchRoadRiskSegments(5);
    if (remoteSegments.length) {
      hazardSegments.value = remoteSegments;
      selectedSegment.value = remoteSegments[0];
    } else if (!selectedSegment.value && hazardSegments.value.length) {
      selectedSegment.value = hazardSegments.value[0];
    }
  } catch (error) {
    segmentError.value =
      error instanceof Error ? error.message : '無法取得高風險路段資料';
  } finally {
    isSegmentLoading.value = false;
  }
};

const requestUserLocation = () => {
  if (!canUseGeolocation || typeof navigator === 'undefined') {
    locationError.value = '此裝置不支援定位功能';
    return;
  }
  isLocating.value = true;
  locationError.value = null;
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      const coords = { lat: latitude, lng: longitude };
      userCoords.value = coords;
      mapCenter.value = coords;
      isLocating.value = false;
    },
    (error) => {
      isLocating.value = false;
      switch (error.code) {
        case error.PERMISSION_DENIED:
          locationError.value = '使用者拒絕定位授權';
          break;
        case error.POSITION_UNAVAILABLE:
          locationError.value = '定位資訊不可用';
          break;
        case error.TIMEOUT:
          locationError.value = '定位逾時，請重新嘗試';
          break;
        default:
          locationError.value = '無法取得定位資訊';
      }
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
  );
};

const handleMarkerClick = (marker: MapMarkerDescriptor) => {
  const segment = marker.meta?.segment as SafeRouteSegment | undefined;
  if (segment) {
    selectSegment(segment);
    isSegmentModalOpen.value = true;
  }
};

onMounted(() => {
  loadHazardSegments();
});
</script>

<template>
  <div class="safe-nav-page min-h-screen bg-white pb-24" :class="{ 'modal-open': isSegmentModalOpen }">
    <main class="mx-auto flex max-w-5xl flex-col gap-4 px-4 pt-6">
      <!--  輸入區 -->
      <section class="rounded-2xl border border-grey-100 px-4 py-4 shadow-sm">
        <div class="space-y-5">
          <div>
            <label class="flex items-center gap-3 rounded-xl border border-grey-200 px-4 py-3">
              <span class="text-2xl text-primary-500">📍</span>
              <div class="flex w-full items-center gap-3">
                <Input
                  v-model="origin"
                  placeholder="輸入出發點"
                  class="w-full border-0 bg-transparent p-0 text-base text-grey-900 focus:ring-0"
                />
                <button
                  type="button"
                  class="marker-btn"
                  :disabled="isOriginGeocoding"
                  @click="applyMarkerFromInput('origin')"
                >
                  {{ isOriginGeocoding ? '定位中' : '標記' }}
                </button>
              </div>
            </label>
            <p class="marker-hint">{{ originMarkerHint }}</p>
          </div>
          <div>
            <label class="flex items-center gap-3 rounded-xl border border-grey-200 px-4 py-3">
              <span class="text-2xl text-primary-500">🎯</span>
              <div class="flex w-full items-center gap-3">
                <Input
                  v-model="destination"
                  placeholder="輸入目的地"
                  class="w-full border-0 bg-transparent p-0 text-base text-grey-900 focus:ring-0"
                />
                <button
                  type="button"
                  class="marker-btn"
                  :disabled="isDestinationGeocoding"
                  @click="applyMarkerFromInput('destination')"
                >
                  {{ isDestinationGeocoding ? '定位中' : '標記' }}
                </button>
              </div>
            </label>
            <p class="marker-hint">{{ destinationMarkerHint }}</p>
          </div>
        </div>
      </section>

      <section class="segment-summary rounded-2xl border border-grey-100 px-4 py-4 shadow-sm">
        <div>
          <p class="segment-summary__eyebrow">避開高風速</p>
          <p class="segment-summary__title">
            {{
              selectedSegment
                ? selectedSegment.name
                : hazardCount
                  ? '安全路線規劃'
                  : '暫無高風險路段'
            }}
          </p>
          <p class="segment-summary__hint">{{ routeSummaryText }}</p>
          <p v-if="routeLabelChain" class="segment-summary__note">
            路線節點：{{ routeLabelChain }}
          </p>
          <p v-else-if="isSegmentLoading" class="segment-summary__note">高風險路段分析中...</p>
          <p v-else-if="segmentError" class="segment-summary__note text-rose-500">{{ segmentError }}</p>
          <p v-else-if="!hazardCount" class="segment-summary__note">目前沒有需要避開的風險路段</p>
          <p v-if="selectedSegment" class="segment-summary__note text-xs text-grey-500">
            {{ selectedSegment.note }}
          </p>
        </div>
        <button
          type="button"
          class="segment-summary__action"
          :disabled="isSegmentLoading && !hazardCount"
          @click="openSegmentModal"
        >
          {{ isSegmentLoading && !hazardCount ? '載入中' : '查看建議' }}
        </button>
      </section>

      <!-- 路線規劃地圖區 -->
      <section class="rounded-3xl border border-grey-100 shadow-lg overflow-hidden">
        <div class="map-embed map-embed--tall h-full min-h-[360px]">
          <GoogleMap
            :center="mapCenter"
            :markers="safeMapMarkers"
            :polylines="mapPolylines"
            :zoom="14"
            @marker-click="handleMarkerClick"
          />
          <div class="map-embed__badge">導航預覽</div>
          <div class="map-embed__actions">
            <button
              type="button"
              class="map-action-btn"
              :disabled="isLocating"
              @click="requestUserLocation"
            >
              {{ isLocating ? '定位中...' : '重新定位' }}
            </button>
            <button type="button" class="map-action-btn" @click="resetNavigation">
              清除輸入
            </button>
            <button
              type="button"
              class="map-action-btn"
              :disabled="!originCoords || !destinationCoords"
              @click="recomputeSafeRoute"
            >
              重新規劃
            </button>
            <button type="button" class="map-action-btn map-action-btn--primary" @click="openSafeMap">
              Google Maps
            </button>
          </div>
          <div class="absolute inset-x-4 top-4 rounded-2xl bg-white/95 p-4 shadow">
            <div v-if="selectedSegment">
              <p class="text-xs uppercase tracking-widest text-grey-500">已選路段</p>
              <h3 class="mt-1 text-lg font-bold text-primary-600">{{ selectedSegment.name }}</h3>
              <p v-if="selectedSegment.riskLevel" class="text-xs font-semibold text-rose-500">
                風險等級 {{ selectedSegment.riskLevel }}（數值越高代表風勢越強）
              </p>
              <p class="text-sm text-grey-600">
                {{ selectedSegment.direction }}，風速 {{ selectedSegment.windSpeed.toFixed(1) }} m/s
              </p>
              <p class="mt-1 text-xs text-grey-500">{{ selectedSegment.note }}</p>
            </div>
            <div v-else>
              <p class="text-sm font-semibold text-grey-800">{{ routeSummaryText }}</p>
              <p class="text-xs text-grey-500">
                {{
                  interferingSegments.length
                    ? `路線已自動避開 ${interferingSegments.length} 段風險路段`
                    : '地圖顯示建議路線，起終點已標記。'
                }}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section class="rounded-2xl border border-dashed border-primary-100 bg-white/90 px-4 py-4 shadow-sm">
        <p class="text-xs font-semibold uppercase tracking-[0.3em] text-grey-500">定位資訊</p>
        <p class="mt-1 text-sm text-grey-700">
          授權定位後可快速將導航路線聚焦於您的所在位置。
        </p>
        <div class="mt-3 rounded-xl border border-grey-100 bg-white/70 px-3 py-2 text-xs text-grey-600">
          <p class="font-semibold text-grey-800">目前鎖定：{{ locationLabel }}</p>
          <p v-if="locationError" class="mt-1 text-rose-500">{{ locationError }}</p>
          <p v-else class="mt-1 text-grey-400">若未跳出定位授權提示，請確認 App 已開啟 GPS 權限。</p>
        </div>
      </section>

      <!-- 功能按鈕區 -->
      <section class="grid grid-cols-2 gap-3">
        <Button
          outline
          class="w-full rounded-2xl border-2 border-primary-500 bg-white py-4 text-primary-500 shadow"
          @click="resetNavigation"
        >
          重新設定
        </Button>
        <Button
          class="w-full rounded-2xl bg-primary-500 py-4 text-white shadow"
          :class="{ 'opacity-60': !canNavigate }"
          :disabled="!canNavigate"
          @click="startNavigation"
        >
          開始導航
        </Button>
      </section>
    </main>

    <Transition name="segment-modal">
      <div v-if="isSegmentModalOpen" class="segment-modal__overlay" @click.self="closeSegmentModal">
        <section class="segment-modal__panel" @click.stop>
          <header class="segment-modal__header">
            <div>
              <p class="segment-modal__eyebrow">路線節點</p>
              <h3 class="segment-modal__title">依序檢視 ABCD 走向</h3>
            </div>
            <button type="button" class="segment-modal__close" @click="closeSegmentModal">✕</button>
          </header>
          <div class="segment-modal__body">
            <template v-if="!routeStepDetails.length">
              <p class="segment-modal__intro">尚未建立路線節點，請先選定出發點與目的地。</p>
            </template>
            <template v-else>
              <p class="segment-modal__intro">
                共 {{ routeStops.length }} 個節點。點擊即可定位至該段（例如 A → B）。
              </p>
              <button
                v-for="(step, index) in routeStepDetails"
                :key="step.id"
                class="segment-modal__item"
                :class="{ 'segment-modal__item--active': activeRouteStepIndex === index }"
                @click="focusRouteStep(index)"
              >
                <div class="segment-modal__item-head">
                  <div>
                    <p class="segment-modal__item-name">{{ step.label }}</p>
                    <p class="segment-modal__item-updated">
                      節點 {{ step.fromLabel }} → {{ step.toLabel }}
                    </p>
                  </div>
                  <div class="text-right">
                    <span class="segment-modal__item-speed">{{ formatDistance(step.distance) }}</span>
                    <p class="segment-modal__item-risk">
                      {{ interferingSegments.length ? '避風節點' : '標準節點' }}
                    </p>
                  </div>
                </div>
                <p class="segment-modal__item-note">
                  {{ step.fromLabel }}：{{ step.start.lat.toFixed(4) }}, {{ step.start.lng.toFixed(4) }}
                </p>
                <p class="segment-modal__item-note">
                  {{ step.toLabel }}：{{ step.end.lat.toFixed(4) }}, {{ step.end.lng.toFixed(4) }}
                </p>
              </button>
            </template>
            <p v-if="interferingSegments.length" class="segment-modal__footnote">
              已自動避開 {{ interferingSegments.length }} 段 Level 5 風險路段，路線節點已重新排列。
            </p>
          </div>
        </section>
      </div>
    </Transition>

    <BottomNav />
  </div>
</template>

<style scoped>
label input:focus {
  outline: none;
  box-shadow: none;
}

.safe-nav-page.modal-open {
  overflow: hidden;
}

.marker-btn {
  padding: 0.35rem 0.95rem;
  border-radius: 999px;
  font-size: 0.875rem;
  font-weight: 600;
  border: 1px solid #62a3a6;
  color: #fff;
  background: linear-gradient(90deg, #62a3a6, #7bc3c5);
  transition: opacity 0.2s ease;
  cursor: pointer;
}

.marker-btn:disabled {
  opacity: 0.6;
}

.marker-hint {
  margin-top: 0.35rem;
  padding-left: 2.5rem;
  font-size: 0.75rem;
  color: #6b7280;
}

.segment-summary {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1.25rem;
  background: #f3fbfb;
}

.segment-summary__eyebrow {
  font-size: 0.75rem;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: #94a3b8;
}

.segment-summary__title {
  margin-top: 0.25rem;
  font-size: 1.1rem;
  font-weight: 700;
  color: #0f172a;
}

.segment-summary__hint {
  margin-top: 0.35rem;
  font-size: 0.85rem;
  color: #475569;
}

.segment-summary__note {
  margin-top: 0.4rem;
  font-size: 0.8rem;
  color: #6b7280;
}

.segment-summary__action {
  align-self: center;
  padding: 0.65rem 1.4rem;
  border-radius: 999px;
  border: none;
  background: #62a3a6;
  color: #fff;
  font-weight: 600;
  font-size: 0.95rem;
  box-shadow: 0 8px 22px rgba(98, 163, 166, 0.25);
  cursor: pointer;
}

.segment-summary__action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  box-shadow: none;
}

.segment-modal__overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: flex-end;
  padding: 2rem 1rem 1rem;
  z-index: 90;
}

.segment-modal__panel {
  width: 100%;
  max-width: 32rem;
  background: #fff;
  border-radius: 24px 24px 0 0;
  box-shadow: 0 -12px 40px rgba(15, 23, 42, 0.25);
  max-height: calc(100vh - 5rem);
  display: flex;
  flex-direction: column;
}

.segment-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.2rem 1.5rem 0.5rem;
}

.segment-modal__eyebrow {
  font-size: 0.75rem;
  color: #64748b;
  letter-spacing: 0.35em;
  text-transform: uppercase;
}

.segment-modal__title {
  margin-top: 0.35rem;
  font-size: 1.15rem;
  font-weight: 700;
  color: #0f172a;
}

.segment-modal__close {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  border: 1px solid #e5e7eb;
  background: #fff;
  font-size: 1.1rem;
  display: grid;
  place-items: center;
  color: #475569;
  cursor: pointer;
}

.segment-modal__body {
  padding: 0.5rem 1.5rem 1.5rem;
  overflow-y: auto;
  max-height: calc(100vh - 10rem);
}

.segment-modal__intro {
  font-size: 0.85rem;
  color: #475569;
  margin-bottom: 0.75rem;
}

.segment-modal__intro--error {
  color: #dc2626;
}

.segment-modal__item {
  width: 100%;
  text-align: left;
  border: 1px solid #e2e8f0;
  border-radius: 1.25rem;
  padding: 0.85rem 1rem;
  background: #fff;
  transition: border 0.2s ease, background 0.2s ease;
  display: block;
  margin-bottom: 0.75rem;
  cursor: pointer;
}

.segment-modal__item:last-child {
  margin-bottom: 0;
}

.segment-modal__item--active {
  border-color: #62a3a6;
  background: #e6f1f2;
}

.segment-modal__item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.segment-modal__item-name {
  font-size: 0.95rem;
  font-weight: 600;
  color: #0f172a;
}

.segment-modal__item-speed {
  font-size: 0.85rem;
  font-weight: 600;
  color: #047857;
}

.segment-modal__item-note {
  margin-top: 0.5rem;
  font-size: 0.8rem;
  color: #475569;
}

.segment-modal__item-updated {
  margin-top: 0.15rem;
  font-size: 0.7rem;
  color: #94a3b8;
}

.segment-modal__item-risk {
  margin-top: 0.15rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: #475569;
}

.segment-modal__footnote {
  margin-top: 0.75rem;
  font-size: 0.75rem;
  color: #475569;
}

.segment-modal-enter-active,
.segment-modal-leave-active {
  transition: opacity 0.2s ease;
}

.segment-modal-enter-from,
.segment-modal-leave-to {
  opacity: 0;
}
</style>
