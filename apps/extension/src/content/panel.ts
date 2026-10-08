/** The floating tjob panel, rendered in a Shadow DOM so the page's CSS can't affect it. */

const CSS = `
:host { all: initial; }
.panel {
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483000; width: 300px;
  font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: #111;
  background: #fff; border: 1px solid rgba(0,0,0,.12); border-radius: 12px;
  box-shadow: 0 8px 28px rgba(0,0,0,.18); overflow: hidden;
}
@media (prefers-color-scheme: dark) {
  .panel { color: #f3f3f3; background: #1c1c1e; border-color: rgba(255,255,255,.14); }
  .muted, .sub { color: #a3a3a3 !important; }
  button.secondary { color: #f3f3f3 !important; border-color: rgba(255,255,255,.2) !important; }
  textarea { color: #f3f3f3; border-color: rgba(255,255,255,.2) !important; }
}
header { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid rgba(127,127,127,.2); }
header strong { font-size: 14px; letter-spacing: -.01em; }
.icon { background: none; border: 0; color: inherit; cursor: pointer; font-size: 16px; padding: 0 4px; }
.body { padding: 10px 12px 12px; display: grid; gap: 8px; }
.collapsed .body { display: none; }
.title { font-weight: 600; }
.sub, .muted { color: #666; font-size: 12px; }
.status { font-size: 12px; }
.dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 5px; background: #8a8a8a; vertical-align: 1px; }
.dot.ok { background: #1baf7a; } .dot.warn { background: #eda100; } .dot.bad { background: #d03b3b; } .dot.blue { background: #2a78d6; }
.msg { font-size: 12px; }
.msg.error { color: #d03b3b; }
.actions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
button.btn {
  padding: 6px 8px; border-radius: 7px; border: 1px solid #2a62c9; background: #2a62c9; color: #fff;
  font: 600 12px/1.2 inherit; font-family: inherit; cursor: pointer;
}
button.secondary { background: transparent; color: #111; border-color: rgba(0,0,0,.18); }
button:disabled { opacity: .55; cursor: default; }
.result { border-top: 1px solid rgba(127,127,127,.2); padding-top: 8px; display: grid; gap: 6px; }
.links { display: flex; flex-wrap: wrap; gap: 6px; }
textarea { width: 100%; box-sizing: border-box; min-height: 90px; font: 12px/1.4 inherit; font-family: inherit; border: 1px solid rgba(0,0,0,.18); border-radius: 6px; padding: 6px; background: transparent; }
[hidden] { display: none !important; }
`;

export type PanelAction = "save" | "tailor" | "autofill" | "applied" | "attach" | "download" | "edit" | "import" | "paste";

export class Panel {
  private root: ShadowRoot;
  private host: HTMLElement;
  private el: Record<
    "panel" | "title" | "sub" | "status" | "match" | "msg" | "paste" | "actions" | "result" | "ats" | "import" | "importText" | "job",
    HTMLElement
  >;

  constructor(private onAction: (a: PanelAction) => void) {
    this.host = document.createElement("tjob-panel");
    this.root = this.host.attachShadow({ mode: "closed" });
    this.root.innerHTML = `<style>${CSS}</style>
      <div class="panel" part="panel">
        <header><strong>tjob</strong><button class="icon" data-act="toggle" aria-label="Minimise">–</button></header>
        <div class="body">
          <div class="job"><div class="title"></div><div class="sub"></div></div>
          <div class="status"></div>
          <div class="match muted"></div>
          <div class="msg" role="status"></div>
          <div class="paste" hidden>
            <div class="muted">Couldn't read the job description on this page. Paste it here:</div>
            <textarea placeholder="Job description"></textarea>
            <button class="btn secondary" data-act="paste">Use this description</button>
          </div>
          <div class="actions">
            <button class="btn secondary" data-act="save">Save</button>
            <button class="btn" data-act="tailor">Tailor CV</button>
            <button class="btn secondary" data-act="autofill">Autofill</button>
            <button class="btn secondary" data-act="applied">Mark applied</button>
          </div>
          <div class="result" hidden>
            <div class="ats"></div>
            <div class="links">
              <button class="btn" data-act="download">Download PDF</button>
              <button class="btn secondary" data-act="edit">Edit in tjob</button>
              <button class="btn secondary" data-act="attach">Attach to form</button>
            </div>
          </div>
          <div class="import" hidden>
            <div class="importText"></div>
            <button class="btn" data-act="import">Import this page</button>
          </div>
        </div>
      </div>`;
    const q = (cls: string) => this.root.querySelector(`.${cls}`) as HTMLElement;
    this.el = {
      panel: q("panel"),
      title: q("title"),
      sub: q("sub"),
      status: q("status"),
      match: q("match"),
      msg: q("msg"),
      paste: q("paste"),
      actions: q("actions"),
      result: q("result"),
      ats: q("ats"),
      import: q("import"),
      importText: q("importText"),
      job: q("job"),
    };
    this.root.addEventListener("click", (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>("[data-act]")?.dataset.act;
      if (act === "toggle") this.el.panel.classList.toggle("collapsed");
      else if (act) this.onAction(act as PanelAction);
    });
  }

  mount() {
    if (!this.host.isConnected) document.documentElement.append(this.host);
  }

  unmount() {
    this.host.remove();
  }

  showJob(title: string, sub: string) {
    this.el.job.hidden = false;
    this.el.actions.hidden = false;
    this.el.import.hidden = true;
    this.el.title.textContent = title || "Job";
    this.el.sub.textContent = sub;
    this.el.result.hidden = true;
    this.el.paste.hidden = true;
    this.message("");
  }

  showImport(count: number) {
    this.el.job.hidden = true;
    this.el.actions.hidden = true;
    this.el.result.hidden = true;
    this.el.paste.hidden = true;
    this.el.status.textContent = "";
    this.el.match.textContent = "";
    this.el.import.hidden = false;
    this.el.importText.textContent = count
      ? `${count} application${count === 1 ? "" : "s"} visible on this page. Scroll to load more first.`
      : "No applications found on this page yet.";
  }

  status(text: string, tone: "ok" | "warn" | "bad" | "blue" | "none" = "none") {
    this.el.status.innerHTML = "";
    if (!text) return;
    const dot = document.createElement("span");
    dot.className = `dot ${tone === "none" ? "" : tone}`;
    this.el.status.append(dot, document.createTextNode(text));
  }

  match(text: string) {
    this.el.match.textContent = text;
  }

  message(text: string, error = false) {
    this.el.msg.textContent = text;
    this.el.msg.className = error ? "msg error" : "msg";
  }

  busy(on: boolean) {
    this.root.querySelectorAll<HTMLButtonElement>("button.btn").forEach((b) => (b.disabled = on));
  }

  askForDescription() {
    this.el.paste.hidden = false;
  }

  pastedDescription(): string {
    return (this.root.querySelector("textarea") as HTMLTextAreaElement).value.trim();
  }

  showTailorResult(before: number, after: number, band: string, gaps: string[], canAttach: boolean) {
    this.el.result.hidden = false;
    const score = band ? `ATS test ${before} → ${after}/100 (${band})` : `ATS match ${before}% → ${after}%`;
    this.el.ats.textContent = `CV ready · ${score}${gaps.length ? ` · gaps: ${gaps.slice(0, 3).join(", ")}` : ""}`;
    (this.root.querySelector('[data-act="attach"]') as HTMLElement).hidden = !canAttach;
  }
}
