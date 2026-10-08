import type { EventSource } from "@tjob/shared";

/** One listing as read from a source, before tjob decides whether to keep it. */
export interface ScrapedEvent {
  source: EventSource;
  externalId: string;
  title: string;
  url: string;
  startsAt: Date;
  endsAt: Date | null;
  venue: string;
  address: string;
  organizer: string;
  isFree: boolean | null;
  price: string;
  going: number | null;
  note: string;
  inPerson: boolean;
  /** City text used for the Bengaluru check. */
  city: string;
  /** Tags or description, used only to pick topics. */
  details: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- these read third-party JSON whose shape isn't ours */

/** Next.js pages embed their data as JSON in `<script id="__NEXT_DATA__">`. */
export function nextData(html: string): any {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json"[^>]*>([\s\S]*?)<\/script>/);
  return m ? JSON.parse(m[1]) : null;
}

/** The JSON object assigned right after `marker`, e.g. `window.__SERVER_DATA__ = {...};`. */
export function jsonAfter(html: string, marker: string): any {
  const at = html.indexOf(marker);
  const start = at < 0 ? -1 : html.indexOf("{", at);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return JSON.parse(html.slice(start, i + 1));
  }
  return null;
}

export function formatPrice(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount} ${currency.toUpperCase()}`;
  }
}

/** A wall-clock date and time in a time zone (India when the zone is unknown). */
export function zonedDate(date: string, time: string, timeZone: string): Date {
  const wall = new Date(`${date}T${time.slice(0, 5)}:00Z`);
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(wall);
    const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const offset = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute")) - wall.getTime();
    return new Date(wall.getTime() - offset);
  } catch {
    return new Date(`${date}T${time.slice(0, 5)}:00+05:30`);
  }
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Luma's discovery feed for a city (`api.lu.ma/discover/get-paginated-events`). */
export function parseLuma(data: any): ScrapedEvent[] {
  if (!Array.isArray(data?.entries)) throw new Error("Luma's response has changed shape");
  return data.entries.flatMap((x: any): ScrapedEvent[] => {
    const e = x?.event;
    if (!e?.api_id || !text(e.name) || !e.start_at || !e.url) return [];
    const geo = e.geo_address_info ?? {};
    const ticket = x.ticket_info ?? {};
    const calendar = text(x.calendar?.name);
    const hosts: string[] = (x.hosts ?? []).map((h: any) => text(h?.name)).filter(Boolean);
    const organizer = calendar && calendar !== "Personal" ? calendar : hosts.slice(0, 2).join(", ");
    const price = ticket.price;
    const notes = [
      ticket.is_sold_out && "Sold out",
      x.waitlist_active && "Waitlist",
      ticket.require_approval && "Host approval needed",
    ].filter(Boolean);
    return [
      {
        source: "luma",
        externalId: e.api_id,
        title: text(e.name),
        url: `https://luma.com/${e.url}`,
        startsAt: new Date(e.start_at),
        endsAt: e.end_at ? new Date(e.end_at) : null,
        venue: text(geo.address),
        address: text(geo.full_address) || text(geo.short_address),
        organizer,
        isFree: typeof ticket.is_free === "boolean" ? ticket.is_free : null,
        price:
          ticket.is_free === false && typeof price?.cents === "number"
            ? formatPrice(price.cents / 100, text(price.currency) || "inr")
            : "",
        going: count(x.guest_count),
        note: notes.join(" · "),
        inPerson: e.location_type === "offline",
        city: [geo.city, geo.city_state, geo.full_address].map(text).join(" "),
        details: [calendar, ...hosts].join(" "),
      },
    ];
  });
}

/** A meetup.com/find search page; its events sit in the embedded Apollo cache. */
export function parseMeetup(html: string): ScrapedEvent[] {
  const state = nextData(html)?.props?.pageProps?.__APOLLO_STATE__;
  if (!state || typeof state !== "object") throw new Error("Meetup's page layout has changed");
  return Object.values(state).flatMap((e: any): ScrapedEvent[] => {
    if (e?.__typename !== "Event" || !e.id || !text(e.title) || !e.dateTime || !e.eventUrl) return [];
    const group = e.group?.__ref ? state[e.group.__ref] : null;
    const venue = e.venue ?? {};
    const fee = e.feeSettings;
    return [
      {
        source: "meetup",
        externalId: String(e.id),
        title: text(e.title),
        url: e.eventUrl,
        startsAt: new Date(e.dateTime),
        endsAt: null,
        venue: text(venue.name),
        address: [venue.address, venue.city].map(text).filter(Boolean).join(", "),
        organizer: text(group?.name),
        // Meetup only sets fee settings when it collects a ticket price.
        isFree: fee == null,
        price: fee && typeof fee.amount === "number" ? formatPrice(fee.amount, text(fee.currency) || "inr") : "",
        going: count(e.rsvps?.totalCount),
        note: e.rsvpState === "CLOSED" ? "RSVPs closed" : e.rsvpState === "WAITLIST" ? "Waitlist" : "",
        inPerson: e.eventType !== "ONLINE",
        city: text(venue.city),
        details: text(e.description).slice(0, 1500),
      },
    ];
  });
}

/**
 * An Eventbrite browse page (`/d/india--bangalore/...`). Prices aren't in the listing, so the
 * caller says whether the page was already filtered to free events.
 */
export function parseEventbrite(html: string, opts: { free: boolean }): ScrapedEvent[] {
  const data = jsonAfter(html, "window.__SERVER_DATA__");
  // Filtered pages keep results in `search_data`, category pages in `event_data.active_search`.
  const results = (data?.search_data ?? data?.event_data?.active_search)?.events?.results;
  if (!Array.isArray(results)) throw new Error("Eventbrite's page layout has changed");
  return results.flatMap((e: any): ScrapedEvent[] => {
    const id = text(e?.id) || text(e?.eid);
    if (!id || !text(e.name) || !e.url || !e.start_date || e.is_cancelled) return [];
    const venue = e.primary_venue ?? {};
    const tz = text(e.timezone) || "Asia/Kolkata";
    const tags: string[] = (e.tags ?? []).map((t: any) => text(t?.display_name)).filter(Boolean);
    return [
      {
        source: "eventbrite",
        externalId: id,
        title: text(e.name),
        url: e.url,
        startsAt: zonedDate(e.start_date, text(e.start_time) || "00:00", tz),
        endsAt: e.end_date ? zonedDate(e.end_date, text(e.end_time) || "23:59", tz) : null,
        venue: text(venue.name),
        address: text(venue.address?.localized_address_display),
        organizer: text(e.primary_organizer?.name),
        isFree: opts.free ? true : null,
        price: "",
        going: null,
        note: "",
        inPerson: !e.is_online_event,
        city: text(venue.address?.city),
        details: [...tags, text(e.summary)].join(" "),
      },
    ];
  });
}
