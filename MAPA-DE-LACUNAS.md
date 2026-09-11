# Mapa de lacunas — catálogo de execução × código existente

> Complementa `PROMPT-MESTRE-IMPLEMENTACAO.md` e `especificacoes/PRIMEIRA-ENTREGA.md`.
> Não substitui o catálogo nem a matriz reconciliada: é a camada de decisão sobre
> **de onde parte** cada bloco.
>
> Base factual: `CONTEXTO-SIAFIC-E-SAAS-MUNICIPAL.md` (inspeção direta de código em
> 2026-09-09) cruzado com `resultado-auditoria.json` (2.037 cláusulas, distribuição
> por seção conferida).
>
> **Limite desta classificação.** "Base forte" significa que existe módulo com
> código e arquivos de teste no disco, não que as cláusulas estejam atendidas. O
> handoff registra que a suíte do `siafic-cg` **não foi executada** — nenhuma
> linha desta tabela autoriza marcar cláusula como validada. A verificação é o
> primeiro trabalho de cada lote, não uma premissa dele.

---

## 1. Resultado agregado

| Situação de partida | Cláusulas | % do catálogo | Seções |
|---|---:|---:|---:|
| **BASE_FORTE** — módulo existente, a caracterizar e ampliar | 469 | 23,0% | 5 |
| **BASE_PARCIAL** — existe fragmento, em outro ORM, outro escopo ou só a metade do problema | 294 | 14,4% | 6 |
| **AUSENTE_CONFIRMADO** — nenhum código em nenhum dos dois repositórios | **1.274** | **62,5%** | 29 |
| Total | 2.037 | 100% | 40 |

Três leituras que precisam ficar explícitas antes de qualquer planejamento:

1. **O bloco fazendário/tributário é o maior vazio do projeto.** As seções 5.23 a
   5.36 somam 562 cláusulas e não têm código em nenhum dos dois repositórios,
   com a exceção parcial do importador M20 e da rotina contábil de dívida ativa
   do M10. Não existe cadastro imobiliário, cadastro mobiliário, motor de cálculo
   tributário, NFS-e, escrita fiscal, nem cobrança. É o caminho crítico real.
2. **O que existe é justamente a parte mais difícil de reconstruir.** Ledger
   append-only com validação de subsistema, PCASP, RREO/RGF/balanços e a cadeia
   empenho→liquidação→pagamento representam o conhecimento mais caro dos dois
   repositórios. A decisão do prompt mestre de preservar o `siafic-cg` como base
   autoritativa se sustenta nesses números.
3. **Canais e atendimento são 100% ausentes e 100% visíveis.** Portal de serviços,
   protocolo, comunicação interna, portal institucional e aplicativo somam 340
   cláusulas sem uma linha escrita. É a superfície pela qual qualquer demonstração
   começa, e é onde a ausência aparece primeiro.

---

## 2. Tabela por bloco

Colunas: **Origem** = módulo/pacote reaproveitável identificado no disco ·
**Estado** = classificação de partida · **Frente** = frente do prompt mestre ·
**Lacuna** = o que precisa ser construído, em linguagem de produto.

### 2.1 Financeiro, orçamentário e controle

| Bloco | Cláusulas | Origem no disco | Estado | Frente | Lacuna principal |
|---|---:|---|---|---|---|
| 5.9 Planejamento e Orçamento | 99 | `siafic-cg` M02 (PPA/LOA/QDD, programação, reprevisão) + M03 (créditos adicionais) | BASE_FORTE | ENT03 | Audiências públicas; emendas parlamentares com bloqueio de dotação e sanção total/parcial; LDO completa com memórias de cálculo STN e demonstrativo de obras; versionamento de peça orçamentária; compatibilização automática PPA↔LDO↔LOA; cotas de despesa por período com contingenciamento e liberação; metas de arrecadação e cronograma de desembolso por fonte; renúncia de receita; rotina de consistência das peças |
| 5.10 Contábil e Financeira | 186 | M01 ledger/PCASP · M04 receita · M05 despesa · M06 ordem cronológica · M07 extraorçamentário · M08 restos e encerramento · M12 relatórios · M14 MSC/MANAD · M17 Banco do Brasil · `packages/ofx` | BASE_FORTE | ENT03 | **Tesouraria M09 existe só como schema.** Conciliação bancária com importação OFX/OFC e pendências; borderô com controle de assinaturas; lotes de pagamento; diárias e adiantamentos com fluxo e prestação de contas; prestação de contas online por entidade beneficiária; convênios de repasse; precatórios; dívida fundada; parcerias público-privadas; consórcios; cadastro de obras com medições; multas de trânsito; fluxo de assinatura digital de empenho/liquidação/OP; consulta SEFAZ de NF-e contra a entidade; portal do fornecedor com valores a receber |
| 5.11 Controle Interno | 14 | — (M16 é autenticação, autorização e auditoria técnica; **não** é controle interno administrativo) | BASE_PARCIAL | ENT03 | Auditorias com auditor e responsável; checklist configurável por grupos e itens; agendamento e notificação de auditoria; registro de irregularidades com parecer e providência; relatório circunstanciado com quadros e anexos; instauração de auditoria a partir de evento |
| 5.8 Características gerais | 25 | M16 (auth, RBAC, auditoria) · M12 (emissão) · `packages/contracts` | BASE_PARCIAL | ENT02 | Campos personalizados criáveis pelo usuário; designer de relatórios com cópia de modelo, visibilidade, distribuição entre entidades e execução em segundo plano; assinatura digital com fila e notificação; custódia A1 em HSM; auditoria como linha do tempo dentro do próprio cadastro; restrição de acesso por IP/CIDR; ajuda contextual; direitos do titular de dados |

### 2.2 Pessoal

| Bloco | Cláusulas | Origem no disco | Estado | Frente | Lacuna principal |
|---|---:|---|---|---|---|
| 5.12 Folha e eSocial | 114 | `saas-municipal` `packages/folha-engine` (INSS, IRRF com os 3 cenários da Lei 15.270/2025, salário-família, 13º, proporcionalidade), worker BullMQ, rotas REST, E2E | BASE_PARCIAL | ENT04 | Engine está em **Drizzle/number**, o núcleo final é **Prisma/Decimal**: exige caracterização e reimplementação monetária, não cópia. Faltam UI inteira; folha suplementar de férias e rescisão; pasta funcional; contratos, cargos e níveis salariais completos; períodos aquisitivos de férias e licença-prêmio; pensão alimentícia; vale-transporte e vale-alimentação; margem consignável; provisões e sua contabilização; empenhamento automático com fluxo; recadastramento funcional; transmissão real do eSocial; exportação CADPREV |
| 5.13 Segurança e Medicina do Trabalho | 74 | — | AUSENTE_CONFIRMADO | ENT04 | Bloco inteiro: atestados e perícias; CIPA com processo eleitoral e reuniões; SIPAT; GHE; ordens de serviço; EPI/EPC com entrega e revisão; LTCAT; PGR; PCMSO; ASO; CAT com investigação; PPP; restrições médicas; brigada e extintores; planos de saúde; prontuários médico, psicológico e de assistência social |
| 5.14 Ponto Eletrônico | 40 | — | AUSENTE_CONFIRMADO | ENT04 | Bloco inteiro: importação AFD; configuração de tolerâncias; banco de horas e banco de dias; escalas de sobreaviso; hora atividade; cálculo de lançamentos; registro por portal com geolocalização e por biometria; espelho de ponto; solicitação de ajuste com deferimento |
| 5.15 Recrutamento e Seleção | 32 | — | AUSENTE_CONFIRMADO | ENT04 | Bloco inteiro: concursos e processos seletivos; vagas por cargo e cota; inscrição pelo portal com taxa; convocação e notificação; ensalamento; gabaritos; banco de talentos |
| 5.16 Treinamento e Desenvolvimento | 20 | — | AUSENTE_CONFIRMADO | ENT04 | Bloco inteiro: cursos e instituições com tabelas do MEC; turmas; frequência; encerramento e certificados; questionários de avaliação |

### 2.3 Suprimentos, patrimônio e frota

| Bloco | Cláusulas | Origem no disco | Estado | Frente | Lacuna principal |
|---|---:|---|---|---|---|
| 5.17 Compras, Licitações e Contratos | 113 | `siafic-cg` M11 (licitações, contratos, obras) | BASE_FORTE | ENT05 | Workflow visual do processo com liberação sequencial de etapas; pregão presencial com rodadas de lances e cronômetro; proposta comercial online criptografada; cotação de preços online; plano anual de licitações com intenções e adesão; ata de registro de preços com gestão de saldos; CRC de fornecedores com índices contábeis e atestado de capacidade técnica; Lei 13.019/2014; agenda pública; readequação de lotes pelo fornecedor |
| 5.18 Almoxarifado | 25 | M10 (almoxarifado dentro do patrimonial) | BASE_FORTE | ENT05 | Cotas de consumo por departamento; requisições com atendimento parcial; inventário com bloqueio de movimentação; controle de validade de lotes; remessas com fluxo de separação, conferência, transporte e entrega |
| 5.19 Patrimônio | 46 | M10 (bens, dívida, provisões) | BASE_FORTE | ENT05 | Etiquetas com código de barras; inventário com comissão e termos de abertura e fechamento; termo de responsabilidade e de baixa; transferência entre entidades com baixa e incorporação automáticas; avaliação patrimonial por fórmula editável; concessão de bens imóveis integrada a receitas |
| 5.20 Frota e Combustíveis | 50 | — | AUSENTE_CONFIRMADO | ENT05 | Bloco inteiro: veículos e máquinas; autorização de abastecimento e ordem de serviço; agenda e movimentação de garagem; manutenções e trocas; multas por CTB; sinistros; controle de CNH; hodômetro/horímetro; estoque próprio de combustível; consumo médio |
| 5.21 Fiscalização de Contratos | 29 | — | AUSENTE_CONFIRMADO | ENT05 | Bloco inteiro: agendamento de fiscalizações; formulários de fiscalização; ocorrências; painéis de fiscal e de gestor; planilhas orçamentárias de obras com medições |
| 5.22 Aplicativo de Fiscalização | 10 | — | AUSENTE_CONFIRMADO | ENT09 | Aplicativo móvel sobre a mesma base do 5.21 |

### 2.4 Fazendário e tributário — o maior vazio

| Bloco | Cláusulas | Origem no disco | Estado | Frente | Lacuna principal |
|---|---:|---|---|---|---|
| 5.29 Arrecadação | 56 | M20 (importador parametrizável, tributário) | BASE_PARCIAL | ENT06 | Só existe importação. Faltam convênios bancários; cadastro de receitas com fórmula por exercício; opções de pagamento e descontos; emissão de guias FEBRABAN e PIX; baixa por arquivo de retorno com lote e diferenças; compensações e restituições; certidões com QR de autenticidade; documentos diversos configuráveis; integração diária com a contabilidade |
| 5.30 IPTU e Taxas | 30 | — | AUSENTE_CONFIRMADO | ENT06 | Cadastro imobiliário urbano e rural; planta genérica de valores; zoneamento; vistorias; desmembramento e unificação; simulação; histórico e espelho por data; alteração em lote |
| 5.31 ITBI e Taxas | 26 | — | AUSENTE_CONFIRMADO | ENT06 | Processos de transferência internos e online por tabelionato; avaliação e impugnação; retificação; transferência automática na quitação |
| 5.32 ISSQN e Taxas | 40 | — | AUSENTE_CONFIRMADO | ENT06 | Cadastro mobiliário; atividades CNAE com grau de risco; sócios; alvarás com layout e bloqueios; eventos; veículos; ISS fixo |
| 5.33 Receitas Diversas | 9 | — | AUSENTE_CONFIRMADO | ENT06 | Taxas configuráveis; notas avulsas |
| 5.34 Dívida Ativa | 28 | M10 (rotina **contábil** de dívida ativa) | BASE_PARCIAL | ENT06 | A rotina contábil não é a cobrança. Faltam livro de registro; inscrição automática; parcelamentos e programas de recuperação com regras e cancelamento automático; execução fiscal em lote com CDA e petição; remessa a protesto; consulta gerencial |
| 5.23 Fiscalização Fazendária | 95 | — | AUSENTE_CONFIRMADO | ENT07 | Procedimentos fiscais com termos; homologação de prestados e tomados; instituições financeiras com cruzamento COSIF; autuação principal e acessória; recursos; plantão fiscal; notificação prévia; inteligência fiscal com cartões de crédito e ESTBAN |
| 5.24 Escrita Fiscal Eletrônica | 65 | — | AUSENTE_CONFIRMADO | ENT07 | Escrituração de prestados e tomados; acesso de contadores; declarações customizadas; DES-IF ABRASF com plano COSIF; livro fiscal; procurações digitais |
| 5.25 Simples Nacional | 28 | — | AUSENTE_CONFIRMADO | ENT07 | Importação de períodos, eventos, DAS, DASN, PARCSN, SIMEI; parcelamentos; cruzamentos e inscrição em dívida |
| 5.26 NFS-e e ADN | 67 | — | AUSENTE_CONFIRMADO | ENT07 | Emissão manual, por webservice e por aplicativo; RPS; cancelamento e substituição com prazos; créditos de IPTU; **IBS, CBS e NBS**; integração ADN. Layout e regras devem vir do catálogo técnico oficial, não das datas citadas em análises |
| 5.27 Robô da Malha Fina | 36 | — | AUSENTE_CONFIRMADO | ENT07 | Regras de cruzamento agendáveis; notificação eletrônica; ciência tácita; regularização automática; penalidade; abertura de procedimento fiscal |
| 5.28 Domicílio Eletrônico | 19 | — | AUSENTE_CONFIRMADO | ENT07 | Adesão com certificado; classes de documento com prazos; ciência e recurso; custódia A1 |
| 5.35 Abertura de Empresas (REDESIM) | 21 | — | AUSENTE_CONFIRMADO | ENT10 | Integração com a Junta Comercial; viabilidade, inscrição, alteração e baixa; setores de análise por grau de risco; deferimento automático parametrizado |
| 5.36 Construção Civil | 42 | — | AUSENTE_CONFIRMADO | ENT10 | Viabilidade construtiva; alvarás; análise de projetos com marcação em PDF; vistorias; habite-se; parcelamento do solo; fiscalização de obras e posturas |

### 2.5 Jurídico, atendimento e canais

| Bloco | Cláusulas | Origem no disco | Estado | Frente | Lacuna principal |
|---|---:|---|---|---|---|
| 5.41 Procuradoria | 47 | — | AUSENTE_CONFIRMADO | ENT08 | Bloco inteiro: processos judiciais; procurações; modelos e petições; intimações com prazos e distribuição; agenda; apensamento; **integração com o tribunal — contrato técnico a confirmar antes de codificar** |
| 5.42 Protocolo e Processo Digital | 75 | — | AUSENTE_CONFIRMADO | ENT02 | Bloco inteiro. É dependência de compras, construção civil, ouvidoria, serviços públicos e portal: **precisa entrar cedo**, não na frente 8 |
| 5.43 Comunicação Interna | 53 | — | AUSENTE_CONFIRMADO | ENT02 | Bloco inteiro: memorandos, ofícios e circulares; caixas de entrada e saída; tags; assinatura eletrônica por tipo; A/C; arquivamento e reabertura |
| 5.37 Portal Institucional | 44 | — | AUSENTE_CONFIRMADO | ENT09 | Bloco inteiro: notícias, serviços informativos, agenda, banners, subportais por secretaria, temas, acessibilidade, cookies |
| 5.38 Portal da Transparência | 57 | M13 (datasets, CSV RFC-4180) | BASE_PARCIAL | ENT09 | Existe a geração de dados, falta o portal. Consultas configuráveis pelo usuário; área de pessoal completa; LAI com pedidos; publicação de relatórios; acessibilidade; mapa do site; reCAPTCHA; ouvidoria |
| 5.39 Portal de Serviços e Autoatendimento | 116 | — | AUSENTE_CONFIRMADO | ENT09 | Bloco inteiro e o maior isolado do catálogo. Nasce em fatias junto de cada domínio: serviços do servidor, do contribuinte, do fornecedor e do profissional |
| 5.40 Aplicativo Mobile | 52 | — | AUSENTE_CONFIRMADO | ENT09 | Bloco inteiro: mesma base de dados, retaguarda de serviços e indicadores, push, assinatura no aplicativo |

### 2.6 Serviços setoriais

| Bloco | Cláusulas | Origem no disco | Estado | Frente | Lacuna principal |
|---|---:|---|---|---|---|
| 5.44 Serviços Públicos | 30 | — | AUSENTE_CONFIRMADO | ENT10 | Ocorrências com tipo configurável; programação com equipe e equipamento; custos de material e mão de obra; ordem de serviço |
| 5.45 Cemitérios | 26 | — | AUSENTE_CONFIRMADO | ENT10 | Cemitérios, lotes, sepulturas, lóculos e ossuários; sepultamento, velório, cremação, transferência e exumação; taxas por fórmula |
| 5.46 Agricultura | 42 | — | AUSENTE_CONFIRMADO | ENT10 | Produtor rural e inscrições estaduais; propriedades com geolocalização; produção; máquinas e implementos; pedidos de serviço com taxa; prontuário veterinário; programas e troca-troca |
| 5.47 Assistência Farmacêutica | 56 | — | AUSENTE_CONFIRMADO | ENT10 | Produtos com CATMAT, RENAME, REMUME e DCB; estoque com lote e validade; transferências; processos judiciais; kits; dispensação; **integração BNAFAR** |

---

## 3. Consequências para a ordem de execução

O prompt mestre já define que a fundação nasce junto de uma cadeia real e que
integrações não ficam para o fim. O mapa acrescenta três ajustes de prioridade
que decorrem dos números, não de preferência:

1. **Protocolo/processo digital e comunicação interna sobem para ENT02.** São 128
   cláusulas ausentes das quais dependem compras (5.17.49), construção civil
   (5.36.23), serviços públicos (5.44.5), ouvidoria (5.39.6) e boa parte do portal.
   Construí-las depois obriga a refazer os pontos de integração.
2. **O bloco tributário precisa começar cedo mesmo não sendo o mais visível.** São
   562 cláusulas sem base, com dependência externa de credenciamento (ADN, RFB,
   Junta Comercial) cujo prazo não é controlado por quem desenvolve. A descoberta
   dos contratos técnicos deve começar em ENT06, não em ENT07.
3. **O cadastro imobiliário e o cadastro mobiliário são fundação, não módulo.**
   IPTU, ITBI, ISS, alvarás, construção civil, REDESIM, cemitérios e agricultura
   dependem deles. Entram no início de ENT06, antes de qualquer cálculo.

---

## 4. Como esta tabela deve ser usada

- Ela informa **de onde partir**, não o que está pronto. Nenhuma cláusula muda de
  `NAO_VERIFICADO` por causa deste documento.
- Ao abrir um lote, confirme a origem no disco antes de reaproveitar. Se o módulo
  citado não existir ou não corresponder, registre a divergência e trate como
  ausente, sem corrigir a tabela silenciosamente.
- `BASE_FORTE` obriga a passo de caracterização: rodar a suíte do módulo, ler o
  `MODULO.md` e registrar o comportamento atual **antes** de ampliar.

### ⚠️ 4.1 · O critério de `BASE_FORTE` foi DERRUBADO pelo censo do ENT03c

O censo do ENT03c mediu M01–M22 contra as cláusulas e encontrou o mesmo erro três
vezes: **a coluna "origem no `siafic-cg`" registrava que existe um arquivo com aquele
nome, não que o comportamento exista.** O nome do módulo bate; o domínio é outro.

| Seção | O que a tabela dizia | O que a medição achou |
|---|---|---|
| **5.18 Almoxarifado** (25) | `BASE_FORTE` — M10 | O almoxarifado é **contábil, não físico**: move VALOR por classe contra a conta de estoque e **não tem quantidade**. Sem quantidade não há preço médio, saldo mínimo, inventário, depósito nem lote. **20 das 25 cláusulas são `AUSENTE_CONFIRMADO`** |
| **5.19 Patrimônio** (46) | `BASE_FORTE` — M10 | É a **contabilidade do bem, não a gestão dele**. Depreciação por NBC TSP 07 com os três métodos do MCASP, provada — e nenhuma localização, responsável, comissão ou termo |
| **5.17 Compras e Contratos** (113) | `BASE_FORTE` — M11 | Tem o **processo e o contrato**; não tem a **compra**. Requisição, cotação, ordem de compra e recebimento não existem |

Nos três, o motor é bom e está provado. **Falta o cadastro que o alimenta** — e é
essa distinção que a classificação por nome de arquivo não consegue fazer.

### ⚠️ 4.1.1 · O ENT05 construiu o modelo das três, e a tabela tem de acompanhar

O ENT05 partiu daqui, e o resultado por seção:

| Seção | O que nasceu | Cláusulas que saíram de `AUSENTE_CONFIRMADO`/`PARCIAL` |
|---|---|---:|
| **5.18 Almoxarifado** | eixo FÍSICO: material com unidades N-N, depósito, lote com validade, movimento com quantidade, preço médio derivado, requisição com atendimento parcial, cota mensal, inventário que bloqueia, bloqueio como fato | **14** |
| **5.19 Patrimônio** | eixo de GESTÃO: localização, responsável, estado, situação, comissão designada, inventário de bens com termo, etiqueta idempotente, transferência entre entidades composta, fórmula de avaliação interpretada | **20** |
| **5.17 Compras** | a COMPRA: marca e elemento do material, solicitação com situação derivada, pesquisa de preços com médio/mínimo/máximo, ordem de compra com saldo pendente derivado, recebimento | **20** |

⚠️ **AS 54 ESTÃO EM `IMPLEMENTADO_NAO_VALIDADO`, NÃO EM `VALIDADO_LOCALMENTE`.** Elas têm
modelo, caso de uso e teste contra banco — e **nenhuma tem tela**. A superfície pelo molde
é o lote seguinte, e é lá que elas se validam.

⚠️ **E O PERCENTUAL DO CATÁLOGO NÃO SE MOVEU** (316 de 2037). As 184 cláusulas destas
seções já estavam contadas pelo censo do ENT03c, com veredito negativo. Lote que constrói
sobre seção já censada move **situação**, não **cobertura** — confundir as duas faria o
próximo lote achar que não avançou.

**Consequência para as 469 cláusulas de `BASE_FORTE`:** elas precisam da medição
cláusula a cláusula que o ENT03c fez, não da leitura de schema que produziu esta
tabela. O ENT03c mediu 9 seções e marcou 220; as demais continuam sobre o critério
antigo, que já se sabe insuficiente.

⚠️ **E o ENT04 mostrou que o mesmo vale para o PARÂMETRO, não só para o código.** Com
o PCASP oficial do TCE-PB carregado (7.864 contas), o confronto revelou que o sistema
opera contas cujo nome no plano é outro: a conta de banco é a variante **INTRA OFSS**,
o "almoxarifado" é **MERCADORIAS PARA REVENDA**, e a "dívida fundada" é **PESSOAL A
PAGAR**. Nenhum código era inventado — todos existem no plano; estavam no lugar
errado. Ter o arquivo, ter a tabela e ter o código certo são três coisas diferentes.
- `AUSENTE_CONFIRMADO` não autoriza inventar o domínio. As cláusulas do catálogo
  são o ponto de partida; regra normativa exige documento oficial com versão e
  vigência.
