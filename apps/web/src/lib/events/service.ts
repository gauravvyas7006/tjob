import "server-only";
import { and, asc, eq, getTableColumns, gte, lt, max, sql } from "drizzle-orm";
import { EVENT_SOURCES, type EventMark, type EventSource } from "@tjob/shared";
import { db, eventMarks, eventSources, events } from "@/db";
import { selectEvents, type EventRow } from "./classify";
import { mergeDuplicates } from "./display";
import { parseEventbrite, parseLuma, parseMeetup, type ScrapedEvent } from "./parse";

/** Listings are re-read when the last read is older than this (cron runs and page visits both check). */
export const EVENTS_REFRESH_MS = 12 * 3_600_000;

const USER_AGENT = "tjob/1.0 (personal job-search dashboard; reads public event listings twice a day)";
/** Luma's id for Bengaluru, from luma.com/bengaluru. */
const LUMA_BENGALURU = "discplace-G0tGUVYwl7T17Sb";
/** Meetup's Technology category, plus searches for the topics tjob cares about. */
const MEETUP_SEARCHES = [
  "categoryId=546",
  "keywords=artificial+intelligence",
  "keywords=java",
  "keywords=javascript",
  "keywords=cloud",
  "keywords=data",
];
const EVENTBRITE = "https://www.eventbrite.com/d/india--bangalore";

async function get(url: string): Promise<Response> {
  const res = await fetch(url, {
    headers: { "user-agent": USER_AGENT, "accept-language": "en-IN,en;q=0.9" },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`${new URL(url).hostname} answered HTTP ${res.status}`);
  return res;
}

/** Runs every request; fails only if all of them do, so one bad search doesn't hide the rest. */
async function all(requests: Promise<ScrapedEvent[]>[]): Promise<ScrapedEvent[]> {
  const results = await Promise.allSettled(requests);
  const ok = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  if (!ok.length) throw (results[0] as PromiseRejectedResult).reason;
  return ok.flat();
}

const FETCHERS: Record<EventSource, () => Promise<ScrapedEvent[]>> = {
  luma: async () => {
    const out: ScrapedEvent[] = [];
    let cursor = "";
    for (let page = 0; page < 4; page++) {
      const url = new URL("https://api.lu.ma/discover/get-paginated-events");
      url.searchParams.set("discover_place_api_id", LUMA_BENGALURU);
      url.searchParams.set("pagination_limit", "50");
      if (cursor) url.searchParams.set("pagination_cursor", cursor);
      const data = await (await get(url.toString())).json();
      out.push(...parseLuma(data));
      if (!data.has_more || !data.next_cursor) break;
      cursor = data.next_cursor;
    }
    return out;
  },
  meetup: () =>
    all(
      MEETUP_SEARCHES.map(async (q) =>
        parseMeetup(await (await get(`https://www.meetup.com/find/?${q}&location=in--Bangalore&source=EVENTS`)).text()),
      ),
    ),
  eventbrite: () =>
    all([
      // The free page first, so its "free" copy wins in selectEvents.
      get(`${EVENTBRITE}/free--science-and-tech--events/`).then(async (r) => parseEventbrite(await r.text(), { free: true })),
      get(`${EVENTBRITE}/science-and-tech--events/`).then(async (r) => parseEventbrite(await r.text(), { free: false })),
    ]),
};

const excluded = (column: string) => sql.raw(`excluded.${column}`);

async function saveEvents(rows: EventRow[], now: Date) {
  if (!rows.length) return;
  await db
    .insert(events)
    .values(rows.map((r) => ({ ...r, firstSeenAt: now, lastSeenAt: now })))
    .onConflictDoUpdate({
      target: [events.source, events.externalId],
      set: {
        title: excluded("title"),
        url: excluded("url"),
        startsAt: excluded("starts_at"),
        endsAt: excluded("ends_at"),
        venue: excluded("venue"),
        address: excluded("address"),
        organizer: excluded("organizer"),
        // Eventbrite only says "free" on its free-events page; don't forget it when that page drops the event.
        isFree: sql`coalesce(excluded.is_free, ${events.isFree})`,
        price: excluded("price"),
        topics: excluded("topics"),
        going: excluded("going"),
        note: excluded("note"),
        lastSeenAt: now,
      },
    });
}

async function recordSource(source: EventSource, now: Date, outcome: { count: number } | { error: string }) {
  const ok = "count" in outcome;
  const values = ok
    ? { lastRunAt: now, lastOkAt: now, lastCount: outcome.count, lastError: "" }
    : { lastRunAt: now, lastError: outcome.error.slice(0, 500) };
  await db
    .insert(eventSources)
    .values({ source, ...values })
    .onConflictDoUpdate({ target: eventSources.source, set: values });
}

export interface EventsRefresh {
  /** True when the listings were read recently enough that nothing was fetched. */
  skipped: boolean;
  sources: { source: EventSource; count: number; error?: string }[];
}

export async function lastEventsRefresh(): Promise<Date | null> {
  const [row] = await db.select({ at: max(eventSources.lastRunAt) }).from(eventSources);
  return row?.at ?? null;
}

/**
 * Reads each listing, keeps in-person Bengaluru tech events, and upserts them. Each source fails
 * on its own (its error is shown on the Events page). Events that ended over two days ago are removed.
 */
export async function refreshEvents(opts: { ifOlderThanMs?: number } = {}): Promise<EventsRefresh> {
  if (opts.ifOlderThanMs) {
    const last = await lastEventsRefresh();
    if (last && Date.now() - last.getTime() < opts.ifOlderThanMs) return { skipped: true, sources: [] };
  }
  const now = new Date();
  const sources = await Promise.all(
    EVENT_SOURCES.map(async (source) => {
      try {
        const rows = selectEvents(await FETCHERS[source](), now);
        await saveEvents(rows, now);
        await recordSource(source, now, { count: rows.length });
        return { source, count: rows.length };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        await recordSource(source, now, { error });
        return { source, count: 0, error };
      }
    }),
  );
  await db
    .delete(events)
    .where(lt(sql`coalesce(${events.endsAt}, ${events.startsAt})`, new Date(now.getTime() - 2 * 86_400_000)));
  return { skipped: false, sources };
}

/** Events that haven't finished (or started within the last three hours, when there's no end time). */
export async function upcomingEvents(userId: string, now = new Date()) {
  const rows = await db
    .select({ ...getTableColumns(events), mark: eventMarks.mark })
    .from(events)
    .leftJoin(eventMarks, and(eq(eventMarks.eventId, events.id), eq(eventMarks.userId, userId)))
    .where(gte(sql`coalesce(${events.endsAt}, ${events.startsAt} + interval '3 hours')`, now))
    .orderBy(asc(events.startsAt));
  return mergeDuplicates(rows);
}

export async function setEventMark(userId: string, eventId: string, mark: EventMark | null): Promise<void> {
  if (!mark) {
    await db.delete(eventMarks).where(and(eq(eventMarks.userId, userId), eq(eventMarks.eventId, eventId)));
    return;
  }
  await db
    .insert(eventMarks)
    .values({ userId, eventId, mark })
    .onConflictDoUpdate({ target: [eventMarks.userId, eventMarks.eventId], set: { mark, updatedAt: new Date() } });
}
