import { describe, expect, it } from 'vitest';
import { resolveClientIpInfo } from '../utils/client-ip.js';

const headers = (values: Record<string, string>) => new Headers(values);

describe('resolveClientIpInfo', () => {
  it('ignores forwarded headers from an untrusted peer', () => {
    expect(resolveClientIpInfo(
      '203.0.113.10',
      headers({
        'x-forwarded-for': '198.51.100.20',
        'x-real-ip': '198.51.100.21',
        'cf-connecting-ip': '198.51.100.22',
      }),
      '10.0.0.0/8',
    )).toEqual({ ip: '203.0.113.10', trusted: false });
  });

  it('walks the forwarded chain from the trusted peer toward the first untrusted address', () => {
    expect(resolveClientIpInfo(
      '10.0.0.9',
      headers({ 'x-forwarded-for': '198.51.100.20, 203.0.113.30, 10.0.0.8' }),
      '10.0.0.0/8',
    )).toEqual({ ip: '203.0.113.30', trusted: true });
  });

  it('accepts a platform client-IP header only from a trusted peer', () => {
    expect(resolveClientIpInfo(
      '10.0.0.9',
      headers({
        'cf-connecting-ip': '198.51.100.22',
        'x-forwarded-for': '198.51.100.20',
      }),
      '10.0.0.0/8',
    )).toEqual({ ip: '198.51.100.22', trusted: true });
  });

  it('ignores invalid proxy CIDRs and malformed forwarded addresses', () => {
    expect(resolveClientIpInfo(
      '10.0.0.9',
      headers({ 'x-forwarded-for': 'not-an-ip' }),
      '10.0.0.0/99,not-a-cidr',
    )).toEqual({ ip: '10.0.0.9', trusted: false });
  });

  it('matches IPv4-mapped proxy peers against configured IPv4 ranges', () => {
    expect(resolveClientIpInfo(
      '::ffff:10.0.0.9',
      headers({ 'x-forwarded-for': '198.51.100.20' }),
      '10.0.0.0/8',
    )).toEqual({ ip: '198.51.100.20', trusted: true });
  });

  it('does not treat a catch-all range as a trusted proxy', () => {
    expect(resolveClientIpInfo(
      '203.0.113.8',
      headers({ 'x-forwarded-for': '198.51.100.20' }),
      '0.0.0.0/0',
    )).toEqual({ ip: '203.0.113.8', trusted: false });
    expect(resolveClientIpInfo(
      '2001:db8::8',
      headers({ 'x-forwarded-for': '198.51.100.20' }),
      '::/0',
    )).toEqual({ ip: '2001:db8::8', trusted: false });
  });
});
