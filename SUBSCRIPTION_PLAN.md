# Subscription, Post Limits and Candidate Search - Implementation Plan

## Scope (what was asked)
1. Recruiter post limit - 10 posts on the free tier; beyond that the recruiter must subscribe.
2. Admin subscription module - levels 1, 2, 3 ... that the admin creates and edits.
3. Recruiter sees the available subscriptions.
4. Candidates module is limited by the recruiter's subscription.
5. Keyword search in Candidates - enlarged result cards with every detail, keywords highlighted.
6. Requesting a subscription sends notifications.

## Design decisions
- **Recruiters pay online (Razorpay); no admin approval.** A recruiter plan with a price above ₹0 is bought through Razorpay Checkout and is active as soon as the payment is verified. Plans priced ₹0 are "by arrangement" and still go through request -> admin approves. Job seeker (user) plans also still use the request flow. See **Online payments** below.
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
| `users/{uid}.subscription` | planId, planName, level, maxPosts, maxCandidates, startedAt, expiresAt, paymentOrderId (when bought online) |
| `payments/{orderId}` | userId/Email/Name, plan snapshot, amount (paise), currency, status `created|paid|failed`, razorpayPaymentId, method, expiresAt, paidAt. Written only by Cloud Functions |
| `notifications` | new types: `subscription_request` (to every admin), `subscription_request_sent`, `subscription_approved`, `subscription_rejected` (to the recruiter); `subscription_activated` (recruiter, after payment), `subscription_purchased` (every admin) |

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

## Online payments (Razorpay)

### How it works
1. Recruiter clicks **Subscribe - ₹X** (Subscription tab or the Upgrade dialog).
2. `createSubscriptionOrder` (Cloud Function) reads the plan **from Firestore** - the browser never sends a price - creates a Razorpay order and a `payments/{orderId}` doc with a snapshot of the plan terms.
3. Razorpay Checkout opens (UPI, cards, net banking, wallets). The recruiter pays.
4. The browser sends the signed result to `verifySubscriptionPayment`, which checks the HMAC signature, fetches the payment from Razorpay (captures it if only authorized), confirms amount and order match, then grants the plan.
5. `razorpayWebhook` receives `payment.captured` / `order.paid` from Razorpay directly and grants the plan too, so closing the tab right after paying never loses a payment.
6. Granting runs in a Firestore transaction and happens **once per order**, whichever of 4 or 5 arrives first. Same plan still active -> the new period is added to its end date. Different plan -> it replaces the current one from today (the UI asks first).
7. The recruiter gets a `subscription_activated` notification, every admin gets `subscription_purchased`, and the plan shows up on screen at once (live `useSubscription`).

Admins see every payment and the total collected under **Subscriptions -> Payments**. Admins can still assign or revoke plans by hand.

### Files
| File | What |
|---|---|
| `functions/src/payments.ts` | `createSubscriptionOrder`, `verifySubscriptionPayment`, `razorpayWebhook` |
| `functions/src/index.ts` | exports the three functions |
| `src/lib/payments.ts` | loads checkout.js on demand, `payForPlan()`, payment history listeners |
| `src/lib/usePlanCheckout.ts` | shared pay-button handler (confirm on plan switch, toasts) |
| `components/subscription/RecruiterSubscriptionTab.tsx`, `UpgradePlansModal.tsx` | Pay buttons, payment history |
| `components/subscription/AdminSubscriptionTab.tsx` | Payments panel |
| `firestore.rules` | `payments/{orderId}`: read own / admin, no client writes |

### Setup (required before it works)
1. Create a Razorpay account and complete KYC (test mode works without it).
2. Dashboard -> **Account & Settings -> API Keys** -> generate keys. Put them in `functions/.env`:
   ```
   RAZORPAY_KEY_ID=rzp_test_xxxxxxxx
   RAZORPAY_KEY_SECRET=xxxxxxxx
   RAZORPAY_WEBHOOK_SECRET=any-long-random-string
   ```
3. Deploy: `firebase deploy --only functions,firestore:rules`
4. Copy the `razorpayWebhook` URL from the deploy output (e.g. `https://us-central1-recruitment-portal-7b629.cloudfunctions.net/razorpayWebhook`).
5. Dashboard -> **Account & Settings -> Webhooks -> Add new webhook**: that URL, the same secret as `RAZORPAY_WEBHOOK_SECRET`, events `payment.captured`, `payment.failed`, `order.paid`.
6. Make sure each recruiter plan has a price above ₹0.
7. Going live: swap the `rzp_test_` keys for `rzp_live_` keys, add the webhook again in **Live mode**, redeploy functions.

### Payment test checklist (test mode)
- Card `4100 2800 0000 1007` (Visa) or `5500 6700 0000 1002` (Mastercard), any future expiry, any CVV (full list: razorpay.com/docs/payments/payments/test-card-details) -> plan active, toast shows the end date, Payment history shows Paid, admin gets a notification and the payment appears under Payments.
- UPI `success@razorpay` -> succeeds; `failure@razorpay` -> fails, nothing is granted, row shows Failed (via webhook).
- Close the checkout window -> "Payment cancelled", no plan change.
- Pay, then close the tab before the success toast -> plan still activates within a minute (webhook).
- Renew the same plan within 7 days of expiry -> new end date = old end date + duration.
- Buy a different plan while one is active -> confirmation, then the new plan replaces it.
