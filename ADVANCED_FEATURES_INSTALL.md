# VB-G RAM G advanced features patch

This is an incremental patch intended for the latest project with Operations Hub and Enhanced monitoring already installed. Back up the project before extracting.

Included:
- Analytics: district counts, completion, overdue and budget/spending totals from existing work records.
- Notifications: 15-second refresh while Live alerts tab is open (polling, NOT Socket.IO/WebSockets).
- Audit: successful authenticated API write actions recorded with actor, path, method and time; no request bodies or passwords; no before/after diffs.
- Public transparency: opt-in publishing of NON-DEMO works, public read-only endpoint GET /api/public/works; no citizen grievance submission in this patch.
- Offline field notes: localStorage text drafts and explicit manual upload to the existing inspection API as "Needs rework"; NOT service-worker offline caching or automatic background sync. Do not save sensitive notes on shared devices.

Installation (ROOT):
Expand-Archive -LiteralPath "$HOME\Downloads\VB_GRAM_G_FIVE_FEATURES_PATCH.zip" -DestinationPath "." -Force

BACKEND: npm install ; npm test ; npm run dev
FRONTEND: npm install ; npm run build ; npm run dev

In Operations Hub, open Advanced features. Only admin sees audit and can publish real works. Offline drafts require admin/officer role.

Limitations: No WebSocket transport, no automatic offline sync, no public grievance submission, no new PDF rendering engine. Print/Save PDF uses browser print. Production authorization and privacy review still required. The audit logger is best-effort and should not be treated as a tamper-proof ledger.
