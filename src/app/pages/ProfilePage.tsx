import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { statsAPI } from '../services/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { 
  ChevronLeft, 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  Award,
  TrendingUp,
  Package,
  Leaf,
  Edit,
  Loader2
} from 'lucide-react';

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalCollections: 0,
    totalTires: 0,
    totalPoints: 0,
    co2Saved: 0,
    treesEquivalent: 0,
    recycledWeight: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, [user]);

  const loadStats = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      const userStats = await statsAPI.get(user.id);
      setStats(userStats);
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!user || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white p-6 rounded-b-3xl pb-20">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="text-white hover:bg-white/20"
          >
            <ChevronLeft className="w-6 h-6" />
          </Button>
          <h1 className="text-xl font-bold">Mi Perfil</h1>
        </div>
      </div>

      <div className="px-4 -mt-12">
        {/* Profile Card */}
        <Card className="p-6 mb-6">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center text-white text-3xl font-bold shadow-lg">
              {user.name.charAt(0)}
            </div>
            <div className="flex-1">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h2 className="text-xl font-bold">{user.name}</h2>
                  <Badge className="bg-green-600 mt-1">
                    <Award className="w-3 h-3 mr-1" />
                    {user.level}
                  </Badge>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => navigate('/settings')}
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Editar
                </Button>
              </div>
            </div>
          </div>

          {/* Contact Info */}
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <Mail className="w-4 h-4 text-gray-400" />
              <span className="text-gray-700">{user.email}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Phone className="w-4 h-4 text-gray-400" />
              <span className="text-gray-700">{user.phone}</span>
            </div>
            {user.address && (
              <div className="flex items-center gap-3 text-sm">
                <MapPin className="w-4 h-4 text-gray-400" />
                <span className="text-gray-700">{user.address}</span>
              </div>
            )}
          </div>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <Award className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">{user.points}</div>
                <div className="text-xs text-gray-600">Puntos Totales</div>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <Package className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-600">{stats.totalCollections}</div>
                <div className="text-xs text-gray-600">Recolecciones</div>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-600">{stats.totalTires}</div>
                <div className="text-xs text-gray-600">Llantas</div>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
                <Leaf className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-emerald-600">{stats.co2Saved.toFixed(0)}kg</div>
                <div className="text-xs text-gray-600">CO₂ Evitado</div>
              </div>
            </div>
          </Card>
        </div>

        {/* Impact Section */}
        <Card className="p-6 mb-6 bg-gradient-to-br from-green-50 to-emerald-50">
          <h3 className="font-bold mb-4 flex items-center gap-2">
            <Leaf className="w-5 h-5 text-green-600" />
            Tu Impacto Ambiental
          </h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-700">Árboles equivalentes</span>
                <span className="font-semibold text-green-600">{stats.treesEquivalent} 🌳</span>
              </div>
              <div className="h-2 bg-white rounded-full overflow-hidden">
                <div 
                  className="h-full bg-green-600 rounded-full transition-all" 
                  style={{ width: `${Math.min((stats.treesEquivalent / 10) * 100, 100)}%` }} 
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-700">Peso reciclado</span>
                <span className="font-semibold text-green-600">{stats.recycledWeight.toFixed(0)} kg</span>
              </div>
              <div className="h-2 bg-white rounded-full overflow-hidden">
                <div 
                  className="h-full bg-green-600 rounded-full transition-all" 
                  style={{ width: `${Math.min((stats.recycledWeight / 500) * 100, 100)}%` }} 
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-700">CO₂ evitado</span>
                <span className="font-semibold text-green-600">{stats.co2Saved.toFixed(1)} kg</span>
              </div>
              <div className="h-2 bg-white rounded-full overflow-hidden">
                <div 
                  className="h-full bg-green-600 rounded-full transition-all" 
                  style={{ width: `${Math.min((stats.co2Saved / 300) * 100, 100)}%` }} 
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Achievements */}
        <Card className="p-6">
          <h3 className="font-bold mb-4">Logros Recientes</h3>
          <div className="grid grid-cols-4 gap-3">
            {['🏆', '🌟', '♻️', '🎯', '💚', '🌱', '⭐', '🏅'].map((emoji, index) => {
              // Unlock achievements based on stats
              const isUnlocked = 
                (index === 0 && stats.totalCollections > 0) ||
                (index === 1 && stats.totalCollections >= 5) ||
                (index === 2 && stats.totalTires >= 10) ||
                (index === 3 && stats.totalTires >= 20) ||
                (index === 4 && user.points >= 100) ||
                (index === 5 && user.points >= 300) ||
                (index === 6 && stats.treesEquivalent >= 5) ||
                (index === 7 && user.points >= 500);
              
              return (
                <div
                  key={index}
                  className={`aspect-square rounded-lg flex items-center justify-center text-2xl ${
                    isUnlocked ? 'bg-green-100' : 'bg-gray-100 opacity-50'
                  }`}
                >
                  {emoji}
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}