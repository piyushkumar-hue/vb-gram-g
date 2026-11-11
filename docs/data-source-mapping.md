# Data source and geography status

## Verification status

No authoritative catalogue matching the requested four categories, 29 sub-categories and 318 permissible works was found; catalogue status is **BLOCKED**. The official NREGA portal homepage is reachable at [nrega.dord.gov.in](https://nrega.dord.gov.in/), but no matching downloadable catalogue/report endpoint was verified. The geoBoundaries state and district layers now provide a real third-party choropleth; they are explicitly not government-verified. Their source, licence, date, checksums, coverage and limitations are recorded in [`../data/geo/PROVENANCE.md`](../data/geo/PROVENANCE.md).

The project seed and work-form default currently use **Madhya Pradesh** and seed the sample district **Jabalpur**. The seed also contains sample blocks and Gram Panchayats. This identifies only the demonstration data scope; there is no configured authoritative state/district scope, and Jabalpur must not be assumed to be the final deployment scope.

The sources below are candidates named in the project brief, not verified integrations. Do not describe them as automated or official data feeds until their URLs, formats, access conditions, and field definitions have been checked against the source owner.

| Dataset | Candidate source from the project brief | Current mapping target | Verification |
|---|---|---|---|
| Proposed works | Work Planning Report | Work name, category, sub-category, location, planned dates and planned progress | Not verified; no source URL/file |
| Approved works | Sanction Report | Work identifier and `Approved` lifecycle stage | Not verified; no source URL/file |
| Started works | Work Status Report | Work identifier, `Started` stage, actual progress and actual start date | Not verified; no source URL/file |
| Completed works | Completion Report | Work identifier, `Completed` stage, actual progress and completion date | Not verified; no source URL/file |
| Expenditure | FC / RFO Report | Work identifier and expenditure | Not verified; no source URL/file |
| Location details | Work Details / GIS | State, district, block, Gram Panchayat and coordinates where supplied | Not verified; no source URL/file |
| Permissible works | Official scheme catalogue | Four categories, 29 sub-categories and 318 permissible work types | Not verified; source list absent |

Before an import is treated as official, record the source URL or issuing document, access date, source field names, data format, extraction method, geographic naming rules, and validation owner. Preserve the source identifier so updates can be matched without guessing from names.

## Current portal fields

The actual-work CSV import template maps columns to `Work` fields: `name`, `description`, `category`, `subCategory`, `state`, `district`, `block`, `gramPanchayat`, `lat`, `lng`, `plannedProgress`, `actualProgress`, `status`, `expenditure`, and planned/actual dates. Category values must match the seeded category names, and `subCategory` must be a category sub-category code. CSV imports create new `Proposed` works; they do not advance existing work lifecycle stages.

The separate official-catalogue template is [`backend/templates/official-catalogue-template.csv`](../backend/templates/official-catalogue-template.csv). It requires category/sub-category/work names and codes plus a source title, URL, reference, and access date for each work type; the source publication date is optional. Validate a supplied file with `cd backend` followed by `npm run validate-catalogue -- <path-to-catalogue.csv>`. Validation checks required columns, the four category names, the expected 29/318 counts, duplicate codes/names, URLs, and dates. It is a dry validation command; it does not modify the sample categories, work records, or database. Only after maintainers verify every source, import with `npm run import-catalogue -- <path-to-catalogue.csv> --apply --confirm-source-reviewed`. That importer writes to the separate `PermissibleWork` collection, not the actual-work or sample-category collections, and does not delete prior catalogue rows. A valid format does not prove that source claims are official.

The `GET /api/works/locations` response is derived from location strings already stored on work records. It supports dependent filters but does not establish that an administrative relationship is official or provide boundaries.

## Current geographic choropleth

The GIS page lazily loads a state/UT layer for India and loads the district layer after a state is selected. It supports India → State → District drill-down, metric selection, state/district filtering, category and status filters, inclusive planned-start reporting-period filters, metric tooltips, and source/limitation attribution. The raw source files and reproducible validator/processor are under `data/geo/` and `backend/src/geo/`.

The state layer has 36 polygons. The pinned district GeoJSON has 735 polygons although its metadata reports 736; this unresolved discrepancy is visible in the map attribution and validation output. The LGD homepage displayed a directory total of 784 districts on 2026-10-25, but this is not a polygon count and is not a record-level reconciliation with the geoBoundaries layer. The LGD citizen district-code lookup requires CAPTCHA before returning data; no licensed bulk directory export or boundary file was verified. Do not assign codes or parent relationships by name alone. The districts do not contain parent-state properties, so the processor derives one parent by spatial point-in-polygon against the state layer. State `shapeISO` and district `shapeID` are source identifiers, not LGD codes. Work metrics currently join by normalized state/district names because no verified LGD-code mapping is available in the source files.

All areas without matching work records are labeled “No work records yet / not reported,” not zero. Admins and officers can now submit an explicit manual zero-work report for a selected district and exact inclusive reporting date range. Submission is refused when work records with planned start dates in that district and range already exist. Reports are immutable, attributed to the submitting user and unique per state/district/date range; there is no edit/delete endpoint. A confirmed zero appears only when the dashboard period matches both report dates exactly and the view is not narrowed by category, status, delay, text search, block or GP filters. A single district report does not mark its state as zero. This is a user-entered report, not an authoritative government coverage feed. An unavailable dashboard summary is not colored as zero. LGD's directory counts describe administrative units, not work-reporting coverage.

Block and Gram Panchayat geometry is blocked pending verified data. The [`backend/src/geo/README.md`](../backend/src/geo/README.md) documents the LGD-code and parent-code GeoJSON contract and validation/processing commands. The API-derived block/GP lists remain names stored with work records and are not geographic boundaries.

The portal's current district performance list reports average actual progress for matching work records. Completion rate is completed works divided by all work records matching the selected filters, expressed as a percentage. The current lifecycle schema has no cancelled stage. Missing progress remains unavailable rather than being treated as zero. Delay is a separate review rule: actual progress less than planned progress. A future delay choropleth can use delay rate (delayed matching works divided by all matching works), separately from completion rate.
