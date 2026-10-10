| V39-005 | AUD-050 | em produção || V39-004 | AUD-050 | em produção || V39-003 | AUD-050 | em produção |# V39: matriz por ID

A ordem é `V39-construcao-integral-apos-V38.md`.

## Como ler a matriz

Cada V39 tem a sua linha, e a coluna AUD aponta os itens da V38 correspondentes.

O estado de cada linha é um destes:

| Estado | O que significa |
|---|---|
| **feito** | Construído ou corrigido nesta rodada, com teste dirigido e commit. |
| **ensaiado** | Provado na cópia local de produção (`gestao_publica_ensaio_v39`). |
| **em produção** | Instalado e conferido na produção. |
| **existe** | O levantamento desta rodada achou o mecanismo. Ainda não foi provado nesta rodada. |
| **lacuna** | O mecanismo não existe. |
| **depende** | Falta um insumo exato, nomeado na linha. |

O levantamento de existência foi feito por leitura em 09/10/2026. Os dois inventários estão resumidos nas linhas.

## A. Segurança da operação e correções abertas

| ID | AUD | Estado | O que há | Rota e perfil | Prova | Residual |
|---|---|---|---|---|---|---|
| V39-001 | — | feito | `scripts/inventario-de-versao.ts` junta o que cada lugar declara:<br>· do repositório: HEAD local, o mesmo ramo no remoto, `main` remota (o que a publicação instala), árvore e última migration do código;<br>· do servidor: `/release` (commit, ambiente, candidato) e `/natureza-da-base`;<br>· com `DATABASE_URL`: a última migration aplicada e a natureza declarada no banco. | operador | Rodado contra a 3011.<br>Achado: o ramo `apresentacao/contabilidade` no remoto está parado em `ce8c5c45`, porque a publicação empurra para a `main`. | — |
| V39-002 | — | feito | A natureza da base passou a ser uma declaração no banco (`DeclaracaoDaNaturezaDaBase`, append-only, CHECK do conjunto), lida por `/natureza-da-base`.<br>O `entrar` comum a todos os percursos recusa, antes de digitar a senha:<br>· destino remoto sem `PERCURSO_DESTINO_AUTORIZADO` igual à origem;<br>· base não declarada DEMONSTRACAO ou ENSAIO.<br>A semente da base fictícia declara DEMONSTRACAO; rebaixar uma base OFICIAL pede confirmação. | operador (`scripts/declarar-natureza-da-base.ts`) | `test/natureza-da-base.test.ts`: 9/9, 3 mutações vermelhas.<br>Recusa real de destino remoto não declarado. | Feito: produção declarada DEMONSTRACAO. Ainda faltam 28 scripts com login próprio (`PERCURSOS-COM-LOGIN-PROPRIO`). |
| V39-003 | AUD-050 | ensaiado | A FIC-PM-500 tem 4 pendências, inspecionadas por ID na cópia de produção:<br>· extrato `cmv1nbo5j…`, caução de 600,00, 01/07;<br>· razão `cmuw12…`, ingresso extraorçamentário da caução, 600,00, 01/07;<br>· extrato `cmv1nbo5w…`, tarifa de −8,90, 07/08;<br>· pagamento `43fe6a3a…`, FIC-PG-L2, −2.000,00, 07/08.<br>O relato "caução mais duas justificativas" fecha com as 4: o par da caução conta 2.<br>`scripts/percurso-v39-continuidade-da-conciliacao.mts` abre o seguinte, vincula o par de mesmo valor, justifica o resto e confere que o encerrado não muda. | tesoureiro, `/financeiro/conciliacao/periodo` | Ver a seção de execução no ESTADO. | — |
| V39-004 | AUD-050 | ensaiado | O vínculo da caução é feito pelo painel da conta (`?conta=`).<br>Vínculo não é lançamento: os saldos do novo período são conferidos antes e depois. | tesoureiro, `/financeiro/conciliacao` | idem | — |
| V39-005 | AUD-050 | ensaiado | Uma justificativa por pendência, montada do dado dela (data, descrição, valor).<br>A data inicial vem da tela do período encerrado (dia civil seguinte), não do relógio. | tesoureiro | idem | Produção. |
| V39-006 | AUD-050 | depende | A FIC-CM-500 de produção não tem movimento. O período aberto e vazio (01/01 a 09/10/2026) foi criado pelo percurso da V38.<br>Não se apaga, porque o modelo é append-only, e não se fabrica movimento.<br>Encerrá-lo vazio é um ato possível e auditável depois de 09/10: saldo 0, nenhuma pendência. | tesoureiro | — | Decisão: encerrar o período vazio ou deixá-lo aberto como o primeiro período real da conta. |
| V39-007 | AUD-050 | feito | `scripts/ofx-de-ensaio.ts` grava em windows-1252 de verdade e recusa o caractere que não cabe, nomeando-o.<br>O "latin1" do Node truncava o travessão no byte 0x14.<br>O percurso da conciliação passou a usá-lo, com a descrição acentuada. | — | `test/ui/ofx-de-ensaio.test.ts`: ida e volta pelo `TextDecoder` da plataforma e pelo leitor do sistema, borda 30/06–01/07.<br>Uma mutação vermelha.<br>Importação real pela tela na 3011: o memo "DEMO Arrecadação…" e "TARIFA “PACOTE” DE SERVIÇOS" chegaram intactos ao banco. | — |
| V39-008 | AUD-050 | feito | O serviço `encerrarConciliacao` passou a recusar:<br>· período que ainda não terminou (fim depois de agora);<br>· pendência sem justificativa, nomeando qual.<br>A diferença sem explicação continua sendo a outra recusa, a proibida. | tesoureiro | `m09-conciliacao-periodo.test.ts`: t7b (N=2) e t7c, 19/19, 2 mutações vermelhas.<br>Percurso real: o roteiro não encerrou com conferência falhando. | — |
| V39-009 | AUD-034/039 | lacuna | — | — | — | Próximas levas. |
| V39-010 | AUD-041 | lacuna | — | — | — | Próximas levas. |
| V39-011 | AUD-042 | lacuna | — | — | — | Próximas levas. |
| V39-012 | AUD-122 | feito | Um rótulo só e exaustivo, `Record<SituacaoDaOrdem, …>`, nas três telas: lista, execução do contrato e detalhe da ordem.<br>Valor fora do tipo vira a frase "situação não reconhecida: confira a ordem", com registro no servidor. | todos os que veem ordens | `test/ui/situacao-da-ordem.test.ts`: 2/2, uma mutação vermelha. | — |

## B. Planejamento completo e desempenho

| ID | AUD | Estado | O que há | Prova | Residual |
|---|---|---|---|---|---|
| V39-013 | — | lacuna | Sem gerador de 1.100/10.000 linhas nem medição.<br>Indício: `detalhar` carrega todas as linhas com os ajustes, e a página monta um formulário por linha. | — | Medir antes de mudar. |
| V39-014 | — | lacuna | `detalhar` não pagina nem filtra no servidor. | — | Depende de V39-013. |
| V39-015 | — | lacuna | Um `FormAjusteDaLinha` por linha. | — | Depende de V39-013. |
| V39-016 | AUD-111/112/113 | feito (reajuste) | A prévia do reajuste devolve a versão (SHA-256 de linha, vigente e novo); a aplicação recalcula e recusa se mudou; "Aplicar" só depois da prévia. | N=2 (ajuste concorrente; percentual trocado), mutação vermelha | A importação ainda não tem versão (cria proposta nova: o risco é menor, mas fica nomeado). |
| V39-017 | AUD-104/098 | lacuna | A LDO só cria e tramita; não importa. | — | — |
| V39-018 | AUD-106 | lacuna | O PPA não importa nem revisa. | — | — |
| V39-019 | AUD-101 | existe | `VersaoDoProjetoDaLoa`, com captura, versão na remessa e diferença para a lei.<br>Não se liga à proposta. | — | Ligar à proposta. |
| V39-020 | — | existe | Emendas com sanção que grava ajuste append-only na linha. | — | Comparativo com a versão capturada. |
| V39-021 | AUD-101 | feito | `efetivarPropostaOrcamentaria` passou a exigir o fundamento, e ele fica gravado na efetivação (colunas e CHECK):<br>· **LEI_APROVADA:** a LOA com aprovação registrada; guarda lei e aprovação;<br>· **EXECUCAO_PROVISORIA:** o dispositivo da LDO, conferido como ato declarado, que tem de falar do orçamento daquele exercício; recusado se a lei já está aprovada;<br>· **ENSAIO:** só em base declarada de demonstração ou ensaio.<br>A tela oferece os três, o ensaio só quando o banco permite, e mostra o fundamento da proposta já efetivada. | `m02-proposta-orcamentaria.test.ts`: 4 testes novos, 41/41 com as emendas, 2 mutações vermelhas.<br>CHECK provado por INSERT direto. | — |
| V39-022 | AUD-102 | feito | O teste compara fichas, receitas, movimentos E o razão de 2026 (lançamentos por id, partidas por D/C), com prova de não vacuidade e de que 2027 recebeu os seus. | mutação (previsão um ano antes) vermelha | — |
| V39-023 | — | existe | CMD (propor, versão, liberar, acompanhar, decreto) e guarda opt-in do 4.43. | — | Verificação com 2 fontes e 2 meses. |
| V39-024 | AUD-092 | existe | MBA com confronto meta contra realizado. | — | Falta a coluna "reestimado". |
| V39-025 | AUD-091 | existe | A prévia de crédito (criar, aprovar, efetivar) e a efetivação recusando prévia que mudou. | — | A solicitação pela unidade não é fase própria. |
| V39-026 | — | existe | Comparação de exercícios com CSV do objeto inteiro. | — | PDF; teste de soma CSV contra tela. |

## C. Receita, tesouraria e contabilidade

| ID | AUD | Estado | O que há | Residual |
|---|---|---|---|---|
| V39-027 | AUD-031 | lacuna | A retenção nasce no pagamento. | A prévia sem lançamento pode ser construída antes da regra do momento oficial. |
| V39-028 | AUD-036/041 | lacuna | A PF é classificada como `IRRF_FORNECEDOR_PJ` (`retencao-calculada.ts:485`, `retencao.ts:261`). | Fato próprio PF; ampliar os CHECKs; preservar o histórico. |
| V39-029 | AUD-047b | lacuna | Não há linha de extrato digitada. | Ensaio antes da decisão. |
| V39-030 | AUD-056 | lacuna | O M07 só modela o passivo. | — |
| V39-031 | AUD-118–121 | feito | Família CONTRATO (REGISTRO, ACRESCIMO, SUPRESSAO, EXECUCAO), classes 7/8, contas do contador; o rol de famílias do zod vem do mapa. Teste t3b, 5/5. | Quais eventos cada tipo de contrato usa é escolha da contadora; o mecanismo está pronto. A aplicação no razão é o V39-032. |
| V39-032 | AUD-118–121 | lacuna | `contratos.ts` não lança no razão. | Depende de V39-031. |
| V39-033 | AUD-124 | lacuna | — | — |
| V39-034 | — | existe | Atribuição de UG por guia e `ug-do-registro`. | Prova com 2 UGs. |
| V39-035 | — | existe | `numeracaoNoExercicio` pelo ente. | Leiaute do Tribunal. |
| V39-036 | AUD-057 | existe | Cadeia de encerramento testada em serviço (m08). | Percurso de tela; anulação parcial depois. |
| V39-037 | — | existe | `composicao.ts` (BF, BO, DFC) até o documento. | BP, DVP e DMPL param na conta. |
| V39-038 | AUD-078 | depende | `docs/oficial/stn-sof` tem trechos. | MCASP e manuais completos, de fonte primária. |

## D a G. Compras, contratos, pessoas, materiais, frota, farmácia e atendimento

| ID | AUD | Estado | Resumo do levantamento |
|---|---|---|---|
| V39-039 | — | existe | Solicitação de compra existe. Falta ligá-la ao processo e consolidar. |
| V39-040 | — | existe | Pesquisa de preços com estatística. Faltam o método, o tipo de fonte e o anexo. |
| V39-041 | AUD-115 | existe | Reserva com processo. Falta a prova N=2 de consumo sem dupla dedução. |
| V39-042 | — | lacuna | Não há participante, proposta nem resultado por item ou lote. |
| V39-043 | — | lacuna | Não há adjudicação. |
| V39-044 | — | existe | Homologação, uma por processo. Falta corrigir por novo ato e a abrangência por item. |
| V39-045 | — | existe | Contrato exige processo homologado. O contratado é digitado. |
| V39-046 | — | lacuna | Ata de registro de preços. |
| V39-047 | — | existe | Aditivo por itens (parcial). |
| V39-048 | — | existe | A cadeia ordem → medição → recebimento → liquidação existe. |
| V39-049 | — | existe | Obras, planilha e medição (parcial). |
| V39-050 | AUD-122 | feito | Busca (número, contrato, contratado, finalidade), ano, situação (a mesma régua, aplicada antes de paginar) e páginas de 100 no servidor. O total é o do conjunto filtrado; o filtro não abre alcance. Teste: 4/4 com 103 + 2 ordens, 2 mutações vermelhas. |
| V39-051 | — | existe | `TipoVinculoRh` completo. Falta provar que o cadastro alimenta o cálculo. |
| V39-052 | — | existe | Só o tipo do vínculo. Não há modelo de benefício. |
| V39-053 | — | depende | Faltam férias, rescisão e RRA, que dependem do estatuto. |
| V39-054 | — | existe | Afastamento e retorno. Faltam as férias. |
| V39-055 | — | existe | Folha até a guia. Falta a ponte com a ordem de pagamento e o retorno. |
| V39-056 | — | existe | O centro de custo no vínculo existe. O M33 não apropria por ele. |
| V39-057 a 062 | — | existe | Almoxarifado físico, requisição, inventário, incorporação, termos e depreciação. As provas pedidas estão por fazer. |
| V39-063 | — | lacuna | Condutor e CNH. |
| V39-064 | — | lacuna | Ordem de abastecimento. |
| V39-065 | — | lacuna | Hodômetro e horímetro. |
| V39-066 | — | lacuna | Manutenção. |
| V39-067 | — | existe | Multa (V36). Falta o andamento documental. |
| V39-068 | — | lacuna | Tanque próprio. |
| V39-069 | — | depende | Tabela farmacêutica oficial. |
| V39-070 | — | existe | Lote e validade no almoxarifado. Falta o bloqueio de saída de lote vencido. |
| V39-071 | — | lacuna | Dispensação. |
| V39-072 | — | lacuna | Inventário da farmácia. |
| V39-073 | — | depende | Leiaute BNAFAR. |
| V39-074 | — | existe | Tributário e dívida ativa. Falta a ponte lançamento → baixa → inscrição. |
| V39-075 | AUD-059 | depende | Amostra do legado. |
| V39-076 | — | existe | Convênios, sem MODULO.md. |
| V39-077 e 078 | — | existe | Concessão, prestação e devolução. Faltam a tela de cadastro e o percurso. |
| V39-079 | — | existe | Protocolo e anexo autorizado. |
| V39-080 | — | existe | Guichê com trinco do horário. |
| V39-081 | — | existe | LAI e ouvidoria em fluxos separados. |
| V39-082 | — | existe | Transparência. |
| V39-083 | — | depende | O M35 é licenciamento do software, não licença municipal. Confirmar o escopo. |

## H. Integrações e apresentação

| ID | Estado | Resumo |
|---|---|---|
| V39-084 a 087 | depende | Reinf, SIOPE e SIOPS: leiaute oficial de fonte primária. |
| V39-088 a 091 | existe | SAGRES, RREO/RGF, MSC/MANAD e eSocial existem. As provas pedidas estão por fazer. |
| V39-092 a 094 | lacuna | Conferência por família de PDF e CSV; percurso por perfil. |
| V39-095 | existe | Aviso de versão (V38) e rascunho por aba. |
| V39-096 | feito | O painel da conciliação passou a receber a conta (`?conta=`), e a tela é aberta antes de publicar. |
| V39-097 | existe | Backup local antes de cada publicação. Falta a restauração provada em destino isolado. Feito nesta rodada: a cópia de produção foi restaurada localmente em `gestao_publica_ensaio_v39` e serviu na 3011. |
