const IST = "Asia/Kolkata";

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: IST }).format(
    new Date(d),
  );
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: IST,
  }).format(new Date(d));
}

export function timeAgo(d: Date | string | null | undefined): string {
  if (!d) return "never";
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days} d ago`;
  return formatDate(d);
}

export function weekLabel(isoDate: string): string {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(isoDate));
}

export function percent(x: number): string {
  return `${Math.round(x * 100)}%`;
}

export function usd(x: number): string {
  return x < 0.01 && x > 0 ? `$${x.toFixed(4)}` : `$${x.toFixed(2)}`;
}

export function compact(n: number): string {
  return new Intl.NumberFormat("en-IN", { notation: n >= 10_000 ? "compact" : "standard" }).format(n);
}
