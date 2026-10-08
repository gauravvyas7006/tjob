/**
 * Skill dictionary: canonical name, category, and the spellings that appear in JDs and CVs.
 * Used without AI for: the extension's quick match score, ATS keyword coverage, and grouping
 * skills on the Insights page. Ambiguous short words (go, r, c, js, express) are deliberately
 * only matched in unambiguous forms.
 */
export type SkillCategory =
  | "language"
  | "backend"
  | "frontend"
  | "database"
  | "cloud"
  | "devops"
  | "testing"
  | "data"
  | "ai"
  | "mobile"
  | "practice"
  | "tool";

type SkillDef = readonly [canonical: string, category: SkillCategory, aliases: readonly string[]];

const SKILLS: readonly SkillDef[] = [
  // languages
  ["Java", "language", ["java", "core java", "java 8", "java 11", "java 17", "java 21", "j2ee", "java ee", "jakarta ee"]],
  ["JavaScript", "language", ["javascript", "ecmascript", "es6"]],
  ["TypeScript", "language", ["typescript"]],
  ["Python", "language", ["python", "python3"]],
  ["Go", "language", ["golang", "go lang", "go (golang)"]],
  ["C#", "language", ["c#", "csharp", "c sharp"]],
  ["C++", "language", ["c++", "cpp"]],
  ["C", "language", ["c programming", "c language"]],
  ["Kotlin", "language", ["kotlin"]],
  ["Swift", "language", ["swift"]],
  ["Scala", "language", ["scala"]],
  ["Rust", "language", ["rust"]],
  ["PHP", "language", ["php"]],
  ["Ruby", "language", ["ruby"]],
  ["SQL", "language", ["sql"]],
  ["PL/SQL", "language", ["pl/sql", "plsql"]],
  ["Bash", "language", ["bash", "shell scripting", "shell script", "unix shell"]],
  // backend
  ["Spring Boot", "backend", ["spring boot", "springboot", "spring-boot"]],
  ["Spring", "backend", ["spring framework", "spring", "spring core"]],
  ["Spring MVC", "backend", ["spring mvc"]],
  ["Spring Security", "backend", ["spring security"]],
  ["Spring Cloud", "backend", ["spring cloud"]],
  ["Spring Data JPA", "backend", ["spring data", "spring data jpa"]],
  ["Hibernate", "backend", ["hibernate"]],
  ["JPA", "backend", ["jpa"]],
  ["JDBC", "backend", ["jdbc"]],
  ["Servlets/JSP", "backend", ["servlets", "servlet", "jsp"]],
  ["Microservices", "backend", ["microservices", "micro services", "microservice", "micro-services"]],
  ["REST APIs", "backend", ["rest api", "rest apis", "restful", "rest services", "restful services", "restful apis", "web services"]],
  ["GraphQL", "backend", ["graphql"]],
  ["gRPC", "backend", ["grpc"]],
  ["SOAP", "backend", ["soap"]],
  ["Node.js", "backend", ["node.js", "nodejs", "node js", "node"]],
  ["Express.js", "backend", ["express.js", "expressjs", "express js"]],
  ["NestJS", "backend", ["nestjs", "nest.js", "nest js"]],
  ["Django", "backend", ["django"]],
  ["Flask", "backend", ["flask"]],
  ["FastAPI", "backend", ["fastapi"]],
  [".NET", "backend", [".net", "dotnet", ".net core", "asp.net", "asp.net core"]],
  ["Laravel", "backend", ["laravel"]],
  ["Ruby on Rails", "backend", ["ruby on rails", "rails"]],
  ["Kafka", "backend", ["kafka", "apache kafka"]],
  ["RabbitMQ", "backend", ["rabbitmq"]],
  ["ActiveMQ", "backend", ["activemq"]],
  ["WebSockets", "backend", ["websocket", "websockets", "socket.io"]],
  ["Multithreading", "backend", ["multithreading", "multi-threading", "multi threading", "concurrency"]],
  ["JWT/OAuth", "backend", ["jwt", "oauth", "oauth2", "oauth 2.0"]],
  ["Tomcat", "backend", ["tomcat"]],
  ["Nginx", "backend", ["nginx"]],
  ["Prisma", "backend", ["prisma"]],
  ["Sequelize", "backend", ["sequelize"]],
  ["Mongoose", "backend", ["mongoose"]],
  ["TypeORM", "backend", ["typeorm"]],
  // frontend
  ["React", "frontend", ["react", "react.js", "reactjs", "react js"]],
  ["Next.js", "frontend", ["next.js", "nextjs"]],
  ["Angular", "frontend", ["angular", "angularjs", "angular.js"]],
  ["Vue.js", "frontend", ["vue", "vue.js", "vuejs"]],
  ["Redux", "frontend", ["redux", "redux toolkit"]],
  ["HTML", "frontend", ["html", "html5"]],
  ["CSS", "frontend", ["css", "css3", "scss", "sass"]],
  ["Tailwind CSS", "frontend", ["tailwind", "tailwindcss", "tailwind css"]],
  ["Bootstrap", "frontend", ["bootstrap"]],
  ["Webpack", "frontend", ["webpack"]],
  ["jQuery", "frontend", ["jquery"]],
  // databases
  ["MySQL", "database", ["mysql"]],
  ["PostgreSQL", "database", ["postgresql", "postgres"]],
  ["Oracle", "database", ["oracle", "oracle db", "oracle database"]],
  ["SQL Server", "database", ["sql server", "mssql", "ms sql"]],
  ["MongoDB", "database", ["mongodb", "mongo db", "mongo"]],
  ["Redis", "database", ["redis"]],
  ["Elasticsearch", "database", ["elasticsearch", "elastic search", "opensearch"]],
  ["Cassandra", "database", ["cassandra"]],
  ["DynamoDB", "database", ["dynamodb"]],
  ["Firebase", "database", ["firebase", "firestore"]],
  ["NoSQL", "database", ["nosql"]],
  // cloud
  ["AWS", "cloud", ["aws", "amazon web services"]],
  ["AWS Lambda", "cloud", ["aws lambda", "lambda functions"]],
  ["AWS EC2", "cloud", ["ec2"]],
  ["AWS S3", "cloud", ["s3"]],
  ["Azure", "cloud", ["azure", "microsoft azure"]],
  ["GCP", "cloud", ["gcp", "google cloud", "google cloud platform"]],
  ["Serverless", "cloud", ["serverless"]],
  // devops
  ["Docker", "devops", ["docker", "containerization", "docker compose"]],
  ["Kubernetes", "devops", ["kubernetes", "k8s", "eks", "aks", "gke"]],
  ["OpenShift", "devops", ["openshift"]],
  ["Helm", "devops", ["helm"]],
  ["Terraform", "devops", ["terraform"]],
  ["Ansible", "devops", ["ansible"]],
  ["Jenkins", "devops", ["jenkins"]],
  ["GitHub Actions", "devops", ["github actions"]],
  ["GitLab CI", "devops", ["gitlab ci", "gitlab-ci"]],
  ["Azure DevOps", "devops", ["azure devops"]],
  ["CI/CD", "devops", ["ci/cd", "cicd", "ci cd", "continuous integration", "continuous delivery", "continuous deployment"]],
  ["Linux", "devops", ["linux", "unix"]],
  ["Prometheus", "devops", ["prometheus"]],
  ["Grafana", "devops", ["grafana"]],
  ["ELK Stack", "devops", ["elk", "kibana", "logstash"]],
  ["Splunk", "devops", ["splunk"]],
  // testing
  ["JUnit", "testing", ["junit", "junit5", "junit 5"]],
  ["Mockito", "testing", ["mockito"]],
  ["Jest", "testing", ["jest"]],
  ["Mocha", "testing", ["mocha", "chai"]],
  ["Selenium", "testing", ["selenium"]],
  ["Cypress", "testing", ["cypress"]],
  ["Playwright", "testing", ["playwright"]],
  ["Unit Testing", "testing", ["unit testing", "unit tests", "unit test"]],
  ["TDD", "testing", ["tdd", "test driven development", "test-driven development"]],
  // data
  ["Spark", "data", ["spark", "apache spark", "pyspark"]],
  ["Hadoop", "data", ["hadoop"]],
  ["Airflow", "data", ["airflow"]],
  ["Snowflake", "data", ["snowflake"]],
  ["Databricks", "data", ["databricks"]],
  ["ETL", "data", ["etl"]],
  ["Pandas", "data", ["pandas"]],
  ["Power BI", "data", ["power bi", "powerbi"]],
  ["Tableau", "data", ["tableau"]],
  // ai
  ["Machine Learning", "ai", ["machine learning"]],
  ["Generative AI", "ai", ["generative ai", "genai", "gen ai"]],
  ["LLMs", "ai", ["llm", "llms", "large language models"]],
  ["LangChain", "ai", ["langchain"]],
  // mobile
  ["Android", "mobile", ["android"]],
  ["iOS", "mobile", ["ios"]],
  ["React Native", "mobile", ["react native"]],
  ["Flutter", "mobile", ["flutter"]],
  // practices
  ["Data Structures & Algorithms", "practice", ["data structures", "algorithms", "dsa"]],
  ["System Design", "practice", ["system design", "low level design", "high level design", "lld", "hld"]],
  ["Design Patterns", "practice", ["design patterns"]],
  ["OOP", "practice", ["oop", "oops", "object oriented", "object-oriented"]],
  ["SOLID Principles", "practice", ["solid principles", "solid design"]],
  ["Distributed Systems", "practice", ["distributed systems"]],
  ["Event-Driven Architecture", "practice", ["event driven", "event-driven"]],
  ["Domain-Driven Design", "practice", ["domain driven design", "domain-driven design", "ddd"]],
  ["Agile/Scrum", "practice", ["agile", "scrum", "kanban"]],
  ["Performance Tuning", "practice", ["performance tuning", "performance optimization"]],
  ["Caching", "practice", ["caching"]],
  ["Security/OWASP", "practice", ["owasp", "application security"]],
  // tools
  ["Git", "tool", ["git", "github", "gitlab", "bitbucket"]],
  ["Maven", "tool", ["maven"]],
  ["Gradle", "tool", ["gradle"]],
  ["JIRA", "tool", ["jira"]],
  ["Postman", "tool", ["postman"]],
  ["Swagger/OpenAPI", "tool", ["swagger", "openapi"]],
  ["SonarQube", "tool", ["sonarqube", "sonar"]],
  ["npm", "tool", ["npm", "yarn", "pnpm"]],
];

interface CompiledSkill {
  canonical: string;
  category: SkillCategory;
  patterns: RegExp[];
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

// Boundaries treat + # . / as word characters so "c++", ".net", "node.js" and "ci/cd" match whole.
const BEFORE = "(?<![a-z0-9+#])";
const AFTER = "(?![a-z0-9+#]|\\.[a-z0-9])";

const COMPILED: CompiledSkill[] = SKILLS.map(([canonical, category, aliases]) => ({
  canonical,
  category,
  patterns: aliases.map((a) => new RegExp(BEFORE + escapeRegex(a.toLowerCase()) + AFTER, "i")),
}));

const ALIAS_TO_CANONICAL = new Map<string, string>();
const CANONICAL_TO_CATEGORY = new Map<string, SkillCategory>();
for (const [canonical, category, aliases] of SKILLS) {
  CANONICAL_TO_CATEGORY.set(canonical, category);
  ALIAS_TO_CANONICAL.set(canonical.toLowerCase(), canonical);
  for (const a of aliases) ALIAS_TO_CANONICAL.set(a.toLowerCase(), canonical);
}

/** Map any spelling to its canonical skill name; unknown skills are trimmed and returned as-is. */
export function canonicalSkill(name: string): string {
  const key = name.trim().toLowerCase().replace(/\s+/g, " ");
  return ALIAS_TO_CANONICAL.get(key) ?? name.trim().replace(/\s+/g, " ");
}

export function skillCategory(canonical: string): SkillCategory | "other" {
  return CANONICAL_TO_CATEGORY.get(canonical) ?? "other";
}

/** Find every dictionary skill mentioned in free text. */
export function extractSkills(text: string): string[] {
  const found = new Set<string>();
  const lower = text.toLowerCase();
  for (const s of COMPILED) {
    if (s.patterns.some((p) => p.test(lower))) found.add(s.canonical);
  }
  // "Spring Boot" implies "Spring"; avoid double-reporting the generic one as missing.
  if (found.has("Spring Boot")) found.add("Spring");
  return [...found];
}

/**
 * Whether `text` mentions `skill`: canonical or any alias, or for unknown skills the phrase itself,
 * allowing other word endings ("unit testing" matches "unit tests").
 */
export function textHasSkill(text: string, skill: string): boolean {
  const canonical = canonicalSkill(skill);
  const compiled = COMPILED.find((s) => s.canonical === canonical);
  const lower = text.toLowerCase();
  if (compiled) return compiled.patterns.some((p) => p.test(lower));
  const phrase = skill.trim().toLowerCase();
  if (!phrase) return false;
  if (new RegExp(BEFORE + escapeRegex(phrase) + AFTER, "i").test(lower)) return true;
  const words = phrase.split(/[\s-]+/);
  const stems = words.map((w) => (w.length >= 5 && /^[a-z]+$/.test(w) ? `${w.replace(/(ing|ed|es|s)$/, "")}[a-z]*` : escapeRegex(w)));
  return new RegExp(BEFORE + stems.join("[\\s-]+") + AFTER, "i").test(lower);
}

const GENERIC_WORDS =
  /\b(api|apis|development|developer|framework|frameworks|tool|tools|tooling|experience|knowledge|skills?|basics|concepts|programming|language|languages|scripting|technology|technologies)\b/gi;

/**
 * Ways a job requirement can appear in a CV, the requirement as written first: without versions
 * ("Python 3.7+" → "Python", "VueJS 2/3" → "VueJS"), either side of a pair of known skills
 * ("PowerShell/Bash"), the part in brackets, and without filler words ("Flask API" → "Flask").
 */
export function requirementVariants(requirement: string): string[] {
  const out = new Set<string>([requirement.trim()]);
  const noVersion = requirement
    .replace(/\b(?:v(?:ersion)?\s?)?\d+(?:\.\d+)*(?:\+|\.x)?(?:\s?\/\s?\d+(?:\.\d+)*\+?)*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const candidates = [noVersion];
  const bracket = noVersion.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (bracket?.[1] && bracket[2]) candidates.push(bracket[1], bracket[2]);
  for (const c of [...candidates]) {
    const pieces = c.split(/\s+or\s+|\s*,\s*|\s*\/\s*/i).map((p) => p.trim());
    if (pieces.length > 1 && pieces.some((p) => ALIAS_TO_CANONICAL.has(p.toLowerCase()))) candidates.push(...pieces);
  }
  for (const c of candidates) {
    out.add(c);
    const plain = c.replace(GENERIC_WORDS, " ").replace(/\s+/g, " ").trim();
    if (plain.length >= 2) out.add(plain);
  }
  return [...out].filter((v) => v.length >= 2);
}

/** Whether the CV text covers a job requirement in any of its usual forms. */
export function textHasRequirement(text: string, requirement: string): boolean {
  return requirementVariants(requirement).some((v) => textHasSkill(text, v));
}

export interface KeywordScore {
  /** 0-100 */
  score: number;
  matched: string[];
  missing: string[];
}

/**
 * ATS-style keyword coverage: required skills count double. This is an estimate of how a
 * keyword-based ATS sees the CV, not a real ATS.
 */
export function keywordCoverage(
  text: string,
  required: string[],
  optional: string[] = [],
): KeywordScore {
  const req = dedupeSkills(required);
  const opt = dedupeSkills(optional).filter((s) => !req.includes(s));
  const matched: string[] = [];
  const missing: string[] = [];
  let got = 0;
  let total = 0;
  for (const s of req) {
    total += 2;
    if (textHasRequirement(text, s)) {
      got += 2;
      matched.push(s);
    } else missing.push(s);
  }
  for (const s of opt) {
    total += 1;
    if (textHasRequirement(text, s)) {
      got += 1;
      matched.push(s);
    } else missing.push(s);
  }
  return { score: total ? Math.round((got / total) * 100) : 0, matched, missing };
}

export function dedupeSkills(skills: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of skills) {
    const c = canonicalSkill(s);
    if (!c || seen.has(c.toLowerCase())) continue;
    seen.add(c.toLowerCase());
    out.push(c);
  }
  return out;
}

/**
 * Free, local match between a JD and the user's skills (extension panel). Uses the dictionary
 * only, so it works without any AI call.
 */
export function quickMatch(jdText: string, userSkills: string[]): KeywordScore {
  const jdSkills = extractSkills(jdText);
  const mine = new Set(dedupeSkills(userSkills).map((s) => s.toLowerCase()));
  const matched = jdSkills.filter((s) => mine.has(s.toLowerCase()));
  const missing = jdSkills.filter((s) => !mine.has(s.toLowerCase()));
  return {
    score: jdSkills.length ? Math.round((matched.length / jdSkills.length) * 100) : 0,
    matched,
    missing,
  };
}
