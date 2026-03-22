# Portfolio Tracker

A full-stack portfolio tracking application with a **Nuxt 3** frontend and an **Express** API backend backed by **Azure Cosmos DB** (MongoDB API).

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

### Run backend (Express API)

```bash
# Copy and configure backend env
cp backend/.env.example backend/.env
# Edit backend/.env with your Cosmos DB connection string

npm run dev:backend
```

## Deployment

- **Frontend**: Deployed automatically to Azure Static Web Apps on push to `main`.
- **Backend**: Deploy to Azure App Service or Azure Functions (Consumption plan) when ready.
- **Database**: Azure Cosmos DB with MongoDB API (Free Tier).
