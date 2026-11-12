import {
  getHealthStatus,
  handleAuthSync,
  handleListInvites,
  handleCreateInvite,
  handleRevokeInvite,
  handleGetInvite,
  handleAcceptInvite,
  handleAdminUpdatePlan,
  handleAdminUpdateRole,
  prepareGeminiGeneration,
  streamGeminiGeneration,
} from '../../server/backend';

const ALLOWED_ORIGINS = [
  'https://millennium-launchpad.netlify.app',
  ...(process.env.APP_URL ? [process.env.APP_URL.replace(/\/$/, '')] : []),
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  const isAllowed =
    ALLOWED_ORIGINS.includes(origin) ||
    /^https:\/\/[a-z0-9-]+--millennium-launchpad\.netlify\.app$/i.test(origin) ||
    /^http:\/\/localhost(:\d+)?$/i.test(origin);

  const allowOrigin = isAllowed ? origin : 'https://millennium-launchpad.netlify.app';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  };
}

function jsonResponse(
  status: number,
  body: Record<string, any>,
  corsHeaders: Record<string, string>
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

async function parseJsonBody(req: Request): Promise<any> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

export default async function handler(req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);
  // Normalize path whether invoked via /.netlify/functions/api/* or /api/*
  const rawPath = url.pathname
    .replace(/^\/\.netlify\/functions\/api/, '')
    .replace(/^\/api/, '');
  const path = rawPath === '' ? '/' : rawPath;

  const authHeader = req.headers.get('authorization');

  try {
    // Health check
    if (req.method === 'GET' && path === '/health') {
      return jsonResponse(200, { ...getHealthStatus(), netlify: true }, corsHeaders);
    }

    // Auth sync
    if (req.method === 'POST' && path === '/auth/sync') {
      const result = await handleAuthSync(authHeader);
      return jsonResponse(result.status, result.body, corsHeaders);
    }

    // List invites
    if (req.method === 'GET' && path === '/invites') {
      const result = await handleListInvites(authHeader);
      return jsonResponse(result.status, result.body, corsHeaders);
    }

    // Create invite
    if (req.method === 'POST' && path === '/invites') {
      const body = await parseJsonBody(req);
      const result = await handleCreateInvite(authHeader, body);
      return jsonResponse(result.status, result.body, corsHeaders);
    }

    // Revoke invite: /invites/:id/revoke
    const revokeMatch = path.match(/^\/invites\/([^/]+)\/revoke$/);
    if (req.method === 'POST' && revokeMatch) {
      const result = await handleRevokeInvite(authHeader, decodeURIComponent(revokeMatch[1]));
      return jsonResponse(result.status, result.body, corsHeaders);
    }

    // Accept invite: /invites/:id/accept
    const acceptMatch = path.match(/^\/invites\/([^/]+)\/accept$/);
    if (req.method === 'POST' && acceptMatch) {
      const result = await handleAcceptInvite(authHeader, decodeURIComponent(acceptMatch[1]));
      return jsonResponse(result.status, result.body, corsHeaders);
    }

    // Get single invite: /invites/:id
    const singleInviteMatch = path.match(/^\/invites\/([^/]+)$/);
    if (req.method === 'GET' && singleInviteMatch) {
      const result = await handleGetInvite(decodeURIComponent(singleInviteMatch[1]));
      return jsonResponse(result.status, result.body, corsHeaders);
    }

    // Admin update user plan: /admin/users/:userId/plan
    const planMatch = path.match(/^\/admin\/users\/([^/]+)\/plan$/);
    if (req.method === 'POST' && planMatch) {
      const body = await parseJsonBody(req);
      const result = await handleAdminUpdatePlan(authHeader, decodeURIComponent(planMatch[1]), body);
      return jsonResponse(result.status, result.body, corsHeaders);
    }

    // Admin update user role: /admin/users/:userId/role
    const roleMatch = path.match(/^\/admin\/users\/([^/]+)\/role$/);
    if (req.method === 'POST' && roleMatch) {
      const body = await parseJsonBody(req);
      const result = await handleAdminUpdateRole(authHeader, decodeURIComponent(roleMatch[1]), body);
      return jsonResponse(result.status, result.body, corsHeaders);
    }

    // Gemini streaming endpoint: /gemini/generate
    if (req.method === 'POST' && path === '/gemini/generate') {
      const body = await parseJsonBody(req);
      const prep = await prepareGeminiGeneration(authHeader, body);
      if (!prep.ok) {
        return jsonResponse(prep.status, { error: prep.error }, corsHeaders);
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const sendEvent = (data: Record<string, any>) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          };

          try {
            await streamGeminiGeneration(prep, sendEvent);
          } catch (err: any) {
            sendEvent({ error: err?.message || 'Unexpected streaming error' });
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          ...corsHeaders,
        },
      });
    }

    return jsonResponse(404, { error: `API route not found: ${req.method} ${path}` }, corsHeaders);
  } catch (err: any) {
    console.error('[Netlify API Error]', err);
    return jsonResponse(500, { error: err?.message || 'Internal server error' }, corsHeaders);
  }
}
