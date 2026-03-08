// Mock data para EcolLantApp

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  type: 'generator' | 'collector' | 'admin';
  points: number;
  level: string;
  avatar?: string;
  address?: string;
}

export interface Collection {
  id: string;
  userId: string;
  tireCount: number;
  tireType: string;
  tireCondition?: string;
  collectionItems?: CollectionItem[];
  status: 'available' | 'pending' | 'in-progress' | 'completed' | 'cancelled';
  address: string;
  coordinates: { lat: number; lng: number };
  scheduledDate?: string;
  completedDate?: string;
  photos?: string[];
  points: number;
  description?: string;
  collectorId?: string | null;
  collectorName?: string | null;
  // Campos de pago
  pickupLat?: number;
  pickupLng?: number;
  deliveryLat?: number;
  deliveryLng?: number;
  distanceKm?: number;
  generatorPaymentPreference?: 'points' | 'cash';
  collectorPaymentPreference?: 'points' | 'cash_points';
  collectorPaymentAmount?: number;
  collectorBonusPoints?: number;
  generatorPaymentAmount?: number;
}

export interface CollectionItem {
  tireType: string;
  tireCondition: 'excelente' | 'buena' | 'regular' | 'desgastada';
  tireCount: number;
}

export interface CollectionPoint {
  id: string;
  name: string;
  address: string;
  coordinates: { lat: number; lng: number };
  capacity: number;
  currentLoad: number;
  acceptedTypes: string[];
  hours: string;
  phone: string;
}

export interface Reward {
  id: string;
  title: string;
  description: string;
  pointsCost: number;
  category: string;
  imageUrl?: string;
  available: boolean;
}

export interface PaymentSettings {
  id: number;
  paymentPerKm: number;
  minPaymentAmount: number;
  minCollectorPoints: number;
  pointsPerTire: number;
  cashPaymentPerTire: number;
  minGeneratorPointsOnCash: number;
  currency: string;
  updatedAt: string;
}

export interface CollectorTireRate {
  id: string;
  tireType: 'Automóvil' | 'Motocicleta' | 'Camión' | 'Bicicleta' | 'Autobús' | 'Otro';
  tireCondition: 'excelente' | 'buena' | 'regular' | 'desgastada';
  baseRatePerKm: number;
  minPayment: number;
  bonusPoints: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GeneratorTireRate {
  id: string;
  tireType: 'Automóvil' | 'Motocicleta' | 'Camión' | 'Bicicleta' | 'Autobús' | 'Otro';
  tireCondition: 'excelente' | 'buena' | 'regular' | 'desgastada';
  pointsPerTire: number;
  cashPerTire: number;
  minPointsOnCash: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CollectorPayment {
  id: string;
  collectionId: string;
  collectorId: string;
  pickupLat: number;
  pickupLng: number;
  deliveryLat: number;
  deliveryLng: number;
  distanceKm: number;
  tireType?: string;
  tireCondition?: string;
  paymentAmount: number;
  pointsAwarded: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  paymentMethod?: 'bank_transfer' | 'cash' | 'digital_wallet';
  paymentReference?: string;
  createdAt: string;
  processedAt?: string;
  processedBy?: string;
  notes?: string;
}

export interface GeneratorPayment {
  id: string;
  collectionId: string;
  generatorId: string;
  paymentPreference: 'points' | 'cash';
  tireCount: number;
  tireCondition?: string;
  cashAmount: number;
  pointsAwarded: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  paymentMethod?: 'bank_transfer' | 'cash' | 'digital_wallet' | 'points';
  paymentReference?: string;
  createdAt: string;
  processedAt?: string;
  processedBy?: string;
  notes?: string;
}

export const mockUser: User = {
  id: '1',
  name: 'Juan Pérez',
  email: 'juan.perez@example.com',
  phone: '+504 9988-1122',
  type: 'generator',
  points: 450,
  level: 'Eco Warrior',
  address: 'Colonia Trejo, San Pedro Sula',
};

export const mockCollections: Collection[] = [
  {
    id: '1',
    userId: '1',
    tireCount: 4,
    tireType: 'Automóvil',
    status: 'completed',
    address: 'Boulevard del Norte, San Pedro Sula',
    coordinates: { lat: 15.5209, lng: -88.0422 },
    scheduledDate: '2026-02-20',
    completedDate: '2026-02-20',
    points: 120,
    description: 'Llantas de vehículo familiar',
  },
  {
    id: '2',
    userId: '1',
    tireCount: 2,
    tireType: 'Motocicleta',
    status: 'in-progress',
    address: 'Colonia Universidad, San Pedro Sula',
    coordinates: { lat: 15.5012, lng: -88.0381 },
    scheduledDate: '2026-02-28',
    points: 60,
    description: 'Llantas de moto 150cc',
  },
  {
    id: '3',
    userId: '1',
    tireCount: 8,
    tireType: 'Camión',
    status: 'pending',
    address: 'Colonia Satelite, San Pedro Sula',
    coordinates: { lat: 15.4928, lng: -88.0125 },
    scheduledDate: '2026-03-05',
    points: 240,
    description: 'Llantas de camión de carga',
  },
];

export const mockCollectionPoints: CollectionPoint[] = [
  {
    id: '1',
    name: 'Centro de Acopio Norte',
    address: 'Boulevard del Este, San Pedro Sula',
    coordinates: { lat: 15.5123, lng: -88.0018 },
    capacity: 1000,
    currentLoad: 650,
    acceptedTypes: ['Automóvil', 'Motocicleta', 'Camión', 'Bicicleta'],
    hours: 'Lun-Sab: 8:00 AM - 6:00 PM',
    phone: '+504 2550-1200',
  },
  {
    id: '2',
    name: 'Centro de Acopio Sur',
    address: 'Salida a Choloma, San Pedro Sula',
    coordinates: { lat: 15.4308, lng: -88.0362 },
    capacity: 800,
    currentLoad: 420,
    acceptedTypes: ['Automóvil', 'Motocicleta', 'Camión'],
    hours: 'Lun-Vie: 7:00 AM - 5:00 PM',
    phone: '+504 2550-1300',
  },
  {
    id: '3',
    name: 'Punto Verde Rivera Hernandez',
    address: 'Colonia Moderna, San Pedro Sula',
    coordinates: { lat: 15.5065, lng: -88.0248 },
    capacity: 500,
    currentLoad: 180,
    acceptedTypes: ['Automóvil', 'Motocicleta', 'Bicicleta'],
    hours: 'Lun-Sab: 9:00 AM - 7:00 PM',
    phone: '+504 2550-1400',
  },
  {
    id: '4',
    name: 'EcoLlantas Cofradia',
    address: 'Colonia Figueroa, San Pedro Sula',
    coordinates: { lat: 15.4986, lng: -88.0327 },
    capacity: 600,
    currentLoad: 380,
    acceptedTypes: ['Automóvil', 'Motocicleta', 'Camión'],
    hours: 'Lun-Vie: 8:00 AM - 6:00 PM, Sáb: 9:00 AM - 2:00 PM',
    phone: '+504 2550-1500',
  },
];

export const mockRewards: Reward[] = [
  {
    id: '1',
    title: 'Descuento 20% Lavado de Auto',
    description: 'Obtén un 20% de descuento en el lavado completo de tu vehículo',
    pointsCost: 100,
    category: 'Descuentos',
    available: true,
  },
  {
    id: '2',
    title: 'Kit de Herramientas para Auto',
    description: 'Kit básico de herramientas para mantenimiento vehicular',
    pointsCost: 500,
    category: 'Productos',
    available: true,
  },
  {
    id: '3',
    title: 'Cambio de Aceite Gratis',
    description: 'Cambio de aceite completo sin costo en talleres afiliados',
    pointsCost: 300,
    category: 'Servicios',
    available: true,
  },
  {
    id: '4',
    title: 'Revisión Técnico-Mecánica',
    description: 'Revisión completa de tu vehículo con descuento del 50%',
    pointsCost: 400,
    category: 'Servicios',
    available: false,
  },
  {
    id: '5',
    title: 'Bolsa Ecológica EcoLlant',
    description: 'Bolsa reutilizable oficial de EcolLantApp',
    pointsCost: 50,
    category: 'Merchandising',
    available: true,
  },
  {
    id: '6',
    title: 'Donación a Reforestación',
    description: 'Convierte tus puntos en árboles plantados',
    pointsCost: 200,
    category: 'Impacto Social',
    available: true,
  },
];

export const mockStats = {
  totalCollections: 15,
  totalTires: 48,
  totalPoints: 450,
  co2Saved: 156, // kg
  treesEquivalent: 8,
  recycledWeight: 240, // kg
};
