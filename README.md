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

## 3. Download and Install

```bash
git clone https://github.com/zDz08/greybox-nyc-transit-hub
cd greybox-nyc-transit-hub/server
npm ci
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
| `TRANSIT_DATA_MODE` | Intended transit data mode; start with `mock`. |
| `MONGODB_URI` | MongoDB connection string; configure when database integration is added. |
| `MONGODB_DB_NAME` | MongoDB database name; use `greybox_transit`. |
| `FIREBASE_PROJECT_ID` | Firebase project ID; configure when authentication is added. |
| `GOOGLE_APPLICATION_CREDENTIALS` | Local path to the Firebase/Google service account credentials file, when needed. |

MongoDB and Firebase credentials can remain blank during the initial setup.

## 5. Run and Verify

From the `server` directory, start the development server:

```bash
npm run dev
```

Keep the terminal running, then open:

http://localhost:3000/api/health

Expected response:

```json
{
  "status": "ok",
  "project": "NYC Transit Hub",
  "team": "Greybox"
}
```