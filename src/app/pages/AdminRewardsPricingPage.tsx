import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext.tsx';
import { adminAPI } from '../services/api.js';
import { Card } from '../components/ui/card.tsx';
import { Button } from '../components/ui/button.tsx';
import { Input } from '../components/ui/input.tsx';
import { Label } from '../components/ui/label.tsx';
import { Textarea } from '../components/ui/textarea.tsx';
import { Badge } from '../components/ui/badge.tsx';
import { ChevronLeft, Gift, Loader2, Save, Trash2, UserRoundPlus, Wallet } from 'lucide-react';
import { toast } from 'sonner';

type PricingState = {
  generatorTariffsByCondition: {
    excelente: string;
    buena: string;
    regular: string;
    desgastada: string;
  };
  collectorFreight: {
    min: string;
    max: string;
  };
};

export default function AdminRewardsPricingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.type === 'admin';

  const [loading, setLoading] = useState(true);
  const [savingPricing, setSavingPricing] = useState(false);
  const [savingReward, setSavingReward] = useState(false);
  const [assigningReward, setAssigningReward] = useState(false);
  const [deletingRewardId, setDeletingRewardId] = useState<string | null>(null);

  const [users, setUsers] = useState<any[]>([]);
  const [rewards, setRewards] = useState<any[]>([]);
  const [pricing, setPricing] = useState<PricingState>({
    generatorTariffsByCondition: {
      excelente: '300',
      buena: '180',
      regular: '90',
      desgastada: '20',
    },
    collectorFreight: {
      min: '15',
      max: '25',
    },
  });

  const [rewardForm, setRewardForm] = useState({
    title: '',
    description: '',
    pointsCost: '100',
    category: 'Descuentos',
    sponsor: '',
    available: true,
  });

  const [assignForm, setAssignForm] = useState({
    rewardId: '',
    userId: '',
    expiresInDays: '30',
  });

  useEffect(() => {
    if (!isAdmin) return;
    void loadData();
  }, [isAdmin]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [usersData, rewardsData, pricingData] = await Promise.all([
        adminAPI.getUsers(),
        adminAPI.getRewards(),
        adminAPI.getPricing(),
      ]);

      setUsers(usersData || []);
      setRewards(rewardsData || []);
      setPricing({
        generatorTariffsByCondition: {
          excelente: String(pricingData?.generatorTariffsByCondition?.excelente ?? 300),
          buena: String(pricingData?.generatorTariffsByCondition?.buena ?? 180),
          regular: String(pricingData?.generatorTariffsByCondition?.regular ?? 90),
          desgastada: String(pricingData?.generatorTariffsByCondition?.desgastada ?? 20),
        },
        collectorFreight: {
          min: String(pricingData?.collectorFreight?.min ?? 15),
          max: String(pricingData?.collectorFreight?.max ?? 25),
        },
      });
    } catch (error: any) {
      toast.error(error.message || 'No se pudo cargar la administración de recompensas');
      setUsers([]);
      setRewards([]);
    } finally {
      setLoading(false);
    }
  };

  const targetUsers = useMemo(() => users.filter((item) => item.type !== 'admin'), [users]);

  const handleSavePricing = async () => {
    try {
      setSavingPricing(true);
      await adminAPI.updatePricing({
        generatorTariffsByCondition: {
          excelente: Number(pricing.generatorTariffsByCondition.excelente),
          buena: Number(pricing.generatorTariffsByCondition.buena),
          regular: Number(pricing.generatorTariffsByCondition.regular),
          desgastada: Number(pricing.generatorTariffsByCondition.desgastada),
        },
        collectorFreight: {
          min: Number(pricing.collectorFreight.min),
          max: Number(pricing.collectorFreight.max),
        },
      });
      toast.success('Tarifas monetarias actualizadas');
      await loadData();
    } catch (error: any) {
      toast.error(error.message || 'No se pudieron guardar las tarifas');
    } finally {
      setSavingPricing(false);
    }
  };

  const handleCreateReward = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rewardForm.title.trim()) {
      toast.error('El titulo de la recompensa es obligatorio');
      return;
    }

    try {
      setSavingReward(true);
      await adminAPI.createReward({
        title: rewardForm.title.trim(),
        description: rewardForm.description.trim(),
        pointsCost: Number(rewardForm.pointsCost || 0),
        category: rewardForm.category.trim(),
        sponsor: rewardForm.sponsor.trim() || undefined,
        available: rewardForm.available,
      });

      toast.success('Recompensa creada');
      setRewardForm({
        title: '',
        description: '',
        pointsCost: '100',
        category: 'Descuentos',
        sponsor: '',
        available: true,
      });
      await loadData();
    } catch (error: any) {
      toast.error(error.message || 'No se pudo crear la recompensa');
    } finally {
      setSavingReward(false);
    }
  };

  const handleToggleReward = async (reward: any) => {
    try {
      await adminAPI.updateReward(reward.id, { available: !reward.available });
      toast.success('Disponibilidad de recompensa actualizada');
      await loadData();
    } catch (error: any) {
      toast.error(error.message || 'No se pudo actualizar la recompensa');
    }
  };

  const handleDeleteReward = async (rewardId: string) => {
    if (!window.confirm('Eliminar esta recompensa del catalogo?')) return;

    try {
      setDeletingRewardId(rewardId);
      await adminAPI.deleteReward(rewardId);
      toast.success('Recompensa eliminada');
      await loadData();
    } catch (error: any) {
      toast.error(error.message || 'No se pudo eliminar la recompensa');
    } finally {
      setDeletingRewardId(null);
    }
  };

  const handleAssignReward = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignForm.rewardId || !assignForm.userId) {
      toast.error('Selecciona usuario y recompensa');
      return;
    }

    try {
      setAssigningReward(true);
      const result = await adminAPI.assignReward(assignForm.rewardId, {
        userId: assignForm.userId,
        expiresInDays: Number(assignForm.expiresInDays || 30),
      });

      toast.success('Recompensa asignada con cupón', {
        description: `Código: ${result?.redemption?.couponCode || 'generado'}`,
      });

      setAssignForm({
        rewardId: '',
        userId: '',
        expiresInDays: '30',
      });
    } catch (error: any) {
      toast.error(error.message || 'No se pudo asignar la recompensa');
    } finally {
      setAssigningReward(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <Card className="max-w-lg mx-auto mt-10 p-6 text-center">
          <h2 className="font-bold text-lg">Acceso restringido</h2>
          <p className="text-sm text-gray-600 mt-2">Este modulo es exclusivo para administradores.</p>
          <Button className="mt-4" onClick={() => navigate('/home')}>Volver</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-gradient-to-r from-slate-900 to-slate-700 text-white p-6 rounded-b-3xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={() => navigate(-1)}>
            <ChevronLeft className="w-6 h-6" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Recompensas y Tarifas</h1>
            <p className="text-sm text-slate-200">Crear recompensas, asignarlas y definir pagos monetarios.</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {loading ? (
          <Card className="p-6 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-green-600" />
          </Card>
        ) : (
          <>
            <Card className="p-4 space-y-3">
              <h2 className="font-semibold flex items-center gap-2"><Wallet className="w-4 h-4" /> Tarifas monetarias (LPS)</h2>
              <p className="text-sm text-gray-600">Generadores: 20 a 300 LPS por llanta segun estado. Recolectores: flete entre 15 y 25 LPS.</p>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>Excelente</Label>
                  <Input value={pricing.generatorTariffsByCondition.excelente} type="number" min={20} max={300}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setPricing({
                      ...pricing,
                      generatorTariffsByCondition: { ...pricing.generatorTariffsByCondition, excelente: e.target.value },
                    })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Buena</Label>
                  <Input value={pricing.generatorTariffsByCondition.buena} type="number" min={20} max={300}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setPricing({
                      ...pricing,
                      generatorTariffsByCondition: { ...pricing.generatorTariffsByCondition, buena: e.target.value },
                    })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Regular</Label>
                  <Input value={pricing.generatorTariffsByCondition.regular} type="number" min={20} max={300}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setPricing({
                      ...pricing,
                      generatorTariffsByCondition: { ...pricing.generatorTariffsByCondition, regular: e.target.value },
                    })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Desgastada</Label>
                  <Input value={pricing.generatorTariffsByCondition.desgastada} type="number" min={20} max={300}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setPricing({
                      ...pricing,
                      generatorTariffsByCondition: { ...pricing.generatorTariffsByCondition, desgastada: e.target.value },
                    })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>Flete minimo recolector</Label>
                  <Input value={pricing.collectorFreight.min} type="number" min={15} max={25}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setPricing({
                      ...pricing,
                      collectorFreight: { ...pricing.collectorFreight, min: e.target.value },
                    })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Flete maximo recolector</Label>
                  <Input value={pricing.collectorFreight.max} type="number" min={15} max={25}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setPricing({
                      ...pricing,
                      collectorFreight: { ...pricing.collectorFreight, max: e.target.value },
                    })}
                  />
                </div>
              </div>

              <Button onClick={() => void handleSavePricing()} disabled={savingPricing}>
                {savingPricing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Guardar tarifas
              </Button>
            </Card>

            <Card className="p-4">
              <h2 className="font-semibold flex items-center gap-2 mb-3"><Gift className="w-4 h-4" /> Crear recompensa</h2>
              <form className="space-y-3" onSubmit={handleCreateReward}>
                <div className="space-y-1">
                  <Label>Titulo</Label>
                  <Input value={rewardForm.title} onChange={(e: ChangeEvent<HTMLInputElement>) => setRewardForm({ ...rewardForm, title: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Descripcion</Label>
                  <Textarea rows={2} value={rewardForm.description} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setRewardForm({ ...rewardForm, description: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>Puntos</Label>
                    <Input type="number" value={rewardForm.pointsCost} onChange={(e: ChangeEvent<HTMLInputElement>) => setRewardForm({ ...rewardForm, pointsCost: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Categoria</Label>
                    <Input value={rewardForm.category} onChange={(e: ChangeEvent<HTMLInputElement>) => setRewardForm({ ...rewardForm, category: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Comercio afiliado</Label>
                  <Input value={rewardForm.sponsor} onChange={(e: ChangeEvent<HTMLInputElement>) => setRewardForm({ ...rewardForm, sponsor: e.target.value })} />
                </div>
                <Button type="submit" disabled={savingReward}>
                  {savingReward ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Guardar recompensa
                </Button>
              </form>
            </Card>

            <Card className="p-4">
              <h2 className="font-semibold flex items-center gap-2 mb-3"><UserRoundPlus className="w-4 h-4" /> Asignar recompensa a cliente/recolector</h2>
              <form className="space-y-3" onSubmit={handleAssignReward}>
                <div className="space-y-1">
                  <Label>Usuario</Label>
                  <select
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={assignForm.userId}
                    onChange={(e) => setAssignForm({ ...assignForm, userId: e.target.value })}
                  >
                    <option value="">Selecciona usuario</option>
                    {targetUsers.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.type})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <Label>Recompensa</Label>
                  <select
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={assignForm.rewardId}
                    onChange={(e) => setAssignForm({ ...assignForm, rewardId: e.target.value })}
                  >
                    <option value="">Selecciona recompensa</option>
                    {rewards.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title} ({item.pointsCost || 0} pts)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <Label>Vigencia (dias)</Label>
                  <Input type="number" min={1} max={90} value={assignForm.expiresInDays}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setAssignForm({ ...assignForm, expiresInDays: e.target.value })}
                  />
                </div>

                <Button type="submit" disabled={assigningReward}>
                  {assigningReward ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserRoundPlus className="w-4 h-4 mr-2" />}
                  Asignar con cupón
                </Button>
              </form>
            </Card>

            <Card className="p-4">
              <h2 className="font-semibold mb-3">Catalogo actual</h2>
              {rewards.length === 0 ? (
                <p className="text-sm text-gray-600">No hay recompensas registradas.</p>
              ) : (
                <div className="space-y-2">
                  {rewards.map((item) => (
                    <div key={item.id} className="border rounded-lg p-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{item.title}</p>
                        <p className="text-sm text-gray-600">{item.description || 'Sin descripcion'}</p>
                        <div className="flex gap-2 mt-1">
                          <Badge variant="outline">{item.category || 'General'}</Badge>
                          <Badge variant="outline">{item.pointsCost || 0} pts</Badge>
                          <Badge variant={item.available ? 'default' : 'secondary'}>
                            {item.available ? 'Disponible' : 'No disponible'}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => void handleToggleReward(item)}>
                          {item.available ? 'Desactivar' : 'Activar'}
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => void handleDeleteReward(item.id)} disabled={deletingRewardId === item.id}>
                          {deletingRewardId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
