# NYC Transit Hub — Greybox

## 1. Project Overview

NYC Transit Hub is a team project by Greybox that helps users access NYC transit information in one place.

The project is currently in the initial backend setup stage.

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
git clone -b feat/interactive-map https://github.com/zDz08/greybox-nyc-transit-hub.git
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
| `FIREBASE_PROJECT_ID` | Firebase project ID; configure when authentication is added. |
| `GOOGLE_APPLICATION_CREDENTIALS` | Local path to the Firebase/Google service account credentials file, when needed. |

MongoDB and Firebase credentials can remain blank during the initial setup.

## 5. Run and Verify


| Terminal | Command |
| --- | --- |
| Backend | `npm run dev --prefix server` |
| Frontend | `npm run dev --prefix client` |

Keep both terminals running. Open the **Local** URL printed by Vite
(usually http://localhost:5173).