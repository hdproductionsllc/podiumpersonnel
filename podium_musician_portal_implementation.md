# Podium Personnel: Musician Portal Implementation Guide

## Strategic Overview

### Product Philosophy

**One Platform, Tiered Features** - Not two separate products.

The musicians are the same people. A violinist in a wedding quartet might also sub with the regional symphony. One login, one profile, works across all organizations.

**Tier Structure:**

| | **Ensemble** | **Orchestra** | **Symphony** |
|---|---|---|---|
| **Target** | String quartets, jazz combos, chamber groups | Regional orchestras, community symphonies | Major metros, opera, ballet |
| **Roster Size** | Up to 30 | Up to 150 | Unlimited |
| **Price** | $29/mo | $99/mo | $249/mo |

The musician portal is identical for all tiers. Organizations unlock admin-side complexity as they upgrade.

### Design Principles

1. **Mobile-first**: Every decision starts with "how does this work on a phone?"
2. **Contractor-focused**: No assumption of W-2 employment or complex HR
3. **Speed**: Target <2s load times, aggressive caching, skeleton loaders
4. **Simplicity**: Zero learning curve - if they can use Instagram, they can use this
5. **Cross-org**: One login shows gigs from ALL organizations they work with

---

# PART 1: MUSICIAN PORTAL (Musician-Facing)

## Database Schema Additions

```sql
-- =====================================================
-- MUSICIAN PORTAL DATABASE SCHEMA
-- =====================================================

-- 1. Add columns to existing musicians table
ALTER TABLE musicians ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE musicians ADD COLUMN IF NOT EXISTS portal_invite_token TEXT;
ALTER TABLE musicians ADD COLUMN IF NOT EXISTS portal_invite_sent_at TIMESTAMPTZ;
ALTER TABLE musicians ADD COLUMN IF NOT EXISTS portal_invite_expires_at TIMESTAMPTZ;
ALTER TABLE musicians ADD COLUMN IF NOT EXISTS portal_last_login TIMESTAMPTZ;
ALTER TABLE musicians ADD COLUMN IF NOT EXISTS portal_enabled BOOLEAN DEFAULT true;
ALTER TABLE musicians ADD COLUMN IF NOT EXISTS availability_public BOOLEAN DEFAULT false;
ALTER TABLE musicians ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;

-- Create index for user lookups
CREATE INDEX IF NOT EXISTS idx_musicians_user_id ON musicians(user_id);
CREATE INDEX IF NOT EXISTS idx_musicians_portal_invite_token ON musicians(portal_invite_token);

-- 2. Musician Availability table
CREATE TABLE IF NOT EXISTS musician_availability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    musician_id UUID NOT NULL REFERENCES musicians(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    availability_type TEXT NOT NULL CHECK (availability_type IN ('unavailable', 'tentative', 'preferred')),
    notes TEXT,
    is_recurring BOOLEAN DEFAULT false,
    recurrence_rule TEXT, -- iCal RRULE format
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_musician_availability_musician ON musician_availability(musician_id);
CREATE INDEX IF NOT EXISTS idx_musician_availability_dates ON musician_availability(start_date, end_date);

-- 3. Musician Documents table
CREATE TABLE IF NOT EXISTS musician_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    musician_id UUID NOT NULL REFERENCES musicians(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL, -- NULL means personal doc
    document_type TEXT NOT NULL CHECK (document_type IN ('w9', 'headshot', 'resume', 'contract', 'id', 'other')),
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_size_bytes INTEGER,
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    verified_at TIMESTAMPTZ,
    verified_by UUID REFERENCES auth.users(id),
    expires_at TIMESTAMPTZ, -- For documents that expire
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_musician_documents_musician ON musician_documents(musician_id);

-- 4. Musician Notification Preferences table
CREATE TABLE IF NOT EXISTS musician_notification_preferences (
    musician_id UUID PRIMARY KEY REFERENCES musicians(id) ON DELETE CASCADE,
    email_new_offers BOOLEAN DEFAULT true,
    email_offer_reminders BOOLEAN DEFAULT true,
    email_schedule_changes BOOLEAN DEFAULT true,
    email_payment_updates BOOLEAN DEFAULT true,
    email_weekly_summary BOOLEAN DEFAULT false,
    push_enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Musician Calendar Tokens (for iCal feed authentication)
CREATE TABLE IF NOT EXISTS musician_calendar_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    musician_id UUID NOT NULL REFERENCES musicians(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_accessed_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_musician_calendar_tokens_token ON musician_calendar_tokens(token);

-- 6. Musician Login History (for security)
CREATE TABLE IF NOT EXISTS musician_login_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    musician_id UUID NOT NULL REFERENCES musicians(id) ON DELETE CASCADE,
    logged_in_at TIMESTAMPTZ DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT,
    login_method TEXT CHECK (login_method IN ('password', 'google', 'magic_link'))
);

CREATE INDEX IF NOT EXISTS idx_musician_login_history_musician ON musician_login_history(musician_id);

-- =====================================================
-- ROW LEVEL SECURITY POLICIES
-- =====================================================

-- Musicians can only access their own data
ALTER TABLE musician_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE musician_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE musician_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE musician_calendar_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: Musicians see their own availability
CREATE POLICY musician_availability_own ON musician_availability
    FOR ALL USING (
        musician_id IN (
            SELECT id FROM musicians WHERE user_id = auth.uid()
        )
    );

-- Policy: Org admins can see availability for musicians in their org (if public)
CREATE POLICY musician_availability_org ON musician_availability
    FOR SELECT USING (
        musician_id IN (
            SELECT m.id FROM musicians m
            JOIN organization_members om ON om.organization_id = m.organization_id
            WHERE om.user_id = auth.uid()
            AND m.availability_public = true
        )
    );

-- Policy: Musicians see their own documents
CREATE POLICY musician_documents_own ON musician_documents
    FOR ALL USING (
        musician_id IN (
            SELECT id FROM musicians WHERE user_id = auth.uid()
        )
    );

-- Policy: Musicians see their own notification preferences
CREATE POLICY musician_notifications_own ON musician_notification_preferences
    FOR ALL USING (
        musician_id IN (
            SELECT id FROM musicians WHERE user_id = auth.uid()
        )
    );

-- Policy: Musicians see their own calendar tokens
CREATE POLICY musician_calendar_tokens_own ON musician_calendar_tokens
    FOR ALL USING (
        musician_id IN (
            SELECT id FROM musicians WHERE user_id = auth.uid()
        )
    );
```

---

## Authentication System

### Authentication Flow

```
TASK: Musician Portal Authentication
=====================================

TWO ENTRY POINTS:

1. INVITED BY ORGANIZATION (Primary Flow):
   - Admin adds musician to roster with email
   - System generates portal_invite_token (crypto random, 32 chars)
   - System sets portal_invite_expires_at (7 days from now)
   - Musician receives email: "You've been added to [Org Name]'s roster"
   - Email contains link: /musician/activate/[token]
   - Activation page checks:
     a. Token is valid and not expired
     b. If musician email matches existing Podium account:
        - Show: "Sign in to connect this organization to your account"
        - After sign in, link musician record to user_id
     c. If no existing account:
        - Show signup form (name pre-filled from musician record)
        - Email pre-filled and readonly
        - Just need to set password
        - Create auth.users record
        - Link musician.user_id to new user
   - After activation:
     - Invalidate token (set to NULL)
     - Set portal_last_login
     - Redirect to dashboard

2. RECEIVED CONTRACT OFFER (Secondary Flow):
   - Musician receives contract offer via /gig/[token]
   - They accept or decline (existing flow works)
   - After action, show prompt: "Create a free account to manage all your gigs"
   - Link to /musician/register?email=[their-email]
   - If they sign up, find musician record by email, link user_id

LOGIN PAGE (/musician/login):
   - Clean, centered card design
   - Email input
   - Password input with show/hide toggle
   - "Remember me" checkbox (30-day session)
   - "Sign in" button
   - Divider: "or"
   - "Continue with Google" button (OAuth)
   - Link: "Forgot password?"
   - Link: "Don't have an account? Sign up"
   - NO mention of organization admin features

REGISTRATION PAGE (/musician/register):
   - First name, Last name
   - Email (may be pre-filled from query param)
   - Password (min 8 chars, show strength meter)
   - Confirm password
   - Checkbox: "I agree to Terms of Service and Privacy Policy"
   - "Create Account" button
   - Link: "Already have an account? Sign in"
   - After registration:
     - Check if any musician records match this email
     - If yes, link them to new user_id
     - Send verification email
     - Redirect to dashboard (can use while unverified, but show banner)

FORGOT PASSWORD (/musician/forgot-password):
   - Email input
   - "Send Reset Link" button
   - Success: "If an account exists, we've sent a reset link"
   - Rate limit: 3 requests per hour per email

RESET PASSWORD (/musician/reset-password/[token]):
   - New password input
   - Confirm password input
   - "Reset Password" button
   - Token expires after 1 hour
   - After reset, invalidate all existing sessions

GOOGLE OAUTH EDGE CASES:
   - If user tries password login but only has Google:
     "This account uses Google Sign-In. Please sign in with Google."
   - Allow users to ADD password to Google account from settings
   - If Google account has issues, show help text + support contact

SESSION MANAGEMENT:
   - Without "Remember me": 24-hour session
   - With "Remember me": 30-day refresh token
   - Automatic logout on password change
   - Store sessions in Supabase auth (built-in)
```

### File: /app/musician/login/page.tsx

```tsx
// Key implementation notes:

// 1. Use Supabase Auth UI or custom form
// 2. Mobile-first layout - centered card, large touch targets
// 3. Handle loading states with button spinner
// 4. Show inline errors, not alerts
// 5. Redirect to /musician after successful login
// 6. Check for ?redirect= param to return user to original destination

// Example structure:
export default function MusicianLoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Logo />
          <h1 className="text-2xl font-semibold mt-4">Musician Portal</h1>
          <p className="text-gray-600 mt-2">Sign in to manage your gigs</p>
        </div>
        
        <Card>
          <LoginForm />
          <Divider text="or" />
          <GoogleSignInButton />
        </Card>
        
        <p className="text-center mt-6 text-sm text-gray-600">
          Don't have an account?{" "}
          <Link href="/musician/register" className="text-primary font-medium">
            Sign up free
          </Link>
        </p>
      </div>
    </div>
  );
}
```

---

## Musician Portal Pages

### Dashboard (Home)

```
TASK: Musician Portal - Dashboard
==================================
Route: /musician (redirects to /musician/dashboard) or just /musician as home

MOBILE-FIRST REQUIREMENTS:
- Works perfectly on 375px width (iPhone SE)
- All tap targets minimum 44px
- No horizontal scrolling
- Pull-to-refresh on mobile
- Target: <2s initial load, <500ms subsequent

LAYOUT:

┌─────────────────────────────────┐
│ [Logo]              🔔  [Avatar]│  <- Sticky header
├─────────────────────────────────┤
│                                 │
│  Hi, Sarah! 👋                  │
│                                 │
│  ┌─────────────────────────────┐│
│  │ ⚡ ACTION REQUIRED          ││
│  │                             ││
│  │ ┌─────────────────────────┐ ││
│  │ │ Subito Strings          │ ││
│  │ │ Johnson Wedding         │ ││
│  │ │ Feb 15, 2026            │ ││
│  │ │ $400                    │ ││
│  │ │ [View Offer]            │ ││
│  │ └─────────────────────────┘ ││
│  └─────────────────────────────┘│
│                                 │
│  UPCOMING                       │
│                                 │
│  ┌─────────────────────────────┐│
│  │ SAT                         ││
│  │ FEB 8    Smith Anniversary  ││
│  │          6:00 PM - 9:00 PM  ││
│  │          The Ritz-Carlton   ││
│  │          Violin 1           ││
│  │          [+ Cal]            ││
│  └─────────────────────────────┘│
│                                 │
│  ┌─────────────────────────────┐│
│  │ SAT                         ││
│  │ FEB 15   Johnson Wedding    ││
│  │          ...                ││
│  └─────────────────────────────┘│
│                                 │
│  [Load More]                    │
│                                 │
├─────────────────────────────────┤
│  🏠    📅    📩    👤          │  <- Bottom nav (mobile)
│  Home  Schedule Offers Profile │
└─────────────────────────────────┘

HEADER COMPONENT:
- Logo (tap = home)
- Notification bell with unread badge
- Avatar (tap = profile)
- On desktop: also show name "Hi, Sarah"

ACTION REQUIRED SECTION:
- Only shows if pending offers exist
- Yellow/orange accent color for urgency
- Cards show:
  - Organization name + logo
  - Project/event name
  - Date(s)
  - Total pay
  - "View Offer" button
- Sorted by expiration (soonest first)
- Max 3 shown, then "View all offers" link
- If no pending offers: section doesn't render

UPCOMING SERVICES SECTION:
- Header: "Upcoming" with optional filter icon
- Next 30 days by default
- Service cards (see component spec below)
- Group by date if multiple same day
- Lazy load after first 10
- "No upcoming gigs" empty state with friendly illustration

BOTTOM NAVIGATION (Mobile):
- Fixed to bottom
- 4 items: Home, Schedule, Offers, Profile
- Active state with fill color
- Badge on Offers showing pending count

DESKTOP LAYOUT:
- Side navigation rail instead of bottom
- Dashboard content in main area
- Max-width container (1200px)
- Cards in grid layout

DATA FETCHING:
- Single API call: GET /api/musician/dashboard
- Returns: { musician, pendingOffers, upcomingServices, unreadNotifications }
- Cache with SWR or React Query
- Revalidate on focus
```

### Service Card Component

```
TASK: ServiceCard Component
============================
File: /components/musician/ServiceCard.tsx

PROPS:
- service: Service object
- showOrganization: boolean (default true)
- compact: boolean (default false)

DISPLAYS:
- Date: Large format "SAT FEB 8" or "Saturday, February 8"
- Time: "6:00 PM - 9:00 PM"
- Event/Project name
- Organization name (if showOrganization)
- Venue name
- Position/Chair
- "Add to Calendar" button

INTERACTIONS:
- Tap card: Expand to show full details
- Tap venue: Open in Google Maps
- Tap "Add to Calendar": 
  - On mobile: Native share sheet with .ics file
  - On desktop: Download .ics file
- Long press (mobile): Quick actions menu

EXPANDED VIEW (inline or modal):
- Full venue address
- Parking instructions
- Dress code
- Call time vs service time
- Pay amount (if visible)
- Contact person
- "Request Sub" button
- Notes/special instructions

VISUAL STATES:
- Default: White background
- Today: Subtle highlight
- Past: Grayed out (if showing history)
- Conflict: Red border (if availability conflict)

MOBILE OPTIMIZATIONS:
- Swipe actions: Quick "Add to Cal" / "Request Sub"
- Touch feedback on tap
- Smooth expand/collapse animation
```

### Offers Page

```
TASK: Musician Portal - Offers Page
====================================
Route: /musician/offers

TAB NAVIGATION:
- Pending (default) - with count badge
- History

PENDING TAB:
- List of offer cards
- Each card shows:
  - Status badge: "New" (yellow) or "Expires in X days" (red if <2 days)
  - Organization logo + name
  - Project/event name
  - Date range (e.g., "Feb 15 - Feb 16, 2026")
  - Service count (e.g., "2 services")
  - Total pay
  - "View Details" button
- Sorted by: Expiration date (soonest first)
- Empty state: "No pending offers. We'll notify you when you get one!"

OFFER DETAIL VIEW:
Route: /musician/offers/[id] (or modal overlay)

Layout:
┌─────────────────────────────────┐
│ ← Back         Offer Details    │
├─────────────────────────────────┤
│                                 │
│  [Org Logo]                     │
│  Subito Strings                 │
│                                 │
│  Johnson Wedding                │
│  ─────────────────────────────  │
│                                 │
│  📅 SERVICES                    │
│                                 │
│  Saturday, Feb 15               │
│  Ceremony                       │
│  4:00 PM - 5:00 PM              │
│  St. Mary's Chapel              │
│  └─ $150                        │
│                                 │
│  Saturday, Feb 15               │
│  Reception                      │
│  6:00 PM - 9:00 PM              │
│  The Ritz-Carlton               │
│  └─ $250                        │
│                                 │
│  ─────────────────────────────  │
│  💰 TOTAL PAY: $400             │
│  ─────────────────────────────  │
│                                 │
│  📋 MUSICIAN POLICY             │
│  [Expandable section with       │
│   organization's policy text]   │
│                                 │
│  Expires: Feb 10, 2026          │
│                                 │
├─────────────────────────────────┤
│  [    Decline    ] [ Accept ✓ ] │  <- Sticky bottom
└─────────────────────────────────┘

ACCEPT FLOW:
1. Tap "Accept"
2. Confirmation modal: "Accept this offer for $400?"
3. Optional: Notes field ("I'll bring my own stand", etc.)
4. Confirm button
5. Success: 
   - Update offer status to 'accepted'
   - Create/update project_positions
   - Send confirmation email to musician
   - Notify organization admin
   - Show success message
   - Redirect to dashboard or "Add to Calendar" prompt

DECLINE FLOW:
1. Tap "Decline"
2. Modal: "Are you sure you want to decline?"
3. Optional: Reason dropdown (Conflict, Pay, Travel, Personal, Other)
4. Optional: Notes field
5. Decline button
6. Success:
   - Update offer status to 'declined'
   - Store decline reason
   - Notify organization admin
   - Show confirmation
   - Redirect to offers list

HISTORY TAB:
- Shows: Accepted, Declined, Expired offers
- Filter dropdown: All, Accepted, Declined, Expired
- Search by project name
- Sorted by response date (newest first)
- Card shows status badge + date responded
- Tap to view details (read-only)
```

### Schedule Page

```
TASK: Musician Portal - Schedule Page
======================================
Route: /musician/schedule

VIEW TOGGLE:
- List view (default on mobile)
- Month view (calendar grid)
- Toggle button in header

LIST VIEW:
- Grouped by month
- Month headers: "February 2026"
- Days with services listed chronologically
- ServiceCard component for each
- Infinite scroll or "Load more"
- Quick jump: Tap month header to open month picker

MONTH VIEW:
- Standard calendar grid
- Days with services show dot indicator
- Color coding:
  - Blue dot: Confirmed service
  - Yellow dot: Pending offer
  - Red dot: Availability blocked
- Tap day: Show that day's services in bottom sheet
- Swipe left/right: Change months
- Today button: Jump to current month

FILTERS (collapsible):
- Organization: All / [List of connected orgs]
- Date range: Quick picks (This month, Next 30 days, Custom)
- Include past: Toggle

CALENDAR SYNC SECTION:
- Prominent button: "Sync to Your Calendar"
- Tap opens modal:
  
  ┌─────────────────────────────────┐
  │ Sync Your Schedule              │
  ├─────────────────────────────────┤
  │                                 │
  │ Add your Podium schedule to     │
  │ your personal calendar app.     │
  │                                 │
  │ [Copy Calendar URL]             │
  │                                 │
  │ Or choose your app:             │
  │                                 │
  │ [G] Add to Google Calendar      │
  │ [🍎] Add to Apple Calendar      │
  │ [O] Add to Outlook              │
  │                                 │
  │ Your calendar will update       │
  │ automatically when your         │
  │ schedule changes.               │
  │                                 │
  └─────────────────────────────────┘

ICAL IMPLEMENTATION:
- Generate unique token per musician
- URL format: /api/musician/calendar/[token].ics
- Token stored in musician_calendar_tokens table
- Feed includes all confirmed services
- Updates in real-time as services change
- Include: Event name, time, venue address, notes
- VTIMEZONE component for proper timezone handling

EXPORT OPTIONS:
- "Export to PDF" button
- Date range selector
- Generates printable schedule
- Include: All service details, venue addresses
```

### Profile & Settings Page

```
TASK: Musician Portal - Profile Page
=====================================
Route: /musician/profile

LAYOUT: Single scrollable page with collapsible sections
Mobile: Accordion-style sections
Desktop: Two-column layout or tabs

SECTION 1: BASIC INFO
─────────────────────
- Profile photo
  - Current photo or placeholder avatar
  - "Change Photo" button
  - Crop/resize tool
  - Max 5MB, jpg/png
- First Name (required)
- Last Name (required)
- Email (readonly, show "verified" badge)
  - "Change email" link (separate flow with verification)
- Phone Number
  - Format validation
  - "Verify" button sends SMS code
- Secondary Email (optional)
- Save button (per section)

SECTION 2: ADDRESS
──────────────────
- Street Address
- City
- State (dropdown)
- ZIP Code
- Note: "Used for payment mailing and tax documents"
- Save button

SECTION 3: INSTRUMENTS
──────────────────────
- List of instruments with proficiency
- Each row: [Instrument] [Proficiency dropdown] [⭐ Primary] [🗑️]
- Proficiency: Principal, Section, Student
- Primary designation (radio - only one)
- "Add Instrument" button
- Save button

SECTION 4: PAYMENT PREFERENCES
──────────────────────────────
- Preferred Method: Radio buttons
  - ○ Check (mailed to address above)
  - ○ Zelle
  - ○ Direct Deposit
  - ○ PayPal
  - ○ Other (specify)
  
- If Zelle selected:
  - Zelle Email or Phone
  - "Same as profile" checkbox
  - Verified status indicator
  
- If Direct Deposit selected:
  - Bank Name
  - Routing Number (masked after save)
  - Account Number (masked after save)
  - Account Type: Checking / Savings
  - Note: "Encrypted and secure"
  
- If PayPal:
  - PayPal Email
  
- Save button

SECTION 5: TAX DOCUMENTS
────────────────────────
- W-9 Status: 
  - ✅ "On file" (with date)
  - ⚠️ "Not submitted" 
  - ❌ "Expired"
- If not on file: "Upload W-9" button
- If on file: "View" | "Replace" buttons
- "Download blank W-9" link
- Note: "Required before payment can be processed"

SECTION 6: NOTIFICATION PREFERENCES
───────────────────────────────────
- Toggle switches:
  - New gig offers: [ON/OFF]
  - Offer reminders: [ON/OFF]
  - Schedule changes: [ON/OFF]
  - Payment updates: [ON/OFF]
  - Weekly summary: [ON/OFF]
- Save button

SECTION 7: CONNECTED ORGANIZATIONS
──────────────────────────────────
- List of organizations
- Each shows:
  - Org logo + name
  - Your status: Active / Inactive
  - Member since: Date
  - "View Details" → shows your info as they see it
- Cannot disconnect (orgs control membership)
- Note: "Contact the organization to update your status"

SECTION 8: ACCOUNT SECURITY
───────────────────────────
- Change Password
  - Current password
  - New password
  - Confirm new password
  - "Update Password" button
  
- Connected Accounts
  - Google: Connected / "Connect" button
  - "Disconnect" option (only if password is set)
  
- Login History (expandable)
  - Last 10 logins
  - Date, Location (approximate), Device
  
- Danger Zone:
  - "Download My Data" button
  - "Delete Account" button (requires confirmation + password)

AUTOSAVE BEHAVIOR:
- Save per section, not one big form
- Show "Saving..." → "Saved ✓" inline
- Validate on blur
- Prevent navigation if unsaved changes

MOBILE OPTIMIZATIONS:
- Sections as collapsible accordions
- Only one section open at a time
- Sticky save button when section is open
- Large touch targets for toggles
```

### Availability Management Page

```
TASK: Musician Portal - Availability Page
==========================================
Route: /musician/availability

PURPOSE: Proactively tell organizations when you're NOT available

LAYOUT:
┌─────────────────────────────────┐
│ ← Back        My Availability   │
├─────────────────────────────────┤
│                                 │
│ ┌─────────────────────────────┐ │
│ │     < February 2026 >       │ │
│ │ Su Mo Tu We Th Fr Sa        │ │
│ │                    1        │ │
│ │  2  3  4  5  6  7  8        │ │
│ │  9 10 11 12 13 14 15        │ │
│ │ 16 17 18 19 20 [===========]│ │  <- Selected range
│ │ 23 24 25 26 27 28           │ │
│ └─────────────────────────────┘ │
│                                 │
│ [+ Add Unavailability]          │
│                                 │
│ ─────────────────────────────── │
│                                 │
│ MY BLOCKED DATES                │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ 🔴 Feb 20-24, 2026          │ │
│ │    Vacation                 │ │
│ │    [Edit] [Delete]          │ │
│ └─────────────────────────────┘ │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ 🟡 Every Sunday             │ │
│ │    Church gig (recurring)   │ │
│ │    [Edit] [Delete]          │ │
│ └─────────────────────────────┘ │
│                                 │
│ ─────────────────────────────── │
│                                 │
│ 🔒 Privacy Setting              │
│ Share availability with orgs    │
│ [=========○                  ]  │  <- Toggle OFF
│                                 │
│ When ON, organizations can see  │
│ your blocked dates when         │
│ staffing projects.              │
│                                 │
└─────────────────────────────────┘

CALENDAR INTERACTIONS:
- Tap single date: Quick add for that date
- Tap and drag: Select date range
- Long press: Context menu
- Color coding:
  - Red: Unavailable
  - Yellow: Tentative
  - Blue dots: Existing services (read-only)

ADD UNAVAILABILITY MODAL:
┌─────────────────────────────────┐
│ Add Unavailability        [X]   │
├─────────────────────────────────┤
│                                 │
│ Dates                           │
│ Feb 20, 2026 - Feb 24, 2026     │
│ [Change Dates]                  │
│                                 │
│ Type                            │
│ ○ Unavailable (definite no)     │
│ ○ Tentative (maybe available)   │
│                                 │
│ Reason (optional)               │
│ [Vacation___________________]   │
│                                 │
│ □ Recurring                     │
│   [If checked, show:]           │
│   Repeat: [Weekly ▼]            │
│   Until: [No end date ▼]        │
│                                 │
│         [Cancel]  [Save]        │
└─────────────────────────────────┘

CONFLICT DETECTION:
- If marking dates unavailable that have services:
  - Show warning: "You have 2 services on these dates"
  - Options: "Request Subs" / "Save Anyway" / "Cancel"
- If new service is booked on unavailable date:
  - Show warning to org admin during staffing

PRIVACY TOGGLE:
- Default: OFF (private)
- When ON: Organizations see blocked dates
- Organizations see: Date range + type (not your notes)
- Visual indicator on shared entries

RECURRING AVAILABILITY:
- Use iCal RRULE format internally
- UI options: Weekly, Bi-weekly, Monthly, Yearly
- End options: Never, After X occurrences, On date
- Example: "Every Sunday" for church gigs
```

### Substitution Request Page

```
TASK: Musician Portal - Sub Request
====================================
Route: /musician/sub-request (or modal from dashboard/schedule)

FLOW:

STEP 1: SELECT SERVICES
───────────────────────
"Which services do you need a sub for?"

- Show upcoming confirmed services (next 60 days)
- Checkbox for each
- Multi-select allowed
- Show: Date, Event name, Org name
- Services already with pending sub requests: disabled

[Continue →]

STEP 2: PROVIDE DETAILS
───────────────────────
"Tell us more"

Reason (optional):
[Dropdown: Conflict, Illness, Personal, Emergency, Other]

Additional notes (optional):
[Textarea: Any details for the manager...]

[← Back]  [Continue →]

STEP 3: SUGGEST REPLACEMENT (Optional)
──────────────────────────────────────
"Do you have someone in mind?"

○ No, [Org name] will find someone
○ Yes, I can suggest someone

[If yes:]
  Search existing musicians:
  [Search box - searches org's roster]
  
  Or add new contact:
  Name: [____________]
  Email: [____________]
  Phone: [____________]

[← Back]  [Submit Request]

STEP 4: CONFIRMATION
────────────────────
"Request Submitted ✓"

Your sub request for [Event Name] has been sent to [Org Name].

You'll be notified when:
- Your request is approved or denied
- A substitute is confirmed

[View My Requests]  [Back to Dashboard]

MY SUB REQUESTS PAGE:
Route: /musician/sub-requests (or tab on dashboard)

- List of all sub requests
- Status badges: Pending, Approved, Denied, Filled
- Filter by status
- Tap for details:
  - Service details
  - Your reason/notes
  - Current status
  - If filled: Who's covering
  - If denied: Reason (if provided)

INTEGRATION:
- Creates substitution_request record
- Flows into existing admin approval workflow
- Admin notified immediately
- Musician notified on status changes
```

### Payment History Page

```
TASK: Musician Portal - Payments Page
======================================
Route: /musician/payments

LAYOUT:
┌─────────────────────────────────┐
│ ← Back           Payments       │
├─────────────────────────────────┤
│                                 │
│ ┌─────────────────────────────┐ │
│ │ 2026 EARNINGS               │ │
│ │                             │ │
│ │ Total Paid      $4,250.00   │ │
│ │ Pending         $800.00     │ │
│ │ ─────────────────────────── │ │
│ │ YTD Total       $5,050.00   │ │
│ │                             │ │
│ │ [Export for Taxes]          │ │
│ └─────────────────────────────┘ │
│                                 │
│ FILTERS                         │
│ Org: [All ▼]  Status: [All ▼]   │
│ Year: [2026 ▼]                  │
│                                 │
│ ─────────────────────────────── │
│                                 │
│ PAYMENT HISTORY                 │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ ✓ PAID · Feb 5, 2026        │ │
│ │ Smith Wedding Reception     │ │
│ │ Subito Strings              │ │
│ │ $400.00 · Zelle             │ │
│ │ Ref: ZEL-12345              │ │
│ └─────────────────────────────┘ │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ ⏳ PENDING                   │ │
│ │ Corporate Event             │ │
│ │ Subito Strings              │ │
│ │ $350.00                     │ │
│ │ Expected: Feb 15, 2026      │ │
│ └─────────────────────────────┘ │
│                                 │
│ [Load More]                     │
│                                 │
└─────────────────────────────────┘

PAYMENT ENTRY DETAILS:
- Status: Paid ✓, Pending ⏳, Processing 🔄, Unpaid ○
- Date paid (or expected date)
- Amount
- Project/Service name
- Organization name
- Payment method (Zelle, Check, etc.)
- Reference number (if paid)
- Tap to expand: Full breakdown (base pay, leader fee, etc.)

FILTERS:
- Organization: All / [List]
- Status: All / Paid / Pending / Unpaid
- Year: Current year / Previous years

EXPORT FOR TAXES:
- Tap opens modal
- Select year
- Select format: PDF or CSV
- Generates document with:
  - Musician name and address
  - Total earnings by organization
  - List of all payments
  - Suitable for tax records
- Download or email option

ORGANIZATION BREAKDOWN:
- Toggle to view earnings by org
- Shows: Org name, Total paid, Total pending
- Useful for musicians working for multiple groups
```

---

## Navigation & Layout

```
TASK: Musician Portal - Navigation & Layout
============================================

FILE STRUCTURE:
/app/musician/layout.tsx - Main layout wrapper
/components/musician/MusicianNav.tsx - Navigation component

MOBILE NAVIGATION (Bottom Tab Bar):
- Position: Fixed to bottom
- Height: 64px + safe area inset
- Background: White with subtle shadow
- Items:
  1. Home (house icon) - /musician
  2. Schedule (calendar icon) - /musician/schedule  
  3. Offers (inbox icon) - /musician/offers
     - Badge showing pending offer count
  4. Profile (person icon) - /musician/profile

- Active state: Filled icon + primary color
- Inactive state: Outline icon + gray
- Tap feedback: Subtle scale animation

DESKTOP NAVIGATION (Side Rail):
- Position: Fixed left
- Width: 240px expanded, 64px collapsed
- User can toggle expanded/collapsed
- Persists preference in localStorage
- Items same as mobile, vertically stacked
- Additional items visible on desktop:
  - Availability
  - Payments
  - Sub Requests
  - Divider
  - Settings
  - Help

HEADER:
- Mobile: 
  - Logo (left, tap = home)
  - Notification bell (right)
  - Profile avatar (right of bell)
- Desktop:
  - Logo + "Podium" text
  - Spacer
  - Notification bell
  - "Hi, [Name]" + avatar dropdown

NOTIFICATION BELL:
- Shows badge with unread count
- Tap opens notification panel
- Panel shows:
  - New offers
  - Schedule changes
  - Payment updates
  - Sub request updates
- "Mark all read" option
- Tap notification: Navigate to relevant page

PAGE HEADER PATTERN:
- Back button (if not top-level)
- Page title (centered on mobile)
- Action button (if applicable)

CONTENT AREA:
- Mobile: Full width with padding
- Desktop: Max-width 1200px, centered
- Scroll: Content scrolls, nav fixed

LOADING STATES:
- Skeleton screens for content
- Nav always visible during load
- Pull-to-refresh on mobile (dashboard, schedule, offers)

ERROR STATES:
- Friendly error messages
- "Try again" buttons
- Offline indicator banner
- Never show technical errors

DARK MODE (Future):
- Toggle in profile settings
- Respects system preference
- Persists choice in localStorage
```

---

## API Routes

```
TASK: Musician Portal - API Routes
===================================

BASE PATH: /app/api/musician/

AUTHENTICATION:
──────────────
POST /auth/register
  Body: { firstName, lastName, email, password }
  Returns: { user, musician }
  Actions: Create auth user, link musician records, send verification

POST /auth/login
  Body: { email, password, rememberMe }
  Returns: { user, musician, session }
  
POST /auth/logout
  Actions: Invalidate session

POST /auth/forgot-password
  Body: { email }
  Actions: Send reset email (rate limited)

POST /auth/reset-password
  Body: { token, newPassword }
  Actions: Update password, invalidate sessions

GET /auth/activate/[token]
  Returns: { musician, requiresPassword }
  
POST /auth/activate/[token]
  Body: { password } (if new user)
  Actions: Create/link user, invalidate token

GET /auth/me
  Returns: { user, musician, organizations }

DASHBOARD:
──────────
GET /dashboard
  Returns: {
    musician: MusicianProfile,
    pendingOffers: Offer[],
    upcomingServices: Service[],
    unreadNotificationCount: number
  }
  Notes: Aggregates across all organizations

SERVICES:
─────────
GET /services
  Query: { page, limit, startDate, endDate, organizationId }
  Returns: { services: Service[], total, hasMore }
  Notes: All confirmed services across all orgs

GET /services/[id]
  Returns: { service: ServiceDetail }
  Includes: Venue details, other musicians (if visible), notes

OFFERS:
───────
GET /offers
  Query: { status: 'pending' | 'accepted' | 'declined' | 'expired', page, limit }
  Returns: { offers: Offer[], total }

GET /offers/[id]
  Returns: { offer: OfferDetail }
  Includes: All services, pay breakdown, org policy

POST /offers/[id]/accept
  Body: { notes? }
  Actions: Update status, create positions, notify org
  Returns: { success, offer }

POST /offers/[id]/decline
  Body: { reason?, notes? }
  Actions: Update status, notify org
  Returns: { success }

PROFILE:
────────
GET /profile
  Returns: { musician: FullProfile }

PATCH /profile
  Body: Partial<MusicianProfile>
  Returns: { musician: FullProfile }

POST /profile/photo
  Body: FormData with image
  Returns: { photoUrl }
  Notes: Resize, store in Supabase Storage

PATCH /profile/payment-preferences
  Body: { method, details }
  Returns: { success }
  Notes: Encrypt sensitive data

AVAILABILITY:
─────────────
GET /availability
  Query: { startDate, endDate }
  Returns: { entries: AvailabilityEntry[] }

POST /availability
  Body: { startDate, endDate, type, notes?, recurring?, recurrenceRule? }
  Returns: { entry }

PATCH /availability/[id]
  Body: Partial<AvailabilityEntry>
  Returns: { entry }

DELETE /availability/[id]
  Returns: { success }

SUBSTITUTIONS:
──────────────
GET /sub-requests
  Query: { status? }
  Returns: { requests: SubRequest[] }

POST /sub-requests
  Body: { serviceIds, reason?, notes?, suggestedMusicianId?, newContact? }
  Returns: { request }

PAYMENTS:
─────────
GET /payments
  Query: { organizationId?, status?, year?, page, limit }
  Returns: { payments: Payment[], totals: PaymentTotals }

GET /payments/export
  Query: { year, format: 'pdf' | 'csv' }
  Returns: File download

DOCUMENTS:
──────────
GET /documents
  Returns: { documents: Document[] }

POST /documents
  Body: FormData with file + documentType
  Returns: { document }
  Notes: Store in Supabase Storage, virus scan

DELETE /documents/[id]
  Returns: { success }

CALENDAR:
─────────
GET /calendar/token
  Returns: { token, url }
  Notes: Generate if doesn't exist

GET /calendar/[token].ics
  Returns: iCal file (public route, no auth - token IS auth)
  Notes: Include all confirmed services, proper timezone

NOTIFICATIONS:
──────────────
GET /notifications/preferences
  Returns: { preferences }

PATCH /notifications/preferences
  Body: { emailNewOffers?, emailOfferReminders?, etc. }
  Returns: { preferences }

ORGANIZATIONS:
──────────────
GET /organizations
  Returns: { organizations: ConnectedOrg[] }
  Notes: All orgs this musician is connected to

RATE LIMITING:
─────────────
- Auth endpoints: 10/minute
- General API: 100/minute
- Export endpoints: 5/minute

SECURITY:
─────────
- All routes require authentication (except calendar ics)
- RLS policies enforce data access
- Log all sensitive operations
- Validate musician can only access own data
- Encrypt sensitive fields (bank details)
```

---

## Email Templates

```
TASK: Musician Portal - Email Templates
========================================

Use existing Resend integration. Create templates in /emails/musician/

1. PORTAL INVITATION
────────────────────
File: portal-invitation.tsx

Subject: "You've been added to [Org Name]'s roster"

Body:
- Header with Podium logo
- "Hi [First Name],"
- "[Org Name] has added you to their roster on Podium Personnel."
- "Create your free account to:"
  - ✓ View and accept gig offers instantly
  - ✓ See your schedule across all groups
  - ✓ Manage your payment preferences
  - ✓ Sync your calendar automatically
- CTA Button: "Activate Your Account" → /musician/activate/[token]
- "This link expires in 7 days."
- Footer: "What is Podium Personnel? Podium is how performing arts groups manage their musicians. Learn more at podiumpersonnel.com"

2. WELCOME / ACCOUNT CREATED
────────────────────────────
File: welcome.tsx

Subject: "Welcome to Podium Personnel"

Body:
- "Welcome, [First Name]!"
- "Your account is ready. Here's how to get started:"
- Quick tips:
  1. Complete your profile
  2. Set your payment preferences
  3. Add your instruments
  4. Sync your calendar
- CTA: "Go to My Dashboard"
- "Questions? Reply to this email."

3. NEW OFFER (Update existing)
──────────────────────────────
File: new-offer.tsx

Subject: "New gig offer from [Org Name]"

Body:
- Keep existing content
- Add: "View in your Podium account" link
- Still include direct /gig/[token] link for quick access

4. SCHEDULE CHANGE
──────────────────
File: schedule-change.tsx

Subject: "Schedule update for [Project Name]"

Body:
- "Hi [First Name],"
- "There's been an update to your upcoming gig:"
- Show: What changed (time, venue, etc.)
- Before → After comparison
- CTA: "View Details" → musician portal
- "Add to Calendar" link

5. PAYMENT PROCESSED
────────────────────
File: payment-processed.tsx

Subject: "Payment sent: $[Amount] from [Org Name]"

Body:
- "Good news! You've been paid."
- Amount: $400.00
- For: [Project Name]
- Method: [Zelle to your email]
- Reference: [ZEL-12345]
- CTA: "View Payment History"

6. SUB REQUEST UPDATE
─────────────────────
File: sub-request-update.tsx

Subject: "Sub request [approved/denied] for [Project Name]"

Body:
- Status update
- If approved: "We're finding a sub for you."
- If filled: "Your sub is confirmed: [Name]"
- If denied: "[Reason if provided]"
- CTA: "View Details"

7. OFFER REMINDER
─────────────────
File: offer-reminder.tsx

Subject: "Reminder: Offer expires in [X] days"

Body:
- "[Org Name] is waiting for your response"
- Project details
- Expiration date/time
- CTA: "View Offer"

EMAIL SETTINGS:
- From: notifications@podiumpersonnel.com
- Reply-to: support@podiumpersonnel.com (or org email for offer-related)
- Unsubscribe link in footer
- Respect notification preferences
```

---

# PART 2: ORGANIZATION-SIDE CHANGES

## Supporting Musician Portal from Admin Side

```
TASK: Organization Admin - Musician Portal Integration
=======================================================

MUSICIANS PAGE UPDATES:
───────────────────────
Route: /dashboard/musicians

Add columns to musician list:
- "Portal Status" column:
  - ✓ Active (logged in within 30 days)
  - ○ Invited (invite sent, not activated)
  - − Not invited (no portal access)
  - ⚠️ Inactive (no login in 90+ days)

Add filters:
- Portal Status: All, Active, Invited, Not Invited

Add bulk actions:
- "Send Portal Invites" (for selected musicians without portal)
- "Resend Invites" (for pending invitations)

INDIVIDUAL MUSICIAN PROFILE (Admin View):
─────────────────────────────────────────
Route: /dashboard/musicians/[id]

New section: "Portal Access"
- Status: [Active / Invited / Not Invited]
- If not invited:
  - "Send Portal Invitation" button
- If invited but not activated:
  - Invited on: [Date]
  - "Resend Invitation" button
  - "Cancel Invitation" button
- If active:
  - Last login: [Date/time]
  - "View as Musician" link (opens their portal view in new tab - read only)

New section: "Availability" (if musician shares it)
- Calendar view of their blocked dates
- Color coded: Unavailable (red), Tentative (yellow)
- "Musician has not shared availability" if private

New section: "Documents"
- List of documents they've uploaded
- W-9: Status (On file / Not submitted / Expired)
- Download/view buttons
- "Request W-9" button (sends email)

Updated sections:
- Payment Preferences: Now shows what they set in portal (read-only or editable by admin)
- Contact Info: Synced from portal, admin can override

ADDING NEW MUSICIAN:
────────────────────
Route: /dashboard/musicians/new

Updated flow:
1. Enter musician details (name, email, phone, instruments)
2. New checkbox: "Send portal invitation" (default: checked)
3. On save:
   - Create musician record
   - If checkbox checked: Generate invite token, send email
4. Confirmation: "Musician added. Portal invitation sent."

If email already exists in another org's roster:
- System finds existing musician record
- Links to your organization
- Shows: "This musician already has a Podium account"
- Their existing profile data populates (with their permission settings)

PROJECT STAFFING UPDATES:
─────────────────────────
Route: /dashboard/projects/[id]/staffing

When selecting musician for position:
- Show availability indicator:
  - Green: Available
  - Yellow: Tentative (they marked these dates as maybe)
  - Red: Unavailable (they blocked these dates)
  - Gray: Unknown (no availability data)
  
- Tooltip on hover: "Marked unavailable: [reason if provided]"
- Can still assign (with warning): "This musician marked these dates as unavailable. Assign anyway?"

Filter musicians by:
- Availability (Available only, Include tentative)
- Portal status (Active portal users, All)

CONTRACT OFFER IMPROVEMENTS:
────────────────────────────
Route: /dashboard/projects/[id]/offers

When sending offer to musician with portal account:
- They receive email with both:
  - Direct link: /gig/[token] (works without login)
  - Portal link: /musician/offers/[id] (requires login)
- In their portal: Offer appears immediately
- Push notification (if enabled)

Tracking:
- "Viewed" status when they open in portal (not just email click)
- "Last viewed" timestamp

New: "Resend to Portal" option (just refreshes in their portal + notification, no email)

SUBSTITUTION WORKFLOW UPDATES:
──────────────────────────────
Route: /dashboard/projects/[id]/subs

Musician-initiated sub requests now appear here:
- New tab/filter: "Musician Requests"
- Shows:
  - Who requested
  - Which service(s)
  - Reason
  - Suggested replacement (if any)
  - Date requested
  
- Actions:
  - Approve → Finds/assigns sub, notifies musician
  - Deny → Notifies musician with optional reason
  - Contact Musician → Opens email/message

PAYMENT TRACKING UPDATES:
─────────────────────────
Route: /dashboard/payments

Musician portal shows payment status to musicians.
Ensure sync:
- When you mark payment as "Paid" → Musician sees it immediately
- Include reference number → Shows in their portal
- Add "Notify Musician" toggle when marking paid (default: on if they have portal)

REPORTS:
────────
New report options:
- "Portal Adoption" - % of roster with active portal accounts
- "Response Times" - Average time to accept/decline offers (portal users faster?)
- "Availability Coverage" - % of roster sharing availability data

SETTINGS:
─────────
Route: /dashboard/settings

New section: "Musician Portal"
- Enable/disable portal invitations for your org
- Default invitation message (customizable)
- Auto-invite new musicians: Yes/No
- Require portal for new contract offers: Yes/No (future feature)
```

---

## API Routes for Organization-Side Portal Features

```
TASK: Organization API - Portal Integration Routes
===================================================

Add to existing /api/ routes:

MUSICIAN MANAGEMENT:
────────────────────
POST /api/musicians/[id]/send-portal-invite
  Actions: Generate token, send invitation email
  Returns: { success, inviteSentAt }

POST /api/musicians/[id]/resend-portal-invite
  Actions: Generate new token, resend email
  Returns: { success }

POST /api/musicians/[id]/cancel-portal-invite
  Actions: Clear invite token
  Returns: { success }

GET /api/musicians/[id]/portal-status
  Returns: { 
    status: 'active' | 'invited' | 'not_invited' | 'inactive',
    lastLogin,
    invitedAt,
    inviteExpires
  }

GET /api/musicians/[id]/availability
  Query: { startDate, endDate }
  Returns: { entries: AvailabilityEntry[] }
  Notes: Only if musician has sharing enabled

BULK OPERATIONS:
────────────────
POST /api/musicians/bulk/send-portal-invites
  Body: { musicianIds: string[] }
  Returns: { sent: number, alreadyInvited: number, failed: number }

STAFFING:
─────────
GET /api/musicians/availability-check
  Query: { musicianIds, startDate, endDate }
  Returns: { 
    [musicianId]: {
      available: boolean,
      conflicts: AvailabilityEntry[]
    }
  }
  Notes: Batch check for staffing page
```

---

## Implementation Phases

```
TASK: Implementation Phases - Complete Rollout
===============================================

PHASE 1: MVP (Week 1-2)
═══════════════════════
Goal: Basic portal that musicians can log into and view their gigs

Musician Portal:
- [ ] Database schema (all tables)
- [ ] Authentication (login, register, activate)
- [ ] Dashboard with upcoming services
- [ ] Offers page (view, accept, decline)
- [ ] Basic profile (contact info)
- [ ] Mobile navigation
- [ ] Portal invitation emails

Organization Side:
- [ ] "Send Portal Invite" button on musician profile
- [ ] Portal status column on musicians list
- [ ] Bulk invite action

Testing:
- [ ] End-to-end: Invite → Activate → Login → View services
- [ ] Accept offer flow
- [ ] Decline offer flow
- [ ] Mobile testing on real devices

PHASE 2: Core Features (Week 3-4)
═════════════════════════════════
Goal: Full self-service capabilities

Musician Portal:
- [ ] Schedule page with calendar view
- [ ] iCal calendar sync
- [ ] Payment history page
- [ ] Payment preferences in profile
- [ ] Document upload (W-9)
- [ ] Notification preferences
- [ ] Profile photo upload

Organization Side:
- [ ] View musician availability when staffing
- [ ] Availability indicator on musician cards
- [ ] View musician documents

PHASE 3: Advanced Features (Week 5-6)
═════════════════════════════════════
Goal: Proactive workflow features

Musician Portal:
- [ ] Availability management (block dates)
- [ ] Substitution request flow
- [ ] Sub request tracking
- [ ] Conflict detection
- [ ] Instruments management in profile
- [ ] Export payments for taxes

Organization Side:
- [ ] Musician-initiated sub requests queue
- [ ] Approve/deny sub request workflow
- [ ] Availability-based staffing filters
- [ ] Portal adoption reports

PHASE 4: Polish (Week 7-8)
══════════════════════════
Goal: Refinement and optimization

- [ ] Performance optimization (<2s load times)
- [ ] Dark mode
- [ ] Offline capability (service worker)
- [ ] Pull-to-refresh
- [ ] Accessibility audit (WCAG 2.1 AA)
- [ ] Error tracking (Sentry)
- [ ] Analytics (Mixpanel/Amplitude)
- [ ] Onboarding flow for new users
- [ ] Help/FAQ section
- [ ] Push notifications (opt-in)

LAUNCH CHECKLIST:
═════════════════
- [ ] Security review (auth flows, RLS policies)
- [ ] Load testing (100 concurrent users)
- [ ] Email deliverability testing
- [ ] Mobile testing (iOS Safari, Android Chrome)
- [ ] Cross-browser testing (Chrome, Firefox, Safari, Edge)
- [ ] Legal review (Terms of Service, Privacy Policy)
- [ ] Support documentation
- [ ] Rollout plan (beta users first?)
```

---

## File Structure

```
TASK: Complete File Structure
==============================

/app
├── /musician                          # Musician Portal (public-ish, own auth)
│   ├── layout.tsx                     # Portal layout with mobile nav
│   ├── page.tsx                       # Dashboard/Home
│   ├── /login
│   │   └── page.tsx
│   ├── /register
│   │   └── page.tsx
│   ├── /activate
│   │   └── /[token]
│   │       └── page.tsx
│   ├── /forgot-password
│   │   └── page.tsx
│   ├── /reset-password
│   │   └── /[token]
│   │       └── page.tsx
│   ├── /offers
│   │   ├── page.tsx                   # Offers list
│   │   └── /[id]
│   │       └── page.tsx               # Offer detail
│   ├── /schedule
│   │   └── page.tsx
│   ├── /profile
│   │   └── page.tsx
│   ├── /payments
│   │   └── page.tsx
│   ├── /availability
│   │   └── page.tsx
│   ├── /sub-requests
│   │   └── page.tsx
│   └── /documents
│       └── page.tsx
│
├── /api
│   └── /musician                      # Musician Portal API
│       ├── /auth
│       │   ├── register/route.ts
│       │   ├── login/route.ts
│       │   ├── logout/route.ts
│       │   ├── forgot-password/route.ts
│       │   ├── reset-password/route.ts
│       │   ├── activate/[token]/route.ts
│       │   └── me/route.ts
│       ├── dashboard/route.ts
│       ├── /services
│       │   ├── route.ts
│       │   └── /[id]/route.ts
│       ├── /offers
│       │   ├── route.ts
│       │   └── /[id]
│       │       ├── route.ts
│       │       ├── accept/route.ts
│       │       └── decline/route.ts
│       ├── /profile
│       │   ├── route.ts
│       │   ├── photo/route.ts
│       │   └── payment-preferences/route.ts
│       ├── /availability
│       │   ├── route.ts
│       │   └── /[id]/route.ts
│       ├── /sub-requests
│       │   └── route.ts
│       ├── /payments
│       │   ├── route.ts
│       │   └── export/route.ts
│       ├── /documents
│       │   ├── route.ts
│       │   └── /[id]/route.ts
│       ├── /calendar
│       │   ├── token/route.ts
│       │   └── /[token].ics/route.ts  # Public iCal feed
│       ├── /notifications
│       │   └── preferences/route.ts
│       └── /organizations
│           └── route.ts
│
/components
├── /musician                          # Musician Portal Components
│   ├── MusicianLayout.tsx
│   ├── MusicianNav.tsx
│   ├── MusicianHeader.tsx
│   ├── ServiceCard.tsx
│   ├── OfferCard.tsx
│   ├── OfferDetail.tsx
│   ├── CalendarView.tsx
│   ├── AvailabilityCalendar.tsx
│   ├── PaymentCard.tsx
│   ├── ProfileForm.tsx
│   ├── ProfilePhotoUpload.tsx
│   ├── DocumentUpload.tsx
│   ├── SubRequestForm.tsx
│   ├── NotificationBell.tsx
│   └── EmptyState.tsx
│
/lib
├── /musician
│   ├── auth.ts                        # Auth utilities
│   ├── api.ts                         # API client helpers
│   ├── calendar.ts                    # iCal generation
│   └── types.ts                       # TypeScript types
│
/hooks
├── /musician
│   ├── useMusician.ts                 # Current musician context
│   ├── useOffers.ts
│   ├── useServices.ts
│   ├── useAvailability.ts
│   └── usePayments.ts
│
/emails
├── /musician
│   ├── portal-invitation.tsx
│   ├── welcome.tsx
│   ├── new-offer.tsx
│   ├── offer-reminder.tsx
│   ├── schedule-change.tsx
│   ├── payment-processed.tsx
│   └── sub-request-update.tsx
│
/types
└── musician.ts                        # Shared types
```

---

## Key Technical Decisions

```
TECHNICAL DECISIONS SUMMARY
============================

1. AUTHENTICATION
   - Use Supabase Auth (built-in, proven)
   - Musicians are separate from org admin users
   - Link via musicians.user_id → auth.users.id
   - Support both password and Google OAuth

2. DATA ACCESS
   - RLS policies enforce musician can only see their data
   - Musicians see services/offers where they're the recipient
   - Organizations see musician data where musician is in their roster
   - Availability sharing is opt-in per musician

3. CROSS-ORG DATA
   - One musician can be in multiple organizations
   - Portal aggregates data from ALL their orgs
   - Org-specific data (like offers) tagged with organization_id
   - Calendar includes services from all orgs

4. MOBILE-FIRST
   - Design for 375px width first
   - Touch targets min 44px
   - Bottom nav on mobile, side rail on desktop
   - Skeleton loaders, not spinners
   - Pull-to-refresh where appropriate

5. CALENDAR SYNC
   - Generate unique token per musician
   - Public iCal endpoint (token = auth)
   - Updates in real-time as services change
   - Compatible with Google Calendar, Apple, Outlook

6. NOTIFICATIONS
   - Email via Resend (existing)
   - In-app via notification bell
   - Push notifications future (opt-in)
   - Respect per-musician preferences

7. FILE STORAGE
   - Supabase Storage for documents and photos
   - Organize by musician ID
   - Virus scanning before acceptance
   - Signed URLs for secure access

8. SECURITY
   - Rate limiting on auth endpoints
   - Encrypt sensitive data (bank details)
   - Log all sensitive operations
   - Session management via Supabase
   - HTTPS only
```

---

## Testing Checklist

```
TESTING CHECKLIST
==================

AUTHENTICATION:
- [ ] Register with email/password
- [ ] Register with Google
- [ ] Login with email/password
- [ ] Login with Google
- [ ] Forgot password flow
- [ ] Reset password with valid token
- [ ] Reset password with expired token (should fail)
- [ ] Activate account from invite link
- [ ] Activate with existing Podium account
- [ ] Session persists on refresh
- [ ] "Remember me" extends session
- [ ] Logout clears session

DASHBOARD:
- [ ] Shows upcoming services from all orgs
- [ ] Shows pending offers with badges
- [ ] Empty states render correctly
- [ ] Pull-to-refresh works (mobile)
- [ ] Navigation works on all pages

OFFERS:
- [ ] List shows all pending offers
- [ ] Can view offer details
- [ ] Accept offer updates status
- [ ] Accept offer creates position
- [ ] Accept offer notifies org admin
- [ ] Decline offer updates status
- [ ] Decline with reason works
- [ ] History shows past offers

SCHEDULE:
- [ ] Shows all confirmed services
- [ ] Calendar view works
- [ ] List view works
- [ ] Filter by organization works
- [ ] Calendar sync URL works
- [ ] iCal feed contains correct data
- [ ] Adding to Google Calendar works

PROFILE:
- [ ] Can update all fields
- [ ] Photo upload works
- [ ] Payment preferences save
- [ ] Notification preferences save
- [ ] Password change works
- [ ] Instruments management works

AVAILABILITY:
- [ ] Can add unavailable dates
- [ ] Can add recurring availability
- [ ] Can edit existing entries
- [ ] Can delete entries
- [ ] Privacy toggle works
- [ ] Org sees availability when staffing

PAYMENTS:
- [ ] Shows all payments across orgs
- [ ] Filters work
- [ ] Export generates correct file
- [ ] Totals calculate correctly

MOBILE:
- [ ] All pages work at 375px width
- [ ] Bottom nav works
- [ ] No horizontal scroll anywhere
- [ ] Touch targets are large enough
- [ ] Fast load times

CROSS-ORG:
- [ ] Musician in 2 orgs sees both in dashboard
- [ ] Calendar includes services from all orgs
- [ ] Offers from different orgs listed separately
- [ ] Payments from different orgs listed with org name

ORGANIZATION ADMIN:
- [ ] Can send portal invite
- [ ] Can resend invite
- [ ] Can see portal status on musician list
- [ ] Can see musician availability when staffing
- [ ] Offer appears in musician's portal immediately
```

---

This document contains everything needed to implement the musician portal. Start with Phase 1 (MVP) and iterate based on feedback.
