# NYC Transit Hub — Greybox

## 1. Project Overview

NYC Transit Hub is a team project by Greybox that helps users access NYC transit information in one place.

The app includes an interactive subway map with station search, accessibility information, and arrival estimates. Firebase Auth and MongoDB enable personal saved commutes.

## 2. Requirements

- Node.js 24.x
- npm (included with Node.js)
- Git
- Any code editor of your choice

Check your installation:

```bash
node --version
npm --version
git --version
```

## 3. First-time setup

```bash
git clone https://github.com/zDz08/greybox-nyc-transit-hub.git
cd greybox-nyc-transit-hub
npm ci --prefix server
npm ci --prefix client
```

These commands work on both macOS and Windows.

## 4. Environment Variables

Inside the `server` directory, copy `.env.example` to `.env`.

macOS or Windows Git Bash:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Alternatively, duplicate `.env.example` in your editor and rename the copy to `.env`.

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | Runtime environment; use `development` locally. |
| `PORT` | Backend port; defaults to `3000` in the example. |
| `TRANSIT_DATA_MODE` | Intended transit data mode; start with `open-data`. |
| `MONGODB_URI` | Server-only MongoDB connection string for user profiles and saved commutes. |
| `MONGODB_DB_NAME` | MongoDB database name; use `greybox_transit`. |
| `FIREBASE_PROJECT_ID` | Firebase project ID for verifying account sessions. |
| `GOOGLE_APPLICATION_CREDENTIALS` | Local path to the Firebase/Google service account credentials file, when needed. |

MongoDB and Firebase settings can remain blank when running the map without accounts.

## 5. Run and Verify


| Terminal | Command |
| --- | --- |
| Backend | `npm run dev --prefix server` |
| Frontend | `npm run dev --prefix client` |

Keep both terminals running. Open the **Local** URL printed by Vite
(usually http://localhost:5173).

## 6. Enable sign-up and sign-in

1. In the team's Firebase project, register a web app and enable the **Email/Password** sign-in provider under **Authentication**.
2. Copy `client/.env.example` to `client/.env` and fill in the web app configuration from Firebase Project settings. Use the same project ID for `FIREBASE_PROJECT_ID` in `server/.env`.
3. Set `MONGODB_URI` in `server/.env` to the team's MongoDB connection string. For a local MongoDB server, use `mongodb://127.0.0.1:27017`. `MONGODB_DB_NAME` defaults to `greybox_transit`.
4. Restart both dev servers, open **Settings → Account**, then select **Sign in / Sign up**. Firebase manages passwords and sessions. The app sends the ID token to `GET /api/users/me`, which verifies it and creates or loads the MongoDB user profile.

The `users` collection uses the verified Firebase UID as `_id`. Each profile stores its email and `savedCommutes`. Each commute identifies a station, line, and platform direction, with display labels. Concurrent or repeated saves keep one entry per combination. Existing profile fields are preserved.

On the map, select a station, a line, and a direction, then choose **Save this direction**. The **Saved** page lists personal commutes and supports opening them on the map or removing them. Account state is shared across pages. If MongoDB is temporarily unavailable, the account and Saved pages offer a retry.

Authenticated account endpoints use `Authorization: Bearer <Firebase ID token>`:

| Method | Endpoint | Behavior |
| --- | --- | --- |
| GET | `/api/auth/me` | Verify the Firebase identity without accessing MongoDB. |
| GET | `/api/users/me` | Create or load the current user's profile and saved commutes. |
| PUT | `/api/users/me/saved-commutes/:id` | Save a commute once. Send `stationId`, `routeId`, `stopId`, `stationName`, and `directionLabel` as JSON. The ID is the URL-encoded `stationId:routeId:stopId`. |
| DELETE | `/api/users/me/saved-commutes/:id` | Remove that commute from the current user's profile. |

### Test locally without a Firebase project

Create a `firebase.json` in a temporary directory with this [Auth emulator](https://firebase.google.com/docs/emulator-suite/connect_auth) configuration:

```json
{"emulators":{"auth":{"host":"127.0.0.1","port":9099},"ui":{"enabled":false}}}
```

From that directory, run `npx firebase-tools emulators:start --only auth --project demo-greybox`. In the app, use `demo-greybox` as the project ID in both env files, set `VITE_FIREBASE_API_KEY=demo-key`, and enable the emulator settings shown in both `.env.example` files. Keep `NODE_ENV=development` on the server. Restart both dev servers and register with a test email and password.

Run MongoDB locally and set `MONGODB_URI=mongodb://127.0.0.1:27017` to test saved commutes with the Auth emulator. The MongoDB database persists independently of Firebase emulator accounts. To reuse those accounts across emulator restarts, export and import the Auth emulator data using the Firebase CLI.

Scheduled route display and live arrivals also require GTFS source files under `server/data/gtfs/`, including `stops.txt`, `trips.txt`, `stop_times.txt`, `calendar.txt`, and `calendar_dates.txt`. This directory is ignored by Git. Use the GTFS release that matches the generated route shapes. When using a new release, also include `routes.txt` and `shapes.txt`, then run `node server/scripts/buildRouteShapes.js` from the repository root to regenerate the shapes.

### Run account integration tests

With MongoDB and the Auth emulator running, set `MONGODB_URI`, `FIREBASE_PROJECT_ID=demo-greybox`, and `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` in `server/.env`, then run:

```bash
npm run test:accounts --prefix server
```

The tests create a uniquely named `greybox_accounts_test_...` database and two temporary emulator accounts, then remove them at the end. They cover concurrent first logins and saves, existing profile fields, account isolation, invalid requests, API restarts, database connection retries, and repeated removal. The account tests use sample station data and can run without the GTFS files.
