import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { getEventsByUserId } from '../services/event.service.js';
import type { User } from '@timemark/shared';
import { getRequestOrigin } from '../utils/client-ip.js';

const calendar = new Hono<{ Variables: { user: User } }>();

calendar.use('*', authMiddleware);

/**
 * 导出事件为 .ics 文件
 * GET /api/calendar/export.ics
 */
calendar.get('/export.ics', async (c) => {
  const user = c.get('user');
  const events = await getEventsByUserId(user.id);

  // 生成 iCalendar 格式
  const icsContent = generateICS(events);

  return new Response(icsContent, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="timemark-events.ics"',
    },
  });
});

/**
 * 生成 Google Calendar 订阅链接
 * GET /api/calendar/google
 */
calendar.get('/google', async (c) => {
  const user = c.get('user');
  const events = await getEventsByUserId(user.id);

  // 生成 Google Calendar 导入链接
  const googleLinks = events.map(event => {
    const startDate = parseDate(event.date);
    if (!startDate) return null;

    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);

    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: event.name,
      dates: `${formatDateForGoogle(startDate)}/${formatDateForGoogle(endDate)}`,
      details: generateEventDescription(event),
    });

    return {
      id: event.id,
      name: event.name,
      link: `https://calendar.google.com/calendar/render?${params.toString()}`,
    };
  }).filter(Boolean);

  return c.json({ success: true, data: googleLinks });
});

/**
 * 生成 Apple Calendar 订阅链接
 * GET /api/calendar/apple
 */
calendar.get('/apple', async (c) => {
  const user = c.get('user');
  const events = await getEventsByUserId(user.id);

  // Apple Calendar 使用 webcal:// 协议订阅
  // 这里返回 .ics 文件的 URL，用户可以订阅
  const origin = getRequestOrigin(c);
  const host = new URL(origin).host;
  const icsUrl = `${origin}/api/calendar/export.ics`;

  return c.json({
    success: true,
    data: {
      subscribeUrl: `webcal://${host}/api/calendar/export.ics`,
      directUrl: icsUrl,
    },
  });
});

/**
 * 生成 iCalendar 格式内容
 */
function generateICS(events: any[]): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TimeMark//TimeMark Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:TimeMark Events',
    'X-WR-TIMEZONE:Asia/Shanghai',
  ];

  for (const event of events) {
    const startDate = parseDate(event.date);
    if (!startDate) continue;

    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);

    const now = new Date();
    const uid = `timemark-${event.id}-${Date.now()}@timemark.app`;

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${formatDateForICS(now)}`);
    lines.push(`DTSTART;VALUE=DATE:${formatDateOnlyForICS(startDate)}`);
    lines.push(`DTEND;VALUE=DATE:${formatDateOnlyForICS(endDate)}`);
    lines.push(`SUMMARY:${escapeICS(event.name)}`);
    lines.push(`DESCRIPTION:${escapeICS(generateEventDescription(event))}`);
    lines.push(`CATEGORIES:${getEventTypeLabel(event.type)}`);

    // 添加提醒
    if (event.reminderConfig?.enabled && event.reminderConfig?.daysBeforeList) {
      for (const days of event.reminderConfig.daysBeforeList) {
        lines.push('BEGIN:VALARM');
        lines.push('ACTION:DISPLAY');
        lines.push(`DESCRIPTION:TimeMark 提醒: ${escapeICS(event.name)}`);
        lines.push(`TRIGGER:-P${days}D`);
        lines.push('END:VALARM');
      }
    }

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/**
 * 生成事件描述
 */
function generateEventDescription(event: any): string {
  const parts = [
    `事件类型: ${getEventTypeLabel(event.type)}`,
    `日期: ${event.date}`,
  ];

  if (event.personName) {
    parts.push(`被提醒人: ${event.personName}`);
  }

  if (event.reminderRecipientName) {
    parts.push(`提醒人: ${event.reminderRecipientName}`);
  }

  if (event.reminderConfig?.enabled) {
    const days = event.reminderConfig.daysBeforeList?.join(', ') || '无';
    parts.push(`提前提醒: ${days} 天`);
  }

  parts.push('由 TimeMark 智能事件提醒系统生成');

  return parts.join('\\n');
}

/**
 * 获取事件类型标签
 */
function getEventTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    birthday: '生日',
    exam: '考试',
    anniversary: '纪念日',
    holiday: '节日',
    other: '其他',
  };
  return labels[type] || type;
}

/**
 * 解析日期字符串
 */
function parseDate(dateStr: string): Date | null {
  try {
    const date = new Date(dateStr + 'T00:00:00');
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

/**
 * 格式化日期为 iCalendar 格式
 */
function formatDateForICS(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * 格式化日期为 iCalendar 日期格式（仅日期）
 */
function formatDateOnlyForICS(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * 格式化日期为 Google Calendar 格式
 */
function formatDateForGoogle(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * 转义 iCalendar 特殊字符
 */
function escapeICS(text: string): string {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

export default calendar;
