# Deploy fora do Lovable

Este projeto ja esta preparado para build e deploy em Cloudflare Workers.

## O que ja esta pronto

- Build de producao validado com `npm run build`.
- Lint sem erros com `npm run lint`.
- Config base do Cloudflare em `wrangler.jsonc`.
- Scripts adicionados:
  - `npm run preview:cloudflare`
  - `npm run deploy:cloudflare`
  - `npm run cf:whoami`
- `.env` agora fica fora do Git.
- `.env.example` documenta as variaveis necessarias.

## Primeiro deploy via CLI

1. Faca login na Cloudflare:

```sh
npm exec --yes --package=wrangler -- wrangler login
```

2. Confira se o login funcionou:

```sh
npm run cf:whoami
```

3. Configure as variaveis no Worker. O script abaixo usa os valores do seu `.env` local sem mostrar os segredos no terminal:

```sh
npm run build
npm run cf:secrets
```

4. Publique:

```sh
npm run deploy:cloudflare
```

O deploy publica em `https://taocupado.taocupado.workers.dev`. Depois disso, adicione um dominio proprio pelo painel da Cloudflare, se quiser.

## Deploy continuo por Git

Este repo ja inclui um workflow em `.github/workflows/deploy-cloudflare.yml`.
Quando houver push na branch `main`, o GitHub Actions vai:

- instalar dependencias com `npm ci`;
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
No painel da Cloudflare, crie um API token com permissao de editar Workers.

### Primeiro push para o GitHub

Depois de criar um repositorio vazio no GitHub:

```sh
git add .
git commit -m "Prepare Cloudflare deployment"
git remote add origin https://github.com/Picolii/TaOcupado.git
git push -u origin main
```

### Alternativa: Cloudflare Workers Builds

Tambem da para conectar o GitHub direto na Cloudflare em Workers Builds.
Nesse caso, use:

- Build command: `npm run build`
- Deploy command: `wrangler deploy --config .output/server/wrangler.json`

Eu prefiro GitHub Actions aqui porque ele roda lint/audit antes de publicar e deixa o historico de deploy junto do codigo.

## Supabase

O projeto usa Supabase Realtime nas tabelas:

- `stalls`
- `bathroom_state`
- `queue_tickets`

Para teste e uso interno, o plano Free deve bastar. Para producao, o ponto sensivel nao e o deploy: sao as policies abertas para `anon`.

Antes de abrir publicamente, revise:

- qualquer pessoa anonima consegue atualizar `stalls`;
- qualquer pessoa anonima consegue atualizar `bathroom_state`;
- qualquer pessoa anonima consegue entrar e sair da fila;
- o controle anti-flood e client-side, entao nao segura abuso via API direta.

## Custos provaveis

- Teste/baixo trafego: Cloudflare Free + Supabase Free = US$0/mes.
- Producao pequena: Cloudflare Workers Paid + Supabase Pro = cerca de US$30/mes.
- Vercel tambem funciona, mas uso comercial tende a comecar em Vercel Pro + Supabase Pro, cerca de US$45/mes.
