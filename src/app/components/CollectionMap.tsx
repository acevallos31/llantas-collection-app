import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import type { Collection, CollectionPoint } from '../mockData.ts';

type LatLngTuple = [number, number];

interface CollectionMapProps {
  points: CollectionPoint[];
  collections?: Collection[];
  userLocation?: { lat: number; lng: number } | null;
  collectorLocation?: { lat: number; lng: number; collectorName?: string } | null;
  heightClassName?: string;
  showRouteTrace?: boolean;
}

const openDirections = (lat: number, lng: number) => {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  window.open(url, '_blank', 'noopener,noreferrer');
};

export default function CollectionMap({
  points,
  collections = [],
  userLocation = null,
  collectorLocation = null,
  heightClassName = 'h-[420px]',
  showRouteTrace = false,
}: CollectionMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const isUnmountingRef = useRef(false);

  const coordinates = useMemo<LatLngTuple[]>(() => {
    const pointCoordinates: LatLngTuple[] = points
      .filter((point) => Number.isFinite(point.coordinates?.lat) && Number.isFinite(point.coordinates?.lng))
      .map((point) => [point.coordinates.lat, point.coordinates.lng]);

    const collectionCoordinates: LatLngTuple[] = collections
      .filter((collection) => Number.isFinite(collection.coordinates?.lat) && Number.isFinite(collection.coordinates?.lng))
      .map((collection) => [collection.coordinates.lat, collection.coordinates.lng]);

    const userCoordinates = userLocation ? [[userLocation.lat, userLocation.lng] as LatLngTuple] : [];
    const collectorCoordinates = collectorLocation ? [[collectorLocation.lat, collectorLocation.lng] as LatLngTuple] : [];

    return [...pointCoordinates, ...collectionCoordinates, ...userCoordinates, ...collectorCoordinates];
  }, [points, collections, userLocation, collectorLocation]);

  const defaultCenter: LatLngTuple = coordinates[0] || [15.5042, -88.0250];

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    isUnmountingRef.current = false;

    const map = L.map(mapContainerRef.current, {
      center: defaultCenter,
      zoom: 10,
      zoomControl: true,
      // Prevent zoom-transition race conditions when the map unmounts.
      zoomAnimation: false,
      fadeAnimation: false,
      markerZoomAnimation: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    mapRef.current = map;
    layerGroupRef.current = L.layerGroup().addTo(map);

    return () => {
      isUnmountingRef.current = true;
      map.off();
      // stop() prevents pending animations from firing transition callbacks after unmount.
      map.stop();
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, [defaultCenter]);

  useEffect(() => {
    const map = mapRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup || isUnmountingRef.current) return;

    const mapPane = (map as unknown as { _mapPane?: HTMLElement })._mapPane;
    if (!mapPane?.isConnected) return;

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

    const validCollections = collections.filter(
      (collection) => Number.isFinite(collection.coordinates?.lat) && Number.isFinite(collection.coordinates?.lng),
    );

    validCollections.forEach((collection) => {
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

    if (collectorLocation) {
      const collectorMarker = L.circleMarker([collectorLocation.lat, collectorLocation.lng], {
        radius: 10,
        color: '#f97316',
        fillColor: '#f97316',
        fillOpacity: 0.9,
        weight: 3,
      });

      collectorMarker.bindPopup(
        `<div style="font-size:12px;line-height:1.4">
          <strong>🚚 ${collectorLocation.collectorName || 'Recolector'}</strong><br/>
          Ubicación en tiempo real
        </div>`,
      );

      collectorMarker.addTo(layerGroup);

      // Add a pulsing animation marker using divIcon
      const pulsingMarker = L.marker([collectorLocation.lat, collectorLocation.lng], {
        icon: L.divIcon({
          className: 'pulsing-collector-marker',
          html: `<div style="
            position: relative;
            width: 20px;
            height: 20px;
          ">
            <div style="
              position: absolute;
              width: 100%;
              height: 100%;
              border-radius: 50%;
              background-color: rgba(249, 115, 22, 0.4);
              animation: pulse 2s infinite;
            "></div>
            <div style="
              position: absolute;
              width: 100%;
              height: 100%;
              border-radius: 50%;
              background-color: #f97316;
            "></div>
            <style>
              @keyframes pulse {
                0% {
                  transform: scale(1);
                  opacity: 1;
                }
                100% {
                  transform: scale(2.5);
                  opacity: 0;
                }
              }
            </style>
          </div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        }),
      });

      pulsingMarker.addTo(layerGroup);
    }

    // Draw route trace if enabled
    if (showRouteTrace && userLocation && validCollections.length > 0) {
      const routePoints: LatLngTuple[] = [[userLocation.lat, userLocation.lng]];
      
      // Add all collection points in order
      validCollections.forEach((collection) => {
        if (Number.isFinite(collection.coordinates?.lat) && Number.isFinite(collection.coordinates?.lng)) {
          routePoints.push([collection.coordinates.lat, collection.coordinates.lng]);
        }
      });

      // Draw polyline connecting all points
      if (routePoints.length > 1) {
        const polyline = L.polyline(routePoints, {
          color: '#2563eb',
          weight: 3,
          opacity: 0.7,
          dashArray: '10, 5',
        });

        polyline.bindPopup(
          `<div style="font-size:12px;line-height:1.4">
            <strong>Ruta sugerida</strong><br/>
            ${validCollections.length} parada${validCollections.length > 1 ? 's' : ''}
          </div>`,
        );

        polyline.addTo(layerGroup);

        // Add numbered markers for each stop
        validCollections.forEach((collection, index) => {
          const numberMarker = L.marker([collection.coordinates.lat, collection.coordinates.lng], {
            icon: L.divIcon({
              className: 'custom-number-marker',
              html: `<div style="
                background-color: #2563eb;
                color: white;
                border-radius: 50%;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                font-size: 12px;
                border: 2px solid white;
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
              ">${index + 1}</div>`,
              iconSize: [24, 24],
              iconAnchor: [12, 12],
            }),
          });

          numberMarker.bindPopup(
            `<div style="font-size:12px;line-height:1.4">
              <strong>Parada ${index + 1}</strong><br/>
              ${collection.tireType} - ${collection.tireCount} llantas<br/>
              ${collection.address}
            </div>`,
          );

          numberMarker.addTo(layerGroup);
        });
      }
    }

    try {
      if (coordinates.length > 1) {
        map.fitBounds(coordinates, { padding: [48, 48], maxZoom: 12 });
      } else if (coordinates.length === 1) {
        map.setView(coordinates[0], 11);
      }
    } catch {
      // Ignore transient map lifecycle errors during route changes.
    }
  }, [points, collections, userLocation, collectorLocation, coordinates, showRouteTrace]);

  return (
    <div className={`relative overflow-hidden rounded-2xl border bg-white ${heightClassName}`}>
      <div ref={mapContainerRef} className="h-full w-full" />
    </div>
  );
}
