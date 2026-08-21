import { checkChannelSuitability } from '../../utils/serverless-suitability.js';

export { SERVERLESS_NOTES, checkChannelSuitability } from '../../utils/serverless-suitability.js';

export const UNSUPPORTED_CHANNEL_IDS = new Set([
  'wechat_personal',
  'whatsapp',
  'qq_bot',
  'signal',
  'imessage',
  'zalo',
  'clawbot',
  'nostr',
]);

export function isSupportedChannel(channelId: string): boolean {
  return checkChannelSuitability(channelId).suitable;
}

export function filterSupportedChannels(channelIds: string[]): string[] {
  return channelIds.filter(isSupportedChannel);
}
