# Payment Tracking, W-9 Verification, 1099 Report & Pagination

## Phase 1: Foundation
- [x] DB Migration (050) — w9_verified_at/by on musicians, paid_by on payments, indexes
- [x] Types update — match TypeScript to new schema
- [x] Uncomment Payments in sidebar

## Phase 2: W-9 Admin Verification
- [x] Musician form dialog — "Mark as Reviewed" button + verified badge
- [x] Musicians list — update W-9 badge to show verified/on-file/missing states

## Phase 3: Payment Enhancements
- [x] Show payment method/date/reference in payments table when paid
- [x] Dashboard prompt — alert for past-date projects with unpaid musicians
- [x] URL param support on payments page for pre-filtering from dashboard
- [x] Link project names in payments table to project detail

## Phase 4: 1099 Report
- [x] New page at /dashboard/payments/1099
- [x] Year selector, per-musician totals, W-9/address status, configurable threshold (default $600)
- [x] Export to Excel for 1099 filing
- [x] 1099 Report button added to payments page header

## Phase 5: Pagination
- [x] Payments list — 50 per page with page controls
- [ ] Musicians list — skipped (grouped-by-instrument view makes pagination awkward; rosters are typically < 200)

## Remaining: Run migration on Supabase
- [ ] Run migration 050 on Supabase database
