import { calculateLocalSnapshot, loadLocalDashboard, loadLocalOperations, loadOrderDetail } from '../../../scripts/local-calculation.mjs';

const baseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const originAllowed = Deno.env.get('APP_ORIGIN') ?? '';

function respond(body: unknown, status = 200, origin = '') {
  return new Response(JSON.stringify(body), { status, headers: {
    'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff', ...(origin ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {})
  } });
}

async function roleOf(token: string) {
  const headers = { apikey: anonKey, authorization: `Bearer ${token}` };
  const userResponse = await fetch(`${baseUrl}/auth/v1/user`, { headers });
  if (!userResponse.ok) return null;
  const user = await userResponse.json();
  const roleResponse = await fetch(`${baseUrl}/rest/v1/app_users?select=role,enabled&user_id=eq.${encodeURIComponent(user.id)}`, { headers });
  if (!roleResponse.ok) return null;
  const [record] = await roleResponse.json();
  return record?.enabled ? { id: user.id, role: record.role } : null;
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin') ?? '';
  const cors = originAllowed && origin === originAllowed ? origin : '';
  if (origin && !cors) return respond({ error: 'ORIGIN_NOT_ALLOWED' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': cors, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'authorization, apikey, content-type', vary: 'Origin' } });
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return respond({ error: 'AUTH_REQUIRED' }, 401, cors);
  const actor = await roleOf(token);
  if (!['viewer', 'operator', 'admin'].includes(actor?.role ?? '')) return respond({ error: 'ACCESS_DENIED' }, 403, cors);
  const route = new URL(request.url).searchParams.get('route') ?? '';
  try {
    if (request.method === 'GET' && route === 'dashboard') return respond({ dashboard: await loadLocalDashboard() }, 200, cors);
    if (request.method === 'GET' && route === 'operations') return respond({ operations: await loadLocalOperations() }, 200, cors);
    if (request.method === 'GET' && route.startsWith('orders/')) {
      const detail = await loadOrderDetail(route.slice(7));
      return respond(detail ? { detail } : { error: 'ORDER_NOT_FOUND' }, detail ? 200 : 404, cors);
    }
    if (request.method === 'POST' && route === 'recalculate') {
      if (!['operator', 'admin'].includes(actor?.role ?? '')) return respond({ error: 'OPERATOR_REQUIRED' }, 403, cors);
      return respond(await calculateLocalSnapshot({ persist: true, actorId: actor.id }), 200, cors);
    }
    return respond({ error: 'ROUTE_NOT_FOUND' }, 404, cors);
  } catch (error) {
    const code = String(error instanceof Error ? error.message : 'ONLINE_API_FAILED').split(':')[0];
    return respond({ error: code }, code === 'INVALID_ORDER_ID' ? 400 : 503, cors);
  }
});
