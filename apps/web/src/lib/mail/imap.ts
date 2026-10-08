import "server-only";
import { ImapFlow } from "imapflow";

export interface ImapConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  mailbox?: string;
}

export function imapClient(cfg: ImapConfig): ImapFlow {
  return new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false,
    disableAutoIdle: true,
  });
}

/** Connect, open the mailbox read-only and disconnect. Throws with the server's message on failure. */
export async function testImap(cfg: ImapConfig): Promise<{ messages: number }> {
  const client = imapClient(cfg);
  try {
    await client.connect();
    const box = await client.mailboxOpen(cfg.mailbox || "INBOX", { readOnly: true });
    return { messages: box.exists };
  } finally {
    await client.logout().catch(() => {});
  }
}
