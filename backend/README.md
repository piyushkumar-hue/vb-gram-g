# VB-G RAM G API

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and set `MONGODB_URI`, a private `JWT_SECRET` of at least 32 characters, and a separate `FIELD_DEVICE_API_KEY`.
3. Set `CLIENT_ORIGIN` to the exact frontend origin. Multiple origins may be comma-separated.
4. Start the API with `npm run dev`; startup fails if MongoDB cannot be reached or `MONGODB_URI` is missing.
5. Run the focused backend regression suite with `npm test`.

### Hosted deployment (Render / MongoDB Atlas)

- Set the backend service Root Directory to `backend`, Build Command to `npm install`, and Start Command to `npm start`.
- Add `MONGODB_URI` as a secret environment variable. Use the Atlas **Drivers** connection string, URL-encode special characters in the database username/password, and allow the hosting provider IPs in Atlas Network Access (or use `0.0.0.0/0` only if you accept that exposure).
- The database name is `vb_gram_g`. The URI may include `/vb_gram_g` or omit the path; the application explicitly selects this database. A URI naming a different database is rejected.
- Set `CLIENT_ORIGIN` to the deployed frontend origin, plus `JWT_SECRET` and `FIELD_DEVICE_API_KEY`. The API listens on the platform-provided `PORT`, starts before MongoDB finishes connecting, and returns HTTP 503 for database-backed requests until the connection is ready.
- Check `https://YOUR-BACKEND.onrender.com/api/health`. It should return `{"status":"ok","database":"connected"}` when Atlas is reachable. Inspect backend logs for the underlying DNS, authentication, or network error if it remains unavailable.
6. Validate a supplied official catalogue CSV without writing data using `npm run validate-catalogue -- <path-to-catalogue.csv>`.
7. Only after a maintainer verifies every source, import it into the separate catalogue collection with `npm run import-catalogue -- <path-to-catalogue.csv> --apply --confirm-source-reviewed`.

Never commit `.env` or put database credentials, JWT secrets, or device keys into frontend code.
Login is limited to 10 attempts per client address and public registration to 5 attempts per 15 minutes. API write methods are additionally limited to 120 requests per client address per 15 minutes. Helmet supplies standard HTTP security headers. The default in-memory rate-limit store is per process; use a shared store for multi-instance deployments. `TRUST_PROXY=1` is appropriate only when exactly one trusted reverse proxy sits in front of this API.

## Work API behavior

- `GET /api/works` accepts `category`, `status`, `state`, `district`, `block`, `gramPanchayat`, inclusive `periodFrom`/`periodTo` dates (planned start date), `q`, `delayed`, `page`, and `limit`.
- Work pages default to 50 records and are capped at 100. The response includes `pagination.total` and `pagination.pages`.
- `GET /api/works/locations` returns the state/district/block/Gram Panchayat values already present in work records. It is not an official administrative-boundary dataset.
- New records begin at `Proposed`. Normal updates may keep their current status or move forward by one lifecycle stage only.
- CSV imports validate the full file before inserting records and accept only initial `Proposed` records. CSV exports stream all records matching the selected filters and escape spreadsheet formulas.
- A work that has field-update history cannot be deleted through the normal work endpoint, preserving its audit trail.

## Manual reporting coverage

An authenticated admin or officer can `POST /api/reporting-coverage` to record an explicit district zero-work report for an exact inclusive `periodFrom`/`periodTo` range:

```json
{
  "state": "Madhya Pradesh",
  "district": "Jabalpur",
  "periodFrom": "2026-01-01",
  "periodTo": "2026-01-31"
}
```

The API refuses the report if any work with a matching state/district and planned start date in the period exists. Matching uses case- and diacritic-insensitive English collation. A unique index prevents duplicate reports for the same state, district and date range; submissions are immutable and attributed to the authenticated user. There is no edit/delete endpoint. This is a manual user declaration, not an official reporting feed.

The dashboard displays a confirmed zero only when both report dates exactly match the selected reporting-period filters and the view is not narrowed by category, status, delay, search, block or Gram Panchayat. Reporting a zero for one district does not mark its parent state as reported zero. Reports appear in the geography summary alongside work metrics and do not create, edit or delete `Work` documents.

## Field-update API

Send `POST /api/field-updates` with `x-api-key` set to the private `FIELD_DEVICE_API_KEY` and a JSON body such as:

```json
{
  "workId": "REPLACE_WITH_A_REAL_WORK_ID",
  "lat": 23.1,
  "lng": 79.9,
  "status": "Started",
  "progress": 20,
  "evidenceUrl": "https://example.invalid/evidence.jpg",
  "deviceId": "demo-device"
}
```

The work ID, coordinates, progress, URL, and status transition are validated before writing. An optional `Idempotency-Key` header lets a client safely retry the same update; reusing the key with different data is rejected. Field-update history is available through authenticated `GET /api/field-updates?workId=...`; pages are ordered chronologically from oldest to newest.

When the MongoDB deployment supports transactions, the history record and work change are committed in a transaction. Standalone MongoDB deployments use a conditional write and compensating history deletion if the work write fails. Compensation is not equivalent to a transaction during a network or process failure; inspect server logs and reconcile both records if a rollback failure is reported. Actual device hardware has not been included in this software workflow.

## Data limitations

The bundled categories and works are demonstration data, not verified official scheme data. The official 29-sub-category/318-permissible-work source and verified district-boundary GeoJSON are not present in this repository. See [`../docs/data-source-mapping.md`](../docs/data-source-mapping.md) before importing official data or presenting a geographic choropleth.

The separate `PermissibleWork` schema reserves a source-cited catalogue collection and defaults entries to `pending` verification. No catalogue records are loaded by the validator or seed script. Do not mark entries verified or connect them to work entry until the source has been checked by a project maintainer.
The catalogue importer requires the explicit review flag and HTTPS `.gov.in`/`.nic.in` source URLs. It upserts only catalogue rows, never modifies `Work` or sample `Category` records, and does not delete older catalogue entries absent from a later file. MongoDB bulk writes may partially apply on process/network failure; rerunning the same validated file is safe because upserts use category/sub-category/work codes.

## Pan-India boundary data

Run `npm run validate-geo` and `npm run process-geo` to validate and process the pinned state/district boundary sources. The layers are loaded lazily in the GIS view. Source, licence, checksums, coverage and limitations are in [`../data/geo/PROVENANCE.md`](../data/geo/PROVENANCE.md); block/Gram Panchayat import requirements are in [`src/geo/README.md`](src/geo/README.md). Boundary layers are third-party redistributed data, not government-verified.

## Operations Hub APIs

See the root README for the added assignment, grievance, notification, evidence-link, finance, CSV report and explainable risk-insight modules. All routes are mounted at `/api/operations` and use the existing bearer-token authentication. Admin/officer write permissions are enforced in the API, not just hidden in the UI.

Existing Work documents are compatible: `budget` and `amountReleased` are additive numeric fields defaulting to `0`; the existing `expenditure` field remains unchanged.
