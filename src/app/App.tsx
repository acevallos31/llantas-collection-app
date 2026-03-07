import { RouterProvider } from 'react-router';
import { useEffect, useRef } from 'react';
import { Toaster } from './components/ui/sonner';
import { AuthProvider } from './contexts/AuthContext';
import { router } from './routes';
import { analyticsAPI } from './services/api';

export default function App() {
  const SESSION_ID_KEY = 'ecolant_session_id';
  const SESSION_STARTED_KEY = 'ecolant_session_started';
  const sessionStartRef = useRef<number>(Date.now());
  const existingSessionId = sessionStorage.getItem(SESSION_ID_KEY);
  const sessionIdRef = useRef<string>(existingSessionId || crypto.randomUUID());
  const sessionEndedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!existingSessionId) {
      sessionStorage.setItem(SESSION_ID_KEY, sessionIdRef.current);
    }

    const wasStarted = sessionStorage.getItem(SESSION_STARTED_KEY) === '1';
    if (!wasStarted) {
      sessionStorage.setItem(SESSION_STARTED_KEY, '1');
      void analyticsAPI.trackVisit(window.location.pathname, sessionIdRef.current);
      void analyticsAPI.startSession(sessionIdRef.current, new Date().toISOString());
    } else {
      void analyticsAPI.pingSession(sessionIdRef.current);
    }

    const navigationEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const loadTimeMs = navigationEntry?.loadEventEnd && navigationEntry.loadEventEnd > 0
      ? navigationEntry.loadEventEnd
      : performance.now();
    void analyticsAPI.trackAppLoadTime(loadTimeMs);

    const reportSession = () => {
      if (sessionEndedRef.current) return;
      sessionEndedRef.current = true;
      const durationMs = Date.now() - sessionStartRef.current;
      if (durationMs > 0) {
        void analyticsAPI.endSession(sessionIdRef.current, durationMs);
      }
    };

    window.addEventListener('beforeunload', reportSession);
    window.addEventListener('pagehide', reportSession);

    const pingInterval = window.setInterval(() => {
      if (!sessionEndedRef.current) {
        void analyticsAPI.pingSession(sessionIdRef.current);
      }
    }, 30000);

    return () => {
      window.removeEventListener('beforeunload', reportSession);
      window.removeEventListener('pagehide', reportSession);
      window.clearInterval(pingInterval);
    };
  }, [existingSessionId]);

  return (
    <AuthProvider>
      <RouterProvider router={router} />
      <Toaster position="top-center" />
    </AuthProvider>
  );
}