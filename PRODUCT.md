# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Pessoas que querem organizar a própria rotina num só lugar: tarefas, compromissos, anotações e hábitos. São usuários brasileiros, e o produto é todo em português. Usam no computador e no celular, inclusive como app instalado (PWA). A divulgação inicial será pelo LinkedIn (perfil pessoal do criador). Inferido do histórico, não confirmado: o público tende a ser de estudantes e profissionais jovens.

## Product Purpose
O Organizer junta tarefas em quadros, calendário, anotações em Markdown e hábitos num espaço único e fácil de usar, para organizar a rotina do dia a dia. Sucesso é a pessoa abrir o app, ver o que tem para hoje e agir (concluir, remarcar, anotar) sem fricção, e ser avisada a tempo do que importa.

## Positioning
O diferencial confirmado pelo criador é a facilidade de uso, com interações que juntam o melhor do Notion (quadros, propriedades, listas) e do Obsidian (notas em Markdown, pastas, links, tags) num espaço simples de organização de rotina. O ponto principal é o **alarme por e-mail**: tarefas e eventos avisam a pessoa por e-mail (e opcionalmente WhatsApp) no horário escolhido.

## Operating Context
- O app abre no Início: tarefas de hoje e atrasadas, escolha de outro dia, próximos compromissos e hábitos marcados com um toque.
- Listas de tarefas em quadro, tabela ou calendário, com status, prioridade, etiquetas, data e alarme. As tarefas podem ser arrastadas entre colunas e até a Lixeira da barra lateral.
- Anotações em Markdown (CodeMirror) com pastas, tags, fórmulas (KaTeX), anexos de imagem e PDF, nota do dia e anotação ligada a uma tarefa.
- Calendário (mês e semana) com eventos e tarefas.
- Hábitos com sequência e histórico em calendário.
- Conta na nuvem (Supabase) que sincroniza os aparelhos. Sem conta, os dados ficam salvos só no navegador.
- Guia "Comece por aqui" e exemplos para quem está começando.

## Capabilities and Constraints
- Stack existente: React 19, TypeScript, Vite, Tailwind v4, shadcn/ui (radix), lucide-react, Zustand, Supabase, CodeMirror 6, PWA e Capacitor para Android e iOS.
- Os alarmes só disparam quando o usuário escolhe um horário: o padrão é "Sem alarme".
- O usuário pode escolher uma cor de destaque nas Configurações, além do padrão.
- Modo claro e modo escuro (segue o sistema por padrão).
- O projeto é feito em dupla (o criador e um amigo), com CI rodando lint, typecheck, testes e build.

## Brand Commitments
- Nome: **Organizer**.
- Paleta definida pelo criador para a versão definitiva:
  - modo escuro: preto 60%, branco 30% e verde-lima #C6FF3D 10%;
  - modo claro: a mesma paleta invertida, branco 60%, preto 30% e lima 10%.
- O lima é a cor de destaque padrão, e as outras cores continuam como opção do usuário.
- Logo e mascote serão criados a partir de referências que o criador vai enviar. Ainda não existem.
- Tom atual da interface: frases curtas e próximas ("Bom trabalho!", "Dia livre"), em português do Brasil.

## Evidence on Hand
- O app em funcionamento: https://organizerapp.vercel.app
- Os dados de exemplo do próprio app: as listas "Pessoal" e "Estudos", os hábitos "Ler 20 minutos", "Exercício" e "Beber água", e o evento "Aula de inglês (exemplo)".
- Não há depoimentos, números de usuários, imprensa nem preços. Nada disso deve ser inventado.

## Product Principles
1. O dia de hoje primeiro: abrir e saber o que fazer agora.
2. Uma ação, um toque: concluir, remarcar e marcar hábito sem abrir telas.
3. Simples por fora, poderoso por dentro: quadros e notas ricas sem a complexidade do Notion.
4. Nada se perde: Desfazer em toda exclusão, Lixeira e anotações ligadas às tarefas.
5. Avisar a tempo: o alarme por e-mail é a promessa central e precisa ser claro e confiável.

## Accessibility & Inclusion
Contraste WCAG AA, navegação por teclado, foco visível, respeito a "reduzir movimento" e alvos de toque de pelo menos 44px no celular. Isso já é praticado no código atual (auditorias com axe).
