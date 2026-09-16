# Ordem V10 — conclusão das frentes pendentes e homologação

> Guardada como veio, em 2026-09-16, antes de começar. A ordem chegou com a codificação
> corrompida (UTF-8 lido como Latin-1); o texto abaixo é o mesmo, com os acentos restaurados.
> Nenhuma palavra foi acrescentada, removida ou reordenada.

Projeto: gestao-publica. Executor local: Cursor/Code. Orquestração: Astra. Operador: Winner.
Base inspecionada: HEAD 22b8dc3. Esta ordem continua V9; não reinicia o projeto.

## 1. Resultado que deve ser entregue

Concluir o trabalho interno que não depende da AWS: habilitação comercial de módulos, B2 tributário e jornada de certidão, Receitas/Pessoal no portal, correções das consultas públicas e jornadas pendentes de atendimento/execução contratual. Preparar um candidato de homologação e corrigir as lacunas reais do procedimento de implantação. A indisponibilidade de credenciais AWS bloqueia somente a parte externa da implantação.

Trabalhar autonomamente até completar os incrementos ou documentar uma dependência externa efetiva. Não encerrar só porque N6 está documentado ou N5 ganhou um MODULO.md. Esses são preparativos: a entrega é utilizável pela interface e protegida no servidor. Manter as demais frentes em progresso quando uma delas encontrar dependência de fonte, credencial ou DNS.

Não abrir outra rodada de redesign, infraestrutura abstrata ou reescrita de instrumentos já corrigidos. Corrigir somente os defeitos concretos apontados nesta ordem ou os revelados pelo trabalho. Continuar no mesmo repositório, ledger, cadastro canônico de Pessoa, arquitetura mono-ente por implantação, Prisma, Decimal, comandos e componentes existentes.

## 2. Base, preservação e evidências

Inspeção remota confirmou HEAD 22b8dc3, sem mudanças em arquivos rastreados e com apenas os três scripts de terceiros não rastreados. Stash 11b7892e7800281f3ef915ee571a967b9383401b intacto. Preservá-los sem executar, adicionar, remover ou reaplicar.

O executor relatou candidato 2590048+3424d989f3c1 e hash abreviado do artefato 3a3ed709692a, com 1.440 arquivos. Recuperar o registro completo antes de usar esses identificadores. O HEAD atual contém commits posteriores ao SHA que nomeia o candidato. Comparar conteúdo/manifesto, não presumir equivalência nem refazer build por mudança apenas documental sem necessidade demonstrada.

Os três arquivos não rastreados, se estiverem excluídos do pacote, não alteram por si só o conteúdo dos arquivos rastreados em HEAD. Registrar separadamente: mudanças rastreadas, arquivos adicionais incluídos no artefato e exclusões. O manifesto completo e o digest do pacote definem o que foi entregue; uma indicação genérica de árvore suja não substitui esse inventário.

Reaproveitar N0/N1 e os testes efetivamente aprovados. N4 tem implementação e testes de domínio, mas ainda carece dos percursos de navegador. Os 939 testes rápidos não substituem suíte completa, fuso, instalação ou homologação. Não inventar resultados nem chamar scripts de implantação escritos de execução comprovada.

Ler instruções locais aplicáveis, ESTADO-EXECUCAO.md seção 63, mapa de acesso, MODULO.md afetados e catálogo vigente. Corrigir afirmações documentais contraditórias de maneira aditiva, preservando a história.

## 3. Fila e contratos das tarefas

Um executor confirmado: fila real. Se houver dois executores disponíveis, máximo de dois escritores, em worktrees isoladas da mesma repo. Integrador é o dono único de schema/migrations, permissões, contratos comuns, navegação e release. Uma execução pesada por máquina. Não criar múltiplos terminais de build/testes como se fossem paralelismo de produto.

Todos os incrementos partem de descendentes integrados de 22b8dc3. Registrar o SHA exato na abertura e na integração de cada um.

| Tarefa | Responsável | Escrita autorizada | Contratos e dependências | Entrega / aceite |
|---|---|---|---|---|
| T1 N6 — habilitação comercial | Integrador ou executor A com revisão | Mecanismo atual de configuração/administração, guardas, portas e migrações aditivas | Identidade da implantação, módulo, sessão, ações, relatórios/jobs | Tela restrita de contrato/módulos; gate servidor; vigência e histórico; município não concede a si próprio |
| T2 N5 — B2 e certidões | Executor B, ou A na fila | M34, portas tributárias, telas de receita/serviços; M04/M01 apenas pelo integrador | B1, Pessoa, fórmula, fonte normativa, roteiro contábil, M21/M22 | Jornada de preparação e efetivação quando fundamentada; idempotência, memória e reversão; certidão não presume regularidade |
| T3 N2 — consultas completas | Executor A | M13, portas públicas, app/(publico)/transparencia, telas patrimoniais necessárias | M04/M05/M10/M12/M32/M33; publicação e autorização | Receitas/Pessoal operantes; filtros/totais globais corretos; bens com valor referenciado e localização publicável alterável |
| T4 N3/N4 — jornadas | Executor A, após liberar seus caminhos | M21, portas/mesas de atendimento, telas de execução; não duplicar N4 | Protocolo, documentos, prazos, recebimentos, M05 | Acesso à informação e guichê funcionais; percursos de glosa/estorno completos |
| T5 N7 — implantação verificável | Integrador | docs/operacao, scripts próprios de instalação/pos-DNS, empacotamento | Manifesto, Linux/runtime, banco, armazenamento, acesso AWS | Procedimento ensaiado e pronto; instalação externa só com identidade correta; DNS real depois do IP |
| T6 N8 — homologação | Integrador | Evidências, estado e catálogo existente | Candidato congelado T1–T5 | Gates sequenciais, resultado por etapa, release identificada e sistema disponível para avaliação |

Ordem em fila: recuperar e servir a versão local já construída → T1 → T2 → T3 → T4 → T5 → T6. Fazer um preflight breve de T5 no início somente para saber se o acesso mudou; não repetir investigação IAM já documentada. Com dois escritores, T1/T3 e T2/T4 podem ser repartidos por caminhos, mantendo integrações comuns serializadas.

## 4. T1 — N6 na arquitetura real, sem perder o objetivo Engine

Decisão de produto: o mesmo software atende vários clientes por implantações isoladas. Nesta unidade, o contrato comercial e a habilitação de módulos pertencem à implantação/ente atual. Não converter os domínios para banco compartilhado multitenant nem inventar uma lista de municípios dentro de um banco mono-ente.

Construir agora:

- Cadastro/versão do contrato comercial: identificador, identificação do cliente/implantação pelos cadastros existentes, situação, início/fim, módulos, motivo, responsável e histórico. Separar concessão comercial de exercício fiscal e de permissões do usuário.
- Tela Engine restrita mostrando implantação, contrato, módulos habilitados, vigências, alterações e efeitos previstos. Reutilizar identidade/autorização. Se precisar de capacidade nova da plataforma, provisioná-la explicitamente; não atribuir por e-mail, pelo papel municipal admin ou pelo nome do perfil.
- Ações de habilitar, programar vigência, suspender e reativar com motivo e idempotência. Validar dependências entre módulos sem ativar automaticamente módulos não contratados; mostrar necessidade e bloquear mudança incoerente.
- Gate central consumido em portas/comandos, rotas diretas, relatórios, exportações e jobs. Sessão/escopo/permissão continuam obrigatórios. Negação por licença não pode se confundir com indisponibilidade do banco.
- Política de leitura histórica e informação pública separada da autorização de novas operações. Suspensão não apaga fatos, impede download necessário ao exercício de direitos por padrão ou derruba automaticamente transparência já publicada. Modelar essas decisões explicitamente conforme obrigação e contrato aplicáveis.
- Migração de compatibilidade explícita: levantar módulos de fato usados na avaliação e configurar seu contrato demonstrativo. Não deixar todos os usuários sem acesso após atualizar, nem adotar fallback geral de liberação silenciosa quando falta configuração.

Testes: operador Engine habilita; administrador municipal não habilita; módulo não contratado recusado por URL/ação/job; vigência respeitada; desabilitar preserva fatos e leitura histórica autorizada; repetir a operação não duplica eventos. Para isolamento, usar duas implantações/bancos de teste independentes, compatíveis com a arquitetura atual. Não inventar um seletor de tenant para o teste.

Integração: configuração comercial instalada pelo procedimento oficial, mapa de acesso atualizado, perfis existentes preservados e tela funcional. Não declarar N6 global concluído: registrar N6.1 concluído para habilitação local.

Continuação N6.2: definir o contrato do console central Engine que inventaria implantações e distribui habilitações auditadas. Essa camada pode guardar metadados técnicos/comerciais das instalações sem reunir pessoas, escrituração ou senhas municipais. Registrar endereço lógico, identificador, versão/estado de sincronização, autoridade, revogação e idempotência do comando. É evolução compatível com isolamento por implantação; não desistir do produto com administração central e não apresentá-la como já construída.

## 5. T2 — iniciar e entregar N5

O contrato de crédito no MODULO.md é o primeiro passo, não o resultado final. Reutilizar modules/m34-tributario, B1 e packages/formula. Não alterar a regra de que simular não constitui crédito e não grava no ledger.

B2.1 — preparação utilizável: tela de lotes/casos com tributo, exercício, fato gerador, imóvel, Pessoa responsável, fundamento vigente, versão cadastral/tabela, memória, vencimentos, inconsistências e prévia. Persistir preparação apenas por comando explícito, distinguindo-a da consulta de simulação. Vincular à ficha do imóvel e oferecer documento de memória. Provar com regra sintética identificada, sem inventar legislação de município real.

B2.2 — aprovação/constituição: identificar crédito canônico e integração M04/M01 existentes antes de criar modelo. Operação autorizada, idempotente, protegida contra concorrência e vinculada à memória imutável. Não contabilizar receita arrecadada ao constituir crédito. Sem fundamento aplicável, parâmetros íntegros ou roteiro contábil validado, impedir a efetivação correspondente e produzir pendência acionável; ainda assim entregar preparação, revisão e interface completas.

B2.3 — correção: retificação/cancelamento por ato motivado, preservando original. Mapear dependências de parcelamento, arrecadação e demais atos existentes; recusar correção isolada incompatível, indicar sequência permitida, sem apagar fatos ou recriar saldo indevido.

B2.4 — certidões: solicitação, análise, emissão quando elegível, documento M22 e verificação de autenticidade. Cobertura da base fiscal deve ser demonstrável; ausência de dívida no novo M34 não comprova ausência em todo o ente. Falha de integração, escopo incompleto e falta de fonte geram análise/pendência, nunca negativa automática. Definir regras de situação, prazo/validade, assinatura, cancelamento/substituição e metadados públicos mínimos em fonte oficial e configuração vigente. A demonstração emite documentos sem validade oficial.

Não prometer CND de produção se roteiro ou base ainda estiverem incompletos. Implementar o fluxo de pedido/análise mesmo nesse caso. Autenticidade por chave não enumerável não expõe extrato ou dados bancários. Titular/representante precisa de vínculo validado; CPF informado não é autenticação.

Testes: simular não grava; preparação é explicitamente persistida; memória histórica permanece; aprovação repetida/concorrente não duplica; correção preserva origem; variável ausente não vira zero; fonte/base incompleta não emite regularidade; acesso de terceiro recusado. Valores esperados independentes do próprio motor. Percurso em tela e documento são parte do aceite, sem transmissão fiscal ou pagamento real.

## 6. T3 — N2: corrigir resultados e concluir Receitas/Pessoal

Primeiro corrigir as pendências registradas, pois mensagem explicativa não torna resultado parcial uma consulta completa:

- DESPESAS-FASE-FILTRADA-NA-PAGINA: resolver o predicado de fase para todo o conjunto no servidor antes da paginação. Contagem, páginas, CSV e totais devem representar o mesmo filtro. Não filtrar só os registros carregados.
- DESPESAS-TOTAIS-ACIMA-DE-2000: agregado no banco/projeção correta sobre o conjunto completo, independente do limite de linhas da página/exportação. Paginação estável. Evitar joins que multipliquem empenhos, liquidações ou pagamentos; uma fase não é nova despesa para somar ao total da outra.
- BENS-PUBLICOS-SEM-VALOR-NA-LISTA: valor e data de referência derivados do patrimônio canônico, com Decimal e sem recalcular por fórmula paralela.
- LOCALIZACAO-PUBLICAVEL-SO-NA-CRIACAO: tela interna para alterar política de divulgação de localização existente, com autoridade, motivo e histórico; invalidação da projeção/cache; ausência de autorização não muda a classificação.

Implementar Receitas/contas públicas: filtros de exercício, período civil do ente, unidade, natureza/fonte; previsto, arrecadado e correções conforme eventos de origem; detalhe, totais e exportação coerentes. Reutilizar demonstrativos já existentes. Não exibir crédito ainda não arrecadado como caixa recebido.

Implementar Pessoal: competência, vínculo, cargo/lotação, remuneração conforme ato/regra de publicação vigente. Projeção no servidor com campos permitidos e edição de política restrita. Não reutilizar o DTO privado de contracheque; excluir dados bancários, dependentes, saúde e anexos restritos. Mostrar data real de atualização/publicação.

Manter lista/detalhe/abas/documentos/exportação e retorno preservando filtros. Nenhum rótulo de TR, N2, nome técnico de pendência ou percentual de cobertura no frontend. Estado indisponível é diferente de zero registros; ausência de competência publicada não gera dados inventados.

Testes focados: resultado relevante situado depois da primeira página; consulta com mais de 2.000 registros sintéticos e total esperado independente; reconciliação entre filtros/lista/exportação; limite de data civil em fusos distintos; alteração de visibilidade revoga divulgação; publicação de pessoal não vaza campos privados. Não usar dados reais do portal de Anita como fixtures.

## 7. T4 — N3 e N4: fechar as jornadas pendentes

N4: reaproveitar glosa/estorno já construídos. Executar percursos de tela que abrangem consulta de saldo, prévia, confirmação, mensagem persistente, documento/linha do tempo e efeito posterior. Incluir recebimento com liquidação dependente recusado, sequência autorizada de reversões, repetição e recarregamento. Não marcar concluído apenas com teste do serviço. Corrigir o que o percurso revelar, sem reescrever a ponte.

N3: acesso à informação com serviço próprio sobre M21; protocolo, responsável, prazo específico conforme fonte/configuração, prorrogação motivada, resposta/recusa fundamentada, recurso quando aplicável e acompanhamento restrito. Não reutilizar prazo genérico de ouvidoria sem regra válida. Não inventar data quando faltar configuração; atribuir tarefa interna com responsável e próxima ação.

Agenda de guichê: cadastro de unidade/serviço/guichê, horários/capacidade, exceções de calendário, reserva idempotente, confirmação, cancelamento, reagendamento e realização. Fiscalização e atendimento são contextos diferentes; reaproveitar componentes de calendário sem misturar dados restritos. Controle concorrente de capacidade e confirmação legível. Notificações internas operantes; nenhum envio externo real.

Aceite: cidadão solicita e acompanha; setor recebe e responde; recurso/tramitação mantém histórico e anexos; outro cidadão recusado; duas reservas concorrentes respeitam capacidade; cancelamento libera a capacidade apenas uma vez. Cumprir os cenários com dados sintéticos pela interface.

## 8. T5 — corrigir o roteiro antes de declarar implantação pronta

A leitura de docs/operacao/IMPLANTACAO-LIGHTSAIL.md e scripts/pos-dns.sh revelou lacunas internas independentes de IAM. Corrigi-las nesta rodada e ensaiar em Linux isolado disponível, sem despesa adicional automática.

### Artefato e instalação

1. Escolher uma cadeia de proveniência única: manifesto do fonte completo e imutável → construção Linux → pacote/runtime completo com digest próprio → verificações → promoção do mesmo pacote. Não rotular o build Linux refeito com digest de .next produzido no Mac. Não usar git archive HEAD para representar mudanças rastreadas ainda fora do commit do candidato.
2. Hash de .next é útil, mas não inventaria por si só Prisma, dependências externas, Chromium, fontes, public, migrations, SQL e scripts necessários. Conferir abrangência do manifesto da release, inventariar complementos e separar configuração/segredos do conteúdo publicável. Verificar integridade após transferência.
3. Fixar versões compatíveis de Node e PostgreSQL. O apt-get install postgresql genérico do roteiro não prova a mesma versão 18.6 registrada na construção. Escolher distribuição/pacote ou imagem oficial compatível, verificar versão instalada e comprovar instalação/upgrade. Chromium e fontes precisam renderizar um PDF real no runtime alvo.
4. Substituir trechos exemplificativos por procedimento próprio, revisável e idempotente. Provisionar diretórios, permissões, usuário dedicado do serviço, arquivos de configuração e unit completa; Next escuta na interface interna apropriada. Não operar a aplicação como root por omissão de User na unit.
5. Separar identidade de migration e runtime; demonstrar falta de DDL/superuser/BYPASSRLS no runtime, aplicar SQL e permissões pelo registro e instalar em banco limpo. Ordem do roteiro deve garantir código, dependências e credenciais corretas antes de executar scripts de provisionamento.
6. Implementar destino real de backup externo, credencial mínima, retenção, tarefa e restore; tabela de proposta não é backup funcionando. Se o destino exigir serviço/permissão adicional, incluir no quadro de custo e acesso. Política Lightsail não concede por si só acesso a armazenamento de outro serviço. Não chamar a política atual de mínima por projeto sem conferir recursos/condições suportados: Resource '*' pode alcançar recursos de outras aplicações.

### Pós-DNS: fechar aceite falso

O script atual aceita ausência de identificador de build e ainda encerra dizendo que cobre PUBLICADA. Deve falhar quando a evidência indispensável não existir.

- Exigir destino esperado no modo de aceite; tratar falha do resolvedor, registros múltiplos e resolução indireta explicitamente. Conferir que o destino corresponde ao recurso desta implantação; nunca seguir com IP inesperado.
- Conferir status HTTP, destino de redirecionamento e semântica da rota de saúde. curl sem --fail pode retornar sucesso com 404/500: conectividade TLS não é saúde da aplicação.
- Identidade publicada obrigatória e comparada ao candidato esperado, com mecanismo verificável no servidor. Se o digest final do pacote não puder ser embutido nele por autorreferência, usar manifesto/atestação externa coerente e endpoint de release que reporte a identidade de build vinculada. Não criar marcador decorativo sem relação com o processo que atende.
- Domínio/TLS válidos, status esperado nas rotas e negações de acesso precisam ser verificados. Quatro GETs 200 comprovam disponibilidade de páginas, não jornada de negócio completa; usar o relatório de percursos do mesmo artefato para a homologação.
- Executar emissão do certificado na máquina correta, com conta ACME/configuração definida e termos aplicáveis tratados; não presumir certbot instalado no Mac ou aceitar termos como efeito escondido da checagem. Separar conferir de emitir. Reutilizar certificado válido sem repetir emissão; não fixar uma afirmação genérica de limite semanal como regra universal.
- Antes do HTTPS, expor apenas o necessário para validação ACME/redirecionamento/manutenção. Não publicar formulário de login em HTTP enquanto o texto do roteiro afirma que ele está protegido. Testar a configuração efetiva do proxy.
- Estados finais distintos: PREPARADO_LOCALMENTE, AWS_BLOQUEADA, AWS_INSTALADA, DNS_PENDENTE, TLS_PENDENTE e PUBLICADA_VALIDADA. O código de saída deve refletir a etapa faltante, sem imprimir sucesso global com verificação pulada.

Teste do instrumento com servidor/resolvedor de teste ou dependências controladas: DNS ausente, destino incorreto, TLS inválido, resposta 404/500, identidade ausente/diferente e identidade correta. Não emitir certificados públicos nem acessar ambientes de outro produto para testar casos negativos.

### Acesso AWS: desbloqueio preciso

O preflight anterior apurou senha de console com troca obrigatória e políticas sem acesso a Lightsail. Isso é uma dependência externa concreta para o executor, não motivo para deixar T1–T4 sem implementação.

Corrigir o texto que exige chave de longa duração: ela é uma alternativa. Caminho preferido quando disponível: Winner completa a troca obrigatória da senha no console; administrador autorizado concede acesso Lightsail adequado ao escopo e SignInLocalDevelopmentAccess para o fluxo de login; então autenticar perfil nomeado gestao-publica por aws login e conferir STS. A AWS CLI instalada 2.34.63 está acima do mínimo documentado 2.32 para esse fluxo. Credenciais temporárias expiram: registrar validade necessária para a operação, sem persistir segredo no relatório.

Não alterar IAM pela credencial default de outro produto nem criar chaves novas silenciosamente. Não solicitar senha/chave no corpo do chat. Se houver autorização específica posterior para outro principal ou método, registrá-la e reaproveitá-la; não inventar nova proibição permanente baseada no nome de um perfil.

A conta é a mesma; a escolha de principal define acesso/auditoria, não cria uma conta de faturamento separada por produto. Usar tags, inventário e orçamento para atribuição de custos. Não usar receptor-rastreadores/ip-receptor como recurso da gestao-publica.

Com acesso válido, executar o provisionamento já autorizado no tamanho escolhido, aplicar o candidato Linux validado e entregar IP estático e registros GoDaddy reais. Preservar domínio raiz, outras aplicações e DNS a cargo do usuário. Sem acesso, concluir procedimento/artefato/ensaios locais e declarar exatamente o que não foi executado.

## 9. T6 — validação final sem repetir trabalho por hábito

Durante construção: testes das invariantes e interfaces alteradas. T1/T2 exigem autorização positiva/negativa e idempotência antes de integrar; T3 exige correção dos resultados antes de publicar dados. Não adiar falha financeira ou de acesso conhecida.

No candidato de homologação congelado, executar em sequência: verificações de tipos/lint/build conforme pipeline atual; runtime e instalação/upgrade quando afetados; percursos novos; suíte completa; fuso. Fuso é necessário porque o diff tocou períodos civis. Conferir o que o comando portao já inclui para não rodar a mesma suíte novamente ao chamá-lo. Reaproveitar resultados válidos vinculados ao mesmo conteúdo/ambiente e registrar a composição do gate.

Não editar a árvore enquanto ela é medida. Uma execução pesada por máquina, sem vários clones consumindo o mesmo banco. Se comando não avança, inspecionar logs e memória e resolver a causa; não repetir por horas nem matar outros projetos. Erro de produto, preparação/teste e ambiente exigem evidência distinta. Interrupção de vitest pode impedir limpeza: usar ambientes descartáveis com recuperação própria, nunca limpar banco desconhecido.

Depois da verificação, deixar o servidor local de avaliação funcional para Winner, salvo impedimento concreto. Registrar PID/comando próprio e URL; não encerrá-lo automaticamente ao produzir o relatório. Não usar banco de desenvolvimento como fixture nem disponibilizar senhas no relatório.

## 10. Entrega e critérios de encerramento

Apresentar uma matriz T1–T6 e sua correspondência N0–N8. Para cada item: responsável, SHA/conteúdo, caminhos alterados, resultado utilizável, testes, pendência e próximo ato. Não classificar como bloqueio externo um serviço ainda não programado, um caminho sem tela ou um teste que não foi escrito.

Entregar links das novas telas, perfis de acesso, capturas por família afetada e roteiros curtos: habilitar módulo; preparar/constituir crédito quando permitido; solicitar/analisar certidão; consultar Receita/Pessoal; filtrar despesa além da primeira página; alterar publicidade de localização; atender pedido; reservar guichê; glosar/estornar com consequência visível.

Atualizar catálogo existente com fonte/item/página, exigência literal, desenho de engenharia, regra dependente de fonte e melhoria adicional. Verificar fontes normativas oficiais e vigência antes de fixar regra fiscal ou prazo. Preservar decisões históricas e não declarar seção inteira do TR atendida por um layout. Não mostrar códigos do catálogo, nomes técnicos de pendência ou TR no frontend.

Relatório de implantação: fonte e artefato Linux identificados, ambiente testado, estado de AWS/DNS/TLS, backup/restore e rollback, evidência do identificador publicado quando houver. Não escrever "ponta a ponta" para roteiro ainda com placeholders indispensáveis ou etapas não ensaiadas.

Continuam vedados: novo repositório/ledger/cadastro duplicado de Pessoa, alteração de stash, execução dos scripts de terceiros, push sem autorização, dados produtivos, mensagens reais, pagamentos e transmissões fiscais. A marca Engine oficial e "Desenvolvido por Engine Sistemas" continuam nas experiências já ajustadas.

## Comando de execução

Execute esta ordem a partir do estado real de 22b8dc3 ou descendente explicado. Preserve V9 e siga T1–T6 sem parar no primeiro bloqueio da AWS. Entregue primeiro as frentes internas ainda não iniciadas, corrija as consultas parciais e o aceite de implantação, e finalize a homologação em sequência. Não refaça N0/N1 nem reconstrua U7/U8/B1. A conclusão precisa ser demonstrável por telas, atos, documentos e evidências, com servidor local disponível e situação externa verdadeira.

## Fonte externa consultada

Autenticação AWS CLI usando sessão do console, requisitos e perfil nomeado: https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sign-in.html

As demais constatações desta ordem vêm da leitura remota de 22b8dc3, ESTADO-EXECUCAO.md, AWS-PREFLIGHT-V9-N7.md, IMPLANTACAO-LIGHTSAIL.md, pos-dns.sh, release-do-candidato.mjs e MODULO.md do M34. Nenhum teste ou provisionamento foi executado pelo orquestrador nesta revisão.
