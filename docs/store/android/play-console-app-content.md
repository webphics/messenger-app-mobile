# Play Console answers, in checklist order

What to enter under *Provide app information and create your store listing*, one section per task
in the order Play Console lists them. Checked against the code on main on 2026-10-29 (app 1.0.15,
package `com.thechatroute.app`). Store listing copy is in `listing.md`; the build and upload steps
are in `publishing.md`.

Public pages (all live, served by the web client):

| Page | URL |
|---|---|
| Website | https://thechatroute.com |
| Privacy policy | https://thechatroute.com/privacy |
| Terms of use | https://thechatroute.com/terms |
| Account deletion | https://thechatroute.com/delete-account |
| Contact email | support@thechatroute.com |

In the app, Settings → About links to the privacy policy, the terms and a support email
(`components/settings/legal-card.tsx`), so the policy is reachable inside the app as Play's User
Data policy requires.

## Let us know about the content of your app

### Set privacy policy

`https://thechatroute.com/privacy`

### Sign-in details (App access)

- *All or some functionality is restricted*: yes.
- Add one instruction set per role, all with password sign-in and two-factor off:

| Name | Username | Password | Notes |
|---|---|---|---|
| Customer | `<email>` | `<password>` | Member of a demo organisation with at least one conversation |
| Agent | `<email>` | `<password>` | Staff in the same organisation, with an unassigned thread waiting |
| Admin | `<email>` | `<password>` | Admin of the same organisation |
| Spare customer | `<email>` | `<password>` | For the reviewer to test Settings → Account → Delete account |

These accounts do not exist yet. Create them on production before submitting. Paste the review
notes from `publishing.md` (*Review notes*) into *Any other information*.

### Ads

**Yes, my app contains ads.**

The app loads no ad SDK, but the Wall has a post kind `ad` that organisation admins publish and the
app labels *Sponsored* (`lib/wall-kind.ts`, API `wallPostKinds`). Play counts sponsored and
promotional placements as ads, and answering No while the app can show a *Sponsored* card is a
policy risk. Answering Yes adds the *Contains ads* badge to the listing. Answer No only if the `ad`
kind is removed from both clients and the API first.

### Content rating

Start the IARC questionnaire with category *All other app types* (not a game) and email
support@thechatroute.com.

| Question | Answer |
|---|---|
| Violence, fear, sexuality, language, controlled substances, crude humour | No |
| Gambling or simulated gambling | No |
| Users can interact or exchange content with each other | **Yes** (messages, photos, voice notes, Wall posts) |
| Users can share their location with each other | No |
| App allows purchasing digital goods | No |
| Unrestricted internet access (in-app browser) | No. Links open in the phone's own browser |
| Is the app a web browser or search engine | No |
| News app | No |

Expected result: Everyone / PEGI 3 with the *Users Interact* interactive element. IARC sets the
final rating.

### Target audience

- Age groups: **18 and over** only.
- *Could your store listing unintentionally appeal to children?* No.

The privacy policy and terms both say 18 and over. Picking only 18+ keeps the app out of the
Families policy.

### Data safety

**Overview**

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | Yes |
| Is all of the user data collected by your app encrypted in transit? | Yes (HTTPS to api.thechatroute.com) |
| Do you provide a way for users to request that their data is deleted? | Yes |
| Account deletion URL | https://thechatroute.com/delete-account |

*Shared* is No for every row. Play does not count data sent to service providers that process it
for you (hosting, email delivery, Expo and Firebase push) as sharing.

**Data types**

| Category → type | Collected | Shared | Ephemeral | Required | Purposes |
|---|---|---|---|---|---|
| Personal info → Name | Yes | No | No | Required | App functionality, Account management |
| Personal info → Email address | Yes | No | No | Required | App functionality, Account management |
| Personal info → User IDs | Yes | No | No | Required | App functionality, Account management |
| Personal info → Phone number | Yes | No | No | Optional | Account management |
| Photos and videos → Photos | Yes | No | No | Optional | App functionality |
| Photos and videos → Videos | Yes | No | No | Optional | App functionality |
| Audio → Voice or sound recordings | Yes | No | No | Optional | App functionality |
| Files and docs | Yes | No | No | Optional | App functionality |
| Messages → Other in-app messages | Yes | No | No | Required | App functionality |
| App activity → Other user-generated content (Wall posts, reactions) | Yes | No | No | Optional | App functionality |
| Device or other IDs (push token, session device type and IP address) | Yes | No | No | Required | App functionality, Fraud prevention, security and compliance |

Not collected: location, contacts, calendar, financial info, health, web browsing, app info and
performance (no crash or analytics SDK), advertising ID.

Messages, photos, audio, files and Wall posts are kept in the other participants' conversations
after account deletion, shown without the sender's name. The deletion page says so; nothing else
needs declaring for that in the form.

### Government apps

No. The app is not developed by or on behalf of a government.

### Financial features

*My app doesn't provide any financial features.*

### Health

*My app does not have any health features.*

## Manage how your app is organised and presented

### Select an app category and provide contact details

| Field | Value |
|---|---|
| App or game | App |
| Category | Business |
| Tags | Business communication, Customer support, Team collaboration, Messaging, Productivity |
| Email | support@thechatroute.com |
| Phone | optional, leave empty |
| Website | https://thechatroute.com |

### Set up your Store Listing

Copy from `listing.md`: app name *ChatRoute*, the short description, the full description, and the
release notes. Graphics from `screenshots/` and `generated/`:

| Asset | Size | File |
|---|---|---|
| App icon | 512 × 512 PNG | export from `assets/images/icon.png` |
| Feature graphic | 1024 × 500 | `generated/feature-graphic.png` |
| Phone screenshots | 2 to 8 | `screenshots/phone-01.png` to `phone-08.png` |
| 7-inch tablet | optional | `screenshots/tablet-7-*.png` |
| 10-inch tablet | optional | `screenshots/tablet-10-*.png` |

## Before you press Submit

- Create the four review accounts above on production.
- Make support@thechatroute.com a working inbox. The privacy policy promises a reply within 30 days.
- Deploy the web build with the updated legal pages, then reload the three URLs and check no
  bracketed placeholder is left.
- Check the final AAB's merged manifest against Play's *Permissions declaration*. The generated
  `android/` manifest lists CAMERA, RECORD_AUDIO, MODIFY_AUDIO_SETTINGS, READ/WRITE_EXTERNAL_STORAGE,
  VIBRATE, SYSTEM_ALERT_WINDOW and READ_MEDIA_AUDIO. `android/` is generated and may be stale:
  `app.json` blocks READ_MEDIA_AUDIO, and SYSTEM_ALERT_WINDOW normally comes from the dev client
  only.
- Have someone qualified read the privacy policy and terms. They are written from what the code
  does, under Australian law, and have not had legal review.
