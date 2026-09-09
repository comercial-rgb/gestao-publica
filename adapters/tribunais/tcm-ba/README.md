# TCM-BA — adapter SIGA

Exportação para o **Tribunal de Contas dos Municípios da Bahia**, via **SIGA** (Sistema Integrado de
Gestão e Auditoria). Atende o município de **Lapão/BA**.

---

## ⚠️ NÃO HOMOLOGADO — leia antes de usar

Este adapter **não está homologado** e **não está pronto para produção**.

- Nenhum arquivo gerado por ele foi submetido ao **validador oficial do TCM-BA**.
- As specs foram transcritas de um documento de **2014**, obtido de **fonte secundária**.
- O TCM pode ter revisado o layout sem que esta transcrição saiba.

O que existir de garantia aqui é sobre a **consistência interna** da transcrição, não sobre a
**aceitação** pelo Tribunal. Dizer o contrário seria a afirmação que a DIRETIVA §7 proíbe: prometer
aceitação externa que nada comprova.

### Fonte normativa

> **SIGA – Sistema Integrado de Gestão e Auditoria – Arquivos de Importação – Versão 44**
> TCM-BA / Diretoria de Informática — Fevereiro/2014

Tratada como referência **ESTRUTURAL**, não normativa. Toda spec carrega
`origemSpec: "manual-v44-2014"` para que, quando chegar a versão oficial vigente, seja possível
migrar **spec a spec** — sabendo exatamente o que foi escrito contra o quê — em vez de reescrever o
adapter inteiro.

---

## Confirmado × suposto

| Item | Situação |
|---|---|
| Posições 0-based, inclusivas (`largura = fim - inicio + 1`) | **Confirmado** — as 5 specs fecham programaticamente |
| "Versão do layout" do header recebe `1` (não 44) | **Confirmado** — o 44 é a versão do documento |
| `N` completa com **brancos**, nunca zeros | **Confirmado** — zeros no `nu_Empenho` geram erro no TCM |
| `V` completa com **zeros**, sem separador | **Confirmado** |
| `V` com 3 decimais em `qt_ItemLicitado` / `vl_Unitario` | **Confirmado** — por isso `decimais` é por campo |
| `LiqEmp` tem ordem de campos própria | **Confirmado** — ver `siga/specs/liq-emp.ts` |
| Blacklist de caracteres em campos `AN` | **Confirmado** — o TCM recusa server-side |
| **Encoding `latin1` (ISO-8859-1)** | ⚠️ **SUPOSTO** — ver a seção própria abaixo |
| **Terminador de linha `CRLF`** | ⚠️ **SUPOSTO** — o manual não declara |
| Aceitação de qualquer arquivo pelo TCM | ⚠️ **NÃO VERIFICADO** |

---

## ⚠️ O ENCODING É A SUPOSIÇÃO MAIS PERIGOSA DESTE ADAPTER

**`ENCODING_SIGA = "latin1"` não está no manual v44. É inferência.**

Num formato posicional isso não é detalhe de configuração — é a premissa que faz a conta de posição
fechar. Em `latin1` todo caractere ocupa **1 byte**. Em UTF-8, cada acento ocupa **2**. Um único
"ç" num campo `AN` empurraria todos os campos seguintes uma posição para a direita, e o registro
inteiro passaria a significar outra coisa: sem erro de sintaxe, sem aviso, com o tamanho parecendo
certo. É o modo de falha mais caro que este layout permite.

**A defesa real não é a constante — é o `sanitizarAN`.** Ele remove os acentos (NFD + strip de
diacríticos) **antes** de qualquer byte ser escrito. Com o texto reduzido a ASCII, `latin1` e UTF-8
produzem exatamente os mesmos bytes, e a suposição deixa de importar para o alinhamento. Por isso o
strip de acento não é cosmético nem "para ficar bonito no TCM": é o que torna este adapter robusto
a estar errado sobre o próprio encoding.

O que **continua** dependendo da suposição: como o TCM interpreta os bytes que enviamos, caso algum
dia um caractere não-ASCII escape do saneamento. `ENCODING_SIGA` está exportado justamente para ser
trocado numa linha quando o Tribunal confirmar — e o `TERMINADOR_LINHA_SIGA` (CRLF, também suposto)
pelo mesmo motivo.

**Antes da primeira remessa real, confirmar o encoding com o TCM-BA é item de aceite, não de
backlog.**

---

## Os erros do manual, e o que os contém

O PDF v44 tem **erros de digitação confirmados nas posições** — flagrados em `MetasArrecada`,
`PagRetencao`, `UnidOrca` e `Diaria`. Em alguns arquivos o campo "Total" impresso **não bate** com a
soma das larguras listadas logo acima dele.

Num formato posicional isso não aparece como erro: aparece como um arquivo do tamanho certo cujos
campos, a partir do ponto do deslocamento, significam outra coisa.

Por isso `siga/validar-spec.ts` existe e roda **em teste** contra as 5 specs, conferindo:

- soma das larguras == `totalBytes` declarado;
- nenhum campo sobrepõe outro;
- nenhum **gap não declarado** (byte reservado vira campo `reservado_tcm_N` explícito);
- o primeiro campo é `tp_registro` em `0–0`;
- o último é `nu_SequencialRegistro` nos **10 últimos bytes**.

> **Nunca "corrija" um `totalBytes` para calar o teste.** Some as larguras e reconfira a tabela do
> manual — ajustar o total é exatamente como o erro do PDF entra no código.

---

## Estrutura

```
tcm-ba/
├─ index.ts                 ExportadorTribunal + montarPacoteSiga
├─ validar.ts               requisito 64 — inconsistências ANTES de gerar
├─ README.md
└─ siga/
   ├─ tipos.ts              TipoCampo, CampoSpec, ArquivoSpec, ModuloSiga
   ├─ writer.ts             fixed-width: sanitização, formatação, header/trailer
   ├─ validar-spec.ts       o guarda contra os typos do manual
   ├─ siga-writer.test.ts
   ├─ fixtures/             o registro do golden + os bytes commitados
   └─ specs/                ContaCont, Dotacao, Empenho, LiqEmp, PagEmp2
```

### O caminho crítico (5 arquivos)

Na ordem de carga do SIGA — que **não é cosmética**: o TCM recusa o arquivo cujo pré-requisito
ainda não entrou (`PagEmp2` referencia `cd_ContaContabil`, que só existe depois do `ContaCont`).

| # | Arquivo | Módulo | Ordem | Bytes |
|---|---|---|---|---|
| 14 | `ContaCont` | BASICOS | 3 | 185 |
| 22 | `Dotacao` | ORCAMENTO | 8 | 83 |
| 23 | `Empenho` | INFORMES | 14 | 500 |
| 29 | `LiqEmp` | INFORMES | 18 | 77 |
| 101 | `PagEmp2` | INFORMES | 19 | 141 |

O manual descreve dezenas de arquivos; estes 5 sustentam a execução da despesa de ponta a ponta
(conta → dotação → empenho → liquidação → pagamento). Os demais entram em PRs próprios.

---

## O de/para é obrigatório

O TCM-BA **não** identifica conta contábil pelo código PCASP nem fonte de recurso pelo código da
STN: usa os números **dele**. A tradução vive em `DeParaContaSiga` e `DeParaFonteSiga`.

⚠️ **O schema mora em `prisma/schema/tcm-ba-siga.prisma`, não neste diretório.** O
`prisma.config.ts` carrega o schema de uma pasta só (`prisma/schema`); um `.prisma` aqui dentro
seria **ignorado em silêncio** — `prisma validate` passaria sem lê-lo, o client não teria os models
e a migration não teria contra o que casar. É o mesmo motivo pelo qual `m18-captura.prisma` continua
lá embora o código do M18 esteja em `adapters/`: o **código** é do adapter, o **schema** é do banco.

Sem o de/para preenchido, `validar()` devolve `BLOQUEIA` nomeando a conta ou a fonte que falta — em
vez de omitir a linha ou chutar um número. Um de/para chutado é pior que um vazio: o vazio para a
remessa e diz o que falta; o chutado gera arquivo aceito apontando para a conta errada.

---

## Estado atual

Esta fatia entrega o **formato**: specs, writer, validação de spec, validação prévia e a montagem
do pacote. Ela **não** entrega a leitura do razão — `criarExportadorTcmBa` recebe `lerMassa` por
injeção, porque montar a massa a partir do M01–M14 é território de um PR próprio, junto do de/para
semeado e do plano de contas do ente baiano.

O `exportador` registrado em `packages/tribunais-core/registro.ts` responde a `resolverTribunal`
com a identidade do tribunal, e **falha nomeando** em `validar`/`gerar` — porque gerar exige um
`PrismaClient` e as designações da remessa, que a competência não determina.
