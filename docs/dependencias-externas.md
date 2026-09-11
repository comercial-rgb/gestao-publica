# Dependências externas

> Criado em ENT00 (2026-09-09). Uma linha por integração exigida pelo documento
> de origem ou já presente no código.
>
> **Regra de leitura.** Uma dependência sem credencial bloqueia a *validação
> externa* daquela integração. Não bloqueia arquitetura, testes nem o
> desenvolvimento do domínio, e não pode ser substituída por protocolo fictício,
> retorno simulado apresentado como aceite, ou comprovante fabricado.
>
> Nenhuma linha abaixo está validada contra ambiente externo. Nenhuma credencial
> foi solicitada ou obtida neste lote.

## Legenda de estado

| Estado | Significado |
|---|---|
| `CODIGO_LOCAL_SEM_VALIDACAO` | Existe adapter no disco; nunca exercitado contra o órgão |
| `VALIDADO_CONTRA_TERCEIRO` | Conferido contra implementação independente do formato — **não** contra o órgão. Vale para formato de arquivo; não substitui aceite |
| `AUSENTE` | Nenhum código em nenhum dos dois repositórios |
| `PENDENTE_DESCOBERTA` | Falta obter o documento técnico oficial, versão e vigência |

## Município de destino

O destino declarado é **Anita Garibaldi/SC**. Os adapters de tribunal presentes
no disco são de **PB (SAGRES)** e **BA (SIGA)**. Nenhum deles atende SC. Renomear
SAGRES para e-Sfinge não produz o conector de SC — é contrato diferente.

---

## Órgãos de controle

| Órgão | Funcionalidade | Documento oficial | Versão | Ambiente | Credencial | Convênio | Protocolo | Restrição | Próxima ação | Responsável |
|---|---|---|---|---|---|---|---|---|---|---|
| TCE/SC | Remessa e-Sfinge (atos jurídicos, obras, pessoal, execução orçamentária, registros contábeis, tributário, planejamento, gestão fiscal) | IN TC-28/2021 e IN TC-35/2024 — **não obtidos** | — | — | não solicitada | — | — | `AUSENTE`. Sem conector SC. Prazos por módulo e regras de consistência impeditivas/alerta não mapeados. ⚠️ **É o único cuja ausência bloqueia ARQUITETURA**: sem o leiaute não se sabe o recorte dos registros, e escrever o conector antes é escrever o errado | **Baixar do portal do TCE/SC** (público, sem credencial): IN TC-28/2021, IN TC-35/2024 e o leiaute vigente do e-Sfinge. Registrar versão e vigência ANTES de codificar | a definir |
| TCE/PB | Remessa SAGRES | — | — | — | não aplicável ao destino | — | — | `CODIGO_LOCAL_SEM_VALIDACAO` — `adapters/tribunais/tce-pb`. Preservar como histórico/produto | Nenhuma neste projeto; não converter em conector SC | — |
| TCM/BA | Remessa SIGA | — | — | — | não aplicável ao destino | — | — | `CODIGO_LOCAL_SEM_VALIDACAO` — `adapters/tribunais/tcm-ba`. Preservar como histórico/produto | Nenhuma neste projeto | — |
| STN / Tesouro Nacional | MSC e MANAD | — | — | — | — | — | — | `CODIGO_LOCAL_SEM_VALIDACAO` — M14. Formatação determinística testada localmente não prova aceite | Confirmar layout vigente ao entrar em ENT03 | a definir |

## Fazendário e tributário

| Órgão | Funcionalidade | Documento oficial | Versão | Ambiente | Credencial | Convênio | Protocolo | Restrição | Próxima ação | Responsável |
|---|---|---|---|---|---|---|---|---|---|---|
| Ambiente de Dados Nacional (ADN) | NFS-e nacional; IBS, CBS e NBS | Manuais e esquemas oficiais — **não obtidos** | — | — | não solicitada | — | — | `AUSENTE` + `PENDENTE_DESCOBERTA`. Não copiar alíquotas ou datas de análises como constante de produção | Obter manual, XSD e regras de CSTAT do ambiente; registrar vigência | a definir |
| Receita Federal | Simples Nacional: períodos, eventos, DAS, DASN, PARCSN, DAS-SIMEI, PGDAS-D | — | — | — | não solicitada | — | — | `AUSENTE` | Obter layouts dos arquivos e regra de acesso | a definir |
| Receita Federal | Consulta de NF-e (DANFE) na liquidação | — | — | — | não solicitada | — | — | `AUSENTE` | Confirmar se é consulta pública ou exige credenciamento | a definir |
| SEFAZ | NF-e emitidas contra a entidade | — | — | — | não solicitada | — | — | `AUSENTE` | Confirmar contrato de consulta | a definir |
| Banco Central | Arquivo ESTBAN (estatística bancária mensal) | — | — | — | pública | — | — | `AUSENTE` | Confirmar layout e periodicidade na entrada de ENT07 | a definir |
| Operadoras de cartão | Arquivo de faturamento para cruzamento fiscal | — | — | — | — | — | — | `AUSENTE`. Depende de norma municipal que obrigue a entrega | Confirmar base legal municipal | a definir |
| Junta Comercial / REDESIM | Viabilidade, inscrição, alteração e baixa de empresa | — | — | — | não solicitada | não firmado | — | `AUSENTE`. Integração por webservice com a junta do estado | Identificar a junta de SC e seu processo de credenciamento | a definir |

## Pessoal

| Órgão | Funcionalidade | Documento oficial | Versão | Ambiente | Credencial | Convênio | Protocolo | Restrição | Próxima ação | Responsável |
|---|---|---|---|---|---|---|---|---|---|---|
| eSocial | Eventos S-1200, S-1202 e demais | — | — | — | não solicitada | — | — | `AUSENTE` no núcleo. O `saas-municipal` tem estrutura de eventos pendentes, sem transmissão real | Obter leiaute vigente do eSocial; certificado exigido | a definir |
| CADPREV / Secretaria da Previdência | Exportação de avaliação atuarial | — | — | — | — | — | — | `AUSENTE` | Obter layout dos sete arquivos | a definir |
| INSS | CAT — Comunicação de Acidente de Trabalho | — | — | — | — | — | — | `AUSENTE` | Confirmar se é transmissão ou apenas layout de impressão | a definir |
| MEC | Tabelas de cursos e instituições de ensino | — | — | — | pública | — | — | `AUSENTE` | Obter tabelas ao entrar em ENT04 | a definir |
| Ministério do Trabalho / INMETRO | Importação AFD (ponto eletrônico) | Portaria vigente — **não obtida** | — | — | não aplicável | — | — | `AUSENTE` | Obter especificação do AFD | a definir |

## Financeiro e bancário

| Órgão | Funcionalidade | Documento oficial | Versão | Ambiente | Credencial | Convênio | Protocolo | Restrição | Próxima ação | Responsável |
|---|---|---|---|---|---|---|---|---|---|---|
| Banco do Brasil | Borderô e retorno bancário | — | — | — | não configurada | não firmado | — | `CODIGO_LOCAL_SEM_VALIDACAO` — M17 e `scripts/bb-smoke.ts`. **Um banco não equivale a todos os convênios**. `enviarBordero` (M09) RECUSA sempre, nomeando: não há convênio configurado. Pendência `BORDERO-CONVENIO-BANCARIO` | Levantar quais bancos o município usa de fato — a resposta muda o layout de remessa, e ela não se adivinha | a definir |
| Convênios bancários (demais) | Guias FEBRABAN com código de barras, PIX, registro de cobrança, retorno | — | — | — | não solicitadas | não firmados | — | `AUSENTE` | Levantar convênios vigentes do município | a definir |
| — (formato) | Remessa e retorno CNAB 240/400 | FEBRABAN CNAB 240, layout por banco | **não obtido** | não aplicável — arquivo | não aplicável | — | — | `AUSENTE`. ⚠️ **O layout CNAB é POR BANCO**, não único: o "padrão FEBRABAN" fixa a estrutura e cada banco define os campos de segmento. Escrever um gerador contra a especificação genérica produz arquivo que o banco recusa | Obter o manual do banco escolhido; testar contra validador independente, **não** contra o próprio gerador (a lição do OFX) | a definir |
| — (formato) | Extrato OFX/OFC para conciliação | OFX 1.0.2 (SGML) | 1.0.2 | não aplicável — arquivo, não webservice | não aplicável | — | — | `VALIDADO_CONTRA_TERCEIRO` — `packages/ofx` conferido contra `ofxtools` 1.1.1 (PyPI) em 2026-09-10: 3 arquivos, 6 transações, todos os campos conferem. **Correção ao que esta linha dizia antes: a conciliação do M09 NÃO existe "só como schema"** — `conciliacao.ts` (351), `vinculo.ts` (497), `extrato.ts` (164), `dominio.ts` (350) e 1607 linhas de teste | Obter um extrato OFX REAL de banco brasileiro e acrescentá-lo ao corpus; o corpus atual é sintético, ainda que conforme | a definir |

## Jurídico, assinatura e saúde

| Órgão | Funcionalidade | Documento oficial | Versão | Ambiente | Credencial | Convênio | Protocolo | Restrição | Próxima ação | Responsável |
|---|---|---|---|---|---|---|---|---|---|---|
| Tribunal de Justiça de SC | Peticionamento e acompanhamento processual (1º e 2º grau) | — | — | — | não solicitada | não firmado | — | `AUSENTE` + `PENDENTE_DESCOBERTA`. **Não assumir TJSC = PJe/MNI.** A documentação consultada trata eproc; endpoints e credenciamento não confirmados. Não substituir por scraping nem por retorno simulado | Confirmar o contrato técnico antes de escrever qualquer código de ENT08 | a definir |
| Provedor de HSM | Custódia de certificado A1 em nuvem, assinatura sem token físico | — | — | — | **provedor não definido** | — | — | `AUSENTE`. Armazenar A1 cifrado no banco **não** satisfaz este requisito e não pode ser chamado de HSM. Isolar o adaptador; a ausência não bloqueia o restante do lote | Definir provedor; até lá, modo A1 indisponível com motivo declarado | a definir |
| — (formato) | Certificado A3 em token/cartão | — | — | — | não aplicável | — | — | `AUSENTE`. ⚠️ **A3 é fisicamente diferente de A1**: a chave privada não sai do dispositivo, então a assinatura acontece NA MÁQUINA DO USUÁRIO, não no servidor. Um adaptador que trate os dois igual não funciona para nenhum dos dois | Decidir o caminho do A3 (componente local ou extensão) antes de desenhar o adaptador — a decisão muda a arquitetura, não só a configuração | a definir |
| ICP-Brasil | Assinatura digital de PDF, XML e TXT | — | — | — | — | — | — | `AUSENTE`. Hash de arquivo, imagem de assinatura e checkbox não equivalem a assinatura criptográfica | Definir biblioteca e política de verificação | a definir |
| BNAFAR / Ministério da Saúde | Envio de entradas, saídas e posição de estoque da assistência farmacêutica | — | — | — | não solicitada | — | — | `AUSENTE` | Obter especificação do webservice | a definir |
| TSE | Exportação de permissionários e de NFS-e de candidatos e partidos | — | — | — | — | — | — | `AUSENTE` | Obter layout | a definir |

---

## Situação consolidada

| Estado | Integrações |
|---|---:|
| `VALIDADO_CONTRA_TERCEIRO` | 1 |
| `CODIGO_LOCAL_SEM_VALIDACAO` | 4 |
| `AUSENTE` | 20 |
| Credenciais obtidas | **0** |
| Convênios firmados | **0** |
| Transmissões reais executadas | **0** |

Nenhuma integração externa foi exercitada contra ambiente de órgão neste lote.

---

## O que o fechamento do ENT03a acrescentou

**Uma coluna que estava vazia por preguiça, e não por falta de informação.** As linhas
abaixo tiveram o **documento oficial** e a **próxima ação** preenchidos com o que é
conhecível **sem contato externo** — e credenciamento é calendário, não desenvolvimento:
quanto antes a próxima ação for executada, antes o relógio começa a correr.

| Órgão / formato | Documento oficial | O que a próxima ação DEPENDE |
|---|---|---|
| TCE/SC — e-Sfinge | IN TC-28/2021, IN TC-35/2024 | download público no portal do TCE/SC; **não** exige credencial |
| ADN — NFS-e nacional | manual + XSD do ambiente nacional | download público; o **credenciamento** é passo posterior |
| eSocial | leiaute S-1.3 (ou vigente) | download público; a transmissão exige **certificado** |
| CNAB 240 | manual do **banco escolhido** | depende de escolher o banco — é decisão do ente, não técnica |
| FEBRABAN — guias e código de barras | manual de cobrança do banco | idem |
| SICONFI — MSC | leiaute anual da STN | download público |

⚠️ **A ordem das três primeiras não é arbitrária.** O leiaute do TCE/SC é o único cuja
ausência **bloqueia arquitetura**: sem ele não se sabe o recorte dos registros, e escrever
o conector antes seria escrever o conector errado. Os outros dois bloqueiam **transmissão**,
não desenho.

⚠️ **E há uma decisão de ente pendente que trava duas linhas**: *qual banco o município
usa*. Sem ela, CNAB e FEBRABAN não têm manual a obter — o layout é **por banco**, e o
"padrão FEBRABAN" fixa só a estrutura. Essa não é pergunta técnica: é pergunta de contrato.

## O que o ENT03a mudou nesta página

**Uma linha saiu de `CODIGO_LOCAL_SEM_VALIDACAO` para `VALIDADO_CONTRA_TERCEIRO`**: o
`packages/ofx` foi conferido contra o `ofxtools` 1.1.1, uma implementação independente.
Isso vale para o **formato do arquivo** e não substitui aceite de órgão nenhum — por isso
o estado é novo em vez de reaproveitar um existente.

⚠️ **E a conferência achou o que um teste próprio não podia achar.** Os arquivos que os
testes antigos montavam **não eram OFX válido** (faltavam `SECURITY`, `ENCODING`,
`COMPRESSION`, `OLDFILEUID`, `NEWFILEUID`, `<SIGNONMSGSRSV1>` e `<LEDGERBAL>`); e uma
transação de `20260131235900[-3:BRT]` é **31/01** para o nosso leitor e **01/02** se lida
em UTC — um dia, na virada do mês, que numa conciliação mensal é a diferença entre fechar
e não fechar.

**Duas correções de fato nesta página:**

- a conciliação do M09 **não** existia "só como schema" — a afirmação estava errada e foi
  corrigida na linha do OFX;
- **duas linhas novas** que faltavam ao inventário: o **CNAB** (cujo layout é por banco, e
  não único — escrever contra a especificação genérica produz arquivo recusado) e o
  **certificado A3**, que é fisicamente diferente do A1: a chave não sai do dispositivo, e
  a assinatura acontece na máquina do usuário. Tratar os dois pelo mesmo adaptador não
  funciona para nenhum.

⚠️ **O que continua não conhecível, e por quê.** As colunas *credencial*, *convênio* e
*protocolo* seguem vazias em quase toda a tabela porque **nada foi solicitado a órgão
nenhum** — solicitar é ato externo, fora da autorização deste trabalho. O que era
conhecível sem contato externo (documento oficial, versão, formato, restrição técnica,
próxima ação) foi preenchido onde havia base para preencher. Preencher o resto exigiria
inventar, e um inventário inventado é pior que um vazio: ele para de ser lido como
pendência.

---

## O que o ENT03b acrescentou ao inventário

⚠️ **O ENT03b quase não mexeu aqui, e isso é informação.** Os cinco cadastros que ele
construiu — convênios, precatórios, consórcios, medições de obra e controle interno — são
**inteiramente internos**: nenhum depende de credencial, provedor, convênio bancário ou
certificado. Foi por isso que eles foram escolhidos para provar o molde.

Três linhas novas, todas **conhecíveis sem contato externo**:

| Dependência | Órgão / norma | Documento oficial | O que falta | Próxima ação | Estado |
|---|---|---|---|---|---|
| **Precatórios — regime especial do art. 101 do ADCT** | Tribunal de Justiça de SC | CF art. 100 e ADCT art. 101; Resolução CNJ 303/2019 | saber se o ente **aderiu** ao regime especial e qual o percentual da RCL homologado | perguntar à Procuradoria do município; é decisão do ENTE, não do fornecedor | `DECISAO_DO_ENTE` |
| **Precatórios — rol de hipóteses de preterição** | CF art. 100, §§ 1º a 6º | a Constituição, e a jurisprudência do TJ | o rol das hipóteses que autorizam pagar fora da ordem (acordo homologado, sequestro determinado) não está normatizado como lista fechada | decisão jurídica do ente; hoje o sistema exige TEXTO livre com no mínimo 20 caracteres, e recusa sem ele | `DECISAO_DO_ENTE` |
| **Consórcios — o consórcio de que o ente participa** | — | protocolo de intenções e lei ratificadora municipais | saber **quais** consórcios Anita Garibaldi integra, e o CNPJ de cada um | pedir ao setor de contabilidade as leis ratificadoras vigentes | `DECISAO_DO_ENTE` |

⚠️ **A única dependência EXTERNA que o ENT03b encostou foi para reafirmar que ela continua
de pé:** a custódia de certificado A1 em HSM (cláusula 5.8.16) foi marcada no catálogo como
`DEPENDENCIA_EXTERNA`, com o registro de que o modo `QUALIFICADA` **recusa** produzir
assinatura sem provedor — em vez de devolver "assinado" sobre o nada.

⚠️ **E uma dependência INTERNA foi descoberta pelo percurso de navegador:** o banco de
desenvolvimento não tem `RoteiroConvenio` cadastrado, e a tela **recusa a glosa nomeando o
que falta**. Isso não é dependência externa — é **parametrização contábil do ente**, e ela é
o mesmo tipo de decisão que o plano de contas: quem escolhe as contas é o contador do
município, não o fornecedor. Pendência `ROTEIROS-ENT03B-PARAMETRIZACAO`.

## O que o ENT03c acrescentou ao inventário

O lote foi de **censo**, e censo não contrata nada: nenhuma dependência externa nova foi
criada. O que ele fez foi **nomear** dependências que já existiam e ninguém tinha escrito.

### Decisões do ente (`DECISAO_DO_ENTE`) que o censo revelou

| O que trava | Onde aparece | Por que é do ente |
|---|---|---|
| **Roteiros contábeis da dívida fundada e da dívida ativa** | `RoteiroDivida`, `RoteiroDividaAtiva` | O par débito/crédito de cada tipo de movimento sai do PCASP **do ente**. O sistema recusa `fail-closed` em vez de escolher a conta — e é por isso que o smoke do ENT03c registra a recusa em vez de inventar um código de conta da STN. Pendência `ROTEIROS-PATRIMONIAIS-NAO-PARAMETRIZADOS`. |
| **Quais contas bancárias comportam quais fontes** | `FonteDaContaBancaria` | O rol por conta é do ente. O ENT03c fechou a `M07-FONTE-NO-MOVIMENTO` usando esse rol para conferir a fonte do ingresso extraorçamentário — sem o rol cadastrado, o ingresso não passa. |
| **Qual o limite interno de contratação direta**, quando mais restritivo que o oficial | `LimiteContratacao` | Já era decisão do ente; o censo confirmou que o guard usa `MIN(oficial, interno)` e que **sem limite vigente na data o sistema recusa** — nunca "passa porque falta parâmetro". |

### Dependências externas que o censo nomeou, e que não existem deste lado

Nenhuma delas foi construída — estão aqui porque o censo as encontrou como **ausência
confirmada**, e é mais barato saber disso agora:

- **Compras Públicas (pregão eletrônico)** — a 5.17.62 pede importação de lances por web
  service. Quando existir, é credencial + contrato + endpoint, e depende de
  `packages/integracao`. Marcada `AUSENTE_CONFIRMADO` e não `DEPENDENCIA_EXTERNA` porque
  **não há sequer o lado de cá**;
- **CATMAT (Catálogo de Materiais do Governo Federal)** — a 5.17.6. Catálogo externo: quando
  existir, "de onde vem a lista" é dependência, não decisão;
- **Cartório de protesto** — a 5.34.23 pede remessa para cobrança em cartório. Depende de
  convênio com a comarca;
- **Acesso de TERCEIRO ao sistema** — a cotação online do fornecedor (5.17.48), a proposta
  comercial (5.17.68), o portal do cidadão (5.34.10, 5.34.27) e a Manifestação de Interesse
  Social (5.17.110) exigem que alguém de fora do ente entre no sistema. ⚠️ **Isso é
  arquitetura de acesso, não tela**: hoje todo usuário é servidor, com perfil e unidade
  gestora. É a mesma classe do lote de tenancy, e vale registrar junto com ele.

### E o que o censo confirmou que NÃO é dependência externa

- **`ParecerContrato` e `CertidaoFornecedor`** não dependem de ninguém: são tabelas do
  próprio schema **sem caso de uso**. O que falta é código, não convênio;
- **`DeParaContaSiga` e `DeParaFonteSiga`** idem — o de-para do leiaute do TCM-BA existe como
  tabela e não é lido por linha nenhuma;
- **o subempenho do leiaute do TCM-BA** é ausência de MODELO deste lado, não exigência
  externa mal atendida: o tribunal pede o número, e o gerador repete o do empenho porque
  subempenho não existe aqui.

---

## O que o ENT04 acrescentou ao inventário

### Dependência que DEIXOU de existir: o plano de contas

⚠️ **O PCASP saiu da lista.** Ele nunca foi "dependência externa" no sentido de precisar de
convênio ou credencial — o arquivo estava em `docs/oficial/tce-pb/Pcasp_2025.xlsx` desde o
começo, publicado pelo TCE-PB e com procedência no `MANIFEST.json`. O que faltava era um
**leitor**: `.xlsx` é um zip de XML, e sem ler zip a alternativa era digitar código de conta
à mão. `packages/zip` ganhou a leitura e `packages/planilha` nasceu para isso; as 7.864
contas entram por `npm run seed:pcasp-oficial`, com o `sha256` conferido **antes** de
qualquer linha ser lida.

Vale registrar o padrão: **"não temos o dado" e "não sabemos abrir o arquivo que já temos"
se parecem por fora e têm custos muito diferentes.** O primeiro depende de terceiro; o
segundo é uma tarde de trabalho.

### Dependência CONFIRMADA e nova: a tabela de fontes da STN

- **Descrições das fontes/destinações de recurso** — a seção **5.22 do leiaute de
  contabilidade 2026 v1.1** diz, literalmente, que `TipoFonteRecursos` é *"definido pela
  Secretaria do Tesouro Nacional e disponibilizada pela Matriz de Saldos Contábeis - MSC"*.
  O corpus local tem os **30 códigos** oficiais (`relacionamento_fonterecursos_co_2026.xlsx`,
  com o relacionamento fonte × CO que o leiaute exige) e **não tem as descrições**. A única
  com base textual local é o grupo **FUNDEB (540 a 543)**, que o próprio leiaute nomeia ao
  proibir relacioná-las a outra conta corrente.

  ⚠️ **Escrever as descrições de memória seria inventar tabela normativa** — a mesma recusa
  que impediu fabricar código de conta no smoke do ENT03c. Pendência
  **`FONTES-DESCRICAO-STN-MSC`**. O mesmo vale para função, subfunção, natureza de despesa,
  categoria econômica e receita orçamentária: as seções 5.2, 5.4, 5.5, 5.6, 5.7, 5.9 e 5.11
  do leiaute **todas remetem à STN/MSC**. Sete tabelas, uma dependência.

### Um achado sobre o arquivo oficial que vale para o próximo que chegar

O `Pcasp_2025.xlsx` tem **duas armadilhas medidas**, e as duas produzem dado errado quando
lidas ingenuamente — nenhuma delas estoura:

1. **228 descrições quebradas em duas linhas** (72 delas em 2025). Quando a descrição
   original tinha quebra de linha, quem gerou a planilha emitiu uma segunda linha com o
   resto do texto na coluna A e os dois indicadores deslocados para B e C. Lida direto, a
   conta `352159900` fica truncada e surge uma conta fantasma de código `0`;
2. **cada conta de 2025 aparece duas vezes** — 15.728 linhas para 7.864 contas.

E uma divergência entre o arquivo e o que o `LEIA-ME.md` anuncia: a coluna
**`exige_retencao` está zerada em TODO o bloco de 2025**. Ela é usada em 2022, 2023 e 2024
(42 contas em 2024). Como `ContaPcasp` não tem coluna para isso, nada se perde hoje — fica
registrado para quando a retenção automática do M07 precisar da marca, e a resposta será ler
o bloco de 2024, **nomeando**.
