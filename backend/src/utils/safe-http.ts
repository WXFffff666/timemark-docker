import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { Agent as HttpAgent, type AgentOptions } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import { resolveSafePublicUrl } from './url-safety.js';

type LookupAddress = { address: string; family: 4 | 6 };
type PinnedLookup = NonNullable<AgentOptions['lookup']>;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

export type SafeAxiosGetOptions = Pick<
  AxiosRequestConfig,
  'auth' | 'headers' | 'timeout' | 'validateStatus'
>;

function createPinnedLookup(host: string, records: LookupAddress[]): PinnedLookup {
  return (requestedHost, options, callback) => {
    const candidates = requestedHost.toLowerCase() === host.toLowerCase()
      ? records.filter((record) => !options.family || options.family === record.family)
      : [];

    if (candidates.length === 0) {
      const error = new Error('No validated address is available for this hostname') as NodeJS.ErrnoException;
      error.code = 'EAI_NONAME';
      callback(error, '', 0);
      return;
    }

    if (options.all) {
      callback(null, candidates);
      return;
    }

    callback(null, candidates[0].address, candidates[0].family);
  };
}

/** GET a public URL using only the DNS addresses validated immediately beforehand. */
export async function safeAxiosGet<T = string>(
  raw: string,
  options: SafeAxiosGetOptions = {},
): Promise<AxiosResponse<T>> {
  const resolved = await resolveSafePublicUrl(raw);
  if (!resolved.safe) throw new Error(resolved.reason);

  const lookup = resolved.addresses.length > 0
    ? createPinnedLookup(resolved.host, resolved.addresses)
    : undefined;
  const httpAgent = new HttpAgent({ keepAlive: false, lookup });
  const httpsAgent = new HttpsAgent({ keepAlive: false, lookup });

  try {
    return await axios.get<T>(resolved.url.href, {
      ...options,
      adapter: 'http',
      responseType: 'text',
      maxContentLength: MAX_RESPONSE_BYTES,
      maxRedirects: 0,
      proxy: false,
      httpAgent,
      httpsAgent,
    });
  } finally {
    httpAgent.destroy();
    httpsAgent.destroy();
  }
}
