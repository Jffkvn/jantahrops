import { createClient } from 'jsr:@supabase/supabase-js@2';
import { renderEmail } from '../_shared/email-layout.ts';
import { opsLink } from '../_shared/ops-url.ts';
import { sendResendEmail } from '../_shared/resend.ts';

type UserRole = 'admin' | 'staff' | 'intern';

const ALLOWED_ROLES = new Set<UserRole>(['admin', 'staff', 'intern']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';

function corsHeaders(origin: string | null): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders(origin) },
  });
}

function generateTempPassword(length = 14): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += PASSWORD_ALPHABET[bytes[i]! % PASSWORD_ALPHABET.length];
  }
  return out;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed.' }, 405, origin);
  }

  const authHeader = req.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  const bearerToken = match?.[1]?.trim() ?? '';
  if (!bearerToken) {
    return json({ ok: false, error: 'Authentication required.' }, 401, origin);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const {
    data: { user: caller },
    error: authErr,
  } = await supabase.auth.getUser(bearerToken);

  if (authErr || !caller) {
    return json({ ok: false, error: 'Invalid or expired session.' }, 401, origin);
  }

  const { data: callerProfile, error: callerProfileErr } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', caller.id)
    .maybeSingle();

  if (
    callerProfileErr ||
    !callerProfile ||
    callerProfile.role !== 'admin' ||
    callerProfile.is_active !== true
  ) {
    return json({ ok: false, error: 'Only active admins can create team accounts.' }, 403, origin);
  }

  let body: {
    fullName?: unknown;
    email?: unknown;
    role?: unknown;
    password?: unknown;
    sendWelcomeEmail?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body.' }, 400, origin);
  }

  const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
  if (!fullName || fullName.length > 120) {
    return json({ ok: false, error: 'Enter a valid full name (1–120 characters).' }, 400, origin);
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || !EMAIL_RE.test(email)) {
    return json({ ok: false, error: 'Enter a valid email address.' }, 400, origin);
  }

  const rawRole = typeof body.role === 'string' ? body.role.trim().toLowerCase() : 'staff';
  const role: UserRole = ALLOWED_ROLES.has(rawRole as UserRole) ? (rawRole as UserRole) : 'staff';
  if (typeof body.role === 'string' && !ALLOWED_ROLES.has(rawRole as UserRole)) {
    return json({ ok: false, error: 'Role must be admin, staff, or intern.' }, 400, origin);
  }

  const providedPassword = typeof body.password === 'string' ? body.password.trim() : '';
  if (providedPassword && providedPassword.length < 8) {
    return json(
      { ok: false, error: 'Password must be at least 8 characters long.' },
      400,
      origin,
    );
  }
  const finalPassword = providedPassword || generateTempPassword(14);
  const sendWelcomeEmail = body.sendWelcomeEmail !== false;

  const { data: createdData, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password: finalPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createErr || !createdData.user) {
    const errMsg = createErr?.message ?? 'Could not create the user account.';
    const status =
      createErr?.status === 422 || /already/i.test(errMsg) ? 409 : 400;
    return json(
      {
        ok: false,
        error:
          status === 409
            ? 'An account with this email already exists.'
            : errMsg,
      },
      status,
      origin,
    );
  }

  const createdUser = createdData.user;

  const { data: updatedProfile, error: updateProfileErr } = await supabase
    .from('profiles')
    .update({ full_name: fullName, role, is_active: true })
    .eq('id', createdUser.id)
    .select('*')
    .maybeSingle();

  let profileRow = updatedProfile;
  if (!profileRow || updateProfileErr) {
    const { data: insertedProfile, error: insertProfileErr } = await supabase
      .from('profiles')
      .upsert(
        {
          id: createdUser.id,
          email,
          full_name: fullName,
          role,
          is_active: true,
        },
        { onConflict: 'id' },
      )
      .select('*')
      .single();

    if (insertProfileErr || !insertedProfile) {
      return json(
        { ok: false, error: 'User created in Auth, but profile sync failed.' },
        500,
        origin,
      );
    }
    profileRow = insertedProfile;
  }

  const loginUrl = opsLink('/login') ?? 'https://ops.jantahr.com/login';
  const roleLabel = role === 'admin' ? 'Admin' : role === 'intern' ? 'Intern' : 'Staff';

  let emailSent = false;
  if (sendWelcomeEmail) {
    try {
      const rendered = renderEmail('Your JantaHR Ops account is ready', {
        preheader: `Sign in to JantaHR Ops with your ${email} account.`,
        heading: `Welcome to JantaHR Ops, ${fullName}`,
        audience: 'team',
        signOff: true,
        blocks: [
          {
            kind: 'paragraph',
            text: 'An administrator has created your JantaHR Ops account. Use the credentials below to sign in and review candidates, applications, and recruitment pipelines.',
          },
          {
            kind: 'details',
            rows: [
              { label: 'Email', value: email },
              { label: 'Temporary password', value: finalPassword },
              { label: 'Role', value: roleLabel },
              { label: 'Sign-in link', value: loginUrl },
            ],
          },
          {
            kind: 'button',
            label: 'Sign in to JantaHR Ops',
            url: loginUrl,
          },
          {
            kind: 'callout',
            title: 'Change your password after signing in',
            text: 'Once signed in, open Settings → My account to set your own private password.',
          },
        ],
      });

      emailSent = await sendResendEmail(
        email,
        rendered,
        'team_welcome',
        `team-welcome-${createdUser.id}`,
      );
    } catch {
      emailSent = false;
    }
  }

  return json(
    {
      ok: true,
      user: profileRow,
      temporaryPassword: finalPassword,
      loginUrl,
      emailSent,
    },
    200,
    origin,
  );
});
