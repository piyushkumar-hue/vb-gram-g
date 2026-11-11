# Viva questions and short answers

1. **What does the portal do?** It centralizes entered rural-development work records into a registry, dashboard, CSV reports, field-update history, and a geographic view.
2. **Why MERN?** React supports reusable interactive views, Express exposes REST endpoints, Node shares JavaScript across client and server, and MongoDB/Mongoose stores flexible work and history documents.
3. **What is the architecture?** Vite serves a React client; it calls Express JSON APIs; Mongoose accesses MongoDB; static GeoJSON is fetched separately by the map.
4. **How does authentication work?** Login checks a bcrypt hash and returns a signed JWT that protected routes verify.
5. **What are the roles?** Admin manages users and works; Officer can manage works and submit coverage reports; Viewer is read-only. Actual permissions are enforced server-side. Three demo-only accounts are created only through the guarded demo seed.
6. **Why hash passwords?** bcrypt stores a one-way salted hash rather than a recoverable plaintext password.
7. **How is authorization distinct from authentication?** Authentication establishes the user identity; role middleware checks whether that identity may perform a specific action.
8. **What is the work lifecycle?** Proposed → Approved → Started → Completed; normal updates cannot jump forward multiple stages.
9. **How is progress calculated?** Each record stores planned and actual progress percentages. The current dashboard completion rate is completed works divided by all matched work records times 100; the brief’s separate “Completed / Planned” measure is not implemented as a distinct aggregate.
10. **How is delay detected?** A work is delayed when `actualProgress < plannedProgress`.
11. **How does the dashboard aggregate data?** MongoDB aggregation groups matching records by status, category, geography and reporting period; exact calculations are in `backend/src/routes/dashboard.js`.
12. **How is filtering shared?** `backend/src/domain/workQuery.js` validates query values and builds a MongoDB filter for list and summary endpoints.
13. **Why paginate the registry?** It limits response size and provides predictable page navigation for larger collections.
14. **How does CSV import protect data?** It validates headers and records before importing; imported works start in Proposed rather than bypassing lifecycle transitions.
15. **How does CSV export work?** It streams matching records and escapes spreadsheet formulas.
16. **What does the field-update endpoint accept?** A work identifier, coordinates, status, progress and optional evidence URL; a configured API key protects the device-facing write.
17. **How is field history preserved?** Field updates are stored as separate records keyed to a work and ordered by received time; deletion is restricted when history exists.
18. **What is a choropleth?** A map of geographic polygons whose styling represents an aggregated metric for each polygon.
19. **How are boundaries loaded?** State GeoJSON is fetched for the map and district GeoJSON is loaded on state drill-down; the data is not part of the initial JS bundle.
20. **Why distinguish zero from no data?** Zero is supported only by an explicit manual coverage report; absent records without such a report mean “not reported,” not zero.
21. **What are the map limitations?** The redistributed geoBoundaries files have 36 state/UT polygons and 735 district polygons; metadata says 736 and LGD shows 784. The layers are not government-verified.
22. **Why is there no block/GP drill-down?** No verified block or Gram Panchayat boundary geometry and identifiers are available, so fabricating them would be misleading.
23. **Is the 318 permissible-work catalogue implemented?** A validation/import path exists, but the official source is unverified and the catalogue remains blocked; no official entries are claimed.
24. **Has IoT hardware been tested?** No. The API is a software integration point; ESP32/GPS hardware has not been connected.
25. **What must happen before production?** Configure private production secrets and verified MongoDB; run isolated DB tests; verify administrative joins; add monitoring and validate deployment. Demo accounts are not production identities.

## Work audit and demo-data caveats

Manual work creation and updates store `createdBy` / `updatedBy` user references and use Mongoose `createdAt` / `updatedAt` timestamps. A successful deletion is written to `WorkAudit` with its actor and recorded timestamp; legacy records may be unattributed.

The demo seed inserts 180 synthetic works marked `isDemo: true`, three tagged demo users and field-update history. It inserts rather than upserts, and refuses database names without `demo` or `test` unless the operator explicitly supplies `--force-demo`. The clear command deletes only tagged demo work/user records and field/audit histories attached to demo work IDs. Demo data is excluded from API results by default; dashboard/map/registry controls add `includeDemo=true` and visibly label it. Sample work locations and coordinates are not actual reports.

An admin/officer reporting-coverage submission is an immutable manual declaration for one district and an exact date range. Matching non-demo works reject a zero report; duplicates are rejected. Demo data does not prevent the report. This is not an official reporting feed.
