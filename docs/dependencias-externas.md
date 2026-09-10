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
