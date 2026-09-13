# V6 - Gestão Pública: identidade, integração operacional e expansão funcional

## 0. Mandato desta rodada

Trabalhe exclusivamente no repositório gestao-publica. O proprietário decidiu pedir adiamento da apresentação e suspendeu a publicação para continuar a construção. A eventual nova data será informada depois; não presuma que o adiamento já foi concedido.

Substitua a prioridade temporária da V5 (candidato em 24 horas e busca de hospedagem) por construção contínua do produto. Não procure alvo de deploy, não espere autorização de hospedagem para implementar e não encerre dizendo que o único próximo passo é publicar. Mantenha a possibilidade de reproduzir o candidato anterior, sem obrigação de deixar seu processo ligado consumindo a máquina.

A entrega não é uma nova identidade visual sobre telas incompletas. É uma plataforma integrada e utilizável, cujo núcleo contábil permanece preservado. Siga P0 -> P1 -> P2 -> P3 -> P4. P5 organiza a expansão posterior e não significa que tudo cabe em uma sessão.

Implemente continuamente durante a sessão disponível. Não pergunte "posso continuar?" depois de cada arquivo, teste ou commit. Não encerre com outro plano. Se um componente depender de terceiro, registre a dependência e siga por uma unidade independente. Não continue construindo em cima de uma falha de integridade, isolamento ou autorização.

Autorizados: código, refatorações localizadas, testes, dados sintéticos isolados, migrations novas ensaiadas, leitura/fetch das origens já indicadas e documentação primária. Não autorizados: push, publicação, DNS/IAM, contratação de recursos, pagamentos, transmissões fiscais, mensagens reais, dados pessoais produtivos, acesso a área privada de concorrente ou alterações em outros projetos da máquina.

Não crie outro repositório, outro ledger, outro cadastro canônico de pessoas, um segundo design system ou um app independente por menu. Preserve monólito modular, Prisma, Decimal, contratos, comandos, auditoria, permissões e os geradores já aproveitaveis.

## 1. Baseline e preservação

Estado INFORMADO pelo executor, a confirmar no disco:
- main local: cc4a0a2, preservando da9c8ad e os avanços anteriores;
- 14b2daa: documento fiscal recebido e empenho a partir da ordem;
- 2e0817b: candidato da aplicação compilado; NEXT_PUBLIC_BUILD_COMMIT identifica esse artefato;
- b062335: percurso e carregamento de ambiente/Chromium, posteriores ao build;
- cc4a0a2: checkpoint da seção 51;
- stash 11b7892e7800281f3ef915ee571a967b9383401b já incorporado em 63a3040, ainda preservado;
- servidor ensaiado: localhost:3010, banco dos percursos; não é produção municipal.

O GitHub consultado pela orquestração ainda expõe dc7032a, e cc4a0a2 não foi localizado. Isso não autoriza reset. O executor deve usar o HEAD real e confirmar ancestralidade. Não reaplique o stash e não o remova. Não execute ou inclua automaticamente fix-*.sh/manter-claude-cursor.sh.

Não reaudite do zero A01-A09. Preserve as correções relatadas e seus testes; se um teste demonstrar regressão, corrija o comportamento sem ressuscitar o desenho antigo.

Diferencie em cada evidência: app_sha, test_runner_sha, schema/migrations, perfil de configuração sintética e momento da execução. Um script alterado depois do build pode testar o build anterior; as duas procedências precisam estar identificadas. Não atribua resultados de 2e0817b a qualquer HEAD futuro.

Antes de novo build na mesma pasta, não sobrescreva .next que um next start congelado utiliza. Preserve artefato/worktree recuperável ou encerre controladamente apenas o processo deste projeto antes de recompilar. Banco, anexos e saídas de testes também não podem disputar o ambiente do candidato. Não pare o projeto whatsapp-saas ou qualquer outro serviço da máquina.

Atualize a precedência operacional em CLAUDE.md e docs/LEIA-ME.md: V6 substitui somente a prioridade temporal e de publicação da V5. As regras de negócio, ADRs aceitos e evidências permanecem. Corrija o "próximo passo" de ESTADO-EXECUCAO.md: publicar não é mais a tarefa desta rodada.

## 2. Fontes e critérios de decisões

O texto integral do TR e o catálogo existente continuam sendo a fonte funcional. Leia a cláusula completa antes de declará-la atendida. Não reduza uma cláusula composta ao caminho feliz exercitado pelo smoke.

IPM/Atende.Net e Governo Digital Essencial/Venda Nova são referências de produto, não especificações a copiar. Use apenas páginas públicas e documentos permitidos. Distinga no registro: observado publicamente, declarado pelo fornecedor, exigido pelo TR, melhoria proposta e comportamento nosso testado. Não afirme que superamos um concorrente sem executar casos comparáveis.

Não copie marcas, identidade de portais, código proprietário, dados municipais ou brasões de terceiros. Não transforme regulamento de Venda Nova em regra de Anita Garibaldi. Configurações locais precisam de jurisdição, fonte e vigência.

A navegação oficial de Venda Nova aponta prestadores e sistemas diferentes para protocolo, tributos e serviços do servidor. Não atribua todo o ecossistema municipal à Essencial por causa do link do Governo Digital. Compare a capacidade e sua integração comprovável, não apenas o domínio da página.

Desdobre o catálogo existente em critérios de aceite sem duplicar seu registro de status. Melhorias além do TR recebem identificador PROD no mesmo sistema de planejamento, separado da contagem das 2.037 cláusulas. Não aumentar o denominador do TR com melhorias comerciais.

Não perpetue antigos erros das análises: M22 na origem pode ser RH e M22 no produto é documentos. Número igual não é equivalencia. PPA/LDO, nota recebida e empenho pela ordem já foram relatados como implementados: complemente e teste, não recrie.

## P0. Identidade correta e experiência compartilhada

### P0.1 Produto, instituição e contexto são coisas diferentes

A captura atual mostra SIAFIC, Campina Grande/PB e Prefeitura Municipal de Campina Grande - SEFIN no login. No snapshot remoto antigo, esses valores estão literais em app/login/page.tsx. Confirme os consumidores atuais antes de modificar.

Decisão desta rodada:
- nome de apresentação padrão do PRODUTO: Gestão Pública;
- descrição: Plataforma integrada de gestão municipal;
- fornecedor/assinatura comercial: configurável, sem inventar nova marca;
- município/entidade: vem do cadastro e do contexto autorizado;
- ambiente: Desenvolvimento ou Demonstração, sem se apresentar como portal oficial;
- contabilidade/SIAFIC: permanece como domínio/módulo e referência técnica legítima, não como nome de toda a suíte.

Não faça replace global de SIAFIC, Campina Grande ou cg.pb.gov.br. Preserve nomes de bancos, cookies, chaves de integração, fixtures, documentos históricos, assinaturas, migration IDs e identificadores cuja mudança não seja necessária. Se um tenant realmente estiver configurado como Campina Grande, o dado deve continuar identificando essa entidade; não o converta em Anita apenas mudando um rótulo.

Crie/adapte uma fonte tipada de identidade do produto e uma projeção PÚBLICA e mínima da identidade institucional. Reutilize EnteConfig, contexto-do-ente e os cadastros atuais; não crie configurações contraditórias. Antes do login, somente nome, identidade visual e canais públicos autorizados. Credenciais, memberships, parâmetros fiscais e dados pessoais nunca entram nessa projeção.

Resolva identidade institucional por vinculação de implantação/domínio previamente cadastrado e confiável. Query string, Host arbitrário, campo oculto ou slug digitado não conferem acesso nem selecionam banco livremente. Se não houver ente configurado, exiba identidade neutra de desenvolvimento e uma pendência de configuração para o administrador; nunca escolha uma prefeitura aleatoria.

A configuração administrativa deve permitir, com permissão e auditoria: nome de exibição, imagem institucional autorizada, assinatura do fornecedor, contatos, horário, tema permitido e dados de identificação pertinentes. Tema é configuração de apresentação, não campo para JavaScript/CSS arbitrário. Valide imagens e links; não busque URLs arbitrárias a partir do servidor/PDF.

Propague a identidade para login, metadata/title, favicon, cabeçalho, menu, rodapé, erros, avisos, notificações, relatórios novos e portais. A identidade e o modelo usados em documento EMITIDO ficam preservados no artefato/versão: a segunda via não deve mudar quando a marca ou a entidade for reconfigurada.

Retire o SHA completo do rodapé visual comum. Mantenha versão legível quando útil e proveniência completa em área técnica autorizada e evidências. Não confunda o nome do produto com o código do build.

### P0.2 Redesenhar a entrada e o shell, preservando a autenticação

Evolua FormLogin e o shell existentes. Não troque mecanismo de sessão para redesenhar uma tela. Preserve bootstrap, revogação, chave de comando e retorno seguro.

Login: identidade coerente, título de acesso, rótulos claros, exibir/ocultar senha acessível, erros por campo quando cabíveis, estado de envio e retorno que preserve a tarefa. Use placeholder neutro adequado ao identificador aceito; não force @cg.pb.gov.br nem habilite CPF/CNPJ como login sem suporte real.

Canais: Gestão Interna, Portal do Servidor, Portal do Cidadão, Fornecedor e Transparência. Eles são experiências e políticas distintas sobre domínios compartilhados, não cinco sistemas com cadastros duplicados. Exiba acesso somente quando o canal existir e estiver ativado. Portal público não recebe a lista de módulos privados.

Inscrição pública nunca concede perfil interno. Documento com DV válido não prova identidade. Uma pessoa humana representa uma organização por vínculo explícito; CNPJ não vira identidade pessoal por conveniência.

Nova home interna: Minha mesa, com tarefas e pendências derivadas, ações frequentes autorizadas, processos sob responsabilidade, documentos aguardando decisão e avisos pertinentes. Não mostre gráficos e economias fictícias. Falha de consulta não é zero; falta de permissão não é lista vazia disfarçada.

Mantenha município/entidade/unidade/exercício e modo de ambiente visíveis quando pertinentes. Troca de contexto não reinterpreta um rascunho ou comando pendente. Teste duas abas. Favoritos, recentes, busca e totais respeitam as permissões vigentes, inclusive após revogação.

### P0.3 Refatoração de telas por família

Reutilize lib/molde, components/molde e components/ui. Refatore contratos e componentes compartilhados; não reescreva cada página manualmente. Identifique o que foge do molde e componha uma tela específica sem duplicar regras.

Padrão de listagem: título de negócio, descrição útil, filtros por domínio, ordenação, paginação, colunas pertinentes, seleção, totalizadores corretos e ações por contexto.
Padrão de detalhe: resumo, dados, itens, valores, relacionados, documentos e histórico/auditoria. Barra de ação contextual, sem pedir UUID ao usuário.
Padrão de operação: prévia quando houver impacto, dados exigidos, confirmação proporcional, resultado autoritativo e links para os registros gerados. Não colocar toda operação em modal.

Primeiras famílias: usuários/perfis, planejamento, solicitacoes/ordens, documentos fiscais, empenhos/liquidações e acervo. RH e processos já nascem com o mesmo padrão na etapa correspondente.

Teste larguras de referência 360, 768 e 1366 px, teclado, zoom, foco, nome acessível de controles e tabelas extensas. São alvos de engenharia desta rodada, não evidências de conformidade por si. Aplique a referência WCAG 2.2 AA aos componentes novos, sem selo automático de acessibilidade.

Resolva rotas dinâmicas pelas chaves de seus contratos. Contar arquivos não comprova cobertura; procura de pasta literal não comprova link quebrado. Preserve URLs existentes ou alias seguro quando mudar navegação.

## P1. Fechar os vínculos administrativos e financeiros pendentes

### P1.1 Solicitação ligada aos itens da ordem

Corrija SOLICITACAO-SEM-VINCULO-COM-A-ORDEM pelo modelo do negócio, não por texto livre. Reutilize solicitações, itens, pesquisa, ordem, recebimento, nota e empenho atuais.

Uma solicitação pode ser atendida parcialmente por mais de uma ordem. Uma ordem pode atender solicitações distintas. Modele vínculo/alocação por item e quantidade quando o caso exigir, preservando origem, unidade, centro de custo e autor.

Fluxo: autorizar solicitação -> selecionar itens/saldos pendentes -> formar ordem ou vincular parcela -> receber -> consultar atendimento da solicitação.

Controles: solicitação não autorizada; item/unidade incompatível; quantidade alocada em excesso; duas ordens concorrentes; cancelamento e desfazimento permitido; transferência de saldo e manutenção do histórico. Não contar como atendida uma parcela apenas porque foi ordenada; distinguir ordenado, recebido, cancelado e pendente.

A origem deve ser acessível em ambos os sentidos na UI e nos documentos. Legado sem relação fica identificado como tal e requer conciliação explícita, nunca match automático por descrição/valor.

### P1.2 Arrecadação, conta bancária e conciliação

Resolva ARRECADACAO-SEM-CONTA-BANCARIA sem atribuir todo legado a CC-500-01.

Primeiro diferencie reconhecimento de receita, arrecadação efetiva, retenção/dedução e movimento bancário. Exija conta e fonte nos fatos em que forem pertinentes, não em todo evento que tenha valor positivo.

Quando houver movimento bancário, fato, vinculação de conta/fonte e escrituração correspondente devem ficar coerentes na transação real. Reutilize a aritmética do razão e a conciliação existentes.

Legado sem referência não pode ser corrigido com UPDATE proibido no ledger. Crie o ato de reconciliação ou complemento rastreável permitido pelo modelo, com evidência e conferências. Não habilite "fechar mesmo assim" nem reescreva saldo para passar no smoke.

Teste duas contas, duas fontes, valor retido, arrecadação parcial, estorno, concorrência e corte de período. A conciliação deve explicar diferenças reais e permitir resolver a causa, sem usar uma mensagem de pendência como substituto permanente da operação.

### P1.3 Encadear o que já existe

Conclua e exercite: PPA/LDO/LOA -> dotação -> solicitação -> pesquisa -> processo/atos aplicáveis -> contrato/reserva -> ordem/empenho -> nota recebida -> recebimento/atesto -> liquidação -> registro administrativo de pagamento -> razão e documentos.

Preserve caminhos legítimos sem contrato/ordem. Não duplique entrada de estoque pelo recebimento e pela liquidação. Confira a parcela fiscal utilizada nas liquidações parciais e a duplicidade de documento/comando.

A importação XML continua sendo validação local de modelo suportado, não autorização fiscal. NFS-e do contribuinte é uma frente diferente da nota recebida da prefeitura.

Feche ao menos um percurso com duas linhas, atendimento parcial e uma negativa de negócio. Use usuários apropriados, não o admin universal em todos os passos. Não reimplemente os atos de licitação ausentes como simples troca de status sem seus requisitos: complete um ato de cada vez com efeitos e documento.

## P2. RH, folha e portal do servidor - entrega integrada, não mais um cadastro

### P2.1 Absorver a origem correta

Conclua a reconciliação por capacidade do RH em siafic-cg c04ad5a e do doador saas-municipal. O handoff antigo é referência histórica, não prova do estado atual. Não renomeie M22-documentos para RH e não substitua a base nova pelo doador.

Reutilize algoritmos e testes válidos com adaptação de contratos, persistência, dinheiro, datas e segurança. Componentes em number/Drizzle não entram diretamente no núcleo Decimal/Prisma. A diferença de ORM não justifica descartar toda lógica pura.

Use Pessoa canônica e seus vínculos existentes. Identidade, servidor, vínculo funcional, usuário e representação são objetos distintos. Não duplicar CPF para cada matrícula. Validação de CNPJ preserva o formato alfanumérico conforme o contrato já corrigido ou a especificação oficial, sem voltar a remover letras.

### P2.2 Cadastro e histórico funcional

Entregue interfaces utilizáveis para pessoa, vínculos/matrículas, cargos, vagas, lotação, regime, jornada, dependentes, dados de pagamento restritos, atos de admissão, alterações de remuneração e afastamentos.

Campos obrigatórios e adicionais vêm do texto integral de 5.12 e do modelo reaproveitado. Não limite esse cadastro a nome/cargo/salário. Defina unicidade da matrícula conforme entidade e legado; não reutilize matrícula encerrada misturando historicos.

O estado em uma competência deve ser obtido por vigência histórica, não pelo cadastro atual sobrescrito. Dados médicos, dependentes e dados bancários não aparecem na transparência ou a qualquer operador de RH sem permissão apropriada.

### P2.3 Motor, prévia e fechamento

Percurso: abrir competência/tipo de folha -> selecionar vínculos -> resolver parâmetros vigentes -> calcular -> apresentar memória por rubrica -> conferir pendências -> aprovar/fechar -> gerar documentos e reflexos contábeis pertinentes.

Reaproveite infraestrutura de jobs quando houver. Persistir progresso e resultado, falha e reprocessamento. Não criar dependência de outro broker apenas por preferência técnica.

Use Decimal em valores e precisão adequada em bases, percentuais e proporcionalidade. Fixe versão das fórmulas, tabelas, vínculos, eventos e critérios de arredondamento utilizados. Prévia e fechamento compartilham o motor, mas seus resultados precisam de casos de referência independentes.

Busque fontes primárias vigentes para tabelas e regras federais e confirme sua data de aplicação. Parâmetros municipais/regimes exigem fonte e configuração; ausência não autoriza inventar regra. Não use valor constante apresentado como vigente apenas porque está em fixture antiga.

Teste N=2: dois servidores, um com dois vínculos quando suportado, proventos e descontos diferentes, afastamento/proporcionalidade, alteração de parâmetro futura, teto aplicável, rejeição de período fechado e repetição sem duplicar folha.

Não habilite combinações não implementadas como se calculassem corretamente. Registre restrição específica e continue o desenvolvimento dos demais cenários exigidos, sem usar fail-closed como entrega final de toda a folha.

Integre ao M05 e ao ledger por caso de uso de apropriação da folha, com dotação, fonte, obrigações e retenções rastreaveis. Não duplique o motor da despesa. Folha fechada não significa pagamento bancário enviado, e XML gerado não significa eSocial aceito.

Férias, 13º, rescisão, pensões, consignações, provisões, ponto, SST, recrutamento e treinamento continuam no escopo integral: evolua pelos subcasos da frente depois da primeira cadeia completa. Uma folha mensal simples não valida todos os 114 itens do bloco.

### P2.4 Portal do servidor no mesmo incremento

Entregue canal de autosserviço ligado aos fatos do RH: meu vínculo, comprovantes liberados, ficha financeira por período, pedidos/acompanhar solicitações e dados funcionais permitidos. Acrescente férias e ponto quando suas rotinas estiverem efetivamente ligadas.

Documento de folha calculada, importada e simulada deve ter origem identificada. Não gere holerite a partir de array estático nem exponha cálculo ainda não liberado ao empregado.

Login do servidor não concede operador de RH. Verifique autoria/vínculo em cada download e consulta por ID. Teste servidor A tentando acessar comprovante de B, funcionário desligado conforme política e troca de entidade, sem depender apenas do menu.

Se recuperação por e-mail depender de provedor externo ausente, implemente fluxo seguro e transporte de teste isolado; não exiba tokens/links de recuperação na UI pública. Não anuncie envio real nem gov.br/SSO conectado sem integração.

## P3. Governo digital: processo, mesa de trabalho e canais

### P3.1 Evoluir protocolo e documentos existentes

/consulta e /transparencia/demonstrativos retornarem 200 não entrega portal transacional. Reutilize M21-protocolo, M22-documentos, comunicação e notificações.

Entregue mesa de trabalho por usuário/setor: entrada, atribuídos, aguardando resposta, assinatura pendente quando suportada, devolvidos, concluídos e atrasos medidos pelo calendário aplicável. Filtros, busca, prioridades, histórico, encaminhamento e ação de recebimento reais.

Dossiê de processo: identificação/assunto/subassunto, requerentes e representações, responsáveis, situação, prazos, documentos versionados, movimentações, pareceres, vinculações de negócio e auditoria. Sigilo e visibilidade por documento devem governar UI, export, notificação e acesso direto.

Permissão geral de gestor não pode implicitamente derrubar uma restrição de sigilo que o modelo determine. Explicite e teste a precedência das politicas. Consulta pública por documento não pode virar acesso irrestrito aos dados de qualquer CPF/CNPJ.

### P3.2 Fluxos configuráveis executáveis

Evolua o motor atual antes de adotar outro. Definição de fluxo versionada, publicação, início, tarefas por papel/setor, condições com universo fechado, retorno para complemento, parecer, decisão e encerramento.

Instância iniciada continua ligada a sua versão. Alterar o desenho não muda retroativamente processos em curso. Migração de instância exige ato próprio e verificações.

O editor gráfico precisa corresponder ao fluxo executado. Valide referências, ramos alcançáveis, condições, destinos e restrições. Se usar biblioteca de modelagem BPMN, não afirme suporte integral a BPMN/CMMN/DMN apenas por abrir um diagrama.

Não usar eval, new Function, script de usuário ou URL arbitrária de service task. Tarefas automatizadas chamam casos de uso autorizados e tipados; fluxo não ignora saldo, vigência, assinatura ou separação de funções.

Prazo de processo, prazo de suporte e prazo de recurso são regras diferentes. Calendário, suspensão e retomada precisam de motivos e histórico. Não invente prazos legais para popular a tela.

### P3.3 Carta de serviços e portal do cidadão

Implemente catálogo editável: título, categoria, público, descrição, requisitos, anexos, etapas, custo/regra de taxa quando houver, prazo/fundamento, unidade responsável, canais, necessidade de login e versão do fluxo/formulário.

Diferencie serviço informativo, transacional local e integração externa. Não colocar o mesmo botão "Acessar" em links que só abrem uma tela interna sem permissão.

Percurso inicial: acessar serviço publicado -> autenticar quando exigido -> preencher -> anexar -> revisar -> protocolar -> receber número -> acompanhar -> atender exigência -> receber resposta/documento -> avaliar atendimento quando aplicável.

Use formulário versionado e validação no servidor. GET não tramita, aprova, assina nem marca ciência jurídica. Protocolo+código verificador pode sustentar consulta limitada conforme política; não permita enumeração e não exponha anexos sigilosos.

Priorize três serviços completos usando a retaguarda já disponível:
1. solicitação de atualização cadastral com análise e aprovação;
2. requerimento administrativo com documento, encaminhamento e resposta;
3. complemento de documentação pelo fornecedor com representação validada.

A seguir incorpore pedidos do servidor, ouvidoria/acesso a informação com suas regras específicas, e serviços tributários quando houver cálculo/guia real. Não emita certidão negativa com base apenas em ausência de dados no banco de teste.

### P3.4 Portal institucional e transparência

Crie/evolua um editor de conteúdo simples, reutilizando documentos: páginas, categorias, notícias, agenda, avisos e banners. Publicação por entidade, com rascunho, revisão/publicação, vigência e público. Sanitizar conteúdo rico e validar destinos.

O portal consome o conteúdo cadastrado e serviços publicados; não usa banners fictícios ou carrossel de promessas. Notícias e indicadores não podem sugerir fatos reais de uma prefeitura em massa de demonstração.

Transparência usa projeções públicas específicas de despesas, receitas, obras, contratos, pessoal e relatórios conforme o que existe e o que a política permite publicar. Não reutilize serializers administrativos completos nem publique automaticamente todo anexo da nota fiscal.

Consulta de obras deve relacionar dados publicáveis de contrato/licitação, dotação/fonte, etapas, valores e documentos, em leitura. A existência de uma aba vazia não atende a categoria.

## P4. Mensagens, documentos, exportação e observabilidade em todas as frentes

Componentes padronizados são desejáveis; mensagens genéricas desconectadas do ato não.

Mensagens usam resultado estruturado do domínio: operação, referência autorizada, quantidade/valor quando pertinente, pendência, próxima providência e correlação. Exemplos de composição: "Solicitação {número}: {quantidade} itens vinculados a ordem {ordem}; {saldo} permanecem pendentes"; "Documento enviado para análise de {setor}". Nunca gravar esses exemplos com valores fixos.

Diferencie validação de campo, acesso negado, regra impeditiva, processamento, conflito, indisponibilidade e resultado desconhecido. Só afirmar que nada foi gravado quando houver prova. Repetição idempotente recuperada não é nova gravação.

Erros de campo ficam próximos do controle; alertas persistentes ficam no contexto; sucesso não deve roubar foco; notificações críticas não desaparecem automaticamente. Use semântica acessível de status/alert e preserve rascunhos seguros sem dados pessoais em storage persistente indiscriminado.

Aviso institucional é objeto publicado, com vigência e público. Feedback de uma transação é outro objeto. Não transformar toda pendência em popup na entrada do sistema.

Relatórios e exportações reutilizam M12/M26/lib/pdf/processamento e a consulta autorizada do domínio. Nenhuma fórmula de saldo duplicada em template.

Para cada frente, entregue filtros, prévia, emissão/download e histórico. Tela, CSV, XLSX e PDF respeitam os mesmos filtros/escopos, com snapshot ou watermark temporal que explique mudanças enquanto um job roda. Emissão em segundo plano persiste estado e erro e revalida direito ao artefato antes de entregar.

PDF: identidade institucional correta, identificação/situação, campos e itens, períodos/filtros, totais, origem, paginação, tabela com cabeçalho repetido, quebra de linhas e conteúdo completo. Teste documento vazio, multipágina, texto longo e nomes acentuados. Renderize e inspecione amostras: MIME e tamanho não comprovam documento utilizável.

Documento emitido e sua segunda via preservam versão e dados; relatório de posição atual tem sua própria data. Hash de integridade não é assinatura digital. Assinatura simples, avançada, qualificada e custódia HSM não são intercambiáveis: só declare o mecanismo realmente implementado/validado.

CSV/XLSX: preservar documento como texto, zeros e precisão; neutralizar injeção de fórmulas em conteúdo textual controlado por terceiros. Não exportar campos ocultos por segurança. Não assumir que coluna escondida na UI autoriza entregar seu conteúdo.

Proteja renderização de PDF: não executar HTML/JS arbitrário do usuário, não acessar arquivos locais/rede privada/metadados de cloud por URLs externas. Controle concorrência e encerramento do Chromium, e valide sua disponibilidade no ambiente. Não flexibilize sandbox por conveniência silenciosa.

Central técnica autorizada: erros sanitizados com correlação, versão e classificação; auditoria de negócio antes/depois; integrações com tentativa/retorno; jobs com progresso e reprocessamento. Não expor senha, token, XML sensível inteiro ou stack na mensagem do operador. Nenhuma troca de estado cosmética resolve um job ou pagamento que não aconteceu.

## P5. Escopo completo e continuidade depois desta fila

O produto não termina em P0-P4. Mantenha no catálogo o seguinte programa, sem abrir dezenas de páginas vazias para parecer completo:

| Frente | Texto principal | Continuidade |
|---|---|---|
| Transversais | 5.8 | Campos, relatórios configuráveis/distribuíveis, assinatura/HSM, auditoria, acesso, ajuda, privacidade e integrações |
| Planejamento/financeiro/controle | 5.9-5.11 | Todas as peças, cotas/contingenciamento, receitas, tesouraria, fechamentos, convênios, controle interno e consistências |
| Pessoas | 5.12-5.16 | Folha completa, SST, ponto, recrutamento, treinamento e autoatendimento correspondente |
| Suprimentos | 5.17-5.22 | Atos completos de compras/licitações, atas/contratos, estoque, patrimônio, frota, fiscalização e aplicativo |
| Fazendário | 5.23-5.36 | Fiscalização, escrita, Simples, NFS-e/ADN, malha, domicílio, arrecadação, IPTU/ITBI/ISS, dívida, REDESIM e urbanismo |
| Canais | 5.37-5.40 | Institucional, transparência, serviços, autosserviço e aplicativo |
| Jurídico/processos | 5.41-5.43 | Procuradoria, processo digital e comunicação |
| Setoriais | 5.44-5.47 | Serviços públicos, cemitérios, agricultura e farmácia |
| Operação contratual | condições do TR | Migração, exportação integral, treinamento, suporte, segurança, disponibilidade e recuperação |

Integrações caminham junto dos domínios, não em uma última semana: e-Sfinge/SC, ADN, eSocial, bancos, REDESIM, tribunal e BNAFAR. Fonte primária, versão, jurisdição, ambiente e vigência fazem parte do contrato. Não renomear adapter PB/BA como SC, nem confundir gerado, enviado e aceito.

Preserve schema por município conforme ADR, mas prove isolamento antes de habilitar segundo cliente. Contexto do município e separação entre Prefeitura, Câmara, Fundo, unidade e exercício devem governar chaves, consultas, documentos, jobs e consolidação. Tema diferente não comprova multi-tenancy. Não dispare retrofit global do ledger apenas para concluir P0.

Melhorias PROD prioritárias, depois da capacidade-base correspondente: mesa unificada de tarefas; prazo e fila rastreáveis; pesquisa contextual autorizada; configuração institucional por entidade; trilha de proveniência de cálculos/documentos; indicadores de tempo/carga por processo. Métricas de superioridade precisam de caso, base de comparação e resultado medido, não de slogan.

Não priorize chatbot/IA genérica, hospital completo, nova linguagem de workflow ou novo motor gráfico em lugar das funções exigidas. Toda ampliação além do TR deve explicitar dependências e benefício, sem substituir requisito obrigatório.

## 3. Regras de verificação e critérios de conclusão

Durante construção: typecheck afetado, testes de domínio/contrato, autorização, persistência e um percurso significativo por família. Mudanças transversais de autenticação, valores, estoque, schema e motor de cálculo exigem regressão ampliada dos consumidores.

Não rodar o portão integral por alteração de rótulo. Também não esperar todos os 39 módulos terminarem para integrar: rode regressão completa nos marcos de integração/release e antes de candidato a homologação/publicação. O cronograma de testes não autoriza aprovar passo não executado.

Antes de migration: papel, host/porta/database/schema de teste confirmados sem registrar segredos. Ensaie instalação limpa e upgrade da base anterior, conferindo checksums e SQL manual. Não modificar migration compartilhada nem confundir alteração de constraint com perda de dados.

Nenhum aceite sobre fonte em movimento. Congele por commit ou worktree de validação. Não rode build, navegador, suítes pesadas e outro editor compilando contra a mesma máquina limitada sem coordenação. Paralelismo de testes exige bancos/schemas independentes; compartilhar truncate em paralelo invalida o ensaio.

M03-T8-TIMEOUT-SOB-SUITE exige reproduzir o modo de execução e isolamento; não remover asserção, aumentar timeout cegamente ou chamar falha de verde. Uma falha ambiental delimitada não bloqueia trabalho independente, mas continua pendente no relatório.

Use as identidades corretas por papel. Grant de todas as ações a um admin de teste não prova segregação. Teste instalação e upgrade de permissões sem ampliar perfis personalizados/revogados. Ação sem perfil e ação deliberadamente não contratada devem ser diferenciadas.

Aceite das unidades centrais:
- P0: identidade muda por configuração, login permanece válido, sem substituir contexto/credenciais, páginas e PDFs corretos; ausência de rótulos legados indevidos verificada no DOM e em amostras emitidas;
- P1: dois solicitantes/itens, alocações parciais/concorrentes, cadeia fiscal/financeira sem duplicar fato e conciliação por conta/fonte;
- P2: cadastro + competência + memória + fechamento + documento liberado + acesso do servidor; negativas de acesso entre servidores;
- P3: portal -> formulário -> protocolo -> recebimento interno -> exigência -> complemento -> decisão -> retorno; segunda pessoa e outro setor sem acesso indevido;
- P4: mensagem verdadeira, documento multipágina legível, export coerente, download autorizado após revogação e erro sanitizado.

HTTP 200 sozinho não valida portal. Número de telas/commits/testes não é cobertura do TR. Comentário @req serve a rastreabilidade, não ao aceite. Não exibir referências TR/ENT ou percentuais de cobertura em interfaces operacionais; normas/documentos de compras legítimos continuam permitidos.

## 4. Execução contínua, entrega e checkpoint

Comece P0 sem reabrir todas as auditorias. Termine seu incremento coerente e siga P1. Depois avance P2 e P3; P4 acompanha todas as etapas. Não substitua P2 por mais uma sessão inteira de ajuste estético de patrimônio.

Se uma tarefa emperrar, registre hipótese, evidência e dependência concreta. Não repetir indefinidamente o mesmo comando falho. Siga por trabalho independente dentro da fila, mantendo o bloqueio visível, sem promover a etapa incompleta.

Atualize ESTADO-EXECUCAO.md com resumo atual no início: HEAD, implementado, testado, pendente, migrations, próximo passo exato. Preserve história em seção própria sem misturar com o estado corrente. Não criar outro catálogo concorrente ou páginas repetitivas de autobiografia do executor.

Por capacidade, registre critério, papel/contexto, rota real, como obter alvo dinâmico, dados de entrada, resultado esperado/obtido, teste/artefato e commit. No catálogo, cláusula composta permanece PARCIAL se faltar parte obrigatória. Infraestrutura usa evidências de infraestrutura, não uma tela inventada para preencher rota.

Ao encerrar a sessão, entregue:
1. HEAD, commits e estado da árvore; situação do stash sem removê-lo;
2. alterações de identidade e superfícies, com capturas locais antes/depois sem dados reais;
3. operações novas efetivamente utilizáveis e percursos completos por papel;
4. testes rodados, resultados, app_sha e runner_sha, e o que não rodou;
5. diffs de schema e permissão, instalação/upgrade ensaiados;
6. catálogo atualizado por natureza e melhorias PROD separadas;
7. bloqueios externos e técnicos delimitados;
8. checkpoint e pacote incremental sanitizado em diretório ignorado, com hashes e logs pertinentes, sem bancos/credenciais;
9. próxima tarefa executável, que NÃO deve ser procurar hospedagem.

Não publique, não prometa execução fora da sessão e não declare suíte completa ao concluir uma fatia. A direção é atender todo o escopo por capacidades reais, preservando o que já funciona.

## 5. Referências de consulta do executor

Referências públicas consultadas em 13/09/2026. Revalidar versão/documentação técnica ao implementar. As páginas de fornecedores são declarações de produto, não homologação de seus sistemas ou dos nossos.

- IPM, portfólio prefeitura/gestão: https://www.ipm.com.br/prefeitura-e-gestao/
- Portal público de Anita Garibaldi: https://anitagaribaldi.atende.net/cidadao
- Governo Digital de Venda Nova: https://vendanova.essencialbpms.com.br/governo-digital.html#!/portal
- Essencial, descrição do Governo Digital: https://essencialgestaopublica.com.br/governo-digital-essencial/
- Prefeitura de Venda Nova, serviços de licitação: https://vendanova.es.gov.br/servicos/licitacoes.php
- Prefeitura de Venda Nova, carta de serviços: https://www.vendanova.es.gov.br/cartaServicos.php?id=148
- W3C, mensagens de estado: https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html
- W3C, foco não encoberto: https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html
- Next.js, autenticação/autorização (conferir versão instalada): https://nextjs.org/docs/app/guides/authentication
- eSocial, documentação técnica primária: https://www.gov.br/esocial/pt-br/documentacao-tecnica

O portal SPA de Venda Nova não expôs seu conteúdo transacional na consulta textual da orquestração. Não atribuir a ele observações de login ou fluxo que não foram efetivamente realizadas. Não contornar autenticação para pesquisar referência.
