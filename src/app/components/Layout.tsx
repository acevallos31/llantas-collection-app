import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router';
import BottomNav from './BottomNav';
import { ANALYTICS_SESSION_ID_KEY, analyticsAPI } from '../services/api.ts';

export default function Layout() {
  const location = useLocation();
  const lastTrackedPathRef = useRef<string>(location.pathname);

  useEffect(() => {
    if (location.pathname === lastTrackedPathRef.current) {
      return;
    }

    lastTrackedPathRef.current = location.pathname;
    const sessionId = sessionStorage.getItem(ANALYTICS_SESSION_ID_KEY) || undefined;
    void analyticsAPI.trackVisit(location.pathname, sessionId);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto bg-white min-h-screen">
        <Outlet />
        <BottomNav />
      </div>
    </div>
  );
}
