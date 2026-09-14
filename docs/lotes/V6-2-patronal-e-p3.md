# V6.2 - Concluir os encargos da folha e executar P3

> Guardado como veio, antes de qualquer código (CLAUDE.md, "Ao fechar uma unidade de trabalho").
> Recebido em 2026-09-14 junto da instrução abaixo, também transcrita.

## Instrução que acompanhou o adendo

Execute PROMPT-V6-2-PATRONAL-E-P3.md como adendo ao V6/V6.1.

Confirme a base local 0e412f2 e preserve qualquer avanço
posterior. O build af292c2 é referência de aceite anterior,
não uma ordem para retroceder.

Não refaça M32/M33, as designações, a certificação ou a
liquidação salarial já entregues.

Comece pelas duas dependências curtas:
- PROD-015: disponibilidade de ações por permissão, escopo,
  estado e pré-condições, com revalidação na transação;
- CRIAR_FICHA: entrada operacional pela interface usando
  o domínio de planejamento, sem criar crédito artificial.

Depois conclua PATRONAL-NA-MEMORIA e os efeitos financeiros
pertinentes. Preserve folhas fechadas, separe desconto do
servidor e encargo do ente e teste retomada/concorrência.

Na sequência, execute P3: requerimento administrativo
completo, atualização cadastral e complemento de fornecedor,
com mesa interna e acompanhamento do requerente.

Mensagens, relatórios, PDFs, seletores e autorização
acompanham essas entregas; não formam outro projeto.

A pergunta sobre 24 horas não autoriza publicação.
Sem push, deploy, mensagens reais, pagamento ou transmissão.

Preserve o stash 11b7892 já incorporado e os scripts de
terceiros. Use staging por caminhos exatos.

Implemente, teste unidades coerentes e continue sem pedir
confirmação a cada commit. Entregue rotas reais, percursos,
resultados, pendências e checkpoint.

---

## 0. Mandato e precedencia

Este e um adendo EXECUTAVEL ao V6 e ao V6.1, nao outro projeto ou substituicao do programa. Preserve a fila e o catalogo do TR. A ordem principal continua: concluir os encargos patronais de P2 -> executar P3 -> seguir as demais frentes por dependencia. Dois ajustes curtos, PROD-015 e a interface de CRIAR_FICHA, sao dependencias de usabilidade e operacao dessa mesma entrega.

A pergunta sobre colocar uma demonstracao online em 24 horas e uma avaliacao de viabilidade, NAO autorizacao para publicar. Nao reative a corrida da V5, nao procure hospedagem como primeira tarefa e nao abandone P3 por outra rodada exclusivamente contabil.

Execute unidades coerentes durante a sessao disponivel, sem pedir confirmacao a cada arquivo/commit. Nao encerre apenas com um plano. Um impedimento externo bloqueia apenas a unidade que depende dele; um defeito de integridade ou autorizacao bloqueia seus consumidores. Nao prometa trabalho fora da sessao.

Permanece autorizado: desenvolvimento local, testes, fixtures sinteticas isoladas, migrations novas ensaiadas, consultas de leitura aos repos/fontes oficiais ja indicados. Nao autorizado: push, deploy, DNS/IAM, contratacao, mensagens reais, pagamento, remessa fiscal, dados produtivos e alteracoes em outros projetos da maquina.

## 1. Baseline e evidencias

Estado INFORMADO pelo executor, que deve ser confirmado no disco:
- HEAD local 0e412f2; build de aceite af292c2.
- Atesto e liquidacao da folha pelo M05 implementados, com designacao registrada e segregacao dentro da transacao.
- Contas da liquidacao de pessoal declaradas por grupo, em vez de usar a conta de servicos de terceiros.
- Permissoes v13: DESIGNAR_NA_FOLHA ao administrador; nao presumir concessao das demais acoes.
- Relato de testes: certificacao 37/37, apropriacao 13/13, folha 38/38, censo/permissoes 19/19, molde/runtime 223/223, rapida 852/852; percursos de cinco papeis sob af292c2. Nao somar conjuntos possivelmente sobrepostos como testes distintos.
- test:tudo, test:fuso e portao integral nao executados nesta rodada.
- Tres scripts de terceiros nao rastreados, sem autorizacao de execucao/inclusao.
- Stash 11b7892e7800281f3ef915ee571a967b9383401b ja incorporado anteriormente e ainda preservado.

A consulta remota desta orquestracao retornou main em dc7032a12c7490781ffbdca6958eb3fbf422fe48; 0e412f2 nao foi localizado. Isso NAO autoriza reset. Nao atribua a revisao remota antiga aos arquivos novos. Confirme o HEAD real, ancestralidade e a identidade do binario servido; preserve qualquer avanco posterior.

Nao reaplique ou apague o stash. Nao execute fix-*.sh/manter-claude-cursor.sh. Use staging por caminhos exatos; nao git add -A nem git add -- scripts. Antes de commitar, confira nomes e diff do indice. Preserve arquivos de terceiros mesmo quando o trabalho legitimo exigir arquivos no mesmo diretorio.

Leia o resumo corrente e o checkpoint do ESTADO-EXECUCAO.md, os MODULO.md afetados e os itens do catalogo da unidade. Nao releia os 39 blocos para comecar. Nao reaudite A01-A09, recrie M32/M33, refaca designacoes ou ressuscite o fluxo de nota fiscal ficticia para folha.

## 2. U0 - Duas dependencias concretas, sem reescrita geral

### 2.1 PROD-015: disponibilidade da acao, nao somente permissao

O relato diz que uma folha certificada ainda oferece Certificar e Devolver. O dominio recusa, mas a interface orienta mal. Corrija no contrato compartilhado do molde, com adocao incremental e regressao, nao por ifs independentes em cada pagina.

Distinga:
1. direito de conhecer/consultar o recurso;
2. autorizacao para a acao e para o escopo;
3. elegibilidade do registro naquela versao/estado;
4. pre-condicoes ainda nao satisfeitas;
5. execucao em andamento e conflito de versao.

Proposta de contrato, a adaptar aos tipos existentes: identificador da acao, apresentacao disponivel/bloqueada/nao aplicavel/em processamento, motivo seguro, versao do alvo e proxima providencia. Nao crie um segundo motor de workflow ou RBAC.

A porta calcula a projeccao a partir das regras do dominio. Reutilize predicados de elegibilidade quando possivel. Consultar disponibilidade e operacao somente de leitura: nao reserva numero, cria comando, assina, marca ciencia ou altera registro.

A mutacao refaz as verificacoes dentro da transacao real. O DTO de disponibilidade NAO e autorizacao, trava ou garantia de saldo; duas abas e outra requisicao podem alterar o registro depois da leitura.

Comportamento:
- Sem direito: nao expor acao nem motivo que revele dado protegido; a chamada direta continua recusada.
- Acao concluida/nao aplicavel: retirar da barra primaria e mostrar estado/evidencia, quando autorizado. Uma correcao admitida e outra acao de dominio.
- Pre-condicao faltante e legivel pelo usuario: apresentar desabilitada com explicacao e atalho autorizado; nao apenas tooltip inacessivel.
- Em execucao: impedir novo disparo na UI, preservando idempotencia no servidor.
- Falha ao consultar elegibilidade: nao liberar todas as acoes como fallback.

Comece pela folha (fechar/certificar/devolver/liquidar), documento fiscal (conferir/cancelar) e ordem (receber/empenhar) como familias de regressao. Nao esconda todas as acoes para fazer o teste passar. Nao reescreva a regra de cada dominio dentro do componente React.

Use button nativo quando apropriado, motivo associado acessivel, foco preservado e teclado. aria-disabled sozinho nao impede um handler de executar; trate a interacao e mantenha a guarda do servidor.

Aceite: folhas antes/depois da certificacao; registro alterado em outra aba; permissao revogada; tarefa em andamento; chamada direta indevida; negativa com motivo correto e sem efeitos; caminhos felizes ainda operacionais.

### 2.2 CRIAR_FICHA: eliminar a dependencia de script para a operacao

Confirme o caso de uso existente em planejamento, seu contrato, permissao e eventuais rotas dinamicas. Estar no censo nao prova que o servico ou a interface ja estejam completos. Localize antes de criar uma segunda entrada.

Entregue pela UI a criacao de ficha/dotacao prevista pelo dominio, com entidade/unidade, exercicio, classificacoes, programa/acao, fonte e demais campos obrigatorios reais. Use seletores referenciados e autorizados, com busca e vigencia.

Nao trate criar ficha como criar credito disponivel livremente. Valor orcado, abertura de credito, alteracao da LOA e saldo de execucao seguem seus casos de uso e autorizacoes. Nao use gravacao direta no Prisma ou SQL para contornar a inicializacao contabil.

O roteiro deve permitir preparar, pela interface, a ficha de pessoal e a de encargos pertinentes a fixture aprovada. Nao escolha a ficha com mais saldo e nao presuma que a numeracao do elemento, sozinha, resolve toda a classificacao.

Nao selecione conta PCASP por posicao na lista. O dominio deve validar existencia, natureza, nivel analitico, vigencia e compatibilidade que efetivamente exigir; a configuracao exige procedencia, nao um par instrumental apresentado como doutrina.

Aceite: criar/recarregar/consultar; ficha usada na apropriacao posterior; duplicidade; exercicio/entidade indevidos; ausencia de direito; componente pai modificado; parametrizacao contabil ausente; cenario sem saldo. Nao semear justamente a ficha que o percurso pretende provar que a tela cria. Classificacoes oficiais de apoio podem ser carregadas por importacao/fixture identificada.

Conclua U0 com um contrato compartilhado funcional e o percurso necessario. Nao transforme isso em redesenho completo de centenas de telas. Prossiga para U1.

## 3. U1 - PATRONAL-NA-MEMORIA e seus efeitos financeiros

### 3.1 Especificacao antes do calculo

O encargo patronal e obrigacao do empregador; nao e desconto do servidor. Reutilize o motor, tabelas, memoria e parametros versionados existentes.

Para cada componente suportado registre: entidade, regime/enquadramento, tipo de encargo, incidencias por rubrica, base, formula, percentuais/limites pertinentes, precisao, arredondamento, inicio/fim de vigencia, fonte/fundamento e aprovacao da configuracao. Nao aplique um percentual padrao nacional indistintamente a RGPS, RPPS, FGTS ou outro regime.

Busque fontes primarias aplicaveis para as regras nacionais; parametros locais dependem de ato/configuracao. Ambiente de teste pode usar um perfil expressamente sintetico, sem alegar validade normativa. Verificacao estrutural de uma formula nao e aprovacao contabil ou juridica.

Diferencie NAO APLICAVEL, PARAMETRO AUSENTE, CALCULADO e ZERO CALCULADO. Ausencia nao vira zero e zero nao prova inexistencia de obrigacao.

A memoria deve resolver os dados por competencia e vigencia, nao pelo cadastro atual. Nao invente datas ou aliquotas para preencher um formulario.

### 3.2 Memoria, fechamento e legado

Preserve cada folha ja fechada. Nao acrescente silenciosamente patronal a uma memoria/hash anteriormente certificado.

Para folhas novas: produza memoria por vinculo/rubrica/regime/componente e consolidacoes por grupo/ficha/fonte/entidade. A soma do detalhamento deve reconciliar com os totais, sem duplicar o bruto.

Para folha fechada sem esse detalhamento: ofereca apuracao complementar versionada, referenciada ao fechamento e claramente identificada. Ela tem seu proprio resumo, certificacao quando exigida e efeitos. Uma retificacao possui vinculo com a origem e analise do que ja foi apropriado/liquidado; nao gera novamente a obrigacao integral em retry.

Mudanca de parametro futuro nao altera folha nem memoria passadas. Corrigir dado passado exige ato proprio, comparativo e diferenca explicita. Preserve contracheque emitido e trilha historica.

O fechamento de um lote nao equivale a fechamento de toda a entidade. Mostre universo esperado, lotes/grupos concluidos, pendentes e excecoes. Nao marque toda a competencia completa quando faltarem encargos aplicaveis.

### 3.3 Apropriacao e liquidacao dos encargos

Use M05/M07/ledger e o mecanismo de comando ja existente; nao crie uma contabilidade paralela no M33.

Separe salario bruto, deducoes pessoais, liquido, encargo do ente e recolhimentos. O patronal NAO reduz o liquido. Deducoes ja dentro do bruto NAO recebem um segundo empenho como despesa nova. Nao confunda liquidacao, ordem de pagamento, movimento bancario e confirmacao externa.

Cada grupo deve indicar classificacao/ficha/fonte e roteiro pertinente com validacao no dominio, sem herdar o par de contas usado para remuneracao ou servicos de terceiros por conveniencia. Preserve o que a ponte salarial corrigiu sobre o elemento 11, sem transformar um mapeamento novo em constante universal.

Certificacao de encargos, quando separada, identifica seu objeto, versao e resumo. Atesto salarial nao pode ser apresentado como atesto de encargos que ainda nao haviam sido calculados. Designe atores sinteticos no teste; nao conceda certificar/liquidar automaticamente ao admin.

As permissoes, designacao atual e conflitos de segregacao sao revalidados na transacao. Historico de designacao sustenta o atesto passado; revogacao nao o reescreve. Entretanto, revogacao atual nao pode ser contornada por backdating do comando novo. Mantenha instante servidor e data de negocio distintos.

Idempotencia usa identidade do objeto/versao, fingerprint e reserva/unicidade no banco, nao somente o numero humano gerado. Se retomavel por grupo, cada grupo e atomico; falha parcial mostra exatamente o concluido e o pendente. Nao retome com outro snapshot sem novo comando/objeto.

Nao fabricar nota fiscal, protocolo de eSocial, guia recolhida ou pagamento bancario para fechar o percurso.

### 3.4 Telas e documentos

Amplie as telas existentes com detalhamento e aba de encargos: bases, componentes, fundamento, memoria, comparativo, valores por grupo, situacao da certificacao e links autorizados para empenhos/liquidacoes.

Relatorios de resumo e planilha contabil devem diferenciar bruto/descontos/liquido/patronal, com filtros por competencia, regime, grupo e lotacao pertinentes. PDF/CSV e demais formatos suportados usam a mesma consulta autorizada. Teste totais, multipagina, cabecalhos, texto longo e formato de dinheiro, nao apenas MIME/tamanho.

No portal do servidor, documentos liberados e estado do pagamento continuam separados. Visao publica de remuneracao nao herda dados bancarios, dependentes ou consignacoes do DTO privado.

### 3.5 Aceite de U1

Use pelo menos dois vinculos e dois componentes/grupos que nao passem por vacuidade. Inclua as combinacoes realmente suportadas de regime, mudanca de vigencia, base nao incidente, arredondamento de rateio e obrigacao zero legitimamente calculada.

Resultados de referencia devem ser calculados de forma independente do motor testado. Nao gerar o expected chamando o proprio calculador.

Cenarios essenciais: soma dos itens; parametro ausente; parametro futuro; fechamento imutavel; complemento; negativas por ator; duas requisicoes simultaneas; falha no meio e retomada; nenhum novo estoque; nenhum segundo empenho de deducao; saldo correto por ficha/fonte; folha salarial anterior intacta; download de terceiro negado.

Conclua um percurso pela interface: ficha -> folha -> patronal -> memoria -> certificacao -> apropriacao/liquidacao aplicavel -> documento -> consulta por titular/operador. Depois prossiga a P3, sem outra sessao inteira aperfeicoando a mesma familia.

## 4. U2 - P3: mesa de trabalho, carta e servicos reais

Reutilize M21/M22/M23/M24 e as implementacoes atuais. Nao crie outro cadastro de pessoas, outra autenticacao nem outro engine de workflow so para gerar menus.

Comece por uma cadeia vertical completa de requerimento administrativo. Depois replique os componentes para atualizacao cadastral e complemento de fornecedor, todos ja previstos no V6/V6.1.

### 4.1 Mesa e execucao

Mesa por usuario/setor com entrada, atribuidos, aguardando requerente, devolvidos, pareceres, concluidos e prazos calculados. Todo contador vem de consulta autorizada. Dossie com resumo, envolvidos, documentos versionados, anotacao interna separada da mensagem ao requerente, movimentacoes, tarefas, prazos, decisoes e relacionados.

Reutilize PROD-015: a proxima acao deve ser valida para o estado e ator. Disponibilidade nao dispensa revalidacao na mutacao. Concorrencia entre dois servidores recebendo/decidindo a mesma tarefa deve gerar um resultado coerente.

Fluxo/formulario tem definicao versionada e publicacao. Processo em curso preserva a versao de origem. O desenho visual deve corresponder ao que executa; nao vender uma imagem de fluxo como motor funcional nem suporte completo BPMN/DMN/CMMN sem implementacao.

Condicoes usam vocabulario fechado, nunca eval/new Function ou URLs arbitrarias. Automacao chama casos de uso autorizados. Prazos dependem do calendario/fundamento configurado; nao invente prazo legal para montar um dashboard.

### 4.2 Carta publica e area do requerente

Carta publica: titulo, categoria, descricao, requisitos, documentos, etapas, custo/regra quando houver, prazo/fundamento, setor, canais, necessidade de autenticacao e formulario/fluxo publicados. Nao exigir login para ler descricao publica.

Fluxo: consultar servico -> autenticar quando exigido -> preencher/anexar -> revisar -> protocolar -> receber comprovante -> receber internamente -> emitir exigencia -> complementar -> decidir -> disponibilizar resposta/documento -> acompanhar.

Cadastro publico nao concede papel interno. CPF/CNPJ valido nao prova identidade; nao permita tomar Pessoa legada por conhecer seu numero. Representacao de fornecedor e explicita, vigente e revogavel. Nao expor tokens de recuperacao em pagina publica.

GET, prefetch e render de pagina nao protocolam, certificam, tramitem ou confirmam ciencia juridica. Use comandos auditados e idempotentes.

Antes de liberar qualquer resposta publica, aplique uma projecao permitida, nao serializer administrativo com campos escondidos. Regra vale para HTML, JSON/RSC, PDF, busca, cache e anexos. Consulta por codigo devolve apenas o extrato permitido; CPF sozinho nao abre processo privado.

### 4.3 Tres servicos e fronteiras

1. Requerimento administrativo com anexo, encaminhamento, exigencia e resposta.
2. Atualizacao cadastral: proposta de mudanca -> analise -> aprovacao pelo caso de uso de Pessoa. Nao sobrescrever o cadastro no simples envio do pedido.
3. Complemento documental de fornecedor com representacao validada e acesso somente ao processo pertinente.

Podem compartilhar componentes, mas suas acoes/validacoes nao sao um CRUD generico. Nao emitir CND por ausencia de dados tributarios. Ouvidoria anonima e pedidos de acesso a informacao seguem seus fluxos proprios quando implementados; nao inventar justificativa obrigatoria para toda consulta publica.

### 4.4 Aceite de P3

Duas pessoas externas, dois operadores/setores, dois processos e pelo menos uma representacao revogada. Prove acesso devido e negacao por outro usuario, inclusive ID, URL de anexo, export e cache.

No percurso principal, o operador externo deve criar um requerimento novo pela UI, e outro papel deve recebe-lo/responde-lo. Nao provar somente processos preparados por seed. Nao simular notificacao enviada; notificacao in-app pode ser real, transporte de teste deve estar identificado e isolado.

HTTP 200 nao encerra o aceite. Exigir persistencia, recarga, estado, documento, prazo/movimentacao e retorno visivel ao requerente.

## 5. P4 durante todas as unidades

Mantenha identidade correta de Gestao Publica e da entidade, sem replace global de nomes tecnicos, cookies, historicos ou IDs. Nao exibir referencias de conformidade TR/ENT/P2/P3/PROD-015 na interface operacional. Motivos legais pertinentes e numeros reais de documentos permanecem.

Mensagens nascem do resultado autoritativo: acao, referencia permitida, efeito, parcialidade, proxima providencia e correlacao. Nao afirmar 'nada foi gravado' em resultado desconhecido. Reexecucao idempotente nao e um novo ato. Registro financeiro nao e pagamento confirmado.

Use seletores referenciados, por contexto e vigencia, com busca/paginacao para listas extensas. Nao pedir UUID. Resposta atrasada nao troca a selecao do usuario. Mudar o contexto exige revalidar dependencias sem perder silenciosamente o rascunho.

Documento emitido/segunda via conserva snapshot e identidade da emissao; relatorio de posicao atual possui sua propria data. Hash nao e assinatura qualificada. Sanitizar HTML/URLs e proteger o gerador de PDF contra requisicoes internas nao autorizadas. Exportacao respeita escopo e nao inclui campos privados invisiveis.

## 6. Testes, release e a pergunta das 24 horas

A possibilidade de publicar uma DEMONSTRACAO restrita em 24 horas e condicional: alvo autorizado, artefato reproduzivel, ambiente persistente, verificacoes no destino e escopo ensaiado. Isso nao equivale a producao municipal, POC integral ou autorizacao desta rodada para publicar.

Desenvolvimento: typecheck e testes dirigidos por unidade; regressao dos consumidores quando mudar molde, calculo, despesa, schema ou autorizacao. Nao execute portao integral por ajuste de texto.

Marco integrado P2/P3: build e regressao ampliada sobre fonte congelada; antes de candidato a homologacao/publicacao, cumprir o conjunto de validacao exigido, incluindo suite/fuso, migrations/SQL/grants, percursos, persistencia e recuperacao pertinente. Nao converter 'nao executado' em aprovado, nem carregar o verde de af292c2 para um novo build.

Mantenha banco de teste, banco dos percursos, anexos e build isolados. Confirme o banco antes de rodar suite que trunca tabelas. Sem testes pesados concorrentes no mesmo banco ou maquina saturada; sem editar a fonte sob medicao. Use o trinco existente, nao mate processos de terceiros ou um monitor obsoleto sem identificar seu alvo.

Persistencia depende de PostgreSQL E arquivos/anexos. Um .next/artefato gerado no Mac nao comprova Chromium e dependencias no Linux. Quando houver publicacao futura, construir no alvo/ambiente compativel, testar PDF, cookies de sessao HTTPS, revogacao, negativas diretas, download, reinicio e restauracao.

Nenhum tunnel de localhost, porta PostgreSQL exposta ou upload da base de desenvolvimento substitui um ambiente autorizado. Credenciais de bootstrap sinteticamente compartilhadas nao entram num ambiente acessivel pela internet.

Manter a preparacao operacional documentada nao autoriza sua execucao externa. Esta rodada termina com codigo e evidencias locais.

## 7. Evidencias e continuidade

Nao criar outro catalogo de status. Atualize o existente por criterio e parte obrigatoria comprovada. Marque as lacunas reais, nao oculte CRIAR_FICHA ou PROD-015 apenas porque o dominio recusa corretamente.

Guarde por aceite: app_sha, runner_sha, migrations/schema, perfil de configuracao sintetica, comando, resultado, log sanitizado e artefato. Nao some os testes rapidos e subconjuntos como total unico. Registre build e source separados quando scripts posteriores testarem um binario anterior.

Entregue ao final:
- HEAD, commits e estado dos arquivos de terceiros/stash;
- diferencas de permissao e comportamento da barra de acoes;
- criacao de ficha por UI demonstrada;
- patronal calculado/nao aplicavel/pendente e seus efeitos;
- percurso salarial anterior sem regressao;
- quais dos tres servicos P3 funcionam de ponta a ponta;
- rotas REAIS por papel, campos publicos e privados efetivamente verificados;
- capturas, documentos e exports conferidos;
- testes rodados/falhados/nao rodados, com procedencia;
- instalacao limpa e upgrade das migrations novas ensaiados;
- checkpoint curto no topo do ESTADO e pacote incremental sanitizado.

Nao alegue que P2 encerra toda a folha, que P3 encerra todo o governo digital, ou que uma fracao do TR e produto completo. Depois desse marco, continue a fila maior ja definida: contratos/obras, receitas/tributario/NFS-e, demais frentes e integracoes, por dependencia real.

COMECE confirmando a base. Corrija as duas dependencias pequenas, conclua o patronal e avance P3. Nao recomece o sistema e nao encerre apenas dizendo que aguardara uma nova data de apresentacao.

## Referencias de trabalho

Prioridade funcional: TR anexado e catalogo; programa V6 e adendo V6.1. As decisoes deste texto sao instrucoes de engenharia, nao novas exigencias literais do TR nem validacao juridica/contabil do produto.

- Next.js: https://nextjs.org/docs/app/guides/self-hosting (conferir a documentacao da versao instalada).
- W3C: https://www.w3.org/WAI/ARIA/apg/patterns/button/
- eSocial: https://www.gov.br/esocial/pt-br/documentacao-tecnica (versao publicada nao significa ativada para todos os ambientes/competencias).
- Memorias, padroes e valores locais devem ter fundamento aplicavel, sem herdar numeros de fixtures como regra vigente.
