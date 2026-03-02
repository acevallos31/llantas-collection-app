import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import * as kv from "./kv_store.tsx";

const app = new Hono();

const generateQrCode = (userId: string, collectionId: string) => {
  return `ECOL-${userId.slice(0, 8).toUpperCase()}-${collectionId.slice(0, 8).toUpperCase()}`;
};

const createTraceEvent = (
  stage: string,
  actorType: string,
  note: string,
  metadata: Record<string, any> = {},
) => ({
  id: crypto.randomUUID(),
  stage,
  actorType,
  note,
  metadata,
  timestamp: new Date().toISOString(),
});

const normalizeDestinationType = (value?: string) => {
  if (!value) return 'acopio';
  const normalized = value.toLowerCase();
  if (normalized === 'recycling' || normalized === 'reciclaje') return 'reciclaje';
  if (normalized === 'coprocessing' || normalized === 'coprocesamiento') return 'coprocesamiento';
  return 'acopio';
};

const withPointStatus = (point: any) => {
  const currentLoad = Number(point.currentLoad || 0);
  const capacity = Number(point.capacity || 0);
  const availableCapacity = Math.max(capacity - currentLoad, 0);
  return {
    ...point,
    currentLoad,
    capacity,
    availableCapacity,
    occupancyRate: capacity > 0 ? Number(((currentLoad / capacity) * 100).toFixed(2)) : 0,
    isAvailable: availableCapacity > 0,
  };
};

// Supabase client helper
const getSupabaseClient = (serviceRole = false) => {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    serviceRole 
      ? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      : Deno.env.get("SUPABASE_ANON_KEY")!
  );
};

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check endpoint
app.get("/server/health", (c) => {
  return c.json({ status: "ok" });
});

// ==================== AUTH ROUTES ====================

// Sign up
app.post("/server/auth/signup", async (c) => {
  try {
    const { email, password, name, phone, type, address } = await c.req.json();
    
    const supabase = getSupabaseClient(true);
    
    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name, phone, type, address },
      // Automatically confirm the user's email since an email server hasn't been configured.
      email_confirm: true
    });
    
    if (authError) {
      console.log(`Auth error during signup: ${authError.message}`);
      return c.json({ error: authError.message }, 400);
    }
    
    // Create user profile in KV store
    const userId = authData.user.id;
    const userProfile = {
      id: userId,
      email,
      name,
      phone,
      type: type || 'generator',
      points: 0,
      level: 'Eco Novato',
      address: address || '',
      createdAt: new Date().toISOString()
    };
    
    await kv.set(`user:${userId}`, userProfile);
    
    // Initialize user stats
    await kv.set(`stats:${userId}`, {
      totalCollections: 0,
      totalTires: 0,
      totalPoints: 0,
      co2Saved: 0,
      treesEquivalent: 0,
      recycledWeight: 0
    });
    
    return c.json({ 
      user: userProfile,
      message: 'User created successfully'
    }, 201);
    
  } catch (error) {
    console.log(`Signup error: ${error}`);
    return c.json({ error: 'Error creating user' }, 500);
  }
});

// Sign in
app.post("/server/auth/signin", async (c) => {
  try {
    const { email, password } = await c.req.json();
    
    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (error) {
      console.log(`Auth error during signin: ${error.message}`);
      return c.json({ error: error.message }, 401);
    }
    
    // Get user profile from KV
    const userProfile = await kv.get(`user:${data.user.id}`);
    
    return c.json({ 
      session: data.session,
      user: userProfile
    });
    
  } catch (error) {
    console.log(`Signin error: ${error}`);
    return c.json({ error: 'Error signing in' }, 500);
  }
});

// Get session
app.get("/server/auth/session", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'No token provided' }, 401);
    }
    
    const supabase = getSupabaseClient(true);
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    
    if (error || !user) {
      return c.json({ error: 'Invalid token' }, 401);
    }
    
    // Get user profile from KV
    const userProfile = await kv.get(`user:${user.id}`);
    
    return c.json({ user: userProfile });
    
  } catch (error) {
    console.log(`Session error: ${error}`);
    return c.json({ error: 'Error getting session' }, 500);
  }
});

// Sign out
app.post("/server/auth/signout", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: 'No token provided' }, 401);
    }
    
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      return c.json({ error: error.message }, 400);
    }
    
    return c.json({ message: 'Signed out successfully' });
    
  } catch (error) {
    console.log(`Signout error: ${error}`);
    return c.json({ error: 'Error signing out' }, 500);
  }
});

// Change password
app.post("/server/auth/change-password", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];

    if (!accessToken) {
      return c.json({ error: 'No token provided' }, 401);
    }

    const { currentPassword, newPassword } = await c.req.json();

    if (!currentPassword || !newPassword) {
      return c.json({ error: 'Current password and new password are required' }, 400);
    }

    if (newPassword.length < 6) {
      return c.json({ error: 'New password must be at least 6 characters' }, 400);
    }

    const supabaseService = getSupabaseClient(true);
    const { data: { user }, error: userError } = await supabaseService.auth.getUser(accessToken);

    if (userError || !user?.id || !user.email) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const supabaseAnon = getSupabaseClient();
    const { error: signinError } = await supabaseAnon.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (signinError) {
      return c.json({ error: 'Current password is incorrect' }, 401);
    }

    const { error: updateError } = await supabaseService.auth.admin.updateUserById(user.id, {
      password: newPassword,
    });

    if (updateError) {
      return c.json({ error: updateError.message }, 400);
    }

    return c.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.log(`Change password error: ${error}`);
    return c.json({ error: 'Error changing password' }, 500);
  }
});

// Delete account
app.delete("/server/auth/delete-account", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];

    if (!accessToken) {
      return c.json({ error: 'No token provided' }, 401);
    }

    const { currentPassword } = await c.req.json();

    if (!currentPassword) {
      return c.json({ error: 'Current password is required' }, 400);
    }

    const supabaseService = getSupabaseClient(true);
    const { data: { user }, error: userError } = await supabaseService.auth.getUser(accessToken);

    if (userError || !user?.id || !user.email) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const supabaseAnon = getSupabaseClient();
    const { error: signinError } = await supabaseAnon.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (signinError) {
      return c.json({ error: 'Current password is incorrect' }, 401);
    }

    const collectionKeys = await kv.getKeysByPrefix(`collection:${user.id}:`);
    const redemptionKeys = await kv.getKeysByPrefix(`redemption:${user.id}:`);
    const keysToDelete = [...collectionKeys, ...redemptionKeys, `user:${user.id}`, `stats:${user.id}`];

    if (keysToDelete.length > 0) {
      await kv.mdel(keysToDelete);
    }

    const bucketName = 'make-b7bf90da-tire-photos';
    const { data: files, error: listError } = await supabaseService.storage
      .from(bucketName)
      .list(user.id, { limit: 1000 });

    if (!listError && files && files.length > 0) {
      const filePaths = files.map((file) => `${user.id}/${file.name}`);
      await supabaseService.storage.from(bucketName).remove(filePaths);
    }

    const { error: deleteError } = await supabaseService.auth.admin.deleteUser(user.id);

    if (deleteError) {
      return c.json({ error: deleteError.message }, 400);
    }

    return c.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.log(`Delete account error: ${error}`);
    return c.json({ error: 'Error deleting account' }, 500);
  }
});

// ==================== USER ROUTES ====================

// Get user profile
app.get("/server/users/:userId", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getSupabaseClient(true);
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const userId = c.req.param('userId');
    const userProfile = await kv.get(`user:${userId}`);
    
    if (!userProfile) {
      return c.json({ error: 'User not found' }, 404);
    }
    
    return c.json(userProfile);
    
  } catch (error) {
    console.log(`Get user error: ${error}`);
    return c.json({ error: 'Error getting user' }, 500);
  }
});

// Update user profile
app.put("/server/users/:userId", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getSupabaseClient(true);
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const userId = c.req.param('userId');
    
    // Verify user is updating their own profile
    if (user.id !== userId) {
      return c.json({ error: 'Forbidden' }, 403);
    }
    
    const updates = await c.req.json();
    const currentProfile = await kv.get(`user:${userId}`);
    
    if (!currentProfile) {
      return c.json({ error: 'User not found' }, 404);
    }
    
    const updatedProfile = {
      ...currentProfile,
      ...updates,
      id: userId, // Ensure ID doesn't change
    };
    
    await kv.set(`user:${userId}`, updatedProfile);
    
    return c.json(updatedProfile);
    
  } catch (error) {
    console.log(`Update user error: ${error}`);
    return c.json({ error: 'Error updating user' }, 500);
  }
});

// ==================== COLLECTION ROUTES ====================

// Get all collections for a user
app.get("/server/collections", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getSupabaseClient(true);
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    // Get all collections for this user
    const collections = await kv.getByPrefix(`collection:${user.id}:`);
    
    // Sort by date (most recent first)
    collections.sort((a: any, b: any) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    
    return c.json(collections);
    
  } catch (error) {
    console.log(`Get collections error: ${error}`);
    return c.json({ error: 'Error getting collections' }, 500);
  }
});

// Get a specific collection
app.get("/server/collections/:collectionId", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getSupabaseClient(true);
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const collectionId = c.req.param('collectionId');
    const collection = await kv.get(`collection:${user.id}:${collectionId}`);
    
    if (!collection) {
      return c.json({ error: 'Collection not found' }, 404);
    }
    
    return c.json(collection);
    
  } catch (error) {
    console.log(`Get collection error: ${error}`);
    return c.json({ error: 'Error getting collection' }, 500);
  }
});

// Create a new collection
app.post("/server/collections", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getSupabaseClient(true);
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const collectionData = await c.req.json();
    const collectionId = crypto.randomUUID();
    
    // Calculate points (30 points per tire)
    const points = collectionData.tireCount * 30;
    
    const qrCode = generateQrCode(user.id, collectionId);
    const collection = {
      id: collectionId,
      userId: user.id,
      ...collectionData,
      points,
      status: 'pending',
      createdAt: new Date().toISOString(),
      traceability: {
        qrCode,
        currentStage: 'registrada',
        events: [
          createTraceEvent(
            'registrada',
            'generator',
            'Lote registrado en EcolLantApp',
            { userId: user.id, tireCount: collectionData.tireCount },
          ),
        ],
      },
    };
    
    await kv.set(`collection:${user.id}:${collectionId}`, collection);
    
    return c.json(collection, 201);
    
  } catch (error) {
    console.log(`Create collection error: ${error}`);
    return c.json({ error: 'Error creating collection' }, 500);
  }
});

// Update a collection
app.put("/server/collections/:collectionId", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getSupabaseClient(true);
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const collectionId = c.req.param('collectionId');
    const updates = await c.req.json();
    
    const currentCollection = await kv.get(`collection:${user.id}:${collectionId}`);
    
    if (!currentCollection) {
      return c.json({ error: 'Collection not found' }, 404);
    }
    
    const updatedCollection = {
      ...currentCollection,
      ...updates,
      id: collectionId,
      userId: user.id,
    };

    const traceability = {
      qrCode: currentCollection?.traceability?.qrCode || generateQrCode(user.id, collectionId),
      currentStage: currentCollection?.traceability?.currentStage || 'registrada',
      events: currentCollection?.traceability?.events || [],
    };

    if (updates.status && updates.status !== currentCollection.status) {
      const nextStage = updates.status === 'completed' ? 'destino-final' : 'en-proceso';
      traceability.currentStage = nextStage;
      traceability.events.push(
        createTraceEvent(
          nextStage,
          'system',
          `Cambio de estado: ${currentCollection.status} -> ${updates.status}`,
          { status: updates.status },
        ),
      );
    }

    updatedCollection.traceability = traceability;
    
    // If collection is being completed, update user points and stats
    if (updates.status === 'completed' && currentCollection.status !== 'completed') {
      const userProfile = await kv.get(`user:${user.id}`);
      const stats = await kv.get(`stats:${user.id}`);
      
      if (userProfile && stats) {
        // Update user points
        userProfile.points += updatedCollection.points;
        
        // Update level based on points
        if (userProfile.points >= 1000) {
          userProfile.level = 'Eco Master';
        } else if (userProfile.points >= 500) {
          userProfile.level = 'Eco Champion';
        } else if (userProfile.points >= 200) {
          userProfile.level = 'Eco Warrior';
        } else if (userProfile.points >= 50) {
          userProfile.level = 'Eco Guardian';
        } else {
          userProfile.level = 'Eco Novato';
        }
        
        await kv.set(`user:${user.id}`, userProfile);
        
        // Update stats
        stats.totalCollections += 1;
        stats.totalTires += updatedCollection.tireCount;
        stats.totalPoints = userProfile.points;
        stats.co2Saved += updatedCollection.tireCount * 3.25; // kg per tire
        stats.treesEquivalent = Math.floor(stats.co2Saved / 20);
        stats.recycledWeight += updatedCollection.tireCount * 5; // kg per tire
        
        await kv.set(`stats:${user.id}`, stats);
      }
      
      const destinationType = normalizeDestinationType(updates.destinationType);
      const certificateId = `CERT-${collectionId.slice(0, 8).toUpperCase()}`;

      updatedCollection.completedDate = new Date().toISOString();
      updatedCollection.destinationType = destinationType;
      updatedCollection.complianceCertificate = {
        certificateId,
        qrCode: traceability.qrCode,
        destinationType,
        issuedAt: new Date().toISOString(),
      };

      traceability.currentStage = 'certificada';
      traceability.events.push(
        createTraceEvent(
          'certificada',
          'system',
          'Certificación digital emitida para disposición final',
          {
            certificateId,
            destinationType,
            qrCode: traceability.qrCode,
          },
        ),
      );

      await kv.set(`certificate:${collectionId}`, updatedCollection.complianceCertificate);
    }
    
    await kv.set(`collection:${user.id}:${collectionId}`, updatedCollection);
    
    return c.json(updatedCollection);
    
  } catch (error) {
    console.log(`Update collection error: ${error}`);
    return c.json({ error: 'Error updating collection' }, 500);
  }
});

// Get traceability report for a collection
app.get("/server/collections/:collectionId/trace", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getSupabaseClient(true);
    const { data: { user } } = await supabase.auth.getUser(accessToken);

    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const collectionId = c.req.param('collectionId');
    const collection = await kv.get(`collection:${user.id}:${collectionId}`);

    if (!collection) {
      return c.json({ error: 'Collection not found' }, 404);
    }

    return c.json({
      collectionId,
      qrCode: collection?.traceability?.qrCode,
      currentStage: collection?.traceability?.currentStage,
      events: collection?.traceability?.events || [],
      certificate: collection?.complianceCertificate || null,
    });
  } catch (error) {
    console.log(`Traceability report error: ${error}`);
    return c.json({ error: 'Error getting traceability report' }, 500);
  }
});

// Register kiosk delivery in collection center
app.post("/server/kiosk/deliveries", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getSupabaseClient(true);
    const { data: { user } } = await supabase.auth.getUser(accessToken);

    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const {
      pointId,
      tireCount,
      tireType,
      collectionId,
      generatorName,
      generatorDocument,
    } = await c.req.json();

    if (!pointId || !tireCount || Number(tireCount) <= 0) {
      return c.json({ error: 'pointId and tireCount are required' }, 400);
    }

    const point = await kv.get(`point:${pointId}`);
    if (!point) {
      return c.json({ error: 'Collection point not found' }, 404);
    }

    const nextLoad = Number(point.currentLoad || 0) + Number(tireCount);
    if (nextLoad > Number(point.capacity || 0)) {
      return c.json({
        error: 'Collection point at capacity',
        point: withPointStatus(point),
      }, 409);
    }

    point.currentLoad = nextLoad;
    await kv.set(`point:${pointId}`, point);

    const receiptId = crypto.randomUUID();
    const receipt = {
      id: receiptId,
      type: 'kiosk-delivery',
      createdAt: new Date().toISOString(),
      pointId,
      pointName: point.name,
      userId: user.id,
      tireCount: Number(tireCount),
      tireType: tireType || 'Mixto',
      generatorName: generatorName || null,
      generatorDocument: generatorDocument || null,
      collectionId: collectionId || null,
      digitalProof: `REC-${receiptId.slice(0, 8).toUpperCase()}`,
    };

    await kv.set(`receipt:${receiptId}`, receipt);

    if (collectionId) {
      const collection = await kv.get(`collection:${user.id}:${collectionId}`);
      if (collection) {
        const traceability = {
          qrCode: collection?.traceability?.qrCode || generateQrCode(user.id, collectionId),
          currentStage: 'acopiada',
          events: collection?.traceability?.events || [],
        };

        traceability.events.push(
          createTraceEvent(
            'acopiada',
            'kiosk',
            'Entrega registrada en kiosco digital',
            {
              pointId,
              pointName: point.name,
              receiptId,
              tireCount: Number(tireCount),
            },
          ),
        );

        collection.traceability = traceability;
        collection.kioskReceiptId = receiptId;
        collection.collectionPointId = pointId;
        await kv.set(`collection:${user.id}:${collectionId}`, collection);
      }
    }

    return c.json({
      message: 'Kiosk delivery registered successfully',
      receipt,
      point: withPointStatus(point),
    }, 201);
  } catch (error) {
    console.log(`Kiosk delivery error: ${error}`);
    return c.json({ error: 'Error registering kiosk delivery' }, 500);
  }
});

// ==================== COLLECTION POINTS ROUTES ====================

// Get all collection points
app.get("/server/points", async (c) => {
  try {
    const points = await kv.getByPrefix('point:');
    return c.json(points.map(withPointStatus));
  } catch (error) {
    console.log(`Get points error: ${error}`);
    return c.json({ error: 'Error getting collection points' }, 500);
  }
});

// Initialize collection points (seed data)
app.post("/server/points/seed", async (c) => {
  try {
    const mockPoints = [
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
    
    for (const point of mockPoints) {
      await kv.set(`point:${point.id}`, point);
    }
    
    return c.json({ message: 'Collection points seeded successfully', count: mockPoints.length });
  } catch (error) {
    console.log(`Seed points error: ${error}`);
    return c.json({ error: 'Error seeding collection points' }, 500);
  }
});

// ==================== REWARDS ROUTES ====================

// Get all rewards
app.get("/server/rewards", async (c) => {
  try {
    const rewards = await kv.getByPrefix('reward:');
    return c.json(rewards);
  } catch (error) {
    console.log(`Get rewards error: ${error}`);
    return c.json({ error: 'Error getting rewards' }, 500);
  }
});

// Initialize rewards (seed data)
app.post("/server/rewards/seed", async (c) => {
  try {
    const mockRewards = [
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
    
    for (const reward of mockRewards) {
      await kv.set(`reward:${reward.id}`, reward);
    }
    
    return c.json({ message: 'Rewards seeded successfully', count: mockRewards.length });
  } catch (error) {
    console.log(`Seed rewards error: ${error}`);
    return c.json({ error: 'Error seeding rewards' }, 500);
  }
});

// Redeem a reward
app.post("/server/rewards/:rewardId/redeem", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getSupabaseClient(true);
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const rewardId = c.req.param('rewardId');
    const reward = await kv.get(`reward:${rewardId}`);
    
    if (!reward) {
      return c.json({ error: 'Reward not found' }, 404);
    }
    
    if (!reward.available) {
      return c.json({ error: 'Reward not available' }, 400);
    }
    
    const userProfile = await kv.get(`user:${user.id}`);
    
    if (!userProfile) {
      return c.json({ error: 'User not found' }, 404);
    }
    
    if (userProfile.points < reward.pointsCost) {
      return c.json({ error: 'Insufficient points' }, 400);
    }
    
    // Deduct points
    userProfile.points -= reward.pointsCost;
    await kv.set(`user:${user.id}`, userProfile);
    
    // Create redemption record
    const redemptionId = crypto.randomUUID();
    const redemption = {
      id: redemptionId,
      userId: user.id,
      rewardId,
      rewardTitle: reward.title,
      pointsSpent: reward.pointsCost,
      redeemedAt: new Date().toISOString(),
    };
    
    await kv.set(`redemption:${user.id}:${redemptionId}`, redemption);
    
    return c.json({ 
      redemption,
      newPointsBalance: userProfile.points 
    });
    
  } catch (error) {
    console.log(`Redeem reward error: ${error}`);
    return c.json({ error: 'Error redeeming reward' }, 500);
  }
});

// ==================== STATS ROUTES ====================

// Get user stats
app.get("/server/stats/:userId", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getSupabaseClient(true);
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const userId = c.req.param('userId');
    const stats = await kv.get(`stats:${userId}`);
    
    if (!stats) {
      return c.json({ error: 'Stats not found' }, 404);
    }
    
    return c.json(stats);
    
  } catch (error) {
    console.log(`Get stats error: ${error}`);
    return c.json({ error: 'Error getting stats' }, 500);
  }
});

// ==================== STORAGE ROUTES ====================

// Initialize storage bucket
const initStorage = async () => {
  try {
    const supabase = getSupabaseClient(true);
    const bucketName = 'make-b7bf90da-tire-photos';
    
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(bucket => bucket.name === bucketName);
    
    if (!bucketExists) {
      await supabase.storage.createBucket(bucketName, {
        public: false,
        fileSizeLimit: 5242880, // 5MB limit to stay in free tier
      });
      console.log(`Storage bucket ${bucketName} created`);
    }
  } catch (error) {
    console.log(`Storage init error: ${error}`);
  }
};

// Upload photo
app.post("/server/upload", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getSupabaseClient(true);
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const formData = await c.req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return c.json({ error: 'No file provided' }, 400);
    }
    
    const fileName = `${user.id}/${crypto.randomUUID()}-${file.name}`;
    const bucketName = 'make-b7bf90da-tire-photos';
    
    // Upload file
    const { data, error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(fileName, file);
    
    if (uploadError) {
      console.log(`Upload error: ${uploadError.message}`);
      return c.json({ error: uploadError.message }, 500);
    }
    
    // Get signed URL (valid for 1 year)
    const { data: urlData } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(fileName, 31536000);
    
    return c.json({ 
      path: data.path,
      url: urlData?.signedUrl 
    });
    
  } catch (error) {
    console.log(`Upload error: ${error}`);
    return c.json({ error: 'Error uploading file' }, 500);
  }
});

// Initialize storage on startup
initStorage();

Deno.serve(app.fetch);