import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { jsPDF } from 'jspdf';
import { useAuth } from '../contexts/AuthContext.js';
import { marketplaceAPI } from '../services/api.js';
import type { MarketplaceOrder } from '../mockData.js';
import { Card } from '../components/ui/card.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { Loader2, Truck, PackageCheck, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

export default function CollectorMarketplacePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const isCollector = user?.type === 'collector';

  const loadOrders = async () => {
    try {
      setLoading(true);
      const data = await marketplaceAPI.collectorGetAvailableOrders();
      setOrders(data || []);
    } catch (error: any) {
      toast.error(error.message || 'No se pudieron cargar entregas marketplace');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOrders();
  }, []);

  const myOrders = useMemo(() => orders.filter((item) => item.collectorId === user?.id), [orders, user?.id]);
  const availableOrders = useMemo(() => orders.filter((item) => item.status === 'available'), [orders]);

  const generateReceipt = (order: MarketplaceOrder, type: 'pickup' | 'delivery') => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const title = type === 'pickup' ? 'Comprobante de Retiro en Centro' : 'Comprobante de Entrega al Cliente';
    const code = type === 'pickup'
      ? (order.pickupReceipt?.code || `PICK-${order.id.slice(0, 8).toUpperCase()}`)
      : (order.deliveryReceipt?.code || `DROP-${order.id.slice(0, 8).toUpperCase()}`);

    let y = 18;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(title, 15, y);
    y += 10;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const lines = [
      `Codigo: ${code}`,
      `Orden: ${order.id}`,
      `Cliente: ${order.buyerName || order.buyerId}`,
      `Recolector: ${user?.name || 'N/A'}`,
      `Centro: ${order.pointName || 'N/A'}`,
      `Total llantas: ${order.quantity}`,
      `Monto total: L ${Number(order.totalAmount || 0).toFixed(2)}`,
      `Fecha: ${new Date().toLocaleString('es-HN')}`,
    ];

    lines.forEach((line) => {
      const wrapped = doc.splitTextToSize(line, 180);
      doc.text(wrapped, 15, y);
      y += wrapped.length * 6;
    });

    if (Array.isArray(order.items) && order.items.length > 0) {
      y += 4;
      doc.setFont('helvetica', 'bold');
      doc.text('Detalle de llantas:', 15, y);
      y += 6;
      doc.setFont('helvetica', 'normal');
      order.items.forEach((item) => {
        const detail = `- ${item.productName} | ${item.tireType || 'N/A'} ${item.tireSize || ''} | Cant: ${item.quantity} | Subtotal: L ${Number(item.subtotal || 0).toFixed(2)}`;
        const wrapped = doc.splitTextToSize(detail, 180);
        doc.text(wrapped, 15, y);
        y += wrapped.length * 6;
      });
    }

    doc.save(`${type === 'pickup' ? 'comprobante-retiro' : 'comprobante-entrega'}-${order.id}.pdf`);
  };

  const takeOrder = async (orderId: string) => {
    try {
      setUpdatingId(orderId);
      await marketplaceAPI.collectorTakeOrder(orderId);
      toast.success('Entrega marketplace tomada. Estado: pendiente.');
      await loadOrders();
    } catch (error: any) {
      toast.error(error.message || 'No se pudo tomar la entrega');
    } finally {
      setUpdatingId(null);
    }
  };

  const updateStatus = async (order: MarketplaceOrder, status: 'in-progress' | 'picked-up' | 'delivered') => {
    try {
      setUpdatingId(order.id);
      const updated = await marketplaceAPI.collectorUpdateOrderStatus(order.id, status);

      if (status === 'picked-up') {
        generateReceipt(updated, 'pickup');
        toast.success('Producto retirado del centro. Comprobante generado.');
      } else if (status === 'delivered') {
        generateReceipt(updated, 'delivery');
        toast.success('Entrega completada al cliente. Comprobante generado.');
      } else {
        toast.success('Entrega en ruta');
      }

      await loadOrders();
    } catch (error: any) {
      toast.error(error.message || 'No se pudo actualizar estado');
    } finally {
      setUpdatingId(null);
    }
  };

  if (!isCollector) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <Card className="max-w-lg mx-auto mt-10 p-6 text-center">
          <h2 className="font-bold text-lg">Acceso restringido</h2>
          <p className="text-sm text-gray-600 mt-2">Este panel es exclusivo para recolectores.</p>
          <Button className="mt-4" onClick={() => navigate('/collector')}>Volver</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-gradient-to-r from-emerald-800 to-green-600 text-white p-6 rounded-b-3xl">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Truck className="w-6 h-6" /> Entregas Marketplace</h1>
        <p className="text-sm text-emerald-100 mt-1">Flujo recolector: disponible, pendiente, en ruta, recogido, entregado.</p>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-3 text-center">
            <p className="text-xs text-gray-500">Disponibles</p>
            <p className="text-2xl font-bold">{availableOrders.length}</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-xs text-gray-500">Mis entregas</p>
            <p className="text-2xl font-bold">{myOrders.length}</p>
          </Card>
        </div>

        {loading ? (
          <div className="py-10 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-green-600" /></div>
        ) : orders.length === 0 ? (
          <Card className="p-4 text-center text-gray-600">No hay entregas marketplace activas.</Card>
        ) : (
          orders.map((order) => {
            const isMine = order.collectorId === user?.id;
            return (
              <Card key={order.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{order.productName}</p>
                    <p className="text-sm text-gray-600">Cliente: {order.buyerName || order.buyerId}</p>
                    <p className="text-sm text-gray-600">Centro: {order.pointName || 'N/A'}</p>
                    <p className="text-sm text-gray-600">Llantas: {order.quantity} • Total: L {Number(order.totalAmount || 0).toFixed(2)}</p>
                    {order.pickupReceipt?.code && <p className="text-xs text-emerald-700">Retiro: {order.pickupReceipt.code}</p>}
                    {order.deliveryReceipt?.code && <p className="text-xs text-blue-700">Entrega: {order.deliveryReceipt.code}</p>}
                  </div>
                  <Badge variant="outline">{order.status}</Badge>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {order.status === 'available' && (
                    <Button onClick={() => void takeOrder(order.id)} disabled={Boolean(updatingId)} className="bg-blue-600 hover:bg-blue-700">
                      {updatingId === order.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Tomar entrega'}
                    </Button>
                  )}

                  {isMine && order.status === 'pending' && (
                    <Button onClick={() => void updateStatus(order, 'in-progress')} disabled={Boolean(updatingId)}>
                      <Truck className="w-4 h-4 mr-1" /> Iniciar ruta
                    </Button>
                  )}

                  {isMine && (order.status === 'pending' || order.status === 'in-progress') && (
                    <Button onClick={() => void updateStatus(order, 'picked-up')} disabled={Boolean(updatingId)} className="bg-amber-600 hover:bg-amber-700">
                      <PackageCheck className="w-4 h-4 mr-1" /> Recoger en centro
                    </Button>
                  )}

                  {isMine && order.status === 'picked-up' && (
                    <Button onClick={() => void updateStatus(order, 'delivered')} disabled={Boolean(updatingId)} className="bg-green-600 hover:bg-green-700">
                      <CheckCircle2 className="w-4 h-4 mr-1" /> Entregar al cliente
                    </Button>
                  )}
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
