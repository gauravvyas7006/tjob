import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { Mail, MapPin, Phone, ShieldAlert } from "lucide-react";
import {
  AGENCY_KIND_LABELS,
  AGENCY_KINDS,
  AGENCY_STATUS_LABELS,
  AGENCY_STATUSES,
  type AgencyKind,
  type AgencyStatus,
} from "@tjob/shared";
import { agencies, db } from "@/db";
import { missingSuggestionCount } from "@/lib/agencies/service";
import { SUGGESTED_AGENCIES, SUGGESTIONS_CHECKED_ON } from "@/lib/agencies/suggested";
import { requireUser } from "@/lib/session";
import { formatDate } from "@/lib/format";
import { CopyCode } from "@/components/copy-button";
import { ExternalButton } from "@/components/external-button";
import { EmptyState, PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { AddSuggested, AgencyDialog, AgencyNotes, AgencyStatusSelect, DeleteAgency } from "./client";

export const metadata = { title: "Agencies" };

export default async function AgenciesPage(props: PageProps<"/agencies">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const status = AGENCY_STATUSES.includes(sp.status as AgencyStatus) ? (sp.status as AgencyStatus) : null;
  const kind = AGENCY_KINDS.includes(sp.kind as AgencyKind) ? (sp.kind as AgencyKind) : null;

  const all = await db.select().from(agencies).where(eq(agencies.userId, user.id)).orderBy(asc(agencies.name));
  const missing = missingSuggestionCount(all.map((a) => a.name));
  const kindsPresent = AGENCY_KINDS.filter((k) => all.some((a) => a.kind === k));
  // Status order puts "Not useful" last; the sort is stable, so names stay alphabetical within a status.
  const rows = all
    .filter((a) => (!status || a.status === status) && (!kind || a.kind === kind))
    .sort((a, b) => AGENCY_STATUSES.indexOf(a.status) - AGENCY_STATUSES.indexOf(b.status));

  const qs = (patch: { status?: AgencyStatus | null; kind?: AgencyKind | null }) => {
    const p = new URLSearchParams();
    const merged = { status, kind, ...patch };
    if (merged.status) p.set("status", merged.status);
    if (merged.kind) p.set("kind", merged.kind);
    const s = p.toString();
    return s ? `/agencies?${s}` : "/agencies";
  };
  const pill = (active: boolean) =>
    cn("rounded px-3 py-1 whitespace-nowrap", active ? "bg-accent font-medium" : "text-muted-foreground hover:text-foreground");

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Agencies"
        description={
          <>
            Recruitment agencies and hiring platforms in Bengaluru for Java and Node.js roles. Most will ask for your CV,
            notice period and current and expected CTC: copy them from{" "}
            <Link href="/copy" className="underline">
              Quick copy
            </Link>
            .
          </>
        }
        actions={
          <>
            {all.length > 0 && missing > 0 && <AddSuggested count={missing} />}
            <AgencyDialog />
          </>
        }
      />

      <div role="note" className="mb-6 flex gap-3 rounded-xl border bg-card p-4 text-sm">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <p>
          <strong>Never pay to get a job.</strong> Genuine agencies are paid by the employer. A registration, training
          or &quot;guaranteed placement&quot; fee, or an offer without an interview, is a sign of a scam.
        </p>
      </div>

      {all.length === 0 ? (
        <EmptyState title="No agencies yet">
          <p>
            tjob has {SUGGESTED_AGENCIES.length} Bengaluru agencies and platforms ready to add, or add your own.
          </p>
          <div className="mt-4 flex justify-center">
            <AddSuggested count={SUGGESTED_AGENCIES.length} primary />
          </div>
        </EmptyState>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
            <nav aria-label="Filter by status" className="flex overflow-x-auto rounded-md border p-0.5">
              <Link href={qs({ status: null })} className={pill(!status)} aria-current={!status ? "page" : undefined}>
                All <span className="tabular-nums">{all.length}</span>
              </Link>
              {AGENCY_STATUSES.map((s) => (
                <Link key={s} href={qs({ status: s })} className={pill(status === s)} aria-current={status === s ? "page" : undefined}>
                  {AGENCY_STATUS_LABELS[s]}{" "}
                  <span className="tabular-nums">{all.filter((a) => a.status === s).length}</span>
                </Link>
              ))}
            </nav>
            {kindsPresent.length > 1 && (
              <nav aria-label="Filter by type" className="flex overflow-x-auto rounded-md border p-0.5">
                <Link href={qs({ kind: null })} className={pill(!kind)} aria-current={!kind ? "page" : undefined}>
                  All types
                </Link>
                {kindsPresent.map((k) => (
                  <Link key={k} href={qs({ kind: k })} className={pill(kind === k)} aria-current={kind === k ? "page" : undefined}>
                    {AGENCY_KIND_LABELS[k]}
                  </Link>
                ))}
              </nav>
            )}
          </div>

          {rows.length === 0 ? (
            <EmptyState title="Nothing here">
              <Link href="/agencies" className="underline">
                Show all agencies
              </Link>
            </EmptyState>
          ) : (
            <ul className="grid gap-4 lg:grid-cols-2">
              {rows.map((a) => (
                <li key={a.id} className={cn("flex flex-col rounded-xl border bg-card p-4", a.status === "not_useful" && "opacity-70")}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-medium">{a.name}</h2>
                      <p className="text-xs text-muted-foreground">
                        {AGENCY_KIND_LABELS[a.kind]}
                        {a.area ? ` · ${a.area}` : ""}
                      </p>
                    </div>
                    <AgencyStatusSelect id={a.id} status={a.status} name={a.name} />
                  </div>

                  {a.focus && <p className="mt-3 text-sm">{a.focus}</p>}
                  {a.howToApproach && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">How to approach: </span>
                      {a.howToApproach}
                    </p>
                  )}

                  {(a.applyUrl || a.website || a.linkedinUrl) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {a.applyUrl && (
                        <ExternalButton href={a.applyUrl} primary>
                          Send CV / register
                        </ExternalButton>
                      )}
                      {a.website && <ExternalButton href={a.website}>Website</ExternalButton>}
                      {a.linkedinUrl && <ExternalButton href={a.linkedinUrl}>LinkedIn</ExternalButton>}
                    </div>
                  )}

                  {(a.email || a.phone || a.address) && (
                    <ul className="mt-3 grid gap-1.5 text-sm">
                      {a.email && (
                        <li className="flex items-center gap-2">
                          <Mail className="size-4 shrink-0 text-muted-foreground" aria-label="Email" />
                          <CopyCode value={a.email} />
                        </li>
                      )}
                      {a.phone && (
                        <li className="flex items-center gap-2">
                          <Phone className="size-4 shrink-0 text-muted-foreground" aria-label="Phone" />
                          <a href={`tel:${a.phone.replace(/[^\d+]/g, "")}`} className="hover:underline">
                            {a.phone}
                          </a>
                        </li>
                      )}
                      {a.address && (
                        <li className="flex items-start gap-2">
                          <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Address" />
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${a.name}, ${a.address}`)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-muted-foreground hover:text-foreground hover:underline"
                          >
                            {a.address}
                          </a>
                        </li>
                      )}
                    </ul>
                  )}

                  <div className="mt-auto pt-3">
                    <div className="grid gap-2 border-t pt-3 text-sm">
                      <AgencyNotes id={a.id} notes={a.notes} />
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {a.contactedAt ? `Contacted ${formatDate(a.contactedAt)}` : ""}
                        </span>
                        <span className="ml-auto flex gap-1">
                          <AgencyDialog
                            id={a.id}
                            initial={{
                              name: a.name,
                              kind: a.kind,
                              area: a.area,
                              focus: a.focus,
                              website: a.website,
                              applyUrl: a.applyUrl,
                              email: a.email,
                              phone: a.phone,
                              linkedinUrl: a.linkedinUrl,
                              howToApproach: a.howToApproach,
                            }}
                          />
                          <DeleteAgency id={a.id} name={a.name} />
                        </span>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {SUGGESTED_AGENCIES.length > 0 && (
        <p className="mt-6 text-xs text-muted-foreground">
          Suggested agencies were checked against each firm&apos;s own website on {SUGGESTIONS_CHECKED_ON}. Contact details
          change, so confirm on their site before you rely on them.
        </p>
      )}
    </div>
  );
}
