import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI, userAPI, initializeApp } from '../services/api';
import type { User } from '../mockData';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  signin: (email: string, password: string) => Promise<void>;
  signup: (data: {
    email: string;
    password: string;
    name: string;
    phone: string;
    type: 'generator' | 'collector';
    address?: string;
  }) => Promise<void>;
  signout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  deleteAccount: (currentPassword: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check for existing session on mount
  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      setLoading(true);
      
      // Initialize app data (seed if needed)
      await initializeApp();
      
      // Check if user is already authenticated
      if (authAPI.isAuthenticated()) {
        const sessionData = await authAPI.getSession();
        if (sessionData?.user) {
          setUser(sessionData.user);
        } else {
          setUser(null);
        }
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error('Session check error:', err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const signin = async (email: string, password: string) => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await authAPI.signin(email, password);
      setUser(data.user);
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signup = async (data: {
    email: string;
    password: string;
    name: string;
    phone: string;
    type: 'generator' | 'collector';
    address?: string;
  }) => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await authAPI.signup(data);
      
      // After signup, sign in automatically
      await signin(data.email, data.password);
    } catch (err: any) {
      setError(err.message || 'Error al registrarse');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signout = async () => {
    try {
      setLoading(true);
      await authAPI.signout();
      setUser(null);
    } catch (err) {
      console.error('Signout error:', err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    try {
      setLoading(true);
      setError(null);
      await authAPI.changePassword(currentPassword, newPassword);
    } catch (err: any) {
      setError(err.message || 'Error al cambiar la contraseña');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const deleteAccount = async (currentPassword: string) => {
    try {
      setLoading(true);
      setError(null);
      await authAPI.deleteAccount(currentPassword);
      setUser(null);
    } catch (err: any) {
      setError(err.message || 'Error al eliminar la cuenta');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const refreshUser = async () => {
    if (!user) return;
    
    try {
      const updatedUser = await userAPI.getProfile(user.id);
      setUser(updatedUser);
    } catch (err) {
      console.error('Error refreshing user:', err);
    }
  };

  const clearError = () => {
    setError(null);
  };

  const value: AuthContextType = {
    user,
    loading,
    error,
    signin,
    signup,
    signout,
    changePassword,
    deleteAccount,
    refreshUser,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
