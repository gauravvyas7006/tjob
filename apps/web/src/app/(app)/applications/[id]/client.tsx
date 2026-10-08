"use client";
import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { APPLICATION_STATUSES, STATUS_LABELS, type ApplicationStatus } from "@tjob/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  attachCvAction,
  deleteApplicationAction,
  draftFollowUpAction,
  saveJdAction,
  saveNotesAction,
  sendFollowUpAction,
  tailorForApplicationAction,
  updateStatusAction,
} from "../actions";

export function StatusSelect({ appId, status }: { appId: string; status: ApplicationStatus }) {
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Status"
      disabled={pending}
      defaultValue={status}
      className="h-9 rounded-md border bg-background px-2 text-sm"
      onChange={(e) => {
        const next = e.target.value as ApplicationStatus;
        start(async () => {
          await updateStatusAction(appId, next);
          toast.success(`Status: ${STATUS_LABELS[next]}`);
        });
      }}
    >
      {APPLICATION_STATUSES.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  );
}

export function NotesEditor({ appId, notes }: { appId: string; notes: string }) {
  const [value, setValue] = useState(notes);
  const [pending, start] = useTransition();
  return (
    <div className="mt-2 grid gap-2">
      <Textarea
        rows={5}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Interview prep, contacts, salary discussed…"
      />
      <div>
        <Button
          size="sm"
          variant="outline"
          disabled={pending || value === notes}
          onClick={() =>
            start(async () => {
              await saveNotesAction(appId, value);
              toast.success("Notes saved");
            })
          }
        >
          {pending ? "Saving…" : "Save notes"}
        </Button>
      </div>
    </div>
  );
}

export function JdForm({ appId, hasJd }: { appId: string; hasJd: boolean }) {
  const [open, setOpen] = useState(!hasJd);
  const [state, action, pending] = useActionState(saveJdAction.bind(null, appId), undefined);
  if (!open) {
    return (
      <Button variant="link" size="sm" className="mt-2 px-0" onClick={() => setOpen(true)}>
        Replace job description
      </Button>
    );
  }
  return (
    <form action={action} className="mt-3 grid gap-2">
      {!hasJd && (
        <p className="text-sm text-muted-foreground">
          No job description yet. Paste it to see requirements, feed Insights, and tailor your CV.
        </p>
      )}
      <Textarea name="description" rows={8} placeholder="Paste the full job description" required />
      {state?.message && <p className={state.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>{state.message}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Reading…" : "Save description"}
        </Button>
        {hasJd && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

export function TailorButton({ appId, disabled }: { appId: string; disabled: boolean }) {
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-2">
      <Label htmlFor="focus" className="text-xs text-muted-foreground">
        Optional note for tailoring (e.g. &quot;emphasise the payments work at MARS&quot;)
      </Label>
      <Input id="focus" value={note} onChange={(e) => setNote(e.target.value)} disabled={disabled} />
      <div>
        <Button
          size="sm"
          disabled={disabled || pending}
          onClick={() =>
            start(async () => {
              const res = await tailorForApplicationAction(appId, note);
              if (res && !res.ok) toast.error(res.message);
            })
          }
        >
          {pending ? "Tailoring… (20–40 s)" : "Tailor CV for this job"}
        </Button>
        {disabled && <p className="mt-1 text-xs text-muted-foreground">Add the job description first.</p>}
      </div>
    </div>
  );
}

export function AttachCv({
  appId,
  current,
  versions,
}: {
  appId: string;
  current: string | null;
  versions: { id: string; title: string }[];
}) {
  const [pending, start] = useTransition();
  if (!versions.length) return null;
  return (
    <div className="grid gap-1">
      <Label htmlFor="attach" className="text-xs text-muted-foreground">
        Or use an existing CV version
      </Label>
      <select
        id="attach"
        disabled={pending}
        defaultValue={current ?? ""}
        className="h-9 rounded-md border bg-background px-2 text-sm"
        onChange={(e) => start(() => attachCvAction(appId, e.target.value || null))}
      >
        <option value="">None</option>
        {versions.map((v) => (
          <option key={v.id} value={v.id}>
            {v.title}
          </option>
        ))}
      </select>
    </div>
  );
}

export function DeleteApplication({ appId }: { appId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-destructive"
      disabled={pending}
      onClick={() => {
        if (confirm("Delete this application and its history? Linked emails stay in the Inbox.")) {
          start(() => deleteApplicationAction(appId));
        }
      }}
    >
      Delete application
    </Button>
  );
}

export function FollowUp({ appId, hasCv }: { appId: string; hasCv: boolean }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachCv, setAttachCv] = useState(hasCv);
  const [drafting, startDraft] = useTransition();
  const [sending, startSend] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Follow up</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Send a follow-up</DialogTitle>
          <DialogDescription>Sent from your mailbox over SMTP. Review before sending.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Button
            variant="outline"
            size="sm"
            className="justify-self-start"
            disabled={drafting}
            onClick={() =>
              startDraft(async () => {
                const res = await draftFollowUpAction(appId);
                if (!res.ok) return void toast.error(res.message);
                setSubject(res.subject);
                setBody(res.body);
                if (res.to && !to) setTo(res.to);
              })
            }
          >
            {drafting ? "Drafting…" : "Draft with AI (≈$0.003)"}
          </Button>
          <div className="grid gap-1.5">
            <Label htmlFor="fu-to">To</Label>
            <Input id="fu-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="recruiter@company.com" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="fu-subject">Subject</Label>
            <Input id="fu-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="fu-body">Message</Label>
            <Textarea id="fu-body" rows={9} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          {hasCv && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" checked={attachCv} onChange={(e) => setAttachCv(e.target.checked)} />
              Attach the tailored CV (PDF)
            </label>
          )}
        </div>
        <DialogFooter>
          <Button
            disabled={sending || !to || !subject || !body}
            onClick={() =>
              startSend(async () => {
                const res = await sendFollowUpAction(appId, { to, subject, body, attachCv });
                if (!res?.ok) return void toast.error(res?.message ?? "Couldn't send");
                toast.success("Follow-up sent");
                setOpen(false);
              })
            }
          >
            {sending ? "Sending…" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
