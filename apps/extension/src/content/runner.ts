import { browser } from "wxt/browser";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { STATUS_LABELS } from "@tjob/shared/constants";
import { quickMatch } from "@tjob/shared/skills";
import type {
  ExtAutofillResponse,
  ExtLookupResponse,
  ExtProfileResponse,
  ExtSaveResponse,
  ExtTailorResponse,
} from "@tjob/shared/api";
import { api, getSettings, send } from "../messages";
import type { ScrapedJob, SiteAdapter } from "../sites/types";
import { attachFile, collectFields, fillField, markField, readValue, type FormField } from "./fields";
import { Panel, type PanelAction } from "./panel";

const PROFILE_TTL = 6 * 3600 * 1000;

interface State {
  key: string | null;
  job: ScrapedJob | null;
  jobId: string | null;
  cvVersionId: string | null;
  applied: boolean;
  tailor: ExtTailorResponse | null;
  filled: FormField[];
}

async function profile(): Promise<ExtProfileResponse | null> {
  const s = (await browser.storage.local.get(["profile", "profileAt"])) as { profile?: ExtProfileResponse; profileAt?: number };
  if (s.profile && s.profileAt && Date.now() - s.profileAt < PROFILE_TTL) return s.profile;
  try {
    const p = await api<ExtProfileResponse>("GET", "/api/ext/profile");
    await browser.storage.local.set({ profile: p, profileAt: Date.now() });
    return p;
  } catch {
    return s.profile ?? null;
  }
}

/**
 * Drives the panel for one site: watches SPA navigation, reads the job you're viewing, and runs
 * the actions you click. Nothing happens without a click except reading the page you opened and
 * noticing the site's own "application sent" confirmation.
 */
export function runSite(site: SiteAdapter, ctx: ContentScriptContext) {
  const state: State = { key: null, job: null, jobId: null, cvVersionId: null, applied: false, tailor: null, filled: [] };
  const panel = new Panel((a) => void onAction(a));
  let connected = false;
  let mode: "job" | "import" | "none" = "none";
  let extractAttempts = 0;

  async function refreshLookup() {
    if (!state.job) return;
    const q = new URLSearchParams({ source: site.source, externalId: state.job.externalId ?? "", url: state.job.url });
    try {
      const r = await api<ExtLookupResponse>("GET", `/api/ext/lookup?${q}`);
      state.jobId = r.jobId ?? state.jobId;
      state.cvVersionId = r.cvVersionId ?? state.cvVersionId;
      if (r.status) {
        state.applied = !["saved", "cv_ready"].includes(r.status);
        const when = r.appliedAt ? ` ${new Date(r.appliedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : "";
        const tone = r.status === "rejected" ? "bad" : r.status === "offer" || r.status === "interview" ? "ok" : state.applied ? "blue" : "warn";
        panel.status(`${STATUS_LABELS[r.status]}${state.applied ? when : ""} · in tjob`, tone);
      } else {
        panel.status("Not saved yet", "none");
      }
    } catch (err) {
      panel.status(err instanceof Error ? err.message : "tjob unavailable", "bad");
    }
  }

  async function showMatch() {
    const p = await profile();
    if (!state.job?.description || !p?.skills.length) {
      panel.match(p && !p.skills.length ? "Upload your CV in tjob to see a match score." : "");
      return;
    }
    const m = quickMatch(state.job.description, p.skills);
    panel.match(
      `Match ${m.score}%${m.missing.length ? ` · missing: ${m.missing.slice(0, 4).join(", ")}${m.missing.length > 4 ? "…" : ""}` : ""}`,
    );
  }

  async function ensureSaved(): Promise<string> {
    if (state.jobId) return state.jobId;
    if (!state.job) throw new Error("No job on this page.");
    if (!state.job.description) {
      const pasted = panel.pastedDescription();
      if (!pasted) {
        panel.askForDescription();
        throw new Error("Paste the job description first.");
      }
      state.job.description = pasted;
    }
    const r = await api<ExtSaveResponse>("POST", "/api/ext/jobs", state.job);
    state.jobId = r.jobId;
    return r.jobId;
  }

  async function saveAnswers() {
    const answers = state.filled
      .filter((f) => f.type !== "checkbox")
      .map((f) => ({ question: f.label, value: readValue(f) }))
      .filter((a) => a.value && a.question);
    state.filled = [];
    if (answers.length) await api("POST", "/api/ext/answers", { answers }).catch(() => {});
  }

  async function markApplied(auto: boolean) {
    const jobId = await ensureSaved();
    await api("POST", "/api/ext/applied", { jobId, cvVersionId: state.tailor?.cvVersionId ?? state.cvVersionId });
    state.applied = true;
    await saveAnswers();
    await refreshLookup();
    panel.message(auto ? "Application detected and recorded in tjob." : "Marked as applied.");
  }

  async function pdfFile(): Promise<File> {
    const url = state.tailor?.pdfUrl;
    if (!url) throw new Error("Tailor a CV first.");
    const res = await send<{ base64: string; fileName: string }>({ type: "pdf", url });
    if (!res.ok) throw new Error(res.error);
    const bytes = Uint8Array.from(atob(res.data.base64), (c) => c.charCodeAt(0));
    return new File([bytes], res.data.fileName, { type: "application/pdf" });
  }

  async function onAction(action: PanelAction) {
    panel.busy(true);
    panel.message("");
    try {
      if (action === "paste") {
        if (state.job) state.job.description = panel.pastedDescription();
        await showMatch();
        panel.message("Description added.");
      } else if (action === "save") {
        await ensureSaved();
        await refreshLookup();
        panel.message("Saved to tjob.");
      } else if (action === "tailor") {
        const jobId = await ensureSaved();
        panel.message("Tailoring your CV… (20–40 s)");
        const r = await api<ExtTailorResponse>("POST", "/api/ext/tailor", { jobId });
        state.tailor = r;
        state.cvVersionId = r.cvVersionId;
        panel.showTailorResult(r.atsBefore, r.atsAfter, r.atsBand ?? "", r.gaps, Boolean(site.resumeInput()) || state.job?.applyType === "easy_apply");
        panel.message("Review it in tjob before sending.");
        await refreshLookup();
      } else if (action === "autofill") {
        const root = site.applyRoot();
        if (!root) throw new Error("Open the application form first (Easy Apply / Apply), then click Autofill.");
        const fields = collectFields(root);
        if (!fields.length) throw new Error("No empty fields found in this step.");
        const jobId = await ensureSaved().catch(() => null);
        const r = await api<ExtAutofillResponse>("POST", "/api/ext/autofill", {
          jobId,
          questions: fields.map((f) => ({ id: f.id, label: f.label, type: f.type, options: f.options })),
        });
        let filled = 0;
        let ai = 0;
        for (const a of r.answers) {
          const f = fields.find((x) => x.id === a.id);
          if (!f || a.source === "none" || !fillField(f, a.value)) continue;
          markField(f, a.source);
          filled++;
          if (a.source === "ai") ai++;
        }
        state.filled.push(...fields);
        const left = fields.length - filled;
        panel.message(
          `Filled ${filled} of ${fields.length}${ai ? ` (${ai} drafted by AI — check the amber ones)` : ""}${left ? `; ${left} left for you` : ""}. Review, then click Next/Submit yourself.`,
        );
      } else if (action === "applied") {
        await markApplied(false);
      } else if (action === "download") {
        const file = await pdfFile();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(file);
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      } else if (action === "edit") {
        if (state.tailor) await send({ type: "open", url: state.tailor.editUrl });
      } else if (action === "attach") {
        const input = site.resumeInput();
        if (!input) throw new Error("Go to the resume/upload step of the application, then click Attach.");
        attachFile(input, await pdfFile());
        panel.message("Tailored CV attached. Check it's selected, then continue.");
      } else if (action === "import") {
        const items = site.extractAppliedList();
        if (!items.length) throw new Error("No applications found on this page.");
        const r = await api<{ created: number; updated: number; skipped: number }>("POST", "/api/ext/import", {
          source: site.source,
          items,
        });
        panel.message(`Imported ${r.created} new, updated ${r.updated}, ${r.skipped} already in tjob.`);
      }
    } catch (err) {
      panel.message(err instanceof Error ? err.message : String(err), true);
    } finally {
      panel.busy(false);
    }
  }

  async function tick() {
    if (!connected) {
      connected = Boolean(await getSettings());
      if (!connected) return;
    }
    if (site.isAppliedListPage()) {
      if (mode !== "import") {
        mode = "import";
        state.key = null;
        panel.mount();
      }
      panel.showImport(site.extractAppliedList().length);
      return;
    }

    const key = site.jobKey();
    if (!key) {
      if (mode !== "none") panel.unmount();
      mode = "none";
      state.key = null;
      return;
    }
    if (key !== state.key) {
      Object.assign(state, { key, job: null, jobId: null, cvVersionId: null, applied: false, tailor: null, filled: [] });
      extractAttempts = 0;
      mode = "job";
      panel.mount();
      panel.showJob("Reading job…", "");
      panel.status("");
      panel.match("");
    }
    if (!state.job && extractAttempts < 8) {
      extractAttempts++;
      const job = site.extractJob();
      if (job && (job.description || extractAttempts >= 8)) {
        state.job = job;
        panel.showJob(job.title, [job.company, job.location].filter(Boolean).join(" · "));
        if (!job.description) panel.askForDescription();
        await Promise.all([refreshLookup(), showMatch()]);
      }
      return;
    }
    if (state.job && !state.applied && site.isApplySuccess()) {
      state.applied = true;
      await markApplied(true).catch((err) => panel.message(err instanceof Error ? err.message : String(err), true));
    }
  }

  let running = false;
  ctx.setInterval(() => {
    if (running) return;
    running = true;
    tick().finally(() => (running = false));
  }, 1200);
  void tick();
}
