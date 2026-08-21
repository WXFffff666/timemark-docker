export type SmtpProviderId =
  | 'qq'
  | '163'
  | '126'
  | 'gmail'
  | 'outlook'
  | 'tencent_ex'
  | 'ali_ex'
  | 'ali_personal'
  | 'custom';

export interface SmtpProviderPreset {
  id: SmtpProviderId;
  label: string;
  host: string;
  port: number;
  altPort?: number;
  servers?: {
    smtp: string;
    pop3?: string;
    imap?: string;
    sslNote?: string;
  };
  passwordLabel: string;
  passwordDescription: string;
  fromEmailPlaceholder: string;
  setupGuide: string;
  cloudWarning?: string;
  docsUrl?: string;
}

export const SMTP_PROVIDER_PRESETS: SmtpProviderPreset[] = [
  {
    id: 'qq',
    label: 'QQ 邮箱',
    host: 'smtp.qq.com',
    port: 465,
    passwordLabel: 'QQ 邮箱授权码',
    passwordDescription: '在 QQ 邮箱 → 设置 → 账户 → POP3/SMTP 中开启服务并生成授权码（不是 QQ 密码）',
    fromEmailPlaceholder: 'yourname@qq.com',
    setupGuide: '登录 mail.qq.com → 设置 → 账户 → 开启 SMTP → 生成授权码',
    docsUrl: 'https://service.mail.qq.com/detail/0/75',
  },
  {
    id: '163',
    label: '网易 163 邮箱',
    host: 'smtp.163.com',
    port: 465,
    altPort: 587,
    servers: {
      smtp: 'smtp.163.com（发信，SSL 465 或 STARTTLS 587）',
      pop3: 'pop.163.com（收信，SSL 995）',
      imap: 'imap.163.com（收信，SSL 993，推荐）',
      sslNote: '官方要求开启 SSL/TLS；密码必须用客户端授权码（16 位），不是登录密码',
    },
    passwordLabel: '163 客户端授权码',
    passwordDescription: '设置 → POP3/SMTP/IMAP → 开启 IMAP/SMTP → 短信验证后生成，仅显示一次',
    fromEmailPlaceholder: 'yourname@163.com',
    setupGuide:
      'email.163.com → 设置 → POP3/SMTP/IMAP → 开启 IMAP（推荐）或 POP3 → 短信/扫码验证 → 记录 16 位授权码（只显示一次）',
    cloudWarning:
      '163 可能限制云服务器 IP。网页已开启 SMTP 但 TimeMark 测试失败时，可切换 STARTTLS(587) 或改用 Resend。',
    docsUrl: 'https://help.mail.163.com/faq.do?m=list&categoryID=90',
  },
  {
    id: '126',
    label: '网易 126 邮箱',
    host: 'smtp.126.com',
    port: 465,
    altPort: 587,
    servers: {
      smtp: 'smtp.126.com',
      pop3: 'pop.126.com',
      imap: 'imap.126.com',
      sslNote: '均支持 SSL 连接',
    },
    passwordLabel: '126 客户端授权码',
    passwordDescription: '必须使用客户端授权码，不是登录密码',
    fromEmailPlaceholder: 'yourname@126.com',
    setupGuide: 'mail.126.com → 设置 → 开启 SMTP → 新增授权码',
    cloudWarning: '126 可能限制云服务器 IP，测试失败时可尝试 STARTTLS(587) 或改用 Resend。',
  },
  {
    id: 'gmail',
    label: 'Gmail / Google 邮箱',
    host: 'smtp.gmail.com',
    port: 587,
    passwordLabel: 'Google 应用专用密码',
    passwordDescription: '需开启两步验证后，在 Google 账号 → 安全性 → 应用专用密码 中生成 16 位密码',
    fromEmailPlaceholder: 'yourname@gmail.com',
    setupGuide: 'Google 账号开启两步验证 → 应用专用密码 → 选择「邮件」生成密码',
    docsUrl: 'https://support.google.com/accounts/answer/185833',
  },
  {
    id: 'outlook',
    label: 'Outlook / Microsoft 365',
    host: 'smtp.office365.com',
    port: 587,
    passwordLabel: '邮箱密码或应用密码',
    passwordDescription: '个人 Outlook 通常用登录密码；若开启 MFA 需在 Microsoft 账号中创建应用密码',
    fromEmailPlaceholder: 'yourname@outlook.com',
    setupGuide: '使用完整邮箱作为用户名；企业账号以 IT 部门 SMTP 设置为准',
    docsUrl: 'https://support.microsoft.com/office/pop-imap-and-smtp-settings',
  },
  {
    id: 'tencent_ex',
    label: '腾讯企业邮',
    host: 'smtp.exmail.qq.com',
    port: 465,
    passwordLabel: '企业邮箱密码或客户端专用密码',
    passwordDescription: '使用完整企业邮箱地址登录；部分企业要求使用客户端专用密码',
    fromEmailPlaceholder: 'yourname@yourcompany.com',
    setupGuide: '腾讯企业邮管理后台确认已开启 SMTP；用户名填完整邮箱地址',
    docsUrl: 'https://service.exmail.qq.com/cgi-bin/help?id=28',
  },
  {
    id: 'ali_ex',
    label: '阿里企业邮',
    host: 'smtp.mxhichina.com',
    port: 465,
    passwordLabel: '企业邮箱密码或客户端密码',
    passwordDescription: '使用完整企业邮箱地址；若控制台提供客户端专用密码请使用该密码',
    fromEmailPlaceholder: 'yourname@yourcompany.com',
    setupGuide: '阿里企业邮控制台 → 邮箱管理 → 确认 SMTP 已开启',
    docsUrl: 'https://help.aliyun.com/document_detail/36576.html',
  },
  {
    id: 'ali_personal',
    label: '阿里个人邮箱',
    host: 'smtp.aliyun.com',
    port: 465,
    passwordLabel: '邮箱授权码',
    passwordDescription: '在阿里邮箱设置中开启 SMTP 并获取授权码',
    fromEmailPlaceholder: 'yourname@aliyun.com',
    setupGuide: '登录 mail.aliyun.com → 设置 → 客户端设置 → 开启 SMTP',
  },
  {
    id: 'custom',
    label: '自定义 SMTP',
    host: '',
    port: 587,
    passwordLabel: '邮箱密码 / 授权码',
    passwordDescription: '按邮件服务商要求填写密码或授权码',
    fromEmailPlaceholder: 'noreply@yourdomain.com',
    setupGuide: '手动填写 SMTP 服务器地址与端口（常用 587 或 465）',
  },
];

export function getSmtpProviderPreset(id?: string | null): SmtpProviderPreset {
  return SMTP_PROVIDER_PRESETS.find((p) => p.id === id) ?? SMTP_PROVIDER_PRESETS.find((p) => p.id === 'custom')!;
}

export function inferSmtpProviderId(host?: string | null, port?: string | number | null): SmtpProviderId | null {
  const normalizedHost = (host || '').trim().toLowerCase();
  const normalizedPort = String(port ?? '').trim();
  if (!normalizedHost) return null;

  const match = SMTP_PROVIDER_PRESETS.find((preset) => {
    if (preset.id === 'custom' || !preset.host) return false;
    return preset.host.toLowerCase() === normalizedHost && String(preset.port) === normalizedPort;
  });
  return match?.id ?? null;
}

export function applySmtpProviderToForm(
  providerId: SmtpProviderId,
  form: Record<string, string>,
): Record<string, string> {
  const preset = getSmtpProviderPreset(providerId);
  if (preset.id === 'custom') {
    return { ...form, smtpProvider: providerId };
  }
  const encryption = form.smtpEncryption || 'ssl';
  const port = encryption === 'starttls' && preset.altPort ? preset.altPort : preset.port;
  return {
    ...form,
    smtpProvider: providerId,
    webhook: preset.host,
    secret: String(port),
    smtpEncryption: encryption,
  };
}

export function parseSmtpSessionData(sessionData: unknown): {
  smtpProvider?: SmtpProviderId;
  smtpEncryption?: 'ssl' | 'starttls';
} {
  if (!sessionData) return {};
  if (typeof sessionData === 'object' && sessionData !== null) {
    const data = sessionData as { smtpProvider?: string; smtpEncryption?: string };
    const result: { smtpProvider?: SmtpProviderId; smtpEncryption?: 'ssl' | 'starttls' } = {};
    if (data.smtpProvider && SMTP_PROVIDER_PRESETS.some((p) => p.id === data.smtpProvider)) {
      result.smtpProvider = data.smtpProvider as SmtpProviderId;
    }
    if (data.smtpEncryption === 'ssl' || data.smtpEncryption === 'starttls') {
      result.smtpEncryption = data.smtpEncryption;
    }
    return result;
  }
  if (typeof sessionData === 'string') {
    try {
      return parseSmtpSessionData(JSON.parse(sessionData));
    } catch {
      return {};
    }
  }
  return {};
}
