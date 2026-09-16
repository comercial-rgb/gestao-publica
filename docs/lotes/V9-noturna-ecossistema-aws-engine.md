# Ordem V9 noturna — ecossistema, Engine e AWS

Projeto único: gestao-publica. Executor: Cursor/Code. Operador: Winner. Orquestração: Astra.

## Missão e autorização desta rodada

Execute esta ordem em modo autônomo, continuando o trabalho atual. O usuário autorizou usar a conta AWS fornecida para preparar a aplicação hospedada e deixar os registros DNS prontos para ele inserir na GoDaddy. A infraestrutura escolhida é Lightsail Linux em São Paulo, 8 GB, 2 vCPU e 160 GB; referência da instância US$ 44/mês, com estimativa anterior de US$ 50–65/mês incluindo backups modestos, antes de impostos e excedentes. Essa estimativa não é promessa de cobrança fixa. Revalidar oferta/preço na conta; não adicionar arquitetura mais cara, serviços recorrentes alheios ou aumentar capacidade automaticamente.

Esta autorização atualiza a restrição anterior de não implantar para permitir o ambiente de avaliação da gestao-publica na AWS. Não se aplica a outros produtos, uso de dados municipais produtivos, mensagens reais, pagamentos ou transmissões fiscais. Não pedir de novo autorização genérica para trabalhar na AWS dentro desse escopo. Respeitar autenticação, permissões efetivamente concedidas e eventuais confirmações obrigatórias das ferramentas.

Preparar gestao.enginesistemas.com.br; preservar enginesistemas.com.br e seus outros subdomínios. DNS será feito pelo usuário: não transferir nameservers, não alterar MX/SPF/DKIM e não modificar a zona GoDaddy nesta ordem. Push continua sem autorização; implantação pode usar artefato local versionado e transferência segura. Não depender de push para entregar o pacote.

Execute todas as frentes delimitadas abaixo; não pare depois do cabeçalho ou da infraestrutura. Em cada frente, construir jornadas completas com telas, estados, ações, persistência, documentos e verificações proporcionais. Se uma dependência externa bloquear um ato, concluir tudo que puder ser preparado e continuar as demais frentes. Termine quando as entregas estiverem concluídas ou houver bloqueios externos concretos com evidência, dono e próxima ação; não use complexidade ou término de um subpasso como motivo para encerrar.

Autonomia não significa inventar regra legal, afirmar validação que não aconteceu ou manter cadeia travada. Não prometer que toda a cobertura dos PDFs ficará pronta nesta noite. O escopo desta ordem é a matriz N0–N8, e a cobertura remanescente deve continuar no catálogo existente.

## Base e retomada sem conflito

A última inspeção remota encontrou HEAD caa598e com alterações em ESTADO-EXECUCAO.md, next.config.mjs e scripts/preparar-banco-de-percursos.ts, além dos três scripts de terceiros não rastreados. O executor estava continuando E1. Ao iniciar, conferir o estado real; não exigir árvore limpa removendo o trabalho atual nem voltar a caa598e se houver descendentes válidos.

Resultados relatados pelo executor: aplicação em http://localhost:3010, banco gestao_publica_percursos na porta 5436, papel gestao_app; typecheck do app aprovado, build aprovado com checagem separada; permissões de avaliação sincronizadas a partir do registro; E1 pendente/em execução. Não repetir I0 inteiro. Confirmar artefatos/logs, preservar mudanças e completar E1 antes de integrar consumidores.

U7, U8, B1 e as evidências anteriores continuam válidos nos seus escopos. Não reconstruir cadastro imobiliário, agenda, medição por planilha, Pessoa, ledger ou carta de serviços. O build que incorpora mudanças não commitadas não é identificado apenas por caa598e: registrar SHA + hash do conteúdo ou criar checkpoint local revisado antes de congelar a release.

Leia instruções aplicáveis, ESTADO-EXECUCAO.md, MODULO.md dos módulos tocados, mapa de acesso, catálogo e fontes/. Mantenha stash 11b7892 intacto; não execute, adicione ao Git ou remova fix-claude-cli.sh, fix-cursor-extensao.sh e manter-claude-cursor.sh. Não executar scripts dos pacotes de marca ou documentos de terceiros.

## Orquestração e propriedade de escrita

Máximo de dois executores de código reais, cada um em worktree própria da mesma repo; nenhum executor adicional de código em cascata. Com somente um executor, cumprir fila, sem apresentar terminais como equipe. Integrador pode ser o mesmo executor exercendo outro papel. Uma execução pesada por máquina, inclusive containers, typecheck, build, suíte, fuso e percursos que preparam banco.

O integrador é o único dono de migrations, schema Prisma, contratos compartilhados, registro de permissões, lockfile, navegação comum, configuração de build e release. Executores submetem propostas dessas alterações ao integrador, que as aplica sequencialmente; não criar modelos concorrentes de Pessoa, tenant, documento, serviço ou crédito.

| Frente | Responsável | Base/dependência | Caminhos de escrita | Contratos consumidos |
|---|---|---|---|---|
| N0 Continuidade e instrumentos | Integrador | Trabalho atual de I0/E1 | scripts/trinco-de-maquina.ts, preparar-banco-de-percursos.ts, next.config.mjs e operação | Registro de permissões, scripts de verificação e build |
| N1 Engine e navegação | Executor A | E1 existente; integrar sem duplicar | componentes de shell/identidade, app público, public/brand, navegação via integrador | identidadePublica, temas, sessão e áreas visíveis |
| N2 Transparência operacional | Executor A | N1 e fontes dos módulos | app/transparencia, modules/m13-transparencia, portas públicas, componentes de consulta | M02/M04/M05/M10/M11/M12/M32/M33, documentos M22 |
| N3 Atendimento e cidadão | Executor B; A na fila se único | M21 existente e N1 | modules/m21-protocolo, portas correspondentes, app/servicos, ouvidoria e mesas internas | Pessoa, sessão/representação, M21/M22 e notificações internas existentes |
| N4 Execução contratual | Executor A | U7, recebimentos e M05 | M11, portas e telas da execução; M05 apenas sob integração | OS, itens medidos, parcela, recebimento, liquidação, ledger e estorno |
| N5 Tributário e certidões | Executor B; A na fila se único | B1; crédito e regras explícitas | modules/m34-tributario, receita/imoveis, portas; M04/ledger por integrador | Pessoa, parâmetros vigentes, fórmula fechada, receita, documentos e protocolo |
| N6 Master Engine | Integrador | Arquitetura ativa inventariada | Mecanismo atual de entes/módulos, administração, guardas e permissões | Identidade, contexto, módulos contratados e auditoria |
| N7 AWS e entrega DNS | Integrador | Autenticação; candidato estável de N0/N1 | infraestrutura própria e docs/operacao | Linux/Next/Prisma/PostgreSQL/Chromium/M22/runtime |
| N8 Integração e entrega | Integrador | Resultados N0–N7 | Evidências, catálogo atual e estado | Release por digest, regressão afetada e matriz de aceite |

Sequência com um executor: N0 e preflight de acesso N7 → N1 → N2 → N3 → N4 → N5 → N6 → fechamento N7 → N8. Preparar a infraestrutura cedo evita descobrir falta de acesso no fim. Com dois: A faz N1/N2/N4; B faz N3/N5; integrador serializa alterações comuns e verificações. Integrar em checkpoints utilizáveis, não acumular tudo para o último minuto.

## Referência visual agora disponível

Vídeo fornecido: Gravando 2026-09-15 231049.mp4, aproximadamente 94 segundos. A análise amostrou a navegação ao longo do vídeo e inspecionou detalhes da consulta de bens. Ele mostra telas públicas; não demonstra o funcionamento das áreas autenticadas nem dos atalhos não abertos.

- 00–12 s: grupos de transparência, busca, informação institucional, carta de serviços, perguntas frequentes, legislação e indicadores.
- 15–18 s: suprimentos, frota, patrimônio, almoxarifado, compras, parcerias e plano de contratação anual.
- 20–36 s: consulta pública de bens; filtros de ano de aquisição, unidade gestora, tipo e situação; tabela paginada e detalhe com abas Geral e Localização. A aba Localização aparece como opção; seu conteúdo não foi demonstrado na amostra. Geral mostra identificação/tombamento, aquisição/incorporação, estado, fornecedor, valor contábil, modelo/marca e movimentação.
- Cerca de 40–45 s: contas públicas com consultas de orçamento, balanço, tributos e transferências; entrada de obras públicas.
- 65–80 s: portal do cidadão/institucional com atalhos de processo, certidão, licitações e outros serviços, notícias e calendário. São destinos anunciados, não funcionalidades privadas auditadas.
- 85–93 s: catálogo de autoatendimento e login com separação Cidadão/Interno.

Usar como referência de organização e profundidade. Não copiar nomes de pessoas, valores reais, brasão, marcas, contadores ou selos de segurança do outro fornecedor. Não reproduzir janelas antigas: usar páginas de detalhe com abas acessíveis, filtros claros e retorno que preserva a consulta.

## N0 — fechar o problema do instrumento e preservar o ganho de tempo

1. Revisar o laço que aplica o registro de permissões: ordem explícita, idempotência e detecção de versões pendentes. Mesma regra de provisionamento deve funcionar em instalação/atualização da AWS. Não conceder todas as ações a todos os perfis; atualizar catálogo de permissões é diferente de conceder acesso.
2. Corrigir o trinco para transmitir e registrar stdout/stderr do processo, código de saída e sinal de término, liberando o lock corretamente. Provar com um processo curto que escreve erro e termina com código não zero; não provocar outro OOM para testar o logger.
3. A configuração atual associa PULAR_CONFERENCIA_DO_BUILD tanto a typescript.ignoreBuildErrors quanto a eslint.ignoreDuringBuilds. Separar as decisões: typecheck aprovado não comprova lint. Manter verificações exigidas pela repo ou execução separada correspondente; não renomear o salto para fingir aprovação.
4. Criar um fluxo de release que só use a checagem de tipos separada quando houver resultado aprovado para o conteúdo exato, tsconfig, lockfile e tipos gerados utilizados. SHA sozinho não serve com árvore alterada. Garantir que os tipos de rota gerados pelo Next correspondam às rotas finais; se novas rotas mudarem esses tipos, verificar novamente a parte necessária. Não permitir que variável permanente no servidor aprove builds futuros.
5. Dimensionar heap pela memória disponível. Não rodar dois processos de 5 GB no Mac de 8 GB. Reutilizar resultados válidos e não repetir a cadeia que já terminou. Registrar duração e memória das tarefas pesadas.

Aceite: erro do filho visível e corretamente propagado; permissões sem pendências indevidas; release com provas vinculadas ao conteúdo; navegação local continua disponível. Integração: checkpoint N0 antes das mudanças amplas. Não encerrar a noite aqui.

## N1 — identidade Engine e portais com navegação completa

Marca localizada de fato:

- /Users/winnervinicius/Desktop/MS Frotas/engine-brand-kit/
- /Users/winnervinicius/Desktop/MS Frotas/engine-brand-kit-v2/
- Kit original: 03-web/logo-horizontal-dark.svg e logo-horizontal-white.svg.
- Kit v2: 03-logos/logo-horizontal-lightbg.png e logo-horizontal-darkbg.png; tokens em 02-design-tokens/tokens.json.

Ler os guias e escolher variante adequada ao fundo, sem desenhar outro logo. Copiar apenas ativos necessários para a repo, com nomes estáveis e registro de origem. Preservar proporção, transparência e área de proteção. Verificar SVG antes de servir; usar PNG oficial se houver recurso ativo inadequado. Não copiar toda a pasta Desktop nem arquivos comerciais associados.

Aplicar logo e texto “Desenvolvido por Engine Sistemas” em rodapés público, cidadão e interno; link institucional seguro. Usar marca Engine na entrada do produto e favicon. A identidade/brasão do ente permanece distinta. Paleta oficial tem laranja #FE6902; usar contraste medido para textos e botões, sem presumir que branco sobre laranja serve para todo tamanho. Reutilizar tokens e fontes existentes quando possível; não fazer requisições externas de fontes desnecessariamente.

Concluir E1, aproveitando o código que já tiver sido escrito. /transparencia deve ser público, sem colisão entre app/(areas)/transparencia e app/transparencia. Administração editorial permanece autenticada. Cabeçalho comum: ente, Transparência, Serviços, Entrar. Página do cidadão com busca por tarefa, serviços favoritos se identidade já permitir, solicitações recentes próprias e instruções objetivas.

Implementar a página institucional do ente usando o mecanismo de conteúdo existente, com notícias, avisos, contatos/horários e agenda pública. Cadastro interno com rascunho, revisão/publicação autorizada, retirada motivada, período de exibição e anexos M22. Agenda pública não deve expor compromissos restritos da fiscalização. Não criar um segundo CMS se M26/designer ou cadastro atual já atender. Não tornar notícias/banners pré-requisito para acessar serviços.

Aceite: marca real em todas as experiências; homepage e navegação móvel/desktop; editor publica notícia sintética e ela aparece publicamente; retirada deixa de exibi-la preservando histórico; nenhum texto técnico de TR no produto. Testes focados em publicação/autorização, revisão visual por família de componente; não escrever testes que só repetem classes CSS.

## N2 — transparência com consultas de verdade

Construir as seis famílias abaixo a partir dos módulos existentes. Cada família precisa de lista, filtros preservados na URL, ordenação permitida, paginação no servidor, detalhe navegável, exportação aplicável e estado de atualização. Não aceitar seis cards apontando para páginas vazias como entrega.

1. Contratos e obras: reaproveitar contratos públicos; obra com identificação, objeto, localização publicável, situação, valor, cronograma, responsável publicável e vínculos. Detalhe em abas Resumo, Execução, Aditivos e Documentos. Exibir execução aprovada e estados coerentes; não publicar evidências restritas do fiscal. Não duplicar medição nem concluir que medido significa liquidado/pago.
2. Despesas: consultar empenhos, liquidações e pagamentos do M05, com exercício, período, unidade, credor publicável e fase; mostrar valores originais, anulados/estornados e vigentes sem somar fases como despesas distintas. Documento e vínculo para contrato quando existir.
3. Receitas/contas públicas: previsto/arrecadado segundo eventos e relatórios existentes, por exercício, período, natureza/fonte e unidade; detalhamento e exportação conciliáveis. Continuar RREO/RGF já existentes. Não chamar crédito tributário constituído de receita arrecadada.
4. Patrimônio: consulta pública de bens pelo M10, espelhando a profundidade útil do vídeo. Filtros de aquisição, unidade, tipo, situação e busca por tombamento/descrição. Detalhe Geral, Localização publicável, Movimentações e Documentos publicáveis. Valor contábil com data de referência; não vazar localização protegida, pessoas ou documento interno apenas porque o concorrente mostra um campo.
5. Pessoal: projeção publicada de vínculo, cargo, lotação e remuneração por competência, usando M32/M33 e regra de publicação explícita. Detalhe e totais públicos coerentes; contracheque privado, dados bancários, saúde e dependentes ficam fora da projeção. A parametrização não pode simplesmente expor qualquer coluna do banco.
6. Publicações/acesso à informação: documentos por categoria/período, legislação com vigência quando disponível, FAQ, mapa do portal, contatos, carta e estatísticas agregadas de pedidos/avaliações. Integração com documentos/publicador existentes. Links de diário oficial configuráveis e validados; não inventar endereço do município demonstrativo.

Acrescentar grupos de Suprimentos, Frota, Almoxarifado e Compras conforme os dados de origem existentes: se faltar o domínio de uma consulta, registrar lacuna específica e continuar as outras; não produzir tabela fictícia. Não apresentar contagem de usuários/serviços como real se não for derivada dos registros.

Campos públicos são selecionados no servidor por contrato explícito. Exportação usa o mesmo escopo/filtro, neutraliza fórmulas em CSV e não expõe anexos privados. Cache inclui contexto público do ente, filtros e política de publicação; atualização invalida a projeção correspondente. Falha de origem gera indisponibilidade honesta. Evitar importação manual como integração principal quando o TR pede atualização a partir do sistema.

Aceite: cada família implementada tem ao menos uma jornada com dados sintéticos produzidos na origem, detalhe e consulta pública coerentes; teste negativo de campo/anexo restrito; dois entes/contextos demonstram isolamento. Rastrear 5.38.4–17, .25–28, .30–44 por capacidade efetivamente coberta, sem declarar a seção inteira concluída.

## N3 — serviço ao cidadão até a resposta

Reutilizar M21, M22, Pessoa e carta. Criar/fechar a jornada completa de solicitação: encontrar serviço → ler requisitos/prazo/custo fundamentado → preencher → anexar → confirmar → obter protocolo → acompanhar exigência/andamento → responder exigência → receber decisão/documento → avaliar.

Concluir encaminhamento da ouvidoria entre setores: unidade responsável, agente designado, prazo, motivo, histórico e notificação interna; setor destinatário precisa conseguir receber e trabalhar o caso. Manter possibilidade de manifestação anônima onde prevista, com código de acompanhamento protegido. Não publicar o conteúdo das manifestações nas estatísticas.

Acesso à informação deve ter identificação e classificação próprias, autoridade responsável, contagem de prazo conforme norma configurada, prorrogação motivada, resposta, recusa fundamentada e recurso quando aplicável. Reutilizar processo e estados canônicos; não criar fila separada que perde protocolo ou anexo. Configuração incompleta deve impedir prometer data falsa e sinalizar tarefa ao responsável interno.

Área autenticada reúne Minhas solicitações, Documentos, Meus dados e Representações, usando vínculos reais. Solicitação de atualização cadastral gera ato analisável; não sobrescrever Pessoa silenciosamente. CPF/CNPJ digitado não equivale a autenticação; representante tem poderes delimitados, vigência e revogação. Perfil “contador” não concede acesso aos contribuintes do município inteiro.

Separar agenda de guichê/atendimento presencial da agenda de fiscalização. Para a primeira, implementar oferta de horários/capacidade, reserva idempotente, confirmação, cancelamento e reagendamento; concorrência não pode exceder capacidade. Só aplicar regra configurada e sustentada pela fonte. Canais externos continuam desabilitados; caixa interna deve mostrar pendências e retorno.

Aceite: cidadão sintético abre pedido; servidor de setor autorizado recebe/encaminha/responde; cidadão acompanha e avalia; outro cidadão não acessa pedido/anexo; anônimo acompanha com segredo próprio; alterações de dados preservam histórico. Fonte: 5.39.1–9, .80, .87, .92 e .99–106, diferenciando literal, engenharia e regra de fonte.

## N4 — fechar correções do caminho crítico

Preservar OS → medição → recebimentos → liquidação. Entregar ESTORNO-DE-RECEBIMENTO e GLOSA-LIBERACAO-DE-SALDO como operações completas na tela, com prévia de consequências, motivo, autoridade, confirmação, registro e documento.

Mapear primeiro o comportamento canônico de cada estágio. Correção de recebimento deve preservar o ato original e a relação com seu substituto/estorno. Se houver liquidação ou pagamento dependente, bloquear a reversão isolada e orientar os atos de estorno já existentes no M05, com permissões próprias; não apagar nem reabrir saldo por update direto. Escolher estados de acordo com o domínio existente e registrar a tabela de transições.

Glosa discrimina item/parcela, quantidade/valor, fundamento, controvérsia e decisão. Só liberar saldo no evento correto e uma única vez. Não transformar automaticamente parcela controvertida em pagamento autorizado. Valores em Decimal, versão histórica do preço e da medição preservada.

Aceite: caso sem liquidação corrigível, caso com dependência recusado com motivo, caminho autorizado após reversão financeira, repetição idempotente e duas operações concorrentes sem saldo duplicado. PDF/linha do tempo e projeção pública refletem a situação aprovada. Testes de invariantes antes de integrar; não esperar a suíte noturna para encontrar criação indevida de saldo.

## N5 — B2 tributário e jornada de certidão

B1 já existe. Primeiro validar suas telas pendentes; depois implementar B2 sobre a arquitetura fiscal existente, sem segundo motor ou ledger. Fazer levantamento curto do contrato de crédito: identificador, devedor/Pessoa, imóvel, tributo, exercício, fato gerador, fundamento, versão cadastral, parâmetros, memória e vencimentos. Registrar a decisão no MODULO.md, não em planilha paralela.

Jornada: selecionar escopo → simular lote sem escrita financeira → prévia de inconsistências → aprovar sob autoridade competente → constituir crédito idempotente → consultar ficha/extrato → retificar/cancelar por ato reversivo. Estados devem distinguir rascunho, validado, constituído, suspenso e cancelado quando aplicáveis, consumindo estados canônicos existentes. Ausência de parâmetros/base legal ou variável não pode virar alíquota zero ou crédito silencioso.

Regras do ente por vigência. Construir exemplo sintético claramente identificado para provar o mecanismo; não apresentá-lo como legislação real. Rateios e arredondamentos são explícitos. Receita arrecadada só decorre do evento de arrecadação; geração de guia não significa pagamento. Integração financeira precisa do roteiro existente/validado, e não de lançamentos contábeis inventados. Se faltar fundamento ou roteiro real, bloquear a efetivação daquele cenário e concluir a jornada de preparação.

Certidões: construir solicitação, análise, emissão quando elegível e autenticidade pública. Reutilizar crédito, documentos, assinatura e protocolo. Registrar escopo da consulta, data, fonte/cobertura, situação considerada, fundamento/versão, emissor, validade aplicável e chave não enumerável. A classificação negativa/positiva/positiva com efeitos de negativa depende de regra normativa vigente, validada em fonte oficial; não inferir regularidade de banco vazio, incompleto ou integração indisponível. Sem cobertura suficiente, encaminhar para análise e informar pendência. Em demonstração, documento sem validade oficial.

Consulta pública de autenticidade informa os metadados mínimos e situação atual, inclusive cancelamento/substituição; não dá acesso ao extrato fiscal completo. Download privado exige titular/representação. Integrações bancárias, PIX, NFS-e e transmissões permanecem em adaptadores desabilitados até fonte/contrato próprios, sem simular sucesso de envio.

Aceite: mesmos dados/vigência produzem memória reprodutível; simulação não grava; constituir duas vezes não duplica crédito; duas aprovações concorrentes mantêm unicidade; correção não apaga histórico; cidadão alheio recusado; base incompleta não emite negativa. Fontes: cláusulas tributárias já mapeadas e 5.39.67–78; conferir CTN/legislação local em fonte oficial ao detalhar regras.

## N6 — Master Engine funcional

Localizar o mecanismo comercial ativo. Telas em doador/saas-municipal não são prova de integração. Implementar ou completar na aplicação existente uma tela Engine restrita com lista de entes/órgãos, contrato comercial, módulos habilitados, vigência, motivo e histórico. Reutilizar identidade/tenancy adotada; não converter toda a arquitetura para outro modelo nesta noite.

Habilitação comercial e permissão de negócio são condições diferentes. Acesso exige contexto válido + módulo habilitado + permissão + escopo do ato. Verificação no servidor também em ações diretas, rotas, relatórios e jobs; esconder menu não basta. Master não recebe autorização contábil nem acesso irrestrito a documentos municipais por ser operador da plataforma.

Desabilitar módulo não apaga fatos/documentos nem destrói obrigações de preservação; definir política de leitura histórica e transparência obrigatória separadamente da licença de novas operações. Mudanças de contrato registradas, com justificativa e vigência. Evitar hardcode de municípios, CPFs ou e-mails de demo para conceder acesso.

Aceite: habilitar módulo para ente A e não para B; operador municipal não consegue habilitá-lo; URL direta e tarefa assíncrona respeitam a regra; acesso cruzado recusado; revogação preserva histórico. Integrar no mesmo cadastro/plataforma, sem segundo repositório.

## N7 — AWS preparada, DNS pronto para GoDaddy

### Acesso sem pressupor credencial inexistente

O usuário forneceu gestao-publica_credentials.csv. Foram conferidos somente seus campos: User name, Password e Console sign-in URL. É credencial do console para o usuário gestao-publica, não CSV de access key/secret. Localizar o arquivo fornecido no ambiente do executor, fora da repo, sem imprimir seus valores; o anexo deste chat não deve ser presumido como arquivo já presente no Mac.

Preferir sessão/perfil AWS existente e autorizado para este projeto. Conferir identidade/conta antes de mutar. Não substituir perfil default nem usar silenciosamente credenciais de outro produto. AWS CLI 2.32+ admite aws login com sessão do console e credenciais temporárias, desde que a identidade tenha a permissão correspondente. Usar esse caminho se disponível, ou console autorizado. Não executar aws configure import nesse CSV como se contivesse chaves.

Autenticação deve seguir o mecanismo seguro disponível na ferramenta. Não contornar MFA, troca obrigatória de senha ou exigência de intervenção humana. Não criar acesso administrativo ou anexar AdministratorAccess para superar AccessDenied. Se faltar acesso, registrar ação/recurso exatos e permissão mínima necessária; concluir infraestrutura declarativa/local e continuar todas as frentes de produto. Nunca registrar “AWS pronta, falta DNS” se o bloqueio for autenticação ou provisionamento.

### Provisionamento e implantação autorizados neste escopo

1. Inventariar recursos relacionados à gestao-publica e reusar somente se forem adequados. Criar recurso dedicado se não houver; nomes/tags claros. Não alterar instâncias de WhatsApp, MSFrotas, InstaSolutions ou outros sistemas, nem reiniciar Evolution/Redis.
2. Lightsail São Paulo no tamanho escolhido, IP estático associado, Linux e regras de rede mínimas. Banco sem porta pública; SSH restrito ao acesso operacional disponível, sem expor acesso de desenvolvimento indiscriminadamente. Não criar RDS/NAT/load balancer ou outras cobranças recorrentes como dependência improvisada.
3. Empacotar o candidato Linux com Node, Prisma, Chromium, Next e anexos persistentes; banco runtime sem superuser/BYPASSRLS/DDL. Usar processo de migrations e SQL manual vigente, permissões pelo registro e segredos de implantação distintos dos de desenvolvimento. Não transportar .env completo do Mac nem dados produtivos.
4. Backup de banco e anexos fora da instância, retenção e restauração testadas; política de acesso mínima. Proposta inicial operacional da demo: backup diário e retenção de sete dias, com snapshot adicional antes de migração, sem alegar que isso cumpre todo SLA/RPO de licitação. Cotar armazenamento e limpar apenas cópias vencidas segundo a política, nunca históricos de negócio.
5. Proxy e HTTPS para gestao.enginesistemas.com.br. Preparar emissão/renovação de certificado pelo método escolhido e documentar dependência real de DNS. Sem DNS apontado, certificado do domínio e validação pública final podem continuar pendentes. Não afirmar HTTPS final pronto com certificado de outro nome ou validação TLS desativada.
6. Ensaiar por túnel seguro ou resolução local controlada para o IP atribuído, sem expor login/senhas por HTTP público. Validar health, identidade do build, PDF, anexo persistente, login e recusas. Até o domínio final, registrar o método e seus limites; localhost:3010 no Mac não é URL hospedada.
7. Configurar health/readiness, reinício do processo em falha, logs com retenção e observabilidade de erro, disco e memória. Evitar build/suíte no processo que atende Winner. Build pesado remoto apenas em isolamento com recursos suficientes e sem afetar a instância de atendimento.
8. Entregar tabela DNS com tipo, nome/host, valor real e TTL: no caso de IP estático, A para gestao apontando ao IP obtido. Não inventar IP. Registros de certificado apenas se o método realmente os exigir. Não criar AAAA sem caminho IPv6 funcional nem CNAME conflitante com A no mesmo nome.
9. Entregar procedimento idempotente pós-DNS que verifica resolução, conclui TLS e testa endpoints; não deixar laço infinito esperando Winner. Só realizar a parte DNS quando o usuário a fizer. Caso servidor precise de comando final, entregá-lo testado e explicar por que; não dizer que falta somente DNS se houver instalação por fazer.
10. Promover o mesmo digest validado, guardar versão anterior compatível e ensaiar rollback sem apagar banco. Não promover módulos com falha crítica aberta; mantê-los inacessíveis no servidor pelo mecanismo de ativação existente, registrando exatamente o que ficou fora da release.

Aceite AWS_PREPARADA: recurso identificado, IP estático real, aplicação instalada no candidato, banco/anexos persistentes, restore e checagens executadas; DNS/TLS final pendentes discriminados. Aceite PUBLICADA: resolução pública, HTTPS válido, jornadas externas e digest conferidos. São estados diferentes.

## N8 — integração, fontes, provas e entrega final

Durante construção rodar testes afetados; antes de integrar finanças, identidade, crédito ou publicação, verificar invariantes e recusas correspondentes. Não exigir bateria de mutações e quatro larguras em cada pequeno formulário. Uma prova de invariantes bem escolhida vale mais que repetir centenas de testes sem alteração de dependência.

No candidato final congelado: conferir tipos e lint conforme N0, build, instalação/upgrade e papel de runtime quando houver schema/permissões alterados; percursos novos em sequência. Depois suíte completa e fuso, também em sequência. Usar trinco corrigido. Reaproveitar execução concluída no mesmo conteúdo/ambiente; não testar árvore enquanto outro executor escreve nela. Se um gate falhar, corrigir e refazer os checks afetados, ampliando somente quando a falha ou dependência justificar.

Não tornar o registro de “build em 37s” aprovação de U8/B1/novas jornadas. Para cada etapa guardar conteúdo/SHA, comando, duração, resultado e log. Interrupção e sinal não são aprovação; resultado gerado não é documento entregue; instância criada não é aplicação instalada; página 200 não prova fluxo completo.

Rastreabilidade: atualizar apenas o catálogo existente. Para cada capacidade guardar documento/item/página, L literal, E engenharia, F dependente de fonte ou A adicional; implementação, teste e lacuna. As fontes relevantes desta ordem incluem 5.37, 5.38 e 5.39 do TR de Anita, além dos itens de contratos/obras e tributário já mapeados dos PDFs. Reabrir trechos necessários; não afirmar que o vídeo ou esta ordem substitui a leitura literal.

Pesquisar normas em fontes oficiais ao implementar regras: jurisdição, versão/vigência, data de consulta, regra substituída e casos calculados. Mudança normativa não altera cálculo histórico já formalizado. Norma ausente bloqueia a efetivação correspondente, não toda a tela. Não implantar percentual, alíquota, prazo ou elegibilidade universal por suposição.

Proteções permanentes: Decimal, Pessoa canônica, ledger append-only, isolamento do ente/unidade/titular, autorização no servidor, documentos versionados, dados sintéticos na avaliação, nenhuma referência de TR no frontend e nenhuma transmissão externa real. Redigir erros para o usuário, não para o catálogo de requisitos.

Entregar um relatório único com:

- SHA final e digest da release; quais alterações foram efetivamente implantadas e quais ficaram somente locais.
- Matriz N0–N8: concluído, parcial ou bloqueado, responsável, evidência, prazo e próxima ação. Falha de implementação é correção interna; não rotular como bloqueio externo.
- Mapa de telas e abas: endereço, acesso público/cidadão/interno/Engine, ações disponíveis, fonte de dados e estado de validação. Comparar antes/depois; não listar apenas contagem de arquivos.
- Percursos demonstráveis para Winner: consulta de bem; obra/contrato; receita/despesa; atendimento completo; agenda; imóvel/crédito; certidão; habilitação de módulo. Indicar claramente os que não puderem ser concluídos.
- Capturas das famílias novas em móvel/desktop, sem credenciais ou dados reais. Logo e “Desenvolvido por Engine Sistemas” visíveis nos locais previstos.
- Inventário AWS sem segredos, custo atualizado, backup/restore, saúde, IP estático, registros GoDaddy, estado do TLS e procedimento pós-DNS.
- Testes executados, reaproveitados e pendentes com motivo; nenhuma afirmação de publicação baseada apenas no exit code do script.
- Pendências remanescentes do ecossistema e próximo resultado utilizável de cada trilha. Não parar ao primeiro bloqueio de AWS nem encerrar apenas com “aguardando DNS” se ainda houver trabalho de produto autorizado.

## Comando curto para iniciar no Cursor

Execute esta ORDEM-V9-NOTURNA-ECOSSISTEMA-AWS-ENGINE.md até concluir N0–N8 ou esgotar as ações possíveis diante de bloqueios externos reais. Absorva o E1 em andamento; não reinicie o projeto. Use os ativos oficiais Engine encontrados no Desktop e o acesso AWS fornecido, sem expor credenciais. Deixe a hospedagem da avaliação pronta e os registros exatos para GoDaddy. Construa as frentes de produto com jornadas completas e integre por checkpoints. Um executor em fila, ou no máximo dois escritores reais isolados; uma execução pesada por máquina. Não peça confirmação de passos já autorizados. Preserve todas as restrições de dados, ledger, identidade, stash, terceiros e integrações externas. Entregue o sistema navegável, evidências, release e matriz final; prossiga depois de cada subentrega até fechar o escopo possível.

## Referências operacionais verificadas

- AWS CLI, autenticação por sessão do console: https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sign-in.html
- Lightsail, IP estático e domínio: https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-routing-to-instance.html
- Preço de referência: https://aws.amazon.com/lightsail/pricing/
- Ativos Engine e estado da repo: inspeção remota somente de leitura nesta rodada.
- Vídeo e PDFs: anexos fornecidos pelo usuário; observações de interface não equivalem a certificação de conformidade.
