import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext.tsx';
import { paymentsAPI } from '../services/api.ts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Button } from '../components/ui/button.tsx';
import { Input } from '../components/ui/input.tsx';
import { Label } from '../components/ui/label.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs.tsx';
import { Badge } from '../components/ui/badge.tsx';
import { Textarea } from '../components/ui/textarea.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog.tsx';
import {
  Loader2,
  DollarSign,
  MapPin,
  Calendar,
  Check,
  X,
  Settings,
  TrendingUp,
  Users,
  Wallet,
  ChevronLeft,
  Save,
} from 'lucide-react';
import { toast } from 'sonner';
import type { CollectorPayment, GeneratorPayment, PaymentSettings, CollectorTireRate, GeneratorTireRate } from '../mockData.ts';

export default function AdminPaymentsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('collector');

  // Estados de pagos
  const [collectorPayments, setCollectorPayments] = useState<CollectorPayment[]>([]);
  const [generatorPayments, setGeneratorPayments] = useState<GeneratorPayment[]>([]);
  const [settings, setSettings] = useState<PaymentSettings | null>(null);

  // Estados de tarifas
  const [collectorRates, setCollectorRates] = useState<CollectorTireRate[]>([]);
  const [generatorRates, setGeneratorRates] = useState<GeneratorTireRate[]>([]);
  const [editingRate, setEditingRate] = useState<CollectorTireRate | GeneratorTireRate | null>(null);
  const [savingRate, setSavingRate] = useState(false);

  // Estados de diálogos
  const [processDialogOpen, setProcessDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<CollectorPayment | GeneratorPayment | null>(null);
  const [paymentType, setPaymentType] = useState<'collector' | 'generator'>('collector');

  // Estados del formulario de procesamiento
  const [paymentMethod, setPaymentMethod] = useState<string>('');
  const [paymentReference, setPaymentReference] = useState('');
  const [notes, setNotes] = useState('');
  const [processing, setProcessing] = useState(false);

  // Estados de configuración
  const [editedSettings, setEditedSettings] = useState<Partial<PaymentSettings>>({});
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    if (user?.type !== 'admin') {
      navigate('/home');
      return;
    }
    loadData();
  }, [user, navigate]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [collectorData, generatorData, settingsData, collectorRatesData, generatorRatesData] = await Promise.all([
        paymentsAPI.getCollectorPayments({ status: 'pending' }),
        paymentsAPI.getGeneratorPayments({ status: 'pending', paymentPreference: 'cash' }),
        paymentsAPI.getSettings(),
        paymentsAPI.getCollectorRates(),
        paymentsAPI.getGeneratorRates(),
      ]);
      setCollectorPayments(collectorData);
      setGeneratorPayments(generatorData);
      setSettings(settingsData);
      setEditedSettings(settingsData);
      setCollectorRates(collectorRatesData);
      setGeneratorRates(generatorRatesData);
    } catch (error: any) {
      toast.error(error.message || 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const handleProcessPayment = async () => {
    if (!selectedPayment || !paymentMethod) {
      toast.error('Complete todos los campos requeridos');
      return;
    }

    setProcessing(true);
    try {
      if (paymentType === 'collector') {
        await paymentsAPI.processCollectorPayment({
          paymentId: selectedPayment.id,
          paymentMethod: paymentMethod as any,
          paymentReference,
          notes,
        });
        toast.success('Pago del recolector procesado exitosamente');
      } else {
        await paymentsAPI.processGeneratorPayment({
          paymentId: selectedPayment.id,
          paymentMethod: paymentMethod as any,
          paymentReference,
          notes,
        });
        toast.success('Pago del generador procesado exitosamente');
      }
      
      setProcessDialogOpen(false);
      setSelectedPayment(null);
      setPaymentMethod('');
      setPaymentReference('');
      setNotes('');
      loadData();
    } catch (error: any) {
      toast.error(error.message || 'Error al procesar pago');
    } finally {
      setProcessing(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!editedSettings) return;

    setSavingSettings(true);
    try {
      const updated = await paymentsAPI.updateSettings(editedSettings);
      setSettings(updated);
      setEditedSettings(updated);
      setSettingsDialogOpen(false);
      toast.success('Configuración actualizada exitosamente');
    } catch (error: any) {
      toast.error(error.message || 'Error al actualizar configuración');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleUpdateCollectorRate = async (rateId: string, updates: Partial<CollectorTireRate>) => {
    setSavingRate(true);
    try {
      const updated = await paymentsAPI.updateCollectorRate(rateId, updates);
      setCollectorRates(prev => prev.map(r => r.id === rateId ? updated : r));
      setEditingRate(null);
      toast.success('Tarifa actualizada');
    } catch (error: any) {
      toast.error(error.message || 'Error al actualizar tarifa');
    } finally {
      setSavingRate(false);
    }
  };

  const handleUpdateGeneratorRate = async (rateId: string, updates: Partial<GeneratorTireRate>) => {
    setSavingRate(true);
    try {
      const updated = await paymentsAPI.updateGeneratorRate(rateId, updates);
      setGeneratorRates(prev => prev.map(r => r.id === rateId ? updated : r));
      setEditingRate(null);
      toast.success('Tarifa actualizada');
    } catch (error: any) {
      toast.error(error.message || 'Error al actualizar tarifa');
    } finally {
      setSavingRate(false);
    }
  };

  const openProcessDialog = (payment: CollectorPayment | GeneratorPayment, type: 'collector' | 'generator') => {
    setSelectedPayment(payment);
    setPaymentType(type);
    setPaymentMethod('');
    setPaymentReference('');
    setNotes('');
    setProcessDialogOpen(true);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-HN', {
      style: 'currency',
      currency: settings?.currency || 'HNL',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-HN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const normalizeForMatch = (value: string) =>
    String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

  const tireTypes = ['Automóvil', 'Motocicleta', 'Camión', 'Bicicleta', 'Autobús', 'Otro'];
  const tireConditions = ['excelente', 'buena', 'regular', 'desgastada'];

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { label: 'Pendiente', className: 'bg-yellow-100 text-yellow-800' },
      processing: { label: 'Procesando', className: 'bg-blue-100 text-blue-800' },
      completed: { label: 'Completado', className: 'bg-green-100 text-green-800' },
      failed: { label: 'Fallido', className: 'bg-red-100 text-red-800' },
      cancelled: { label: 'Cancelado', className: 'bg-gray-100 text-gray-800' },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/admin')}
                className="text-gray-600"
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Gestión de Pagos</h1>
                <p className="text-sm text-gray-600">Administra los pagos de recolectores y generadores</p>
              </div>
            </div>
            <Button
              onClick={() => setSettingsDialogOpen(true)}
              variant="outline"
              className="gap-2"
            >
              <Settings className="w-4 h-4" />
              Configuración
            </Button>
          </div>
        </div>
      </div>

      {/* Resumen */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 rounded-lg">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Pagos Recolectores</p>
                <p className="text-2xl font-bold">{collectorPayments.length}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-100 rounded-lg">
                <Wallet className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Pagos Generadores</p>
                <p className="text-2xl font-bold">{generatorPayments.length}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-100 rounded-lg">
                <TrendingUp className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Pendiente</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(
                    collectorPayments.reduce((sum, p) => sum + p.paymentAmount, 0) +
                    generatorPayments.reduce((sum, p) => sum + p.cashAmount, 0)
                  )}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="collector">Pagos a Recolectores</TabsTrigger>
            <TabsTrigger value="generator">Pagos a Generadores</TabsTrigger>
            <TabsTrigger value="rates">Tarifas</TabsTrigger>
          </TabsList>

          {/* Pagos Recolectores */}
          <TabsContent value="collector" className="space-y-4 mt-4">
            {collectorPayments.length === 0 ? (
              <Card className="p-8 text-center">
                <DollarSign className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                <p className="text-gray-600">No hay pagos pendientes de recolectores</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {collectorPayments.map((payment) => (
                  <Card key={payment.id} className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold">Recolección #{payment.collectionId.slice(0, 8)}</h3>
                          {getStatusBadge(payment.status)}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-gray-600">
                          <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4" />
                            <span>{payment.distanceKm} km</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <DollarSign className="w-4 h-4" />
                            <span>{formatCurrency(payment.paymentAmount)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            <span>{formatDate(payment.createdAt)}</span>
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-gray-500">
                          <p>Puntos a otorgar: {payment.pointsAwarded}</p>
                          {payment.notes && <p className="mt-1">Notas: {payment.notes}</p>}
                        </div>
                      </div>
                      <Button
                        onClick={() => openProcessDialog(payment, 'collector')}
                        className="bg-green-600 hover:bg-green-700 gap-2"
                        size="sm"
                      >
                        <Check className="w-4 h-4" />
                        Procesar
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Pagos Generadores */}
          <TabsContent value="generator" className="space-y-4 mt-4">
            {generatorPayments.length === 0 ? (
              <Card className="p-8 text-center">
                <Wallet className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                <p className="text-gray-600">No hay pagos pendientes de generadores</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {generatorPayments.map((payment) => (
                  <Card key={payment.id} className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold">Recolección #{payment.collectionId.slice(0, 8)}</h3>
                          {getStatusBadge(payment.status)}
                          <Badge variant="outline">
                            {payment.paymentPreference === 'cash' ? 'Efectivo' : 'Puntos'}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-gray-600">
                          <div className="flex items-center gap-2">
                            <span>Llantas: {payment.tireCount}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <DollarSign className="w-4 h-4" />
                            <span>{formatCurrency(payment.cashAmount)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            <span>{formatDate(payment.createdAt)}</span>
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-gray-500">
                          <p>Puntos adicionales: {payment.pointsAwarded}</p>
                          {payment.notes && <p className="mt-1">Notas: {payment.notes}</p>}
                        </div>
                      </div>
                      <Button
                        onClick={() => openProcessDialog(payment, 'generator')}
                        className="bg-green-600 hover:bg-green-700 gap-2"
                        size="sm"
                      >
                        <Check className="w-4 h-4" />
                        Procesar
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Tab de Tarifas */}
          <TabsContent value="rates" className="space-y-6 mt-4">
            {/* Tarifas de Recolectores */}
            <Card>
              <CardHeader>
                <CardTitle>Tarifas de Recolectores</CardTitle>
                <CardDescription>
                  Configure las tarifas base por kilómetro, pago mínimo y puntos de bonificación según el tipo y estado de la llanta.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {tireTypes.map((tireType) => (
                    <div key={tireType} className="border rounded-lg p-4">
                      <h3 className="font-semibold mb-3">{tireType}</h3>
                      <div className="space-y-2">
                        {tireConditions.map((condition) => {
                          const rate = collectorRates.find(
                            (r) =>
                              normalizeForMatch(r.tireType) === normalizeForMatch(tireType) &&
                              normalizeForMatch(r.tireCondition) === normalizeForMatch(condition)
                          );
                          if (!rate) return null;

                          const isEditing = editingRate?.id === rate.id;
                          
                          return (
                            <div key={rate.id} className="grid grid-cols-5 gap-3 items-center py-2 border-b last:border-0">
                              <div className="font-medium capitalize">{condition}</div>
                              <div>
                                <label className="text-xs text-gray-500">HNL/km</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={isEditing ? (editingRate as CollectorTireRate).baseRatePerKm : rate.baseRatePerKm}
                                  onChange={(e) =>
                                    setEditingRate({
                                      ...rate,
                                      baseRatePerKm: parseFloat(e.target.value) || 0,
                                    })
                                  }
                                  onFocus={() => !isEditing && setEditingRate(rate)}
                                  className="w-full px-2 py-1 border rounded text-sm"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-gray-500">Pago mín. (HNL)</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={isEditing ? (editingRate as CollectorTireRate).minPayment : rate.minPayment}
                                  onChange={(e) =>
                                    setEditingRate({
                                      ...rate,
                                      minPayment: parseFloat(e.target.value) || 0,
                                    })
                                  }
                                  onFocus={() => !isEditing && setEditingRate(rate)}
                                  className="w-full px-2 py-1 border rounded text-sm"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-gray-500">Puntos bonus</label>
                                <input
                                  type="number"
                                  value={isEditing ? (editingRate as CollectorTireRate).bonusPoints : rate.bonusPoints}
                                  onChange={(e) =>
                                    setEditingRate({
                                      ...rate,
                                      bonusPoints: parseInt(e.target.value) || 0,
                                    })
                                  }
                                  onFocus={() => !isEditing && setEditingRate(rate)}
                                  className="w-full px-2 py-1 border rounded text-sm"
                                />
                              </div>
                              <div>
                                {isEditing && (
                                  <Button
                                    size="sm"
                                    onClick={() => handleUpdateCollectorRate(rate.id, {
                                      baseRatePerKm: (editingRate as CollectorTireRate).baseRatePerKm,
                                      minPayment: (editingRate as CollectorTireRate).minPayment,
                                      bonusPoints: (editingRate as CollectorTireRate).bonusPoints,
                                    })}
                                    disabled={savingRate}
                                  >
                                    {savingRate ? 'Guardando...' : 'Guardar'}
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Tarifas de Generadores */}
            <Card>
              <CardHeader>
                <CardTitle>Tarifas de Generadores</CardTitle>
                <CardDescription>
                  Configure los puntos o efectivo por llanta y puntos mínimos en opción de efectivo según el tipo y estado de la llanta.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {tireTypes.map((tireType) => (
                    <div key={tireType} className="border rounded-lg p-4">
                      <h3 className="font-semibold mb-3">{tireType}</h3>
                      <div className="space-y-2">
                        {tireConditions.map((condition) => {
                          const rate = generatorRates.find(
                            (r) =>
                              normalizeForMatch(r.tireType) === normalizeForMatch(tireType) &&
                              normalizeForMatch(r.tireCondition) === normalizeForMatch(condition)
                          );
                          if (!rate) return null;

                          const isEditing = editingRate?.id === rate.id;
                          
                          return (
                            <div key={rate.id} className="grid grid-cols-5 gap-3 items-center py-2 border-b last:border-0">
                              <div className="font-medium capitalize">{condition}</div>
                              <div>
                                <label className="text-xs text-gray-500">Puntos/llanta</label>
                                <input
                                  type="number"
                                  value={isEditing ? (editingRate as GeneratorTireRate).pointsPerTire : rate.pointsPerTire}
                                  onChange={(e) =>
                                    setEditingRate({
                                      ...rate,
                                      pointsPerTire: parseInt(e.target.value) || 0,
                                    })
                                  }
                                  onFocus={() => !isEditing && setEditingRate(rate)}
                                  className="w-full px-2 py-1 border rounded text-sm"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-gray-500">HNL/llanta</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={isEditing ? (editingRate as GeneratorTireRate).cashPerTire : rate.cashPerTire}
                                  onChange={(e) =>
                                    setEditingRate({
                                      ...rate,
                                      cashPerTire: parseFloat(e.target.value) || 0,
                                    })
                                  }
                                  onFocus={() => !isEditing && setEditingRate(rate)}
                                  className="w-full px-2 py-1 border rounded text-sm"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-gray-500">Puntos mín. (efectivo)</label>
                                <input
                                  type="number"
                                  value={isEditing ? (editingRate as GeneratorTireRate).minPointsOnCash : rate.minPointsOnCash}
                                  onChange={(e) =>
                                    setEditingRate({
                                      ...rate,
                                      minPointsOnCash: parseInt(e.target.value) || 0,
                                    })
                                  }
                                  onFocus={() => !isEditing && setEditingRate(rate)}
                                  className="w-full px-2 py-1 border rounded text-sm"
                                />
                              </div>
                              <div>
                                {isEditing && (
                                  <Button
                                    size="sm"
                                    onClick={() => handleUpdateGeneratorRate(rate.id, {
                                      pointsPerTire: (editingRate as GeneratorTireRate).pointsPerTire,
                                      cashPerTire: (editingRate as GeneratorTireRate).cashPerTire,
                                      minPointsOnCash: (editingRate as GeneratorTireRate).minPointsOnCash,
                                    })}
                                    disabled={savingRate}
                                  >
                                    {savingRate ? 'Guardando...' : 'Guardar'}
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Diálogo de Procesamiento */}
      <Dialog open={processDialogOpen} onOpenChange={setProcessDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Procesar Pago</DialogTitle>
            <DialogDescription>
              Complete los detalles del pago para procesar esta transacción
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="payment-method">Método de Pago *</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione método" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">Transferencia Bancaria</SelectItem>
                  <SelectItem value="cash">Efectivo</SelectItem>
                  <SelectItem value="digital_wallet">Billetera Digital</SelectItem>
                  {paymentType === 'generator' && (
                    <SelectItem value="points">Puntos</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment-reference">Referencia de Pago</Label>
              <Input
                id="payment-reference"
                placeholder="Ej: REF-123456"
                value={paymentReference}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPaymentReference(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notas (Opcional)</Label>
              <Textarea
                id="notes"
                placeholder="Agregue notas adicionales..."
                value={notes}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setProcessDialogOpen(false)}
              disabled={processing}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleProcessPayment}
              disabled={processing || !paymentMethod}
              className="bg-green-600 hover:bg-green-700"
            >
              {processing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Procesando...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Confirmar Pago
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de Configuración */}
      <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configuración de Pagos</DialogTitle>
            <DialogDescription>
              Ajuste los parámetros del sistema de pagos
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-4">
              <h3 className="font-semibold text-sm">Configuración para Recolectores</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Pago por Kilómetro</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editedSettings.paymentPerKm || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setEditedSettings({
                        ...editedSettings,
                        paymentPerKm: parseFloat(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Pago Mínimo</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editedSettings.minPaymentAmount || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setEditedSettings({
                        ...editedSettings,
                        minPaymentAmount: parseFloat(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Puntos Mínimos por Recolección</Label>
                  <Input
                    type="number"
                    value={editedSettings.minCollectorPoints || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setEditedSettings({
                        ...editedSettings,
                        minCollectorPoints: parseInt(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold text-sm">Configuración para Generadores</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Puntos por Llanta (Modo Puntos)</Label>
                  <Input
                    type="number"
                    value={editedSettings.pointsPerTire || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setEditedSettings({
                        ...editedSettings,
                        pointsPerTire: parseInt(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Pago en Efectivo por Llanta</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editedSettings.cashPaymentPerTire || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setEditedSettings({
                        ...editedSettings,
                        cashPaymentPerTire: parseFloat(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Puntos Mínimos en Modo Efectivo</Label>
                  <Input
                    type="number"
                    value={editedSettings.minGeneratorPointsOnCash || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setEditedSettings({
                        ...editedSettings,
                        minGeneratorPointsOnCash: parseInt(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSettingsDialogOpen(false);
                setEditedSettings(settings || {});
              }}
              disabled={savingSettings}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveSettings}
              disabled={savingSettings}
              className="bg-green-600 hover:bg-green-700"
            >
              {savingSettings ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Guardar Cambios
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
