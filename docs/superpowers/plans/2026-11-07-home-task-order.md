# Ordem das tarefas do início

**Objetivo:** ordenar tarefas pendentes da data selecionada por prioridade e permitir arrastar para personalizar a ordem.

**Arquitetura:** manter a ordem das opções de prioridade de cada lista, como no modelo existente; desempatar por horário, criação e identificador. Salvar os identificadores na configuração do workspace por dia, reaproveitando persistência local, backup e sincronização. A ordem do início não altera as listas. Novas tarefas entram depois da ordem manual, por prioridade. Reordenar com filtro de área preserva a posição das tarefas ocultas.

**Implementação:** React/TypeScript, eventos nativos de arrastar, sem dependências adicionais. Alça com nome acessível, indicação de destino, alternativa por teclado e botão para restaurar prioridade. Atrasadas, concluídas e outras datas mantêm o comportamento existente.

- [x] Testar prioridade, desempates, ordem manual, tarefas novas e filtros de área.
- [x] Implementar funções de ordenação e persistência por dia.
- [x] Integrar arrastar e retorno à prioridade no início; testar os eventos da lista.
- [x] Executar testes completos, lint e build; revisar diff e branch.

Validação: 121 testes passaram (incluindo persistência local, registros de nuvem e eventos de arraste/teclado); lint e build passaram. Revisão independente sem problemas concretos. Dependências locais restauradas com `npm ci`, sem alterações no lock. Build mantém avisos de configuração Vite e tamanho dos bundles. Não houve validação visual em navegador.
