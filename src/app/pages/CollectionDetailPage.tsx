import { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useAuth } from '../contexts/AuthContext.tsx';
import { collectionsAPI, collectorAPI } from '../services/api.ts';
import type { Collection } from '../mockData.ts';
import { Button } from '../components/ui/button.tsx';
import { Card } from '../components/ui/card.tsx';
import { Badge } from '../components/ui/badge.tsx';
import CollectionMap from '../components/CollectionMap.tsx';
import { ChevronLeft, Loader2, QrCode, Route, CalendarDays, MapPin, Package, Phone, Mail, User } from 'lucide-react';

type TraceEvent = {
  stage: string;
  note: string;
  actorType: string;
  timestamp: string;
};

type CollectionTrace = {
  collectionId: string;
  qrCode: string;
  currentStage: string;
  events: TraceEvent[];
  certificate: {
    certificateId?: string;
    destinationType?: string;
    issuedAt?: string;
  } | null;
};

const stageLabels: Record<string, string> = {
  registrada: 'Registrada',
  'en-proceso': 'En proceso',
  acopiada: 'Acopiada',
  'destino-final': 'Destino final',
  certificada: 'Certificada',
  cancelada: 'Cancelada',
};

export default function CollectionDetailPage() {
  const navigate = useNavigate();
  const { collectionId = '' } = useParams();
  const { user } = useAuth();

  const [collection, setCollection] = useState<Collection | null>(null);
  const [trace, setTrace] = useState<CollectionTrace | null>(null);
  const [loading, setLoading] = useState(true);
  const [collectorLocation, setCollectorLocation] = useState<{ lat: number; lng: number; collectorName?: string } | null>(null);
  const locationIntervalRef = useRef<number | null>(null);

  const isCollector = user?.type === 'collector';

  useEffect(() => {
    const loadDetail = async () => {
      if (!collectionId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const [collectionData, traceData] = await Promise.all([
          collectionsAPI.getById(collectionId),
          collectionsAPI.getTrace(collectionId),
        ]);

        setCollection(collectionData);
        setTrace(traceData as CollectionTrace);
      } catch {
        setCollection(null);
        setTrace(null);
      } finally {
        setLoading(false);
      }
    };

    loadDetail();
  }, [collectionId]);

  // Load collector location in real-time when collector is assigned and collection is in progress
  useEffect(() => {
    if (!collection?.collectorId || collection.status === 'completed' || collection.status === 'cancelled') {
      setCollectorLocation(null);
      if (locationIntervalRef.current) {
        window.clearInterval(locationIntervalRef.current);
        locationIntervalRef.current = null;
      }
      return;
    }

    const loadCollectorLocation = async () => {
      try {
        const locationData = await collectorAPI.getCollectorLocation(collection.collectorId!);
        setCollectorLocation({
          lat: locationData.lat,
          lng: locationData.lng,
          collectorName: locationData.collectorName,
        });
      } catch (error) {
        console.error('Error loading collector location:', error);
      }
    };

    // Load immediately
    loadCollectorLocation();

    // Then update every 20 seconds
    locationIntervalRef.current = window.setInterval(loadCollectorLocation, 20000);

    return () => {
      if (locationIntervalRef.current) {
        window.clearInterval(locationIntervalRef.current);
        locationIntervalRef.current = null;
      }
    };
  }, [collection?.collectorId, collection?.status]);

  const orderedEvents = useMemo(() => {
    if (!trace?.events?.length) return [];
    return [...trace.events].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [trace]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-green-600" />
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <Card className="max-w-lg mx-auto mt-10 p-6 text-center">
          <p className="font-semibold">No se encontró la recolección solicitada.</p>
          <Button className="mt-4" onClick={() => navigate('/history')}>Volver al historial</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white p-6 rounded-b-3xl">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/history')}
            className="text-white hover:bg-white/20"
          >
            <ChevronLeft className="w-6 h-6" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Detalle de Recolección</h1>
            <p className="text-sm text-green-100">#{collection.id.slice(0, 8).toUpperCase()}</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <Card className="p-4">
          <div className="space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500">Estado actual</p>
                <Badge className="mt-1 bg-green-600">{stageLabels[trace?.currentStage || 'registrada'] || trace?.currentStage || 'Registrada'}</Badge>
              </div>
              <div className="text-right space-y-1">
                <div>
                  <p className="text-sm text-gray-500">Puntos generador</p>
                  <p className="font-bold text-green-600">+{Number(collection.points || 0)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Puntos recolector</p>
                  <p className="font-bold text-blue-600">+{Number(collection.collectorBonusPoints || 0)}</p>
                </div>
              </div>
            </div>

            {/* Compensación del recolector */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-emerald-900 mb-2">Compensacion del Recolector</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-gray-600">Efectivo</p>
                  <p className="font-bold text-emerald-600">{Number(collection.collectorPaymentAmount || 0).toFixed(2)} Lps</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Puntos Bonus</p>
                  <p className="font-bold text-blue-600">+{Number(collection.collectorBonusPoints || 0)} pts</p>
                </div>
              </div>
            </div>

            {/* Pago del generador */}
            {collection.generatorPaymentAmount && collection.generatorPaymentAmount > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-blue-900 mb-1">💵 Pago al Generador</p>
                <p className="font-bold text-blue-600">+{collection.generatorPaymentAmount.toFixed(2)} Lps</p>
              </div>
            )}

            {/* Contacto del cliente generador */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-slate-900 mb-2">👤 Contacto del Cliente</p>
              <div className="space-y-1 text-sm">
                <p><span className="text-gray-500">Nombre:</span> {collection.generatorName || 'N/A'}</p>
                <p><span className="text-gray-500">Telefono:</span> {collection.generatorPhone || 'N/A'}</p>
                <p><span className="text-gray-500">Correo:</span> {collection.generatorEmail || 'N/A'}</p>
              </div>
            </div>

            {/* Contacto del recolector - solo visible para generadores */}
            {!isCollector && collection.collectorId && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-orange-900 mb-2">🚚 Contacto del Recolector</p>
                <div className="space-y-1 text-sm">
                  <p className="flex items-center gap-2">
                    <User className="w-3 h-3 text-gray-500" />
                    <span className="text-gray-500">Nombre:</span> 
                    <span className="font-medium">{collection.collectorName || 'N/A'}</span>
                  </p>
                  {collection.collectorPhone && (
                    <p className="flex items-center gap-2">
                      <Phone className="w-3 h-3 text-gray-500" />
                      <a href={`tel:${collection.collectorPhone}`} className="text-orange-600 hover:underline">
                        {collection.collectorPhone}
                      </a>
                    </p>
                  )}
                  {collection.collectorEmail && (
                    <p className="flex items-center gap-2">
                      <Mail className="w-3 h-3 text-gray-500" />
                      <a href={`mailto:${collection.collectorEmail}`} className="text-orange-600 hover:underline text-xs">
                        {collection.collectorEmail}
                      </a>
                    </p>
                  )}
                  {!collection.collectorPhone && !collection.collectorEmail && (
                    <p className="text-xs text-gray-500 italic">Información de contacto no disponible</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 space-y-2 text-sm">
            <p className="flex items-center gap-2"><Package className="w-4 h-4" /> {collection.tireType} - {collection.tireCount} llantas</p>
            <p className="flex items-center gap-2"><CalendarDays className="w-4 h-4" /> Programada: {collection.scheduledDate || 'N/A'}</p>
            <p className="flex items-center gap-2"><MapPin className="w-4 h-4" /> {collection.address}</p>
            <p className="flex items-center gap-2"><QrCode className="w-4 h-4" /> {trace?.qrCode || 'Sin QR'}</p>
          </div>
        </Card>

        <CollectionMap
          points={[]}
          collections={[collection]}
          userLocation={null}
          collectorLocation={collectorLocation}
          heightClassName="h-[420px]"
        />

        {collectorLocation && (
          <Card className="p-4 bg-orange-50 border-orange-200 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center text-white">
                🚚
              </div>
              <div className="flex-1">
                <p className="font-semibold text-orange-900">
                  {collectorLocation.collectorName || 'Recolector'} en camino
                </p>
                <p className="text-sm text-orange-700">
                  Ubicación actualizada en tiempo real
                </p>
              </div>
            </div>
          </Card>
        )}

        <Card className="p-4">
          <h2 className="font-semibold mb-3 flex items-center gap-2"><Route className="w-4 h-4" /> Timeline de trazabilidad</h2>
          {orderedEvents.length === 0 ? (
            <p className="text-sm text-gray-500">Sin eventos registrados.</p>
          ) : (
            <div className="space-y-3">
              {orderedEvents.map((event, index) => (
                <div key={`${event.timestamp}-${index}`} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline">{stageLabels[event.stage] || event.stage}</Badge>
                    <span className="text-xs text-gray-500">{new Date(event.timestamp).toLocaleString('es-HN')}</span>
                  </div>
                  <p className="text-sm mt-2">{event.note}</p>
                  <p className="text-xs text-gray-500 mt-1">Actor: {event.actorType}</p>
                </div>
              ))}
            </div>
          )}
        </Card>

        {trace?.certificate && (
          <Card className="p-4 bg-emerald-50 border-emerald-200">
            <h3 className="font-semibold">Certificado de cumplimiento</h3>
            <p className="text-sm mt-1">ID: {trace.certificate.certificateId || 'N/A'}</p>
            <p className="text-sm">Destino final: {trace.certificate.destinationType || 'N/A'}</p>
            <p className="text-sm">Emitido: {trace.certificate.issuedAt ? new Date(trace.certificate.issuedAt).toLocaleString('es-HN') : 'N/A'}</p>
          </Card>
        )}
      </div>
    </div>
  );
}
