const crypto = require('crypto');

// Tokens de sessão simples em memória: token opaco -> userId.
// Reiniciar o servidor invalida sessões (usuários precisam logar de novo),
// o que é aceitável para este projeto.
const tokens = new Map();

function createToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  tokens.set(token, userId);
  return token;
}

function getUserId(token) {
  return token ? tokens.get(token) : undefined;
}

function revokeToken(token) {
  tokens.delete(token);
}

function extractToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

function requireAuth(req, res, next) {
  const token = extractToken(req);
  const userId = getUserId(token);
  if (!userId) return res.status(401).json({ error: 'Não autenticado.' });
  req.userId = userId;
  req.token = token;
  next();
}

module.exports = { createToken, getUserId, revokeToken, extractToken, requireAuth };
