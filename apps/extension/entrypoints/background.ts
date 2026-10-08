import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { getSettings, type BgMessage, type BgResult } from "../src/messages";

/**
 * All requests to tjob go through here (the service worker has host permission for the tjob
 * URL, so there are no CORS issues and the token never touches LinkedIn/Naukri pages).
 */
export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: BgMessage, _sender, sendResponse) => {
    handle(msg).then(sendResponse, (err: unknown) =>
      sendResponse({ ok: false, status: 0, error: err instanceof Error ? err.message : String(err) }),
    );
    return true; // async response
  });
});

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

async function handle(msg: BgMessage): Promise<BgResult> {
  if (msg.type === "open") {
    await browser.tabs.create({ url: msg.url });
    return { ok: true, data: null };
  }
  const settings = await getSettings();
  if (!settings) return { ok: false, status: 0, error: "Open the tjob extension popup and connect it first." };
  const auth = { Authorization: `Bearer ${settings.token}` };

  if (msg.type === "api") {
    let res: Response;
    try {
      res = await fetch(settings.appUrl + msg.path, {
        method: msg.method,
        headers: msg.body === undefined ? auth : { ...auth, "Content-Type": "application/json" },
        body: msg.body === undefined ? undefined : JSON.stringify(msg.body),
      });
    } catch {
      return { ok: false, status: 0, error: `Can't reach tjob at ${settings.appUrl}` };
    }
    const data = await res.json().catch(() => null);
    if (res.status === 401) return { ok: false, status: 401, error: "tjob rejected the token — reconnect in the popup." };
    if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? `tjob returned ${res.status}` };
    return { ok: true, data };
  }

  if (msg.type === "pdf") {
    if (!msg.url.startsWith(settings.appUrl + "/api/cv/")) return { ok: false, status: 0, error: "Unexpected PDF URL" };
    const res = await fetch(msg.url, { headers: auth });
    if (!res.ok) return { ok: false, status: res.status, error: `Couldn't download the CV (${res.status})` };
    const fileName =
      res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "CV.pdf";
    return { ok: true, data: { base64: toBase64(await res.arrayBuffer()), fileName } };
  }
  return { ok: false, status: 0, error: "Unknown message" };
}
