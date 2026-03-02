// Mock data para EcolLantApp

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  type: 'generator' | 'collector';
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
  status: 'pending' | 'in-progress' | 'completed' | 'cancelled';
  address: string;
  coordinates: { lat: number; lng: number };
  scheduledDate?: string;
  completedDate?: string;
  photos?: string[];
  points: number;
  description?: string;
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

export const mockUser: User = {
  id: '1',
  name: 'Juan Pérez',
  email: 'juan.perez@example.com',
  phone: '+57 300 123 4567',
  type: 'generator',
  points: 450,
  level: 'Eco Warrior',
  address: 'Calle 45 #23-10, Bogotá',
};

export const mockCollections: Collection[] = [
  {
    id: '1',
    userId: '1',
    tireCount: 4,
    tireType: 'Automóvil',
    status: 'completed',
    address: 'Calle 45 #23-10, Bogotá',
    coordinates: { lat: 4.6533, lng: -74.0836 },
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
    address: 'Carrera 15 #32-40, Bogotá',
    coordinates: { lat: 4.6497, lng: -74.0628 },
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
    address: 'Avenida 68 #75-80, Bogotá',
    coordinates: { lat: 4.6976, lng: -74.0708 },
    scheduledDate: '2026-03-05',
    points: 240,
    description: 'Llantas de camión de carga',
  },
];

export const mockCollectionPoints: CollectionPoint[] = [
  {
    id: '1',
    name: 'Centro de Acopio Norte',
    address: 'Calle 170 #15-20, Bogotá',
    coordinates: { lat: 4.7534, lng: -74.0426 },
    capacity: 1000,
    currentLoad: 650,
    acceptedTypes: ['Automóvil', 'Motocicleta', 'Camión', 'Bicicleta'],
    hours: 'Lun-Sab: 8:00 AM - 6:00 PM',
    phone: '+57 601 234 5678',
  },
  {
    id: '2',
    name: 'Centro de Acopio Sur',
    address: 'Autopista Sur #45-67, Bogotá',
    coordinates: { lat: 4.5709, lng: -74.1274 },
    capacity: 800,
    currentLoad: 420,
    acceptedTypes: ['Automóvil', 'Motocicleta', 'Camión'],
    hours: 'Lun-Vie: 7:00 AM - 5:00 PM',
    phone: '+57 601 345 6789',
  },
  {
    id: '3',
    name: 'Punto Verde Chapinero',
    address: 'Carrera 13 #53-40, Bogotá',
    coordinates: { lat: 4.6485, lng: -74.0625 },
    capacity: 500,
    currentLoad: 180,
    acceptedTypes: ['Automóvil', 'Motocicleta', 'Bicicleta'],
    hours: 'Lun-Sab: 9:00 AM - 7:00 PM',
    phone: '+57 601 456 7890',
  },
  {
    id: '4',
    name: 'EcoLlantas Suba',
    address: 'Calle 145 #91-19, Bogotá',
    coordinates: { lat: 4.7355, lng: -74.0909 },
    capacity: 600,
    currentLoad: 380,
    acceptedTypes: ['Automóvil', 'Motocicleta', 'Camión'],
    hours: 'Lun-Vie: 8:00 AM - 6:00 PM, Sáb: 9:00 AM - 2:00 PM',
    phone: '+57 601 567 8901',
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
