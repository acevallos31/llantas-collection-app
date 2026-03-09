import { useEffect, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext.js';
import { marketplaceAPI, paymentsAPI } from '../services/api.js';
import type { MarketplaceOrder, MarketplaceProduct } from '../mockData.js';
import { Card } from '../components/ui/card.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Label } from '../components/ui/label.js';
import { Textarea } from '../components/ui/textarea.js';
import { Badge } from '../components/ui/badge.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { Loader2, Store, Plus, Trash2, Save, Pencil, Camera, Upload } from 'lucide-react';
import { toast } from 'sonner';

const marketplaceStatusLabel: Record<string, string> = {
  available: 'Disponible',
  pending: 'Pendiente',
  'in-progress': 'En ruta',
  'picked-up': 'Recogido',
  confirmed: 'Confirmado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

const getMarketplaceStatusLabel = (status: string) => marketplaceStatusLabel[status] || status;

const defaultForm = {
  name: '',
  description: '',
  tireType: 'Automovil',
  tireCondition: 'buena',
  price: '0',
  stock: '0',
  sellerType: 'point' as 'collector' | 'point' | 'mixed',
  collectorId: '',
  pointId: '',
  active: true,
  photoUrl: '',
};

const defaultAllowedTireTypes = ['Automóvil', 'Motocicleta', 'Camión', 'Bicicleta', 'Autobús'];
const defaultAllowedSaleConditions = ['excelente', 'buena'];

export default function AdminMarketplacePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);
  const [collectors, setCollectors] = useState<Array<{ id: string; name: string; phone?: string }>>([]);
  const [points, setPoints] = useState<Array<{ id: string; name: string; address?: string; phone?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [allowedTireTypes, setAllowedTireTypes] = useState<string[]>(defaultAllowedTireTypes);
  const [allowedSaleConditions, setAllowedSaleConditions] = useState<string[]>(defaultAllowedSaleConditions);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      tireType: allowedTireTypes.includes(prev.tireType) ? prev.tireType : (allowedTireTypes[0] || 'Automóvil'),
      tireCondition: allowedSaleConditions.includes(prev.tireCondition) ? prev.tireCondition : (allowedSaleConditions[0] || 'buena'),
    }));
  }, [allowedTireTypes, allowedSaleConditions]);

  const isAdmin = user?.type === 'admin';

  const loadData = async () => {
    try {
      setLoading(true);
      const [productsData, ordersData, options, collectorRates] = await Promise.all([
        marketplaceAPI.adminGetProducts(),
        marketplaceAPI.adminGetOrders(),
        marketplaceAPI.getFulfillmentOptions(),
        paymentsAPI.getCollectorRates(),
      ]);
      setProducts(productsData || []);
      setOrders(ordersData || []);
      setCollectors(options.collectors || []);
      setPoints(options.points || []);

      const activeRates = Array.isArray(collectorRates)
        ? collectorRates.filter((rate) => rate?.isActive !== false)
        : [];

      const typesFromDb = [...new Set(activeRates.map((rate: any) => String(rate?.tireType || '').trim()).filter(Boolean))];
      const conditionsFromDb = [...new Set(activeRates.map((rate: any) => String(rate?.tireCondition || '').trim().toLowerCase()).filter(Boolean))]
        .filter((condition) => ['excelente', 'buena'].includes(condition));

      if (typesFromDb.length > 0) {
        setAllowedTireTypes(typesFromDb);
      }
      if (conditionsFromDb.length > 0) {
        setAllowedSaleConditions(conditionsFromDb);
      }
    } catch (error: any) {
      toast.error(error.message || 'No se pudo cargar marketplace admin');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const startEditing = (product: MarketplaceProduct) => {
    setEditingId(product.id);
    setForm({
      name: product.name || '',
      description: product.description || '',
      tireType: product.tireType || 'Automovil',
      tireCondition: product.tireCondition || 'buena',
      price: String(product.price || 0),
      stock: String(product.stock || 0),
      sellerType: product.sellerType || 'point',
      collectorId: product.collectorId || '',
      pointId: product.pointId || '',
      active: product.active !== false,
      photoUrl: product.photoUrl || '',
    });
    setImagePreview(product.photoUrl || '');
  };

  const resolvePointName = (product: MarketplaceProduct) => {
    if (product.pointName) return product.pointName;
    if (!product.pointId) return 'Sin centro asignado';
    return points.find((point) => point.id === product.pointId)?.name || 'Centro no encontrado';
  };

  const clearForm = () => {
    setEditingId(null);
    setForm(defaultForm);
    setImagePreview('');
  };

  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar tipo de archivo
    if (!file.type.startsWith('image/')) {
      toast.error('Solo se permiten archivos de imagen');
      return;
    }

    // Validar tamaño (máximo 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('La imagen no debe superar 5MB');
      return;
    }

    // Convertir a base64
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      setImagePreview(base64String);
      setForm({ ...form, photoUrl: base64String });
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setImagePreview('');
    setForm({ ...form, photoUrl: '' });
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Nombre es obligatorio');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        name: form.name,
        description: form.description,
        tireType: form.tireType,
        tireCondition: form.tireCondition,
        price: Number(form.price || 0),
        stock: Number(form.stock || 0),
        sellerType: form.sellerType,
        collectorId: form.collectorId || undefined,
        pointId: form.pointId || undefined,
        active: form.active,
        photoUrl: form.photoUrl || undefined,
      };

      if (editingId) {
        await marketplaceAPI.adminUpdateProduct(editingId, payload);
        toast.success('Producto actualizado');
      } else {
        await marketplaceAPI.adminCreateProduct(payload);
        toast.success('Producto creado');
      }

      clearForm();
      await loadData();
    } catch (error: any) {
      toast.error(error.message || 'No se pudo guardar el producto');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (productId: string) => {
    if (!window.confirm('Eliminar este producto del marketplace?')) return;

    try {
      await marketplaceAPI.adminDeleteProduct(productId);
      toast.success('Producto eliminado');
      if (editingId === productId) {
        clearForm();
      }
      await loadData();
    } catch (error: any) {
      toast.error(error.message || 'No se pudo eliminar producto');
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, status: 'pending' | 'confirmed' | 'delivered' | 'cancelled') => {
    try {
      await marketplaceAPI.adminUpdateOrderStatus(orderId, status);
      toast.success('Estado de venta actualizado');
      await loadData();
    } catch (error: any) {
      toast.error(error.message || 'No se pudo actualizar estado de venta');
    }
  };

  const handleResetProducts = async () => {
    if (!window.confirm('¿Resetear todos los productos del marketplace? Esta acción eliminará y recreará todos los 59 productos con nuevas imágenes diferentes.')) return;

    const requiredPin = '310387';
    const enteredPin = window.prompt('Confirmación de seguridad: ingresa el PIN para continuar con el reseteo de productos.');
    if (enteredPin === null) {
      toast.info('Reseteo cancelado');
      return;
    }
    if (enteredPin.trim() !== requiredPin) {
      toast.error('PIN incorrecto. Reseteo cancelado.');
      return;
    }

    try {
      setLoading(true);
      const result = await marketplaceAPI.adminResetProducts();
      toast.success(`Productos regenerados exitosamente. Total: ${result.count}`);
      await loadData();
    } catch (error: any) {
      toast.error(error.message || 'No se pudieron resetear los productos');
    } finally {
      setLoading(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <Card className="max-w-lg mx-auto mt-10 p-6 text-center">
          <h2 className="font-bold text-lg">Acceso restringido</h2>
          <p className="text-sm text-gray-600 mt-2">Solo el administrador puede gestionar el marketplace.</p>
          <Button className="mt-4" onClick={() => navigate('/admin')}>Volver</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-gradient-to-r from-blue-900 to-cyan-700 text-white p-6 rounded-b-3xl">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Store className="w-6 h-6" /> Marketplace Admin</h1>
        <p className="text-sm text-cyan-100 mt-1">Gestiona catálogo y ventas por recolectores o centros de acopio.</p>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="py-12 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-700" />
          </div>
        ) : (
          <Tabs defaultValue="products" className="space-y-4">
            <TabsList className="grid grid-cols-2">
              <TabsTrigger value="products">Productos</TabsTrigger>
              <TabsTrigger value="sales">Ventas</TabsTrigger>
            </TabsList>

            <TabsContent value="products" className="space-y-4">
              {!editingId && (
                <Card className="p-4 space-y-3">
                  <h3 className="font-semibold flex items-center gap-2"><Plus className="w-4 h-4" /> Nuevo producto</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>Nombre</Label>
                    <Input value={form.name} onChange={(e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Tipo de llanta</Label>
                    <select
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={form.tireType}
                      onChange={(e) => setForm({ ...form, tireType: e.target.value })}
                    >
                      {allowedTireTypes.map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>Condición</Label>
                    <select
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={form.tireCondition}
                      onChange={(e) => setForm({ ...form, tireCondition: e.target.value })}
                    >
                      {allowedSaleConditions.map((condition) => (
                        <option key={condition} value={condition}>{condition}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>Precio (L)</Label>
                    <Input type="number" value={form.price} onChange={(e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, price: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Stock</Label>
                    <Input type="number" value={form.stock} onChange={(e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, stock: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Canal de venta</Label>
                    <select
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={form.sellerType}
                      onChange={(e) => setForm({ ...form, sellerType: e.target.value as 'collector' | 'point' | 'mixed' })}
                    >
                      <option value="collector">Recolector</option>
                      <option value="point">Centro de acopio</option>
                      <option value="mixed">Ambos</option>
                    </select>
                  </div>
                </div>

                {(form.sellerType === 'collector' || form.sellerType === 'mixed') && (
                  <div className="space-y-1">
                    <Label>Recolector asignado</Label>
                    <select
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={form.collectorId}
                      onChange={(e) => setForm({ ...form, collectorId: e.target.value })}
                    >
                      <option value="">Sin asignar</option>
                      {collectors.map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {(form.sellerType === 'point' || form.sellerType === 'mixed') && (
                  <div className="space-y-1">
                    <Label>Centro asignado</Label>
                    <select
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={form.pointId}
                      onChange={(e) => setForm({ ...form, pointId: e.target.value })}
                    >
                      <option value="">Sin asignar</option>
                      {points.map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="space-y-1">
                  <Label>Descripción</Label>
                  <Textarea value={form.description} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, description: e.target.value })} rows={2} />
                </div>

                <div className="space-y-2">
                  <Label>Foto del producto</Label>
                  <div className="flex items-center gap-2">
                    <label htmlFor="photo-upload" className="cursor-pointer">
                      <div className="flex items-center gap-2 px-4 py-2 border border-input rounded-md bg-background hover:bg-gray-50 transition-colors">
                        <Upload className="w-4 h-4" />
                        <span className="text-sm">Subir imagen</span>
                      </div>
                      <input
                        id="photo-upload"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageChange}
                      />
                    </label>
                    <label htmlFor="photo-camera" className="cursor-pointer">
                      <div className="flex items-center gap-2 px-4 py-2 border border-input rounded-md bg-background hover:bg-gray-50 transition-colors">
                        <Camera className="w-4 h-4" />
                        <span className="text-sm">Tomar foto</span>
                      </div>
                      <input
                        id="photo-camera"
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={handleImageChange}
                      />
                    </label>
                  </div>
                  {imagePreview && (
                    <div className="relative w-32 h-32 mt-2">
                      <img src={imagePreview} alt="Preview" className="w-full h-full object-cover rounded-md border" />
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        className="absolute -top-2 -right-2 h-6 w-6 p-0 rounded-full"
                        onClick={handleRemoveImage}
                      >
                        ×
                      </Button>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button size="sm" variant={form.active ? 'default' : 'outline'} onClick={() => setForm({ ...form, active: !form.active })}>
                    {form.active ? 'Activo' : 'Inactivo'}
                  </Button>
                </div>

                  <div className="flex gap-2">
                    <Button onClick={() => void handleSave()} disabled={submitting}>
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1" /> Guardar</>}
                    </Button>
                  </div>
                </Card>
              )}

              <Card className="p-4 bg-amber-50 border-amber-200">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-amber-900">Regenerar productos del marketplace</h3>
                    <p className="text-sm text-amber-700 mt-1">Elimina y recrea todos los productos con 59 imágenes diferentes variadas</p>
                  </div>
                  <Button 
                    variant="outline" 
                    className="border-amber-400 text-amber-700 hover:bg-amber-100"
                    onClick={() => void handleResetProducts()}
                    disabled={loading || submitting}
                  >
                    Resetear Productos
                  </Button>
                </div>
              </Card>

              <div className="space-y-3">
                {products.map((item) => (
                  <Card key={item.id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-3">
                        <div className="w-16 h-16 rounded-md border bg-gray-100 overflow-hidden shrink-0">
                          {item.photoUrl ? (
                            <img src={item.photoUrl} alt={item.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">Sin foto</div>
                          )}
                        </div>
                        <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-sm text-gray-600">{item.tireType} • {item.tireCondition || 'N/A'} • L {Number(item.price || 0).toFixed(2)}</p>
                        {(item.sellerType === 'point' || item.sellerType === 'mixed') && (
                          <p className="text-xs text-blue-700 mt-1">Centro: {resolvePointName(item)}</p>
                        )}
                        <div className="mt-2 flex gap-2">
                          <Badge variant="outline">Stock {item.stock}</Badge>
                          <Badge variant="outline">{item.sellerType}</Badge>
                          <Badge variant="outline">{item.active ? 'activo' : 'inactivo'}</Badge>
                        </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => startEditing(item)}><Pencil className="w-4 h-4" /></Button>
                        <Button size="sm" variant="destructive" onClick={() => void handleDelete(item.id)}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </div>

                    {editingId === item.id && (
                      <div className="mt-4 pt-4 border-t border-blue-200 space-y-3 bg-blue-50 rounded p-3">
                        <p className="text-sm font-semibold text-blue-800">Editando este producto</p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label>Nombre</Label>
                            <Input value={form.name} onChange={(e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, name: e.target.value })} />
                          </div>
                          <div className="space-y-1">
                            <Label>Tipo de llanta</Label>
                            <select
                              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                              value={form.tireType}
                              onChange={(e) => setForm({ ...form, tireType: e.target.value })}
                            >
                              {allowedTireTypes.map((type) => (
                                <option key={type} value={type}>{type}</option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <Label>Condición</Label>
                            <select
                              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                              value={form.tireCondition}
                              onChange={(e) => setForm({ ...form, tireCondition: e.target.value })}
                            >
                              {allowedSaleConditions.map((condition) => (
                                <option key={condition} value={condition}>{condition}</option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <Label>Precio (L)</Label>
                            <Input type="number" value={form.price} onChange={(e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, price: e.target.value })} />
                          </div>
                          <div className="space-y-1">
                            <Label>Stock</Label>
                            <Input type="number" value={form.stock} onChange={(e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, stock: e.target.value })} />
                          </div>
                          <div className="space-y-1">
                            <Label>Canal de venta</Label>
                            <select
                              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                              value={form.sellerType}
                              onChange={(e) => setForm({ ...form, sellerType: e.target.value as 'collector' | 'point' | 'mixed' })}
                            >
                              <option value="collector">Recolector</option>
                              <option value="point">Centro de acopio</option>
                              <option value="mixed">Ambos</option>
                            </select>
                          </div>
                        </div>

                        {(form.sellerType === 'collector' || form.sellerType === 'mixed') && (
                          <div className="space-y-1">
                            <Label>Recolector asignado</Label>
                            <select
                              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                              value={form.collectorId}
                              onChange={(e) => setForm({ ...form, collectorId: e.target.value })}
                            >
                              <option value="">Sin asignar</option>
                              {collectors.map((collector) => (
                                <option key={collector.id} value={collector.id}>{collector.name}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {(form.sellerType === 'point' || form.sellerType === 'mixed') && (
                          <div className="space-y-1">
                            <Label>Centro asignado</Label>
                            <select
                              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                              value={form.pointId}
                              onChange={(e) => setForm({ ...form, pointId: e.target.value })}
                            >
                              <option value="">Sin asignar</option>
                              {points.map((point) => (
                                <option key={point.id} value={point.id}>{point.name}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        <div className="space-y-1">
                          <Label>Descripción</Label>
                          <Textarea value={form.description} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, description: e.target.value })} rows={2} />
                        </div>

                        <div className="space-y-2">
                          <Label>Foto del producto</Label>
                          <div className="flex items-center gap-2">
                            <label htmlFor={`photo-upload-inline-${item.id}`} className="cursor-pointer">
                              <div className="flex items-center gap-2 px-4 py-2 border border-input rounded-md bg-background hover:bg-gray-50 transition-colors">
                                <Upload className="w-4 h-4" />
                                <span className="text-sm">Subir imagen</span>
                              </div>
                              <input
                                id={`photo-upload-inline-${item.id}`}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleImageChange}
                              />
                            </label>
                            <label htmlFor={`photo-camera-inline-${item.id}`} className="cursor-pointer">
                              <div className="flex items-center gap-2 px-4 py-2 border border-input rounded-md bg-background hover:bg-gray-50 transition-colors">
                                <Camera className="w-4 h-4" />
                                <span className="text-sm">Tomar foto</span>
                              </div>
                              <input
                                id={`photo-camera-inline-${item.id}`}
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className="hidden"
                                onChange={handleImageChange}
                              />
                            </label>
                          </div>
                          {imagePreview && (
                            <div className="relative w-24 h-24 mt-2">
                              <img src={imagePreview} alt="Preview" className="w-full h-full object-cover rounded-md border" />
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                className="absolute -top-2 -right-2 h-6 w-6 p-0 rounded-full"
                                onClick={handleRemoveImage}
                              >
                                ×
                              </Button>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <Button size="sm" variant={form.active ? 'default' : 'outline'} onClick={() => setForm({ ...form, active: !form.active })}>
                            {form.active ? 'Activo' : 'Inactivo'}
                          </Button>
                        </div>

                        <div className="flex gap-2">
                          <Button onClick={() => void handleSave()} disabled={submitting}>
                            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1" /> Guardar cambios</>}
                          </Button>
                          <Button variant="outline" onClick={clearForm}>Cancelar edición</Button>
                        </div>
                      </div>
                    )}
                  </Card>
                ))}

                {products.length === 0 && (
                  <Card className="p-4">
                    <p className="text-sm text-gray-600">No hay productos creados.</p>
                  </Card>
                )}
              </div>
            </TabsContent>

            <TabsContent value="sales" className="space-y-3">
              {orders.map((order) => (
                <Card key={order.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{order.productName}</p>
                      <p className="text-sm text-gray-600">Comprador: {order.buyerName || order.buyerId}</p>
                      <p className="text-sm text-gray-600">Cantidad: {order.quantity} • Total: L {Number(order.totalAmount || 0).toFixed(2)}</p>
                      <p className="text-xs text-gray-500 mt-1">{new Date(order.createdAt).toLocaleString()}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {order.fulfillmentType === 'collector'
                          ? `Entrega por recolector: ${order.collectorName || 'N/A'}`
                          : `Entrega en centro: ${order.pointName || 'N/A'}`}
                      </p>
                    </div>
                    <Badge variant="outline">{getMarketplaceStatusLabel(order.status)}</Badge>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => void handleUpdateOrderStatus(order.id, 'pending')}>Pendiente</Button>
                    <Button size="sm" variant="outline" onClick={() => void handleUpdateOrderStatus(order.id, 'confirmed')}>Confirmada</Button>
                    <Button size="sm" variant="outline" onClick={() => void handleUpdateOrderStatus(order.id, 'delivered')}>Entregada</Button>
                    <Button size="sm" variant="destructive" onClick={() => void handleUpdateOrderStatus(order.id, 'cancelled')}>Cancelar</Button>
                  </div>
                </Card>
              ))}

              {orders.length === 0 && (
                <Card className="p-4">
                  <p className="text-sm text-gray-600">No hay ventas registradas en el marketplace.</p>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
