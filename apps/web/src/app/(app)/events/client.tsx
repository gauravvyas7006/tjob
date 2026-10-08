"use client";
import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { EVENT_MARK_LABELS, EVENT_MARKS, type EventMark } from "@tjob/shared";
import { Button } from "@/components/ui/button";
import { refreshEventsAction, setEventMarkAction } from "./actions";

export function RefreshEvents({ primary = false }: { primary?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant={primary ? "default" : "outline"}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await refreshEventsAction();
          if (res.ok) toast.success(res.message);
          else toast.error(res.message);
        })
      }
    >
      <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} aria-hidden />
      {pending ? "Checking sites…" : "Refresh now"}
    </Button>
  );
}

export function EventMarkSelect({ id, mark, title }: { id: string; mark: EventMark | null; title: string }) {
  const [pending, start] = useTransition();
  return (
    <select
      aria-label={`Your plan for ${title}`}
      disabled={pending}
      defaultValue={mark ?? ""}
      className="h-8 rounded-md border bg-background px-2 text-sm"
      onChange={(e) => {
        const next = (e.target.value || null) as EventMark | null;
        start(async () => {
          await setEventMarkAction(id, next);
          toast.success(next === "hidden" ? `Hidden: ${title}` : next ? `${EVENT_MARK_LABELS[next]}: ${title}` : "Cleared");
        });
      }}
    >
      <option value="">Not decided</option>
      {EVENT_MARKS.map((m) => (
        <option key={m} value={m}>
          {EVENT_MARK_LABELS[m]}
        </option>
      ))}
    </select>
  );
}
