"use client";
import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import type { Cv } from "@tjob/shared";
import { CvEditor } from "@/components/cv-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  polishExtraFactsAction,
  saveExtraFactsAction,
  saveMasterCvAction,
  startBlankCvAction,
  tailorFromJdAction,
  uploadMasterCvAction,
} from "./actions";

export function UploadCv({ compact = false }: { compact?: boolean }) {
  const [state, action, pending] = useActionState(uploadMasterCvAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <Input type="file" name="file" accept="application/pdf" required className={compact ? "w-56" : "w-72"} />
      <Button type="submit" variant={compact ? "outline" : "default"} disabled={pending}>
        {pending ? "Reading your CV…" : compact ? "Re-upload" : "Upload & read"}
      </Button>
      {state?.message && (
        <p className={`w-full text-sm ${state.ok ? "text-muted-foreground" : "text-destructive"}`} role="status">
          {state.message}
        </p>
      )}
    </form>
  );
}

export function BlankCvButton() {
  const [pending, start] = useTransition();
  return (
    <Button variant="link" className="h-auto p-0" disabled={pending} onClick={() => start(() => startBlankCvAction())}>
      Start from a blank CV
    </Button>
  );
}

export function MasterEditor({ initial }: { initial: Cv }) {
  return <CvEditor initial={initial} onSave={saveMasterCvAction} />;
}

export function ExtraFacts({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const [fixed, setFixed] = useState(false);
  const [saving, startSave] = useTransition();
  const [fixing, startFix] = useTransition();
  return (
    <div className="grid gap-2">
      <Textarea
        rows={8}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Extra facts"
        className="max-h-96 overflow-y-auto"
        placeholder={"- On MARS I built the notification service with Node.js and Kafka (~50k msgs/day)\n- Wrote Jenkins pipelines for 6 microservices"}
      />
      {fixed && value !== initial && (
        <p className="text-xs text-muted-foreground" role="status">
          Spelling fixed. Check nothing changed in meaning, then save.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={saving || fixing || value === initial}
          onClick={() =>
            startSave(async () => {
              const res = await saveExtraFactsAction(value);
              if (res?.ok) {
                toast.success(res.message);
                setFixed(false);
              }
            })
          }
        >
          {saving ? "Saving…" : "Save extra facts"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={saving || fixing || value.trim().length < 5}
          onClick={() =>
            startFix(async () => {
              const res = await polishExtraFactsAction(value);
              if (res.ok) {
                setValue(res.text);
                setFixed(true);
              } else toast.error(res.message);
            })
          }
        >
          {fixing ? "Fixing…" : "Fix spelling and wording"}
        </Button>
      </div>
    </div>
  );
}

export function TailorForm() {
  const [state, action, pending] = useActionState(tailorFromJdAction, undefined);
  return (
    <form action={action} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="t-title">Job title</Label>
          <Input id="t-title" name="title" placeholder="Java Developer" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="t-company">Company</Label>
          <Input id="t-company" name="company" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="t-url">Job link (optional)</Label>
          <Input id="t-url" name="url" type="url" />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="t-desc">Job description</Label>
        <Textarea id="t-desc" name="description" rows={8} required placeholder="Paste the full job description" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="t-note">Note for this job (optional)</Label>
        <Input id="t-note" name="note" placeholder="e.g. lead with the Spring Boot microservices work at MARS" />
      </div>
      {state?.message && <p className="text-sm text-destructive" role="alert">{state.message}</p>}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Tailoring… (20–40 s)" : "Tailor my CV"}
        </Button>
      </div>
    </form>
  );
}
