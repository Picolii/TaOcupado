# Deploy fora do Lovable

Este projeto já está preparado para build e deploy em Cloudflare Workers.

## O que já está pronto

- Build de produção validado com `npm run build`.
- Lint sem erros com `npm run lint`.
- Config base do Cloudflare em `wrangler.jsonc`.
- Scripts adicionados:
  - `npm run preview:cloudflare`
  - `npm run deploy:cloudflare`
  - `npm run cf:whoami`
- `.env` agora fica fora do Git.
- `.env.example` documenta as variáveis necessárias.

## Primeiro deploy via CLI

1. Faça login na Cloudflare:

```sh
npm exec --yes --package=wrangler -- wrangler login
```

2. Confira se o login funcionou:

```sh
npm run cf:whoami
```

3. Configure as variáveis no Worker. O script abaixo usa os valores do seu `.env` local sem mostrar os segredos no terminal:

```sh
npm run build
npm run cf:secrets
```

4. Publique:

```sh
npm run deploy:cloudflare
```

O deploy publica em `https://taocupado.taocupado.workers.dev`. Depois disso, adicione um domínio próprio pelo painel da Cloudflare, se quiser.

## Deploy contínuo por Git

Este repo já inclui um workflow em `.github/workflows/deploy-cloudflare.yml`.
Quando houver push na branch `main`, o GitHub Actions vai:

- instalar dependências com `npm ci`;
- rodar `npm run lint`;
- rodar `npm audit --omit=optional`;
- buildar e publicar na Cloudflare com `npm run deploy:cloudflare`.

### Secrets no GitHub

No GitHub, abra `Settings > Secrets and variables > Actions > New repository secret`
e cadastre:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

O token da Cloudflare precisa permitir deploy de Workers no account correto.
No painel da Cloudflare, crie um API token com permissão de editar Workers.

### Primeiro push para o GitHub

Depois de criar um repositório vazio no GitHub:

```sh
git add .
git commit -m "Prepare Cloudflare deployment"
git remote add origin https://github.com/Picolii/TaOcupado.git
git push -u origin main
```

### Alternativa: Cloudflare Workers Builds

Também dá para conectar o GitHub direto na Cloudflare em Workers Builds.
Nesse caso, use:

- Build command: `npm run build`
- Deploy command: `wrangler deploy --config .output/server/wrangler.json`

Eu prefiro GitHub Actions aqui porque ele roda lint/audit antes de publicar e deixa o histórico de deploy junto do código.

## Supabase

O projeto usa Supabase Realtime nas tabelas:

- `stalls`
- `bathroom_state`
- `queue_tickets`

Para teste e uso interno, o plano Free deve bastar. Para produção, o ponto sensível não é o deploy: são as policies abertas para `anon`.

Antes de abrir publicamente, revise:

- qualquer pessoa anônima consegue atualizar `stalls`;
- qualquer pessoa anônima consegue atualizar `bathroom_state`;
- qualquer pessoa anônima consegue entrar e sair da fila;
- o controle anti-flood é client-side, então não segura abuso via API direta.

## Custos prováveis

- Teste/baixo tráfego: Cloudflare Free + Supabase Free = US$0/mês.
- Produção pequena: Cloudflare Workers Paid + Supabase Pro = cerca de US$30/mês.
- Vercel também funciona, mas uso comercial tende a começar em Vercel Pro + Supabase Pro, cerca de US$45/mês.
