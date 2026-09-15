# V7 / M2.1 - Continuacao: ordem de servico, recebimentos e liquidacao

> Guardado como veio (PROMPT-V7-M2-EXECUCAO-CONTRATUAL.md), em 2026-09-15. Os criterios que o acompanham
> estao em `V7-M2-criterios-de-aceite.md`. A instrucao que acompanhou os dois esta no fim deste arquivo.

## 0. Mandato e resultado

Continue no repositorio gestao-publica. Este comando sucede o primeiro incremento de M2.1 do V7. Nao substitui o PLANO-MESTRE-ECOSSISTEMA.md, nao reinicia M1 e nao retoma apresentacao em 24 horas ou hospedagem.

Resultado central: o gestor autoriza uma parcela de execucao; o fiscal registra e confere sua realizacao; o responsavel competente recebe a parcela conforme o contrato; o agente financeiro liquida o que esta efetivamente comprovado. As consultas, documentos e saldos devem permitir seguir essas relacoes sem redigitar nem repetir o reconhecimento contabil.

Alvo de percurso, ajustado ao tipo contratual:
contrato e itens -> ordem de execucao -> execucao/medicao -> recebimento provisorio -> conferencia e recebimento definitivo da parcela quando exigido -> documento de cobranca conferido -> liquidacao M05 -> pagamento administrativo ja existente e consulta dos efeitos.

Essa representacao NAO obriga concluir toda a obra ou todo o contrato para liquidar cada parcela regular. Recebimento final do objeto, recebimento/atesto de parcela, medicao, documento fiscal e liquidacao sao fatos distintos. A sequencia exata tem fundamento, versao e ambito; nao transforme a ordem de um diagrama em lei universal.

Implemente continuamente durante a sessao, sem pedir autorizacao por cadastro, teste ou commit. Decisoes tecnicas reversiveis deste escopo estao autorizadas. Um bloqueio externo afeta somente sua dependencia. Falha de integridade, autorizacao ou consumo duplicado bloqueia a ampliacao do caminho afetado, nao exige reiniciar todo o produto.

Autorizado: codigo, commits locais por caminho, consultas de leitura a fontes oficiais e repos ja indicados, fixtures isoladas, migrations novas ensaiadas, testes e provisionamento local controlado das dependencias ja previstas.
Nao autorizado: push, deploy, tunnel, DNS/IAM, contratacao de recursos, mensagem real, pagamento real, transmissao fiscal, acesso privado a concorrentes ou mudanca em outros projetos da maquina.

## 1. Baseline curta: preservar o entregue

Estado RELATADO, a confirmar localmente:
- HEAD 3deaf37; candidato de telas 2d7a9cd.
- Suite completa e fuso 2731/2731 cada sobre app 5937f41, runner acbae82.
- Runtime 34/34 e deriva sem diferenca nessa referencia.
- Candidato 2d7a9cd: carta 84/0, identidade 46/0 e contrato 25/0; instalacao limpa com 156 migrations e 312 permissoes.
- Suite completa/fuso nao reexecutados em 2d7a9cd; apropriacao salarial nao percorrida nesta ultima rodada.
- M21 corrigido; dependentes encerrados com o papel runtime; reducao de encargos desfaz obrigacoes nao pagas; valores pagos ficam como restituicao a providenciar, sem ato de restituicao entregue.
- Ouvidoria sem conta, avaliacao e primeiro contrato acompanhado implementados.
- Catalogo: 379 clausulas classificadas de 2.037; isso nao e numero de clausulas integralmente atendidas.
- Stash 11b7892e7800281f3ef915ee571a967b9383401b ja incorporado, preservado.
- Tres scripts terceiros continuam fora dos commits e sem autorizacao de execucao.

O orquestrador recebeu o relato, nao os arquivos do HEAD novo. Nao apresente esta orientacao como auditoria independente de 3deaf37. Confirme hashes completos, ancestralidade e o diff efetivo desde o build. Nao faca reset, reaplique o stash ou apague objetos para coincidir com a referencia.

Leia somente o resumo corrente, ESTADO-EXECUCAO.md 61.6/61.8, os MODULO.md dos consumidores e o catalogo pertinente. Preserve a certificacao/folha, os comandos idempotentes, M05/M07/M11/M21/M22 e o helper unico de anexos. Nao recrie um modulo paralelo com outra fonte de saldo ou outros fiscais.

Nao sobrescreva .next de um next start em uso. Identifique os processos do proprio projeto e mantenha artefatos/bancos/anexos de validacao isolados. Registre app_sha, runner_sha, schema/grants/configuracao e versao de browser. Nao some aprovacao de varios builds como se fosse aceite de um unico artefato.

## 2. Fontes e limites: nao transformar o contrato deste software em regra universal

Fonte funcional: TR de Anita Garibaldi, texto integral e catalogo ja existente.
- 5.17.96-105: ordens, parcelas, empenhamento, reversoes e recebimentos.
- 5.17.75-85: contratos, alteracoes e designacoes.
- 5.21.1-29: fiscalizacao, acesso por designacao, administracao especifica, agenda, formularios, ocorrencias, planilhas e medicoes.
- 5.10.1: integracao entre contratacao e despesa, documentos, liquidacao e reversoes.
- 5.38: projecoes de transparencia.

Os itens 6 e 7 do TR tambem disciplinam como ESTA contratacao de software sera fiscalizada/recebida/paga. Nao copie seus 15 dias ou outros prazos como defaults universais para todas as obras, servicos e compras cadastrados no produto. Separe obrigacao do fornecedor deste software de funcionalidade requerida ao software.

Fontes normativas externas consultadas pela orquestracao em 15/09/2026:
- Lei 14.133, arts. 117, 140 e 143: https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm
- Lei 4.320, arts. 60-64: https://www.planalto.gov.br/ccivil_03/leis/l4320.htm

Revalidar o dispositivo pertinente antes de implementar uma regra juridica. Regulamento municipal, contrato, regime de execucao e designacao local nao foram fornecidos para todos os casos: modelar a configuracao com fonte, escopo e vigencia; fixtures ficticias identificadas podem exercitar os fluxos. Nao inventar prazo, aliquota, nomeacao, multa ou recepcao tacita.

As decisoes de arquitetura e cenarios deste comando sao propostas de engenharia. Nao sao transcricao literal de exigencias nem homologacao juridica/contabil.

## 3. U0 - Resolver duas dependencias no caminho, sem reabrir M1

### 3.1 Acesso especifico da fiscalizacao

O relato registra leitura de contrato ainda nao restrita aos designados. Corrija antes de aumentar a exposicao de ordens, medicoes, anexos e recebimentos.

No modulo de fiscalizacao:
- fiscal/gestor ve o contrato de sua designacao no periodo/escopo permitido;
- administrador DA FISCALIZACAO pode ter alcance ampliado explicitamente, como previsto no TR;
- poder global de outra area nao equivale a essa administracao;
- tarefa delegada ou comissao de recebimento requer designacao/poder proprio, nao acesso por conhecer o ID.

Nao prive contador/tesoureiro de dados que sua funcao precisa. Defina projecao financeira autorizada separada da visao de fiscalizacao, sem dar acesso a todas as ocorrencias/anexos privados. A consulta publica e uma terceira projecao; ela nao herda a regra que exige designacao para fiscalizar.

A regra vale para listas, detalhe, contagens, dropdowns, relacoes, PDFs, arquivos, exports e chamadas diretas. Permissao + entidade/unidade + designacao pertinente + estado e restricoes do registro, sempre revalidados no comando.

Conserve autor, designacao usada e data do ato. Revogacao bloqueia poderes atuais sem apagar o ato anterior. Nao confunda data da execucao com data de registro nem permita backdating para recuperar permissao revogada. Um sucessor autorizado pode tratar fatos anteriores dentro da atribuicao formal; nao exigir o mesmo individuo para sempre por falta de modelagem.

### 3.2 Unicidade e repeticao da medicao

O percurso passou a procurar um dia livre porque medir no mesmo dia foi recusado. Isso NAO prova que a regra de negocio esta correta.

Localize o indice e o predicado: o impedimento e repetir o comando, consumir a mesma parcela, ultrapassar saldo ou apenas coincidencia de data? Registre o fundamento que existir.

O TR pede periodo e quantidades por item, nao uma regra geral de uma medicao por contrato por dia. Antes de manter/restringir esse comportamento, teste:
1. mesma intencao/chave/conteudo: retorna resultado anterior;
2. mesma chave/conteudo diferente: conflito;
3. outra chave repetindo exatamente a parcela ja consumida: recusa pela regra de negocio;
4. duas medicoes realmente distintas no mesmo dia, de ordens/parcelas distintas: permitidas quando o contrato comportar, com saldo correto;
5. contrato com periodo indivisivel configurado: sobreposicao recusada pelo fundamento correto;
6. duas requisicoes concorrentes para o mesmo saldo: nunca excedem.

Nao remova controles cegamente. Nao resolva so mudando datas do teste. Data nao substitui identidade de medicao, periodo, item, parcela e escopo. Se a regra anterior precisar mudar, use migration aditiva adequada e preserve medicoes existentes.

A preparacao dos percursos deve criar o contexto correto por run em banco descartavel identificado. Repetibilidade de cenario e idempotencia do mesmo ato sao provas separadas.

## 4. U1 - Ordem de servico como autorizacao operacional real

Reconcile a ordem de compra/servico ja existente, a autorizacao de fornecimento e eventual ordem de fiscalizacao. Reutilize cabecalho, itens, numeracao, comandos e documentos compativeis. Nao crie duas ordens que comprometam o mesmo saldo.

Distinguir:
- ordem de EXECUCAO ao contratado;
- agendamento/ordem de FISCALIZACAO ao agente publico;
- nota de empenho;
- ordem de PAGAMENTO.
Uma nao e prova da outra.

Campos minimos propostos, completados pelo TR/contrato real:
- numero/ano, entidade/unidade, contrato e versao/aditivos pertinentes;
- finalidade/objeto, local, unidade solicitante, fornecedor derivado;
- periodo planejado, data de emissao e inicio autorizado, prazos com regra;
- gestor/fiscal responsavel por referencia canonica;
- itens com origem contratual, unidade, quantidade, preco/versao, valor e saldo;
- parcelas, dotacao/fonte/empenho quando aplicaveis e alocacoes identificadas;
- condicoes e documentos necessarios ao recebimento;
- anexos pelo M22 e historico.

Seletores carregam apenas contratos/itens elegiveis no escopo. Mostre origem, saldo e vigencia; revalide na transacao. Nao aceite fornecedor ou preco arbitrario por campo oculto. Cadastro relacionado em contexto preserva o rascunho quando autorizado.

Acoes: salvar rascunho, revisar, emitir/autorizar, consultar, baixar espelho, registrar inicio/execucao, suspender/retomar quando o modelo suportar, cancelar saldo ainda nao executado por ato motivado. Use PROD-015 para disponibilidade e REGISTRO-MUDOU conforme contratos atuais.

Emitir OS nao cria livremente saldo orcamentario, nao prova recebimento e nao paga. Se um caso de uso autorizado ja gera reserva/empenho, reutilize-o e registre esses efeitos explicitamente. Nunca insira esses fatos direto no banco.

Controle saldo por item/versao e parcela, sem contar o mesmo compromisso duas vezes nas visoes de ordem e empenho. Duas OS simultaneas nao podem consumir o mesmo saldo alem do permitido.

Distinguir contrato vencido para nova execucao de tratamento de fato executado regularmente durante vigencia. Nao bloquear toda conferencia/liquidacao posterior so porque a data atual excedeu o contrato; avaliar data do fato, condicoes e atribuicao atual. Tambem nao inventar prorrogacao para autorizar servico novo.

Trate contratos continuados/globais/estimativos somente nos casos efetivamente suportados. A interface deve declarar o tipo; nao afirmar suporte completo por adicionar uma opcao ao enum.

## 5. U2 - Medicao, conferencia e recebimentos parciais

### 5.1 Fatos separados

Conserve objetos e relacoes identificaveis:
- execucao informada;
- medicao por itens/periodo/versao;
- recebimento provisorio;
- verificacoes/pendencias;
- recebimento definitivo ou atesto da parcela, conforme regime;
- recusa/glosa e sua motivacao;
- titulo/documento fiscal de cobranca;
- alocacao e liquidacao.

Um registro pode agregar trabalho de tela, mas nao pode apagar a natureza, autoria e efeitos de cada fato. Receber material fisicamente nao significa aceita-lo tecnicamente; conferir XML nao significa atestar prestacao.

Cada recebimento identifica exatamente contrato/OS/medicao, parcela, quantidades, valores pertinentes, data, responsavel, designacao, verificacoes e documentos. Receber uma parcela nao encerra todo o contrato nem todas as medicoes.

A regra juridica do fluxo depende da natureza do objeto. Compras, servicos continuados e obras nao devem receber o mesmo workflow obrigatorio por conveniencia. Neste incremento, entregar um caminho regular completo e outro de parcela controversa; casos nao suportados continuam parciais, com motivo.

### 5.2 Responsaveis e termos

Recebimento provisorio e definitivo possuem competencias distintas. O responsavel pelo definitivo pode ser servidor ou comissao formalmente designada; nao atribuir automaticamente ao gestor generico nem reutilizar a designacao da folha.

Reutilize infraestrutura de designacao, se pertinente, com papeis/capacidades de contrato. Cadastramento e exercicio do poder sao distintos. Teste validade, substituto, revogacao, entidade e segregacao exigida. Membros/quorum de comissao seguem o ato configurado; nao invente numero nacional de assinantes.

Termo provisorio: escopo, itens/parcelas, verificacoes e pendencias.
Termo definitivo: parcela efetivamente aceita, criterios, conclusao, responsaveis e documentacao.
Termo de recusa ou exigencia: itens, motivo, condicao a cumprir, prazo quando fundamentado e destinatario.

Gerar documento usa M22/lib/pdf atuais. PDF/hash nao e assinatura qualificada. Vincule a assinatura realmente disponivel sem inventar HSM ou certificado. Documento emitido preserva snapshot e identidade; segunda via nao usa valores vivos do cadastro. Corrigir exige novo documento/versao referenciado.

Nao transformar GET, prefetch, preview ou download em recebimento, ciencia juridica ou assinatura.

### 5.3 Quantidades, glosa, controversia e prazos

Por item, distinguir contratado, autorizado, executado/medido, aceito, controverso/rejeitado, liquidado e pago. Somar somente grandezas comparaveis. Nao somar quantidades de unidades diferentes num indicador sem significado.

Uma pendencia pode suspender a avaliacao de uma parcela sem excluir a execucao historica. Defina quando existe glosa proposta, glosa confirmada, correcao/reapresentacao e liberacao posterior. Glosa nao e retencao tributaria nem multa automatica.

Mantenha os efeitos da parcela incontroversa e da pendente separados. Nao bloquear o contrato inteiro por um item discutido quando a parcela separavel satisfizer os requisitos para prosseguir. Tampouco liberar pagamento so porque uma quantidade foi digitada como aceita.

Prazos: regra/fonte, unidade de contagem, calendario/fuso pertinente, marco inicial, suspensao/retomada motivada e historico. Nao hardcodar os prazos do contrato de software analisado. Sem fundamento, mostre configuracao ausente e bloqueie apenas a automacao/ato que dependa dela.

Resolucao de ocorrencia pelo gestor nao aprova automaticamente medicao, remove glosa, recebe objeto ou liquida.

## 6. U3 - Ponte para a liquidacao existente

Crie uma composicao de casos de uso, nao outra contabilidade.

Entrada do comando de liquidar: origem contratual/medicao/recebimento pertinente, documento de cobranca conferido quando devido, empenho, itens/parcelas e alocacoes.

Reutilize M05, M07 e os mecanismos de comando, locks, auditoria e historico. Preserve as origens folha, encargos e despesa fiscal existentes. Nao impor documento fiscal ficticio, OS ou recebimento final de obra aos fluxos salariais.

Antes de gravar, validar dentro da transacao:
- ator/escopo, designacao quando pertinente, versoes e elegibilidade;
- fato de execucao/aceitacao que suporta a parcela;
- fornecedor/credor e entidade do documento, contrato e empenho;
- documento fiscal ativo/conferido e saldo elegivel;
- quantidade/valor aceito ainda nao liquidado;
- saldo do empenho, ficha/fonte, periodo e roteiro especifico;
- parcelas ja utilizadas, concorrencia e reversoes anteriores.

Consuma a alocacao no mesmo commit em que a liquidacao e seus efeitos sao confirmados. Lock/invariante deve proteger caminhos concorrentes, inclusive liquidacoes com outra chave de comando. Um numero deterministico nao substitui a reserva/constraint.

Se varias medicoes/documentos/empenhos precisarem ser relacionados, registre alocacoes explicitas e feche os totais. Nao criar uma correspondencia 1:1 artificial que deixe recebimentos e faturamentos parciais impossiveis. Entregue primeiro o subconjunto suportado, sem mapear por nome/valor aproximado.

Nao reduplique entrada de estoque/incorporacao: consulte o fato ja realizado e integre por sua identidade. OS de servico nao vira material porque a conta foi encontrada em alguma classe; preserve os discriminadores da origem. Nao reescreva os ajustes anteriores da liquidacao de material sem regressao.

O retorno mostra o que realmente foi liquidado, os IDs/referencias autorizadas e o que continua pendente. Uma falha parcial por grupo/etapa nao exibe todo o contrato como liquidado. Em retorno perdido apos commit, recuperar o mesmo resultado por idempotencia.

Dossie navegavel nos dois sentidos: contrato <-> OS <-> medicao <-> recebimento <-> documento fiscal <-> liquidacao <-> pagamento <-> razao. Um operador ve somente as projecoes e documentos que pode acessar em cada elo.

### 6.1 Reversoes

Antes de cancelar/estornar, apresente dependencias e reconfira no comando. Ordem/medicao/recebimento utilizado por liquidacao nao desaparece.

Parcela liquidada nao paga: atos de reversao permitidos pelo dominio, com analise de impacto e recomposicao das alocacoes correspondentes, sem duplicar liberacao de saldo.
Parcela paga: procedimento proprio de ajuste/restituicao se suportado; caso contrario pendencia explicita. Nao fingir que estornar documento devolveu dinheiro.
Periodo encerrado: nao reabrir automaticamente. Nao gerar pagamento real nesta sessao.

Mantenha a direcao de estorno ja definida para ordem empenhada: o novo cancelamento de OS nao pode burlar o fluxo controlado pelo empenho.

## 7. U4 - Interface, documentos e visao publica nesta mesma entrega

Nao refaca o design system. Aplique o padrao V7 e a elegibilidade comum.

Telas logicas necessarias, com rotas reais derivadas do que existe:
1. Contrato: resumo de execucao e proximas acoes, itens/saldos, ordens, medicoes, recebimentos, financeiro e documentos/historico.
2. Emissao de OS: itens e parcelas selecionados, contexto, responsaveis, prazos, revisao de impacto e confirmacao.
3. Execucao/medicao: periodos e quantidades por item, previsto/anterior/atual/acumulado/saldo, anexos e observacoes.
4. Conferencia/recebimento: por item, aceitar, apontar pendencia, recusar parte, consultar evidencias e emitir termo.
5. Preparacao da liquidacao: escolher parcela elegivel e documento, conciliar valores, apontar impedimentos e confirmar pelo M05.
6. Projecao publica: dados legais permitidos de contrato, execucao e documentos, sem controles internos nem dados privados.

Rotas sugeridas nao sao prova de existencia. Reutilize padroes dinamicos/aliases; registre o mapa real e os consumidores servidor/client. Nao contorne os guards para fazer o link abrir.

Mostre separadamente valor contratado atualizado, valor autorizado, medido, aceito, liquidado e pago. Progresso fisico depende de criterio proprio, nao do percentual pago. Falha ao calcular um resumo e erro recuperavel, nao zero.

Acoes em lote devem explicar abrangencia/parcelas e oferecer previa quando o risco justificar. Preferir pagina de trabalho em vez de sequencia de modais para conferencia longa. Preservar filtros/posicao ao voltar, foco, teclado e rascunho seguro.

Mensagens estruturadas: ato, referencia autorizada, quantidade/valor, parcialidade, pendencia e proximo passo. Exemplo ilustrativo: 'Parcela recebida: cinco unidades aceitas; uma aguarda verificacao.' Nunca gravar o exemplo com numeros fixos.

PDFs: OS, medicao, termos de recebimento e extrato de liquidacao com entidade/contexto, identificadores, itens, valores, responsaveis, fundamento aplicavel, origem, paginas e versao. Teste texto longo, varias paginas e totais independentes. Dados de interface/PDF/CSV/XLSX suportados vem da mesma consulta autorizada; neutralize formulas em texto externo.

Nao publicar documento interno integral porque sua referencia pertence a contrato publico. Projecoes publicas usam lista permitida de campos/arquivos e invalidacao de cache apropriada. Nao expor CPF, contatos privados, ocorrencias/evidencias internas ou tokens. Nomes de responsaveis e documentos efetivamente devidos seguem politica de publicacao; privacidade nao e pretexto para omitir publicidade obrigatoria.

Nenhuma mencao TR/ENT/M2/percentual de cobertura no front, notificacoes ou PDFs operacionais. Numeros de contrato, processo, artigo legal e documentos reais continuam legitimos. Textos da aplicacao em portugues correto.

## 8. Aceite por unidade e marco

Use CRITERIOS-V7-M2-ACEITE.md, adaptando nomes e testes ao repositorio sem mudar as expectativas para obter verde.

Durante a construcao: typecheck afetado, testes dirigidos do dominio/autorizacao/runtime, instalacao/upgrade de migrations pertinentes e percursos significativos. Nao executar portao completo a cada botao.

Neste marco contratual-financeiro: congelar candidato; verificar M11/M05/M07/M10/M22 e consumidores da elegibilidade/alocacao, folha/patronal sem regressao, papel runtime, schema/SQL/grants e arquivos. Executar o percurso de apropriacao salarial que ficou pendente na rodada anterior sobre o candidato de integracao, sem reabrir a implementacao se ele passar.

Ao concluir a ponte, rodar suite completa e fuso na referencia estavel conforme scripts existentes, alem dos percursos centrais. Nao reutilizar o verde de 5937f41 para o codigo novo. Registrar testes ou formatos nao executados como tais. Se a suite geral falhar por ambiente delimitado, preservar o candidato e a pendencia; nao rotular integrado nem promover a release sem resolver.

Banco de manutencao prepara; papel runtime executa os atos. Nao usar owner para ocultar falta de privilegio. Nao conceder UPDATE/DELETE geral para satisfazer teste. Novas migrations nao reescrevem as compartilhadas; arquivo/artefato emitido e ledger mantem suas garantias.

Testes independentes com mesmo banco nao podem truncar em paralelo. Artefato em medicao nao e editado. Meca tempo/carga antes de ajustar timeout de M03: ajuste fundamentado de infraestrutura pode ser valido, aumento cego ou exclusao do teste nao.

O ensaio funcional precisa ser repetivel sem procurar datas cada vez mais distantes. Rode cenario limpo e repeticao explicita no mesmo cenario como provas distintas. Mantenha as rodadas falhadas no registro.

As capturas devem testar mais que overflow: coluna legivel, campos/acoes acessiveis, texto completo, estado vazio, erro, parcialidade, zoom e documento emitido. Preserve o progresso de layout ja obtido.

## 9. Continuacao automatica dentro do M2

Concluida a ponte e suas garantias, sem pedir nova escolha a cada passo, avance pelos incrementos seguintes do MESMO M2:
1. Aditivos por item/versao, com vigencia, quantitativos/precos e saldo das parcelas, sem modificar fato anterior; nao duplique o cadastro ja existente de aditivo.
2. Planilha orcamentaria da obra: grupos/itens, unidades, quantidades, valores, versoes e importacao .xls/.xlsx com previa, erros por linha, conciliacao e sem execucao de formulas/macros. Relacione itens de contrato e planilha sem identifica-los artificialmente como o mesmo objeto.
3. Medicoes da obra contra a versao aplicavel dessa planilha, com periodo, acumulado, saldo, ajustes e vinculo a recebimento/liquidacao ja construido.
4. Agenda completa de fiscalizacao com horario, calendario diario/semanal/mensal, fuso e conflitos justificados; tipos de ocorrencia configuraveis e formularios ja previstos no TR, preservando historico.

Cada incremento mantem sua classificacao PARCIAL ate seus criterios serem executados. Nao chamar a medicao atual por item contratual de planilha de engenharia.

Antiabuso externo, fluxo de restituicao, retorno bancario e encaminhamento de ouvidoria continuam no backlog correspondente. Nao apaga-los; nao desviar esta fila para fingir concluir tudo. Servicos publicos locais continuam sem liberacao para internet enquanto seguranca de exposicao nao estiver aceita.

A seguir permanece M3 - base tributaria/cobranca, depois M4 - fiscal/NFS-e, conforme plano mestre. Nao iniciar dezenas de telas vazias de tributos porque a ponte ficou dificil. Um bloqueio externo permite outro item independente do M2; bloqueio de autorizacao impede somente os consumidores inseguros.

## 10. Entrega e checkpoint

Atualize o catalogo unico e os documentos de modulo: criterio literal, parte entregue, parte ausente, rota real, papeis, teste e evidencias. Nao promover clausula composta por um unico percurso. 379/2.037 e contagem de classificacao, nao completude.

No topo do ESTADO-EXECUCAO.md: HEAD, app_sha/runner_sha, unidade atual, o que funciona, pendencias e proximo passo. Detalhes em secao propria sem repetir autobiografia da sessao. Resumo e contratos em documentos versionados; logs sanitizados/capturas/massas no pacote ignorado.

Entregue:
- arquivos/commits e situacao preservada de stash/terceiros;
- regra de unicidade de medicao e fundamento;
- mapa de acesso: fiscalizacao, financeiro e publico;
- caminho completo OS -> recebimento -> liquidacao e reversoes;
- saldos por item/parcela e valores esperados/obtidos;
- documentos emitidos e projecoes publicas conferidas;
- testes por SHA, runtime, ambiente, falhas e nao executados;
- migrations/upgrade ensaiados;
- diferencas visuais e proximo incremento exato.

Nao deixar o codigo novo disponivel somente em relato. Prepare pacote incremental sanitizado que permita auditar diffs e contratos relevantes, sem exigir push. Nao prometa execucao fora da sessao.

COMECAR pela baseline e pelas duas dependencias U0. Entregar OS e recebimentos ligados a liquidacao; manter a fila do M2 e preservar o marco anterior.

---

Instrucao que acompanhou o pacote (verbatim):

Execute PROMPT-V7-M2-EXECUCAO-CONTRATUAL.md e utilize
CRITERIOS-V7-M2-ACEITE.md para a validacao.

Confirme o HEAD local 3deaf37 e preserve qualquer avanco
posterior. Nao reinicie M1.

Mantenha o stash 11b7892 e os scripts de terceiros intactos.
Nao reaplique o stash, nao execute os scripts e use staging
por caminhos exatos.

Comece pelas duas dependencias U0:
- acesso especifico da fiscalizacao, separado da projecao
  financeira e da consulta publica;
- unicidade de medicao por intencao/parcela/saldo, verificando
  se a restricao por dia tem fundamento real.

Nao aceite procurar sempre outro dia como prova suficiente
de repetibilidade ou de regra de negocio correta.

Depois implemente ordem de servico, recebimentos por parcela
e a ponte de liquidacao pelo M05, preservando folha, encargos,
nota recebida, estoque e comandos existentes.

Mensagens, layout, PDFs e consultas relacionadas acompanham
o mesmo incremento.

Conclua a regressao do candidato e continue pelos proximos
incrementos do M2 definidos no prompt, sem pedir uma nova
escolha de modulo a cada commit.

Sem push, deploy, mensagens reais, pagamento ou transmissao.
Entregue codigo, operacoes utilizaveis, testes por versao,
capturas, documentos e checkpoint.
