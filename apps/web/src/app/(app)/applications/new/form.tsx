"use client";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createApplicationAction } from "../actions";

const SELECT = "h-9 w-full rounded-md border bg-background px-2 text-sm";

export function NewApplicationForm() {
  const [state, action, pending] = useActionState(createApplicationAction, undefined);
  const [status, setStatus] = useState("applied");
  const [hasJd, setHasJd] = useState(false);

  return (
    <form action={action} className="grid gap-4 rounded-xl border bg-card p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="company">Company</Label>
          <Input id="company" name="company" required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="title">Job title</Label>
          <Input id="title" name="title" required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="source">Where you found it</Label>
          <select id="source" name="source" className={SELECT} defaultValue="linkedin">
            <option value="linkedin">LinkedIn</option>
            <option value="naukri">Naukri</option>
            <option value="other">Other (company site, referral…)</option>
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="location">Location</Label>
          <Input id="location" name="location" placeholder="e.g. Pune / Remote" />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="url">Job link</Label>
          <Input id="url" name="url" type="url" placeholder="https://" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="status">Status</Label>
          <select id="status" name="status" className={SELECT} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="applied">Already applied</option>
            <option value="saved">Saved (not applied yet)</option>
          </select>
        </div>
        {status === "applied" && (
          <div className="grid gap-2">
            <Label htmlFor="appliedAt">Applied on</Label>
            <Input id="appliedAt" name="appliedAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
          </div>
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="description">Job description</Label>
        <Textarea
          id="description"
          name="description"
          rows={10}
          placeholder="Paste the full job description"
          onChange={(e) => setHasJd(e.target.value.trim().length > 50)}
        />
      </div>
      {hasJd && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="tailor" className="size-4" />
          Tailor my CV for this job now (about $0.03)
        </label>
      )}
      {state?.message && (
        <p className={state.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"} role="alert">
          {state.message}
        </p>
      )}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save application"}
        </Button>
      </div>
    </form>
  );
}
