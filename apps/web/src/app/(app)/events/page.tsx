import Link from "next/link";
import { after } from "next/server";
import { CalendarPlus, Info, MapPin, Users } from "lucide-react";
import {
  EVENT_SOURCE_LABELS,
  EVENT_SOURCES,
  EVENT_TOPIC_LABELS,
  EVENT_TOPICS,
  type EventTopic,
} from "@tjob/shared";
import { db, eventSources } from "@/db";
import { dayLabel, googleCalendarUrl, istDay, placeText, timeRange } from "@/lib/events/display";
import { EVENTS_REFRESH_MS, refreshEvents, upcomingEvents } from "@/lib/events/service";
import { timeAgo } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { ExternalButton } from "@/components/external-button";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { EventMarkSelect, RefreshEvents } from "./client";

export const metadata = { title: "Events" };
// "Refresh now" reads three sites, which can take longer than the default limit.
export const maxDuration = 60;

type Show = "upcoming" | "mine" | "hidden";
type UpcomingEvent = Awaited<ReturnType<typeof upcomingEvents>>[number];

function PriceBadge({ isFree, price }: { isFree: boolean | null; price: string }) {
  if (isFree)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-good/15 px-2 py-0.5 font-medium">
        <span className="size-1.5 rounded-full bg-good" aria-hidden />
        Free
      </span>
    );
  if (isFree === false) return <span className="rounded-full bg-muted px-2 py-0.5 font-medium">{price || "Paid"}</span>;
  return <span className="rounded-full border px-2 py-0.5 text-muted-foreground">Price not listed</span>;
}

function EventCard({ e }: { e: UpcomingEvent }) {
  const place = placeText(e);
  return (
    <li className={cn("rounded-xl border bg-card p-4", e.mark === "hidden" && "opacity-70")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground tabular-nums">{timeRange(e.startsAt, e.endsAt)}</p>
          <h3 className="mt-0.5 font-medium">
            <a href={e.url} target="_blank" rel="noreferrer" className="hover:underline">
              {e.title}
            </a>
          </h3>
          {e.organizer && <p className="text-sm text-muted-foreground">by {e.organizer}</p>}
        </div>
        <EventMarkSelect id={e.id} mark={e.mark} title={e.title} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
        <PriceBadge isFree={e.isFree} price={e.price} />
        {e.topics.map((t) => (
          <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
            {EVENT_TOPIC_LABELS[t]}
          </span>
        ))}
      </div>

      <ul className="mt-3 grid gap-1.5 text-sm">
        <li className="flex items-start gap-2">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Venue" />
          {place ? (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground hover:underline"
            >
              {place}
            </a>
          ) : (
            <span className="text-muted-foreground">Bengaluru; the venue is shared after you register</span>
          )}
        </li>
        {e.going ? (
          <li className="flex items-center gap-2">
            <Users className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="text-muted-foreground">{e.going} going</span>
          </li>
        ) : null}
        {e.note && (
          <li className="flex items-center gap-2">
            <Info className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>{e.note}</span>
          </li>
        )}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ExternalButton href={e.url} primary>
          Register on {EVENT_SOURCE_LABELS[e.source]}
        </ExternalButton>
        <Button asChild size="sm" variant="outline">
          <a href={googleCalendarUrl(e)} target="_blank" rel="noreferrer">
            <CalendarPlus className="size-3.5" aria-hidden />
            Add to Google Calendar
          </a>
        </Button>
        {e.alsoOn.map((o) => (
          <a
            key={o.url}
            href={o.url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            Also on {EVENT_SOURCE_LABELS[o.source]}
          </a>
        ))}
      </div>
    </li>
  );
}

export default async function EventsPage(props: PageProps<"/events">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const show: Show = sp.show === "mine" || sp.show === "hidden" ? sp.show : "upcoming";
  const allPrices = sp.price === "all";
  const topic = EVENT_TOPICS.includes(sp.topic as EventTopic) ? (sp.topic as EventTopic) : null;

  const [all, sources] = await Promise.all([upcomingEvents(user.id), db.select().from(eventSources)]);
  // Covers the case where the scheduled sync isn't running: re-read the sites after responding if
  // the list is over 12 hours old (a single cheap query otherwise).
  after(() => refreshEvents({ ifOlderThanMs: EVENTS_REFRESH_MS }).catch((err) => console.error("events refresh", err)));

  const isMine = (e: UpcomingEvent) => e.mark === "interested" || e.mark === "going";
  const hasTopic = (e: UpcomingEvent) => !topic || e.topics.includes(topic);
  const inView = all.filter((e) => (show === "hidden" ? e.mark === "hidden" : show === "mine" ? isMine(e) : e.mark !== "hidden"));
  // The price filter applies to browsing; your own and hidden events show whatever the price.
  const priced = show === "upcoming" && !allPrices ? inView.filter((e) => e.isFree === true) : inView;
  const topicsPresent = EVENT_TOPICS.filter((t) => priced.some((e) => e.topics.includes(t)));
  const rows = priced.filter(hasTopic);

  const days = new Map<string, UpcomingEvent[]>();
  for (const e of rows) {
    const day = istDay(e.startsAt);
    days.set(day, [...(days.get(day) ?? []), e]);
  }

  const qs = (patch: { show?: Show; price?: "all" | null; topic?: EventTopic | null }) => {
    const merged = { show, price: allPrices ? ("all" as const) : null, topic, ...patch };
    const p = new URLSearchParams();
    if (merged.show !== "upcoming") p.set("show", merged.show);
    if (merged.price) p.set("price", merged.price);
    if (merged.topic) p.set("topic", merged.topic);
    const s = p.toString();
    return s ? `/events?${s}` : "/events";
  };
  const pill = (active: boolean) =>
    cn("rounded px-3 py-1 whitespace-nowrap", active ? "bg-accent font-medium" : "text-muted-foreground hover:text-foreground");
  const tab = (active: boolean, href: string, children: React.ReactNode) => (
    <Link key={href} href={href} className={pill(active)} aria-current={active ? "page" : undefined}>
      {children}
    </Link>
  );
  const mineCount = all.filter(isMine).length;
  const hiddenCount = all.filter((e) => e.mark === "hidden").length;
  const notHidden = all.filter((e) => e.mark !== "hidden" && hasTopic(e));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Events"
        description="Upcoming in-person AI and tech events in Bengaluru, from Luma, Meetup and Eventbrite. tjob re-reads the listings twice a day. Free meetups are a good place to meet engineers and hiring managers."
        actions={<RefreshEvents />}
      />

      {all.length === 0 ? (
        <EmptyState title={sources.length ? "No upcoming events found" : "Fetching events"}>
          <p>
            {sources.length
              ? "None of the listings had an upcoming in-person tech event in Bengaluru. Try again later."
              : "tjob is reading Luma, Meetup and Eventbrite for the first time. Reload in a minute, or refresh now."}
          </p>
          <div className="mt-4 flex justify-center">
            <RefreshEvents primary />
          </div>
        </EmptyState>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
            <nav aria-label="Which events" className="flex overflow-x-auto rounded-md border p-0.5">
              {tab(show === "upcoming", qs({ show: "upcoming" }), "Upcoming")}
              {tab(
                show === "mine",
                qs({ show: "mine" }),
                <>
                  My events <span className="tabular-nums">{mineCount}</span>
                </>,
              )}
              {(hiddenCount > 0 || show === "hidden") &&
                tab(
                  show === "hidden",
                  qs({ show: "hidden" }),
                  <>
                    Hidden <span className="tabular-nums">{hiddenCount}</span>
                  </>,
                )}
            </nav>
            {show === "upcoming" && (
              <nav aria-label="Price" className="flex overflow-x-auto rounded-md border p-0.5">
                {tab(
                  !allPrices,
                  qs({ price: null }),
                  <>
                    Free <span className="tabular-nums">{notHidden.filter((e) => e.isFree === true).length}</span>
                  </>,
                )}
                {tab(
                  allPrices,
                  qs({ price: "all" }),
                  <>
                    All prices <span className="tabular-nums">{notHidden.length}</span>
                  </>,
                )}
              </nav>
            )}
            {(topicsPresent.length > 1 || topic) && (
              <nav aria-label="Topic" className="flex max-w-full overflow-x-auto rounded-md border p-0.5">
                {tab(!topic, qs({ topic: null }), "All topics")}
                {topicsPresent.map((t) => tab(topic === t, qs({ topic: t }), EVENT_TOPIC_LABELS[t]))}
              </nav>
            )}
          </div>

          {rows.length === 0 ? (
            <EmptyState title="Nothing here">
              {show === "mine" ? (
                <p>Set an event to Interested or Going and it appears here.</p>
              ) : show === "upcoming" && !allPrices ? (
                <Link href={qs({ price: "all" })} className="underline">
                  Show events of any price
                </Link>
              ) : (
                <Link href="/events" className="underline">
                  Show all upcoming events
                </Link>
              )}
            </EmptyState>
          ) : (
            <div className="grid gap-6">
              {[...days].map(([day, list]) => (
                <section key={day} aria-labelledby={`day-${day}`}>
                  <h2 id={`day-${day}`} className="mb-2 text-sm font-medium text-muted-foreground">
                    {dayLabel(day)}
                  </h2>
                  <ul className="grid gap-3">
                    {list.map((e) => (
                      <EventCard key={e.id} e={e} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      <section aria-label="Where these events come from" className="mt-8 grid gap-2 text-xs text-muted-foreground">
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {EVENT_SOURCES.map((s) => {
            const st = sources.find((x) => x.source === s);
            return (
              <li key={s}>
                <span className="font-medium text-foreground">{EVENT_SOURCE_LABELS[s]}:</span>{" "}
                {!st ? (
                  "not read yet"
                ) : st.lastError ? (
                  <span className="text-destructive">
                    couldn&apos;t read it ({st.lastError}){st.lastOkAt ? `; last worked ${timeAgo(st.lastOkAt)}` : ""}
                  </span>
                ) : (
                  `${st.lastCount} events, checked ${timeAgo(st.lastRunAt)}`
                )}
              </li>
            );
          })}
        </ul>
        <p>
          &quot;Free&quot; means the listing shows no ticket price. Some hosts approve each registration or ask you to
          fill in a form, so register early. Listings come from public pages and aren&apos;t checked by tjob.
        </p>
      </section>
    </div>
  );
}
