import "server-only";
import nodemailer from "nodemailer";

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

function transport(cfg: SmtpConfig) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
  });
}

export async function testSmtp(cfg: SmtpConfig): Promise<void> {
  await transport(cfg).verify();
}

export async function sendMail(
  cfg: SmtpConfig,
  msg: {
    from: string;
    to: string;
    subject: string;
    text: string;
    inReplyTo?: string;
    attachments?: { filename: string; content: Buffer; contentType: string }[];
  },
): Promise<string> {
  const info = await transport(cfg).sendMail({
    from: msg.from,
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
    inReplyTo: msg.inReplyTo,
    references: msg.inReplyTo,
    attachments: msg.attachments,
  });
  return info.messageId;
}
