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
| TCE/SC | Remessa e-Sfinge (atos jurídicos, obras, pessoal, execução orçamentária, registros contábeis, tributário, planejamento, gestão fiscal) | IN TC-28/2021 e IN TC-35/2024 — **não obtidos** | — | — | não solicitada | — | — | `AUSENTE`. Sem conector SC. Prazos por módulo e regras de consistência impeditivas/alerta não mapeados | Obter IN TC-28/2021, IN TC-35/2024 e layout vigente do e-Sfinge; registrar versão e vigência antes de codificar | a definir |
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
| Banco do Brasil | Borderô e retorno bancário | — | — | — | não configurada | não firmado | — | `CODIGO_LOCAL_SEM_VALIDACAO` — M17 e `scripts/bb-smoke.ts`. **Um banco não equivale a todos os convênios** | Levantar quais bancos o município usa de fato | a definir |
| Convênios bancários (demais) | Guias FEBRABAN com código de barras, PIX, registro de cobrança, retorno | — | — | — | não solicitadas | não firmados | — | `AUSENTE` | Levantar convênios vigentes do município | a definir |
| — (formato) | Extrato OFX/OFC para conciliação | OFX 1.0.2 (SGML) | 1.0.2 | não aplicável — arquivo, não webservice | não aplicável | — | — | `VALIDADO_CONTRA_TERCEIRO` — `packages/ofx` conferido contra `ofxtools` 1.1.1 (PyPI) em 2026-09-10: 3 arquivos, 6 transações, todos os campos conferem. **Correção ao que esta linha dizia antes: a conciliação do M09 NÃO existe "só como schema"** — `conciliacao.ts` (351), `vinculo.ts` (497), `extrato.ts` (164), `dominio.ts` (350) e 1607 linhas de teste | Obter um extrato OFX REAL de banco brasileiro e acrescentá-lo ao corpus; o corpus atual é sintético, ainda que conforme | a definir |

## Jurídico, assinatura e saúde

| Órgão | Funcionalidade | Documento oficial | Versão | Ambiente | Credencial | Convênio | Protocolo | Restrição | Próxima ação | Responsável |
|---|---|---|---|---|---|---|---|---|---|---|
| Tribunal de Justiça de SC | Peticionamento e acompanhamento processual (1º e 2º grau) | — | — | — | não solicitada | não firmado | — | `AUSENTE` + `PENDENTE_DESCOBERTA`. **Não assumir TJSC = PJe/MNI.** A documentação consultada trata eproc; endpoints e credenciamento não confirmados. Não substituir por scraping nem por retorno simulado | Confirmar o contrato técnico antes de escrever qualquer código de ENT08 | a definir |
| Provedor de HSM | Custódia de certificado A1 em nuvem, assinatura sem token físico | — | — | — | **provedor não definido** | — | — | `AUSENTE`. Armazenar A1 cifrado no banco **não** satisfaz este requisito e não pode ser chamado de HSM. Isolar o adaptador; a ausência não bloqueia o restante do lote | Definir provedor; até lá, modo A1 indisponível com motivo declarado | a definir |
| ICP-Brasil | Assinatura digital de PDF, XML e TXT | — | — | — | — | — | — | `AUSENTE`. Hash de arquivo, imagem de assinatura e checkbox não equivalem a assinatura criptográfica | Definir biblioteca e política de verificação | a definir |
| BNAFAR / Ministério da Saúde | Envio de entradas, saídas e posição de estoque da assistência farmacêutica | — | — | — | não solicitada | — | — | `AUSENTE` | Obter especificação do webservice | a definir |
| TSE | Exportação de permissionários e de NFS-e de candidatos e partidos | — | — | — | — | — | — | `AUSENTE` | Obter layout | a definir |

---

## Situação consolidada

| Estado | Integrações |
|---|---:|
| `CODIGO_LOCAL_SEM_VALIDACAO` | 5 |
| `AUSENTE` | 18 |
| Credenciais obtidas | **0** |
| Convênios firmados | **0** |
| Transmissões reais executadas | **0** |

Nenhuma integração externa foi exercitada contra ambiente de órgão neste lote.
