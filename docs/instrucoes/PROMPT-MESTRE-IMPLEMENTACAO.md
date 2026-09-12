# Prompt mestre - evolução integrada da Gestão Pública

## 1. Missão e autorização

Atue como engenheiro responsável pela evolução de um produto existente de gestão pública municipal. Analise o código local, preserve o que funciona, implemente as lacunas e teste cada entrega. O objetivo é um produto único, reutilizável para vários municípios, com todos os blocos funcionais do documento de origem, não um demonstrador de menus.

Fontes locais informadas:
- `/Users/winnervinicius/Developer/siafic-cg`
- `/Users/winnervinicius/Developer/saas-municipal`

Destino proposto: `/Users/winnervinicius/Developer/gestao-publica`.

Estes caminhos vieram do handoff; confirme-os no disco. A inexistência de um caminho não autoriza inventar o código, recriar a base a partir desta descrição ou trabalhar em outra pasta por semelhança de nome.

Esta autorização abrange código local em cópia de trabalho, testes e infraestrutura de desenvolvimento isolada. Não abrange publicar dados, apagar bancos existentes, transmitir documentos fiscais reais, pagar valores, enviar mensagens externas, fazer push público, contratar serviços nem efetuar deploy de produção. Não é necessário pedir confirmação para cada lote local aprovado pelos gates.

Comece executando o prompt 00. Depois de seu gate, execute o prompt 01. Não tente implementar os 39 módulos de uma vez. Em cada sessão encerre um lote verificável e deixe um checkpoint utilizável para a continuação.

## 2. Hierarquia de evidências

1. Código, banco isolado e testes efetivamente inspecionados/executados na máquina comprovam o estado das repos, dentro de seus limites.
2. O `Termo_de_referencia.pdf` comprova a exigência contratual descrita, não a existência de código.
3. O contexto anexado é um relato técnico: vários componentes do SIAFIC foram chamados de completos sem execução de testes.
4. Os mapas e análises anteriores trazem propostas, inferências e classificações heurísticas, não cobertura validada.
5. Regra normativa ou contrato externo depende de documento oficial, versão, ambiente e vigência. Não inventar taxas, layouts, endpoints ou prazos com base em memória.

Se houver divergência, registre o que cada fonte diz e a consequencia. Não corrija silenciosamente o documento, não elimine requisitos e não marque atendimento por aproximação. Ter `@req`, pasta, tela ou resposta HTTP 200 não comprova que uma funcionalidade funciona.

O estado do certame e eventual prazo de contrato não foram confirmados. Prossiga no desenvolvimento local, mas não alegue prazo contratual correndo, data de POC ou compromisso de entrega global. Esses dados podem alterar prioridade, não bloqueiam backup, testes, arquitetura e o primeiro incremento.

## 3. Decisão arquitetural de partida

### 3.1 Base autoritativa

Preserve o `siafic-cg` como origem do núcleo contábil e financeiro: domínio puro, ports/adapters, Prisma, representação monetária Decimal, ledger append-only, regras de estorno, relatórios legais e testes de caracterização. Reaproveite os módulos existentes antes de redesenhar APIs ou mover pastas.

Use o `saas-municipal` como doador seletivo, não como segundo backend operacional para os mesmos fatos. Avalie componentes puros de folha, fixtures, autenticação, RBAC, jobs e progresso. Não proíba o reaproveitamento de código puro apenas porque os ORMs diferem; tampouco copie adapters Drizzle para o núcleo Prisma sem adaptação.

Não chamar a folha de completa: UI, folhas suplementares e transmissão real aparecem como pendentes no handoff. A rotina contábil de dívida ativa no M10 não equivale a toda a cobrança municipal. M16 não equivale a controle interno administrativo. M12 não equivale ao designer de relatórios. Banco do Brasil não equivale a todos os convênios bancários.

### 3.2 Estrutura e ferramentas

Um repositório único, com fronteiras modulares e um backend autoritativo para os fatos financeiros. Inicialmente pode manter `app/`, `modules/`, `packages/`, `prisma/` e os caminhos do SIAFIC. Workers, portais públicos e apps móveis podem ganhar processos/apps separados quando seus contratos estiverem definidos.

Não impor troca para pnpm, Turborepo, Fastify ou outra versão do Next na mesma mudança de negócio. Primeiro valide os manifests e lockfiles. Preserve a instalação reproduzível do SIAFIC na cópia. Adote tooling de monorepo depois, em commit separado, somente sé necessário e com regressão completa.

Na base final, uma cadeia de escrita contábil não pode depender de duas transações independentes, uma Prisma e outra Drizzle. A integração de folha/tributos ao ledger deve usar contratos de domínio e a unidade transacional definida pelo núcleo.

### 3.3 Modelo municipal e isolamento

Proposta alvo: banco relacional compartilhado com `tenant_id` para município/cliente, `entidade_id` para unidade gestora e exercício nos registros que o exigem. Aplicar políticas de isolamento de linhas como defesa adicional, com autorização de usuário/setor/registro acima delas.

Essa é uma decisão de engenharia, não uma imposição literal do TR. Schema por município também pode consolidar Prefeitura, Câmara e FMS se as três estiverem no mesmo schema. Não use o argumento falso de que consolidação, sozinha, obriga RLS.

Antes de uma migração ampla, faça uma prova no adapter e uma analise do impacto sobre M01/M05/M12, SQL manual e consultas agregadas. Se a prova indicar uma incompatibilidade material, registre ADR comparativa e proponha a menor mudança que preserve isolamento e invariantes. Não contorne uma falha com um tenant fixo ou acesso global.

Regras obrigatórias da implementação:
- A identidade do tenant deve ser resolvida no servidor a partir de origem/membership confiável. URL, cabeçalho ou formulário não conferem permissão.
- Verificar entidade autorizada e exercício por requisição; trocar contexto não modifica registros anteriores nem reabre períodos.
- Considerar concorrência entre duas abas: a preferência de última entidade pode ser global, mas cada comando deve carregar seu contexto validado e versão, sem depender cegamente de uma sessão mutável.
- Unicidades e FKs devem incluir o escopo correto. Não impor CPF único entre municípios. Dentro de cada município, uma pessoa pode ter vários papéis.
- Testar duas municipalidades, três entidades em uma delas e pelo menos dois exercícios. Não disponibilizar tenant novo enquanto houver caminhos não isolados.
- Usar papel de aplicação sem superuser, sem `BYPASSRLS`, sem propriedade indiscriminada das tabelas e sem permissão DDL. Definir política default-deny, `USING` e `WITH CHECK`, e verificar a necessidade de `FORCE ROW LEVEL SECURITY`.
- Em pool, contexto de banco deve durar a transação/requisição correta. Não usar `SET` de sessão que sobreviva e contamine o próximo usuário; comprovar limpeza/contextualização.
- Jobs, caches, anexos, exportações, WebSocket e buscas também devem carregar isolamento. Não testar apenas GET de uma tabela.
- Tabelas federais compartilhadas e control plane devem ser explicitamente classificadas como globais, sem misturar dados pessoais.

Dados antigos de Campina Grande/PB ou Santa Izabel/PR não podem ser rebatizados como Anita Garibaldi/SC. Mapeamentos de migração devem preservar origem e ter dono confirmado. Para o ledger existente, não desabilitar a imutabilidade para fazer backfill arbitrário: avaliar mapeamento de propriedade ou migração controlada para estrutura nova, preservando payload, IDs, hashes e reconciliação.

## 4. Invariantes que não podem regredir

### Dinheiro e cálculos

Não usar ponto flutuante nativo para valores monetários de domínio. Preservar `Decimal` e os helpers reais encontrados no núcleo. APIs transportam decimais como strings; converter para apresentação não autoriza calcular com `number`.

Distinguir valor contábil final, preço unitário, quantidade e alíquota. Precisão intermediária e arredondamento devem ser explicitados por regra, não truncados globalmente em duas casas. Reusar resultados da folha antiga como evidência de regressão, mas validar separadamente a correção normativa; uma golden fixture não transforma fórmula errada em regra legal.

### Ledger

Lançar fatos com pernas de débito ou crédito por conta; verificar balanceamento por subsistema, não apenas total geral. Validar classificação da conta pelo plano aplicável. Não criar conta PCASP ficticia para fazer teste passar.

Lançamento original e auditoria protegidos contra UPDATE/DELETE pelo papel da aplicação. Estorno e novo fato referenciado. Não adicionar `estornadoPorId` no lançamento imutável nem sobrescrever perna com valor padrão.

Em pagamento com retenção, caixa e bruto podem ser diferentes. Estorno deve preservar/inverter cada perna conforme o fato, respeitar saldo reversivel e dependências. Não assumir que existe apenas um estorno quando o produto precisa de estornos parciais. Não confundir registro de estorno contábil com devolução bancária efetivada.

### Transações e concorrência

Fato de negócio, lançamento contábil, auditoria e registro de outbox, quando aplicáveis, devem ser confirmados ou revertidos juntos no banco autoritativo. Interfaces de domínio permanecem livres de I/O; a unidade de trabalho passa o mesmo contexto transacional aos adapters.

Não deixar requisições de banco, HSM ou tribunal dentro de uma transação longa. Reserve e registre a intenção com integridade; efetive o efeito externo por adaptador e contabilize/atualize o fato correto conforme seu retorno. O registro interno não pode fingir que o efeito externo ocorreu.

Travar saldo e período de forma atomica; testar duas operações simultâneas, tentativas duplicadas e falha antes/depois do commit. Reprocessamento não pode duplicar fato contábil. Chaves de idempotência precisam incluir o escopo correto, tipo de operação e origem, conforme o contrato.

### Encerramentos e SQL

Toda escrita financeira deve respeitar período aberto. Não implementar o guard apenas na tela. Preservar validações de fonte/destinação, disponibilidade, ordem cronológica e encerramento existentes que forem confirmadas.

Aplicar e verificar tanto migrations Prisma quanto SQL manual. Não considerar banco pronto apenas por `migrate deploy`. Não apagar ou reescrever migrations ja aplicadas; evoluir de forma aditiva com plano de reversão. Testes destrutivos apenas em bancos descartaveis e segregados.

## 5. Telas, campos, ações e rotas

Antes de implementar cada lote, preencher um contrato por funcionalidade com origem exata, ator, contexto, tela/rota, campos e condições, filtros, ações, estados, efeitos, documentos, integrações e testes. Utilize `especificacoes/CONTRATO-FUNCIONALIDADE.json` como formato, não como implementação.

Listagens podem compartilhar componentes de filtros, colunas, seleção, exportação e paginação. Formulários podem compartilhar campos adicionais, anexos, timeline e relacionados. Mas conciliação, lançamento contábil, liquidação, licitação, simulação tributária, folha e dispensação exigem comportamento de domínio próprio.

Não transformar milhares de cláusulas em uma tabela genérica com campo JSON e CRUD. Não mostrar ações falsas, botão sem handler, link `#`, contador estatico, toast de sucesso sem persistência ou tela cuja única prova e um seed.

Padrão proposto de navegação: `/gestao/{entidade}/{exercicio}/{dominio}/{recurso}`; tenant resolvido pelo contexto autorizado. Preservar rotas existentes por mapeamento/redirect quando necessário. APIs e server actions podem coexistir, mas devem chamar o mesmo caso de uso autorizado. GET não produz transição de estado.

Ações como estornar, cancelar, assinar, liberar, calcular ou transferir são comandos de negócio. Implementar permissões por ação no servidor, validação de estado, motivo, confirmação de impacto e retorno consistente. Exclusão física não deve ser o comportamento genérico para registros efetivados.

Para campos não especificados pela fonte: marque a definição como proposta e explicite por que e necessária. Não torne opcional um campo exigido, nem obrigatório um campo sem fundamento apenas para facilitar a modelagem.

## 6. Nenhuma referência de conformidade na interface

Não exibir `@req`, números de cláusula como rotulo de atendimento, selos de TR, porcentagens de POC, nomes de tarefas ou IDs do catálogo em menus, títulos, mensagens, tooltips, atributos acessíveis, PDFs operacionais, notificações ou rotas. Referências de implementação apenas em comentários internos.

Não apagar vocabulario legitimo: **Edital**, **Licitação**, **Pregão**, **Contrato** e documento de termo de referência de uma compra fazem parte do sistema. Não proibir a string `TR` globalmente: isso também pode atingir HTML `<tr>`, siglas e registros válidos.

O gate deve avaliar texto realmente renderizado, strings de interface/i18n e saídas documentais, distinguir contexto de conformidade de conteúdo de negócio e manter casos positivos/negativos. Comentários de rastreio, mapas e documentos internos não devem ir para `public/` ou bundles publicados; não publicar source maps contendo comentários internos.

Exemplo de comentário interno permitido:

```ts
/** @req 5.10.1.15 - conferir a clausula antes de implementar o estorno. */
```

A presença desse comentário não autoriza marcar o requisito como atendido.

## 7. Componentes compartilhados e entregas

Entregar a fundação mínima necessária para a próxima cadeia completa; não esperar construir um kernel abstrato perfeito. Implementar componentes compartilhados com uso real e teste de integração desde o primeiro incremento.

| Frente | Escopo | Dependências/ordem |
|---|---|---|
| ENT00 | Preservação, ambiente, baselines, evidência e inventário local | Primeiro gate obrigatório. |
| ENT01 | Contexto, identidade, isolamento, autoria, primeiro fluxo contábil navegavel | Antes de ativar vários municípios. |
| ENT02 | Pessoas/papéis, formulários, anexos, documentos, relatórios configuráveis, assinatura, notificações, protocolo/comunicações, ajuda e suporte | Implantar capacidades em cortes verticais; iniciar cedo. |
| ENT03 | Planejamento, contabilidade, tesouraria, conciliação, encerramentos, demonstrativos e controle interno | Reusar M01-M14 confirmados; completar lacunas do documento. |
| ENT04 | Folha, eSocial, ponto, SST, recrutamento, treinamento, avaliações funcionais | Portar folha com caracterização e memória de cálculo; integrar ao núcleo. |
| ENT05 | Compras, licitações, contratos, fiscalização, estoque, patrimônio, frota | Uma cadeia de recebimento e efeitos financeiros, não cópias de cadastros. |
| ENT06 | Arrecadação, imobiliário/IPTU, econômico/ISS, ITBI, taxas, dívida ativa | Motor parametrizado, vigência, memória e conciliação. |
| ENT07 | Escrita fiscal, NFS-e/ADN, Simples, malha, domicílio, fiscalização fazendária | Trabalhar conectores e dados junto das operações. |
| ENT08 | Procuradoria, intimações, prazos e peticionamento | Processo/documentos e dívida ativa; contrato TJ efetivamente confirmado. |
| ENT09 | Institucional, transparência, autoatendimento e aplicativos | Nasce em fatias com cada domínio, não apenas ao final. |
| ENT10 | Serviços públicos, cemitérios, agricultura, farmácia, urbanismo/REDESIM e retaguarda sanitária | Depende das fundações; preserva peculiaridades de cada área. |
| ENT11 | Migração completa, desempenho, acessibilidade, operação, recuperação, homologações e entrega | Hardening contínuo; aceite final separado da evidência local. |

Essa tabela e de frentes de entrega, não uma autorização para deixar integrações na última fase. O mapa dos 39 blocos indica sua frente principal, mas não elimina dependências ou tarefas nos canais.

Não esquecer capacidades sem módulo numerado próprio: suporte/chamados e satisfação; direitos do titular; desempenho/estágio probatório; retaguarda de vigilância sanitária indicada no portal; HSM; exportação integral; treinamento; migração e infraestrutura.

## 8. Relatórios, fórmulas, documentos e segurança

Preservar cálculos dos relatórios legais existentes. Construir separadamente o designer configurável: copiar sem destruir modelo, visibilidade autorizada, versionamento, distribuição entre entidades, campos calculados, elementos gráficos e geração em segundo plano. O módulo M12 não prova sozinho todos esses recursos.

Fórmulas configuráveis: gramatica segura, funções permitidas, limites de execução, Decimal, versão/vigência e memória dos parâmetros. Não usar `eval`, SQL arbitrário nem conceder acesso irrestrito ao banco ao usuário que edita um relatório.

Anexos: autorização de leitura/escrita por registro, limite de tamanho, tipo validado, integridade, referências e retenção; evitar exposição por URL pública. Um documento assinado deve manter versão original e assinatura verificável. Hash de arquivo, imagem de assinatura e checkbox não equivalem a assinatura criptográfica.

HSM e um requisito de custódia a provar com integração real. Não afirmar que armazenar um A1 criptografado no banco ou adicionar um serviço KMS satisfaz automaticamente esse requisito. Isolar o adaptador e permitir outros trabalhos enquanto o provedor não estiver definido.

Separar dados clínicos, tributários, funcionais e processos sigilosos das projecoes públicas. Permissão de gestor não significa acesso irrestrito a prontuário. Exportações e documentos públicos devem passar por regras explícitas de minimizacao e autorização.

## 9. Integrações e versões

Iniciar uma lista de dependências externas durante ENT00: órgão, funcionalidade, documento oficial, versão, ambiente, credencial, convênio, protocolo, restrições e próxima ação. Uma dependência bloqueia o que depende dela, não todo o projeto.

Não adaptar SAGRES apenas trocando o nome para e-Sfinge. Preservar os adapters PB/BA/PR como histórico/produto quando existirem, e criar o conector SC contra o contrato de SC.

Não assumir TJSC = PJe/MNI. A documentação oficial consultada trata eproc para procuradorias; o contrato de integração, credenciamento e endpoints ainda precisa ser confirmado. Não substituir essa lacuna por scraping ou por retorno simulado apresentado como protocolo.

NFS-e/ADN/IBS/CBS: obter manuais e esquemas oficiais do ambiente e registrar vigência. Não copiar datas/alíquotas de artigos das análises como constantes de produção. O catálogo oficial de produção e referência de descoberta, não comprovação de que a integração ja funciona.

Separar estados, por exemplo: `PENDENTE_CONFIGURACAO`, `VALIDADO_LOCALMENTE`, `AGUARDANDO_ENVIO`, `ENVIADO`, `PROCESSANDO`, `ACEITO`, `REJEITADO`, `ERRO_TRANSPORTE`. Modelos reais dos adapters prevalecem quando mais precisos. `ACEITO` exige o retorno correspondente. Timeout não prova rejeição nem autoriza retransmitir sem verificar duplicidade.

Ambientes de teste/simulação devem ser identificados de forma operacional, sem menção a TR. Nunca mostrar comprovante externo fabricado, saldo bancário inventado ou nota fiscal ficticia em produção.

## 10. Matriz e definição de concluído

Conservar o texto fonte e seus localizadores. `catalogo-execucao.json` possui 2.037 cláusulas; `condicoes-operacionais-e-contexto.json` preserva as demais condições. Desdobrar cada cláusula em critérios atomicos quando entrar no lote. Os critérios filhos não alteram retroativamente o número de itens do documento.

Separar os estados de descoberta, código, teste, interface, integração externa e atendimento. Distinguir `NAO_VERIFICADO`, `AUSENTE_CONFIRMADO`, `PARCIAL`, `IMPLEMENTADO_NAO_VALIDADO`, `VALIDADO_LOCALMENTE` e `DEPENDENCIA_EXTERNA`. Não converter uma heuristica em ausência confirmada.

Um critério somente fica validado com origem, arquivos reais, cenário e resultado, comando executado, ambiente, data e commit/hash. Para exigir integração externa, acrescentar evidência correspondente. Um critério sem código pode ser atendido por documento/infraestrutura quando essa for a natureza da exigência; não inventar tela para evidenciar backup.

DoD do lote: persistência real, autorização no servidor, validações, estados, efeitos contábeis/financeiros, concorrência/idempotência pertinentes, auditoria, UI utilizável, relatórios/documentos quando exigidos e testes aprovados. Sem testes vazios, `skip` para ocultar falha ou redução de assertions para ficar verde.

Sem porcentagens globais de POC baseadas em linhas com comentário. A meta do produto e 100% do escopo. A regra documental de 90% por aplicativo e 100% das características gerais permanece distinta, com interpretação formal a confirmar.

## 11. Encerramento e continuação

Em cada entrega informar: arquivos alterados; o que passou a funcionar; como navegar; dados de teste sem segredos; testes/comandos/resultados; migrações; pendências reais; invariantes verificadas; evidência e próximo lote. Registrar em arquivo interno `ESTADO-EXECUCAO.md` a versão do código, o último gate e a próxima tarefa.

Não usar somente número de arquivos ou de testes como prova. Mostre pelo menos uma cadeia de negócio com os registros e saldos que ela produziu. Falhas de ambiente e dependências ausentes devem aparecer como tais, não como sucesso ou erro de negócio.

Se a sessão terminar, deixe o código e a matriz no estado real. Não recomece uma arquitetura nova na sessão seguinte. Leia o checkpoint e o manifesto do módulo alvo, mantendo os contratos compartilhados e a regressão das dependências afetadas.
