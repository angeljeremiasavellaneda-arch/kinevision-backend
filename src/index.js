import 'dotenv/config'
import express from 'express'
import cors    from 'cors'

import sesionesRouter   from './routes/sesiones.js'
import perfilRouter     from './routes/perfil.js'
import rachaRouter      from './routes/racha.js'
import ejerciciosRouter from './routes/ejercicios.js'
import webhookRouter    from './webhooks/n8n.js'

const app  = express()
const PORT = process.env.PORT || 4000

// ── CORS ──────────────────────────────────────────────────────
// Acepta localhost en dev y el dominio de Vercel en producción.
// FRONTEND_URL puede ser una lista separada por comas:
//   FRONTEND_URL=https://kinevision.vercel.app,http://localhost:3000
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

app.use(cors({
  origin: (origin, callback) => {
    // Permitir peticiones sin origin (Postman, curl, webhooks de n8n)
    if (!origin) return callback(null, true)
    if (allowedOrigins.includes(origin)) return callback(null, true)
    console.warn(`[cors] bloqueado: ${origin}`)
    callback(new Error(`CORS: origen no permitido → ${origin}`))
  },
  credentials: true,
}))
app.use(express.json({ limit: '2mb' }))

// ── Rutas ─────────────────────────────────────────────────────
app.use('/api/sesiones',   sesionesRouter)
app.use('/api/perfil',     perfilRouter)
app.use('/api/racha',      rachaRouter)
app.use('/api/ejercicios', ejerciciosRouter)
app.use('/webhook',        webhookRouter)

// ── Health check ─────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }))

// ── Manejador de errores global ───────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[error]', err)
  res.status(err.status || 500).json({ message: err.message || 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`🚀 KineVisión backend corriendo en http://localhost:${PORT}`)
  console.log(`   CORS permitido: ${allowedOrigins.join(', ')}`)
})
