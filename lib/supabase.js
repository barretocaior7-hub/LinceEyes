const { createClient } = require('@supabase/supabase-js');


const SUPABASE_URL = process.env.SUPABASE_URL;
// Prefer service role / secret key for server operations. Fallback to anon/publishable if available.
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_URL) {
  console.warn('Supabase: SUPABASE_URL não configurada. Defina SUPABASE_URL no .env.');
}

if (!SUPABASE_SERVICE_KEY && !SUPABASE_ANON_KEY) {
  console.warn('Supabase: nenhuma chave encontrada (SUPABASE_SECRET_KEY / SUPABASE_PUBLISHABLE_KEY). Operações podem falhar.');
}

// Use service role key when available (required for inserts/updates server-side).
const SUPABASE_KEY = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;

if (!SUPABASE_KEY) {
  console.warn('Supabase client inicializado sem chave válida. Verifique variáveis de ambiente.');
}

const supabase = createClient(SUPABASE_URL || '', SUPABASE_KEY || '');

module.exports = supabase;
