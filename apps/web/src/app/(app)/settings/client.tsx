"use client";
import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addSavedAnswerAction,
  createApiTokenAction,
  deleteMailAccountAction,
  deleteSavedAnswerAction,
  importLinkedInCsvAction,
  revokeApiTokenAction,
  saveMailAccountAction,
  saveProfileAction,
} from "./actions";

function Status({ state }: { state: { ok: boolean; message?: string } | undefined }) {
  if (!state?.message) return null;
  return (
    <p role="status" className={`text-sm ${state.ok ? "text-muted-foreground" : "text-destructive"}`}>
      {state.message}
    </p>
  );
}

function F({ label, name, defaultValue, placeholder, type = "text", required }: { label: string; name: string; defaultValue?: string | number; placeholder?: string; type?: string; required?: boolean }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} defaultValue={defaultValue} placeholder={placeholder} required={required} />
    </div>
  );
}

export function ProfileForm({ initial }: { initial: Record<string, string> }) {
  const [state, action, pending] = useActionState(saveProfileAction, undefined);
  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <F label="Full name" name="fullName" defaultValue={initial.fullName} />
        <F label="Phone" name="phone" defaultValue={initial.phone} placeholder="+91 …" />
        <F label="Current location" name="location" defaultValue={initial.location} placeholder="Pune" />
        <F label="Preferred locations" name="preferredLocations" defaultValue={initial.preferredLocations} placeholder="Pune, Bengaluru, Remote" />
        <F label="Total experience (years)" name="totalExperience" defaultValue={initial.totalExperience} placeholder="4.5" />
        <F label="Notice period" name="noticePeriod" defaultValue={initial.noticePeriod} placeholder="30 days" />
        <F label="Current CTC" name="currentCtc" defaultValue={initial.currentCtc} placeholder="12 LPA" />
        <F label="Expected CTC" name="expectedCtc" defaultValue={initial.expectedCtc} placeholder="18 LPA" />
        <F label="LinkedIn URL" name="linkedinUrl" defaultValue={initial.linkedinUrl} />
        <F label="GitHub URL" name="githubUrl" defaultValue={initial.githubUrl} />
        <F label="Portfolio / website" name="portfolioUrl" defaultValue={initial.portfolioUrl} />
      </div>
      <Status state={state} />
      <div>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save profile"}</Button>
      </div>
    </form>
  );
}

interface MailInitial {
  emailAddress: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUser: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  fromName: string;
  backfillDays: number;
}

const PRESETS: Record<string, Partial<MailInitial>> = {
  Gmail: { imapHost: "imap.gmail.com", imapPort: 993, imapSecure: true, smtpHost: "smtp.gmail.com", smtpPort: 465, smtpSecure: true },
  "Zoho (India)": { imapHost: "imap.zoho.in", imapPort: 993, imapSecure: true, smtpHost: "smtp.zoho.in", smtpPort: 465, smtpSecure: true },
  "Yahoo": { imapHost: "imap.mail.yahoo.com", imapPort: 993, imapSecure: true, smtpHost: "smtp.mail.yahoo.com", smtpPort: 465, smtpSecure: true },
};

export function MailForm({ initial }: { initial: MailInitial | null }) {
  const [state, action, pending] = useActionState(saveMailAccountAction, undefined);
  const [v, setV] = useState<MailInitial>(
    initial ?? {
      emailAddress: "",
      imapHost: "",
      imapPort: 993,
      imapSecure: true,
      imapUser: "",
      smtpHost: "",
      smtpPort: 465,
      smtpSecure: true,
      smtpUser: "",
      fromName: "",
      backfillDays: 90,
    },
  );
  const [removing, startRemove] = useTransition();
  const set = (patch: Partial<MailInitial>) => setV((x) => ({ ...x, ...patch }));

  return (
    <form action={action} className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Presets:</span>
        {Object.entries(PRESETS).map(([name, p]) => (
          <Button key={name} type="button" size="sm" variant="outline" onClick={() => set(p)}>
            {name}
          </Button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="emailAddress">Email address</Label>
          <Input id="emailAddress" name="emailAddress" type="email" required value={v.emailAddress} onChange={(e) => set({ emailAddress: e.target.value, imapUser: v.imapUser || e.target.value })} placeholder="you@example.com" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="fromName">Your name on sent emails</Label>
          <Input id="fromName" name="fromName" value={v.fromName} onChange={(e) => set({ fromName: e.target.value })} />
        </div>
      </div>

      <fieldset className="grid gap-4 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">Incoming (IMAP)</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="imapHost">Server</Label>
            <Input id="imapHost" name="imapHost" required value={v.imapHost} onChange={(e) => set({ imapHost: e.target.value })} placeholder="imap.gmail.com" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="imapPort">Port</Label>
            <Input id="imapPort" name="imapPort" type="number" value={v.imapPort} onChange={(e) => set({ imapPort: Number(e.target.value) })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="imapUser">Username</Label>
            <Input id="imapUser" name="imapUser" required value={v.imapUser} onChange={(e) => set({ imapUser: e.target.value })} />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="imapPassword">Password / app password</Label>
            <Input id="imapPassword" name="imapPassword" type="password" autoComplete="new-password" placeholder={initial ? "Leave blank to keep the saved one" : ""} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="imapSecure" checked={v.imapSecure} onChange={(e) => set({ imapSecure: e.target.checked })} /> SSL/TLS
        </label>
      </fieldset>

      <fieldset className="grid gap-4 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">Outgoing (SMTP) — for follow-ups, optional</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="smtpHost">Server</Label>
            <Input id="smtpHost" name="smtpHost" value={v.smtpHost} onChange={(e) => set({ smtpHost: e.target.value })} placeholder="smtp.gmail.com" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="smtpPort">Port</Label>
            <Input id="smtpPort" name="smtpPort" type="number" value={v.smtpPort} onChange={(e) => set({ smtpPort: Number(e.target.value) })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="smtpUser">Username</Label>
            <Input id="smtpUser" name="smtpUser" value={v.smtpUser} onChange={(e) => set({ smtpUser: e.target.value })} placeholder="same as IMAP" />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="smtpPassword">Password</Label>
            <Input id="smtpPassword" name="smtpPassword" type="password" autoComplete="new-password" placeholder="blank = same as IMAP" />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="smtpSecure" checked={v.smtpSecure} onChange={(e) => set({ smtpSecure: e.target.checked })} /> SSL/TLS (port 465; untick for STARTTLS on 587)
        </label>
      </fieldset>

      <div className="grid max-w-xs gap-1.5">
        <Label htmlFor="backfillDays">First sync reads the last … days</Label>
        <Input id="backfillDays" name="backfillDays" type="number" min={7} max={365} value={v.backfillDays} onChange={(e) => set({ backfillDays: Number(e.target.value) })} />
      </div>

      <Status state={state} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Testing connection…" : "Test & save"}</Button>
        {initial && (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive"
            disabled={removing}
            onClick={() => {
              if (confirm("Disconnect this mailbox? Emails already imported stay in tjob.")) startRemove(() => deleteMailAccountAction());
            }}
          >
            Disconnect
          </Button>
        )}
      </div>
    </form>
  );
}

export function TokenManager({ tokens }: { tokens: { id: string; name: string; created: string; lastUsed: string; revoked: boolean }[] }) {
  const [token, setToken] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-4">
      {token ? (
        <div className="grid gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
          <div className="text-sm font-medium">Copy this token now — it won&apos;t be shown again.</div>
          <div className="flex gap-2">
            <Input readOnly value={token} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(token);
                toast.success("Token copied");
              }}
            >
              Copy
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await createApiTokenAction("Chrome extension");
                setToken(res.token);
              })
            }
          >
            Create extension token
          </Button>
        </div>
      )}
      {tokens.length > 0 && (
        <ul className="divide-y rounded-lg border text-sm">
          {tokens.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <span className="font-medium">{t.name}</span>
              <span className="text-muted-foreground">created {t.created} · last used {t.lastUsed}</span>
              {t.revoked ? (
                <span className="ml-auto text-xs text-muted-foreground">revoked</span>
              ) : (
                <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={() => start(() => revokeApiTokenAction(t.id))}>
                  Revoke
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CsvImport() {
  const [state, action, pending] = useActionState(importLinkedInCsvAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <Input type="file" name="file" accept=".csv,text/csv" required className="w-72" />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Importing…" : "Import"}
      </Button>
      <div className="w-full">
        <Status state={state} />
      </div>
    </form>
  );
}

export function SavedAnswers({ answers }: { answers: { id: string; question: string; answer: string; source: string; uses: number }[] }) {
  const [q, setQ] = useState("");
  const [a, setA] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-4">
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Question, e.g. Years of experience with Java" />
        <Input value={a} onChange={(e) => setA(e.target.value)} placeholder="Answer, e.g. 4" />
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await addSavedAnswerAction(q, a);
              if (res?.ok) {
                setQ("");
                setA("");
              } else toast.error(res?.message ?? "Couldn't save");
            })
          }
        >
          Add
        </Button>
      </div>
      {answers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No saved answers yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border text-sm">
          {answers.map((x) => (
            <li key={x.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2">
              <span className="min-w-0 flex-1">{x.question}</span>
              <span className="font-medium">{x.answer}</span>
              {x.source === "ai" && <span className="rounded border px-1 text-xs text-muted-foreground">AI</span>}
              <span className="text-xs text-muted-foreground">used {x.uses}×</span>
              <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => start(() => deleteSavedAnswerAction(x.id))}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
