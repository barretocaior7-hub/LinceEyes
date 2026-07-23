const { createClient } = require('@supabase/supabase-js');


const SUPABASE_URL = process.env.SUPABASE_URL;
// Aceita múltiplos nomes de variáveis que podem estar no .env
const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.warn('Supabase: variáveis de ambiente não configuradas (SUPABASE_URL / SUPABASE_SECRET_KEY or SUPABASE_SERVICE_KEY).');
}

const supabase = createClient(SUPABASE_URL || '', SUPABASE_KEY || '');

module.exports = supabase;
