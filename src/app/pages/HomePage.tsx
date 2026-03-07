import { useState, useEffect } from 'react';
import { MapPin, Package, TrendingUp, Plus, Filter, Loader2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { pointsAPI, collectionsAPI, statsAPI } from '../services/api';
import type { CollectionPoint, Collection } from '../mockData';
import CollectionMap from '../components/CollectionMap';

const SPS_DEFAULT_COORDINATES = { lat: 15.5042, lng: -88.0250 };

const isLikelyLegacyCoordinate = (coordinates?: { lat: number; lng: number }) => {
  if (!coordinates) return true;
  const { lat, lng } = coordinates;
  // Honduras bounds approximation.
  return lat < 13 || lat > 17.7 || lng < -90 || lng > -82;
};

const calculateDistanceKm = (
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
) => {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;

  const latDiff = toRadians(to.lat - from.lat);
  const lngDiff = toRadians(to.lng - from.lng);
  const fromLat = toRadians(from.lat);
  const toLat = toRadians(to.lat);

  const a =
    Math.sin(latDiff / 2) * Math.sin(latDiff / 2) +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(lngDiff / 2) * Math.sin(lngDiff / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
};

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isCollector = user?.type === 'collector';
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const [collectionPoints, setCollectionPoints] = useState<CollectionPoint[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [stats, setStats] = useState({
    totalCollections: 0,
    totalTires: 0,
    totalPoints: 0,
    co2Saved: 0,
    treesEquivalent: 0,
    recycledWeight: 0,
  });
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    loadData();
  }, [user]);

  useEffect(() => {
    if (user?.type === 'collector') {
      navigate('/collector', { replace: true });
    }
    if (user?.type === 'admin') {
      navigate('/admin', { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => {
        setUserLocation(null);
      },
      { timeout: 8000 },
    );
  }, []);

  const openDirections = (lat: number, lng: number) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const nearbyPoints = [...collectionPoints].sort((a, b) => {
    if (!userLocation) return 0;

    const distanceA = calculateDistanceKm(userLocation, a.coordinates);
    const distanceB = calculateDistanceKm(userLocation, b.coordinates);
    return distanceA - distanceB;
  });

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load collection points
      const points = await pointsAPI.getAll();
      setCollectionPoints(points || []);
      
      // Load user collections
      if (user) {
        let userCollections = await collectionsAPI.getAll();

        // One-time migration for legacy coordinates (old demo data in Colombia).
        const migrationKey = `ecolant_coords_migrated_${user.id}`;
        const alreadyMigrated = localStorage.getItem(migrationKey) === '1';
        if (!alreadyMigrated) {
          const legacyCollections = (userCollections || []).filter((collection) =>
            isLikelyLegacyCoordinate(collection.coordinates),
          );

          if (legacyCollections.length > 0) {
            await Promise.all(
              legacyCollections.map((collection) =>
                collectionsAPI.update(collection.id, {
                  coordinates: SPS_DEFAULT_COORDINATES,
                  address:
                    collection.address && collection.address.trim().length > 0
                      ? collection.address
                      : 'San Pedro Sula, Honduras',
                }),
              ),
            );

            userCollections = await collectionsAPI.getAll();
          }

          localStorage.setItem(migrationKey, '1');
        }

        setCollections(userCollections || []);
        
        // Load user stats
        const userStats = await statsAPI.get(user.id);
        setStats(userStats);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      // Set defaults for empty state
      setCollectionPoints([]);
      setCollections([]);
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white p-6 rounded-b-3xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Hola, {user.name.split(' ')[0]} 👋</h1>
            <p className="text-green-100 text-sm">
              {isCollector ? 'Recolector' : `${user.level} - ${user.points} puntos`}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={() => navigate('/profile')}
          >
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <span className="text-lg">👤</span>
            </div>
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="bg-white/10 backdrop-blur border-white/20 p-3 text-center">
            <Package className="w-5 h-5 mx-auto mb-1 text-white" />
            <div className="text-xl font-bold">{stats.totalCollections}</div>
            <div className="text-xs text-green-100">Recolecciones</div>
          </Card>
          <Card className="bg-white/10 backdrop-blur border-white/20 p-3 text-center">
            <TrendingUp className="w-5 h-5 mx-auto mb-1 text-white" />
            <div className="text-xl font-bold">{stats.totalTires}</div>
            <div className="text-xs text-green-100">Llantas</div>
          </Card>
          <Card className="bg-white/10 backdrop-blur border-white/20 p-3 text-center">
            <MapPin className="w-5 h-5 mx-auto mb-1 text-white" />
            <div className="text-xl font-bold">{stats.co2Saved.toFixed(0)}kg</div>
            <div className="text-xs text-green-100">CO₂ Evitado</div>
          </Card>
        </div>
      </div>

      <div className="p-4">
        {/* Action Buttons */}
        <div className="flex gap-3 mb-6">
          {isCollector ? (
            <Button
              className="flex-1 bg-green-600 hover:bg-green-700"
              onClick={() => setViewMode('list')}
            >
              <Package className="w-4 h-4 mr-2" />
              Gestionar Recolecciones
            </Button>
          ) : (
            <Button
              className="flex-1 bg-green-600 hover:bg-green-700"
              onClick={() => navigate('/new-collection')}
            >
              <Plus className="w-4 h-4 mr-2" />
              Nueva Recolección
            </Button>
          )}
          <Button variant="outline" size="icon">
            <Filter className="w-4 h-4" />
          </Button>
        </div>

        {/* View Toggle */}
        <div className="flex gap-2 mb-4">
          <Button
            variant={viewMode === 'map' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('map')}
            className={viewMode === 'map' ? 'bg-green-600' : ''}
          >
            <MapPin className="w-4 h-4 mr-1" />
            Mapa
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('list')}
            className={viewMode === 'list' ? 'bg-green-600' : ''}
          >
            <Package className="w-4 h-4 mr-1" />
            Lista
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-green-600" />
          </div>
        ) : viewMode === 'map' ? (
          <>
            <CollectionMap
              points={collectionPoints}
              collections={collections.filter((collection) => collection.status !== 'completed')}
              userLocation={userLocation}
              heightClassName="h-[420px] md:h-[500px] mb-6"
            />

            {/* Nearby Points */}
            <div className="mb-4">
              <h2 className="text-lg font-bold mb-3">Puntos Cercanos</h2>
              {collectionPoints.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No hay puntos de recolección disponibles</p>
              ) : (
                <div className="space-y-3">
                  {nearbyPoints.slice(0, 3).map((point) => {
                    const loadPercentage = (point.currentLoad / point.capacity) * 100;
                    const distanceKm = userLocation
                      ? calculateDistanceKm(userLocation, point.coordinates)
                      : null;
                    return (
                      <Card
                        key={point.id}
                        className="p-4 hover:shadow-lg transition-shadow cursor-pointer"
                        onClick={() => openDirections(point.coordinates.lat, point.coordinates.lng)}
                      >
                        <div className="flex gap-3">
                          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <MapPin className="w-6 h-6 text-green-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-sm mb-1">{point.name}</h3>
                            <p className="text-xs text-gray-600 mb-2">{point.address}</p>
                            <div className="flex items-center gap-2 text-xs">
                              <Badge variant="outline" className="text-xs">
                                {point.hours.split(':')[0]}
                              </Badge>
                              <span className="text-gray-500">
                                Capacidad: {loadPercentage.toFixed(0)}%
                              </span>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="text-sm font-semibold text-green-600">
                              {distanceKm !== null ? `${distanceKm.toFixed(1)} km` : 'Ruta'}
                            </div>
                            <div className="text-xs text-gray-500">
                              {distanceKm !== null ? `${Math.max(5, Math.round(distanceKm * 4))} min` : 'Abrir mapa'}
                            </div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Mis Recolecciones */}
            <div>
              <h2 className="text-lg font-bold mb-3">
                {isCollector ? 'Recolecciones por Gestionar' : 'Mis Recolecciones'}
              </h2>
              {collections.length === 0 ? (
                <Card className="p-8 text-center">
                  <Package className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                  <p className="text-gray-500 mb-4">
                    {isCollector ? 'No hay recolecciones para gestionar' : 'No tienes recolecciones aún'}
                  </p>
                  {!isCollector && (
                    <Button
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() => navigate('/new-collection')}
                    >
                      Crear tu primera recolección
                    </Button>
                  )}
                </Card>
              ) : (
                <div className="space-y-3">
                  {collections.map((collection) => (
                    <Card key={collection.id} className="p-4 hover:shadow-lg transition-shadow cursor-pointer">
                      <div className="flex items-start gap-3">
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          collection.status === 'completed' ? 'bg-green-100' :
                          collection.status === 'in-progress' ? 'bg-blue-100' :
                          'bg-orange-100'
                        }`}>
                          <Package className={`w-6 h-6 ${
                            collection.status === 'completed' ? 'text-green-600' :
                            collection.status === 'in-progress' ? 'text-blue-600' :
                            'text-orange-600'
                          }`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h3 className="font-semibold text-sm">{collection.tireType}</h3>
                            <Badge variant={
                              collection.status === 'completed' ? 'default' :
                              collection.status === 'in-progress' ? 'secondary' :
                              'outline'
                            } className="text-xs">
                              {collection.status === 'completed' ? 'Completada' :
                               collection.status === 'in-progress' ? 'En proceso' :
                               'Pendiente'}
                            </Badge>
                          </div>
                          <p className="text-xs text-gray-600 mb-2">
                            {collection.tireCount} llantas • {collection.address}
                          </p>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-500">
                              {collection.scheduledDate && new Date(collection.scheduledDate).toLocaleDateString('es-CO')}
                            </span>
                            <span className="text-green-600 font-semibold">
                              +{collection.points} puntos
                            </span>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}