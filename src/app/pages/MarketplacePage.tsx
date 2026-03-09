import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router';
import { jsPDF } from 'jspdf';
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
import { Loader2, ShoppingCart, Store, Truck, MapPin, Plus, Minus, X, ChevronLeft, Info, Download, CheckCircle2 } from 'lucide-react';
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
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<MarketplaceProduct | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailQty, setDetailQty] = useState(1);
  const [fulfillmentType, setFulfillmentType] = useState<'collector' | 'point'>('collector');
  const [collectorId, setCollectorId] = useState('');
  const [pointId, setPointId] = useState('');
  const [notes, setNotes] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

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

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchSearch = searchTerm === '' || p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.numeration?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchType = filterType === 'all' || p.tireType === filterType;
      return matchSearch && matchType;
    });
  }, [products, searchTerm, filterType]);

  const tireTypes = useMemo(() => {
    const types = new Set(products.map((p) => p.tireType));
    return Array.from(types).sort();
  }, [products]);

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

  useEffect(() => {
    if (!user?.id || orders.length === 0) return;

    const storageKey = `ecolant_seen_marketplace_notifications_${user.id}`;
    let seen = new Set<string>();
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) seen = new Set(JSON.parse(raw));
    } catch {
      seen = new Set<string>();
    }

    let changed = false;
    orders.forEach((order) => {
      const notification = order.customerNotification;
      if (!notification) return;
      if (seen.has(order.id)) return;

      toast.success(notification.message);
      seen.add(order.id);
      changed = true;
    });

    if (changed) {
      localStorage.setItem(storageKey, JSON.stringify(Array.from(seen)));
    }
  }, [orders, user?.id]);

  const downloadDeliveryReceipt = (order: MarketplaceOrder) => {
    if (!order.deliveryReceipt) {
      toast.error('Este pedido aún no tiene comprobante de entrega');
      return;
    }

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    let y = 18;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Comprobante de Entrega Marketplace', 15, y);
    y += 10;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const rows = [
      `Codigo: ${order.deliveryReceipt.code}`,
      `Orden: ${order.id}`,
      `Cliente: ${order.buyerName || order.buyerId}`,
      `Recolector: ${order.collectorName || 'N/A'}`,
      `Centro: ${order.pointName || 'N/A'}`,
      `Total llantas: ${order.quantity}`,
      `Monto total: L ${Number(order.totalAmount || 0).toFixed(2)}`,
      `Fecha entrega: ${new Date(order.deliveryReceipt.createdAt).toLocaleString('es-HN')}`,
    ];

    rows.forEach((line) => {
      const wrapped = doc.splitTextToSize(line, 180);
      doc.text(wrapped, 15, y);
      y += wrapped.length * 6;
    });

    if (Array.isArray(order.items) && order.items.length > 0) {
      y += 4;
      doc.setFont('helvetica', 'bold');
      doc.text('Detalle:', 15, y);
      y += 6;
      doc.setFont('helvetica', 'normal');
      order.items.forEach((item) => {
        const detail = `- ${item.productName} | ${item.tireType || 'N/A'} ${item.tireSize || ''} | Cant: ${item.quantity} | Subtotal: L ${Number(item.subtotal || 0).toFixed(2)}`;
        const wrapped = doc.splitTextToSize(detail, 180);
        doc.text(wrapped, 15, y);
        y += wrapped.length * 6;
      });
    }

    doc.save(`comprobante-entrega-${order.id}.pdf`);
  };

  const addToCart = (productId: string, qty: number = 1) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === productId);
      if (existing) {
        return prev.map((item) => item.productId === productId ? { ...item, quantity: item.quantity + qty } : item);
      }
      return [...prev, { productId, quantity: qty }];
    });
    toast.success('Agregado al carrito');
    setDetailOpen(false);
    setDetailQty(1);
  };

  const changeQty = (productId: string, delta: number) => {
    setCart((prev) => prev
      .map((item) => item.productId === productId ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item)
      .filter((item) => item.quantity > 0));
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
    toast.info('Removido del carrito');
  };

  const handleCheckout = async () => {
    if (cartRows.length === 0) {
      toast.error('Tu carrito está vacío');
      return;
    }

    if (fulfillmentType === 'point' && !pointId) {
      toast.error('Selecciona un centro de acopio para la compra');
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

      toast.success('¡Compra registrada correctamente!');
      setCart([]);
      setNotes('');
      setCartOpen(false);
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
          <p className="text-sm text-gray-600 mt-2">Este marketplace está disponible solo para clientes.</p>
          <Button className="mt-4" onClick={() => navigate('/home')}>Volver</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-sky-900 via-blue-700 to-cyan-600 text-white p-6 rounded-b-3xl sticky top-0 z-40">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Store className="w-6 h-6" /> LLantas Marketplace</h1>
            <p className="text-sm text-sky-100 mt-1">Compra directamente desde centros de acopio</p>
          </div>
          <button
            onClick={() => setCartOpen(true)}
            className="relative bg-white/20 hover:bg-white/30 text-white p-3 rounded-lg transition"
          >
            <ShoppingCart className="w-6 h-6" />
            {cartCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {loading ? (
          <div className="py-12 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-sky-600" />
          </div>
        ) : (
          <Tabs defaultValue="shop" className="space-y-4">
            <TabsList className="grid grid-cols-2">
              <TabsTrigger value="shop">Tienda</TabsTrigger>
              <TabsTrigger value="orders">Mis compras ({orders.length})</TabsTrigger>
            </TabsList>

            {/* SHOP TAB */}
            <TabsContent value="shop" className="space-y-4">
              {/* Filtros */}
              <Card className="p-4 space-y-3">
                <Input
                  placeholder="Buscar por nombre o numeración (ej: 205/55R16)..."
                  value={searchTerm}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                  className="w-full"
                />
                <div className="space-y-2">
                  <Label className="text-xs">Tipo de llanta</Label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={filterType === 'all' ? 'default' : 'outline'}
                      onClick={() => setFilterType('all')}
                    >
                      Todas
                    </Button>
                    {tireTypes.map((type) => (
                      <Button
                        key={type}
                        size="sm"
                        variant={filterType === type ? 'default' : 'outline'}
                        onClick={() => setFilterType(type)}
                      >
                        {type}
                      </Button>
                    ))}
                  </div>
                </div>
              </Card>

              {/* Grid de productos */}
              {filteredProducts.length === 0 ? (
                <Card className="p-8 text-center">
                  <p className="text-gray-600">No se encontraron productos con esos criterios</p>
                </Card>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {filteredProducts.map((product) => (
                    <Card
                      key={product.id}
                      className="p-3 hover:shadow-lg transition cursor-pointer"
                      onClick={() => {
                        setSelectedProduct(product);
                        setDetailOpen(true);
                        setDetailQty(1);
                      }}
                    >
                      <div className="space-y-2">
                        <div className="aspect-square rounded-md overflow-hidden bg-slate-100">
                          <img
                            src={product.photoUrl || product.photoUrls?.[0] || 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=1200&q=80'}
                            alt={product.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div>
                          <p className="font-semibold text-sm line-clamp-2">{product.name}</p>
                          <p className="text-xs text-gray-600 mt-1">{product.numeration}</p>
                          <div className="flex items-end justify-between mt-2">
                            <div>
                              <p className="text-sm font-bold text-sky-700">L {Number(product.price || 0).toFixed(2)}</p>
                              {Number(product.stock || 0) < 5 && (
                                <p className="text-xs text-orange-600">Pocas ({product.stock})</p>
                              )}
                            </div>
                            <Badge variant="outline" className="text-xs">{(() => {
                              const lotSize = Number(product.lotSize || 1);
                              return lotSize > 1 ? `x${lotSize}` : '1';
                            })()}</Badge>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ORDERS TAB */}
            <TabsContent value="orders" className="space-y-3">
              {orders.length === 0 ? (
                <Card className="p-6 text-center">
                  <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-600">Aún no tienes compras. ¡Explora el marketplace!</p>
                </Card>
              ) : (
                orders.map((order) => (
                  <Card key={order.id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="font-medium">{order.productName}</p>
                        <p className="text-sm text-gray-600">L {Number(order.totalAmount || 0).toFixed(2)} • {order.quantity} llantas</p>
                        <p className="text-xs text-gray-500 mt-1">{new Date(order.createdAt).toLocaleDateString()}</p>
                        <p className="text-xs text-gray-500">
                          {order.fulfillmentType === 'collector'
                            ? `Recolector: ${order.collectorName || 'En búsqueda'}`
                            : `Centro: ${order.pointName || 'Pendiente'}`}
                        </p>
                      </div>
                      <Badge variant="outline">{getMarketplaceStatusLabel(order.status)}</Badge>
                    </div>

                    {order.status === 'delivered' && order.deliveryReceipt && (
                      <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-2">
                        <p className="text-sm font-medium text-emerald-800 flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4" /> Entrega completada
                        </p>
                        <p className="text-xs text-emerald-700">Comprobante: {order.deliveryReceipt.code}</p>
                        {order.customerNotification?.message && (
                          <p className="text-xs text-emerald-700">{order.customerNotification.message}</p>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-emerald-300 text-emerald-800 hover:bg-emerald-100"
                          onClick={() => downloadDeliveryReceipt(order)}
                        >
                          <Download className="w-4 h-4 mr-1" /> Descargar comprobante
                        </Button>
                      </div>
                    )}
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* PRODUCT DETAIL MODAL */}
      {detailOpen && selectedProduct && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center sm:justify-center p-4">
          <Card className="w-full sm:max-w-md rounded-t-3xl sm:rounded-lg max-h-[90vh] overflow-auto">
            <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
              <h2 className="font-bold">Detalles del producto</h2>
              <button onClick={() => setDetailOpen(false)} className="text-gray-500 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Imagen */}
              <div className="aspect-square rounded-lg overflow-hidden bg-slate-100">
                <img
                  src={selectedProduct.photoUrl || selectedProduct.photoUrls?.[0] || 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=1200&q=80'}
                  alt={selectedProduct.name}
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Nombre y precio */}
              <div>
                <h3 className="text-lg font-bold">{selectedProduct.name}</h3>
                <p className="text-2xl font-bold text-sky-700 mt-2">L {Number(selectedProduct.price || 0).toFixed(2)}</p>
              </div>

              {/* Especificaciones */}
              <div className="space-y-2 bg-slate-50 p-3 rounded">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Tipo:</span>
                  <span className="font-medium">{selectedProduct.tireType}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Numeración:</span>
                  <span className="font-medium">{selectedProduct.numeration || 'N/A'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Marca:</span>
                  <span className="font-medium">{selectedProduct.tireBrand || 'N/A'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Modelo:</span>
                  <span className="font-medium">{selectedProduct.tireModel || 'N/A'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Estado:</span>
                  <span className="font-medium capitalize">{selectedProduct.tireCondition || 'Buena'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Lote:</span>
                  <span className="font-medium">{selectedProduct.lotSize || 1} unidad(es)</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Stock disponible:</span>
                  <span className="font-medium">{selectedProduct.stock}</span>
                </div>
                {selectedProduct.pointName && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Centro:</span>
                      <span className="font-medium">{selectedProduct.pointName}</span>
                    </div>
                    {selectedProduct.pointAddress && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Dirección:</span>
                        <span className="font-medium text-right">{selectedProduct.pointAddress}</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Descripción */}
              {selectedProduct.description && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-gray-600">Descripción</p>
                  <p className="text-sm text-gray-700">{selectedProduct.description}</p>
                </div>
              )}

              {/* Cantidad */}
              <div className="space-y-2">
                <Label className="text-sm">Cantidad</Label>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDetailQty(Math.max(1, detailQty - 1))}
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <Input className="w-16 text-center" value={String(detailQty)} readOnly />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDetailQty(detailQty + 1)}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Botón agregar */}
              <Button
                onClick={() => addToCart(selectedProduct.id, detailQty)}
                className="w-full bg-sky-600 hover:bg-sky-700"
              >
                <ShoppingCart className="w-4 h-4 mr-2" /> Agregar al carrito (L {(Number(selectedProduct.price || 0) * detailQty).toFixed(2)})
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* CARRITO LATERAL */}
      {cartOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setCartOpen(false)} />
          <div className="fixed right-0 top-0 h-full w-full sm:max-w-md bg-white z-40 flex flex-col rounded-l-3xl sm:rounded-lg overflow-hidden">
            {/* Header carrito */}
            <div className="bg-gradient-to-r from-sky-600 to-cyan-500 text-white p-4 flex items-center justify-between">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" /> Carrito ({cartCount})
              </h2>
              <button onClick={() => setCartOpen(false)} className="hover:bg-white/20 p-2 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Items del carrito */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cartRows.length === 0 ? (
                <div className="py-8 text-center text-gray-500">
                  <ShoppingCart className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>Tu carrito está vacío</p>
                </div>
              ) : (
                cartRows.map((row) => (
                  <div key={row.product.id} className="border rounded-lg p-3 bg-slate-50 space-y-2">
                    <div className="flex gap-2">
                      <img
                        src={row.product.photoUrl || row.product.photoUrls?.[0] || 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=1200&q=80'}
                        alt={row.product.name}
                        className="w-16 h-16 object-cover rounded"
                      />
                      <div className="flex-1">
                        <p className="font-medium text-sm line-clamp-2">{row.product.name}</p>
                        <p className="text-xs text-gray-600">{row.product.numeration}</p>
                        <p className="text-sm font-bold text-sky-700 mt-1">L {row.subtotal.toFixed(2)}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 w-7"
                          onClick={() => changeQty(row.product.id, -1)}
                        >
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="w-8 text-center text-sm font-medium">{row.quantity}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 w-7"
                          onClick={() => changeQty(row.product.id, 1)}
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeFromCart(row.product.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2Icon className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Formulario de compra */}
            {cartRows.length > 0 && (
              <div className="border-t p-4 space-y-3 bg-slate-50">
                {/* Total */}
                <div className="flex justify-between items-center text-lg font-bold">
                  <span>Total:</span>
                  <span className="text-sky-700">L {cartTotal.toFixed(2)}</span>
                </div>

                {/* Método de entrega */}
                <div className="space-y-2">
                  <Label className="text-sm">Método de entrega</Label>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={fulfillmentType === 'collector' ? 'default' : 'outline'}
                      onClick={() => setFulfillmentType('collector')}
                    >
                      <Truck className="w-3 h-3 mr-1" /> Recolector
                    </Button>
                    <Button
                      size="sm"
                      variant={fulfillmentType === 'point' ? 'default' : 'outline'}
                      onClick={() => setFulfillmentType('point')}
                    >
                      <MapPin className="w-3 h-3 mr-1" /> Centro
                    </Button>
                  </div>
                </div>

                {/* Selecciones */}
                {fulfillmentType === 'collector' ? (
                  <div className="space-y-1">
                    <Label className="text-xs">Recolector (opcional)</Label>
                    <select
                      className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                      value={collectorId}
                      onChange={(e) => setCollectorId(e.target.value)}
                    >
                      <option value="">Cualquier recolector disponible</option>
                      {collectors.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Label className="text-xs">Centro de acopio</Label>
                    <select
                      className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                      value={pointId}
                      onChange={(e) => setPointId(e.target.value)}
                    >
                      <option value="">Selecciona un centro</option>
                      {points.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Notas */}
                <div className="space-y-1">
                  <Label className="text-xs">Notas (opcional)</Label>
                  <Textarea
                    value={notes}
                    onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="Instrucciones especiales..."
                    className="text-sm"
                  />
                </div>

                {/* Botón checkout */}
                <Button
                  onClick={() => void handleCheckout()}
                  disabled={submitting}
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                  Confirmar compra
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Icon components
function Trash2Icon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      <line x1="10" y1="11" x2="10" y2="17"></line>
      <line x1="14" y1="11" x2="14" y2="17"></line>
    </svg>
  );
}

function Check(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  );
}
