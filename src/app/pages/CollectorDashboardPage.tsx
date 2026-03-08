import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext.tsx';
import { collectorAPI, collectionsAPI } from '../services/api.js';
import type { Collection } from '../mockData.ts';
import CollectionMap from '../components/CollectionMap.tsx';
import { Card } from '../components/ui/card.tsx';
import { Button } from '../components/ui/button.tsx';
import { Badge } from '../components/ui/badge.tsx';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog.tsx';
import { ChevronLeft, Loader2, QrCode, Route, CalendarDays, MapPin, Package, Truck, CheckCircle2, PlayCircle, XCircle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { API_BASE_URL, getAuthHeaders, ANALYTICS_SESSION_ID_KEY } from '../services/api.js';

type RouteSuggestion = {
  collectionId: string;
  collectionStatus: string;
  pickupAddress: string;
  dropoffPoint: {
    id: string;
    name: string;
    address: string;
  };
  tireCount: number;
  tireType: string;
  tireCondition: string;
  distance: {
    collectorToPickupKm: number;
    pickupToPointKm: number;
    totalKm: number;
  };
  estimatedCompensation: {
    currency: string;
    generatorPerTire: number;
    generatorTotal: number;
    collectorFreight: number;
    collectorBonusPoints: number;
    generatorRewardValue: number;
  };
  optimization: {
    routeScore: number;
    valueScore: number;
    recommendation: string;
  };
};

export default function CollectorDashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Collection | null>(null);
  const [peerConnection, setPeerConnection] = useState<RTCPeerConnection | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [webRTCError, setWebRTCError] = useState<string | null>(null);
  const [isScreenShareActive, setIsScreenShareActive] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeSuggestions, setRouteSuggestions] = useState<RouteSuggestion[]>([]);
  const [removedCollectionIds, setRemovedCollectionIds] = useState<Set<string>>(new Set());
  const [addedCollectionIds, setAddedCollectionIds] = useState<Set<string>>(new Set());
  const [showRouteMap, setShowRouteMap] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const requestPollRef = useRef<number | null>(null);
  const answerPollRef = useRef<number | null>(null);

  const isCollector = user?.type === 'collector';

  useEffect(() => {
    if (!isCollector) return;
    void loadCollections();
    void loadRouteSuggestions();
  }, [isCollector]);

  useEffect(() => {
    if (!isCollector) return;

    const intervalId = window.setInterval(() => {
      void loadCollections();
      void loadRouteSuggestions();
    }, 15000);

    const handleFocus = () => {
      void loadCollections();
      void loadRouteSuggestions();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [isCollector]);

  const loadRouteSuggestions = async () => {
    try {
      setRouteLoading(true);

      const getLocation = () => new Promise<{ lat: number; lng: number } | null>((resolve) => {
        if (!navigator.geolocation) {
          console.warn('Geolocation not available');
          resolve(null);
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (position) => {
            console.log('📍 User location:', position.coords);
            resolve({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            });
          },
          (error) => {
            console.warn('Geolocation error:', error);
            resolve(null);
          },
          { enableHighAccuracy: true, timeout: 4500, maximumAge: 1000 * 60 * 3 },
        );
      });

      const currentPosition = await getLocation();
      console.log('🗺️ Requesting routes with location:', currentPosition);
      
      const data = await collectorAPI.getRouteSuggestions({
        lat: currentPosition?.lat,
        lng: currentPosition?.lng,
        maxStops: 5,
      });

      console.log('🛣️ Route suggestions response:', data);
      const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];
      console.log(`📊 Found ${suggestions.length} route suggestions`);
      setRouteSuggestions(suggestions);
    } catch (error: any) {
      console.error('❌ Route suggestions error:', error);
      toast.error(error.message || 'No se pudieron generar rutas sugeridas');
      setRouteSuggestions([]);
    } finally {
      setRouteLoading(false);
    }
  };

  // Redirect non-collectors
  useEffect(() => {
    if (!isCollector && user) {
      navigate('/');
    }
  }, [isCollector, user]);

  useEffect(() => {
    if (!localVideoRef.current) return;
    localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  const stopScreenShare = async () => {
    if (answerPollRef.current) {
      window.clearInterval(answerPollRef.current);
      answerPollRef.current = null;
    }

    if (peerConnection) {
      peerConnection.close();
      setPeerConnection(null);
    }

    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }

    setIsScreenShareActive(false);
  };

  const startScreenShare = async (sessionId: string) => {
    try {
      setWebRTCError(null);
      if (isScreenShareActive) return;

      // Validar soporte de getDisplayMedia
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        toast.error('Tu navegador no soporta compartir pantalla. Intenta desde un computador con Chrome o Firefox.');
        return;
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const pc = new RTCPeerConnection();

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.addEventListener('ended', () => {
          void stopScreenShare();
        });
      }

      pc.onicecandidate = async (event) => {
        if (!event.candidate) return;
        try {
          await fetch(`${API_BASE_URL}/analytics/session/screen-share-ice`, {
            method: 'POST',
            headers: getAuthHeaders(true),
            body: JSON.stringify({ sessionId, candidate: event.candidate }),
          });
        } catch {
          // Ignore transient ICE signaling errors.
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await fetch(`${API_BASE_URL}/analytics/session/screen-share-offer`, {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify({ sessionId, sdp: offer.sdp }),
      });

      setPeerConnection(pc);
      setLocalStream(stream);
      setIsScreenShareActive(true);
      toast.success('Compartiendo pantalla con soporte remoto');

      answerPollRef.current = window.setInterval(async () => {
        try {
          const answerResp = await fetch(`${API_BASE_URL}/analytics/session/screen-share-answer/${sessionId}`, {
            method: 'GET',
            headers: getAuthHeaders(true),
          });
          const answerData = await answerResp.json();

          if (answerData?.answer?.sdp && !pc.currentRemoteDescription) {
            await pc.setRemoteDescription({ type: 'answer', sdp: answerData.answer.sdp });
          }

          const iceResp = await fetch(`${API_BASE_URL}/analytics/session/screen-share-ice/${sessionId}/admin`, {
            method: 'GET',
            headers: getAuthHeaders(true),
          });
          const iceData = await iceResp.json();

          if (Array.isArray(iceData?.candidates)) {
            for (const candidate of iceData.candidates) {
              try {
                await pc.addIceCandidate(candidate);
              } catch {
                // Ignore duplicated/invalid candidates.
              }
            }
          }
        } catch {
          // Keep polling while session is active.
        }
      }, 2500);
    } catch (err) {
      console.error('Collector WebRTC error:', err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      
      if (errorMsg.includes('Permission denied') || errorMsg.includes('NotAllowedError')) {
        setWebRTCError('Permiso denegado para compartir pantalla');
        toast.error('Debes permitir compartir pantalla para usar asistencia remota');
      } else {
        setWebRTCError('No se pudo establecer la conexión de pantalla compartida');
        toast.error('No se pudo iniciar el screen-share. Verifica que tu navegador lo soporte.');
      }
      await stopScreenShare();
    }
  };

  const requestRemoteAssistance = async () => {
    const sessionId = sessionStorage.getItem(ANALYTICS_SESSION_ID_KEY);
    if (!sessionId) {
      toast.error('No se encontro la sesion activa');
      return;
    }

    // Ofrecer alternativas para dispositivos móviles
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      const shortSessionId = sessionId.substring(0, 8);
      const useExternal = window.confirm(
        `📱 ASISTENCIA DESDE MÓVIL\n\n` +
        `Compartir pantalla no funciona en móviles desde el navegador.\n\n` +
        `ALTERNATIVAS RECOMENDADAS:\n` +
        `• Zoom (zoom.us)\n` +
        `• Google Meet (meet.google.com)\n` +
        `• WhatsApp/Telegram videollamada\n\n` +
        `Tu código de sesión: ${shortSessionId}\n\n` +
        `¿Deseas continuar de todas formas con el navegador?\n` +
        `(Se recomienda usar una de las apps anteriores)`
      );
      if (!useExternal) {
        toast.info(`Tu código de sesión es: ${shortSessionId}`, { duration: 8000 });
        return;
      }
    }

    const confirmed = window.confirm('Deseas solicitar asistencia remota al administrador?');
    if (!confirmed) return;

    try {
      const response = await fetch(`${API_BASE_URL}/analytics/session/screen-share-request/self`, {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify({ sessionId }),
      });

      if (!response.ok) {
        throw new Error('No se pudo enviar la solicitud');
      }

      toast.success('Solicitud enviada. Espera a que el administrador inicie la asistencia.');
    } catch (error) {
      console.error('Collector assistance request error:', error);
      toast.error('No se pudo enviar la solicitud de asistencia');
    }
  };

  useEffect(() => {
    if (!isCollector) return;

    const sessionId = sessionStorage.getItem(ANALYTICS_SESSION_ID_KEY);
    if (!sessionId) return;

    requestPollRef.current = window.setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/analytics/session/screen-share-request/${sessionId}`, {
          method: 'GET',
          headers: getAuthHeaders(true),
        });
        const data = await response.json();
        const requestStatus = data?.request?.status;

        if (requestStatus === 'stopped' && isScreenShareActive) {
          await stopScreenShare();
          toast.info('El administrador finalizo la asistencia remota');
          return;
        }

        if (isScreenShareActive) return;

        if (requestStatus !== 'pending') return;

        const accepted = window.confirm('El administrador solicita ver tu pantalla. Deseas compartirla ahora?');
        await fetch(`${API_BASE_URL}/analytics/session/screen-share-request/${sessionId}/status`, {
          method: 'POST',
          headers: getAuthHeaders(true),
          body: JSON.stringify({ status: accepted ? 'accepted' : 'rejected' }),
        });

        if (accepted) {
          await startScreenShare(sessionId);
        }
      } catch (err) {
        console.error('Collector screen-share poll error:', err);
      }
    }, 3500);

    return () => {
      if (requestPollRef.current) {
        window.clearInterval(requestPollRef.current);
        requestPollRef.current = null;
      }
    };
  }, [isCollector, isScreenShareActive]);

  useEffect(() => {
    return () => {
      if (requestPollRef.current) {
        window.clearInterval(requestPollRef.current);
      }
      if (answerPollRef.current) {
        window.clearInterval(answerPollRef.current);
      }
      if (peerConnection) {
        peerConnection.close();
      }
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [peerConnection, localStream]);


  const loadCollections = async () => {
    try {
      setLoading(true);
      const all = await collectionsAPI.getAll();
      const actionable = all.filter(
        (item: Collection) => {
          const isAvailable = item.status === 'available' || (item.status === 'pending' && !item.collectorId);
          const isMine = item.collectorId === user?.id;
          const isMyQueue = (item.status === 'pending' || item.status === 'in-progress') && isMine;
          return isAvailable || isMyQueue;
        },
      );
      setCollections(actionable);
    } catch (error: any) {
      toast.error(error.message || 'No se pudo cargar la bandeja de recolecciones');
      setCollections([]);
    } finally {
      setLoading(false);
    }
  };

  const normalizeCollectionStatus = (item: Collection) => {
    if (item.status === 'pending' && !item.collectorId) return 'available';
    return item.status;
  };

  const availableCount = useMemo(
    () => collections.filter((item) => normalizeCollectionStatus(item) === 'available').length,
    [collections],
  );

  const pendingCount = useMemo(
    () => collections.filter((item) => item.status === 'pending' && item.collectorId === user?.id).length,
    [collections, user?.id],
  );

  const inProgressCount = useMemo(
    () => collections.filter((item) => item.status === 'in-progress' && item.collectorId === user?.id).length,
    [collections, user?.id],
  );

  const updateStatus = async (
    collectionId: string,
    status: 'available' | 'pending' | 'in-progress' | 'completed',
    extra: Partial<Collection> = {},
  ) => {
    try {
      setUpdatingId(collectionId);
      await collectionsAPI.update(collectionId, { status, ...extra });
      toast.success(
        status === 'completed'
          ? 'Recolección completada'
          : status === 'available'
            ? 'Recolección liberada a disponibles'
            : status === 'pending'
              ? 'Recolección aceptada y en pendientes'
              : 'Recolección iniciada',
      );
      await loadCollections();
      await loadRouteSuggestions();
    } catch (error: any) {
      toast.error(error.message || 'No se pudo actualizar el estado');
    } finally {
      setUpdatingId(null);
    }
  };

  const takeCollection = async (collectionId: string, paymentData?: { collectorFreight?: number; collectorBonusPoints?: number }) => {
    try {
      setUpdatingId(collectionId);
      await collectorAPI.takeCollection(collectionId, paymentData);
      toast.success('Ruta tomada. La recolección pasó a Pendientes.');
      setRemovedCollectionIds(new Set());
      await loadCollections();
      await loadRouteSuggestions();
    } catch (error: any) {
      const message = String(error?.message || 'No se pudo tomar la ruta');
      if (message.toLowerCase().includes('no longer available') || message.toLowerCase().includes('taken by another')) {
        toast.info('Otro recolector tomó esta recolección. Actualizando mejores rutas...');
        await loadCollections();
        await loadRouteSuggestions();
      } else {
        toast.error(message);
      }
    } finally {
      setUpdatingId(null);
    }
  };

  // Renderizado condicional sin early returns

  if (!isCollector) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <Card className="max-w-lg mx-auto mt-10 p-6 text-center">
          <h2 className="font-bold text-lg">Vista no disponible</h2>
          <p className="text-sm text-gray-600 mt-2">Esta pantalla es exclusiva para cuentas recolectoras.</p>
          <Button className="mt-4" onClick={() => navigate('/home')}>Volver</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-gradient-to-r from-emerald-700 to-green-600 text-white p-6 rounded-b-3xl">
        <h1 className="text-2xl font-bold">Panel Recolector</h1>
        <p className="text-sm text-emerald-100 mt-1">Gestiona rutas y estados de recolección en tiempo real.</p>

        <div className="grid grid-cols-3 gap-3 mt-5">
          <Card className="p-3 bg-white/10 border-white/20 text-center">
            <p className="text-xs text-emerald-100">Disponibles</p>
            <p className="text-2xl font-bold">{availableCount}</p>
          </Card>
          <Card className="p-3 bg-white/10 border-white/20 text-center">
            <p className="text-xs text-emerald-100">Pendientes</p>
            <p className="text-2xl font-bold">{pendingCount}</p>
          </Card>
          <Card className="p-3 bg-white/10 border-white/20 text-center">
            <p className="text-xs text-emerald-100">En proceso</p>
            <p className="text-2xl font-bold">{inProgressCount}</p>
          </Card>
        </div>
      </div>

      <div className="px-4 pt-4">
        <Card className="p-4 border-blue-200 bg-blue-50/70 mb-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="font-semibold text-blue-900 flex items-center gap-2">
                <Route className="w-4 h-4" /> Mejor ruta sugerida para hoy
              </p>
              <p className="text-sm text-blue-800">Optimizada por distancia, valor y proximidad.</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => void loadRouteSuggestions()} disabled={routeLoading}>
              {routeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Actualizar'}
            </Button>
          </div>

          {routeLoading ? (
            <div className="py-4 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-blue-700" />
            </div>
          ) : routeSuggestions.length === 0 ? (
            <p className="text-sm text-blue-900">No hay rutas sugeridas en este momento.</p>
          ) : (
            <div className="space-y-3">
              {routeSuggestions.slice(0, 1).map((firstItem, routeIdx) => {
                const allRouteItems = routeSuggestions.slice(0, Math.min(5, routeSuggestions.length));
                const routeItems = allRouteItems.filter(item => !removedCollectionIds.has(item.collectionId));
                const totalTires = routeItems.reduce((sum, item) => sum + item.tireCount, 0);
                const totalFreight = routeItems.reduce((sum, item) => sum + item.estimatedCompensation.collectorFreight, 0);
                const totalBonus = routeItems.reduce((sum, item) => sum + item.estimatedCompensation.collectorBonusPoints, 0);
                const totalDistanceKm = routeItems.reduce((sum, item) => sum + item.distance.totalKm, 0);

                return (
                  <div key={`route-${routeIdx}`} className="bg-white border-2 border-blue-400 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-bold text-blue-900">Ruta Optimizada #{routeIdx + 1}</h3>
                        <p className="text-xs text-blue-700">{routeItems.length} parada{routeItems.length > 1 ? 's' : ''} • {totalTires} llantas totales</p>
                      </div>
                      <Badge className="bg-blue-600">{totalDistanceKm.toFixed(1)} km</Badge>
                    </div>

                    <div className="space-y-2 mb-3">
                      {allRouteItems.map((item, idx) => {
                        const isRemoved = removedCollectionIds.has(item.collectionId);
                        return (
                          <div key={item.collectionId} className={`rounded p-2 border transition ${isRemoved ? 'bg-gray-100 border-gray-300 opacity-50' : 'bg-blue-50 border-blue-200'}`}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <p className={`text-sm font-medium ${isRemoved ? 'line-through text-gray-600' : 'text-blue-900'}`}>
                                  Parada {idx + 1}: {item.tireCount} llantas ({item.tireType})
                                </p>
                                <p className="text-xs text-gray-600">{item.pickupAddress}</p>
                                {idx === allRouteItems.length - 1 && !isRemoved && (
                                  <p className="text-xs text-emerald-700 mt-1">
                                    →  {item.dropoffPoint.name}
                                  </p>
                                )}
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-xs font-semibold text-emerald-600">
                                    {item.estimatedCompensation.collectorFreight.toFixed(2)} Lps
                                  </span>
                                  <span className="text-xs text-gray-500">o</span>
                                  <span className="text-xs font-semibold text-blue-600">
                                    {item.estimatedCompensation.collectorBonusPoints} pts
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <p className="text-xs font-semibold text-blue-700">{item.distance.totalKm.toFixed(1)} km</p>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-1 text-xs text-blue-600 hover:text-blue-800"
                                  onClick={() => navigate(`/history/${item.collectionId}`)}
                                >
                                  Ver
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className={`h-6 w-6 p-0 ${isRemoved ? 'text-gray-400 hover:text-green-600' : 'text-red-500 hover:text-red-700'}`}
                                  onClick={() => {
                                    const newRemoved = new Set(removedCollectionIds);
                                    if (isRemoved) {
                                      newRemoved.delete(item.collectionId);
                                    } else {
                                      newRemoved.add(item.collectionId);
                                    }
                                    setRemovedCollectionIds(newRemoved);
                                  }}
                                >
                                  {isRemoved ? '↩' : <Trash2 className="w-3 h-3" />}
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {routeItems.length === 0 ? (
                      <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-3 text-center">
                        <p className="text-sm text-yellow-800">Se removieron todas las paradas. Restaura alguna para continuar.</p>
                      </div>
                    ) : (
                      <>
                        <div className="bg-gradient-to-br from-emerald-50 to-green-50 border-2 border-emerald-300 rounded-lg p-4 mb-3">
                          <p className="text-sm font-bold text-emerald-900 mb-3">💰 Resumen Financiero de la Ruta</p>
                          
                          <div className="grid grid-cols-2 gap-3 mb-3">
                            <div className="bg-white rounded p-3 border border-emerald-200">
                              <p className="text-xs text-gray-600 mb-1">Si eliges EFECTIVO + PUNTOS:</p>
                              <p className="text-xl font-bold text-emerald-600">{totalFreight.toFixed(2)} Lps</p>
                              <p className="text-xs text-gray-500 mt-1">+ puntos base del sistema</p>
                            </div>
                            
                            <div className="bg-white rounded p-3 border border-blue-200">
                              <p className="text-xs text-gray-600 mb-1">Si eliges SOLO PUNTOS:</p>
                              <p className="text-xl font-bold text-blue-600">{totalBonus} pts</p>
                              <p className="text-xs text-gray-500 mt-1">Multiplicador de puntos</p>
                            </div>
                          </div>

                          <div className="bg-white/50 rounded p-2 border border-emerald-200">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-700">📍 Distancia total:</span>
                              <span className="font-semibold text-gray-900">{totalDistanceKm.toFixed(1)} km</span>
                            </div>
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-xs text-gray-700">🎯 Score optimización:</span>
                              <span className="font-semibold text-gray-900">{firstItem.optimization.routeScore.toFixed(3)}</span>
                            </div>
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-xs text-gray-700">📦 Total llantas:</span>
                              <span className="font-semibold text-gray-900">{totalTires}</span>
                            </div>
                          </div>
                        </div>

                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full mb-3"
                          onClick={() => setShowRouteMap(!showRouteMap)}
                        >
                          {showRouteMap ? 'Ocultar mapa de ruta' : 'Ver mapa de ruta'}
                        </Button>

                        {showRouteMap && (
                          <div className="mb-3 rounded-lg overflow-hidden border border-gray-300">
                            <CollectionMap
                              points={[]}
                              collections={routeItems.map(item => ({
                                ...(collections.find(c => c.id === item.collectionId) || {}),
                                id: item.collectionId,
                                address: item.pickupAddress,
                              } as any))}
                              userLocation={null}
                              heightClassName="h-[300px]"
                            />
                          </div>
                        )}
                      </>
                    )}

                    {routeItems.length > 0 && (
                      <>
                        <p className="text-xs text-blue-800 mb-3">{firstItem.optimization.recommendation}</p>
                        <Button
                          className="w-full bg-blue-600 hover:bg-blue-700"
                          onClick={() => void takeCollection(firstItem.collectionId, {
                            collectorFreight: firstItem.estimatedCompensation.collectorFreight,
                            collectorBonusPoints: firstItem.estimatedCompensation.collectorBonusPoints,
                          })}
                          disabled={updatingId === firstItem.collectionId || routeItems.length === 0}
                        >
                          {updatingId === firstItem.collectionId ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <PlayCircle className="w-4 h-4 mr-2" />
                              Comenzar ruta ({routeItems.length} parada{routeItems.length > 1 ? 's' : ''})
                            </>
                          )}
                        </Button>
                      </>
                    )}
                  </div>
                );
              })}

              {routeSuggestions.length > 5 && (
                <p className="text-xs text-gray-600 text-center">
                  +{routeSuggestions.length - 5} ruta{routeSuggestions.length - 5 > 1 ? 's' : ''} adicional{routeSuggestions.length - 5 > 1 ? 'es' : ''} disponible{routeSuggestions.length - 5 > 1 ? 's' : ''}
                </p>
              )}
            </div>
          )}
        </Card>

        <Card className="p-4 border-orange-200 bg-orange-50/70">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-orange-900">Asistencia remota WebRTC</p>
              <p className="text-sm text-orange-800">
                {isScreenShareActive
                  ? 'Tu pantalla se esta compartiendo con el administrador.'
                  : 'Cuando el administrador lo solicite, te pediremos confirmar para compartir pantalla.'}
              </p>
              {webRTCError && <p className="text-xs text-red-700 mt-1">{webRTCError}</p>}
            </div>
            {isScreenShareActive && (
              <Button variant="outline" className="border-red-300 text-red-700 hover:bg-red-50" onClick={() => void stopScreenShare()}>
                Detener pantalla
              </Button>
            )}
            {!isScreenShareActive && (
              <Button className="bg-orange-600 hover:bg-orange-700" onClick={() => void requestRemoteAssistance()}>
                Solicitar asistencia remota
              </Button>
            )}
          </div>

          {isScreenShareActive && (
            <div className="mt-3">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full max-w-xs rounded-md border border-orange-200"
              />
            </div>
          )}
        </Card>
      </div>

      <div className="p-4 space-y-3">
        {loading ? (
          <div className="py-12 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-green-600" />
          </div>
        ) : collections.length === 0 ? (
          <Card className="p-8 text-center">
            <Truck className="w-10 h-10 mx-auto text-gray-400 mb-2" />
            <p className="text-gray-600">No hay recolecciones activas para gestionar.</p>
          </Card>
        ) : (
          collections.map((collection) => (
            <Card key={collection.id} className="p-4">
              {(() => {
                const normalizedStatus = normalizeCollectionStatus(collection);
                const isAssignedToMe = collection.collectorId === user?.id;

                return (
                  <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{collection.tireType} - {collection.tireCount} llantas</p>
                  <p className="text-sm text-gray-600 flex items-center gap-1 mt-1">
                    <MapPin className="w-4 h-4" />
                    {collection.address}
                  </p>
                </div>
                <Badge variant={normalizedStatus === 'in-progress' ? 'secondary' : 'outline'}>
                  {normalizedStatus === 'available'
                    ? 'Disponible'
                    : normalizedStatus === 'pending'
                      ? 'Pendiente'
                      : 'En proceso'}
                </Badge>
              </div>

              <div className="mt-3 space-y-2">
                <div className="flex gap-2">
                  {normalizedStatus === 'available' && (
                    <>
                      <Button
                        className="flex-1 bg-blue-600 hover:bg-blue-700"
                        onClick={() => void takeCollection(collection.id)}
                        disabled={updatingId === collection.id}
                      >
                        {updatingId === collection.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-2" />}
                        Tomar ruta
                      </Button>
                      <Button
                        variant="outline"
                        className="border-green-300 text-green-700 hover:bg-green-50"
                        onClick={() => {
                          const newAdded = new Set(addedCollectionIds);
                          if (newAdded.has(collection.id)) {
                            newAdded.delete(collection.id);
                            toast.info('Recolección removida de tu ruta personalizada');
                          } else {
                            newAdded.add(collection.id);
                            toast.success('Recolección agregada a tu ruta personalizada');
                          }
                          setAddedCollectionIds(newAdded);
                        }}
                        disabled={updatingId === collection.id}
                      >
                        {addedCollectionIds.has(collection.id) ? '✓' : '+'}
                      </Button>
                    </>
                  )}

                  {normalizedStatus === 'pending' && isAssignedToMe && (
                    <Button
                      className="flex-1 bg-amber-600 hover:bg-amber-700"
                      onClick={() => void updateStatus(collection.id, 'in-progress')}
                      disabled={updatingId === collection.id}
                    >
                      {updatingId === collection.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-2" />}
                      Iniciar ruta
                    </Button>
                  )}

                  {(normalizedStatus === 'pending' || normalizedStatus === 'in-progress') && isAssignedToMe && (
                    <Button
                      variant="outline"
                      className="border-red-300 text-red-700 hover:bg-red-50"
                      onClick={() => setCancelTarget(collection)}
                      disabled={updatingId === collection.id}
                    >
                      {updatingId === collection.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4 mr-2" />}
                      Liberar
                    </Button>
                  )}

                  <Button variant="outline" onClick={() => navigate(`/history/${collection.id}`)}>
                    Detalle
                  </Button>
                </div>

                {(normalizedStatus === 'pending' || normalizedStatus === 'in-progress') && isAssignedToMe && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Button
                      className="bg-green-600 hover:bg-green-700 text-sm"
                      onClick={() => void updateStatus(collection.id, 'completed', { collectorPaymentPreference: 'cash_points' })}
                      disabled={updatingId === collection.id}
                    >
                      {updatingId === collection.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                      Efectivo + Puntos
                    </Button>

                    <Button
                      className="bg-emerald-700 hover:bg-emerald-800 text-sm"
                      onClick={() => void updateStatus(collection.id, 'completed', { collectorPaymentPreference: 'points' })}
                      disabled={updatingId === collection.id}
                    >
                      {updatingId === collection.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                      Solo Puntos
                    </Button>
                  </div>
                )}
              </div>
                  </>
                );
              })()}
            </Card>
          ))
        )}
      </div>

      <AlertDialog open={Boolean(cancelTarget)} onOpenChange={(open) => { if (!open) setCancelTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar toma de recoleccion</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget
                ? `Vas a liberar la recoleccion de ${cancelTarget.tireCount} llantas (${cancelTarget.tireType}). Esta accion la devolvera a estado "Disponible" para que otro recolector pueda tomarla.`
                : 'Confirma si deseas liberar esta recoleccion.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(cancelTarget?.id && updatingId === cancelTarget.id)}>
              Volver
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={(event) => {
                if (!cancelTarget) return;
                event.preventDefault();
                void updateStatus(cancelTarget.id, 'available').then(() => {
                  setCancelTarget(null);
                });
              }}
              disabled={Boolean(cancelTarget?.id && updatingId === cancelTarget.id)}
            >
Confirmar y liberar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
