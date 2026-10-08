"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { Cv } from "@tjob/shared";
import { CvEditor } from "@/components/cv-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { appendExtraFactAction, deleteCvVersionAction, retailorAction, saveCvVersionAction } from "../actions";

export function VersionEditor({ id, initial, master }: { id: string; initial: Cv; master?: Cv }) {
  return <CvEditor initial={initial} compareWith={master} onSave={(cv) => saveCvVersionAction(id, cv)} />;
}

export function Retailor({ versionId }: { versionId: string }) {
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-2">
      <Label htmlFor="rt-note" className="text-xs text-muted-foreground">
        Not quite right? Add a note and tailor again (new version, ≈$0.03)
      </Label>
      <Input id="rt-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. shorter summary, lead with AWS work" />
      <div>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await retailorAction(versionId, note);
              if (res && !res.ok) toast.error(res.message);
            })
          }
        >
          {pending ? "Tailoring…" : "Tailor again"}
        </Button>
      </div>
    </div>
  );
}

export function AddFact({ versionId, requirement }: { versionId: string; requirement: string }) {
  const [open, setOpen] = useState(false);
  const [fact, setFact] = useState("");
  const [pending, start] = useTransition();
  if (!open) {
    return (
      <Button variant="link" size="sm" className="h-auto px-0" onClick={() => setOpen(true)}>
        I have this — add a true detail
      </Button>
    );
  }
  return (
    <div className="mt-2 grid gap-2">
      <Input
        autoFocus
        value={fact}
        onChange={(e) => setFact(e.target.value)}
        placeholder={`What you actually did with ${requirement}`}
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending || fact.trim().length < 5}
          onClick={() =>
            start(async () => {
              const res = await appendExtraFactAction(fact, versionId);
              if (res?.ok) {
                toast.success(res.message);
                setOpen(false);
                setFact("");
              } else toast.error(res?.message ?? "Couldn't add");
            })
          }
        >
          Add to Extra facts
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function DeleteVersion({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      className="text-destructive"
      disabled={pending}
      onClick={() => {
        if (confirm("Delete this CV version?")) start(() => deleteCvVersionAction(id));
      }}
    >
      Delete
    </Button>
  );
}
