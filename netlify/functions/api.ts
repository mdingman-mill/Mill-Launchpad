process.env.SERVERLESS = 'true';

import {
  handleHealthCheck,
  handleGetPublicSettings,
  handleUpdatePlatformSettings,
  handleAuthSync,
  handleDeleteOwnAccount,
  handleGetInvites,
  handleCreateInvite,
  handleRevokeInvite,
  handleGetInvite,
  handleAcceptInvite,
  handleUpdateUserPlan,
  handleUpdateUserRole,
  handleAdminUserAction,
  handleGetTeam,
  handleCreateTeamInvite,
  handleRevokeTeamInvite,
  handleRemoveTeamMember,
  handleTransferOwnership,
  handleLeaveTeam,
  handleAdminGetOrganizations,
  handleAdminUpdateOrgSeatLimit,
  handleAdminRemoveOrgMember,
  handleGeminiGenerate,
  getCorsHeaders,
} from '../../server';

export default async (req: Request): Promise<Response> => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  const url = new URL(req.url);
  let pathname = url.pathname;

  // Normalize path if routed via /.netlify/functions/api
  if (pathname.startsWith('/.netlify/functions/api')) {
    pathname = pathname.replace('/.netlify/functions/api', '/api');
  }
  // Remove trailing slashes
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }

  const authHeader = req.headers.get('authorization') ?? undefined;
  const method = req.method.toUpperCase();

  try {
    // 1. Health check
    if (method === 'GET' && pathname === '/api/health') {
      const result = await handleHealthCheck();
      return new Response(JSON.stringify(result.data), {
        status: result.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 1b. Public platform settings
    if (method === 'GET' && pathname === '/api/settings') {
      const result = await handleGetPublicSettings();
      return new Response(JSON.stringify(result.data), {
        status: result.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 1c. Super admin update platform settings
    if (method === 'POST' && pathname === '/api/admin/settings') {
      const body = await req.json().catch(() => ({}));
      const result = await handleUpdatePlatformSettings(authHeader, body);
      return new Response(JSON.stringify(result.data), {
        status: result.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 2. Auth sync
    if (method === 'POST' && pathname === '/api/auth/sync') {
      const result = await handleAuthSync(authHeader);
      return new Response(JSON.stringify(result.data), {
        status: result.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 2b. Self-service account deletion
    if (method === 'POST' && pathname === '/api/account/delete') {
      const result = await handleDeleteOwnAccount(authHeader);
      return new Response(JSON.stringify(result.data), {
        status: result.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 3. List invites (super admins only)
    if (method === 'GET' && pathname === '/api/invites') {
      const result = await handleGetInvites(authHeader);
      return new Response(JSON.stringify(result.data), {
        status: result.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 4. Create invite (super admins only)
    if (method === 'POST' && pathname === '/api/invites') {
      const body = await req.json().catch(() => ({}));
      const result = await handleCreateInvite(authHeader, body);
      return new Response(JSON.stringify(result.data), {
        status: result.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 5. Revoke invite: /api/invites/:id/revoke
    const revokeMatch = pathname.match(/^\/api\/invites\/([^/]+)\/revoke$/);
    if (method === 'POST' && revokeMatch) {
      const inviteId = decodeURIComponent(revokeMatch[1]);
      const result = await handleRevokeInvite(authHeader, inviteId);
      return new Response(JSON.stringify(result.data), {
        status: result.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 6. Accept invite: /api/invites/:id/accept
    const acceptMatch = pathname.match(/^\/api\/invites\/([^/]+)\/accept$/);
    if (method === 'POST' && acceptMatch) {
      const inviteId = decodeURIComponent(acceptMatch[1]);
      const result = await handleAcceptInvite(authHeader, inviteId);
      return new Response(JSON.stringify(result.data), {
        status: result.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 7. Get single invite: /api/invites/:id
    const getInviteMatch = pathname.match(/^\/api\/invites\/([^/]+)$/);
    if (method === 'GET' && getInviteMatch) {
      const inviteId = decodeURIComponent(getInviteMatch[1]);
      const result = await handleGetInvite(inviteId, authHeader);
      return new Response(JSON.stringify(result.data), {
        status: result.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 8. Super admin update user plan: /api/admin/users/:userId/plan
    const userPlanMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/plan$/);
    if (method === 'POST' && userPlanMatch) {
      const userId = decodeURIComponent(userPlanMatch[1]);
      const body = await req.json().catch(() => ({}));
      const result = await handleUpdateUserPlan(authHeader, userId, body?.planId);
      return new Response(JSON.stringify(result.data), {
        status: result.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 9. Super admin update user role: /api/admin/users/:userId/role
    const userRoleMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/role$/);
    if (method === 'POST' && userRoleMatch) {
      const userId = decodeURIComponent(userRoleMatch[1]);
      const body = await req.json().catch(() => ({}));
      const result = await handleUpdateUserRole(authHeader, userId, body?.role);
      return new Response(JSON.stringify(result.data), {
        status: result.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 9b. Super admin privileged user action: /api/admin/users/:userId/action
    const userActionMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/action$/);
    if (method === 'POST' && userActionMatch) {
      const userId = decodeURIComponent(userActionMatch[1]);
      const body = await req.json().catch(() => ({}));
      const result = await handleAdminUserAction(authHeader, userId, body);
      return new Response(JSON.stringify(result.data), {
        status: result.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 9c. Team management: GET /api/team
    if (method === 'GET' && pathname === '/api/team') {
      const result = await handleGetTeam(authHeader);
      return new Response(JSON.stringify(result.data), {
        status: result.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 9d. Create team invite: POST /api/team/invites
    if (method === 'POST' && pathname === '/api/team/invites') {
      const body = await req.json().catch(() => ({}));
      const result = await handleCreateTeamInvite(authHeader, body);
      return new Response(JSON.stringify(result.data), {
        status: result.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 9e. Revoke team invite: POST /api/team/invites/:inviteId/revoke
    const revokeTeamInviteMatch = pathname.match(/^\/api\/team\/invites\/([^/]+)\/revoke$/);
    if (method === 'POST' && revokeTeamInviteMatch) {
      const inviteId = decodeURIComponent(revokeTeamInviteMatch[1]);
      const result = await handleRevokeTeamInvite(authHeader, inviteId);
      return new Response(JSON.stringify(result.data), {
        status: result.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 9f. Remove team member: POST /api/team/members/:memberId/remove
    const removeTeamMemberMatch = pathname.match(/^\/api\/team\/members\/([^/]+)\/remove$/);
    if (method === 'POST' && removeTeamMemberMatch) {
      const memberId = decodeURIComponent(removeTeamMemberMatch[1]);
      const result = await handleRemoveTeamMember(authHeader, memberId);
      return new Response(JSON.stringify(result.data), {
        status: result.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 9g. Transfer ownership: POST /api/team/transfer-ownership
    if (method === 'POST' && pathname === '/api/team/transfer-ownership') {
      const body = await req.json().catch(() => ({}));
      const result = await handleTransferOwnership(authHeader, body);
      return new Response(JSON.stringify(result.data), {
        status: result.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 9h. Leave team: POST /api/team/leave
    if (method === 'POST' && pathname === '/api/team/leave') {
      const result = await handleLeaveTeam(authHeader);
      return new Response(JSON.stringify(result.data), {
        status: result.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 9i. Super admin list organizations: GET /api/admin/organizations
    if (method === 'GET' && pathname === '/api/admin/organizations') {
      const result = await handleAdminGetOrganizations(authHeader);
      return new Response(JSON.stringify(result.data), {
        status: result.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 9j. Super admin update org seat limit: POST /api/admin/organizations/:orgId/seat-limit
    const orgSeatLimitMatch = pathname.match(/^\/api\/admin\/organizations\/([^/]+)\/seat-limit$/);
    if (method === 'POST' && orgSeatLimitMatch) {
      const orgId = decodeURIComponent(orgSeatLimitMatch[1]);
      const body = await req.json().catch(() => ({}));
      const result = await handleAdminUpdateOrgSeatLimit(authHeader, orgId, body);
      return new Response(JSON.stringify(result.data), {
        status: result.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 9k. Super admin remove org member: POST /api/admin/organizations/:orgId/members/:memberId/remove
    const adminRemoveOrgMemberMatch = pathname.match(/^\/api\/admin\/organizations\/([^/]+)\/members\/([^/]+)\/remove$/);
    if (method === 'POST' && adminRemoveOrgMemberMatch) {
      const orgId = decodeURIComponent(adminRemoveOrgMemberMatch[1]);
      const memberId = decodeURIComponent(adminRemoveOrgMemberMatch[2]);
      const result = await handleAdminRemoveOrgMember(authHeader, orgId, memberId);
      return new Response(JSON.stringify(result.data), {
        status: result.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 10. Gemini generate: /api/gemini/generate
    if (method === 'POST' && pathname === '/api/gemini/generate') {
      const body = await req.json().catch(() => ({}));
      const result = await handleGeminiGenerate(authHeader, body);

      if (result.errorStatus) {
        return new Response(JSON.stringify(result.errorData), {
          status: result.errorStatus,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      return new Response(result.stream, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          ...corsHeaders,
        },
      });
    }

    return new Response(JSON.stringify({ error: `Not found: ${method} ${pathname}` }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err: any) {
    console.error('[Netlify API Error]:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
};
