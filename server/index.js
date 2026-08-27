const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const routes = require('./routes');
const setupSocket = require('./socket');

const PORT = process.env.PORT || 3000;

const app = express();
// Necessário em plataformas atrás de proxy reverso (Render, etc.) para que
// req.ip reflita o IP real do cliente (via X-Forwarded-For) em vez do IP
// interno do proxy — sem isso, o rate limiting por IP trataria todo mundo
// como uma única origem.
app.set('trust proxy', 1);
app.use(express.json());
app.get('/healthz', (req, res) => res.status(200).send('ok'));
app.use('/api', routes());
app.use(express.static(path.join(__dirname, '..', 'public')));

const server = http.createServer(app);
const io = new Server(server);
setupSocket(io);

server.listen(PORT, () => {
  console.log(`Miraa rodando em http://localhost:${PORT}`);
});
