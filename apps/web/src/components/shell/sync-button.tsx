"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface SyncSummary {
  accounts: { relevant: number; outcomes: Record<string, number>; error?: string; skipped?: string }[];
  batchApplied: number;
  batchSubmitted: number;
  classifiedNow: number;
}

async function callSync(): Promise<SyncSummary> {
  const res = await fetch("/api/sync", { method: "POST" });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Sync failed (${res.status})`);
  return res.json();
}

function describe(s: SyncSummary): string {
  const err = s.accounts.find((a) => a.error)?.error;
  if (err) return `Mailbox error: ${err}`;
  if (s.accounts.some((a) => a.skipped)) return "A sync is already running.";
  const found = s.accounts.reduce((n, a) => n + a.relevant, 0);
  const parts = [`${found} job email${found === 1 ? "" : "s"} checked`];
  if (s.batchSubmitted) parts.push(`${s.batchSubmitted} queued for sorting (results within the hour)`);
  return parts.join(" · ");
}

/**
 * "Sync now" button. Also syncs silently on page load when the last sync is older than
 * `autoIfOlderThanMin` minutes.
 */
export function SyncButton({
  hasMailbox,
  lastSyncedAt,
  autoIfOlderThanMin = 10,
}: {
  hasMailbox: boolean;
  lastSyncedAt: string | null;
  autoIfOlderThanMin?: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const autoRan = useRef(false);

  useEffect(() => {
    if (!hasMailbox || autoRan.current) return;
    const age = lastSyncedAt ? Date.now() - new Date(lastSyncedAt).getTime() : Infinity;
    if (age < autoIfOlderThanMin * 60_000) return;
    autoRan.current = true;
    callSync()
      .then(() => router.refresh())
      .catch(() => {});
  }, [hasMailbox, lastSyncedAt, autoIfOlderThanMin, router]);

  if (!hasMailbox) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const s = await callSync();
          toast.success("Mail synced", { description: describe(s) });
          router.refresh();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Sync failed");
        } finally {
          setBusy(false);
        }
      }}
    >
      <RefreshCw className={busy ? "size-4 animate-spin" : "size-4"} aria-hidden />
      {busy ? "Syncing…" : "Sync now"}
    </Button>
  );
}
