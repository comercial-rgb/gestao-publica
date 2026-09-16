# M35 — Licenciamento comercial

> O contrato comercial **desta implantação** e os módulos que ele alcança.
> Nasceu na ordem V10, tarefa T1 (frente N6.1). Leia este arquivo antes do código.

## O que este módulo é

Uma pergunta a mais, feita antes das outras três, em toda escrita e em toda leitura
protegida do sistema:

| Pergunta | Quem responde | Onde mora |
|---|---|---|
| Quem é você? | autenticação | `m16-travamento/autenticacao.ts` |
| Você pode esta ação, aqui? | autorização | `m16-travamento/autorizacao.ts` |
| A competência está aberta? | travamento | `m16-travamento/` |
| **Este módulo foi contratado?** | **licenciamento** | **aqui** |

As quatro são independentes. Um servidor com a ação `EMPENHAR` num ente que não contratou
o núcleo contábil continua sem empenhar — e o motivo que ele lê diz que a providência é
comercial, não de permissão.

## O que este módulo **não** é

**Não é multitenancy.** O sistema continua mono-ente por implantação: um banco, um ente,
escolhido pelo `DATABASE_URL` do processo. Não há aqui lista de municípios, e não deve
haver: num banco que tem um ente, uma tela "selecione o município" não teria o que listar.
O console central que inventaria as instalações é a continuação **N6.2**, e ela **não está
construída** — ver a seção final.

**Não é um segundo censo de permissões.** Habilitar um módulo não concede ação a ninguém.
Suspender um módulo não revoga permissão nenhuma. As duas tabelas nunca se tocam.

**Não é cobrança.** Não há valor, fatura, vencimento nem bloqueio automático por
inadimplência. O que existe é o registro de vigência e os atos do fornecedor, com motivo e
autor.

## Os arquivos

| Arquivo | O que é |
|---|---|
| `modulos.ts` | o catálogo comercial e `MODULO_DA_ACAO` — `Record` exaustivo sobre `AcaoDoSistema` |
| `dominio.ts` | a decisão PURA: situação de um módulo, dependências, mensagens de recusa |
| `servico.ts` | os atos do fornecedor (registrar, habilitar, programar, suspender, reativar) e as leituras |
| `instalacao.ts` | o contrato instalado por procedimento, para que a atualização não tranque ninguém |
| `lib/portas/licenciamento.ts` | o GATE, consumido pelos dois funis |
| `lib/portas/licenciamento-admin.ts` | a tela do fornecedor |
| `app/(areas)/licenciamento/` | a superfície |

## As quatro situações, e por que são quatro

| Situação | Escreve | Lê | Quando |
|---|---|---|---|
| `HABILITADO` | sim | sim | contratado e vigente hoje |
| `SUSPENSO` | **não** | **sim** | contratado, suspenso por ato do fornecedor |
| `FORA_DE_VIGENCIA` | **não** | **sim** | contratado, com vigência que não alcança hoje |
| `NAO_CONTRATADO` | não | não | nunca esteve no contrato |

**"Lê, não escreve" não é generosidade comercial — é obrigação.** Suspender um módulo não
apaga fato nenhum: o empenho continua empenhado, o processo continua protocolado, o
documento continua emitido. O ente segue obrigado a prestar contas do que já fez, e o
cidadão segue com direito de consultar o que foi publicado. O que a suspensão impede é
**operação nova**. Um gate que derrubasse a leitura junto transformaria uma pendência
comercial em apagamento de escrituração pública.

`NAO_CONTRATADO` fecha os dois lados porque não há fato histórico a preservar num módulo
que nunca funcionou nesta implantação — e uma tela que abrisse vazia ensinaria que a
funcionalidade existe e está quebrada.

**A transparência pública não passa pelo gate.** As rotas de `app/(publico)/` não têm
sessão e não chamam as portas autenticadas — por desenho, não por exceção. Uma suspensão
não derruba o portal que já está no ar.

## Onde o gate mora, e por que não em cada tela

Nos dois funis que já existem, e que já têm guard provando que tudo passa por eles:

- **escrita** — `comEscritaAutenticada` (`lib/portas/sessao.ts`). Toda escrita da interface
  passa por ele: formulário, rota, job, exportação com efeito;
- **leitura** — `escopoDeLeitura` (`lib/portas/leitura.ts`), o ponto por onde as quatro
  decisões de leitura passam.

Pendurar o gate em cada `page.tsx` seria a enumeração que este repositório já pagou para
aprender a não fazer — "uma estimativa de dez sítios virou cinquenta e sete".

## As três recusas, e por que nenhuma é "acesso negado"

| Erro | Significa | Quem resolve |
|---|---|---|
| `LicenciamentoIndisponivelError` | o **banco** não respondeu | suporte técnico |
| `LicenciamentoNaoInstaladoError` | não há contrato nesta implantação | quem opera a instalação: `npm run licenciamento:instalar` |
| `ModuloNaoHabilitadoError` | há contrato, e este módulo não está vigente nele | o fornecedor, comercialmente |

Confundir a primeira com as outras faria uma queda de banco parecer problema comercial, e
o município ligaria para o setor errado.

## O município não concede a si próprio

`ACOES_DO_FORNECEDOR` (em `m16-travamento/acoes.ts`) é o único bloco reservado do censo.
Três consequências, cada uma com teste:

1. `concederAcaoAoPerfil` — a tela de permissões do ENTE — **recusa** qualquer uma delas;
2. o bootstrap de instalação concede `ACOES_DO_ENTE` (o censo **menos** estas). Antes ele
   concedia `TODAS_AS_ACOES`, e teria dado estas de carona no dia em que nascessem;
3. nenhuma atualização versionada de permissões as deriva.

**O que isto não promete:** quem tem o shell do servidor e o banco provisiona o que quiser.
A fronteira aqui é a **aplicação** — nenhuma tela, rota ou ação do sistema concede estas
sete. Quem as concede é `scripts/provisionar-operador-engine.ts`, um ato de instalação com
autor registrado. Prometer mais seria mentir sobre o que software consegue impedir.

## Dependências entre módulos: nomeadas, nunca habilitadas

Habilitar "Compras" sem o núcleo contábil é **recusado nomeando o que falta contratar**.
O sistema não liga a dependência sozinho: isso entregaria, por efeito colateral e de graça,
um módulo que ninguém contratou. A simetria também vale — suspender o núcleo com "Compras"
vigente é recusado, porque deixaria a tela do dependente aberta recusando cada ato por um
motivo que não é o dele.

## A instalação, e por que ela existe

O gate é fail-closed. Numa instalação **que já existe**, subir a versão sem contrato
trancaria todo mundo. As duas saídas erradas estão nomeadas na ordem V10 e as duas estão
proibidas: deixar todos sem acesso, e "liberar em silêncio quando falta configuração" — o
fallback que faria de apagar a tabela o caminho para usar tudo de graça.

A saída certa é a terceira: `npm run licenciamento:instalar` registra um contrato
explícito, derivado do que a instalação de fato usa, com autor e data. Quem pular o passo
encontra o sistema fechado com uma mensagem que nomeia o comando — **fechado e acionável**,
que não é a mesma coisa que fechado em silêncio.

⚠️ **A dedução devolve TUDO quando existe um perfil com o censo inteiro** — e isso é a
verdade, não defeito: um ente cujo administrador tem todas as ações estava mesmo operando
com tudo aberto. Por isso o script pré-visualiza por padrão e só grava com `--aplicar`, e
aceita `--modulos` quando o contrato real é menor.

## Vigência é dia civil, em texto

`inicio` e `fim` são `VARCHAR(10)`, "AAAA-MM-DD", o dia civil do ente. Não é economia de
coluna: "AAAA-MM-DD" ordena lexicograficamente igual à ordem cronológica e não tem fuso
para errar. Guardar instante e comparar com `new Date()` é o defeito que o guard
`data-civil` deste repositório já acusou duas vezes — às 21h do último dia, em UTC, o
contrato venceria para um ente que ainda está no dia anterior.

O relógio é **injetado** nos serviços (`Relogio`), e o teste L9 fixa um instante que em UTC
já é o dia seguinte.

## Pendências nomeadas

- **N6.2 — console central Engine: NÃO CONSTRUÍDO.** O que existe hoje é a habilitação
  local desta implantação. O console que inventaria as instalações, distribuiria
  habilitações auditadas e registraria endereço lógico, versão, estado de sincronização,
  autoridade e revogação está **especificado e não implementado** (`ESTADO-EXECUCAO.md`,
  seção da V10). Não apresentá-lo como pronto.
- **`LICENCIAMENTO-SEM-COBRANCA`** — não há valor, fatura nem vencimento. Vigência vencida
  não gera cobrança nem aviso: gera `FORA_DE_VIGENCIA`.
- **`LICENCIAMENTO-SEM-ASSINATURA`** — o contrato é um registro interno, sem assinatura
  digital do instrumento. Quem quiser anexar o PDF usa o M22 pelo protocolo.
