"use client";
import { useState, useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { GapSuggestion } from "@/lib/ai/facts";
import { appendExtraFactsAction, suggestAllGapsAction } from "@/app/(app)/cv/actions";
import { refineTailorChatAction } from "@/app/(app)/tailor/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";

type Row = GapSuggestion & { text: string; picked: boolean };

/**
 * One click for every gap: AI drafts a line tying each missing requirement to the candidate's real
 * projects, the candidate ticks the true ones (nothing is ticked for them), and one button saves
 * those to Extra facts and tailors again.
 */
export function GapSuggestions({ versionId, jobId }: { versionId: string; jobId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [step, setStep] = useState<"idle" | "suggesting" | "saving">("idle");
  const [, start] = useTransition();

  const suggest = () => {
    setStep("suggesting");
    start(async () => {
      const res = await suggestAllGapsAction(versionId);
      setStep("idle");
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      setRows(res.suggestions.map((s) => ({ ...s, text: s.draft, picked: false })));
    });
  };

  const picked = rows?.filter((r) => r.picked && r.text.trim().length >= 5) ?? [];
  const apply = () => {
    setStep("saving");
    start(async () => {
      const added = await appendExtraFactsAction(picked.map((r) => r.text));
      if (!added?.ok) {
        toast.error(added?.message ?? "Couldn't save");
        setStep("idle");
        return;
      }
      const res = await refineTailorChatAction(jobId, "");
      setStep("idle");
      if (!res.ok) toast.error(res.message);
      else {
        toast.success(`${added.message} New version below.`);
        setRows(null);
      }
    });
  };

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs && rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  if (!rows) {
    return (
      <div className="mb-3 rounded-lg border border-dashed p-3">
        <Button size="sm" disabled={step !== "idle"} onClick={suggest}>
          {step === "suggesting" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Sparkles className="size-3.5" aria-hidden />}
          {step === "suggesting" ? "Reading your projects…" : "Suggest lines for all gaps from my projects"}
        </Button>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Drafts one line per gap from your real work (about $0.01). You tick the ones that are true; nothing is added
          without that.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-4 grid gap-3 rounded-lg border p-3">
      <p className="text-sm">
        Tick only what you really did, and edit the wording until it&apos;s exactly true. Interviewers ask about every
        line.
      </p>
      <ul className="grid gap-3">
        {rows.map((r, i) => (
          <li key={i} className="grid gap-1.5">
            <div className="font-medium">{r.requirement}</div>
            {r.related ? (
              <>
                <label className="flex items-start gap-2 text-xs">
                  <Checkbox
                    className="mt-0.5"
                    checked={r.picked}
                    onCheckedChange={(v) => update(i, { picked: v === true })}
                    aria-label={`Add the line for ${r.requirement}`}
                  />
                  <span>
                    {r.basedOn && <>From <strong>{r.basedOn}</strong>. </>}
                    <strong>True only if:</strong> {r.condition}
                  </span>
                </label>
                <Textarea
                  rows={2}
                  value={r.text}
                  onChange={(e) => update(i, { text: e.target.value })}
                  aria-label={`Line for ${r.requirement}`}
                />
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Nothing in your CV connects to this. {r.condition}
              </p>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={step !== "idle" || !picked.length} onClick={apply}>
          {step === "saving" ? (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              Adding and tailoring… (20–40 s)
            </>
          ) : (
            `Add ${picked.length || ""} ticked ${picked.length === 1 ? "line" : "lines"} and tailor again`
          )}
        </Button>
        <Button size="sm" variant="ghost" disabled={step !== "idle"} onClick={() => setRows(null)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
