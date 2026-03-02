import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { collectionsAPI, uploadAPI } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Card } from '../components/ui/card';
import { 
  ChevronLeft, 
  Camera, 
  MapPin, 
  Calendar,
  Package,
  Plus,
  X,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';

export default function NewCollectionPage() {
  const navigate = useNavigate();
  const { refreshUser, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  const [tireCount, setTireCount] = useState(1);
  const [selectedType, setSelectedType] = useState('Automóvil');
  const [address, setAddress] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);

  if (user?.type === 'collector') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-6 text-center space-y-4">
          <Package className="w-10 h-10 mx-auto text-green-600" />
          <h2 className="text-xl font-bold">Acción no disponible</h2>
          <p className="text-gray-600 text-sm">
            Las cuentas recolectoras no pueden crear solicitudes de recolección.
          </p>
          <Button onClick={() => navigate('/home')} className="w-full bg-green-600 hover:bg-green-700">
            Volver al inicio
          </Button>
        </Card>
      </div>
    );
  }

  const tireTypes = [
    'Automóvil',
    'Motocicleta',
    'Camión',
    'Bicicleta',
    'Tractomula',
    'Otro'
  ];

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      setUploading(true);
      const file = files[0];
      
      const result = await uploadAPI.uploadPhoto(file);
      setPhotos([...photos, result.url]);
      
      toast.success('Foto subida exitosamente');
    } catch (error: any) {
      console.error('Error uploading photo:', error);
      toast.error(error.message || 'Error al subir foto');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!address) {
      toast.error('Por favor ingresa una dirección');
      return;
    }

    if (!scheduledDate) {
      toast.error('Por favor selecciona una fecha');
      return;
    }

    try {
      setLoading(true);
      
      // Create collection
      await collectionsAPI.create({
        tireCount,
        tireType: selectedType,
        address,
        coordinates: { lat: 4.6097, lng: -74.0817 }, // Default Bogotá coordinates
        scheduledDate,
        description: description || undefined,
        photos: photos.length > 0 ? photos : undefined,
      });

      const pointsEarned = tireCount * 30;
      
      toast.success('¡Recolección registrada exitosamente!', {
        description: `Se han asignado ${pointsEarned} puntos a tu cuenta`
      });

      // Refresh user to update points
      await refreshUser();

      setTimeout(() => navigate('/home'), 1500);
    } catch (error: any) {
      console.error('Error creating collection:', error);
      toast.error(error.message || 'Error al registrar recolección');
    } finally {
      setLoading(false);
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
          <h1 className="text-xl font-bold">Nueva Recolección</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-6">
        {/* Tire Type */}
        <Card className="p-6">
          <Label className="text-base font-semibold mb-3 block">
            Tipo de Llanta
          </Label>
          <div className="grid grid-cols-2 gap-3">
            {tireTypes.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setSelectedType(type)}
                className={`p-4 rounded-lg border-2 text-sm font-medium transition-all ${
                  selectedType === type
                    ? 'border-green-600 bg-green-50 text-green-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </Card>

        {/* Tire Count */}
        <Card className="p-6">
          <Label className="text-base font-semibold mb-3 block">
            Cantidad de Llantas
          </Label>
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setTireCount(Math.max(1, tireCount - 1))}
              className="h-12 w-12"
            >
              -
            </Button>
            <div className="text-center">
              <div className="text-4xl font-bold text-green-600">{tireCount}</div>
              <div className="text-sm text-gray-600">llantas</div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setTireCount(tireCount + 1)}
              className="h-12 w-12"
            >
              +
            </Button>
          </div>
          <div className="mt-4 p-3 bg-green-50 rounded-lg text-center">
            <p className="text-sm text-green-800">
              Puntos a ganar: <span className="font-bold">{tireCount * 30}</span>
            </p>
          </div>
        </Card>

        {/* Address */}
        <Card className="p-6">
          <Label htmlFor="address" className="text-base font-semibold mb-3 block">
            Dirección de Recolección
          </Label>
          <div className="relative mb-3">
            <MapPin className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <Input
              id="address"
              placeholder="Calle 45 #23-10, Bogotá"
              className="pl-10 h-12"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
            />
          </div>
          <Button 
            type="button" 
            variant="outline" 
            size="sm" 
            className="w-full"
            onClick={() => {
              if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                  (position) => {
                    toast.success('Ubicación obtenida');
                    // In a real app, you would reverse geocode these coordinates
                    setAddress(`Lat: ${position.coords.latitude.toFixed(4)}, Lng: ${position.coords.longitude.toFixed(4)}`);
                  },
                  (error) => {
                    toast.error('No se pudo obtener la ubicación');
                  }
                );
              } else {
                toast.error('Geolocalización no soportada');
              }
            }}
          >
            <MapPin className="w-4 h-4 mr-2" />
            Usar mi ubicación actual
          </Button>
        </Card>

        {/* Date */}
        <Card className="p-6">
          <Label htmlFor="date" className="text-base font-semibold mb-3 block">
            Fecha Preferida de Recolección
          </Label>
          <div className="relative">
            <Calendar className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <Input
              id="date"
              type="date"
              className="pl-10 h-12"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              required
            />
          </div>
        </Card>

        {/* Photos */}
        <Card className="p-6">
          <Label className="text-base font-semibold mb-3 block">
            Fotos de las Llantas (Opcional)
          </Label>
          <div className="grid grid-cols-3 gap-3">
            {photos.map((photo, index) => (
              <div key={index} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
                <img src={photo} alt={`Foto ${index + 1}`} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotos(photos.filter((_, i) => i !== index))}
                  className="absolute top-1 right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            ))}
            {photos.length < 6 && (
              <label className="aspect-square rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-2 hover:border-green-600 hover:bg-green-50 transition-colors cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoUpload}
                  disabled={uploading}
                />
                {uploading ? (
                  <Loader2 className="w-6 h-6 text-green-600 animate-spin" />
                ) : (
                  <>
                    <Camera className="w-6 h-6 text-gray-400" />
                    <span className="text-xs text-gray-600">Agregar</span>
                  </>
                )}
              </label>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Las fotos ayudan a validar tu recolección más rápido
          </p>
        </Card>

        {/* Description */}
        <Card className="p-6">
          <Label htmlFor="description" className="text-base font-semibold mb-3 block">
            Descripción Adicional (Opcional)
          </Label>
          <Textarea
            id="description"
            placeholder="Ej: Llantas en buen estado, sin aros, ubicadas en el garaje..."
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Card>

        {/* Submit */}
        <div className="space-y-3">
          <Button 
            type="submit" 
            className="w-full h-12 bg-green-600 hover:bg-green-700 text-base"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Registrando...
              </>
            ) : (
              <>
                <Package className="w-5 h-5 mr-2" />
                Registrar Recolección
              </>
            )}
          </Button>
          <Button 
            type="button" 
            variant="outline" 
            className="w-full h-12 text-base"
            onClick={() => navigate(-1)}
            disabled={loading}
          >
            Cancelar
          </Button>
        </div>

        {/* Info */}
        <Card className="p-4 bg-blue-50 border-blue-200">
          <p className="text-sm text-blue-800">
            ℹ️ <strong>Importante:</strong> Un recolector se pondrá en contacto contigo dentro de las próximas 24-48 horas para coordinar la recolección.
          </p>
        </Card>
      </form>
    </div>
  );
}