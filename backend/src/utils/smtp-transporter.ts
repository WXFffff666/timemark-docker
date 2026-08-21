import nodemailer from 'nodemailer';
import { buildSmtpTransportOptions } from '@timemark/shared';

export function createSmtpTransporter(
  host: string,
  port: number,
  fromEmail: string,
  password: string,
) {
  return nodemailer.createTransport(
    buildSmtpTransportOptions(host, port, fromEmail, password) as nodemailer.TransportOptions,
  );
}
