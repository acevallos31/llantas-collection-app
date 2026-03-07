import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { authAPI } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Leaf, Mail, Lock, User, Phone, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function LoginPage() {
  const navigate = useNavigate();
  const { signin, signup, loading, error, clearError } = useAuth();
  const [isLogin, setIsLogin] = useState(true);

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register form state
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [userType, setUserType] = useState<'generator' | 'collector'>('generator');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    
    try {
      await signin(loginEmail, loginPassword);
      const currentUser = authAPI.getCurrentUser();
      toast.success('¡Bienvenido de nuevo!');
      navigate(
        currentUser?.type === 'admin'
          ? '/admin'
          : currentUser?.type === 'collector'
            ? '/collector'
            : '/home',
      );
    } catch (err: any) {
      toast.error(err.message || 'Error al iniciar sesión');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    
    try {
      await signup({
        email: regEmail,
        password: regPassword,
        name: regName,
        phone: regPhone,
        type: userType,
      });
      const currentUser = authAPI.getCurrentUser();
      toast.success('¡Cuenta creada exitosamente!');
      navigate(
        currentUser?.type === 'admin'
          ? '/admin'
          : currentUser?.type === 'collector'
            ? '/collector'
            : '/home',
      );
    } catch (err: any) {
      toast.error(err.message || 'Error al registrarse');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo y Título */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-600 rounded-full mb-4">
            <Leaf className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-green-800 mb-2">EcolLantApp</h1>
          <p className="text-green-700">Recolección inteligente de llantas</p>
        </div>

        {/* Formulario */}
        <div className="bg-white rounded-2xl shadow-xl p-6">
          <Tabs defaultValue="login" className="w-full" onValueChange={(v) => setIsLogin(v === 'login')}>
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="login">Iniciar Sesión</TabsTrigger>
              <TabsTrigger value="register">Registrarse</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Correo Electrónico</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="tu@email.com"
                      className="pl-10"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Contraseña</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      className="pl-10"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full bg-green-600 hover:bg-green-700"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Iniciando...
                    </>
                  ) : (
                    'Iniciar Sesión'
                  )}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register">
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nombre Completo</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="name"
                      type="text"
                      placeholder="Juan Pérez"
                      className="pl-10"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Teléfono</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="+504 9988-1122"
                      className="pl-10"
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reg-email">Correo Electrónico</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="reg-email"
                      type="email"
                      placeholder="tu@email.com"
                      className="pl-10"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reg-password">Contraseña</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="reg-password"
                      type="password"
                      placeholder="••••••••"
                      className="pl-10"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      required
                      disabled={loading}
                      minLength={6}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Tipo de Usuario</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 ${userType === 'generator' ? 'bg-green-50 border-green-500' : ''}`}>
                      <input 
                        type="radio" 
                        name="userType" 
                        value="generator" 
                        checked={userType === 'generator'}
                        onChange={(e) => setUserType('generator')}
                        disabled={loading}
                      />
                      <span className="text-sm">Generador</span>
                    </label>
                    <label className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 ${userType === 'collector' ? 'bg-green-50 border-green-500' : ''}`}>
                      <input 
                        type="radio" 
                        name="userType" 
                        value="collector"
                        checked={userType === 'collector'}
                        onChange={(e) => setUserType('collector')}
                        disabled={loading}
                      />
                      <span className="text-sm">Recolector</span>
                    </label>
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full bg-green-600 hover:bg-green-700"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creando cuenta...
                    </>
                  ) : (
                    'Crear Cuenta'
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="mt-6 text-center text-sm text-gray-600">
            Al continuar, aceptas nuestros{' '}
            <a href="#" className="text-green-600 hover:underline">
              Términos y Condiciones
            </a>
          </div>
        </div>

        {/* Estadísticas */}
        <div className="mt-8 grid grid-cols-3 gap-4 text-center">
          <div className="bg-white/60 backdrop-blur rounded-lg p-3">
            <div className="text-2xl font-bold text-green-700">15K+</div>
            <div className="text-xs text-green-600">Usuarios</div>
          </div>
          <div className="bg-white/60 backdrop-blur rounded-lg p-3">
            <div className="text-2xl font-bold text-green-700">50K+</div>
            <div className="text-xs text-green-600">Llantas</div>
          </div>
          <div className="bg-white/60 backdrop-blur rounded-lg p-3">
            <div className="text-2xl font-bold text-green-700">120T</div>
            <div className="text-xs text-green-600">CO₂ Evitado</div>
          </div>
        </div>
      </div>
    </div>
  );
}