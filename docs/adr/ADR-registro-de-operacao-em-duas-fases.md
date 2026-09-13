# ADR — O registro de operação em duas fases, e a resposta verdadeira

**Situação:** aceita, 2026-09-12 (orquestração V3, pacote 4.3).

## Contexto

O envelope da borda (`comOperacaoRegistrada`) gravava uma linha de `RegistroDeOperacao`
**depois** do ato e re-lançava qualquer falha, inclusive a do próprio registro. Duas
consequências, reproduzidas em `modules/m16-travamento/m16-operacao.test.ts`:

- o ato concluía (transação commitada), o registro de sucesso falhava, e a interface
  recebia erro. O operador repetia o comando, e o fato financeiro nascia duas vezes;
- a negação era registrada e, se o registro falhasse, o erro que subia era o do log, e não
  o "ACESSO NEGADO" que explica o que aconteceu.

No login, `entrar` traduzia qualquer erro de `autenticar` em "usuário ou senha inválidos",
inclusive o banco fora do ar ou a auditoria da tentativa recusando o INSERT.

Os serviços abrem a própria transação dentro dos adapters (`criarM05Deps(prisma)`), e o
pedido V3 veta uma transação de fachada por fora deles.

## Decisão

1. **Append-only, em duas fases.** Por comando: `INICIADA` antes do ato (fora da
   transação, com chave e fingerprint); `SUCESSO` **dentro da transação do fato**, gravada
   pelo funil `lancarNoRazao` com o `lancamentoId`, uma por lançamento; `CONCLUIDA` (com a
   referência do resultado), `NEGADO` ou `ERRO` depois, fora da transação. Nenhuma linha é
   atualizada, e o papel de runtime continua só com INSERT nesta tabela.
2. **O comando corrente viaja por `AsyncLocalStorage`** do envelope até o funil. É o que
   põe a auditoria autoritativa de sucesso na mesma transação real sem mudar a assinatura
   dos 76 serviços nem abrir transação por fora dos adapters. Fora de um comando (seeds,
   jobs, testes que chamam o funil direto) o funil não grava nada.
3. **Três naturezas, três garantias.** O fato e o `SUCESSO` caem ou commitam juntos. A
   negação é registrada fora da transação para sobreviver ao rollback que ela mesma
   provoca; se o registro dela falhar, sobe o erro original e a falha vai para a
   telemetria. A conclusão é telemetria: se falhar, o chamador recebe o resultado do
   mesmo jeito.
4. **`INICIADA` é pré-condição do ato.** Se nem a tentativa pode ser registrada, o ato
   não roda (`AuditoriaIndisponivelError`): um fato sem rastro é pior que um fato adiado.
5. **Replay idempotente por chave e fingerprint, no escopo (usuário, ação).** O formulário
   manda `__chave` (gerada no cliente após a hidratação e trocada a cada sucesso); a
   action passa o `FormData` por `comComandoDoFormulario`, que calcula o fingerprint
   (sha256 do comando canônico) e os põe no contexto da action; `comEscritaAutenticada`
   os entrega ao envelope. Mesmo comando repetido: `ComandoJaConcluidoError`, sem executar.
   Mesma chave com outro fingerprint: outro comando. Sem chave: sem replay.
6. **Login:** só as mensagens de credencial inválida e de cadeado viram "usuário ou senha
   inválidos"; qualquer outra falha é "serviço indisponível", com telemetria. A falha do
   registro de sucesso não derruba um login que já aconteceu.

## Consequências

- A tela de auditoria mostra as fases (`INICIADA`, `CONCLUIDA`) além de sucesso, negação
  e erro; um ato de usuário tem ao menos duas linhas.
- Testes que liam "a primeira linha da ação" passaram a afirmar o conjunto de fases.
- Janela que sobra, nomeada: um comando **sem lançamento** (cadastro) cuja `CONCLUIDA`
  falhou não deixa `SUCESSO`; o replay não o encontra e o repete. É cadastro, não
  dinheiro; para o dinheiro, o funil fecha a janela.
- Pendência `CHAVE-DE-COMANDO-NOS-FORMULARIOS-A-MAO`: as 97 actions passam pelo contexto
  do comando, mas só o molde e o formulário de empenho mandam `__chave`. Os demais
  formulários escritos à mão ganham o campo à medida que forem tocados.

## Provas

`modules/m16-travamento/m16-operacao.test.ts` (a falha reproduzida e fechada, a negação
com o erro original, o rollback levando o `SUCESSO`, o replay), `m16-borda-*.test.ts` e
`m16-autenticacao.test.ts` (as fases), `test/unidade-de-trabalho.test.ts` (o `SUCESSO` não
existe para fato que não aconteceu).
