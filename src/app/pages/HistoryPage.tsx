import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { collectionsAPI, statsAPI } from '../services/api';
import type { Collection } from '../mockData';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { 
  ChevronLeft, 
  Package, 
  Calendar,
  MapPin,
  CheckCircle2,
  Clock,
  XCircle,
  Filter,
  Loader2,
  Download,
  FileSpreadsheet,
  Leaf,
  Route,
  LoaderCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';

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

export default function HistoryPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [filter, setFilter] = useState<'all' | 'completed' | 'pending' | 'in-progress' | 'cancelled'>('all');
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
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [traceModalOpen, setTraceModalOpen] = useState(false);
  const [traceLoading, setTraceLoading] = useState(false);
  const [selectedTrace, setSelectedTrace] = useState<CollectionTrace | null>(null);

  useEffect(() => {
    loadCollections();
  }, []);

  const loadCollections = async () => {
    try {
      setLoading(true);
      const data = await collectionsAPI.getAll();
      setCollections(data || []);

      if (user?.id) {
        const userStats = await statsAPI.get(user.id);
        setStats(userStats);
      }
    } catch (error) {
      console.error('Error loading collections:', error);
      toast.error('Error al cargar historial');
      setCollections([]);
    } finally {
      setLoading(false);
    }
  };

  const isCollector = user?.type === 'collector';

  // For collectors, history should only show collections assigned to them.
  const scopedCollections = isCollector
    ? collections.filter((collection) => collection.collectorId === user?.id)
    : collections;

  const filteredCollections = scopedCollections
    .filter((collection) => (filter === 'all' ? true : collection.status === filter))
    .sort((a, b) => {
      if (filter === 'pending') {
        const aDate = a.scheduledDate ? new Date(a.scheduledDate).getTime() : Number.MAX_SAFE_INTEGER;
        const bDate = b.scheduledDate ? new Date(b.scheduledDate).getTime() : Number.MAX_SAFE_INTEGER;
        return aDate - bDate;
      }

      const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bCreated - aCreated;
    });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case 'in-progress':
        return <Clock className="w-5 h-5 text-blue-600" />;
      case 'cancelled':
        return <XCircle className="w-5 h-5 text-red-600" />;
      default:
        return <Package className="w-5 h-5 text-orange-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100';
      case 'in-progress':
        return 'bg-blue-100';
      case 'cancelled':
        return 'bg-red-100';
      default:
        return 'bg-orange-100';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Completada';
      case 'in-progress':
        return 'En Proceso';
      case 'cancelled':
        return 'Cancelada';
      default:
        return 'Pendiente';
    }
  };

  const downloadFile = (filename: string, content: string, mimeType = 'text/plain') => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadReceipt = async (collection: Collection) => {
    try {
      const trace = await collectionsAPI.getTrace(collection.id);
      const certificateId = trace?.certificate?.certificateId || `CERT-${collection.id.slice(0, 8).toUpperCase()}`;
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const left = 15;
      let y = 20;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('Comprobante Digital de Entrega', left, y);

      y += 10;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      const details = [
        `Comprobante: ${certificateId}`,
        `Usuario: ${user?.name || 'N/A'} (${user?.email || 'N/A'})`,
        `Fecha programada: ${collection.scheduledDate || 'N/A'}`,
        `Fecha completada: ${collection.completedDate || 'N/A'}`,
        `Tipo de llanta: ${collection.tireType}`,
        `Cantidad: ${collection.tireCount}`,
        `Direccion: ${collection.address}`,
        `Puntos generados: ${collection.points}`,
        `QR trazabilidad: ${trace?.qrCode || 'N/A'}`,
        `Destino final: ${trace?.certificate?.destinationType || 'N/A'}`,
      ];

      details.forEach((line) => {
        const wrapped = doc.splitTextToSize(line, 180);
        doc.text(wrapped, left, y);
        y += wrapped.length * 6;
      });

      doc.save(`comprobante-${collection.id}.pdf`);
      toast.success('Comprobante descargado');
    } catch (error: any) {
      toast.error(error.message || 'No fue posible descargar el comprobante');
    }
  };

  const handleViewTrace = async (collectionId: string) => {
    try {
      setTraceLoading(true);
      const trace = await collectionsAPI.getTrace(collectionId);
      setSelectedTrace(trace as CollectionTrace);
      setTraceModalOpen(true);
    } catch (error: any) {
      toast.error(error.message || 'No fue posible cargar la trazabilidad');
    } finally {
      setTraceLoading(false);
    }
  };

  const handleCancelCollection = async (collection: Collection) => {
    const shouldCancel = window.confirm('Quieres cancelar esta solicitud de recoleccion?');
    if (!shouldCancel) return;

    try {
      setCancellingId(collection.id);
      await collectionsAPI.update(collection.id, { status: 'cancelled' });
      toast.success('Solicitud cancelada');
      await loadCollections();
    } catch (error: any) {
      toast.error(error.message || 'No se pudo cancelar la solicitud');
    } finally {
      setCancellingId(null);
    }
  };

  const handleExportReport = () => {
    const headers = [
      'id',
      'fecha_programada',
      'fecha_completada',
      'tipo_llanta',
      'cantidad_llantas',
      'estado',
      'direccion',
      'puntos',
    ];

    const rows = collections.map((item) => [
      item.id,
      item.scheduledDate || '',
      item.completedDate || '',
      item.tireType,
      String(item.tireCount),
      item.status,
      item.address.replace(/,/g, ' '),
      String(item.points),
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    downloadFile(`reporte-entregas-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8;');
    toast.success('Reporte descargado');
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white p-6 rounded-b-3xl">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="text-white hover:bg-white/20"
          >
            <ChevronLeft className="w-6 h-6" />
          </Button>
          <h1 className="text-xl font-bold">Historial</h1>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="bg-white/10 backdrop-blur border-white/20 p-3 text-center">
            <div className="text-2xl font-bold">
              {scopedCollections.filter(c => c.status === 'completed').length}
            </div>
            <div className="text-xs text-green-100">Completadas</div>
          </Card>
          <Card className="bg-white/10 backdrop-blur border-white/20 p-3 text-center">
            <div className="text-2xl font-bold">
              {scopedCollections.filter(c => c.status === 'in-progress').length}
            </div>
            <div className="text-xs text-green-100">En Proceso</div>
          </Card>
          <Card className="bg-white/10 backdrop-blur border-white/20 p-3 text-center">
            <div className="text-2xl font-bold">
              {scopedCollections.filter(c => c.status === 'pending').length}
            </div>
            <div className="text-xs text-green-100">Pendientes</div>
          </Card>
        </div>
      </div>

      <div className="p-4">
        <div className="flex gap-2 mb-4">
          <Button variant="outline" className="flex-1" onClick={handleExportReport}>
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Reporte CSV
          </Button>
        </div>

        {/* Filter Tabs */}
        <Tabs defaultValue="all" className="mb-6" onValueChange={(v) => setFilter(v as any)}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="all" className="text-xs">Todas</TabsTrigger>
            <TabsTrigger value="completed" className="text-xs">Completadas</TabsTrigger>
            <TabsTrigger value="in-progress" className="text-xs">En Proceso</TabsTrigger>
            <TabsTrigger value="pending" className="text-xs">Pendientes</TabsTrigger>
            <TabsTrigger value="cancelled" className="text-xs">Canceladas</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Loading State */}
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-green-600" />
          </div>
        ) : (
          <>
            {/* Collections List */}
            <div className="space-y-4">
              {filteredCollections.length === 0 ? (
                <Card className="p-8 text-center">
                  <Package className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                  <p className="text-gray-600">No hay recolecciones en esta categoría</p>
                </Card>
              ) : (
                filteredCollections.map((collection) => (
                  <Card key={collection.id} className="p-4 hover:shadow-lg transition-shadow cursor-pointer">
                    <div className="flex gap-4">
                      {/* Icon */}
                      <div className={`w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 ${getStatusColor(collection.status)}`}>
                        {getStatusIcon(collection.status)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="font-semibold">{collection.tireType}</h3>
                          <Badge variant={
                            collection.status === 'completed' ? 'default' :
                            collection.status === 'in-progress' ? 'secondary' :
                            'outline'
                          }>
                            {getStatusLabel(collection.status)}
                          </Badge>
                        </div>

                        <div className="space-y-2 text-sm text-gray-600">
                          <div className="flex items-center gap-2">
                            <Package className="w-4 h-4 flex-shrink-0" />
                            <span>{collection.tireCount} llantas</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 flex-shrink-0" />
                            <span className="truncate">{collection.address}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 flex-shrink-0" />
                            <span>
                              {collection.scheduledDate && 
                                new Date(collection.scheduledDate).toLocaleDateString('es-CO', {
                                  day: 'numeric',
                                  month: 'long',
                                  year: 'numeric'
                                })
                              }
                            </span>
                          </div>
                        </div>

                        {collection.description && (
                          <p className="text-sm text-gray-500 mt-2 line-clamp-2">
                            {collection.description}
                          </p>
                        )}

                        {/* Points */}
                        <div className="mt-3 flex items-center justify-between">
                          <span className="text-sm text-gray-500">
                            {collection.completedDate ? 
                              `Completada: ${new Date(collection.completedDate).toLocaleDateString('es-CO')}` :
                              'Programada'
                            }
                          </span>
                          <span className="text-green-600 font-semibold">
                            +{collection.points} puntos
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    {collection.status === 'pending' && (
                      <div className="mt-4 pt-4 border-t flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => handleCancelCollection(collection)}
                          disabled={cancellingId === collection.id}
                        >
                          {cancellingId === collection.id ? (
                            <>
                              <LoaderCircle className="w-4 h-4 mr-2 animate-spin" />
                              Cancelando...
                            </>
                          ) : (
                            'Cancelar'
                          )}
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1 bg-green-600 hover:bg-green-700"
                          onClick={() => navigate(`/history/${collection.id}`)}
                        >
                          <Route className="w-4 h-4 mr-2" />
                          Ver Detalle
                        </Button>
                      </div>
                    )}

                    {collection.status === 'completed' && (
                      <div className="mt-4 pt-4 border-t flex flex-col sm:flex-row gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="flex-1"
                          onClick={() => navigate(`/history/${collection.id}`)}
                        >
                          <Route className="w-4 h-4 mr-2" />
                          Ver Detalle
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => handleDownloadReceipt(collection)}
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Descargar Comprobante
                        </Button>
                      </div>
                    )}
                  </Card>
                ))
              )}
            </div>

            {/* Monthly Summary */}
            <Card className="p-6 mt-6 bg-gradient-to-br from-green-50 to-emerald-50">
              <h3 className="font-bold mb-4">Resumen del Mes</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-700">Total recolectado:</span>
                  <span className="font-semibold">{stats.totalTires} llantas</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-700">Puntos ganados:</span>
                  <span className="font-semibold text-green-600">{stats.totalPoints} puntos</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-700">Impacto ambiental:</span>
                  <span className="font-semibold text-emerald-600">{stats.co2Saved.toFixed(0)} kg CO₂</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-700">Peso reciclado:</span>
                  <span className="font-semibold text-emerald-700">{stats.recycledWeight.toFixed(0)} kg</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-700">Árboles equivalentes:</span>
                  <span className="font-semibold text-emerald-800">{stats.treesEquivalent}</span>
                </div>
              </div>
              <div className="mt-4 p-3 bg-white/70 rounded-lg text-sm text-emerald-800 flex items-center gap-2">
                <Leaf className="w-4 h-4" />
                Reporte apto para soporte de cumplimiento empresarial.
              </div>
            </Card>
          </>
        )}
      </div>

      <Dialog open={traceModalOpen} onOpenChange={setTraceModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trazabilidad de la Recoleccion</DialogTitle>
            <DialogDescription>
              Seguimiento desde el registro hasta destino final.
            </DialogDescription>
          </DialogHeader>

          {traceLoading ? (
            <div className="py-8 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-green-600" />
            </div>
          ) : selectedTrace ? (
            <div className="space-y-3 max-h-[50vh] overflow-auto pr-1">
              <Card className="p-3 bg-green-50 border-green-200">
                <p className="text-sm"><strong>QR:</strong> {selectedTrace.qrCode || 'N/A'}</p>
                <p className="text-sm"><strong>Etapa actual:</strong> {selectedTrace.currentStage || 'N/A'}</p>
                <p className="text-sm"><strong>Certificado:</strong> {selectedTrace.certificate?.certificateId || 'No emitido'}</p>
              </Card>

              {selectedTrace.events.length === 0 ? (
                <p className="text-sm text-gray-500">Sin eventos de trazabilidad registrados.</p>
              ) : (
                selectedTrace.events.map((event, index) => (
                  <Card key={`${event.timestamp}-${index}`} className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline">{event.stage}</Badge>
                      <span className="text-xs text-gray-500">
                        {new Date(event.timestamp).toLocaleString('es-CO')}
                      </span>
                    </div>
                    <p className="text-sm mt-2">{event.note}</p>
                    <p className="text-xs text-gray-500 mt-1">Actor: {event.actorType}</p>
                  </Card>
                ))
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No hay datos de trazabilidad para mostrar.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}