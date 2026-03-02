import { useNavigate, useLocation } from 'react-router';
import { Home, History, Gift, Settings } from 'lucide-react';

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { path: '/home', icon: Home, label: 'Inicio' },
    { path: '/history', icon: History, label: 'Historial' },
    { path: '/rewards', icon: Gift, label: 'Premios' },
    { path: '/settings', icon: Settings, label: 'Ajustes' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-area-pb">
      <div className="max-w-lg mx-auto px-2">
        <div className="grid grid-cols-4 gap-1">
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
