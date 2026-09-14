# Plano mestre V7 - Ecossistema integrado de Gestao Publica

## 1. Objetivo e limites

Construir uma plataforma municipal completa no escopo do TR, com operacoes reais, boa experiencia de uso, integridade, segregacao de acesso e capacidade operacional. A apresentacao foi adiada pelo proprietario; a prioridade e maturidade do produto. Nao presuma adiamento formal de certame concedido, nem prazo de implantacao autorizado.

Manter gestao-publica, monolito modular, Prisma, Decimal, ledger, contratos, comandos, cadastro canonico de Pessoas e mecanismos de documentos. O nome do produto e Gestao Publica; SIAFIC permanece uma funcao e referencia tecnica legitima. Nao substituir a stack para reorganizar o menu.

O TR e o escopo obrigatorio. Melhorias de produto devem ter identificacao propria, justificativa, dependencia e resultado esperado. Nao diminuir o escopo contratual por causa da priorizacao, nem ampliar silenciosamente a promessa comercial para todas as atividades imaginaveis de uma prefeitura.

As analises iniciais das repos sao historicas. Nao reaplicar recomendacoes ultrapassadas de criacao de Git, fusao de pastas, reescrita integral do doador ou outra tenancy contra os ADRs e o codigo atual.

## 2. Baseline relatada, nao reauditada

Checkpoint c2123b9, build bec8349. O relato descreve:

- elegibilidade de acoes compartilhada entre apresentacao e transacao;
- criacao de ficha pela UI;
- calculo/fechamento, apropriacao, certificacao, liquidacao salarial e apuracao patronal;
- tres servicos P3 com mesa interna e area do requerente;
- projecoes publicas e pessoais testadas em percursos;
- instalacao limpa com 146 migrations e permissoes v15.

O mesmo relato deixa abertos:

- exclusao/encerramento de dependente em M32 usando UPDATE nao concedido ao runtime;
- inferencia de gestor no M21 por qualquer permissao global;
- percurso patronal nao repetivel no mesmo mes por residuos que afetam a fila;
- browser ausente e percursos nao repetidos sobre o candidato final;
- ajuste negativo de encargo/empenho e documento/guia de recolhimento;
- servicos sem login, ouvidoria correspondente e avaliacao de servicos;
- suite completa, fuso e marco de regressao integrada ainda nao executados nessa entrega.

Isso constitui uma base funcional parcial e um marco de consolidacao, nao falha total nem aceite integral do ecossistema. Preservar o que foi implementado e corrigir as dependencias identificadas.

## 3. Frentes permanentes

As frentes F01-F12 sao agrupamentos de planejamento, NAO novos modulos obrigatorios, repositorios ou nomes para substituir os Mxx existentes. Suas referencias ao TR sao internas; nunca aparecem na interface do usuario.

### F01 - Plataforma compartilhada, identidade e experiencia

Escopo principal: 5.8 e dependencias transversais.

Entregas: contexto municipio/entidade/unidade/setor/exercicio; pessoas e representacoes; autenticacao e autorizacao por acao/alvo; configuracao institucional; auditoria; catalogo de acoes; formularios/campos configuraveis; formulas versionadas e seguras; anexos; geracao, copia e distribuicao de relatorios; assinaturas; jobs; notificacoes; ajuda contextual; diagnostico operacional.

Separar identidade, autorizacao e elegibilidade. Aplicar contrato unico de disponibilidade sem transformar o frontend em autoridade. Hash nao e assinatura; armazenamento de arquivo A1 nao e HSM. A ausencia de provedor impede apenas a validacao externa daquele recurso.

Preservar o ADR de schema por municipio. Antes de habilitar segundo cliente, provar selecao confiavel do schema, permissao do runtime, FKs/unicidades, jobs, anexos, relatorios, pool e caches. Entidades no mesmo municipio nao sao municipios diferentes. Tema visual nao prova isolamento.

Resultado: cada dominio novo reutiliza fundacoes coerentes e tem acesso, documentos e experiencia utilizaveis desde a primeira cadeia.

### F02 - Planejamento, contabilidade, tesouraria e controle interno

Escopo: 5.9-5.11.

Entregas: PPA/LDO/LOA completos, audiencias, metas e indicadores, dotacoes, saldo inicial derivado da LOA, alteracoes, cotas, contingenciamentos, receitas e despesas, extraorcamentario, restos, conciliacao, fontes, encerramentos, demonstrativos, controles e auditorias.

Criar ficha sem credito evita credito inventado, mas nao substitui a abertura regular do orcamento pela LOA. Uma implantacao nova nao pode financiar todo o orcamento inicial apenas com creditos adicionais por falta do ato de abertura.

Cadeias: planejar -> aprovar/importar instrumento pertinente -> abrir/executar orcamento; empenhar -> liquidar -> ordenar -> pagar -> conciliar; reconhecer/arrecadar -> vincular banco/fonte -> conciliar; encerrar competencia/exercicio -> transportar saldos -> emitir demonstrativos.

Teste os sentidos inversos: cancelamento, anulacao, estorno, ajuste, reabertura autorizada quando cabivel, restitucao e dependencia de fatos posteriores. Conclusao nao se resume a criar um lancamento.

### F03 - Pessoal, folha e desenvolvimento dos servidores

Escopo: 5.12-5.16, portal do servidor em 5.39 e interfaces externas pertinentes.

Preservar M32/M33 e o trabalho ja entregue. Completar multiplos vinculos, dependentes, regimes, historico, progressao, afastamentos, ferias, 13o, rescisoes, pensoes, consignacoes, provisoes, encargos, complemento/retificacao, pagamentos e recolhimentos.

Construir ponto/jornadas, SST, riscos, exames e acidentes, recrutamento, selecao e treinamento conforme o texto de cada bloco. Dados clinicos e pessoais tem permissoes especificas; nao entram em qualquer ficha de RH ou transparencia.

Portal do servidor cresce junto: ficha, documentos liberados, pedidos, ferias, ponto e respostas. Nao oferecer um menu pessoal sem retaguarda. Uma folha mensal simples nao encerra essa frente.

### F04 - Compras, licitacoes, contratos, obras e fiscalizacao

Escopo: 5.17, 5.21 e 5.22; dados de obras mencionados no financeiro e na transparencia.

Entregas: planejamento anual de contratacoes/intencoes, solicitacoes e participacoes, pesquisa de precos, processos e modalidades/atos pertinentes, propostas, lances quando exigidos, habilitacao, recursos, adjudicacao, homologacao, atas, contratos, aditivos, reajustes, revisoes, garantias, saldos e vigencias.

Nao renomear uma troca de status como julgamento completo. Cada ato precisa de legitimidade, documentos, efeitos e historico.

Execucao: gestor/fiscal designados, calendario, ordens, entregas/medicoes, glosas, notas, liquidacoes, pagamentos, ocorrencias, sancoes e encerramento. Vincular tudo nos dois sentidos sem duplicar dados.

Obras: planilha, cronograma, etapas, memoria de medicao, fotos/documentos, paralisacao/reinicio e indicadores de execucao. Progresso fisico, medido, liquidado e pago sao dimensoes distintas. Projecao publica vem dos fatos publicaveis, nao de formulario administrativo sem botoes.

Aplicativo de fiscalizacao: frente real com mesmos contratos e permissoes; nao declarar atendido por responsividade web.

### F05 - Almoxarifado, patrimonio, frota e combustiveis

Escopo: 5.18-5.20.

Preservar o acervo existente. Completar inventario, divergencias, transferencias entre entidades, manutencoes, concessoes, depuracao de saldos e ligacoes contabil/contratual/fiscal.

Estoque: requisicao, reservas, recebimento, consumo, transferencias, ajustes autorizados, lotes e rastreabilidade conforme o dominio. Nao duplicar entrada na recepcao e na liquidacao.

Frota: veiculos, condutores, abastecimentos, manutencoes, despesas, custos, viagens, multas, sinistros, seguros e historico segundo o TR. Componentes da empresa em outros projetos so entram por reutilizacao deliberada, sem mesclar bases, usuarios ou dados reais.

### F06 - Governo digital, canais e comunicacao

Escopo: 5.37-5.40, 5.42-5.43. P3 entrega tres cadeias iniciais, nao a totalidade.

Carta de servicos, servicos identificados e anonimos conforme natureza, ouvidoria, acesso a informacao, agendamento, avaliacao e resultados, processo digital, mesa, prazos, pareceres, decisoes, comunicacoes e notificacoes.

Website institucional: conteudo editavel, paginas, noticias, agenda, midias, subportais, avisos e identidades por entidade. Transparencia: consultas especificas de despesas, receitas, pessoal, contratos, obras e demonstrativos; formatos, filtros, acesso e atualizacao rastreavel.

App do cidadao: compartilhamento dos dados, autenticacao, servicos, documentos, notificacoes e requisitos nativos/lojas do TR. Nao declarar o aplicativo concluido por uma pagina que abre no celular. Publicacao em lojas exige autorizacao e credenciais proprias.

### F07 - Cadastros tributarios, arrecadacao e cobranca

Escopo: 5.29-5.34.

Cadastro imobiliario/economico e vinculos de Pessoas, atividades e proprietarios; IPTU, ITBI, ISS, taxas, outras receitas, formulas/parametros por vigencia, lancamentos, guias, convenios, baixas, compensacoes, parcelamentos e divida ativa.

Cadeia: cadastrar -> resolver norma/parametro aplicavel -> simular com memoria -> lancar -> emitir guia pertinente -> receber retorno/registrar fato autorizado -> baixar -> contabilizar -> cobrar/parcelar -> permitir correcao legalmente cabivel.

Declaracao de regularidade/CND exige fontes completas e regras, nao consulta vazia numa base de teste. Dados fiscais individuais nao se tornam publicos por estarem no banco do municipio.

### F08 - Fiscalizacao fazendaria e fiscal eletronico

Escopo: 5.23-5.28.

Escrita fiscal, Simples, NFS-e/ADN, autorizacoes de emissao, importacoes, cruzamentos de malha, ordens fiscais, notificacoes, processos e domicilio eletronico.

NFS-e nao e documento recebido do fornecedor. Confirmar o modelo de adesao municipal, versoes e ambientes antes de implementar comunicacao. Prestador, tomador, contador/representante e autoridade fiscal sao papeis distintos.

DPS/RPS/XML/DANFSe e eventos seguem o contrato efetivo. Envio com timeout exige consulta/reconciliacao, nao autorizacao inventada nem reenvio cego. IBS/CBS/NBS e CNPJ alfanumerico usam artefatos oficiais pertinentes a vigencia; nao copiar datas de artigos ou dados de fixtures como norma.

### F09 - Licenciamento, urbanismo e procuradoria

Escopo: 5.35, 5.36 e 5.41. Tres subdominios com contratos proprios, nao um cadastro generico de processos.

REDESIM: viabilidade, abertura, alteracao/baixa, analises setoriais, documentos e comunicacao com a Junta segundo o convenio.

Urbanismo: projetos, profissionais, viabilidades, alvaras, obras privadas, analises, exigencias, taxas, licencas, vistorias, habite-se, fiscalizacao e atualizacao cadastral.

Procuradoria: pessoas/representacoes, processos e distribuicao, prazos, peticoes, documentos, cobrancas judiciais, depositos e acompanhamentos. Conferir plataforma/interface do tribunal em vez de presumir PJe por heuristica antiga.

### F10 - Servicos publicos, cemiterios, agricultura e farmacia

Escopo: 5.44-5.47.

Servicos publicos: ocorrencia -> triagem -> programacao/equipe/equipamentos -> materiais -> execucao -> custo -> resposta ao cidadao.

Cemiterios: cemiterio/lote/sepultura, ocupacao, concessoes, agendamentos, sepultamentos, transferencias/exumacoes, documentos, cobrancas e historico.

Agricultura: produtor/propriedade, cadastros e programas, solicitacoes, maquinas/servicos, insumos e demais rotinas descritas. Nao substituir prontuario veterinario ou rotinas especificas por anotacao livre quando o TR pedir dados estruturados.

Farmacia: produto/CATMAT, unidades, compras e lotes, validade, bloqueios, estoque, receita/dispensacao, paciente/retirante, kits, demanda reprimida, processos judiciais e BNAFAR. Nao confundir com implantar um prontuario hospitalar completo fora do escopo.

### F11 - Interoperabilidade e prestacao de contas

Frente transversal, executada com F02-F10, nao uma etapa unica no fim.

e-Sfinge/SC, eSocial, ADN, bancos, REDESIM/Junta, tribunal, BNAFAR, SICONFI/MSC e demais interfaces efetivamente requeridas. PNCP e integraÃ§Ãµes complementares recebem escopo/fonte identificados quando adicionados ao produto.

Para cada conector: dono, finalidade, dado de origem, contrato/layout, regra de consistencia, versao, ambiente, autenticacao, permissao, idempotencia, tentativas, retorno, consulta, reprocessamento, segredo e evidencia de aceite externo.

Arquivo gerado, validado, enviado, recebido e aceito sao estados distintos. Credencial ausente nao permite inventar sucesso; tambem nao impede desenvolver o adapter local e os contratos verificaveis.

### F12 - Operacao, implantacao e sustentacao

Escopo: migracao, configuracao, treinamento, suporte, manutencao, seguranca, data center, disponibilidade, backups, recuperacao, exportacao integral e requisitos de operacao do TR.

Preparar localmente build reproduzivel, banco/arquivos/jobs, papel runtime, instalacao e upgrade, monitoramento, logs sanitizados, restauracao, testes de carga, portabilidade de dados e suporte.

Multi-AZ e certificados do provedor nao sao obtidos por codigo nem declarados por um Docker Compose. Testes locais sustentam preparacao, nao a SLA de producao. Hospedagem/servicos externos continuam sem autorizacao de execucao nesta rodada.

## 4. Sequencia de marcos executaveis

### M1 - Consolidacao de P2/P3 e primeira passada de UX

Comando ativo: PROMPT-V7-M1-CONSOLIDACAO.md.

Prioridades: isolamento por capacidade no M21; encerramento de dependente conforme politica de historico e runtime; navegadores e percursos reexecutaveis; ajuste negativo do patronal; documento de recolhimento com natureza verdadeira; servicos anonimos pertinentes e avaliacao; melhoria das telas existentes; regressao integrada com o papel real da aplicacao.

Nao voltar ao calculo salarial, ao cadastro de Pessoas ou a reimplementacao dos tres servicos. Corrigir somente a diferenca demonstrada.

### M2 - Gestao e fiscalizacao contratual com obras

Depois de M1 e suas dependencias aprovadas, expandir F04 usando o que ja existe no M11 e nos vinculos financeiros. Primeiro: dossie, fiscal/gestor, ordem e ocorrencia. Depois: medicao com itens/saldos, glosa, documento, liquidacao e projecao publica. Nao reconstruir nota recebida, empenho pela ordem ou assinatura existente.

### M3 - Base tributaria e cobranca operacional

Abrir F07 por um percurso completo de receita, sem tentar todos os tributos simultaneamente. Construir/validar cadastro, parametros, memoria, lancamento, guia, baixa e contabilizacao; expandir para os subcasos e divida ativa. Ponto de integracao com F02 e F06 e obrigatorio.

### M4 - NFS-e e fiscal eletronico

Desenvolver F08 sobre os cadastros e regras de F07. A pesquisa de interfaces e contratos externos comeca antes, em F11. Separar construcao local de credenciamento e homologacao.

### M5 - Pessoal completo e operacoes de suprimentos

Aprofundar F03 e F05 por cadeias: ferias/ponto -> folha; 13o/afastamento -> folha; seguranca ocupacional -> eventos; inventario -> acerto rastreavel; frota -> manutencao/abastecimento/custo. Evitar duas grandes mudancas simultaneas no ledger, schema ou motor comum.

### M6 - Licenciamento, juridico e setoriais

Executar F09/F10 pelos fluxos reais, reaproveitando F06/F07. Escopos medicos/veterinarios, fiscais e judiciais exigem validacao por responsavel competente; o agente nao inventa conclusoes profissionais.

### M7 - Fechamento integral e prontidao operacional

Completar os itens residuais dos 39 blocos, aplicativos nativos, assinatura/HSM e demais caracteristicas gerais. Ensaiar migraÃ§Ã£o, treinamento, volume, recuperaÃ§Ã£o, interoperabilidade e aceites independentes. O produto so entra em implantacao por autorizacao especifica, nao por conclusao de um prompt.

F01/F06/F11/F12 acompanham todos os marcos. Ordem pode ser refinada por dependencia demonstrada, sem abandonar requisitos ou reiniciar o programa a cada relatorio.

## 5. Regra de conclusao por capacidade

Uma capacidade operacional deve ter contrato de negocio, persistencia, acoes, reversoes pertinentes, permissao, estados, documentos, caminho de usuario e evidencia. Quando houver integracao, manter o estado externo separado.

Todo subitem do TR tem dono em uma frente, criterios atomicos e evidencia proporcional. Uma clausula composta permanece PARCIAL ate cobrir suas partes obrigatorias. Nao usar comentarios @req como prova e nao gerar percentual unico de produto pronto por numero de testes/rotas.

Classificacao funcional nao e classificacao de release: construido, testado dirigido, integrado, comprovado com usuarios e aceito externamente sao dimensoes diferentes. Fonte de infra tem evidencia de infra, nao pagina ficticia.

Nao apresentar a vida inteira de uma prefeitura como automaticamente coberta por este TR. Escopos adicionais sao registrados com impacto antes de entrar na fila. Melhoria de layout nao substitui funcao faltante; tambem nao deve ficar eternamente adiada por haver mais codigo de dominio a escrever.

## 6. Metodo de trabalho

Um unico catalogo de requisitos e um checkpoint atual curto. Leia o plano completo na abertura da fase; depois carregue somente modulo e contrato afetados. Preserve a historia, mas nao reescreva a autobiografia da sessao.

No maximo uma alteracao transversal de seguranca/ledger em curso no mesmo ambiente. Podem ocorrer trabalhos independentes, mas com limites de arquivos e bancos e sem concorrencia de builds/suites pesadas na maquina atual.

Teste dirigido a cada unidade, e integrado a cada marco. Ja estamos no marco P2+P3: a regressao ampliada nao sera adiada ate o ultimo modulo. Falha de ambiente continua pendente; causa suposta nao vira verde. Nao editar fonte que esta em medicao.

Dados de teste: corretos para o cenario, sinteticos, isolados, sem presumir homologacao contabil. A prova de impedir operacao irregular e necessaria, mas nao substitui o caminho permitido. Operacoes de negocio essenciais sao exercidas pela interface, nao por SQL de conveniencia.

## 7. Fontes e confiabilidade

- TR anexado, 189 paginas: fonte de escopo; capitulos 4, 5.1-5.8 e 5.9-5.47.
- V6/V6.1/V6.2: continuidade e contratos de engenharia, com pontos entregues preservados.
- Relato c2123b9/bec8349: baseline informada pelo executor; pacote local nao recebido para reauditarmos o HEAD nesta rodada.
- PostgreSQL, privilegios: https://www.postgresql.org/docs/current/ddl-priv.html
- Puppeteer, configuracao: https://pptr.dev/guides/configuration
- W3C WCAG 2.2: https://www.w3.org/TR/WCAG22/
- Lei 13.460, texto oficial: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2017/lei/l13460.htm
- NFS-e, catalogo tecnico oficial: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual
- eSocial, catalogo tecnico oficial: https://www.gov.br/esocial/pt-br/documentacao-tecnica

Fontes externas consultadas em 14/09/2026. A versao do site nao substitui a versao instalada nem a vigencia da regra do municipio. Conteudo de marketing dos concorrentes e benchmark observado, nao prova de qualidade comparada ou requisito novo.
