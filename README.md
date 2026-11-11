<div align="center">

<img src="frontend/public/pwa-512.png" width="96" alt="Logo do Organizer" />

# Organizer

### Seu dia inteiro, num lugar só.

Tarefas, calendário, hábitos e anotações em um app simples, bonito e feito para o dia a dia,
no computador, no tablet e no celular.

<br />

<a href="https://organizerapp.vercel.app">
  <img src="https://img.shields.io/badge/Abrir_o_Organizer-1f7a8c?style=for-the-badge&logoColor=white" alt="Abrir o Organizer" />
</a>

<br /><br />

![React](https://img.shields.io/badge/React_19-20232a?style=flat-square&logo=react&logoColor=61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646cff?style=flat-square&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-0f172a?style=flat-square&logo=tailwindcss&logoColor=38bdf8)
![Supabase](https://img.shields.io/badge/Supabase-1c1c1c?style=flat-square&logo=supabase&logoColor=3ecf8e)
![PWA](https://img.shields.io/badge/PWA-instalável-5a0fc8?style=flat-square&logo=pwa&logoColor=white)

<br />

<img src="frontend/docs/screenshots/inicio.png" alt="Tela de Início do Organizer: tarefas de hoje, próximos compromissos e hábitos" width="100%" />

</div>

<br />

## 💡 A ideia

A rotina costuma ficar espalhada: tarefas num app, compromissos em outro, hábitos num caderno e
ideias em notas soltas. O **Organizer** junta tudo isso em um só lugar, com uma pergunta no centro:

> **O que eu preciso fazer hoje?**

Ao abrir, você vê o seu dia: o que vence hoje, o que ficou para trás, os próximos compromissos e os
hábitos do dia. Concluir ou remarcar leva um toque. O resto (listas, calendário, notas) está a um
clique de distância, sem telas complicadas.

<br />

## ✨ O que dá para fazer

<table>
  <tr>
    <td width="50%" valign="top">
      <h3>✅ Tarefas</h3>
      Listas em quadro, tabela ou calendário, organizadas em pastas. As tarefas se ordenam sozinhas por prazo e prioridade.
    </td>
    <td width="50%" valign="top">
      <h3>📅 Calendário</h3>
      Visões de mês e semana, eventos que se repetem e tarefas com data, tudo junto. Arraste para remarcar.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <h3>🔔 Alarmes</h3>
      Avisos por e-mail ou WhatsApp, na hora ou com antecedência, para eventos e tarefas.
    </td>
    <td valign="top">
      <h3>🌱 Hábitos</h3>
      Marque o dia com um toque e acompanhe a sequência de dias seguidos.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <h3>📝 Anotações</h3>
      Markdown com pré-visualização, fórmulas LaTeX, imagens, PDF, pastas e #tags.
    </td>
    <td valign="top">
      <h3>🎨 Do seu jeito</h3>
      Tema claro ou escuro, cor de destaque, papel de parede e mais de 150 ícones.
    </td>
  </tr>
</table>

<br />

## 🖼️ Por dentro

<table>
  <tr>
    <td width="50%"><img src="frontend/docs/screenshots/quadro.png" alt="Quadro de tarefas no tema escuro" /></td>
    <td width="50%"><img src="frontend/docs/screenshots/anotacoes.png" alt="Anotação com fórmulas LaTeX" /></td>
  </tr>
  <tr>
    <td align="center"><sub>Quadro de tarefas, no tema escuro</sub></td>
    <td align="center"><sub>Anotações com fórmulas</sub></td>
  </tr>
</table>

<div align="center">
  <img src="frontend/docs/screenshots/celular.png" alt="Início no celular" width="260" />
  &nbsp;&nbsp;&nbsp;
  <img src="frontend/docs/screenshots/habitos.png" alt="Hábitos no celular, tema escuro" width="260" />
  <br />
  <sub>No celular: o dia e os hábitos</sub>
</div>

<br />

## 🌿 Pensado para o dia a dia

- **Rápido de usar:** concluir, remarcar e criar levam um ou dois toques, e quase tudo tem **Desfazer**.
- **Em qualquer tela:** navegação própria no celular, arrastar e soltar por toque, e instalação como app (PWA).
- **Sempre com você:** com uma conta, os dados sincronizam entre aparelhos e continuam funcionando sem internet.
- **Seguro:** cada pessoa só acessa os próprios dados, com lixeira de 30 dias e backup.
- **Acessível:** contraste conferido (WCAG AA), navegação por teclado e suporte a leitores de tela.

<br />

## 🛠️ Feito com

**React 19**, **TypeScript** e **Vite** · **Tailwind CSS** e **shadcn/ui** · **Supabase** (contas, banco e
alarmes) · **CodeMirror** e **KaTeX** nas anotações · hospedado na **Vercel**.

<br />

## 👩‍💻 Para desenvolvedores

```bash
npm run setup   # instala as dependências do frontend
npm run dev     # http://localhost:5173 (sem configuração, os dados ficam no navegador)
```

O código fica em duas pastas: **`frontend/`** (o site e os apps) e **`backend/`** (banco e funções no Supabase).
Para contribuir, veja o **[CONTRIBUTING.md](CONTRIBUTING.md)**.

Como ligar a nuvem, os alarmes e publicar: **[frontend/docs/CONFIGURACAO.md](frontend/docs/CONFIGURACAO.md)**. Apps para Android e iPhone: **[frontend/docs/APLICATIVO.md](frontend/docs/APLICATIVO.md)**.

<br />

<div align="center">
  <sub>Feito com cuidado para deixar a rotina mais leve.</sub>
</div>
