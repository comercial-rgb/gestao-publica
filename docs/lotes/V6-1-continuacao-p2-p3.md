# V6.1 - Continuacao de P2 e P3: folha, acessos e servicos integrados

> Recebido em 2026-09-13, sobre o HEAD 3ce5e7b. Guardado como veio, sem edicao.
> Acompanha `V6-1-especificacao-acesso-dados-e-telas.md`.

## 0. Mandato e precedencia

Este e um ADENDO EXECUTAVEL ao PROMPT-V6-PRODUTO-INTEGRADO.md. Nao substitui sua fila, sua arquitetura ou o catalogo do TR. As observacoes recentes do proprietario detalham acessos, integracao e experiencia de uso; nao mandam abandonar P2/P3 para construir outro produto.

Continue em gestao-publica. Preserve M32-pessoal, M33-folha, portal do servidor, apropriacao por M05 e as correcoes anteriores. Nao reimplemente o que os testes e o codigo local ja comprovarem.

Ordem desta continuacao:
1. concluir a ponte financeira de P2: responsabilidade/atesto -> liquidacao da folha -> encargos patronais e respectivos reflexos;
2. executar P3: mesa de trabalho -> fluxos -> carta de servicos -> requerimento e acompanhamento;
3. aplicar a especificacao de acessos e componentes de preenchimento durante esses incrementos, com P4 transversal;
4. prosseguir nas frentes de contratos/obras, receitas/tributario e NFS-e no P5, segundo suas dependencias. Definir seus contratos agora nao e uma ordem para interromper P2/P3.

Nao volte a priorizar hospedagem. Nao publique, faca push, envie mensagens reais, remessas fiscais ou pagamentos. Nao leia areas privadas de concorrentes. Dados sinteticos, desenvolvimento, testes isolados, leitura/fetch das origens conhecidas e fontes tecnicas oficiais permanecem autorizados.

Implemente durante a sessao disponivel, sem pedir confirmacao por arquivo ou commit. Nao encerre apenas com especificacoes. Decisoes tecnicas locais reversiveis sao suas; nomeacao de agente publico e parametro legal real exigem fonte/ato do ente e nao podem ser inventados.

## 1. Baseline, evidencias e preservacao

Estado informado, a confirmar localmente:
- HEAD 3ce5e7b; servidor de percursos na porta 3010;
- calculo/fechamento, acesso do titular e apropriacao orcamentaria implementados;
- rapida 852/852; modulos/percurso dirigidos aprovados conforme relatorio;
- test:tudo, test:fuso e portao integral nao executados nesta entrega;
- tres scripts de terceiros fora dos commits;
- stash 11b7892e7800281f3ef915ee571a967b9383401b ja incorporado em 63a3040, preservado;
- candidatos cc4a0a2 e 2e0817b continuam no historico.

A orquestracao consultou o GitHub: a referencia acessivel continua dc7032a, e 3ce5e7b nao foi encontrado. Logo, esta continuacao usa o relatorio local como ponto de partida, nao como auditoria externa concluida dos novos modulos. Confirme HEAD, ancestralidade, arquivos alterados e a identidade do binario servido. Nao de reset para qualquer SHA citado.

O monitor antigo de 5c4fad4 foi substituido segundo o relatorio. Nao o reative para resolver uma pendencia que ja nao existe. Nao use HTTP 200 em /login como prova de RH, autorizacao ou processamento financeiro.

Nao reaplique ou apague o stash. Nao execute fix-*.sh/manter-claude-cursor.sh. Preserve arquivos de terceiros. Nao use git add -A indiscriminadamente.

Registre app_sha, runner_sha, versao de schema/migrations e configuracao sintetica para cada aceite. Nao atribua teste de um binario ao HEAD que so mudou o script. Nao sobrescreva .next de um servidor em uso: encerre somente o processo identificado deste projeto ou use worktree/artefato separados.

P2 fechado como incremento nao equivale a todos os requisitos de folha entregues. Calcular, fechar, empenhar, liquidar, ordenar pagamento, pagar, recolher encargos e obter aceite externo sao fatos distintos.

## 2. Contrato transversal de acesso e publicacao

Leia ESPECIFICACAO-ACESSO-DADOS-E-TELAS.md deste pacote. Implemente essa politica a partir do mecanismo de autorizacao existente, sem um segundo RBAC.

Identifique cada entrada real por rota/padrao, metodo ou Server Action, capacidade, origem dos dados, modalidade de acesso, escopo e campos permitidos. Inclua paginas, endpoints, exports, anexos, arquivos gerados e callbacks. Derive inventarios das fontes existentes; nao mantenha listas independentes contraditorias.

Categorias de acesso:
- publico anonimo: somente projecoes e documentos legalmente publicaveis;
- titular autenticado: os proprios registros e servicos;
- representante autenticado: entidade/pessoa representada por mandato explicito vigente;
- operador interno: acao + entidade/unidade/setor + registro + estado;
- tecnico: diagnostico sanitizado e configuracao autorizada, sem acesso de negocio implicito;
- integracao: principal tecnico e escopos proprios, nao um usuario humano com senha universal.

Um mesmo humano pode ser cidadao, servidor e operador. Isso nao une automaticamente seus poderes. Entrar no portal do servidor nao concede RH; cadastro publico nao concede perfil interno. Selecionar o canal e so navegacao, nao autorizacao.

CPF/CNPJ com digito valido nao comprova identidade. CNPJ identifica uma organizacao, nao autentica uma pessoa humana. Preserve vinculo de representacao, fundamento, periodo e revogacao. Nao associar por nome aproximado nem permitir assumir uma Pessoa so porque informou seu documento.

Nas portas pessoais, mantenha a derivacao a partir da identidade confiavel. Se um endpoint recebe um ID de folha/documento, valide o relacionamento com o titular, inclusive no download. Nao precisa proibir IDs na URL para obter isolamento: precisa autorizar o alvo. Resposta negativa nao deve revelar se o documento privado de terceiro existe.

### 2.1 Transparencia nao e administracao sem botoes

Nao entregue o serializer administrativo e esconda campos com CSS. Defina consultas/projecoes publicas com allowlist de campos, anexos publicaveis e identificadores publicos. A regra vale para HTML, JSON, RSC, PDFs, CSV, XLSX, buscas, sugestoes, cache e metadados.

Publique os dados obrigatorios a partir dos fatos autoritativos, sem redigitacao ou dependencia de uma aprovacao manual que possa atrasar indefinidamente a transparencia exigida. Separe politicas de publicacao de dados obrigatorios, revisao de conteudo institucional e tratamento de documentos com trechos protegidos.

Prefira projecao direta segura onde couber. Se usar processamento assincrono, use outbox, idempotencia, monitoramento da defasagem e data real do ultimo fato publicado. Nao anuncie tempo real se houver atraso nao medido. Nao use publicacao assincrona para adiar o registro contabil do fato.

Remuneracao nominal publicavel e contracheque pessoal completo NAO sao a mesma projecao. Nao publique por acidente conta bancaria, dependentes, consignacoes privadas, pensao alimenticia, dados medicos, documentos de identidade ou motivos sensiveis por reaproveitar o DTO de RH. Parametrize a projecao legalmente devida com rastreabilidade, sem proibir genericamente toda divulgacao nominal.

Receitas agregadas/execucao financeira publicavel e conta fiscal individual tambem sao coisas diferentes. Respeite sigilo fiscal e suas excecoes legais. Nao publique cadastro economico, todas as notas ou historico tributario individual como efeito automatico da criacao do portal.

Login nao deve ser imposto para leitura de informacao publica. Consulta por codigo verificador pode devolver extrato minimo quando previsto, com chave nao enumeravel, protecao contra abuso e sem abertura do dossie sigiloso. CPF isolado nao e segredo nem autorizacao.

Ouvidoria anonima prevista pelo TR tem fluxo proprio. Pedido de acesso a informacao possui identificacao nos termos aplicaveis, mas nao deve exigir justificativa do pedido nem cadastro burocratico desnecessario. Nao use a regra de login de um servico para bloquear todos os outros.

## 3. P2 - decisao que destrava o atesto e a liquidacao

### 3.1 Responsabilidade configurada, nao cargo inventado

Implemente a figura RESPONSAVEL PELA CERTIFICACAO/ATESTO DA FOLHA, vinculada a Pessoa e usuario ativo, com entidade/escopo, ato de designacao ou delegacao, inicio/fim, substituto quando houver e acoes explicitas.

Fluxo padrao de engenharia:
- RH prepara e confere dados/calculo;
- responsavel designado certifica a folha fechada;
- agente autorizado a liquidar verifica o suporte e realiza o ato pelo M05;
- autoridade competente ordena o pagamento;
- tesouraria executa e concilia.

Essa distribuicao e politica inicial do produto, nao afirmacao de que uma lei nacional nomeia obrigatoriamente o diretor de RH como atestador. O municipio devera configurar a atribuicao real com seu ato administrativo.

Nao autorize automaticamente o criador da folha, qualquer contador, o admin ou o desenvolvedor. Separe preparar, certificar, liquidar e pagar por padrao. Nao crie excecao de autoaprovacao silenciosa. Uma eventual concentracao autorizada de funcoes e decisao especifica, fundamentada e auditada, nao um atalho desta execucao.

Ausencia ou vencimento da designacao bloqueia somente o ato dependente, com orientacao ao administrador. Nao bloqueia consultas, calculo preliminar ou desenvolvimento independente. Esta autorizado criar designacoes FICTICIAS identificadas no banco isolado para testar todos os papeis.

### 3.2 Atesto como fato e documento

Atesto vincula exatamente entidade, competencia, tipo/versao da folha, conjunto de servidores/vinculos, calculo fechado, resumo bruto/liquido/descontos e alocacoes a conferir. Guarde manifesto/hash, versoes, autor, designacao usada, instante e evidencia. Se encargos forem certificados em etapa propria, registre explicitamente esse objeto separado.

Ofereca certificar, devolver para correcao com motivo e consultar evidencias. Calculo fechado nao e sobrescrito para satisfazer a devolucao: use retificacao/folha complementar ou nova versao pelo caso de uso correspondente, com vinculos e analise de efeitos posteriores.

Mudar alocacao, valor ou conjunto de pessoas invalida a aplicabilidade do atesto anterior para o novo objeto. Nao marque o atesto antigo como se tivesse certificado dados que ainda nao existiam. Revalide designacao, permissao e alvo dentro da transacao do comando.

### 3.3 Liquidacao pelo dominio existente

Reutilize M05, M07 e os mecanismos de comando/ledger/auditoria. Nao abra uma contabilidade paralela no M33.

A origem da liquidacao e a FOLHA FECHADA e seus documentos de suporte. Nao fabrique uma nota fiscal de fornecedor para passar no validador de liquidacao. Use discriminacao explicita de origem: folha, documento fiscal, outros casos realmente suportados. O gancho de estoque nao pode disparar em folha.

Antes do ato, conferir: versao certificada; data e competencia; saldo a liquidar; dotacao/fonte/entidade; origem de cada alocacao; parcela ja liquidada; beneficiarios e obrigacoes; restricoes do periodo; legitimidade de quem certifica e liquida.

A apropriacao por grupo de rubricas x ficha e conservada se estiver correta. Reconciliar gross/net/retencoes sem novo empenho das deducoes ja contidas no bruto. Nao atribua um credor ficticio que apague os beneficiarios reais: preserve subdetalhamento e relacao entre grupo contabil e pessoas/consignatarios.

Empenho, liquidacao, pagamento de liquido e recolhimento das obrigacoes precisam ser consultaveis nos dois sentidos. O direito ao contracheque fechado nao depende de simular que o dinheiro ja foi pago. Exiba competencia, liberacao do documento e situacao do pagamento como dimensoes separadas.

Retomada pode ser por grupo se o caso de uso assim definir, mas cada grupo e atomico e possui identidade estavel. Na execucao interrompida, nao declarar toda a folha liquidada. Numeracao deterministica nao substitui unique constraint, fingerprint imutavel e trava/reserva atomica.

### 3.4 Encargos patronais

Depois da ponte da liquidacao, acrescente os encargos do empregador no motor/memoria e no fluxo financeiro, sem subtrai-los do liquido do servidor.

Parametrize por entidade, regime, incidencia de rubrica, vigencia e fundamento. RGPS, RPPS, RAT/FAP, FGTS e outras parcelas so sao aplicadas quando pertinentes ao enquadramento comprovado. Nao usar uma aliquota fixa nacional para todos os municipios ou regimes.

Conserve as bases, percentuais, limites, arredondamentos, referencias e resultado por vinculo/grupo. Separe contribuicao do servidor, encargo do ente e recolhimento. O custo patronal nao vira deducao pessoal; deducao do empregado nao vira segunda despesa orcamentaria.

Nao mutar memoria de folha ja fechada ao acrescentar o recurso. Adote complemento versionado vinculado ou novo caso de retificacao, com comparativo e apropriacao somente do efeito devido. Nao reaproveitar indevidamente a chave de comando de outra versao.

Folha mensal geral exige controle dos lotes, entidades e servidores elegiveis. Uma folha fechada pode ser suplementar ou de um grupo: nao marcar o municipio inteiro como fechado se faltarem grupos/vinculos do universo esperado. Declarar omissoes e excecoes, nao inventar folha para vinculo inativo fora da competencia.

## 4. P3 - mesa de trabalho e servicos transacionais

P3 continua sendo a proxima frente funcional. Desenvolva-a apos a unidade coerente da ponte de P2. Trabalho em paralelo so com arquivos e ambientes independentes; nao rodar builds/testes pesados concorrentes na mesma maquina limitada.

Use M21, M22, M23, M24 e o mecanismo de tarefas/documentos disponivel. Nao crie outro cadastro de requerentes nem outro engine de processos sem necessidade medida.

Mesa de trabalho: tarefas do usuario/setor, responsavel, situacao, prazo, prioridade, entrada/recebimento, devolvidos, aguardando requerente, parecer, assinatura quando suportada, concluidos. Toda contagem vem de consulta autorizada; falta de resposta nao aparece como zero.

Dossie: resumo, requerimento, envolvidos, anexos/documentos, movimentacoes, prazos, decisoes, vinculacoes e trilha de acesso apropriada. Separar anotacao interna de mensagem ao requerente. Sigilo por processo/documento deve governar notificacoes, exports, pesquisas e previews.

Definicoes de fluxo e formulario sao versionadas. Instancia fica vinculada a sua versao. Editor visual nao e a execucao: teste destinos, tarefas, papeis, condicoes e efeitos. Nao usar eval/new Function nem URL arbitraria em tarefa automatizada. Nao declarar conformidade integral BPMN/CMMN/DMN porque existe um diagrama.

Carta de servicos publicada tem titulo, categoria, publico, requisitos, documentos, etapas, custos quando previstos, prazo/fundamento, unidade, canais, necessidade de autenticacao e fluxo. Descricao publica pode existir antes do login; abertura e acompanhamento seguem a politica do servico.

Prioridades ja definidas no V6, sem reiniciar a escolha:
1. atualizacao cadastral sujeita a analise, sem sobrescrever Pessoa automaticamente;
2. requerimento administrativo com anexo, encaminhamento, exigencia e resposta;
3. complemento de documentacao de fornecedor, com representacao vigente.

Percurso: consultar carta -> autenticar quando exigido -> formulario -> anexar -> revisar -> protocolar -> receber comprovante -> fila interna -> exigencia -> complemento -> decisao -> documento final -> acompanhamento/avaliacao.

Autocadastro de cidadao NAO o vincula por simples CPF a qualquer registro legado. Verificacao e eventual conciliacao de identidade precisam de fluxo confiavel. Nao disponibilizar e-mail/token de recuperacao em pagina publica. Transporte de teste fica isolado.

GET nao protocola, tramita, assina ou confirma ciencia juridica. Quando o registro de ciencia for necessario, use comando explicito apropriado e auditavel; nao produza efeito juridico com prefetch de navegador.

## 5. Dropdowns, pre-preenchimento e cadastros cruzados

Evolua um componente compartilhado de selecao referenciada, nao dezenas de buscas independentes. Listas pequenas podem usar select nativo; listas extensas usam combobox com pesquisa e paginacao no servidor, rotulo de campo e operacao por teclado.

Origem do seletor: endpoint/porta tipada com contexto autorizado. Mostrar codigo humano, nome, estado/vigencia e saldo quando relevante. Persistir ID canonico e versao exigida, nunca apenas texto descritivo. Nao pedir UUID ao operador.

Filtre por entidade, unidade, papel, acao, relacao e data pertinente. Cache inclui contexto/permissao e nao vaza entre usuarios. Ao trocar pai, invalide selecao filha, mas nao apague rascunho inteiro sem aviso. Cancele respostas atrasadas de buscas anteriores.

Exemplos para implementar nas respectivas frentes:
- contrato -> fornecedor, itens, vigencia, dotacoes e saldo;
- ordem -> solicitacoes, itens e parcelas disponiveis;
- documento conferido -> fornecedor/ordem/recebimentos e saldo elegivel para liquidacao;
- folha -> vinculos vigentes, regimes, rubricas, grupos, fichas/fontes e pendencias;
- obra -> contrato/licitacao, fiscais vigentes, etapas, medicoes e parcelas;
- servico -> assunto, unidade, formulario e fluxo publicado;
- emissor fiscal -> representacao do emissor, cadastro economico e tabelas vigentes.

Consulta de saldo orienta; a transacao de confirmacao revalida saldo, escopo, vigencia e concorrencia. Preencher automaticamente nao e autorizar nem executar. Conta bancaria, beneficiario e fonte nao sao escolhidos silenciosamente por serem a primeira opcao.

Ofereca 'Cadastrar' em contexto somente a quem tiver direito. Ao salvar o cadastro relacionado, devolva sua referencia ao formulario original e preserve os demais campos. Sem duplicacao por nome, CPF/CNPJ ou importacao sem conciliacao.

Dados derivados podem ser somente leitura; dados substituiveis exigem motivo e auditoria quando houver impacto. Documento emitido preserva seu snapshot, ainda que o cadastro atual mude.

## 6. Obras, contratos, receitas e emissor fiscal - contratos de continuidade

Nao proclame essas frentes completas por incluir uma pagina. Incorpore este desenho quando a fila entrar no dominio correspondente; nao furar P2/P3 por um novo menu.

### 6.1 Contratos e obras

Dossie interno do contrato: processo/ata, objeto, itens/quantidades/precos, fornecedor, vigencia, fiscais/gestores com ato e vigencia, dotacoes/fontes, garantias pertinentes, aditivos/reajustes/revisoes, ordens, medicoes, documentos fiscais, liquidacoes, pagamentos, ocorrencias e encerramento/rescisao. Preserve versoes e saldos por item.

Aditivo, reajuste, reequilibrio e rescisao nao sao apenas novo valor e status. Implementar documentos, efeitos e requisitos de cada caso antes de habilitar a acao.

Obra: identificacao, localizacao, responsaveis, contrato e fontes, cronograma fisico/financeiro, itens de planilha, etapas, medicoes, memoria, evidencias/fotos, ordens/paralisacoes/reinicio, licencas pertinentes e registros de fiscalizacao.

Progresso fisico nao e percentual pago. Cada indicador possui formula e fonte explicita. Medicao aprovada nao confirma pagamento. Cancelar/corrigir exige analisar efeitos posteriores.

Consulta publica de contrato/obra usa a projecao permitida, navega pelos relacionamentos publicos e nao reutiliza formulario editavel 'desabilitado'. Botao 'Visualizacao publica' na area interna mostra exatamente a projecao autorizada, nao um admin universal.

### 6.2 Receitas e despesas

Consulte fatos, saldos e relacionados por entidade/exercicio/fonte. Receitas reconhecidas, arrecadadas, deduzidas, transferidas e valores no banco permanecem separados. Relatorio nao pode resolver diferenca de conciliacao alterando saldo.

Mantenha P1 e seus invariantes. Nao reabrir um problema resolvido sem teste; verificar o estado atual de SOLICITACAO-SEM-VINCULO-COM-A-ORDEM e ARRECADACAO-SEM-CONTA-BANCARIA antes de nova alteracao.

### 6.3 NFS-e robusta, distinta da nota recebida

O emissor municipal e uma frente propria do P5, com contribuinte emissor, representante/contador autorizado e painel do fisco. Nao trocar o nome de /licitacoes/documentos-fiscais para dizer que entrega NFS-e.

Distinguir:
- documento fiscal RECEBIDO pelo municipio e seus efeitos na despesa;
- NFS-e de servicos emitida pelo contribuinte na plataforma e integrada ao ambiente competente;
- nota avulsa, quando prevista, com seus criterios de liberacao.

A prefeitura nao se torna automaticamente emitente de todas as notas no proprio CNPJ. Identidade do prestador e autoridade fiscal do municipio sao objetos distintos.

Contrato funcional: cadastro economico/inscricao, autorizacoes/representacoes, prestador/tomador/intermediario quando aplicavel, servico/local/data, regime, valores, deducoes/retencoes, regras vigentes, DPS/RPS conforme modelo, assinatura exigida, transmissao, retorno, XML/DANFSe, cancelamento/substituicao e historico.

Implemente primeiro a trilha de dados e contratos tecnicos com fonte, versao, ambiente e vigencia. Confirme o modelo de adesao do municipio: emissor nacional, emissor municipal com compartilhamento ou outro arranjo efetivamente permitido. Nao escolha pela aparencia do portal antigo.

IBS/CBS/NBS/correlacoes e CNPJ alfanumerico seguem artefatos oficiais aplicaveis. Publicacao de nota tecnica nao prova que entrou em vigor ou esta ativa em todos os ambientes. Nao importar regras ilustrativas de artigos ou fixtures antigas como norma.

Estados reais: rascunho/preparado/validado localmente, envio pendente, submetido, aceito/autorizado segundo o modelo, rejeitado, consulta pendente de reconciliacao e eventos. Timeout de envio nao vira rejeicao nem autorizacao: consultar/reconciliar antes de reenviar.

Sem credenciais, construa o que e testavel localmente e deixe a etapa externa como pendente. Simulador identificado testa o contrato, nao homologa a nota. XML ou PDF local nao pode portar protocolo oficial inventado.

Verificacao publica de autenticidade retorna somente os dados permitidos por aquele servico/chave. Nao criar busca aberta de todas as notas por CPF/CNPJ.

## 7. Interface e documentos durante toda a fila

Use as imagens concorrentes como referencia observada de organizacao, nao copia de codigo, marcas, dados ou prova de funcionamento interno.

Publico: busca util + categorias de servico/transparencia + descricao + 'Como solicitar' + necessidade de login. Reduza banner que empurra a tarefa para fora da primeira tela. Informacao pode ser consultada antes de autenticar; preserve a intencao quando o servico exige entrar.

Interno: Minha mesa com fila e proxima acao, filtros salvos dentro do escopo, contexto visivel, listas densas legiveis, detalhe com resumo e abas apropriadas. Nao abrir uma cadeia de modais aninhados para tarefa complexa. Breadcrumb e links retornam ao contexto anterior.

Servidor: visao dos proprios vinculos e competencias, contracheques liberados, pedidos e historico. Contribuinte/fornecedor: selecionar representacao autorizada e ver os proprios processos/fatos. Nenhum painel mostra indicadores artificiais.

Padronize resultado estruturado para compor mensagens: ato, referencia autorizada, efeito, quantidade/valor pertinente, pendencia, proximo passo e correlacao. Texto 'concluido' depende de persistencia comprovada. Campos errados recebem orientacao perto do controle; alertas persistentes nao somem em toast de dois segundos.

Reutilize relatarios/PDF/exports existentes. Garanta mesmos filtros/totais e autorizacoes. Relatorio publico nao inclui colunas secretas escondidas na tela. Padrao de PDF inclui entidade, contexto, identificadores, dados/itens, periodos, totais, versao/snapshot e paginas; nao carimbar assinatura digital quando so houver hash.

Sem referencias de TR/ENT/P2/P3 ou percentuais de cobertura em tela/documento operacional. Normas e numeros de documentos de negocio legitimos permanecem. Nao substituir SIAFIC nos nomes tecnicos/historicos para aparentar outra arquitetura.

## 8. Aceite, continuidade e proximo pacote

Testes minimos desta continuacao:
- dois preparadores/atestadores; designacao vencida; falta de permissao; negativa por motivo correto;
- duas folhas ou grupos, apropriacao/liquidacao parcial, interrupcao e retomada sem duplicar;
- bruto, liquido, deducoes e patronal conciliados por vinculo/grupo/entidade;
- carga de parametro futura nao altera folha passada; correcao preserva o fechamento anterior;
- conta de servidor A nao acessa folha/arquivo de B, inclusive por ID conhecido, URL ou cache;
- servidor desligado mantem ou perde acesso conforme politica explicita, nao por efeito acidental do cargo atual;
- publico consulta itens publicaveis sem sessao e sem dados privados na resposta bruta;
- documento com trecho privado produz copia publica correta sem tornar o original publico;
- usuario interno sem acao continua sem acao depois de usar o portal publico;
- representante revogado perde novas consultas/downloads na area privada;
- portal -> protocolo -> mesa -> exigencia -> complemento -> decisao -> resposta;
- campo cruzado com resultado atrasado, sem permissao, desativado e alterado entre leitura e escrita;
- publicacao nao exige redigitar registro; retracao/correcao permitida invalida caches pertinentes;
- formatos de exportacao/PDF realmente exercitados, multipagina e valores conferidos.

Nao executar full gate por alteracao de rotulo. Execute testes dirigidos por unidade e regressao dos consumidores em mudancas transversais. Na conclusao do marco integrado P2+P3, programe suite ampliada/build/percursos com fonte congelada. Antes de qualquer promocao a homologacao/producao, rodar o conjunto exigido, inclusive fuso, migracoes, permissoes e recuperacao aplicavel. Nao atribuir verde ao que nao executou.

Uma falha ambiental delimitada nao bloqueia trabalho independente; falha de integridade ou vazamento bloqueia os consumidores daquele caminho. Nao edite enquanto o teste usa a mesma arvore. Nao rode dois truncates simultaneos no banco compartilhado. Sem loops infinitos de monitoramento.

Atualize o catalogo unico por criterio real. Metricas: capazes de executar por papel; cadeias completas; campos/artefatos publicos verificados; clausulas integrais/parciais/externalizadas; nao total de arquivos ou acoes concedidas. Declarar completude so quando todas as partes do item forem provadas.

Entregue:
1. HEAD, commits, app_sha/runner_sha e estado dos tres arquivos de terceiros;
2. decisao implementada de atesto/liquidacao e evidencia por papel;
3. mapa derivado das telas publicas/privadas e do editor que as alimenta;
4. exemplos de preenchimento cruzado executados, nao apenas componente instalado;
5. fluxos reais de P3, capturas antes/depois e testes;
6. patronal e seus reflexos, ou pendencia precisa sem chamar todo RH incompleto;
7. catalogo e checkpoint curto, testes nao executados, dependencias externas;
8. pacote incremental sanitizado, hashes e logs relevantes, sem bancos/segredos e sem push.

COMECE pelo checkpoint atual e pela designacao/atesto e liquidacao da folha. Nao reinicie P0, nao procure hospedagem e nao substitua desenvolvimento por escrever todo o mapa do ERP. A especificacao transversal deve ser implementada nos proximos fluxos e expandida conforme a fila original.
