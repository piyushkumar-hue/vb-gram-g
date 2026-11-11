# India administrative boundary data provenance

Access date for the research and pinned downloads below: **2026-10-25**.

## Selected third-party boundary data

| Layer | Publisher / upstream source | Version and represented date | Licence | Coverage and CRS | Limitations |
|---|---|---|---|---|---|
| ADM1 states and union territories | geoBoundaries `gbOpen`; its India metadata attributes the layer to the DataMeet India community and Election Commission of India | geoBoundaries commit `9469f09`, built 2023-12-12; metadata says boundary year 2011 and source data update 2023-01-19 | Creative Commons Attribution 2.5 India (CC BY 2.5 IN), as stated in geoBoundaries metadata | 36 state/UT features; CRS84 (WGS84 longitude/latitude) | Third-party redistributed, not government-verified; source year label is older than the build date; generalized geometry and disputed/changed boundaries may not match current administrative/legal limits. `shapeISO` is an ISO-style code, not an LGD code. |
| ADM2 districts | geoBoundaries `gbOpen`; its India metadata identifies Pathways Data Pvt. Ltd. and `lgdirectory.gov.in` as source references | geoBoundaries commit `9469f09`, built 2023-12-12; metadata says boundary year 2021 and source data update 2023-01-19 | Open Data Commons Open Database License 1.0 (ODbL 1.0), as stated in geoBoundaries metadata | 735 features in the pinned GeoJSON; CRS84 (WGS84 longitude/latitude) | The geoBoundaries API advertises 736 units, but the pinned GeoJSON has 735. The source file contains district `shapeID`s, not LGD district codes or parent-state attributes. Parent states in the processed layer are derived by assigning a regular spatial sample grid to each district, counting points covered by each ADM1 polygon, and requiring a strict majority among points that match exactly one state. This is not an authoritative relationship table; the match can be affected by source geometry differences and sampling resolution. Generalized geometry may be outdated or disputed. |

Metadata records:

- ADM1 API: <https://www.geoboundaries.org/api/current/gbOpen/IND/ADM1/>
- ADM2 API: <https://www.geoboundaries.org/api/current/gbOpen/IND/ADM2/>
- Pinned ADM1 GeoJSON: <https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/IND/ADM1/geoBoundaries-IND-ADM1.geojson>
- Pinned ADM2 GeoJSON: <https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/IND/ADM2/geoBoundaries-IND-ADM2.geojson>

The output keeps the source names in `sourceName` and removes only Unicode diacritics for the display/join key. State `code` values are the source's `shapeISO`; district `code` values are the source's `shapeID`. These are not presented as LGD codes.

## Original downloads and checksums

Original pinned GeoJSON files are kept unchanged under `data/geo/raw/`.

| File | Bytes | SHA-256 |
|---|---:|---|
| `geoBoundaries-IND-ADM1.geojson` | 46,170,854 | `47AA0ACB6F69868DAEE49143276F3CE323F18905BA7D38D0A86816B405028736` |
| `geoBoundaries-IND-ADM2.geojson` | 48,317,735 | `8BEF6929FD65432E7DC775E7C44473E84EFFF064EBDDBFD6B834E6291546DB40` |

The ADM2 count discrepancy is recorded rather than silently reconciled: the pinned source file is the basis for the delivered district features (735), while the geoBoundaries API metadata says 736. `npm run validate-geo` reports this mismatch. Do not use the layer to claim all 736 metadata-listed districts are represented.

## Official-source research

| Candidate | Publisher | URL | Result on 2026-10-25 | Licence / coverage evidence |
|---|---|---|---|---|
| Local Government Directory (LGD) | Ministry of Panchayati Raj / NIC | <https://lgdirectory.gov.in/>; district-code lookup: <https://lgdirectory.gov.in/globalviewdistrictforcitizen.do> | Official portal reachable on 2026-10-25. The homepage displayed 36 States/UTs (28 states, 8 UTs), 784 districts and 7,327 development blocks. The district-code page exposes a state selector and requires CAPTCHA before its “Get Data” action. No downloadable WGS84 district/block/GP boundary file, bulk directory export, or machine-readable public boundary schema was verified. | The homepage labels LGD codes as the directory's unique codes, but the displayed 784 is a directory count, not a polygon count or a match to the pinned 735-feature district layer. No crosswalk was retrieved; names must not be used to infer LGD codes or parent relationships. The site states its contents are owned, updated and managed by Panchayats and State Panchayati Raj Departments, but no applicable open-data licence for bulk reuse was verified. |
| Survey of India Open Series Maps | Survey of India | <https://surveyofindia.gov.in/pages/open-series-maps> | The checked page returned “Page not found”; no usable boundary download or licence could be verified. | Not established. |
| Open Government Data Platform India | Government of India | <https://www.data.gov.in/> | The site/search requests used for this check returned HTTP 403 from this environment. | No matching dataset, licence, or coverage was verified. |
| NREGA portal | Ministry of Rural Development / NIC | <https://nrega.dord.gov.in/> | Portal home page reachable, but no official 4-category / 29-sub-category / 318-work catalogue matching this project's requested structure was found in the reviewed material. | No applicable catalogue file or licence verified. |

The selected map layers are therefore third-party open data. They are not labelled government-verified. LGD state/district codes are not present in the downloaded boundary files. Existing work records continue to join by normalized state/district names; optional code fields have been added for future verified LGD-code imports without rewriting existing work records.

The LGD homepage's 784-district directory total was observed on 2026-10-25. It does not resolve the geoBoundaries API/file difference (736 advertised versus 735 features): the counts come from different products and no record-level reconciliation was obtained. The citizen-facing district-code lookup has a CAPTCHA gate, and the reviewed portal exposed no licensed bulk export or boundary download. No LGD codes have been assigned to boundary or work records.

## Geographic levels and import readiness

- **State / UT:** 36 polygons in the selected ADM1 layer.
- **District:** 735 polygons in the pinned ADM2 file; metadata discrepancy of one unit remains unresolved.
- **Block:** no verified WGS84 boundary dataset loaded.
- **Gram Panchayat:** no verified WGS84 boundary dataset loaded.
- **LGD directory codes:** an official directory lookup exists, but no complete, reusable code-and-parent export was retrieved. The 784 count displayed by LGD cannot be substituted for geometry or joined to the 735 third-party features by name alone.
- **Reporting coverage:** no authoritative area-by-period feed indicating whether a district reported (including an explicit report of zero works) was found or integrated. Areas without matching portal work records remain “No work records yet / not reported”; none are represented as confirmed zero-work reports.

The `AdministrativeArea` model supports the state → district → block → Gram Panchayat parent chain and source-code schemes. The optional-level processing interface requires explicit LGD codes, a parent-code link, WGS84 Polygon/MultiPolygon geometry, and a supplied parent layer. This lets future block/GP files be checked without inventing or approximating their geography. No block/GP polygons are bundled.

## Processing and integrity checks

1. `npm run validate-geo` checks the pinned source feature counts (36 and 735), CRS, source names/IDs, coordinate bounds, closed polygon rings, duplicate IDs/features, and structural validity. It also runs Mapshaper 0.7.98's `-clean -verbose -info` audit against each original raw layer in memory, rejecting skipped defective rings, non-polygon output, or changed feature counts. On the pinned ADM2 file, Mapshaper reports 2 multi-feature interior gaps and removes 16 of 17 slivers during its in-memory cleanup pass; these findings are warnings for review, not changes applied to the source or proof of incorrect legal boundaries. The ADM1 audit reports no cleanup findings. The command also reports the 736-vs-735 metadata mismatch. This topology audit is not a certification of boundary accuracy or of the absence of every possible geometry defect.
2. `npm run process-geo` derives district parent state from a point-in-polygon sample grid (strict majority required), simplifies the data with Mapshaper while retaining shapes, validates resulting topology and WGS84 coordinate ranges, and writes the lazy-loaded files to `frontend/public/data/geo/`.
3. For a future block or GP file, use the normalized contract and processing command documented in `backend/src/geo/README.md`. Its source code and parent code must be verified LGD identifiers; an unparented or ambiguous feature is rejected.

No actual work records are added, modified, or deleted by these data pipeline commands.
