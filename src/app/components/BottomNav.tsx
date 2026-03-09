import { useNavigate, useLocation } from 'react-router';
import { Home, History, Gift, Settings, Truck, LayoutDashboard, Users, Store, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const isCollector = user?.type === 'collector';
  const isAdmin = user?.type === 'admin';
  const isClient = user?.type === 'cliente';

  const navItems = isAdmin
    ? [
        { path: '/admin', icon: LayoutDashboard, label: 'Panel' },
        { path: '/admin-points', icon: Users, label: 'Centros' },
        { path: '/admin-marketplace', icon: Store, label: 'Market' },
        { path: '/settings', icon: Settings, label: 'Ajustes' },
      ]
    : isCollector
    ? [
        { path: '/collector', icon: Truck, label: 'Recolector' },
        { path: '/collector-marketplace', icon: Store, label: 'Entregas' },
        { path: '/history', icon: History, label: 'Historial' },
        { path: '/settings', icon: Settings, label: 'Ajustes' },
      ]
    : isClient
    ? [
        { path: '/marketplace', icon: Store, label: 'Tienda' },
        { path: '/profile', icon: User, label: 'Perfil' },
        { path: '/settings', icon: Settings, label: 'Ajustes' },
      ]
    : [
        { path: '/home', icon: Home, label: 'Inicio' },
        { path: '/history', icon: History, label: 'Historial' },
        { path: '/rewards', icon: Gift, label: 'Premios' },
        { path: '/settings', icon: Settings, label: 'Ajustes' },
      ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-area-pb">
      <div className="max-w-lg mx-auto px-2">
        <div className={`grid ${navItems.length === 3 ? 'grid-cols-3' : 'grid-cols-4'} gap-1`}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`flex flex-col items-center gap-1 py-3 transition-colors ${
                  isActive ? 'text-green-600' : 'text-gray-600'
                }`}
              >
                <Icon className={`w-6 h-6 ${isActive ? 'fill-green-600' : ''}`} />
                <span className="text-xs font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
