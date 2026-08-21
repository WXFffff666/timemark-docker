import { randomUUID } from 'crypto';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticatorTransportFuture,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/server';
import { isoBase64URL, isoUint8Array } from '@simplewebauthn/server/helpers';
import { query } from '../db/index.js';
import type { WebAuthnRuntimeConfig } from '../utils/webauthn-config.js';

export interface PasskeyCredential {
  id: string;
  userId: number;
  credentialId: string;
  deviceName: string | null;
  counter: number;
  createdAt: string;
  lastUsedAt: string | null;
}

async function storeChallenge(challenge: string, userId: number | null, type: 'registration' | 'authentication') {
  if (userId != null) {
    await query('DELETE FROM webauthn_challenges WHERE user_id = $1 AND type = $2', [userId, type]);
  }
  await query(
    `INSERT INTO webauthn_challenges (challenge, user_id, type, expires_at)
     VALUES ($1, $2, $3, NOW() + INTERVAL '5 minutes')`,
    [challenge, userId, type],
  );
}

async function consumeChallenge(challenge: string, type: string, userId?: number | null): Promise<boolean> {
  const result = await query(
    `DELETE FROM webauthn_challenges
     WHERE challenge = $1 AND type = $2 AND expires_at > NOW()
       AND ($3::int IS NULL OR user_id IS NOT DISTINCT FROM $3)
     RETURNING challenge`,
    [challenge, type, userId ?? null],
  );
  return result.rows.length > 0;
}

export async function listUserPasskeys(userId: number): Promise<PasskeyCredential[]> {
  const result = await query(
    `SELECT id, user_id, credential_id, device_name, counter, created_at, last_used_at
     FROM webauthn_credentials WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return result.rows.map((row: Record<string, unknown>) => ({
    id: String(row.id),
    userId: Number(row.user_id),
    credentialId: String(row.credential_id),
    deviceName: row.device_name as string | null,
    counter: Number(row.counter ?? 0),
    createdAt: String(row.created_at),
    lastUsedAt: row.last_used_at ? String(row.last_used_at) : null,
  }));
}

export async function createRegistrationOptions(
  userId: number,
  username: string,
  config: WebAuthnRuntimeConfig,
  deviceName?: string,
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const existing = await query(
    'SELECT credential_id, transports FROM webauthn_credentials WHERE user_id = $1',
    [userId],
  );

  const excludeCredentials = existing.rows.map((row: Record<string, unknown>) => ({
    id: String(row.credential_id),
    transports: (row.transports as AuthenticatorTransportFuture[] | null) || undefined,
  }));

  const options = await generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpID,
    userName: username,
    userDisplayName: username,
    userID: isoUint8Array.fromUTF8String(String(userId)),
    attestationType: 'none',
    excludeCredentials,
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });

  await storeChallenge(options.challenge, userId, 'registration');
  return options;
}

export async function verifyRegistration(
  userId: number,
  response: RegistrationResponseJSON,
  config: WebAuthnRuntimeConfig,
  deviceName?: string,
): Promise<{ verified: boolean; error?: string }> {
  const clientData = JSON.parse(
    Buffer.from(response.response.clientDataJSON, 'base64url').toString('utf8'),
  ) as { challenge?: string };

  if (!clientData.challenge) {
    return { verified: false, error: '缺少 challenge' };
  }

  const challengeOk = await consumeChallenge(clientData.challenge, 'registration', userId);
  if (!challengeOk) {
    return { verified: false, error: '注册挑战已过期或无效' };
  }

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: clientData.challenge,
    expectedOrigin: config.origin,
    expectedRPID: config.rpID,
    requireUserVerification: false,
  });

  if (!verification.verified || !verification.registrationInfo) {
    return { verified: false, error: 'Passkey 注册验证失败' };
  }

  const { credential } = verification.registrationInfo;
  const publicKeyB64 = isoBase64URL.fromBuffer(credential.publicKey);
  const transports = credential.transports?.length ? credential.transports.join(',') : null;

  await query(
    `INSERT INTO webauthn_credentials (id, user_id, credential_id, public_key, counter, device_name, transports)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      randomUUID(),
      userId,
      credential.id,
      publicKeyB64,
      credential.counter,
      deviceName?.trim() || 'Passkey',
      transports,
    ],
  );

  return { verified: true };
}

export async function createAuthenticationOptions(
  userId: number,
  config: WebAuthnRuntimeConfig,
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const creds = await query(
    'SELECT credential_id, transports FROM webauthn_credentials WHERE user_id = $1',
    [userId],
  );

  if (creds.rows.length === 0) {
    throw new Error('该账户尚未注册 Passkey');
  }

  const allowCredentials = creds.rows.map((row: Record<string, unknown>) => ({
    id: String(row.credential_id),
    transports: row.transports
      ? String(row.transports).split(',').filter(Boolean) as AuthenticatorTransportFuture[]
      : undefined,
  }));

  const options = await generateAuthenticationOptions({
    rpID: config.rpID,
    allowCredentials,
    userVerification: 'preferred',
  });

  await storeChallenge(options.challenge, userId, 'authentication');
  return options;
}

export async function verifyAuthentication(
  userId: number,
  response: AuthenticationResponseJSON,
  config: WebAuthnRuntimeConfig,
): Promise<{ verified: boolean; error?: string }> {
  const stored = await query(
    'SELECT * FROM webauthn_credentials WHERE user_id = $1 AND credential_id = $2',
    [userId, response.id],
  );

  if (stored.rows.length === 0) {
    return { verified: false, error: '未找到对应 Passkey' };
  }

  const row = stored.rows[0] as Record<string, unknown>;
  const clientData = JSON.parse(
    Buffer.from(response.response.clientDataJSON, 'base64url').toString('utf8'),
  ) as { challenge?: string };

  if (!clientData.challenge) {
    return { verified: false, error: '缺少 challenge' };
  }

  const challengeOk = await consumeChallenge(clientData.challenge, 'authentication', userId);
  if (!challengeOk) {
    return { verified: false, error: '登录挑战已过期或无效' };
  }

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: clientData.challenge,
    expectedOrigin: config.origin,
    expectedRPID: config.rpID,
    requireUserVerification: false,
    credential: {
      id: String(row.credential_id),
      publicKey: isoBase64URL.toBuffer(String(row.public_key)),
      counter: Number(row.counter ?? 0),
      transports: row.transports
        ? String(row.transports).split(',').filter(Boolean) as AuthenticatorTransportFuture[]
        : undefined,
    },
  });

  if (!verification.verified) {
    return { verified: false, error: 'Passkey 验证失败' };
  }

  await query(
    `UPDATE webauthn_credentials SET counter = $1, last_used_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [verification.authenticationInfo.newCounter, row.id],
  );

  return { verified: true };
}

export async function deletePasskey(userId: number, credentialRowId: string): Promise<boolean> {
  const result = await query(
    'DELETE FROM webauthn_credentials WHERE id = $1 AND user_id = $2 RETURNING id',
    [credentialRowId, userId],
  );
  return result.rows.length > 0;
}

export async function userHasPasskeys(userId: number): Promise<boolean> {
  const result = await query(
    'SELECT 1 FROM webauthn_credentials WHERE user_id = $1 LIMIT 1',
    [userId],
  );
  return result.rows.length > 0;
}
