# Data entry guide

## Work CSV columns

Use the exact header row below. Header matching is case-insensitive; do not add duplicate headers.

```text
name,description,category,subCategory,state,district,block,gramPanchayat,lat,lng,plannedProgress,actualProgress,status,expenditure,plannedStartDate,plannedEndDate,actualStartDate,actualEndDate
```

| Column | Guidance |
|---|---|
| `name` | Required, up to 200 characters. |
| `description` | Optional short description. |
| `category` | Must match a category returned by the API, e.g. `Water Security`. Current categories are demonstration values, not the verified official catalogue. |
| `subCategory` | Use a sub-category code belonging to that category, e.g. `WAT-01`; do not invent an official code. |
| `state`, `district` | Enter the displayed boundary names exactly (including spelling and punctuation) for map joins. These are name-based matches, not LGD-code-certified joins. If a district does not match the layer, its work may not join to the choropleth. |
| `block`, `gramPanchayat` | Required text on a work record, but no verified block/GP boundary dataset is available. Names do not prove an official parent relationship. |
| `lat`, `lng` | Decimal WGS84 coordinates; latitude from -90 to 90 and longitude from -180 to 180. Enter the work site's measured coordinate in latitude/longitude order in the columns shown. |
| `plannedProgress`, `actualProgress` | Numeric percentages from 0 to 100. Delay review is triggered when actual is below planned. |
| `status` | One of `Proposed`, `Approved`, `Started`, `Completed`. CSV-created works must use `Proposed` as their initial status. |
| `expenditure` | Non-negative numeric amount; use the project's reporting currency consistently. |
| `plannedStartDate`, `plannedEndDate` | Required date values in an accepted CSV date format; prefer ISO `YYYY-MM-DD`. |
| `actualStartDate`, `actualEndDate` | Optional actual dates in ISO `YYYY-MM-DD` format. |

Import validates the file before inserting. Export the current filtered report from the portal. Keep a copy of the source report and record its publisher, period, access date and import operator separately; no government feed is currently integrated.

## Boundaries and missing data

The map contains third-party state/district boundaries, not official government-verified geometry. There are 36 state/UT polygons and 735 district polygons; the source metadata reports 736 and the LGD portal shows 784. Do not manufacture a district, state relationship, LGD code, block or GP. The choropleth uses state/district names because no verified LGD code mapping is available. No data means no record/report has been entered; it does not mean zero works.

## Sample

The [CSV template](samples/work-import-template.csv) has the exact columns and one clearly synthetic example row. Replace all sample values with verified project data before import.
