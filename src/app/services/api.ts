// API Service para EcolLantApp - Supabase Backend
import { projectId, publicAnonKey } from '/utils/supabase/info.tsx';
import type { 
  User, 
  Collection, 
  CollectionItem,
  CollectionPoint, 
  Reward,
  PaymentSettings,
  CollectorPayment,
  GeneratorPayment,
  CollectorTireRate,
  GeneratorTireRate
} from '../mockData';

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

export const API_BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL) || DEFAULT_API_BASE_URL;

console.log('🔧 API Base URL:', API_BASE_URL);
console.log('🔑 Project ID:', projectId);

// Local storage keys
const ACCESS_TOKEN_KEY = 'ecolant_access_token';
const USER_KEY = 'ecolant_user';
export const ANALYTICS_SESSION_ID_KEY = 'ecolant_session_id';

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

const buildApiError = (
  response: Response,
  payload: any,
  fallbackMessage: string,
  context: string,
) => {
  const backendMessage = resolveErrorMessage(payload, fallbackMessage);
  const detailedMessage = `${backendMessage} (HTTP ${response.status} ${response.statusText})`;

  // Leave a rich log in console so 401 lines in DevTools have actionable context.
  console.error(`[API:${context}]`, {
    status: response.status,
    statusText: response.statusText,
    url: response.url,
    backendMessage,
    payload,
  });

  return new Error(detailedMessage);
};

// Helper to get auth headers
export const getAuthHeaders = (includeAuth = true) => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  
  if (includeAuth) {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (token) {
      // User is authenticated - send user token
      headers['Authorization'] = `Bearer ${token}`;
    } else {
      // No user token - send anon key for public endpoints
      headers['Authorization'] = `Bearer ${publicAnonKey}`;
    }
  } else {
    // Explicitly public - always use anon key
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
    
    const result = await parseResponseBody(response);

    if (!response.ok) {
      throw buildApiError(response, result, 'Error al registrarse', 'auth.signup');
    }
    
    return result;
  },
  
  async signin(email: string, password: string) {
    const response = await fetch(`${API_BASE_URL}/auth/signin`, {
      method: 'POST',
      headers: getAuthHeaders(false),
      body: JSON.stringify({ email, password }),
    });
    
    const result = await parseResponseBody(response);

    if (!response.ok) {
      throw buildApiError(response, result, 'Error al iniciar sesion', 'auth.signin');
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
    
    const result = await parseResponseBody(response);
    
    if (!response.ok) {
      console.warn('[API:auth.session] Invalid session response', {
        status: response.status,
        statusText: response.statusText,
        url: response.url,
        payload: result,
      });
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

    const result = await parseResponseBody(response);

    if (!response.ok) {
      throw buildApiError(response, result, 'Error al cambiar la contrasena', 'auth.changePassword');
    }

    return result;
  },

  async deleteAccount(currentPassword: string) {
    const response = await fetch(`${API_BASE_URL}/auth/delete-account`, {
      method: 'DELETE',
      headers: getAuthHeaders(true),
      body: JSON.stringify({ currentPassword }),
    });

    const result = await parseResponseBody(response);

    if (!response.ok) {
      throw buildApiError(response, result, 'Error al eliminar la cuenta', 'auth.deleteAccount');
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
    tireCondition?: string;
    collectionItems?: CollectionItem[];
    address: string;
    coordinates: { lat: number; lng: number };
    scheduledDate?: string;
    description?: string;
    photos?: string[];
    paymentPreference?: 'points' | 'cash';
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
  
  async registerArrival(pointId: string, data: {
    collectionId: string;
    tireCount?: number;
    tireType?: string;
    weightKg?: number;
    notes?: string;
  }): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/points/${pointId}/arrivals`, {
      method: 'POST',
      headers: getAuthHeaders(true),
      body: JSON.stringify(data),
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Error al registrar llegada');
    }
    
    return result;
  },
  
  async getInventory(pointId: string): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/points/${pointId}/inventory`, {
      method: 'GET',
      headers: getAuthHeaders(true),
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Error al obtener inventario');
    }
    
    return result;
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

  async getRewards(): Promise<any[]> {
    const response = await fetch(`${API_BASE_URL}/admin/rewards`, {
      method: 'GET',
      headers: getAuthHeaders(true),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al obtener recompensas del catalogo'));
    }
    return result;
  },

  async createReward(payload: {
    title: string;
    description?: string;
    pointsCost: number;
    category?: string;
    sponsor?: string;
    available?: boolean;
  }) {
    const response = await fetch(`${API_BASE_URL}/admin/rewards`, {
      method: 'POST',
      headers: getAuthHeaders(true),
      body: JSON.stringify(payload),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al crear recompensa'));
    }
    return result;
  },

  async updateReward(rewardId: string, payload: Record<string, any>) {
    const response = await fetch(`${API_BASE_URL}/admin/rewards/${rewardId}`, {
      method: 'PUT',
      headers: getAuthHeaders(true),
      body: JSON.stringify(payload),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al actualizar recompensa'));
    }
    return result;
  },

  async deleteReward(rewardId: string) {
    const response = await fetch(`${API_BASE_URL}/admin/rewards/${rewardId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(true),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al eliminar recompensa'));
    }
    return result;
  },

  async assignReward(rewardId: string, payload: { userId: string; expiresInDays?: number }) {
    const response = await fetch(`${API_BASE_URL}/admin/rewards/${rewardId}/assign`, {
      method: 'POST',
      headers: getAuthHeaders(true),
      body: JSON.stringify(payload),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al asignar recompensa'));
    }
    return result;
  },

  async getPricing(): Promise<{
    generatorTariffsByCondition: {
      excelente: number;
      buena: number;
      regular: number;
      desgastada: number;
    };
    collectorFreight: {
      min: number;
      max: number;
    };
    currency: string;
  }> {
    const response = await fetch(`${API_BASE_URL}/admin/pricing`, {
      method: 'GET',
      headers: getAuthHeaders(true),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al obtener tarifas monetarias'));
    }
    return result;
  },

  async updatePricing(payload: {
    generatorTariffsByCondition: {
      excelente: number;
      buena: number;
      regular: number;
      desgastada: number;
    };
    collectorFreight: {
      min: number;
      max: number;
    };
  }) {
    const response = await fetch(`${API_BASE_URL}/admin/pricing`, {
      method: 'PUT',
      headers: getAuthHeaders(true),
      body: JSON.stringify(payload),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al actualizar tarifas monetarias'));
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
    const currentSessionId = sessionStorage.getItem(ANALYTICS_SESSION_ID_KEY) || '';
    const query = currentSessionId
      ? `?currentSessionId=${encodeURIComponent(currentSessionId)}`
      : '';
    const response = await fetch(`${API_BASE_URL}/admin/analytics/sessions/active${query}`, {
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

  async closeAllAnalyticsSessions(excludeSessionId?: string) {
    const response = await fetch(`${API_BASE_URL}/admin/analytics/sessions/close-all`, {
      method: 'POST',
      headers: getAuthHeaders(true),
      body: JSON.stringify({
        excludeSessionId: excludeSessionId || null,
      }),
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

  async getAnalyticsSessionActivity(sessionId: string, limit = 25) {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const response = await fetch(`${API_BASE_URL}/admin/analytics/sessions/${encodeURIComponent(sessionId)}/activity?limit=${safeLimit}`, {
      method: 'GET',
      headers: getAuthHeaders(true),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al obtener actividad de sesion'));
    }
    return result;
  },
};

export const collectorAPI = {
  async getRouteSuggestions(params?: { lat?: number; lng?: number; maxStops?: number }) {
    const query = new URLSearchParams();
    if (params?.lat !== undefined) query.set('lat', String(params.lat));
    if (params?.lng !== undefined) query.set('lng', String(params.lng));
    if (params?.maxStops !== undefined) query.set('maxStops', String(params.maxStops));

    const suffix = query.toString() ? `?${query.toString()}` : '';
    const response = await fetch(`${API_BASE_URL}/collector/routes/suggestions${suffix}`, {
      method: 'GET',
      headers: getAuthHeaders(true),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al generar rutas sugeridas'));
    }
    return result;
  },

  async takeCollection(collectionId: string, paymentData?: { collectorFreight?: number; collectorBonusPoints?: number }) {
    const response = await fetch(`${API_BASE_URL}/collector/collections/${collectionId}/take`, {
      method: 'POST',
      headers: getAuthHeaders(true),
      body: JSON.stringify(paymentData || {}),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw buildApiError(response, result, 'No se pudo tomar la recoleccion', 'collector.takeCollection');
    }
    return result;
  },
};

export const analyticsAPI = {
  async trackVisit(path: string, sessionId?: string) {
    try {
      await fetch(`${API_BASE_URL}/analytics/visit`, {
        method: 'POST',
        headers: getAuthHeaders(true),
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
        headers: getAuthHeaders(true),
        body: JSON.stringify({ durationMs, userType: getAnalyticsUserType() }),
      });
    } catch {
      // Silently ignore analytics failures in prototype mode.
    }
  },

  async trackAppLoadTime(loadTimeMs: number) {
    try {
      const response = await fetch(`${API_BASE_URL}/analytics/load`, {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify({ loadTimeMs, userType: getAnalyticsUserType() }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ trackAppLoadTime failed:', response.status, errorData);
      }
    } catch (error) {
      console.error('💥 trackAppLoadTime exception:', error);
    }
  },

  async startSession(sessionId: string, startedAt: string) {
    try {
      const response = await fetch(`${API_BASE_URL}/analytics/session/start`, {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify({ sessionId, startedAt, userType: getAnalyticsUserType() }),
      });

      if (response.ok) {
        return { blocked: false };
      }

      const result = await parseResponseBody(response);
      if (response.status === 409 && result?.code === 'SESSION_BLOCKED') {
        return { blocked: true };
      }

      return { blocked: false };
    } catch {
      // Silently ignore analytics failures in prototype mode.
      return { blocked: false };
    }
  },

  async endSession(sessionId: string, durationMs: number) {
    try {
      const payload = JSON.stringify({ sessionId, durationMs, userType: getAnalyticsUserType() });
      await fetch(`${API_BASE_URL}/analytics/session/end`, {
        method: 'POST',
        headers: getAuthHeaders(true),
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
      const response = await fetch(`${API_BASE_URL}/analytics/session/ping`, {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify({ sessionId, userType: getAnalyticsUserType() }),
      });

      if (response.ok) {
        return { blocked: false };
      }

      const result = await parseResponseBody(response);
      if (response.status === 409 && result?.code === 'SESSION_BLOCKED') {
        return { blocked: true };
      }

      return { blocked: false };
    } catch {
      // Silently ignore analytics failures in prototype mode.
      return { blocked: false };
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
  
  async getRedemptions(): Promise<any[]> {
    const response = await fetch(`${API_BASE_URL}/rewards/redemptions`, {
      method: 'GET',
      headers: getAuthHeaders(true),
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Error al obtener cupones');
    }
    
    return result;
  },
  
  getCouponUrl(redemptionId: string): string {
    return `${API_BASE_URL}/coupons/${redemptionId}`;
  },
  
  async useCoupon(redemptionId: string, notes?: string): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/coupons/${redemptionId}/use`, {
      method: 'POST',
      headers: getAuthHeaders(true),
      body: JSON.stringify({ notes }),
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Error al marcar cupón como usado');
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

// ==================== PAYMENTS API ====================

export const paymentsAPI = {
  // Configuración de pagos
  async getSettings(): Promise<PaymentSettings> {
    const response = await fetch(`${API_BASE_URL}/payments/settings`, {
      method: 'GET',
      headers: getAuthHeaders(true),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al obtener configuración de pagos'));
    }
    return result;
  },

  async updateSettings(updates: Partial<PaymentSettings>): Promise<PaymentSettings> {
    const response = await fetch(`${API_BASE_URL}/payments/settings`, {
      method: 'PUT',
      headers: getAuthHeaders(true),
      body: JSON.stringify(updates),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al actualizar configuración de pagos'));
    }
    return result;
  },

  // Cálculos
  async calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): Promise<{ distanceKm: number }> {
    const response = await fetch(`${API_BASE_URL}/payments/calculate-distance`, {
      method: 'POST',
      headers: getAuthHeaders(true),
      body: JSON.stringify({ lat1, lng1, lat2, lng2 }),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al calcular distancia'));
    }
    return result;
  },

  async calculateCollectorPayment(distanceKm: number): Promise<{
    paymentAmount: number;
    pointsAwarded: number;
  }> {
    const response = await fetch(`${API_BASE_URL}/payments/calculate-collector`, {
      method: 'POST',
      headers: getAuthHeaders(true),
      body: JSON.stringify({ distanceKm }),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al calcular pago del recolector'));
    }
    return result;
  },

  async calculateGeneratorPayment(
    tireCount: number,
    paymentPreference: 'points' | 'cash',
    options?: {
      tireType?: string;
      tireCondition?: string;
      collectionItems?: CollectionItem[];
    },
  ): Promise<{
    cashAmount: number;
    pointsAwarded: number;
  }> {
    const response = await fetch(`${API_BASE_URL}/payments/calculate-generator`, {
      method: 'POST',
      headers: getAuthHeaders(true),
      body: JSON.stringify({
        tireCount,
        paymentPreference,
        tireType: options?.tireType,
        tireCondition: options?.tireCondition,
        collectionItems: options?.collectionItems,
      }),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al calcular pago del generador'));
    }
    return result;
  },

  // Pagos de recolectores
  async createCollectorPayment(data: {
    collectionId: string;
    collectorId: string;
    pickupLat: number;
    pickupLng: number;
    deliveryLat: number;
    deliveryLng: number;
  }): Promise<CollectorPayment> {
    const response = await fetch(`${API_BASE_URL}/payments/collector`, {
      method: 'POST',
      headers: getAuthHeaders(true),
      body: JSON.stringify(data),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al crear pago del recolector'));
    }
    return result;
  },

  async getCollectorPayments(filters?: {
    collectorId?: string;
    status?: string;
    limit?: number;
  }): Promise<CollectorPayment[]> {
    const params = new URLSearchParams();
    if (filters?.collectorId) params.set('collectorId', filters.collectorId);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.limit) params.set('limit', filters.limit.toString());

    const response = await fetch(
      `${API_BASE_URL}/payments/collector?${params.toString()}`,
      {
        method: 'GET',
        headers: getAuthHeaders(true),
      }
    );

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al obtener pagos de recolectores'));
    }
    return result;
  },

  async processCollectorPayment(data: {
    paymentId: string;
    paymentMethod: 'bank_transfer' | 'cash' | 'digital_wallet';
    paymentReference: string;
    notes?: string;
  }): Promise<CollectorPayment> {
    const response = await fetch(`${API_BASE_URL}/payments/collector/process`, {
      method: 'POST',
      headers: getAuthHeaders(true),
      body: JSON.stringify(data),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al procesar pago del recolector'));
    }
    return result;
  },

  // Pagos de generadores
  async createGeneratorPayment(data: {
    collectionId: string;
    generatorId: string;
    tireCount: number;
    tireType?: string;
    tireCondition?: string;
    collectionItems?: CollectionItem[];
    paymentPreference: 'points' | 'cash';
  }): Promise<GeneratorPayment> {
    const response = await fetch(`${API_BASE_URL}/payments/generator`, {
      method: 'POST',
      headers: getAuthHeaders(true),
      body: JSON.stringify(data),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al crear pago del generador'));
    }
    return result;
  },

  async getGeneratorPayments(filters?: {
    generatorId?: string;
    status?: string;
    paymentPreference?: 'points' | 'cash';
    limit?: number;
  }): Promise<GeneratorPayment[]> {
    const params = new URLSearchParams();
    if (filters?.generatorId) params.set('generatorId', filters.generatorId);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.paymentPreference) params.set('paymentPreference', filters.paymentPreference);
    if (filters?.limit) params.set('limit', filters.limit.toString());

    const response = await fetch(
      `${API_BASE_URL}/payments/generator?${params.toString()}`,
      {
        method: 'GET',
        headers: getAuthHeaders(true),
      }
    );

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al obtener pagos de generadores'));
    }
    return result;
  },

  async processGeneratorPayment(data: {
    paymentId: string;
    paymentMethod: 'bank_transfer' | 'cash' | 'digital_wallet' | 'points';
    paymentReference?: string;
    notes?: string;
  }): Promise<GeneratorPayment> {
    const response = await fetch(`${API_BASE_URL}/payments/generator/process`, {
      method: 'POST',
      headers: getAuthHeaders(true),
      body: JSON.stringify(data),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al procesar pago del generador'));
    }
    return result;
  },

  // Tarifas por tipo y condición de llanta - Recolectores
  async getCollectorRates(): Promise<CollectorTireRate[]> {
    const response = await fetch(`${API_BASE_URL}/payments/rates/collector`, {
      method: 'GET',
      headers: getAuthHeaders(true),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al obtener tarifas de recolectores'));
    }
    return result;
  },

  async updateCollectorRate(rateId: string, updates: Partial<CollectorTireRate>): Promise<CollectorTireRate> {
    const response = await fetch(`${API_BASE_URL}/payments/rates/collector/${rateId}`, {
      method: 'PUT',
      headers: getAuthHeaders(true),
      body: JSON.stringify(updates),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al actualizar tarifa de recolector'));
    }
    return result;
  },

  // Tarifas por tipo y condición de llanta - Generadores
  async getGeneratorRates(): Promise<GeneratorTireRate[]> {
    const response = await fetch(`${API_BASE_URL}/payments/rates/generator`, {
      method: 'GET',
      headers: getAuthHeaders(true),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al obtener tarifas de generadores'));
    }
    return result;
  },

  async updateGeneratorRate(rateId: string, updates: Partial<GeneratorTireRate>): Promise<GeneratorTireRate> {
    const response = await fetch(`${API_BASE_URL}/payments/rates/generator/${rateId}`, {
      method: 'PUT',
      headers: getAuthHeaders(true),
      body: JSON.stringify(updates),
    });

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al actualizar tarifa de generador'));
    }
    return result;
  },

  // Estadísticas de pagos
  async getPaymentStats(filters?: {
    userId?: string;
    userType?: 'generator' | 'collector';
    dateFrom?: string;
    dateTo?: string;
  }): Promise<{
    totalPayments: number;
    totalAmount: number;
    totalPoints: number;
    averageDistance?: number;
    pendingPayments: number;
    completedPayments: number;
  }> {
    const params = new URLSearchParams();
    if (filters?.userId) params.set('userId', filters.userId);
    if (filters?.userType) params.set('userType', filters.userType);
    if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters?.dateTo) params.set('dateTo', filters.dateTo);

    const response = await fetch(
      `${API_BASE_URL}/payments/stats?${params.toString()}`,
      {
        method: 'GET',
        headers: getAuthHeaders(true),
      }
    );

    const result = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(resolveErrorMessage(result, 'Error al obtener estadísticas de pagos'));
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