import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext.tsx';
import { collectorAPI, collectionsAPI } from '../services/api.js';
import type { Collection } from '../mockData.ts';
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
import { Loader2, Truck, MapPin, CheckCircle2, PlayCircle, XCircle, Route } from 'lucide-react';
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
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const requestPollRef = useRef<number | null>(null);
  const answerPollRef = useRef<number | null>(null);

  const isCollector = user?.type === 'collector';

  useEffect(() => {
    if (!isCollector) return;
    void loadCollections();
    void loadRouteSuggestions();
  }, [isCollector]);

  const loadRouteSuggestions = async () => {
    try {
      setRouteLoading(true);

      const getLocation = () => new Promise<{ lat: number; lng: number } | null>((resolve) => {
        if (!navigator.geolocation) {
          resolve(null);
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (position) => {
            resolve({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            });
          },
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 4500, maximumAge: 1000 * 60 * 3 },
        );
      });

      const currentPosition = await getLocation();
      const data = await collectorAPI.getRouteSuggestions({
        lat: currentPosition?.lat,
        lng: currentPosition?.lng,
        maxStops: 5,
      });

      setRouteSuggestions(Array.isArray(data?.suggestions) ? data.suggestions : []);
    } catch (error: any) {
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
        (item: Collection) => item.status === 'pending' || item.status === 'in-progress',
      );
      setCollections(actionable);
    } catch (error: any) {
      toast.error(error.message || 'No se pudo cargar la bandeja de recolecciones');
      setCollections([]);
    } finally {
      setLoading(false);
    }
  };

  const pendingCount = useMemo(
    () => collections.filter((item) => item.status === 'pending').length,
    [collections],
  );

  const inProgressCount = useMemo(
    () => collections.filter((item) => item.status === 'in-progress').length,
    [collections],
  );

  const updateStatus = async (collectionId: string, status: 'pending' | 'in-progress' | 'completed') => {
    try {
      setUpdatingId(collectionId);
      await collectionsAPI.update(collectionId, { status });
      toast.success(
        status === 'completed'
          ? 'Recolección completada'
          : status === 'pending'
            ? 'Recolección devuelta a pendientes'
            : 'Recolección tomada',
      );
      await loadCollections();
    } catch (error: any) {
      toast.error(error.message || 'No se pudo actualizar el estado');
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

        <div className="grid grid-cols-2 gap-3 mt-5">
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
                <Route className="w-4 h-4" /> Rutas sugeridas para hoy
              </p>
              <p className="text-sm text-blue-800">Basadas en tu ubicación, recolecciones activas y centros de acopio.</p>
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
            <div className="space-y-2">
              {routeSuggestions.slice(0, 3).map((item) => (
                <div key={item.collectionId} className="bg-white border border-blue-200 rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-sm">Recolectar {item.tireCount} llantas ({item.tireType})</p>
                    <Badge variant="outline">{item.distance.totalKm.toFixed(1)} km</Badge>
                  </div>
                  <p className="text-xs text-gray-700 mt-1">Pickup: {item.pickupAddress}</p>
                  <p className="text-xs text-gray-700">Centro sugerido: {item.dropoffPoint.name}</p>
                  <p className="text-xs text-emerald-700 mt-1">
                    Pago cliente: {item.estimatedCompensation.generatorTotal.toFixed(2)} {item.estimatedCompensation.currency} ·
                    Flete recolector: {item.estimatedCompensation.collectorFreight.toFixed(2)} {item.estimatedCompensation.currency}
                  </p>
                </div>
              ))}
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
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{collection.tireType} - {collection.tireCount} llantas</p>
                  <p className="text-sm text-gray-600 flex items-center gap-1 mt-1">
                    <MapPin className="w-4 h-4" />
                    {collection.address}
                  </p>
                </div>
                <Badge variant={collection.status === 'in-progress' ? 'secondary' : 'outline'}>
                  {collection.status === 'pending' ? 'Pendiente' : 'En proceso'}
                </Badge>
              </div>

              <div className="mt-3 flex gap-2">
                {collection.status === 'pending' && (
                  <Button
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                    onClick={() => updateStatus(collection.id, 'in-progress')}
                    disabled={updatingId === collection.id}
                  >
                    {updatingId === collection.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-2" />}
                    Tomar
                  </Button>
                )}

                {collection.status === 'in-progress' && (
                  <Button
                    variant="outline"
                    className="border-red-300 text-red-700 hover:bg-red-50"
                    onClick={() => setCancelTarget(collection)}
                    disabled={updatingId === collection.id}
                  >
                    {updatingId === collection.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4 mr-2" />}
                    Cancelar
                  </Button>
                )}

                <Button
                  className="flex-1 bg-green-600 hover:bg-green-700"
                  onClick={() => updateStatus(collection.id, 'completed')}
                  disabled={updatingId === collection.id}
                >
                  {updatingId === collection.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                  Completar
                </Button>

                <Button variant="outline" onClick={() => navigate(`/history/${collection.id}`)}>
                  Detalle
                </Button>
              </div>
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
                ? `Vas a liberar la recoleccion de ${cancelTarget.tireCount} llantas (${cancelTarget.tireType}). Esta accion la devolvera a estado "Pendiente" para poder tomarla nuevamente.`
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
                void updateStatus(cancelTarget.id, 'pending').then(() => {
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
