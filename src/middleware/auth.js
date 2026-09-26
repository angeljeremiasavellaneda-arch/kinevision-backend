/**
 * auth middleware — verifies the Supabase JWT from Authorization header.
 * Attaches req.user = { id, email, ... } for downstream handlers.
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // service role — only used server-side
)

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing authorization token' })
  }

  const token = authHeader.slice(7)
  const { data, error } = await supabase.auth.getUser(token)

  if (error || !data?.user) {
    return res.status(401).json({ message: 'Invalid or expired token' })
  }

  req.user = data.user
  req.supabase = supabase
  next()
}

export { supabase }
