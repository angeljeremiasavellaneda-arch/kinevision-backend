import { Router } from 'express'
import { requireAuth, supabase } from '../middleware/auth.js'

const router = Router()

// ── GET profile ───────────────────────────────────────────────
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('perfil_usuario')
      .select('*')
      .eq('usuario_id', req.user.id)
      .single()

    if (error && error.code !== 'PGRST116') throw error  // PGRST116 = row not found
    console.log(`[perfil] GET  user=${req.user.id}  encontrado=${!!data}`)
    res.json(data || null)
  } catch (e) { next(e) }
})

// ── POST / upsert profile ─────────────────────────────────────
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const {
      nombre, edad, altura_cm, peso_kg,
      horas_sentado_dia, tipo_trabajo,
      dolores_frecuentes, condiciones,
      actividad_fisica, objetivo,
    } = req.body

    console.log(`[perfil] UPSERT  user=${req.user.id}  nombre=${nombre}  objetivo=${objetivo}`)

    const { data, error } = await supabase
      .from('perfil_usuario')
      .upsert({
        usuario_id:        req.user.id,
        nombre,
        edad:              edad           ? parseInt(edad)          : null,
        altura_cm:         altura_cm      ? parseInt(altura_cm)     : null,
        peso_kg:           peso_kg        ? parseFloat(peso_kg)     : null,
        horas_sentado_dia: horas_sentado_dia ? parseInt(horas_sentado_dia) : null,
        tipo_trabajo,
        dolores_frecuentes,
        condiciones,
        actividad_fisica,
        objetivo,
      }, { onConflict: 'usuario_id' })
      .select()
      .single()

    if (error) throw error
    console.log(`[perfil] UPSERT  → id=${data.id}  OK`)
    res.json(data)
  } catch (e) { next(e) }
})

export default router
