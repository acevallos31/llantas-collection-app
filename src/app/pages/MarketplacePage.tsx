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
import { Loader2, ShoppingCart, Store, Truck, MapPin, Plus, Minus } from 'lucide-react';
import { toast } from 'sonner';

type CartItem = {
  productId: string;
  quantity: number;
};

export default function MarketplacePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);
  const [collectors, setCollectors] = useState<Array<{ id: string; name: string; phone?: string }>>([]);
  const [points, setPoints] = useState<Array<{ id: string; name: string; address?: string; phone?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [fulfillmentType, setFulfillmentType] = useState<'collector' | 'point'>('collector');
  const [collectorId, setCollectorId] = useState('');
  const [pointId, setPointId] = useState('');
  const [notes, setNotes] = useState('');

  const isClient = user?.type === 'cliente';

  const cartRows = useMemo(() => {
    return cart.map((line) => {
      const product = products.find((item) => item.id === line.productId);
      if (!product) return null;
      return {
        product,
        quantity: line.quantity,
        subtotal: Number((Number(product.price || 0) * line.quantity).toFixed(2)),
      };
    }).filter(Boolean) as Array<{ product: MarketplaceProduct; quantity: number; subtotal: number }>;
  }, [cart, products]);

  const cartTotal = useMemo(
    () => cartRows.reduce((sum, row) => sum + row.subtotal, 0),
    [cartRows],
  );

  const cartCount = useMemo(
    () => cartRows.reduce((sum, row) => sum + row.quantity, 0),
    [cartRows],
  );

  const loadData = async () => {
    try {
      setLoading(true);
      const [productsData, ordersData, options] = await Promise.all([
        marketplaceAPI.getProducts(),
        marketplaceAPI.getMyOrders(),
        marketplaceAPI.getFulfillmentOptions(),
      ]);
      setProducts(productsData || []);
      setOrders(ordersData || []);
      setCollectors(options.collectors || []);
      setPoints(options.points || []);
    } catch (error: any) {
      toast.error(error.message || 'No se pudo cargar el marketplace');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const addToCart = (productId: string) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === productId);
      if (existing) {
        return prev.map((item) => item.productId === productId ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { productId, quantity: 1 }];
    });
    toast.success('Producto agregado al carrito');
  };

  const changeQty = (productId: string, delta: number) => {
    setCart((prev) => prev
      .map((item) => item.productId === productId ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item)
      .filter((item) => item.quantity > 0));
  };

  const removeLine = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  };

  const handleCheckout = async () => {
    if (cartRows.length === 0) {
      toast.error('Tu carrito está vacío');
      return;
    }

    if (fulfillmentType === 'point' && !pointId) {
      toast.error('Selecciona un centro de acopio para la venta');
      return;
    }

    try {
      setSubmitting(true);
      await marketplaceAPI.createOrder({
        cartItems: cartRows.map((item) => ({ productId: item.product.id, quantity: item.quantity })),
        fulfillmentType,
        collectorId: fulfillmentType === 'collector' ? (collectorId || undefined) : undefined,
        pointId: fulfillmentType === 'point' ? pointId : undefined,
        notes,
      });

      toast.success('Compra registrada correctamente');
      setCart([]);
      setNotes('');
      await loadData();
    } catch (error: any) {
      toast.error(error.message || 'No se pudo completar la compra');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isClient) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <Card className="max-w-lg mx-auto mt-10 p-6 text-center">
          <h2 className="font-bold text-lg">Acceso restringido</h2>
          <p className="text-sm text-gray-600 mt-2">Este panel de marketplace está disponible para usuarios tipo cliente.</p>
          <Button className="mt-4" onClick={() => navigate('/home')}>Volver</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-gradient-to-r from-sky-900 via-blue-700 to-cyan-600 text-white p-6 rounded-b-3xl">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Store className="w-6 h-6" /> Marketplace</h1>
        <p className="text-sm text-sky-100 mt-1">Compra llantas disponibles y elige entrega por recolector o centro de acopio.</p>
        <p className="text-xs text-sky-100 mt-1">Incluye lotes de automovil, camion y motocicleta con fotos y numeracion.</p>
      </div>

      <div className="p-4 space-y-4">
        {loading ? (
          <div className="py-12 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-sky-600" />
          </div>
        ) : (
          <Tabs defaultValue="products" className="space-y-4">
            <TabsList className="grid grid-cols-2">
              <TabsTrigger value="products">Productos</TabsTrigger>
              <TabsTrigger value="orders">Mis compras</TabsTrigger>
            </TabsList>

            <TabsContent value="products" className="space-y-4">
              {products.length === 0 ? (
                <Card className="p-4">
                  <p className="text-sm text-gray-600">No hay llantas publicadas en este momento.</p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {products.map((item) => (
                    <Card key={item.id} className="p-4">
                      <div className="space-y-3">
                        <div className="aspect-[16/10] rounded-md overflow-hidden bg-slate-100">
                          <img
                            src={item.photoUrl || item.photoUrls?.[0] || 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=1200&q=80'}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div>
                          <p className="font-semibold">{item.name}</p>
                          <p className="text-sm text-gray-600 mt-1">{item.description || 'Sin descripción'}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Badge variant="outline">{item.tireType}</Badge>
                            <Badge variant="outline">{item.tireSize || item.numeration || 'N/A'}</Badge>
                            <Badge variant="outline">Estado: {item.tireCondition || 'N/A'}</Badge>
                            <Badge variant="outline">Lote: {item.lotSize || 1}</Badge>
                            <Badge variant="outline">Stock: {item.stock}</Badge>
                          </div>
                          <p className="text-sm font-semibold text-sky-700 mt-2">L {Number(item.price || 0).toFixed(2)}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            Centro: {item.pointName || 'No definido'}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          className="w-full"
                          onClick={() => addToCart(item.id)}
                        >
                          <ShoppingCart className="w-4 h-4 mr-1" /> Agregar al carrito
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}

              <Card className="p-4 space-y-3">
                <h3 className="font-semibold flex items-center gap-2"><ShoppingCart className="w-4 h-4" /> Carrito ({cartCount} item{cartCount !== 1 ? 's' : ''})</h3>

                {cartRows.length === 0 ? (
                  <p className="text-sm text-gray-600">Agrega productos al carrito para continuar.</p>
                ) : (
                  <div className="space-y-2">
                    {cartRows.map((row) => (
                      <div key={row.product.id} className="rounded-md border p-3 bg-slate-50 flex items-center justify-between gap-2">
                        <div>
                          <p className="font-medium text-sm">{row.product.name}</p>
                          <p className="text-xs text-gray-600">{row.product.tireType} • {row.product.tireSize || row.product.numeration || 'N/A'}</p>
                          <p className="text-xs text-gray-600">Subtotal: L {row.subtotal.toFixed(2)}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="outline" onClick={() => changeQty(row.product.id, -1)}><Minus className="w-3 h-3" /></Button>
                          <Input className="w-12 text-center h-8" value={String(row.quantity)} readOnly />
                          <Button size="sm" variant="outline" onClick={() => changeQty(row.product.id, 1)}><Plus className="w-3 h-3" /></Button>
                          <Button size="sm" variant="destructive" onClick={() => removeLine(row.product.id)}>x</Button>
                        </div>
                      </div>
                    ))}
                    <div className="text-right font-semibold text-sky-700">Total carrito: L {cartTotal.toFixed(2)}</div>
                  </div>
                )}

                    <div className="space-y-2">
                      <Label>Método de entrega</Label>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant={fulfillmentType === 'collector' ? 'default' : 'outline'}
                          onClick={() => setFulfillmentType('collector')}
                        >
                          <Truck className="w-4 h-4 mr-1" /> Recolector
                        </Button>
                        <Button
                          size="sm"
                          variant={fulfillmentType === 'point' ? 'default' : 'outline'}
                          onClick={() => setFulfillmentType('point')}
                        >
                          <MapPin className="w-4 h-4 mr-1" /> Centro de acopio
                        </Button>
                      </div>
                    </div>

                    {fulfillmentType === 'collector' ? (
                      <div className="space-y-1">
                        <Label>Recolector (opcional, si no seleccionas quedará disponible para todos)</Label>
                        <select
                          className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                          value={collectorId}
                          onChange={(e) => setCollectorId(e.target.value)}
                        >
                          <option value="">Disponible para cualquier recolector</option>
                          {collectors.map((item) => (
                            <option key={item.id} value={item.id}>{item.name} {item.phone ? `- ${item.phone}` : ''}</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <Label>Centro de acopio</Label>
                        <select
                          className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                          value={pointId}
                          onChange={(e) => setPointId(e.target.value)}
                        >
                          <option value="">Seleccionar centro</option>
                          {points.map((item) => (
                            <option key={item.id} value={item.id}>{item.name} {item.address ? `- ${item.address}` : ''}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="space-y-1">
                      <Label>Notas (opcional)</Label>
                      <Textarea value={notes} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)} rows={2} placeholder="Ejemplo: horario de entrega, referencia, etc." />
                    </div>

                    <Button onClick={() => void handleCheckout()} disabled={submitting || cartRows.length === 0} className="w-full bg-sky-600 hover:bg-sky-700">
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar compra del carrito'}
                    </Button>
              </Card>
            </TabsContent>

            <TabsContent value="orders" className="space-y-3">
              {orders.length === 0 ? (
                <Card className="p-4">
                  <p className="text-sm text-gray-600">Aún no tienes compras registradas.</p>
                </Card>
              ) : (
                orders.map((order) => (
                  <Card key={order.id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{order.productName}</p>
                        <p className="text-sm text-gray-600">Cantidad: {order.quantity} • Total: L {Number(order.totalAmount || 0).toFixed(2)}</p>
                        <p className="text-xs text-gray-500 mt-1">Items: {Array.isArray(order.items) ? order.items.length : 1}</p>
                        <p className="text-xs text-gray-500 mt-1">{new Date(order.createdAt).toLocaleString()}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {order.fulfillmentType === 'collector'
                            ? `Recolector: ${order.collectorName || 'Pendiente'}`
                            : `Centro: ${order.pointName || 'Pendiente'}`}
                        </p>
                        {order.pickupReceipt?.code && <p className="text-xs text-emerald-700 mt-1">Comprobante retiro: {order.pickupReceipt.code}</p>}
                        {order.deliveryReceipt?.code && <p className="text-xs text-blue-700 mt-1">Comprobante entrega: {order.deliveryReceipt.code}</p>}
                      </div>
                      <Badge variant="outline">{order.status}</Badge>
                    </div>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
