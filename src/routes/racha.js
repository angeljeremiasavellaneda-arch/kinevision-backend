import { Router } from 'express'
import { requireAuth, supabase } from '../middleware/auth.js'

const router = Router()

router.get('/', requireAuth, async (req, res, next) => {
  try {
    // Get or create streak record
    let { data, error } = await supabase
      .from('racha')
      .select('*')
      .eq('usuario_id', req.user.id)
      .single()

    if (error && error.code !== 'PGRST116') throw error

    if (!data) {
      // Initialize streak
      const { data: newRacha, error: insertError } = await supabase
        .from('racha')
        .insert({ usuario_id: req.user.id, dias_consecutivos: 0, ultima_fecha: null })
        .select()
        .single()
      if (insertError) throw insertError
      data = newRacha
    }

    // Check if streak should be reset (no session in last 2 days)
    if (data.ultima_fecha) {
      const lastDate  = new Date(data.ultima_fecha)
      const today     = new Date()
      const diffDays  = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24))

      if (diffDays > 1) {
        // Reset streak
        const { data: reset } = await supabase
          .from('racha')
          .update({ dias_consecutivos: 0 })
          .eq('usuario_id', req.user.id)
          .select()
          .single()
        data = reset || data
      }
    }

    res.json(data)
  } catch (e) { next(e) }
})

export default router
