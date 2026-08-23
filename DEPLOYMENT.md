# Deployment

The app is designed to run on free tiers. Four pieces, each independently replaceable:

| Piece | Host | Free tier notes |
|---|---|---|
| Database | MongoDB Atlas **M0** | 512 MB, free indefinitely, no card required |
| Backend API | **Render** web service | Sleeps after ~15 min idle → first request takes ~50s |
| Frontend | **Cloudflare Pages** | Static files, unlimited bandwidth |
| Price job | **GitHub Actions** cron | ~96 runs/day fits the 2,000 free minutes for private repos |

Nothing here is vendor-specific: the backend is a plain Node process and the frontend
is static output, so swapping Render for Fly.io or Pages for Netlify is configuration,
not a rewrite.

## Why the job runs in GitHub Actions

Free web services sleep when idle, which would silently stop a timer running inside
the backend. An external scheduler keeps working regardless. This is also why the
price snapshot lives in MongoDB rather than a JSON file — the job and the API run on
different machines with separate, ephemeral filesystems, so they can only share state
through the database.

---

## 1. MongoDB Atlas

1. Create a free **M0** cluster at <https://cloud.mongodb.com>.
2. **Database Access** → add a user with a strong password.
3. **Network Access** → allow `0.0.0.0/0`. Render and GitHub Actions do not publish
   fixed egress IPs, so an allowlist cannot be narrowed usefully here; the database
   is protected by its credentials.
4. Copy the connection string (`mongodb+srv://…`) and append the database name:
   `…mongodb.net/portfolio-tracker?retryWrites=true&w=majority`

Migrate local data if you want to keep it:

```bash
mongodump --uri="mongodb://127.0.0.1:27017/portfolio-tracker" --out=/tmp/dump
mongorestore --uri="<ATLAS_URI>" --nsFrom='portfolio-tracker.*' --nsTo='portfolio-tracker.*' /tmp/dump
```

Verify locally before deploying anything:

```bash
cd backend && MONGODB_URI="<ATLAS_URI>" node src/jobs/fetchPrices.js
```

M0 clusters pause after ~60 days of inactivity. The 15-minute cron prevents that.

## 2. Backend on Render

`render.yaml` in the repo root defines the service: **New → Blueprint → select this repo**.
Set these environment variables when prompted:

| Variable | Value |
|---|---|
| `MONGODB_URI` | the Atlas connection string |
| `JWT_SECRET` | a fresh random string — `openssl rand -base64 32` |
| `COINGECKO_API_KEY` | optional; raises rate limits |
| `ALPHA_VANTAGE_API_KEY` | optional; only used as a stock fallback |

Check `https://<your-service>.onrender.com/api/health` returns `{"status":"ok"}`.

**Do not reuse the local `JWT_SECRET`.** It is a development placeholder and is in the
repo's `.env.example`.

## 3. Frontend on Cloudflare Pages

**Workers & Pages → Create → Pages → Connect to Git**:

| Setting | Value |
|---|---|
| Build command | `npm run generate` |
| Build output directory | `.output/public` |
| Root directory | `frontend` |
| Environment variable | `NUXT_PUBLIC_API_BASE_URL` = your Render URL |

Use `.output/public`, not `dist`. Nuxt creates `dist` as a *symlink* to it, and most
static hosts do not follow symlinks — pointing at `dist` is a common way to get an
empty deploy.

The API base URL is baked in at build time, so changing it needs a rebuild, not just a
redeploy.

## 4. Scheduled price job

`.github/workflows/fetch-prices.yml` is already in the repo. Add the secrets under
**Settings → Secrets and variables → Actions**:

- `MONGODB_URI` (required)
- `COINGECKO_API_KEY`, `ALPHA_VANTAGE_API_KEY` (optional)

Trigger it once by hand from the Actions tab (**Run workflow**) rather than waiting 15
minutes to find out whether it works.

## 5. CORS

The backend currently allows every origin (`cors()` with no options in
`backend/src/server.js`). Once the frontend has a real URL, restrict it:

```js
app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? '*' }))
```

and set `FRONTEND_ORIGIN` on Render.

---

## What stays local

The **LLM price agent** (`backend/src/agents/opencodePriceAgent.js`) needs the
`opencode` CLI installed and spawns a process per lookup, so it does not fit a free
web tier. It works fine on your machine writing to Atlas — point `MONGODB_URI` at the
cluster and the deployed app will serve its snapshot through `/api/prices/llm`.
It could also run as its own GitHub Actions workflow, at the cost of a run per cycle.

## Known trade-offs

- **Cold starts.** Render's free plan sleeps. A ~10-minute keep-alive ping avoids it,
  at the cost of consuming Actions minutes.
- **Cron drift.** GitHub delays scheduled workflows under load; 15 minutes is nominal.
- **Free tiers change.** Verify current limits before relying on any of the above.
