# V14 — Contabilidade publica: analise funcional e ordem de construcao em dois dias

> Pedido como veio, em 2026-09-26. Fonte nova: Esperanca/PB, Pregao Eletronico 00040/2026.
> O PDF de origem (`EDITAL E ANEXOS 00040.2026 (1).pdf`, SHA-256
> `0f78a4752759f44015106f56da5b959476c6d1fc449342540c3cbc6815270244`) **nao esta nesta maquina**:
> nem em `~/Downloads`, nem na arvore. Todo trecho de edital citado abaixo vem do texto da ordem,
> nao de leitura direta do PDF. Isso esta registrado como limitacao na secao 4 deste arquivo de lote.

## 1. Decisao de execucao

Concentrar as proximas duas jornadas de trabalho na contabilidade pedida neste edital. Preservar a
construcao do ecossistema, mas retirar temporariamente novas modalidades de folha do caminho
critico, salvo correcao necessaria a um consumidor contabil. A unidade adiantamento salarial fica
preservada no seu estado real, sem ser descartada ou declarada entregue.

A meta e deixar todas as capacidades exigidas operaveis para apresentacao. Dois dias sao uma janela
de execucao, nao evidencia de que todas as lacunas cabem nela. Se o inventario encontrar um motor
ausente ou uma dependencia imprescindivel, registrar imediatamente o efeito na demonstracao e
continuar as unidades possiveis. Nao reduzir silenciosamente o escopo do edital para caber no prazo.

Ha base substancial relatada: ledger, roteiros, planejamento, creditos, despesas, patrimonio, folha,
documentos e percursos. Ha tambem pendencias estruturais relatadas: dimensoes incompletas da
apuracao por entidade, casos de DDR, dependencias SAGRES e capacidade de maquina. Portanto, "falta
so refino" e hipotese a verificar, nao baseline de execucao.

Esta analise inspecionou o edital e fontes oficiais publicas. Nao inspecionou o repositorio atual do
Mac. Todo estado de implementacao abaixo e proveniente dos relatos, ou esta marcado para conferencia
local. Ultima referencia local relatada: 9654a14; o executor deve continuar do HEAD efetivo, sem
checkout para forcar esse SHA.

## 2. O que o anexo muda na prioridade

O PDF tem 39 paginas fisicas. O Anexo I, item 2.2, descreve o sistema nas paginas 22-26. Ha
repeticao no modelo de proposta, aproximadamente paginas 30-35; nao sao modulos adicionais.

Na pagina 5, itens 6.9.5-6.9.9, a prova de conceito exige demonstracao das funcionalidades em
execucao e destaca SAGRES Diario e Mensal com dia/mes escolhido pela comissao. O texto preve inicio
da demonstracao em ate dois dias uteis apos a convocacao indicada; isso nao comprova que houve
convocacao ou que a data deste usuario seja prazo formal do certame. A mesma secao estabelece
avaliacao atende/nao atende e atendimento integral. Uma apresentacao de algumas cadeias nao equivale
a aprovacao integral.

Consequencias para a construcao:

- SAGRES entra no caminho critico desde o inicio, com dados originados no sistema e periodo
  selecionavel. Um arquivo pronto para uma data fixa nao basta.
- Planejamento, alteracoes, execucao, extraorcamentario e demonstrativos devem se reconciliar no
  mesmo conjunto de fatos.
- Demonstracao precisa funcionar pela interface, com papel de aplicacao, sem INSERT manual para
  fazer a proxima tela andar.
- Relatorios e documentos sao entregas operacionais, nao anexos para depois.
- A versao apresentada precisa estar identificada e executavel no ambiente escolhido; nada autoriza
  publicacao externa automatica.

O trecho final do Anexo I termina literalmente em "composi" na pagina 26; a repeticao tambem esta
truncada. A imagem da pagina foi conferida. Implementar composicao rastreavel das retencoes e
desdobramento de engenharia sustentado pelo restante do texto; nao inventar palavras que nao estao
no original.

Fora do codigo, a pagina 5 menciona comprovacao tecnico-operacional, registro no INPI e demonstracao
de canais de suporte. As paginas 26-27 incluem importacao integral do sistema anterior e
implantacao/treinamento. Esses pontos merecem controle separado da prontidao funcional; nao sao
resolvidos por telas novas e este documento nao atesta habilitacao da empresa.

## 3. Arquitetura preservada e significado de completo

Preservar a arvore unica, monolito modular, Pessoa canonica, ledger, M01/M03/M04/M05/M09/M12 e
demais nomes efetivamente encontrados, Prisma/PostgreSQL, Decimal, comandos e documentos M22. Nao
renumerar modulos pelo numero do edital: "Modulo 1" do texto nao determina uma nova pasta M01.

O software deve distinguir ente/entidade, poder, orgao, unidade orcamentaria, unidade gestora,
centro de custo, exercicio, fonte e conta bancaria. Esses conceitos nao sao sinonimos. Nao criar
municipios globais ou mudar arquitetura monoente para resolver uma consulta consolidada.

Uma capacidade fica operavel quando possui: entrada encontravel, dados e contexto validos, acao
autorizada, efeito persistido, consulta do efeito, documento cabivel e correcao rastreavel.
"Completo conforme este edital" requer o atendimento de todas as capacidades aplicaveis, inclusive
demonstracoes e arquivos; nao equivale a possuir quatro menus.

Uma tela pronta sem dados de origem nao fecha o fluxo. Um calculo pronto sem tela pode ser base
aproveitavel, mas nao satisfaz a apresentacao. Um documento com formato correto e numeros nao
conciliados nao esta pronto.

## 4. Matriz de capacidades — o que construir ou conferir

Os IDs C01-C40 sao referencias internas desta ordem, nao numeros do TR nem nomes para a interface.
Estado real deve ser acrescentado ao catalogo existente, sem outra matriz concorrente: existente
verificado; existente sem percurso; parcial; ausente; dependencia externa especifica. O auxiliar
localiza o codigo; o gerente confirma e implementa.

| ID | Origem no texto | Capacidade executavel necessaria | Prova de resultado |
|---|---|---|---|
| C01 | Geral: escrituracao | Registrar data do fato, contas, historico, documento, valor, agrupamento e dimensoes em partidas | Debitos/creditos conciliados por natureza/subsistema; origem alcancavel |
| C02 | Geral: identificacao patrimonial | Identificar bem, direito, obrigacao e contraparte ligados ao registro | Lancamento leva ao objeto e documento, sem descricao solta como unico vinculo |
| C03 | Geral: imutabilidade | Corrigir/anular com novos atos ligados a origem; controlar periodo e efeitos posteriores | Original preservado; saldo e historico apos estorno corretos |
| C04 | Geral: seguranca/documentos | Autorizar comandos, downloads e relatorios; preservar registros e arquivos | Recusa no servidor, documento recuperavel e restauracao coerente |
| C05 | Geral: centros de custos | Acumular registros e distribuir custos quando aplicavel por programa/unidade/centro | Composicao rastreavel sem lancar novamente a mesma despesa |
| C06 | Geral: convenios e contratos | Relacionar receitas/despesas, saldos e aplicacao de recursos ao instrumento | Consulta por instrumento reconcilia com a execucao |
| C07 | Geral: intragovernamental | Identificar contraparte e natureza e preparar eliminacoes cabiveis na consolidacao | Visao individual preservada e ajuste consolidado explicavel |
| C08 | Geral: demonstrativos | Diario, Razao, Balancete, demonstracoes e relatorios fiscais aplicaveis | Total da saida reconcilia com fatos do mesmo periodo/escopo |
| C09 | Geral: dados federais | Gerar dados contabeis/fiscais com periodicidade, leiaute e informacoes complementares | Mapeamentos por versao, pendencias e arquivo verificavel |
| C10 | Planejamento 1 | Elaborar PPA com programas, acoes, metas, indicadores e anexos aplicaveis | Versao inicial, alteracao e documentos correspondentes |
| C11 | Planejamento 2 | Elaborar LDO, diretrizes, metas/riscos e anexos aplicaveis | Vinculo com planejamento e memoria dos valores |
| C12 | Planejamento 3 | Elaborar/aprovar LOA e abrir regularmente orcamento de receita/despesa | Dotacao inicial nasce da LOA, sem credito adicional artificial |
| C13 | Planejamento 4 | Versionar alteracoes de PPA/LDO e emitir comparativo | Original, atos e valores alterados preservados |
| C14 | Planejamento 5 | Analisar receita/despesa e aplicacoes para limites constitucionais | Numerador, base, exclusoes, periodo e fundamento visiveis |
| C15 | Planejamento 6 | Elaborar CMD mensal e MBA bimestral | Totais, vigencia, alteracoes e realizado comparavel |
| C16 | Alteracoes 1 | Controlar saldo orcamentario e consumo da autorizacao legal | Limite e saldo nao confundidos com caixa; concorrencia preservada |
| C17 | Alteracoes 2 | Solicitar/autorizar/abrir credito suplementar | Ato, origem, fonte, dotacao, limite e razao coerentes |
| C18 | Alteracoes 3 | Credito especial/extraordinario e reabertura quando aplicavel | Modalidade e abertura selecionam roteiro correto, sem fallback indevido |
| C19 | Alteracoes 4 | Remanejamento, transposicao e transferencia com classificacao propria | Movimentos e controle de limite conforme ato; nao disfarcar suplementacao |
| C20 | Alteracoes 5 | Fluxo de solicitacao, devolucao, aprovacao e efetivacao do credito | Pedido nao altera saldo; so ato elegivel efetiva, uma vez |
| C21 | Execucao: saldo/reserva | Reservar dotacao para processo e converter/liberar corretamente | Reserva convertida nao e descontada duas vezes |
| C22 | Execucao: CMD | Aplicar opcao de bloqueio da execucao pelo CMD configurado | Saldo de dotacao positivo nao ignora programacao ativa |
| C23 | Execucao: solicitacao | Solicitar empenho e submete-lo a autorizacao competente | Solicitacao nao produz empenho sem a autorizacao exigida |
| C24 | Execucao: empenho | Nota com vinculos pertinentes a solicitacao, licitacao, contrato, obra, publicidade, convenio, programa ou divida | Vinculos opcionais conforme objeto, selecionaveis e revalidados |
| C25 | Execucao: liquidacao | Liquidar parcela com NF/documento: numero, serie, data e evidencias | Limite por empenho, documentacao e obrigacoes respeitados |
| C26 | Execucao: pagamento | Registrar pagamento parcial/total com compatibilidade de fonte e disponibilidade | Fonte errada recusada; bruto, liquido e baixas conciliados |
| C27 | Execucao: retencoes | Determinar retencoes automaticamente por regra aplicavel e emitir comprovantes | Base, natureza, regra, valor e efeito separados e explicados |
| C28 | Execucao: retencao orcamentaria | Relacionar receita reconhecida por retencao ao pagamento originador | Nao duplicar ingresso em caixa nem receita ao consultar |
| C29 | Execucao: arrecadacao | Receita orcamentaria/intraorcamentaria e deducoes com natureza propria | Previsao, constituicao e arrecadacao nao se somam como caixa |
| C30 | Execucao: distribuicao | Distribuir receita por fontes conforme LOA; permitir alteracao autorizada no ato | Parcelas somam total; snapshot preservado no estorno |
| C31 | Execucao: reversoes | Anular/estornar creditos e fases da receita/despesa conforme dependencias | Correcao tem saldo, motivo, vinculo e limites proprios |
| C32 | Extra: ingresso | Registrar retencao, deposito, transferencia ou outro ingresso com natureza correta | Obrigacao/origem identificada; nao chamar todo ingresso de receita orcamentaria |
| C33 | Extra: dispendio | Recolher retencao, restituir deposito e registrar transferencias cabiveis | Baixa so do saldo devido, com destinatario/documento |
| C34 | Extra: recolhimento | Vincular recolhimento parcial/total as retencoes atuais ou anteriores | Composicao por origem e saldo remanescente conciliados |
| C35 | Extra: virada | Transportar posicao pendente ao novo exercicio mantendo origem | A virada nao cria nova retencao nem duplica passivo |
| C36 | Extra: estorno | Estornar ingresso/dispendio com relacao ao original | Recolhimento estornado reabre apenas a parcela cabivel |
| C37 | Extra: composicao | Consultar retido, recolhido, estornado e a recolher | Total global igual a soma das obrigacoes e seus movimentos |
| C38 | Extra: restos a pagar | Inscrever, consultar, liquidar/pagar/cancelar conforme situacao e vinculo original | Nao criar novo empenho para quitar a obrigacao antiga |
| C39 | POC p.5 | Gerar SAGRES Diario e Mensal por periodo e unidade selecionados | Arquivos nascem dos fatos; estrutura e relacoes validadas |
| C40 | Implantacao/suporte | Instalar/atualizar, importar legado, conciliar, recuperar e demonstrar suporte | Artefato identificavel, procedimentos executaveis e limites explicitos |

Os quatro blocos do texto sao integrados por C01-C09. Nao concluir "modulo contabil completo" apenas
com C17-C26 prontos.

## 5. Contratos de engenharia que evitam uma demonstracao enganosa

### 5.1 Orcamento, autorizacao, programacao e caixa

Sao controles diferentes: dotacao autoriza despesa; limite legal governa certos atos; programacao
financeira/CMD governa a execucao conforme configuracao aplicavel; disponibilidade financeira/fonte
sustenta pagamento. Nao mostrar um "saldo" unico como se atendesse aos quatro.

PPA/LDO/LOA precisam de estados coerentes com o fluxo existente: elaboracao, revisao,
aprovacao/publicacao quando aplicavel, alteracao e historico. Identificar ato, vigencia e versao.
Congelar os dados usados nos anexos emitidos. Relatorio de posicao atual nao substitui anexo
historico.

CMD e MBA devem poder ser cadastrados, alterados mediante regra/ato pertinente e comparados ao
realizado. Mostrar meses/bimestres sem movimento como ausencia/zero conforme a natureza da
informacao, nunca inventar metas distribuindo total por conveniencia. A regra de consumo do CMD deve
especificar em qual fase atua, com quais dimensoes e como corrige/reprograma.

O texto pede exclusao de remanejamento/transposicao/transferencia do controle do limite de creditos
adicionais. Representar a natureza do ato e confrontar o enquadramento com a autorizacao aplicavel;
nao tornar essa exclusao um botao para contornar limite de suplementacao.

### 5.2 Roteiros e dimensoes

O mesmo fato deve produzir efeitos coerentes no orcamento, patrimonio e controles pertinentes. Usar
os roteiros oficiais e configuracao ja construida, com versao/ato e contas analiticas elegiveis.
Proibir fallback silencioso para conta sintetica ou outra modalidade.

Conferir as lacunas relatadas: natureza da fonte na DDR; abertura/reabertura; suplementacao vinculada
ao credito reaberto; entidade nas operacoes necessarias a apuracao. A terceira analitica nao se
resolve acrescentando enum sem modelar o fato que seleciona o roteiro.

A disponibilidade/superavit por entidade so pode ser exibida como apurada quando todas as origens
necessarias estiverem representadas. O carimbo da arrecadacao sozinho nao prova o recorte completo.
Nao preencher o restante por rateio de orgaos, titular atual da conta ou diferenca residual.

### 5.3 Despesa, retencoes e documentos

Em cada parcela, registrar empenhado, liquidado, pago bruto, retencoes por natureza, liquido
entregue ao credor e obrigacoes retidas pendentes. O recolhimento posterior de retencao nao
constitui uma segunda despesa orcamentaria da mesma origem.

Natureza orcamentaria/extraorcamentaria nao deve ser inferida de um nome livre. Aplicar regra
vigente e fundamento. Nenhuma aliquota neste documento e regra tributaria: testes usam valores
declaradamente sinteticos.

Comprovante de retencao deve identificar origem, favorecido pertinente, base, valor, data e regra;
documento recebido, guia emitida e pagamento registrado sao estados distintos. Selecionar um
pagamento nao deve permitir recolher retencao de outra obrigacao por coincidencia de valor.

Liquidacao deve comportar os campos minimos de NF exigidos e documentos apropriados ao objeto. Nao
obrigar nota fiscal ficticia para uma natureza de despesa que possui outro documento habil.

### 5.4 Receita e distribuicao por fonte

Uma distribuicao definida na LOA deve ser recuperada como configuracao vigente para o ato. A
operacao guarda as parcelas efetivas e sua origem. Quando o usuario puder redistribuir, revalidar
fontes, contexto, total e autorizacao, com motivo quando pertinente. Nao permitir a mudanca de fonte
contrariar uma vinculacao legal apenas porque o texto permite redistribuicao operacional.

Precisao e residuo de arredondamento precisam de regra deterministica. Repetir comando nao
redistribui novamente. Estornar usa as parcelas originais, nao a configuracao atual. Alteracao de
titularidade de conta nao reatribui fatos antigos.

Receita intraorcamentaria, transferencia financeira e operacao intragovernamental nao sao
intercambiaveis. O primeiro termo nao significa automaticamente um movimento entre contas bancarias;
o ultimo exige informacao suficiente para o tratamento consolidado.

### 5.5 Extraorcamentario e passagem de exercicio

Cada obrigacao retida conserva origem, exercicio, natureza, beneficiario, valor inicial, movimentos
e saldo. Recolhimento pode compor varias origens compativeis, mas precisa alocar quanto baixa de
cada uma. Trava concorrente impede exceder a mesma obrigacao.

Virada transporta ou expoe saldo conforme arquitetura atual sem recriar a retencao originaria.
Separar exercicio da origem e do ato de recolhimento. O estorno do recolhimento no novo exercicio
deve reabrir o saldo da obrigacao correta, sem alterar retroativamente um demonstrativo fechado por
atualizacao silenciosa.

Restos a pagar precisam de situacao propria: processado/nao processado, inscricao, liquidacao quando
cabivel, pagamento, cancelamento e estornos. Conferir classificacao e roteiro aplicaveis nas fontes;
nao modelar todo resto como deposito extraorcamentario generico.

### 5.6 Custos e consolidacao

Cadastro de centro de custo em pessoal nao comprova acumulacao contabil por centro. O fato ou
apropriacao rastreavel deve alcancar os relatorios. Criterio de distribuicao tem versao, base e
tratamento do residuo; custo nao e necessariamente o mesmo instante do desembolso.

A consolidacao conserva registros individuais e aplica eliminacoes rastreaveis para o universo
pertinente. Nao eliminar lancamentos so porque tem igual valor ou mesma descricao. Identificar
contraparte e classificacao; apontar diferencas nao conciliadas. Consolidacao contabil, apuracao de
limites e exportacao da MSC possuem regras distintas de agregacao: nao reutilizar uma unica projecao
com eliminacoes para todas as saidas.

### 5.7 Demonstracoes e arquivos

Inventariar nominalmente as saidas aplicaveis: Diario, Razao, Balancete; balancos Orcamentario,
Financeiro e Patrimonial; Demonstracao das Variacoes Patrimoniais, fluxos de caixa e demais
demonstracoes/anexos conforme aplicabilidade; RREO/RGF e anexos de metas/riscos; dados federais e
SAGRES.

Essa lista e desdobramento a conferir com os manuais, nao uma lista literal adicional do edital.
Para cada saida: fundamento/versao, exercicio/periodo, universo, contas/atributos, exclusoes,
memoria, comparativos e situacao provisoria/encerrada. Nao mostrar demonstrativo sem mapeamento como
zero. Nao emitir PDF vazio com titulo correto como prova de atendimento.

MSC/dados federais devem preservar informacoes complementares exigidas. Nao assumir que a projecao
consolidada do portal e a base correta do arquivo. Exportacao generica CSV nao satisfaz leiaute
oficial especifico.

## 6. SAGRES: construir sem confundir fonte publica e acesso autenticado

A pagina oficial do TCE-PB oferece secao 2026 e o leiaute de contabilidade "2026 - Versao 1.1",
datado de 12/12/2025. Esse conteudo foi aberto publicamente nesta analise. A documentacao distingue o
acesso por API com chave, voltado as empresas e unidades contratadas, da estrutura publica dos
arquivos.

Logo, reavaliar o bloqueio anterior "rol/token ASTEC": identificar exatamente quais
tabelas/codigos/documentos faltam e quais ja sao publicos. Nao afirmar que toda a exportacao depende
do token, nem que a consulta publica remove qualquer necessidade de credencial. Nao transmitir em
nome do municipio nesta ordem.

Construcao requerida:

1. Selecao de unidade e periodicidade, dia ou mes, a partir das tabelas pertinentes ao leiaute.
2. Snapshot consistente dos fatos e cadastro usados; corrigir origem em vez de remendar texto
   exportado.
3. Mapeamento campo -> origem -> regra -> versao; enumeracoes oficiais confirmadas.
4. Gerador conforme codificacao, posicoes, tamanhos, casas, datas, chaves e nomenclatura oficiais.
5. Consistencia estrutural, referencias entre arquivos e conciliacao com a origem.
6. Pendencias por registro/campo, com destino de correcao na operacao.
7. Historico da geracao, arquivos, hash, periodo e versao. Gerado/validado localmente nao significa
   recebido/aceito pelo TCE.
8. Gerar dois periodos distintos e regenerar apos correcao legitima dos dados. Tratar periodo sem
   movimento segundo o contrato oficial, sem inventar uma linha para "ficar bonito".

Nao presumir as periodicidades antigas: o documento 2026 informa mudancas para tabelas antes
mensais. O executor deve ler a definicao de cada tabela consumida e suas regras completas. Este
documento nao substitui o leiaute nem afirma que todas as tabelas/tabelas auxiliares foram
auditadas.

## 7. Fontes atuais e aplicacao por exercicio

Consultadas em 26/09/2026:

- MCASP — pagina oficial: https://www.gov.br/tesouronacional/pt-br/contabilidade-e-custos/manuais/manual-de-contabilidade-aplicada-ao-setor-publico-mcasp-1 — indica 11a edicao como vigente.
- MDF — pagina oficial: https://www.gov.br/tesouronacional/pt-br/contabilidade-e-custos/manuais/manual-de-demonstrativos-fiscais-mdf — indica 15a edicao e versao atualizada em 23/09/2026. Conferir quais alteracoes atingem exercicio e saidas do candidato.
- PCASP — pagina oficial: https://www.gov.br/tesouronacional/pt-br/contabilidade-e-custos/federacao/plano-de-contas-aplicado-ao-setor-publico-pcasp-1 — contem 2026 e 2027. Publicacao do plano seguinte nao autoriza substituir automaticamente o plano do exercicio atual.
- NBC — CFC: https://cfc.org.br/tecnica/normas-brasileiras-de-contabilidade/ — localizar as NBC TSP e suas vigencias especificas. A relacao de normas nao comprova sua implementacao no produto.
- Decreto 10.540 consolidado: https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/decreto/d10540.htm — referencia de registros, preservacao e requisitos do SIAFIC.
- MSC 2026 — regras gerais oficiais: https://siconfi.tesouro.gov.br/siconfi/pages/public/arquivo/conteudo/2026_Anexo_I_Portaria_STN_642_Regras_Gerais_MSC.pdf — selecionar tambem os anexos/leiautes e mapeamentos necessarios; conferida a distincao entre informacoes agregadas e consolidadas e o uso de informacoes complementares.
- SAGRES — indice oficial: https://tce.pb.gov.br/layout-sagres-2/ e contabilidade 2026, versao 1.1: https://docs.tcepb.tc.br/books/dados-da-contabilidade/page/versao-11-12122025

Regra de execucao: selecionar a norma por exercicio, fato e vigencia; guardar fonte e versao dos
mapeamentos relevantes. Nao trocar todo o catalogo contabil por existir publicacao mais recente.
Consultar a regra exata antes de criar conta, limite, hipotese de dispensa ou classificacao. Nao
tratar texto de edital como fonte unica de legalidade de todos os lancamentos.

## 8. O que a base relatada permite reaproveitar

| Familia | Evidencia historica relatada | Verificacao local necessaria agora |
|---|---|---|
| Ledger/roteiros | Razao imutavel, Decimal, roteiros M01 e correcoes de dimensao | Confirmar que todas as portas usadas na apresentacao consomem esses contratos |
| Planejamento | PPA/LDO e anexos; abertura/creditos com avancos | Confirmar LOA inicial, CMD/MBA e anexos exigidos, nao apenas consultas |
| Credito e superavit | Abertura/reabertura, eixo de dotacao, amarracao de disponibilidade | Resolver os fatos faltantes no recorte necessario, sem transformar declarado em apurado |
| Despesa/contrato | Empenho/liquidacao/pagamento, glosa e estorno com percursos | Exercitar origem, retencoes, fontes e documentos do cenario contabil |
| Receita | Titularidade versionada, identificacao historica, distribuicao/DDR a conferir | Fechar a cadeia de arrecadacao/estorno; conferir J9 restante e projecoes |
| Patrimonio | Eventos patrimoniais e documentos relatados | Ligar prova de variacao patrimonial e identificacao ao razao/demonstracoes |
| Retencoes/extra | Parte existente em folha, consignacoes e M05 | Confirmar recolhimento parcial, composicao, transicao de exercicio e restos |
| Consultas/documentos | Diario/RREO com Decimal e correcoes, M22 comum | Inventariar saidas nominais e reconciliar os numeros, inclusive consolidados |
| SAGRES | POC e resolucao de contas oficiais relatadas | Confirmar geracao geral por periodo e contrato 2026; POC nao equivale a cobertura total |
| Ambiente | Uma arvore, saturacao relatada, bancos preservados | Fazer preflight curto; preparar candidato e runtime sem afetar outros projetos |

Ausencia de evidencia nesta tabela nao significa ausencia de codigo. Os primeiros exames sao
seletivos por cadeia, limitados ao que decide a implementacao. Nao gastar o primeiro dia recontando
arquivos e testes.

## 9. Interface: somente linguagem da operacao

Determinacao do usuario: nenhum identificador de TR, justificativa de engenharia, instrucao ao
desenvolvedor ou enum cru no frontend, PDFs operacionais, notificacoes ou exportacoes de negocio.
Rastreabilidade de clausulas permanece em comentarios de codigo destinados a equipe e registros
internos ja existentes, sem ser serializada ao navegador.

Nomes de navegacao sugeridos, reaproveitando o shell: Planejamento; Orcamento; Receitas; Despesas;
Tesouraria; Retencoes e depositos; Patrimonio; Custos; Demonstrativos; Prestacao de contas. Nao
fazer redesign geral ou trocar toda a navegacao para cumprir essa lista.

Uma listagem precisa de filtros uteis, totais globais, estado e acao pertinente. Um detalhe precisa
mostrar origem, valores, documentos, historico e relacoes. A acao deve estar autorizada no servidor
e oferecer confirmacao somente quando pertinente; recusa deve preservar formulario e orientar a
correcao.

| Evitar | Apresentar quando necessario |
|---|---|
| "TR 5.x / C31 / V11 / proxima fatia" | Nome da operacao, periodo e situacao |
| "Fail-closed por falta de roteiro" | "Configure a contabilizacao desta operacao antes de confirmar." |
| "Esse modulo nao finge que houve pagamento" | "Pagamento ainda nao registrado." |
| "Nao rateamos o apurado porque faltam quatro pernas" | "Apuracao por entidade indisponivel", com pendencia acessivel ao responsavel |
| "Nenhum dado. O sistema so sabe o que foi lancado" | "Nenhum lancamento no periodo." |
| Codigo de campo ou enum em uma mensagem | Nome do campo e acao necessaria |

Nao substituir vazamento por paragrafos explicando o sistema. Manter ajuda operacional curta onde
for necessaria. Preservar nomes legitimos como PPA, RREO, PCASP, SAGRES, numero de empenho e
fundamento legal do ato. O usuario nao pediu para esconder evidencia juridica pertinente.

Revisar dinheiro, percentuais, datas e nomes de entidades em todas as telas alteradas e nas jornadas
apresentadas. Formatar na borda; preservar Decimal no dominio. Erro ou dado ausente nao vira 0,00
para evitar uma tela vazia. Limitacao verdadeira pode aparecer como status objetivo; a demo nao deve
esconder falha com texto promocional.

## 10. Cenarios integrados de apresentacao

Todos os valores abaixo sao sinteticos, para testar invariantes. Nao sao aliquotas, limites legais,
contas contabeis ou parametros de Esperanca. Usar configuracoes permitidas e fundamentadas para os
fatos aplicaveis. Dados sinteticos devem estar identificados no ambiente, nao misturados a dados
reais.

### A. Planejamento, abertura e alteracao

Programa com acoes A=60.000,00 e B=40.000,00, orcamento total 100.000,00. Gerar
instrumentos/anexos pertinentes e abrir dotacao regularmente. Solicitar credito de 10.000,00 em A
por anulacao de B: apos autorizacao, A=70.000,00, B=30.000,00, total=100.000,00. Repetir nao
duplica. Solicitacao sem aprovacao nao muda saldo. A versao anterior permanece consultavel.

Acrescentar demonstracao de especial/extraordinario e remanejamento/transposicao/transferencia
conforme suporte e ato configurados; nao chamar o cenario suplementar de prova de todas as
modalidades. Mostrar CMD/MBA, comparacao com realizado e uma recusa causada pela programacao ativa.

### B. Reserva, empenho, liquidacao e pagamento

Na dotacao A, reservar 20.000,00 e converter integralmente a reserva em empenho de 20.000,00.
Disponibilidade orcamentaria remanescente=50.000,00, sem outro movimento. Liquidar 15.000,00 com
documento. Pagar bruto 10.000,00: liquidado a pagar=5.000,00; empenhado ainda nao liquidado=5.000,00.
A conversao da reserva nao consome mais 20.000,00.

Aplicar duas retencoes sinteticas explicitamente configuradas: 300,00 de natureza orcamentaria e
700,00 extraorcamentaria. Liquido ao credor=9.000,00. Mostrar a receita vinculada de 300,00 e a
obrigacao de 700,00 com seus roteiros, sem duplicar entrada bancaria. Recusar conta/fonte
incompativel e repeticao do pagamento.

### C. Recolhimento e exercicio seguinte

Da obrigacao extra de 700,00, recolher 400,00; saldo=300,00. Demonstrar a posicao no exercicio
seguinte e recolher 100,00; saldo=200,00. Estornar somente este recolhimento de 100,00; saldo volta
a 300,00. Origem continua sendo a retencao inicial. Cenario isolado e periodos configurados
apropriadamente; nao alterar relogio global nem banco produtivo.

A passagem de exercicio deve conservar saldos e vinculos, alem de executar o procedimento contabil
correspondente. Consulta de saldo em janeiro, sozinha, nao prova encerramento/abertura.

### D. Receita e distribuicao

Arrecadar 10.000,01, distribuindo em fixture 60% e 40%: parcelas 6.000,01 e 4.000,00 conforme regra
de arredondamento previamente fixada. Em outra operacao permitida, demonstrar redistribuicao
explicita e autorizada que conserva o total. Mudar a regra futura nao muda a anterior. Estorno
integral da primeira reverte suas parcelas exatas.

Demonstrar separadamente receita redutora e intraorcamentaria; nao trata-las como simples valor
negativo na arrecadacao comum. Conferir fonte, titularidade historica e consulta por entidade no
alcance disponivel.

### E. Restos a pagar

Em cenario separado, empenho de 5.000,00, liquidado em 3.000,00, pago em 1.000,00: valores
candidatos a inscricao de 2.000,00 processados e 2.000,00 nao processados, sujeitos as condicoes
aplicaveis. Inscrever conforme procedimento e executar parcela no exercicio seguinte sem novo
empenho. Evidenciar pagamento, saldo e cancelamento/reversao cabiveis.

### F. Patrimonio, custos e consolidacao

Selecionar um evento patrimonial ja suportado, registrar seu objeto e mostrar a variacao no razao e
demonstrativo pertinente. Apropriar um custo elegivel de 1.000,00 a dois centros, 600,00 e 400,00:
composicao deve retornar ao fato, sem nova despesa.

Criar operacao reciproca sintetica de 3.000,00 entre entidades efetivamente modeladas, com a
classificacao correta. Mostrar as posicoes individuais e o tratamento de eliminacao na visao
consolidada cabivel. Nao eliminar novamente do arquivo que exige agregacao diferente.

### G. Livros, demonstracoes e SAGRES

Usar os fatos anteriores: Diario -> lancamento -> documento -> Razao -> Balancete -> demonstrativo
aplicavel. Escolher outro periodo e repetir. Totais, saldos e filtros conciliam entre tela e PDF.

Gerar SAGRES diario e mensal para dois recortes diferentes, incluindo um com correcao. Conferir os
registros realmente incluidos e as relacoes. Mostrar consulta de pendencias e correcao na origem.
Nao simular recibo de envio/aceitacao.

Esses cenarios exercitam contratos compartilhados, mas nao dispensam uma operacao minima de cada
capacidade exigida ainda fora deles. O catalogo precisa mostrar quais requisitos cada evidencia
cobre e quais permanecem sem prova.

## 11. Plano de execucao de dois dias

O prazo e priorizacao intensiva, nao duas noites de processos concorrentes em maquina saturada. A
estimativa deve ser corrigida conforme os primeiros achados. Nao aumentar escopo de infraestrutura
paga automaticamente.

### Dia 1 — construir as ligacoes criticas

**Primeiro bloco, alvo de ate 90 minutos de inventario util:** gerente identifica HEAD, estado e
condicao real da maquina; auxiliar le codigo e requisitos C01-C40 por cadeias. Confirmar
telas/servicos existentes, listar lacunas com paths e dependencias, abrir a primeira alteracao sem
esperar um dossie completo. Verificar SAGRES e seus insumos neste bloco, nao na vespera da
apresentacao.

**Bloco seguinte:** fechar arrecadacao/DDR e distribuicao de fontes; completar retencoes e
recolhimento com composicao. Auxiliar revisa planejamento/LOA/CMD/MBA e prepara contratos das
ausencias. Gerente e unico escritor de todos os arquivos e commits.

**Segundo periodo:** completar os pontos de planejamento/alteracao que impedem a cadeia; ligar
despesa/documentos aos contratos corrigidos; avancar SAGRES com o leiaute publico e fontes locais
validas. Colocar telas e documentos junto do motor, sem acumular classes sem operacao.

**Fechamento do dia:** uma cadeia integrada ja operavel e verificada; estado real de SAGRES; lista
curta das capacidades ainda sem execucao. Nao anunciar "resta so polimento" se extraorcamentario ou
demonstrativos continuam ausentes.

### Dia 2 — fechar saidas e demonstrar

**Primeiro periodo:** completar virada/retencoes/restos, centros de custo, consolidacao e relatorios
efetivamente faltantes, reaproveitando o nucleo. Executar testes dirigidos conforme cada mudanca. Se
houver motor ausente grande, comunicar o risco ao prazo antes do ultimo bloco; continuar construcao
sem fabricar atendimento.

**Segundo periodo:** identificar candidato, servir com papel runtime, executar cenarios pela
interface e corrigir defeitos. Gerar demonstrativos e SAGRES dos proprios fatos. Revisar a
apresentacao de todas as telas/documentos percorridos. Reservar tempo real para repetir apenas os
trechos corrigidos.

**Fechamento:** entregar o mesmo candidato identificado, caminhos de acesso, capacidades
demonstradas, saidas, versoes e lacunas exatas. Nao reempacotar silenciosamente outro codigo apos a
prova. Nao publicar externamente sem autorizacao pertinente ao ambiente e candidato.

Prioridade nao significa exclusao: C39/SAGRES e a cadeia financeira sao criticas a demonstracao, mas
o edital nao autoriza omitir PPA/LDO/LOA, extraorcamentario ou demonstracoes. Ausencia de uma
capacidade necessaria continua ausencia, mesmo com todos os testes do restante verdes.

## 12. Comando unico para o executor

Execute esta ordem como prioridade temporaria do gestao-publica. O usuario quer a contabilidade
deste edital operavel para apresentacao em dois dias. Continue do HEAD efetivo na arvore unica; nao
recrie o produto nem retome a ENT12 como baseline.

Voce e o gerente full stack e unico escritor: codigo, schema, migrations, documentacao, staging e
commits. Use no maximo um auxiliar, exclusivamente em leitura e revisao. O auxiliar deve antecipar a
proxima tarefa, localizar exigencias e revisar seu diff, sem escrever arquivos ou iniciar testes
concorrentes. Se faltar memoria, trabalhe sozinho. Nao criar worktrees novas.

Comece pelo preflight curto de recursos e inventario seletivo C01-C40. Nao pare no diagnostico:
implemente a primeira lacuna e continue pela fila. Priorize as operacoes financeiras e SAGRES,
mantendo planejamento, extraorcamentario e documentos como parte obrigatoria do alcance.

Use primeiro os motores existentes. Preserve Pessoa, ledger, autorizacao, comandos, M22, Decimal,
versoes de dependencias e isolamento do contexto. Coordene cada alteracao de dimensao com seus
consumidores. Nao use `as` para afirmar formato de memoria sem validar a origem. Nao substituir dado
ausente por zero nem preencher conta sintetica para destravar seed.

Leia o leiaute SAGRES publico disponivel; se algo exigir token, nomeie a dependencia exata e
prossiga com o trecho publico. Nao alegue envio ou aceitacao. Para MCASP/MDF/PCASP/NBC, selecione
versao e vigencia aplicaveis ao exercicio. Nenhum parametro financeiro/legal nasce com valor
arbitrario.

Entregue operacao completa por incremento, com interface, documento e efeito. Nao interrompa a
construcao para criar guards genericos ou grandes relatorios. Corrija o instrumento somente quando
necessario para confiar no resultado daquele incremento.

Frontend e documentos de operacao nao exibem TR, lote, gate, enum cru, instrucao ao programador ou
justificativa da implementacao. Use nomes do negocio, valores em pt-BR, situacao verdadeira e
orientacao curta quando houver erro. A rastreabilidade do edital fica nos comentarios internos do
codigo e no catalogo tecnico existente.

Verifique alteracoes e consumidores diretamente afetados. Para dinheiro: resultado independente;
para saldo: concorrencia e repeticao quando alteradas; para acesso: recusa no servidor; para
documento: conteudo e total; para importacao/exportacao: estrutura, relacao e origem. Sem suites
completas, fuso completo, portao ou campanha geral de mutacoes. Build do candidato e percursos
destas cadeias sao verificacoes do alcance alterado, nao autorizacao para rodar tudo.

Preserve stash, scripts do operador, bancos e processos de outros projetos. Nao apagar bancos para
tentar liberar RAM. Nao fazer push, envio oficial, pagamento externo, publicacao ou contratacao de
infraestrutura nesta ordem.

Ao terminar cada bloco, mantenha apenas checkpoint curto: capacidade, commit, evidencia, limitacao e
proxima acao. No fechamento, comecar pelo que o operador consegue abrir e fazer. Distinguir
implementado, verificado em banco, percorrido, arquivo gerado/validado, aceito externamente e
publicado. Nao promover catalogo por contagem de testes ou menus.

## 13. Criterio de apresentacao e de completude

Pronto para uma apresentacao funcional significa ambiente acessivel, candidato identificado,
usuario/papeis apropriados, configuracao valida, dados sinteticos coerentes, operacoes pela tela,
persistencia, documentos e saldos conciliados. Nao pode depender de edicao manual de banco entre
telas ou de arquivos pre-fabricados para o unico periodo ensaiado.

Pronto para afirmar atendimento integral significa, adicionalmente, todas as exigencias aplicaveis
demonstradas, referencias normativas adequadas, formatos exigidos disponiveis e nenhuma lacuna
material escondida. Nem este documento nem os relatos anteriores comprovam isso.

Falha no certificado, token ou nuvem precisa ser distinguida de codigo nao construido. Defeito
funcional nao vira bloqueio de terceiro. A apresentacao nao autoriza usar dados municipais reais nem
transmitir obrigacoes.

A decisao ao final dos dois dias deve dizer exatamente o que funciona e o que falta, sem inventar
percentual de produto completo. A intensidade de construcao aumenta; as garantias e a linguagem
verdadeira permanecem.

Fonte local: EDITAL E ANEXOS 00040.2026 (1).pdf. SHA-256:
`0f78a4752759f44015106f56da5b959476c6d1fc449342540c3cbc6815270244`.
