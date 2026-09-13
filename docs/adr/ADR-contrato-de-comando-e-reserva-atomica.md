# ADR — O contrato de comando e a reserva atômica

**Situação:** aceita, 2026-09-13 (sessão noturna V4, seção 3). Complementa e corrige
`ADR-registro-de-operacao-em-duas-fases.md`.

## Contexto

A auditoria externa do snapshot `77cbcc9` executou o envelope da borda com portas em
memória e reproduziu (achados A01, A02, A03 de `docs/auditoria/RELATORIO-AUDITORIA-77cbcc9.md`):

- duas chamadas concorrentes idênticas executaram o ato duas vezes: "já concluiu?" seguido
  do INSERT de `INICIADA` não era uma reserva;
- um ato não contábil concluído cuja linha `CONCLUIDA` falhou foi executado de novo;
- A → B → A com a mesma chave executou três vezes;
- o replay devolvia a referência anterior sem revalidar a autorização;
- o fingerprint concatenava `nome valor` sem separador e ignorava arquivos.

## Decisão

1. **Uma chave é uma intenção imutável** no escopo (ente, usuário, ação). A mesma chave com
   outro conteúdo é `ComandoEmConflitoError`; intenção nova recebe chave nova. O formulário
   troca a chave a cada envio concluído (sucesso ou erro) e a mantém enquanto o envio está
   pendente (`components/ui/ChaveDeComando.tsx`, por `useFormStatus`).
2. **A reserva é adquirida por INSERT sob índice único** (`ComandoDeBorda`, chave única
   `(escopo, usuarioIdent, acao, chave)`). Quem perde a corrida lê a linha existente e
   recebe: conflito (fingerprint diferente), replay (`CONCLUIDO`), "em andamento"
   (`RESERVADO` dentro do prazo) ou retoma a intenção (`LIBERADO`, ou `RESERVADO` além do
   prazo de abandono de 15 minutos). A retomada é um `UPDATE` guardado pelo `operacaoId`
   que se leu: só um retomador vence.
3. **A conclusão autoritativa mora na transação do fato.** O funil `lancarNoRazao` conclui
   a reserva junto com o `SUCESSO`, na `tx` do lançamento (`tipoDoResultado = "lancamento"`).
   Um ato sem lançamento chama `concluirComandoNaTransacao(tx, "resultado", ref)` dentro da
   própria transação. Se a reserva já não é da operação corrente (retomada), a conclusão
   estoura e a transação tardia cai: o fato não nasce duas vezes.
4. **A referência do resultado é tipada.** `lancamento` é o id do lançamento; `resultado`
   é a resposta do ato. A conclusão posterior refina a referência para a do resultado; se
   falhar, o replay responde com a do lançamento, dita como tal.
5. **O replay revalida antes de revelar.** `comEscritaAutenticada` passa `revalidar`, que
   exige usuário ativo e a ação concedida em algum escopo (`exigirAcaoEmAlgumEscopo`).
   Sem `revalidar`, o envelope diz que o comando já concluiu e não revela a referência.
6. **Sem chave o envelope recusa** (`ComandoSemChaveError`, "recarregue e envie de novo").
   Um chamador que não é formulário declara `semChave` com o motivo, que vai para a linha
   `INICIADA`. O inventário é derivado dos chamadores por `test/ui/chave-de-comando.test.ts`:
   todo `<form action={…}>` de `app/(areas)` e do molde tem `<ChaveDeComando />`, e todo
   `actions.ts` passa por `comComandoDoFormulario`.
7. **Fingerprint canônico:** tuplas tipadas em JSON, na ordem do formulário; arquivos por
   nome, tipo, tamanho e sha256 dos bytes até 32 MB (acima, tupla "não digerido" com o
   tamanho); só `__chave` e `$ACTION*` saem.
8. **O escopo vem do servidor** (`escopoDoComando()`: `ENTE_ESCOPO` ou o ente único), nunca
   da URL, do cabeçalho ou do formulário.
9. **`ComandoDeBorda` entra no censo de UPDATE do papel de runtime**, só nas colunas de
   estado (`estado`, `operacaoId`, `tentativas`, `reservadoEm`, `concluidoEm`,
   `tipoDoResultado`, `resultadoRef`). `fingerprint`, `escopo`, `usuarioIdent`, `acao` e
   `chave` ficam imutáveis pelo banco. `RegistroDeOperacao` continua append-only; ganha o
   valor `REPLAY`.

## Consequências

- Duplo clique, resposta perdida e reenvio impaciente chegam como o mesmo comando e não
  duplicam fato, com duas conexões e não só com duas Promises.
- A janela que sobra, nomeada: um ato sem lançamento que não conclui na própria transação
  e cuja conclusão posterior falha fica `RESERVADO`; a repetição imediata recebe "em
  andamento"; só depois do prazo de abandono a intenção é retomada e o ato repete. Fechar
  é chamar `concluirComandoNaTransacao` no ato. Pendência
  `CONCLUSAO-NA-TRANSACAO-DOS-CADASTROS`: os cadastros do molde ainda concluem depois da
  transação.
- Revalidação "em algum escopo", declarada: a UG do fato original não é reconstruível pelo
  envelope; o replay revela a referência, não o dossiê, e a leitura do dossiê continua
  cobrando a ação de leitura no escopo.
- Envio antes da hidratação recebe recusa nomeada em vez de executar sem garantia.
- `useChaveDeComando` foi retirado; o componente cobre os 75 formulários de ação.

## Provas

`modules/m16-travamento/m16-comando.test.ts` (t1 duas conexões; t2 resposta perdida e
referência tipada; t3 ato não financeiro com conclusão falha, e a janela fechada na
transação; t4 A→B→A; t5 escopos distintos; t6 revogação e usuário inativo; t7 repetição
legítima após erro; t8 abandono, retomada e o detentor tardio derrubado; t9 sem chave),
`m16-operacao.test.ts` (as fases, o conflito, a degradação nomeada),
`test/comando-fingerprint.test.ts` (as colisões antigas), `test/ui/chave-de-comando.test.ts`
(o inventário derivado), `test/papel-runtime.test.ts` (o censo bate com o grant).
