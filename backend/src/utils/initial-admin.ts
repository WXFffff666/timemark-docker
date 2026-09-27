import { loginSchema } from '@timemark/shared';

export function resolveInitialAdminCredentials(env: NodeJS.ProcessEnv = process.env): { username: string; password: string } {
  const password = env.DEFAULT_ADMIN_PASSWORD;
  if (!password) {
    throw new Error('DEFAULT_ADMIN_PASSWORD is required to create the initial administrator');
  }

  const credentials = {
    username: env.DEFAULT_ADMIN_USERNAME || 'admin',
    password,
  };
  if (!loginSchema.safeParse(credentials).success) {
    throw new Error('DEFAULT_ADMIN_USERNAME or DEFAULT_ADMIN_PASSWORD does not satisfy login requirements');
  }
  return credentials;
}
