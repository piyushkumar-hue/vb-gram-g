# VB-G RAM-G upgrade notes

This archive preserves the existing Phase 1 portal and adds an Operations Hub.

## Added
- Officer assignment creation and status tracking, with in-app notifications.
- Citizen grievance submission and officer/admin status management.
- Notification inbox and read/unread handling.
- Work evidence link register (HTTPS URL + caption + stage + uploader + timestamp).
- Approved budget and released amount fields, plus financial update API.
- CSV work report and browser Print / Save PDF action.
- Rule-based risk flags for overdue and progress-gap work.
- Responsive Operations Hub layouts.

## Important implementation boundaries
- Evidence currently stores HTTPS links and metadata; it does not upload/store image files.
- Risk insights are deterministic rules, not a trained AI/ML model or a verified forecast.
- Browser Print / Save PDF uses the browser's print dialog; choose "Save as PDF".
- The citizen grievance module is available to authenticated portal accounts. A public anonymous portal is not included.
- Mobile layout is responsive web UI; native mobile/offline synchronization is not included.

## Run
Backend:
```bash
cd backend
npm ci
# copy .env.example to .env and configure MongoDB/JWT/client origin
npm run dev
```

Frontend, in another terminal:
```bash
cd frontend
npm ci
# configure VITE_API_BASE_URL if the API is on another origin
npm run dev
```

No database reset is needed. New Work fields `budget` and `amountReleased` default to zero on existing records.

## Verification
All backend JavaScript files passed `node --check`. Full backend tests and frontend production build could not be completed in this environment because dependency installation timed out and the required packages were not fully available. Run `npm ci && npm test` in `backend` and `npm ci && npm run build && npm run lint` in `frontend` on your machine before deployment.
