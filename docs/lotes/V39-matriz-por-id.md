# V39: matriz por ID

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

### Recontagem depois da V39-R2 (11/10/2026)

As linhas que vinham agrupadas (057 a 062, 077 e 078, 084 a 087, 088 a 091, 092 a 094) foram desdobradas, uma por ID. São 97 IDs, cada um com a sua linha:

| Estado | IDs |
|---|---|
| em produção | 27 |
| feito | 11 |
| existe | 40 |
| depende | 11 |
| lacuna | 8 (027, 029, 030, 033, 068, 092, 093, 094) |

"Em produção (código; não operado em produção)" quer dizer que o código está instalado e a tela abre, mas o fluxo não foi exercido lá porque a base de produção não tem o dado de partida (veículo, farmácia, metas, proposta, agente de contratação). Criá-lo só para o percurso seria fabricar dado; o fluxo foi exercido na 3011. A V39 não está fechada.

## A. Segurança da operação e correções abertas

| ID | AUD | Estado | O que há | Rota e perfil | Prova | Residual |
|---|---|---|---|---|---|---|
| V39-001 | — | feito | `scripts/inventario-de-versao.ts` junta o que cada lugar declara:<br>· do repositório: HEAD local, o mesmo ramo no remoto, `main` remota (o que a publicação instala), árvore e última migration do código;<br>· do servidor: `/release` (commit, ambiente, candidato) e `/natureza-da-base`;<br>· com `DATABASE_URL`: a última migration aplicada e a natureza declarada no banco. | operador | Rodado contra a 3011.<br>Achado: o ramo `apresentacao/contabilidade` no remoto está parado em `ce8c5c45`, porque a publicação empurra para a `main`. | — |
| V39-002 | — | feito | A natureza da base passou a ser uma declaração no banco (`DeclaracaoDaNaturezaDaBase`, append-only, CHECK do conjunto), lida por `/natureza-da-base`.<br>O `entrar` comum a todos os percursos recusa, antes de digitar a senha:<br>· destino remoto sem `PERCURSO_DESTINO_AUTORIZADO` igual à origem;<br>· base não declarada DEMONSTRACAO ou ENSAIO.<br>A semente da base fictícia declara DEMONSTRACAO; rebaixar uma base OFICIAL pede confirmação. | operador (`scripts/declarar-natureza-da-base.ts`) | `test/natureza-da-base.test.ts`: 9/9, 3 mutações vermelhas.<br>Recusa real de destino remoto não declarado. | Feito: produção declarada DEMONSTRACAO. Ainda faltam 28 scripts com login próprio (`PERCURSOS-COM-LOGIN-PROPRIO`). |
| V39-003 | AUD-050 | em produção | A FIC-PM-500 tem 4 pendências, inspecionadas por ID na cópia de produção:<br>· extrato `cmv1nbo5j…`, caução de 600,00, 01/07;<br>· razão `cmuw12…`, ingresso extraorçamentário da caução, 600,00, 01/07;<br>· extrato `cmv1nbo5w…`, tarifa de −8,90, 07/08;<br>· pagamento `43fe6a3a…`, FIC-PG-L2, −2.000,00, 07/08.<br>O relato "caução mais duas justificativas" fecha com as 4: o par da caução conta 2.<br>`scripts/percurso-v39-continuidade-da-conciliacao.mts` abre o seguinte, vincula o par de mesmo valor, justifica o resto e confere que o encerrado não muda. | tesoureiro, `/financeiro/conciliacao/periodo` | Ver a seção de execução no ESTADO. | — |
| V39-004 | AUD-050 | em produção | O vínculo da caução é feito pelo painel da conta (`?conta=`).<br>Vínculo não é lançamento: os saldos do novo período são conferidos antes e depois. | tesoureiro, `/financeiro/conciliacao` | idem | — |
| V39-005 | AUD-050 | em produção | Uma justificativa por pendência, montada do dado dela (data, descrição, valor).<br>A data inicial vem da tela do período encerrado (dia civil seguinte), não do relógio. | tesoureiro | idem | Produção. |
| V39-006 | AUD-050 | depende | A FIC-CM-500 de produção não tem movimento. O período aberto e vazio (01/01 a 09/10/2026) foi criado pelo percurso da V38.<br>Não se apaga, porque o modelo é append-only, e não se fabrica movimento.<br>Encerrá-lo vazio é um ato possível e auditável depois de 09/10: saldo 0, nenhuma pendência. | tesoureiro | — | Decisão: encerrar o período vazio ou deixá-lo aberto como o primeiro período real da conta. |
| V39-007 | AUD-050 | feito | `scripts/ofx-de-ensaio.ts` grava em windows-1252 de verdade e recusa o caractere que não cabe, nomeando-o.<br>O "latin1" do Node truncava o travessão no byte 0x14.<br>O percurso da conciliação passou a usá-lo, com a descrição acentuada. | — | `test/ui/ofx-de-ensaio.test.ts`: ida e volta pelo `TextDecoder` da plataforma e pelo leitor do sistema, borda 30/06–01/07.<br>Uma mutação vermelha.<br>Importação real pela tela na 3011: o memo "DEMO Arrecadação…" e "TARIFA “PACOTE” DE SERVIÇOS" chegaram intactos ao banco. | — |
| V39-008 | AUD-050 | feito | O serviço `encerrarConciliacao` passou a recusar:<br>· período que ainda não terminou (fim depois de agora);<br>· pendência sem justificativa, nomeando qual.<br>A diferença sem explicação continua sendo a outra recusa, a proibida. | tesoureiro | `m09-conciliacao-periodo.test.ts`: t7b (N=2) e t7c, 19/19, 2 mutações vermelhas.<br>Percurso real: o roteiro não encerrou com conferência falhando. | — |
| V39-009 | AUD-034/039 | em produção | Na prévia das retenções, o atalho "Cadastrar/Alterar o perfil fiscal" leva à pessoa do fornecedor (âncora `#perfil-fiscal`, retorno seguro) e o "Voltar ao pagamento" traz a mesma liquidação; número, valor, data, histórico e cheque voltam pelo rascunho da aba (o mesmo mecanismo do empenho). | tesoureiro, /despesa/pagamentos → /cadastros/pessoas/[id] | `percurso-v39-perfil-fiscal-no-pagamento` 5/5 na base fictícia; mutação da reposição vermelha | — |
| V39-010 | AUD-041 | em produção | O dossiê do empenho mostra o IR retido como receita do município (natureza, guia, lançamento), separado das consignações. **Defeito de dinheiro corrigido:** a saída de caixa do dossiê ignorava a retenção própria (mostrava 890,00 onde o razão credita 792,00). | contador e tesoureiro, /despesa/empenhos/[id] | `m07-retencao-calculada` (27/27): dossiê = razão; mutação vermelha; dossiê aberto na fictícia | A classificação própria do ente continua vazia em produção (decisão de AUD-041): sem ela não há retenção própria a mostrar. |
| V39-011 | AUD-042 | em produção | O ISS do município aparece como receita própria (natureza, guia); o ISS devido a outro ente continua entre as consignações de terceiros, com o credor. | idem | idem | idem |
| V39-012 | AUD-122 | feito | Um rótulo só e exaustivo, `Record<SituacaoDaOrdem, …>`, nas três telas: lista, execução do contrato e detalhe da ordem.<br>Valor fora do tipo vira a frase "situação não reconhecida: confira a ordem", com registro no servidor. | todos os que veem ordens | `test/ui/situacao-da-ordem.test.ts`: 2/2, uma mutação vermelha. | — |

## B. Planejamento completo e desempenho

| ID | AUD | Estado | O que há | Prova | Residual |
|---|---|---|---|---|---|
| V39-013 | — | em produção (código; produção não tem proposta) | `scripts/medir-proposta-grande.mts` gera a proposta sintética (só em base DEMONSTRACAO ou ENSAIO) e mede servidor e navegador. Medido na fictícia, servidor de desenvolvimento (a máquina de 31 GB):<br>· 1.133 linhas: `detalhar` 79 ms quente, 484 KiB; página **13 MB de HTML, 46 mil nós, 1.140 formulários, 24 a 39 s**.<br>· A causa é a página (um formulário por linha), não o banco. | ver ao lado | — |
| V39-014 | — | em produção (código; produção não tem proposta) | Páginas de 100 e busca (ignora acento, acha código pelos dígitos) no servidor; "Mostrando a a b de N", a soma do filtro sobre o conjunto filtrado inteiro, navegação entre páginas. Depois:<br>· 1.133 linhas: 2,9 MB, 5,2 mil nós, 8 formulários, 3,9 s;<br>· 10.123 linhas: `detalhar` 316 ms, 4,2 MB de objeto; página 2,8 MB, 5 mil nós, 4 a 7 s. O tamanho da página não cresce mais com as linhas. Dos 2,8 MB, 2,5 MB são o payload do React do modo de desenvolvimento. | `test/ui/recorte-da-proposta.test.ts` 3/3 | `detalhar` ainda lê todas as linhas (0,3 s com 10 mil); paginar na consulta só se a medição pedir. |
| V39-015 | — | em produção (código; produção não tem proposta) | "Alterar" é um link para `?editar=<linha>` (busca e página preservadas, âncora na linha); só a linha escolhida monta o formulário, já aberto, na página em que ela está. | `percurso-v39-proposta-paginada` 8/8 na proposta de 10.054 fichas (páginas, busca, editor único, ajuste gravado no banco, busca preservada) | — |
| V39-016 | AUD-111/112/113 | feito (reajuste) | A prévia do reajuste devolve a versão (SHA-256 de linha, vigente e novo); a aplicação recalcula e recusa se mudou; "Aplicar" só depois da prévia. | N=2 (ajuste concorrente; percentual trocado), mutação vermelha | A importação ainda não tem versão (cria proposta nova: o risco é menor, mas fica nomeado). |
| V39-017 | AUD-104/098 | em produção (código; não operado em produção) | R2-021: `importacao-da-ldo.ts`. Nove blocos, mapa dos anos digitado, prévia com o que fica de fora e por quê, versão da prévia (SHA-256) conferida na confirmação. Destino só em rascunho (sem envio, protocolo, sanção nem ato), blocos vazios no destino, trâmite da origem não copiado, metas pelo vigente. A origem fica registrada (`ImportacaoDaLdo` e itens). Os cadastros manuais dos blocos travam a peça. | `m02b-importacao` 7/7; consumidores 93/93; 4 mutações vermelhas (vigente, versão, sobreposição, trava). Na tela (3011): `percurso-v39r2-importacao-do-planejamento` 9/9. | Produção não tem metas na LDO: não operado lá. |
| V39-018 | AUD-106 | em produção (código; não operado em produção) | R2-022: `importacao-do-ppa.ts`. A revisão do ciclo vigente continua sendo o ato de alteração (preserva a versão). A importação prepara só o plano seguinte (recusa sobreposição, com a explicação), copia programas, indicadores e ações (código reduzido no plano novo) e previsões pelo mapa dos anos, pelo vigente, e registra a origem e a versão (último ato da origem). | O mesmo teste, com negação por bloco e N=2 no mapa. Na tela, a mesma corrida (PPA 2034–2037 a partir do 2030–2033, e a recusa da revisão). | Produção não tem programas no PPA. |
| V39-019 | AUD-101 | em produção | R2-023: a versão do projeto aponta a proposta, e cada dotação e receita a linha de origem. Proposta não efetivada: as linhas, pelo valor no fim do dia do encaminhamento. Efetivada: as fichas, ligadas pela classificação quando o par é único (o resto é contado). FKs RESTRICT. | `m02b-projeto-da-loa` 11/11; 5 mutações vermelhas. Na tela, a captura foi recusada nomeando as declarações que a base fictícia não tem (`DECLARACOES-DO-PROJETO-NA-BASE-FICTICIA`). | A ligação com valores pela tela depende dessas declarações. |
| V39-020 | — | em produção (tela aberta; sem proposta em produção) | R2-024: `comparativo-das-emendas.ts`. Base = a versão guardada; por dotação: projeto, já no projeto (aprovadas antes da base), aprovadas, rejeitadas, pendentes, esperado, hoje e outros ajustes. Sem versão, diz que não há base e não reconstrói; sem ligação, não calcula esperado. | `m02b-emendas` 12/12; 2 mutações vermelhas. | — |
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
| V39-028 | AUD-036/041 | em produção | R2-005 a 007: fato próprio da retenção de PF (natureza e VPA próprias, pelo documento do credor do empenho), legado PF e PJ só sinalizado (sem reclassificar), documento fora do padrão recusado, anulação do pagamento indevido. Percursos `percurso-v39r2-ir-pessoa-fisica` e `percurso-v39r2-anular-pagamento-indevido` na 3011. | Não operado em produção (moveria a FIC-PM-500 com outubro aberto). Série R-4000 sem leiaute (`FONTE-REINF-LEIAUTES-2.1.2B`). |
| V39-029 | AUD-047b | lacuna | Não há linha de extrato digitada. | Ensaio antes da decisão. |
| V39-030 | AUD-056 | lacuna | O M07 só modela o passivo. | — |
| V39-031 | AUD-118–121 | feito | Família CONTRATO (REGISTRO, ACRESCIMO, SUPRESSAO, EXECUCAO), classes 7/8, contas do contador; o rol de famílias do zod vem do mapa. Teste t3b, 5/5. | Quais eventos cada tipo de contrato usa é escolha da contadora; o mecanismo está pronto. A aplicação no razão é o V39-032. |
| V39-032 | AUD-118–121 | em produção | R2-008 a 013: o controle contábil do contrato (REGISTRO, ACRÉSCIMO, SUPRESSÃO, EXECUÇÃO pela liquidação) com idempotência, estorno pela inversão do original e conferência contra o valor atualizado. Teste de runtime 5/5; percurso 15/15 em produção (CT-R2-141320). | Quais eventos cada tipo de contrato usa é escolha da contadora. |
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
| V39-042 | — | em produção (código; operado só na 3011) | R2-014 a 016: itens, participantes, propostas por item ou lote com versões, resultado por item sem vencedor automático, segregação por pessoa. Teste de runtime 6/6; percurso 22/22 na 3011. Produção não tem agente de contratação fictício. |
| V39-043 | — | em produção (código; operado só na 3011) | R2-017: adjudicação por item, sobre o resultado. |
| V39-044 | — | em produção (código; operado só na 3011) | R2-018: homologação por ato, com abrangência por item e correção por novo ato com motivo (data conferida contra contratos e atas). |
| V39-045 | — | em produção (código; operado só na 3011) | R2-019: contrato originado do resultado; o processo com itens recusa o contrato avulso. |
| V39-046 | — | em produção (código; operado só na 3011) | R2-020: ata de registro de preços com saldos distintos por item; ata vencida e item já contratado diretamente recusados. |
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
| V39-057 | — | existe | A entrada física nasce da liquidação de material (um ato só com o razão), com lote e validade. Não há entrada avulsa pela tela. Falta a prova pedida (dupla entrada, limite ao recebido). |
| V39-058 | — | existe | Requisição, cota mensal por setor e saída com o consumo no razão (a saída virou `registrarSaidaFisicaNaTx` na R2-030, sem mudar o comportamento). Falta o percurso com recusa de saldo. |
| V39-059 | — | existe | Inventário com contagem e divergência derivada. O ajuste físico com o contábil existe agora (`registrarAjusteFisicoNaTx`, R2-031), mas só pela farmácia; no almoxarifado geral, `AJUSTE-DE-INVENTARIO-EM-LOTE` segue pendente. |
| V39-060 | — | existe | Incorporação de bem móvel (M10). Falta a prova da origem da aquisição até o bem. |
| V39-061 | — | existe | Transferência e termos. Falta a prova da vigência da responsabilidade. |
| V39-062 | — | existe | Depreciação e baixa. Falta a conciliação com o razão pedida. |
| V39-063 | — | em produção (código; não operado em produção) | R2-025: condutor com versões da CNH; categorias aceitas por bem declaradas pelo ente; aviso de vencimento na tela; CNH conferida na ordem e no abastecimento. `m36-operacao` 7/7; percurso 11/11 na 3011. Produção não tem veículo. Pendência CATEGORIA-ACC. |
| V39-064 | — | em produção (código; não operado em produção) | R2-026: ordem por bem, condutor, combustível, limite e prazo; o abastecimento pela ordem confere tudo e o saldo; prova determinística da trava. |
| V39-065 | — | em produção (código; não operado em produção) | R2-027: leitura que não volta, correção encadeada com motivo, leitura de abastecimento anulado fora da conta, consumo derivado (km/L, L/h). |
| V39-066 | — | em produção (código; não operado em produção) | R2-028: pedido, autorização (contrato opcional), conclusão com custo, cancelamento; as fases leem o estado depois da trava. |
| V39-067 | — | existe | Multa (V36). Falta o andamento documental. |
| V39-068 | — | lacuna | Tanque próprio. |
| V39-069 | — | depende | Tabela farmacêutica oficial. |
| V39-070 | — | em produção | R2-029: lote vencido não sai (régua do dia civil), N=2 sob fusos deslocados; o vencido sai só pela perda, com destino (R2-031). |
| V39-071 | — | em produção (código; não operado em produção) | R2-030: a farmácia aponta um depósito; dispensação com vários itens num ato, lote obrigatório, consumo no razão; identificador do usuário só para quem dispensa na unidade. `m37-operacao` 10/10; percurso 8/8 na 3011, sem estoque (`ESTOQUE-DE-MEDICAMENTO-NA-BASE-DE-ENSAIO`). |
| V39-072 | — | em produção (código; não operado em produção) | R2-031: perda (com destino) e sobra ao custo médio, no estoque e no razão, com o inventário do depósito opcional. O informe mensal derivado dos fatos não foi feito: o informe continua digitado ou por arquivo. |
| V39-073 | — | depende | Leiaute BNAFAR. |
| V39-074 | — | existe | Tributário e dívida ativa. Falta a ponte lançamento → baixa → inscrição. |
| V39-075 | AUD-059 | depende | Amostra do legado. |
| V39-076 | — | existe | Convênios, sem MODULO.md. |
| V39-077 | — | existe | Diárias: concessão, prestação e devolução. Faltam a tela de cadastro e o percurso. |
| V39-078 | — | existe | Suprimento de fundos: concessão, prestação e baixa. Faltam a tela de cadastro e o percurso. |
| V39-079 | — | existe | Protocolo e anexo autorizado. |
| V39-080 | — | existe | Guichê com trinco do horário. |
| V39-081 | — | existe | LAI e ouvidoria em fluxos separados. |
| V39-082 | — | existe | Transparência. |
| V39-083 | — | depende | O M35 é licenciamento do software, não licença municipal. Confirmar o escopo. |

## H. Integrações e apresentação

| ID | Estado | Resumo |
|---|---|---|
| V39-084 | depende | EFD-Reinf R-2000: manual 2.1.2.1 e NT 03/2023 guardados com SHA-256; leiautes 2.1.2b não obtidos (`FONTE-REINF-LEIAUTES-2.1.2B`). Sem gerador. |
| V39-085 | depende | EFD-Reinf R-4000: o fato próprio da retenção de PF existe (R2-005); os leiautes e a tabela de natureza de rendimentos vigentes não foram obtidos. Sem gerador. |
| V39-086 | depende | SIOPE: o manual de 2026 já estava no repositório; faltam as correspondências versionadas e a prévia. |
| V39-087 | depende | SIOPS: só o manual municipal de 2016 é público; a estrutura vigente sai pelo módulo de gestores (`FONTE-SIOPS-ESTRUTURA-VIGENTE`). |
| V39-088 | existe | SAGRES por UG existe (inclusive frota e farmácia). Falta a conferência do pacote com duas UGs. |
| V39-089 | existe | RREO e RGF existem. Falta a evidência por anexo. |
| V39-090 | existe | MSC e MANAD existem, separados. Falta o período menor que o exercício no MANAD. |
| V39-091 | existe | eSocial existe para a folha. Sem certificado: não se alega transmissão. |
| V39-092 | lacuna | Conferência por família de PDF (cabeçalho, ente, período, totais, páginas) não feita. |
| V39-093 | lacuna | Conferência de CSV por releitura independente não feita. |
| V39-094 | lacuna | O percurso por perfil (não só administrador) não foi feito para todos; a R2 usou o agente de contratação e o tesoureiro onde a segregação exige. |
| V39-095 | existe | Aviso de versão (V38) e rascunho por aba. |
| V39-096 | feito | O painel da conciliação passou a receber a conta (`?conta=`), e a tela é aberta antes de publicar. |
| V39-097 | existe | Backup local antes de cada publicação. Falta a restauração provada em destino isolado. Feito nesta rodada: a cópia de produção foi restaurada localmente em `gestao_publica_ensaio_v39` e serviu na 3011. |
