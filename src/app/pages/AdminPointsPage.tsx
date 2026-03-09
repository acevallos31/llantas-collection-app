import { useEffect, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext.tsx';
import { collectionsAPI, pointsAPI } from '../services/api.ts';
import type { CollectionPoint } from '../mockData.ts';
import { Card } from '../components/ui/card.tsx';
import { Button } from '../components/ui/button.tsx';
import { Input } from '../components/ui/input.tsx';
import { Label } from '../components/ui/label.tsx';
import { Textarea } from '../components/ui/textarea.tsx';
import { Badge } from '../components/ui/badge.tsx';
import { ChevronLeft, Loader2, Plus, Trash2, Save, PackageSearch, ClipboardPlus, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';

type ArrivalCandidate = {
  id: string;
  tireCount?: number;
  tireType?: string;
  status?: string;
  destinationPointId?: string;
  arrivedAtPoint?: string;
};

type PointInventoryResponse = {
  point: CollectionPoint & { occupancyRate?: number; availableCapacity?: number };
  inventory: Array<{
    id: string;
    collectionId: string;
    arrivedAt: string;
    tireCount?: number;
    tireType?: string;
    weightKg?: number | null;
    notes?: string | null;
  }>;
  summary: {
    totalCollections: number;
    totalTires: number;
    totalWeightKg: number;
    tireTypeBreakdown: Record<string, number>;
  };
};

export default function AdminPointsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [points, setPoints] = useState<CollectionPoint[]>([]);
  const [collections, setCollections] = useState<ArrivalCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [selectedPointId, setSelectedPointId] = useState<string>('');
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [arrivalSubmitting, setArrivalSubmitting] = useState(false);
  const [inventoryData, setInventoryData] = useState<PointInventoryResponse | null>(null);

  const [form, setForm] = useState({
    name: '',
    address: '',
    lat: '15.5042',
    lng: '-88.0250',
    capacity: '700',
    hours: 'Lun-Sab: 8:00 AM - 6:00 PM',
    phone: '+504 2550-0000',
  });

  const [arrivalForm, setArrivalForm] = useState({
    collectionId: '',
    tireCount: '',
    tireType: '',
    weightKg: '',
    notes: '',
  });

  const [editForm, setEditForm] = useState({
    name: '',
    address: '',
    lat: '',
    lng: '',
    capacity: '',
    hours: '',
    phone: '',
  });

  const isAdmin = user?.type === 'admin';

  useEffect(() => {
    if (!isAdmin) return;
    void Promise.all([loadPoints(), loadCollections()]);
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

  const loadCollections = async () => {
    try {
      const data = await collectionsAPI.getAll();
      setCollections((data || []) as ArrivalCandidate[]);
    } catch {
      setCollections([]);
    }
  };

  const loadInventory = async (pointId: string) => {
    try {
      setInventoryLoading(true);
      const data = await pointsAPI.getInventory(pointId);
      setInventoryData(data as PointInventoryResponse);
      setSelectedPointId(pointId);
    } catch (error: any) {
      toast.error(error.message || 'No se pudo cargar el inventario del centro');
      setInventoryData(null);
    } finally {
      setInventoryLoading(false);
    }
  };

  const handleRegisterArrival = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedPointId || !arrivalForm.collectionId) {
      toast.error('Selecciona un centro y una recolección');
      return;
    }

    try {
      setArrivalSubmitting(true);
      await pointsAPI.registerArrival(selectedPointId, {
        collectionId: arrivalForm.collectionId,
        tireCount: arrivalForm.tireCount ? Number(arrivalForm.tireCount) : undefined,
        tireType: arrivalForm.tireType || undefined,
        weightKg: arrivalForm.weightKg ? Number(arrivalForm.weightKg) : undefined,
        notes: arrivalForm.notes || undefined,
      });

      toast.success('Llegada registrada en inventario');
      setArrivalForm({
        collectionId: '',
        tireCount: '',
        tireType: '',
        weightKg: '',
        notes: '',
      });

      await Promise.all([loadInventory(selectedPointId), loadPoints(), loadCollections()]);
    } catch (error: any) {
      toast.error(error.message || 'No se pudo registrar la llegada');
    } finally {
      setArrivalSubmitting(false);
    }
  };

  const pendingCollections = collections.filter((collection) => {
    const status = String(collection.status || '').toLowerCase();
    return !collection.destinationPointId
      && !collection.arrivedAtPoint
      && status !== 'completed'
      && status !== 'cancelled';
  });

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

  const startEdit = (point: CollectionPoint) => {
    setEditingId(point.id);
    setEditForm({
      name: point.name || '',
      address: point.address || '',
      lat: String(point.coordinates?.lat ?? ''),
      lng: String(point.coordinates?.lng ?? ''),
      capacity: String(point.capacity ?? 0),
      hours: point.hours || '',
      phone: point.phone || '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditSubmitting(false);
  };

  const saveEdit = async (pointId: string) => {
    if (!editForm.name || !editForm.address) {
      toast.error('Nombre y dirección son obligatorios');
      return;
    }

    try {
      setEditSubmitting(true);
      await pointsAPI.update(pointId, {
        name: editForm.name,
        address: editForm.address,
        coordinates: {
          lat: Number(editForm.lat),
          lng: Number(editForm.lng),
        },
        capacity: Number(editForm.capacity),
        hours: editForm.hours,
        phone: editForm.phone,
      });

      toast.success('Centro actualizado');
      setEditingId(null);
      await loadPoints();
      if (selectedPointId === pointId) {
        await loadInventory(pointId);
      }
    } catch (error: any) {
      toast.error(error.message || 'No se pudo actualizar el centro');
    } finally {
      setEditSubmitting(false);
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
                <div
                  key={point.id}
                  className={`border rounded-lg p-3 gap-3 ${editingId === point.id ? 'flex flex-col' : 'flex items-start justify-between'}`}
                >
                  <div className="flex-1 min-w-0 w-full">
                    {editingId === point.id ? (
                      <div className="space-y-2 w-full">
                        <div className="space-y-1">
                          <Label className="text-xs">Nombre</Label>
                          <Input className="w-full" value={editForm.name} onChange={(e: ChangeEvent<HTMLInputElement>) => setEditForm({ ...editForm, name: e.target.value })} placeholder="Nombre" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Dirección</Label>
                          <Textarea className="w-full" value={editForm.address} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setEditForm({ ...editForm, address: e.target.value })} rows={2} placeholder="Dirección" />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Latitud</Label>
                            <Input className="w-full" value={editForm.lat} onChange={(e: ChangeEvent<HTMLInputElement>) => setEditForm({ ...editForm, lat: e.target.value })} placeholder="Latitud" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Longitud</Label>
                            <Input className="w-full" value={editForm.lng} onChange={(e: ChangeEvent<HTMLInputElement>) => setEditForm({ ...editForm, lng: e.target.value })} placeholder="Longitud" />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Capacidad</Label>
                            <Input className="w-full" type="number" value={editForm.capacity} onChange={(e: ChangeEvent<HTMLInputElement>) => setEditForm({ ...editForm, capacity: e.target.value })} placeholder="Capacidad" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Teléfono</Label>
                            <Input className="w-full" value={editForm.phone} onChange={(e: ChangeEvent<HTMLInputElement>) => setEditForm({ ...editForm, phone: e.target.value })} placeholder="Teléfono" />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Horario</Label>
                          <Input className="w-full" value={editForm.hours} onChange={(e: ChangeEvent<HTMLInputElement>) => setEditForm({ ...editForm, hours: e.target.value })} placeholder="Horario" />
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="font-medium">{point.name}</p>
                        <p className="text-sm text-gray-600">{point.address}</p>
                        <div className="flex gap-2 mt-1">
                          <Badge variant="outline">Cap: {point.capacity}</Badge>
                          <Badge variant="outline">Carga: {point.currentLoad}</Badge>
                        </div>
                      </>
                    )}
                  </div>

                  <div className={`flex gap-2 ${editingId === point.id ? 'w-full justify-end' : ''}`}>
                    {editingId === point.id ? (
                      <>
                        <Button
                          size="sm"
                          onClick={() => void saveEdit(point.id)}
                          disabled={editSubmitting}
                        >
                          {editSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Guardar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={cancelEdit}
                          disabled={editSubmitting}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startEdit(point)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void loadInventory(point.id)}
                      disabled={editingId === point.id}
                    >
                      <PackageSearch className="w-4 h-4 mr-1" /> Inventario
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(point.id)}
                      disabled={deletingId === point.id || editingId === point.id}
                    >
                      {deletingId === point.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <PackageSearch className="w-4 h-4" /> Inventario por centro
          </h2>

          {!selectedPointId ? (
            <p className="text-sm text-gray-600">Selecciona "Inventario" en un centro para administrar sus entradas.</p>
          ) : inventoryLoading ? (
            <div className="py-8 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-green-600" />
            </div>
          ) : inventoryData ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <Badge variant="outline">Centro: {inventoryData.point.name}</Badge>
                <Badge variant="outline">Recolecciones: {inventoryData.summary.totalCollections}</Badge>
                <Badge variant="outline">Llantas: {inventoryData.summary.totalTires}</Badge>
                <Badge variant="outline">Peso: {Number(inventoryData.summary.totalWeightKg || 0).toFixed(2)} kg</Badge>
              </div>

              <form className="space-y-3 border rounded-lg p-3" onSubmit={handleRegisterArrival}>
                <h3 className="font-medium flex items-center gap-2">
                  <ClipboardPlus className="w-4 h-4" /> Registrar llegada de recolección
                </h3>

                <div className="space-y-1">
                  <Label>Recolección</Label>
                  <select
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={arrivalForm.collectionId}
                    onChange={(e) => setArrivalForm({ ...arrivalForm, collectionId: e.target.value })}
                  >
                    <option value="">Seleccionar recolección pendiente</option>
                    {pendingCollections.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.id.slice(0, 8)} - {item.tireCount || 0} llantas - {item.tireType || 'N/A'}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>Cantidad de llantas</Label>
                    <Input
                      type="number"
                      min={0}
                      value={arrivalForm.tireCount}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setArrivalForm({ ...arrivalForm, tireCount: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Tipo</Label>
                    <Input
                      value={arrivalForm.tireType}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setArrivalForm({ ...arrivalForm, tireType: e.target.value })}
                      placeholder="Automovil, Camion..."
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>Peso (kg)</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={arrivalForm.weightKg}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setArrivalForm({ ...arrivalForm, weightKg: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Nota</Label>
                    <Input
                      value={arrivalForm.notes}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setArrivalForm({ ...arrivalForm, notes: e.target.value })}
                      placeholder="Observaciones"
                    />
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={arrivalSubmitting || pendingCollections.length === 0}>
                  {arrivalSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardPlus className="w-4 h-4 mr-2" />}
                  Registrar llegada
                </Button>

                {pendingCollections.length === 0 && (
                  <p className="text-xs text-gray-500">No hay recolecciones pendientes disponibles para registrar.</p>
                )}
              </form>

              <div className="space-y-2">
                <h3 className="font-medium">Entradas registradas</h3>
                {inventoryData.inventory.length === 0 ? (
                  <p className="text-sm text-gray-600">No hay entradas en el inventario de este centro.</p>
                ) : (
                  inventoryData.inventory.map((entry) => (
                    <div key={entry.id} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-sm">Recoleccion {entry.collectionId.slice(0, 8)}</p>
                        <Badge variant="outline">{new Date(entry.arrivedAt).toLocaleDateString('es-HN')}</Badge>
                      </div>
                      <p className="text-sm text-gray-700 mt-1">
                        {entry.tireCount || 0} llantas · {entry.tireType || 'N/A'}
                        {entry.weightKg ? ` · ${entry.weightKg} kg` : ''}
                      </p>
                      {entry.notes ? <p className="text-xs text-gray-500 mt-1">{entry.notes}</p> : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-600">No se pudo cargar el inventario.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
