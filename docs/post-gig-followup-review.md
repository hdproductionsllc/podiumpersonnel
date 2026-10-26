# Post-gig follow-up review

Draft-only changes, 2026-10-26. No hosted migration, deployment, real email, credentials, or access-policy changes were performed. The original checkout's parser and project-dialog edits are excluded.

## Findings and behavior

- The server-rendered survey disabled its fieldset until a client effect ran and had no native form action. A failed script load therefore left it unusable. Native radio inputs and a POST/redirect fallback now work without JavaScript; hydration adds draft restoration and inline retry. This reproduces a failure mechanism, not Rebecca's specific device incident (no device logs were available).
- Current position confirmation records booking, not attendance. A new nullable `projects.gig_report_musician_ids` array records an admin-reviewed played roster. NULL means unreviewed; an empty array means nobody selected. No invitation-based backfill. Admins reconcile actual substitutes on the roster and select actual performers after the gig. All selected, currently confirmed performers receive individual links; released, declined, offered and replaced players are excluded. Multiple chairs are deduplicated. Existing lead selection remains separate.
- Existing report tokens, musician attribution, historical feedback and private photo behavior remain intact. Unique report rows prevent duplicate initial dispatch; conditional timestamp claims and a one-minute cooldown prevent overlapping resends. Submitted reports are not requested again. Existing cron timing remains unchanged and requires a reviewed roster; the manual action also works outside the cron window.
- Survey email: “Thanks for playing **{projectName}** ({gigDate}). While it is fresh, how did it go?” followed by “Three quick choices: overall, punctuality and whether the gig matched the details. Notes, client feedback and photos are optional. No login needed.” CTA: “Send your gig report.” Includes a direct browser link.
- Tax totals use payment dates, never row creation dates or browser-local year conversion. Verified thresholds: $600 for 2020–2025; $2,000 for 2026. Other years require a reviewed override; future inflation is not guessed. Overrides remain separate per selected year. Missing dates are flagged and excluded. The threshold is a review filter, not a filing determination: backup withholding can require reporting below it. January 31 advances over weekends; the UI warns to check applicable holidays/extensions.
- Pay-summary rows use email tables instead of flex/nowrap, with wrapping breakdowns and currency preserved. Existing organization-timezone date formatting and plain-text generation were already correct.
- Spreadsheet multipart bodies are bounded before parsing; files are limited to 5 MiB. Sharp 0.35.4 → 0.35.5 addresses its reported librsvg advisory. README no longer advertises the retired musician portal.

## Sources

- [IRS information-return requirements](https://www.irs.gov/businesses/small-businesses-self-employed/am-i-required-to-file-a-form-1099-or-other-information-return)
- [IRS Publication 1099 (2026)](https://www.irs.gov/publications/p1099): threshold, post-2026 inflation, backup withholding and due-date rules.
- [Sharp 0.35.5 release](https://github.com/lovell/sharp/releases/tag/v0.35.5)

## Manual prerequisites and rollback

Before any separately approved rollout, apply `20261026080335_gig_report_played_roster.sql` using the existing migration workflow, then deploy the app. It only adds a nullable UUID array and comment; no backfill, bucket, RLS, grant or credential changes. It is compatible with the old app. New after-gig queries require the column, so do not deploy first.

Review attendance in each gig's Gig reports panel before requests. Preserve email safe mode during staging. Confirm synthetic substituted/excluded players, individual attribution, repeat requests, native form save/retry, and admin photo viewing in staging before live approval. Never use customer addresses for QA.

Rollback the application if needed and leave the additive column/data intact. Do not drop historical reports, photo objects or reviewed rosters. Rolling back restores the previous lead-only behavior, so coordinate with the operator before resuming scheduled requests.

## Verification and limits

Local typecheck and production build passed with dummy service configuration. Full tests cover recipients, substitutes/exclusions, repeated and overlapping requests, native route redirects/validation/repeated submission, selected tax years, weekend dates, bounded uploads, email HTML/plain text, and the prior photo suite. See the PR for final counts and CI results.

An isolated localhost harness rendered the actual survey component in Chromium and WebKit at 390×844, with JavaScript both on and off. Choices, blank optional notes and submission passed in all four cases. With JavaScript, back/draft restoration and a failed-submit retry also passed. Requests used a local mock endpoint; route persistence was tested separately with mocked database operations. [WebKit screenshot](post-gig-webkit.png) is synthetic local QA, not a live customer report.

No physical iPhone/Android or Gmail/Apple Mail/Outlook/in-app browser testing was performed. No-JS photo upload is intentionally unavailable; a visible explanation leaves feedback submission usable. HEIC guidance and photo privacy from the existing feature remain unchanged. Global lint has pre-existing debt; changed-code lint findings and database CI are reported in the PR.

## Deferred

- Sub-request fallback needs a separate audit of its JavaScript-only gig workflow and notification idempotence.
- Cancellation/chair deletion must coordinate offer withdrawal and notifications transactionally; not a contained change here.
- Other dependency advisories require separate compatibility review (including SheetJS, which has no npm fix). No blanket audit upgrade.
- Billing switches, API authorization, migration tooling, Vercel environment and persistent access settings remain outside this PR.
