import { Outlet } from 'react-router';
import BottomNav from './BottomNav';

export default function Layout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto bg-white min-h-screen">
        <Outlet />
        <BottomNav />
      </div>
    </div>
  );
}
