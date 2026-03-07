import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext.tsx';
import { collectionsAPI } from '../services/api.ts';
import type { Collection } from '../mockData.ts';
import { Card } from '../components/ui/card.tsx';
import { Button } from '../components/ui/button.tsx';
import { Badge } from '../components/ui/badge.tsx';
import { Loader2, Truck, MapPin, CheckCircle2, PlayCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function CollectorDashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const isCollector = user?.type === 'collector';

  useEffect(() => {
    if (!isCollector) return;
    void loadCollections();
  }, [isCollector]);

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

  const updateStatus = async (collectionId: string, status: 'in-progress' | 'completed') => {
    try {
      setUpdatingId(collectionId);
      await collectionsAPI.update(collectionId, { status });
      toast.success(status === 'completed' ? 'Recolección completada' : 'Recolección tomada');
      await loadCollections();
    } catch (error: any) {
      toast.error(error.message || 'No se pudo actualizar el estado');
    } finally {
      setUpdatingId(null);
    }
  };

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
    </div>
  );
}
