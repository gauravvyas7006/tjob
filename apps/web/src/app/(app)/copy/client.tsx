"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy } from "lucide-react";
import { copyText } from "@/components/copy-button";
import { cn } from "@/lib/utils";

/** One form field: click anywhere on it to copy the value. */
export function CopyRow({
  label,
  value,
  missing = "Not on your CV",
  multiline = false,
  wide = false,
}: {
  label: string;
  value: string;
  /** Shown instead of the value when it's empty. */
  missing?: string;
  multiline?: boolean;
  wide?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const span = wide && "sm:col-span-2";

  if (!value.trim()) {
    return (
      <div className={cn("rounded-md px-3 py-2", span)}>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-sm text-muted-foreground italic">{missing}</div>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={async () => {
        if (!(await copyText(value))) return;
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className={cn(
        "group flex w-full items-start gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        span,
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <span className={cn("block text-sm break-words", multiline && "whitespace-pre-line")}>{value}</span>
      </span>
      <span className="mt-0.5 flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
        {copied ? (
          <>
            <Check className="size-4 text-good" aria-hidden />
            <span role="status">Copied</span>
          </>
        ) : (
          <>
            <Copy className="size-4 opacity-50 group-hover:opacity-100" aria-hidden />
            <span className="sr-only">Copy</span>
          </>
        )}
      </span>
    </button>
  );
}

/** Choose between the master CV and a tailored version (summary, skills and bullets differ). */
export function SourcePicker({ value, versions }: { value: string; versions: { id: string; title: string }[] }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Copy from</span>
      <select
        value={value}
        onChange={(e) => router.push(e.target.value ? `/copy?v=${e.target.value}` : "/copy")}
        className="h-9 max-w-64 rounded-md border bg-background px-2 text-sm"
      >
        <option value="">Master CV</option>
        {versions.map((v) => (
          <option key={v.id} value={v.id}>
            {v.title}
          </option>
        ))}
      </select>
    </label>
  );
}
