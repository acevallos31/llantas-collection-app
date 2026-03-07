import { useEffect, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext.tsx';
import { pointsAPI } from '../services/api.ts';
import type { CollectionPoint } from '../mockData.ts';
import { Card } from '../components/ui/card.tsx';
import { Button } from '../components/ui/button.tsx';
import { Input } from '../components/ui/input.tsx';
import { Label } from '../components/ui/label.tsx';
import { Textarea } from '../components/ui/textarea.tsx';
import { Badge } from '../components/ui/badge.tsx';
import { ChevronLeft, Loader2, Plus, Trash2, Save } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminPointsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [points, setPoints] = useState<CollectionPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    address: '',
    lat: '15.5042',
    lng: '-88.0250',
    capacity: '700',
    hours: 'Lun-Sab: 8:00 AM - 6:00 PM',
    phone: '+504 2550-0000',
  });

  const isAdmin = user?.type === 'admin';

  useEffect(() => {
    if (!isAdmin) return;
    void loadPoints();
  }, [isAdmin]);

  const loadPoints = async () => {
    try {
      setLoading(true);
      const data = await pointsAPI.getAll();
      setPoints(data || []);
    } catch (error: any) {
      toast.error(error.message || 'No se pudieron cargar los centros de acopio');
      setPoints([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.address) {
      toast.error('Nombre y dirección son obligatorios');
      return;
    }

    try {
      setSubmitting(true);
      await pointsAPI.create({
        name: form.name,
        address: form.address,
        coordinates: { lat: Number(form.lat), lng: Number(form.lng) },
        capacity: Number(form.capacity),
        currentLoad: 0,
        hours: form.hours,
        phone: form.phone,
      });

      toast.success('Centro de acopio creado');
      setForm({
        name: '',
        address: '',
        lat: '15.5042',
        lng: '-88.0250',
        capacity: '700',
        hours: 'Lun-Sab: 8:00 AM - 6:00 PM',
        phone: '+504 2550-0000',
      });
      await loadPoints();
    } catch (error: any) {
      toast.error(error.message || 'No se pudo crear el centro');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (pointId: string) => {
    if (!window.confirm('Eliminar este centro de acopio?')) return;

    try {
      setDeletingId(pointId);
      await pointsAPI.remove(pointId);
      toast.success('Centro eliminado');
      await loadPoints();
    } catch (error: any) {
      toast.error(error.message || 'No se pudo eliminar el centro');
    } finally {
      setDeletingId(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <Card className="max-w-lg mx-auto mt-10 p-6 text-center">
          <h2 className="font-bold text-lg">Acceso restringido</h2>
          <p className="text-sm text-gray-600 mt-2">Este panel administrativo está habilitado solo para administradores.</p>
          <Button className="mt-4" onClick={() => navigate('/home')}>Volver</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 text-white p-6 rounded-b-3xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={() => navigate(-1)}>
            <ChevronLeft className="w-6 h-6" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Administrador de Centros</h1>
            <p className="text-sm text-slate-200">Crear y eliminar centros de acopio.</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <Card className="p-4">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <Plus className="w-4 h-4" /> Nuevo centro
          </h2>

          <form className="space-y-3" onSubmit={handleCreate}>
            <div className="space-y-1">
              <Label>Nombre</Label>
              <Input value={form.name} onChange={(e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, name: e.target.value })} />
            </div>

            <div className="space-y-1">
              <Label>Dirección</Label>
              <Textarea value={form.address} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, address: e.target.value })} rows={2} />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Latitud</Label>
                <Input value={form.lat} onChange={(e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, lat: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Longitud</Label>
                <Input value={form.lng} onChange={(e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, lng: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Capacidad</Label>
                <Input type="number" value={form.capacity} onChange={(e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, capacity: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Teléfono</Label>
                <Input value={form.phone} onChange={(e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Horario</Label>
              <Input value={form.hours} onChange={(e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, hours: e.target.value })} />
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Guardar centro
            </Button>
          </form>
        </Card>

        <Card className="p-4">
          <h2 className="font-semibold mb-3">Centros registrados</h2>

          {loading ? (
            <div className="py-8 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-green-600" />
            </div>
          ) : points.length === 0 ? (
            <p className="text-sm text-gray-600">No hay centros de acopio creados.</p>
          ) : (
            <div className="space-y-2">
              {points.map((point) => (
                <div key={point.id} className="border rounded-lg p-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{point.name}</p>
                    <p className="text-sm text-gray-600">{point.address}</p>
                    <div className="flex gap-2 mt-1">
                      <Badge variant="outline">Cap: {point.capacity}</Badge>
                      <Badge variant="outline">Carga: {point.currentLoad}</Badge>
                    </div>
                  </div>

                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(point.id)}
                    disabled={deletingId === point.id}
                  >
                    {deletingId === point.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
