# Miraa

Aplicação web para adicionar amigos por UUID, criar salas privadas e fazer
"watch parties" compartilhando tela (com áudio do computador), câmera e
microfone via WebRTC.

## Funcionalidades

- Cadastro/login simples (usuário + senha).
- Cada conta tem um **UUID único**; adicione amigos colando o UUID deles
  (gera um pedido de amizade que precisa ser aceito — se ambos já haviam
  pedido um ao outro, a amizade é confirmada na hora).
- Criação de **salas privadas**: só o dono e os amigos convidados entram.
- Dentro da sala (watch party), cada participante pode ligar/desligar,
  independentemente:
  - 📷 **Câmera**
  - 🎙️ **Microfone**
  - 🖥️ **Compartilhamento de tela**, com opção de incluir o **áudio do
    computador** (o navegador precisa suportar isso; no Chrome/Edge,
    marque "compartilhar áudio da guia/tela" no diálogo do sistema).
- Suporta várias pessoas na mesma sala (malha WebRTC ponto a ponto, com o
  padrão *perfect negotiation* para evitar conflitos de sinalização).

## Como rodar

```bash
npm install
npm start
```

Abra `http://localhost:3000` no navegador (crie pelo menos duas contas,
em duas abas/navegadores diferentes, para testar amizade + sala).

Por padrão a porta é `3000`; troque com `PORT=8080 npm start` se preciso.

## Deploy no Render (hospedagem própria, independente da sua máquina)

O repositório já inclui `render.yaml` (Blueprint) configurado com disco
persistente para os dados não se perderem a cada deploy.

1. **Suba o código para o GitHub** (o Render faz deploy a partir de um repo):
   ```bash
   git init
   git add .
   git commit -m "Miraa"
   ```
   Crie um repositório vazio em https://github.com/new e depois:
   ```bash
   git remote add origin <URL_DO_SEU_REPOSITORIO>
   git branch -M main
   git push -u origin main
   ```
2. No painel do Render (https://dashboard.render.com), clique em
   **New > Blueprint**, selecione o repositório e confirme — ele vai ler o
   `render.yaml` e já criar o serviço web com o disco persistente montado em
   `/var/data`.
3. Plano usado no blueprint: `starter` (~US$7/mês), necessário para poder
   anexar o disco persistente. Se preferir testar no **free tier** antes de
   pagar, edite `render.yaml`: mude `plan: starter` para `plan: free` e
   remova o bloco `disk:` (nesse caso os dados de usuários/amigos/salas são
   apagados a cada novo deploy ou quando a instância reinicia por
   inatividade).
4. Pronto: o Render te dá uma URL HTTPS fixa (`https://miraa-xxxx.onrender.com`)
   que **não depende do seu computador ficar ligado**. WebSocket (Socket.IO)
   funciona nativamente no Render, sem configuração extra.

Depois do primeiro deploy, qualquer novo `git push` para `main` publica uma
nova versão automaticamente.

## Notas técnicas

- Sem banco de dados externo: os dados (usuários, amizades, salas) ficam em
  `data/db.json`, criado automaticamente.
- Sessões de login são tokens em memória — reiniciar o servidor faz todo
  mundo precisar logar de novo (as contas continuam existindo).
- A sinalização WebRTC usa Socket.IO; a conexão de mídia é P2P direta entre
  os navegadores usando apenas um servidor STUN público do Google. Em redes
  com NAT simétrico/restritivo (algumas redes corporativas), pode ser
  necessário um servidor **TURN** próprio para a conexão funcionar — não
  incluído aqui.
- Compartilhamento de áudio do sistema ao compartilhar tela depende do
  suporte do navegador/SO (funciona bem no Chrome/Edge no Windows e ao
  compartilhar uma guia do Chrome; no Linux/macOS o suporte a áudio do
  sistema é mais limitado por restrições do próprio SO).
