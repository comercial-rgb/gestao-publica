# Ordem V11 — motores, jornadas completas e implantação AWS

Projeto: **gestao-publica**. Executor: Cursor/Code no Mac. Orquestração: Astra. Operador: Winner. Preparada em 16/09/2026.

## 1. Execute esta continuação

Execute autonomamente esta ordem na mesma repo. Entregue incrementos utilizáveis de RH/folha, eSocial, contabilidade, receitas/despesas e atendimento, preservando o caminho OS → medição → recebimentos → liquidação. Prepare e, estando satisfeitas as condições abaixo, instale a demonstração AWS autorizada, deixando os registros reais para Winner incluir na GoDaddy.

**Não inicie `npm run portao`, `test:tudo`, suíte completa ou fuso completo nesta rodada.** Esta instrução do usuário substitui a exigência desses gates nas ordens V9/V10 para esta execução. Registre a mudança de estratégia; não altere instrumentos para produzir um falso resultado verde. Testes serão direcionados às alterações e aos contratos afetados. Não promover esse aceite delimitado a homologação integral ou autorização de operação fiscal real.

O último relato informa typecheck em andamento, swap em 9,1 GB e trabalho sem commit. Primeiro confira o processo e seu log. Reaproveite o resultado se já terminou e corresponde ao conteúdo. Não abra outra conferência concorrente. Se há progresso, deixe concluir; se está paralisado por memória, registre medições, interrompa somente o processo próprio de maneira controlada e preserve o trabalho. Não interrompa Vitest sem permitir limpeza; se uma interrupção for inevitável, identifique e limpe apenas seus recursos de teste. Não reinicie Docker nem outros serviços indiscriminadamente.

Prioridade é construir e permitir navegar. Não gastar a noite em instrumentação já entregue ou repetição de suítes. Um bloqueio AWS não interrompe as demais frentes. Uma dependência normativa impede efetivar a operação correspondente; não impede construir formulário, simulação explicitamente identificada, memória e tratamento da pendência.

## 2. Estado de partida e preservação

Este documento utiliza o relato do executor; o Mac ficou indisponível para inspeção remota nesta revisão. Confirme localmente HEAD, arquivos alterados e evidências. Não faça checkout/reset para forçar a base relatada.

| Frente anterior | Estado relatado | Ação nesta ordem |
|---|---|---|
| T1 / M35 | Commit `eecdf2c`; habilitação por contrato, vigência, suspensão, histórico; testes delimitados aprovados | Preservar; consumir os gates existentes |
| T2 / B2 e certidões | Implementação e testes aprovados, aguardando commit | Revisar diff e consolidar; não criar outro crédito ou ledger |
| T3 / consultas | Estado derivado no banco, totais/exportação globais; bens com referência e localização histórica | Preservar; estender o padrão às novas consultas |
| T5 / implantação | `pos-dns.sh` com nove estados, identidade obrigatória e testes; sete casos Linux de pré-condições | Reutilizar; isso não comprova instalação AWS nem restore completo |
| Receitas/Pessoal públicos e T4 | Não iniciados no último relato | Executar nesta rodada |
| Typecheck, candidato e servidor | Resultado ainda pendente no relato | Conferir; não presumir que terminou ou que está servindo |

Leia instruções locais, resumo e últimas seções de `ESTADO-EXECUCAO.md`, módulos afetados e catálogo existente. Faça inventário curto de capacidades já implementadas antes de cada incremento. Não releia toda a repo para começar.

Preserve arquitetura mono-ente por implantação, Prisma, Decimal, Pessoa canônica, comandos, autorização, M21/M22, M32/M33, M34/M35 e ledger existente. Preserve o stash `11b7892` sem aplicar/remover. Não execute nem inclua os três scripts de terceiros. Não use `git add .` para consolidar trabalho. Separe commits por incremento com apenas os caminhos próprios revisados; informe verificações pendentes sem encobri-las.

Suspensão comercial mantém a leitura autorizada prevista no M35. O administrador municipal não pode conceder ações reservadas à Engine. Não refazer um cadastro global de municípios dentro deste banco mono-ente.

Sem push, mensagens reais, pagamentos, transmissão fiscal/eSocial, importação de dados produtivos ou alteração de infraestrutura de outros produtos. Publicação autorizada aqui é a demonstração do gestao-publica, com dados sintéticos e identificação clara. Não transformar credenciais locais de avaliação em contas públicas com senha conhecida.

## 3. Organização, responsáveis e caminhos

Há um executor confirmado: use fila real. Somente se houver dois agentes de código efetivamente disponíveis, use no máximo dois escritores em worktrees da mesma repo e com caminhos separados. Uma execução pesada por máquina, inclusive entre worktrees. O integrador é o único escritor de schema/migrations, permissões comuns, contratos compartilhados, navegação comum e release.

A base de cada tarefa é o descendente integrado do estado recuperado após T2/T3/T5, registrado por SHA e digest do conteúdo relevante. Os caminhos abaixo delimitam responsabilidade; confirme os nomes reais da repo antes de criar diretórios. Não invente um módulo paralelo porque o nome previsto não existe.

| ID | Responsável | Caminhos de escrita | Contratos consumidos e dependências | Resultado e integração |
|---|---|---|---|---|
| V0 | Integrador | Evidências/estado e arquivos pendentes já próprios | Relato, diff, logs, T1–T5 | Trabalho preservado e base identificada; verificações pendentes explícitas |
| V1 | A | M32/M33, portas e telas internas de pessoal/folha, documentos correspondentes | Pessoa, fórmulas fechadas, parâmetros vigentes, encargos e apropriação existentes | Folha calculável pela tela, memória por verba, revisão, fechamento e correção |
| V2 | A após V1; B somente com contrato congelado | Adaptador eSocial no módulo competente existente, suas portas/telas | Eventos/vínculos M32, snapshots M33, M22, autorização | XML validado, pendências acionáveis, histórico e retornos locais testáveis |
| V3 | B ou A na fila | M01/M03/M04/M05/M09/M12 e telas contábeis estritamente afetadas | Ledger, exercício, fonte/destinação, travas, roteiros e estornos | Resultados orçamentário/financeiro/patrimonial explicáveis; uso do superávit no fluxo existente |
| V4 | B ou A na fila | M13 e `app/(publico)/transparencia`, projeções específicas | M04/M05/M32/M33, política de publicação, T3 | Receitas e Pessoal públicos utilizáveis, filtros/totais/exportação coerentes |
| V5 | A, sem concorrência nos caminhos de V1 | M21/M22, atendimento; percursos da execução contratual | Protocolo, prazos, documentos, glosa/estorno existentes, M05 | e-SIC e guichê utilizáveis; glosa/estorno conferidos pelo navegador |
| V6 | Integrador | `docs/operacao`, scripts próprios, empacotamento/deploy | V0, perfil AWS, Linux, manifesto, backup, V1–V5 integrados | Instalação verificável e tabela GoDaddy com valores reais |

**Fila com um executor:** V0 → preflight AWS curto → V1 primeiro incremento → V3 primeiro incremento → V4 → V2 → V5 → complementos V1/V3 → V6. O preflight só verifica acesso; não vira uma investigação que consome as outras entregas. Manter avaliação local acessível quando não conflitar com a memória do único processo pesado.

**Com dois executores reais:** A assume V1 e V2; B assume V3 e V4; depois A assume V5. Integrador serializa contratos compartilhados e migrações. Se o Mac voltar a paginar intensamente, reduza para uma fila, sem aumentar heap de dois processos.

### Comando para o integrador

> Execute V0; confira o estado posterior a eecdf2c sem descartar o diff. Registre responsáveis, SHA-base, caminhos e dependências. Integre as tarefas desta ordem em incrementos. Reaproveite provas válidas; não rode portão integral. Faça o preflight AWS com perfil próprio e depois V6. Entregue o mesmo artefato verificado, com limitações explícitas, URLs e matriz final.

### Comando para executor A

> Execute V1, V2 e V5 nos caminhos atribuídos. Comece pelo inventário das capacidades M32/M33; complete lacunas, sem substituir motores existentes. Para cada incremento entregue regra executável, tela, documentos/ações aplicáveis e teste de comportamento dirigido. Solicite ao integrador somente alterações compartilhadas identificadas. Não escreva schema, permissões comuns ou release em paralelo.

### Comando para executor B, somente se realmente disponível

> Execute V3 e V4 na base integrada indicada. Reutilize o ledger e os contratos de receita/despesa/folha; não replique cálculos no portal. Entregue apuração rastreável, operações cabíveis, consultas públicas protegidas e testes dirigidos. Coordene contratos com A e entregue migrações ao integrador.

Com um único Cursor, estes comandos são responsabilidades sequenciais do mesmo executor, não três processos.

## 4. V1 — folha e RH com cálculo executável

Antes de alterar, identifique o que M32/M33 já faz em domínio, encargos, apropriação, certificação, elegibilidade e recolhimento. Preserve os percursos aprovados. O objetivo é completar a operação pela interface, e não apenas adicionar classes de cálculo.

### V1.1 — folha mensal completa e explicável

1. Completar cadastro versionado de rubricas: código, natureza, descrição, regime aplicável, fórmula, base, dependências, arredondamento, incidências, vigência, fundamento, aprovador e situação. Dependências formam grafo verificável; rejeitar ciclos e referências inexistentes. Reutilizar interpretador fechado, sem `eval` ou execução de texto.
2. Integrar eventos fixos e variáveis por vínculo/competência: vencimento, gratificações, horas extras, adicional noturno, tempo de serviço, insalubridade/periculosidade quando aplicáveis, faltas e descontos. Cada regra depende do regime e fundamento; não impor regras CLT a todo servidor estatutário.
3. Completar incidências de previdência, IRRF, pensões e consignações com parâmetros versionados e limites documentados. Distinguir RGPS/RPPS, vínculo/CPF, competência e momento do pagamento quando exigido. Não fixar tabelas históricas como se fossem vigentes nem presumir FGTS para todos. Ausência de regra obrigatória gera pendência antes de fechar, não desconto zero silencioso.
4. Congelar entradas, fórmulas e parâmetros no cálculo. Mostrar por verba: quantidade/referência, base, expressão aplicada, valor, incidências, fonte/versão e arredondamento. Alterar tabela depois não reescreve folha fechada.
5. Reutilizar estados e comandos existentes para preparar → calcular → revisar → aprovar/fechar. Reabertura/correção é motivada e rastreada; integrações já efetivadas exigem a reversão/retificação cabível. Duplo clique/repetição de lote não duplica cálculo nem apropriação.
6. Telas: configuração, lançamentos, prévia individual/lote, pendências com destino de correção, comparação com competência anterior, memória, contracheque privado e resumo por unidade/custo/regime. Valores financeiros não usam ponto flutuante. Paginação não altera os totais.

**Aceite dirigido:** cenários sintéticos de dois regimes, adicional + desconto, mudança de vigência, rubrica circular recusada, falta de parâmetro bloqueando fechamento, arredondamento e repetição idempotente. Resultado esperado calculado independentemente da função testada. Um percurso pela tela até contracheque e apropriação existente; não efetuar pagamento real.

### V1.2 — folhas especiais e histórico funcional

Completar lacunas de férias, 13º/adiantamento, complementar/diferenças, rescisão simulada e efetiva em ambiente de avaliação, afastamento e retorno. Priorizar as modalidades já parcialmente implementadas. Para cada modalidade: campos próprios, regime/fundamento, período, base proporcional, parcelas já pagas, incidências, documento e reversão/correção. Não representar todas com um formulário genérico de valor manual.

Simular rescisão não encerra vínculo. Complementar referencia a origem e reconhece diferenças, sem duplicar o total anterior. Férias/13º reconciliam adiantamentos; afastamentos têm natureza e intervalo. RRA e processos trabalhistas exigem regras próprias: implementar o trecho sustentado pelas fontes e registrar o restante por capacidade, sem declará-los cobertos por uma exportação genérica.

**Aceite:** um caso numérico por modalidade alterada e um caso de correção; alterações retroativas não mudam memória já fechada. Atualizar matriz de modalidades com funcionando, parcial e ausente. Não redesenvolver modalidades já completas.

## 5. V2 — eSocial integrado, sem transmissão real

Localize a infraestrutura existente de exports federais/eSocial e expanda-a. Registrar para cada evento os campos de origem, versão do leiaute, XSD, regra, vigência, ambiente e hash dos arquivos oficiais utilizados. Não tratar data de publicação de uma nota como início de todas as suas regras.

Em 16/09/2026, a documentação oficial já apresenta pacotes NT 07/2026 com entradas futuras em produção; selecionar a versão por evento, ambiente e data. Conferir novamente as fontes na execução. [Documentação oficial](https://www.gov.br/esocial/pt-br/documentacao-tecnica), [NT S-1.3 07/2026](https://www.gov.br/esocial/pt-br/documentacao-tecnica/manuais/nota-tecnica-s-1-3-07-2026.pdf).

Implementar uma jornada vertical inicial usando os eventos efetivamente aplicáveis ao ente demonstrativo: cadastro/rubricas, vínculo, remuneração, pagamento quando registrado na origem, fechamento/reabertura e retificação. Selecionar os códigos no leiaute vigente; folha calculada não prova pagamento e não autoriza inventar esse evento.

- Tela de consistência com pessoa/vínculo, evento/campo, erro, sugestão e link à origem; sem correção automática de fato funcional.
- Prévia legível e XML com validação XSD e regras locais, vinculados ao snapshot que os originou.
- Lotes, chave de idempotência, dependências e tentativas com histórico. Distinguir gerado, validado, assinado, aguardando envio, enviado, recebido, aceito e rejeitado conforme o protocolo. Ausência de resposta não vira aceitação.
- Implementar adaptadores para assinatura A1 e transporte/retorno, preservando interface de produção/restrita separada. Exercitar assinatura com certificado de teste e transporte simulado. Nunca persistir senha/chave privada em logs ou arquivos públicos.
- Recepção idempotente de retornos, correlação do evento, recibo quando existente, rejeição acionável, retificação/exclusão conforme leiaute. Arquivos simulados são identificados como tal e não produzem situação oficial aceita.
- Downloads/XML e documentos restritos; nenhuma publicação automática no portal do cidadão.

**Aceite:** gerar XML de um cenário integrado M32/M33, validar com XSD aplicável, identificar erro real de origem, impedir envio sem habilitação, processar retorno de teste duplicado sem duplicar efeito, manter histórico de retificação. Sem chamada de transmissão a produção ou produção restrita nesta ordem. Integração real permanece pendente de certificado, autorização e teste externo específicos, não de mais uma tela.

Obrigações legadas citadas nos PDFs — DIRF, SEFIP/GFIP e outras — precisam de verificação de aplicabilidade por período e contribuinte. Não ativar exportação obsoleta indiscriminadamente só porque aparece no documento.

## 6. V3 — contabilidade, receitas, despesas e resultados

### V3.1 — apuração com memória e origem

Reutilize M01/M03/M04/M05/M09/M12. Faça o levantamento de funções existentes e complete as ausentes. Os três resultados abaixo são conceitos distintos:

- Orçamentário: confronto das receitas orçamentárias realizadas com despesas empenhadas, no exercício e escopo corretos.
- Financeiro: apuração pelos ativos/passivos financeiros e critérios contábeis aplicáveis, com segregação por fonte/destinação e tratamento próprio da disponibilidade para créditos adicionais.
- Patrimonial: confronto de VPA e VPD pelo regime contábil aplicável.

Caixa disponível, previsão de arrecadação e simulação não substituem esses resultados. Use a edição vigente do [MCASP, atualmente 11ª](https://www.gov.br/tesouronacional/pt-br/contabilidade-e-custos/manuais/manual-de-contabilidade-aplicada-ao-setor-publico-mcasp-1). Documente contas, atributos, exclusões, corte temporal e conciliação utilizados antes de habilitar a apuração.

Tela de resultados com exercício/período, unidade, fonte, situação provisória/encerrada, saldo inicial, movimentos, apuração, ajustes e rastreamento até os lançamentos/documentos. Resultado ausente ou classificação incompleta não aparece como zero. Semáforos/gráficos derivam dos números efetivos, sem dados inventados.

Consulta de superávit deve demonstrar apurado, utilizado em suplementações, reservas operacionais existentes e saldo disponível, sem descontar o mesmo comprometimento duas vezes. Integrar ao comando atual de crédito adicional, com autorização, ato, fonte e período. Duas solicitações concorrentes não podem utilizar a mesma disponibilidade. Correção/anulação segue o estado e efeito contábil da operação original; não apagar história nem liberar saldo já consumido indevidamente.

Consolidação respeita as unidades e entidades realmente modeladas. Não somar clientes de bancos distintos. Se o consolidado do documento exige escopo ausente, nomear a lacuna, mantendo a consulta correta desta implantação.

**Aceite dirigido:** resultados positivo, negativo e nulo; fontes distintas sem compensação indevida; valor conhecido reconciliado com os lançamentos; tentativa concorrente acima do disponível recusada; anulação tratada uma única vez; exercício fechado bloqueado. Percurso pela tela da memória até a operação M03 quando seus requisitos estiverem atendidos.

### V3.2 — receitas e despesas operáveis

Concluir a ligação T2/B2 com o crédito canônico `ReceitaReconhecida`. Separar preparar, constituir, arrecadar e estornar; constituição não vira caixa. Sem roteiro contábil válido, produzir pendência com responsável, motivo, prazo de tratamento e próxima ação, sem efetivação fictícia. Configuração contábil aprovada deve permitir continuar a mesma intenção sem duplicidade.

Nas despesas, preservar empenho, liquidação, pagamento e retenções como fases distintas. Completar apenas as lacunas necessárias à operação demonstrável: seleção de documento, fonte, competência, valor bruto, deduções/retenções fundamentadas, líquido, saldo e histórico. Obrigações de folha e contrato consomem os mesmos comandos contábeis. Se pagamento é simulado, ficar restrito à base sintética, sem exportar/enviar ordem bancária real.

**Aceite:** receita constituída ainda não arrecadada; arrecadação parcial e correção; despesa parcialmente liquidada; limites concorrentes e estorno; conciliação com V3.1. Não repetir todos os testes do financeiro: exercitar os pontos modificados e suas integrações diretas.

## 7. V4 — Receitas e Pessoal no portal

Entregar as duas famílias deixadas de fora. Manter logo oficial Engine, rodapé e casca pública já implementados. Não fazer outro redesign geral nesta rodada.

**Receitas:** filtros por período, natureza, fonte e unidade; previsão inicial/atualizada quando disponível, realizado, deduções e evolução; detalhe de lançamentos publicáveis e exportação. Explicar a fase dos valores; não somar constituição e arrecadação como dois recebimentos.

**Pessoal:** competência, órgão/unidade, cargo e vínculo nos limites da política de publicidade; valores de remuneração publicáveis e memória pública sanitizada. Demonstrativo público não é cópia do contracheque privado. Não divulgar conta bancária, dependentes, saúde, pensão individualizada, credenciais ou anexos restritos. Definir explicitamente a projeção publicável e seu fundamento; não usar a captura do concorrente como autorização de exposição.

Ambas: busca, filtros, paginação, totalização e CSV/PDF devem refletir o mesmo conjunto global; proteger CSV contra fórmulas. Exibir data de referência/atualização verdadeira, origem funcional e situação de publicação. Integrar menu/breadcrumbs, URL compartilhável dos filtros e acesso por teclado/celular. Não mencionar TR, item de edital, mutation/gate ou cobertura técnica no frontend. Não contar serviços inexistentes como ativos.

**Aceite:** entrada pública sem login; um percurso por família com dados sintéticos gerados na origem, detalhe, filtro, segunda página e exportação; teste negativo de campo restrito e acesso direto a documento privado. Totais conciliam com a origem, incluindo páginas fora da primeira. Reutilizar validações T3, sem reescrever a consulta inteira.

## 8. V5 — fechar atendimento e execução contratual

Primeiro executar os percursos pendentes de glosa e estorno, sem reimplementar seus motores: medição → recebimentos → glosa/decisão → liquidação e reversões autorizadas. Verificar saldo, motivação, documentos, permissões e projeção pública após cada ato. Glosa não cria liberação financeira automática fora da regra; estorno não apaga recebimento nem contorna liquidação já efetivada.

**e-SIC:** integrar M21/M22 para pedido, comprovante, acompanhamento protegido, distribuição responsável, prazo próprio, prorrogação motivada, resposta e recurso/instância conforme fonte aplicável. Não reutilizar cegamente prazo da ouvidoria. Registrar publicação/vigência da norma federal e regulamentação local; ausência de configuração local obrigatória gera pendência tratável. Prévia de resposta não vira resposta entregue. Atendimento interno e consulta do cidadão têm projeções distintas.

**Guichê:** serviço, local/canal, agenda, capacidade, duração e horário, disponibilidade, reserva/confirmar, reagendar, cancelar, comparecimento e falta. Usar timezone do ente e impedir duas reservas da mesma vaga por concorrência. Reagendamento libera a vaga anterior atomicamente; não deixar formulário perder os dados quando houver recusa. Reutilizar os componentes da agenda U8 sem acoplar regras de fiscalização às de atendimento.

**Aceite:** um pedido até resposta/acompanhar no ambiente sintético, uma prorrogação/recurso aplicável, duas tentativas para última vaga e cancelamento/reagendamento. Nenhuma mensagem externa será enviada; comunicações ficam no canal interno/de demonstração previsto.

## 9. V6 — acesso AWS e publicação identificável

O usuário forneceu credencial programática e autorizou preparar o ambiente. **Não copiar chaves para esta ordem, repo, logs, comandos visíveis, imagens, frontend, manifesto ou relatório.** Usar credencial autorizada disponível com segurança no executor, preferencialmente a substituta da exposta, no perfil próprio `gestao-publica`; sessão temporária quando disponível. Se o segredo não está acessível localmente, registrar somente essa dependência, sem pedir que seja colado novamente no chat.

Uma chave não comprova permissão Lightsail. Com perfil explícito, verificar STS, conta esperada `441778933745`, principal e região; inspecionar recursos do projeto e permissões efetivas necessárias. Não usar implicitamente o perfil default de outro produto, nem criar chave/política administrativa para contornar AccessDenied. Credencial programática válida não depende da troca obrigatória de senha de console para funcionar na CLI. [Perfis e credenciais AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html).

A infraestrutura escolhida continua Lightsail Linux em São Paulo, conforme os documentos de implantação existentes. Revalidar disponibilidade/preço e o teto efetivamente aprovado nos registros antes de criar recurso cobrado; a referência anterior era instância de US$44/mês e estimativa total de US$50–65/mês, não uma nova autorização para ampliar gasto. Reutilizar recursos próprios existentes; não adicionar serviços pagos ou mudar arquitetura automaticamente para contornar falta de acesso.

Com acesso e orçamento atendidos, concluir autonomamente a preparação e implantação já autorizadas:

1. Inventário próprio, tags, endereço estático e acesso administrativo limitado. Não mexer nos recursos de MSFrotas/WhatsApp, Evolution/Redis ou proxy de outro projeto.
2. Empacotar para o Linux/arquitetura alvo. Não copiar dependências nativas do Mac. Separar build de runtime; papel da aplicação sem superusuário, DDL ou privilégio de contornar isolamento. Banco sem porta pública. Segredos da aplicação permanecem no ambiente apropriado.
3. Migrações aditivas revisadas e ensaio no banco sintético/clonado dedicado. Seeds de demonstração idempotentes e contas privadas configuradas fora do relatório. Nenhum banco de desenvolvimento/produtivo é substituído.
4. Backup de banco e documentos fora do disco da instância, retenção e restore comprovado em destino isolado. Usar a solução documentada; se acesso/custo faltarem, registrar bloqueio exato, sem declarar backup pronto.
5. Executar os testes direcionados da seção 10 sobre o candidato e promover **o mesmo artefato por digest**, sem rebuild silencioso. Identidade de release pública expõe apenas metadados necessários, nunca configuração ou segredos. Revisar este endpoint conforme o T5 já entregue.
6. Preparar HTTPS, virtual hosts e redirecionamento; não oferecer login em HTTP público. Antes do DNS, conferir origem via túnel ou acesso privado. Se o DNS/certificado ainda impede HTTPS público, informar essa etapa pendente corretamente.
7. Entregar tabela GoDaddy com tipo, nome, valor real, TTL e função. Respeitar o domínio `enginesistemas.com.br` e os subdomínios já definidos no plano, sem substituir apex, e-mail, MX/TXT ou outros serviços existentes. Não inventar IP/CNAME. Winner fará a alteração DNS, conforme autorização anterior.
8. Deixar o comando pós-DNS existente pronto e, se o DNS já resolver corretamente, executar a verificação. `PREPARADA`, `ORIGEM_VERIFICADA` e `PUBLICADA` são situações diferentes; publicação exige DNS, TLS, identidade do artefato, públicos e login confirmados.

Permissão insuficiente: registrar operação negada, principal, recurso/região, responsável e ação mínima necessária; continuar V1–V5. Não transformar falta de certificado, DNS e IAM numa única pendência genérica.

## 10. Verificação proporcional e continuidade

Não rodar campanha de mutações nem suítes completas por incremento. Não aumentar timeout para encobrir saturação. Não duplicar conferência de tipos dentro e fora do build: reutilizar o mecanismo existente vinculado ao digest, mantendo a reconferência necessária dos tipos de rota gerados. Qualquer evidência reaproveitada precisa ter conteúdo e dependências compatíveis; teste de outro candidato não passa a valer automaticamente.

Executar por tarefa somente:

- Casos numéricos e de estado alterados, com resultado esperado independente.
- Permissões, idempotência, saldo/concorrência ou restrição de publicação quando a alteração tocar esses contratos.
- Um percurso de navegador por jornada nova/alterada, com dados persistidos e confirmação do resultado.
- Tipos afetados durante construção; uma conferência integrada do candidato e build compatível com o destino, sequenciais. Memória insuficiente deve ser tratada, não ignorada pela válvula de build.
- Smoke de implantação: runtime, migrações aplicadas, saúde, release, acesso público, acesso privado, recusa sem permissão e disponibilidade de documentos.

Uma execução pesada por máquina. Cada processo próprio tem comando, PID, início, log, fim/exit e artefato. Sem abrir cadeias invisíveis em background. Não manter servidor antigo como se fosse o candidato novo. Registrar capturas das telas novas em desktop e celular; evitar capturar todas as telas de novo.

Suíte completa/fuso ficam registrados para janela posterior separada; esta ordem não autoriza deixá-los rodando ocultamente ao encerrar. Falha em cálculo, autorização, migração ou exposição pública bloqueia a entrega afetada mesmo que as demais estejam prontas. Não bloquear frentes independentes por uma falha localizada.

## 11. Fontes e classificação dos requisitos

Rastrear nos documentos internos cada capacidade como **literal**, **desenho de engenharia**, **regra dependente de fonte** ou **melhoria adicional**. Produto nacional exige regras por ente/regime/competência; nova licitação adiciona capacidades ao mesmo produto, sem copiar o sistema nem tornar regra municipal uma constante nacional.

Referências localizadas nos PDFs anexados, páginas físicas do arquivo:

| Documento | Trecho | Uso nesta ordem |
|---|---|---|
| Parte 1 | p.20, item 1.167 | Superávit, suplementado e saldo |
| Parte 1 | p.58–60, itens 1.666–1.688 | Modalidades de folha, memória por verba, regimes, incidências, variáveis e contabilização |
| Parte 1 | p.70–71, itens 1.813–1.825 | Consistências, origem dos campos, XML, ambientes, retornos e processos trabalhistas |
| Parte 2 | p.23, item 3.162 | Consulta de superávit por entidade/consolidado |
| Parte 2 | p.34–35, itens 3.308–3.320 | Fluxos eSocial e rastreabilidade |
| Parte 2 | p.35, itens 3.321–3.330 | Transparência, receitas e demonstrações |
| Parte 3 | p.30, item 49 | Capacidade demonstrável de superávit/uso/saldo |
| Parte 3 | p.107–108, Gestão e-Social | Roteiro de comprovação de consistências, eventos e arquivos |

Esses trechos orientam os incrementos desta ordem; não são declaração de atendimento integral dos três PDFs. Repetições de uma capacidade em documentos diferentes não viram três implementações. Conservar também o catálogo e os vínculos do TR de Anita Garibaldi já existentes.

Fontes oficiais consultadas em 16/09/2026: [MCASP](https://www.gov.br/tesouronacional/pt-br/contabilidade-e-custos/manuais/manual-de-contabilidade-aplicada-ao-setor-publico-mcasp-1), [eSocial](https://www.gov.br/esocial/pt-br/documentacao-tecnica), [NT 07/2026](https://www.gov.br/esocial/pt-br/documentacao-tecnica/manuais/nota-tecnica-s-1-3-07-2026.pdf). Conferir fontes específicas vigentes de IRRF, RGPS, RPPS e legislação do ente antes de efetivar as regras; dados demonstrativos não são legislação. Para cada fonte persistir URL/documento, trecho, data de consulta, publicação, início/fim de vigência, escopo e versão/hash quando aplicável.

## 12. Entrega e encerramento

Atualize os registros existentes, sem criar outro ledger de execução. Para cada V0–V6 entregue: responsável, base e commits, caminhos efetivos, contrato consumido, resultado acessível, testes executados, testes não executados, fonte, próxima ação e critério de integração. Mantenha correspondência com N0–N8 e T1–T5 para não perder pendências anteriores.

Relatório final deve começar com o que Winner pode abrir e fazer: URL, tela, papel necessário e jornada. Senhas permanecem no canal/local apropriado, nunca no relatório. Incluir:

1. Matriz completa V0–V6, separando implementado, verificado localmente, instalado, publicado e bloqueado externo.
2. Jornadas de folha, eSocial local, receitas/despesas, apuração contábil, portal e atendimento realmente executadas; valores/resultados sintéticos de referência.
3. Candidato, digest do artefato, ambiente, banco e estado do servidor; evidência de que servem o conteúdo indicado.
4. Situação AWS discriminada em autenticação, autorização, infraestrutura, restore, aplicação, DNS e TLS; tabela GoDaddy quando houver valores reais.
5. Pendências concretas com responsável, próxima ação e prazo proposto, destacando fonte/regulamentação, certificado, IAM ou DNS quando genuinamente externos. Escopo não executado é trabalho pendente, não bloqueio externo.
6. Duração aproximada em construção, verificações e infraestrutura; processos próprios ainda vivos, incluindo servidor solicitado. Não deixar testes pesados órfãos.

Continue autonomamente pelos incrementos utilizáveis. Não encerrar após apenas commit, motor sem tela ou lista de ideias. Não declarar “ecossistema completo” por terminar esta ordem: demonstrar exatamente as capacidades entregues e preservar o restante do catálogo para continuidade.
