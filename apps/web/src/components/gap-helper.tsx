"use client";
import { useState, useTransition } from "react";
import { Loader2, PencilLine, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { appendExtraFactAction, polishFactAction, suggestFactAction } from "@/app/(app)/cv/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Busy = "suggest" | "polish" | "add" | null;
type Hint = { related: boolean; condition: string; basedOn: string };

/**
 * Two ways to close a gap honestly, both ending in a sentence the user confirms before it's saved
 * to Extra facts: AI suggests where it fits in their real projects, or they write a rough note and
 * AI fixes the wording.
 */
export function GapHelper({
  versionId,
  requirement,
  note,
}: {
  versionId: string;
  requirement: string;
  note: string;
}) {
  const [mode, setMode] = useState<"suggest" | "write" | null>(null);
  const [text, setText] = useState("");
  const [hint, setHint] = useState<Hint | null>(null);
  const [added, setAdded] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [, start] = useTransition();

  const run = (what: Exclude<Busy, null>, fn: () => Promise<void>) => {
    setBusy(what);
    start(async () => {
      try {
        await fn();
      } finally {
        setBusy(null);
      }
    });
  };
  const close = () => {
    setMode(null);
    setText("");
    setHint(null);
  };

  const suggest = () => {
    setMode("suggest");
    setHint(null);
    setText("");
    run("suggest", async () => {
      const res = await suggestFactAction(requirement, note);
      if (!res.ok) {
        toast.error(res.message);
        setMode(null);
        return;
      }
      setText(res.text);
      setHint({ related: Boolean(res.related), condition: res.condition ?? "", basedOn: res.basedOn ?? "" });
    });
  };

  const polish = () =>
    run("polish", async () => {
      const res = await polishFactAction(text, requirement);
      if (res.ok) setText(res.text);
      else toast.error(res.message);
    });

  const add = () =>
    run("add", async () => {
      const res = await appendExtraFactAction(text, versionId);
      if (!res?.ok) {
        toast.error(res?.message ?? "Couldn't add");
        return;
      }
      toast.success(res.message);
      close();
      setAdded(true);
    });

  if (added) return <p className="mt-1.5 text-sm text-muted-foreground">Added to Extra facts.</p>;

  if (!mode) {
    return (
      <div className="mt-1.5 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={suggest}>
          <Sparkles className="size-3.5" aria-hidden />
          Suggest from my projects
        </Button>
        <Button size="sm" variant="outline" onClick={() => setMode("write")}>
          <PencilLine className="size-3.5" aria-hidden />
          Write it myself
        </Button>
      </div>
    );
  }

  if (busy === "suggest") {
    return (
      <p className="mt-2 flex items-center gap-2 text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Reading your experience and projects…
      </p>
    );
  }

  return (
    <div className="mt-2 grid gap-2 rounded-lg border bg-muted/40 p-3">
      {hint &&
        (hint.related ? (
          <p className="text-xs">
            {hint.basedOn && (
              <>
                Based on <strong>{hint.basedOn}</strong>.{" "}
              </>
            )}
            <strong>Add it only if it&apos;s true:</strong> {hint.condition}
          </p>
        ) : (
          <p className="text-xs">
            Nothing in your CV clearly connects to {requirement}. {hint.condition} If you have used it, write what you did
            below.
          </p>
        ))}
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        aria-label={`What you did with ${requirement}`}
        placeholder={`Roughly what you did with ${requirement}, in your own words. For example: "used docker to run our node api on mars, wrote the dockerfile"`}
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy !== null || text.trim().length < 5} onClick={polish}>
          {busy === "polish" ? "Improving…" : "Improve wording"}
        </Button>
        <Button size="sm" disabled={busy !== null || text.trim().length < 5} onClick={add}>
          {busy === "add" ? "Adding…" : "It's true: add to Extra facts"}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy !== null} onClick={close}>
          Cancel
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Improve wording fixes grammar and spelling without adding anything new. Edit the text until it&apos;s exactly
        true.
      </p>
    </div>
  );
}
