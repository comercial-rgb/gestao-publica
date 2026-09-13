# M32 — Pessoal: cadastro de servidor, vínculo e estrutura de cargos

**Bloco 1 (cadastro e histórico funcional) — TR 5.12. Sem cálculo de folha (bloco 2, P2.3).**

> **Conciliado do siafic-cg `c04ad5a`** (`modules/m22-rh` lá; aqui o M22 é DOCUMENTOS — número igual
> não é equivalência). **Diferença deliberada (V6 P2.1):** o `Servidor` NÃO repete CPF, nome,
> endereço nem contato — aponta para a `Pessoa` FÍSICA canônica do M19 (`pessoaId @unique`); os
> dados civis que só o servidor tem (nascimento, sexo, PIS, RG, título, CTPS, filiação, foto) ficam
> aqui. `cadastrarServidor` recusa pessoa jurídica (`PESSOA-JURIDICA`), pessoa que já é servidor
> (`PESSOA-JA-E-SERVIDOR`) e pessoa inexistente. O nome que as telas mostram é o social, quando há;
> senão o da versão vigente da pessoa (`nomeDoServidor`). A invariante 2 abaixo ("o CPF é a
> identidade") passa a ser lida como: **a identidade é a pessoa canônica, cujo CPF já é único e
> normalizado no M19**. O texto que segue é o da origem, mantido como registro das decisões.

---

## ⚠️ A decisão que fundou este módulo

`ServidorTransparencia` / `FolhaServidorTransparencia` (M20/M13) são **projeção de publicação**,
não domínio. Foi decidido por leitura, e a evidência é verificável:

| evidência | onde |
|---|---|
| não há CPF em lugar nenhum da fatia — SEFIP/CAGED/RAIS/DIRF/eSocial são chaveados por CPF | `prisma/schema/m20-folha-transparencia.prisma:14-32` |
| o servidor é **sobrescrito** por CSV a cada importação (nome, cargo, regime, vínculo, ativo) | `modules/m20-importador/folha-transparencia.ts:149-152` |
| `proventos`/`descontos` são **agregados**, com CHECK `liquido = proventos - descontos`; agregado não se decompõe em rubrica | `prisma/migrations/20260729122400_.../migration.sql` |
| cargo é atributo da PESSOA, não da competência: a folha de maio é republicada com o cargo de hoje | `modules/m13-transparencia/folha.ts:35` |

**Consequência prática:** este módulo cria o domínio; a projeção continua existindo e **a rota de
importação não foi removida** — ela é o caminho do ente enquanto a folha roda em sistema de
terceiro, e o único caminho para competências anteriores à migração. Quando o bloco 2 trouxer o
cálculo, `datasetFolhaPublica` ganha uma **segunda** fonte; a primeira não morre.

---

## Requisitos TR cobertos

⚠️ **O TEXTO DO TR ITEM 06 NÃO ESTÁ NESTE REPOSITÓRIO.** `docs/oficial/` só contém material do
TCE-PB. Por isso a lista abaixo é dividida por **grau de evidência**, e não numa contagem única —
afirmar "22 de 22" seria afirmar sobre um texto que ninguém aqui leu.

**Verificados contra o texto do TR, e entregues (10):**
4 (N matrículas por servidor) · 7 (baixa do dependente por idade) · 9 (vagas fixadas em lei) ·
11 (contrato de trabalho e prorrogações) · 14 (avaliação de experiência) · 15 (treinamento) ·
20 (calendário) · 22 (portarias de nomeação, designação, substituição, promoção, exoneração e
demissão) · **23 (histórico das portarias E as anotações eletrônicas na ficha)**.

⚠️ **O req. 23 tem DUAS metades**, e a segunda quase passou como entregue sem estar. O texto é
*"Controlar o histórico das portarias dos servidores **e as anotações eletrônicas na ficha do
servidor**"*. As portarias existiam; as anotações não. `AnotacaoServidor` fechou a metade que
faltava — append-only, com crachá próprio (`REGISTRAR_ANOTACAO`), porque quem carimba a ficha de
alguém não é quem o movimenta.

**Inferidos da descrição dos models no enunciado, e entregues (10):**
2 (cadastro civil: nome, nome social, nascimento, sexo, PIS, RG, título, CTPS, filiação) ·
3 (vínculo, tipo e regime) · 6 (dependentes e parentesco) · 8 (estrutura de cargos) ·
10 (lotação) · 12 e 13 (endereço e contato) · 17, 18 e 25 (histórico funcional: promoção, mudança
de cargo e de lotação, salário, gratificação, afastamento).

**Parcial (1):** 5 — foto guardada como referência + SHA-256; **falta o storage**, que não existe
neste repositório (mesma pendência do `DocumentoConvenio`).

**Sem base para afirmar (2):** 46 e 51. O enunciado os incluiu no escopo e não disse o que são; não
há texto do TR aqui que os defina. **Não os declaro entregues.**

---

## Depende de

- `packages/contracts` — `Decimal`, `zMoney`
- `modules/m11-licitacoes/documento.ts` — `normalizarDocumento`, `documentoTemFormatoValido`
  (a MESMA função do contrato e do convênio; ver o docblock de lá sobre FK lógica)
- `modules/m16-travamento` — `autorizarNo`, `ACAO_DO_SERVICO`
- `prisma/schema/m02-planejamento.prisma` — `UnidadeOrcamentaria` (FK **opcional** de `Lotacao`)

**Não depende** do M20 nem do M13, e não pode passar a depender: o guarda
`test/ui/cpf-fora-da-area-publica.test.ts` falha nos dois sentidos.

---

## Invariantes (NUNCA violar)

1. **Cargo, lotação, salário, situação e desligamento são DERIVADOS** de `HistoricoVinculo` — nunca
   colunas de `Vinculo`. É o defeito da projeção que este módulo existe para não repetir, e há
   teste: uma promoção em junho não muda o cargo de maio.
2. **O CPF é a identidade do servidor**, normalizado a só dígitos, com `@unique` e CHECK.
3. **A matrícula identifica o VÍNCULO, não a pessoa** — uma pessoa tem N matrículas (TR req. 4).
4. **Vagas ocupadas são contadas a cada leitura**, nunca guardadas: é o número que autoriza a
   próxima nomeação.
5. **A baixa do dependente por IDADE é derivada**; só a baixa por FATO é coluna.
6. **Append-only**, com **uma** exceção declarada: `baixarFinalidadeDependente` escreve na linha
   existente — o docblock dela explica o que se perde e por quê.
7. **Nada deste módulo alcança `app/transparencia/**`.**

---

## Máquinas de estado

**Vínculo** (derivada, nunca coluna):

```
ATIVO ──AFASTAMENTO──▶ AFASTADO ──RETORNO_AFASTAMENTO──▶ ATIVO
  │                        │
  └────────DESLIGAMENTO────┴──▶ DESLIGADO   (terminal — readmitir é OUTRO vínculo)
```

`DESLIGADO` precede tudo: quem foi exonerado durante um afastamento está desligado, não afastado.

**Evento do histórico** — o que cada tipo é obrigado a trazer (CHECK do banco):

| tipo | cargo | lotação | salário | gratificação |
|---|---|---|---|---|
| `ADMISSAO` | ✅ | ✅ | ✅ | — |
| `PROMOCAO` | ✅ | — | ✅ | — |
| `MUDANCA_CARGO` | ✅ | — | — | — |
| `MUDANCA_LOTACAO` | — | ✅ | — | — |
| `REAJUSTE_SALARIAL` | — | — | ✅ | — |
| `GRATIFICACAO` | — | — | ❌ proibido | ✅ |
| `AFASTAMENTO` / `RETORNO` / `DESLIGAMENTO` | — | — | — | — |

Exatamente **uma** `ADMISSAO` e no máximo **um** `DESLIGAMENTO` por vínculo (índices parciais).

---

## As duas decisões que o enunciado pediu

### Escopo da unicidade da matrícula: **GLOBAL**

As três candidatas eram global, por entidade e por período.

- **Por entidade** morre na leitura: não existe entidade neste repositório (não há `tenantId`, e a
  regra que o proíbe é do projeto inteiro). O que existe é órgão e unidade orçamentária — e a
  matrícula não é emitida por nenhum dos dois: é emitida pelo RH do ente.
- **Por período** morre no uso: um vínculo atravessa exercícios, e uma matrícula única só dentro de
  um ano não responde "quem é a 12345".
- **Global** tem uma razão positiva: a projeção da LC 131 já impõe unicidade global
  (`ServidorTransparencia.matricula @unique`) e o importador resolve cada linha do CSV **só** pela
  matrícula. No dia em que a folha derivar deste módulo, duas matrículas iguais fariam a derivação
  escolher um dos vínculos em silêncio — e publicar o salário de um sob o nome do outro.

⚠️ **O reaproveitamento fica nomeado.** Ente que reaproveita matrícula de servidor desligado há
vinte anos vai bater no `@unique` e receber `MATRICULA-JA-USADA`, com o nome de quem a usou. É o
desfecho certo: a alternativa (deixar entrar) soma dois históricos funcionais numa matrícula só, o
que é irreversível. A carga de base legada desambigua **na carga**, não afrouxando a coluna.

### `Lotacao` **não** reusa `UnidadeOrcamentaria`

Três razões verificáveis:

1. A UO é a unidade do SAGRES-PB, com código de **5 dígitos numéricos**
   (`m02-planejamento.prisma:63-64`), e o gerador do MANAD passa esse código por `numero()`
   (`m14-exports-federais/manad/gerador.ts:1472`). Escola municipal não tem código SAGRES.
2. `lib/portas/contexto.ts:87` lista **todas** as unidades orçamentárias para montar o escopo de
   quem tem permissão global, e `plurianual.ts:584` as oferece no cadastro de ação do PPA. Cada
   creche cadastrada como UO apareceria nos dois seletores, do sistema inteiro.
3. A UO tem dois níveis (órgão → unidade); lotação tem quantos o ente quiser.

**Mas a ligação existe, opcional:** `Lotacao.unidadeOrcId` guarda a correspondência quando ela
existe — é o que o bloco 2 vai usar para apropriar a despesa de pessoal. Nula significa "esta caixa
do organograma não corresponde a uma unidade orçamentária", que é o caso da maioria.

---

## Segregação (TR 6.4) — 14 ações para 16 serviços, em quatro eixos

| eixo | separa | por quê |
|---|---|---|
| **criar a vaga × ocupar a vaga** | `CADASTRAR_CARGO` × `ADMITIR_SERVIDOR` | senão o quantitativo do req. 9 vira autoatendimento |
| **cadastrar a pessoa × admiti-la** | `CADASTRAR_SERVIDOR` × `ADMITIR_SERVIDOR` | um é digitação de dado pessoal (LGPD), o outro compromete a folha |
| **mover × pagar** | `MOVIMENTAR_SERVIDOR` × `ALTERAR_REMUNERACAO` | quem muda de sala não muda o salário |
| **instruir × decidir** | `MOVIMENTAR/ALTERAR` × `DESLIGAR_SERVIDOR`; `GERIR_DEPENDENTE` × `BAIXAR_DEPENDENTE` | quem instrui não encerra; quem lança o que foi entregue não declara que o direito acabou |

---

## Arquivos deste módulo (neste repositório — V6 P2.1/P2.2)

A lista da origem (`m22-rh.prisma`, 21 rotas do `lib/scaffold`, `pessoal-escrita.test.ts`) NÃO vale
aqui: o módulo entrou pelo molde, com as tabelas nomeadas por este repositório.

- `prisma/schema/m32-pessoal.prisma` — 14 models e os enums; `Servidor.pessoaId` → `Pessoa` (M19);
  `Lotacao.unidadeOrcId` → `UnidadeOrcamentaria` (M02, opcional)
- `prisma/migrations/20260913180000_v6_acoes_pessoal/` — 16 valores no enum (15 de mutação +
  `CONSULTAR_PESSOAL`), `ALTER TYPE` em migration separada
- `prisma/migrations/20260913180100_v6_pessoal_cadastro/` — as 14 tabelas, os CHECKs e índices
  parciais da origem, um a um
- `modules/m32-pessoal/dominio.ts` — Zod + derivações puras (cargo, lotação, salário, gratificações,
  situação e **regime previdenciário**, todos por data); **datas por dia civil do ente**
  (`packages/datas`: `diaCivil`, `anoCivil`), não UTC — a origem usava `getUTC*`/`toISOString`
  e o guard `data-civil.test.ts` daqui acusou 17 sítios
- `modules/m32-pessoal/servico.ts` — 17 serviços (16 da origem + `nomeDoServidor`, fora do censo
  por ser helper de leitura dentro da transação)
- `modules/m32-pessoal/m32-pessoal.test.ts` — os testes da origem sobre a Pessoa canônica
  (`cenario()` cria a pessoa física antes do servidor) + `PESSOA-JURIDICA` e
  `PESSOA-JA-E-SERVIDOR`
- `modules/m16-travamento/atualizacoes-de-permissoes.ts` — **v9 `pessoal-m32`**: quem administra
  perfis no escopo global recebe as 16 ações no global (aplicada em dev e percursos: 16
  concessões em 1 perfil)
- `lib/portas/recursos/pessoal.ts` + `pessoal-dados.ts` — três recursos do molde: servidores
  (ações admitir, movimentar, alterar remuneração, desligar, dependente, portaria, anotação,
  treinamento), cargos, lotações. A lista de servidores deriva a SITUAÇÃO (sem vínculo / ativo /
  afastado / desligado) e o detalhe deriva cargo, lotação, salário e gratificações de hoje; a
  lista de cargos deriva vagas ocupadas e "com vaga / sem vaga / extinto"
- `app/(areas)/pessoal/{page,servidores,cargos,lotacoes}` — landing + páginas do molde;
  `lib/navegacao.ts` área PESSOAL; menu e busca global
- `scripts/smoke-pessoal.ts` — o percurso pelo navegador (`npm run smoke:pessoal`); usuário
  `rh@percursos.local` em `scripts/percursos-usuarios-por-papel.ts`

**Não portado da origem:** calendário RH, contrato de trabalho/prorrogação e avaliação de
experiência têm SERVIÇO e AÇÃO (`CONFIGURAR_CALENDARIO_RH`, `REGISTRAR_CONTRATO_TRABALHO`,
`REGISTRAR_AVALIACAO_EXPERIENCIA`) mas ainda NÃO têm tela no molde — pendência
`PESSOAL-SEM-TELA-CALENDARIO-CONTRATO-AVALIACAO` (não se criou página vazia para aparentar). A
baixa manual de dependente (`BAIXAR_DEPENDENTE`) idem: `PESSOAL-SEM-TELA-BAIXA-DE-DEPENDENTE`.

---

## Fora de escopo aqui

**Bloco 2** — verbas, rubricas, cálculo de folha, provisões (reqs. 26-35, 45, 57); ligar
`datasetFolhaPublica` ao RH.
**Bloco 3** — férias, 13º, rescisão, pensão alimentícia (reqs. 36-44, 47-49, 52-60).
**Bloco 4** — SEFIP, CAGED, RAIS, DIRF, SIOPE, GRRF, eSocial, contracheque, Portal do Servidor
(reqs. 43, 50, 54, 61-66 + item 02 inteiro).
**Ponto eletrônico** (req. 19).

### O REGIME PREVIDENCIÁRIO É EVENTO (V6 P2.3) — e por quê

Ele entrou como coluna de `Vinculo` no commit que abriu a folha, e saiu de lá no mesmo dia: o
regime decide QUAL TABELA de contribuição a folha aplica, e quem migra do RGPS para o RPPS em
junho contribuiu ao RGPS em maio. Com coluna, recalcular maio depois da migração aplicaria a
tabela de junho — que é exatamente o defeito da projeção que este módulo existe para impedir, só
que em dinheiro, e o recálculo é o que se faz quando alguém contesta o desconto.

Hoje: `HistoricoVinculo.regimePrevidenciario` + o tipo `MUDANCA_REGIME_PREVIDENCIARIO` (dentro de
`MOVIMENTAR_SERVIDOR`, porque migrar de regime é mover o vínculo, não pagá-lo);
`regimeVigenteEm(eventos, naAdmissao, quando)` deriva. A coluna `Vinculo.regimePrevidenciario`
permanece como **o regime declarado NA ADMISSÃO** e o fallback dos vínculos criados antes de o
evento existir — não como verdade vigente. A admissão grava o regime nos DOIS lugares.

### Pendências nomeadas deste bloco

1. **Alteração cadastral.** Este bloco entrega **criação**. Mudança de endereço, de nome por
   casamento e correção de digitação precisam de histórico próprio — um `update` mudo perderia o
   que o campo dizia antes, que é exatamente o defeito da projeção.
2. **Reparentagem de lotação.** `criaCicloDeLotacao` já está escrito e testado para o ciclo de dois
   nós; o serviço que move uma caixa do organograma não foi entregue.
3. **Storage de arquivos.** A foto do servidor guarda referência + SHA-256, como o
   `DocumentoConvenio`. Não há storage neste repositório.
4. **Categoria do trabalhador (eSocial).** `regimeJuridico` é `String` porque o regime sai da lei
   orgânica do ente; a categoria tabelada do eSocial entra no bloco 4.
5. **Consulta consolidada do histórico funcional por período** (parte do req. 25).
6. **`REINTEGRACAO-DE-VINCULO`** (TR 5.12.60) — o desligamento é terminal e a matrícula é única;
   reintegrar com a mesma matrícula pede um evento que reabra o vínculo. Decidir antes de construir.
7. **`TROCA-DE-MATRICULA`** (TR 5.12.102) — não há serviço; a matrícula é a chave de negócio.
8. **`PIS-SEM-DV`** — `zPis` confere só os 11 dígitos.
9. **`PESSOAL-SEM-TELA-CALENDARIO-CONTRATO-AVALIACAO`** e **`PESSOAL-SEM-TELA-BAIXA-DE-DEPENDENTE`**
   — serviço e ação existem; tela não (ver "Arquivos deste módulo").
