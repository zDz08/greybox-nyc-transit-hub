# NYC Transit Hub — Greybox

## 1. Project Overview

NYC Transit Hub is a team project by Greybox that helps users access NYC transit information in one place.

The app includes an interactive subway map with station search and details. Firebase account features are available when configured.

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
| `MONGODB_URI` | MongoDB connection string; configure when database integration is added. |
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
3. Restart both dev servers, then select **Sign in / Sign up** in the app. Firebase manages passwords and sessions. The app sends the ID token to `GET /api/auth/me` so the server can verify it and return the account identity.

### Test locally without a Firebase project

Create a `firebase.json` in a temporary directory with this [Auth emulator](https://firebase.google.com/docs/emulator-suite/connect_auth) configuration:

```json
{"emulators":{"auth":{"host":"127.0.0.1","port":9099},"ui":{"enabled":false}}}
```

From that directory, run `npx firebase-tools emulators:start --only auth --project demo-greybox`. In the app, use `demo-greybox` as the project ID in both env files, set `VITE_FIREBASE_API_KEY=demo-key`, and enable the emulator settings shown in both `.env.example` files. Keep `NODE_ENV=development` on the server. Restart both dev servers and register with a test email and password.
