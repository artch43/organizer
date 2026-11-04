# Configuração e desenvolvimento

Guia técnico para rodar o **Organizer** localmente, ligar a nuvem (Supabase), os alarmes e publicar na Vercel.
Para a apresentação do projeto, veja o [README](../README.md).

## Como rodar no seu computador

Precisa do [Node.js](https://nodejs.org) 22 ou mais novo. Os comandos podem ser rodados da raiz do projeto
(eles chamam a pasta `frontend/`) ou de dentro de `frontend/`.

```bash
npm run setup    # só na primeira vez: instala as dependências do frontend
npm run dev      # abre em http://localhost:5173
```

Sem o arquivo `frontend/.env.local`, o app roda **sem login**, com os dados no navegador.

| Comando             | O que faz                                         |
| ------------------- | ------------------------------------------------- |
| `npm run dev`       | Servidor de desenvolvimento                       |
| `npm run build`     | Confere os tipos e gera a versão final em `frontend/dist/` |
| `npm run preview`   | Serve a versão de `dist/` para testar             |
| `npm run typecheck` | Só confere os tipos do TypeScript                 |
| `npm test`          | Roda os testes automáticos (Vitest)               |
| `npm run lint`      | Procura problemas no código (ESLint)              |
| `npm run format`    | Formata o código (Prettier)                       |

---

## Configurar a nuvem (Supabase)

1. Crie uma conta gratuita em [supabase.com](https://supabase.com) e um projeto novo.
2. Em **SQL Editor → New query**, cole o conteúdo de `backend/supabase/setup.sql` e clique em **Run**.
   Ele cria tudo de uma vez (equivale às migrações `001` a `007` de `backend/supabase/migrations/`, que também podem ser rodadas em ordem):
   tabelas `records` e `reminders`, regras de acesso, limites e o armazenamento privado `anexos` para imagens e PDF.
3. Em **Project Settings → API**, copie a **Project URL** e a chave **anon public**.
4. Copie `.env.example` para `.env.local` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
5. Em **Authentication → URL Configuration**, coloque o endereço do site em **Site URL** e em **Redirect URLs**
   (`http://localhost:5173` enquanto testa; depois, o da Vercel).
6. Rode `npm run dev` de novo. Agora o site pede login.

**Recomendações para abrir o site a outras pessoas:**

- **E-mails de cadastro e de senha:** o envio padrão do Supabase só chega a membros do projeto e tem limite baixo.
  Configure um SMTP em **Authentication → Emails → SMTP Settings** (por exemplo, Gmail: host `smtp.gmail.com`,
  porta `465`, usuário e **senha de app**).
- **Link de nova senha que funciona em qualquer aparelho** (opcional): em **Authentication → Emails → Templates → Reset Password**,
  use o link `{{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=recovery`. O app já reconhece esse formato.
- **Tentativas de login:** além do limite no app, ajuste **Authentication → Rate Limits** (por exemplo, 10 entradas a cada 5 minutos).
- **Privacidade:** preencha o contato em `public/privacidade.html`.

> A chave `anon` é pública por definição (as regras de acesso protegem os dados). Nunca coloque a
> `service_role` ou outras chaves secretas no site ou no repositório; o `.env.local` já está no `.gitignore`.

---

## E-mails de cadastro e de nova senha (Brevo)

O e-mail padrão do Supabase só entrega para os endereços da equipe do projeto e só uns 2 por hora, então
o cadastro de outras pessoas falha. Para liberar, use um SMTP próprio. O [Brevo](https://www.brevo.com) é
grátis (300 e-mails por dia) e não precisa de domínio:

1. Crie a conta no Brevo e confirme o e-mail que vai aparecer como remetente (**Senders, Domains & Dedicated IPs → Senders**).
2. Em **SMTP & API → SMTP**, gere uma **SMTP key**. Anote o login SMTP que aparece na página.
3. No Supabase, em **Authentication → Emails → SMTP Settings**, ative **Enable custom SMTP** e preencha:
   - Sender email: o e-mail confirmado no passo 1. Sender name: `Organizer`.
   - Host: `smtp-relay.brevo.com`. Port: `587`.
   - Username: o login SMTP do Brevo. Password: a SMTP key.
4. Em **Authentication → Rate Limits**, aumente **Rate limit for sending emails** (por exemplo, 100 por hora).
5. Em **Authentication → Providers → Email**, defina **Minimum password length** = `8` e
   **Password requirements** = letras e números, a mesma regra que o app pede.

A chave fica só no painel do Supabase: não a coloque no código.

## Configurar os alarmes

Os alarmes são enviados pela função `backend/supabase/functions/send-reminders`, que roda a cada minuto.

### 1. Escolha como enviar os e-mails

- **Gmail** (grátis, sem domínio; até ~500 e-mails por dia): crie um Gmail só para o app, ative a
  verificação em duas etapas e gere uma **senha de app** em myaccount.google.com/apppasswords.
- **Resend** (precisa de um domínio verificado para enviar a outras pessoas): crie uma API key em resend.com.
- Outro SMTP (como o Brevo) também funciona: use `SMTP_HOST`, `SMTP_PORT` (465) e `SMTP_FROM`.

### 2. Publique a função

No Terminal, **dentro da pasta `backend/`** (o token sai de supabase.com → Account → Access Tokens):

```bash
cd backend
npx supabase login
npx supabase link --project-ref <PROJECT_REF>

# Gmail:
npx supabase secrets set SMTP_USER=seu.app@gmail.com SMTP_PASS=<senha de app> CRON_SECRET=<uma-senha-longa> APP_URL=https://seu-site.vercel.app
# ou Resend:
npx supabase secrets set RESEND_API_KEY=re_xxx REMINDER_FROM="Organizer <alertas@seudominio.com>" CRON_SECRET=<uma-senha-longa> APP_URL=https://seu-site.vercel.app

npx supabase functions deploy send-reminders --no-verify-jwt
```

Uma senha longa para o `CRON_SECRET` pode ser gerada com `openssl rand -hex 32`. Se Gmail e Resend
estiverem configurados, vale o Gmail.

### 3. Ligue o agendamento

No **SQL Editor**, rode o conteúdo de `backend/supabase/cron.sql` trocando `<PROJECT_REF>` e `<CRON_SECRET>`
(a mesma senha do passo anterior). Não salve o arquivo com a senha dentro.

Para conferir: `select status_code, content, created from net._http_response order by created desc limit 5;`
deve mostrar `200`.

### 4. WhatsApp (opcional)

Enquanto o WhatsApp não estiver configurado, os avisos marcados como WhatsApp chegam por e-mail.

- **Twilio:** `npx supabase secrets set WHATSAPP_PROVIDER=twilio TWILIO_ACCOUNT_SID=AC... TWILIO_AUTH_TOKEN=... TWILIO_WHATSAPP_FROM=+14155238886`
  (no sandbox, quem recebe manda antes a mensagem de ativação; em produção, use um modelo aprovado com
  `TWILIO_CONTENT_SID`, variáveis `{{1}}` título e `{{2}}` quando).
- **WhatsApp Cloud API (Meta):** `npx supabase secrets set WHATSAPP_PROVIDER=meta WHATSAPP_TOKEN=... WHATSAPP_PHONE_ID=... WHATSAPP_TEMPLATE=lembrete`
  (modelo aprovado com duas variáveis: título e quando).

Depois, publique a função de novo.

### Limites (por pessoa, a cada 24 h)

| Segredo                  | Padrão               |
| ------------------------ | -------------------- |
| `DAILY_EMAIL_LIMIT`      | 50 e-mails           |
| `DAILY_WHATSAPP_LIMIT`   | 20 mensagens         |
| `DAILY_WHATSAPP_NUMBERS` | 2 números diferentes |

---

## Publicar na Vercel

1. Envie o código para o GitHub.
2. Em [vercel.com](https://vercel.com), **Add New → Project** e importe o repositório. O `vercel.json` da raiz já diz como instalar e gerar o site a partir de `frontend/`.
3. Em **Environment Variables**, adicione `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
4. Publique, e coloque o endereço da Vercel no Supabase (Site URL e Redirect URLs).

Pelo Terminal também dá, da raiz do projeto: `npx vercel deploy --prod`.

---

## Estrutura do projeto

```
frontend/                   o site e os apps (React + Vite + Capacitor)
  src/
    main.tsx, App.tsx         entrada, login, layout geral e rotas (#/id-da-página)
    store.ts                  estado global (Zustand) e todas as ações (criar, mover, desfazer…)
    index.css                 tema: cores, claro/escuro, papel de parede, animações
    styles.css                editor de notas e Markdown renderizado
    lib/
      types.ts                formatos dos dados (tarefa, evento, nota, hábito, configurações…)
      model.ts                regras: filtros, ordem automática, revisão espaçada, sequência de hábitos
      events.ts               calendário, repetições e cálculo dos alarmes
      sync.ts, records.ts     sincronização com a nuvem, lixeira e lembretes
      migrate.ts              atualiza dados salvos por versões antigas
      template.ts             espaço inicial: o guia "Comece por aqui" e os exemplos
      appearance.ts           cor de destaque (com contraste garantido), papel de parede, barra lateral
      attachments.ts          imagens e PDF das anotações
      backClose.ts            botão Voltar do celular fecha menus e janelas
      password.ts, loginLimit.ts  regras de senha e limite de tentativas de login
      touchDnd.ts             arrastar e soltar no toque
      native.ts, rename.ts    detalhes dos apps e do nome antigo
      shortcuts.ts, notes.ts, notesIO.ts, backup.ts, supabase.ts, storage.ts, util.ts
    components/
      ui/                     componentes do shadcn
      app/                    barra lateral, barra superior, navegação do celular, lixeira de arrastar
      tasks/                  página da lista, quadro, tabela, calendário, painel e nova tarefa
      calendar/               calendário (mês/semana), evento e alarme
      notes/                  anotações: lista, editor (CodeMirror) e leitura
      Home.tsx, Habits.tsx, Search.tsx, Settings.tsx, Auth.tsx…
  public/                     privacidade.html, ícones do app (PWA)
  android/, ios/, assets/     apps nativos (Capacitor) e os ícones de origem
backend/
  supabase/
    setup.sql                 todo o banco de uma vez
    migrations/               001 a 007, em ordem
    functions/send-reminders  envio dos alarmes (e-mail e WhatsApp)
    cron.sql                  agenda a função a cada minuto
docs/                         este guia, o dos apps e as imagens do README
vercel.json                   como a Vercel gera o site (a partir de frontend/) e cabeçalhos de segurança
package.json                  atalhos da raiz (npm run dev, build, test…)
```

---

## Como os dados são guardados

- Uma tabela, `records`, com uma linha por item (lista, tarefa, evento, anotação, hábito, configurações…), em JSON.
  Cada pessoa só lê e escreve as próprias linhas (Row Level Security).
- As mudanças são enviadas em lotes; as de outros aparelhos chegam ao voltar para a aba e a cada minuto.
  Sem internet, ficam numa fila e são enviadas quando a conexão volta.
- Itens excluídos ficam 30 dias na **Lixeira**.
- Anexos ficam no armazenamento privado `anexos`, numa pasta por pessoa. O papel de parede com imagem fica só no aparelho.
- Os lembretes ficam na tabela `reminders`; a função envia os que venceram e marca como enviados.
