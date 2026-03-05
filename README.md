# Portfolio Tracker

A **Nuxt 3** portfolio tracking web application that lets you manage and visualise your investment holdings across **crypto** and **stocks** in real-time.

> **⚠️ Disclaimer:** This application is for **informational and educational purposes only**. It is **not intended to provide investment advice**. Always do your own research and consult a qualified financial advisor before making any investment decisions.

---

## Features

- 📊 **Doughnut (pie) chart** showing portfolio allocation by asset
- 📈 **Bar chart** showing profit / loss per asset
- 💰 **Stats cards** — total value, cost basis, overall P&L and asset count
- ➕ **Add / remove assets** (crypto and stocks) with quantity and purchase price
- 🔄 **Live price refresh** via third-party APIs (CoinGecko for crypto, Alpha Vantage for stocks)
- 💾 **Persistent storage** — portfolio is saved in `localStorage` between sessions
- 📱 Fully **responsive** dark-mode UI (Tailwind CSS)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Nuxt 3](https://nuxt.com) |
| State management | [Pinia](https://pinia.vuejs.org) |
| Styling | [Tailwind CSS](https://tailwindcss.com) |
| Charts | [Chart.js](https://www.chartjs.org) + [vue-chartjs](https://vue-chartjs.org) |
| Crypto prices | [CoinGecko API](https://www.coingecko.com/en/api) |
| Stock prices | [Alpha Vantage API](https://www.alphavantage.co) |

---

## Prerequisites

- **Node.js** ≥ 18  (check with `node --version`)
- **npm** ≥ 9  (comes with Node.js)

---

## Getting Started

### 1 — Clone the repository

```bash
git clone https://github.com/rgxcode/portfilo-tracker.git
cd portfilo-tracker
```

### 2 — Install dependencies

```bash
npm install
```

### 3 — Configure API keys

Copy the example environment file and fill in your keys:

```bash
cp .env.example .env
```

Open `.env` and set the following variables:

```env
# CoinGecko API Key — optional for the free tier (no key needed for basic use)
# Get a free key: https://www.coingecko.com/en/api
NUXT_PUBLIC_COINGECKO_API_KEY=

# Alpha Vantage API Key — required for stock price lookups
# Get a free key: https://www.alphavantage.co/support/#api-key
NUXT_PUBLIC_ALPHA_VANTAGE_API_KEY=YOUR_ALPHA_VANTAGE_API_KEY
```

> **Note:** Crypto prices work out-of-the-box without any key (CoinGecko free tier).  
> Stock prices require a free Alpha Vantage key.

### 4 — Run the development server

```bash
npm run dev
```

Open your browser at **http://localhost:3000**.

---

## Production Build

```bash
# Build for production
npm run build

# Preview the production build locally
npm run preview
```

To deploy the built output run:

```bash
node .output/server/index.mjs
```

---

## Project Structure

```
portfilo-tracker/
├── app.vue                    # Root app component
├── nuxt.config.ts             # Nuxt configuration (modules, runtimeConfig)
├── tailwind.config.ts         # Tailwind CSS configuration
├── .env.example               # Environment variable template
│
├── assets/
│   └── css/main.css           # Global Tailwind CSS entry point
│
├── components/
│   ├── AllocationPieChart.vue # Doughnut chart — portfolio allocation
│   ├── ProfitLossBarChart.vue # Bar chart — P&L per asset
│   ├── AssetCard.vue          # Individual asset row card
│   ├── AssetForm.vue          # Add-asset form
│   └── StatsCard.vue          # Summary metric card
│
├── composables/
│   └── useMarketData.ts       # API calls (CoinGecko + Alpha Vantage)
│
├── layouts/
│   └── default.vue            # Navigation shell layout
│
├── pages/
│   ├── index.vue              # Dashboard (charts + holdings overview)
│   └── assets.vue             # Asset management (add / remove)
│
└── stores/
    └── portfolio.ts           # Pinia store — state, getters, actions, persistence
```

---

## Adding an Asset

1. Navigate to **Assets** in the top navigation bar, or click **+ Add Asset** on the dashboard.
2. Select the asset type: **Crypto** or **Stock**.
3. Enter the **symbol** (e.g. `BTC`, `ETH`, `AAPL`, `TSLA`).
4. Enter the **name**, **quantity**, and **purchase price**.
5. Click **Add Asset** — the app will immediately attempt to fetch the current price.

### Supported Crypto Symbols (auto price fetch)

`BTC`, `ETH`, `SOL`, `BNB`, `XRP`, `ADA`, `DOGE`, `DOT`, `AVAX`, `MATIC`, `LINK`, `UNI`, `LTC`, `ATOM`, `XLM`, `NEAR`, `ALGO`, `ICP`, `SHIB`, `TRX`

> Any stock symbol supported by Alpha Vantage (e.g. `AAPL`, `MSFT`, `TSLA`, `GOOGL`) will work once you have configured your API key.

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `NUXT_PUBLIC_COINGECKO_API_KEY` | No | CoinGecko API key for higher rate limits |
| `NUXT_PUBLIC_ALPHA_VANTAGE_API_KEY` | For stocks | Alpha Vantage API key for stock price data |

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server (hot-reload) |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build locally |
| `npm run generate` | Generate a static site |
| `npm run postinstall` | Prepare Nuxt types (runs automatically after install) |