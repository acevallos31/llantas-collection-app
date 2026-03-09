// @ts-nocheck
// Este archivo usa Deno runtime y módulos npm:/jsr: que TypeScript no reconoce
import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import * as kv from "./kv_store.ts";

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

const normalizeLabel = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const pointAcceptsTireType = (point: any, tireType?: string) => {
  const acceptedTypes = Array.isArray(point?.acceptedTypes) ? point.acceptedTypes : [];
  if (!tireType || acceptedTypes.length === 0) return true;
  const normalizedType = normalizeLabel(tireType);
  return acceptedTypes.some((type: string) => normalizeLabel(type) === normalizedType);
};

const normalizeCollectionItems = (collection: any) => {
  const rawItems = Array.isArray(collection?.collectionItems) ? collection.collectionItems : [];
  if (rawItems.length > 0) {
    return rawItems.map((item: any) => ({
      tireType: String(item?.tireType || collection?.tireType || 'otro'),
      tireCondition: normalizeTireCondition(item?.tireCondition || collection?.tireCondition),
      tireCount: Math.max(1, Number(item?.tireCount || 1)),
    }));
  }

  return [{
    tireType: String(collection?.tireType || 'otro'),
    tireCondition: normalizeTireCondition(collection?.tireCondition),
    tireCount: Math.max(1, Number(collection?.tireCount || 1)),
  }];
};

const calculateCollectorBonusPointsForCollection = (collection: any, collectorBonusMap: Map<string, number>) => {
  const normalizedItems = normalizeCollectionItems(collection);

  return normalizedItems.reduce((sum: number, item: any) => {
    const key = `${normalizeLabel(item.tireType)}|${normalizeLabel(item.tireCondition)}`;
    const bonusPerTire = Number(collectorBonusMap.get(key) || 0);
    return sum + (bonusPerTire * Number(item.tireCount || 0));
  }, 0);
};

const calculateGeneratorCompensationForCollection = (
  collection: any,
  generatorRateMap: Map<string, { pointsPerTire: number; cashPerTire: number; minPointsOnCash: number }>,
  paymentPreference: string,
  defaults: { pointsPerTire: number; cashPerTire: number; minPointsOnCash: number },
) => {
  const normalizedItems = normalizeCollectionItems(collection);
  const preference = paymentPreference === 'cash' ? 'cash' : 'points';

  let cashAmount = 0;
  let pointsAwarded = 0;

  for (const item of normalizedItems) {
    const key = `${normalizeLabel(item.tireType)}|${normalizeLabel(item.tireCondition)}`;
    const rate = generatorRateMap.get(key);

    const pointsPerTire = Number(rate?.pointsPerTire ?? defaults.pointsPerTire);
    const cashPerTire = Number(rate?.cashPerTire ?? defaults.cashPerTire);
    const minPointsOnCash = Number(rate?.minPointsOnCash ?? defaults.minPointsOnCash);
    const tireCount = Number(item.tireCount || 0);

    if (preference === 'cash') {
      cashAmount += cashPerTire * tireCount;
      pointsAwarded += minPointsOnCash * tireCount;
    } else {
      pointsAwarded += pointsPerTire * tireCount;
    }
  }

  return {
    cashAmount: Number(cashAmount.toFixed(2)),
    pointsAwarded,
  };
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

const findRedemptionById = async (redemptionId: string) => {
  const redemptionKeys = await kv.getKeysByPrefix('redemption:');
  for (const key of redemptionKeys) {
    const value = await kv.get(key);
    if (value?.id === redemptionId) {
      return { key, value };
    }
  }
  return null;
};

const repairMojibake = (value: unknown) => {
  const text = String(value ?? '');
  if (!text) return '';

  // Fast path: skip when text does not look like mojibake.
  if (!/[ÃÂâ]/.test(text)) return text;

  try {
    const bytes = new Uint8Array(Array.from(text).map((ch) => ch.charCodeAt(0)).filter((code) => code >= 0 && code <= 255));
    const repaired = new TextDecoder('utf-8').decode(bytes);
    return repaired || text;
  } catch {
    return text;
  }
};

const escapeHtml = (value: unknown) => {
  const text = String(value ?? '');
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
};

const PRICING_DEFAULTS = {
  generatorTariffsByCondition: {
    excelente: 300,
    buena: 180,
    regular: 90,
    desgastada: 20,
  },
  collectorFreight: {
    min: 15,
    max: 25,
  },
  currency: 'HNL',
};

const getPricingSettings = async () => {
  const stored = await kv.get('app:pricing');
  return {
    ...PRICING_DEFAULTS,
    ...(stored || {}),
    generatorTariffsByCondition: {
      ...PRICING_DEFAULTS.generatorTariffsByCondition,
      ...(stored?.generatorTariffsByCondition || {}),
    },
    collectorFreight: {
      ...PRICING_DEFAULTS.collectorFreight,
      ...(stored?.collectorFreight || {}),
    },
  };
};

const normalizeTireCondition = (value?: string) => {
  const normalized = String(value || 'regular').toLowerCase().trim();
  if (normalized === 'excelente') return 'excelente';
  if (normalized === 'buena') return 'buena';
  if (normalized === 'desgastada') return 'desgastada';
  return 'regular';
};

const toRad = (value: number) => (value * Math.PI) / 180;

const haversineKm = (
  origin: { lat: number; lng: number },
  target: { lat: number; lng: number },
) => {
  const earthRadiusKm = 6371;
  const dLat = toRad(target.lat - origin.lat);
  const dLng = toRad(target.lng - origin.lng);
  const lat1 = toRad(origin.lat);
  const lat2 = toRad(target.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
};

const estimateCollectorFreight = (totalDistanceKm: number, minValue: number, maxValue: number) => {
  const minSafe = Math.max(0, Number(minValue || 0));
  const maxSafe = Math.max(minSafe, Number(maxValue || minSafe));
  if (maxSafe === minSafe) return minSafe;

  const normalized = Math.min(Math.max(totalDistanceKm / 30, 0), 1);
  return Number((minSafe + (maxSafe - minSafe) * normalized).toFixed(2));
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
const getBlockedSessionKey = (sessionId: string) => `analytics:blocked-session:${sessionId}`;
const getScreenShareRequestKey = (sessionId: string) => `analytics:screen-share:request:${sessionId}`;
const getScreenShareOfferKey = (sessionId: string) => `analytics:screen-share:offer:${sessionId}`;
const getScreenShareAnswerKey = (sessionId: string) => `analytics:screen-share:answer:${sessionId}`;
const getScreenShareIceCollectorKey = (sessionId: string) => `analytics:screen-share:ice:collector:${sessionId}`;
const getScreenShareIceAdminKey = (sessionId: string) => `analytics:screen-share:ice:admin:${sessionId}`;

const canAccessScreenShareSession = async (user: any, sessionId: string) => {
  if (!user?.id || !sessionId) return false;
  if (user?.type === 'admin') return true;

  const meta = await kv.get(getSessionMetaKey(sessionId));
  if (!meta) return false;

  if (meta.userId && String(meta.userId) === String(user.id)) {
    return true;
  }

  return false;
};

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

const blockSession = async (sessionId: string, reason = 'closed_by_admin') => {
  if (!sessionId) return;
  await kv.set(getBlockedSessionKey(sessionId), {
    sessionId,
    reason,
    blockedAt: new Date().toISOString(),
  });
};

const isSessionBlocked = async (sessionId: string) => {
  if (!sessionId) return false;
  const blocked = await kv.get(getBlockedSessionKey(sessionId));
  return Boolean(blocked);
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
    if (sessionId && await isSessionBlocked(sessionId)) {
      return c.json({ error: 'Session blocked by admin', code: 'SESSION_BLOCKED' }, 409);
    }
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
    const parsedLoadTime = Number(payload?.loadTimeMs || 0);
    if (!Number.isFinite(parsedLoadTime)) {
      return c.json({ error: 'loadTimeMs must be a number' }, 400);
    }
    // DB expects bigint-compatible integer values.
    const loadTimeMs = Math.max(0, Math.round(parsedLoadTime));

    const supabase = getSupabaseClient(true);
    
    // First ensure analytics_overview row exists
    const { error: initError } = await supabase
      .from('analytics_overview')
      .upsert({ id: 1 }, { onConflict: 'id', ignoreDuplicates: true });
    
    if (initError) {
      return c.json({ 
        error: 'Failed to initialize analytics_overview',
        details: initError.message,
        code: initError.code,
        hint: initError.hint
      }, 500);
    }
    
    // Use ACID function for safe concurrent updates
    const { data, error } = await supabase.rpc('analytics_track_load', {
      p_load_time_ms: loadTimeMs,
      p_user_type: payload?.userType || 'unknown',
    });

    if (error) {
      // Some environments may have overloaded analytics_track_load signatures.
      // PostgREST returns PGRST203 when it cannot disambiguate by JSON argument types.
      if (error.code === 'PGRST203') {
        const safeUserType = payload?.userType || 'unknown';

        const { error: eventError } = await supabase
          .from('analytics_events')
          .insert({
            type: 'load',
            user_type: safeUserType,
            load_time_ms: loadTimeMs,
          });

        if (eventError) {
          return c.json({
            error: 'Fallback event insert failed',
            details: eventError.message,
            code: eventError.code,
            hint: eventError.hint,
          }, 500);
        }

        const { data: overview, error: overviewReadError } = await supabase
          .from('analytics_overview')
          .select('total_app_load_time_ms, app_load_sample_count')
          .eq('id', 1)
          .single();

        if (overviewReadError) {
          return c.json({
            error: 'Fallback overview read failed',
            details: overviewReadError.message,
            code: overviewReadError.code,
            hint: overviewReadError.hint,
          }, 500);
        }

        const { error: overviewUpdateError } = await supabase
          .from('analytics_overview')
          .update({
            total_app_load_time_ms: Number(overview?.total_app_load_time_ms || 0) + loadTimeMs,
            app_load_sample_count: Number(overview?.app_load_sample_count || 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', 1);

        if (overviewUpdateError) {
          return c.json({
            error: 'Fallback overview update failed',
            details: overviewUpdateError.message,
            code: overviewUpdateError.code,
            hint: overviewUpdateError.hint,
          }, 500);
        }

        return c.json({
          message: 'Load time tracked (fallback due to overloaded RPC)',
          code: 'ANALYTICS_LOAD_FALLBACK',
        }, 201);
      }

      return c.json({ 
        error: 'Database function error', 
        details: error.message,
        code: error.code,
        hint: error.hint,
        fullError: JSON.stringify(error)
      }, 500);
    }

    return c.json({ message: 'Load time tracked', data }, 201);
  } catch (error) {
    return c.json({ 
      error: 'Error tracking load time',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 500);
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
    if (await isSessionBlocked(sessionId)) {
      return c.json({ error: 'Session blocked by admin', code: 'SESSION_BLOCKED' }, 409);
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
    if (await isSessionBlocked(sessionId)) {
      return c.json({ error: 'Session blocked by admin', code: 'SESSION_BLOCKED' }, 409);
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

app.post('/server/analytics/session/screen-share-request', async (c) => {
  const adminCheck = await requireAdmin(c);
  if (adminCheck.error) return adminCheck.error;

  try {
    const payload = await c.req.json();
    const sessionId = String(payload?.sessionId || '').trim();
    if (!sessionId) {
      return c.json({ error: 'sessionId is required' }, 400);
    }

    const request = {
      sessionId,
      requesterId: adminCheck.user?.id || payload?.requesterId || null,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await kv.set(getScreenShareRequestKey(sessionId), request);
    await kv.del(getScreenShareOfferKey(sessionId));
    await kv.del(getScreenShareAnswerKey(sessionId));
    await kv.del(getScreenShareIceCollectorKey(sessionId));
    await kv.del(getScreenShareIceAdminKey(sessionId));

    return c.json({ message: 'Screen-share request created', request }, 201);
  } catch (error) {
    console.log(`Screen-share request error: ${error}`);
    return c.json({ error: 'Error creating screen-share request' }, 500);
  }
});

app.post('/server/analytics/session/screen-share-request/self', async (c) => {
  try {
    const payload = await c.req.json();
    const sessionId = String(payload?.sessionId || '').trim();
    if (!sessionId) {
      return c.json({ error: 'sessionId is required' }, 400);
    }

    const resolvedUser = await resolveAuthenticatedUserFromRequest(c);
    if (!resolvedUser?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Ensure session metadata exists with userId before checking permissions
    await upsertSessionMeta(sessionId, {
      userId: resolvedUser.id,
      userType: resolvedUser.type,
    });

    const allowed = await canAccessScreenShareSession(resolvedUser, sessionId);
    if (!allowed) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const current = (await kv.get(getScreenShareRequestKey(sessionId))) || {};
    const request = {
      ...current,
      sessionId,
      requesterId: resolvedUser.id,
      requesterType: resolvedUser.type,
      status: 'user-requested',
      createdAt: current?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await kv.set(getScreenShareRequestKey(sessionId), request);
    return c.json({ message: 'Remote assistance requested', request }, 201);
  } catch (error) {
    console.log(`Screen-share self-request error: ${error}`);
    return c.json({ error: 'Error requesting remote assistance' }, 500);
  }
});

app.get('/server/analytics/session/screen-share-request/:sessionId', async (c) => {
  try {
    const sessionId = String(c.req.param('sessionId') || '').trim();
    if (!sessionId) {
      return c.json({ error: 'sessionId is required' }, 400);
    }

    const resolvedUser = await resolveAuthenticatedUserFromRequest(c);
    if (!resolvedUser?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const allowed = await canAccessScreenShareSession(resolvedUser, sessionId);
    if (!allowed) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const request = await kv.get(getScreenShareRequestKey(sessionId));
    return c.json({ request: request || null });
  } catch (error) {
    console.log(`Screen-share request read error: ${error}`);
    return c.json({ error: 'Error reading screen-share request' }, 500);
  }
});

app.post('/server/analytics/session/screen-share-request/:sessionId/status', async (c) => {
  try {
    const sessionId = String(c.req.param('sessionId') || '').trim();
    if (!sessionId) {
      return c.json({ error: 'sessionId is required' }, 400);
    }

    const resolvedUser = await resolveAuthenticatedUserFromRequest(c);
    if (!resolvedUser?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const allowed = await canAccessScreenShareSession(resolvedUser, sessionId);
    if (!allowed) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const payload = await c.req.json();
    const status = String(payload?.status || '').trim();
    if (!['accepted', 'rejected', 'pending', 'stopped', 'user-requested'].includes(status)) {
      return c.json({ error: 'Invalid status' }, 400);
    }

    const current = (await kv.get(getScreenShareRequestKey(sessionId))) || {
      sessionId,
      requesterId: null,
      createdAt: new Date().toISOString(),
    };

    const nextRequest = {
      ...current,
      status,
      updatedAt: new Date().toISOString(),
      responderUserId: resolvedUser.id,
    };

    await kv.set(getScreenShareRequestKey(sessionId), nextRequest);

    if (status === 'stopped') {
      await kv.del(getScreenShareOfferKey(sessionId));
      await kv.del(getScreenShareAnswerKey(sessionId));
      await kv.del(getScreenShareIceCollectorKey(sessionId));
      await kv.del(getScreenShareIceAdminKey(sessionId));
    }

    return c.json({ message: 'Request status updated', request: nextRequest });
  } catch (error) {
    console.log(`Screen-share request status error: ${error}`);
    return c.json({ error: 'Error updating screen-share request status' }, 500);
  }
});

app.post('/server/analytics/session/screen-share-offer', async (c) => {
  try {
    const payload = await c.req.json();
    const sessionId = String(payload?.sessionId || '').trim();
    const sdp = String(payload?.sdp || '').trim();

    if (!sessionId || !sdp) {
      return c.json({ error: 'sessionId and sdp are required' }, 400);
    }

    const resolvedUser = await resolveAuthenticatedUserFromRequest(c);
    if (!resolvedUser?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const allowed = await canAccessScreenShareSession(resolvedUser, sessionId);
    if (!allowed) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const offer = {
      sessionId,
      sdp,
      createdAt: new Date().toISOString(),
      userId: resolvedUser.id,
    };
    await kv.set(getScreenShareOfferKey(sessionId), offer);
    return c.json({ message: 'Offer stored' }, 201);
  } catch (error) {
    console.log(`Screen-share offer error: ${error}`);
    return c.json({ error: 'Error storing offer' }, 500);
  }
});

app.get('/server/analytics/session/screen-share-offer/:sessionId', async (c) => {
  const adminCheck = await requireAdmin(c);
  if (adminCheck.error) return adminCheck.error;

  try {
    const sessionId = String(c.req.param('sessionId') || '').trim();
    if (!sessionId) {
      return c.json({ error: 'sessionId is required' }, 400);
    }

    const offer = await kv.get(getScreenShareOfferKey(sessionId));
    return c.json({ offer: offer || null });
  } catch (error) {
    console.log(`Screen-share offer read error: ${error}`);
    return c.json({ error: 'Error reading offer' }, 500);
  }
});

app.post('/server/analytics/session/screen-share-answer', async (c) => {
  const adminCheck = await requireAdmin(c);
  if (adminCheck.error) return adminCheck.error;

  try {
    const payload = await c.req.json();
    const sessionId = String(payload?.sessionId || '').trim();
    const sdp = String(payload?.sdp || '').trim();

    if (!sessionId || !sdp) {
      return c.json({ error: 'sessionId and sdp are required' }, 400);
    }

    const answer = {
      sessionId,
      sdp,
      createdAt: new Date().toISOString(),
      userId: adminCheck.user?.id || null,
    };
    await kv.set(getScreenShareAnswerKey(sessionId), answer);
    return c.json({ message: 'Answer stored' }, 201);
  } catch (error) {
    console.log(`Screen-share answer error: ${error}`);
    return c.json({ error: 'Error storing answer' }, 500);
  }
});

app.get('/server/analytics/session/screen-share-answer/:sessionId', async (c) => {
  try {
    const sessionId = String(c.req.param('sessionId') || '').trim();
    if (!sessionId) {
      return c.json({ error: 'sessionId is required' }, 400);
    }

    const resolvedUser = await resolveAuthenticatedUserFromRequest(c);
    if (!resolvedUser?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const allowed = await canAccessScreenShareSession(resolvedUser, sessionId);
    if (!allowed) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const answer = await kv.get(getScreenShareAnswerKey(sessionId));
    return c.json({ answer: answer || null });
  } catch (error) {
    console.log(`Screen-share answer read error: ${error}`);
    return c.json({ error: 'Error reading answer' }, 500);
  }
});

app.post('/server/analytics/session/screen-share-ice', async (c) => {
  try {
    const payload = await c.req.json();
    const sessionId = String(payload?.sessionId || '').trim();
    const candidate = payload?.candidate || null;

    if (!sessionId || !candidate) {
      return c.json({ error: 'sessionId and candidate are required' }, 400);
    }

    const resolvedUser = await resolveAuthenticatedUserFromRequest(c);
    if (!resolvedUser?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const allowed = await canAccessScreenShareSession(resolvedUser, sessionId);
    if (!allowed) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const key = getScreenShareIceCollectorKey(sessionId);
    const current = (await kv.get(key)) || [];
    const safeCurrent = Array.isArray(current) ? current : [];
    const next = [
      ...safeCurrent,
      {
        candidate,
        createdAt: new Date().toISOString(),
      },
    ].slice(-50);
    await kv.set(key, next);

    return c.json({ message: 'ICE candidate stored' }, 201);
  } catch (error) {
    console.log(`Screen-share collector ICE error: ${error}`);
    return c.json({ error: 'Error storing ICE candidate' }, 500);
  }
});

app.post('/server/analytics/session/screen-share-ice/admin', async (c) => {
  const adminCheck = await requireAdmin(c);
  if (adminCheck.error) return adminCheck.error;

  try {
    const payload = await c.req.json();
    const sessionId = String(payload?.sessionId || '').trim();
    const candidate = payload?.candidate || null;

    if (!sessionId || !candidate) {
      return c.json({ error: 'sessionId and candidate are required' }, 400);
    }

    const key = getScreenShareIceAdminKey(sessionId);
    const current = (await kv.get(key)) || [];
    const safeCurrent = Array.isArray(current) ? current : [];
    const next = [
      ...safeCurrent,
      {
        candidate,
        createdAt: new Date().toISOString(),
      },
    ].slice(-50);
    await kv.set(key, next);

    return c.json({ message: 'Admin ICE candidate stored' }, 201);
  } catch (error) {
    console.log(`Screen-share admin ICE error: ${error}`);
    return c.json({ error: 'Error storing admin ICE candidate' }, 500);
  }
});

app.get('/server/analytics/session/screen-share-ice/:sessionId/admin', async (c) => {
  try {
    const sessionId = String(c.req.param('sessionId') || '').trim();
    if (!sessionId) {
      return c.json({ error: 'sessionId is required' }, 400);
    }

    const resolvedUser = await resolveAuthenticatedUserFromRequest(c);
    if (!resolvedUser?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const allowed = await canAccessScreenShareSession(resolvedUser, sessionId);
    if (!allowed) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const rawCandidates = (await kv.get(getScreenShareIceAdminKey(sessionId))) || [];
    const candidates = Array.isArray(rawCandidates)
      ? rawCandidates.map((item: any) => item?.candidate).filter(Boolean)
      : [];
    return c.json({ candidates });
  } catch (error) {
    console.log(`Screen-share admin ICE read error: ${error}`);
    return c.json({ error: 'Error reading admin ICE candidates' }, 500);
  }
});

app.get('/server/analytics/session/screen-share-ice/:sessionId/collector', async (c) => {
  const adminCheck = await requireAdmin(c);
  if (adminCheck.error) return adminCheck.error;

  try {
    const sessionId = String(c.req.param('sessionId') || '').trim();
    if (!sessionId) {
      return c.json({ error: 'sessionId is required' }, 400);
    }

    const rawCandidates = (await kv.get(getScreenShareIceCollectorKey(sessionId))) || [];
    const candidates = Array.isArray(rawCandidates)
      ? rawCandidates.map((item: any) => item?.candidate).filter(Boolean)
      : [];
    return c.json({ candidates });
  } catch (error) {
    console.log(`Screen-share collector ICE read error: ${error}`);
    return c.json({ error: 'Error reading collector ICE candidates' }, 500);
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
    const isAdmin = userProfile?.type === 'admin';

    const collection = isCollector
      ? await findCollectionById(collectionId)
      : await kv.get(`collection:${user.id}:${collectionId}`);
    
    if (!collection) {
      return c.json({ error: 'Collection not found' }, 404);
    }

    const canSeeGeneratorContact = isCollector
      || isAdmin
      || collection.userId === user.id;

    if (canSeeGeneratorContact && collection.userId) {
      const generatorProfile = await kv.get(`user:${collection.userId}`);
      if (generatorProfile) {
        collection.generatorName = generatorProfile.name || null;
        collection.generatorPhone = generatorProfile.phone || null;
        collection.generatorEmail = generatorProfile.email || null;
      }
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

    const allowedConditions = new Set(['excelente', 'buena', 'regular', 'desgastada']);
    const normalizeItem = (item: any) => {
      const tireType = String(item?.tireType || 'Otro').trim() || 'Otro';
      const rawCondition = String(item?.tireCondition || 'regular').toLowerCase().trim();
      const tireCondition = allowedConditions.has(rawCondition) ? rawCondition : 'regular';
      const tireCount = Math.max(1, Number.parseInt(String(item?.tireCount || 1), 10) || 1);
      return { tireType, tireCondition, tireCount };
    };

    const incomingItems = Array.isArray(collectionData.collectionItems)
      ? collectionData.collectionItems.map(normalizeItem)
      : [];

    const fallbackItem = normalizeItem({
      tireType: collectionData.tireType,
      tireCondition: collectionData.tireCondition,
      tireCount: collectionData.tireCount,
    });

    const collectionItems = incomingItems.length > 0 ? incomingItems : [fallbackItem];
    const totalTireCount = collectionItems.reduce((sum, item) => sum + item.tireCount, 0);
    const uniqueTypes = [...new Set(collectionItems.map((item) => item.tireType))];
    const uniqueConditions = [...new Set(collectionItems.map((item) => item.tireCondition))];
    const tireTypeSummary = uniqueTypes.length === 1 ? uniqueTypes[0] : 'Mixto';
    const tireConditionSummary = uniqueConditions.length === 1 ? uniqueConditions[0] : 'mixto';
    
    // Calculate points (30 points per tire)
    const points = totalTireCount * 30;
    
    const qrCode = generateQrCode(user.id, collectionId);
    const collection = {
      id: collectionId,
      userId: user.id,
      ...collectionData,
      tireCount: totalTireCount,
      tireType: tireTypeSummary,
      tireCondition: tireConditionSummary,
      collectionItems,
      points,
      status: 'available',
      createdAt: new Date().toISOString(),
      traceability: {
        qrCode,
        currentStage: 'registrada',
        events: [
          createTraceEvent(
            'registrada',
            'generator',
            'Lote registrado en EcolLantApp',
            {
              userId: user.id,
              tireCount: totalTireCount,
              itemCount: collectionItems.length,
              tireType: tireTypeSummary,
            },
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

// Collector takes an available collection (atomic compare-and-set style)
app.post('/server/collector/collections/:collectionId/take', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getSupabaseClient(true);
    const { data: { user } } = await supabase.auth.getUser(accessToken);

    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const userProfile = await kv.get(`user:${user.id}`);
    if (!userProfile || userProfile.type !== 'collector') {
      return c.json({ error: 'Forbidden: Collector access required' }, 403);
    }

    const collectionId = c.req.param('collectionId');
    const found = await findCollectionKeyById(collectionId);

    if (!found?.key || !found?.value) {
      return c.json({ error: 'Collection not found' }, 404);
    }

    const current = found.value;
    const currentStatus = String(current?.status || '').toLowerCase();
    const hasCollector = Boolean(current?.collectorId);

    // Idempotent behavior: if this collector already has the collection, treat as success.
    if (hasCollector && current?.collectorId === user.id && (currentStatus === 'pending' || currentStatus === 'in-progress')) {
      return c.json(current);
    }

    const canTake = !hasCollector && (currentStatus === 'available' || currentStatus === 'pending');

    if (!canTake) {
      return c.json({ error: 'Collection is no longer available' }, 409);
    }

    // Parse payment info from request body if provided
    const body = await c.req.json().catch(() => ({}));
    const collectorFreight = body.collectorFreight || 0;
    const collectorBonusPoints = body.collectorBonusPoints || 0;

    const nextCollection = {
      ...current,
      status: 'pending',
      collectorId: user.id,
      collectorName: userProfile?.name || 'Recolector',
      collectorPaymentAmount: collectorFreight,
      collectorBonusPoints: collectorBonusPoints,
      updatedAt: new Date().toISOString(),
      traceability: {
        ...(current.traceability || {}),
        currentStage: 'en-proceso',
        events: [
          ...((current.traceability?.events as any[]) || []),
          createTraceEvent(
            'en-proceso',
            'collector',
            `Recolector asignado y recoleccion tomada (Pago: ${collectorFreight} HNL + ${collectorBonusPoints} pts)`,
            { collectorId: user.id, collectorFreight, collectorBonusPoints },
          ),
        ],
      },
    };

    // Re-check just before writing to avoid stale reads from previous request cycles.
    const latest = await findCollectionKeyById(collectionId);
    const latestStatus = String(latest?.value?.status || '').toLowerCase();
    const latestHasCollector = Boolean(latest?.value?.collectorId);

    if (latestHasCollector && latest?.value?.collectorId === user.id && (latestStatus === 'pending' || latestStatus === 'in-progress')) {
      return c.json(latest.value);
    }

    const latestCanTake = Boolean(latest?.key)
      && !latestHasCollector
      && (latestStatus === 'available' || latestStatus === 'pending');

    if (!latestCanTake) {
      return c.json({ error: 'Collection was taken by another collector' }, 409);
    }

    await kv.set(latest.key, nextCollection);
    return c.json(nextCollection);
  } catch (error) {
    console.log(`Collector take collection error: ${error}`);
    return c.json({ error: 'Error taking collection' }, 500);
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
      const canCancel = updates.status === 'cancelled' && ['available', 'pending'].includes(currentCollection.status);
      if (!canCancel) {
        return c.json({ error: 'Generators cannot change collection status' }, 403);
      }
    }

    if (isCollector && updates.status && !['available', 'pending', 'in-progress', 'arrived', 'completed', 'cancelled'].includes(updates.status)) {
      return c.json({ error: 'Invalid status for collector update' }, 400);
    }

    if (isCollector) {
      const currentCollectorId = currentCollection.collectorId || null;
      const isAssignedToRequester = currentCollectorId === user.id;

      if (updates.status === 'in-progress' || updates.status === 'arrived' || updates.status === 'completed') {
        if (!isAssignedToRequester) {
          return c.json({ error: 'This collection is assigned to another collector' }, 409);
        }
      }

      if (updates.status === 'cancelled') {
        return c.json({ error: 'Use available status to release the collection' }, 400);
      }

      // Releasing a collection returns it to the shared available board.
      if (updates.status === 'available') {
        if (!isAssignedToRequester) {
          return c.json({ error: 'Cannot release a collection not assigned to you' }, 409);
        }
        updates.collectorId = null;
        updates.collectorName = null;
      }
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
        : updates.status === 'arrived'
          ? 'acopiada'
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

    // Award generator points when collector starts the pickup process.
    const collectorStartedPickup = isCollector
      && updates.status === 'in-progress'
      && currentCollection.status !== 'in-progress';

    if (collectorStartedPickup && !currentCollection.generatorPointsCreditedAtPickup) {
      const collectionOwnerProfile = await kv.get(`user:${updatedCollection.userId}`);
      const ownerStats = await kv.get(`stats:${updatedCollection.userId}`);

      if (collectionOwnerProfile && ownerStats) {
        collectionOwnerProfile.points = Number(collectionOwnerProfile.points || 0) + Number(updatedCollection.points || 0);

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

        ownerStats.totalPoints = collectionOwnerProfile.points;
        await kv.set(`stats:${updatedCollection.userId}`, ownerStats);
      }

      updatedCollection.generatorPointsCreditedAtPickup = new Date().toISOString();
    }
    
    // If collection is being completed, update user points and stats
    if (updates.status === 'completed' && currentCollection.status !== 'completed') {
      // Calculate collector compensation if not already set
      if (isCollector && (!updatedCollection.collectorPaymentAmount || !updatedCollection.collectorBonusPoints)) {
        const pricing = await getPricingSettings();
        
        // Get collector bonus points from database
        const normalizeLabel = (value: string) =>
          String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
        
        const { data: collectorRatesData } = await supabase
          .from('collector_tire_rates')
          .select('tire_type, tire_condition, bonus_points')
          .eq('is_active', true);

        const collectorBonusMap = new Map<string, number>();
        for (const rate of collectorRatesData || []) {
          const key = `${normalizeLabel(rate.tire_type)}|${normalizeLabel(rate.tire_condition)}`;
          collectorBonusMap.set(key, Number(rate.bonus_points || 0));
        }

        const collectorBonusPoints = calculateCollectorBonusPointsForCollection(updatedCollection, collectorBonusMap);
        
        // Estimate distance (if not available, use a default based on location)
        let estimatedDistanceKm = updatedCollection.distance_km || 10; // Default 10km if no distance
        
        // Calculate freight payment
        const collectorFreight = estimateCollectorFreight(
          estimatedDistanceKm,
          Number(pricing.collectorFreight.min || 15),
          Number(pricing.collectorFreight.max || 25),
        );
        
        // Store calculated values
        updatedCollection.collectorPaymentAmount = collectorFreight;
        updatedCollection.collectorBonusPoints = collectorBonusPoints;
        
        console.log(`[Collection Complete] Calculated compensation: ${collectorFreight} HNL, ${collectorBonusPoints} pts`);
      }
      
      const stats = await kv.get(`stats:${updatedCollection.userId}`);
      
      if (stats) {
        // Update generator stats on completion without re-crediting points.
        stats.totalCollections += 1;
        stats.totalTires += updatedCollection.tireCount;
        stats.co2Saved += updatedCollection.tireCount * 3.25; // kg per tire
        stats.treesEquivalent = Math.floor(stats.co2Saved / 20);
        stats.recycledWeight += updatedCollection.tireCount * 5; // kg per tire
        
        await kv.set(`stats:${updatedCollection.userId}`, stats);
      }

      // Calculate generator compensation from rates per item (type + condition).
      const { data: generatorRatesData } = await supabase
        .from('generator_tire_rates')
        .select('tire_type, tire_condition, points_per_tire, cash_per_tire, min_points_on_cash')
        .eq('is_active', true);

      const generatorRateMap = new Map<string, { pointsPerTire: number; cashPerTire: number; minPointsOnCash: number }>();
      for (const rate of generatorRatesData || []) {
        const key = `${normalizeLabel(rate.tire_type)}|${normalizeLabel(rate.tire_condition)}`;
        generatorRateMap.set(key, {
          pointsPerTire: Number(rate.points_per_tire || 0),
          cashPerTire: Number(rate.cash_per_tire || 0),
          minPointsOnCash: Number(rate.min_points_on_cash || 0),
        });
      }

      const generatorCompensation = calculateGeneratorCompensationForCollection(
        updatedCollection,
        generatorRateMap,
        updatedCollection.generatorPaymentPreference || 'points',
        {
          pointsPerTire: 100,
          cashPerTire: 5,
          minPointsOnCash: 5,
        },
      );

      updatedCollection.generatorPaymentAmount = generatorCompensation.cashAmount;
      updatedCollection.generatorPointsAwarded = generatorCompensation.pointsAwarded;
      
      // Update collector points if collection was completed by a collector
      if (updatedCollection.collectorId && updatedCollection.collectorBonusPoints > 0) {
        const collectorProfile = await kv.get(`user:${updatedCollection.collectorId}`);
        
        if (collectorProfile) {
          // Add collector bonus points
          collectorProfile.points = (collectorProfile.points || 0) + updatedCollection.collectorBonusPoints;
          
          // Update collector level based on points
          if (collectorProfile.points >= 1000) {
            collectorProfile.level = 'Eco Master';
          } else if (collectorProfile.points >= 500) {
            collectorProfile.level = 'Eco Champion';
          } else if (collectorProfile.points >= 200) {
            collectorProfile.level = 'Eco Warrior';
          } else if (collectorProfile.points >= 50) {
            collectorProfile.level = 'Eco Guardian';
          } else {
            collectorProfile.level = 'Eco Novato';
          }
          
          await kv.set(`user:${updatedCollection.collectorId}`, collectorProfile);
          
          // Update collector stats
          const collectorStats = await kv.get(`stats:${updatedCollection.collectorId}`) || {
            totalCollections: 0,
            totalTires: 0,
            totalPoints: 0,
            co2Saved: 0,
            treesEquivalent: 0,
            recycledWeight: 0,
          };
          
          collectorStats.totalCollections += 1;
          collectorStats.totalTires += updatedCollection.tireCount;
          collectorStats.totalPoints = collectorProfile.points;
          collectorStats.co2Saved += updatedCollection.tireCount * 3.25;
          collectorStats.treesEquivalent = Math.floor(collectorStats.co2Saved / 20);
          collectorStats.recycledWeight += updatedCollection.tireCount * 5;
          
          await kv.set(`stats:${updatedCollection.collectorId}`, collectorStats);
          
          console.log(`[Collection Complete] Collector ${updatedCollection.collectorId} awarded ${updatedCollection.collectorBonusPoints} points`);
        }
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

app.get('/server/admin/pricing', async (c) => {
  try {
    const auth = await requireAdmin(c);
    if (auth.error) return auth.error;

    const pricing = await getPricingSettings();
    return c.json(pricing);
  } catch (error) {
    console.log(`Admin pricing get error: ${error}`);
    return c.json({ error: 'Error getting pricing settings' }, 500);
  }
});

app.put('/server/admin/pricing', async (c) => {
  try {
    const auth = await requireAdmin(c);
    if (auth.error) return auth.error;

    const payload = await c.req.json();
    const current = await getPricingSettings();

    const rawTariffs = payload?.generatorTariffsByCondition || {};
    const tariffExcelente = Math.min(300, Math.max(20, Number(rawTariffs.excelente ?? current.generatorTariffsByCondition.excelente)));
    const tariffBuena = Math.min(300, Math.max(20, Number(rawTariffs.buena ?? current.generatorTariffsByCondition.buena)));
    const tariffRegular = Math.min(300, Math.max(20, Number(rawTariffs.regular ?? current.generatorTariffsByCondition.regular)));
    const tariffDesgastada = Math.min(300, Math.max(20, Number(rawTariffs.desgastada ?? current.generatorTariffsByCondition.desgastada)));

    const freightMin = Math.min(25, Math.max(15, Number(payload?.collectorFreight?.min ?? current.collectorFreight.min)));
    const freightMax = Math.min(25, Math.max(freightMin, Number(payload?.collectorFreight?.max ?? current.collectorFreight.max)));

    const merged = {
      ...current,
      generatorTariffsByCondition: {
        excelente: Number(tariffExcelente.toFixed(2)),
        buena: Number(tariffBuena.toFixed(2)),
        regular: Number(tariffRegular.toFixed(2)),
        desgastada: Number(tariffDesgastada.toFixed(2)),
      },
      collectorFreight: {
        min: Number(freightMin.toFixed(2)),
        max: Number(freightMax.toFixed(2)),
      },
      currency: 'HNL',
      updatedAt: new Date().toISOString(),
      updatedBy: auth.user.id,
    };

    await kv.set('app:pricing', merged);
    return c.json(merged);
  } catch (error) {
    console.log(`Admin pricing update error: ${error}`);
    return c.json({ error: 'Error updating pricing settings' }, 500);
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

    const { data: activeRowsToReset, error: rowsError } = await supabase
      .from('analytics_active_sessions')
      .select('session_id');
    if (rowsError) {
      throw new Error(rowsError.message);
    }

    const { data, error } = await supabase.rpc('analytics_close_all_sessions_tx');
    if (error) {
      throw new Error(error.message);
    }

    for (const row of (activeRowsToReset || [])) {
      const sessionId = String((row as any)?.session_id || '');
      if (sessionId) {
        await blockSession(sessionId, 'reset_active_sessions');
      }
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
    await blockSession(sessionId, 'closed_by_admin');

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
      for (const sessionId of toClose) {
        await blockSession(sessionId, 'closed_by_admin_bulk');
      }
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

// Helper to generate coupon code
const generateCouponCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'ECO-';
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 4 === 0) code += '-';
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code; // Format: ECO-XXXX-XXXX-XXXX
};

// Helper to generate coupon HTML
const generateCouponHTML = (couponCode: string, redemption: any, reward: any, user: any) => {
  const expiryDate = new Date(redemption.expiresAt).toLocaleDateString('es-HN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const safeCode = escapeHtml(repairMojibake(couponCode || ''));
  const safeRewardTitle = escapeHtml(repairMojibake(reward?.title || 'Recompensa'));
  const safeRewardDescription = escapeHtml(repairMojibake(reward?.description || 'Disfruta de tu recompensa en nuestros comercios afiliados.'));
  const safeUserName = escapeHtml(repairMojibake(user?.name || user?.email || 'Usuario'));
  const safePoints = Number(redemption?.pointsCost || 0);
  const safeRedemptionId = escapeHtml(repairMojibake(redemption?.id || ''));
  const safeSponsor = escapeHtml(repairMojibake(reward?.sponsor || ''));
  const issueDate = new Date(redemption.createdAt).toLocaleDateString('es-HN');
  const qrPayload = encodeURIComponent(JSON.stringify({
    couponCode: safeCode,
    redemptionId: safeRedemptionId,
    rewardId: String(redemption?.rewardId || ''),
    userId: String(redemption?.userId || ''),
    expiresAt: String(redemption?.expiresAt || ''),
  }));
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${qrPayload}`;
  
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Cupon EcolLant - ${safeCode}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px; }
    .coupon { max-width: 600px; margin: 0 auto; background: white; border: 3px solid #10b981; border-radius: 12px; overflow: hidden; }
    .actions { max-width: 600px; margin: 0 auto 12px auto; display: flex; gap: 8px; }
    .action-btn { border: 0; background: #065f46; color: #fff; border-radius: 8px; padding: 10px 14px; font-size: 13px; cursor: pointer; }
    .action-btn.secondary { background: #334155; }
    .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; }
    .header h1 { font-size: 28px; margin-bottom: 10px; }
    .header p { font-size: 14px; opacity: 0.9; }
    .content { padding: 30px; }
    .code-box { background: #f0fdf4; border: 2px dashed #10b981; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
    .code { font-size: 24px; font-weight: bold; color: #059669; letter-spacing: 2px; }
    .qr-wrap { margin: 20px 0; text-align: center; }
    .qr-wrap img { width: 170px; height: 170px; border: 1px solid #d1d5db; border-radius: 8px; padding: 6px; background: #fff; }
    .qr-caption { margin-top: 6px; font-size: 12px; color: #6b7280; }
    .reward-title { font-size: 22px; color: #1f2937; margin-bottom: 15px; font-weight: bold; }
    .reward-desc { color: #6b7280; margin-bottom: 20px; line-height: 1.6; }
    .info-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e5e7eb; }
    .info-label { color: #6b7280; font-size: 14px; }
    .info-value { color: #1f2937; font-weight: 600; font-size: 14px; }
    .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; }
    .instructions { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; }
    .instructions h3 { color: #92400e; font-size: 14px; margin-bottom: 8px; }
    .instructions p { color: #78350f; font-size: 13px; line-height: 1.5; }
    @media print {
      body { background: white; padding: 0; }
      .actions { display: none !important; }
      .coupon { border: 2px solid #10b981; }
    }
  </style>
</head>
<body>
  <div class="actions">
    <button class="action-btn" onclick="window.print()">Descargar / Imprimir PDF</button>
    <button class="action-btn secondary" onclick="window.close()">Cerrar</button>
  </div>
  <div class="coupon">
    <div class="header">
      <h1>Cupon de Recompensa</h1>
      <p>EcolLantApp - Reciclaje de Llantas</p>
    </div>
    <div class="content">
      <div class="code-box">
        <div style="font-size: 12px; color: #059669; margin-bottom: 8px;">CODIGO DEL CUPON</div>
        <div class="code">${safeCode}</div>
      </div>

      <div class="qr-wrap">
        <img src="${qrImageUrl}" alt="QR del cupon" />
        <p class="qr-caption">Escanea para validar el cupon</p>
      </div>
      
      <h2 class="reward-title">${safeRewardTitle}</h2>
      <p class="reward-desc">${safeRewardDescription}</p>
      
      <div class="info-row">
        <span class="info-label">Beneficiario:</span>
        <span class="info-value">${safeUserName}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Puntos Canjeados:</span>
        <span class="info-value">${safePoints} puntos</span>
      </div>
      <div class="info-row">
        <span class="info-label">Fecha de Emision:</span>
        <span class="info-value">${issueDate}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Valido hasta:</span>
        <span class="info-value">${expiryDate}</span>
      </div>
      ${safeSponsor ? `<div class="info-row">
        <span class="info-label">Comercio Afiliado:</span>
        <span class="info-value">${safeSponsor}</span>
      </div>` : ''}
      
      <div class="instructions">
        <h3>Instrucciones de Canje</h3>
        <p>1. Presenta este cupon (impreso o digital) en el comercio afiliado<br>
        2. El comercio verificara el codigo del cupon y/o QR<br>
        3. Una vez validado, podras disfrutar de tu recompensa<br>
        4. Este cupon es de un solo uso y no es transferible</p>
      </div>
    </div>
    <div class="footer">
      <p><strong>EcolLantApp</strong> - Sistema de Gestion de Reciclaje de Llantas</p>
      <p>Cupon ID: ${safeRedemptionId}</p>
      <p>Para mas informacion: soporte@ecollant.com | +504 2550-0001</p>
    </div>
  </div>
</body>
</html>`;
};

app.get('/server/admin/rewards', async (c) => {
  try {
    const auth = await requireAdmin(c);
    if (auth.error) return auth.error;

    const rewards = await kv.getByPrefix('reward:');
    rewards.sort((a: any, b: any) => String(a?.title || '').localeCompare(String(b?.title || '')));
    return c.json(rewards);
  } catch (error) {
    console.log(`Admin rewards get error: ${error}`);
    return c.json({ error: 'Error getting rewards catalog' }, 500);
  }
});

app.post('/server/admin/rewards', async (c) => {
  try {
    const auth = await requireAdmin(c);
    if (auth.error) return auth.error;

    const payload = await c.req.json();
    const title = String(payload?.title || '').trim();
    const description = String(payload?.description || '').trim();
    const category = String(payload?.category || 'General').trim() || 'General';
    const sponsor = String(payload?.sponsor || '').trim() || null;
    const pointsCost = Math.max(0, Number(payload?.pointsCost || 0));
    const available = payload?.available !== false;

    if (!title) {
      return c.json({ error: 'title is required' }, 400);
    }

    const rewardId = crypto.randomUUID();
    const reward = {
      id: rewardId,
      title,
      description,
      pointsCost,
      category,
      sponsor,
      available,
      createdAt: new Date().toISOString(),
      createdBy: auth.user.id,
    };

    await kv.set(`reward:${rewardId}`, reward);
    return c.json(reward, 201);
  } catch (error) {
    console.log(`Admin rewards create error: ${error}`);
    return c.json({ error: 'Error creating reward' }, 500);
  }
});

app.put('/server/admin/rewards/:rewardId', async (c) => {
  try {
    const auth = await requireAdmin(c);
    if (auth.error) return auth.error;

    const rewardId = c.req.param('rewardId');
    const current = await kv.get(`reward:${rewardId}`);
    if (!current) {
      return c.json({ error: 'Reward not found' }, 404);
    }

    const payload = await c.req.json();
    const updated = {
      ...current,
      title: payload?.title !== undefined ? String(payload.title || '').trim() : current.title,
      description: payload?.description !== undefined ? String(payload.description || '').trim() : current.description,
      category: payload?.category !== undefined ? String(payload.category || '').trim() : current.category,
      sponsor: payload?.sponsor !== undefined ? (String(payload.sponsor || '').trim() || null) : current.sponsor,
      pointsCost: payload?.pointsCost !== undefined ? Math.max(0, Number(payload.pointsCost || 0)) : Number(current.pointsCost || 0),
      available: payload?.available !== undefined ? Boolean(payload.available) : Boolean(current.available),
      updatedAt: new Date().toISOString(),
      updatedBy: auth.user.id,
    };

    if (!String(updated.title || '').trim()) {
      return c.json({ error: 'title is required' }, 400);
    }

    await kv.set(`reward:${rewardId}`, updated);
    return c.json(updated);
  } catch (error) {
    console.log(`Admin rewards update error: ${error}`);
    return c.json({ error: 'Error updating reward' }, 500);
  }
});

app.delete('/server/admin/rewards/:rewardId', async (c) => {
  try {
    const auth = await requireAdmin(c);
    if (auth.error) return auth.error;

    const rewardId = c.req.param('rewardId');
    const current = await kv.get(`reward:${rewardId}`);
    if (!current) {
      return c.json({ error: 'Reward not found' }, 404);
    }

    await kv.del(`reward:${rewardId}`);
    return c.json({ message: 'Reward deleted successfully' });
  } catch (error) {
    console.log(`Admin rewards delete error: ${error}`);
    return c.json({ error: 'Error deleting reward' }, 500);
  }
});

app.post('/server/admin/rewards/:rewardId/assign', async (c) => {
  try {
    const auth = await requireAdmin(c);
    if (auth.error) return auth.error;

    const rewardId = c.req.param('rewardId');
    const reward = await kv.get(`reward:${rewardId}`);
    if (!reward) {
      return c.json({ error: 'Reward not found' }, 404);
    }

    const payload = await c.req.json();
    const userId = String(payload?.userId || '').trim();
    const expiresInDaysRaw = Number(payload?.expiresInDays || 30);
    const expiresInDays = Math.min(90, Math.max(1, Number.isFinite(expiresInDaysRaw) ? expiresInDaysRaw : 30));

    if (!userId) {
      return c.json({ error: 'userId is required' }, 400);
    }

    const userProfile = await kv.get(`user:${userId}`);
    if (!userProfile) {
      return c.json({ error: 'Target user not found' }, 404);
    }

    const couponCode = generateCouponCode();
    const now = new Date();
    const expiresAt = new Date(now.getTime());
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    const redemptionId = crypto.randomUUID();
    const redemption = {
      id: redemptionId,
      userId,
      rewardId,
      rewardTitle: reward.title,
      pointsCost: Number(reward.pointsCost || 0),
      status: 'pending',
      couponCode,
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
      assignedBy: auth.user.id,
      assignmentType: 'admin_direct',
    };

    await kv.set(`redemption:${userId}:${redemptionId}`, redemption);

    const couponHTML = generateCouponHTML(couponCode, redemption, reward, userProfile);
    await kv.set(`coupon-html:${redemptionId}`, couponHTML);

    return c.json({
      message: 'Reward assigned successfully',
      redemption: {
        ...redemption,
        couponUrl: `/server/coupons/${redemptionId}`,
      },
    }, 201);
  } catch (error) {
    console.log(`Admin rewards assign error: ${error}`);
    return c.json({ error: 'Error assigning reward' }, 500);
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
    
    // Generate unique coupon code
    const couponCode = generateCouponCode();
    
    // Calculate expiry date (30 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    
    // Deduct points
    userProfile.points -= reward.pointsCost;
    await kv.set(`user:${user.id}`, userProfile);
    
    // Create redemption record with coupon
    const redemptionId = crypto.randomUUID();
    const now = new Date().toISOString();
    const redemption = {
      id: redemptionId,
      userId: user.id,
      rewardId,
      rewardTitle: reward.title,
      pointsCost: reward.pointsCost,
      status: 'pending',
      couponCode,
      expiresAt: expiresAt.toISOString(),
      createdAt: now,
    };
    
    await kv.set(`redemption:${user.id}:${redemptionId}`, redemption);
    
    // Generate coupon HTML
    const couponHTML = generateCouponHTML(couponCode, redemption, reward, userProfile);
    
    // Store HTML in Deno KV for retrieval
    await kv.set(`coupon-html:${redemptionId}`, couponHTML);
    
    return c.json({ 
      redemption: {
        ...redemption,
        couponUrl: `/server/coupons/${redemptionId}`,
      },
      newPointsBalance: userProfile.points 
    });
    
  } catch (error) {
    console.log(`Redeem reward error: ${error}`);
    return c.json({ error: 'Error redeeming reward' }, 500);
  }
});

// Get coupon HTML (for viewing/printing)
app.get("/server/coupons/:redemptionId", async (c) => {
  try {
    const redemptionId = c.req.param('redemptionId');
    const printMode = String(c.req.query('print') || '').toLowerCase() === '1';

    const redemptionData = await findRedemptionById(redemptionId);
    if (!redemptionData?.value) {
      return new Response('<h1>Cupon no encontrado</h1><p>Este cupon no existe o ha expirado.</p>', {
        status: 404,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }

    const redemption = redemptionData.value;
    const reward = await kv.get(`reward:${redemption.rewardId}`);
    const userProfile = await kv.get(`user:${redemption.userId}`);

    if (!reward) {
      return new Response('<h1>Recompensa no encontrada</h1><p>No se pudo resolver la recompensa del cupon.</p>', {
        status: 404,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }

    const couponCode = redemption.couponCode || generateCouponCode();
    if (!redemption.couponCode) {
      redemption.couponCode = couponCode;
      await kv.set(redemptionData.key, redemption);
    }

    const html = generateCouponHTML(couponCode, redemption, reward, userProfile || {});
    await kv.set(`coupon-html:${redemptionId}`, html);

    const payload = printMode
      ? html.replace('</body>', '<script>window.onload=function(){window.print();};</script></body>')
      : html;

    return c.body(payload, 200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-disposition': `inline; filename="cupon-${redemptionId}.html"`,
      'x-content-type-options': 'nosniff',
    });
  } catch (error) {
    console.log(`Get coupon error: ${error}`);
    return c.body('<h1>Error</h1><p>Error al cargar el cupon.</p>', 500, {
      'content-type': 'text/html; charset=utf-8',
      'x-content-type-options': 'nosniff',
    });
  }
});

// Get user's redemptions/coupons
app.get("/server/rewards/redemptions", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getSupabaseClient(true);
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const redemptions = await kv.getByPrefix(`redemption:${user.id}:`);
    
    // Add coupon URLs and check expiry status
    const now = new Date();
    const enrichedRedemptions = redemptions.map((r: any) => ({
      ...r,
      couponUrl: `/server/coupons/${r.id}`,
      isExpired: r.expiresAt ? new Date(r.expiresAt) < now : false,
    }));
    
    return c.json(enrichedRedemptions);
  } catch (error) {
    console.log(`Get redemptions error: ${error}`);
    return c.json({ error: 'Error getting redemptions' }, 500);
  }
});

// Mark coupon as used (for merchants/admin)
app.post("/server/coupons/:redemptionId/use", async (c) => {
  try {
    const auth = await requireAdmin(c);
    if (auth.error) return auth.error;
    
    const redemptionId = c.req.param('redemptionId');
    const { notes } = await c.req.json();
    
    const redemptionData = await findRedemptionById(redemptionId);
    const redemptionKey = redemptionData?.key || null;
    const redemption = redemptionData?.value || null;
    
    if (!redemption) {
      return c.json({ error: 'Redemption not found' }, 404);
    }
    
    if (redemption.status === 'used') {
      return c.json({ error: 'Coupon already used' }, 400);
    }
    
    if (redemption.status === 'expired') {
      return c.json({ error: 'Coupon expired' }, 400);
    }
    
    // Check if expired
    if (redemption.expiresAt && new Date(redemption.expiresAt) < new Date()) {
      redemption.status = 'expired';
      await kv.set(redemptionKey, redemption);
      return c.json({ error: 'Coupon has expired' }, 400);
    }
    
    // Mark as used
    redemption.status = 'used';
    redemption.usedAt = new Date().toISOString();
    redemption.usageNotes = notes;
    
    await kv.set(redemptionKey, redemption);
    
    return c.json({ 
      message: 'Coupon marked as used successfully',
      redemption 
    });
  } catch (error) {
    console.log(`Use coupon error: ${error}`);
    return c.json({ error: 'Error using coupon' }, 500);
  }
});

// ==================== COLLECTION POINT INVENTORY ROUTES ====================

// Register collection arrival at point (collector/admin)
app.post("/server/points/:pointId/arrivals", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getSupabaseClient(true);
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const userProfile = await kv.get(`user:${user.id}`);
    if (!userProfile || (userProfile.type !== 'collector' && userProfile.type !== 'admin')) {
      return c.json({ error: 'Forbidden: Only collectors and admins can register arrivals' }, 403);
    }
    
    const pointId = c.req.param('pointId');
    const { collectionId, tireCount, tireType, weightKg, notes } = await c.req.json();
    
    if (!collectionId) {
      return c.json({ error: 'collectionId is required' }, 400);
    }
    
    // Verify collection exists
    const collectionData = await findCollectionKeyById(collectionId);
    if (!collectionData) {
      return c.json({ error: 'Collection not found' }, 404);
    }
    
    const { key: collectionKey, value: collection } = collectionData;
    
    // Verify point exists
    const point = await kv.get(`point:${pointId}`);
    if (!point) {
      return c.json({ error: 'Collection point not found' }, 404);
    }
    
    const normalizedPoint = withPointStatus(point);
    const resolvedTireCount = Number(tireCount || collection.tireCount || 0);
    const resolvedTireType = tireType || collection.tireType || 'unknown';

    if (!pointAcceptsTireType(normalizedPoint, resolvedTireType)) {
      return c.json({ error: 'Collection point does not accept this tire type' }, 400);
    }

    if (Number(normalizedPoint.availableCapacity || 0) < resolvedTireCount) {
      return c.json({ error: 'Collection point has insufficient available capacity' }, 409);
    }

    // Create inventory record
    const inventoryId = crypto.randomUUID();
    const now = new Date().toISOString();
    const inventory = {
      id: inventoryId,
      pointId,
      collectionId,
      arrivedAt: now,
      tireCount: resolvedTireCount,
      tireType: resolvedTireType,
      weightKg: weightKg || null,
      notes: notes || null,
      recordedBy: user.id,
    };
    
    await kv.set(`inventory:${pointId}:${inventoryId}`, inventory);
    
    // Update collection record
    collection.destinationPointId = pointId;
    collection.arrivedAtPoint = now;
    if (collection.status === 'in_transit' || collection.status === 'pending' || collection.status === 'in-progress') {
      collection.status = 'arrived';
    }
    await kv.set(collectionKey, collection);
    
    // Update point's current load
    point.currentLoad = Number(point.currentLoad || 0) + Number(inventory.tireCount);
    await kv.set(`point:${pointId}`, point);
    
    return c.json({
      message: 'Collection arrival registered successfully',
      inventory,
      point: withPointStatus(point),
    }, 201);
  } catch (error) {
    console.log(`Register arrival error: ${error}`);
    return c.json({ error: 'Error registering arrival' }, 500);
  }
});

// Get inventory for a collection point
app.get("/server/points/:pointId/inventory", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getSupabaseClient(true);
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    
    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const userProfile = await kv.get(`user:${user.id}`);
    if (!userProfile || (userProfile.type !== 'collector' && userProfile.type !== 'admin')) {
      return c.json({ error: 'Forbidden: Only collectors and admins can view inventory' }, 403);
    }
    
    const pointId = c.req.param('pointId');
    
    // Verify point exists
    const point = await kv.get(`point:${pointId}`);
    if (!point) {
      return c.json({ error: 'Collection point not found' }, 404);
    }
    
    // Get all inventory items for this point
    const inventory = await kv.getByPrefix(`inventory:${pointId}:`);
    
    // Calculate summary statistics
    const totalTires = inventory.reduce((sum: number, item: any) => sum + (Number(item.tireCount) || 0), 0);
    const totalWeight = inventory.reduce((sum: number, item: any) => sum + (Number(item.weightKg) || 0), 0);
    const tireTypeBreakdown = inventory.reduce((acc: any, item: any) => {
      const type = item.tireType || 'unknown';
      acc[type] = (acc[type] || 0) + (Number(item.tireCount) || 0);
      return acc;
    }, {});
    
    return c.json({
      point: withPointStatus(point),
      inventory: inventory.sort((a: any, b: any) => 
        new Date(b.arrivedAt).getTime() - new Date(a.arrivedAt).getTime()
      ),
      summary: {
        totalCollections: inventory.length,
        totalTires,
        totalWeightKg: totalWeight,
        tireTypeBreakdown,
      },
    });
  } catch (error) {
    console.log(`Get inventory error: ${error}`);
    return c.json({ error: 'Error getting inventory' }, 500);
  }
});

// Suggested routes for collectors based on current location + pending collections + nearest points
app.get('/server/collector/routes/suggestions', async (c) => {
  try {
    console.log('[Route Suggestions API] Request received');
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getSupabaseClient(true);
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);

    console.log('[Route Suggestions API] User authenticated:', user?.id);

    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const userProfile = await kv.get(`user:${user.id}`);
    if (!userProfile || (userProfile.type !== 'collector' && userProfile.type !== 'admin')) {
      return c.json({ error: 'Forbidden: Only collectors/admin can request route suggestions' }, 403);
    }

    console.log('[Route Suggestions API] User is valid collector/admin');

    const lat = Number(c.req.query('lat'));
    const lng = Number(c.req.query('lng'));
    const maxStopsRaw = Number(c.req.query('maxStops') || 5);
    const maxStops = Math.min(15, Math.max(1, Number.isFinite(maxStopsRaw) ? maxStopsRaw : 5));

    console.log(`[Route Suggestions API] Query parameters: lat=${lat}, lng=${lng}, maxStops=${maxStops}`);

    const collectorOrigin = {
      lat: Number.isFinite(lat) ? lat : 15.5042,
      lng: Number.isFinite(lng) ? lng : -88.025,
    };

    console.log(`[Route Suggestions API] Using origin: lat=${collectorOrigin.lat}, lng=${collectorOrigin.lng}`);

    const pricing = await getPricingSettings();
    const collections = await kv.getByPrefix('collection:');
    const pointsRaw = await kv.getByPrefix('point:');
    const points = pointsRaw.map(withPointStatus);

    console.log(`[Route Suggestions] Collections in KV: ${collections.length}`);
    console.log(`[Route Suggestions] Collection points: ${points.length}`);

    const { data: collectorRatesData } = await supabase
      .from('collector_tire_rates')
      .select('tire_type, tire_condition, bonus_points')
      .eq('is_active', true);

    const collectorBonusMap = new Map<string, number>();
    for (const rate of collectorRatesData || []) {
      const key = `${normalizeLabel(rate.tire_type)}|${normalizeLabel(rate.tire_condition)}`;
      collectorBonusMap.set(key, Number(rate.bonus_points || 0));
    }

    // Get today's date at start of day for comparison
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();

    const actionableCollections = collections.filter((item: any) => {
      const status = String(item?.status || '').toLowerCase();
      const isUnassignedLegacyPending = status === 'pending' && !item?.collectorId;
      const isAvailable = status === 'available' || isUnassignedLegacyPending;
      
      // Must not be assigned to any collector
      if (item?.collectorId) {
        return false;
      }
      
      // Must be in available/unassigned status
      if (!isAvailable) {
        return false;
      }
      
      // Validate scheduled date - must be today or before
      if (item?.scheduledDate) {
        try {
          const scheduledDate = new Date(item.scheduledDate);
          scheduledDate.setHours(0, 0, 0, 0);
          const scheduledTime = scheduledDate.getTime();
          
          // Skip if scheduled for future
          if (scheduledTime > todayTime) {
            console.log(`[Route Suggestions] Skipping collection ${item?.id} - scheduled for future: ${item.scheduledDate}`);
            return false;
          }
        } catch (err) {
          console.warn(`[Route Suggestions] Invalid scheduledDate for collection ${item?.id}: ${item.scheduledDate}`);
          // If date is invalid, include it anyway (backward compatibility)
        }
      }
      
      return true;
    });

    console.log(`[Route Suggestions] Actionable collections: ${actionableCollections.length}`);

    const suggestions = actionableCollections
      .map((collection: any) => {
        const collectionCoords = collection?.coordinates;
        const hasValidCoords = collectionCoords && Number.isFinite(Number(collectionCoords.lat)) && Number.isFinite(Number(collectionCoords.lng));
        if (!hasValidCoords) {
          console.warn(`[Route Suggestions] Skipping collection ${collection?.id} - invalid coords:`, collectionCoords);
          return null;
        }

        const pickup = {
          lat: Number(collectionCoords.lat),
          lng: Number(collectionCoords.lng),
        };

        const requiredCapacity = Number(collection?.tireCount || 0);
        const availablePoints = points.filter((point: any) => {
          if (!point?.coordinates || point.isAvailable === false) return false;
          if (!pointAcceptsTireType(point, collection?.tireType)) return false;
          const availableCapacity = Number(point.availableCapacity || 0);
          return availableCapacity >= requiredCapacity;
        });
        const candidatePoints = availablePoints.length > 0
          ? availablePoints
          : points.filter((point: any) => point?.coordinates && point.isAvailable !== false);

        if (candidatePoints.length === 0) {
          return null;
        }

        let bestPoint: any = null;
        let bestCollectionToPointKm = Number.POSITIVE_INFINITY;

        for (const point of candidatePoints) {
          const coords = point?.coordinates;
          if (!coords || !Number.isFinite(Number(coords.lat)) || !Number.isFinite(Number(coords.lng))) continue;

          const distance = haversineKm(pickup, { lat: Number(coords.lat), lng: Number(coords.lng) });
          if (distance < bestCollectionToPointKm) {
            bestCollectionToPointKm = distance;
            bestPoint = point;
          }
        }

        if (!bestPoint) {
          return null;
        }

        const collectorToPickupKm = haversineKm(collectorOrigin, pickup);
        const totalRouteKm = collectorToPickupKm + bestCollectionToPointKm;

        const tireCondition = normalizeTireCondition(collection?.tireCondition);
        const tariffPerTire = Number(pricing.generatorTariffsByCondition[tireCondition] || pricing.generatorTariffsByCondition.regular || 0);
        const tireCount = Number(collection?.tireCount || 0);
        const collectorBonusPoints = calculateCollectorBonusPointsForCollection(collection, collectorBonusMap);
        const generatorPayment = Number((tariffPerTire * tireCount).toFixed(2));
        const collectorFreight = estimateCollectorFreight(
          totalRouteKm,
          Number(pricing.collectorFreight.min || 15),
          Number(pricing.collectorFreight.max || 25),
        );

        // Route optimization score: lower is better.
        // Balances distance against money and reward value to prioritize profitable short routes.
        const rewardValue = collectorBonusPoints * 0.25;
        const valueScore = Number((collectorFreight + rewardValue).toFixed(3));
        const routeScore = Number((totalRouteKm / Math.max(valueScore, 1)).toFixed(4));
        const recommendation = routeScore <= 0.35
          ? 'Alta prioridad'
          : routeScore <= 0.65
            ? 'Prioridad media'
            : 'Prioridad baja';

        return {
          collectionId: collection.id,
          collectionStatus: collection.status,
          pickupAddress: collection.address || 'Sin direccion',
          dropoffPoint: {
            id: bestPoint.id,
            name: bestPoint.name,
            address: bestPoint.address,
          },
          tireCount,
          tireType: collection.tireType || 'N/A',
          tireCondition,
          distance: {
            collectorToPickupKm: Number(collectorToPickupKm.toFixed(2)),
            pickupToPointKm: Number(bestCollectionToPointKm.toFixed(2)),
            totalKm: Number(totalRouteKm.toFixed(2)),
          },
          estimatedCompensation: {
            currency: pricing.currency || 'HNL',
            generatorPerTire: tariffPerTire,
            generatorTotal: generatorPayment,
            collectorFreight,
            collectorBonusPoints,
            generatorRewardValue: rewardValue,
          },
          optimization: {
            routeScore,
            valueScore,
            recommendation,
          },
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => {
        if (a.collectionStatus === 'available' && b.collectionStatus !== 'available') return -1;
        if (a.collectionStatus !== 'available' && b.collectionStatus === 'available') return 1;
        return Number(a.optimization.routeScore) - Number(b.optimization.routeScore);
      })
      .slice(0, maxStops);

    console.log(`[Route Suggestions API] Generated ${suggestions.length} suggestions from ${actionableCollections.length} candidates`);

    return c.json({
      origin: collectorOrigin,
      pricing,
      totalCandidates: actionableCollections.length,
      suggestions,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.log(`Collector route suggestions error: ${error}`);
    return c.json({ error: 'Error generating route suggestions' }, 500);
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

// ==================== PAYMENTS ROUTES ====================

// Get payment settings
app.get("/server/payments/settings", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const supabase = getSupabaseClient(true);
    const { data: settings, error } = await supabase
      .from('payment_settings')
      .select('*')
      .eq('id', 1)
      .single();

    if (error) {
      console.error('Error fetching payment settings:', error);
      return c.json({ error: 'Error al obtener configuración de pagos' }, 500);
    }

    return c.json({
      id: settings.id,
      paymentPerKm: parseFloat(settings.payment_per_km),
      minPaymentAmount: parseFloat(settings.min_payment_amount),
      minCollectorPoints: settings.min_collector_points,
      pointsPerTire: settings.points_per_tire,
      cashPaymentPerTire: parseFloat(settings.cash_payment_per_tire),
      minGeneratorPointsOnCash: settings.min_generator_points_on_cash,
      currency: settings.currency,
      updatedAt: settings.updated_at,
    });
  } catch (error) {
    console.error('Payment settings error:', error);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
});

// Update payment settings
app.put("/server/payments/settings", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getSupabaseClient(true);
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Check if user is admin
    const userProfile = await kv.get(`user:${user.id}`);
    if (userProfile?.type !== 'admin') {
      return c.json({ error: 'Forbidden: Admin access required' }, 403);
    }

    const body = await c.req.json();
    const updates: any = {};

    if (body.paymentPerKm !== undefined) updates.payment_per_km = body.paymentPerKm;
    if (body.minPaymentAmount !== undefined) updates.min_payment_amount = body.minPaymentAmount;
    if (body.minCollectorPoints !== undefined) updates.min_collector_points = body.minCollectorPoints;
    if (body.pointsPerTire !== undefined) updates.points_per_tire = body.pointsPerTire;
    if (body.cashPaymentPerTire !== undefined) updates.cash_payment_per_tire = body.cashPaymentPerTire;
    if (body.minGeneratorPointsOnCash !== undefined) updates.min_generator_points_on_cash = body.minGeneratorPointsOnCash;
    updates.updated_at = new Date().toISOString();

    const { data: settings, error } = await supabase
      .from('payment_settings')
      .update(updates)
      .eq('id', 1)
      .select()
      .single();

    if (error) {
      console.error('Error updating payment settings:', error);
      return c.json({ error: 'Error al actualizar configuración' }, 500);
    }

    return c.json({
      id: settings.id,
      paymentPerKm: parseFloat(settings.payment_per_km),
      minPaymentAmount: parseFloat(settings.min_payment_amount),
      minCollectorPoints: settings.min_collector_points,
      pointsPerTire: settings.points_per_tire,
      cashPaymentPerTire: parseFloat(settings.cash_payment_per_tire),
      minGeneratorPointsOnCash: settings.min_generator_points_on_cash,
      currency: settings.currency,
      updatedAt: settings.updated_at,
    });
  } catch (error) {
    console.error('Update payment settings error:', error);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
});

// Calculate distance
app.post("/server/payments/calculate-distance", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { lat1, lng1, lat2, lng2 } = await c.req.json();

    const supabase = getSupabaseClient(true);
    const { data, error } = await supabase.rpc('calculate_distance_km', {
      p_lat1: lat1,
      p_lng1: lng1,
      p_lat2: lat2,
      p_lng2: lng2,
    });

    if (error) {
      console.error('Error calculating distance:', error);
      return c.json({ error: 'Error al calcular distancia' }, 500);
    }

    return c.json({ distanceKm: parseFloat(data || 0) });
  } catch (error) {
    console.error('Calculate distance error:', error);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
});

// Calculate collector payment
app.post("/server/payments/calculate-collector", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { distanceKm } = await c.req.json();

    const supabase = getSupabaseClient(true);
    const { data, error } = await supabase.rpc('calculate_collector_payment', {
      p_distance_km: distanceKm,
    });

    if (error) {
      console.error('Error calculating collector payment:', error);
      return c.json({ error: 'Error al calcular pago' }, 500);
    }

    const result = Array.isArray(data) ? data[0] : data;
    return c.json({
      paymentAmount: parseFloat(result.payment_amount),
      pointsAwarded: result.points_awarded,
    });
  } catch (error) {
    console.error('Calculate collector payment error:', error);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
});

// Calculate generator payment
app.post("/server/payments/calculate-generator", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { tireCount, paymentPreference } = await c.req.json();

    const supabase = getSupabaseClient(true);
    const { data, error } = await supabase.rpc('calculate_generator_payment', {
      p_tire_count: tireCount,
      p_payment_preference: paymentPreference,
    });

    if (error) {
      console.error('Error calculating generator payment:', error);
      return c.json({ error: 'Error al calcular pago' }, 500);
    }

    const result = Array.isArray(data) ? data[0] : data;
    return c.json({
      cashAmount: parseFloat(result.cash_amount),
      pointsAwarded: result.points_awarded,
    });
  } catch (error) {
    console.error('Calculate generator payment error:', error);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
});

// Create collector payment
app.post("/server/payments/collector", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getSupabaseClient(true);
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { collectionId, collectorId, pickupLat, pickupLng, deliveryLat, deliveryLng } = await c.req.json();

    const { data, error } = await supabase.rpc('create_collector_payment', {
      p_collection_id: collectionId,
      p_collector_id: collectorId,
      p_pickup_lat: pickupLat,
      p_pickup_lng: pickupLng,
      p_delivery_lat: deliveryLat,
      p_delivery_lng: deliveryLng,
    });

    if (error) {
      console.error('Error creating collector payment:', error);
      return c.json({ error: 'Error al crear pago del recolector' }, 500);
    }

    return c.json({
      id: data.id,
      collectionId: data.collection_id,
      collectorId: data.collector_id,
      pickupLat: data.pickup_lat,
      pickupLng: data.pickup_lng,
      deliveryLat: data.delivery_lat,
      deliveryLng: data.delivery_lng,
      distanceKm: parseFloat(data.distance_km || 0),
      paymentAmount: parseFloat(data.payment_amount),
      pointsAwarded: data.points_awarded,
      status: data.status,
      createdAt: data.created_at,
    });
  } catch (error) {
    console.error('Create collector payment error:', error);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
});

// Get collector payments
app.get("/server/payments/collector", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getSupabaseClient(true);
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const collectorId = c.req.query('collectorId');
    const status = c.req.query('status');
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : 50;

    let query = supabase
      .from('collector_payments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (collectorId) {
      query = query.eq('collector_id', collectorId);
    }
    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching collector payments:', error);
      return c.json({ error: 'Error al obtener pagos' }, 500);
    }

    return c.json(data.map((payment: any) => ({
      id: payment.id,
      collectionId: payment.collection_id,
      collectorId: payment.collector_id,
      pickupLat: payment.pickup_lat,
      pickupLng: payment.pickup_lng,
      deliveryLat: payment.delivery_lat,
      deliveryLng: payment.delivery_lng,
      distanceKm: parseFloat(payment.distance_km || 0),
      paymentAmount: parseFloat(payment.payment_amount),
      pointsAwarded: payment.points_awarded,
      status: payment.status,
      paymentMethod: payment.payment_method,
      paymentReference: payment.payment_reference,
      createdAt: payment.created_at,
      processedAt: payment.processed_at,
      processedBy: payment.processed_by,
      notes: payment.notes,
    })));
  } catch (error) {
    console.error('Get collector payments error:', error);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
});

// Process collector payment
app.post("/server/payments/collector/process", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getSupabaseClient(true);
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Check if user is admin
    const userProfile = await kv.get(`user:${user.id}`);
    if (userProfile?.type !== 'admin') {
      return c.json({ error: 'Forbidden: Admin access required' }, 403);
    }

    const { paymentId, paymentMethod, paymentReference, notes } = await c.req.json();

    const { data, error } = await supabase.rpc('process_collector_payment', {
      p_payment_id: paymentId,
      p_payment_method: paymentMethod,
      p_payment_reference: paymentReference || '',
      p_processed_by: user.id,
    });

    if (error) {
      console.error('Error processing collector payment:', error);
      return c.json({ error: error.message || 'Error al procesar pago' }, 500);
    }

    // Update notes if provided
    if (notes) {
      await supabase
        .from('collector_payments')
        .update({ notes })
        .eq('id', paymentId);
    }

    // Update user profile in KV with new points
    const collectorProfile = await kv.get(`user:${data.collector_id}`);
    if (collectorProfile) {
      collectorProfile.points = (collectorProfile.points || 0) + data.points_awarded;
      await kv.set(`user:${data.collector_id}`, collectorProfile);
    }

    return c.json({
      id: data.id,
      collectionId: data.collection_id,
      collectorId: data.collector_id,
      distanceKm: parseFloat(data.distance_km || 0),
      paymentAmount: parseFloat(data.payment_amount),
      pointsAwarded: data.points_awarded,
      status: data.status,
      paymentMethod: data.payment_method,
      paymentReference: data.payment_reference,
      processedAt: data.processed_at,
      processedBy: data.processed_by,
    });
  } catch (error) {
    console.error('Process collector payment error:', error);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
});

// Create generator payment
app.post("/server/payments/generator", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getSupabaseClient(true);
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { collectionId, generatorId, tireCount, paymentPreference } = await c.req.json();

    const { data, error } = await supabase.rpc('create_generator_payment', {
      p_collection_id: collectionId,
      p_generator_id: generatorId,
      p_tire_count: tireCount,
      p_payment_preference: paymentPreference || 'points',
    });

    if (error) {
      console.error('Error creating generator payment:', error);
      return c.json({ error: 'Error al crear pago del generador' }, 500);
    }

    // Update user profile in KV if payment is in points
    if (paymentPreference === 'points') {
      const generatorProfile = await kv.get(`user:${generatorId}`);
      if (generatorProfile) {
        generatorProfile.points = (generatorProfile.points || 0) + data.points_awarded;
        await kv.set(`user:${generatorId}`, generatorProfile);
      }
    }

    return c.json({
      id: data.id,
      collectionId: data.collection_id,
      generatorId: data.generator_id,
      paymentPreference: data.payment_preference,
      tireCount: data.tire_count,
      cashAmount: parseFloat(data.cash_amount),
      pointsAwarded: data.points_awarded,
      status: data.status,
      paymentMethod: data.payment_method,
      createdAt: data.created_at,
    });
  } catch (error) {
    console.error('Create generator payment error:', error);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
});

// Get generator payments
app.get("/server/payments/generator", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getSupabaseClient(true);
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const generatorId = c.req.query('generatorId');
    const status = c.req.query('status');
    const paymentPreference = c.req.query('paymentPreference');
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : 50;

    let query = supabase
      .from('generator_payments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (generatorId) {
      query = query.eq('generator_id', generatorId);
    }
    if (status) {
      query = query.eq('status', status);
    }
    if (paymentPreference) {
      query = query.eq('payment_preference', paymentPreference);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching generator payments:', error);
      return c.json({ error: 'Error al obtener pagos' }, 500);
    }

    return c.json(data.map((payment: any) => ({
      id: payment.id,
      collectionId: payment.collection_id,
      generatorId: payment.generator_id,
      paymentPreference: payment.payment_preference,
      tireCount: payment.tire_count,
      cashAmount: parseFloat(payment.cash_amount),
      pointsAwarded: payment.points_awarded,
      status: payment.status,
      paymentMethod: payment.payment_method,
      paymentReference: payment.payment_reference,
      createdAt: payment.created_at,
      processedAt: payment.processed_at,
      processedBy: payment.processed_by,
      notes: payment.notes,
    })));
  } catch (error) {
    console.error('Get generator payments error:', error);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
});

// Process generator payment
app.post("/server/payments/generator/process", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getSupabaseClient(true);
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Check if user is admin
    const userProfile = await kv.get(`user:${user.id}`);
    if (userProfile?.type !== 'admin') {
      return c.json({ error: 'Forbidden: Admin access required' }, 403);
    }

    const { paymentId, paymentMethod, paymentReference, notes } = await c.req.json();

    const { data, error } = await supabase.rpc('process_generator_payment', {
      p_payment_id: paymentId,
      p_payment_method: paymentMethod,
      p_payment_reference: paymentReference || '',
      p_processed_by: user.id,
    });

    if (error) {
      console.error('Error processing generator payment:', error);
      return c.json({ error: error.message || 'Error al procesar pago' }, 500);
    }

    // Update notes if provided
    if (notes) {
      await supabase
        .from('generator_payments')
        .update({ notes })
        .eq('id', paymentId);
    }

    // Update user profile in KV with points (for cash payments with bonus points)
    if (data.payment_preference === 'cash' && data.points_awarded > 0) {
      const generatorProfile = await kv.get(`user:${data.generator_id}`);
      if (generatorProfile) {
        generatorProfile.points = (generatorProfile.points || 0) + data.points_awarded;
        await kv.set(`user:${data.generator_id}`, generatorProfile);
      }
    }

    return c.json({
      id: data.id,
      collectionId: data.collection_id,
      generatorId: data.generator_id,
      paymentPreference: data.payment_preference,
      cashAmount: parseFloat(data.cash_amount),
      pointsAwarded: data.points_awarded,
      status: data.status,
      paymentMethod: data.payment_method,
      paymentReference: data.payment_reference,
      processedAt: data.processed_at,
      processedBy: data.processed_by,
    });
  } catch (error) {
    console.error('Process generator payment error:', error);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
});

// Get payment statistics
app.get("/server/payments/stats", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getSupabaseClient(true);
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const userId = c.req.query('userId');
    const userType = c.req.query('userType');
    const dateFrom = c.req.query('dateFrom');
    const dateTo = c.req.query('dateTo');

    const stats: any = {
      totalPayments: 0,
      totalAmount: 0,
      totalPoints: 0,
      pendingPayments: 0,
      completedPayments: 0,
    };

    if (userType === 'collector') {
      let query = supabase
        .from('collector_payments')
        .select('*');

      if (userId) query = query.eq('collector_id', userId);
      if (dateFrom) query = query.gte('created_at', dateFrom);
      if (dateTo) query = query.lte('created_at', dateTo);

      const { data, error } = await query;

      if (!error && data) {
        stats.totalPayments = data.length;
        stats.totalAmount = data.reduce((sum, p) => sum + parseFloat(p.payment_amount || 0), 0);
        stats.totalPoints = data.reduce((sum, p) => sum + (p.points_awarded || 0), 0);
        stats.pendingPayments = data.filter(p => p.status === 'pending').length;
        stats.completedPayments = data.filter(p => p.status === 'completed').length;
        stats.averageDistance = data.length > 0 
          ? data.reduce((sum, p) => sum + parseFloat(p.distance_km || 0), 0) / data.length 
          : 0;
      }
    } else if (userType === 'generator') {
      let query = supabase
        .from('generator_payments')
        .select('*');

      if (userId) query = query.eq('generator_id', userId);
      if (dateFrom) query = query.gte('created_at', dateFrom);
      if (dateTo) query = query.lte('created_at', dateTo);

      const { data, error } = await query;

      if (!error && data) {
        stats.totalPayments = data.length;
        stats.totalAmount = data.reduce((sum, p) => sum + parseFloat(p.cash_amount || 0), 0);
        stats.totalPoints = data.reduce((sum, p) => sum + (p.points_awarded || 0), 0);
        stats.pendingPayments = data.filter(p => p.status === 'pending').length;
        stats.completedPayments = data.filter(p => p.status === 'completed').length;
      }
    }

    return c.json(stats);
  } catch (error) {
    console.error('Get payment stats error:', error);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
});

// Get collector tire rates
app.get("/server/payments/rates/collector", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getSupabaseClient(true);
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { data, error } = await supabase
      .from('collector_tire_rates')
      .select('*')
      .order('tire_type', { ascending: true })
      .order('tire_condition', { ascending: true });

    if (error) {
      console.error('Error fetching collector rates:', error);
      return c.json({ error: error.message }, 500);
    }

    return c.json((data || []).map(rate => ({
      id: rate.id,
      tireType: rate.tire_type,
      tireCondition: rate.tire_condition,
      baseRatePerKm: parseFloat(rate.base_rate_per_km),
      minPayment: parseFloat(rate.min_payment),
      bonusPoints: rate.bonus_points,
      isActive: rate.is_active,
      createdAt: rate.created_at,
      updatedAt: rate.updated_at,
    })));
  } catch (error) {
    console.error('Get collector rates error:', error);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
});

// Update collector tire rate
app.put("/server/payments/rates/collector/:rateId", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getSupabaseClient(true);
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Check if user is admin
    const userProfile = await kv.get(`user:${user.id}`);
    if (userProfile?.type !== 'admin') {
      return c.json({ error: 'Forbidden: Admin access required' }, 403);
    }

    const rateId = c.req.param('rateId');
    const updates = await c.req.json();

    const updateData: any = { updated_at: new Date().toISOString() };
    if (updates.baseRatePerKm !== undefined) updateData.base_rate_per_km = updates.baseRatePerKm;
    if (updates.minPayment !== undefined) updateData.min_payment = updates.minPayment;
    if (updates.bonusPoints !== undefined) updateData.bonus_points = updates.bonusPoints;
    if (updates.isActive !== undefined) updateData.is_active = updates.isActive;

    const { data, error } = await supabase
      .from('collector_tire_rates')
      .update(updateData)
      .eq('id', rateId)
      .select()
      .single();

    if (error) {
      console.error('Error updating collector rate:', error);
      return c.json({ error: error.message }, 500);
    }

    return c.json({
      id: data.id,
      tireType: data.tire_type,
      tireCondition: data.tire_condition,
      baseRatePerKm: parseFloat(data.base_rate_per_km),
      minPayment: parseFloat(data.min_payment),
      bonusPoints: data.bonus_points,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    });
  } catch (error) {
    console.error('Update collector rate error:', error);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
});

// Get generator tire rates
app.get("/server/payments/rates/generator", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getSupabaseClient(true);
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { data, error } = await supabase
      .from('generator_tire_rates')
      .select('*')
      .order('tire_type', { ascending: true })
      .order('tire_condition', { ascending: true });

    if (error) {
      console.error('Error fetching generator rates:', error);
      return c.json({ error: error.message }, 500);
    }

    return c.json((data || []).map(rate => ({
      id: rate.id,
      tireType: rate.tire_type,
      tireCondition: rate.tire_condition,
      pointsPerTire: rate.points_per_tire,
      cashPerTire: parseFloat(rate.cash_per_tire),
      minPointsOnCash: rate.min_points_on_cash,
      isActive: rate.is_active,
      createdAt: rate.created_at,
      updatedAt: rate.updated_at,
    })));
  } catch (error) {
    console.error('Get generator rates error:', error);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
});

// Update generator tire rate
app.put("/server/payments/rates/generator/:rateId", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const supabase = getSupabaseClient(true);
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Check if user is admin
    const userProfile = await kv.get(`user:${user.id}`);
    if (userProfile?.type !== 'admin') {
      return c.json({ error: 'Forbidden: Admin access required' }, 403);
    }

    const rateId = c.req.param('rateId');
    const updates = await c.req.json();

    const updateData: any = { updated_at: new Date().toISOString() };
    if (updates.pointsPerTire !== undefined) updateData.points_per_tire = updates.pointsPerTire;
    if (updates.cashPerTire !== undefined) updateData.cash_per_tire = updates.cashPerTire;
    if (updates.minPointsOnCash !== undefined) updateData.min_points_on_cash = updates.minPointsOnCash;
    if (updates.isActive !== undefined) updateData.is_active = updates.isActive;

    const { data, error } = await supabase
      .from('generator_tire_rates')
      .update(updateData)
      .eq('id', rateId)
      .select()
      .single();

    if (error) {
      console.error('Error updating generator rate:', error);
      return c.json({ error: error.message }, 500);
    }

    return c.json({
      id: data.id,
      tireType: data.tire_type,
      tireCondition: data.tire_condition,
      pointsPerTire: data.points_per_tire,
      cashPerTire: parseFloat(data.cash_per_tire),
      minPointsOnCash: data.min_points_on_cash,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    });
  } catch (error) {
    console.error('Update generator rate error:', error);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
});

// Initialize storage on startup
initStorage();
ensureAdminUser();

Deno.serve(app.fetch);