import { Router } from 'express'
import { requireAuth, supabase } from '../middleware/auth.js'

const router = Router()

// Seed data for the exercise catalog
const CATALOGO_SEED = [
  { id: 1, nombre: 'Estiramiento de Cuello',     descripcion: 'Alivia la tensión cervical.', instrucciones: 'Inclina suavemente la cabeza hacia un lado y sostén 5 segundos.', duracion_recomendada_seg: 120 },
  { id: 2, nombre: 'Cat-Cow',                    descripcion: 'Moviliza la columna vertebral.', instrucciones: 'Alterna entre arcar y redondear la espalda en cuatro puntos.', duracion_recomendada_seg: 90 },
  { id: 3, nombre: 'Extensión de Columna de Pie', descripcion: 'Contrarresta la postura encorvada.', instrucciones: 'Manos en lumbar, inclínate suavemente hacia atrás.', duracion_recomendada_seg: 90 },
  { id: 4, nombre: 'Retracción Escapular',        descripcion: 'Fortalece los músculos entre omóplatos.', instrucciones: 'Junta los omóplatos y sostén 5 segundos.', duracion_recomendada_seg: 90 },
  { id: 5, nombre: 'Plancha de Núcleo',           descripcion: 'Estabiliza la columna lumbar.', instrucciones: 'Cuerpo en línea recta sobre antebrazos y puntillas.', duracion_recomendada_seg: 60 },
]

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('catalogo_ejercicios')
      .select('*')
      .order('id')

    if (error) throw error
    // If table is empty, return seed data
    res.json(data?.length ? data : CATALOGO_SEED)
  } catch {
    // Fallback to seed data if table doesn't exist yet
    res.json(CATALOGO_SEED)
  }
})

export default router
