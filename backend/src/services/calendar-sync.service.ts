import { query, queryTransaction, type QueryStatement } from '../db/index.js';
import { createEvent } from './event.service.js';
import { parseIcsEvents } from '../utils/ics-parser.js';
import { safeAxiosGet } from '../utils/safe-http.js';
import { createLogger } from '../utils/logger.js';
const log = createLogger('calendar-sync');

function parseCalendarUrls(raw: unknown): string[] {
  let values: unknown[];
  if (Array.isArray(raw)) {
    values = raw;
  } else if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      values = Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  } else {
    return [];
  }

  return values
    .filter((value): value is string => typeof value === 'string')
    .map((url) => url.trim())
    .filter(Boolean);
}

function getIcsLines(ics: string): string[] {
  return ics.split(String.fromCharCode(10)).map((line, index) => {
    const withoutCarriageReturn = line.endsWith(String.fromCharCode(13)) ? line.slice(0, -1) : line;
    return index === 0 && withoutCarriageReturn.charCodeAt(0) === 0xfeff
      ? withoutCarriageReturn.slice(1)
      : withoutCarriageReturn;
  });
}

function getUnfoldedIcsLines(ics: string): string[] {
  const lines: string[] = [];
  for (const line of getIcsLines(ics)) {
    if ((line.startsWith(' ') || line.startsWith(String.fromCharCode(9))) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

type CalendarComponentFrame = {
  name: string;
  childCount: number;
  properties: Map<string, string[]>;
};

function isValidTimezoneDateTime(value: string): boolean {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (year < 1 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 60) {
    return false;
  }

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
}

function isValidTimezoneOffset(value: string): boolean {
  const match = /^[+-](\d{2})(\d{2})(\d{2})?$/.exec(value);
  if (!match) return false;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] ? Number(match[3]) : 0;
  return hour <= 23 && minute <= 59 && second <= 59;
}

function isValidCalendarComponent(frame: CalendarComponentFrame): boolean {
  const hasExactlyOneValue = (name: string) => {
    const values = frame.properties.get(name) ?? [];
    return values.length === 1 && values[0].trim().length > 0;
  };

  if (frame.name === 'VTIMEZONE') {
    return hasExactlyOneValue('TZID') && frame.childCount > 0;
  }
  if (frame.name === 'STANDARD' || frame.name === 'DAYLIGHT') {
    const starts = frame.properties.get('DTSTART') ?? [];
    const offsetsFrom = frame.properties.get('TZOFFSETFROM') ?? [];
    const offsetsTo = frame.properties.get('TZOFFSETTO') ?? [];
    return starts.length === 1 && isValidTimezoneDateTime(starts[0])
      && offsetsFrom.length === 1 && isValidTimezoneOffset(offsetsFrom[0])
      && offsetsTo.length === 1 && isValidTimezoneOffset(offsetsTo[0]);
  }
  if (frame.name === 'VALARM') {
    return hasExactlyOneValue('ACTION') && hasExactlyOneValue('TRIGGER');
  }
  return true;
}

function hasValidCalendarEnvelope(ics: string): boolean {
  const content = getUnfoldedIcsLines(ics).map((line) => line.trim()).filter(Boolean);
  if (content.length < 4) return false;

  const upper = content.map((line) => line.toUpperCase());
  if (upper[0] !== 'BEGIN:VCALENDAR' || upper[upper.length - 1] !== 'END:VCALENDAR') return false;
  if (upper.filter((line) => line === 'BEGIN:VCALENDAR').length !== 1) return false;
  if (upper.filter((line) => line === 'END:VCALENDAR').length !== 1) return false;

  const components: CalendarComponentFrame[] = [];
  let rootComponentSeen = false;
  let versionCount = 0;
  let productIdCount = 0;
  for (const line of content.slice(1, -1)) {
    const separator = line.indexOf(':');
    if (separator <= 0) return false;
    const property = line.slice(0, separator).toUpperCase();
    const value = line.slice(separator + 1);

    if (property === 'BEGIN') {
      const component = value.trim().toUpperCase();
      const parent = components[components.length - 1];
      const allowed = parent === undefined
        ? component === 'VEVENT' || component === 'VTIMEZONE'
        : parent.name === 'VEVENT'
          ? component === 'VALARM'
          : parent.name === 'VTIMEZONE' && (component === 'STANDARD' || component === 'DAYLIGHT');
      if (!allowed) return false;
      if (parent === undefined) rootComponentSeen = true;
      if (parent) parent.childCount++;
      components.push({ name: component, childCount: 0, properties: new Map() });
      continue;
    }

    if (property === 'END') {
      const frame = components.pop();
      if (!frame || frame.name !== value.trim().toUpperCase() || !isValidCalendarComponent(frame)) {
        return false;
      }
      continue;
    }

    if (components.length > 0) {
      const propertyName = property.split(';', 1)[0];
      const frame = components[components.length - 1];
      const values = frame.properties.get(propertyName) ?? [];
      values.push(value);
      frame.properties.set(propertyName, values);
      continue;
    }
    const propertyName = property.split(';', 1)[0];
    if (propertyName === 'VERSION') {
      if (property !== 'VERSION' || rootComponentSeen || value.trim() !== '2.0' || versionCount > 0) {
        return false;
      }
      versionCount++;
    } else if (propertyName === 'PRODID') {
      if (property !== 'PRODID' || rootComponentSeen || value.trim().length === 0 || productIdCount > 0) {
        return false;
      }
      productIdCount++;
    }
  }

  return components.length === 0 && versionCount === 1 && productIdCount === 1;
}

function getCalendarUrlLabel(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.host}`;
  } catch {
    return 'External calendar URL';
  }
}

async function fetchIcsText(url: string): Promise<string> {
  const normalized = url.replace(/^webcal:\/\//i, 'https://');
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(normalized);
  } catch {
    throw new Error('Invalid external calendar URL');
  }
  if (parsedUrl.protocol === 'http:' && (parsedUrl.username || parsedUrl.password)) {
    throw new Error('Credentials are not allowed in HTTP calendar URLs');
  }

  const res = await safeAxiosGet<string>(normalized, {
    headers: { 'User-Agent': 'TimeMark/2.12 CalendarSync' },
    timeout: 20000,
    validateStatus: () => true,
  });
  if (res.status >= 300 && res.status < 400) {
    throw new Error('Redirects are not allowed for external calendar URLs');
  }
  if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`);
  const body = String(res.data ?? '');
  if (!hasValidCalendarEnvelope(body)) {
    throw new Error('Invalid iCalendar response');
  }
  return body;
}

function parseReplaceCalendarEvents(ics: string): Array<{ name: string; date: string }> {
  let insideEvent = false;
  let starts = 0;
  let ends = 0;
  for (const line of getIcsLines(ics)) {
    const marker = line.trim().toUpperCase();
    if (marker === 'BEGIN:VEVENT') {
      if (insideEvent) throw new Error('Calendar contains malformed or unsupported events');
      insideEvent = true;
      starts++;
    } else if (marker === 'END:VEVENT') {
      if (!insideEvent) throw new Error('Calendar contains malformed or unsupported events');
      insideEvent = false;
      ends++;
    }
  }
  const events = parseIcsEvents(ics);

  if (insideEvent || starts !== ends || events.length !== starts) {
    throw new Error('Calendar contains malformed or unsupported events');
  }

  return events;
}

export async function syncExternalCalendarsForUser(userId: number): Promise<{ imported: number; deleted: number; errors: string[] }> {
  const cfg = await query(
    'SELECT external_calendar_urls, external_calendar_sync_strategy FROM user_configs WHERE user_id = $1',
    [userId],
  );
  const row = cfg.rows[0] as { external_calendar_urls?: unknown; external_calendar_sync_strategy?: string } | undefined;
  const raw = row?.external_calendar_urls;
  const strategy = row?.external_calendar_sync_strategy === 'replace' ? 'replace' : 'add_only';
  const urls = parseCalendarUrls(raw);

  let imported = 0;
  let deleted = 0;
  const errors: string[] = [];

  if (strategy === 'replace' && urls.length > 5) {
    return { imported, deleted, errors: ['Replace sync supports at most five calendar sources'] };
  }

  if (strategy === 'replace' && urls.length > 0) {
    const stagedEvents: Array<{ name: string; date: string }> = [];
    for (const url of urls) {
      try {
        const ics = await fetchIcsText(url);
        const events = parseReplaceCalendarEvents(ics);
        if (events.length > 100) {
          throw new Error('Calendar feed exceeds the 100-event replacement limit');
        }
        stagedEvents.push(...events);
      } catch (e) {
        errors.push(`${getCalendarUrlLabel(url)}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    if (errors.length === 0) {
      const reminderConfig = JSON.stringify({
        enabled: false,
        daysBeforeList: [],
        emailRecipients: [],
        channels: [],
        accountIds: [],
        importSource: 'external_calendar',
      });
      const statements: QueryStatement[] = [
        {
          text: `DELETE FROM events
                 WHERE user_id = $1
                   AND reminder_config->>'importSource' = 'external_calendar'`,
          params: [userId],
        },
        ...stagedEvents.map((event) => ({
          text: `INSERT INTO events (
                   user_id, name, type, date, calendar_type, lunar_date, reminder_config,
                   notification_channels, notification_account_ids, relationship_mapping_id,
                   person_name, birth_date, birth_date_lunar, reminder_recipient_name,
                   reminder_recipient_email, recurring_config, next_occurrence
                 ) VALUES ($1, $2, 'other', $3, 'gregorian', NULL, $4, '[]', '[]', NULL,
                           NULL, NULL, NULL, NULL, NULL, NULL, NULL)`,
          params: [userId, event.name, event.date, reminderConfig],
        })),
      ];

      try {
        const results = await queryTransaction(statements);
        deleted = results[0]?.rowCount ?? 0;
        imported = results.slice(1).reduce((total, result) => total + result.rowCount, 0);
      } catch (e) {
        errors.push(`Calendar replacement failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return { imported, deleted, errors };
  }

  for (const url of urls.slice(0, 5)) {
    try {
      const ics = await fetchIcsText(url);
      const parsed = parseIcsEvents(ics);
      for (const ev of parsed.slice(0, 100)) {
        if (strategy === 'add_only') {
          const dup = await query(
            `SELECT id FROM events WHERE user_id = $1 AND name = $2 AND date::text LIKE $3 || '%' LIMIT 1`,
            [userId, ev.name, ev.date],
          );
          if (dup.rows.length) continue;
        }

        await createEvent(String(userId), {
          name: ev.name,
          type: 'other',
          date: ev.date,
          calendarType: 'gregorian',
          reminderConfig: {
            enabled: false,
            daysBeforeList: [],
            emailRecipients: [],
            channels: [],
            accountIds: [],
            importSource: 'external_calendar',
          },
        });
        imported++;
      }
    } catch (e) {
      errors.push(`${getCalendarUrlLabel(url)}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { imported, deleted, errors };
}

export async function syncAllExternalCalendars(): Promise<void> {
  const users = await query(
    `SELECT user_id, external_calendar_urls FROM user_configs
     WHERE external_calendar_urls IS NOT NULL`,
  );
  for (const row of users.rows as Array<{ user_id: number; external_calendar_urls: unknown }>) {
    if (parseCalendarUrls(row.external_calendar_urls).length === 0) continue;
    try {
      const r = await syncExternalCalendarsForUser(row.user_id);
      if (r.imported > 0 || r.deleted > 0) {
        log.info({ userId: row.user_id, imported: r.imported, deleted: r.deleted }, 'External calendar sync');
      }
    } catch (e) {
      log.warn({ userId: row.user_id, err: e }, 'Calendar sync failed');
    }
  }
}
