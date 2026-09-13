# Sessão noturna V4 — corrigir as garantias e avançar as cadeias municipais

Você é o executor no Cursor. Trabalhe no produto **gestao-publica**, preservando sua arquitetura e o trabalho existente.

## 0. Missão, escopo e autonomia

Execute esta fila durante a sessão disponível, sem pedir confirmação ao terminar cada cadastro, teste ou commit. Não encerre com outro plano. Faça alterações reais, verifique as unidades coerentes e prossiga para o próximo trabalho executável.

O objetivo do produto continua sendo o TR inteiro de Anita Garibaldi: 39 módulos, características gerais e obrigações operacionais. A prioridade desta sessão não exclui os demais requisitos nem autoriza declarar toda a suíte pronta.

Esta rodada tem dois resultados centrais:
1. retirar os defeitos que comprometem comandos, cálculo patrimonial e liquidação integrada;
2. produzir avanço verificável fora do patrimônio, na cadeia planejamento/contratação/despesa, seguindo depois para RH/portal do servidor e processo/cidadão.

Não fique aperfeiçoando indefinidamente o acervo depois de fechar os critérios necessários. Não crie outro sistema, outro cadastro canônico de pessoas ou outro ledger.

Autorizados: decisões técnicas locais reversíveis; código; testes; dados sintéticos em bancos isolados; migrations novas ensaiadas em bancos isolados; fetch/leitura das origens já indicadas; documentação técnica oficial; instalação de dependências necessárias com lockfile e inspeção de scripts.

Não autorizados: push, alteração de visibilidade, deploy produtivo, DNS/IAM, pagamento, remessa fiscal ou comunicação real, dados pessoais de produção, eliminação de bancos originais ou ampliação genérica de privilégios.

Em bloqueio externo, registre o componente afetado e prossiga por trabalho independente. Em falha de integridade/autorização, não construa em cima dela; preserve a unidade e corrija, ou avance apenas por uma frente comprovadamente independente.

Não importe para este projeto os lotes, regras clínicas ou identidades de engine-saude.

## 1. Ponto de partida já auditado — não repetir toda a auditoria

Snapshot:
- HEAD: `77cbcc92c569085645025e104b68b8c3882ff0d7`
- base: `dc7032a12c7490781ffbdca6958eb3fbf422fe48`
- stash: `11b7892e7800281f3ef915ee571a967b9383401b`
- pai do stash: `88e4098ad32ae3a73d6c939c4461719c00d99bf7`
- pai de índice: `2e853da491f520599deddc540a8fa344e00c4404`

A auditoria externa conferiu hashes, 31 arquivos, árvores Git, dez commits, bundle, diff e aplicabilidade do stash. Leia `RELATORIO-AUDITORIA.md` e as evidências quando necessárias; não reconstrua novamente todo o pacote para começar a trabalhar.

Confirme o HEAD local. Se já estiver à frente, preserve as alterações e verifique quais itens deste comando já foram corrigidos. Não faça reset, rebase, force checkout, git clean ou substituição de arquivos.

Leia o resumo atual e a seção 44 de ESTADO-EXECUCAO.md. Preserve os scripts soltos fix-*.sh/manter-claude-cursor.sh, que não pertencem ao executor. Não os execute como parte deste lote.

Preserve o stash pelo hash, com referência de segurança e cópia verificável do diff. Use `git stash apply <hash>` ou aplicação do patch em árvore apropriada, após verificar a base e os conflitos. NÃO use `stash pop` como primeiro comando e não elimine o original até concluir a validação.

A aplicação limpa já foi comprovada sobre 77cbcc9. Isso não significa que o código do stash está funcionalmente aprovado.

## 2. Preserve as correções que realmente foram entregues

Não refaça a leitura por ação/escopo:
- `modules/m16-travamento/leitura.ts`;
- `lib/portas/leitura.ts`;
- proteção do dossiê em `lib/portas/empenho.ts`;
- `exigirLeitura(acao)` em `lib/portas/molde.ts`.

Preserve os upgrades versionados de permissões, vínculo explícito usuário–pessoa, roteiros propostos/publicados, banco separado dos percursos, memória de cálculo e etiquetas reais.

O erro de log posterior não deve voltar a transformar um fato concluído em falha de negócio. O registro inicial indisponível deve continuar impedindo o ato; o erro original deve continuar preservado quando falhar a gravação da negação.

Não revogue ou conceda permissões indiscriminadamente para fazer a interface abrir.

## 3. Prioridade imediata — contrato real de comando e idempotência

A auditoria executou o código original com portas em memória e reproduziu:
- dois callbacks em duas chamadas concorrentes idênticas;
- duas execuções de um ato não contábil quando falha seu registro de conclusão;
- três execuções na sequência A → B → A com a mesma chave;
- replay revelando referência anterior antes de revalidar a autorização do comando;
- arquivos distintos com o mesmo fingerprint;
- codificação ambígua do fingerprint por concatenação de separadores.

Esses probes NÃO são a suíte de integração. Transforme os cenários em regressões com a expectativa correta e banco real isolado. Não copie os asserts diagnósticos como se os defeitos fossem resultados desejáveis.

### Contrato que deve valer

Uma chave representa uma intenção imutável no escopo correto: município/entidade quando disponíveis, principal autenticado, ação e identidade de comando. O cliente não pode escolher ou falsificar o escopo.

- mesma chave + mesmo payload autorizado: mesmo resultado, sem novo efeito;
- mesma chave + outro payload: conflito explícito; nova intenção recebe nova chave;
- requisições concorrentes: um único efeito;
- queda antes do commit: não existe sucesso aparente;
- commit concluído e resposta perdida: replay recupera o resultado;
- permissão revogada: não revelar resultado protegido só porque ele já existe;
- falha no log posterior: não repetir o fato nem mentir sobre seu resultado.

Implemente reserva/execução/conclusão de comando com primitiva atômica em PostgreSQL. Reutilize locks/adapters existentes quando adequados. Um find seguido de insert de tentativa não basta. Mutex de processo não cobre duas instâncias.

Armazene o sucesso e a referência estável do resultado na mesma transação do fato, também nos atos não financeiros. Não restrinja a garantia ao funil do ledger. Preserve tipo, identidade e escopo do resultado; não use um ID de lançamento como substituto silencioso do ID do recurso criado.

Não abra uma transação aparente enquanto o serviço usa o Prisma global. Mantenha auditoria de tentativa/negação fora do rollback e o sucesso autoritativo dentro da transação efetiva.

Revalide autorização antes de devolver replay; a sessão válida não substitui ação e escopo. Defina o tratamento de operações pendentes abandonadas sem repetição de efeitos já confirmados.

O fingerprint deve usar representação canônica sem ambiguidades. Preserve ordem de arrays/campos repetidos quando semântica. Inclua digest dos arquivos ou de seus objetos imutáveis verificados, com limites de tamanho. Não serialize segredos em logs.

Todos os formulários financeiros e as actions alcançáveis devem cumprir o contrato. Faça um inventário derivado de chamadores, não outra lista manual de funções. Ausência de chave em uma mutação protegida precisa de tratamento explícito; não significar silenciosamente “sem garantia”.

Verificações mínimas: duas conexões concorrentes, perda da resposta após commit, falha de log em ato não financeiro, A/B/A, arquivo alterado, mesmo comando em escopos distintos, revogação, repetição legítima após erro sem commit. Mostre fatos e auditoria persistidos, não somente códigos HTTP.

## 4. Corrigir a competência patrimonial antes de ampliar seu uso

### 4.1 Recorte temporal e vigência

Hoje `preverCompetencia` consulta todos os movimentos da classe sem limitar a data e `parametroVigente` escolhe a maior versão sem receber competência.

Defina e implemente:
- data de negócio versus instante de registro;
- início de depreciação do bem;
- vigência do parâmetro para a competência pedida;
- conjunto de movimentos que compõem a base naquele corte;
- comportamento de alterações retroativas e reprocessamento autorizado;
- rastreabilidade de parâmetros e dados usados.

Teste março aberto com entrada em abril e parâmetro novo vigente em maio. Março não deve mudar silenciosamente por esses fatos. Uma correção retroativa autorizada é outro fluxo, com prévia de impacto e histórico.

Não fixe vidas úteis, percentuais ou contas por palpite. Use parametrização validada e fontes técnicas oficiais quando exigidas.

### 4.2 Bem, classe e razão

A atualização atual gera movimento apenas por classe, enquanto o valor do bem lê apenas movimentos com bemId. Conclua o detalhamento por bem elegível e a conciliação de seus valores com a classe e o ledger.

Escolha uma única origem dos valores:
- itens de cálculo por bem;
- agregação por classe/conta;
- lançamento contábil correspondente;
- memória por item e por execução.

Não contabilize os itens e novamente o agregado. Preserve a precisão dos cálculos e a política explícita de arredondamento; não substitua Decimal por number.

Não distribua lançamentos antigos sem bemId por proporção arbitrária para “fechar”. Registre necessidade de reconciliação histórica, com fluxo autorizado e sem reescrever o ledger.

Teste N>=2, bens com inícios diferentes, bem ainda não elegível, residual, reavaliação, baixa e total dos itens igual ao total contábil correspondente.

### 4.3 Virada e estorno

Implemente identidade de execução mensal com escopo explícito e itens relacionados. A tela deve dizer se processa um bem, uma classe ou toda a seleção autorizada.

Estorno de uma competência de classe não deve ser declarado automaticamente como estorno de toda a virada. Faça a análise do conjunto selecionado, das dependências e do resultado esperado, e revalide dentro da transação.

A regra atual de dependência por tipos de movimentos posteriores da classe é conservadora. Não a descreva como “quem ficaria inválido” sem verificar o impacto. Teste um movimento de outro bem que permanece válido, a dependência real e eventos com mesmo timestamp. Use desempate estável.

Não enfraqueça o bloqueio para fazer um cenário passar. Diferencie invalidade real, política conservadora declarada e documento que só informa evento posterior.

## 5. Documentos patrimoniais estáveis

`termo-documento.ts` usa nome, localização e valores atuais sob a data do termo antigo. O rodapé explica isso, mas o resultado não é uma segunda via estável.

Separe:
- documento emitido/segunda via, com dados e modelo preservados;
- posição patrimonial atual, com data própria;
- artefato assinado, preservado e verificável.

Não deixe para um futuro upload de documento assinado a responsabilidade de congelar a emissão. Aproveite o módulo de documentos/anexos já existente.

Teste emissão → alteração posterior do bem/pessoa/modelo → reimpressão. O original não muda; a posição atual reflete a alteração como outro documento.

Nos termos, cubra os recortes individual, setorial e por responsável conforme o aceite do requisito. Confira os itens e textos no PDF, não apenas HTTP 200/tamanho mínimo. Preserve autorização no download.

Mantenha as etiquetas Code 128, a reimpressão e o teste por decodificador independente. Não volte ao “botão que só registra código”.

## 6. Concluir o stash de liquidação de material com semântica correta

Recupere a unidade da seção 44, mas NÃO adote sem revisão a premissa “sem ClasseDeMaterial cadastrada, não há estoque a integrar”.

A natureza do item/operação e a completude de sua parametrização são perguntas diferentes. Cadastro de classe ausente não pode desligar a obrigação de integração.

Mantenha o ato composto da interface, com fatos identificáveis:
documento recebido, recebimento/atesto, liquidação, entrada financeira de estoque e movimento físico correspondente.

Não duplique recebimento que já existe. Permita relacioná-lo ou produzi-lo no ato, conforme o fluxo real. Garanta identidade e consumo dos quantitativos/valores ainda disponíveis.

Valide:
- itens e natureza da operação;
- classe de material e conta correspondente;
- produto, unidade, quantidade e depósito;
- valor unitário e total, com precisão adequada;
- parcelas sem estoque em documentos mistos;
- valor alocado ao estoque versus a perna de estoque do lançamento;
- recebimentos/liquidações parciais;
- ausência de configuração obrigatória;
- anulação e seus efeitos relacionados.

Se o desenho atual só suporta liquidações integralmente materiais, declare e imponha essa restrição provisória. Não exija que estoque some o bruto de uma operação mista nem ignore parcelas recebidas.

Não escolha o gatilho somente para manter fixtures antigas verdes. As fixtures devem representar operações de negócio válidas.

Conclua os testes restantes nomeados na seção 44, a UI das entradas e os consumidores M05/M10/M11/M16. O conjunto alcança muitos caminhos: execute uma regressão ampliada dos consumidores antes de considerar essa mudança pronta. Esta é uma exceção justificada ao uso habitual de testes pequenos, não motivo para rodar tudo após cada edição.

Mantenha o stash de segurança até verificar o resultado. Atualize sua situação como trabalho incorporado ou ainda pendente.

## 7. Compatibilidade cadastral e evidência confiável

### CNPJ

A normalização atual remove letras do CNPJ. Corrija a cadeia completa:
normalização, DV, máscaras, persistência, constraints, documentos, filtros, FKs lógicas, importadores e integrações.

Preserve CPF numérico e CNPJ numérico. Use o manual e os arquivos de referência da Receita, não um validador encontrado ao acaso.

Fontes autorizadas:
https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/documentos-tecnicos/cnpj
https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/julho/receita-federal-gera-o-primeiro-cnpj-em-formato-alfanumerico

Não associe automaticamente usuário humano a pessoa jurídica como se CNPJ fosse uma identidade pessoal. Representação de uma organização precisa de vínculo explícito e escopo. Não conceda permissão ao associar um documento.

### Catálogo

Atualize o catálogo existente, não crie um segundo catálogo de status.

Revise 5.19.14, 5.19.36 e 5.19.39 à luz das evidências e da redação integral. Quando houver parte obrigatória faltante, use PARCIAL. Não apague as ressalvas nem promova toda a cláusula por um único caminho feliz.

Preencha rota_verificada e vincule critérios a:
papel, contexto, passos, entrada, resultado esperado, resultado obtido, versão do código e artefato/teste. Uma rota dinâmica deve indicar seu padrão e como obter um alvo autorizado.

As 57 marcações locais e as 317 cláusulas classificadas não são um percentual de produto pronto. Em fonte de infraestrutura, use evidência de infraestrutura, não invente tela para atender ao campo de rota.

## 8. Expandir a suíte por trabalho municipal completo

Após estabilizar as garantias necessárias, SAIA do foco exclusivo em patrimônio.

### Fila A — Planejamento e contratação até o documento fiscal recebido

Reconcilie seletivamente a origem `siafic-cg` em `c04ad5a760dfbce977ef7f28db7e42ee49d85761`:
m02b-plurianual, m22-rh, convênios e contrato/reserva/empenho.
Não recopie a estrutura inteira nem substitua os avanços atuais.

Implemente o percurso:
1. entrar como planejador;
2. cadastrar/revisar PPA, LDO e LOA, programa, ação, metas e dotação, conforme os campos reais do TR;
3. registrar intenção/plano anual de contratação e solicitação;
4. pesquisar preços e formar processo com itens;
5. executar os atos aplicáveis da licitação, adjudicação e homologação;
6. formalizar contrato/ata quando aplicável;
7. reservar/empenhar com vínculos e validações;
8. cadastrar/importar a nota recebida, conferir fornecedor, itens, valores, duplicidade e anexos;
9. receber/atestar e liquidar conforme a cadeia integrada;
10. registrar pagamento administrativo e conferir saldos, retenções, documentos e razão.

Não imponha contrato a despesas que legitimamente não o tenham.
Diferencie registro de pagamento administrativo de transmissão/aceite bancário.

“Planos” aqui inclui planejamento público e plano anual de contratações. Não substitua essas telas por planos comerciais de assinatura SaaS.

### Fila B — RH e portal do servidor

Reutilize o RH da origem e caracterize o motor do saas-municipal antes de ampliar. Integre à Pessoa canônica, sem duplicar identidade e histórico.

Entregue uma fatia efetiva:
pessoa → vínculo/matrícula → cargo/lotação → eventos → cálculo detalhado →
conferência/fechamento → reflexo contábil pertinente → comprovante →
login do servidor → consulta exclusivamente dos próprios dados.

Trate folha importada, folha calculada e evento aceito no eSocial como estados diferentes.
Um holerite de teste não representa homologação do eSocial.
Não limite artificialmente a prova a folha sem vínculos ou rubricas.

### Fila C — Processo digital e portal do cidadão/fornecedor

Reutilize protocolo, documentos e comunicação:
solicitação → anexos → encaminhamento → decisão → notificação →
consulta autenticada do requerente.

Inclua ao menos um serviço real conectado à retaguarda.
Portal não é somente link para tela interna.
Fornecedor consulta apenas documentos/valores no escopo de sua representação.

Nota fiscal recebida da prefeitura NÃO é o emissor de NFS-e do contribuinte.
Mantenha o módulo NFS-e/ADN como frente própria com seus contratos oficiais.

### Demais frentes

Tributário, fiscalizações, frota, SST/ponto/recrutamento/treinamento, jurídico,
website/transparência, serviços públicos, cemitérios, agricultura, farmácia,
aplicativos e obrigações de operação permanecem no programa completo.

Na sessão disponível, avance pela próxima dependência executável, sem lançar
dezenas de telas vazias para parecer que todas as frentes foram entregues.
Não apresente a fatia demonstrada como conformidade integral dos 39 módulos.

## 9. Demonstração e arquitetura que não podem ser simuladas

Mantenha o monólito modular, Prisma, Decimal e o ledger append-only.
Mantenha a decisão de schema por município, sem declarar sua implementação pronta
por existir um ADR.

Uma UO não comprova por si só toda a separação Prefeitura/Câmara/Fundo.
Ao usar múltiplas entidades, valide documento, numeração, permissões, patrimônio,
contas, relatórios e consolidação; use estruturas reais, não somente rótulos.

Não habilite um segundo município sem testar o isolamento efetivo em conexão,
pool, SQL, storage, jobs e caches. Ausência dessa capacidade fica registrada.

Prepare usuários sintéticos por função: planejamento, compras, fiscal,
contabilidade, tesouraria, RH, servidor, fornecedor, cidadão e auditor.
Não use um administrador universal como prova de todos os percursos.

A massa pode ser semeada em banco isolado. Não pode ser sucesso pré-fabricado:
altere valores, insira um novo registro pela tela, provoque uma recusa,
recarregue e confira os fatos persistidos.

Nenhum número de cláusula, ENT, selo de atendimento ou percentual do TR na UI,
nos PDFs, nas notificações, nos atributos acessíveis ou nas rotas operacionais.
Preserve números reais de processos, contratos, leis e documentos de negócio.

Pode haver identificação clara de ambiente de testes e de integração simulada.
Remover menção ao TR não autoriza esconder que uma resposta externa é simulada.

Não force a mesma tela-molde sobre fluxos complexos. Reutilize a biblioteca,
mas implemente componentes transacionais próprios quando necessário.
Busca/paginação para seletores volumosos, nomes legíveis e nenhum UUID digitado
pelo operador como substituto de consulta.

## 10. Testes sem paralisar a construção

Não comece rodando o portão integral.
Não rode suíte completa, build e navegador competindo pela mesma máquina.
Não edite a árvore sob uma validação em andamento.

Trabalhe por unidades coerentes:
- typechecks afetados;
- testes do domínio alterado;
- autorização positiva/negativa;
- persistência, recarga e documentos do percurso correspondente.

Mudanças de dinheiro, período, estoque, comando e permissões exigem testes de
integração adequados. A liquidação composta exige regressão ampliada pelo alcance.
Não adie esses testes para depois de construir seus consumidores.

Use worktree/snapshot de validação fixado em commit, com banco e artefatos próprios,
ou congele a árvore temporariamente. Registre versão antes e depois.
Reutilize os scripts de isolamento/trinco existentes.

Gere um `next build` e rode os percursos centrais com `next start` em ambiente local
de teste assim que houver uma unidade estável. Investigue o 500 original; não o
descarte como defeito do parser de stack sem confirmar sua causa.

Não trate a ausência de revalidatePath como regra. Preserve resposta do formulário
e atualize corretamente listagens, saldos, detalhes e histórico, considerando
caches e a versão instalada do Next.js.

Portão integral permanece no candidato de homologação/implantação. Não prometê-lo
verde sem executá-lo. Se uma falha ambiental for delimitada, registre-a e continue
somente atividades independentes. Não aumentar timeout, remover assert ou pular
teste para fazer desaparecer um problema.

Para migrations, ensaie instalação limpa e atualização de uma base anterior
isolada. Confira schema e histórico/checksums. “migrate diff vazio” não é prova
de que todo histórico está correto. Não altere migration já compartilhada.
Uma alteração de constraint e uma eliminação de dados não são o mesmo risco:
justifique a operação real, sem usar “zero DROP” como único critério.

## 11. Critério de continuidade e conclusão

A cada unidade:
- commit local coerente;
- comportamento utilizável e rota;
- testes executados e resultados reais;
- pendência delimitada;
- próxima tarefa já definida.

Não peça revisão a cada item desta fila. Continue até o limite da sessão,
uma conclusão coerente ou um bloqueio que realmente exija decisão externa.
Não faça loops de diagnóstico indefinidos; isole o bloqueio e siga por uma
frente independente quando seguro.

Não há autorização para “corrigir as expectativas dos testes” sem demonstrar
por que a regra anterior estava errada. Defina o resultado esperado antes
de alterar a implementação e mantenha as regressões pertinentes.

Ao terminar, entregue:
1. HEAD e commits;
2. achados A01–A09 corrigidos, parciais ou ainda abertos, com evidência;
3. situação exata do stash;
4. o que já se consegue executar por papel e rota;
5. cadeias completas e etapas ainda não demonstráveis;
6. testes realizados, testes não executados e estado do build;
7. catálogo atualizado por natureza, sem percentual fictício;
8. checkpoint curto no início de ESTADO-EXECUCAO.md;
9. pacote incremental de auditoria em diretório ignorado, sem segredos,
   sem bancos reais e sem push.

Preserve logs de execução sanitizados vinculados ao SHA. O próximo snapshot deve
trazer a evidência necessária, não apenas repetir contagens em prosa.

COMECE pela confirmação da base e pelo contrato de comando. Conclua as correções
necessárias, integre a liquidação e avance para a cadeia de contratação. Não volte
à ENT00 e não encerre esta sessão apenas com o relatório de que leu o comando.
