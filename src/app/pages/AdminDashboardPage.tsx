import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext.tsx';
import { ANALYTICS_SESSION_ID_KEY, adminAPI } from '../services/api.js';
import { Card } from '../components/ui/card.tsx';
import { Button } from '../components/ui/button.tsx';
import { Input } from '../components/ui/input.tsx';
import { Label } from '../components/ui/label.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs.tsx';
import { Badge } from '../components/ui/badge.tsx';
import {
  Loader2,
  Settings2,
  ChartNoAxesCombined,
  Warehouse,
  UserPlus,
  Pencil,
  Save,
  KeyRound,
  Trash2,
  X,
  Timer,
  Activity,
  Gauge,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { API_BASE_URL, getAuthHeaders, authAPI } from '../services/api.js';

interface AdminSettings {
  appName: string;
  supportEmail: string;
  maintenanceMode: boolean;
  rewardsEnabled: boolean;
  includeAdminAnalytics: boolean;
  serverTimezone: string;
}

interface AdminAnalytics {
  totalVisits: number;
  totalSessionDurationMs: number;
  sessionCount: number;
  averageSessionDurationMs: number;
  totalAppLoadTimeMs: number;
  appLoadSampleCount: number;
  averageAppLoadTimeMs: number;
  activeSessions: number;
  concurrentSessions: number;
  peakConcurrentSessions: number;
  updatedAt: string | null;
}

interface AnalyticsSeriesItem {
  period: string;
  visits: number;
  averageSessionDurationMs: number;
  averageAppLoadTimeMs: number;
}

interface AnalyticsReport {
  filters: {
    from: string | null;
    to: string | null;
    period: 'daily' | 'weekly' | 'monthly';
    userType: 'all' | 'generator' | 'collector' | 'admin' | 'guest';
  };
  summary: {
    totalVisits: number;
    averageSessionDurationMs: number;
    averageAppLoadTimeMs: number;
    sessionCount: number;
    loadSampleCount: number;
    concurrentSessions: number;
    peakConcurrentSessions: number;
  };
  series: AnalyticsSeriesItem[];
  generatedAt: string;
}

interface AnalyticsCampaign {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string | null;
  period: 'daily' | 'weekly' | 'monthly';
  userType: 'all' | 'generator' | 'collector' | 'admin' | 'guest';
  status: 'scheduled' | 'active';
}

interface ActiveAnalyticsSession {
  sessionId: string;
  userType: string;
  userId?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  lastPath?: string | null;
  lastActivityType?: string | null;
  lastActivityAt?: string | null;
  isCurrentSession?: boolean;
  startedAt: string | null;
  lastSeenAt: string | null;
  ageSeconds: number | null;
}

interface SessionActivityEvent {
  id: string;
  type: string;
  userType: string;
  path: string | null;
  durationMs: number | null;
  loadTimeMs: number | null;
  timestamp: string;
  sessionId: string;
}

interface ActiveSessionActivity {
  sessionId: string;
  userName: string | null;
  userEmail: string | null;
  userType: string | null;
  lastPath: string | null;
  lastActivityType: string | null;
  lastActivityAt: string | null;
  events: SessionActivityEvent[];
  generatedAt: string;
}

interface AdminUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  type: 'generator' | 'collector' | 'admin';
  points?: number;
  level?: string;
}

const defaultCreateUserForm = {
  name: '',
  email: '',
  password: '',
  phone: '',
  address: '',
  type: 'generator' as 'generator' | 'collector' | 'admin',
};

// ...existing code...

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  // WebRTC señalización para recibir stream
  const [adminPeerConnection, setAdminPeerConnection] = useState<RTCPeerConnection | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [webRTCError, setWebRTCError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [reports, setReports] = useState<any | null>(null);
  const [settings, setSettings] = useState<AdminSettings>({
    appName: 'EcolLantApp',
    supportEmail: 'soporte@ecollant.com',
    maintenanceMode: false,
    rewardsEnabled: true,
    includeAdminAnalytics: false,
    serverTimezone: 'America/Tegucigalpa',
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [analytics, setAnalytics] = useState<AdminAnalytics>({
    totalVisits: 0,
    totalSessionDurationMs: 0,
    sessionCount: 0,
    averageSessionDurationMs: 0,
    totalAppLoadTimeMs: 0,
    appLoadSampleCount: 0,
    averageAppLoadTimeMs: 0,
    activeSessions: 0,
    concurrentSessions: 0,
    peakConcurrentSessions: 0,
    updatedAt: null,
  });
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [analyticsReport, setAnalyticsReport] = useState<AnalyticsReport | null>(null);
  const [analyticsFilters, setAnalyticsFilters] = useState({
    from: '',
    to: '',
    period: 'daily' as 'daily' | 'weekly' | 'monthly',
    userType: 'all' as 'all' | 'generator' | 'collector' | 'admin' | 'guest',
  });
  const [indicatorFilters, setIndicatorFilters] = useState({
    visits: true,
    sessionDuration: true,
    appLoad: true,
    concurrentSessions: true,
  });
  const [analyticsCampaigns, setAnalyticsCampaigns] = useState<AnalyticsCampaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
  const [campaignSubTab, setCampaignSubTab] = useState<'campaign-list' | 'campaign-dashboard'>('campaign-list');
  const [campaignDashboardReport, setCampaignDashboardReport] = useState<AnalyticsReport | null>(null);
  const [campaignDashboardLoading, setCampaignDashboardLoading] = useState(false);
  const [activeSessionsData, setActiveSessionsData] = useState<{
    activeSessions: number;
    concurrentSessions: number;
    peakConcurrentSessions: number;
    generatedAt: string | null;
    sessions: ActiveAnalyticsSession[];
  } | null>(null);
  const [activeSessionsLoading, setActiveSessionsLoading] = useState(false);
  const [selectedActiveSessionIds, setSelectedActiveSessionIds] = useState<string[]>([]);
  const [activeSessionsError, setActiveSessionsError] = useState<string | null>(null);
  const [activeSessionsPollingEnabled, setActiveSessionsPollingEnabled] = useState(true);
  const [updatingIncludeAdminSessions, setUpdatingIncludeAdminSessions] = useState(false);
  const [monitoredSessionId, setMonitoredSessionId] = useState<string | null>(null);
  const [sessionActivityData, setSessionActivityData] = useState<ActiveSessionActivity | null>(null);
  const [sessionActivityLoading, setSessionActivityLoading] = useState(false);
  const [liveSessionId, setLiveSessionId] = useState<string | null>(null);
  const [liveSessionData, setLiveSessionData] = useState<ActiveSessionActivity | null>(null);
  const [liveSessionLoading, setLiveSessionLoading] = useState(false);
  const [requestingLiveSessionId, setRequestingLiveSessionId] = useState<string | null>(null);
  const [assistanceRequestedSessions, setAssistanceRequestedSessions] = useState<Record<string, boolean>>({});
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const offerPollRef = useRef<number | null>(null);
  const collectorIcePollRef = useRef<number | null>(null);
  const [campaignForm, setCampaignForm] = useState({
    name: '',
    startsAt: '',
    endsAt: '',
    period: 'daily' as 'daily' | 'weekly' | 'monthly',
    userType: 'all' as 'all' | 'generator' | 'collector' | 'admin' | 'guest',
  });
  const [analyticsBusy, setAnalyticsBusy] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [createUserForm, setCreateUserForm] = useState(defaultCreateUserForm);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUserForm, setEditUserForm] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    type: 'generator' as 'generator' | 'collector' | 'admin',
  });

  const isAdmin = user?.type === 'admin';

  useEffect(() => {
    if (!remoteVideoRef.current) return;
    remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  useEffect(() => {
    try {
      if (!user || user.type !== 'admin') return;
      const sessionId = sessionStorage.getItem('ecolant_session_id');
      if (!sessionId) return;
      void loadAdminData();
    } catch (err) {
      console.error('Admin WebRTC error:', err);
      setWebRTCError('Error en la inicialización de asistencia remota');
    }
  }, [user]);

  const loadAdminData = async () => {
    try {
      setLoading(true);
      const [usersData, reportData, settingsData, analyticsData] = await Promise.all([
        adminAPI.getUsers(),
        adminAPI.getReportsOverview(),
        adminAPI.getSettings(),
        adminAPI.getAnalytics(),
      ]);
      setUsers(usersData || []);
      setReports(reportData || null);
      setSettings({
        appName: settingsData?.appName || settings.appName,
        supportEmail: settingsData?.supportEmail || settings.supportEmail,
        maintenanceMode: Boolean(settingsData?.maintenanceMode),
        rewardsEnabled: settingsData?.rewardsEnabled !== false,
        includeAdminAnalytics: Boolean(settingsData?.includeAdminAnalytics),
        serverTimezone: settingsData?.serverTimezone || settings.serverTimezone,
      });
      const safeAnalytics: AdminAnalytics = {
        totalVisits: Number(analyticsData?.totalVisits || 0),
        totalSessionDurationMs: Number(analyticsData?.totalSessionDurationMs || 0),
        sessionCount: Number(analyticsData?.sessionCount || 0),
        averageSessionDurationMs: Number(analyticsData?.averageSessionDurationMs || 0),
        totalAppLoadTimeMs: Number(analyticsData?.totalAppLoadTimeMs || 0),
        appLoadSampleCount: Number(analyticsData?.appLoadSampleCount || 0),
        averageAppLoadTimeMs: Number(analyticsData?.averageAppLoadTimeMs || 0),
        activeSessions: Number(analyticsData?.activeSessions || 0),
        concurrentSessions: Number(analyticsData?.concurrentSessions || 0),
        peakConcurrentSessions: Number(analyticsData?.peakConcurrentSessions || 0),
        updatedAt: analyticsData?.updatedAt || null,
      };
      setAnalytics(safeAnalytics);
      const [dynamicReport, campaignData] = await Promise.all([
        adminAPI.getAnalyticsReport({ period: analyticsFilters.period, userType: analyticsFilters.userType }),
        adminAPI.getAnalyticsCampaigns(),
      ]);
      setAnalyticsReport(dynamicReport || null);
      setAnalyticsCampaigns((campaignData || []) as AnalyticsCampaign[]);
    } catch (error: any) {
      toast.error(error.message || 'No se pudo cargar el panel administrativo');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyAnalyticsFilters = async () => {
    try {
      setAnalyticsBusy(true);
      const report = await adminAPI.getAnalyticsReport({
        from: analyticsFilters.from || undefined,
        to: analyticsFilters.to || undefined,
        period: analyticsFilters.period,
        userType: analyticsFilters.userType,
      });
      setAnalyticsReport(report || null);
      toast.success('Reporte de analitica actualizado');
    } catch (error: any) {
      toast.error(error.message || 'No se pudo filtrar la analitica');
    } finally {
      setAnalyticsBusy(false);
    }
  };

  const handleCreateCampaign = async () => {
    if (!campaignForm.name || !campaignForm.startsAt) {
      toast.error('Nombre y fecha de inicio son obligatorios');
      return;
    }

    try {
      setAnalyticsBusy(true);
      const createdCampaign = await adminAPI.createAnalyticsCampaign({
        name: campaignForm.name,
        startsAt: new Date(campaignForm.startsAt).toISOString(),
        endsAt: campaignForm.endsAt ? new Date(campaignForm.endsAt).toISOString() : undefined,
        period: campaignForm.period,
        userType: campaignForm.userType,
      });
      const campaignData = await adminAPI.getAnalyticsCampaigns();
      setAnalyticsCampaigns((campaignData || []) as AnalyticsCampaign[]);
      setCampaignForm({
        name: '',
        startsAt: '',
        endsAt: '',
        period: 'daily',
        userType: 'all',
      });
      setEditingCampaignId(null);
      if (createdCampaign?.id) {
        setSelectedCampaignId(createdCampaign.id);
        setCampaignSubTab('campaign-dashboard');
      }
      toast.success('Campana programada');
    } catch (error: any) {
      toast.error(error.message || 'No se pudo programar la campana');
    } finally {
      setAnalyticsBusy(false);
    }
  };

  const handleSelectCampaign = (campaign: AnalyticsCampaign) => {
    setSelectedCampaignId(campaign.id);
    setEditingCampaignId(null);
    setCampaignSubTab('campaign-dashboard');
    void loadCampaignDashboard(campaign);
  };

  const handleStartEditCampaign = (campaign: AnalyticsCampaign) => {
    setSelectedCampaignId(campaign.id);
    setEditingCampaignId(campaign.id);
    setCampaignSubTab('campaign-list');
    setCampaignForm({
      name: campaign.name,
      startsAt: toDateTimeLocalValue(campaign.startsAt),
      endsAt: toDateTimeLocalValue(campaign.endsAt),
      period: campaign.period,
      userType: campaign.userType,
    });
  };

  const handleUpdateCampaign = async () => {
    if (!editingCampaignId) return;
    if (!campaignForm.name || !campaignForm.startsAt) {
      toast.error('Nombre y fecha de inicio son obligatorios');
      return;
    }

    try {
      setAnalyticsBusy(true);
      await adminAPI.updateAnalyticsCampaign(editingCampaignId, {
        name: campaignForm.name,
        startsAt: new Date(campaignForm.startsAt).toISOString(),
        endsAt: campaignForm.endsAt ? new Date(campaignForm.endsAt).toISOString() : undefined,
        period: campaignForm.period,
        userType: campaignForm.userType,
      });
      const campaignData = await adminAPI.getAnalyticsCampaigns();
      setAnalyticsCampaigns((campaignData || []) as AnalyticsCampaign[]);
      const updatedCampaign = (campaignData || []).find((item: AnalyticsCampaign) => item.id === editingCampaignId) || null;
      setEditingCampaignId(null);
      if (updatedCampaign) {
        setSelectedCampaignId(updatedCampaign.id);
        await loadCampaignDashboard(updatedCampaign);
      }
      toast.success('Campana actualizada');
    } catch (error: any) {
      toast.error(error.message || 'No se pudo actualizar la campana');
    } finally {
      setAnalyticsBusy(false);
    }
  };

  const handleDeleteCampaign = async (campaign: AnalyticsCampaign) => {
    const confirmed = window.confirm(`Eliminar campana ${campaign.name}?`);
    if (!confirmed) return;

    try {
      setAnalyticsBusy(true);
      await adminAPI.deleteAnalyticsCampaign(campaign.id);
      const campaignData = await adminAPI.getAnalyticsCampaigns();
      setAnalyticsCampaigns((campaignData || []) as AnalyticsCampaign[]);
      if (selectedCampaignId === campaign.id) {
        setSelectedCampaignId(null);
        setCampaignDashboardReport(null);
      }
      if (editingCampaignId === campaign.id) {
        setEditingCampaignId(null);
      }
      toast.success('Campana eliminada');
    } catch (error: any) {
      toast.error(error.message || 'No se pudo eliminar la campana');
    } finally {
      setAnalyticsBusy(false);
    }
  };

  const selectedCampaign = analyticsCampaigns.find((campaign) => campaign.id === selectedCampaignId) || null;

  const loadCampaignDashboard = async (campaign: AnalyticsCampaign) => {
    try {
      setCampaignDashboardLoading(true);
      const report = await adminAPI.getAnalyticsReport({
        from: campaign.startsAt,
        to: campaign.endsAt || undefined,
        period: campaign.period,
        userType: campaign.userType,
      });
      setCampaignDashboardReport(report || null);
    } catch (error: any) {
      setCampaignDashboardReport(null);
      toast.error(error.message || 'No se pudo cargar el dashboard de la campana');
    } finally {
      setCampaignDashboardLoading(false);
    }
  };

  const handleCleanTestData = async () => {
    try {
      setAnalyticsBusy(true);
      await adminAPI.resetAnalyticsTestData();
      await loadAdminData();
      toast.success('Datos de prueba limpiados');
    } catch (error: any) {
      toast.error(error.message || 'No se pudieron limpiar los datos de prueba');
    } finally {
      setAnalyticsBusy(false);
    }
  };

  const loadActiveSessionsControl = async (options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent);
    try {
      setActiveSessionsLoading(true);
      const result = await adminAPI.getActiveAnalyticsSessions();
      setActiveSessionsError(null);
      setActiveSessionsPollingEnabled(true);
      setActiveSessionsData({
        activeSessions: Number(result?.activeSessions || 0),
        concurrentSessions: Number(result?.concurrentSessions || 0),
        peakConcurrentSessions: Number(result?.peakConcurrentSessions || 0),
        generatedAt: result?.generatedAt || null,
        sessions: Array.isArray(result?.sessions) ? result.sessions : [],
      });
      const activeIds = Array.isArray(result?.sessions)
        ? result.sessions.map((item: ActiveAnalyticsSession) => item.sessionId)
        : [];

      if (activeIds.length > 0) {
        const entries = await Promise.all(
          activeIds.map(async (sessionId: string) => {
            try {
              const response = await fetch(`${API_BASE_URL}/analytics/session/screen-share-request/${sessionId}`, {
                method: 'GET',
                headers: getAuthHeaders(true),
              });
              const data = await response.json();
              const hasRequest = data?.request?.status === 'user-requested';
              return [sessionId, hasRequest] as const;
            } catch {
              return [sessionId, false] as const;
            }
          }),
        );
        setAssistanceRequestedSessions(Object.fromEntries(entries));
      } else {
        setAssistanceRequestedSessions({});
      }

      setSelectedActiveSessionIds((prev) => prev.filter((id) => activeIds.includes(id)));
      setMonitoredSessionId((prev) => {
        if (!prev) return prev;
        if (activeIds.includes(prev)) return prev;
        setSessionActivityData(null);
        return null;
      });
      setLiveSessionId((prev) => {
        if (!prev) return prev;
        if (activeIds.includes(prev)) return prev;
        setLiveSessionData(null);
        return null;
      });
    } catch (error: any) {
      const message = error?.message || 'No se pudieron cargar las sesiones activas';
      setActiveSessionsError(message);

      // If backend route is unavailable, stop automatic polling to avoid repeated noisy failures.
      if (/not found|404/i.test(String(message))) {
        setActiveSessionsPollingEnabled(false);
      }

      if (!silent) {
        toast.error(message);
      }
    } finally {
      setActiveSessionsLoading(false);
    }
  };

  const handleCloseOneActiveSession = async (sessionId: string) => {
    const currentSessionId = sessionStorage.getItem(ANALYTICS_SESSION_ID_KEY);
    if (currentSessionId && currentSessionId === sessionId) {
      toast.error('No puedes cerrar tu sesion activa desde este panel');
      return;
    }

    try {
      await adminAPI.closeAnalyticsSession(sessionId);
      setSelectedActiveSessionIds((prev) => prev.filter((id) => id !== sessionId));
      if (monitoredSessionId === sessionId) {
        setMonitoredSessionId(null);
        setSessionActivityData(null);
      }
      if (liveSessionId === sessionId) {
        setLiveSessionId(null);
        setLiveSessionData(null);
      }
      await loadActiveSessionsControl();
      toast.success('Sesion cerrada');
    } catch (error: any) {
      toast.error(error.message || 'No se pudo cerrar la sesion');
    }
  };

  const handleCloseAllActiveSessions = async () => {
    const confirmed = window.confirm('Cerrar todas las sesiones activas?');
    if (!confirmed) return;
    try {
      const currentSessionId = sessionStorage.getItem(ANALYTICS_SESSION_ID_KEY) || undefined;
      await adminAPI.closeAllAnalyticsSessions(currentSessionId);
      setSelectedActiveSessionIds([]);
      await loadActiveSessionsControl();
      await loadAdminData();
      toast.success('Se cerraron todas las sesiones excepto la del administrador actual');
    } catch (error: any) {
      toast.error(error.message || 'No se pudieron cerrar las sesiones');
    }
  };

  const handleToggleIncludeAdminSessions = async () => {
    const nextValue = !settings.includeAdminAnalytics;
    try {
      setUpdatingIncludeAdminSessions(true);
      await adminAPI.updateSettings({ includeAdminAnalytics: nextValue });
      setSettings((prev) => ({ ...prev, includeAdminAnalytics: nextValue }));
      await loadActiveSessionsControl({ silent: true });
      toast.success(nextValue ? 'Sesiones de administradores habilitadas' : 'Sesiones de administradores deshabilitadas');
    } catch (error: any) {
      toast.error(error?.message || 'No se pudo actualizar la opción de sesiones admin');
    } finally {
      setUpdatingIncludeAdminSessions(false);
    }
  };

  const handleToggleActiveSessionSelection = (sessionId: string) => {
    setSelectedActiveSessionIds((prev) =>
      prev.includes(sessionId)
        ? prev.filter((id) => id !== sessionId)
        : [...prev, sessionId],
    );
  };

  const handleSelectAllActiveSessions = () => {
    const allIds = activeSessionsData?.sessions
      ?.filter((item) => !item.isCurrentSession)
      .map((item) => item.sessionId) || [];
    setSelectedActiveSessionIds(allIds);
  };

  const handleClearActiveSessionSelection = () => {
    setSelectedActiveSessionIds([]);
  };

  const handleCloseSelectedActiveSessions = async () => {
    if (selectedActiveSessionIds.length === 0) {
      toast.error('Selecciona al menos una sesion');
      return;
    }

    const confirmed = window.confirm(`Cerrar ${selectedActiveSessionIds.length} sesiones seleccionadas?`);
    if (!confirmed) return;

    try {
      const currentSessionId = sessionStorage.getItem(ANALYTICS_SESSION_ID_KEY);
      const closableIds = selectedActiveSessionIds.filter((sessionId) => sessionId !== currentSessionId);
      if (closableIds.length === 0) {
        toast.error('No hay sesiones cerrables en la seleccion actual');
        return;
      }
      for (const sessionId of closableIds) {
        await adminAPI.closeAnalyticsSession(sessionId);
      }
      setSelectedActiveSessionIds([]);
      await loadActiveSessionsControl();
      await loadAdminData();
      toast.success('Sesiones seleccionadas cerradas');
    } catch (error: any) {
      toast.error(error.message || 'No se pudieron cerrar algunas sesiones');
    }
  };

  const loadSessionActivity = async (sessionId: string, options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent);
    try {
      setSessionActivityLoading(true);
      const result = await adminAPI.getAnalyticsSessionActivity(sessionId, 40);
      setSessionActivityData(result || null);
    } catch (error: any) {
      if (!silent) {
        toast.error(error?.message || 'No se pudo cargar la actividad de la sesion');
      }
    } finally {
      setSessionActivityLoading(false);
    }
  };

  const handleMonitorSession = async (sessionId: string) => {
    setMonitoredSessionId(sessionId);
    await loadSessionActivity(sessionId);
  };

  const loadLiveSession = async (sessionId: string, options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent);
    try {
      setLiveSessionLoading(true);
      const result = await adminAPI.getAnalyticsSessionActivity(sessionId, 25);
      setLiveSessionData(result || null);
    } catch (error: any) {
      if (!silent) {
        toast.error(error?.message || 'No se pudo cargar la vista en vivo');
      }
    } finally {
      setLiveSessionLoading(false);
    }
  };

  const handleWatchSessionLive = async (sessionId: string) => {
    if (requestingLiveSessionId === sessionId) return;
    if (liveSessionId === sessionId) return;

    try {
      setRequestingLiveSessionId(sessionId);
      await requestScreenShare(sessionId);
      await startRemoteStream(sessionId);
      setLiveSessionId(sessionId);
      await loadLiveSession(sessionId);
    } finally {
      setRequestingLiveSessionId((current) => (current === sessionId ? null : current));
    }
  };

  const stopRemoteStream = () => {
    if (offerPollRef.current) {
      window.clearInterval(offerPollRef.current);
      offerPollRef.current = null;
    }
    if (collectorIcePollRef.current) {
      window.clearInterval(collectorIcePollRef.current);
      collectorIcePollRef.current = null;
    }
    if (adminPeerConnection) {
      adminPeerConnection.close();
      setAdminPeerConnection(null);
    }
    if (remoteStream) {
      remoteStream.getTracks().forEach((track) => track.stop());
      setRemoteStream(null);
    }
  };

  const startRemoteStream = async (sessionId: string) => {
    stopRemoteStream();
    setWebRTCError(null);

    try {
      const pc = new RTCPeerConnection();
      const processedCandidates = new Set<string>();

      pc.ontrack = (event) => {
        const [stream] = event.streams;
        if (stream) {
          setRemoteStream(stream);
        }
      };

      pc.onicecandidate = async (event) => {
        if (!event.candidate) return;
        try {
          await fetch(`${API_BASE_URL}/analytics/session/screen-share-ice/admin`, {
            method: 'POST',
            headers: getAuthHeaders(true),
            body: JSON.stringify({ sessionId, candidate: event.candidate }),
          });
        } catch {
          // Ignore transient ICE signaling errors.
        }
      };

      setAdminPeerConnection(pc);

      offerPollRef.current = window.setInterval(async () => {
        try {
          const offerResp = await fetch(`${API_BASE_URL}/analytics/session/screen-share-offer/${sessionId}`, {
            method: 'GET',
            headers: getAuthHeaders(true),
          });
          const offerData = await offerResp.json();

          if (offerData?.offer?.sdp && !pc.currentRemoteDescription) {
            await pc.setRemoteDescription({ type: 'offer', sdp: offerData.offer.sdp });
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            await fetch(`${API_BASE_URL}/analytics/session/screen-share-answer`, {
              method: 'POST',
              headers: getAuthHeaders(true),
              body: JSON.stringify({ sessionId, sdp: answer.sdp }),
            });
          }
        } catch {
          // Keep polling while waiting for collector offer.
        }
      }, 2000);

      collectorIcePollRef.current = window.setInterval(async () => {
        try {
          const iceResp = await fetch(`${API_BASE_URL}/analytics/session/screen-share-ice/${sessionId}/collector`, {
            method: 'GET',
            headers: getAuthHeaders(true),
          });
          const iceData = await iceResp.json();
          if (!Array.isArray(iceData?.candidates)) return;

          for (const candidate of iceData.candidates) {
            const key = JSON.stringify(candidate);
            if (processedCandidates.has(key)) continue;

            try {
              await pc.addIceCandidate(candidate);
              processedCandidates.add(key);
            } catch {
              // Ignore duplicated/invalid candidates.
            }
          }
        } catch {
          // Keep polling while stream is active.
        }
      }, 2000);
    } catch (error) {
      console.error('Admin WebRTC receiver error:', error);
      setWebRTCError('No se pudo establecer la recepcion de pantalla remota');
      stopRemoteStream();
    }
  };

  const requestScreenShare = async (sessionId: string) => {
    try {
      const currentUser = authAPI.getCurrentUser();
      if (!currentUser) {
        toast.error('No se pudo identificar el admin');
        return;
      }
      const response = await fetch(`${API_BASE_URL}/analytics/session/screen-share-request`, {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify({ sessionId, requesterId: currentUser.id }),
      });
      if (!response.ok) {
        toast.error('No se pudo enviar la solicitud');
        return;
      }
      toast.success('Solicitud de screen-share enviada');
    } catch (err) {
      toast.error('Error enviando solicitud');
    }
  };

  const handleStopLiveAssistance = async (sessionId: string) => {
    try {
      await fetch(`${API_BASE_URL}/analytics/session/screen-share-request/${sessionId}/status`, {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify({ status: 'stopped' }),
      });
      stopRemoteStream();
      toast.success('Asistencia remota finalizada');
    } catch {
      toast.error('No se pudo finalizar la asistencia remota');
    }
  };

  useEffect(() => {
    if (!monitoredSessionId) return;

    const intervalId = window.setInterval(() => {
      void loadSessionActivity(monitoredSessionId, { silent: true });
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [monitoredSessionId]);

  useEffect(() => {
    if (!liveSessionId) return;

    const intervalId = window.setInterval(() => {
      void loadLiveSession(liveSessionId, { silent: true });
    }, 2000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [liveSessionId]);

  useEffect(() => {
    if (!liveSessionId) {
      stopRemoteStream();
    }
  }, [liveSessionId]);

  useEffect(() => {
    return () => {
      stopRemoteStream();
    };
  }, []);

  useEffect(() => {
    if (!isAdmin || !activeSessionsPollingEnabled) return;

    void loadActiveSessionsControl({ silent: true });
    const intervalId = window.setInterval(() => {
      void loadActiveSessionsControl({ silent: true });
    }, 10000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isAdmin, activeSessionsPollingEnabled]);

  const formatDuration = (durationMs: number) => {
    const safeDurationMs = Number.isFinite(durationMs) ? durationMs : 0;
    const totalSeconds = Math.max(0, Math.floor(safeDurationMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${seconds}s`;
  };

  const formatLoadTime = (durationMs: number) => {
    const safeDurationMs = Number.isFinite(durationMs) ? durationMs : 0;
    if (safeDurationMs >= 1000) {
      return `${(safeDurationMs / 1000).toFixed(2)}s`;
    }
    return `${Math.round(safeDurationMs)}ms`;
  };
  const formatDateWithTimezone = (parsed: Date) => {
    try {
      return parsed.toLocaleString('es-HN', {
        timeZone: settings.serverTimezone || 'America/Tegucigalpa',
      });
    } catch {
      return parsed.toLocaleString();
    }
  };

  const formatServerDateTime = (iso: string | null | undefined) => {
    if (!iso) return '';
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return iso;
    return formatDateWithTimezone(parsed);
  };

  const toDateTimeLocalValue = (iso: string | null) => {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const toggleIndicator = (key: 'visits' | 'sessionDuration' | 'appLoad' | 'concurrentSessions') => {
    setIndicatorFilters((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleChangeRole = async (targetUserId: string, role: 'generator' | 'collector' | 'admin') => {
    try {
      setUpdatingUserId(targetUserId);
      await adminAPI.updateUserRole(targetUserId, role);
      toast.success('Rol de usuario actualizado');
      await loadAdminData();
    } catch (error: any) {
      toast.error(error.message || 'No se pudo actualizar el rol');
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleSaveSettings = async () => {
    try {
      setSavingSettings(true);
      await adminAPI.updateSettings(settings);
      toast.success('Configuración guardada');
    } catch (error: any) {
      toast.error(error.message || 'No se pudo guardar la configuración');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCreateUser = async () => {
    if (!createUserForm.name || !createUserForm.email || !createUserForm.password) {
      toast.error('Nombre, correo y contraseña son obligatorios');
      return;
    }

    if (createUserForm.password.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    try {
      setCreatingUser(true);
      await adminAPI.createUser(createUserForm);
      toast.success('Usuario creado correctamente');
      setCreateUserForm(defaultCreateUserForm);
      await loadAdminData();
    } catch (error: any) {
      toast.error(error.message || 'No se pudo crear el usuario');
    } finally {
      setCreatingUser(false);
    }
  };

  const startEditUser = (targetUser: AdminUser) => {
    setEditingUserId(targetUser.id);
    setEditUserForm({
      name: targetUser.name || '',
      email: targetUser.email || '',
      phone: targetUser.phone || '',
      address: targetUser.address || '',
      type: targetUser.type,
    });
  };

  const handleSaveUser = async (targetUserId: string) => {
    if (!editUserForm.name || !editUserForm.email) {
      toast.error('Nombre y correo son obligatorios');
      return;
    }

    try {
      setUpdatingUserId(targetUserId);
      await adminAPI.updateUser(targetUserId, editUserForm);
      toast.success('Usuario actualizado');
      setEditingUserId(null);
      await loadAdminData();
    } catch (error: any) {
      toast.error(error.message || 'No se pudo editar el usuario');
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleResetPassword = async (targetUserId: string) => {
    const newPassword = window.prompt('Nueva contraseña (mínimo 6 caracteres):');
    if (!newPassword) return;

    try {
      setUpdatingUserId(targetUserId);
      await adminAPI.resetUserPassword(targetUserId, newPassword);
      toast.success('Contraseña actualizada');
    } catch (error: any) {
      toast.error(error.message || 'No se pudo cambiar la contraseña');
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleDeleteUser = async (targetUser: AdminUser) => {
    const confirmed = window.confirm(`Eliminar cuenta de ${targetUser.name} (${targetUser.email})?`);
    if (!confirmed) return;

    try {
      setUpdatingUserId(targetUser.id);
      await adminAPI.deleteUser(targetUser.id);
      toast.success('Cuenta eliminada correctamente');
      await loadAdminData();
    } catch (error: any) {
      toast.error(error.message || 'No se pudo eliminar la cuenta');
    } finally {
      setUpdatingUserId(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <Card className="max-w-lg mx-auto mt-10 p-6 text-center">
          <h2 className="font-bold text-lg">Acceso restringido</h2>
          <p className="text-sm text-gray-600 mt-2">Solo el usuario administrador puede usar este panel.</p>
          <Button className="mt-4" onClick={() => navigate('/home')}>Volver</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-gradient-to-r from-slate-900 to-slate-700 text-white p-6 rounded-b-3xl">
        <h1 className="text-2xl font-bold">Panel Administrador</h1>
        <p className="text-sm text-slate-200 mt-1">Gestiona centros, usuarios, configuración y reportes de la app.</p>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="py-12 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-slate-700" />
          </div>
        ) : (
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="grid grid-cols-5">
              <TabsTrigger value="overview">Resumen</TabsTrigger>
              <TabsTrigger value="analytics">Analitica</TabsTrigger>
              <TabsTrigger value="users">Usuarios</TabsTrigger>
              <TabsTrigger value="settings">Config</TabsTrigger>
              <TabsTrigger value="centers">Centros</TabsTrigger>
            </TabsList>

            <TabsContent value="analytics" className="space-y-4">
              <Tabs defaultValue="analytics-overview" className="space-y-4">
                <TabsList className="grid grid-cols-3">
                  <TabsTrigger value="analytics-overview">Resumen BI</TabsTrigger>
                  <TabsTrigger value="analytics-custom">Analitica Personalizada</TabsTrigger>
                  <TabsTrigger value="analytics-campaigns">Campanas</TabsTrigger>
                </TabsList>

                <TabsContent value="analytics-custom" className="space-y-4">
                  <Card className="p-0 border-0 shadow-lg overflow-hidden">
                    <div className="bg-gradient-to-r from-blue-900 via-blue-700 to-cyan-600 text-white px-5 py-4">
                      <h3 className="font-semibold">Analitica Personalizada</h3>
                      <p className="text-xs text-blue-100 mt-1">Filtros dinamicos por fecha, periodo y tipo de usuario.</p>
                    </div>

                    <div className="p-5 space-y-3 bg-white">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label>Desde</Label>
                        <Input
                          type="datetime-local"
                          value={analyticsFilters.from}
                          onChange={(e: ChangeEvent<HTMLInputElement>) => setAnalyticsFilters({ ...analyticsFilters, from: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Hasta</Label>
                        <Input
                          type="datetime-local"
                          value={analyticsFilters.to}
                          onChange={(e: ChangeEvent<HTMLInputElement>) => setAnalyticsFilters({ ...analyticsFilters, to: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant={analyticsFilters.period === 'daily' ? 'default' : 'outline'} onClick={() => setAnalyticsFilters({ ...analyticsFilters, period: 'daily' })}>Diario</Button>
                      <Button size="sm" variant={analyticsFilters.period === 'weekly' ? 'default' : 'outline'} onClick={() => setAnalyticsFilters({ ...analyticsFilters, period: 'weekly' })}>Semanal</Button>
                      <Button size="sm" variant={analyticsFilters.period === 'monthly' ? 'default' : 'outline'} onClick={() => setAnalyticsFilters({ ...analyticsFilters, period: 'monthly' })}>Mensual</Button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant={analyticsFilters.userType === 'all' ? 'default' : 'outline'} onClick={() => setAnalyticsFilters({ ...analyticsFilters, userType: 'all' })}>Todos</Button>
                      <Button size="sm" variant={analyticsFilters.userType === 'generator' ? 'default' : 'outline'} onClick={() => setAnalyticsFilters({ ...analyticsFilters, userType: 'generator' })}>Generador</Button>
                      <Button size="sm" variant={analyticsFilters.userType === 'collector' ? 'default' : 'outline'} onClick={() => setAnalyticsFilters({ ...analyticsFilters, userType: 'collector' })}>Recolector</Button>
                      <Button size="sm" variant={analyticsFilters.userType === 'admin' ? 'default' : 'outline'} onClick={() => setAnalyticsFilters({ ...analyticsFilters, userType: 'admin' })}>Admin</Button>
                      <Button size="sm" variant={analyticsFilters.userType === 'guest' ? 'default' : 'outline'} onClick={() => setAnalyticsFilters({ ...analyticsFilters, userType: 'guest' })}>Invitado</Button>
                    </div>

                    <div className="flex gap-2">
                      <Button onClick={handleApplyAnalyticsFilters} disabled={analyticsBusy}>Aplicar filtros</Button>
                      <Button variant="outline" onClick={handleCleanTestData} disabled={analyticsBusy}>Limpiar datos de prueba</Button>
                    </div>

                    <div className="space-y-1">
                      <Label>Indicadores a incluir</Label>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant={indicatorFilters.visits ? 'default' : 'outline'} onClick={() => toggleIndicator('visits')}>Visitas</Button>
                        <Button size="sm" variant={indicatorFilters.sessionDuration ? 'default' : 'outline'} onClick={() => toggleIndicator('sessionDuration')}>Sesion promedio</Button>
                        <Button size="sm" variant={indicatorFilters.appLoad ? 'default' : 'outline'} onClick={() => toggleIndicator('appLoad')}>Carga app</Button>
                        <Button size="sm" variant={indicatorFilters.concurrentSessions ? 'default' : 'outline'} onClick={() => toggleIndicator('concurrentSessions')}>Sesiones concurrentes</Button>
                      </div>
                    </div>

                    {analyticsReport && (
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2 pt-2">
                        {indicatorFilters.visits && (
                          <Card className="p-3 border-0 shadow-sm bg-gradient-to-br from-blue-900 via-blue-700 to-cyan-600 text-white">
                            <p className="text-xs text-blue-100">Visitas filtradas</p>
                            <p className="text-xl font-bold">{analyticsReport.summary.totalVisits}</p>
                          </Card>
                        )}
                        {indicatorFilters.sessionDuration && (
                          <Card className="p-3 border-0 shadow-sm bg-gradient-to-br from-teal-800 via-emerald-700 to-lime-600 text-white">
                            <p className="text-xs text-emerald-100">Sesion promedio</p>
                            <p className="text-xl font-bold">{formatDuration(analyticsReport.summary.averageSessionDurationMs)}</p>
                          </Card>
                        )}
                        {indicatorFilters.appLoad && (
                          <Card className="p-3 border-0 shadow-sm bg-gradient-to-br from-amber-700 via-orange-600 to-red-500 text-white">
                            <p className="text-xs text-amber-100">Carga promedio</p>
                            <p className="text-xl font-bold">{formatLoadTime(analyticsReport.summary.averageAppLoadTimeMs)}</p>
                          </Card>
                        )}
                        {indicatorFilters.concurrentSessions && (
                          <Card className="p-3 border-0 shadow-sm bg-gradient-to-br from-indigo-900 via-violet-700 to-fuchsia-600 text-white">
                            <p className="text-xs text-violet-100">Sesiones concurrentes</p>
                            <p className="text-xl font-bold">{analyticsReport.summary.concurrentSessions}</p>
                            <p className="text-xs text-violet-100">Pico: {analyticsReport.summary.peakConcurrentSessions}</p>
                          </Card>
                        )}
                      </div>
                    )}

                    {analyticsReport && analyticsReport.series.length > 0 && (
                      <div className="space-y-2 pt-2">
                        {analyticsReport.series.slice(-8).map((item) => (
                          <div key={item.period} className="p-2 border rounded-lg bg-slate-50">
                            <p className="text-xs text-gray-500">{item.period}</p>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm mt-1">
                              {indicatorFilters.visits && <span>Visitas: <strong>{item.visits}</strong></span>}
                              {indicatorFilters.sessionDuration && <span>Sesion: <strong>{formatDuration(item.averageSessionDurationMs)}</strong></span>}
                              {indicatorFilters.appLoad && <span>Carga: <strong>{formatLoadTime(item.averageAppLoadTimeMs)}</strong></span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    </div>
                  </Card>
                </TabsContent>

                <TabsContent value="analytics-campaigns" className="space-y-4">
                  <Tabs value={campaignSubTab} onValueChange={(value) => setCampaignSubTab(value as 'campaign-list' | 'campaign-dashboard')} className="space-y-4">
                    <TabsList className="grid grid-cols-2">
                      <TabsTrigger value="campaign-list">Gestion de Campanas</TabsTrigger>
                      <TabsTrigger value="campaign-dashboard">Dashboard de Campana</TabsTrigger>
                    </TabsList>

                    <TabsContent value="campaign-list" className="space-y-4">
                      <Card className="p-0 border-0 shadow-lg overflow-hidden">
                        <div className="bg-gradient-to-r from-indigo-900 via-violet-700 to-fuchsia-600 text-white px-5 py-4">
                          <h3 className="font-semibold">Campanas de Analisis</h3>
                          <p className="text-xs text-violet-100 mt-1">Crea, administra y selecciona campanas para seguimiento.</p>
                        </div>

                        <div className="p-5 space-y-3 bg-white">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <Input
                            placeholder="Nombre de campana"
                            value={campaignForm.name}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setCampaignForm({ ...campaignForm, name: e.target.value })}
                          />
                          <Input
                            type="datetime-local"
                            value={campaignForm.startsAt}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setCampaignForm({ ...campaignForm, startsAt: e.target.value })}
                          />
                          <Input
                            type="datetime-local"
                            value={campaignForm.endsAt}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setCampaignForm({ ...campaignForm, endsAt: e.target.value })}
                          />
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant={campaignForm.period === 'daily' ? 'default' : 'outline'} onClick={() => setCampaignForm({ ...campaignForm, period: 'daily' })}>Diario</Button>
                          <Button size="sm" variant={campaignForm.period === 'weekly' ? 'default' : 'outline'} onClick={() => setCampaignForm({ ...campaignForm, period: 'weekly' })}>Semanal</Button>
                          <Button size="sm" variant={campaignForm.period === 'monthly' ? 'default' : 'outline'} onClick={() => setCampaignForm({ ...campaignForm, period: 'monthly' })}>Mensual</Button>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant={campaignForm.userType === 'all' ? 'default' : 'outline'} onClick={() => setCampaignForm({ ...campaignForm, userType: 'all' })}>Todos</Button>
                          <Button size="sm" variant={campaignForm.userType === 'generator' ? 'default' : 'outline'} onClick={() => setCampaignForm({ ...campaignForm, userType: 'generator' })}>Generador</Button>
                          <Button size="sm" variant={campaignForm.userType === 'collector' ? 'default' : 'outline'} onClick={() => setCampaignForm({ ...campaignForm, userType: 'collector' })}>Recolector</Button>
                          <Button size="sm" variant={campaignForm.userType === 'admin' ? 'default' : 'outline'} onClick={() => setCampaignForm({ ...campaignForm, userType: 'admin' })}>Admin</Button>
                          <Button size="sm" variant={campaignForm.userType === 'guest' ? 'default' : 'outline'} onClick={() => setCampaignForm({ ...campaignForm, userType: 'guest' })}>Invitado</Button>
                        </div>

                        <div className="flex gap-2">
                          {editingCampaignId ? (
                            <Button onClick={handleUpdateCampaign} disabled={analyticsBusy}>Guardar cambios</Button>
                          ) : (
                            <Button onClick={handleCreateCampaign} disabled={analyticsBusy}>Agregar campana</Button>
                          )}
                          {editingCampaignId && (
                            <Button
                              variant="outline"
                              onClick={() => {
                                setEditingCampaignId(null);
                                setCampaignForm({
                                  name: '',
                                  startsAt: '',
                                  endsAt: '',
                                  period: 'daily',
                                  userType: 'all',
                                });
                              }}
                            >
                              Cancelar edicion
                            </Button>
                          )}
                        </div>

                        <div className="space-y-2">
                          {analyticsCampaigns.map((campaign) => (
                            <div key={campaign.id} className="p-3 border rounded-lg bg-slate-50">
                              <p className="font-medium">{campaign.name}</p>
                              <p className="text-xs text-gray-500">
                                Inicio: {new Date(campaign.startsAt).toLocaleString()} | Tipo: {campaign.userType} | Periodo: {campaign.period}
                              </p>
                              <div className="mt-2 flex items-center gap-2">
                                <Badge variant="outline">{campaign.status}</Badge>
                                <Button size="sm" variant="outline" onClick={() => handleSelectCampaign(campaign)}>Visualizar</Button>
                                <Button size="sm" variant="outline" onClick={() => handleStartEditCampaign(campaign)}>Editar</Button>
                                <Button size="sm" variant="destructive" onClick={() => handleDeleteCampaign(campaign)} disabled={analyticsBusy}>Eliminar</Button>
                              </div>
                            </div>
                          ))}
                          {analyticsCampaigns.length === 0 && (
                            <p className="text-sm text-gray-500">No hay campanas programadas.</p>
                          )}
                        </div>
                        </div>
                      </Card>
                    </TabsContent>

                    <TabsContent value="campaign-dashboard" className="space-y-4">
                      {!selectedCampaign ? (
                        <Card className="p-5">
                          <p className="text-sm text-gray-600">Selecciona una campana en "Gestion de Campanas" para ver su dashboard.</p>
                        </Card>
                      ) : (
                        <Card className="p-0 border-0 shadow-lg overflow-hidden">
                          <div className="bg-gradient-to-r from-indigo-900 via-violet-700 to-fuchsia-600 text-white px-5 py-4 flex items-center justify-between gap-2">
                            <div>
                              <h3 className="font-semibold">Dashboard de {selectedCampaign.name}</h3>
                              <p className="text-xs text-violet-100">
                                {new Date(selectedCampaign.startsAt).toLocaleString()} - {selectedCampaign.endsAt ? new Date(selectedCampaign.endsAt).toLocaleString() : 'Sin fecha de cierre'}
                              </p>
                            </div>
                            <Button size="sm" variant="outline" className="bg-white/10 border-white/40 text-white hover:bg-white/20" onClick={() => void loadCampaignDashboard(selectedCampaign)} disabled={campaignDashboardLoading}>
                              {campaignDashboardLoading ? 'Cargando...' : 'Actualizar'}
                            </Button>
                          </div>

                          <div className="p-5 space-y-4 bg-white">
                            <div className="space-y-1">
                              <Label>Indicadores a incluir</Label>
                              <div className="flex flex-wrap gap-2">
                                <Button size="sm" variant={indicatorFilters.visits ? 'default' : 'outline'} onClick={() => toggleIndicator('visits')}>Visitas</Button>
                                <Button size="sm" variant={indicatorFilters.sessionDuration ? 'default' : 'outline'} onClick={() => toggleIndicator('sessionDuration')}>Sesion promedio</Button>
                                <Button size="sm" variant={indicatorFilters.appLoad ? 'default' : 'outline'} onClick={() => toggleIndicator('appLoad')}>Carga app</Button>
                                <Button size="sm" variant={indicatorFilters.concurrentSessions ? 'default' : 'outline'} onClick={() => toggleIndicator('concurrentSessions')}>Sesiones concurrentes</Button>
                              </div>
                            </div>

                            {campaignDashboardLoading ? (
                              <div className="py-8 flex justify-center">
                                <Loader2 className="w-5 h-5 animate-spin text-slate-600" />
                              </div>
                            ) : campaignDashboardReport ? (
                              <>
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
                                  {indicatorFilters.visits && (
                                    <Card className="p-3 border-0 shadow-sm bg-gradient-to-br from-blue-900 via-blue-700 to-cyan-600 text-white"><p className="text-xs text-blue-100">Visitas</p><p className="text-xl font-bold">{campaignDashboardReport.summary.totalVisits}</p></Card>
                                  )}
                                  {indicatorFilters.sessionDuration && (
                                    <Card className="p-3 border-0 shadow-sm bg-gradient-to-br from-teal-800 via-emerald-700 to-lime-600 text-white"><p className="text-xs text-emerald-100">Sesion promedio</p><p className="text-xl font-bold">{formatDuration(campaignDashboardReport.summary.averageSessionDurationMs)}</p></Card>
                                  )}
                                  {indicatorFilters.appLoad && (
                                    <Card className="p-3 border-0 shadow-sm bg-gradient-to-br from-amber-700 via-orange-600 to-red-500 text-white"><p className="text-xs text-amber-100">Carga promedio</p><p className="text-xl font-bold">{formatLoadTime(campaignDashboardReport.summary.averageAppLoadTimeMs)}</p></Card>
                                  )}
                                  {indicatorFilters.concurrentSessions && (
                                    <Card className="p-3 border-0 shadow-sm bg-gradient-to-br from-indigo-900 via-violet-700 to-fuchsia-600 text-white"><p className="text-xs text-violet-100">Sesiones concurrentes</p><p className="text-xl font-bold">{campaignDashboardReport.summary.concurrentSessions}</p><p className="text-xs text-violet-100">Pico: {campaignDashboardReport.summary.peakConcurrentSessions}</p></Card>
                                  )}
                                </div>

                                <div className="space-y-2">
                                  {campaignDashboardReport.series.length > 0 ? campaignDashboardReport.series.slice(-10).map((item) => (
                                    <div key={item.period} className="p-2 border rounded-lg bg-slate-50">
                                      <p className="text-xs text-gray-500">{item.period}</p>
                                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm mt-1">
                                        {indicatorFilters.visits && <span>Visitas: <strong>{item.visits}</strong></span>}
                                        {indicatorFilters.sessionDuration && <span>Sesion: <strong>{formatDuration(item.averageSessionDurationMs)}</strong></span>}
                                        {indicatorFilters.appLoad && <span>Carga: <strong>{formatLoadTime(item.averageAppLoadTimeMs)}</strong></span>}
                                      </div>
                                    </div>
                                  )) : (
                                    <p className="text-sm text-gray-500">No hay datos para los filtros de esta campana aun.</p>
                                  )}
                                </div>
                              </>
                            ) : (
                              <p className="text-sm text-gray-500">No fue posible cargar el dashboard de la campana.</p>
                            )}
                          </div>
                        </Card>
                      )}
                    </TabsContent>
                  </Tabs>
                </TabsContent>

                <TabsContent value="analytics-overview" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="p-5 border-0 shadow-lg bg-gradient-to-br from-blue-900 via-blue-700 to-cyan-600 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-blue-100">Numero de visitas</p>
                      <p className="text-4xl font-black mt-2">{analytics.totalVisits}</p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                      <Activity className="w-6 h-6" />
                    </div>
                  </div>
                  <div className="mt-4 h-2 bg-white/25 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-white rounded-full"
                      style={{ width: `${Math.min(100, (analytics.totalVisits / 100) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-blue-100 mt-2">KPI de entrada para evaluacion del prototipo.</p>
                </Card>

                <Card className="p-5 border-0 shadow-lg bg-gradient-to-br from-teal-800 via-emerald-700 to-lime-600 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-emerald-100">Duracion promedio de sesion</p>
                      <p className="text-4xl font-black mt-2">{formatDuration(analytics.averageSessionDurationMs)}</p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                      <Timer className="w-6 h-6" />
                    </div>
                  </div>
                  <div className="mt-4 h-2 bg-white/25 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-white rounded-full"
                      style={{ width: `${Math.min(100, (analytics.averageSessionDurationMs / 600000) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-emerald-100 mt-2">Calculada sobre {analytics.sessionCount} sesiones registradas.</p>
                </Card>

                <Card className="p-5 border-0 shadow-lg bg-gradient-to-br from-amber-700 via-orange-600 to-red-500 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-amber-100">Tiempo de carga de la app</p>
                      <p className="text-4xl font-black mt-2">{formatLoadTime(analytics.averageAppLoadTimeMs)}</p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                      <Gauge className="w-6 h-6" />
                    </div>
                  </div>
                  <div className="mt-4 h-2 bg-white/25 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-white rounded-full"
                      style={{ width: `${Math.min(100, (analytics.averageAppLoadTimeMs / 6000) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-amber-100 mt-2">Promedio basado en {analytics.appLoadSampleCount} cargas.</p>
                </Card>

                <Card className="p-5 border-0 shadow-lg bg-gradient-to-br from-indigo-900 via-violet-700 to-fuchsia-600 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-violet-100">Sesiones concurrentes</p>
                      <p className="text-4xl font-black mt-2">{analytics.concurrentSessions}</p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                      <Users className="w-6 h-6" />
                    </div>
                  </div>
                  <div className="mt-4 h-2 bg-white/25 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-white rounded-full"
                      style={{ width: `${Math.min(100, (analytics.concurrentSessions / 20) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-violet-100 mt-2">Activas ahora: {analytics.activeSessions}. Pico historico: {analytics.peakConcurrentSessions} sesiones simultaneas.</p>
                </Card>
                  </div>

                  <Card className="p-5">
                    <h3 className="font-semibold mb-4">Vista comparativa BI</h3>
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Visitas</span>
                          <span>{analytics.totalVisits}</span>
                        </div>
                        <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-blue-600 to-cyan-500"
                            style={{ width: `${Math.min(100, (analytics.totalVisits / 200) * 100)}%` }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Duracion promedio (segundos)</span>
                          <span>{Math.round(analytics.averageSessionDurationMs / 1000)}s</span>
                        </div>
                        <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-emerald-600 to-lime-500"
                            style={{ width: `${Math.min(100, (analytics.averageSessionDurationMs / 900000) * 100)}%` }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Carga promedio de app</span>
                          <span>{formatLoadTime(analytics.averageAppLoadTimeMs)}</span>
                        </div>
                        <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-amber-500 to-red-500"
                            style={{ width: `${Math.min(100, (analytics.averageAppLoadTimeMs / 6000) * 100)}%` }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Sesiones concurrentes actuales</span>
                          <span>{analytics.concurrentSessions}</span>
                        </div>
                        <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-indigo-500 to-fuchsia-500"
                            style={{ width: `${Math.min(100, (analytics.concurrentSessions / 20) * 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <p className="text-xs text-gray-500 mt-4">
                      Ultima actualizacion: {analytics.updatedAt ? new Date(analytics.updatedAt).toLocaleString() : 'sin datos'}
                    </p>
                  </Card>
                </TabsContent>
              </Tabs>
            </TabsContent>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Card className="p-4">
                  <p className="text-xs text-gray-500">Usuarios totales</p>
                  <p className="text-2xl font-bold">{reports?.users?.total ?? 0}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-xs text-gray-500">Recolecciones totales</p>
                  <p className="text-2xl font-bold">{reports?.collections?.total ?? 0}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-xs text-gray-500">Centros de acopio</p>
                  <p className="text-2xl font-bold">{reports?.points?.totalCenters ?? 0}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-xs text-gray-500">Canjes</p>
                  <p className="text-2xl font-bold">{reports?.rewards?.redemptions ?? 0}</p>
                </Card>
              </div>

              <Card className="p-4">
                <h3 className="font-semibold flex items-center gap-2"><ChartNoAxesCombined className="w-4 h-4" /> Estado de recolecciones</h3>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-xs text-gray-500">Pendientes</p>
                    <p className="font-bold">{reports?.collections?.pending ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">En proceso</p>
                    <p className="font-bold">{reports?.collections?.inProgress ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Completadas</p>
                    <p className="font-bold">{reports?.collections?.completed ?? 0}</p>
                  </div>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="users" className="space-y-3">
              <Card className="p-4 space-y-3">
                <h3 className="font-semibold flex items-center gap-2"><UserPlus className="w-4 h-4" /> Crear nueva cuenta</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <Input
                    placeholder="Nombre completo"
                    value={createUserForm.name}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setCreateUserForm({ ...createUserForm, name: e.target.value })}
                  />
                  <Input
                    placeholder="Correo"
                    value={createUserForm.email}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setCreateUserForm({ ...createUserForm, email: e.target.value })}
                  />
                  <Input
                    type="password"
                    placeholder="Contraseña"
                    value={createUserForm.password}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setCreateUserForm({ ...createUserForm, password: e.target.value })}
                  />
                  <Input
                    placeholder="Teléfono"
                    value={createUserForm.phone}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setCreateUserForm({ ...createUserForm, phone: e.target.value })}
                  />
                  <Input
                    className="md:col-span-2"
                    placeholder="Dirección"
                    value={createUserForm.address}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setCreateUserForm({ ...createUserForm, address: e.target.value })}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={createUserForm.type === 'generator' ? 'default' : 'outline'}
                    onClick={() => setCreateUserForm({ ...createUserForm, type: 'generator' })}
                  >
                    Generador
                  </Button>
                  <Button
                    size="sm"
                    variant={createUserForm.type === 'collector' ? 'default' : 'outline'}
                    onClick={() => setCreateUserForm({ ...createUserForm, type: 'collector' })}
                  >
                    Recolector
                  </Button>
                  <Button
                    size="sm"
                    variant={createUserForm.type === 'admin' ? 'default' : 'outline'}
                    onClick={() => setCreateUserForm({ ...createUserForm, type: 'admin' })}
                  >
                    Admin
                  </Button>
                </div>
                <Button onClick={handleCreateUser} disabled={creatingUser}>
                  {creatingUser ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Crear usuario'}
                </Button>
              </Card>

              {users.map((item) => (
                <Card key={item.id} className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    {editingUserId === item.id ? (
                      <div className="w-full space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <Input
                            value={editUserForm.name}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setEditUserForm({ ...editUserForm, name: e.target.value })}
                            placeholder="Nombre"
                          />
                          <Input
                            value={editUserForm.email}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setEditUserForm({ ...editUserForm, email: e.target.value })}
                            placeholder="Correo"
                          />
                          <Input
                            value={editUserForm.phone}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setEditUserForm({ ...editUserForm, phone: e.target.value })}
                            placeholder="Teléfono"
                          />
                          <Input
                            value={editUserForm.address}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setEditUserForm({ ...editUserForm, address: e.target.value })}
                            placeholder="Dirección"
                          />
                        </div>

                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant={editUserForm.type === 'generator' ? 'default' : 'outline'}
                            onClick={() => setEditUserForm({ ...editUserForm, type: 'generator' })}
                          >
                            Generador
                          </Button>
                          <Button
                            size="sm"
                            variant={editUserForm.type === 'collector' ? 'default' : 'outline'}
                            onClick={() => setEditUserForm({ ...editUserForm, type: 'collector' })}
                          >
                            Recolector
                          </Button>
                          <Button
                            size="sm"
                            variant={editUserForm.type === 'admin' ? 'default' : 'outline'}
                            onClick={() => setEditUserForm({ ...editUserForm, type: 'admin' })}
                          >
                            Admin
                          </Button>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={updatingUserId === item.id}
                            onClick={() => handleSaveUser(item.id)}
                          >
                            <Save className="w-4 h-4 mr-1" /> Guardar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingUserId(null)}
                          >
                            <X className="w-4 h-4 mr-1" /> Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div>
                          <p className="font-medium">{item.name}</p>
                          <p className="text-sm text-gray-600">{item.email}</p>
                          <p className="text-xs text-gray-500">{item.phone || 'Sin teléfono'} {item.address ? `• ${item.address}` : ''}</p>
                          <div className="mt-1 flex gap-2">
                            <Badge variant="outline">{item.type}</Badge>
                            <Badge variant="outline">Pts {item.points || 0}</Badge>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1 justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={updatingUserId === item.id}
                            onClick={() => startEditUser(item)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={updatingUserId === item.id}
                            onClick={() => handleResetPassword(item.id)}
                          >
                            <KeyRound className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={updatingUserId === item.id}
                            onClick={() => handleChangeRole(item.id, 'generator')}
                          >
                            Gen
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={updatingUserId === item.id}
                            onClick={() => handleChangeRole(item.id, 'collector')}
                          >
                            Rec
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={updatingUserId === item.id}
                            onClick={() => handleChangeRole(item.id, 'admin')}
                          >
                            Admin
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={updatingUserId === item.id}
                            onClick={() => handleDeleteUser(item)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="settings" className="space-y-3">
              <Tabs defaultValue="settings-general" className="space-y-3">
                <TabsList className="grid grid-cols-2 w-full md:w-auto">
                  <TabsTrigger value="settings-general">General</TabsTrigger>
                  <TabsTrigger value="settings-sessions">Control de sesiones</TabsTrigger>
                </TabsList>

                <TabsContent value="settings-general" className="space-y-3">
                  <Card className="p-4">
                    <h3 className="font-semibold flex items-center gap-2"><Settings2 className="w-4 h-4" /> Configuración de App</h3>

                    <div className="mt-3 space-y-3">
                      <div className="space-y-1">
                        <Label>Nombre de la aplicación</Label>
                        <Input
                          value={settings.appName}
                          onChange={(e: ChangeEvent<HTMLInputElement>) =>
                            setSettings({ ...settings, appName: e.target.value })
                          }
                        />
                      </div>

                      <div className="space-y-1">
                        <Label>Email de soporte</Label>
                        <Input
                          value={settings.supportEmail}
                          onChange={(e: ChangeEvent<HTMLInputElement>) =>
                            setSettings({ ...settings, supportEmail: e.target.value })
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-sm">Modo mantenimiento</span>
                        <Button
                          size="sm"
                          variant={settings.maintenanceMode ? 'destructive' : 'outline'}
                          onClick={() => setSettings({ ...settings, maintenanceMode: !settings.maintenanceMode })}
                        >
                          {settings.maintenanceMode ? 'Activo' : 'Inactivo'}
                        </Button>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-sm">Recompensas habilitadas</span>
                        <Button
                          size="sm"
                          variant={settings.rewardsEnabled ? 'default' : 'outline'}
                          onClick={() => setSettings({ ...settings, rewardsEnabled: !settings.rewardsEnabled })}
                        >
                          {settings.rewardsEnabled ? 'Sí' : 'No'}
                        </Button>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-sm">Incluir sesiones admin en analitica</span>
                        <Button
                          size="sm"
                          variant={settings.includeAdminAnalytics ? 'default' : 'outline'}
                          onClick={() => setSettings({ ...settings, includeAdminAnalytics: !settings.includeAdminAnalytics })}
                        >
                          {settings.includeAdminAnalytics ? 'Sí' : 'No'}
                        </Button>
                      </div>

                      <div className="space-y-1">
                        <Label>Zona horaria del servidor</Label>
                        <select
                          className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                          value={settings.serverTimezone}
                          onChange={(e) => setSettings({ ...settings, serverTimezone: e.target.value })}
                        >
                          <option value="America/Tegucigalpa">America/Tegucigalpa (UTC-6)</option>
                          <option value="America/Mexico_City">America/Mexico_City</option>
                          <option value="America/Bogota">America/Bogota</option>
                          <option value="America/Lima">America/Lima</option>
                          <option value="America/New_York">America/New_York</option>
                          <option value="UTC">UTC</option>
                          <option value="Europe/Madrid">Europe/Madrid</option>
                        </select>
                        <p className="text-xs text-gray-500">
                          Hora actual del servidor: {formatServerDateTime(new Date().toISOString())}
                        </p>
                      </div>

                      <Button className="w-full" onClick={handleSaveSettings} disabled={savingSettings}>
                        {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar configuración'}
                      </Button>
                    </div>
                  </Card>
                </TabsContent>

                <TabsContent value="settings-sessions" className="space-y-3">
                  <Card className="p-0 overflow-hidden">
                <div className="px-4 py-3 border-b bg-slate-900 text-white flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-semibold flex items-center gap-2">
                      <Activity className="w-4 h-4" />
                      Control de Sesiones Activas
                    </h3>
                    <p className="text-xs text-slate-300 mt-1">Vista operativa tipo administrador de procesos.</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="bg-white/5 border-white/30 text-white hover:bg-white/15"
                      onClick={() => void handleToggleIncludeAdminSessions()}
                      disabled={updatingIncludeAdminSessions}
                    >
                      {updatingIncludeAdminSessions
                        ? 'Guardando...'
                        : settings.includeAdminAnalytics
                          ? 'Admin: ON'
                          : 'Admin: OFF'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="bg-white/5 border-white/30 text-white hover:bg-white/15"
                      onClick={() => void loadActiveSessionsControl({ silent: false })}
                      disabled={activeSessionsLoading}
                    >
                      {activeSessionsLoading ? 'Actualizando...' : 'Actualizar'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="bg-white/5 border-white/30 text-white hover:bg-white/15"
                      onClick={handleCloseAllActiveSessions}
                    >
                      Cerrar todas
                    </Button>
                  </div>
                </div>

                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <Card className="p-3 border-0 shadow-sm bg-gradient-to-br from-blue-900 via-blue-700 to-cyan-600 text-white">
                      <p className="text-xs text-blue-100">Sesiones activas</p>
                      <p className="text-xl font-bold">{activeSessionsData?.activeSessions ?? 0}</p>
                    </Card>
                    <Card className="p-3 border-0 shadow-sm bg-gradient-to-br from-indigo-900 via-violet-700 to-fuchsia-600 text-white">
                      <p className="text-xs text-violet-100">Concurrentes</p>
                      <p className="text-xl font-bold">{activeSessionsData?.concurrentSessions ?? 0}</p>
                    </Card>
                    <Card className="p-3 border-0 shadow-sm bg-gradient-to-br from-teal-800 via-emerald-700 to-lime-600 text-white">
                      <p className="text-xs text-emerald-100">Pico historico</p>
                      <p className="text-xl font-bold">{activeSessionsData?.peakConcurrentSessions ?? 0}</p>
                    </Card>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-gray-500">
                      Ultima lectura: {activeSessionsData?.generatedAt ? new Date(activeSessionsData.generatedAt).toLocaleString() : 'sin datos'}
                    </p>
                    <Badge variant="secondary">Seleccionadas: {selectedActiveSessionIds.length}</Badge>
                  </div>

                  <p className="text-xs text-slate-500">
                    Zona horaria aplicada: <strong>{settings.serverTimezone || 'America/Tegucigalpa'}</strong>
                  </p>

                  {activeSessionsError && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      {activeSessionsError}
                      {!activeSessionsPollingEnabled && ' El refresco automático fue pausado hasta que la ruta esté disponible.'}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={handleSelectAllActiveSessions} disabled={!activeSessionsData || activeSessionsData.sessions.length === 0}>
                      Seleccionar todas
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleClearActiveSessionSelection} disabled={selectedActiveSessionIds.length === 0}>
                      Limpiar selección
                    </Button>
                    <Button size="sm" variant="destructive" onClick={handleCloseSelectedActiveSessions} disabled={selectedActiveSessionIds.length === 0}>
                      Cerrar seleccionadas
                    </Button>
                  </div>

                  <div className="space-y-2 md:hidden">
                    {activeSessionsData?.sessions?.map((item) => {
                      const isSelected = selectedActiveSessionIds.includes(item.sessionId);
                      const isCurrent = Boolean(item.isCurrentSession);
                      return (
                        <Card key={item.sessionId} className={`p-3 ${isSelected ? 'ring-2 ring-blue-300' : ''}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs text-slate-500 truncate">Sesion</p>
                              <p className="font-medium text-xs truncate" title={item.sessionId}>{item.sessionId}</p>
                              {assistanceRequestedSessions[item.sessionId] && (
                                <Badge className="mt-1 bg-orange-600 text-white hover:bg-orange-600">Solicito asistencia</Badge>
                              )}
                            </div>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={isCurrent}
                              onChange={() => handleToggleActiveSessionSelection(item.sessionId)}
                              aria-label={`Seleccionar sesion ${item.sessionId}`}
                            />
                          </div>

                          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                            <div className="rounded border p-2 bg-slate-50">
                              <p className="text-slate-500">Usuario</p>
                              <p className="font-medium truncate">{item.userName || 'Invitado'}</p>
                              <p className="text-[10px] text-slate-500 truncate">{item.userEmail || 'sin correo'}</p>
                            </div>
                            <div className="rounded border p-2 bg-slate-50">
                              <p className="text-slate-500">Estado</p>
                              <div className="mt-1">
                                {isCurrent ? (
                                  <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Tu sesión</Badge>
                                ) : (
                                  <Badge variant="secondary">Remota</Badge>
                                )}
                              </div>
                            </div>
                            <div className="rounded border p-2 bg-slate-50 col-span-2">
                              <p className="text-slate-500">Ultima ruta</p>
                              <p className="font-medium truncate">{item.lastPath || 'Sin ruta reciente'}</p>
                            </div>
                            <div className="rounded border p-2 bg-slate-50 col-span-2">
                              <p className="text-slate-500">Ultimo ping</p>
                              <p className="font-medium">{formatServerDateTime(item.lastSeenAt)}</p>
                            </div>
                          </div>

                          <div className="mt-3 flex gap-2">
                            <Button size="sm" variant="outline" className="flex-1" onClick={() => void handleMonitorSession(item.sessionId)}>
                              Estadistica
                            </Button>
                            <Button size="sm" variant="outline" className="flex-1" onClick={() => void handleWatchSessionLive(item.sessionId)}>
                              {requestingLiveSessionId === item.sessionId ? 'Conectando...' : 'Ver'}
                            </Button>
                            <Button size="sm" variant="destructive" className="flex-1" disabled={isCurrent} onClick={() => void handleCloseOneActiveSession(item.sessionId)}>
                              Cerrar
                            </Button>
                          </div>
                        </Card>
                      );
                    })}

                    {(!activeSessionsData || activeSessionsData.sessions.length === 0) && (
                      <div className="px-3 py-8 text-center text-sm text-gray-500 border rounded-md bg-white">No hay sesiones activas.</div>
                    )}
                  </div>

                  <div className="rounded-md border overflow-hidden hidden md:block">
                    <div className="overflow-x-auto">
                    <div className="grid min-w-[860px] grid-cols-12 gap-2 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">
                      <span className="col-span-1">Sel</span>
                      <span className="col-span-3">Sesion</span>
                      <span className="col-span-2">Usuario</span>
                      <span className="col-span-1">Tipo</span>
                      <span className="col-span-1">Actual</span>
                      <span className="col-span-2">Ultimo ping</span>
                      <span className="col-span-2 text-right">Accion</span>
                    </div>

                    <div className="max-h-80 overflow-y-auto">
                      {activeSessionsData?.sessions?.map((item) => {
                        const isSelected = selectedActiveSessionIds.includes(item.sessionId);
                        const isCurrent = Boolean(item.isCurrentSession);
                        return (
                          <div key={item.sessionId} className={`grid min-w-[860px] grid-cols-12 gap-2 px-3 py-2 border-t text-xs items-center ${isSelected ? 'bg-blue-50' : 'bg-white'}`}>
                            <div className="col-span-1">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={isCurrent}
                                onChange={() => handleToggleActiveSessionSelection(item.sessionId)}
                                aria-label={`Seleccionar sesion ${item.sessionId}`}
                              />
                            </div>
                            <div className="col-span-3">
                              <p className="font-medium truncate" title={item.sessionId}>{item.sessionId}</p>
                              <p className="text-[10px] text-slate-500 truncate" title={item.lastPath || ''}>
                                {item.lastPath ? `Ruta: ${item.lastPath}` : 'Sin ruta reciente'}
                              </p>
                              {assistanceRequestedSessions[item.sessionId] && (
                                <Badge className="mt-1 bg-orange-600 text-white hover:bg-orange-600">Solicito asistencia</Badge>
                              )}
                            </div>
                            <div className="col-span-2">
                              <p className="font-medium truncate" title={item.userName || ''}>{item.userName || 'Invitado'}</p>
                              <p className="text-[10px] text-slate-500 truncate" title={item.userEmail || ''}>{item.userEmail || 'sin correo'}</p>
                            </div>
                            <div className="col-span-1">
                              <Badge variant="outline">{item.userType}</Badge>
                            </div>
                            <div className="col-span-1">
                              {isCurrent ? (
                                <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Tu sesión</Badge>
                              ) : (
                                <Badge variant="secondary">Remota</Badge>
                              )}
                            </div>
                            <div className="col-span-2 truncate" title={item.lastSeenAt || ''}>
                              {formatServerDateTime(item.lastSeenAt)}
                            </div>
                            <div className="col-span-2 flex justify-end gap-1">
                              <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => void handleMonitorSession(item.sessionId)}>
                                Estadistica
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => void handleWatchSessionLive(item.sessionId)}>
                                {requestingLiveSessionId === item.sessionId ? 'Conectando...' : 'Ver'}
                              </Button>
                              <Button size="sm" variant="destructive" className="h-7 px-2 text-[11px]" disabled={isCurrent} onClick={() => void handleCloseOneActiveSession(item.sessionId)}>
                                Cerrar
                              </Button>
                            </div>
                          </div>
                        );
                      })}

                      {(!activeSessionsData || activeSessionsData.sessions.length === 0) && (
                        <div className="min-w-[860px] px-3 py-8 text-center text-sm text-gray-500">No hay sesiones activas.</div>
                      )}
                    </div>
                    </div>
                  </div>

                  <Card className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h4 className="font-semibold">Estadistica de sesion</h4>
                        <p className="text-xs text-slate-500">
                          {monitoredSessionId
                            ? `Sesion analizada: ${monitoredSessionId}`
                            : 'Selecciona una sesion y pulsa "Estadistica" para analizar actividad.'}
                        </p>
                      </div>
                      {monitoredSessionId && (
                        <Button size="sm" variant="outline" onClick={() => void loadSessionActivity(monitoredSessionId)} disabled={sessionActivityLoading}>
                          {sessionActivityLoading ? 'Actualizando...' : 'Actualizar'}
                        </Button>
                      )}
                    </div>

                    {sessionActivityData && (
                      <div className="mt-3 space-y-2">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                          <div className="rounded border p-2 bg-slate-50"><strong>Eventos:</strong> {sessionActivityData.events.length}</div>
                          <div className="rounded border p-2 bg-slate-50"><strong>Visitas:</strong> {sessionActivityData.events.filter((event) => event.type === 'visit').length}</div>
                          <div className="rounded border p-2 bg-slate-50"><strong>Pings:</strong> {sessionActivityData.events.filter((event) => event.type === 'ping').length}</div>
                          <div className="rounded border p-2 bg-slate-50"><strong>Cargas:</strong> {sessionActivityData.events.filter((event) => event.type === 'load').length}</div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                          <div className="rounded border p-2 bg-slate-50"><strong>Usuario:</strong> {sessionActivityData.userName || 'Invitado'}</div>
                          <div className="rounded border p-2 bg-slate-50"><strong>Correo:</strong> {sessionActivityData.userEmail || 'sin correo'}</div>
                          <div className="rounded border p-2 bg-slate-50 col-span-1 md:col-span-2"><strong>Pantalla actual (ruta):</strong> {sessionActivityData.lastPath || 'Sin ruta reciente'}</div>
                          <div className="rounded border p-2 bg-slate-50 col-span-1 md:col-span-2"><strong>Ultimo movimiento:</strong> {formatServerDateTime(sessionActivityData.lastActivityAt)}</div>
                        </div>

                        <div className="rounded border max-h-52 overflow-y-auto">
                          {sessionActivityData.events.length === 0 ? (
                            <div className="px-3 py-4 text-xs text-slate-500">No hay eventos registrados para esta sesion todavia.</div>
                          ) : (
                            sessionActivityData.events.map((event) => (
                              <div key={event.id} className="px-3 py-2 border-t text-xs bg-white">
                                <p className="font-medium">{event.type} {event.path ? `- ${event.path}` : ''}</p>
                                <p className="text-slate-500">{formatServerDateTime(event.timestamp)}</p>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </Card>

                  <Card className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h4 className="font-semibold">Vista en vivo de navegacion</h4>
                        <p className="text-xs text-slate-500">
                          {liveSessionId
                            ? `Sesion en vivo: ${liveSessionId}`
                            : 'Selecciona una sesion y pulsa "Ver" para seguir su navegacion en tiempo real.'}
                        </p>
                      </div>
                      {liveSessionId && (
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => void loadLiveSession(liveSessionId)} disabled={liveSessionLoading}>
                            {liveSessionLoading ? 'Actualizando...' : 'Actualizar'}
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => void handleStopLiveAssistance(liveSessionId)}>
                            Terminar asistencia
                          </Button>
                        </div>
                      )}
                    </div>

                    {liveSessionData && (
                      <div className="mt-3 space-y-2">
                        {webRTCError && (
                          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                            {webRTCError}
                          </div>
                        )}

                        {remoteStream ? (
                          <div className="rounded border bg-black p-2">
                            <video
                              ref={remoteVideoRef}
                              autoPlay
                              playsInline
                              controls
                              className="w-full max-h-72 rounded"
                            />
                          </div>
                        ) : (
                          <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                            Esperando stream remoto. Asegurate de que el recolector haya aceptado compartir pantalla.
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                          <div className="rounded border p-2 bg-slate-50"><strong>Usuario:</strong> {liveSessionData.userName || 'Invitado'}</div>
                          <div className="rounded border p-2 bg-slate-50"><strong>Correo:</strong> {liveSessionData.userEmail || 'sin correo'}</div>
                          <div className="rounded border p-2 bg-slate-50 col-span-1 md:col-span-2"><strong>Pantalla actual (ruta):</strong> {liveSessionData.lastPath || 'Sin ruta reciente'}</div>
                          <div className="rounded border p-2 bg-slate-50 col-span-1 md:col-span-2"><strong>Ultimo movimiento:</strong> {formatServerDateTime(liveSessionData.lastActivityAt)}</div>
                        </div>

                        <div className="rounded border max-h-52 overflow-y-auto">
                          {liveSessionData.events.length === 0 ? (
                            <div className="px-3 py-4 text-xs text-slate-500">Aun no hay eventos para esta sesion.</div>
                          ) : (
                            liveSessionData.events.map((event) => (
                              <div key={event.id} className="px-3 py-2 border-t text-xs bg-white">
                                <p className="font-medium">{event.type} {event.path ? `- ${event.path}` : ''}</p>
                                <p className="text-slate-500">{formatServerDateTime(event.timestamp)}</p>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </Card>
                  </div>
                </Card>
                </TabsContent>
              </Tabs>
            </TabsContent>

            <TabsContent value="centers" className="space-y-3">
              <Card className="p-4">
                <h3 className="font-semibold flex items-center gap-2"><Warehouse className="w-4 h-4" /> Gestión de Centros</h3>
                <p className="text-sm text-gray-600 mt-1">Accede al módulo para crear, editar y eliminar centros de acopio.</p>
                <Button className="mt-3" onClick={() => navigate('/admin-points')}>Abrir módulo de centros</Button>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
