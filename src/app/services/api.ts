// API Service para EcolLantApp - Supabase Backend
import { projectId, publicAnonKey } from '/utils/supabase/info.tsx';
import type { User, Collection, CollectionPoint, Reward } from '../mockData';

const DEFAULT_API_BASE_URL = `https://${projectId}.supabase.co/functions/v1/server`;

const normalizeApiBaseUrl = (rawValue?: string) => {
  if (!rawValue) return null;

  const unquoted = rawValue.trim().replace(/^['"]|['"]$/g, '');

  try {
    const parsed = new URL(unquoted);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
};

const API_BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL) || DEFAULT_API_BASE_URL;

console.log('🔧 API Base URL:', API_BASE_URL);
console.log('🔑 Project ID:', projectId);

// Local storage keys
const ACCESS_TOKEN_KEY = 'ecolant_access_token';
const USER_KEY = 'ecolant_user';

const getAnalyticsUserType = () => {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return 'guest';
    const parsed = JSON.parse(raw);
    return parsed?.type || 'guest';
  } catch {
    return 'guest';
  }
};

const parseResponseBody = async (response: Response): Promise<any> => {
  const rawBody = await response.text();
  if (!rawBody) return null;

  try {
    return JSON.parse(rawBody);
  } catch {
    return { rawBody };
  }
};

const resolveErrorMessage = (payload: any, fallbackMessage: string) => {
  if (!payload) return fallbackMessage;
  if (typeof payload === 'string') return payload;
  if (typeof payload.error === 'string') return payload.error;
  if (typeof payload.message === 'string') return payload.message;
  if (typeof payload.rawBody === 'string') return payload.rawBody;
  return fallbackMessage;
};

// Helper to get auth headers
const getAuthHeaders = (includeAuth = true) => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  
  if (includeAuth) {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else {
      headers['Authorization'] = `Bearer ${publicAnonKey}`;
    }
  } else {
    headers['Authorization'] = `Bearer ${publicAnonKey}`;
  }
  
  return headers;
};

// ==================== AUTH API ====================

export const authAPI = {
  async signup(data: {
    email: string;
    password: string;
    name: string;
    phone: string;
    type: 'generator' | 'collector';
    address?: string;
  }) {
    const response = await fetch(`${API_BASE_URL}/auth/signup`, {
      method: 'POST',
      headers: getAuthHeaders(false),
      body: JSON.stringify(data),
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Error al registrarse');
    }
    
    return result;
  },
  
  async signin(email: string, password: string) {
    const response = await fetch(`${API_BASE_URL}/auth/signin`, {
      method: 'POST',
      headers: getAuthHeaders(false),
      body: JSON.stringify({ email, password }),
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Error al iniciar sesión');
    }
    
    // Store token and user
    if (result.session?.access_token) {
      localStorage.setItem(ACCESS_TOKEN_KEY, result.session.access_token);
    }
    if (result.user) {
      localStorage.setItem(USER_KEY, JSON.stringify(result.user));
    }
    
    return result;
  },
  
  async getSession() {
    const response = await fetch(`${API_BASE_URL}/auth/session`, {
      method: 'GET',
      headers: getAuthHeaders(true),
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      // Clear stored data if session is invalid
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      return null;
    }
    
    if (result.user) {
      localStorage.setItem(USER_KEY, JSON.stringify(result.user));
    }
    
    return result;
  },
  
  async signout() {
    try {
      await fetch(`${API_BASE_URL}/auth/signout`, {
        method: 'POST',
        headers: getAuthHeaders(true),
      });
    } finally {
      // Always clear local storage
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
  },

  async changePassword(currentPassword: string, newPassword: string) {
    const response = await fetch(`${API_BASE_URL}/auth/change-password`, {
      method: 'POST',
      headers: getAuthHeaders(true),
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Error al cambiar la contraseña');
    }

    return result;
  },

  async deleteAccount(currentPassword: string) {
    const response = await fetch(`${API_BASE_URL}/auth/delete-account`, {
      method: 'DELETE',
      headers: getAuthHeaders(true),
      body: JSON.stringify({ currentPassword }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Error al eliminar la cuenta');
    }

    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);

    return result;
  },
  
  getCurrentUser(): User | null {
    const userStr = localStorage.getItem(USER_KEY);
    if (!userStr) return null;

    try {
      return JSON.parse(userStr);
    } catch {
      localStorage.removeItem(USER_KEY);
      return null;
    }
  },
  
  isAuthenticated(): boolean {
    return !!localStorage.getItem(ACCESS_TOKEN_KEY);
  },
};

// ==================== USER API ====================

export const userAPI = {
  async getProfile(userId: string): Promise<User> {
    const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
      method: 'GET',
      headers: getAuthHeaders(true),
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Error al obtener perfil');
    }
    
    // Update local cache
    localStorage.setItem(USER_KEY, JSON.stringify(result));
    
    return result;
  },
  
  async updateProfile(userId: string, updates: Partial<User>): Promise<User> {
    const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
      method: 'PUT',
      headers: getAuthHeaders(true),
      body: JSON.stringify(updates),
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Error al actualizar perfil');
    }
    
    // Update local cache
    localStorage.setItem(USER_KEY, JSON.stringify(result));
    
    return result;
  },
};

// ==================== COLLECTIONS API ====================

export const collectionsAPI = {
  async getAll(): Promise<Collection[]> {
    const response = await fetch(`${API_BASE_URL}/collections`, {
      method: 'GET',
      headers: getAuthHeaders(true),
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Error al obtener recolecciones');
    }
    
    return result;
  },
  
  async getById(collectionId: string): Promise<Collection> {
    const response = await fetch(`${API_BASE_URL}/collections/${collectionId}`, {
      method: 'GET',
      headers: getAuthHeaders(true),
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Error al obtener recolección');
    }
    
    return result;
  },
  
  async create(data: {
    tireCount: number;
    tireType: string;
    address: string;
    coordinates: { lat: number; lng: number };
    scheduledDate?: string;
    description?: string;
    photos?: string[];
  }): Promise<Collection> {
    const response = await fetch(`${API_BASE_URL}/collections`, {
      method: 'POST',
      headers: getAuthHeaders(true),
      body: JSON.stringify(data),
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Error al crear recolección');
    }
    
    return result;
  },
  
  async update(collectionId: string, updates: Partial<Collection>): Promise<Collection> {
    const response = await fetch(`${API_BASE_URL}/collections/${collectionId}`, {
      method: 'PUT',
      headers: getAuthHeaders(true),
      body: JSON.stringify(updates),
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Error al actualizar recolección');
    }
    
    return result;
  },

  async getTrace(collectionId: string): Promise<{
    collectionId: string;
    qrCode: string;
    currentStage: string;
    events: any[];
    certificate: any;
  }> {
    const response = await fetch(`${API_BASE_URL}/collections/${collectionId}/trace`, {
      method: 'GET',
      headers: getAuthHeaders(true),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Error al obtener trazabilidad');
    }

    return result;
  },
};

export const kioskAPI = {
  async registerDelivery(data: {
    pointId: string;
    tireCount: number;
    tireType?: string;
    collectionId?: string;
    generatorName?: string;
    generatorDocument?: string;
  }): Promise<{
    message: string;
    receipt: any;
    point: any;
  }> {
    const response = await fetch(`${API_BASE_URL}/kiosk/deliveries`, {
      method: 'POST',
      headers: getAuthHeaders(true),
      body: JSON.stringify(data),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Error al registrar entrega en kiosco');
    }

    return result;
  },
};

// ==================== POINTS API ====================

export const pointsAPI = {
  async getAll(): Promise<CollectionPoint[]> {
    const response = await fetch(`${API_BASE_URL}/points`, {
      method: 'GET',
      headers: getAuthHeaders(false),
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Error al obtener puntos de recolección');
    }
    
    return result;
  },

  async create(data: {
    name: string;
    address: string;
    coordinates: { lat: number; lng: number };
    capacity: number;
    currentLoad?: number;
    acceptedTypes?: string[];
    hours?: string;
    phone?: string;
  }): Promise<CollectionPoint> {
    const response = await fetch(`${API_BASE_URL}/points`, {
      method: 'POST',
      headers: getAuthHeaders(true),
      body: JSON.stringify(data),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Error al crear centro de acopio');
    }

    return result;
  },

  async update(
    pointId: string,
    updates: Partial<CollectionPoint>,
  ): Promise<CollectionPoint> {
    const response = await fetch(`${API_BASE_URL}/points/${pointId}`, {
      method: 'PUT',
      headers: getAuthHeaders(true),
      body: JSON.stringify(updates),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Error al actualizar centro de acopio');
    }

    return result;
  },

  async remove(pointId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/points/${pointId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(true),
    });

    if (!response.ok) {
      const rawBody = await response.text();
      let errorMessage = 'Error al eliminar centro de acopio';

      if (rawBody) {
        try {
          const parsed = JSON.parse(rawBody);
          errorMessage = parsed?.error || parsed?.message || errorMessage;
        } catch {
          errorMessage = rawBody;
        }
      }

      throw new Error(errorMessage);
    }
  },
  
  async seed(): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/points/seed`, {
      method: 'POST',
      headers: getAuthHeaders(false),
    });
    
    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.error || 'Error al inicializar puntos');
    }
  },
};

export const adminAPI = {
  async getUsers(): Promise<any[]> {
    const response = await fetch(`${API_BASE_URL}/admin/users`, {
      method: 'GET',
      headers: getAuthHeaders(true),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al obtener usuarios'));
    }
    return result;
  },

  async updateUserRole(userId: string, type: 'generator' | 'collector' | 'admin') {
    const response = await fetch(`${API_BASE_URL}/admin/users/${userId}/role`, {
      method: 'PUT',
      headers: getAuthHeaders(true),
      body: JSON.stringify({ type }),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al actualizar rol de usuario'));
    }
    return result;
  },

  async createUser(data: {
    email: string;
    password: string;
    name: string;
    phone?: string;
    type: 'generator' | 'collector' | 'admin';
    address?: string;
  }) {
    const response = await fetch(`${API_BASE_URL}/admin/users`, {
      method: 'POST',
      headers: getAuthHeaders(true),
      body: JSON.stringify(data),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al crear usuario'));
    }
    return result;
  },

  async updateUser(
    userId: string,
    updates: {
      name: string;
      email: string;
      phone?: string;
      address?: string;
      type: 'generator' | 'collector' | 'admin';
    },
  ) {
    const response = await fetch(`${API_BASE_URL}/admin/users/${userId}`, {
      method: 'PUT',
      headers: getAuthHeaders(true),
      body: JSON.stringify(updates),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al actualizar usuario'));
    }
    return result;
  },

  async resetUserPassword(userId: string, newPassword: string) {
    const response = await fetch(`${API_BASE_URL}/admin/users/${userId}/reset-password`, {
      method: 'POST',
      headers: getAuthHeaders(true),
      body: JSON.stringify({ newPassword }),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al resetear contrasena'));
    }
    return result;
  },

  async deleteUser(userId: string) {
    const response = await fetch(`${API_BASE_URL}/admin/users/${userId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(true),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al eliminar usuario'));
    }
    return result;
  },

  async getSettings(): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/admin/settings`, {
      method: 'GET',
      headers: getAuthHeaders(true),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al obtener configuracion'));
    }
    return result;
  },

  async updateSettings(updates: Record<string, any>): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/admin/settings`, {
      method: 'PUT',
      headers: getAuthHeaders(true),
      body: JSON.stringify(updates),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al actualizar configuracion'));
    }
    return result;
  },

  async getReportsOverview(): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/admin/reports/overview`, {
      method: 'GET',
      headers: getAuthHeaders(true),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al obtener reportes'));
    }
    return result;
  },

  async getAnalytics(): Promise<{
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
  }> {
    const response = await fetch(`${API_BASE_URL}/admin/analytics`, {
      method: 'GET',
      headers: getAuthHeaders(true),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al obtener analitica'));
    }
    return result;
  },

  async getAnalyticsReport(filters: {
    from?: string;
    to?: string;
    period?: 'daily' | 'weekly' | 'monthly';
    userType?: 'all' | 'generator' | 'collector' | 'admin' | 'guest';
  }) {
    const params = new URLSearchParams();
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    if (filters.period) params.set('period', filters.period);
    if (filters.userType) params.set('userType', filters.userType);

    const response = await fetch(`${API_BASE_URL}/admin/analytics/report?${params.toString()}`, {
      method: 'GET',
      headers: getAuthHeaders(true),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al obtener reporte de analitica'));
    }
    return result;
  },

  async getAnalyticsCampaigns() {
    const response = await fetch(`${API_BASE_URL}/admin/analytics/campaigns`, {
      method: 'GET',
      headers: getAuthHeaders(true),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al obtener campanas'));
    }
    return result;
  },

  async createAnalyticsCampaign(payload: {
    name: string;
    startsAt: string;
    endsAt?: string;
    period?: 'daily' | 'weekly' | 'monthly';
    userType?: 'all' | 'generator' | 'collector' | 'admin' | 'guest';
  }) {
    const response = await fetch(`${API_BASE_URL}/admin/analytics/campaigns`, {
      method: 'POST',
      headers: getAuthHeaders(true),
      body: JSON.stringify(payload),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al crear campana'));
    }
    return result;
  },

  async updateAnalyticsCampaign(
    campaignId: string,
    payload: {
      name: string;
      startsAt: string;
      endsAt?: string;
      period?: 'daily' | 'weekly' | 'monthly';
      userType?: 'all' | 'generator' | 'collector' | 'admin' | 'guest';
    },
  ) {
    const response = await fetch(`${API_BASE_URL}/admin/analytics/campaigns/${campaignId}`, {
      method: 'PUT',
      headers: getAuthHeaders(true),
      body: JSON.stringify(payload),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al actualizar campana'));
    }
    return result;
  },

  async deleteAnalyticsCampaign(campaignId: string) {
    const response = await fetch(`${API_BASE_URL}/admin/analytics/campaigns/${campaignId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(true),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al eliminar campana'));
    }
    return result;
  },

  async resetAnalyticsTestData() {
    const response = await fetch(`${API_BASE_URL}/admin/analytics/reset-test-data`, {
      method: 'POST',
      headers: getAuthHeaders(true),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al limpiar datos de prueba'));
    }
    return result;
  },

  async resetAnalyticsActiveSessions() {
    const response = await fetch(`${API_BASE_URL}/admin/analytics/reset-active-sessions`, {
      method: 'POST',
      headers: getAuthHeaders(true),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al resetear sesiones activas'));
    }
    return result;
  },

  async getActiveAnalyticsSessions() {
    const response = await fetch(`${API_BASE_URL}/admin/analytics/sessions/active`, {
      method: 'GET',
      headers: getAuthHeaders(true),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al obtener sesiones activas'));
    }
    return result;
  },

  async closeAnalyticsSession(sessionId: string) {
    const response = await fetch(`${API_BASE_URL}/admin/analytics/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(true),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al cerrar sesion activa'));
    }
    return result;
  },

  async closeAllAnalyticsSessions() {
    const response = await fetch(`${API_BASE_URL}/admin/analytics/sessions/close-all`, {
      method: 'POST',
      headers: getAuthHeaders(true),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      // Backward-compatible fallback for environments with older route behavior.
      const fallbackResponse = await fetch(`${API_BASE_URL}/admin/analytics/reset-active-sessions`, {
        method: 'POST',
        headers: getAuthHeaders(true),
      });
      const fallbackResult = await parseResponseBody(fallbackResponse);
      if (!fallbackResponse.ok) {
        throw new Error(resolveErrorMessage(fallbackResult || result, 'Error al cerrar todas las sesiones activas'));
      }
      return fallbackResult;
    }
    return result;
  },
};

export const analyticsAPI = {
  async trackVisit(path: string, sessionId?: string) {
    try {
      await fetch(`${API_BASE_URL}/analytics/visit`, {
        method: 'POST',
        headers: getAuthHeaders(false),
        body: JSON.stringify({ path, sessionId, userType: getAnalyticsUserType() }),
      });
    } catch {
      // Silently ignore analytics failures in prototype mode.
    }
  },

  async trackSession(durationMs: number) {
    try {
      await fetch(`${API_BASE_URL}/analytics/session`, {
        method: 'POST',
        headers: getAuthHeaders(false),
        body: JSON.stringify({ durationMs, userType: getAnalyticsUserType() }),
      });
    } catch {
      // Silently ignore analytics failures in prototype mode.
    }
  },

  async trackAppLoadTime(loadTimeMs: number) {
    try {
      await fetch(`${API_BASE_URL}/analytics/load`, {
        method: 'POST',
        headers: getAuthHeaders(false),
        body: JSON.stringify({ loadTimeMs, userType: getAnalyticsUserType() }),
      });
    } catch {
      // Silently ignore analytics failures in prototype mode.
    }
  },

  async startSession(sessionId: string, startedAt: string) {
    try {
      await fetch(`${API_BASE_URL}/analytics/session/start`, {
        method: 'POST',
        headers: getAuthHeaders(false),
        body: JSON.stringify({ sessionId, startedAt, userType: getAnalyticsUserType() }),
      });
    } catch {
      // Silently ignore analytics failures in prototype mode.
    }
  },

  async endSession(sessionId: string, durationMs: number) {
    try {
      const payload = JSON.stringify({ sessionId, durationMs, userType: getAnalyticsUserType() });
      await fetch(`${API_BASE_URL}/analytics/session/end`, {
        method: 'POST',
        headers: getAuthHeaders(false),
        body: payload,
        keepalive: true,
      });

      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const headers = getAuthHeaders(false) as Record<string, string>;
        const beaconBody = JSON.stringify({ sessionId, durationMs, userType: getAnalyticsUserType() });
        const blob = new Blob([beaconBody], { type: headers['Content-Type'] || 'application/json' });
        navigator.sendBeacon(`${API_BASE_URL}/analytics/session/end`, blob);
      }
    } catch {
      // Silently ignore analytics failures in prototype mode.
    }
  },

  async pingSession(sessionId: string) {
    try {
      await fetch(`${API_BASE_URL}/analytics/session/ping`, {
        method: 'POST',
        headers: getAuthHeaders(false),
        body: JSON.stringify({ sessionId, userType: getAnalyticsUserType() }),
      });
    } catch {
      // Silently ignore analytics failures in prototype mode.
    }
  },
};

// ==================== REWARDS API ====================

export const rewardsAPI = {
  async getAll(): Promise<Reward[]> {
    const response = await fetch(`${API_BASE_URL}/rewards`, {
      method: 'GET',
      headers: getAuthHeaders(false),
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Error al obtener recompensas');
    }
    
    return result;
  },
  
  async seed(): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/rewards/seed`, {
      method: 'POST',
      headers: getAuthHeaders(false),
    });
    
    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.error || 'Error al inicializar recompensas');
    }
  },
  
  async redeem(rewardId: string): Promise<{ redemption: any; newPointsBalance: number }> {
    const response = await fetch(`${API_BASE_URL}/rewards/${rewardId}/redeem`, {
      method: 'POST',
      headers: getAuthHeaders(true),
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Error al canjear recompensa');
    }
    
    return result;
  },
};

// ==================== STATS API ====================

export const statsAPI = {
  async get(userId: string): Promise<{
    totalCollections: number;
    totalTires: number;
    totalPoints: number;
    co2Saved: number;
    treesEquivalent: number;
    recycledWeight: number;
  }> {
    const response = await fetch(`${API_BASE_URL}/stats/${userId}`, {
      method: 'GET',
      headers: getAuthHeaders(true),
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Error al obtener estadísticas');
    }
    
    return result;
  },
};

// ==================== UPLOAD API ====================

export const uploadAPI = {
  async uploadPhoto(file: File): Promise<{ path: string; url: string }> {
    const formData = new FormData();
    formData.append('file', file);
    
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    
    const response = await fetch(`${API_BASE_URL}/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token || publicAnonKey}`,
      },
      body: formData,
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Error al subir foto');
    }
    
    return result;
  },
};

// ==================== INITIALIZATION ====================

export const initializeApp = async () => {
  try {
    // Seed collection points if empty or when legacy demo data is detected.
    const points = await pointsAPI.getAll();
    const hasLegacyColombiaData = points.some((point: any) => {
      const address = String(point?.address || '').toLowerCase();
      const name = String(point?.name || '').toLowerCase();
      const phone = String(point?.phone || '').toLowerCase();
      const lat = Number(point?.coordinates?.lat || 0);

      return (
        address.includes('bogota') ||
        name.includes('chapinero') ||
        name.includes('suba') ||
        phone.includes('+57') ||
        lat < 10
      );
    });

    if (points.length === 0 || hasLegacyColombiaData) {
      await pointsAPI.seed();
    }
    
    // Seed rewards if empty
    const rewards = await rewardsAPI.getAll();
    if (rewards.length === 0) {
      await rewardsAPI.seed();
    }
    
    console.log('App initialized successfully');
  } catch (error) {
    console.error('Error initializing app:', error);
  }
};