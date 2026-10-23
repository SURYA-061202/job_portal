# Subscription, Post Limits and Candidate Search - Implementation Plan

## Scope (what was asked)
1. Recruiter post limit - 10 posts on the free tier; beyond that the recruiter must subscribe.
2. Admin subscription module - levels 1, 2, 3 ... that the admin creates and edits.
3. Recruiter sees the available subscriptions.
4. Candidates module is limited by the recruiter's subscription.
5. Keyword search in Candidates - enlarged result cards with every detail, keywords highlighted.
6. Requesting a subscription sends notifications.

## Design decisions
- **Approval, not payment.** Item 6 says a recruiter *requests* a subscription, so the flow is request -> admin approves. No payment gateway is integrated. Prices are informational (INR).
- **Free tier** lives in `src/lib/subscriptions.ts` (`FREE_POST_LIMIT = 10`, `FREE_CANDIDATE_LIMIT = 20`). Change them there.
- **Plan terms are snapshotted** onto the recruiter (`users/{uid}.subscription`) when approved, so later edits to a plan do not silently change what someone already bought.
- **Expiry** is evaluated when read: an expired plan falls back to the free tier. Renewing the same plan extends from its current end date.
- **Legacy `isPremium: true`** recruiters keep unlimited access until the admin removes it.
- **Admins are never limited.**
- **Search runs on the full list, the plan limit is applied after ranking** - so a keyword can never reveal a locked candidate, and a limited plan still sees the best matches.

## Data model (Firestore)
| Collection / field | Purpose |
|---|---|
| `subscription_plans/{id}` | level, name, description, price, durationDays, maxPosts, maxCandidates (-1 = unlimited), features[], active |
| `subscription_requests/{id}` | recruiterId/Name/Email, planId/Name/Level, status `pending|approved|rejected`, createdAt, resolvedAt, resolvedBy, note |
| `users/{uid}.subscription` | planId, planName, level, maxPosts, maxCandidates, startedAt, expiresAt |
| `notifications` | new types: `subscription_request` (to every admin), `subscription_request_sent`, `subscription_approved`, `subscription_rejected` (to the recruiter) |

## Work breakdown
| # | Change | Files |
|---|---|---|
| 1 | Types + notification types | `types/index.ts`, `lib/notificationHelper.ts`, `pages/NotificationsPage.tsx` |
| 2 | Subscription service (plans, requests, entitlements, quota) + live hook | `lib/subscriptions.ts`, `lib/useSubscription.ts` |
| 3 | Admin module: Requests / Plans / Recruiters tabs | `components/subscription/AdminSubscriptionTab.tsx` |
| 4 | Recruiter module: current plan, usage, available plans, request | `components/subscription/RecruiterSubscriptionTab.tsx` |
| 5 | Navigation + routing | `components/layout/Sidebar.tsx`, `pages/Dashboard.tsx` |
| 6 | Post limit: pre-check on Add Post, upgrade dialog, re-check on save, usage chip | `JobPostsTab.tsx`, `RecruitmentFormModal.tsx`, `subscription/PostLimitModal.tsx` |
| 7 | Candidate cap by plan, locked-candidates banner | `tabs/CandidatesTab.tsx` |
| 8 | Keyword search engine + enlarged highlighted cards | `lib/candidateSearch.ts`, `resume/CandidateSearchResults.tsx`, `resume/Highlight.tsx` |

## Keyword search behaviour
- `autocad, project management` -> two phrases (commas separate). `site engineer` -> two words. `java "spring boot"` -> quotes keep a phrase.
- **Any keyword** (default): candidates with at least one hit, ranked by number of keywords matched, then by where they matched (skills/role > experience > education > ...). **All keywords**: every keyword must hit.
- Searches name, role, experience, email/phone, location, summary, skills, work history, education, projects, certifications, courses.
- One- and two-letter keywords (`c`, `qa`) match whole words only.

## Before you go live (required)
1. **Firestore security rules.** Limits are enforced in the app. For real enforcement, add rules - the app cannot protect itself from a modified client. Suggested:
```
match /subscription_plans/{id} {
  allow read: if request.auth != null;
  allow write: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
}
match /subscription_requests/{id} {
  allow create: if request.auth != null && request.resource.data.recruiterId == request.auth.uid && request.resource.data.status == 'pending';
  allow read: if request.auth != null && (resource.data.recruiterId == request.auth.uid
      || get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin');
  allow update, delete: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
}
```
   Also make sure only admins can write `subscription` / `isPremium` on `users/{uid}`, and ideally enforce the 10-post cap on `recruits` create with a rule or a Cloud Function.
2. Open **Subscriptions -> Plans** as admin and use **Add plan** to create levels 1, 2, 3 ... (no default plans are created).

## Test checklist
- Recruiter with 10 posts clicks Add Post -> upgrade dialog (and the form refuses to save if opened another way).
- Recruiter requests a plan -> admin gets a notification; recruiter gets a confirmation; button shows "Request pending".
- Admin approves -> recruiter is notified; limits change on screen without a reload.
- Free recruiter with >30 candidates sees 30 plus the locked banner; a keyword search shows the top 30 matches and the banner.
- Search `autocad, revit` in Any vs All mode; keywords highlighted in name, skills, experience, education, projects.
- Admin: add/edit/hide/delete a plan; assign and remove a plan for a recruiter; decline with a reason.
