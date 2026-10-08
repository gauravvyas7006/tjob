"use client";
import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AGENCY_KIND_LABELS,
  AGENCY_KINDS,
  AGENCY_STATUS_LABELS,
  AGENCY_STATUSES,
  type AgencyKind,
  type AgencyStatus,
} from "@tjob/shared";
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
  addSuggestedAgenciesAction,
  deleteAgencyAction,
  saveAgencyAction,
  saveAgencyNotesAction,
  setAgencyStatusAction,
  type ActionState,
} from "./actions";

export type AgencyFields = {
  name: string;
  kind: AgencyKind;
  area: string;
  focus: string;
  website: string;
  applyUrl: string;
  email: string;
  phone: string;
  linkedinUrl: string;
  howToApproach: string;
};

const EMPTY: AgencyFields = {
  name: "",
  kind: "recruiter",
  area: "",
  focus: "",
  website: "",
  applyUrl: "",
  email: "",
  phone: "",
  linkedinUrl: "",
  howToApproach: "",
};

export function AgencyStatusSelect({ id, status, name }: { id: string; status: AgencyStatus; name: string }) {
  const [pending, start] = useTransition();
  return (
    <select
      aria-label={`Status for ${name}`}
      disabled={pending}
      defaultValue={status}
      className="h-8 rounded-md border bg-background px-2 text-sm"
      onChange={(e) => {
        const next = e.target.value as AgencyStatus;
        start(async () => {
          await setAgencyStatusAction(id, next);
          toast.success(`${name}: ${AGENCY_STATUS_LABELS[next]}`);
        });
      }}
    >
      {AGENCY_STATUSES.map((s) => (
        <option key={s} value={s}>
          {AGENCY_STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  );
}

export function AgencyNotes({ id, notes }: { id: string; notes: string }) {
  const [value, setValue] = useState(notes);
  const [pending, start] = useTransition();
  return (
    <details>
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
        {notes ? "Notes" : "Add notes"}
      </summary>
      <div className="mt-2 grid gap-2">
        <Textarea
          rows={3}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Recruiter's name and number, what you sent, when to follow up…"
          aria-label="Notes"
        />
        <div>
          <Button
            size="sm"
            variant="outline"
            disabled={pending || value === notes}
            onClick={() =>
              start(async () => {
                await saveAgencyNotesAction(id, value);
                toast.success("Notes saved");
              })
            }
          >
            {pending ? "Saving…" : "Save notes"}
          </Button>
        </div>
      </div>
    </details>
  );
}

/** Add an agency (no `id`) or edit one. */
export function AgencyDialog({ id, initial }: { id?: string; initial?: AgencyFields }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: ActionState, form: FormData) => {
    const res = await saveAgencyAction(id ?? null, prev, form);
    if (res?.ok) {
      toast.success(res.message);
      setOpen(false);
    }
    return res;
  }, undefined);
  const v = initial ?? EMPTY;

  const field = (name: keyof AgencyFields, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`${id ?? "new"}-${name}`}>{label}</Label>
      <Input id={`${id ?? "new"}-${name}`} name={name} defaultValue={v[name]} {...props} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {id ? (
          <Button variant="ghost" size="sm">
            Edit
          </Button>
        ) : (
          <Button>Add agency</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{id ? `Edit ${v.name}` : "Add an agency"}</DialogTitle>
          <DialogDescription>
            {id ? "Update contact details as you learn them." : "A recruiter, consultancy or hiring platform you want to track."}
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {field("name", "Name", { required: true, maxLength: 200 })}
            <div className="grid gap-1.5">
              <Label htmlFor={`${id ?? "new"}-kind`}>Type</Label>
              <select
                id={`${id ?? "new"}-kind`}
                name="kind"
                defaultValue={v.kind}
                className="h-9 rounded-md border bg-background px-2 text-sm"
              >
                {AGENCY_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {AGENCY_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
            {field("area", "Area in Bengaluru", { placeholder: "Koramangala" })}
            {field("phone", "Phone", { type: "tel" })}
            {field("email", "Email", { type: "email" })}
            {field("website", "Website", { placeholder: "example.com" })}
            {field("applyUrl", "Page to send your CV", { placeholder: "Job seekers / submit CV page" })}
            {field("linkedinUrl", "LinkedIn page")}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id ?? "new"}-focus`}>What they hire for</Label>
            <Input id={`${id ?? "new"}-focus`} name="focus" defaultValue={v.focus} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id ?? "new"}-howToApproach`}>How to approach</Label>
            <Textarea id={`${id ?? "new"}-howToApproach`} name="howToApproach" rows={2} defaultValue={v.howToApproach} />
          </div>
          {state && !state.ok && (
            <p role="alert" className="text-sm text-destructive">
              {state.message}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : id ? "Save" : "Add agency"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteAgency({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-destructive"
      disabled={pending}
      onClick={() => {
        if (confirm(`Remove ${name} from your list?`)) start(() => deleteAgencyAction(id));
      }}
    >
      Remove
    </Button>
  );
}

export function AddSuggested({ count, primary = false }: { count: number; primary?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant={primary ? "default" : "outline"}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const added = await addSuggestedAgenciesAction();
          toast.success(added ? `Added ${added} ${added === 1 ? "agency" : "agencies"}` : "Already on your list");
        })
      }
    >
      {pending ? "Adding…" : `Add ${count} suggested ${count === 1 ? "agency" : "agencies"}`}
    </Button>
  );
}
