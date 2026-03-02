import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Switch } from '../components/ui/switch';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { 
  ChevronLeft, 
  ChevronRight,
  Bell,
  Shield,
  Globe,
  Moon,
  HelpCircle,
  FileText,
  LogOut,
  Trash2,
  User,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';

export default function SettingsPage() {
  const navigate = useNavigate();
  const { signout, changePassword, deleteAccount, user } = useAuth();
  const [notifications, setNotifications] = useState({
    collections: true,
    rewards: true,
    news: false,
    marketing: false,
  });
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
  const [isChangePasswordDialogOpen, setIsChangePasswordDialogOpen] = useState(false);
  const [isDeleteAccountDialogOpen, setIsDeleteAccountDialogOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [deletePassword, setDeletePassword] = useState('');

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await signout();
      toast.success('Sesión cerrada exitosamente');
      setIsLogoutDialogOpen(false);
      navigate('/', { replace: true });
    } catch (error) {
      toast.error('Error al cerrar sesión');
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      toast.error('Debes ingresar tu contraseña actual');
      return;
    }

    setIsDeletingAccount(true);
    try {
      await deleteAccount(deletePassword);
      toast.success('Cuenta eliminada exitosamente');
      setDeletePassword('');
      setIsDeleteAccountDialogOpen(false);
      navigate('/', { replace: true });
    } catch (error: any) {
      toast.error(error.message || 'Error al eliminar la cuenta');
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      toast.error('Completa todos los campos');
      return;
    }

    if (newPassword.length < 6) {
      toast.error('La nueva contraseña debe tener al menos 6 caracteres');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      toast.error('Las contraseñas no coinciden');
      return;
    }

    setIsChangingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      toast.success('Contraseña actualizada exitosamente');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setIsChangePasswordDialogOpen(false);
    } catch (error: any) {
      toast.error(error.message || 'Error al cambiar la contraseña');
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white p-6 rounded-b-3xl">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="text-white hover:bg-white/20"
          >
            <ChevronLeft className="w-6 h-6" />
          </Button>
          <h1 className="text-xl font-bold">Configuración</h1>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Account Section */}
        <div>
          <h2 className="text-sm font-semibold text-gray-500 mb-3 px-1">CUENTA</h2>
          <Card className="divide-y">
            <button
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
              onClick={() => navigate('/profile')}
            >
              <div className="flex items-center gap-3">
                <User className="w-5 h-5 text-gray-600" />
                <div className="text-left">
                  <div className="font-medium">Perfil</div>
                  <div className="text-xs text-gray-500">{user?.name}</div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </button>

            <button
              onClick={() => setIsChangePasswordDialogOpen(true)}
              disabled={isChangingPassword}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                {isChangingPassword ? (
                  <Loader2 className="w-5 h-5 text-gray-600 animate-spin" />
                ) : (
                  <Shield className="w-5 h-5 text-gray-600" />
                )}
                <span className="font-medium">
                  {isChangingPassword ? 'Cambiando contraseña...' : 'Cambiar Contraseña'}
                </span>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </button>
          </Card>
        </div>

        {/* Notifications Section */}
        <div>
          <h2 className="text-sm font-semibold text-gray-500 mb-3 px-1">NOTIFICACIONES</h2>
          <Card className="divide-y">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-gray-600" />
                <div>
                  <div className="font-medium">Recolecciones</div>
                  <div className="text-xs text-gray-500">Actualizaciones de tus recolecciones</div>
                </div>
              </div>
              <Switch
                checked={notifications.collections}
                onCheckedChange={(checked) =>
                  setNotifications({ ...notifications, collections: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-gray-600" />
                <div>
                  <div className="font-medium">Recompensas</div>
                  <div className="text-xs text-gray-500">Nuevas recompensas disponibles</div>
                </div>
              </div>
              <Switch
                checked={notifications.rewards}
                onCheckedChange={(checked) =>
                  setNotifications({ ...notifications, rewards: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-gray-600" />
                <div>
                  <div className="font-medium">Noticias</div>
                  <div className="text-xs text-gray-500">Novedades de EcolLantApp</div>
                </div>
              </div>
              <Switch
                checked={notifications.news}
                onCheckedChange={(checked) =>
                  setNotifications({ ...notifications, news: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-gray-600" />
                <div>
                  <div className="font-medium">Promociones</div>
                  <div className="text-xs text-gray-500">Ofertas y descuentos especiales</div>
                </div>
              </div>
              <Switch
                checked={notifications.marketing}
                onCheckedChange={(checked) =>
                  setNotifications({ ...notifications, marketing: checked })
                }
              />
            </div>
          </Card>
        </div>

        {/* Preferences Section */}
        <div>
          <h2 className="text-sm font-semibold text-gray-500 mb-3 px-1">PREFERENCIAS</h2>
          <Card className="divide-y">
            <button className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-3">
                <Globe className="w-5 h-5 text-gray-600" />
                <div className="text-left">
                  <div className="font-medium">Idioma</div>
                  <div className="text-xs text-gray-500">Español</div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </button>

            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Moon className="w-5 h-5 text-gray-600" />
                <div>
                  <div className="font-medium">Modo Oscuro</div>
                  <div className="text-xs text-gray-500">Próximamente disponible</div>
                </div>
              </div>
              <Switch disabled />
            </div>
          </Card>
        </div>

        {/* Support Section */}
        <div>
          <h2 className="text-sm font-semibold text-gray-500 mb-3 px-1">SOPORTE</h2>
          <Card className="divide-y">
            <button className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-3">
                <HelpCircle className="w-5 h-5 text-gray-600" />
                <span className="font-medium">Centro de Ayuda</span>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </button>

            <button className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-gray-600" />
                <span className="font-medium">Términos y Condiciones</span>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </button>

            <button className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-gray-600" />
                <span className="font-medium">Política de Privacidad</span>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </button>
          </Card>
        </div>

        {/* Actions Section */}
        <div>
          <h2 className="text-sm font-semibold text-gray-500 mb-3 px-1">ACCIONES</h2>
          <Card className="divide-y">
            <button
              onClick={() => setIsLogoutDialogOpen(true)}
              disabled={isLoggingOut}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                {isLoggingOut ? (
                  <Loader2 className="w-5 h-5 text-orange-600 animate-spin" />
                ) : (
                  <LogOut className="w-5 h-5 text-orange-600" />
                )}
                <span className="font-medium text-orange-600">
                  {isLoggingOut ? 'Cerrando sesión...' : 'Cerrar Sesión'}
                </span>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </button>

            <button
              onClick={() => setIsDeleteAccountDialogOpen(true)}
              disabled={isDeletingAccount}
              className="w-full flex items-center justify-between p-4 hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                {isDeletingAccount ? (
                  <Loader2 className="w-5 h-5 text-red-600 animate-spin" />
                ) : (
                  <Trash2 className="w-5 h-5 text-red-600" />
                )}
                <span className="font-medium text-red-600">
                  {isDeletingAccount ? 'Eliminando cuenta...' : 'Eliminar Cuenta'}
                </span>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </button>
          </Card>
        </div>

        {/* App Info */}
        <div className="text-center text-sm text-gray-500 space-y-1 pt-4">
          <p className="font-semibold text-green-600">EcolLantApp</p>
          <p>Versión 1.0.0</p>
          <p>© 2026 Todos los derechos reservados</p>
        </div>
      </div>

      <Dialog
        open={isLogoutDialogOpen}
        onOpenChange={(open) => {
          setIsLogoutDialogOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cerrar Sesión</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que quieres cerrar sesión?
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsLogoutDialogOpen(false)}
              disabled={isLoggingOut}
            >
              Cancelar
            </Button>
            <Button onClick={handleLogout} disabled={isLoggingOut}>
              {isLoggingOut ? 'Cerrando sesión...' : 'Cerrar sesión'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isChangePasswordDialogOpen}
        onOpenChange={(open) => {
          setIsChangePasswordDialogOpen(open);
          if (!open) {
            setCurrentPassword('');
            setNewPassword('');
            setConfirmNewPassword('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar Contraseña</DialogTitle>
            <DialogDescription>
              Ingresa tu contraseña actual y define una nueva contraseña.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="current-password">Contraseña actual</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={isChangingPassword}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="new-password">Nueva contraseña</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={isChangingPassword}
                minLength={6}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="confirm-new-password">Confirmar nueva contraseña</Label>
              <Input
                id="confirm-new-password"
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                disabled={isChangingPassword}
                minLength={6}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsChangePasswordDialogOpen(false)}
              disabled={isChangingPassword}
            >
              Cancelar
            </Button>
            <Button onClick={handleChangePassword} disabled={isChangingPassword}>
              {isChangingPassword ? 'Guardando...' : 'Actualizar contraseña'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isDeleteAccountDialogOpen}
        onOpenChange={(open) => {
          setIsDeleteAccountDialogOpen(open);
          if (!open) {
            setDeletePassword('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Eliminar Cuenta</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. Ingresa tu contraseña para confirmar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1">
            <Label htmlFor="delete-password">Contraseña actual</Label>
            <Input
              id="delete-password"
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              disabled={isDeletingAccount}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteAccountDialogOpen(false)}
              disabled={isDeletingAccount}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={isDeletingAccount}
            >
              {isDeletingAccount ? 'Eliminando...' : 'Eliminar cuenta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}