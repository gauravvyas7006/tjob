# tjob

A personal job-search dashboard for LinkedIn and Naukri. It:

- **tracks every application** and its status (saved → applied → viewed → assessment → interview → offer / rejected / ghosted);
- **reads your job mailbox** over IMAP, so confirmations, "viewed" notices, rejections and interview invites update applications automatically;
- **tailors an ATS-friendly CV** for each job description with Claude, and downloads it as a PDF. It rewords your real experience in the job's terms and never invents skills; anything the job asks for that your CV can't back up is listed as a gap;
- shows **market insights** from every job description you collect: most-requested skills, trends, role mix, experience asked for, salary ranges, and "skills to learn next";
- comes with a **Chrome extension** that saves jobs, tailors your CV, autofills application forms, and records applications. You always click Submit yourself;
- lists **Bengaluru recruitment agencies** to approach, and **upcoming AI and tech events** in Bengaluru (read twice a day from the public Luma, Meetup and Eventbrite listings, with free events shown first).

Costs: hosting is free (Vercel Hobby, Neon free, GitHub Actions). Claude usage is about $7.50 a month for 300 applications and 150 tailored CVs, with a hard monthly cap (default $10).

## How LinkedIn and Naukri are connected

Neither site offers an API to job seekers, and both ban bots that log in or apply for you. tjob never stores your LinkedIn or Naukri password. It gets your data from three places:

| Source | What it gives tjob |
|---|---|
| **Your mailbox (IMAP)** | Confirmations ("Your application was sent to …", Naukri "applied successfully"), viewed/shortlisted notices, rejections, assessments, interview invites, and recruiter replies. Job-alert emails become **Leads**. |
| **Chrome extension** | The full job description of the page you're viewing, Save / Tailor CV / Autofill / Mark applied, and "Import this page" on the LinkedIn and Naukri applied-jobs pages. |
| **LinkedIn data export** | Your past LinkedIn applications (`Job Applications.csv`). |

Known email formats are sorted by free rules. Only unknown emails go to Claude Haiku. When you correct an email in the Inbox's Review list, tjob can turn that into a rule, so the next email of that kind is free.

## Repository layout

```
apps/web         Next.js 16 app (dashboard + API), deployed to Vercel
apps/extension   Chrome MV3 extension (WXT)
packages/shared  Types, schemas, skill dictionary and status rules used by both
.github/workflows  ci.yml (checks) and sync.yml (mail sync every 30 min, 7 AM–midnight IST)
```

## Run it locally

Requires Node 20.9+ (24 recommended).

```bash
npm install
```

**Try it without any accounts**, using an embedded local Postgres stored in `apps/web/.pglite`:

```bash
cd apps/web
# set OWNER_EMAIL in .env.local first (the email you'll sign up with)
npm run dev:local
```

**With your real Neon database:**

1. Fill in `apps/web/.env.local`. `.env.example` explains every variable and how to generate the secrets.
2. Create the tables: `npm run db:migrate`
3. Start: `npm run dev`, then open http://localhost:3000/signup.

Only `OWNER_EMAIL` can create the account, and only once.

## Deploy (Vercel + Neon)

1. **Neon:** create a free project, then copy the pooled connection string (`DATABASE_URL`) and the direct one (`DATABASE_URL_UNPOOLED`: the same address without `-pooler`).
2. **Vercel:**
   - Add New Project → import this GitHub repo → **Root Directory: `apps/web`**.
   - Add the environment variables from `.env.example`, except `BETTER_AUTH_URL`: on Vercel, tjob uses its own address automatically.
   - Deploy. The build runs the database migrations automatically (`vercel.json`).
   - Functions run in the Vercel region set in `vercel.json`, which must match your Neon region, because every page makes several database queries. It's `cle1` (Cleveland), for Neon's AWS US East 2 (Ohio). For Neon's Singapore region, use `sin1`.
3. **GitHub:** in the repo, go to Settings → Secrets and variables → Actions, and add:
   - `TJOB_URL`: your Vercel URL;
   - `CRON_SECRET`: the same value as on Vercel.

   The **Sync mail** workflow then checks your mailbox every 30 minutes. Vercel also runs a daily backup sync, and the dashboard syncs when you open it.
4. Open your site, go to `/signup`, then:
   - **Settings → Email:** connect your mailbox. For Gmail, use an App Password.
   - **CV:** upload your CV.

## Chrome extension

```bash
npm run ext:build      # → apps/extension/.output/chrome-mv3
```

1. In Chrome, open `chrome://extensions`, turn on Developer mode, click **Load unpacked**, and pick `apps/extension/.output/chrome-mv3`.
2. In tjob, create a token under **Settings → Chrome extension**.
3. Click the extension icon, enter your tjob URL and the token, and click **Connect**.
4. Open any LinkedIn or Naukri job. The tjob panel appears bottom-right with your match score and the buttons **Save · Tailor CV · Autofill · Mark applied**.

**Autofill** fills fields from your profile and saved answers for free. New questions get an AI-drafted answer, outlined in amber so you check it. **The extension never clicks Next or Submit.**

If LinkedIn or Naukri change their page layout and the panel can't read a job, paste the description into the panel. The selectors live in `apps/extension/src/sites/{linkedin,naukri}.ts`.

## AI usage and cost controls

| Task | Model | Approx. cost |
|---|---|---|
| Sort an email the rules can't | Claude Haiku 4.5 | $0.002 |
| Read a job description | Claude Haiku 4.5 | $0.004 |
| Tailor a CV | Claude Sonnet 5.5 (low effort, cached prompt) | $0.03 |
| Answer a new application question | Claude Haiku 4.5 | $0.0025 |
| Read your CV PDF (once) | Claude Sonnet 5.5 | $0.04 |

**How costs stay low:**
- Every call is logged with its cost (Settings → AI usage).
- At `AI_MONTHLY_BUDGET_USD`, AI pauses. Rules keep working, and new emails wait in Review.
- The first 90-day mail scan goes through the 50%-cheaper Message Batches API.
- Each job description is read only once. Insights use SQL only, no AI.

## Privacy

- Your CV, job descriptions and job-related emails are stored in your own Neon database. Unrelated emails are never stored.
- Email text is trimmed before it's sent to the Anthropic API.
- Mailbox passwords are encrypted with AES-256-GCM (`ENCRYPTION_KEY`). Extension tokens are stored only as hashes.
- Nothing personal is in this repository; `.env*`, PDFs and `.pglite/` are git-ignored.

## Development

```bash
npm run lint -w web
npm run typecheck        # all workspaces
npm test                 # shared + web (incl. integration tests on embedded Postgres) + extension
npm run db:generate      # after changing apps/web/src/db/schema.ts
```
