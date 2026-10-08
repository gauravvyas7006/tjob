import { browser } from "wxt/browser";
import type { ExtProfileResponse } from "@tjob/shared/api";
import { api, send } from "../../src/messages";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = $("status");
const form = $<HTMLFormElement>("connect");
const connected = $("connected");

function originPattern(url: string): string {
  const u = new URL(url);
  return `${u.protocol}//${u.hostname}/*`;
}

async function showConnected(profile: ExtProfileResponse) {
  form.hidden = true;
  connected.hidden = false;
  status.textContent = "Connected";
  status.className = "muted";
  $("who").textContent = `Signed in as ${profile.name}`;
  $("skills").textContent = profile.skills.length
    ? `${profile.skills.length} skills from your CV used for match scores`
    : "Upload your CV in tjob to see match scores.";
  await browser.storage.local.set({ profile, profileAt: Date.now() });
}

async function init() {
  const s = (await browser.storage.local.get(["appUrl", "token"])) as { appUrl?: string; token?: string };
  if (s.appUrl) $<HTMLInputElement>("appUrl").value = s.appUrl;
  if (!s.appUrl || !s.token) return;
  try {
    await showConnected(await api<ExtProfileResponse>("GET", "/api/ext/profile"));
  } catch (err) {
    status.textContent = err instanceof Error ? err.message : "Couldn't reach tjob";
    status.className = "error";
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const button = form.querySelector("button")!;
  button.disabled = true;
  const appUrl = $<HTMLInputElement>("appUrl").value.trim().replace(/\/+$/, "");
  const token = $<HTMLInputElement>("token").value.trim();
  try {
    const u = new URL(appUrl);
    // vercel.app and localhost are pre-approved; custom domains need a one-time permission.
    if (!/\.vercel\.app$/.test(u.hostname) && u.hostname !== "localhost") {
      const granted = await browser.permissions.request({ origins: [originPattern(appUrl)] });
      if (!granted) throw new Error("Permission to reach your tjob address was declined.");
    }
    await browser.storage.local.set({ appUrl, token });
    await showConnected(await api<ExtProfileResponse>("GET", "/api/ext/profile"));
  } catch (err) {
    await browser.storage.local.remove(["token"]);
    status.textContent = err instanceof Error ? err.message : "Couldn't connect";
    status.className = "error";
  } finally {
    button.disabled = false;
  }
});

$("disconnect").addEventListener("click", async () => {
  await browser.storage.local.remove(["token", "profile", "profileAt"]);
  connected.hidden = true;
  form.hidden = false;
  status.textContent = "Not connected";
  status.className = "muted";
});

$("open").addEventListener("click", async () => {
  const s = (await browser.storage.local.get("appUrl")) as { appUrl?: string };
  if (s.appUrl) await send({ type: "open", url: s.appUrl });
});

void init();
