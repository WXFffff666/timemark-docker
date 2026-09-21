import { describe, it, expect } from 'vitest';
import { escapeMarkdownV2 } from '../services/notifications/telegram.service.js';

describe('Telegram MarkdownV2 escaping (issue #5)', () => {
  it('escapes every reserved character exactly once', () => {
    const input = '_*[]()~`>#+-=|{}.!\\';
    const escaped = escapeMarkdownV2(input);
    for (const ch of input) {
      expect(escaped).toContain('\\' + ch);
    }
    // No reserved character may survive unescaped.
    expect(escaped.length).toBe(input.length * 2);
  });

  it('escapes the hyphens of an ISO date', () => {
    expect(escapeMarkdownV2('1996-09-24')).toBe('1996\\-09\\-24');
    expect(escapeMarkdownV2('2026/02/17')).toBe('2026/02/17');
  });

  it('escapes sentence punctuation such as . ! ( )', () => {
    expect(escapeMarkdownV2('Hello (world)! 3.14')).toBe('Hello \\(world\\)\\! 3\\.14');
  });

  it('leaves plain CJK text untouched', () => {
    expect(escapeMarkdownV2('春节')).toBe('春节');
  });

  it('returns an empty string for nullish input', () => {
    expect(escapeMarkdownV2(undefined)).toBe('');
    expect(escapeMarkdownV2(null)).toBe('');
  });
});
