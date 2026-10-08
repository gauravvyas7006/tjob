"use client";
import { useState, useTransition } from "react";
import { EMAIL_CATEGORIES, EMAIL_CATEGORY_LABELS, type EmailCategory } from "@tjob/shared";
import { Button } from "@/components/ui/button";
import { deleteEmailAction, linkEmailAction, markReviewedAction, recategorizeEmailAction } from "./actions";

const SELECT = "h-8 rounded-md border bg-background px-2 text-xs";

export function EmailActions({
  emailId,
  category,
  linked,
  inReview,
  apps,
}: {
  emailId: string;
  category: EmailCategory;
  linked: boolean;
  inReview: boolean;
  apps: { id: string; label: string }[];
}) {
  const [pending, start] = useTransition();
  const [remember, setRemember] = useState(false);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2">
      <select
        aria-label="Category"
        className={SELECT}
        defaultValue={category}
        disabled={pending}
        onChange={(e) => start(() => recategorizeEmailAction(emailId, e.target.value as EmailCategory, remember))}
      >
        {EMAIL_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c === "other" ? "Not job-related" : EMAIL_CATEGORY_LABELS[c]}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        always for this sender
      </label>
      {!linked && apps.length > 0 && (
        <select
          aria-label="Link to application"
          className={`${SELECT} max-w-64`}
          defaultValue=""
          disabled={pending}
          onChange={(e) => e.target.value && start(() => linkEmailAction(emailId, e.target.value))}
        >
          <option value="">Link to application…</option>
          {apps.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      )}
      <div className="ml-auto flex gap-1">
        {inReview && (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(() => markReviewedAction(emailId))}>
            Looks right
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground"
          disabled={pending}
          onClick={() => start(() => deleteEmailAction(emailId))}
        >
          Remove
        </Button>
      </div>
    </div>
  );
}
