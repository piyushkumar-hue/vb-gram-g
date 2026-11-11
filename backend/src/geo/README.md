# Geographic boundary pipeline

## Pinned India state and district layers

The selected geoBoundaries files, source terms, checksums, count discrepancy, and known limitations are recorded in [`../../../data/geo/PROVENANCE.md`](../../../data/geo/PROVENANCE.md). These layers are third-party redistributed data and are not government-verified.

From `backend/`:

```powershell
npm run validate-geo
npm run process-geo
```

The processing command writes compact GeoJSON to `frontend/public/data/geo/states.geojson` and `frontend/public/data/geo/districts.geojson`. The React component fetches the state file only after the geography view is opened. It fetches the district file only after a state is selected. Neither file is imported into the JavaScript bundle.

The raw ADM2 layer has no parent-state properties, so the processor samples a regular grid (at most 0.05 degrees) inside each district and uses `@turf/boolean-point-in-polygon` to match sample points to ADM1 polygons. It requires a strict majority among points matched to exactly one state and rejects orphans/ambiguous overlays. The output records the matched-point ratio and method. This is a derived spatial relationship, not an official relationship/code table; mismatched components or a low match ratio remain limitations. State and district features carry geoBoundaries identifiers; they do not carry LGD codes.

`validate-geo` checks source CRS, WGS84 coordinate ranges, closed polygon rings, feature names and identifiers, duplicate identifiers/features, and pinned file counts. It also runs Mapshaper 0.7.98's `-clean -verbose -info` on each raw source in memory. It fails if Mapshaper skips a defective ring, fails to retain the expected feature count, or no longer identifies a polygon layer. Cleanup findings are reported as warnings; the audit does not write over or repair the preserved source files. The pinned ADM2 source currently reports 2 multi-feature interior gaps and 16 of 17 slivers removable at a 220m threshold. These are source-topology findings for review, not automatic boundary corrections or proof of legal boundary errors. Processed web layers still receive explicit polygon topology and WGS84 coordinate validation. The API's ADM2 metadata count of 736 differs from the pinned GeoJSON count of 735 and is reported every time; the missing unit has not been identified or fabricated.

## Block and Gram Panchayat boundary import contract

No verified block/Gram Panchayat boundary source is bundled. A future source file must first be checked for source, licence, date/version, CRS, and nationwide/declared coverage. Convert it to GeoJSON and normalize it as follows:

- FeatureCollection CRS84/WGS84; Polygon or MultiPolygon features.
- `properties.level`: `block` or `gramPanchayat`.
- `properties.name`: source name, preserved.
- `properties.code`: official LGD code.
- `properties.codeScheme`: `LGD`.
- `properties.parentCode`: official LGD code of the district (for blocks) or block (for Gram Panchayats).
- `properties.parentCodeScheme`: `LGD`.

Supply the verified parent GeoJSON as the second file. It must use `properties.code` and `properties.codeScheme: "LGD"` for every parent feature. Then run:

```powershell
npm run process-geo-level -- block <blocks.geojson> <districts-with-lgd-codes.geojson> <output-blocks.geojson>
npm run process-geo-level -- gramPanchayat <gram-panchayats.geojson> <blocks.geojson> <output-gram-panchayats.geojson>
```

The command validates parent references, duplicate codes/geometries, WGS84 coordinate ranges, polygon rings and topology before simplifying and writing the output. It refuses unknown parent codes. Do not add an output layer to the portal until its source provenance and licence are documented.

The `AdministrativeArea` Mongoose model supports the `state → district → block → gramPanchayat` chain, source code schemes and source attribution. Its optional code fields on existing `Work.location` documents are schema-only additions; no existing work record is migrated or rewritten.

## Metric meanings and missing coverage

- Completion rate: completed matching works ÷ all matching works × 100.
- Delay rate: works with actual progress below planned progress ÷ all matching works × 100.
- Ongoing: Approved plus Started works.
- Expenditure: sum of stored expenditure for matching works.
- Reporting-period filter: planned start date within the inclusive selected date range.

An area with works is colored by the selected metric. An area with no matching work records is labeled “No work records yet / not reported”; it is not treated as a confirmed zero-work report. A separate zero-report color is reserved for explicit area-reporting coverage, which the current system does not collect. When summary data is unavailable, the map shows an unavailable state rather than interpreting the failure as zero.

## Catalogue status

No authoritative government file matching the requested four categories, 29 sub-categories and 318 permissible works was found in the reviewed project/portal sources. Catalogue status is **BLOCKED** pending a verified official source. The existing importer has not been run against invented or unverified catalogue rows.
