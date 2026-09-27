import { describe, expect, it } from 'vitest';
import { parseIcsEvents } from '../utils/ics-parser.js';

function calendar(...eventLines: string[]): string {
  return [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    ...eventLines,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join(String.fromCharCode(13, 10));
}

describe('parseIcsEvents', () => {
  it('parses a valid date-only VEVENT', () => {
    expect(parseIcsEvents(calendar(
      'SUMMARY:Anniversary',
      'DTSTART;VALUE=DATE:20261001',
    ))).toMatchObject([{ name: 'Anniversary', date: '2026-10-01' }]);
  });

  it('rejects an eight-digit DTSTART without an explicit DATE value type', () => {
    expect(parseIcsEvents(calendar(
      'SUMMARY:Unqualified date',
      'DTSTART:20261001',
    ))).toEqual([]);
  });

  it('rejects an event with duplicate DTSTART properties', () => {
    expect(parseIcsEvents(calendar(
      'SUMMARY:Duplicate date',
      'DTSTART;VALUE=DATE:20261001',
      'DTSTART;VALUE=DATE:20261002',
    ))).toEqual([]);
  });

  it('does not truncate a date-time DTSTART to a date-only value', () => {
    expect(parseIcsEvents(calendar(
      'SUMMARY:Timed event',
      'DTSTART:20261001T193000Z',
    ))).toEqual([]);
  });

  it('rejects a date-only value declared as a date-time', () => {
    expect(parseIcsEvents(calendar(
      'SUMMARY:Invalid value type',
      'DTSTART;VALUE=DATE-TIME:20261001',
    ))).toEqual([]);
  });

  it('rejects an impossible calendar date', () => {
    expect(parseIcsEvents(calendar(
      'SUMMARY:Invalid date',
      'DTSTART;VALUE=DATE:20260230',
    ))).toEqual([]);
  });

  it('does not interpret property-like text inside a value as a property', () => {
    expect(parseIcsEvents(calendar(
      'DESCRIPTION:SUMMARY:Fake event',
      'DESCRIPTION:DTSTART:20261001',
    ))).toEqual([]);
  });
});
