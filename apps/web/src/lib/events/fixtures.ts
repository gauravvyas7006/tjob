/** Trimmed copies of what Luma, Meetup and Eventbrite return, for tests. */
import { istDay } from "./display";

export const inDays = (n: number, hourUtc = 4) => {
  const d = new Date(Date.now() + n * 86_400_000);
  d.setUTCHours(hourUtc, 30, 0, 0);
  return d;
};

export function lumaResponse(
  events: { id: string; name: string; start: Date; free?: boolean; online?: boolean; city?: string; calendar?: string }[],
) {
  return {
    entries: events.map((e) => ({
      api_id: e.id,
      event: {
        api_id: e.id,
        name: e.name,
        start_at: e.start.toISOString(),
        end_at: new Date(e.start.getTime() + 3 * 3_600_000).toISOString(),
        url: `slug-${e.id}`,
        location_type: e.online ? "online" : "offline",
        geo_address_info: {
          city: e.city ?? "Bengaluru",
          address: "Hub Hall",
          full_address: `Hub Hall, 80 Feet Rd, Koramangala, ${e.city ?? "Bengaluru"}, Karnataka 560034, India`,
        },
      },
      calendar: { name: e.calendar ?? "Personal" },
      hosts: [{ name: "Asha Rao" }],
      guest_count: 120,
      ticket_info: e.free === false ? { is_free: false, price: { cents: 49_900, currency: "inr" } } : { is_free: true, require_approval: true },
    })),
    has_more: false,
    next_cursor: null,
  };
}

export function meetupPage(
  events: { id: string; title: string; start: Date; fee?: { amount: number; currency: string }; online?: boolean; description?: string }[],
) {
  const state: Record<string, unknown> = {
    ROOT_QUERY: { __typename: "Query" },
    "Group:1": { __typename: "Group", id: "1", name: "ReactJS Bangalore" },
  };
  for (const e of events) {
    state[`Event:${e.id}`] = {
      __typename: "Event",
      id: e.id,
      title: e.title,
      dateTime: e.start.toISOString().replace("Z", "+00:00"),
      description: e.description ?? "",
      eventType: e.online ? "ONLINE" : "PHYSICAL",
      eventUrl: `https://www.meetup.com/reactjs-bangalore/events/${e.id}/`,
      rsvpState: "JOIN_OPEN",
      feeSettings: e.fee ?? null,
      group: { __ref: "Group:1" },
      rsvps: { totalCount: 85 },
      venue: { name: "Thoughtworks", address: "Diamond District, Domlur", city: "Bengaluru" },
    };
  }
  const data = { props: { pageProps: { __APOLLO_STATE__: state } } };
  return `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></body></html>`;
}

export function eventbritePage(
  events: { id: string; name: string; start: Date; tz?: string }[],
  layout: "search_data" | "event_data" = "search_data",
) {
  const results = events.map((e) => ({
    id: e.id,
    name: e.name,
    url: `https://www.eventbrite.com/e/${e.id}`,
    start_date: istDay(e.start),
    start_time: "10:00",
    end_date: istDay(e.start),
    end_time: "17:00",
    timezone: e.tz ?? "Asia/Kolkata",
    is_online_event: false,
    summary: "Talks on {braces} and \"quotes\"",
    tags: [{ display_name: "Science & Technology" }],
    primary_venue: { name: "Hilton", address: { city: "Bengaluru", localized_address_display: "Intermediate Ring Road, Bengaluru" } },
  }));
  const events_ = { pagination: {}, results };
  const data = layout === "search_data" ? { search_data: { events: events_ } } : { event_data: { active_search: { events: events_ } } };
  return `<html><script>window.__SERVER_DATA__ = ${JSON.stringify(data)};</script><script>var x = {"a": 1};</script></html>`;
}
