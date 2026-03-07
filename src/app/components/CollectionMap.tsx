import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import type { Collection, CollectionPoint } from '../mockData.ts';

type LatLngTuple = [number, number];

interface CollectionMapProps {
  points: CollectionPoint[];
  collections?: Collection[];
  userLocation?: { lat: number; lng: number } | null;
  heightClassName?: string;
}

const openDirections = (lat: number, lng: number) => {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  window.open(url, '_blank', 'noopener,noreferrer');
};

export default function CollectionMap({
  points,
  collections = [],
  userLocation = null,
  heightClassName = 'h-[420px]',
}: CollectionMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  const coordinates = useMemo<LatLngTuple[]>(() => {
    const pointCoordinates: LatLngTuple[] = points
      .filter((point) => Number.isFinite(point.coordinates?.lat) && Number.isFinite(point.coordinates?.lng))
      .map((point) => [point.coordinates.lat, point.coordinates.lng]);

    const collectionCoordinates: LatLngTuple[] = collections
      .filter((collection) => Number.isFinite(collection.coordinates?.lat) && Number.isFinite(collection.coordinates?.lng))
      .map((collection) => [collection.coordinates.lat, collection.coordinates.lng]);

    const userCoordinates = userLocation ? [[userLocation.lat, userLocation.lng] as LatLngTuple] : [];

    return [...pointCoordinates, ...collectionCoordinates, ...userCoordinates];
  }, [points, collections, userLocation]);

  const defaultCenter: LatLngTuple = coordinates[0] || [15.5042, -88.0250];

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: defaultCenter,
      zoom: 10,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    mapRef.current = map;
    layerGroupRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, [defaultCenter]);

  useEffect(() => {
    const map = mapRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    points.forEach((point) => {
      const loadPercentage = (point.currentLoad / point.capacity) * 100;
      const markerColor = loadPercentage >= 90 ? '#dc2626' : loadPercentage >= 70 ? '#f59e0b' : '#16a34a';

      const marker = L.circleMarker([point.coordinates.lat, point.coordinates.lng], {
        radius: 10,
        color: markerColor,
        fillColor: markerColor,
        fillOpacity: 0.8,
        weight: 2,
      });

      marker.bindPopup(
        `<div style="font-size:12px;line-height:1.4">
          <strong>${point.name}</strong><br/>
          ${point.address}<br/>
          Capacidad usada: ${loadPercentage.toFixed(0)}%
        </div>`,
      );

      marker.on('click', () => openDirections(point.coordinates.lat, point.coordinates.lng));
      marker.addTo(layerGroup);
    });

    collections.forEach((collection) => {
      const marker = L.circleMarker([collection.coordinates.lat, collection.coordinates.lng], {
        radius: 8,
        color: '#2563eb',
        fillColor: '#2563eb',
        fillOpacity: 0.6,
        weight: 2,
      });

      marker.bindPopup(
        `<div style="font-size:12px;line-height:1.4">
          <strong>Solicitud ${collection.id.slice(0, 8)}</strong><br/>
          ${collection.tireType} - ${collection.tireCount} llantas<br/>
          Estado: ${collection.status}
        </div>`,
      );

      marker.addTo(layerGroup);
    });

    if (userLocation) {
      L.circleMarker([userLocation.lat, userLocation.lng], {
        radius: 9,
        color: '#111827',
        fillColor: '#111827',
        fillOpacity: 0.8,
        weight: 2,
      })
        .bindPopup('<strong>Tu ubicacion</strong>')
        .addTo(layerGroup);
    }

    if (coordinates.length > 1) {
      map.fitBounds(coordinates, { padding: [48, 48], maxZoom: 12 });
    } else if (coordinates.length === 1) {
      map.setView(coordinates[0], 11);
    }
  }, [points, collections, userLocation, coordinates]);

  return (
    <div className={`relative overflow-hidden rounded-2xl border bg-white ${heightClassName}`}>
      <div ref={mapContainerRef} className="h-full w-full" />
    </div>
  );
}
