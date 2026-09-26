/**
 * /webhook/results — receives Gemini analysis from n8n and saves it to Supabase.
 * Full console logging so you can see exactly what Gemini returned.
 */
import { Router } from 'express'
import { supabase } from '../middleware/auth.js'

const router = Router()

router.post('/results', async (req, res, next) => {
  try {
    console.log(`\n${'★'.repeat(60)}`)
    console.log(`[webhook] ← RESULTADO GEMINI RECIBIDO`)

    // Validate secret
    const secret = req.headers['x-webhook-secret']
    if (process.env.WEBHOOK_SECRET && secret !== process.env.WEBHOOK_SECRET) {
      console.warn(`[webhook] ❌ Secret inválido: "${secret}"`)
      return res.status(401).json({ message: 'Invalid webhook secret' })
    }

    const { session_id, nivel_riesgo, texto_analisis, recomendaciones, user_id, reps_ok, reps_total } = req.body

    if (!session_id) {
      console.warn(`[webhook] ❌ Falta session_id en el body`)
      return res.status(400).json({ message: 'session_id is required' })
    }

    console.log(`[webhook]   session_id:    ${session_id}`)
    console.log(`[webhook]   user_id:       ${user_id || 'no enviado'}`)
    console.log(`[webhook]   nivel_riesgo:  ${nivel_riesgo}`)
    console.log(`[webhook]   análisis:      ${texto_analisis?.substring(0, 120)}...`)
    if (Array.isArray(recomendaciones)) {
      console.log(`[webhook]   recomendaciones (${recomendaciones.length}):`)
      recomendaciones.forEach((r, i) => console.log(`[webhook]     ${i+1}. ${r}`))
    }

    // Save to Supabase
    console.log(`[webhook] → guardando en Supabase...`)
    const { data, error } = await supabase
      .from('resultados_analisis')
      .insert({
        sesion_id:       session_id,
        nivel_riesgo:    nivel_riesgo || 'medio',
        texto_analisis:  texto_analisis || '',
        recomendaciones: Array.isArray(recomendaciones) ? recomendaciones : [recomendaciones].filter(Boolean),
        reps_ok:         reps_ok  != null ? parseInt(reps_ok)  : null,
        reps_total:      reps_total != null ? parseInt(reps_total) : null,
        fecha:           new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error(`[webhook] ❌ Error Supabase: ${error.message}`)
      throw error
    }

    console.log(`[webhook] ✅ resultado guardado  id=${data.id}`)

    // Update streak
    if (user_id) {
      await updateStreak(user_id)
    } else {
      console.warn(`[webhook] ⚠️  user_id no enviado — racha NO actualizada`)
    }

    console.log(`${'★'.repeat(60)}\n`)
    res.json({ ok: true, resultado_id: data.id })
  } catch (e) { next(e) }
})

async function updateStreak(userId) {
  const today     = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

  const { data: racha } = await supabase
    .from('racha')
    .select('*')
    .eq('usuario_id', userId)
    .single()

  if (!racha) {
    await supabase.from('racha').insert({ usuario_id: userId, dias_consecutivos: 1, ultima_fecha: today })
    console.log(`[webhook] 🔥 racha iniciada (1 día) para user=${userId}`)
    return
  }

  if (racha.ultima_fecha === today) {
    console.log(`[webhook] 🔥 racha ya contada hoy (${racha.dias_consecutivos} días)`)
    return
  }

  const newDias = racha.ultima_fecha === yesterday ? racha.dias_consecutivos + 1 : 1
  await supabase.from('racha').update({ dias_consecutivos: newDias, ultima_fecha: today }).eq('usuario_id', userId)
  console.log(`[webhook] 🔥 racha actualizada: ${newDias} días  user=${userId}`)
}

export default router
