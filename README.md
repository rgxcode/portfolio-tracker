# Portfolio Tracker

A full-stack portfolio tracking application with a **Nuxt 3** frontend and an **Express** API backend backed by **MongoDB**.

## Project Structure

```
portfolio-tracker/
├── frontend/          # Nuxt 3 frontend (Vue, Tailwind CSS, Pinia)
│   ├── components/
│   ├── composables/
│   ├── layouts/
│   ├── pages/
│   ├── stores/
│   ├── nuxt.config.ts
│   └── package.json
├── backend/           # Express API (Mongoose + Cosmos DB)
│   ├── src/
│   │   ├── models/
│   │   ├── routes/
│   │   └── server.js
│   └── package.json
├── .github/workflows/ # CI/CD pipelines
└── package.json       # Root convenience scripts
```

## Getting Started

### Install all dependencies

```bash
npm run install:all
```

### Run frontend (Nuxt dev server)

```bash
npm run dev:frontend
```

### Local database

The app runs against a MongoDB instance on `127.0.0.1:27017`. This machine uses a
standalone MongoDB 8.0 installed under `~/.local/mongodb` (no Homebrew required):

```bash
# One-time install
mkdir -p ~/.local/mongodb && cd ~/.local/mongodb
curl -fLO https://fastdl.mongodb.org/osx/mongodb-macos-arm64-8.0.12.tgz
tar xzf mongodb-macos-arm64-8.0.12.tgz
mkdir -p data log
```

It is kept running by a launchd agent at `~/Library/LaunchAgents/local.mongodb.plist`,
which starts it at login and restarts it if it exits:

```bash
launchctl load   ~/Library/LaunchAgents/local.mongodb.plist   # start / enable
launchctl unload ~/Library/LaunchAgents/local.mongodb.plist   # stop / disable
tail -f ~/.local/mongodb/log/mongod.log                       # logs
```

Data lives in `~/.local/mongodb/data`; back that directory up to keep your portfolio.

### Run backend (Express API)

```bash
# Copy and configure backend env
cp backend/.env.example backend/.env
# The default connection string already points at the local MongoDB above

npm run dev:backend
```

## Deployment

Currently local-only. The frontend, backend, and database all run on this machine;
there is no cloud infrastructure in use.
