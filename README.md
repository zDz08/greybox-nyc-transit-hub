# Greybox · NYC Transit Hub

Local setup (macOS or Windows): install **Node.js 24.x**, npm and Git.

**First time:** clone the map branch and install both sets of dependencies.

```sh
git clone -b feat/interactive-map https://github.com/zDz08/greybox-nyc-transit-hub.git
cd greybox-nyc-transit-hub
npm ci --prefix server
npm ci --prefix client
```

Copy `server/.env.example` to `server/.env` in your editor. Keep the defaults: the station map uses NY Open Data and needs no API keys.

**Start the app:** open two terminals in the project root and keep both running.

| Terminal | Command |
| --- | --- |
| 1 · Backend | `npm run dev --prefix server` |
| 2 · Frontend | `npm run dev --prefix client` |

Open the **Local** URL printed by Vite (usually http://localhost:5173).
