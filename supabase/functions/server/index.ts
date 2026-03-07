import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import * as kv from "./kv_store.tsx";

const app = new Hono();
const ADMIN_EMAIL = 'admin@ecollant.com';
const ADMIN_DEFAULT_PASSWORD = 'AdminEcolLant2026!';

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

const findCollectionById = async (collectionId: string) => {
  const collections = await kv.getByPrefix('collection:');
  return collections.find((item: any) => item.id === collectionId) || null;
};

const findCollectionKeyById = async (collectionId: string) => {
  const keys = await kv.getKeysByPrefix('collection:');
  for (const key of keys) {
    const value = await kv.get(key);
    if (value?.id === collectionId) {
      return { key, value };
    }
  }
  return null;
};

const ensureAdminUser = async () => {
  try {
    const supabase = getSupabaseClient(true);
    const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (usersError) {
      console.log(`Admin bootstrap listUsers error: ${usersError.message}`);
      return;
    }

    const existing = usersData?.users?.find(
      (item) => item.email?.toLowerCase() === ADMIN_EMAIL,
    );

    let adminUserId = existing?.id;

    if (!adminUserId) {
      const { data: createdData, error: createError } = await supabase.auth.admin.createUser({
        email: ADMIN_EMAIL,
        password: ADMIN_DEFAULT_PASSWORD,
        email_confirm: true,
        user_metadata: {
          name: 'Administrador EcolLant',
          type: 'admin',
        },
      });

      if (createError || !createdData?.user?.id) {
        console.log(`Admin bootstrap createUser error: ${createError?.message || 'unknown'}`);
        return;
      }

      adminUserId = createdData.user.id;
      console.log('Default admin user created: admin@ecollant.com');
    }

    if (!adminUserId) return;

    const existingProfile = await kv.get(`user:${adminUserId}`);
    const adminProfile = {
      id: adminUserId,
      email: ADMIN_EMAIL,
      name: existingProfile?.name || 'Administrador EcolLant',
      phone: existingProfile?.phone || '+504 2550-0001',
      type: 'admin',
      points: 0,
      level: 'Administrador',
      address: existingProfile?.address || 'San Pedro Sula, Honduras',
      createdAt: existingProfile?.createdAt || new Date().toISOString(),
    };

    await kv.set(`user:${adminUserId}`, adminProfile);

    const existingStats = await kv.get(`stats:${adminUserId}`);
    if (!existingStats) {
      await kv.set(`stats:${adminUserId}`, {
        totalCollections: 0,
        totalTires: 0,
        totalPoints: 0,
        co2Saved: 0,
        treesEquivalent: 0,
        recycledWeight: 0,
      });
    }
  } catch (error) {
    console.log(`Admin bootstrap error: ${error}`);
  }
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

const requireAdmin = async (c: any) => {
  const accessToken = c.req.header('Authorization')?.split(' ')[1];
  if (!accessToken) {
    return { error: c.json({ error: 'Unauthorized' }, 401) };
  }

  const supabase = getSupabaseClient(true);
  const { data: { user }, error } = await supabase.auth.getUser(accessToken);

  if (error || !user?.id) {
    return { error: c.json({ error: 'Unauthorized' }, 401) };
  }

  const userProfile = await kv.get(`user:${user.id}`);
  if (userProfile?.type !== 'admin') {
    return { error: c.json({ error: 'Forbidden' }, 403) };
  }

  return { user, userProfile };
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

// ==================== ANALYTICS ROUTES ====================

const getAnalyticsOverview = async () => {
  const supabase = getSupabaseClient(true);
  const { data, error } = await supabase
    .from('analytics_overview')
    .select('*')
    .eq('id', 1)
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'analytics_overview row is missing');
  }

  const totalVisits = Number(data?.total_visits || 0);
  const totalSessionDurationMs = Number(data?.total_session_duration_ms || 0);
  const sessionCount = Number(data?.session_count || 0);
  const totalAppLoadTimeMs = Number(data?.total_app_load_time_ms || 0);
  const appLoadSampleCount = Number(data?.app_load_sample_count || 0);
  const activeSessions = Number(data?.active_sessions || 0);
  const concurrentSessions = Number(data?.concurrent_sessions || 0);
  const peakConcurrentSessions = Number(data?.peak_concurrent_sessions || 0);

  return {
    totalVisits,
    totalSessionDurationMs,
    sessionCount,
    totalAppLoadTimeMs,
    appLoadSampleCount,
    activeSessions,
    concurrentSessions,
    peakConcurrentSessions,
    averageSessionDurationMs: sessionCount > 0 ? totalSessionDurationMs / sessionCount : 0,
    averageAppLoadTimeMs: appLoadSampleCount > 0 ? totalAppLoadTimeMs / appLoadSampleCount : 0,
    updatedAt: data?.updated_at || null,
  };
};

const ACTIVE_SESSION_TTL_MS = 5 * 60 * 1000;

const syncConcurrentSessions = async () => {
  const supabase = getSupabaseClient(true);
  const ttlSeconds = Math.floor(ACTIVE_SESSION_TTL_MS / 1000);
  const { data, error } = await supabase.rpc('analytics_sync_overview', {
    p_ttl_seconds: ttlSeconds,
  });

  if (error || !data) {
    throw new Error(error?.message || 'Failed to sync analytics overview');
  }

  return {
    totalVisits: Number(data?.total_visits || 0),
    totalSessionDurationMs: Number(data?.total_session_duration_ms || 0),
    sessionCount: Number(data?.session_count || 0),
    totalAppLoadTimeMs: Number(data?.total_app_load_time_ms || 0),
    appLoadSampleCount: Number(data?.app_load_sample_count || 0),
    averageSessionDurationMs: Number(data?.session_count || 0) > 0
      ? Number(data?.total_session_duration_ms || 0) / Number(data?.session_count || 0)
      : 0,
    averageAppLoadTimeMs: Number(data?.app_load_sample_count || 0) > 0
      ? Number(data?.total_app_load_time_ms || 0) / Number(data?.app_load_sample_count || 0)
      : 0,
    activeSessions: Number(data?.active_sessions || 0),
    concurrentSessions: Number(data?.concurrent_sessions || 0),
    peakConcurrentSessions: Number(data?.peak_concurrent_sessions || 0),
    updatedAt: data?.updated_at || null,
  };
};

const getAppSettings = async () => {
  const defaults = {
    appName: 'EcolLantApp',
    supportEmail: 'soporte@ecollant.com',
    maintenanceMode: false,
    rewardsEnabled: true,
    includeAdminAnalytics: false,
    serverTimezone: 'America/Tegucigalpa',
  };
  const stored = await kv.get('app:settings');
  return {
    ...defaults,
    ...(stored || {}),
  };
};

const getAccessTokenFromRequest = (c: any) => {
  const value = c.req.header('Authorization') || '';
  if (!value.toLowerCase().startsWith('bearer ')) return null;
  return value.slice(7).trim() || null;
};

const resolveAuthenticatedUserFromRequest = async (c: any) => {
  const accessToken = getAccessTokenFromRequest(c);
  if (!accessToken) return null;

  // Ignore anon/static keys and only try to resolve JWT-shaped tokens.
  if (String(accessToken).split('.').length !== 3) {
    return null;
  }

  const supabase = getSupabaseClient(true);
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data?.user?.id) {
    return null;
  }

  const user = data.user;
  const profile = await kv.get(`user:${user.id}`);
  const metadata = user.user_metadata || {};

  return {
    id: user.id,
    email: String(user.email || profile?.email || ''),
    name: String(profile?.name || metadata?.name || user.email || 'Usuario'),
    type: String(profile?.type || metadata?.type || 'unknown'),
  };
};

const getSessionMetaKey = (sessionId: string) => `analytics:session-meta:${sessionId}`;
const getSessionActivityKey = (sessionId: string) => `analytics:session-activity:${sessionId}`;

const upsertSessionMeta = async (
  sessionId: string,
  updates: Record<string, any>,
) => {
  if (!sessionId) return null;
  const key = getSessionMetaKey(sessionId);
  const current = (await kv.get(key)) || {};
  const merged = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  await kv.set(key, merged);
  return merged;
};

const appendSessionActivity = async (
  sessionId: string,
  event: Record<string, any>,
) => {
  if (!sessionId) return;
  const key = getSessionActivityKey(sessionId);
  const current = (await kv.get(key)) || [];
  const safeCurrent = Array.isArray(current) ? current : [];
  const next = [
    {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      sessionId,
      ...event,
    },
    ...safeCurrent,
  ].slice(0, 60);
  await kv.set(key, next);
};

const shouldTrackAnalyticsForUserType = async (userType?: string) => {
  if (userType !== 'admin') {
    return true;
  }

  const settings = await getAppSettings();
  return Boolean(settings?.includeAdminAnalytics);
};

const getPeriodBucket = (iso: string, period: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return 'invalid-date';
  }

  if (period === 'weekly') {
    const weekStart = new Date(date);
    const day = weekStart.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    weekStart.setUTCDate(weekStart.getUTCDate() + diff);
    weekStart.setUTCHours(0, 0, 0, 0);
    return weekStart.toISOString().slice(0, 10);
  }

  if (period === 'monthly') {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  return date.toISOString().slice(0, 10);
};

app.post('/server/analytics/visit', async (c) => {
  try {
    const payload = await c.req.json().catch(() => ({}));
    if (!(await shouldTrackAnalyticsForUserType(payload?.userType))) {
      return c.json({ message: 'Visit tracking skipped for admin' }, 200);
    }

    const sessionId = String(payload?.sessionId || '').trim();
    const resolvedUser = await resolveAuthenticatedUserFromRequest(c);
    const safeUserType = payload?.userType || resolvedUser?.type || 'unknown';
    const supabase = getSupabaseClient(true);
    const { error: rpcError } = await supabase.rpc('analytics_track_visit', {
      p_path: payload?.path || null,
      p_user_type: safeUserType,
    });
    if (rpcError) {
      throw new Error(rpcError.message);
    }

    if (sessionId) {
      await upsertSessionMeta(sessionId, {
        sessionId,
        userId: resolvedUser?.id || null,
        userEmail: resolvedUser?.email || null,
        userName: resolvedUser?.name || null,
        userType: safeUserType,
        lastPath: String(payload?.path || ''),
        lastActivityType: 'visit',
        lastActivityAt: new Date().toISOString(),
      });
      await appendSessionActivity(sessionId, {
        type: 'visit',
        path: String(payload?.path || ''),
        userType: safeUserType,
      });
    }

    return c.json({ message: 'Visit tracked' }, 201);
  } catch (error) {
    console.log(`Analytics visit error: ${error}`);
    return c.json({ error: 'Error tracking visit' }, 500);
  }
});

app.post('/server/analytics/session', async (c) => {
  try {
    const payload = await c.req.json();
    if (!(await shouldTrackAnalyticsForUserType(payload?.userType))) {
      return c.json({ message: 'Session tracking skipped for admin' }, 200);
    }
    const durationMs = Math.max(0, Number(payload?.durationMs || 0));

    if (!Number.isFinite(durationMs)) {
      return c.json({ error: 'durationMs must be a number' }, 400);
    }

    const supabase = getSupabaseClient(true);
    const { error } = await supabase.rpc('analytics_track_session_end', {
      p_session_id: payload?.sessionId || `legacy-${crypto.randomUUID()}`,
      p_duration_ms: durationMs,
      p_user_type: payload?.userType || 'unknown',
    });

    if (error) {
      throw new Error(error.message);
    }
    return c.json({ message: 'Session tracked' }, 201);
  } catch (error) {
    console.log(`Analytics session error: ${error}`);
    return c.json({ error: 'Error tracking session' }, 500);
  }
});

app.post('/server/analytics/load', async (c) => {
  try {
    const payload = await c.req.json();
    if (!(await shouldTrackAnalyticsForUserType(payload?.userType))) {
      return c.json({ message: 'Load tracking skipped for admin' }, 200);
    }
    const loadTimeMs = Math.max(0, Number(payload?.loadTimeMs || 0));

    if (!Number.isFinite(loadTimeMs)) {
      return c.json({ error: 'loadTimeMs must be a number' }, 400);
    }

    const supabase = getSupabaseClient(true);
    const { error } = await supabase.rpc('analytics_track_load', {
      p_load_time_ms: loadTimeMs,
      p_user_type: payload?.userType || 'unknown',
    });

    if (error) {
      throw new Error(error.message);
    }
    return c.json({ message: 'Load time tracked' }, 201);
  } catch (error) {
    console.log(`Analytics load error: ${error}`);
    return c.json({ error: 'Error tracking load time' }, 500);
  }
});

app.post('/server/analytics/session/start', async (c) => {
  try {
    const payload = await c.req.json();
    if (!(await shouldTrackAnalyticsForUserType(payload?.userType))) {
      return c.json({ message: 'Session start skipped for admin', activeSessions: 0, concurrentSessions: 0 }, 200);
    }
    const sessionId = String(payload?.sessionId || '').trim();
    if (!sessionId) {
      return c.json({ error: 'sessionId is required' }, 400);
    }

    const resolvedUser = await resolveAuthenticatedUserFromRequest(c);
    const safeUserType = payload?.userType || resolvedUser?.type || 'unknown';
    const supabase = getSupabaseClient(true);
    const { data, error } = await supabase.rpc('analytics_session_start_tx', {
      p_session_id: sessionId,
      p_started_at: payload?.startedAt || new Date().toISOString(),
      p_user_type: safeUserType,
    });

    if (error) {
      throw new Error(error.message);
    }

    await upsertSessionMeta(sessionId, {
      sessionId,
      userId: resolvedUser?.id || null,
      userEmail: resolvedUser?.email || null,
      userName: resolvedUser?.name || null,
      userType: safeUserType,
      startedAt: payload?.startedAt || new Date().toISOString(),
      lastActivityType: 'session_start',
      lastActivityAt: new Date().toISOString(),
    });
    await appendSessionActivity(sessionId, {
      type: 'session_start',
      userType: safeUserType,
      startedAt: payload?.startedAt || new Date().toISOString(),
    });

    return c.json({
      message: 'Session started',
      activeSessions: Number(data?.active_sessions || 0),
      concurrentSessions: Number(data?.concurrent_sessions || 0),
    }, 201);
  } catch (error) {
    console.log(`Analytics session start error: ${error}`);
    return c.json({ error: 'Error starting session' }, 500);
  }
});

app.post('/server/analytics/session/ping', async (c) => {
  try {
    const payload = await c.req.json();
    if (!(await shouldTrackAnalyticsForUserType(payload?.userType))) {
      return c.json({ message: 'Session ping skipped for admin', activeSessions: 0, concurrentSessions: 0 }, 200);
    }

    const sessionId = String(payload?.sessionId || '').trim();
    if (!sessionId) {
      return c.json({ error: 'sessionId is required' }, 400);
    }

    const resolvedUser = await resolveAuthenticatedUserFromRequest(c);
    const safeUserType = payload?.userType || resolvedUser?.type || 'unknown';
    const supabase = getSupabaseClient(true);
    const { data, error } = await supabase.rpc('analytics_session_ping_tx', {
      p_session_id: sessionId,
      p_user_type: safeUserType,
    });

    if (error) {
      throw new Error(error.message);
    }

    await upsertSessionMeta(sessionId, {
      sessionId,
      userId: resolvedUser?.id || null,
      userEmail: resolvedUser?.email || null,
      userName: resolvedUser?.name || null,
      userType: safeUserType,
      lastActivityType: 'ping',
      lastActivityAt: new Date().toISOString(),
    });
    await appendSessionActivity(sessionId, {
      type: 'ping',
      userType: safeUserType,
    });

    return c.json({
      message: 'Session ping tracked',
      activeSessions: Number(data?.active_sessions || 0),
      concurrentSessions: Number(data?.concurrent_sessions || 0),
    });
  } catch (error) {
    console.log(`Analytics session ping error: ${error}`);
    return c.json({ error: 'Error pinging session' }, 500);
  }
});

app.post('/server/analytics/session/end', async (c) => {
  try {
    const payload = await c.req.json();
    if (!(await shouldTrackAnalyticsForUserType(payload?.userType))) {
      return c.json({ message: 'Session end skipped for admin', activeSessions: 0, concurrentSessions: 0 }, 200);
    }
    const sessionId = String(payload?.sessionId || '').trim();
    const durationMs = Math.max(0, Number(payload?.durationMs || 0));

    if (!sessionId) {
      return c.json({ error: 'sessionId is required' }, 400);
    }

    if (!Number.isFinite(durationMs)) {
      return c.json({ error: 'durationMs must be a number' }, 400);
    }

    const resolvedUser = await resolveAuthenticatedUserFromRequest(c);
    const safeUserType = payload?.userType || resolvedUser?.type || 'unknown';
    const supabase = getSupabaseClient(true);
    const { data, error } = await supabase.rpc('analytics_track_session_end', {
      p_session_id: sessionId,
      p_duration_ms: durationMs,
      p_user_type: safeUserType,
    });

    if (error) {
      throw new Error(error.message);
    }

    await appendSessionActivity(sessionId, {
      type: 'session_end',
      userType: safeUserType,
      durationMs,
    });
    await kv.del(getSessionMetaKey(sessionId));

    return c.json({
      message: 'Session ended',
      activeSessions: Number(data?.active_sessions || 0),
      concurrentSessions: Number(data?.concurrent_sessions || 0),
    }, 201);
  } catch (error) {
    console.log(`Analytics session end error: ${error}`);
    return c.json({ error: 'Error ending session' }, 500);
  }
});

// ==================== AUTH ROUTES ====================

// Sign up
app.post("/server/auth/signup", async (c) => {
  try {
    const { email, password, name, phone, type, address } = await c.req.json();
    const safeType = type === 'collector' ? 'collector' : 'generator';
    
    const supabase = getSupabaseClient(true);
    
    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name, phone, type: safeType, address },
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
      type: safeType,
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
    
    const supabaseService = getSupabaseClient(true);
    const { data: { user }, error: userError } = await supabaseService.auth.getUser(accessToken);

    if (userError || !user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Best effort token revocation. Frontend still clears local storage unconditionally.
    const adminAuth = (supabaseService.auth as any).admin;
    if (adminAuth?.signOut) {
      const { error: revokeError } = await adminAuth.signOut(accessToken);
      if (revokeError) {
        console.log(`Token revoke warning: ${revokeError.message}`);
      }
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

    // Users can only read their own profile.
    if (user.id !== userId) {
      return c.json({ error: 'Forbidden' }, 403);
    }

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
    
    const userProfile = await kv.get(`user:${user.id}`);
    const isCollector = userProfile?.type === 'collector';

    // Collectors see global board; generators see only their own collections.
    const collections = isCollector
      ? await kv.getByPrefix('collection:')
      : await kv.getByPrefix(`collection:${user.id}:`);
    
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
    const userProfile = await kv.get(`user:${user.id}`);
    const isCollector = userProfile?.type === 'collector';

    const collection = isCollector
      ? await findCollectionById(collectionId)
      : await kv.get(`collection:${user.id}:${collectionId}`);
    
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
    
    const userProfile = await kv.get(`user:${user.id}`);
    if (userProfile?.type === 'collector') {
      return c.json({ error: 'Collectors cannot create collections' }, 403);
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
    const userProfile = await kv.get(`user:${user.id}`);
    const isCollector = userProfile?.type === 'collector';

    let currentCollection: any = null;
    let collectionKey = `collection:${user.id}:${collectionId}`;

    if (isCollector) {
      const found = await findCollectionKeyById(collectionId);
      currentCollection = found?.value || null;
      collectionKey = found?.key || collectionKey;
    } else {
      currentCollection = await kv.get(collectionKey);
    }
    
    if (!currentCollection) {
      return c.json({ error: 'Collection not found' }, 404);
    }

    if (!isCollector && updates.status && updates.status !== currentCollection.status) {
      const canCancelPending = updates.status === 'cancelled' && currentCollection.status === 'pending';
      if (!canCancelPending) {
        return c.json({ error: 'Generators cannot change collection status' }, 403);
      }
    }

    if (isCollector && updates.status && !['in-progress', 'completed', 'cancelled'].includes(updates.status)) {
      return c.json({ error: 'Invalid status for collector update' }, 400);
    }
    
    const updatedCollection = {
      ...currentCollection,
      ...updates,
      id: collectionId,
      userId: currentCollection.userId,
    };

    if (isCollector) {
      updatedCollection.collectorId = user.id;
      updatedCollection.collectorName = userProfile?.name || 'Recolector';
    }

    const traceability = {
      qrCode: currentCollection?.traceability?.qrCode || generateQrCode(user.id, collectionId),
      currentStage: currentCollection?.traceability?.currentStage || 'registrada',
      events: currentCollection?.traceability?.events || [],
    };

    if (updates.status && updates.status !== currentCollection.status) {
      const nextStage = updates.status === 'completed'
        ? 'destino-final'
        : updates.status === 'cancelled'
          ? 'cancelada'
          : 'en-proceso';
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
      const collectionOwnerProfile = await kv.get(`user:${updatedCollection.userId}`);
      const stats = await kv.get(`stats:${updatedCollection.userId}`);
      
      if (collectionOwnerProfile && stats) {
        // Update user points
        collectionOwnerProfile.points += updatedCollection.points;
        
        // Update level based on points
        if (collectionOwnerProfile.points >= 1000) {
          collectionOwnerProfile.level = 'Eco Master';
        } else if (collectionOwnerProfile.points >= 500) {
          collectionOwnerProfile.level = 'Eco Champion';
        } else if (collectionOwnerProfile.points >= 200) {
          collectionOwnerProfile.level = 'Eco Warrior';
        } else if (collectionOwnerProfile.points >= 50) {
          collectionOwnerProfile.level = 'Eco Guardian';
        } else {
          collectionOwnerProfile.level = 'Eco Novato';
        }
        
        await kv.set(`user:${updatedCollection.userId}`, collectionOwnerProfile);
        
        // Update stats
        stats.totalCollections += 1;
        stats.totalTires += updatedCollection.tireCount;
        stats.totalPoints = collectionOwnerProfile.points;
        stats.co2Saved += updatedCollection.tireCount * 3.25; // kg per tire
        stats.treesEquivalent = Math.floor(stats.co2Saved / 20);
        stats.recycledWeight += updatedCollection.tireCount * 5; // kg per tire
        
        await kv.set(`stats:${updatedCollection.userId}`, stats);
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
    
    await kv.set(collectionKey, updatedCollection);
    
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
    const userProfile = await kv.get(`user:${user.id}`);
    const isCollector = userProfile?.type === 'collector';
    const collection = isCollector
      ? await findCollectionById(collectionId)
      : await kv.get(`collection:${user.id}:${collectionId}`);

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
    const existingPointKeys = await kv.getKeysByPrefix('point:');
    if (existingPointKeys.length > 0) {
      await kv.mdel(existingPointKeys);
    }

    const mockPoints = [
      {
        id: '1',
        name: 'Centro de Acopio Norte',
        address: 'Boulevard del Este, San Pedro Sula',
        coordinates: { lat: 15.5123, lng: -88.0018 },
        capacity: 1000,
        currentLoad: 650,
        acceptedTypes: ['Automóvil', 'Motocicleta', 'Camión', 'Autobus', 'Bicicleta'],
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
        acceptedTypes: ['Automóvil', 'Motocicleta', 'Camión', 'Autobus'],
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
        acceptedTypes: ['Automóvil', 'Motocicleta', 'Camión', 'Autobus'],
        hours: 'Lun-Vie: 8:00 AM - 6:00 PM, Sáb: 9:00 AM - 2:00 PM',
        phone: '+504 2550-1500',
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

// Create collection point (collector admin)
app.post("/server/points", async (c) => {
  try {
    const auth = await requireAdmin(c);
    if (auth.error) return auth.error;
    const { user } = auth;

    const {
      name,
      address,
      coordinates,
      capacity,
      currentLoad,
      acceptedTypes,
      hours,
      phone,
    } = await c.req.json();

    if (!name || !address || !coordinates || !Number.isFinite(Number(capacity)) || Number(capacity) <= 0) {
      return c.json({ error: 'name, address, coordinates and capacity are required' }, 400);
    }

    const pointId = crypto.randomUUID();
    const point = {
      id: pointId,
      name,
      address,
      coordinates: {
        lat: Number(coordinates.lat),
        lng: Number(coordinates.lng),
      },
      capacity: Number(capacity),
      currentLoad: Math.max(0, Number(currentLoad || 0)),
      acceptedTypes: Array.isArray(acceptedTypes) && acceptedTypes.length > 0
        ? acceptedTypes
        : ['Automóvil', 'Motocicleta', 'Camión', 'Autobus', 'Bicicleta'],
      hours: hours || 'Lun-Sab: 8:00 AM - 6:00 PM',
      phone: phone || '+504 0000-0000',
      createdBy: user.id,
      createdAt: new Date().toISOString(),
    };

    await kv.set(`point:${pointId}`, point);
    return c.json(point, 201);
  } catch (error) {
    console.log(`Create point error: ${error}`);
    return c.json({ error: 'Error creating collection point' }, 500);
  }
});

// Update collection point (collector admin)
app.put("/server/points/:pointId", async (c) => {
  try {
    const auth = await requireAdmin(c);
    if (auth.error) return auth.error;
    const { user } = auth;

    const pointId = c.req.param('pointId');
    const updates = await c.req.json();
    const currentPoint = await kv.get(`point:${pointId}`);

    if (!currentPoint) {
      return c.json({ error: 'Collection point not found' }, 404);
    }

    const updatedPoint = {
      ...currentPoint,
      ...updates,
      id: pointId,
      capacity: Number(updates.capacity ?? currentPoint.capacity),
      currentLoad: Number(updates.currentLoad ?? currentPoint.currentLoad),
      coordinates: updates.coordinates
        ? {
            lat: Number(updates.coordinates.lat),
            lng: Number(updates.coordinates.lng),
          }
        : currentPoint.coordinates,
      updatedAt: new Date().toISOString(),
      updatedBy: user.id,
    };

    if (!Number.isFinite(updatedPoint.capacity) || updatedPoint.capacity <= 0) {
      return c.json({ error: 'capacity must be a positive number' }, 400);
    }

    if (updatedPoint.currentLoad < 0 || updatedPoint.currentLoad > updatedPoint.capacity) {
      return c.json({ error: 'currentLoad must be between 0 and capacity' }, 400);
    }

    await kv.set(`point:${pointId}`, updatedPoint);
    return c.json(updatedPoint);
  } catch (error) {
    console.log(`Update point error: ${error}`);
    return c.json({ error: 'Error updating collection point' }, 500);
  }
});

// Delete collection point (collector admin)
app.delete("/server/points/:pointId", async (c) => {
  try {
    const auth = await requireAdmin(c);
    if (auth.error) return auth.error;

    const pointId = c.req.param('pointId');
    const currentPoint = await kv.get(`point:${pointId}`);
    if (!currentPoint) {
      return c.json({ error: 'Collection point not found' }, 404);
    }

    await kv.del(`point:${pointId}`);
    return c.json({ message: 'Collection point deleted successfully' });
  } catch (error) {
    console.log(`Delete point error: ${error}`);
    return c.json({ error: 'Error deleting collection point' }, 500);
  }
});

// ==================== ADMIN ROUTES ====================

app.get('/server/admin/users', async (c) => {
  try {
    const auth = await requireAdmin(c);
    if (auth.error) return auth.error;

    const users = await kv.getByPrefix('user:');
    return c.json(
      users.map((item: any) => ({
        id: item.id,
        name: item.name,
        email: item.email,
        phone: item.phone,
        type: item.type,
        points: item.points || 0,
        level: item.level || 'N/A',
        createdAt: item.createdAt || null,
      })),
    );
  } catch (error) {
    console.log(`Admin users error: ${error}`);
    return c.json({ error: 'Error getting users' }, 500);
  }
});

app.post('/server/admin/users', async (c) => {
  try {
    const auth = await requireAdmin(c);
    if (auth.error) return auth.error;

    const {
      email,
      password,
      name,
      phone,
      type,
      address,
    } = await c.req.json();

    if (!email || !password || !name) {
      return c.json({ error: 'email, password and name are required' }, 400);
    }

    if (password.length < 6) {
      return c.json({ error: 'Password must be at least 6 characters' }, 400);
    }

    if (!['generator', 'collector', 'admin'].includes(type)) {
      return c.json({ error: 'Invalid role' }, 400);
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const safePhone = phone || '';
    const safeAddress = address || '';
    const safeType = type as 'generator' | 'collector' | 'admin';

    const supabase = getSupabaseClient(true);
    const { data: createdData, error: createError } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        name,
        phone: safePhone,
        type: safeType,
        address: safeAddress,
      },
    });

    if (createError || !createdData?.user?.id) {
      return c.json({ error: createError?.message || 'Error creating auth user' }, 400);
    }

    const userId = createdData.user.id;
    const profile = {
      id: userId,
      email: normalizedEmail,
      name,
      phone: safePhone,
      type: safeType,
      points: 0,
      level: safeType === 'admin' ? 'Administrador' : 'Eco Novato',
      address: safeAddress,
      createdAt: new Date().toISOString(),
    };

    await kv.set(`user:${userId}`, profile);
    await kv.set(`stats:${userId}`, {
      totalCollections: 0,
      totalTires: 0,
      totalPoints: 0,
      co2Saved: 0,
      treesEquivalent: 0,
      recycledWeight: 0,
    });

    return c.json(profile, 201);
  } catch (error) {
    console.log(`Admin create user error: ${error}`);
    return c.json({ error: 'Error creating user' }, 500);
  }
});

app.put('/server/admin/users/:userId', async (c) => {
  try {
    const auth = await requireAdmin(c);
    if (auth.error) return auth.error;

    const userId = c.req.param('userId');
    const updates = await c.req.json();
    const current = await kv.get(`user:${userId}`);

    if (!current) {
      return c.json({ error: 'User not found' }, 404);
    }

    const nextType = updates.type || current.type;
    if (!['generator', 'collector', 'admin'].includes(nextType)) {
      return c.json({ error: 'Invalid role' }, 400);
    }

    const nextEmail = String(updates.email || current.email || '').trim().toLowerCase();
    if (!nextEmail) {
      return c.json({ error: 'Email is required' }, 400);
    }

    const updated = {
      ...current,
      name: updates.name ?? current.name,
      email: nextEmail,
      phone: updates.phone ?? current.phone,
      address: updates.address ?? current.address,
      type: nextType,
      level: nextType === 'admin' ? 'Administrador' : current.level,
      updatedAt: new Date().toISOString(),
    };

    const supabase = getSupabaseClient(true);
    const { error: authUpdateError } = await supabase.auth.admin.updateUserById(userId, {
      email: updated.email,
      email_confirm: true,
      user_metadata: {
        name: updated.name,
        phone: updated.phone,
        type: updated.type,
        address: updated.address,
      },
    });

    if (authUpdateError) {
      return c.json({ error: authUpdateError.message }, 400);
    }

    await kv.set(`user:${userId}`, updated);
    return c.json(updated);
  } catch (error) {
    console.log(`Admin update user error: ${error}`);
    return c.json({ error: 'Error updating user' }, 500);
  }
});

app.put('/server/admin/users/:userId/role', async (c) => {
  try {
    const auth = await requireAdmin(c);
    if (auth.error) return auth.error;

    const userId = c.req.param('userId');
    const { type } = await c.req.json();

    if (!['generator', 'collector', 'admin'].includes(type)) {
      return c.json({ error: 'Invalid role' }, 400);
    }

    const current = await kv.get(`user:${userId}`);
    if (!current) {
      return c.json({ error: 'User not found' }, 404);
    }

    const updated = {
      ...current,
      type,
      level: type === 'admin' ? 'Administrador' : current.level,
      updatedAt: new Date().toISOString(),
    };

    const supabase = getSupabaseClient(true);
    const { error: authUpdateError } = await supabase.auth.admin.updateUserById(userId, {
      user_metadata: {
        name: updated.name,
        phone: updated.phone,
        type: updated.type,
        address: updated.address,
      },
    });

    if (authUpdateError) {
      return c.json({ error: authUpdateError.message }, 400);
    }

    await kv.set(`user:${userId}`, updated);
    return c.json(updated);
  } catch (error) {
    console.log(`Admin update role error: ${error}`);
    return c.json({ error: 'Error updating user role' }, 500);
  }
});

app.post('/server/admin/users/:userId/reset-password', async (c) => {
  try {
    const auth = await requireAdmin(c);
    if (auth.error) return auth.error;

    const userId = c.req.param('userId');
    const { newPassword } = await c.req.json();

    if (!newPassword || String(newPassword).length < 6) {
      return c.json({ error: 'newPassword must be at least 6 characters' }, 400);
    }

    const profile = await kv.get(`user:${userId}`);
    if (!profile) {
      return c.json({ error: 'User not found' }, 404);
    }

    const supabase = getSupabaseClient(true);
    const { error: resetError } = await supabase.auth.admin.updateUserById(userId, {
      password: String(newPassword),
    });

    if (resetError) {
      return c.json({ error: resetError.message }, 400);
    }

    return c.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.log(`Admin reset password error: ${error}`);
    return c.json({ error: 'Error resetting password' }, 500);
  }
});

app.delete('/server/admin/users/:userId', async (c) => {
  try {
    const auth = await requireAdmin(c);
    if (auth.error) return auth.error;
    const { user: adminUser } = auth;

    const userId = c.req.param('userId');
    const profile = await kv.get(`user:${userId}`);

    if (!profile) {
      return c.json({ error: 'User not found' }, 404);
    }

    if (userId === adminUser.id) {
      return c.json({ error: 'Cannot delete your own account from admin panel' }, 400);
    }

    if (String(profile.email || '').toLowerCase() === ADMIN_EMAIL) {
      return c.json({ error: 'Cannot delete the default admin account' }, 400);
    }

    const collectionKeys = await kv.getKeysByPrefix(`collection:${userId}:`);
    const redemptionKeys = await kv.getKeysByPrefix(`redemption:${userId}:`);
    const keysToDelete = [...collectionKeys, ...redemptionKeys, `user:${userId}`, `stats:${userId}`];

    if (keysToDelete.length > 0) {
      await kv.mdel(keysToDelete);
    }

    const supabase = getSupabaseClient(true);
    const bucketName = 'make-b7bf90da-tire-photos';
    const { data: files, error: listError } = await supabase.storage
      .from(bucketName)
      .list(userId, { limit: 1000 });

    if (!listError && files && files.length > 0) {
      const filePaths = files.map((file) => `${userId}/${file.name}`);
      await supabase.storage.from(bucketName).remove(filePaths);
    }

    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
    if (deleteError) {
      return c.json({ error: deleteError.message }, 400);
    }

    return c.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.log(`Admin delete user error: ${error}`);
    return c.json({ error: 'Error deleting user' }, 500);
  }
});

app.get('/server/admin/settings', async (c) => {
  try {
    const auth = await requireAdmin(c);
    if (auth.error) return auth.error;

    const settings = await getAppSettings();

    return c.json(settings);
  } catch (error) {
    console.log(`Admin settings get error: ${error}`);
    return c.json({ error: 'Error getting settings' }, 500);
  }
});

app.put('/server/admin/settings', async (c) => {
  try {
    const auth = await requireAdmin(c);
    if (auth.error) return auth.error;

    const updates = await c.req.json();
    const current = await getAppSettings();
    const rawTimezone = String(updates?.serverTimezone || current?.serverTimezone || 'America/Tegucigalpa').trim();
    const serverTimezone = rawTimezone.length > 0 ? rawTimezone.slice(0, 80) : 'America/Tegucigalpa';

    const merged = {
      ...current,
      ...updates,
      serverTimezone,
      updatedAt: new Date().toISOString(),
    };

    await kv.set('app:settings', merged);

    if (!merged.includeAdminAnalytics) {
      const supabase = getSupabaseClient(true);
      const { error: deleteError } = await supabase
        .from('analytics_active_sessions')
        .delete()
        .eq('user_type', 'admin');
      if (deleteError) {
        throw new Error(deleteError.message);
      }

      await syncConcurrentSessions();
    }

    return c.json(merged);
  } catch (error) {
    console.log(`Admin settings update error: ${error}`);
    return c.json({ error: 'Error updating settings' }, 500);
  }
});

app.get('/server/admin/reports/overview', async (c) => {
  try {
    const auth = await requireAdmin(c);
    if (auth.error) return auth.error;

    const users = await kv.getByPrefix('user:');
    const collections = await kv.getByPrefix('collection:');
    const points = await kv.getByPrefix('point:');
    const redemptions = await kv.getByPrefix('redemption:');

    const pending = collections.filter((item: any) => item.status === 'pending').length;
    const inProgress = collections.filter((item: any) => item.status === 'in-progress').length;
    const completed = collections.filter((item: any) => item.status === 'completed').length;

    return c.json({
      users: {
        total: users.length,
        generators: users.filter((item: any) => item.type === 'generator').length,
        collectors: users.filter((item: any) => item.type === 'collector').length,
        admins: users.filter((item: any) => item.type === 'admin').length,
      },
      collections: {
        total: collections.length,
        pending,
        inProgress,
        completed,
      },
      points: {
        totalCenters: points.length,
        totalCapacity: points.reduce((acc: number, item: any) => acc + Number(item.capacity || 0), 0),
        currentLoad: points.reduce((acc: number, item: any) => acc + Number(item.currentLoad || 0), 0),
      },
      rewards: {
        redemptions: redemptions.length,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.log(`Admin reports error: ${error}`);
    return c.json({ error: 'Error getting reports overview' }, 500);
  }
});

app.get('/server/admin/analytics', async (c) => {
  try {
    const auth = await requireAdmin(c);
    if (auth.error) return auth.error;

    await syncConcurrentSessions();
    const analytics = await getAnalyticsOverview();
    return c.json(analytics);
  } catch (error) {
    console.log(`Admin analytics error: ${error}`);
    return c.json({ error: 'Error getting analytics' }, 500);
  }
});

app.get('/server/admin/analytics/report', async (c) => {
  try {
    const auth = await requireAdmin(c);
    if (auth.error) return auth.error;

    const fromParam = c.req.query('from');
    const toParam = c.req.query('to');
    const period = c.req.query('period') || 'daily';
    const userType = c.req.query('userType') || 'all';

    const fromDate = fromParam ? new Date(fromParam) : null;
    const toDate = toParam ? new Date(toParam) : null;
    const supabase = getSupabaseClient(true);
    let query = supabase
      .from('analytics_events')
      .select('type, user_type, duration_ms, load_time_ms, timestamp, session_id');

    if (fromDate && !Number.isNaN(fromDate.getTime())) {
      query = query.gte('timestamp', fromDate.toISOString());
    }

    if (toDate && !Number.isNaN(toDate.getTime())) {
      query = query.lte('timestamp', toDate.toISOString());
    }

    if (userType !== 'all') {
      query = query.eq('user_type', userType);
    }

    const { data: eventsData, error: eventsError } = await query;
    if (eventsError) {
      throw new Error(eventsError.message);
    }

    const filtered = Array.isArray(eventsData)
      ? eventsData.map((item: any) => ({
          type: item.type,
          userType: item.user_type,
          durationMs: item.duration_ms,
          loadTimeMs: item.load_time_ms,
          timestamp: item.timestamp,
          sessionId: item.session_id,
        }))
      : [];

    const visitEvents = filtered.filter((item: any) => item.type === 'visit');
    const loadEvents = filtered.filter((item: any) => item.type === 'load');
    const sessionEvents = filtered.filter((item: any) => item.type === 'session_end');

    const totalVisits = visitEvents.length;
    const totalSessionDurationMs = sessionEvents.reduce((acc: number, item: any) => acc + Number(item.durationMs || 0), 0);
    const totalLoadTimeMs = loadEvents.reduce((acc: number, item: any) => acc + Number(item.loadTimeMs || 0), 0);
    const overviewSnapshot = await getAnalyticsOverview();

    const summary = {
      totalVisits,
      averageSessionDurationMs: sessionEvents.length > 0 ? totalSessionDurationMs / sessionEvents.length : 0,
      averageAppLoadTimeMs: loadEvents.length > 0 ? totalLoadTimeMs / loadEvents.length : 0,
      sessionCount: sessionEvents.length,
      loadSampleCount: loadEvents.length,
      concurrentSessions: Number(overviewSnapshot.concurrentSessions || 0),
      peakConcurrentSessions: Number(overviewSnapshot.peakConcurrentSessions || 0),
    };

    const buckets = new Map<string, any>();
    for (const event of filtered) {
      const bucketKey = getPeriodBucket(event.timestamp, period);
      if (bucketKey === 'invalid-date') continue;
      const current = buckets.get(bucketKey) || {
        period: bucketKey,
        visits: 0,
        sessionCount: 0,
        totalSessionDurationMs: 0,
        loadSampleCount: 0,
        totalLoadTimeMs: 0,
      };

      if (event.type === 'visit') {
        current.visits += 1;
      }

      if (event.type === 'session_end') {
        current.sessionCount += 1;
        current.totalSessionDurationMs += Number(event.durationMs || 0);
      }

      if (event.type === 'load') {
        current.loadSampleCount += 1;
        current.totalLoadTimeMs += Number(event.loadTimeMs || 0);
      }

      buckets.set(bucketKey, current);
    }

    const series = Array.from(buckets.values())
      .sort((a, b) => String(a.period).localeCompare(String(b.period)))
      .map((item: any) => ({
        period: item.period,
        visits: item.visits,
        averageSessionDurationMs: item.sessionCount > 0 ? item.totalSessionDurationMs / item.sessionCount : 0,
        averageAppLoadTimeMs: item.loadSampleCount > 0 ? item.totalLoadTimeMs / item.loadSampleCount : 0,
      }));

    return c.json({
      filters: {
        from: fromParam || null,
        to: toParam || null,
        period,
        userType,
      },
      summary,
      series,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.log(`Admin analytics report error: ${error}`);
    return c.json({ error: 'Error generating analytics report' }, 500);
  }
});

app.get('/server/admin/analytics/campaigns', async (c) => {
  try {
    const auth = await requireAdmin(c);
    if (auth.error) return auth.error;

    const campaigns = await kv.getByPrefix('analytics:campaign:');
    campaigns.sort((a: any, b: any) => String(a.startsAt || '').localeCompare(String(b.startsAt || '')));
    return c.json(campaigns);
  } catch (error) {
    console.log(`Admin analytics campaigns get error: ${error}`);
    return c.json({ error: 'Error getting analytics campaigns' }, 500);
  }
});

app.post('/server/admin/analytics/campaigns', async (c) => {
  try {
    const auth = await requireAdmin(c);
    if (auth.error) return auth.error;

    const body = await c.req.json();
    const name = String(body?.name || '').trim();
    const startsAt = String(body?.startsAt || '').trim();
    const endsAt = body?.endsAt ? String(body.endsAt) : null;
    const period = body?.period || 'daily';
    const userType = body?.userType || 'all';

    if (!name || !startsAt) {
      return c.json({ error: 'name and startsAt are required' }, 400);
    }

    const startsAtDate = new Date(startsAt);
    if (Number.isNaN(startsAtDate.getTime())) {
      return c.json({ error: 'startsAt must be a valid date' }, 400);
    }

    const campaignId = crypto.randomUUID();
    const campaign = {
      id: campaignId,
      name,
      startsAt,
      endsAt,
      period,
      userType,
      status: startsAtDate.getTime() > Date.now() ? 'scheduled' : 'active',
      createdAt: new Date().toISOString(),
      createdBy: auth.user.id,
    };

    await kv.set(`analytics:campaign:${campaignId}`, campaign);
    return c.json(campaign, 201);
  } catch (error) {
    console.log(`Admin analytics campaign create error: ${error}`);
    return c.json({ error: 'Error creating analytics campaign' }, 500);
  }
});

app.put('/server/admin/analytics/campaigns/:campaignId', async (c) => {
  try {
    const auth = await requireAdmin(c);
    if (auth.error) return auth.error;

    const campaignId = c.req.param('campaignId');
    const current = await kv.get(`analytics:campaign:${campaignId}`);
    if (!current) {
      return c.json({ error: 'Campaign not found' }, 404);
    }

    const body = await c.req.json();
    const name = String(body?.name ?? current.name ?? '').trim();
    const startsAt = String(body?.startsAt ?? current.startsAt ?? '').trim();
    const endsAt = body?.endsAt !== undefined ? (body?.endsAt ? String(body.endsAt) : null) : current.endsAt ?? null;
    const period = body?.period || current.period || 'daily';
    const userType = body?.userType || current.userType || 'all';

    if (!name || !startsAt) {
      return c.json({ error: 'name and startsAt are required' }, 400);
    }

    const startsAtDate = new Date(startsAt);
    if (Number.isNaN(startsAtDate.getTime())) {
      return c.json({ error: 'startsAt must be a valid date' }, 400);
    }

    const status = startsAtDate.getTime() > Date.now() ? 'scheduled' : 'active';
    const updated = {
      ...current,
      name,
      startsAt,
      endsAt,
      period,
      userType,
      status,
      updatedAt: new Date().toISOString(),
      updatedBy: auth.user.id,
    };

    await kv.set(`analytics:campaign:${campaignId}`, updated);
    return c.json(updated);
  } catch (error) {
    console.log(`Admin analytics campaign update error: ${error}`);
    return c.json({ error: 'Error updating analytics campaign' }, 500);
  }
});

app.delete('/server/admin/analytics/campaigns/:campaignId', async (c) => {
  try {
    const auth = await requireAdmin(c);
    if (auth.error) return auth.error;

    const campaignId = c.req.param('campaignId');
    const current = await kv.get(`analytics:campaign:${campaignId}`);
    if (!current) {
      return c.json({ error: 'Campaign not found' }, 404);
    }

    await kv.del(`analytics:campaign:${campaignId}`);
    return c.json({ message: 'Campaign deleted successfully' });
  } catch (error) {
    console.log(`Admin analytics campaign delete error: ${error}`);
    return c.json({ error: 'Error deleting analytics campaign' }, 500);
  }
});

app.post('/server/admin/analytics/reset-test-data', async (c) => {
  try {
    const auth = await requireAdmin(c);
    if (auth.error) return auth.error;

    const supabase = getSupabaseClient(true);
    const { data: activeRows, error: activeSelectError } = await supabase
      .from('analytics_active_sessions')
      .select('session_id');
    if (activeSelectError) {
      throw new Error(activeSelectError.message);
    }

    const activeSessionIds = (activeRows || [])
      .map((item: any) => String(item?.session_id || ''))
      .filter((sessionId: string) =>
        sessionId.startsWith('live-') ||
        sessionId.startsWith('test-') ||
        sessionId.startsWith('debug-'),
      );

    if (activeSessionIds.length > 0) {
      const { error: activeDeleteError } = await supabase
        .from('analytics_active_sessions')
        .delete()
        .in('session_id', activeSessionIds);
      if (activeDeleteError) {
        throw new Error(activeDeleteError.message);
      }
    }

    const { data: eventRows, error: eventSelectError } = await supabase
      .from('analytics_events')
      .select('id, session_id');
    if (eventSelectError) {
      throw new Error(eventSelectError.message);
    }

    const testEventIds = (eventRows || [])
      .filter((item: any) => {
        const sessionId = String(item?.session_id || '');
        return (
          sessionId.startsWith('live-') ||
          sessionId.startsWith('test-') ||
          sessionId.startsWith('debug-')
        );
      })
      .map((item: any) => item.id);

    if (testEventIds.length > 0) {
      const { error: eventDeleteError } = await supabase
        .from('analytics_events')
        .delete()
        .in('id', testEventIds);
      if (eventDeleteError) {
        throw new Error(eventDeleteError.message);
      }
    }

    const snapshot = await syncConcurrentSessions();
    return c.json({
      message: 'Test analytics data cleaned',
      removedActiveSessions: activeSessionIds.length,
      removedEvents: testEventIds.length,
      activeSessions: snapshot.activeSessions,
      concurrentSessions: snapshot.concurrentSessions,
    });
  } catch (error) {
    console.log(`Admin analytics cleanup error: ${error}`);
    return c.json({ error: 'Error cleaning test analytics data' }, 500);
  }
});

app.post('/server/admin/analytics/reset-active-sessions', async (c) => {
  try {
    const auth = await requireAdmin(c);
    if (auth.error) return auth.error;

    const supabase = getSupabaseClient(true);
    const { count, error: countError } = await supabase
      .from('analytics_active_sessions')
      .select('session_id', { count: 'exact', head: true });
    if (countError) {
      throw new Error(countError.message);
    }

    const { data, error } = await supabase.rpc('analytics_close_all_sessions_tx');
    if (error) {
      throw new Error(error.message);
    }

    const metaKeys = await kv.getKeysByPrefix('analytics:session-meta:');
    if (metaKeys.length > 0) {
      await kv.mdel(metaKeys);
    }
    const activityKeys = await kv.getKeysByPrefix('analytics:session-activity:');
    if (activityKeys.length > 0) {
      await kv.mdel(activityKeys);
    }

    return c.json({
      message: 'All active sessions reset',
      removedActiveSessions: Number(count || 0),
      activeSessions: Number(data?.active_sessions || 0),
      concurrentSessions: Number(data?.concurrent_sessions || 0),
    });
  } catch (error) {
    console.log(`Admin analytics reset active sessions error: ${error}`);
    return c.json({ error: 'Error resetting active sessions' }, 500);
  }
});

app.get('/server/admin/analytics/sessions/active', async (c) => {
  try {
    const auth = await requireAdmin(c);
    if (auth.error) return auth.error;
    const currentSessionId = String(c.req.query('currentSessionId') || '').trim();

    const snapshot = await syncConcurrentSessions();
    const supabase = getSupabaseClient(true);
    const { data, error } = await supabase
      .from('analytics_active_sessions')
      .select('session_id, user_type, started_at, last_seen_at')
      .order('last_seen_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    const now = Date.now();
    const sessions: any[] = [];

    for (const item of (data || [])) {
      const sessionId = String(item?.session_id || '');
      const sessionMeta = sessionId ? await kv.get(getSessionMetaKey(sessionId)) : null;
      const startedAt = item?.started_at || null;
      const lastSeenAt = item?.last_seen_at || startedAt;
      const lastSeenTime = new Date(String(lastSeenAt || '')).getTime();
      const ageSeconds = Number.isFinite(lastSeenTime)
        ? Math.max(0, Math.floor((now - lastSeenTime) / 1000))
        : null;

      sessions.push({
        sessionId,
        userType: sessionMeta?.userType || item?.user_type || 'unknown',
        userId: sessionMeta?.userId || null,
        userName: sessionMeta?.userName || null,
        userEmail: sessionMeta?.userEmail || null,
        lastPath: sessionMeta?.lastPath || null,
        lastActivityType: sessionMeta?.lastActivityType || null,
        lastActivityAt: sessionMeta?.lastActivityAt || null,
        isCurrentSession: Boolean(currentSessionId && sessionId === currentSessionId),
        startedAt,
        lastSeenAt,
        ageSeconds,
      });
    }

    const activeSessions = sessions.length;
    const concurrentSessions = activeSessions > 1 ? activeSessions : 0;

    return c.json({
      activeSessions,
      concurrentSessions,
      peakConcurrentSessions: Math.max(Number(snapshot.peakConcurrentSessions || 0), concurrentSessions),
      currentSessionId: currentSessionId || null,
      sessions,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.log(`Admin analytics active sessions error: ${error}`);
    return c.json({ error: 'Error getting active sessions' }, 500);
  }
});

app.get('/server/admin/analytics/sessions/:sessionId/activity', async (c) => {
  try {
    const auth = await requireAdmin(c);
    if (auth.error) return auth.error;

    const sessionId = c.req.param('sessionId');
    const limitRaw = Number(c.req.query('limit') || 25);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 25;

    if (!sessionId) {
      return c.json({ error: 'sessionId is required' }, 400);
    }

    const sessionMeta = await kv.get(getSessionMetaKey(sessionId));
    const rawEvents = await kv.get(getSessionActivityKey(sessionId));
    const events = Array.isArray(rawEvents) ? rawEvents.slice(0, limit) : [];

    return c.json({
      sessionId,
      userName: sessionMeta?.userName || null,
      userEmail: sessionMeta?.userEmail || null,
      userType: sessionMeta?.userType || null,
      lastPath: sessionMeta?.lastPath || null,
      lastActivityType: sessionMeta?.lastActivityType || null,
      lastActivityAt: sessionMeta?.lastActivityAt || null,
      events,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.log(`Admin analytics session activity error: ${error}`);
    return c.json({ error: 'Error getting session activity' }, 500);
  }
});

app.delete('/server/admin/analytics/sessions/:sessionId', async (c) => {
  try {
    const auth = await requireAdmin(c);
    if (auth.error) return auth.error;

    const sessionId = c.req.param('sessionId');
    const supabase = getSupabaseClient(true);
    const { data: current, error: currentError } = await supabase
      .from('analytics_active_sessions')
      .select('session_id')
      .eq('session_id', sessionId)
      .maybeSingle();
    if (currentError) {
      throw new Error(currentError.message);
    }

    if (!current) {
      return c.json({ error: 'Session not found' }, 404);
    }

    const { data, error } = await supabase.rpc('analytics_close_session_tx', {
      p_session_id: sessionId,
    });
    if (error) {
      throw new Error(error.message);
    }

    await kv.del(getSessionMetaKey(sessionId));
    await kv.del(getSessionActivityKey(sessionId));

    return c.json({
      message: 'Session closed',
      sessionId,
      activeSessions: Number(data?.active_sessions || 0),
      concurrentSessions: Number(data?.concurrent_sessions || 0),
    });
  } catch (error) {
    console.log(`Admin analytics close session error: ${error}`);
    return c.json({ error: 'Error closing session' }, 500);
  }
});

app.post('/server/admin/analytics/sessions/close-all', async (c) => {
  try {
    const auth = await requireAdmin(c);
    if (auth.error) return auth.error;

    const payload = await c.req.json().catch(() => ({}));
    const excludeSessionId = String(payload?.excludeSessionId || '').trim();

    const supabase = getSupabaseClient(true);
    const { data: activeRows, error: countError } = await supabase
      .from('analytics_active_sessions')
      .select('session_id');
    if (countError) {
      throw new Error(countError.message);
    }

    const rows = activeRows || [];
    const toClose = rows
      .map((item: any) => String(item?.session_id || ''))
      .filter((sessionId: string) => sessionId && sessionId !== excludeSessionId);

    if (toClose.length > 0) {
      const { error: deleteError } = await supabase
        .from('analytics_active_sessions')
        .delete()
        .in('session_id', toClose);
      if (deleteError) {
        throw new Error(deleteError.message);
      }

      const metaKeys = toClose.map((sessionId: string) => getSessionMetaKey(sessionId));
      await kv.mdel(metaKeys);
      const activityKeys = toClose.map((sessionId: string) => getSessionActivityKey(sessionId));
      await kv.mdel(activityKeys);
    }

    const snapshot = await syncConcurrentSessions();

    return c.json({
      message: excludeSessionId
        ? 'All active sessions closed except current admin session'
        : 'All active sessions closed',
      removedSessions: toClose.length,
      preservedSessionId: excludeSessionId || null,
      activeSessions: Number(snapshot?.activeSessions || 0),
      concurrentSessions: Number(snapshot?.concurrentSessions || 0),
    });
  } catch (error) {
    console.log(`Admin analytics close all sessions error: ${error}`);
    return c.json({ error: 'Error closing all sessions' }, 500);
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

    // Users can only read their own stats.
    if (user.id !== userId) {
      return c.json({ error: 'Forbidden' }, 403);
    }

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
ensureAdminUser();

Deno.serve(app.fetch);