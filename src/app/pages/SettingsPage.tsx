import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Switch } from '../components/ui/switch';
import { 
  ChevronLeft, 
  ChevronRight,
  Bell,
  Shield,
  Globe,
  Moon,
  HelpCircle,
  FileText,
  LogOut,
  Trash2,
  User,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';

export default function SettingsPage() {
  const navigate = useNavigate();
  const { signout, user } = useAuth();
  const [notifications, setNotifications] = useState({
    collections: true,
    rewards: true,
    news: false,
    marketing: false,
  });
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (confirm('¿Estás seguro de que quieres cerrar sesión?')) {
      try {
        setIsLoggingOut(true);
        await signout();
        toast.success('Sesión cerrada exitosamente');
        navigate('/', { replace: true });
      } catch (error) {
        toast.error('Error al cerrar sesión');
        setIsLoggingOut(false);
      }
    }
  };

  const handleDeleteAccount = () => {
    if (confirm('¿Estás seguro de que quieres eliminar tu cuenta? Esta acción no se puede deshacer.')) {
      alert('Para eliminar tu cuenta, por favor contacta a soporte. Esta función estará disponible próximamente.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white p-6 rounded-b-3xl">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="text-white hover:bg-white/20"
          >
            <ChevronLeft className="w-6 h-6" />
          </Button>
          <h1 className="text-xl font-bold">Configuración</h1>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Account Section */}
        <div>
          <h2 className="text-sm font-semibold text-gray-500 mb-3 px-1">CUENTA</h2>
          <Card className="divide-y">
            <button
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
              onClick={() => navigate('/profile')}
            >
              <div className="flex items-center gap-3">
                <User className="w-5 h-5 text-gray-600" />
                <div className="text-left">
                  <div className="font-medium">Perfil</div>
                  <div className="text-xs text-gray-500">{user?.name}</div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </button>

            <button
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-gray-600" />
                <span className="font-medium">Privacidad y Seguridad</span>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </button>
          </Card>
        </div>

        {/* Notifications Section */}
        <div>
          <h2 className="text-sm font-semibold text-gray-500 mb-3 px-1">NOTIFICACIONES</h2>
          <Card className="divide-y">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-gray-600" />
                <div>
                  <div className="font-medium">Recolecciones</div>
                  <div className="text-xs text-gray-500">Actualizaciones de tus recolecciones</div>
                </div>
              </div>
              <Switch
                checked={notifications.collections}
                onCheckedChange={(checked) =>
                  setNotifications({ ...notifications, collections: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-gray-600" />
                <div>
                  <div className="font-medium">Recompensas</div>
                  <div className="text-xs text-gray-500">Nuevas recompensas disponibles</div>
                </div>
              </div>
              <Switch
                checked={notifications.rewards}
                onCheckedChange={(checked) =>
                  setNotifications({ ...notifications, rewards: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-gray-600" />
                <div>
                  <div className="font-medium">Noticias</div>
                  <div className="text-xs text-gray-500">Novedades de EcolLantApp</div>
                </div>
              </div>
              <Switch
                checked={notifications.news}
                onCheckedChange={(checked) =>
                  setNotifications({ ...notifications, news: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-gray-600" />
                <div>
                  <div className="font-medium">Promociones</div>
                  <div className="text-xs text-gray-500">Ofertas y descuentos especiales</div>
                </div>
              </div>
              <Switch
                checked={notifications.marketing}
                onCheckedChange={(checked) =>
                  setNotifications({ ...notifications, marketing: checked })
                }
              />
            </div>
          </Card>
        </div>

        {/* Preferences Section */}
        <div>
          <h2 className="text-sm font-semibold text-gray-500 mb-3 px-1">PREFERENCIAS</h2>
          <Card className="divide-y">
            <button className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-3">
                <Globe className="w-5 h-5 text-gray-600" />
                <div className="text-left">
                  <div className="font-medium">Idioma</div>
                  <div className="text-xs text-gray-500">Español</div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </button>

            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Moon className="w-5 h-5 text-gray-600" />
                <div>
                  <div className="font-medium">Modo Oscuro</div>
                  <div className="text-xs text-gray-500">Próximamente disponible</div>
                </div>
              </div>
              <Switch disabled />
            </div>
          </Card>
        </div>

        {/* Support Section */}
        <div>
          <h2 className="text-sm font-semibold text-gray-500 mb-3 px-1">SOPORTE</h2>
          <Card className="divide-y">
            <button className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-3">
                <HelpCircle className="w-5 h-5 text-gray-600" />
                <span className="font-medium">Centro de Ayuda</span>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </button>

            <button className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-gray-600" />
                <span className="font-medium">Términos y Condiciones</span>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </button>

            <button className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-gray-600" />
                <span className="font-medium">Política de Privacidad</span>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </button>
          </Card>
        </div>

        {/* Actions Section */}
        <div>
          <h2 className="text-sm font-semibold text-gray-500 mb-3 px-1">ACCIONES</h2>
          <Card className="divide-y">
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                {isLoggingOut ? (
                  <Loader2 className="w-5 h-5 text-orange-600 animate-spin" />
                ) : (
                  <LogOut className="w-5 h-5 text-orange-600" />
                )}
                <span className="font-medium text-orange-600">
                  {isLoggingOut ? 'Cerrando sesión...' : 'Cerrar Sesión'}
                </span>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </button>

            <button
              onClick={handleDeleteAccount}
              className="w-full flex items-center justify-between p-4 hover:bg-red-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Trash2 className="w-5 h-5 text-red-600" />
                <span className="font-medium text-red-600">Eliminar Cuenta</span>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </button>
          </Card>
        </div>

        {/* App Info */}
        <div className="text-center text-sm text-gray-500 space-y-1 pt-4">
          <p className="font-semibold text-green-600">EcolLantApp</p>
          <p>Versión 1.0.0</p>
          <p>© 2026 Todos los derechos reservados</p>
        </div>
      </div>
    </div>
  );
}