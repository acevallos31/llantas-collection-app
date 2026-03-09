import { useRouteError, isRouteErrorResponse, useNavigate } from 'react-router';
import { useEffect } from 'react';
import { Button } from './ui/button.js';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';

export function ErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();

  useEffect(() => {
    // Log error for debugging
    console.error('Route error:', error);
  }, [error]);

  const handleGoHome = () => {
    // Clear any stale session data
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/';
  };

  const handleReload = () => {
    window.location.reload();
  };

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      return (
        <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="w-10 h-10 text-blue-600" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2">404</h1>
              <h2 className="text-xl font-semibold text-gray-700 mb-2">Página No Encontrada</h2>
              <p className="text-gray-600">
                La página que buscas no existe o fue movida.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={handleGoHome} className="gap-2">
                <Home className="w-4 h-4" />
                Ir al Inicio
              </Button>
              <Button onClick={handleReload} variant="outline" className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Recargar Página
              </Button>
            </div>
          </div>
        </div>
      );
    }

    if (error.status === 401 || error.status === 403) {
      return (
        <div className="min-h-screen bg-gradient-to-b from-red-50 to-white flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="w-10 h-10 text-red-600" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2">Sesión Expirada</h1>
              <h2 className="text-xl font-semibold text-gray-700 mb-2">Acceso No Autorizado</h2>
              <p className="text-gray-600">
                Tu sesión ha expirado. Por favor, inicia sesión nuevamente.
              </p>
            </div>
            <Button onClick={handleGoHome} className="gap-2">
              <Home className="w-4 h-4" />
              Iniciar Sesión
            </Button>
          </div>
        </div>
      );
    }
  }

  // Generic error fallback
  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto">
          <AlertTriangle className="w-10 h-10 text-orange-600" />
        </div>
        <div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">¡Oops!</h1>
          <h2 className="text-xl font-semibold text-gray-700 mb-2">Algo salió mal</h2>
          <p className="text-gray-600 mb-4">
            Ocurrió un error inesperado. Intenta recargar la página o volver al inicio.
          </p>
          {error instanceof Error && (
            <details className="text-left bg-gray-50 border border-gray-200 rounded p-4 text-sm text-gray-700">
              <summary className="cursor-pointer font-medium mb-2">Detalles técnicos</summary>
              <pre className="whitespace-pre-wrap break-words">
                {error.message}
              </pre>
            </details>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={handleGoHome} className="gap-2">
            <Home className="w-4 h-4" />
            Ir al Inicio
          </Button>
          <Button onClick={handleReload} variant="outline" className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Recargar Página
          </Button>
        </div>
      </div>
    </div>
  );
}
