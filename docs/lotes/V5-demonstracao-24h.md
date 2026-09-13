# Execução V5 — demonstração online utilizável e continuidade da suíte municipal

## 0. Resultado desta rodada

Trabalhe exclusivamente em `gestao-publica`. Preserve o monólito modular, o ledger, Prisma/Decimal, as permissões, os documentos e a identidade canônica já existentes. Não crie outra aplicação do zero nem retorne a um commit anterior.

Há dois objetivos distintos:
1. Em uma janela-alvo de até 24 horas de trabalho disponível, produzir um candidato de demonstração comercial: build de produção, dados sintéticos, usuários por papel, operações persistidas e documentos utilizáveis.
2. Continuar o atendimento integral ao TR, pela sequência da Fila A e, depois, B e C. A demonstração é um marco intermediário, não um substituto da POC contratual nem uma declaração de implantação municipal concluída.

`NODE_ENV=production` indica o modo técnico de execução. O ambiente deve continuar identificado como DEMONSTRAÇÃO. Nunca confundir isso com produção operacional da prefeitura.

Não prometa finalizar o TR, homologar integrações ou superar todo o portfólio da IPM em uma sessão. Entregue melhorias mensuráveis nos percursos escolhidos.

Execute continuamente durante a sessão disponível, sem perguntar “posso continuar?” a cada cadastro. Não simule que continuará executando depois que a sessão encerrar.

## 1. Baseline correta: não repetir o trabalho da V4

Último estado INFORMADO pelo executor:
- HEAD local `da9c8ad`, main limpa, sem push.
- Stash `11b7892e7800281f3ef915ee571a967b9383401b` incorporado em `63a3040` e ainda preservado.
- Correções A01–A09 relatadas como realizadas.
- PPA/LDO conciliados em `6aeaa81` e `9a47e8d`.
- Contratação/empenho em `5d7bb39`.
- Compras e recebimento por item em `743b857`.
- Checkpoint e catálogo em `7147b53`, `e133b86`, `c4af2d5`, `da9c8ad`.
- Próximo ponto: nota fiscal recebida como entidade; vínculo empenho × ordem; Fila B.
- Pendências: ARRECADACAO-SEM-CONTA-BANCARIA e M03-T8-TIMEOUT-SOB-SUITE.
- Os testes completos reportados pertencem a SHAs diferentes; não atribuí-los automaticamente ao HEAD atual.

A revisão remota desta rodada encontrou `dc7032a` no GitHub e não conseguiu resolver `da9c8ad`. Isso não é motivo para retroceder: a cópia local é a fonte de execução. Confirme a relação dos commits localmente.

Faça somente:
- confirmar raiz, remote, branch, HEAD completo, alterações e versão do runtime;
- ler resumo e §50 de ESTADO-EXECUCAO.md;
- conferir que as capacidades V4 e o stash incorporado estão na ancestralidade;
- ler os arquivos de domínio e as cláusulas pertinentes ao incremento.

NÃO reaplique o stash; NÃO use `stash pop`; NÃO o apague automaticamente.
NÃO execute os scripts soltos `fix-*.sh` ou `manter-claude-cursor.sh` sem revisão e finalidade explícita.
NÃO reexecute a auditoria completa do snapshot 77cbcc9.
Se um achado antigo já foi corrigido, use seus testes como regressão; não ressuscite a implementação antiga.

Registre este comando em docs/lotes e ajuste somente as instruções operacionais conflitantes. Mantenha a precedência: requisitos do produto, ADRs aceitos e este recorte de execução. Não recoloque decisões superadas de antigos arquivos de análise.

## 2. Organização da janela de 24 horas

As faixas são orçamento de execução, não promessa de duração de implementação.

| Faixa sugerida | Resultado prioritário |
|---|---|
| 0–2 h | Identificar candidato, preparar execução reprodutível e levantar exclusivamente os bloqueios reais de hospedagem. Não consumir a janela em novo inventário. |
| 2–8 h | Concluir nota recebida e ligação ordem–empenho–recebimento–liquidação, com regressões. |
| 8–13 h | Melhorar navegação, feedback contextual, relatórios/PDFs e integrar as entradas dos portais ao que já funciona. |
| 13–16 h | Avançar a Fila B conforme a implementação efetivamente disponível; consolidar a demonstração. |
| 16–24 h | Congelar candidato, validar, empacotar, ensaiar e publicar SOMENTE em ambiente autorizado de demonstração. |

Após o congelamento, não acrescentar funcionalidade ao mesmo candidato. Corrigir apenas defeitos de liberação. O desenvolvimento de B/C que não couber continua em referência separada, sem alterar o build ensaiado.

Se uma etapa consumir o orçamento, reduza a abrangência da apresentação, não a integridade dos fluxos nem as exigências do produto.
Não anunciar RH, folha, NFS-e ou outro domínio como operacional por ter apenas um menu.
Não comprometer o marco de apresentação para tentar construir toda a folha ou todo o tributário durante esta janela.

## 3. Hospedagem: preparar desde o início

Inventarie, sem revelar segredos, se existe alvo já autorizado: provedor/host, subdomínio da empresa, capacidade, acesso, storage e responsável. Não inferir autorização por encontrar uma credencial.

Sem alvo autorizado, prepare e teste o artefato local; registre uma única pendência “alvo de publicação não definido” e continue os demais trabalhos. Não invente URL de acesso.

Não está autorizada a contratação de recursos pagos, mudança de DNS/IAM, publicação em domínio municipal, modificação de ambiente produtivo existente ou transmissão real. A publicação em um novo alvo deve ter autorização específica do operador. Depois de autorizado, publique apenas o candidato de demonstração aprovado.

Preferência para esta fase: runtime Node em container Linux ou servidor equivalente, com PostgreSQL persistente e Chromium disponível. É uma escolha de implantação compatível com os recursos existentes, não uma troca de stack.

Prepare:
- build reproduzível com lockfile, runtime compatível e proveniência pelo SHA;
- dependências nativas do Chromium e fontes licenciadas necessárias, testadas no Linux de destino;
- Prisma gerado na arquitetura-alvo; migrations, SQL manual e rollout de permissões disponíveis ao job de instalação;
- processo web `next start` e processo de relatórios/jobs quando necessário;
- anexos/PDFs em storage durável, fora da pasta pública e fora da camada descartável da imagem;
- proxy reverso/TLS, limites de requisição, proteção de login e cabeçalhos coerentes;
- papel restrito da aplicação separado do papel de migration;
- banco e serviços auxiliares sem portas públicas;
- segredos somente no servidor, nunca em NEXT_PUBLIC, Git, imagens ou relatórios;
- health/readiness sem escrita de negócio e sem vazamento de configuração;
- tratamento de encerramento, conexões e Chromium para evitar processos órfãos;
- backup e ensaio de restauração do banco e dos anexos;
- plano de rollback de código compatível com o schema atual; nunca “desmigrar” apagando fatos.

Não transformar uma aplicação dinâmica com autenticação/banco/PDF em export estático.
Não trocar para outro framework, Kubernetes ou arquitetura distribuída para fazer uma apresentação.
Não copiar node_modules, browser ou caminhos absolutos do Mac para o servidor Linux.
Se usar standalone, verificar inclusão real de static/public, cliente Prisma, artefatos e dependências externas; não habilitar a opção sem ensaio.
Não preservar `--no-sandbox` por conveniência sem avaliar o isolamento efetivo do renderizador. Renderização não deve navegar destinos arbitrários nem acessar metadados de cloud, rede privada ou arquivos locais a partir de conteúdo do usuário.

Permitir uma única instância isolada de demonstração, sem prometer que isso valida a arquitetura multicliente ou a infraestrutura integral do TR. Não desabilitar verificações existentes de entidade/tenant para facilitar o deploy.

## 4. Fila A — nota fiscal RECEBIDA e conclusão do fluxo da despesa

Este é o próximo trabalho funcional. Não reconstruir o PPA, as licitações ou o patrimônio já entregues.

### 4.1 Reconhecimento dirigido

Identifique os modelos de documento fiscal, anexos, ordem, itens, recebimento, contrato, empenho e liquidação existentes. Estenda o modelo proprietário. Não criar “NotaFiscal2” concorrente.

Antes de implementar, escreva os invariantes da relação:
- uma nota pode suportar recebimentos/atestes ou liquidações parciais;
- contrato/ordem/empenho têm papéis distintos;
- registro de nota não produz automaticamente estoque, liquidação nem pagamento;
- parcelas já utilizadas não podem ser utilizadas outra vez;
- cancelamentos e substituições preservam origem e histórico;
- documentos de outro contexto ou fornecedor incompatível devem ser recusados ou exigir exceção de negócio explicitamente prevista.

### 4.2 Modelo mínimo e interface operacional

Ofereça criação, importação quando suportada, consulta, conferência, anexos e histórico.

Campos conforme o documento aplicável:
- entidade destinatária e fornecedor/emitente canônico;
- tipo/modelo, série, número, emissão e recebimento;
- chave de acesso e protocolo externo, quando existirem;
- pedido/ordem, contrato, processo e empenho vinculados;
- itens: identificação, descrição, unidade, quantidades, preços, descontos/acréscimos, total;
- bruto do documento, tributos destacados, retenções efetivamente apuradas no estágio apropriado, saldo a atestar/liquidar;
- XML/PDF/anexos, hash, origem, autor e evidência de validação.

Não force todos os documentos a terem chave de NF-e. Não trate número digitado ou XML recebido como autorização fiscal.
Validação estrutural local, consulta externa e aceitação do órgão são estados separados.
Preserve a compatibilidade vigente de CPF/CNPJ e dos formatos externos.

Use precisão apropriada para quantidade e preço unitário. Não arredondar quantidade física como se fosse moeda de duas casas.
Estabeleça onde ocorre arredondamento e como diferenças são tratadas; não aceite diferença silenciosa.

### 4.3 Importação e duplicidade

Disponibilize percurso manual completo mesmo sem credencial externa. Importação de XML só quando houver parser/validação segura para os modelos suportados.

Preserve o arquivo original, bloqueie entidades externas/DTD, limite tamanho/estrutura/descompressão, valide tipo real e não confie em Content-Type.
Não implemente XML complexo por regex.
Não faça upload público de documentos fiscais internos.

Defina chave natural por modelo, emitente e contexto aplicável; chave externa, quando existir, deve ser única no escopo correto. Hash de arquivo complementa, mas não substitui a identidade da nota.
Teste colisões, reimportação e duas requisições concorrentes.
Não grave arquivo órfão definitivo quando a operação de banco for recusada; tenha finalização/compensação explícita para storage.

### 4.4 Integração com a operação existente

Feche:
ordem → vínculo de empenho apropriado → documento recebido → recebimento/atesto → liquidação → retenções → registro administrativo de pagamento → razão.

Reutilize o ato composto integrado na V4. Se a entrada física já existe, vincule; não receba novamente.
Vincule empenho à ordem pelo serviço correto, respeitando saldo, reserva, adjudicação, contrato e exceções legítimas já modeladas.
Não confunda relação contábil e física em uma única flag.

Inclua documentos sem ordem/contrato quando o caso de negócio realmente permitir. Não transforme a exceção em bypass de autorização, saldo ou duplicidade.

Na apresentação use ao menos duas linhas, recebimento parcial e uma recusa real. Não use somente o caso “um item, recebimento total”.

### 4.5 Pendência M04 e conciliação

Não invente conta bancária para receitas antigas. Apure a relação necessária na origem.
Nova arrecadação deve transportar a identificação bancária/fonte exigida pelo modelo e pela conciliação.
Legado sem mapeamento permanece pendente e reconciliável, sem atribuição em massa a CC-500-01.
Se essa correção não couber, deixe o percurso de conciliação incompleta fora das promessas da apresentação e apresente o estado real quando acessado. Nunca habilitar “encerrar assim mesmo” para o smoke passar.

## 5. Experiência de uso transversal — melhorar junto da Fila A

Use a biblioteca e o molde atuais. Não introduza um segundo design system ou reescreva todas as páginas.

### 5.1 Navegação e dossiês

- Entrada interna com áreas por função, contexto visível, busca permitida, recentes/favoritos e pendências derivadas.
- Listagens com filtros úteis, paginação, ordenação, seleção e totais definidos.
- Detalhes com resumo, itens, documentos, vínculos, movimentações, valores e auditoria.
- “Próxima ação” somente quando permitida e aplicável ao estado real.
- Empty state que diferencia falta de dados, filtro sem resultado, falta de permissão e configuração ausente.
- Links reais entre planejamento, contratação, empenho, nota, liquidação, pagamento e bem.
- Rotas dinâmicas resolvidas pelo contrato; nada de declarar link quebrado só pela ausência de pasta literal.
- Não pedir UUID, não criar datas 00/00/0000 e não esconder regra importante somente em tooltip.
- Não perder rascunho ou trocar silenciosamente seu contexto ao abrir outra aba.
- Voltar, recarregar e acessar por link direto devem funcionar.

A imagem de referência de obras mostra dossiê com contrato/licitação, dotação, recursos e execução. Use esse encadeamento funcional como referência, não copie assets, marcas, código, brasões ou layout proprietário.

Não exponha flags de requisito, números do TR, ENT ou progresso de implementação na interface operacional. Número de processo, norma aplicável, contrato e licitação são conteúdo de negócio legítimo.

### 5.2 Mensagens contextualizadas

“Sem texto padrão” significa sem placeholder e sem mensagem genérica desconectada do ato. Componentes e contratos padronizados são desejáveis.

Reutilize as notificações existentes e represente, quando aplicável:
- código tipado da operação e seu estado;
- referência autorizada do registro;
- quantidades/valores pertinentes confirmados pelo servidor;
- restrição encontrada;
- providência possível e link permitido;
- correlação para suporte sem stack/segredos/dados de terceiro.

Exemplos de COMPOSIÇÃO, nunca valores fixos de produção:
- “Recebimento registrado: {recebido} de {solicitado} {unidade}. Restam {pendente}. Abrir ordem.”
- “Nota {numero}/{serie} recebida. Aguardando atesto de {setor}.”
- “Empenho {numero} emitido em {entidade}. Valor: {valor}; saldo disponível: {saldo}.”
- “Não foi possível liquidar: {parcela} já foi utilizada em {referencia_autorizada}.”
- “Relatório pronto: {quantidade} registros no período {periodo}. Baixar PDF.”

Só afirmar sucesso depois do resultado autoritativo.
Em perda de resposta/resultado desconhecido, dizer que é preciso consultar a operação; não afirmar “nada foi gravado”.
Repetição idempotente deve explicar que o ato anterior foi recuperado, sem sugerir nova gravação.
Sessão expirada deve preservar rascunho seguro e pedir autenticação, sem revelar dados.

Use mensagem inline em erro de campo, banner para restrição persistente e feedback não bloqueante para sucesso.
Avisos críticos não desaparecem em poucos segundos. Não usar modal para toda ação.
Atualize listas/totais sem desmontar a mensagem e perder o contexto do formulário.
Não gerar textos financeiros por IA sem lastro; prefira templates determinísticos alimentados pelo resultado.

Acessibilidade: rótulos, foco, aria-live/role=status para atualizações apropriadas, role=alert para erros relevantes; evitar excesso de anúncios.

### 5.3 Avisos institucionais

Avisos publicados no portal são outro objeto, não eventos transacionais.
Reutilize comunicação/conteúdo: título, texto sanitizado, público, entidade, vigência, prioridade, destino permitido, autor e publicação.
Exibir somente aviso ativo e pertinente. Sem banners fictícios de economia, prazo ou disponibilidade.
Na janela curta, não construir um CMS completo para conseguir publicar dois avisos.

## 6. Relatórios, exportações e PDFs detalhados

Reutilize M12, M26, lib/pdf, documentos e o processamento de relatórios existentes.
Não copie regras de saldo da camada de domínio para templates.

### 6.1 Relatórios prioritários

A entrega mínima selecionada é:
- resumo de PPA/LDO e dotações conforme recursos já entregues;
- espelho de contratação/contrato com itens, aditivos e execução;
- ordem de compra e recebimentos, incluindo pendências por item;
- documento fiscal recebido e conferência contra a origem;
- dossiê do empenho com liquidações, retenções, pagamentos, estornos e partidas;
- termos e posição patrimonial existentes.

Adicione relatório de servidor somente se a base correspondente estiver integrada. Não produzir holerite fictício para preencher um botão.

### 6.2 Um conjunto de dados, saídas coerentes

Tela, CSV, XLSX e PDF devem usar o mesmo contrato de consulta e autorização.
Distinguir “página atual”, “selecionados” e “todos os resultados do filtro”.
Informar filtros, período de referência, data de extração, total de registros e regra dos totalizadores.
Não prometer identidade entre consultas feitas em momentos distintos quando houve mutação intermediária; fixe snapshot/instante ou deixe essa diferença identificada.

No trabalho assíncrono:
- registrar pedido, estado e progresso real;
- capturar filtros/contexto autorizados;
- revalidar autorização de acesso ao resultado;
- não devolver arquivo de outro usuário/entidade por chave previsível;
- controlar tamanho, concorrência e expiração.

CSV/XLSX: prevenir fórmulas executáveis provenientes de texto do usuário sem alterar silenciosamente o dado canônico; preservar zeros à esquerda e tratar datas/decimais com clareza.
Não renomear CSV para .xlsx. Se XLSX não estiver disponível, declarar isso e implementar corretamente depois.

### 6.3 Anatomia do PDF

Documento deve conter, conforme sua finalidade:
- identidade institucional correta e título;
- número/ano, versão documental e situação;
- contexto, partes, período e datas relevantes;
- itens completos com unidade, quantidade, preço, descontos e total;
- bruto, retenções, líquido, saldos e referências pertinentes;
- histórico necessário e índice de anexos;
- origem dos dados e responsáveis efetivamente registrados;
- paginação, cabeçalho repetido, margens e totalizadores legíveis;
- código de verificação/hash quando implementado, com explicação correta.

Não inventar assinatura, carimbo de homologação nem situação externa.
Documento de demonstração deve ser identificado como sem validade fiscal, sem referência ao TR.
Original/segunda via estável e posição atual são artefatos distintos; preserve a solução de snapshot implementada na V4.

Teste:
múltiplas páginas, nomes longos, acentos, zero registros, duas entidades, duas moedas somente se o domínio suportar, muitos itens e cancelamentos.
Verifique conteúdo e totais, não apenas MIME ou tamanho > 0.
Renderize e inspecione páginas para corte, sobreposição e tabelas quebradas.
Bloqueie requisições de rede não autorizadas do renderizador.

“PDF com layout profissional” não substitui o designer completo requerido pelo TR. Mantenha a classificação correta de cada capacidade.

## 7. Portais: frente visível e ligada à retaguarda

As rotas abaixo são destinos PROPOSTOS. Reutilize as existentes quando equivalentes e mantenha aliases necessários:
- /cidadao;
- /autoatendimento;
- /transparencia;
- /portal-servidor;
- /login.

Não colocar a interface interna irrestrita dentro de iframe público.

### 7.1 Entrada e autenticação

Uma identidade confiável pode acessar contextos diferentes conforme vínculos. Escolher a aba “Interno” ou “Servidor” não concede privilégios.
Cadastro de cidadão não cria usuário administrativo.
Criar usuário interno deve utilizar bootstrap/serviço administrativo autorizado, com trilha e senha não versionada.
Vínculo usuário–pessoa–matrícula ou representação de fornecedor precisa ser explícito, nunca por nome parecido.
No ambiente demo, contas de exemplo recebem senhas geradas por execução e entregues privadamente. Não publicar senha de admin numa página de acesso.

### 7.2 Portal do cidadão e autoatendimento

Construa entrada clara, busca por serviço, agrupamento por necessidade, requisitos, documentos, custo/prazo quando parametrizados, necessidade de login e ação para iniciar.
Banners pequenos e informativos; conteúdo útil acima da dobra, sem imagem gigante escondendo o serviço.

Reutilize o protocolo para pelo menos:
iniciar solicitação → anexar documento → obter número → tramitar internamente →
pedir complementação ou decidir → consultar andamento e resposta como requerente.

Só isso permite declarar o serviço como executável. Cartão que abre outra tela vazia não atende.

Sem cronograma configurado, não inventar prazo legal. Sem integração externa, não dizer “enviado”.
Notificações externas permanecem em sink/teste até autorização.

### 7.3 Transparência

Reutilize projeções públicas, com seleção explícita de campos publicáveis.
Exibir grupos úteis, busca, filtros por exercício/entidade, última atualização real, detalhes e exportações.
Não serializar objeto interno completo para depois esconder colunas.

Priorize contratação, despesas, receitas, relatórios e obras onde houver dados de origem disponíveis.
Ausência de dados não equivale a valor zero.
Não exponha CPF integral, contato privado, anexos restritos, dados bancários ou auditoria interna.
Não copiar dados reais do portal de Anita Garibaldi para fingir implantação.

### 7.4 Fila B — RH e portal do servidor

Após concluir a cadeia A, reconciliar RH da origem e motor do doador conforme a V4.
Primeiro percurso real:
Pessoa → matrícula/vínculo → cargo/lotação → eventos → cálculo/conferência →
fechamento → comprovante → consulta do próprio servidor.

Uma folha importada pode ser exibida como “importada”; isso não prova cálculo da folha nem contabilização automática.
Não construir duas folhas ou dois cadastros para acelerar uma tela.

Se não houver tempo antes do congelamento, manter a frente em desenvolvimento e fora das promessas da apresentação. Um portal informativo de servidor não será apresentado como portal transacional completo.

### 7.5 Fila C

Prosseguir com processo digital e portal de cidadão/fornecedor usando os mesmos documentos, comunicações e autorizações.
Um percurso do cidadão pode ser entregue antes da folha completa se já for independente e aproveitar infraestrutura existente; registrar a mudança de prioridade, sem alterar o objetivo integral.

## 8. Massa e roteiro da apresentação

Somente dados sintéticos, com marcação e sem gerar documentos oficiais válidos.
Não usar e-mails reais dos fixtures para enviar notificações.

Criar pelo fluxo autorizado:
administrador, planejador, compras, fiscal/recebedor, contador, tesouraria e auditor.
Adicionar servidor, RH e cidadão somente para as capacidades integradas.
Usuário administrador não substitui os demais atores no teste.

A demo precisa aceitar dados novos durante a apresentação:
outro fornecedor, outro item, quantidade diferente e recibo parcial.
Não depender de IDs mágicos ou SQL manual entre cliques.

Roteiro inicial:
1. login e contexto;
2. planejamento/dotação;
3. contratação e empenho vinculados;
4. ordem/documento recebido/recebimento/liquidação;
5. pagamento administrativo e conferência;
6. patrimônio e documento imprimível;
7. relatório/exportação;
8. consulta pública ou protocolo, quando entregues.

Inclua uma recusa de saldo ou duplicidade, uma restrição entre usuários e uma consulta da auditoria correspondente.
Não provoque exceção arbitrária no sistema produtivo para mostrar um log.
Painel de erros recebe falha controlada apenas no ambiente sintético, com correlação e sem detalhes sensíveis para usuário comum.

Faça um roteiro escrito de 20–30 minutos e um percurso de exploração sem automação. A duração é uma proposta de apresentação, não um SLA do sistema.

## 9. Verificação e congelamento

Durante construção:
typecheck afetado, testes dirigidos, duas linhas quando houver regra de conjunto,
concorrência/idempotência/autorização quando alteradas e smoke do percurso.

Nenhum teste com edição simultânea dos arquivos medidos.
Não executar suites concorrentes contra o mesmo banco truncável.
Não classificar timeout como aprovação, não esconder falhas com retries indefinidos.

Para o candidato de demonstração:
- build e start do mesmo SHA/artefato no ambiente-alvo;
- instalação/migrations/SQL/perfis em base isolada;
- logins por papel e negativas de acesso direto;
- cadeias incluídas na apresentação e respectivos documentos;
- upload/download, restart e persistência;
- verificação de duplicidade e saldos das operações expostas;
- restauração testada em destino isolado;
- segurança básica de rede/segredos/sessão/storage.

Programar suíte completa e fuso sobre o candidato estável; não executá-los repetidamente a cada botão. Registrar resultado exato e indisponibilidades.
Se uma execução global estiver pendente, NÃO chamá-la verde. Distinguir claramente:
“checagens da demonstração executadas” de “suíte integral aprovada”.

Falha conhecida de autorização, vazamento, duplicidade financeira, perda de dados ou build bloqueia exposição online. Não contornar desligando guards.
Uma função não entregue pode ficar fora da oferta da demonstração, com lacuna registrada; isso não pode ser usado para alegar conformidade integral.
POC contratual e uso produtivo municipal continuam exigindo seus aceites completos, integrações e obrigações de infraestrutura.

Se segurança e integridade da área escolhida não forem demonstráveis, entregar candidato local bloqueado com motivo. O prazo não autoriza exposição insegura.

## 10. Melhoria competitiva mensurável

As páginas públicas da IPM descrevem um ecossistema amplo. Não declarar superioridade geral por tecnologia, estética ou versão do framework.

Medir nos nossos percursos:
- conclusão com usuário do papel correto;
- tempo e cliques para localizar documento e operação relacionada;
- campos redigitados;
- coerência entre tela e exportação;
- legibilidade e clareza de erros;
- transição por teclado e responsividade;
- persistência depois de recarga/restart;
- rastreabilidade do resultado.

Metas dessa demonstração:
nenhum UUID manual; nenhuma ação decorativa; nenhuma referência de TR em frontend;
nenhum resultado financeiro sem lastro; nenhum link oferecido sem destino;
toda operação incluída com documento/consulta correspondente.

Essas são metas de engenharia, não alegação de que o concorrente falha nelas.

## 11. Entregáveis e continuidade

Gerar ou atualizar, sem inventar catálogo concorrente:
- ESTADO-EXECUCAO.md: resumo curto, HEAD, build, contexto, resultado e próximo passo;
- docs/demo/ROTEIRO-APRESENTACAO.md;
- docs/demo/ESCOPO-DEMONSTRAVEL.md: rotas reais, papel, operações, limites;
- docs/operacao/DEPLOY-DEMONSTRACAO.md: instalação, bootstrap, storage, jobs, TLS, backup, rollback;
- evidências sanitizadas por SHA, sem senhas;
- catálogo original com critérios, rotas verificadas e evidência adequada;
- pacote incremental com comandos, patches e logs relevantes.

Estado da entrega:
- APTO PARA DEMONSTRAÇÃO RESTRITA, somente se as verificações desse escopo passaram;
- BLOQUEADO PARA PUBLICAÇÃO, com causa e próximo passo exato;
- nunca “produção municipal pronta” por estar acessível na internet.

Ao fechar cada unidade, commit local coerente e avanço para a próxima.
Não fazer push sem autorização; o empacotamento local não exige publicar o repositório.
Não aplicar alterações do desenvolvimento ao servidor enquanto alguém demonstra.

Não entregar apenas este plano reescrito. COMEÇAR pelo checkpoint atual, preparar o artefato e concluir nota recebida + vínculo ordem/empenho. Evoluir mensagens, documentos e navegação nos mesmos fluxos, preparar os portais e seguir B/C conforme o orçamento. Congelar um candidato utilizável antes do final da janela.

## Fontes e limites usados nesta orientação

- Código publicado acessível nesta revisão: `dc7032a`; snapshot anterior inspecionado: `77cbcc9`.
- `da9c8ad` e os resultados de V4 são informações do executor; o novo pacote de auditoria não foi anexado a esta rodada.
- O TR anexado continua sendo a fonte funcional e dos critérios da POC.
- Capturas do usuário mostram as superfícies públicas e de acesso do Atende.Net, não uma auditoria completa de seu backend.
- Referências externas consultadas, a confirmar na versão aplicável antes da implementação:

```text
https://www.ipm.com.br/prefeitura-e-gestao/
https://www.ipm.com.br/contabilidade/
https://www.ipm.com.br/recursos-humanos/
https://www.ipm.com.br/suprimentos/
https://anitagaribaldi.atende.net/cidadao
https://nextjs.org/docs/15/app/guides/self-hosting
https://nextjs.org/docs/15/app/guides/production-checklist
https://www.w3.org/WAI/WCAG22/Understanding/status-messages
https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
https://owasp.org/www-community/attacks/CSV_Injection
```
