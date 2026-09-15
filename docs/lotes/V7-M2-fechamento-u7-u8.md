# Gestão Pública — fechamento do candidato e continuidade U7/U8

> Guardado como veio (PROMPT-V7-M2-FECHAMENTO-U7-U8.md, recebido em 2026-09-15). O arquivo chegou com a acentuação
> corrompida (UTF-8 lido como Latin-1); a única alteração aqui é a decodificação dos acentos.

Execute esta ordem exclusivamente em `/Users/winnervinicius/Developer/gestao-publica`, repositório `comercial-rgb/gestao-publica`. Você é o executor local e integrador. Continue o trabalho até entregar unidades utilizáveis; não pare apenas depois do diagnóstico ou da atualização documental.

## 1. Base e limites

A referência observada é `8ed0806b0e7467f16e7b1519a582edcd8bbe98ed`. Confirme o HEAD atual, branch, worktree e alterações antes de agir. Não faça checkout/reset para essa referência se houver trabalho posterior. Leia `CLAUDE.md`, instruções aplicáveis, `docs/LEIA-ME.md`, `ESTADO-EXECUCAO.md`, `docs/lotes/V7-M2-execucao-contratual.md`, `docs/lotes/V7-M2-criterios-de-aceite.md`, plano mestre e `MODULO.md` dos módulos afetados.

Preserve as entregas U0–U6. O último checkpoint estava atrasado em relação aos commits. A quantidade de commits relatada também deve ser conferida pelo histórico, sem presumir que todos sejam incrementos funcionais.

Preserve monólito modular, versões do lockfile, Prisma, Decimal, Pessoa canônica, ledger append-only, autorização, comandos, M21/M22, M32/M33, molde, shell e geradores existentes. Mantenha schema por município e contexto de entidade/unidade/exercício. Nenhum novo repositório, cadastro paralelo, ledger ou workflow concorrente.

Não tocar no stash `11b7892`, nem aplicar, remover ou executar os três scripts de terceiros. Não usar staging indiscriminado. Sem push, deploy, mensagens reais, pagamentos, transmissão fiscal, dados produtivos ou alterações em outros projetos. Não operar `whataspp-saas`, Evolution ou Redis nesta ordem.

## 2. Primeiro: ler o candidato já executado

A cadeia final de `8ed0806` TERMINOU em segundo plano. O código de saída zero informa apenas que o script chegou ao fim. Não há ordem para iniciá-la de novo ou encerrar processos. Se encontrar processo remanescente, identifique sua origem antes de qualquer ação; não mate processos de outros trabalhos.

Leia primeiro:

- `.registro-de-execucao/pacote-v7-m2/c-8ed0806/00-candidato.txt`;
- todos os logs por etapa dessa mesma pasta;
- índices de evidências e capturas relacionados.

Não execute `v7m2-final-8ed0806.sh` novamente apenas porque o relatório anterior sugeria essa alternativa. A informação posterior de conclusão prevalece.

Para cada etapa registre: comando, app_sha, runner_sha, ambiente sintético, início/fim, resultado real e evidência. Classifique em PASSOU, FALHOU, BLOQUEADO_POR_AMBIENTE ou NÃO_EXECUTADO. Arquivo vazio, ausente, execução interrompida ou código zero do agregador não são aprovação. Diferencie falha de produto, preparação e instrumento somente quando houver evidência; causa suspeita continua em investigação.

Confronte especialmente: suíte, fuso, runtime/deriva, instalação/upgrade, ponte, aditivo, percurso da planilha, apropriação salarial no clone próprio, percursos centrais, fila de encargos e capturas nas quatro larguras. Resultados de `3288b9b` não comprovam a U6 de `8ed0806`.

Se houver falha delimitada, reproduza apenas o passo/caso necessário em alvo isolado, corrija a causa e rode a regressão afetada. Não repetir toda a cadeia por padrão. No M03 t6, preserve o timeout: registre duração e condições de carga, investigue consultas/locks/preparação. As falhas em massa sob outro fuso só podem ser atribuídas a carga depois de conferir os logs; não converter hipótese em aceite.

Atualize a seção 62 e o resumo superior de `ESTADO-EXECUCAO.md`, o mapa de acesso e os `MODULO.md` pertinentes. Registre resultados por candidato, migrations/SQL/grants, regra de unicidade e pendências. Gere o LEIA-ME sanitizado do pacote. Não incluir segredos ou dados pessoais reais.

Atualize somente o catálogo existente, pelo mecanismo próprio, com prova específica. As propostas de classificação não são ordens de aprovação: conferir 5.21.16–18, 5.21.26–29, 5.38.4 e 5.17.96–106 individualmente. Não promover 5.21.27/28 sem o percurso correspondente nem tratar 5.21.29 como completo antes de U7 e seu aceite.

## 3. Organização e ritmo

Antes de cada unidade, registre no planejamento existente: responsável, base completa, módulo, arquivos exatos de escrita, contratos consumidos/alterados, dependências, resultado utilizável, testes selecionados e critério de integração. Não criar outro catálogo de cobertura.

Com um executor, use fila: fechamento do candidato → U7 → U8 → primeira unidade tributária B1. Não simular paralelismo. Com um segundo executor real, ele pode preparar B1 sem disputar arquivos, schema, Prisma gerado, dados ou builds; integração financeira continua com um único dono. Limite de dois escritores e uma execução pesada por máquina.

Use `scripts/trinco-de-maquina.ts` conforme o procedimento vigente. Não editar a árvore medida; congele o candidato ou use worktree isolada. Não limpar/truncar banco original, compartilhado ou de outro executor.

Durante construção: types afetados, testes selecionados, negativas por ação/escopo, persistência e percurso significativo. Saldo, autorização, período, idempotência, transação e schema exigem prova antes da integração correspondente. Não postergar essas proteções para a noite.

Suíte completa, fuso amplo, build e percursos extensivos ficam para um candidato integrado ou falha transversal justificada, aproveitando a janela de fechamento do trabalho. Não rodar portão integral a cada campo, documento ou commit. Não deixar processos agendados ou prometer execução fora da sessão sem um mecanismo efetivamente configurado.

## 4. U7 — medição da obra pela planilha

Responsável: executor A. Base: resultado reconciliado de `8ed0806` e correções necessárias. Escrita: arquivos reais de obras/fiscalização/execução do M11, páginas, portas, documentos e testes próprios. Mudanças em M05, schema/migrations, SQL e autorização precisam de reserva explícita pelo integrador.

Leia e compare o rascunho em `.registro-de-execucao/pacote-v7-m2/rascunho-u7-medicao-na-planilha/`. Schema, serviço e quatro testes ali são material não executado. Reaproveite o que for compatível; não copie cegamente nem substitua arquivos atuais. Identifique dependências e lacunas antes de incorporar.

Consuma: planilha/versionamento/vínculo contratual de U6; aditivos por item de U5; OS e recebimentos U1/U2; ponte M05 de U3; designações, comandos e documentos existentes.

Entregue o percurso completo: contrato/obra → planilha vinculada → OS → medição por itens da versão aplicável → recebimentos da parcela → valor apto → liquidação existente.

Requisitos de engenharia:

- Seleção autorizada de obra, contrato, OS e planilha; não pedir UUID nem escolher vínculo automaticamente por conveniência.
- Itens com código humano, descrição, unidade, quantidade prevista, anteriormente medida, medição atual, acumulado e saldo. Valores e quantidades precisam usar a precisão e os helpers apropriados.
- Vínculo explícito entre item da planilha e item contratual. Relações ambíguas ou não conciliadas impedem o consumo correspondente, com motivo localizável.
- Memória da medição com versão de planilha, preços/fatores aplicáveis, quantidades, arredondamento e evidências. Nova planilha/aditivo não reescreve medições ou documentos históricos.
- Identidade da parcela e comandos idempotentes. Mesma chave/conteúdo recupera; conteúdo diferente conflita; nova chave não duplica o mesmo fato. Proteção concorrente dos saldos no banco.
- Quantidades/valores medidos, aceitos, controversos, glosados, liquidados e pagos permanecem distintos. Não aplicar automaticamente regra desconhecida de glosa, retenção ou reajuste.
- Retificação/reversão com dependências; não apagar fatos consumidos nem anular medição liquidada sem o encadeamento regular.
- Lista, detalhe e formulário navegáveis; rascunho preservado após recusa; sucesso persistente; histórico e próxima ação compreensíveis.
- Documento M22 com itens, memória, versões, totais e paginação; projeções pública, fiscalização e financeira separadas no servidor, inclusive anexos e PDFs.

Aceite mínimo: ao menos dois itens e duas parcelas; recebimento parcial e controvérsia; saldo acumulado correto; duas medições legítimas no mesmo dia quando permitido; excesso e duplicação recusados pelo motivo certo; concorrência; vínculo/versão incompatíveis; designação revogada; escopo de outra entidade; preservação após aditivo; reversão com dependente; recarga e PDF multipágina. Confira a definição original de ME06 e complete sua lacuna, sem redefini-la para um teste conveniente.

Reutilize a fixture 2.000/1.100/1.000/900/100 e seus significados. Primeira parcela apta permite 900 e aceitação posterior da controvérsia somente mais 100, satisfeitas as condições existentes. Os 100 não executados não se tornam crédito. Valores esperados devem ser independentes do motor testado.

Faça commit local por caminhos exatos após a unidade coerente e continue.

## 5. U8 — agenda de fiscalização e formulários

Responsável: executor A, após U7. Escrita: agenda/ocorrências/formulários do M11 e suas interfaces/testes. Consuma contratos, obras, designações, contexto, calendários, tarefas e documentos existentes; não crie agenda ou workflow paralelo.

Entregue agenda diária, semanal e mensal com horário, duração ou término, local, contrato/obra, responsável e situação. Filtros e seleção precisam funcionar com dados persistidos. Trate datas no calendário do ente, sem offset fixo. Sobreposição só deve ser proibida quando existir regra pertinente; prazo legal não pode ser inventado.

Implemente agendamento, reagendamento motivado, cancelamento e realização. Preserve compromissos e histórico após mudança de designação. Notificações somente internas ou em transporte local de teste.

Tipos de ocorrência configuráveis, ativos/inativos e versionados, com campos obrigatórios, gravidade quando aplicável, encaminhamento e formulários. Formulário preenchido permanece preso à versão usada; alteração posterior não reinterpreta seu conteúdo. Separe evidência da fiscalização, observação interna e conteúdo publicável.

Integre compromisso, fiscalização realizada, ocorrência, responsável e resolução. Estado concluído deve corresponder a ação persistida e requisitos atendidos. Permissões no servidor, incluindo pesquisa, export e URLs diretas.

Aceite: três vistas representam os mesmos compromissos; troca de dia/mês e horário; reagendamento/cancelamento; designação vigente/revogada; setor não autorizado; tipo desativado; histórico após nova versão de formulário; concorrência; anexos/PDF; teclado/foco e 360/768/1366/1440 px. Captura sem overflow não comprova sozinha conteúdo ou usabilidade.

## 6. Experiência nacional e continuidade coordenada

O produto é Gestão Pública, configurável por município e órgão. Não inserir no frontend, notificações ou documentos operacionais textos de rastreabilidade dos TRs, códigos de lote ou alegações de cobertura. Origem documental fica no catálogo e nos documentos internos. Identidade institucional vem da configuração.

Novas licitações ampliam módulos/capacidades existentes, com variações por vigência, jurisdição e contratação. Preserve o texto de cada fonte e diferencie exigência literal, engenharia, regra dependente de fonte e melhoria. Pesquise fontes primárias atuais antes de implementar regra normativa ou contrato de integração; registre versão, ambiente e vigência. Não criar defaults nacionais a partir do contrato de uma prefeitura.

Corrija o problema de formulários que perdem dados nas famílias tocadas por U7/U8; inventarie os outros 59 casos por componente/causa e trate-os em lotes, evitando substituição textual global. Cobre recusa de negócio, erro de campo, versão stale e erro de rede, além do sucesso.

Após U7/U8 utilizáveis e integrados, inicie B1 do plano de orquestração: cadastro imobiliário histórico, vínculos com Pessoa, parâmetros versionados e simulação com memória. Localize primeiro os módulos e fórmulas existentes. Simulação não altera cadastro, constitui dívida ou escreve no ledger. Sem fonte municipal validada, use configuração sintética explícita e resultado esperado independente. A efetivação financeira fica em B2, por contrato próprio com o núcleo existente.

Nas janelas independentes, mantenha tarefas concretas no quadro vigente:

- C: experiência e documentos das famílias de U7/U8 e depois B1, usando M22/molde.
- D: encaminhamento de ouvidoria com sigilo, responsável e histórico pelo M21; tarefa posterior ou alternativa em bloqueio delimitado.
- E: origem de campos, versão oficial e fixtures de integração, somente validação local; nenhum aceite externo presumido.
- F: preparação local de instalação/upgrade/restore e mapa real da habilitação de módulos pelo master engine. Habilitação comercial não substitui permissão de negócio nem concede ao master acesso ao sigilo municipal. Não duplicar o mecanismo existente.

Não abrir novas execuções pesadas só para ocupar essas frentes. Defina responsável e arquivos antes de implementar. Dependência externa isolada não interrompe unidades desbloqueadas.

## 7. Pendências e retorno obrigatório

Preserve explicitamente no checkpoint: ME06; glosa/liberação de saldo; comissão/quórum; OS de material; anulação parcial com várias parcelas; empenho por parcela; retenções na liquidação; prazo de recebimento configurável; portal do fornecedor; assinatura qualificada; exportação XLSX; limites legais de aditivo; reajuste por índice; planilha por digitação; importação acima de 1 MB pela tela; formulários após recusa; antiabuso; restituição; retorno bancário e encaminhamento de ouvidoria. Só encerrar uma pendência mediante prova específica. Não adicionar limites legais inventados para fechar a lista.

Retorne: HEAD e commits locais; resultado por etapa do candidato 8ed0806; U7/U8 e B1 efetivamente implementados; arquivos e migrations/SQL/grants; testes direcionados e motivo da seleção; app_sha/runner_sha; percursos e documentos demonstráveis; caminho dos logs/capturas; catálogo atualizado com evidência; pendências e próximo passo de cada trilha.

Não chamar M2, M11 ou o ecossistema inteiro de completos por aprovação de uma unidade. Não encerrar apenas com "logs lidos", "seção 62 atualizada" ou "rascunho preparado". Continue a construção autorizada até concluir as unidades desta ordem ou identificar um bloqueio material específico.

---

Mensagem que acompanhou o arquivo:

> Execute integralmente o arquivo PROMPT-V7-M2-FECHAMENTO-U7-U8.md no repositório /Users/winnervinicius/Developer/gestao-publica. A cadeia do candidato 8ed0806 já terminou. Comece lendo 00-candidato.txt e os logs por etapa em: .registro-de-execucao/pacote-v7-m2/c-8ed0806/ Não rode novamente a cadeia por padrão. Classifique os resultados, investigue somente as falhas necessárias e preserve as evidências por app_sha e runner_sha. Atualize a seção 62, o resumo do checkpoint, o catálogo com provas e o LEIA-ME sanitizado. Depois continue a construção: U7 — medição da obra pela planilha, aproveitando criticamente o rascunho; U8 — agenda completa, ocorrências e formulários versionados; depois B1 — cadastro imobiliário histórico e simulação tributária. Preserve OS → medição → recebimentos → liquidação. Não refaça U0–U6 nem volte a M1. Durante a construção, use testes direcionados aos riscos alterados. Reserve o portão integral para o candidato integrado, com uma execução pesada por máquina e o trinco existente. Nenhum texto de rastreabilidade dos TRs no frontend. Produto nacional, identidade e regras configuráveis por contexto. Preserve Pessoa, ledger, Decimal, autorização e módulos existentes. Stash e scripts de terceiros intactos. Sem push, deploy ou efeitos externos reais. Não pare após atualizar documentos: prossiga com as unidades implementáveis e apresente resultados utilizáveis e comprovados.
