# V7 / M1 - Consolidar a base integrada e abrir a proxima frente

## 0. Missao e precedencia

Execute este comando no repositorio gestao-publica. O proprietario adiou a apresentacao para amadurecer o ecossistema, com qualidade funcional e visual. Nao ha objetivo de publicar em 24 horas nem autorizacao de hospedagem.

O PLANO-MESTRE-ECOSSISTEMA.md organiza todas as frentes. Este e o comando executavel de M1. V6, V6.1 e V6.2 continuam como contratos de negocio; sua fila evolui conforme o que foi realmente entregue, sem reiniciar P0/P2/P3.

Implemente durante a sessao disponivel, em unidades coerentes, sem pedir confirmacao por arquivo ou commit. Nao encerre apenas com outro plano. Nao prometa execucao depois de encerrada a sessao.

P3 tem tres cadeias entregues segundo o relato, nao o universo completo do governo digital. Preserve essas cadeias, o motor de folha, a certificacao, a liquidacao salarial, as regras de comando, os documentos e o ledger.

Autorizado: desenvolvimento local; testes e fixtures isolados; novas migrations ensaiadas; leitura/fetch das origens conhecidas; documentacao primaria; download controlado do navegador compativel com a dependencia instalada; arquivos locais e commits por caminhos exatos.

Nao autorizado: push, deploy, alteracao de DNS/IAM, servicos pagos, mensagens reais, pagamentos, remessas fiscais, dados produtivos, mexer em outras repos/servicos da maquina ou entrar em areas privadas de concorrentes.

## 1. Baseline curta e preservacao

Confirme no disco os hashes completos:
- checkpoint relatado: c2123b9;
- aplicativo compilado final: bec8349;
- relato: commits posteriores ao build alteram apenas documentacao;
- build anterior de percursos: 2ddb109;
- stash 11b7892e7800281f3ef915ee571a967b9383401b ja incorporado, ainda preservado;
- scripts terceiros fix-*/manter-* ainda nao rastreados, sem execucao autorizada.

A orquestracao nao recebeu o pacote local desse HEAD. Nao trate os numeros do relato como testes reexecutados aqui. Nao faca reset, reaplique stash ou restaure outra branch para coincidir com estas referencias. Preserve qualquer avanco posterior.

Leia o resumo do ESTADO-EXECUCAO.md e a secao 60.6. Confirme os contratos atuais de M21, M22, M32 e M33 antes de alterar. Nao releia todo o historico a cada unidade.

Registre app_sha, runner_sha, tree digest quando necessario, schema/migrations, configuracao sintetica e runtime efetivo. Verifique o diff entre app_sha e HEAD antes de afirmar que so existem mudancas de documentacao.

Nao sobrescreva .next em uso por next start. Use worktree/artefato separado ou encerre somente o processo identificado deste projeto. Nao reviva monitores antigos nem mate processos por padrao generico.

## 2. U0 - Ambiente de prova confiavel

### 2.1 Navegador previsivel

O desaparecimento de Chrome deve ser diagnosticado como ausencia de dependencias, nao interpretado como prova de que a aplicacao esta correta ou errada.

Confirme a versao de Puppeteer instalada pelo lockfile, o executavel esperado, OS/arquitetura, cache e envs do runner E do servidor de PDF. Nao atualizar o pacote ou escolher Chrome stable/latest indiscriminadamente para fazer o percurso rodar.

Configure cache/executavel em local controlado pelo projeto ou provisionamento dedicado, fora do Git. Nao limpe ~/.cache nem altere instalacoes de outros projetos. Instale pelo CLI local da versao fixada o browser que ela requer; o comando equivalente a 'puppeteer browsers install chrome' deve usar a dependencia local confirmada.

Crie/reutilize um preflight unico: binario existe, inicia, carrega pagina local e gera PDF minimo; encerra processo ao terminar. Servidor e runner devem usar a mesma configuracao prevista. Binario ausente interrompe o percurso com diagnostico antes dos primeiros cliques.

Inclua um procedimento explicito de reposicao. Nao criar downloads automaticos durante requisicao HTTP nem um loop de reinstalacao. A causa do desaparecimento pode continuar desconhecida, registrada assim; garantir reprodutibilidade nao exige inventar culpado.

### 2.2 Repeticao do percurso patronal sem burlar a fila

O relato de 25 acertos e 2 falhas continua sendo falha parcial. Nao contar negativa de fila como sucesso do passo que precisava concluir a operacao.

Separe:
- cenario limpo com obrigacoes e ordem coerentes;
- repeticao idempotente do mesmo ato na MESMA competencia;
- cenario negativo com grupo anterior legitimo que deve bloquear a fila;
- percurso de retificacao/reducao com efeitos posteriores.

Dados por execucao devem ter identidade rastreavel e isolamento de banco/schema. Se o teste usa fixture reutilizada, prepare/encerre seus atos pelo caminho autorizado. Pode recriar banco EXCLUSIVAMENTE descartavel, depois de confirmar identidade e isolamento; nao apagar dev, demo compartilhada ou originais.

Mudar sempre o teste para outro mes nao prova retomada no mesmo mes. Nao desabilitar ordem cronologica, alterar datas para passar, excluir lancamentos ou filtrar obrigacoes inconvenientementes.

### 2.3 Dono do banco prepara; papel runtime executa

Migrations e preparacao controlada podem usar papel de manutencao. Os testes do contrato da aplicacao usam conexao com o mesmo papel e grants previstos no runtime.

Confirme current_user/session_user e privilegios efetivos. O papel da aplicacao nao pode ser dono, superusuario, herdar o papel dono ou receber poder administrativo como ajuste da suite. Nao imprimir credenciais em logs.

A suite de unidade pode continuar com seus desenhos atuais, mas o marco precisa de testes reais de permissoes do SGBD: entradas de M32, folha, P3, anexos M22, atualizacao de dados e leituras/negativas. Nao basta procurar UPDATE no codigo ou inspecionar o GRANT em texto.

## 3. U1 - Corrigir o isolamento interno do M21

O relato informa que M21 infere 'gestor' de qualquer permissao global. Reproduza antes de corrigir. A existencia da guarda CONSULTAR_PROTOCOLO nao encerra esse problema: um usuario pode ter consulta restrita ao setor e, ao mesmo tempo, uma permissao global de outra area.

Implemente uma decisao explicita por capacidade, escopo e designacao/cadastro pertinente. Reutilize RBAC e contratos existentes; nao criar outro catalogo de autorizacao.

Um gestor de processos autorizado pode enxergar o escopo concedido. Ser global em outra acao nao o transforma em gestor de protocolo. Ser gestor nao anula automaticamente sigilo de processo/documento. Resolva e teste a precedencia dessas politicas.

Aplique a regra antes de ler/serializar lista, detalhe, contagens, sugestoes, tarefas, historico, arquivos, exportacoes, PDFs, notificacoes e busca. Uma segunda guarda na pagina nao substitui a decisao na porta/dominio usado por outros caminhos.

Cenarios minimos:
1. CONSULTAR_PROTOCOLO apenas no setor A + permissao global de outra area: nao ve setor B.
2. Somente a permissao global de outra area: nao acessa protocolo.
3. Gestor de processos explicitamente designado: acessa o escopo previsto.
4. Gestor geral sem participacao especial em processo sigiloso: respeita a politica especifica.
5. Requerente, representante vigente/revogado e operador de outro setor.
6. Chamada direta por ID, download, totalizador e cache; nao somente menu.
7. Revogacao entre a leitura da tela e a tentativa de acao.

Teste que uma mutacao do resolvedor faz falhar a prova de escopo pelo motivo esperado. Nao considere lista vazia ou 404 sozinho como suficiente sem um alvo existente que o ator autorizado consegue acessar.

## 4. U2 - Encerrar dependentes com historico e grants coerentes

Reproduza a remocao de dependente em M32 com o papel real da aplicacao. Confirme se a regra de dominio exige exclusao logica, encerramento por data ou nova versao.

Por padrao deste produto, se a relacao ja integra folha/historico, encerre-a por fato/versionamento com data de efeito, motivo e autor. Preserve snapshots e permita consultar quem era dependente em cada competencia. A relacao atual nao deve reescrever a base de uma folha fechada.

Nao conceda UPDATE em todas as tabelas para ocultar o defeito. Tambem nao converta toda tabela do produto em event sourcing so porque uma operacao requer UPDATE. Diferencie fatos/historicos imutaveis de cadastros, definicoes e estados operacionais legitimamente mutaveis. Documente grants minimos e fonte autoritativa.

Se houver cadastro nunca usado que admita correcao/alteracao, use sua regra e auditoria, com teste e permissao restrita. A decisao precisa ser do modelo, nao uma corrida contra o GRANT.

Aceite: cadastro -> utilizacao em competencia -> encerramento -> nova competencia; folha antiga e documento emitido intactos; repeticao e concorrencia sem dois encerramentos incompativeis; acesso indevido recusado; instalacao nova e upgrade equivalentes.

## 5. U3 - Ajuste para baixo e recolhimento dos encargos

### 5.1 Diminuicao com analise dos fatos posteriores

O caminho 'somente a diferenca positiva' permanece para aumentos permitidos. Acrescente um plano de ajuste quando o valor devido diminui, sem clamp silencioso a zero e sem alterar a memoria anterior.

A apuracao complementar identifica versao anterior/nova, saldo ja empenhado, liquidado, pago/recolhido e diferenca. Planeje e apresente os atos necessarios por grupo e fonte.

- Parcela empenhada e nao liquidada: anular o excedente pelo M05, com efeito no saldo.
- Parcela liquidada e nao paga: verificar reversoes permitidas e suas dependencias antes de anular; a aprovacao do ajuste nao apaga a liquidacao.
- Parcela paga/recolhida: nao fingir que uma anulacao devolveu dinheiro. Registrar a necessidade e o fluxo proprio de restituicao/compensacao segundo regras e documentos cabiveis.
- Periodo encerrado: aplicar o procedimento de correcao permitido; nao abrir periodo automaticamente.

Cada ato e autorizado, idempotente e rastreavel. O alvo da apuracao e o empenhado LIQUIDO das anulacoes, nao a soma cega das linhas originais. Testar aumento -> diminuicao -> retomada -> novo aumento para nao empenhar de novo o que continua valido.

Nao criar valor negativo em endpoint que recebe somente valores positivos. Nao emitir nova despesa da deducao do servidor. Nao alterar liquido, atesto ou contracheque anterior.

Teste duas requisicoes simultaneas, falha apos commit com resposta perdida e retomada por grupo. Uma falha parcial nao deve rotular a folha inteira como corrigida.

### 5.2 Documento de recolhimento verdadeiro

Separe quatro objetos: apuracao; obrigacao; documento/guia de recolhimento; pagamento ou retorno externo.

Implemente mapa de obrigacoes e cadastro/anexo de guia real quando fornecida, vinculando entidade, regime, competencia, arrecadador/destinatario, natureza, vencimento/fundamento, principal, componentes pertinentes, total e origem. A falta de regra de vencimento nao autoriza inventar data legal.

Se o layout/convenio oficial nao estiver disponivel, ofereca demonstrativo interno claramente identificado, sem codigo de barras pagavel, PIX ou autenticacao fabricados. Nao rotule PDF interno como documento oficial nem confunda 'anexado' com 'validado pelo emissor'.

Receber uma guia nao paga nada. Encargo apurado nao comprova recolhimento. Consulte/baixe/cancele pelo ato cabivel com historico e controle de duplicidade. Transporte externo ausente permanece pendente, sem bloquear o demonstrativo e o cadastro local.

## 6. U4 - Servicos sem login e avaliacao

Reutilize M21/M22 e os contratos P3. Nao transformar todo processo privado em publico para atender a esta unidade.

### 6.1 Matriz por natureza do servico

Diferencie descricao publica, formulario transacional autenticado, atendimento identificado sem conta quando cabivel, manifestacao anonima especifica e acompanhamento por segredo de protocolo com projecao limitada.

Implemente o caminho de manifestacao anonima previsto no TR com triagem de ouvidoria. Nao crie Pessoa ficticia para satisfazer FK de requerente. Nao force CPF/e-mail nem copie login da gestao interna para essa modalidade.

Anonimo e identificado sob sigilo sao modos diferentes. Minimize logs, proteja identidade e limite acesso de atendentes; nao prometa ausencia absoluta de metadados de rede. Segredo de acompanhamento nao deve vazar em logs, analytics ou referer; desenhe a consulta limitada e seu armazenamento protegido.

Pedido de acesso a informacao tem sua propria politica de identificacao e recursos. Nao assumir que todas as exigencias de um servico se aplicam a outro. Confirmar prazos/regras oficiais e locais quando forem operacionais; fonte ausente fica nomeada.

Defina quotas e validacao de arquivos proporcionais, protecao contra abuso e caminho acessivel. A restricao nao pode se tornar bloqueio arbitrario de leitura da informacao publica. Integracao externa antiabuso ausente nao pode ser declarada conectada.

### 6.2 Avaliar e publicar resultado sem expor o requerente

Avaliacoes devem cobrir as dimensoes do TR: satisfacao, atendimento, cumprimento de prazos/compromissos e descricao. A escala e a metodologia sao configuradas/versionadas; nao um numero inventado apresentado como indicador medido.

Ofereca avaliacao da carta/servico conforme elegibilidade definida. Diferencie avaliacao de atendimento comprovado e opiniao geral quando ambas existirem. Nao proiba feedback apenas porque nao ha protocolo em uma classe de servico puramente informativa, nem misture os dois universos na mesma metrica sem informar.

Evite multiplas respostas indevidas por token/identidade quando cabivel. A revisao legitima e versionada, nao um segundo voto acidental. A avaliacao e opcional e nao condiciona o recebimento da resposta do servico.

Resultados publicos: periodo, numero de respostas, denominador/metodo, dimensoes e data. Sem respostas significa 'ainda sem avaliacoes', nao nota zero. Publicar comentario bruto pode revelar dados sensiveis; use politica especifica. Remocao de abuso tem motivo e rastro e nao e mecanismo para excluir critica desfavoravel.

Aceite: visitante consulta carta -> manifestacao anonima -> triagem -> acompanhamento limitado; atendimento identificado -> resposta -> avaliacao -> resultado agregado; terceiro sem segredo nao acessa anexos; representante revogado nao volta pela rota publica.

## 7. U5 - Primeira passada de layout com operacao preservada

Aplique PADRAO-DE-EXPERIENCIA-E-ACEITE.md. Comece pelas telas reais afetadas: lista/detalhe de folha, apuracao de encargos, lista/detalhe de servicos, area do requerente, mesa interna e dependentes. Mantenha as rotas atuais e aliases necessarios.

Reutilize shell, molde, regras de elegibilidade, componentes e identidade configuravel. Nao instalar outra biblioteca de UI para refazer todos os botoes.

A melhoria deve reduzir procura e redigitacao: resumo, estado inequivoco, proxima acao valida, filtros pertinentes, links relacionados, erros por campo, documentos e historico. Nao esconder operacoes incompletas com uma tela bonita e um modal dizendo 'em breve'.

Teste 360/768/1366 e 1440 px como amostras de engenharia, zoom/reflow e teclado. Uma tabela larga pode ter scroll interno deliberado; a pagina toda nao deve transbordar porque contem hash ou valor longo. Cabecalhos fixos nao podem ocultar o foco.

Capturas antes/depois devem usar o mesmo cenario e conter dados sinteticos. Inclua estados de vazio, carregamento, erro, bloqueio, processamento e sucesso, nao somente a pagina com mais dados.

## 8. U6 - Aceite integrado deste marco

Este e o marco P2+P3 que os prompts anteriores reservavam para regressao ampliada. Nao aguarde construir os 39 blocos para executa-la.

Congele o candidato em commit/artefato. Instale do zero e ensaie upgrade sobre copia anterior isolada. Confirme migrations, SQL manual, grants, configuracao e perfis; acoes deliberadamente nao concedidas nao viram erro a ser resolvido por grant universal.

Execute typechecks, validacoes de schema, testes dirigidos e contrato runtime; suite completa e fuso conforme os comandos atuais; build e percursos centrais. Nao rode novamente o pacote integral por cada mudanca de rotulo durante U1-U5.

Banco compartilhado que trunca tabelas nao roda paralelizado. Paralelismo exige bancos/schemas e fixtures realmente independentes. Respeite memoria disponivel; nao compilar no editor e rodar dois builds junto da suite. Nao aumentar timeout ou remover assert para pintar verde.

O instalador deve reconhecer uma versao de permissoes ja aplicada e nao tentar conceder tudo novamente. Uma recusa do comando administrativo repetido pode ser correta, mas o provisionamento/upgrade precisa registrar o estado e continuar com seguranca, sem tratar toda reexecucao como instalacao quebrada.

Percursos centrais no MESMO candidato: dependencia historica; folha/certificacao/liquidacao; patronal com repeticao e ajuste; compras/documento/ordem; portal do servidor; P3 identificado/anonimo/representacao; publicacao/consulta; PDF/download. Use papeis diferentes e acesso direto negativo.

Registre cada resultado como passou, falhou, bloqueado por ambiente ou nao executado. Nao junte passes de uma versao com falhas de outra para inventar um unico verde. Testes de runner posterior podem validar app anterior, mas ambos os SHAs devem aparecer.

A verificacao de documentos deve inspecionar paginas/conteudo/totais, nao apenas MIME. Continue usando M22 para anexos; teste o helper comum e os consumidores existentes da importacao fiscal.

## 9. Saida objetiva e continuidade

Atualize o catalogo existente por criterios provados, sem criar outra planilha de status. Relacione cada achado a teste e correcao. Nao marque P3, folha ou o modulo inteiro como completo por concluir estas unidades.

Entregue:
- HEAD, app_sha e runner_sha; situacao do stash/arquivos terceiros;
- navegador provisionado, caminho/versionamento e preflight;
- matriz de autorizacao do M21 e prova com permissoes cruzadas;
- dependencia encerrada com historico e papel runtime;
- ajuste patronal positivo/negativo, grupos, documentos e limites externos;
- servicos publicos/autenticados e avaliacao efetivamente executados;
- capturas antes/depois e formatos de documentos testados;
- resultados integrados, instalacao/upgrade e pendencias nominais;
- checkpoint curto e pacote incremental sanitizado em diretorio ignorado.

Nao deixar a conclusao apenas em diretorio ignorado. O resumo verificavel, contratos e criterios devem estar nos documentos versionados pertinentes; logs sensiveis, binarios e massas permanecem fora.

## 10. Proximo trabalho ja definido: M2

Quando U1-U6 estiverem aprovados no alcance necessario e ainda houver sessao, prossiga para o primeiro incremento de M2. Nao abra outro projeto nem pergunte qual modulo escolher.

M2.1 - Contrato acompanhado de ponta a ponta:
- reconciliar contratos/obras ja existentes no M11;
- concluir designacao de gestor/fiscal por ato, vigencia e escopo;
- dossie do contrato com itens, saldo, vigencias, documentos e vinculacoes;
- agenda/ordem de fiscalizacao, registro de ocorrencia, evidencias e encaminhamento;
- uma medicao com itens/quantidades e validacoes, quando o modelo ja permitir;
- publicar somente a projecao permitida de contrato/obra, sem formulario interno aberto.

Testar um gestor, um fiscal, outro setor e um visitante; um contrato ativo e outro fora de vigencia; duas linhas/uma parcela parcial; alteracao concorrente; permissao revogada. Progresso fisico e pagamento sao valores distintos.

Se M1 tiver falha de integridade/autorizacao, corrija antes de ampliar os consumidores. Uma dependencia externa pode permitir trabalho independente em M2, documentado, sem rotular M1 como concluido.

Nao entregar apenas mais cadastros: o percurso deve mostrar o trabalho do fiscal e o efeito autorizado na cadeia existente. Depois dele, o plano mestre ja define F07/F08 e as demais frentes por dependencia.

---

Instrucao que acompanhou o pacote (verbatim):

Execute o pacote gestao-publica-v7-ecossistema.

Leia 00-LEIA-ME.md e PLANO-MESTRE-ECOSSISTEMA.md.
O comando ativo e PROMPT-V7-M1-CONSOLIDACAO.md.
Aplique PADRAO-DE-EXPERIENCIA-E-ACEITE.md nas telas afetadas.

A apresentacao foi adiada. Nao retome a meta de 24 horas,
nao procure hospedagem e nao publique.

Confirme c2123b9 e o build bec8349, preservando qualquer
avanco posterior. Nao reaplique nem remova o stash 11b7892.
Nao execute ou inclua os scripts de terceiros.

Preserve as entregas de V6.2. Comece pela confiabilidade
do ambiente de prova, pelo escopo de gestor no M21 e pela
operacao de dependentes com o papel real do banco.

Depois complete o ajuste negativo do patronal, o tratamento
do documento de recolhimento, os servicos sem login cabiveis
e a avaliacao dos servicos.

Melhore as telas com os componentes existentes. Nao crie
outro design system, outro RBAC ou outro ledger.

Conclua a regressao integrada de M1 sobre fonte congelada.
Nao use resultados de builds diferentes como um unico aceite.

Com as dependencias aprovadas, continue M2.1:
gestao e fiscalizacao contratual, conforme o prompt.
Nao reinicie P2/P3 nem encerre apenas com outro plano.

Entregue codigo, commits, operacoes utilizaveis, capturas,
testes, pendencias e checkpoint exato. Sem push, deploy,
mensagens reais, pagamentos ou transmissoes fiscais.

Nota do executor: o arquivo 00-LEIA-ME.md citado na instrucao NAO veio anexado (vieram PROMPT-V7-M1-CONSOLIDACAO.md, PLANO-MESTRE-ECOSSISTEMA.md e PADRAO-DE-EXPERIENCIA-E-ACEITE.md, guardados nesta pasta).
