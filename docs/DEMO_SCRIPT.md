# Five-minute walkthrough

This script uses the demo-only accounts and synthetic records created by `npm run seed-demo`. Configure `DEMO_ACCOUNT_PASSWORD` in `backend/.env` and point `MONGODB_URI` at an isolated database whose name contains `demo` or `test`. The seed inserts records only and never updates matching works. `npm run clear-demo` removes only demo-tagged works, associated field-update/audit records and demo-tagged users; use it only against the isolated database.

Demo emails are `admin.demo@vbgramg.invalid`, `officer.demo@vbgramg.invalid`, and `viewer.demo@vbgramg.invalid`. They share the configured `DEMO_ACCOUNT_PASSWORD`. Do not print or reuse that password. Seeded records, coordinates and histories are synthetic and must never be presented as real work reports.

| Time | Action | What to say |
|---|---|---|
| 0:00–0:35 | Sign in as admin, then show the role label. Sign out and repeat with the officer and viewer demo accounts. | “The API issues a JWT and checks role permissions on protected operations. Viewer accounts are read-only; officers manage works; admins also manage users. These demo accounts are created only by the guarded demo seed.” |
| 0:35–1:15 | As admin/officer, add one clearly synthetic work with a valid category, lifecycle status, progress, coordinates, and planned dates. Open its field-activity/detail panel and point out creator/updater and timestamps. | “The registry validates required fields and records the responsible user and timestamps on create/update. Older imported records may not have actor attribution.” |
| 1:15–1:50 | Use Postman to submit a field update with the configured API key and a real work ID from this local database. Open the work's history in the portal. | “The field API is ready for a future device, but this demonstration is software-only; no hardware is connected.” |
| 1:50–2:25 | Set actual progress below planned progress; show the delayed count/list. | “Delayed is computed using actual progress less than planned progress; it is a review flag, not a separate lifecycle status.” |
| 2:25–3:15 | Open GIS & geography. Show the India layer, choose a state, then a district. Hover a polygon and explain the three data states and source note. | “Boundaries are third-party and coverage is not implied. No data is distinct from an explicit zero report and from recorded works. Drill-down stops at district.” |
| 3:15–3:50 | Turn off “Show demo data,” then as an authorized user submit a district zero-work report for a date range with no matching non-demo work; show that it is a manual declaration. | “A zero report is immutable, attributed to the user, and does not create a work record. Synthetic demo works do not count as reported work.” |
| 3:50–4:20 | Filter registry and export the filtered CSV. | “The export follows the current filters; the import validates a complete file before writing.” |
| 4:20–5:00 | Sign in as viewer and attempt to locate a write action; finish on the dashboard. | “Viewer access is read-only. Counts shown are records entered or imported, not complete official coverage.” |

Use the visible “Show demo data” toggle on dashboard, map and registry to include/hide tagged records. An admin delete is confirmed in the UI and creates a `WorkAudit` delete event. Manual zero-work reporting is immutable and checks for matching non-demo works; demo records do not block the declaration.

Do not present the supplied boundaries as government-verified, the 318-work catalogue as verified, or synthetic work as real. Do not claim the walkthrough was performed against a live database unless a dedicated test database and browser run are available.
