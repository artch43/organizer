# Como trabalhar no Organizer

## O que fica em cada pasta

| Pasta | O que tem |
|---|---|
| `frontend/` | O site e os apps: React + Vite + Tailwind + shadcn/ui, e o Capacitor (`android/`, `ios/`) |
| `backend/` | O Supabase: banco (`supabase/migrations/`, `setup.sql`), a função dos alarmes (`supabase/functions/`) e o agendamento (`cron.sql`) |
| `frontend/docs/` | Guias de configuração e dos apps |

O mapa completo dos arquivos está em [frontend/docs/CONFIGURACAO.md](frontend/docs/CONFIGURACAO.md#estrutura-do-projeto).

## Primeira vez

```bash
git clone https://github.com/artch43/organizer.git
cd organizer
npm run setup        # instala as dependências do frontend
npm run dev          # http://localhost:5173
```

Sem configuração, o app roda sem login e guarda tudo no navegador, o que basta para a maior parte do trabalho
em telas. Para usar a nuvem, copie `frontend/.env.example` para `frontend/.env.local` e preencha com os dados do
Supabase (pegue com quem já tem acesso ao projeto, nunca pelo Git).

## O dia a dia

1. **Pegue uma tarefa** nas Issues do GitHub e atribua a você, para os dois não mexerem na mesma coisa.
2. **Crie uma branch** a partir da `main` atualizada:
   ```bash
   git switch main && git pull
   git switch -c feat/nome-curto      # ou fix/…, docs/…
   ```
3. **Faça commits pequenos**, com mensagens que digam o que mudou:
   `feat: calendário no histórico dos hábitos`, `fix: botão voltar no celular`, `docs: …`.
4. **Antes de abrir o PR**, rode da raiz:
   ```bash
   npm run lint && npm run typecheck && npm test && npm run build
   ```
5. **Abra um Pull Request** para a `main` e preencha o modelo. As checagens rodam sozinhas no GitHub.
6. **O outro revisa.** Depois de aprovado e com as checagens verdes, faça o merge (de preferência *Squash and merge*).
7. Apague a branch e volte para o passo 1.

## Banco de dados

- Toda mudança no banco vira uma **nova migration** em `backend/supabase/migrations/` (próximo número, por
  exemplo `013_...sql`, dentro de `begin; … commit;`). Nunca edite uma migration que já rodou.
- Depois, regere o `setup.sql` com `bash backend/supabase/build-setup.sh` (o CI confere se ele está em dia).
- Os testes do banco rodam com `bash backend/supabase/tests/run-db-tests.sh` (precisa do Docker): eles aplicam
  o `setup.sql` num Postgres que imita o Supabase e conferem cota, limites, RLS e permissões. Toda regra nova
  ganha uma verificação em `tests/db.test.sql`.
- Função nova em `public` nasce **sem** permissão para `anon`/`authenticated` (migration 009): se ela precisar ser
  chamada pelo app, conceda o `grant execute` de propósito.
- Comandos do Supabase rodam **dentro de `backend/`**: `cd backend && npx supabase ...`. O `config.toml` já diz
  quais funções verificam o login, então o deploy é só `npx supabase functions deploy <nome>`.

## Segredos

Chaves e senhas (Supabase, SMTP, WhatsApp) ficam no painel do Supabase, na Vercel ou no seu `.env.local`.
**Nunca** no código, nos commits, nas issues ou no chat. A chave `service_role` nunca vai para o frontend.

## Publicar

O site é publicado na Vercel a partir da raiz do projeto (`npx vercel deploy --prod`). Com o repositório
conectado à Vercel, cada PR ganha um link de prévia e o merge na `main` publica sozinho.
