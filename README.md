# Ta Ocupado?

Painel em tempo real para saber se os boxes do banheiro estao livres, ocupados,
em limpeza ou sem papel. O app tambem tem fila anonima, emotes em tempo real,
modo PWA/widget e um painel ADM escondido para manutencao.

![Tela principal do Ta Ocupado](docs/app-preview.png)

## O que o app faz

- Mostra o status de dois vasos em tempo real.
- Permite marcar vaso como livre/ocupado dentro do perimetro do banheiro.
- Controla papel higienico por rolo, incluindo estado de rolo acabado.
- Exibe modo limpeza com layout separado e boxes ocultos.
- Mantem uma fila anonima para quem esta esperando.
- Permite enviar stickers/emotes na fila em tempo real.
- Oferece um widget PWA instalavel no celular em `/widget`.
- Dispara notificacoes do navegador quando os avisos estao permitidos.
- Inclui painel ADM oculto para limpeza, fila, perimetro e testes de aviso.

## Stack

- React 19
- TanStack Start / Router
- TypeScript
- Tailwind CSS
- Supabase Realtime
- Cloudflare Workers
- PWA com service worker e manifest

## Como rodar localmente

Requisitos:

- Node.js 22+
- npm
- variaveis de ambiente do Supabase em `.env`

```sh
npm install
npm run dev
```

O app local normalmente abre em:

```sh
http://127.0.0.1:8080/
```

## Variaveis de ambiente

Use `.env.example` como base:

```sh
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_SUPABASE_PROJECT_ID=
```

## Banco de dados

O projeto usa Supabase nas tabelas:

- `stalls`
- `bathroom_state`
- `queue_tickets`

As migrations ficam em `supabase/migrations`.

O perimetro padrao do banheiro esta fixado em:

```txt
lat: -27.124368
lng: -48.604723
raio: 5m
```

## Scripts

```sh
npm run dev
npm run build
npm run lint
npm run preview:cloudflare
npm run deploy:cloudflare
```

## Deploy

O deploy atual usa Cloudflare Workers via Wrangler:

```sh
npm run deploy:cloudflare
```

URL publicada:

```txt
https://taocupado.taocupado.workers.dev
```

## Notificacoes

O app usa notificacoes reais do navegador com `Notification` e
`ServiceWorkerRegistration.showNotification()`.

O fluxo esperado e:

1. O usuario toca em **Ativar aviso** ou entra na fila.
2. O navegador pede permissao.
3. O app envia uma notificacao de confirmacao.
4. Quando chegar a vez da pessoa, outra notificacao e disparada.

Observacao importante: para notificar com o app totalmente fechado no celular,
o proximo passo seria implementar Push API com assinatura por dispositivo e um
backend enviando push. O fluxo atual cobre notificacao real enquanto o app/PWA
esta aberto ou vivo em background.

## ADM

O app tem um painel ADM discreto para:

- alternar modo limpeza;
- marcar/desmarcar boxes sem bloqueio;
- remover pessoas da fila;
- ajustar perimetro;
- testar notificacoes;
- minimizar sem sair da sessao ADM.

## Validacao

Antes de publicar, rode:

```sh
npm run lint
npm run build
```

Atualmente o lint pode exibir warnings de Fast Refresh em componentes `ui`,
mas nao deve retornar erros.
