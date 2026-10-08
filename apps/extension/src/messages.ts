import { browser } from "wxt/browser";

/** Messages from content scripts / popup to the background worker. */
export type BgMessage =
  | { type: "api"; method: "GET" | "POST"; path: string; body?: unknown }
  | { type: "pdf"; url: string }
  | { type: "open"; url: string };

export type BgResult<T = unknown> = { ok: true; data: T } | { ok: false; status: number; error: string };

export interface Settings {
  appUrl: string;
  token: string;
}

export async function getSettings(): Promise<Settings | null> {
  const s = (await browser.storage.local.get(["appUrl", "token"])) as Partial<Settings>;
  if (!s.appUrl || !s.token) return null;
  return { appUrl: s.appUrl.replace(/\/+$/, ""), token: s.token };
}

export function send<T>(msg: BgMessage): Promise<BgResult<T>> {
  return browser.runtime.sendMessage(msg) as Promise<BgResult<T>>;
}

export async function api<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const res = await send<T>({ type: "api", method, path, body });
  if (!res) throw new Error("The tjob extension was updated — reload this page.");
  if (!res.ok) throw new Error(res.error);
  return res.data;
}
