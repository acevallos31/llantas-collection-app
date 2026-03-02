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
    return userStr ? JSON.parse(userStr) : null;
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
    // Seed collection points if empty
    const points = await pointsAPI.getAll();
    if (points.length === 0) {
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