const path = require('path');
const express = require('express');
const helmet = require('helmet');
const http = require('http');
const { Server } = require('socket.io');

const routes = require('./routes');
const { setupSocket, kickUserFromRoom } = require('./socket');

const PORT = process.env.PORT || 3000;

const app = express();
// Necessário em plataformas atrás de proxy reverso (Render, etc.) para que
// req.ip reflita o IP real do cliente (via X-Forwarded-For) em vez do IP
// interno do proxy — sem isso, o rate limiting por IP trataria todo mundo
// como uma única origem.
app.set('trust proxy', 1);

// Headers de segurança (X-Content-Type-Options, X-Frame-Options, remove
// X-Powered-By, etc.), com uma CSP restritiva — todo o site é same-origin,
// sem scripts inline, então dá pra ser bem estrito aqui.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // atributos style="" usados no HTML
      imgSrc: ["'self'", 'data:'], // pré-visualização de avatar usa data: URI
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'self'"],
    },
  },
}));

app.use(express.json());
app.get('/healthz', (req, res) => res.status(200).send('ok'));

const server = http.createServer(app);
const io = new Server(server);
setupSocket(io);

app.use('/api', routes(io, kickUserFromRoom));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Handler de erro genérico — nunca vaza stack trace/caminhos internos pro
// cliente (o Express expõe isso por padrão quando NODE_ENV não é
// "production"). Detalhes completos só vão pro log do servidor.
app.use((err, req, res, next) => {
  console.error('[erro não tratado]', err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: 'Erro interno do servidor.' });
});

server.listen(PORT, () => {
  console.log(`Miraa rodando em http://localhost:${PORT}`);
});
