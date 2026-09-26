/**
 * /api/sesiones — CRUD for posture + rehab sessions.
 * Full console logging. Handles local-xxx IDs gracefully (no UUID crash).
 */
import { Router } from 'express'
import { requireAuth, supabase } from '../middleware/auth.js'

const router = Router()
const isLocalId = (id) => typeof id === 'string' && id.startsWith('local-')

// ── List sessions ─────────────────────────────────────────────
router.get('/', requireAuth, async (req, res, next) => {
  try {
    console.log(`[sesiones] GET list  user=${req.user.id}`)
    let { data, error } = await supabase
      .from('sesiones')
      .select(`id, tipo, ejercicio_id, fecha, duracion_segundos,
        resultados_analisis (nivel_riesgo, texto_analisis, recomendaciones, reps_ok, reps_total, fecha)`)
      .eq('usuario_id', req.user.id)
      .order('fecha', { ascending: false })
      .limit(50)
    if (error?.code === '42703') {
      // reps columns not yet added to DB — run migration, querying without them for now
      console.warn('[sesiones] reps columns missing — run: ALTER TABLE resultados_analisis ADD COLUMN IF NOT EXISTS reps_ok INT; ADD COLUMN IF NOT EXISTS reps_total INT;')
      ;({ data, error } = await supabase
        .from('sesiones')
        .select(`id, tipo, ejercicio_id, fecha, duracion_segundos,
          resultados_analisis (nivel_riesgo, texto_analisis, recomendaciones, fecha)`)
        .eq('usuario_id', req.user.id)
        .order('fecha', { ascending: false })
        .limit(50))
    }
    if (error) throw error
    console.log(`[sesiones] GET list  → ${data.length} sesiones`)
    res.json(data)
  } catch (e) { next(e) }
})

// ── Get single session ────────────────────────────────────────
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params
    if (isLocalId(id)) {
      console.log(`[sesiones] GET  id=${id} → sesión local, devolviendo demo`)
      return res.json(makeDemoSession(id))
    }
    console.log(`[sesiones] GET  id=${id}  user=${req.user.id}`)
    let { data, error } = await supabase
      .from('sesiones')
      .select(`id, tipo, ejercicio_id, fecha, duracion_segundos,
        resultados_analisis (nivel_riesgo, texto_analisis, recomendaciones, reps_ok, reps_total, fecha)`)
      .eq('id', id)
      .eq('usuario_id', req.user.id)
      .single()
    if (error?.code === '42703') {
      ;({ data, error } = await supabase
        .from('sesiones')
        .select(`id, tipo, ejercicio_id, fecha, duracion_segundos,
          resultados_analisis (nivel_riesgo, texto_analisis, recomendaciones, fecha)`)
        .eq('id', id)
        .eq('usuario_id', req.user.id)
        .single())
    }
    if (error) throw error
    if (!data) return res.status(404).json({ message: 'Session not found' })
    console.log(`[sesiones] GET  id=${id} → tipo=${data.tipo} resultado=${data.resultados_analisis?.length > 0 ? 'SI' : 'NO'}`)
    res.json(data)
  } catch (e) { next(e) }
})

// ── Create session ────────────────────────────────────────────
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { tipo, ejercicio_id } = req.body
    if (!tipo) return res.status(400).json({ message: 'tipo is required' })
    console.log(`[sesiones] CREATE  user=${req.user.id}  tipo=${tipo}  ejercicio_id=${ejercicio_id || 'N/A'}`)
    const { data, error } = await supabase
      .from('sesiones')
      .insert({ usuario_id: req.user.id, tipo, ejercicio_id: ejercicio_id || null, fecha: new Date().toISOString() })
      .select().single()
    if (error) throw error
    console.log(`[sesiones] CREATE  → id=${data.id}`)
    res.status(201).json(data)
  } catch (e) { next(e) }
})

// ── Finalize session ──────────────────────────────────────────
router.patch('/:id/finalizar', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params
    const { duracion_segundos, datos_crudos } = req.body

    console.log(`\n${'='.repeat(60)}`)
    console.log(`[sesiones] FINALIZE  id=${id}  dur=${duracion_segundos}s  frames=${datos_crudos?.length ?? 0}`)

    // Local session — no UUID in Supabase
    if (isLocalId(id)) {
      console.warn(`[sesiones] FINALIZE  id local — omitiendo Supabase, disparando análisis de todos modos`)
      const perfil = await fetchPerfil(req.user.id)
      const stats  = calcStats(datos_crudos)
      console.log(`[sesiones] FINALIZE  stats: avgScore=${stats.avgScore}  pctBad=${stats.pctBad}%`)
      triggerN8nWebhook({ session_id: id, user_id: req.user.id, tipo: 'postura_vivo',
        duracion_segundos, datos_crudos, perfil, user_email: req.user.email, stats })
        .catch(err => console.error(`[n8n] ❌ webhook falló: ${err.message}`))
      console.log(`${'='.repeat(60)}\n`)
      return res.json({ id, tipo: 'postura_vivo', duracion_segundos })
    }

    // Real UUID session
    const { data: session, error: sessionError } = await supabase
      .from('sesiones')
      .update({ duracion_segundos, datos_crudos })
      .eq('id', id).eq('usuario_id', req.user.id)
      .select().single()
    if (sessionError) throw sessionError
    if (!session) return res.status(404).json({ message: 'Session not found' })

    const perfil = await fetchPerfil(req.user.id)
    logPerfil(perfil)

    const stats = calcStats(datos_crudos)
    console.log(`[sesiones] FINALIZE  stats: avgScore=${stats.avgScore ?? 'N/A'}  minScore=${stats.minScore ?? 'N/A'}  mala_postura=${stats.pctBad}%`)
    console.log(`[sesiones] FINALIZE  reps_ok=${stats.reps_ok ?? 'N/A'}  reps_total=${stats.reps_total ?? 'N/A'}`)
    console.log(`${'='.repeat(60)}\n`)

    triggerN8nWebhook({
      session_id: session.id, user_id: req.user.id, tipo: session.tipo,
      ejercicio_id: session.ejercicio_id, duracion_segundos: session.duracion_segundos,
      datos_crudos, perfil: perfil || {}, user_email: req.user.email, stats,
    }).catch(err => console.error(`[n8n] ❌ webhook falló: ${err.message}`))

    res.json(session)
  } catch (e) { next(e) }
})

// ── Helpers ───────────────────────────────────────────────────
async function fetchPerfil(userId) {
  const { data, error } = await supabase
    .from('perfil_usuario')
    .select('nombre, edad, altura_cm, peso_kg, horas_sentado_dia, tipo_trabajo, dolores_frecuentes, condiciones, actividad_fisica, objetivo')
    .eq('usuario_id', userId)
    .maybeSingle()   // returns null (no error) when row doesn't exist
  if (error) console.warn(`[sesiones] error al obtener perfil user=${userId}: ${error.message}`)
  if (data) console.log(`[sesiones] perfil encontrado para user=${userId}  nombre=${data.nombre}`)
  else console.warn(`[sesiones] sin perfil para user=${userId} — completa el onboarding`)
  return data || null
}

function logPerfil(perfil) {
  if (!perfil) {
    console.warn(`[sesiones] ADVERTENCIA: sin perfil — Gemini usará contexto mínimo`)
    return
  }
  console.log(`[sesiones] perfil:`)
  console.log(`  nombre: ${perfil.nombre}  edad: ${perfil.edad}  ${perfil.altura_cm ?? '—'}cm / ${perfil.peso_kg ?? '—'}kg`)
  console.log(`  trabajo: ${perfil.tipo_trabajo}  actividad: ${perfil.actividad_fisica}  objetivo: ${perfil.objetivo}`)
  console.log(`  dolores: ${perfil.dolores_frecuentes || 'ninguno'}  condiciones: ${perfil.condiciones || 'ninguna'}`)
}

function calcStats(datos_crudos) {
  const frames = Array.isArray(datos_crudos) ? datos_crudos : []
  const scores  = frames.map(f => f.puntuacion).filter(v => v != null)
  const avgScore   = scores.length ? Math.round(scores.reduce((a,b) => a+b,0) / scores.length) : null
  const minScore   = scores.length ? Math.min(...scores) : null
  const badFrames  = frames.filter(f => f.estado === 'mala').length
  const pctBad     = frames.length ? Math.round((badFrames / frames.length) * 100) : 0
  // reps are cumulative counters — take the last frame's value, not the sum
  const lastFrame  = frames[frames.length - 1]
  const reps_ok    = lastFrame?.reps_ok    != null ? lastFrame.reps_ok    : null
  const reps_total = lastFrame?.reps_total != null ? lastFrame.reps_total : null
  return { avgScore, minScore, pctBad, reps_ok, reps_total }
}

function makeDemoSession(id) {
  return {
    id, tipo: 'postura_vivo', fecha: new Date().toISOString(), duracion_segundos: 60,
    resultados_analisis: [{
      nivel_riesgo: 'medio',
      texto_analisis: 'Sesión completada localmente. Conecta el backend y configura Supabase para guardar resultados.',
      recomendaciones: ['Asegúrate de que el backend esté corriendo.', 'Verifica la conexión a Supabase.', 'Completa el onboarding para personalizar los análisis.'],
    }],
  }
}

async function triggerN8nWebhook(payload) {
  const n8nUrl = process.env.N8N_WEBHOOK_URL
  if (!n8nUrl || n8nUrl.includes('PENDIENTE')) {
    console.warn('[n8n] ⚠️  N8N_WEBHOOK_URL no configurada — análisis Gemini OMITIDO')
    return
  }
  console.log(`[n8n] → POST ${n8nUrl}`)
  console.log(`[n8n]   session=${payload.session_id}  tipo=${payload.tipo}  perfil=${payload.perfil?.nombre || 'sin perfil'}`)
  const res = await fetch(n8nUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(15000),
  })
  const text = await res.text()
  if (!res.ok) {
    console.error(`[n8n] ❌ n8n respondió ${res.status}: ${text}`)
    throw new Error(`n8n responded with ${res.status}`)
  }
  console.log(`[n8n] ✅ OK  status=${res.status}`)
  try { return JSON.parse(text) } catch { return { raw: text } }
}

export default router
