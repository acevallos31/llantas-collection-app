import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext.js';
import { marketplaceAPI } from '../services/api.js';
import type { MarketplaceOrder, MarketplaceProduct } from '../mockData.js';
import { Card } from '../components/ui/card.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Label } from '../components/ui/label.js';
import { Textarea } from '../components/ui/textarea.js';
import { Badge } from '../components/ui/badge.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { Loader2, Store, Plus, Trash2, Save, Pencil } from 'lucide-react';
import { toast } from 'sonner';

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
};

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

  const isAdmin = user?.type === 'admin';

  const editingProduct = useMemo(
    () => products.find((item) => item.id === editingId) || null,
    [products, editingId],
  );

  const loadData = async () => {
    try {
      setLoading(true);
      const [productsData, ordersData, options] = await Promise.all([
        marketplaceAPI.adminGetProducts(),
        marketplaceAPI.adminGetOrders(),
        marketplaceAPI.getFulfillmentOptions(),
      ]);
      setProducts(productsData || []);
      setOrders(ordersData || []);
      setCollectors(options.collectors || []);
      setPoints(options.points || []);
    } catch (error: any) {
      toast.error(error.message || 'No se pudo cargar marketplace admin');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!editingProduct) return;
    setForm({
      name: editingProduct.name || '',
      description: editingProduct.description || '',
      tireType: editingProduct.tireType || 'Automovil',
      tireCondition: editingProduct.tireCondition || 'buena',
      price: String(editingProduct.price || 0),
      stock: String(editingProduct.stock || 0),
      sellerType: editingProduct.sellerType || 'point',
      collectorId: editingProduct.collectorId || '',
      pointId: editingProduct.pointId || '',
      active: editingProduct.active !== false,
    });
  }, [editingProduct]);

  const clearForm = () => {
    setEditingId(null);
    setForm(defaultForm);
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
              <Card className="p-4 space-y-3">
                <h3 className="font-semibold flex items-center gap-2"><Plus className="w-4 h-4" /> {editingId ? 'Editar producto' : 'Nuevo producto'}</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>Nombre</Label>
                    <Input value={form.name} onChange={(e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Tipo de llanta</Label>
                    <Input value={form.tireType} onChange={(e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, tireType: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Condición</Label>
                    <Input value={form.tireCondition} onChange={(e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, tireCondition: e.target.value })} />
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

                <div className="flex items-center gap-2">
                  <Button size="sm" variant={form.active ? 'default' : 'outline'} onClick={() => setForm({ ...form, active: !form.active })}>
                    {form.active ? 'Activo' : 'Inactivo'}
                  </Button>
                </div>

                <div className="flex gap-2">
                  <Button onClick={() => void handleSave()} disabled={submitting}>
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1" /> Guardar</>}
                  </Button>
                  {editingId && (
                    <Button variant="outline" onClick={clearForm}>Cancelar edición</Button>
                  )}
                </div>
              </Card>

              <div className="space-y-3">
                {products.map((item) => (
                  <Card key={item.id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-sm text-gray-600">{item.tireType} • {item.tireCondition || 'N/A'} • L {Number(item.price || 0).toFixed(2)}</p>
                        <div className="mt-2 flex gap-2">
                          <Badge variant="outline">Stock {item.stock}</Badge>
                          <Badge variant="outline">{item.sellerType}</Badge>
                          <Badge variant="outline">{item.active ? 'activo' : 'inactivo'}</Badge>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setEditingId(item.id)}><Pencil className="w-4 h-4" /></Button>
                        <Button size="sm" variant="destructive" onClick={() => void handleDelete(item.id)}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </div>
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
                    <Badge variant="outline">{order.status}</Badge>
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
