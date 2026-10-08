import {
  EMAIL_CATEGORY_LABELS,
  STATUS_LABELS,
  type ApplicationStatus,
  type EmailCategory,
  type JobSource,
} from "@tjob/shared";
import { cn } from "@/lib/utils";

// Status colors are reserved for outcomes and always paired with the text label.
const STATUS_STYLE: Record<ApplicationStatus, string> = {
  saved: "bg-muted text-muted-foreground",
  cv_ready: "bg-muted text-foreground",
  applied: "bg-primary/10 text-foreground",
  viewed: "bg-primary/15 text-foreground",
  assessment: "bg-primary/20 text-foreground",
  interview: "bg-primary/25 text-foreground font-medium",
  offer: "bg-good/15 text-foreground font-medium",
  rejected: "bg-critical/10 text-foreground",
  withdrawn: "bg-muted text-muted-foreground",
  ghosted: "bg-muted text-muted-foreground italic",
};

const STATUS_DOT: Partial<Record<ApplicationStatus, string>> = {
  offer: "bg-good",
  rejected: "bg-critical",
  interview: "bg-primary",
  assessment: "bg-primary",
};

export function StatusBadge({ status, className }: { status: ApplicationStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs whitespace-nowrap",
        STATUS_STYLE[status],
        className,
      )}
    >
      {STATUS_DOT[status] && <span className={cn("size-1.5 rounded-full", STATUS_DOT[status])} aria-hidden />}
      {STATUS_LABELS[status]}
    </span>
  );
}

const SOURCE_LABEL: Record<JobSource, string> = { linkedin: "LinkedIn", naukri: "Naukri", other: "Other" };
const SOURCE_DOT: Record<JobSource, string> = { linkedin: "bg-viz-1", naukri: "bg-viz-2", other: "bg-viz-3" };

export function SourceBadge({ source }: { source: JobSource }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
      <span className={cn("size-2 rounded-full", SOURCE_DOT[source])} aria-hidden />
      {SOURCE_LABEL[source]}
    </span>
  );
}

export function sourceLabel(source: JobSource) {
  return SOURCE_LABEL[source];
}

export function CategoryBadge({ category }: { category: EmailCategory }) {
  const strong = category === "interview" || category === "offer" || category === "assessment";
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-xs whitespace-nowrap",
        strong ? "border-primary/40 bg-primary/10 font-medium" : "text-muted-foreground",
        category === "rejection" && "border-critical/30 bg-critical/5 text-foreground",
        category === "offer" && "border-good/40 bg-good/10",
      )}
    >
      {EMAIL_CATEGORY_LABELS[category]}
    </span>
  );
}
