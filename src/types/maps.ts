export interface LatLng {
  lat: number;
  lng: number;
}

export interface MapMarkerDescriptor {
  id: string;
  position: LatLng;
  color?: string;
  label?: string;
  zIndex?: number;
  meta?: Record<string, unknown>;
}

export interface MapPolylineDescriptor {
  id: string;
  path: LatLng[];
  color?: string;
  weight?: number;
  opacity?: number;
  zIndex?: number;
  dashed?: boolean;
  dashSpacing?: string;
}
