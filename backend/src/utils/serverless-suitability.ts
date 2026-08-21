export type SuitabilityResult = { suitable: boolean; reason?: string; needsExternalCron?: boolean };

export const SERVERLESS_NOTES: Record<string, string> = {
  wechat_personal: '需要本地微信插件会话，需常驻进程',
  whatsapp: '需要 WhatsApp Web 插件会话，需常驻进程',
  qq_bot: '需要 QQ 机器人插件，需常驻进程',
  signal: '需要 Signal CLI 本地进程',
  imessage: '需要 BlueBubbles/macOS 本地服务',
  zalo: '需要 Zalo 插件会话',
  clawbot: '需要 Clawbot 本地代理',
  nostr: '需要长连接 Nostr relay',
};

export function checkChannelSuitability(channelId: string): SuitabilityResult {
  const reason = SERVERLESS_NOTES[channelId];
  if (reason) return { suitable: false, reason, needsExternalCron: false };
  return { suitable: true };
}

export function getServerlessFeatureReport(): Array<{ feature: string; suitable: boolean; note: string }> {
  return [];
}
