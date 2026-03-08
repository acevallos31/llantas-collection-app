import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { collectionsAPI, uploadAPI } from '../services/api';
import type { CollectionItem } from '../mockData';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Card } from '../components/ui/card';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group';
import { 
  ChevronLeft, 
  Camera, 
  MapPin, 
  Calendar,
  Package,
  Plus,
  X,
  Loader2,
  Coins,
  Banknote
} from 'lucide-react';
import { toast } from 'sonner';

export default function NewCollectionPage() {
  const navigate = useNavigate();
  const { refreshUser, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  const [collectionItems, setCollectionItems] = useState<CollectionItem[]>([
    { tireType: 'Automóvil', tireCondition: 'regular', tireCount: 1 },
  ]);
  const [address, setAddress] = useState('');
  const [coordinates, setCoordinates] = useState({ lat: 15.5042, lng: -88.0250 });
  const [scheduledDate, setScheduledDate] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [paymentPreference, setPaymentPreference] = useState<'points' | 'cash'>('points');

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
    'Autobus',
    'Otro'
  ];

  const tireConditions: Array<CollectionItem['tireCondition']> = [
    'excelente',
    'buena',
    'regular',
    'desgastada',
  ];

  const totalTireCount = collectionItems.reduce((sum, item) => sum + item.tireCount, 0);

  const updateItem = (index: number, updates: Partial<CollectionItem>) => {
    setCollectionItems((prev) => prev.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      return {
        ...item,
        ...updates,
        tireCount: Math.max(1, Number(updates.tireCount ?? item.tireCount) || 1),
      };
    }));
  };

  const addItem = () => {
    setCollectionItems((prev) => [
      ...prev,
      { tireType: 'Automóvil', tireCondition: 'regular', tireCount: 1 },
    ]);
  };

  const removeItem = (index: number) => {
    setCollectionItems((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((_, itemIndex) => itemIndex !== index);
    });
  };

  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=es`,
      );

      if (!response.ok) {
        return null;
      }

      const result = await response.json();
      return result.display_name as string | undefined;
    } catch {
      return null;
    }
  };

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
      
      if (totalTireCount <= 0) {
        toast.error('Debes agregar al menos una llanta');
        return;
      }

      const payloadItems = collectionItems.map((item) => ({
        tireType: item.tireType,
        tireCondition: item.tireCondition,
        tireCount: item.tireCount,
      }));

      const summaryType = payloadItems.length === 1
        ? payloadItems[0].tireType
        : 'Mixto';

      // Create collection
      await collectionsAPI.create({
        tireCount: totalTireCount,
        tireType: summaryType,
        collectionItems: payloadItems,
        address,
        coordinates,
        scheduledDate,
        description: description || undefined,
        photos: photos.length > 0 ? photos : undefined,
        paymentPreference,
      });

      const pointsEarned = totalTireCount * 30;
      
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
        {/* Tire Items */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-3">
            <Label className="text-base font-semibold block">Llantas a Recoger</Label>
            <Button type="button" variant="outline" size="sm" onClick={addItem}>
              <Plus className="w-4 h-4 mr-1" /> Agregar item
            </Button>
          </div>

          <div className="space-y-4">
            {collectionItems.map((item, index) => (
              <div key={`item-${index}`} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-700">Item {index + 1}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeItem(index)}
                    disabled={collectionItems.length === 1}
                    className="h-8 w-8 text-red-500 hover:text-red-700"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {tireTypes.map((type) => (
                    <button
                      key={`${index}-${type}`}
                      type="button"
                      onClick={() => updateItem(index, { tireType: type })}
                      className={`p-3 rounded-lg border-2 text-sm font-medium transition-all ${
                        item.tireType === type
                          ? 'border-green-600 bg-green-50 text-green-700'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>

                <div>
                  <Label className="text-sm text-gray-600 mb-2 block">Estado</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {tireConditions.map((condition) => (
                      <button
                        key={`${index}-${condition}`}
                        type="button"
                        onClick={() => updateItem(index, { tireCondition: condition })}
                        className={`p-2 rounded-lg border text-xs font-medium capitalize transition-all ${
                          item.tireCondition === condition
                            ? 'border-green-600 bg-green-50 text-green-700'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {condition}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-sm text-gray-600">Cantidad</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => updateItem(index, { tireCount: Math.max(1, item.tireCount - 1) })}
                    >
                      -
                    </Button>
                    <span className="min-w-10 text-center font-bold text-green-700">{item.tireCount}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => updateItem(index, { tireCount: item.tireCount + 1 })}
                    >
                      +
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 bg-green-50 rounded-lg text-center">
            <p className="text-sm text-green-800">
              Total de llantas: <span className="font-bold">{totalTireCount}</span> · Puntos base por recolección: <span className="font-bold">{totalTireCount * 30}</span>
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
              placeholder="Colonia Universidad, San Pedro Sula"
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
                  async (position) => {
                    toast.success('Ubicación obtenida');
                    const currentCoordinates = {
                      lat: Number(position.coords.latitude.toFixed(6)),
                      lng: Number(position.coords.longitude.toFixed(6)),
                    };
                    setCoordinates(currentCoordinates);

                    const reverseAddress = await reverseGeocode(
                      currentCoordinates.lat,
                      currentCoordinates.lng,
                    );

                    setAddress(
                      reverseAddress || `Lat: ${currentCoordinates.lat.toFixed(4)}, Lng: ${currentCoordinates.lng.toFixed(4)}`,
                    );
                  },
                  () => {
                    toast.error('No se pudo obtener la ubicación');
                  },
                  { timeout: 10000 },
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
          <p className="text-xs text-gray-500 mt-1">
            Coordenadas actuales: {coordinates.lat.toFixed(4)}, {coordinates.lng.toFixed(4)}
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

        {/* Payment Preference */}
        <Card className="p-6">
          <Label className="text-base font-semibold mb-3 block">
            Preferencia de Pago
          </Label>
          <RadioGroup value={paymentPreference} onValueChange={(value: 'points' | 'cash') => setPaymentPreference(value)} className="space-y-3">
            <div className="flex items-start space-x-3 p-4 border-2 rounded-lg hover:border-green-600 transition-colors cursor-pointer" onClick={() => setPaymentPreference('points')}>
              <RadioGroupItem value="points" id="points" />
              <div className="flex-1">
                <Label htmlFor="points" className="font-semibold flex items-center gap-2 cursor-pointer">
                  <Coins className="w-5 h-5 text-green-600" />
                  Puntos en la Plataforma
                </Label>
                <p className="text-sm text-gray-600 mt-1">
                  Recibe <span className="font-bold text-green-600">{totalTireCount * 100} puntos</span> que puedes canjear por recompensas
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3 p-4 border-2 rounded-lg hover:border-green-600 transition-colors cursor-pointer" onClick={() => setPaymentPreference('cash')}>
              <RadioGroupItem value="cash" id="cash" />
              <div className="flex-1">
                <Label htmlFor="cash" className="font-semibold flex items-center gap-2 cursor-pointer">
                  <Banknote className="w-5 h-5 text-green-600" />
                  Pago en Efectivo
                </Label>
                <p className="text-sm text-gray-600 mt-1">
                  Recibe <span className="font-bold text-green-600">L {(totalTireCount * 5).toFixed(2)}</span> en efectivo + <span className="font-bold">{totalTireCount * 5} puntos</span> adicionales
                </p>
              </div>
            </div>
          </RadioGroup>
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