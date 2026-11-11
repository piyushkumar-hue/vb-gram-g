# Project status

## Implemented

- JWT login/registration, bcrypt password hashing and admin/officer/viewer authorization.
- Work registry, validation, paginated/filterable work list, CSV import/export, lifecycle status and automatic delayed comparison (`actualProgress < plannedProgress`).
- Work create/update actor references and timestamps are returned with work details; delete actions are recorded in the separate `WorkAudit` collection. Legacy records without actor references remain unattributed.
- Field-update endpoint protected by `FIELD_DEVICE_API_KEY`, with persisted history and idempotency support.
- Dashboard summary, category/status/progress charts, filters and manual district zero-work reporting.
- A guarded demo seed creates 180 synthetic works across multiple source-boundary states/districts (the current first 180 district features cover nine state groupings), three demo accounts and field-update history, with `isDemo: true` markers. `npm run clear-demo` removes only tagged demo records, attached histories/audits and tagged demo accounts.
- Demo records are excluded from API list/summary/export/location queries by default. The dashboard/map/registry toggle includes or hides demo records and visibly labels included demo data.
- Lazy-loaded state and district GeoJSON choropleth with India → State → District drill-down, tooltip, metric legend, and distinct has-data / reported-zero / no-data states.
- Boundary validation and processing scripts with provenance.

## Geographic coverage actually represented

The state layer has 36 features:

Andaman and Nicobar Islands; Andhra Pradesh; Arunachal Pradesh; Assam; Bihar; Chandigarh; Chhattisgarh; Dadra and Nagar Haveli and Daman and Diu; Delhi; Goa; Gujarat; Haryana; Himachal Pradesh; Jammu and Kashmir; Jharkhand; Karnataka; Kerala; Ladakh; Lakshadweep; Madhya Pradesh; Maharashtra; Manipur; Meghalaya; Mizoram; Nagaland; Odisha; Puducherry; Punjab; Rajasthan; Sikkim; Tamil Nadu; Telangana; Tripura; Uttar Pradesh; Uttarakhand; West Bengal.

The district layer has 735 polygons. These are source polygons, not an LGD-code-certified inventory. The source metadata reports 736 district units and the LGD portal displays 784; the counts are not reconciled. District-parent relationships were inferred spatially by the existing source processing pipeline and must not be treated as official. Work data is present only where users have entered or imported it; the boundary layer does not assert coverage.

Only State/UT and district boundaries are loaded. Block and Gram Panchayat boundaries are unavailable; the map drill-down stops at district. Work location fields may contain block/GP names but do not establish official relationships or geometries.

## Known limitations / blocked

- MongoDB main URI could not be verified in the final audit because the DNS/SRV lookup failed. No test-database URI is configured, so database-backed test suites and real-database browser verification are blocked. No writes were attempted.
- The only geoBoundaries district file contains 735 features while its metadata reports 736; LGD displays 784. Simplification and possible boundary vintage/dispute issues remain.
- geoBoundaries layers are third-party redistributed data, not government-verified. See [boundary provenance](../data/geo/PROVENANCE.md).
- Block/Gram Panchayat boundaries and reliable LGD codes/parent IDs are unavailable.
- The official 4-category / 29-sub-category / 318-permissible-work catalogue remains **BLOCKED**; no entries should be manufactured or imported.
- Demo data is synthetic, not actual work reporting. State/district names are drawn from the bundled third-party boundary file; block/GP labels and sample coordinates are not verified localities. Demo accounts share the `DEMO_ACCOUNT_PASSWORD` setting and must not be used in production. Seed and clear commands require `demo` or `test` in the database name, unless `--force-demo` is explicitly supplied.
- Any pre-existing works from the former 30-row sample seed remain untouched and untagged. They cannot safely be reclassified as demo without reviewing the underlying records.
- Helmet headers and a process-local limiter for API write requests (120 per client address per 15 minutes) are implemented. Rate limits are not shared across API instances. Common write/query inputs reject unknown fields, invalid types/ranges, and control characters; review remains needed for exhaustive endpoint-level input cases.
- Delete audit events are persisted after the work deletion. If the event write fails, the API reports that the work was deleted but audit persistence failed; an operator must reconcile the event manually.
- Some dashboard, history and boundary-load errors now expose retry controls; success notices auto-dismiss; the registry supports search, sorting and pagination; delete asks for confirmation. No Playwright screenshots are present. The 375px layout and console state were not browser-verified in this run.
- The separate test URI placeholder is documented in `.env.example`, but DB integration tests are not configured or run. At the latest environment check, `MONGODB_URI_TEST` was missing and the main MongoDB connection failed DNS/SRV lookup.
- The field-update endpoint is software-only. No ESP32/GPS hardware has been tested.

## Verification evidence

Before the performance split in the previous completion pass: backend `npm test` passed 29/29; frontend `npm test` passed 5/5; frontend lint and production build passed. The before-build entry bundle was 825,171 bytes (241.19 kB gzip) and triggered Vite's >500 kB warning.

The previous production build completed without a >500 kB warning. Emitted JavaScript chunks were: entry 3.01 kB, Portal 49.96 kB, Leaflet 164.78 kB, vendor 218.15 kB, and Recharts 390.83 kB (largest chunk; all uncompressed). Prior to the current demo-data work, backend tests passed 31/31 and frontend tests 5/5; the earlier lint and build passed. This run verified the environment first, found the test URI missing and the main connection failing DNS/SRV, and therefore did not run a database command or browser test. Focused offline demo safety tests passed 4/4 and syntax checks passed; the full suite/build/geo validation were not run in this restricted run.

## Future scope

- Obtain a licensed, current official boundary source and LGD codes/parent mappings; reconcile district counts before joining by code.
- Obtain and verify official catalogue source before populating the catalogue.
- Import real reporting data with source, date, identifier, and quality checks.
- Configure an isolated test database and run database-backed integration tests and browser checks.
- Add verified block/Gram Panchayat boundaries only if a suitable dataset is found.
- Test the IoT API with physical ESP32/GPS hardware, then deploy with production secrets, shared rate-limit storage, and monitoring.
