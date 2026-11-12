# VB-G RAM G: four-phase integration patch

Source: VB-G-RAM-G-upgraded.zip. Extract this patch over your project ROOT, keeping folder structure. Back up your existing project first.

## Phase 1
Operations Hub > Enhanced monitoring: authenticated JPEG/PNG/WebP evidence upload (2 MB max) with coordinates and capture timestamp; inspection checklists and separately stored verified progress. Uploaded bytes are stored in MongoDB; for production scale migrate to private object storage and signed URLs. Browser GPS requires user permission and is NOT tamper-proof evidence.

## Phase 2
Per-work append-only expenditure entries, totals and budget utilization. Existing work.expenditure is not automatically replaced. The risk panel flags any discrepancy between legacy work.expenditure and the new ledger.

## Phase 3
Per-work milestones, due dates, status changes and explainable risk scoring. Existing Operations Hub notifications continue working; scheduled automatic reminders are NOT implemented by this patch.

## Phase 4
Role-protected writes and reads, validation and size limits, health endpoint retained, manual JSON database backup command added. This is NOT a complete production-security or deployment certification. Encrypt backups, keep them private and implement retention, restore tests, operational alerting and security review before public deployment.

## Install and run (PowerShell)
ROOT: `cd "C:\\Users\\piyus\\Downloads\\vb-gram-g-main (2)\\vb-gram-g-main"`
ROOT: Extract ZIP with `Expand-Archive -LiteralPath "C:\\path\\to\\VB_GRAM_G_FOUR_PHASE_PATCH.zip" -DestinationPath . -Force`
BACKEND: `cd backend; npm install; npm test; npm run dev`
FRONTEND (new terminal, from ROOT): `cd frontend; npm install; npm run build; npm run dev`

Login as admin/officer to create records; viewers can inspect records. In Operations Hub select 'Enhanced monitoring', then a work. Demo data is not modified by installing the patch. No migration is required for new MongoDB collections.

## Backup
BACKEND: `$env:BACKUP_DIRECTORY = "C:\\private-vbgramg-backups"; npm run backup`
This is a JSON snapshot for small databases, not a substitute for a transactional database backup. It contains private records and is not encrypted. Do not commit it.
