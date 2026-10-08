import { EVENT_SOURCES, type EventMark, type EventSource } from "@tjob/shared";

const IST = "Asia/Kolkata";

/** YYYY-MM-DD in India. */
export function istDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** "Today", "Tomorrow" or "Sat, 10 Oct". */
export function dayLabel(day: string, now = new Date()): string {
  const today = istDay(now);
  if (day === today) return "Today";
  if (day === istDay(new Date(now.getTime() + 86_400_000))) return "Tomorrow";
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00Z`),
  );
}

function time(d: Date): string {
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: IST }).format(d);
}

/** "10:00 am – 1:00 pm", or with the end date when the event runs over several days. */
export function timeRange(startsAt: Date, endsAt: Date | null): string {
  if (!endsAt) return time(startsAt);
  if (istDay(endsAt) !== istDay(startsAt)) {
    const end = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: IST }).format(endsAt);
    return `${time(startsAt)} – ${end}`;
  }
  return `${time(startsAt)} – ${time(endsAt)}`;
}

interface Listing {
  id: string;
  source: EventSource;
  url: string;
  title: string;
  startsAt: Date;
  isFree: boolean | null;
  mark: EventMark | null;
}

/** The same event on several sites: same day in India and the same title, ignoring punctuation. */
function duplicateKey(e: Listing): string {
  const title = e.title
    .toLowerCase()
    .replace(/×/g, "x")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 40);
  return `${istDay(e.startsAt)}|${title}`;
}

/**
 * Collapses listings of one event into a single row, keeping the copy the user has marked, else the
 * one from the earliest source in EVENT_SOURCES. The other copies become `alsoOn` links.
 */
export function mergeDuplicates<T extends Listing>(rows: T[]): (T & { alsoOn: { source: EventSource; url: string }[] })[] {
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const key = duplicateKey(r);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const rank = (r: T) => (r.mark ? 0 : 1) * 10 + EVENT_SOURCES.indexOf(r.source);
  return [...groups.values()]
    .map((copies) => {
      const [main, ...others] = [...copies].sort((a, b) => rank(a) - rank(b));
      return {
        ...main,
        isFree: main.isFree ?? others.find((o) => o.isFree !== null)?.isFree ?? null,
        alsoOn: others.map((o) => ({ source: o.source, url: o.url })),
      };
    })
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/** Venue and address in one line (Luma's full address already starts with the venue name). */
export function placeText(e: { venue: string; address: string }): string {
  if (!e.venue || e.address.startsWith(e.venue)) return e.address;
  return [e.venue, e.address].filter(Boolean).join(", ");
}

/** Google Calendar "add event" link. Events without an end time get two hours. */
export function googleCalendarUrl(e: { title: string; url: string; startsAt: Date; endsAt: Date | null; venue: string; address: string }): string {
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const end = e.endsAt ?? new Date(e.startsAt.getTime() + 2 * 3_600_000);
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${stamp(e.startsAt)}/${stamp(end)}`,
    details: `Register: ${e.url}`,
    location: placeText(e),
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}
