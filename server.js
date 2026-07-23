const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'healthtech_segredo_super_seguro_rh_2026';

// Configuração de diretórios e banco de dados
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'biometrics.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH);

// Tabela de usuários com Auto-Increment, Cargo, Setor e Data Automática
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_code TEXT UNIQUE,
      name TEXT NOT NULL,
      cargo TEXT NOT NULL,
      setor TEXT NOT NULL,
      descriptor TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

app.use(express.json({ limit: '10mb' }));

// Middleware para servir arquivos estáticos e suportar URLs sem extensão .html (ex: /painel-secreto)
app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html']
}));

// ============================================================================
// MIDDLEWARE DE AUTENTICAÇÃO E AUTORIZAÇÃO (RBAC - RH/ADMIN)
// ============================================================================

/**
 * Middleware para garantir que apenas Admin/RH cadastrem novos usuários.
 */
function authorizeRH(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Acesso negado. Token de autorização ausente.' });
  }

  try {
    const user = jwt.verify(token, JWT_SECRET);
    if (user.role !== 'RH' && user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso restrito à equipe de RH e Administração.' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token de autorização inválido ou expirado.' });
  }
}

// ============================================================================
// ROTAS DE NAVEGAÇÃO E PÁGINAS
// ============================================================================

app.get('/painel-secreto', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'painel-secreto.html'));
});

// ============================================================================
// ROTAS DA API
// ============================================================================

/**
 * POST /api/auth/login-rh
 * Rota de autenticação para o operador do RH/Admin.
 */
app.post('/api/auth/login-rh', (req, res) => {
  const { username, password } = req.body;

  if (username === 'admin_rh' && password === 'RH@Health2026!') {
    const token = jwt.sign({ username, role: 'RH' }, JWT_SECRET, { expiresIn: '8h' });
    return res.json({ token, role: 'RH' });
  }

  return res.status(401).json({ error: 'Credenciais de RH inválidas.' });
});

/**
 * POST /api/register
 * Rota PROTEGIDA: Apenas RH/Admin cadastram biometria.
 */
app.post('/api/register', authorizeRH, (req, res) => {
  const { name, cargo, setor, descriptor } = req.body;

  if (!name || !cargo || !setor || !descriptor || !Array.isArray(descriptor)) {
    return res.status(400).json({ error: 'Campos obrigatórios: Nome, Cargo, Setor e Descritor Biométrico.' });
  }

  const descriptorJson = JSON.stringify(descriptor);

  // Insere primeiro para obter o ID Auto-Incrementado
  const insertSql = `INSERT INTO users (name, cargo, setor, descriptor) VALUES (?, ?, ?, ?)`;

  db.run(insertSql, [name, cargo, setor, descriptorJson], function (err) {
    if (err) {
      console.error('Erro SQLite ao inserir:', err.message);
      return res.status(500).json({ error: 'Erro ao salvar colaborador no banco.' });
    }

    const insertedId = this.lastID;
    const employeeCode = `EMP-${String(insertedId).padStart(4, '0')}`;

    // Atualiza o código do funcionário no registro recém-criado
    db.run(`UPDATE users SET employee_code = ? WHERE id = ?`, [employeeCode, insertedId], (updateErr) => {
      if (updateErr) {
        return res.status(500).json({ error: 'Erro ao gerar código do funcionário.' });
      }

      return res.status(201).json({
        message: 'Colaborador cadastrado com sucesso!',
        employee: {
          id: insertedId,
          employeeCode,
          name,
          cargo,
          setor
        }
      });
    });
  });
});

/**
 * GET /api/users
 * Retorna dados para verificação no login biométrico.
 */
app.get('/api/users', (req, res) => {
  const sql = `SELECT id, employee_code as employeeCode, name, cargo, setor, descriptor FROM users`;

  db.all(sql, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao buscar base biométrica.' });
    }

    const users = rows.map(u => {
      let parsedDescriptor = [];
      try {
        parsedDescriptor = typeof u.descriptor === 'string' ? JSON.parse(u.descriptor) : u.descriptor;
      } catch (e) {
        console.error(`Erro ao converter descritor do usuário ${u.id}:`, e);
      }

      return {
        id: u.id,
        employeeCode: u.employeeCode,
        name: u.name,
        cargo: u.cargo,
        setor: u.setor,
        descriptor: parsedDescriptor
      };
    });

    return res.json(users);
  });
});

app.listen(PORT, () => {
  console.log(`[HealthTech Access Manager] Servidor ativo em http://localhost:${PORT}`);
});