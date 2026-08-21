/**
 * 批量邮件模板：语气尽量像个人写信，避免营销/系统通知感
 */

export interface BroadcastGreetingVariant {
  id: string;
  name: string;
  greetingHtml: string;
}

export interface BroadcastTemplateCategory {
  id: string;
  name: string;
  emoji: string;
  description: string;
  defaultSubject: string;
  greetingVariants: BroadcastGreetingVariant[];
  bodyHtml: string;
  closingHtml: string;
}

export const BROADCAST_TEMPLATE_CATEGORIES: BroadcastTemplateCategory[] = [
  {
    id: 'holiday',
    name: '节日问候',
    emoji: '🎊',
    description: '春节、中秋等节日群发祝福',
    defaultSubject: '节日快乐',
    greetingVariants: [
      { id: 'warm', name: '温馨', greetingHtml: '<p>{{contact_name}}，</p><p>佳节快到了，祝你一切都好。</p>' },
      { id: 'formal', name: '正式', greetingHtml: '<p>{{contact_name}} 您好，</p><p>节日快乐，顺祝阖家安康。</p>' },
      { id: 'lively', name: '轻松', greetingHtml: '<p>{{contact_name}}，</p><p>节日快乐～</p>' },
      { id: 'spring', name: '春节', greetingHtml: '<p>{{contact_name}}，新年好。</p><p>祝你新的一年顺心如意。</p>' },
    ],
    bodyHtml: '<p>最近还好吗？有空聊聊。</p>',
    closingHtml: '',
  },
  {
    id: 'birthday',
    name: '生日祝福',
    emoji: '🎂',
    description: '联系人生日群发祝福',
    defaultSubject: '生日快乐',
    greetingVariants: [
      { id: 'warm', name: '温馨', greetingHtml: '<p>{{contact_name}}，</p><p>生日快乐。</p>' },
      { id: 'fun', name: '轻松', greetingHtml: '<p>{{contact_name}}，</p><p>生日快乐呀～</p>' },
      { id: 'formal', name: '正式', greetingHtml: '<p>{{contact_name}} 您好，</p><p>祝您生日快乐，万事顺意。</p>' },
      { id: 'family', name: '亲近', greetingHtml: '<p>{{contact_name}}，</p><p>又长大一岁啦，生日快乐。</p>' },
    ],
    bodyHtml: '<p>愿你新的一岁里，想做的事都能如愿。</p>',
    closingHtml: '',
  },
  {
    id: 'work',
    name: '工作通知',
    emoji: '📋',
    description: '会议、截止、事项提醒',
    defaultSubject: '有个事跟你说一下',
    greetingVariants: [
      { id: 'neutral', name: '平常', greetingHtml: '<p>{{contact_name}}，</p><p>跟你说件事：</p>' },
      { id: 'urgent', name: '较急', greetingHtml: '<p>{{contact_name}}，</p><p>这件事比较急，麻烦看一下：</p>' },
      { id: 'meeting', name: '会议', greetingHtml: '<p>{{contact_name}}，</p><p>想邀请你参加：</p>' },
      { id: 'deadline', name: '截止', greetingHtml: '<p>{{contact_name}}，</p><p>提醒一下，这件事快到期了：</p>' },
    ],
    bodyHtml: '<p>（在这里写具体内容、时间、地点）</p><p>有问题直接回我就行。</p>',
    closingHtml: '',
  },
  {
    id: 'reminder',
    name: '温馨提醒',
    emoji: '🔔',
    description: '日程、健康、生活关怀',
    defaultSubject: '提醒一下',
    greetingVariants: [
      { id: 'gentle', name: '温柔', greetingHtml: '<p>{{contact_name}}，</p><p>想提醒你：</p>' },
      { id: 'brief', name: '简短', greetingHtml: '<p>{{contact_name}}，</p>' },
      { id: 'schedule', name: '日程', greetingHtml: '<p>{{contact_name}}，</p><p>你这边有个安排：</p>' },
      { id: 'health', name: '关心', greetingHtml: '<p>{{contact_name}}，</p><p>天冷了，注意身体：</p>' },
    ],
    bodyHtml: '<p>（在这里写具体提醒内容）</p>',
    closingHtml: '',
  },
  {
    id: 'thanks',
    name: '感谢与跟进',
    emoji: '💌',
    description: '感谢信、回访、邀请',
    defaultSubject: '谢谢你的支持',
    greetingVariants: [
      { id: 'thanks', name: '感谢', greetingHtml: '<p>{{contact_name}}，</p><p>真的很感谢你的帮助。</p>' },
      { id: 'followup', name: '跟进', greetingHtml: '<p>{{contact_name}}，</p><p>好久不见，来问问近况：</p>' },
      { id: 'invite', name: '邀请', greetingHtml: '<p>{{contact_name}}，</p><p>想邀请你：</p>' },
      { id: 'feedback', name: '意见', greetingHtml: '<p>{{contact_name}}，</p><p>想听听你的想法：</p>' },
    ],
    bodyHtml: '<p>（在这里写具体内容）</p>',
    closingHtml: '',
  },
  {
    id: 'notice',
    name: '一般通知',
    emoji: '📢',
    description: '通用通知、公告',
    defaultSubject: '跟你说一声',
    greetingVariants: [
      { id: 'default', name: '通用', greetingHtml: '<p>{{contact_name}}，</p>' },
      { id: 'update', name: '更新', greetingHtml: '<p>{{contact_name}}，</p><p>有件事更新一下：</p>' },
      { id: 'account', name: '账户', greetingHtml: '<p>{{contact_name}}，</p><p>关于你的账户，请注意：</p>' },
    ],
    bodyHtml: '<p>（在这里写通知正文）</p>',
    closingHtml: '',
  },
];

export function renderBroadcastTemplate(
  template: string,
  vars: { contact_name?: string; subject?: string },
): string {
  const contactName = vars.contact_name?.trim() || '你好';
  const map: Record<string, string> = {
    '{{contact_name}}': contactName,
    '{{name}}': contactName,
    '{{联系人}}': contactName,
    '{{subject}}': vars.subject || '',
    '{{主题}}': vars.subject || '',
  };
  let result = template;
  for (const [key, value] of Object.entries(map)) {
    result = result.split(key).join(value);
  }
  return result;
}

export function buildBroadcastEmail(
  category: BroadcastTemplateCategory,
  greetingVariantId: string,
  subjectOverride?: string,
): { subject: string; html: string } {
  const variant =
    category.greetingVariants.find((v) => v.id === greetingVariantId) ||
    category.greetingVariants[0];
  const subject = subjectOverride?.trim() || category.defaultSubject;
  const sampleName = '张三';
  const parts = [
    `<div style="font-family:sans-serif;line-height:1.7;color:#222;font-size:15px">`,
    renderBroadcastTemplate(variant.greetingHtml, { contact_name: sampleName, subject }),
    renderBroadcastTemplate(category.bodyHtml, { contact_name: sampleName, subject }),
    renderBroadcastTemplate(category.closingHtml, { contact_name: sampleName, subject }),
    `</div>`,
  ];
  return { subject, html: parts.filter(Boolean).join('\n') };
}

export const BROADCAST_PRESET_TEMPLATES = BROADCAST_TEMPLATE_CATEGORIES.map((c) => ({
  id: c.id,
  name: c.name,
  content: buildBroadcastEmail(c, c.greetingVariants[0].id).html,
  isPreset: true as const,
  variables: ['{{contact_name}}', '{{name}}'],
  description: c.description,
}));
