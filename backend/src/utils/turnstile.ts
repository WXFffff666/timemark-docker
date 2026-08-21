/** Cloudflare Turnstile verification (optional — skip when secret not set). */

function readEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key];
    if (value) return value;
  }
  return undefined;
}

/** Prefer TURNSTILE_*; accept common dashboard typos (SiteKey / SecretKey). */
export function getTurnstileSiteKey(): string | undefined {
  return readEnv(
    'TURNSTILE_SITE_KEY',
    'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
    'SiteKey',
    'SITE_KEY',
  );
}

export function getTurnstileSecretKey(): string | undefined {
  return readEnv('TURNSTILE_SECRET_KEY', 'SecretKey', 'SECRET_KEY');
}

export function isTurnstileEnabled(): boolean {
  return !!getTurnstileSecretKey();
}

type SiteVerifyResponse = {
  success?: boolean;
  'error-codes'?: string[];
};

type TurnstileVerifyOptions = {
  token: string | undefined;
  /** Only pass to Cloudflare when sourced from a trusted platform header */
  trustedRemoteIp?: string;
};

export async function verifyTurnstileToken(
  token: string | undefined,
  trustedRemoteIp?: string,
): Promise<{ ok: boolean; skipped: boolean; error?: string; code?: string }> {
  const secret = getTurnstileSecretKey();
  if (!secret) return { ok: true, skipped: true };

  if (!token) {
    return { ok: false, skipped: false, error: '请完成人机验证', code: 'turnstile_required' };
  }

  const verify = async (includeRemoteIp: boolean): Promise<SiteVerifyResponse> => {
    const body = new URLSearchParams({ secret, response: token });
    if (includeRemoteIp && trustedRemoteIp) {
      body.set('remoteip', trustedRemoteIp);
    }

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    return res.json() as Promise<SiteVerifyResponse>;
  };

  try {
    // Trusted IP (cf-connecting-ip / x-vercel-forwarded-for): verify with remoteip first.
    // Fallback without remoteip for proxy edge cases — still validates the token+secret pair.
    let data = trustedRemoteIp
      ? await verify(true)
      : await verify(false);

    if (!data.success && trustedRemoteIp) {
      data = await verify(false);
    }

    if (!data.success) {
      const codes = data['error-codes'] ?? [];
      if (codes.includes('invalid-input-secret')) {
        console.error('[turnstile] invalid secret key — check TURNSTILE_SECRET_KEY / SecretKey');
        return {
          ok: false,
          skipped: false,
          error: '人机验证配置错误，请联系管理员',
          code: 'turnstile_misconfigured',
        };
      }
      if (codes.includes('timeout-or-duplicate')) {
        return {
          ok: false,
          skipped: false,
          error: '人机验证已过期，请重新验证',
          code: 'turnstile_expired',
        };
      }
      if (codes.length) {
        console.warn('[turnstile] siteverify failed:', codes.join(', '));
      }
      return {
        ok: false,
        skipped: false,
        error: '人机验证失败，请重试',
        code: 'turnstile_failed',
      };
    }
    return { ok: true, skipped: false };
  } catch (err) {
    console.error('[turnstile] siteverify error:', err);
    return {
      ok: false,
      skipped: false,
      error: '人机验证服务暂不可用',
      code: 'turnstile_unavailable',
    };
  }
}
