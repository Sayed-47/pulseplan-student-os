# PulsePlan

**Your Notion Student OS, now proactive.**

PulsePlan reads assignments from Notion, explains which deadlines are becoming risky, and creates a realistic seven-day study plan that respects daily capacity. The included demo workspace makes every feature testable without credentials.

> Built for the Cognition × Notion Student OS Hackathon.

## The problem

A Student OS is excellent at storing classes, assignments, and deadlines. A busy student still has to answer a harder question every day: **what should I work on now, and will everything fit before it is due?**

A due-date sort cannot account for a large assignment due in three days versus a short assignment due tomorrow. Students often discover overload only after there is no room left to recover.

## What PulsePlan does

- **Reads Student OS assignments** through Notion's current data-source API.
- **Calculates a transparent risk score** from urgency, remaining workload, priority, and whether work has started.
- **Builds a seven-day plan** with 15–60 minute focus blocks, daily capacity limits, protected breaks, and a two-hour daily limit per assignment.
- **Flags impossible weeks early** by showing work that cannot fit before its deadline.
- **Writes focus blocks back to Notion** as Study Session pages.
- **Exports the plan to CSV** when write-back is not configured.
- **Runs in demo mode automatically**, so judges can evaluate the complete workflow without access to a private workspace.

## How it improves Notion Student OS

PulsePlan complements the hackathon [Student OS workspace](https://app.notion.com/p/campusleaders/Student-OS-Build-Your-Campus-Life-with-Notion-41cd5368c6db80da906ec73c061b3cc6?source=copy_link). Notion remains the source of truth. PulsePlan adds a decision layer:

```text
Student OS Assignments → normalize → risk score → capacity-aware plan → Study Sessions in Notion
```

The adapter auto-detects common names such as `Name`, `Assignment`, `Due`, `Deadline`, `Course`, `Class`, `Status`, `Priority`, `Estimated hours`, and `Progress`. Environment variables can override every mapping, so the app does not depend on one exact template schema.

## Demo workflow

1. Open the dashboard. It loads safe sample assignments automatically.
2. Read the Smart Briefing and transparent risk score.
3. Open **Study plan** and change daily capacity from two to five hours.
4. Observe the schedule and overload warning adapt immediately.
5. Select a focus block to mark it complete, or export the week as CSV.
6. Open **Assignments**, expand **Why this score?**, and inspect the four score components.
7. Open **Notion setup** to see live integration instructions.

## How Devin Chat was used

> **Participant action required before submission:** Do not replace this note with a claim until you have actually run Devin Chat on this repository.

Use Devin Chat for a meaningful final implementation pass, then replace this subsection with what it actually changed. A recommended prompt is:

```text
Review this PulsePlan hackathon repository as a senior TypeScript engineer. Run the tests,
inspect the risk scoring and scheduling edge cases, and implement one concrete improvement.
Keep the deterministic planner and demo mode intact. Report the files changed and commands run.
```

Record the real result in this form:

- **Planning:** Devin reviewed the Student OS problem and the proposed risk-aware workflow.
- **Implementation:** Devin changed `[files/features Devin actually changed]`.
- **Verification:** Devin ran `[commands Devin actually ran]` and fixed `[actual issue, if any]`.
- **Human decisions:** I chose the problem, validated the experience, and approved the final trade-offs.

A longer evidence template is available in [`DEVIN_USAGE.md`](./DEVIN_USAGE.md).

## Run locally

### Requirements

- Node.js 20.9 or later
- npm
- A Notion integration only if live sync is needed

### Demo mode

```bash
git clone YOUR_PUBLIC_REPOSITORY_URL
cd pulseplan
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). No environment file is required.

### Live Notion mode

1. Create a Notion internal integration with **Read content**. Add **Insert content** for write-back.
2. Share the Assignments and Study Sessions data sources with the integration through Notion's **Connections** menu.
3. Copy the example environment file:

```bash
cp .env.example .env.local
```

4. Set at least these values:

```dotenv
NOTION_API_KEY=ntn_your_secret
NOTION_ASSIGNMENTS_DATA_SOURCE_ID=your_assignments_data_source_id
NOTION_SESSIONS_DATA_SOURCE_ID=your_study_sessions_data_source_id
```

5. Restart `npm run dev`.

The token is read only in server routes. It is never included in browser JavaScript or API responses.

### Recommended Notion properties

**Assignments**

| Property | Type | Required |
|---|---|---:|
| Name | Title | Yes |
| Due | Date | Yes |
| Status | Status or Checkbox | No |
| Course | Select or Text | No |
| Estimated hours | Number | No |
| Priority | Select | No |
| Progress | Number (`0–1` or `0–100`) | No |

When an estimate is missing, PulsePlan uses three hours for high-priority work and two hours for other work.

**Study Sessions**

| Property | Type | Required |
|---|---|---:|
| Name | Title | Yes |
| Date | Date | Yes |
| Course | Select or Text | No |
| Duration | Number (minutes) | No |
| Status | Status, Select, or Checkbox | No |
| Source | URL or Text | No |

All names can be changed through `.env.local`; see [`.env.example`](./.env.example).

## Risk model

The score is deterministic and capped at 100:

| Signal | Maximum | Mechanism |
|---|---:|---|
| Deadline urgency | 48 | Rises as the due date approaches; overdue work gets the maximum. |
| Workload pressure | 26 | Remaining hours divided by available days. |
| Priority | 22 | High, medium, and low map to 22, 13, and 6 points. |
| Starting inertia | 8 | Adds pressure when near-term work has not started. |

- `70–100`: act now
- `45–69`: at risk
- `0–44`: on track
- Completed work always scores `0`.

## Architecture

```text
app/
  api/assignments/route.ts   Notion read endpoint with safe demo fallback
  api/sync/route.ts          Validated Study Session write-back
components/Dashboard.tsx     Responsive, interactive product UI
lib/
  notion.ts                  API 2026-03-11 adapter and schema mapping
  planner.ts                 Pure scoring and scheduling engine
  demo-data.ts               Date-relative judge demo
```

Notable implementation choices:

- The planner is a pure TypeScript function, which makes it fast and testable.
- Notion failures fall back to demo data with a visible warning instead of breaking the presentation.
- Writes are validated and capped at 100 sessions per request.
- Notion tokens remain server-side.
- No database or AI API is required.

## Test and build

```bash
npm test
npm run lint
npm run build
```

## Deploy

The quickest option is Vercel:

1. Import the public GitHub repository.
2. Keep all environment variables blank for a public demo, or add the Notion variables in project settings for live mode.
3. Deploy with the default Next.js settings.

Do not commit `.env.local` or expose a Notion token in screenshots.

## Hackathon submission checklist

- [ ] Run the project and verify all four navigation sections.
- [ ] Use Devin Chat for a real final task and update the Devin section above.
- [ ] Add the final public GitHub URL to this README.
- [ ] Push the repository publicly.
- [ ] Submit your full name, Luma-registered email, and direct repository URL through the official form before 6:00 PM.

## Documentation references

- [Hackathon Student OS workspace](https://app.notion.com/p/campusleaders/Student-OS-Build-Your-Campus-Life-with-Notion-41cd5368c6db80da906ec73c061b3cc6?source=copy_link)
- [Notion: Query a data source](https://developers.notion.com/reference/query-a-data-source)
- [Notion: Create a page](https://developers.notion.com/reference/post-page)
- [Notion: Connections and capabilities](https://developers.notion.com/reference/capabilities)

Documentation details were summarized and rephrased for licensing compliance.

## License

[MIT](./LICENSE)
