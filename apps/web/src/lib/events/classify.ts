import { EVENT_TOPICS, type EventTopic } from "@tjob/shared";
import type { ScrapedEvent } from "./parse";

/**
 * Keywords per topic. `strong` words are specific enough to trust anywhere, including a long
 * description; `weak` ones ("code", "data", "agents") only count in the title or organizer.
 */
const TOPICS: Record<EventTopic, { strong: RegExp; weak: RegExp }> = {
  ai: {
    strong:
      /\b(ai|genai|gen ai|llms?|gpt[\w-]*|agentic|machine learning|mlops|deep learning|neural networks?|nlp|computer vision|data science|mcp|model context protocol|rag|pytorch|tensorflow|hugging ?face|openai|anthropic|claude|gemini|copilot|langchain|langgraph|vibe[ -]?cod\w*)\b/i,
    weak: /\b(ml|agents?|prompt\w*|intelligen\w*)\b/i,
  },
  java: {
    strong: /\b(java|jvm|spring boot|kotlin|scala|jakarta ee|quarkus|micronaut)\b/i,
    weak: /\bspring\b/i,
  },
  javascript: {
    strong:
      /\b(javascript|typescript|node\.?js|nodejs|deno|react(\.?js)?|next\.?js|angular|vue(\.?js)?|svelte|frontend|front-end)\b/i,
    weak: /\b(js|node|web dev\w*)\b/i,
  },
  cloud: {
    strong:
      /\b(aws|azure|gcp|google cloud|devops|kubernetes|k8s|docker|sre|serverless|terraform|platform engineering|observability|cncf|cloud native)\b/i,
    weak: /\b(cloud|containers?|linux|infra\w*)\b/i,
  },
  data: {
    strong:
      /\b(data engineering|databases?|sql|postgres\w*|mysql|mongodb|kafka|spark|flink|clickhouse|presto|trino|snowflake|databricks|bigquery|redis|elasticsearch|etl)\b/i,
    weak: /\b(data|analytics)\b/i,
  },
  security: {
    strong: /\b(cyber ?security|infosec|appsec|devsecops|owasp|red team\w*|pentest\w*|ctf|zero trust)\b/i,
    weak: /\b(security|cyber|hacking|identity|privacy)\b/i,
  },
  dev: {
    strong:
      /\b(developers?|software|programming|coding|hackathons?|buildathon|hack day|open source|hacktoberfest|python|golang|gophers?|rust|swift|android|ios|flutter|microservices|grpc|graphql|system design|backend|full ?stack|qiskit|web3|blockchain)\b/i,
    weak: /\b(devs?|dev ?days?|engineering|engineers?|code|coders?|tech talks?|tech|testing|qa|architects?|architecture|apis?|github|mobile|performance|scale|quantum|crypto)\b/i,
  },
  startups: {
    strong: /\b(startups?|founders?|demo day|venture capital|saas|entrepreneur\w*)\b/i,
    weak: /\b(pitch\w*|vcs?|product (managers?|management|folks|mixer|meetup|community|people|leaders?))\b/i,
  },
};

/**
 * Topics from the headline (title + organizer). Only when that says nothing do the tags and
 * description count, and then only their specific keywords.
 */
export function eventTopics(headline: string, details = ""): EventTopic[] {
  const found = EVENT_TOPICS.filter((t) => TOPICS[t].strong.test(headline) || TOPICS[t].weak.test(headline));
  return found.length ? found : EVENT_TOPICS.filter((t) => TOPICS[t].strong.test(details));
}

/** Paid-course and placement ads that event sites list as "events". */
export function looksLikeAd(title: string): boolean {
  return /\b(coaching|training (cent(er|re)|institute)|demo class(es)?|classes in|course in|job (guarantee|assistance|oriented)|crack\b.*\binterviews?|\d+\s?lpa)\b/i.test(
    title,
  );
}

export function inBengaluru(text: string): boolean {
  return /\b(bengaluru|bangalore|blr)\b/i.test(text);
}

export type EventRow = Omit<ScrapedEvent, "inPerson" | "city" | "details"> & { topics: EventTopic[] };

/**
 * Keeps in-person Bengaluru tech events that haven't ended, tagged with topics. Drops ads, and
 * lists one copy per source (the copy that says it's free wins).
 */
export function selectEvents(scraped: ScrapedEvent[], now = new Date()): EventRow[] {
  const kept = new Map<string, EventRow>();
  for (const e of scraped) {
    const { inPerson, city, details, ...row } = e;
    if (Number.isNaN(e.startsAt.getTime()) || (e.endsAt ?? e.startsAt) < now) continue;
    if (!inPerson || !inBengaluru(`${city} ${e.address}`) || looksLikeAd(e.title)) continue;
    const topics = eventTopics(`${e.title} ${e.organizer}`, details);
    if (!topics.length) continue;
    const key = `${e.source}:${e.externalId}`;
    const prev = kept.get(key);
    if (prev && !(e.isFree && !prev.isFree)) continue;
    kept.set(key, { ...row, topics });
  }
  return [...kept.values()];
}
