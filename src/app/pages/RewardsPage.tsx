import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { rewardsAPI } from '../services/api';
import type { Reward } from '../mockData';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { 
  ChevronLeft, 
  Gift, 
  Award,
  ShoppingBag,
  Heart,
  Sparkles,
  Lock,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';

export default function RewardsPage() {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState<string | null>(null);

  const levelMilestones = [
    { name: 'Eco Novato', minPoints: 0 },
    { name: 'Eco Guardian', minPoints: 50 },
    { name: 'Eco Warrior', minPoints: 200 },
    { name: 'Eco Champion', minPoints: 500 },
    { name: 'Eco Master', minPoints: 1000 },
  ];

  const categories = [
    { id: 'all', label: 'Todas', icon: Gift },
    { id: 'Descuentos', label: 'Descuentos', icon: ShoppingBag },
    { id: 'Productos', label: 'Productos', icon: Gift },
    { id: 'Servicios', label: 'Servicios', icon: Award },
    { id: 'Impacto Social', label: 'Social', icon: Heart },
  ];

  useEffect(() => {
    loadRewards();
  }, []);

  const loadRewards = async () => {
    try {
      setLoading(true);
      const data = await rewardsAPI.getAll();
      setRewards(data || []);
    } catch (error) {
      console.error('Error loading rewards:', error);
      // Don't show error toast for empty rewards, just show empty state
      setRewards([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRedeem = async (rewardId: string, rewardTitle: string, pointsCost: number) => {
    if (!user) return;
    
    if (user.points < pointsCost) {
      toast.error('No tienes suficientes puntos');
      return;
    }

    try {
      setRedeeming(rewardId);
      const result = await rewardsAPI.redeem(rewardId);
      
      toast.success(`¡Recompensa canjeada!`, {
        description: `Has canjeado "${rewardTitle}". Puntos restantes: ${result.newPointsBalance}`
      });
      
      // Refresh user data to update points
      await refreshUser();
      
      // Reload rewards to update stock
      await loadRewards();
    } catch (error: any) {
      console.error('Error redeeming reward:', error);
      toast.error(error.message || 'Error al canjear recompensa');
    } finally {
      setRedeeming(null);
    }
  };

  const filteredRewards = selectedCategory === 'all' 
    ? rewards 
    : rewards.filter(r => r.category === selectedCategory);

  const currentPoints = user?.points || 0;
  const currentLevelIndex = Math.max(
    0,
    levelMilestones.findIndex((level, index) => {
      const nextLevel = levelMilestones[index + 1];
      return currentPoints >= level.minPoints && (!nextLevel || currentPoints < nextLevel.minPoints);
    }),
  );

  const currentLevel = levelMilestones[currentLevelIndex];
  const nextLevel = levelMilestones[currentLevelIndex + 1] || null;
  const currentLevelFloor = currentLevel?.minPoints || 0;
  const nextLevelTarget = nextLevel?.minPoints || currentLevelFloor;
  const pointsIntoLevel = currentPoints - currentLevelFloor;
  const levelSpan = Math.max(1, nextLevelTarget - currentLevelFloor);
  const levelProgress = nextLevel ? Math.min((pointsIntoLevel / levelSpan) * 100, 100) : 100;
  const pointsToNextLevel = nextLevel ? Math.max(nextLevelTarget - currentPoints, 0) : 0;

  const getCategoryIcon = (category: string) => {
    const cat = categories.find(c => c.id === category);
    return cat ? cat.icon : Gift;
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white p-6 rounded-b-3xl pb-12">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="text-white hover:bg-white/20"
          >
            <ChevronLeft className="w-6 h-6" />
          </Button>
          <h1 className="text-xl font-bold">Recompensas</h1>
        </div>

        {/* Points Card */}
        <Card className="bg-white/10 backdrop-blur border-white/20 p-6 text-center">
          <Sparkles className="w-8 h-8 mx-auto mb-2 text-yellow-300" />
          <div className="text-4xl font-bold mb-1">{user?.points || 0}</div>
          <div className="text-sm text-green-100">Puntos Disponibles</div>
          <div className="mt-4 flex gap-2 justify-center text-xs">
            <div className="bg-white/10 px-3 py-1 rounded-full">
              Objetivo: +{Math.max(pointsToNextLevel, 0)} pts
            </div>
            <div className="bg-white/10 px-3 py-1 rounded-full">
              Nivel {user?.level || 'Eco Novato'}
            </div>
          </div>
        </Card>
      </div>

      <div className="px-4 -mt-6">
        {/* Category Filter */}
        <div className="mb-6 overflow-x-auto">
          <div className="flex gap-2 pb-2">
            {categories.map((category) => {
              const Icon = category.icon;
              return (
                <Button
                  key={category.id}
                  variant={selectedCategory === category.id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedCategory(category.id)}
                  className={selectedCategory === category.id ? 'bg-green-600' : ''}
                >
                  <Icon className="w-4 h-4 mr-1" />
                  {category.label}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-green-600" />
          </div>
        ) : (
          <>
            {/* Rewards Grid */}
            <div className="space-y-4">
              {filteredRewards.map((reward) => {
                const Icon = getCategoryIcon(reward.category);
                const canAfford = (user?.points || 0) >= reward.pointsCost;
                const isAvailable = reward.available;

                return (
                  <Card 
                    key={reward.id} 
                    className={`p-4 hover:shadow-lg transition-shadow ${
                      !canAfford || !isAvailable ? 'opacity-60' : 'cursor-pointer'
                    }`}
                  >
                    <div className="flex gap-4">
                      {/* Icon */}
                      <div className={`w-16 h-16 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        canAfford && isAvailable ? 'bg-green-100' : 'bg-gray-100'
                      }`}>
                        {canAfford && isAvailable ? (
                          <Icon className="w-8 h-8 text-green-600" />
                        ) : (
                          <Lock className="w-8 h-8 text-gray-400" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="font-semibold">{reward.title}</h3>
                          {!isAvailable && (
                            <Badge variant="secondary" className="text-xs">
                              Agotado
                            </Badge>
                          )}
                        </div>

                        <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                          {reward.description}
                        </p>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {reward.category}
                            </Badge>
                            <div className={`font-bold ${
                              canAfford ? 'text-green-600' : 'text-gray-500'
                            }`}>
                              {reward.pointsCost} pts
                            </div>
                          </div>

                          {canAfford && isAvailable ? (
                            <Button 
                              size="sm" 
                              className="bg-green-600 hover:bg-green-700"
                              onClick={() => handleRedeem(reward.id, reward.title, reward.pointsCost)}
                              disabled={redeeming === reward.id}
                            >
                              {redeeming === reward.id ? (
                                <>
                                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                  Canjeando...
                                </>
                              ) : (
                                'Canjear'
                              )}
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" disabled>
                              {!isAvailable ? 'Agotado' : `Faltan ${reward.pointsCost - (user?.points || 0)} pts`}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>

            {/* How to earn more */}
            <Card className="p-6 mt-6 bg-gradient-to-br from-green-50 to-emerald-50">
              <h3 className="font-bold mb-4 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-green-600" />
                ¿Cómo ganar más puntos?
              </h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center text-white font-bold">
                    1
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Registra recolecciones</p>
                    <p className="text-xs text-gray-600">30 puntos por llanta</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center text-white font-bold">
                    2
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Usa la app diariamente</p>
                    <p className="text-xs text-gray-600">10 puntos bonus por día</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center text-white font-bold">
                    3
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Refiere amigos</p>
                    <p className="text-xs text-gray-600">100 puntos por referido</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center text-white font-bold">
                    4
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Completa desafíos</p>
                    <p className="text-xs text-gray-600">Hasta 500 puntos</p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Next Level */}
            <Card className="p-6 mt-4">
              <h3 className="font-bold mb-3">Próximo Nivel</h3>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-sm text-gray-600">{currentLevel?.name || 'Eco Novato'}</span>
                <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-green-600 rounded-full transition-all" 
                    style={{ width: `${levelProgress}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-green-600">{nextLevel?.name || 'Nivel maximo'}</span>
              </div>
              <p className="text-xs text-gray-600 text-center">
                {nextLevel
                  ? `Necesitas ${pointsToNextLevel} puntos mas para alcanzar ${nextLevel.name}`
                  : 'Ya alcanzaste el nivel maximo disponible'}
              </p>
            </Card>

            <Card className="p-6 mt-4 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
              <h3 className="font-bold mb-3">Programas de Beneficios Aliados</h3>
              <div className="space-y-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">EcoLlantas Service</p>
                    <p className="text-gray-600">Descuentos en mantenimiento para usuarios frecuentes.</p>
                  </div>
                  <Badge variant="outline">Aliado</Badge>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">Red Taller Verde</p>
                    <p className="text-gray-600">Bonos por cumplimiento continuo en disposición de llantas.</p>
                  </div>
                  <Badge variant="outline">Empresarial</Badge>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">Plan Impacto Empresarial</p>
                    <p className="text-gray-600">Beneficios por volumen para compañías con alta trazabilidad.</p>
                  </div>
                  <Badge variant="outline">Premium</Badge>
                </div>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}