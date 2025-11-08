<template>
  <div ref="mapRef" class="google-map"></div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import type { PropType } from 'vue';
import { loadGoogleMaps } from '@/composables/useGoogleMapsLoader';
import type { LatLng, MapMarkerDescriptor, MapPolylineDescriptor } from '@/types/maps';

const emit = defineEmits<{
  (e: 'marker-click', marker: MapMarkerDescriptor): void;
}>();

const props = defineProps({
  center: {
    type: Object as PropType<LatLng | null>,
    default: null
  },
  zoom: {
    type: Number,
    default: 15
  },
  markers: {
    type: Array as PropType<MapMarkerDescriptor[]>,
    default: () => []
  },
  polylines: {
    type: Array as PropType<MapPolylineDescriptor[]>,
    default: () => []
  },
  mapOptions: {
    type: Object as PropType<google.maps.MapOptions>,
    default: () => ({})
  },
  mapId: {
    type: String,
    default: (import.meta.env.VITE_GOOGLE_MAP_ID as string | undefined) ?? 'DEMO_MAP_ID'
  }
});

const mapRef = ref<HTMLDivElement | null>(null);
type MarkerHandle = {
  marker: google.maps.marker.AdvancedMarkerElement | google.maps.Marker;
  cleanup?: () => void;
};

const mapInstance = shallowRef<google.maps.Map | null>(null);
const markerRegistry = new Map<string, MarkerHandle>();
const polylineRegistry = new Map<string, google.maps.Polyline>();
let googleInstance: typeof google | null = null;

const toLiteral = (value: LatLng): google.maps.LatLngLiteral => ({ lat: value.lat, lng: value.lng });

const buildMarkerContent = (descriptor: MapMarkerDescriptor): HTMLElement => {
  const labelText = descriptor.label;
  if (googleInstance?.maps.marker?.PinElement) {
    const pin = new googleInstance.maps.marker.PinElement({
      background: descriptor.color ?? '#2563eb',
      borderColor: '#ffffff',
      glyphColor: '#ffffff',
      scale: 1
    });
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    wrapper.style.display = 'inline-flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.justifyContent = 'center';
    wrapper.style.flexDirection = 'column';
    wrapper.appendChild(pin.element);

    if (labelText) {
      const label = document.createElement('span');
      label.textContent = labelText;
      label.style.position = 'absolute';
      label.style.bottom = 'calc(100% + 6px)';
      label.style.left = '50%';
      label.style.transform = 'translateX(-50%)';
      label.style.background = 'rgba(255,255,255,0.94)';
      label.style.color = '#111';
      label.style.fontSize = '11px';
      label.style.fontWeight = '600';
      label.style.padding = '2px 10px';
      label.style.borderRadius = '999px';
      label.style.boxShadow = '0 6px 18px rgba(0, 0, 0, 0.12)';
      wrapper.appendChild(label);
    }

    return wrapper;
  }

  const wrapper = document.createElement('div');
  wrapper.style.position = 'relative';
  wrapper.style.display = 'inline-flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.alignItems = 'center';
  wrapper.style.transform = 'translate(-50%, -100%)';

  const pin = document.createElement('div');
  pin.style.width = '18px';
  pin.style.height = '18px';
  pin.style.borderRadius = '50%';
  pin.style.background = descriptor.color ?? '#2563eb';
  pin.style.boxShadow = '0 6px 18px rgba(0,0,0,0.25)';
  pin.style.border = '2px solid #fff';
  wrapper.appendChild(pin);

  if (labelText) {
    const label = document.createElement('span');
    label.textContent = labelText;
    label.style.marginTop = '4px';
    label.style.background = 'rgba(255,255,255,0.94)';
    label.style.color = '#111';
    label.style.fontSize = '11px';
    label.style.fontWeight = '600';
    label.style.padding = '2px 10px';
    label.style.borderRadius = '999px';
    label.style.boxShadow = '0 6px 18px rgba(0, 0, 0, 0.12)';
    wrapper.appendChild(label);
  }

  return wrapper;
};

const initMap = async () => {
  if (!mapRef.value) return;
  try {
    googleInstance = await loadGoogleMaps(props.mapId);
    mapInstance.value = new googleInstance.maps.Map(mapRef.value, {
      center: toLiteral(props.center ?? { lat: 25.033964, lng: 121.564468 }),
      zoom: props.zoom,
      disableDefaultUI: true,
      gestureHandling: 'greedy',
      ...(props.mapId ? { mapId: props.mapId } : {}),
      ...props.mapOptions
    });
    syncMarkers();
    syncPolylines();
  } catch (error) {
    console.warn('[GoogleMap] 無法初始化地圖', error);
  }
};

const isAdvancedMarker = (
  marker: google.maps.marker.AdvancedMarkerElement | google.maps.Marker
): marker is google.maps.marker.AdvancedMarkerElement =>
  Boolean(googleInstance?.maps?.marker?.AdvancedMarkerElement) &&
  marker instanceof googleInstance!.maps.marker.AdvancedMarkerElement;

const detachMarker = (handle: MarkerHandle) => {
  handle.cleanup?.();
  if (isAdvancedMarker(handle.marker)) {
    handle.marker.map = null;
  } else {
    handle.marker.setMap(null);
  }
};

const createMarker = (descriptor: MapMarkerDescriptor): MarkerHandle => {
  const googleMaps = googleInstance!;
  if (props.mapId && googleMaps.maps.marker?.AdvancedMarkerElement) {
    const marker = new googleMaps.maps.marker.AdvancedMarkerElement({
      position: toLiteral(descriptor.position),
      map: mapInstance.value!,
      zIndex: descriptor.zIndex,
      content: buildMarkerContent(descriptor)
    });
    const handleClick = () => emit('marker-click', descriptor);
    marker.element?.addEventListener('click', handleClick);
    return {
      marker,
      cleanup: () => marker.element?.removeEventListener('click', handleClick)
    };
  }
  const marker = new googleMaps.maps.Marker({
    position: toLiteral(descriptor.position),
    map: mapInstance.value!,
    zIndex: descriptor.zIndex,
    icon: descriptor.color
      ? {
          path: googleMaps.maps.SymbolPath.CIRCLE,
          fillColor: descriptor.color,
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          scale: 8
        }
      : undefined,
    label: descriptor.label
      ? {
          text: descriptor.label,
          color: '#0f172a',
          fontSize: '10px',
          fontWeight: '600'
        }
      : undefined
  });
  const listener = marker.addListener('click', () => emit('marker-click', descriptor));
  return { marker, cleanup: () => listener.remove() };
};

const updateMarkerAppearance = (handle: MarkerHandle, descriptor: MapMarkerDescriptor) => {
  handle.cleanup?.();
  if (isAdvancedMarker(handle.marker)) {
    const advMarker = handle.marker;
    advMarker.position = toLiteral(descriptor.position);
    if (typeof descriptor.zIndex === 'number') {
      advMarker.zIndex = descriptor.zIndex;
    }
    advMarker.content = buildMarkerContent(descriptor);
    const clickListener = () => emit('marker-click', descriptor);
    advMarker.element?.addEventListener('click', clickListener);
    handle.cleanup = () => advMarker.element?.removeEventListener('click', clickListener);
    return;
  }
  const basicMarker = handle.marker;
  basicMarker.setPosition(toLiteral(descriptor.position));
  if (typeof descriptor.zIndex === 'number') {
    basicMarker.setZIndex(descriptor.zIndex);
  }
  if (descriptor.color) {
    basicMarker.setIcon({
      path: googleInstance!.maps.SymbolPath.CIRCLE,
      fillColor: descriptor.color,
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 2,
      scale: 8
    });
  } else {
    basicMarker.setIcon(undefined);
  }
  if (descriptor.label) {
    basicMarker.setLabel({
      text: descriptor.label,
      color: '#0f172a',
      fontSize: '10px',
      fontWeight: '600'
    });
  } else {
    basicMarker.setLabel(undefined);
  }
  const listener = basicMarker.addListener('click', () => emit('marker-click', descriptor));
  handle.cleanup = () => listener.remove();
};

const syncMarkers = () => {
  if (!googleInstance || !mapInstance.value) {
    return;
  }
  const nextIds = new Set(props.markers.map(marker => marker.id));
  markerRegistry.forEach((handle, id) => {
    if (!nextIds.has(id)) {
      detachMarker(handle);
      markerRegistry.delete(id);
    }
  });

  props.markers.forEach((markerDescriptor) => {
    const existing = markerRegistry.get(markerDescriptor.id);
    if (existing) {
      updateMarkerAppearance(existing, markerDescriptor);
      return;
    }
    const handle = createMarker(markerDescriptor);
    markerRegistry.set(markerDescriptor.id, handle);
  });
};

watch(
  () => props.markers,
  () => {
    syncMarkers();
  },
  { deep: true }
);

watch(
  () => props.center,
  (center) => {
    if (center && mapInstance.value) {
      mapInstance.value.panTo(toLiteral(center));
    }
  }
);

watch(
  () => props.zoom,
  (zoom) => {
    if (mapInstance.value && typeof zoom === 'number') {
      mapInstance.value.setZoom(zoom);
    }
  }
);

onMounted(() => {
  initMap();
});

const buildPolylineOptions = (
  descriptor: MapPolylineDescriptor
): google.maps.PolylineOptions => {
  const options: google.maps.PolylineOptions = {
    path: descriptor.path.map(toLiteral),
    map: mapInstance.value!,
    strokeColor: descriptor.color ?? '#2563eb',
    strokeOpacity: descriptor.opacity ?? (descriptor.dashed ? 0 : 0.85),
    strokeWeight: descriptor.weight ?? 4,
    zIndex: descriptor.zIndex
  };
  if (descriptor.dashed) {
    const color = descriptor.color ?? '#2563eb';
    options.icons = [
      {
        icon: {
          path: 'M 0,-1 0,1',
          strokeOpacity: descriptor.opacity ?? 1,
          strokeWeight: descriptor.weight ?? 4,
          strokeColor: color,
          scale: 1
        },
        offset: '0',
        repeat: descriptor.dashSpacing ?? '16px'
      }
    ];
  }
  return options;
};

const createPolyline = (descriptor: MapPolylineDescriptor): google.maps.Polyline => {
  const googleMaps = googleInstance!;
  return new googleMaps.maps.Polyline(buildPolylineOptions(descriptor));
};

const updatePolyline = (
  polyline: google.maps.Polyline,
  descriptor: MapPolylineDescriptor
) => {
  polyline.setOptions(buildPolylineOptions(descriptor));
};

const detachPolyline = (polyline: google.maps.Polyline) => {
  polyline.setMap(null);
};

const syncPolylines = () => {
  if (!googleInstance || !mapInstance.value) {
    return;
  }
  const nextIds = new Set(props.polylines.map((polyline) => polyline.id));
  polylineRegistry.forEach((polyline, id) => {
    if (!nextIds.has(id)) {
      detachPolyline(polyline);
      polylineRegistry.delete(id);
    }
  });

  props.polylines.forEach((descriptor) => {
    const existing = polylineRegistry.get(descriptor.id);
    if (existing) {
      updatePolyline(existing, descriptor);
      return;
    }
    const polyline = createPolyline(descriptor);
    polylineRegistry.set(descriptor.id, polyline);
  });
};

watch(
  () => props.polylines,
  () => {
    syncPolylines();
  },
  { deep: true }
);

onBeforeUnmount(() => {
  markerRegistry.forEach(detachMarker);
  markerRegistry.clear();
  polylineRegistry.forEach(detachPolyline);
  polylineRegistry.clear();
});
</script>

<style scoped>
.google-map {
  position: absolute;
  inset: 0;
}
</style>
