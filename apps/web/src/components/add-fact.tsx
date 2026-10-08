"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { appendExtraFactAction } from "@/app/(app)/cv/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** "I have this": saves a true detail for a gap to Extra facts, so the next tailoring can use it. */
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
        aria-label={`What you did with ${requirement}`}
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
