# Podium Personnel: Strategic Development Plan & Claude Code Tasks

## Executive Summary

Based on market research, Podium Personnel is positioned to fill a significant gap in the performing arts management software market. The existing competitors fall into two categories:

1. **Enterprise Solutions** (OPAS, ArtsVision, #DIESE): Expensive, complex, designed for major symphony orchestras with $7M+ budgets. Pricing is often by annual organization budget.

2. **Band/DJ Booking Software** (Band Pencil, Stagent, Gigwell): Designed for pop/rock bands, DJs, and touring artists. Pricing: $24-80/month for bands, $119-849/month for agencies.

**Your opportunity**: There's no modern, affordable SaaS specifically designed for classical chamber groups, regional orchestras, and performing arts contractors. You're building the solution that fits between "too expensive enterprise" and "wrong genre focus."

---

## Part 1: Organized Claude Code Tasks

### Priority 1: Critical Bug Fixes

```
TASK 1.1: Fix Venue Search in Services
-----------------------------------------
PROBLEM: When creating a service in a project and searching for a saved venue, nothing populates.
REQUIREMENTS:
- Venue search should work in the service creation/edit modal
- When selected, auto-populate all saved venue info (address, parking info, directions, Google Places data)
- Implement fuzzy search for venue names
- Show venue details preview before selection
```

```
TASK 1.2: Add Conductor and Music Librarian Positions
------------------------------------------------------
REQUIREMENTS:
- Add "Conductor" as a special position type in staffing
- Add "Music Librarian" as a special position type
- These should appear separately from instrument sections (perhaps above them)
- Conductor should have its own fee structure (not leader fee, but conductor fee)
- Music Librarian may be per-project or per-service
- Consider: Guest Conductor vs Principal Conductor distinction
```

### Priority 2: Core Feature Enhancements

```
TASK 2.1: Save Custom Staffing as Quick Preset
----------------------------------------------
REQUIREMENTS:
- After building custom instrumentation for a project, user can click "Save as Preset"
- Prompt for preset name
- Store: instrument list, chair counts, position types
- Presets appear in Quick Preset dropdown for future projects
- Allow editing/deleting saved presets from a management page
- Consider: Preset categories (e.g., "Chamber," "Full Orchestra," "Custom")
```

```
TASK 2.2: Email Branding in Organization Profile
-------------------------------------------------
REQUIREMENTS:
- Add "Email Branding" section to organization settings/profile
- Upload logo (displayed in email header)
- Set primary brand color (used for buttons, accents)
- Custom email footer text
- Optional: Custom email signature for the sending administrator
- Apply branding to: contract offers, reminders, sub request notifications, W-9 requests
- Preview functionality before saving
```

```
TASK 2.3: Musicians/Instruments Page Filtering & Linking
---------------------------------------------------------
REQUIREMENTS:
A) Filtering on Musicians page:
   - Filter by: Saved Ensemble (Book), Region/Tag, Instrument Section, Active/Inactive status
   - Multi-select filters that can combine
   - Toggle views: Card view vs Table view
   - Quick search by name
   
B) On Instruments page (roster view):
   - Each musician name is a clickable link to their profile
   - Opens in same tab or modal for quick editing
   - Breadcrumb navigation back to instruments view
```

### Priority 3: Member/Team Management System

```
TASK 3.1: Invitation-Based Member System
-----------------------------------------
PROBLEM: Current system requires existing accounts, creating merge conflicts.

RECOMMENDED ARCHITECTURE:
1. Organization owner/admin enters email address to invite
2. System sends invitation email with unique token link
3. Link directs to: "You've been invited to join [Org Name] as [Role]"
4. If recipient has existing Podium account:
   - Prompt: "Join this organization with your existing account?"
   - Accept adds them to the org with specified role
   - Their existing data (if they have an org) remains separate
5. If no existing account:
   - Guided signup flow
   - After account creation, automatically joined to inviting org
6. Invitation expires after 7 days (configurable)
7. Organization sees pending invitations with ability to resend/revoke

ROLES TO SUPPORT:
- Owner (1 per org, can transfer)
- Admin (full access except ownership transfer)
- Manager (can manage projects, musicians, contracts)
- Member (view-only or limited permissions)

NOTE: Consider limiting multi-user functionality to paid tiers
```

### Priority 4: Authentication & Security

```
TASK 4.1: Robust Forgot Password System
----------------------------------------
REQUIREMENTS:
- Standard email-based password reset flow
- Password reset tokens expire after 1 hour
- Rate limiting on reset requests (3 per hour per email)

FOR GOOGLE OAUTH USERS:
- If email matches OAuth account, show message: "This account uses Google Sign-In. Please sign in with Google."
- Option to "Add password" to OAuth account for backup access
- If Google account has issues: Link to Google account recovery + support contact

GENERAL:
- Support email for authentication issues
- Account recovery via verified phone (future feature)
```

```
TASK 4.2: Admin Impersonation for Support
------------------------------------------
REQUIREMENTS:
- Developer/support admin panel
- "View as User" functionality
- All actions logged with original admin + impersonated user
- Visual indicator when in impersonation mode
- Read-only mode option vs full impersonation
- Requires 2FA verification to activate
- Auto-timeout after 30 minutes
```

```
TASK 4.3: API Key Protection for Deployment
--------------------------------------------
REQUIREMENTS:
- Move all API keys to environment variables
- Create .env.example with placeholder values
- Ensure .env is in .gitignore
- For Vercel/deployment: Use their secrets management
- Document which keys are needed:
  - SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
  - RESEND_API_KEY
  - GOOGLE_PLACES_API_KEY
  - Any payment processor keys (future)
- Consider: Separate keys for dev/staging/production
```

---

## Part 2: Pricing Strategy Research & Recommendations

### Competitive Landscape Analysis

| Product | Target Market | Pricing Model |
|---------|---------------|---------------|
| **Band Pencil** | Bands, DJs, Entertainers | $24-80/mo (Standard/Premium/Ultimate) |
| **Stagent** | Booking Agencies | €49/mo solo, €119-849/mo agency (by artist count) |
| **Gigwell** | Touring Artists/Agencies | Custom pricing (estimated $200+/mo) |
| **OPAS** | Symphony Orchestras | By org budget tier ($10K+ annually) |
| **ArtsVision** | Large Orchestras | Enterprise pricing |

### Recommended Podium Personnel Pricing Tiers

#### Tier 1: "Ensemble" - $29/month (annual) / $39/month (monthly)
**Target**: String quartets, chamber groups, small ensembles
- 1 manager account
- Up to 25 musicians in roster
- Up to 10 active projects/month
- Up to 3 saved ensembles (books)
- Email branding (basic)
- Contract offers with e-acceptance
- Payment tracking
- Email support

#### Tier 2: "Orchestra" - $79/month (annual) / $99/month (monthly)
**Target**: Regional orchestras, community symphonies, larger chamber groups
- 3 manager accounts
- Up to 150 musicians in roster
- Unlimited projects
- Unlimited saved ensembles
- Full email branding + custom domain option
- Substitution request system
- QuickBooks export
- Advanced payment tracking & bulk operations
- Priority email support
- Member invitation system

#### Tier 3: "Symphony" - $199/month (annual) / $249/month (monthly)
**Target**: Established regional/metro symphonies, opera orchestras
- Unlimited manager accounts
- Unlimited musicians
- Unlimited everything
- API access (future)
- Custom integrations
- Dedicated onboarding
- Phone support
- Custom contract templates
- Multi-organization management
- Audit logs

### Value Justification

**Ensemble tier ($29/mo)**: A single wedding gig with your quartet likely grosses $1,500-3,000. The software pays for itself with one booking if it saves you 2 hours of admin time.

**Orchestra tier ($79/mo)**: A regional orchestra personnel manager earns $49,000-74,000/year. If Podium saves 5 hours/month of admin work, it's worth 10x the price.

**Symphony tier ($199/mo)**: Orchestras with budgets over $1M spend thousands annually on operations. This is fraction of their personnel manager's monthly salary.

---

## Part 3: Additional High-Value Features You Haven't Thought Of

### Immediate Value Adds

1. **Musician Self-Service Portal**
   - Musicians log in to see their upcoming services
   - Submit availability windows
   - Request subs directly (routes to approval workflow)
   - View and accept contracts
   - Update their own contact info, W-9 status, payment preferences
   - Reduces admin overhead significantly

2. **Conflict Calendar / Availability Management**
   - Musicians mark dates they're unavailable
   - When staffing a project, see conflicts instantly
   - "Find Available Musicians" for a given date range
   - Integration with Google/Apple Calendar

3. **Call Order Queue System**
   - When position is vacant, auto-suggest next musician by call order
   - Track offer history (who was offered, who declined, response times)
   - "Skip to next" functionality
   - Analytics: Which musicians decline most frequently?

4. **Automated Reminders**
   - Pending offer expiration reminders
   - Upcoming service reminders (24/48 hours before)
   - W-9 deadline reminders (tax season)
   - Contract unsigned reminders
   - Configurable timing per organization

5. **Mobile-Responsive Gig Response Page**
   - The /gig/[token] page must be perfect on mobile
   - Musicians often check offers from their phone
   - One-tap accept/decline
   - Apple Wallet / Google Wallet integration for service details

### Medium-Term Differentiators

6. **Repertoire/Program Integration**
   - Track what works are being performed per project
   - Know which musicians have played which pieces before
   - Optional: Integration with Daniel's Orchestral Music Online database

7. **Doubling Tracking**
   - Track instrument doublings per musician
   - Calculate doubling fees automatically
   - "Find players who double on flute and piccolo"

8. **Union Compliance Tools**
   - Track AFM local requirements
   - Overtime calculations
   - Break requirements
   - Service limits per day/week

9. **Budget Forecasting**
   - Estimate total musician costs for a project before staffing
   - Compare estimated vs actual costs
   - Season-level budget planning

10. **Communication Hub**
    - Bulk messaging to all musicians on a project
    - Announcement system for organization-wide updates
    - Message history per musician

### Long-Term Vision Features

11. **Multi-Region Support**
    - If running Subito Strings (CA), Project String Quartet (STL/Chicago), and Meridian (DC) - manage all from one login
    - Switch between organizations
    - Share musician database across regions (with permissions)

12. **Client/Venue CRM**
    - Track venues you work with
    - Client contact management
    - Booking history with each venue
    - Venue-specific notes (parking codes, load-in instructions)

13. **Analytics Dashboard**
    - Musicians by service count
    - Average response time to offers
    - Revenue per project/season
    - Cancellation rates
    - Seasonal trends

14. **Invoice Integration**
    - Generate invoices to clients (not just payment tracking to musicians)
    - Stripe/PayPal integration for deposits
    - Automated invoice follow-ups

---

## Part 4: Technical Deployment Checklist

### Pre-Launch Security
- [ ] All API keys in environment variables
- [ ] .env files in .gitignore
- [ ] Production database separate from development
- [ ] Row Level Security (RLS) policies reviewed
- [ ] Rate limiting on public endpoints
- [ ] CORS properly configured
- [ ] SSL/HTTPS enforced

### Pre-Launch Testing
- [ ] All user flows tested end-to-end
- [ ] Mobile responsiveness verified
- [ ] Email delivery tested (check spam folders)
- [ ] Contract offer flow with real emails
- [ ] Payment tracking workflow
- [ ] Password reset flow
- [ ] Google OAuth flow

### Monitoring & Support
- [ ] Error tracking (Sentry or similar)
- [ ] Uptime monitoring
- [ ] Database backups configured
- [ ] Support email ready
- [ ] FAQ/Help documentation

---

## Summary: Recommended Development Priority

1. **Now (Critical for Launch)**
   - Fix venue search bug
   - API key protection
   - Forgot password system
   - Add Conductor/Librarian positions

2. **Soon (First 30 Days)**
   - Save custom staffing as preset
   - Email branding
   - Musicians page filtering + linking
   - Mobile-optimize gig response page

3. **Next (Days 31-60)**
   - Invitation-based member system
   - Automated reminders
   - Admin impersonation
   - Musician self-service portal

4. **Then (Days 61-90)**
   - Conflict calendar / availability
   - Call order queue automation
   - Analytics dashboard
   - Multi-organization support

This prioritization gets you to a launchable MVP quickly, then builds toward the differentiating features that will make Podium Personnel indispensable.
