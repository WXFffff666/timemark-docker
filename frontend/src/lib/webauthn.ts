import { startRegistration, startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { api } from './api';

export function isPasskeySupported(): boolean {
  return typeof window !== 'undefined' && browserSupportsWebAuthn();
}

export async function registerPasskey(deviceName?: string) {
  const options = await api.post<PublicKeyCredentialCreationOptionsJSON>(
    '/auth/webauthn/register/options',
    { deviceName },
  );
  const attestation = await startRegistration({ optionsJSON: options });
  await api.post('/auth/webauthn/register/verify', {
    response: attestation,
    deviceName,
  });
}

export interface PasskeyCredential {
  id: string;
  deviceName: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export async function listPasskeys(): Promise<PasskeyCredential[]> {
  const data = await api.get<PasskeyCredential[]>('/auth/webauthn/credentials');
  return Array.isArray(data) ? data : [];
}

export async function removePasskey(id: string) {
  await api.delete(`/auth/webauthn/credentials/${id}`);
}

export async function loginWithPasskey(
  username: string,
  rememberMe = false,
  totpCode?: string,
): Promise<{ user: { id: string; username: string }; sessionId?: string }> {
  const options = await api.post<PublicKeyCredentialRequestOptionsJSON>(
    '/auth/webauthn/login/options',
    { username },
  );
  const assertion = await startAuthentication({ optionsJSON: options });
  return api.post('/auth/webauthn/login/verify', {
    username,
    response: assertion,
    rememberMe,
    totpCode,
  });
}
