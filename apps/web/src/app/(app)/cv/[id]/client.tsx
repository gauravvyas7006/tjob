"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { Cv } from "@tjob/shared";
import { CvEditor } from "@/components/cv-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteCvVersionAction, retailorAction, saveCvVersionAction } from "../actions";

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
