# Project Booking Pipeline — Client & Payment Fields

## Phase 1: Foundation
- [x] DB Migration — add client_name, client_email, client_phone, event_type, contract_amount, deposit_amount, deposit_paid_at, payment_status, payment_notes to projects
- [x] Update database.ts types
- [x] Update project validation schema

## Phase 2: Project Form
- [x] Add "Client & Booking" collapsible section to project form dialog
- [x] Fields: client name, email, phone, event type, contract amount, deposit, payment status, notes
- [x] Lock icon "Team only" on all new fields

## Phase 3: Project Summary Table View
- [x] Add table/list toggle on projects page
- [x] Table shows: Date, Event Type, Client, Ensemble, Venue, Time, Musicians, Payment Status, Notes
- [x] Click row to jump to list view with that project expanded

## Phase 4: Verify musician isolation
- [x] Confirm new fields never appear in musician portal queries or components
