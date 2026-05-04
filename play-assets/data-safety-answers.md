# Play Console — Data Safety section answers (Akkuro Connect)

Use this as a copy-paste reference while filling **Play Console → Policy → Data safety**.

---

## 1. Data collection and security (top-level Yes/No)

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** (TLS 1.2+ on all backend and third-party calls) |
| Do you provide a way for users to request that their data be deleted? | **Yes** (email request to `bjorn.holmthorsson@akkuro.com`; record auto-removed within 90 days of Azure AD account deactivation) |

---

## 2. Data types

For every data type below, the form asks the same four sub-questions. Quick reference for the answers we'll use throughout:

- **Collected / Shared:** "Collected" = sent to our Azure backend. "Shared" = sent to a third-party service (Microsoft, Atlassian/Jira, Apple, Google).
- **Ephemeral processing:** "No" — we persist most data in Postgres/Cosmos.
- **Required vs optional:** "Required" if the app cannot function without it (sign-in identity); "Optional" if the user can choose (location, address fields).
- **Purposes:** Always at least **App functionality** and **Account management**. We do **NOT** use any data for advertising, analytics for ad targeting, or personalization.

### Personal info

| Type | Collected? | Shared? | Required? | Purpose |
|---|---|---|---|---|
| **Name** (display name) | Yes | Yes (Microsoft, Atlassian) | Required | App functionality, Account management |
| **Email address** (UPN) | Yes | Yes (Microsoft) | Required | App functionality, Account management |
| **User IDs** (Azure AD object ID, Jira username) | Yes | Yes (Microsoft, Atlassian) | Required | App functionality, Account management |
| **Address** (street, postal, city — user-entered in profile) | Yes | No | Optional | Account management |
| **Phone number** (mobile, business — Graph + user-entered) | Yes | No | Optional | App functionality, Account management |
| **Other info** (SSN, spouse, education, role, start date — user-entered in profile) | Yes | No | Optional | Account management |

### Financial info
**None** — the app does not collect any financial information.

### Health and fitness
**None.**

### Messages
**None** — the app does not read SMS, emails, or other messages.

### Photos and videos
**None collected.** The app displays the user's existing Microsoft profile photo (fetched from Microsoft Graph) but does not collect, upload, or store photos from the device.

### Audio
**None.**

### Files and docs
**None.**

### Calendar

| Type | Collected? | Shared? | Required? | Purpose |
|---|---|---|---|---|
| **Calendar events** (subject + start/end time, read-only) | Yes (in-memory only, on device) | No | Optional | App functionality (suggestions when logging time to Tempo) |

> Note: calendar events are **read on-device via Microsoft Graph** to power "Calendar suggestions" in the time-logging flow. They are not transmitted to our backend or stored outside the device session.

### Contacts
**None from the device.** We display fellow Akkuro / Five Degrees employees via Microsoft Graph (same organisation) — those are work colleagues from the corporate directory, not personal contacts on the user's phone.

### App activity

| Type | Collected? | Shared? | Required? | Purpose |
|---|---|---|---|---|
| **App interactions** (lunch orders, time entries, travel requests, location check-ins) | Yes | Time entries + travel requests Shared with Atlassian | Some required (sign-in), most optional | App functionality, Account management |
| **In-app search history** | No | — | — | — |
| **Installed apps** | No | — | — | — |
| **Other user-generated content** | No | — | — | — |
| **Other actions** | No | — | — | — |

### Web browsing
**None.**

### App info and performance

| Type | Collected? | Shared? | Required? | Purpose |
|---|---|---|---|---|
| **Crash logs** | No | — | — | — |
| **Diagnostics** | Yes (basic backend request logs, no personal payloads) | No | Required | App functionality (troubleshooting) |
| **Other app performance data** | No | — | — | — |

### Device or other IDs

| Type | Collected? | Shared? | Required? | Purpose |
|---|---|---|---|---|
| **Device or other IDs** (APNS / FCM push notification token) | Yes | Shared with Apple Push Notification service / Google Firebase Cloud Messaging only for delivering notifications | Required (only if push notifications are enabled) | App functionality |

### Location

| Type | Collected? | Shared? | Required? | Purpose |
|---|---|---|---|---|
| **Approximate location** | No | — | — | — |
| **Precise location** | Yes (only when "Check-in to known locations" is enabled in Profile) | No | **Optional** (off by default) | App functionality (matches device coordinates against known company / client offices to record check-ins) |

> Important: location is opt-in via a Profile toggle. When off, no coordinates are collected. When on, coordinates are matched against known locations server-side; raw coordinates are not retained long-term.

---

## 3. Security practices (next page in the form)

- **Data is encrypted in transit:** Yes (TLS 1.2+).
- **You can request that data be deleted:** Yes (link to support email — `bjorn.holmthorsson@akkuro.com`).
- **Are you committed to follow the Play Families policy?** N/A (app is 18+, internal employees only).
- **Is your app independently validated against a global security standard?** No (unless Akkuro has SOC 2 / ISO 27001 you can claim — leave "No" otherwise).

---

## 4. Things to remember while filling the form

1. The form is saved as you go — you can leave and come back.
2. After submitting, the form generates a public **Data Safety summary** that appears on the Play listing. Worth previewing it before publishing.
3. If you later add new data types (e.g. crash reporting via Sentry), you must update this section before rolling out the change.
4. Google occasionally re-prompts apps to re-affirm Data Safety. Save this file in the repo so you have a baseline next time.

---

## 5. Quick FAQ for the rest of Play Console

- **App access:** "All functionality is available without restrictions" → **No**. App requires Microsoft 365 sign-in. Google reviewers will need a test account — provide one on the form, or write *"Sign-in requires a Microsoft 365 account in the Akkuro / topicus.nl tenant. Reviewer access can be arranged via support email."*
- **Ads:** **No**.
- **Content rating:** Productivity / Business → no questionable content → "Everyone" rating.
- **Target audience and content:** **18 and older**.
- **News app:** No.
- **COVID-19 contact tracing/status:** No.
- **Government app:** No.
- **Financial features:** No.
- **Health features:** No.
