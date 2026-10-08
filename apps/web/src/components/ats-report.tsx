import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import {
  ATS_BAND_LABELS,
  ATS_BAND_TEXT,
  type AtsBand,
  type AtsReport,
  type CheckGroup,
  type CheckStatus,
} from "@/lib/cv/ats-check";
import { cn } from "@/lib/utils";

// Status colors always come with an icon and a text label.
const STATUS: Record<CheckStatus, { icon: typeof CheckCircle2; className: string; label: string }> = {
  pass: { icon: CheckCircle2, className: "text-good", label: "Passed" },
  warn: { icon: AlertTriangle, className: "text-warning", label: "Could be better" },
  fail: { icon: XCircle, className: "text-critical", label: "Failed" },
};

const BAND_STYLE: Record<AtsBand, string> = {
  strong: "bg-good/15",
  good: "bg-good/10",
  borderline: "bg-warning/15",
  low: "bg-critical/10",
};

const GROUPS: Record<CheckGroup, string> = {
  read: "Can an ATS read it?",
  match: "Does it match the job?",
  content: "Content",
};

/** The ATS test result for one CV version: score, chance band, and every check with its fix. */
export function AtsReportCard({ report, open = true }: { report: AtsReport; open?: boolean }) {
  const toImprove = report.items.filter((i) => i.status !== "pass").length;
  const passed = report.items.length - toImprove;
  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs text-muted-foreground">ATS test</div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-semibold tabular-nums">{report.score}</span>
            <span className="text-sm text-muted-foreground">/ 100</span>
          </div>
        </div>
        <span className={cn("rounded-full px-2.5 py-1 text-sm font-medium", BAND_STYLE[report.band])}>
          {ATS_BAND_LABELS[report.band]}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full bg-primary" style={{ width: `${report.score}%` }} />
      </div>
      <p className="mt-2 text-sm">{ATS_BAND_TEXT[report.band]}</p>
      {report.capped && <p className="mt-1 text-xs text-muted-foreground">{report.capped}</p>}
      {report.beforeScore !== null && (
        <p className="mt-1 text-xs text-muted-foreground">
          Your CV before tailoring: <span className="tabular-nums">{report.beforeScore} / 100</span>
        </p>
      )}

      <details open={open} className="mt-3">
        <summary className="cursor-pointer text-sm font-medium">
          {toImprove ? `${toImprove} to improve · ${passed} passed` : `All ${passed} checks passed`}
        </summary>
        <div className="mt-2 grid gap-3">
          {(Object.keys(GROUPS) as CheckGroup[]).map((group) => {
            const items = report.items.filter((i) => i.group === group);
            if (!items.length) return null;
            return (
              <div key={group}>
                <h4 className="mb-1 text-xs font-medium text-muted-foreground">{GROUPS[group]}</h4>
                <ul className="grid gap-2">
                  {items.map((item) => {
                    const s = STATUS[item.status];
                    return (
                      <li key={item.id} className="flex gap-2 text-sm">
                        <s.icon className={cn("mt-0.5 size-4 shrink-0", s.className)} aria-hidden />
                        <div className="min-w-0">
                          <div>
                            <span className="font-medium">{item.label}</span>
                            <span className="sr-only"> ({s.label})</span>
                          </div>
                          <div className="text-muted-foreground">{item.detail}</div>
                          {item.status !== "pass" && <div className="mt-0.5">{item.fix}</div>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </details>
      <p className="mt-3 text-xs text-muted-foreground">
        An estimate. Every company sets up its ATS differently; this tests the PDF you download on what most of them
        check: a readable file, the job&apos;s skills and title, years of experience, degree and location.
      </p>
    </div>
  );
}
