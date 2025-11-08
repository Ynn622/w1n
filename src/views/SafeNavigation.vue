<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import BottomNav from '@/components/BottomNav.vue';
import Input from '@/components/base/Input.vue';
import Button from '@/components/base/Button.vue';
import GoogleMap from '@/components/common/GoogleMap.vue';
import { fetchRoadRiskSegments, geocodeAddress, getSafeNavigationData, reverseGeocode } from '@/utils/api';
import { loadGoogleMaps } from '@/composables/useGoogleMapsLoader';
import type { SafeRouteSegment } from '@/utils/api';
import type { LatLng, MapMarkerDescriptor, MapPolylineDescriptor } from '@/types/maps';

const { defaultStart, mapEmbedUrl } = getSafeNavigationData();

const DEBUG_SAFE_NAV = true;
const logSafeNav = (...messages: unknown[]) => {
  if (DEBUG_SAFE_NAV) {
    console.info('[SafeNavigation]', ...messages);
  }
};

const origin = ref('定位中...');
const destination = ref('');
const originCoords = ref<LatLng | null>(null);
const destinationCoords = ref<LatLng | null>(null);
const selectedSegment = ref<SafeRouteSegment | null>(null);
const defaultSafeCenter: LatLng = { lat: 25.0375198, lng: 121.5636796 };
const userCoords = ref<LatLng | null>(null);
const mapCenter = ref<LatLng>(defaultSafeCenter);
const isLocating = ref(false);
const locationError = ref<string | null>(null);
const canUseGeolocation = typeof window !== 'undefined' && 'geolocation' in navigator;
const isDestinationGeocoding = ref(false);
const originMarkerHint = ref('定位中...');
const destinationMarkerHint = ref('尚未設定目的地');
const isSegmentModalOpen = ref(false);
const isSegmentLoading = ref(false);
const segmentError = ref<string | null>(null);
const hazardSegments = ref<SafeRouteSegment[]>([]);
const destinationInputRef = ref<InstanceType<typeof Input> | null>(null);
const destinationAutocomplete = shallowRef<google.maps.places.Autocomplete | null>(null);
let destinationAutocompleteListener: google.maps.MapsEventListener | null = null;
const hasAutoLocatedOrigin = ref(false);
const fallbackOriginLabel = defaultStart;
const showHazardMarkers = ref(false);
const visibleHazardSegments = computed(() => {
  const point = destinationCoords.value ?? mapCenter.value ?? defaultSafeCenter;
  const radiusMeters = 2500;
  return hazardSegments.value.filter((segment) => {
    if (!segment.start || !segment.end) {
      return false;
    }
    const distStart = haversineDistanceMeters(point, segment.start);
    const distEnd = haversineDistanceMeters(point, segment.end);
    return Math.min(distStart, distEnd) <= radiusMeters;
  });
});
const hazardCount = computed(() => visibleHazardSegments.value.length);
const safeRoutePath = ref<LatLng[]>([]);
const routeWaypoints = ref<LatLng[]>([]);
const interferingSegments = ref<SafeRouteSegment[]>([]);
const isRoutePlanning = ref(false);
const routeError = ref<string | null>(null);
let googleMapsApi: typeof google | null = null;
let directionsService: google.maps.DirectionsService | null = null;
let routeTaskId = 0;
const routeLegPaths = ref<LatLng[][]>([]);
let originGeocodeTaskId = 0;

const EARTH_RADIUS = 6371000; // meters
const RISK_BUFFER_METERS = 350;
const MAX_DETOUR_WAYPOINTS = 8;
const SCOOTER_TRAVEL_MODE = 'driving';
const SCOOTER_MODE_PARAM = 'two_wheeler';
const SCOOTER_DIR_FLAG = 'm';
const HAZARD_INTERSECTION_THRESHOLD = 120;
const MAX_ROUTE_ADJUSTMENTS = 3;
const MAX_AUTO_DETOURS = 4;
const baseMapStyles: google.maps.MapTypeStyle[] = [
  {
    featureType: 'transit',
    stylers: [{ visibility: 'off' }]
  },
  {
    featureType: 'poi.business',
    stylers: [{ visibility: 'off' }]
  }
];

type RouteComputationResult = {
  overviewPath: LatLng[];
  legPaths: LatLng[][];
};

const canNavigate = computed(() => Boolean(origin.value && destination.value));
const mapOptions = computed<google.maps.MapOptions>(() => ({
  styles: baseMapStyles,
  fullscreenControl: false,
  streetViewControl: false,
  mapTypeControl: false
}));
const hasDestination = computed(() => Boolean(destinationCoords.value));

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

const buildDetourPoints = (segment: SafeRouteSegment): LatLng[] => {
  if (!segment.start || !segment.end) {
    return [];
  }
  const start = segment.start;
  const end = segment.end;
  const dirLat = end.lat - start.lat;
  const dirLng = end.lng - start.lng;
  const baseLength = Math.hypot(dirLat, dirLng) || 1;
  const segmentMeters = haversineDistanceMeters(start, end);
  const offsetMagnitude = 0.0008 + Math.min(segmentMeters / 100000, 0.0025);
  const fractions = segmentMeters > 150 ? [0.25, 0.5, 0.75] : [0.5];
  return fractions.map((fraction, index) => {
    const basePoint = {
      lat: start.lat + dirLat * fraction,
      lng: start.lng + dirLng * fraction
    };
    const orientation = index % 2 === 0 ? 1 : -1;
    return {
      lat: basePoint.lat + (-dirLng / baseLength) * offsetMagnitude * orientation,
      lng: basePoint.lng + (dirLat / baseLength) * offsetMagnitude * orientation
    };
  });
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

const formatCoordsLabel = (coords: LatLng) =>
  `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;

const updateDestinationFromCoords = (coords: LatLng, label?: string) => {
  destinationCoords.value = coords;
  mapCenter.value = coords;
  destinationMarkerHint.value = '目的地已設定';
  if (label) {
    destination.value = label;
  }
};

const updateOriginFromCoords = async (
  coords: LatLng,
  options: { forceLabel?: boolean } = {}
) => {
  originCoords.value = coords;
  mapCenter.value = coords;
  originMarkerHint.value = '定位成功';
  const shouldUpdateInput = options.forceLabel ?? true;
  if (!shouldUpdateInput) {
    return;
  }
  const geocodeId = ++originGeocodeTaskId;
  origin.value = '定位中...';
  try {
    const address = await reverseGeocode(coords.lat, coords.lng);
    if (originGeocodeTaskId === geocodeId) {
      origin.value = address;
    }
  } catch (error) {
    logSafeNav('reverseGeocode failed', error);
    if (originGeocodeTaskId === geocodeId) {
      origin.value = formatCoordsLabel(coords);
    }
  }
};

const handleDestinationPlaceSelection = (place: google.maps.places.PlaceResult) => {
  if (!place.geometry?.location) {
    logSafeNav('Place selection missing geometry', place);
    return;
  }
  const coords = {
    lat: place.geometry.location.lat(),
    lng: place.geometry.location.lng()
  };
  const label = place.formatted_address ?? place.name ?? formatCoordsLabel(coords);
  destination.value = label;
  updateDestinationFromCoords(coords, label);
};

const setupDestinationAutocomplete = async () => {
  if (destinationAutocomplete.value) {
    return;
  }
  const inputEl = destinationInputRef.value?.inputElement;
  if (!inputEl) {
    return;
  }
  const googleMaps = await loadGoogleMaps();
  if (!googleMaps.maps.places) {
    if (googleMaps.maps.importLibrary) {
      await googleMaps.maps.importLibrary('places');
    } else {
      throw new Error('Google Maps Places library unavailable.');
    }
  }
  const autocomplete = new googleMaps.maps.places.Autocomplete(inputEl, {
    fields: ['formatted_address', 'geometry', 'name'],
    types: ['geocode'],
    componentRestrictions: { country: ['tw'] }
  });
  const listener = autocomplete.addListener('place_changed', () => {
    handleDestinationPlaceSelection(autocomplete.getPlace());
  });
  destinationAutocomplete.value = autocomplete;
  destinationAutocompleteListener?.remove();
  destinationAutocompleteListener = listener;
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

const detectRouteHazards = (
  path: LatLng[],
  hazards: SafeRouteSegment[],
  threshold = HAZARD_INTERSECTION_THRESHOLD
): SafeRouteSegment[] => {
  if (path.length < 2 || !hazards.length) {
    return [];
  }
  const routeSegments: { start: LatLng; end: LatLng }[] = [];
  for (let i = 0; i < path.length - 1; i += 1) {
    routeSegments.push({ start: path[i], end: path[i + 1] });
  }
  return hazards.filter((hazard) => {
    if (!hazard.start || !hazard.end) {
      return false;
    }
    const hazardSegment = { start: hazard.start, end: hazard.end };
    return routeSegments.some((segment) => segmentDistanceMeters(segment, hazardSegment) <= threshold);
  });
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
    const nearbyHazards = visibleHazardSegments.value;
    let attempt = 0;
    let currentWaypoints: LatLng[] = [];
    let bestResult: RouteComputationResult | null = null;
    let intersections: SafeRouteSegment[] = [];

    const applyResult = (result: RouteComputationResult) => {
      safeRoutePath.value = result.overviewPath;
      routeLegPaths.value = result.legPaths.length
        ? result.legPaths
        : buildFallbackLegPaths([originCoords.value!, ...currentWaypoints, destinationCoords.value!]);
      activeRouteStepIndex.value = null;
      const pathMidpoint = safeRoutePath.value[Math.floor(safeRoutePath.value.length / 2)];
      if (pathMidpoint) {
        mapCenter.value = pathMidpoint;
      }
    };

    while (attempt < MAX_ROUTE_ADJUSTMENTS) {
      const result = await requestRoadAwareRoute(currentWaypoints);
      if (requestId !== routeTaskId) {
        return;
      }
      bestResult = result;
      intersections = detectRouteHazards(result.overviewPath, nearbyHazards);
      logSafeNav('Hazard detection', {
        attempt,
        intersections: intersections.map((item) => item.name)
      });
      if (!intersections.length) {
        routeError.value = null;
        routeWaypoints.value = currentWaypoints;
        interferingSegments.value = [];
        applyResult(result);
        return;
      }

      const newDetours = dedupeWaypoints(
        intersections
          .slice(0, MAX_AUTO_DETOURS)
          .flatMap((segment) => buildDetourPoints(segment))
      ).slice(0, MAX_AUTO_DETOURS);

      const combinedWaypoints = dedupeWaypoints([...currentWaypoints, ...newDetours]).slice(
        0,
        MAX_AUTO_DETOURS
      );

      if (combinedWaypoints.length === currentWaypoints.length) {
        logSafeNav('No new detours could be added, stopping iteration.');
        break;
      }
      currentWaypoints = combinedWaypoints;
      attempt += 1;
    }

    routeWaypoints.value = currentWaypoints;
    interferingSegments.value = intersections;
    if (bestResult) {
      applyResult(bestResult);
      routeError.value = intersections.length
        ? '部分路段仍與高風險區域接近，請留意行車。'
        : null;
    } else {
      throw new Error('無法取得安全路線');
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
    interferingSegments.value = [];
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
    if (destinationCoords.value) {
      void recomputeSafeRoute();
    } else {
      safeRoutePath.value = [];
      routeLegPaths.value = [];
      routeWaypoints.value = [];
      interferingSegments.value = [];
      routeError.value = null;
    }
  },
  { deep: true }
);

watch(
  () => destinationInputRef.value?.inputElement,
  (el) => {
    if (el) {
      void setupDestinationAutocomplete();
    }
  }
);

watch(
  () => destination.value,
  (value) => {
    if (!value.trim()) {
      destinationCoords.value = null;
      destinationMarkerHint.value = '尚未設定目的地';
      selectedSegment.value = null;
      safeRoutePath.value = [];
      routeLegPaths.value = [];
      routeWaypoints.value = [];
      interferingSegments.value = [];
      routeError.value = null;
    }
  }
);

watch(
  () => destinationCoords.value,
  (coords) => {
    if (!coords) {
      selectedSegment.value = null;
    }
  }
);

watch(
  () => visibleHazardSegments.value,
  (segments) => {
    if (!destinationCoords.value || !segments.length) {
      selectedSegment.value = null;
      return;
    }
    if (!selectedSegment.value || !segments.some((seg) => seg.id === selectedSegment.value?.id)) {
      selectedSegment.value = segments[0];
    }
  }
);

onBeforeUnmount(() => {
  destinationAutocompleteListener?.remove();
});

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
  destination.value = '';
  destinationCoords.value = null;
  destinationMarkerHint.value = '尚未設定目的地';
  selectedSegment.value = null;
  safeRoutePath.value = [];
  routeWaypoints.value = [];
  interferingSegments.value = [];
  routeError.value = null;
  if (!originCoords.value) {
    autoDetectOrigin();
  } else {
    mapCenter.value = originCoords.value;
  }
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
  visibleHazardSegments.value
    .filter((segment) => segment.start && segment.end)
    .map((segment, index) => ({
      id: `hazard-line-${segment.id ?? index}`,
      path: [segment.start!, segment.end!],
      color: '#EF4444',
      weight: 4,
      opacity: 0.95,
      zIndex: 25,
      dashed: true,
      dashSpacing: '12px'
    }))
);

const ROUTE_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const MAX_DISPLAY_STOPS = 3;

const hazardMarkers = computed<MapMarkerDescriptor[]>(() => {
  if (!showHazardMarkers.value) {
    return [];
  }
  return visibleHazardSegments.value
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
        color: '#EF4444',
        label: shortLabel,
        zIndex: 15,
        meta: { segment }
      };
    });
});

const routeStops = computed<LatLng[]>(() => {
  if (!originCoords.value || !destinationCoords.value) {
    return [];
  }
  return [originCoords.value, ...routeWaypoints.value, destinationCoords.value];
});

const displayStops = computed<LatLng[]>(() => {
  const stops = routeStops.value;
  if (stops.length <= MAX_DISPLAY_STOPS) {
    return stops;
  }
  const lastIndex = stops.length - 1;
  const midIndex = Math.floor(lastIndex / 2);
  return [stops[0], stops[midIndex], stops[lastIndex]];
});

const originStatusClass = computed(() => ({
  'planner-status-dot': true,
  'planner-status-dot--active': Boolean(originCoords.value)
}));

const destinationStatusClass = computed(() => ({
  'planner-status-dot': true,
  'planner-status-dot--active': Boolean(destinationCoords.value)
}));

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
  displayStops.value.map((point, index, arr) => {
    const label = ROUTE_LABELS[index] ?? `P${index + 1}`;
    const isDestination = index === arr.length - 1;
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
  const stops = displayStops.value;
  if (stops.length < 2) {
    return [];
  }
  return stops.slice(0, -1).map((start, index) => {
    const end = stops[index + 1];
    return {
      id: `route-step-${index}`,
      label: `${ROUTE_LABELS[index] ?? `P${index + 1}`} → ${
        ROUTE_LABELS[index + 1] ?? `P${index + 2}`
      }`,
      fromLabel: ROUTE_LABELS[index] ?? `P${index + 1}`,
      toLabel: ROUTE_LABELS[index + 1] ?? `P${index + 2}`,
      start,
      end,
      midpoint: computeMidpoint(start, end),
      distance: haversineDistanceMeters(start, end)
    };
  });
});

const activeRouteStepIndex = ref<number | null>(null);

const routeLabelChain = computed(() => {
  if (!displayStops.value.length) {
    return '';
  }
  const labels = displayStops.value.map((_, index) => ROUTE_LABELS[index] ?? `P${index + 1}`);
  if (labels.length <= MAX_DISPLAY_STOPS) {
    return labels.join(' → ');
  }
  const head = labels.slice(0, 2).join(' → ');
  const tail = labels.slice(-1).join(' → ');
  return `${head} → … → ${tail}`;
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

const editOriginManually = async () => {
  const manualInput = window.prompt('輸入新的出發點', origin.value || '');
  if (!manualInput) {
    return;
  }
  originMarkerHint.value = '定位中...';
  const coords = await geocodeAddress(manualInput.trim());
  if (!coords) {
    originMarkerHint.value = '找不到該位置，請重新輸入';
    return;
  }
  origin.value = manualInput;
  await updateOriginFromCoords(coords, { forceLabel: true });
};

const syncDestinationFromInput = async () => {
  const targetValue = destination.value.trim();
  if (!targetValue) {
    destinationMarkerHint.value = '請先輸入目的地';
    return;
  }
  isDestinationGeocoding.value = true;
  destinationMarkerHint.value = '定位中...';
  const coords = await geocodeAddress(targetValue);
  isDestinationGeocoding.value = false;
  if (!coords) {
    destinationMarkerHint.value = '找不到對應的地點，請重新輸入';
    return;
  }
  updateDestinationFromCoords(coords, targetValue);
};

const loadHazardSegments = async () => {
  isSegmentLoading.value = true;
  segmentError.value = null;
  try {
    const remoteSegments = await fetchRoadRiskSegments(5);
    if (remoteSegments.length) {
      hazardSegments.value = remoteSegments;
    }
  } catch (error) {
    segmentError.value =
      error instanceof Error ? error.message : '無法取得高風險路段資料';
  } finally {
    isSegmentLoading.value = false;
  }
};

const geolocationConfig: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 30000
};

const requestUserLocation = (
  options: { forceSyncOrigin?: boolean; markAutoOrigin?: boolean } = {}
) => {
  if (!canUseGeolocation || typeof navigator === 'undefined') {
    locationError.value = '此裝置不支援定位功能';
    if (!originCoords.value) {
      originCoords.value = defaultSafeCenter;
      origin.value = fallbackOriginLabel;
      originMarkerHint.value = '使用預設出發點';
    }
    return;
  }
  isLocating.value = true;
  locationError.value = null;
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const { latitude, longitude } = position.coords;
      const coords = { lat: latitude, lng: longitude };
      userCoords.value = coords;
      mapCenter.value = coords;
      if (options.markAutoOrigin) {
        hasAutoLocatedOrigin.value = true;
      }
      const shouldSyncOrigin = options.forceSyncOrigin ?? true;
      if (shouldSyncOrigin) {
        await updateOriginFromCoords(coords, { forceLabel: options.forceSyncOrigin });
      }
      isLocating.value = false;
    },
    (error) => {
      isLocating.value = false;
      if (options.markAutoOrigin) {
        hasAutoLocatedOrigin.value = true;
      }
      switch (error.code) {
        case error.PERMISSION_DENIED:
          locationError.value = '使用者拒絕定位授權';
          originMarkerHint.value = '需要授權才能定位';
          break;
        case error.POSITION_UNAVAILABLE:
          locationError.value = '定位資訊不可用';
          originMarkerHint.value = '定位資訊不可用';
          break;
        case error.TIMEOUT:
          locationError.value = '定位逾時，請重新嘗試';
          originMarkerHint.value = '定位逾時，請重試';
          break;
        default:
          locationError.value = '無法取得定位資訊';
          originMarkerHint.value = '定位失敗';
      }
      if (!originCoords.value) {
        originCoords.value = defaultSafeCenter;
        origin.value = fallbackOriginLabel;
        originMarkerHint.value = '使用預設出發點';
      }
    },
    geolocationConfig
  );
};

const autoDetectOrigin = () => {
  if (hasAutoLocatedOrigin.value || !canUseGeolocation) {
    return;
  }
  requestUserLocation({ forceSyncOrigin: true, markAutoOrigin: true });
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
  autoDetectOrigin();
});
</script>

<template>
  <div class="safe-nav-page min-h-screen bg-white pb-24" :class="{ 'modal-open': isSegmentModalOpen }">
    <main class="mx-auto flex max-w-5xl flex-col gap-4 px-4 pt-6">
      <!--  輸入區 -->
      <section class="planner-panel rounded-2xl border border-grey-100 px-4 py-4 shadow-sm">
        <div class="planner-origin-row">
          <div class="planner-origin-info">
            <div class="planner-label-row">
              <span :class="originStatusClass"></span>
              <p class="planner-label">出發點 · 目前位置</p>
            </div>
            <p class="planner-value">{{ origin || '定位中...' }}</p>
            <p class="planner-hint">{{ originMarkerHint }}</p>
          </div>
          <div class="planner-origin-actions">
            <button type="button" class="planner-icon-btn" @click="editOriginManually">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M4 17.25V20h2.75L17.81 8.94l-2.75-2.75L4 17.25Z"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
                <path
                  d="m15.75 6.19 1.5-1.5 2.75 2.75-1.5 1.5"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
            <button
              type="button"
              class="planner-icon-btn"
              :disabled="isLocating"
              @click="requestUserLocation({ forceSyncOrigin: true })"
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M21 4v6h-6"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
                <path
                  d="M3 20v-6h6"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
                <path
                  d="M20.49 15.63A8.5 8.5 0 1 1 18 7.34"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
        <div class="planner-destination-row">
          <span :class="destinationStatusClass"></span>
          <div class="flex planner-input-shell">
            <Input
              ref="destinationInputRef"
              v-model="destination"
              placeholder="搜尋目的地或貼上地址"
              class="flex planner-input"
            />
            <button
              type="button"
              class="flex planner-search-btn items-end justify-end"
              :disabled="isDestinationGeocoding"
              @click="syncDestinationFromInput"
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="11" cy="11" r="6" stroke="currentColor" stroke-width="1.8" />
                <path
                  d="M20 20L16.65 16.65"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </section>

      <section class="segment-summary rounded-2xl border border-grey-100 px-4 py-4 shadow-sm">
        <div>
          <p class="segment-summary__eyebrow">避開高風速</p>
          <p class="segment-summary__title">
            {{
              hasDestination
                ? selectedSegment
                  ? selectedSegment.name
                  : hazardCount
                    ? '尚未選取路段'
                    : '暫無高風險路段'
                : '輸入目的地以開始'
            }}
          </p>
          <p class="segment-summary__hint">
            {{ hasDestination ? routeSummaryText : '請先輸入目的地以規劃路線' }}
          </p>
          <p v-if="routeLabelChain && hasDestination" class="segment-summary__note">
            路線節點：{{ routeLabelChain }}
          </p>
          <p v-else-if="isSegmentLoading" class="segment-summary__note">高風險路段分析中...</p>
          <p v-else-if="segmentError" class="segment-summary__note text-rose-500">{{ segmentError }}</p>
          <p v-else-if="!hasDestination" class="segment-summary__note">目的地尚未設定</p>
          <p v-else-if="!hazardCount" class="segment-summary__note">目前沒有需要避開的風險路段</p>
          <p v-if="selectedSegment && hasDestination" class="segment-summary__note text-xs text-grey-500">
            {{ selectedSegment.note }}
          </p>
        </div>
        <button
          type="button"
          class="segment-summary__action"
          :disabled="!hasDestination || isSegmentLoading || !hazardCount"
          @click="openSegmentModal"
        >
          {{
            !hasDestination
              ? '等待目的地'
              : isSegmentLoading && !hazardCount
                ? '載入中'
                : '查看建議'
          }}
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
            :map-options="mapOptions"
            @marker-click="handleMarkerClick"
          />
          <div class="map-embed__actions">
            <button
              type="button"
              class="map-action-btn"
              :disabled="isLocating"
              @click="requestUserLocation({ forceSyncOrigin: true })"
            >
              {{ isLocating ? '定位中...' : '重新定位' }}
            </button>
            <button
              type="button"
              class="map-action-btn"
              @click="showHazardMarkers = !showHazardMarkers"
            >
              {{ showHazardMarkers ? '隱藏危險標記' : '顯示危險標記' }}
            </button>
          </div>

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
                共 {{ displayStops.length }} 個節點。點擊即可定位至該段（例如 A → B）。
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

.planner-panel {
  background: #fdfefe;
  box-shadow: 0 8px 30px rgba(15, 23, 42, 0.06);
}

.planner-origin-row,
.planner-destination-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border: 1px solid #e2e8f0;
  border-radius: 1rem;
  background: #fff;
}

.planner-origin-row {
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.planner-origin-info {
  flex: 1;
}

.planner-label {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: #94a3b8;
  margin-bottom: 0.15rem;
}

.planner-value {
  font-weight: 700;
  color: #0f172a;
  font-size: 0.95rem;
}

.planner-hint {
  margin-top: 0.2rem;
  font-size: 0.75rem;
  color: #6b7280;
}

.planner-origin-row .planner-hint {
  margin-top: 0.35rem;
}

.planner-origin-actions {
  display: flex;
  gap: 0.4rem;
}

.planner-icon-btn {
  width: 42px;
  height: 42px;
  border-radius: 999px;
  border: 1px solid #cbd5f5;
  background: #f8fafc;
  display: grid;
  place-items: center;
  color: #0f172a;
}

.planner-icon-btn:disabled {
  opacity: 0.5;
}

.planner-icon-btn svg {
  width: 20px;
  height: 20px;
}

.planner-destination-row {
  background: #f8fafc;
}

.planner-label-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.planner-status-dot {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: #cbd5f5;
  border: 2px solid #e2e8f0;
  display: inline-block;
  transition: background 0.2s ease, box-shadow 0.2s ease;
}

.planner-status-dot--active {
  background: #22c55e;
  border-color: #d1fae5;
  box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.12);
}

.planner-input-shell {
  flex: 1;
  display: flex;
  align-items: center;
  border-bottom: 2px solid #e2e8f0;
  padding-left: 0.5rem;
  position: relative;
}

.planner-input {
  border: none;
  background: transparent;
  padding: 0.65rem 0.5rem;
  font-size: 1rem;
}

.planner-input:focus-visible {
  outline: none;
}

.planner-search-btn {
  width: 44px;
  height: 44px;
  border-radius: 999px;
  border: none;
  background: transparent;
  display: grid;
  place-items: center;
  color: #0f172a;
  margin-left: auto;
}

.planner-search-btn svg {
  width: 20px;
  height: 20px;
}

.planner-search-btn:disabled {
  opacity: 0.4;
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
