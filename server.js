const express = require('express');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'healthtech_segredo_super_seguro_rh_2026';

const supabase = require('./lib/supabase');

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// Middleware de Autenticação do RH
function authorizeRH(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Acesso negado. Token ausente.' });

  try {
    const user = jwt.verify(token, JWT_SECRET);
    if (user.role !== 'RH' && user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso restrito ao RH.' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token inválido ou expirado.' });
  }
}

// Rota de Login do Operador RH
app.post('/api/auth/login-rh', (req, res) => {
  const { username, password } = req.body;
  const RH_USER = process.env.RH_USERNAME || 'admin_rh';
  const RH_PASS = process.env.RH_PASSWORD || 'RH@Health2026!';

  if (username === RH_USER && password === RH_PASS) {
    const token = jwt.sign({ username, role: 'RH' }, JWT_SECRET, { expiresIn: '8h' });
    return res.json({ token, role: 'RH' });
  }

  return res.status(401).json({ error: 'Credenciais inválidas.' });
});

// Rota de Cadastro de Biometria
app.post('/api/register', authorizeRH, async (req, res) => {
  const { name, cargo, setor, descriptor } = req.body;

  if (!name || !cargo || !setor || !descriptor) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
  }

  try {
    // Normalize descriptor: accept array or JSON string. Store as JSONB (array) in Supabase.
    let descriptorValue;
    if (typeof descriptor === 'string') {
      try {
        descriptorValue = JSON.parse(descriptor);
      } catch (e) {
        return res.status(400).json({ error: 'Descriptor em formato inválido.' });
      }
    } else {
      descriptorValue = descriptor;
    }

    // Basic validation: descriptor should be an array of numbers (face-api descriptors are 128 floats)
    if (!Array.isArray(descriptorValue) || descriptorValue.length < 64) {
      return res.status(400).json({ error: 'Descriptor inválido: array esperado com tamanho apropriado.' });
    }

    // Inserir no Supabase (assume tabela `users` já criada no Supabase com colunas compatíveis)
    const { data, error: insertError } = await supabase
      .from('users')
      .insert([{ name, cargo, setor, descriptor: descriptorValue }])
      .select();

    if (insertError) {
      console.error('Supabase insert error:', insertError);
      return res.status(500).json({ error: 'Erro ao salvar no banco (Supabase).' });
    }

    const inserted = Array.isArray(data) ? data[0] : data;
    const insertedId = inserted && inserted.id;
    const employeeCode = `EMP-${String(insertedId).padStart(4, '0')}`;

    const { error: updateError } = await supabase
      .from('users')
      .update({ employee_code: employeeCode })
      .eq('id', insertedId);

    if (updateError) {
      console.error('Supabase update error:', updateError);
      return res.status(500).json({ error: 'Erro ao gerar código do colaborador.' });
    }

    return res.status(201).json({
      message: 'Cadastrado com sucesso!',
      employee: { id: insertedId, employeeCode, name, cargo, setor }
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

// Rota de Consulta de Usuários para o Login
app.get('/api/users', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, employee_code, name, cargo, setor, descriptor');

    if (error) {
      console.error('Supabase select error:', error);
      return res.status(500).json({ error: 'Erro ao buscar dados.' });
    }

    const users = (data || []).map(u => ({
      id: u.id,
      employeeCode: u.employee_code,
      name: u.name,
      cargo: u.cargo,
      setor: u.setor,
      descriptor: typeof u.descriptor === 'string' ? JSON.parse(u.descriptor) : u.descriptor
    }));

    return res.json(users);
  } catch (err) {
    console.error('Users fetch error:', err);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.listen(PORT, () => {
  console.log(`[Servidor Antigo Ativo] em http://localhost:${PORT}`);
});