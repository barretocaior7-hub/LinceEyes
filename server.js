const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração de diretórios
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'biometrics.db');

// Garante que a pasta de dados existe antes de tentar abrir o banco
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Inicializa conexão com o Banco de Dados SQLite
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Erro ao conectar ao SQLite:', err.message);
  } else {
    console.log('[SQLite] Conectado ao banco de dados com sucesso.');
  }
});

// Criação da tabela de usuários (armazenando vetor biométrico como TEXTO/JSON string)
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      descriptor TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// Middlewares (Aumentado limite para requisições com vetores pesados)
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================================
// ROTAS DA API
// ============================================================================

/**
 * POST /api/register
 * Salva o vetor biométrico (128 posições) no banco SQLite em formato JSON string.
 */
app.post('/api/register', (req, res) => {
  const { employeeId, name, descriptor } = req.body;

  if (!employeeId || !name || !descriptor || !Array.isArray(descriptor)) {
    return res.status(400).json({ error: 'Dados inválidos. ID, Nome e Descritor são obrigatórios.' });
  }

  // Converte o array de 128 números para String antes de salvar na coluna TEXT
  const descriptorJson = JSON.stringify(descriptor);

  const sql = `INSERT INTO users (employee_id, name, descriptor) VALUES (?, ?, ?)`;
  
  db.run(sql, [employeeId, name, descriptorJson], function (err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({ error: 'ID de funcionário já cadastrado no sistema.' });
      }
      console.error('Erro SQLite ao inserir:', err.message);
      return res.status(500).json({ error: 'Erro interno no banco de dados ao salvar cadastro.' });
    }

    return res.status(201).json({ 
      message: 'Cadastro biométrico realizado com sucesso!',
      id: this.lastID 
    });
  });
});

/**
 * GET /api/users
 * Retorna todos os usuários e reconverte a string do descritor de volta para Array/Float32.
 */
app.get('/api/users', (req, res) => {
  const sql = `SELECT employee_id as employeeId, name, descriptor FROM users`;

  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error('Erro SQLite ao buscar:', err.message);
      return res.status(500).json({ error: 'Erro ao consultar a base biométrica.' });
    }

    // Parseia a string do vetor para Array original
    const users = rows.map(user => ({
      employeeId: user.employeeId,
      name: user.name,
      descriptor: JSON.parse(user.descriptor)
    }));

    return res.json(users);
  });
});

// Rota protegida do painel
app.get('/painel-secreto', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'painel-secreto.html'));
});

// Inicialização
app.listen(PORT, () => {
  console.log(`[HealthTech Access] Servidor ativo em http://localhost:${PORT}`);
});