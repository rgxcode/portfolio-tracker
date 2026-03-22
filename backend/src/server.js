import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import authRouter from './routes/auth.js'
import assetsRouter from './routes/assets.js'

// Load .env manually (avoid dotenv dependency)
const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  const envPath = resolve(__dirname, '..', '.env')
  const envContent = readFileSync(envPath, 'utf-8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue
    const key = trimmed.slice(0, eqIndex).trim()
    const value = trimmed.slice(eqIndex + 1).trim()
    if (!process.env[key]) process.env[key] = value
  }
} catch {
  // .env file not found — rely on environment variables
}

const PORT = process.env.PORT || 4000
const COSMOS_DB_CONNECTION_STRING =
  process.env.COSMOS_DB_CONNECTION_STRING || 'mongodb://localhost:27017/portfolio-tracker'

const app = express()

app.use(cors())
app.use(express.json())

// Routes
app.use('/api/auth', authRouter)
app.use('/api/assets', assetsRouter)

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Error handler
app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
})

// Connect to database and start server
async function start() {
  try {
    await mongoose.connect(COSMOS_DB_CONNECTION_STRING, {
      serverSelectionTimeoutMS: 10000,
    })
    console.log('Connected to database')
  } catch (err) {
    console.error('Database connection failed:', err.message)
    console.log('Starting server without database — API calls will fail')
  }

  app.listen(PORT, () => {
    console.log(`Backend API running on http://localhost:${PORT}`)
  })
}

start()
