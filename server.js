const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'healthtech_segredo_super_seguro_rh_2026';

// Configuração do Banco de Dados SQLite
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'biometrics.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH);

// Tabela de usuários para face-api.js
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
  if (username === 'admin_rh' && password === 'RH@Health2026!') {
    const token = jwt.sign({ username, role: 'RH' }, JWT_SECRET, { expiresIn: '8h' });
    return res.json({ token, role: 'RH' });
  }
  return res.status(401).json({ error: 'Credenciais inválidas.' });
});

// Rota de Cadastro de Biometria
app.post('/api/register', authorizeRH, (req, res) => {
  const { name, cargo, setor, descriptor } = req.body;

  if (!name || !cargo || !setor || !descriptor) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
  }

  const descriptorJson = JSON.stringify(descriptor);
  const insertSql = `INSERT INTO users (name, cargo, setor, descriptor) VALUES (?, ?, ?, ?)`;

  db.run(insertSql, [name, cargo, setor, descriptorJson], function (err) {
    if (err) return res.status(500).json({ error: 'Erro ao salvar no banco.' });

    const insertedId = this.lastID;
    const employeeCode = `EMP-${String(insertedId).padStart(4, '0')}`;

    db.run(`UPDATE users SET employee_code = ? WHERE id = ?`, [employeeCode, insertedId], (updateErr) => {
      if (updateErr) return res.status(500).json({ error: 'Erro ao gerar código do colaborador.' });

      return res.status(201).json({
        message: 'Cadastrado com sucesso!',
        employee: { id: insertedId, employeeCode, name, cargo, setor }
      });
    });
  });
});

// Rota de Consulta de Usuários para o Login
app.get('/api/users', (req, res) => {
  db.all(`SELECT id, employee_code as employeeCode, name, cargo, setor, descriptor FROM users`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Erro ao buscar dados.' });

    const users = rows.map(u => ({
      id: u.id,
      employeeCode: u.employeeCode,
      name: u.name,
      cargo: u.cargo,
      setor: u.setor,
      descriptor: JSON.parse(u.descriptor)
    }));

    return res.json(users);
  });
});

app.listen(PORT, () => {
  console.log(`[Servidor Antigo Ativo] em http://localhost:${PORT}`);
});