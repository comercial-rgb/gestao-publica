# Gabarito de lote e briefings das frentes ENT04 a ENT11

> Este arquivo tem dois usos. A seção 1 é o **molde** que o agente aplica para
> escrever o prompt de qualquer lote seguinte. As seções 2 a 9 são os
> **briefings** de cada frente restante: escopo real, o que reaproveitar, as
> armadilhas conhecidas e o critério de conclusão.
>
> Não execute uma frente inteira em uma sessão. Cada frente se decompõe em lotes
> verificáveis, e cada lote fecha com gate e checkpoint.

---

## 1. Molde de lote

Ao abrir um lote, escreva o prompt com esta estrutura e não pule etapa:

**1. Situação de partida.** O que o mapa de lacunas diz, o que o disco confirma,
e a divergência entre os dois quando houver. Se o módulo citado como origem não
existir ou não corresponder, registre e trate como ausente.

**2. Caracterização.** Para tudo classificado como base forte ou parcial: rodar a
suíte, ler o `MODULO.md`, registrar o comportamento atual antes de ampliar.
Nenhuma ampliação sobre suíte vermelha.

**3. Escopo do lote.** Uma cadeia de negócio completa e navegável, não uma lista
de cadastros. Cada capacidade transversal consumida por um caso de uso real.

**4. Reaproveitamento obrigatório.** Tabela de "verificar antes de escrever":
contratos, ledger, protocolo, anexos, assinatura, notificações, relatórios,
campos adicionais. Reimplementar só o que depender de infraestrutura
incompatível.

**5. Contratos de rota.** Propostas, a confrontar com as rotas reais. `GET` não
produz transição de estado. Comando de negócio tem permissão própria no servidor.

**6. Dependências externas.** Órgão, documento oficial, versão, ambiente,
credencial, convênio, próxima ação. Uma dependência bloqueia o que depende dela,
não o lote inteiro. Nunca substituída por retorno simulado apresentado como real.

**7. Testes mínimos.** Isolamento entre municípios e entidades, autorização no
servidor, período fechado, concorrência, idempotência, efeitos contábeis quando
houver, persistência após recarga, e ausência de rótulo de conformidade na
interface.

**8. Definição de concluído.** Uma cadeia percorrida pela interface com dados
persistidos, suíte anterior verde, testes do lote verdes, checkpoint atualizado.

Regras que valem em todos os lotes, sem repetir em cada um:

- Dinheiro é `Decimal`, sempre, com os helpers do núcleo.
- Ledger é append-only; correção é lançamento novo referenciando o original.
- Escrita financeira respeita período aberto, verificado no caso de uso.
- Tenant e entidade resolvidos no servidor a partir de membership confiável.
- Nenhuma tela com botão sem handler, link vazio, contador estático ou aviso de
  sucesso sem persistência.
- Nenhum identificador de cláusula, selo de conformidade ou percentual de
  cobertura em tela, mensagem, documento operacional, rota ou atributo acessível.
  Vocabulário de negócio permanece: edital, licitação, pregão, contrato, termo de
  referência de uma compra.
- Comentário `@req` serve para rastrear, nunca para declarar atendimento.

---

## 2. ENT04 — pessoal

**Cláusulas:** 280 (5.12 folha 114, 5.13 SST 74, 5.14 ponto 40, 5.15
recrutamento 32, 5.16 treinamento 20).
**Partida:** só a folha tem base, e em outro repositório e outro ORM. SST, ponto,
recrutamento e treinamento são 166 cláusulas sem uma linha escrita.

**Sobre portar a folha.** O `folha-engine` do `saas-municipal` é domínio puro com
81 testes: INSS, IRRF com os três cenários da Lei 15.270/2025, salário-família,
13º e proporcionalidade. É conhecimento real e deve ser aproveitado. Mas ele
opera em `number`/`numeric` e o núcleo final exige `Decimal`. Isso é
reimplementação com caracterização, não cópia:

1. Extrair os casos de teste existentes como **golden fixtures** de regressão.
2. Reimplementar em `Decimal`, com a precisão intermediária e o arredondamento
   explicitados por regra, não truncados globalmente.
3. Rodar as goldens. Divergência é investigada, não acomodada.
4. Validar a correção normativa **em separado**: uma golden que reproduz o
   comportamento antigo não transforma fórmula errada em regra legal.

Atenção à armadilha documentada: `${arr}` em template Drizzle não vira array e o
bug passou por 102 testes verdes porque as fixtures rodavam com zero vínculos.
Ao portar, teste com vínculos reais.

**Escopo mínimo da frente:** cadastro de contrato de funcionário com pasta
funcional; cargos, níveis e atos legais; dependentes e previdências; períodos
aquisitivos de férias e licença-prêmio com perdas e prorrogações; cálculo mensal,
férias, 13º, rescisão e complementar; provisões com contabilização e baixa;
empenhamento automático com fluxo até o pagamento; margem consignável;
vale-transporte e vale-alimentação; pensão alimentícia; recadastramento pelo
portal; ponto com AFD, banco de horas, espelho e solicitação de ajuste; SST com
ASO, CAT, EPI, LTCAT, PGR, PCMSO e prontuários; concursos com inscrição pelo
portal e taxa; turmas e certificados.

**Dependências externas:** eSocial (ambiente, certificado, procuração
eletrônica), CADPREV, tabelas federais vigentes. Sem credencial, o estado é
`PENDENTE_CONFIGURACAO`; o restante da folha não para.

**Sensibilidade:** prontuário médico, psicológico e de assistência social não são
visíveis por permissão genérica de gestor. Separe explicitamente.

**Concluído quando:** uma competência fecha de ponta a ponta — cálculo, conferência,
recibo, empenho, liquidação, pagamento e provisão — com os valores conferidos
contra golden e o reflexo contábil correto.

---

## 3. ENT05 — suprimentos, patrimônio e frota

**Cláusulas:** 273 (5.17 licitações 113, 5.18 almoxarifado 25, 5.19 patrimônio 46,
5.20 frota 50, 5.21 fiscalização 29, 5.22 aplicativo 10).
**Partida:** M11 e M10 dão base a 184 cláusulas; frota e fiscalização de contratos
são 89 cláusulas ausentes.

**Escopo mínimo:** cadastro de materiais com CATMAT, marcas aprovadas, elemento de
despesa e histórico de aquisições; plano anual de licitações com intenções e
adesão; pesquisa de preços com cotação online; processo licitatório com etapas
liberadas em sequência; pregão presencial com rodadas de lances, cronômetro,
negociação e desempate da LC 123/2006; proposta comercial preenchida pelo
fornecedor com criptografia em repouso; ata de registro de preços com controle de
saldo; contratos com aditivos, apostilamentos, limites do art. 124 e fiscais
designados; ordem de compra com reserva, empenho e estorno em cascata; CRC com
validade de documentos e índices contábeis; almoxarifado com cotas, requisições,
inventário bloqueante e remessas; patrimônio com etiquetas, inventário por
comissão, termos, transferência entre entidades e depreciação mensal; frota
inteira; fiscalização de contratos com agendamento, formulário, ocorrência,
painel e planilha de medição.

**Ligações obrigatórias:** requisição de compra abre processo digital (ENT02);
reserva e empenho passam pelo ledger, sem segundo caminho; depreciação e
incorporação de bens geram lançamento; entrega de EPI baixa estoque do
almoxarifado quando configurado.

**Armadilha:** o aplicativo de fiscalização (5.22) usa a mesma base do 5.21 em
tempo real. Não crie uma base intermediária.

**Concluído quando:** uma compra percorre requisição, processo licitatório,
homologação, contrato, ordem de compra, empenho, entrega, entrada em estoque ou
incorporação patrimonial e fiscalização registrada, com os efeitos financeiros
corretos.

---

## 4. ENT06 — cadastros fiscais e arrecadação

**Cláusulas:** 209 (5.29 arrecadação 56, 5.30 IPTU 30, 5.31 ITBI 26,
5.32 ISSQN 40, 5.33 receitas diversas 9, 5.34 dívida ativa 28).
**Partida:** essencialmente zero. M20 importa; M10 tem a rotina contábil de dívida
ativa, que não é a cobrança.

**Ordem interna obrigatória.** Cadastro imobiliário e cadastro mobiliário são
fundação de IPTU, ITBI, ISS, alvarás, construção civil, REDESIM, cemitérios e
agricultura. Construa-os primeiro, com campos adicionais, histórico por data,
espelho, geolocalização, vistorias e alteração em lote. Só então o motor de
cálculo.

**O motor de cálculo é o coração da frente.** Requisitos que o definem:
configuração por receita e **por exercício**, com fórmula distinta por tributo e
por ano; parâmetros de correção, multa, juros e Selic; valores mínimos por débito
e por parcela, diferenciados por tipo de pessoa; múltiplas opções de pagamento
com descontos e datas; desconto condicionado à existência de débitos, com o
vínculo e o tipo de débito configuráveis; simulação que não contamina o cadastro;
depuração da fórmula visível ao usuário, com os parâmetros aplicados.

Use a gramática segura de fórmulas construída em ENT02. Não use `eval`, não dê SQL
ao usuário, e mantenha `Decimal` em toda a cadeia.

**Arrecadação:** convênios bancários por entidade e por tributo; guias FEBRABAN e
PIX; consulta de carnês emitidos com reemissão sem novo código de barras; baixa
por arquivo de retorno com lote identificado, resumo de consistências e download
posterior do arquivo; baixa manual por tipo de pagamento; diferenças de pagamento
com lançamento complementar configurável; compensações, restituições, massas
falidas, transações e outorga onerosa; certidões com finalidade, validade por
tipo e QR de autenticidade; documentos diversos configuráveis pelo usuário;
integração diária com a contabilidade para lançamento, arrecadação,
recolhimento, renúncia e movimentação da dívida.

**Dívida ativa:** livro de registro; inscrição automática mensal com dias
amigáveis; estorno de inscrição sem movimentação posterior; modalidades de
parcelamento com prazo de adesão, entrada, número máximo de acordos por inscrição
e receitas elegíveis; cancelamento automático por parcelas em atraso com método
de imputação ou abatimento proporcional definido; execução fiscal em lote com
prévia, CDA e petição; remessa a protesto com desistência e cancelamento;
privilégio de acesso separado para dívida administrativa, judicial e cartório.

**Concluído quando:** um imóvel é cadastrado, o IPTU do exercício é calculado com
fórmula configurada, a guia é emitida, o pagamento é baixado por arquivo de
retorno, a diferença gera lançamento complementar, o débito não pago é inscrito
em dívida, parcelado e o parcelamento cancelado por inadimplência — com o reflexo
contábil correto em cada etapa.

---

## 5. ENT07 — fiscal eletrônico

**Cláusulas:** 310 (5.23 fiscalização fazendária 95, 5.24 escrita fiscal 65,
5.25 Simples 28, 5.26 NFS-e/ADN 67, 5.27 malha fina 36, 5.28 domicílio 19).
**Partida:** zero.

**Comece pela descoberta, não pelo código.** Antes de qualquer implementação,
obtenha do portal oficial da NFS-e nacional o catálogo técnico do ambiente
aplicável: manuais, esquemas XSD, notas técnicas vigentes, regras de validação e
o modelo dos grupos de IBS, CBS e NBS. Registre versão, data e ambiente.

**Não converta em constante de produção** nenhuma data, alíquota ou regra citada
em análise, artigo ou notícia. Elas servem para orientar a busca do documento
oficial, não para substituí-lo.

**Escopo mínimo:** domicílio eletrônico com adesão por certificado, classes com
prazo de ciência e recurso, ciência tácita e custódia A1 — é dependência de
fiscalização e malha fina, construa primeiro; escrita fiscal de prestados e
tomados com digitação, importação, retificação, complementação, acesso de
contadores e declarações customizadas; DES-IF no padrão ABRASF com plano COSIF,
balancete analítico e cruzamento contábil; Simples Nacional com importação de
períodos, eventos, DAS, DASN, PARCSN e SIMEI, parcelamentos e cruzamentos; NFS-e
com emissão manual, por webservice e por aplicativo, RPS com prazo de conversão,
cancelamento e substituição com prazos configuráveis, créditos de IPTU e
integração ADN; malha fina com regras agendáveis, notificação eletrônica,
regularização automática detectada e penalidade; fiscalização fazendária com
procedimento, termos, homologação de prestados, tomados e instituições
financeiras, autuação principal e acessória, recurso, plantão fiscal e
notificação prévia.

**Estados dos conectores:** use a nomenclatura do prompt mestre —
`PENDENTE_CONFIGURACAO`, `VALIDADO_LOCALMENTE`, `AGUARDANDO_ENVIO`, `ENVIADO`,
`PROCESSANDO`, `ACEITO`, `REJEITADO`, `ERRO_TRANSPORTE`. `ACEITO` exige retorno
correspondente. Timeout não prova rejeição nem autoriza retransmitir sem
verificar duplicidade.

**Concluído quando:** um prestador emite NFS-e válida contra o esquema oficial no
ambiente de homologação, a nota entra automaticamente na escrituração, o
encerramento gera a guia, o não encerramento dispara a malha fina, a notificação
chega ao domicílio eletrônico e o procedimento fiscal é aberto a partir dela.

---

## 6. ENT08 — procuradoria

**Cláusulas:** 47. **Partida:** zero.

**Antes de codificar, confirme o contrato de integração com o tribunal.** A
documentação oficial consultada trata de eproc para procuradorias; a associação
automática a PJe ou MNI é heurística do extrator, não fato. Endpoints,
credenciamento e formato precisam ser confirmados na fonte do tribunal
competente. Não substitua a lacuna por scraping nem por retorno simulado
apresentado como protocolo.

**Escopo mínimo:** advogados e partes no cadastro único; órgãos jurisdicionais;
procurações; modelos de peça com substituição de variáveis; geração automática de
CDA e petição inicial de execução fiscal a partir da dívida ativa de ENT06;
notificação em tempo real de novos processos e de prazos; distribuição de
intimações por sequencial e por grupo, com afastamento programado; tramitação com
histórico; apensamento com bloqueio de exclusão; sigilo por nível; agenda de
compromissos com acesso configurável; petição intermediária gerada em lote a
partir de movimentação de arrecadação; classes e assuntos do CNJ.

**Concluído quando:** uma dívida inscrita gera CDA e petição, o processo é
registrado, a intimação é distribuída com prazo, a movimentação de pagamento
produz a petição intermediária cabível e o histórico registra tudo — com a
integração externa em estado honesto.

---

## 7. ENT09 — canais

**Cláusulas:** 340 (5.37 institucional 44, 5.38 transparência 57, 5.39 portal de
serviços 116, 5.40 aplicativo 52, mais o aplicativo de fiscalização 5.22 com 10 e
os serviços dispersos nas demais frentes).
**Partida:** M13 gera datasets e CSV; o portal não existe.

**Princípio da frente:** o portal não é um lote no fim. Cada serviço nasce junto
do domínio que o alimenta — o serviço do fornecedor em ENT03, o do servidor em
ENT04, o do contribuinte em ENT06, o do profissional em ENT07. ENT09 constrói a
casca, a retaguarda de serviços, a navegação, a acessibilidade e o aplicativo,
e recolhe as fatias já entregues.

**Escopo mínimo:** portal institucional com notícias, serviços informativos,
agenda, banners, subportais por secretaria, temas configuráveis, acessibilidade e
gestão de cookies; portal da transparência sobre os datasets do M13, com consultas
gerenciáveis pelo usuário, área de pessoal completa, publicação de relatórios,
LAI com pedidos, ouvidoria, mapa do site, reCAPTCHA e DPO publicado; portal de
serviços com solicitação de acesso, catálogo de serviços com login exigido ou
não, carta de serviços da Lei 13.460/2017 com avaliação pelo cidadão e resultado
público, favoritos, agendamento de atendimento e emissão de guias com PIX;
aplicativo móvel com a mesma base, retaguarda de serviços e indicadores, push com
destino ao serviço, assinatura no aplicativo e consulta de processos.

**Regras próprias da frente:** a transparência é a superfície pública de maior
risco — cache, minimização de dados e reCAPTCHA sem quebrar as consultas. Dados
clínicos, tributários e funcionais não são projetados publicamente. O painel de
indicadores só mostra número que vem de registro real.

**Concluído quando:** o cidadão se cadastra, consulta débitos, emite guia com PIX,
abre processo digital, acompanha o andamento, avalia o serviço, e o servidor
emite contracheque e solicita ajuste de ponto — tudo pelo portal, com os mesmos
dados do back-office.

---

## 8. ENT10 — serviços setoriais e urbanismo

**Cláusulas:** 217 (5.35 REDESIM 21, 5.36 construção civil 42, 5.44 serviços
públicos 30, 5.45 cemitérios 26, 5.46 agricultura 42, 5.47 farmácia 56).
**Partida:** zero em todos.

Todos dependem do cadastro imobiliário e do cadastro mobiliário de ENT06, do
processo digital de ENT02, do motor de fórmulas para taxas e do portal para as
solicitações externas. Por isso a frente vem depois — não porque seja acessória.

**REDESIM:** integração com a Junta Comercial do estado; importação automática de
eventos; setores de análise por chave de integração e centro de custo; análise por
grau de risco com deferimento automático parametrizado contra zoneamento e
restrições do imóvel; criação automática de solicitação de acesso ao portal para
o novo estabelecimento.

**Construção civil:** viabilidade construtiva emitida automaticamente a partir do
zoneamento e dos índices urbanísticos; análise de projeto com marcação sobre PDF;
alvarás com assinatura digital; vistorias; habite-se parcial e total com
atualização do cadastro imobiliário; parcelamento do solo; fiscalização de obras
e posturas com embargo e auto de infração.

**Serviços públicos:** tipos de ocorrência configuráveis com campos e documentos
próprios; abertura pelo portal e pelo aplicativo com posição no mapa; programação
com equipe, equipamento e reprogramação; custo orçado e executado de material e
mão de obra; ordem de serviço.

**Cemitérios:** cemitérios, capelas, funerárias, lotes, sepulturas, lóculos e
ossuários com identificadores configuráveis; sepultamento, velório, cremação,
transferência e exumação com situação própria; taxas por fórmula; registro de
óbito refletido no cadastro único.

**Agricultura:** produtor rural com CAF e inscrições estaduais; propriedades com
geolocalização e consulta em mapa; produção por cultivo e área; máquinas e
implementos; pedidos de serviço com agendamento, execução e taxa integrada à
arrecadação; prontuário veterinário; programas e troca-troca com assinatura
digital do produtor.

**Assistência farmacêutica:** produtos com CATMAT, princípio ativo, apresentação,
RENAME, REMUME e DCB; entrada com importação de XML de nota fiscal, lote,
validade e aprovação; baixa, bloqueio de lote, transferência entre unidades,
requisição, demanda reprimida e inventário; processos judiciais com dispensação
vinculada; kits com geração, não retirada e retorno ao estoque; dispensação por
código de barras do receituário, com exigência de prescritor em receita especial;
integração BNAFAR com envio automático de entradas e posição de estoque e
consulta da situação dos envios.

**Sensibilidade:** dispensação e prontuário veterinário contêm dado pessoal
sensível. Não os exponha na transparência nem em relatório genérico.

---

## 9. ENT11 — migração, desempenho, operação e entrega

**Natureza:** não é um bloco de cláusulas, é o hardening contínuo. Começa cedo e
fecha por último.

**Migração de dados.** A cláusula atribui a conversão ao fornecedor, com os dados
disponibilizados pelo município, sem definir formato, volume ou prazo. Trate como
projeto próprio: inventário das bases de origem, dicionário de destino, regras de
transformação com dono confirmado, reconciliação por totais e por amostra, e
registro da origem em cada registro migrado.

Dados de Campina Grande/PB ou Santa Izabel do Oeste/PR **não podem** ser
rebatizados como outro município. Para o ledger existente, não desabilite a
imutabilidade para backfill: avalie mapeamento de propriedade ou migração
controlada para estrutura nova, preservando payload, identificadores, hashes e
reconciliação.

**Exportação integral.** Rotina que entrega todos os dados em formato estruturado
e aberto, acompanhada de dicionário de campos gerado a partir do próprio schema.
É barata agora e cara depois. Construa cedo, mesmo que a frente feche no fim.

**Desempenho e disponibilidade.** Definir e medir: tempo de resposta das consultas
que percorrem o ledger, geração de relatórios em segundo plano sob carga,
processamento de folha em volume, e o comportamento sob concorrência real.

**Recuperação.** Backup automatizado, armazenamento separado e criptografado,
teste de restauração documentado com periodicidade definida, e alvos de perda e
tempo de recuperação declarados e medidos, não apenas escritos.

**Acessibilidade.** Alto contraste, controle de fonte, teclas de atalho e leitor
de tela nas superfícies públicas, verificados com ferramenta e com navegação por
teclado, não por declaração.

**Operação.** Ajuda contextual completa, portal de chamados com severidades
configuradas, trilha de auditoria consultável, e o inventário de dependências
externas mantido atualizado com órgão, versão, ambiente, credencial e próxima
ação.

**Regra final da frente:** o aceite externo é separado da evidência local. Golden
byte a byte prova formatação determinística, não aceitação de tribunal. Estado
simulado prova simulação, não protocolo. Preserve essa hierarquia em tudo o que
for construído.
