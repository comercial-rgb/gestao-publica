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
9. **`PESSOAL-SEM-TELA-CALENDARIO-CONTRATO-AVALIACAO`** — serviço e ação existem; tela não.
   ~~`PESSOAL-SEM-TELA-BAIXA-DE-DEPENDENTE`~~ — resolvida em V7 M1 U2 (abaixo).

### O ENCERRAMENTO DA FINALIDADE DO DEPENDENTE É FATO (V7 M1 U2)

A baixa fazia `finalidadeDependente.update` — e `FinalidadeDependente` não está no censo de UPDATE do
papel de runtime: sob `gestao_app` ela falhava (achado `DEPENDENTE-BAIXA-EXIGE-UPDATE-SEM-GRANT`,
reproduzido pela conexão real). A decisão foi do MODELO, não do GRANT: o encerramento é
`EncerramentoDeFinalidadeDependente` (uma linha por finalidade, `finalidadeId` único, data de efeito,
motivo ≥ 5, autor), gravado por INSERT. `baixaEfetiva(f)` = data do encerramento, ou a `dataBaixa`
legada; a folha, o portal e a ficha leem por ela, então "quem era dependente em cada competência"
continua respondível. Concorrência: dois encerramentos → um `P2002` → `FinalidadeJaBaixadaError`.
Folha já fechada não é recalculada: o retorno informa as competências fechadas atingidas, que pedem
retificação (`RETROATIVO-DE-DEPENDENTE-EXIGE-RETIFICACAO`). Tela: ação "Encerrar finalidade de
dependente" no detalhe do servidor. Testes: `m32-pessoal.test.ts`, `test/runtime/contrato-runtime-m32.test.ts` (8).
10. **`REGIME-DE-VINCULO-DESLIGADO` — RESOLVIDA na mesma sessão (V6 P2.3b).** O percurso da
    apropriação achou o caminho sem saída: a matrícula legada DESLIGADA no dia 1º de um mês viveu
    um dia, tem de ser paga por ele, precisa de regime previdenciário para a folha saber qual
    tabela aplicar — e não era oferecida em movimentação nenhuma.

    **A exceção, e o quanto ela é estreita:** informar o regime com data ANTERIOR OU IGUAL ao
    desligamento é aceito mesmo no vínculo encerrado, porque é o registro de um fato que já era
    verdade enquanto ele vivia, não uma movimentação nova. A ação da tela é PRÓPRIA ("Informar o
    regime previdenciário (carga do legado)"), com lista PRÓPRIA — a única que inclui os
    desligados. O que não mudou: cargo, lotação, afastamento e retorno continuam recusados no
    vínculo desligado (inclusive no DIA do desligamento), e o regime com data POSTERIOR ao fim
    também. Prova: `m32-pessoal.test.ts`, o teste que afirma os quatro casos.

    ⚠️ **E ele registra o que JÁ VALIA**, para que a exceção não seja lida como maior do que é: a
    guarda sempre olhou a situação NA DATA DO FATO, então um evento datado DENTRO da vida do
    vínculo já era aceito mesmo lançado depois do desligamento — é a disciplina das duas datas.

### OS EIXOS DE CONSULTA DE SERVIDOR (TR 5.12.50) — V11 V9.4

A cláusula exige filtrar os funcionários "por no mínimo: matrícula, nome, cargo, regime, local de
trabalho, centro de custo, função e data de admissão". **Os oito eixos entraram** — seis na V11 V9.4
como consulta, e os dois últimos quando o MODELO deles nasceu, na mesma orquestração. Até lá eles
estavam **recusados e nomeados**, não inventados: um seletor vazio teria sido pior que a ausência.

⚠️ **ESTES EIXOS SÃO (a) — E (a), (b) E (c) SÃO TRÊS COISAS.** A distinção inteira, com o motivo,
está no docblock de `EixosDeConsultaDeVinculo` em `modules/m32-pessoal/dominio.ts`. Em resumo:

| | o que é | onde mora |
|---|---|---|
| **(a) filtro de consulta** | "quem eu quero VER" — predicado puro, sem efeito, cobrado como LEITURA | **aqui** |
| **(b) seleção para processamento** | "quem eu quero CALCULAR" — ato do operador, com autor e efeito sobre dinheiro | M33, ação própria |
| **(c) abrangência efetiva** | "quem o motor de fato calculou, e por que os outros não" — FATO apurado | M33, gravado |

⚠️ **CORREÇÃO DO QUE ESTA SEÇÃO AFIRMAVA ATÉ AGORA.** Ela dizia que o recorte do cálculo era
"decisão PENDENTE", e dava como fundamento que o `findMany` dos vínculos do M33 não tem `where`
nenhum. **O fundamento era falso**, e a decisão não era nossa: a 5.12.50 prende "permitindo filtrar
os funcionários" à **rotina de cálculo**, e (b) é capacidade devida. A ausência de um `where` prova
que hoje ninguém CONSEGUE recortar; nunca provou que recortar seja proibido. Não se apresenta
consulta filtrada como cálculo filtrado.

O que continua verdadeiro é o **perigo**, e ele é de (c), não de (a):

- **folha parcial em silêncio** — nada compara o número de contracheques ao de vínculos devidos, o
  manifesto da certificação lista só quem entrou no cálculo, a apropriação empenha só esses: a folha
  fecha, o total bate, o empenho bate, a liquidação bate, e nada adiante acusa;
- **a subtração silenciosa** — `fecharFolha` congela UM cálculo, o último não cancelado. Com seleção
  por cálculo, nº1={A,B} e nº2={C,D} fazem o fechamento levar só {C,D}: **A e B não recebem**, sem
  erro e com totais coerentes. Todo mundo vigia duplicidade; o risco real é o oposto.

Por isso **(c) nasce no MESMO commit que (b)**, e a promessa do M33 muda de forma: deixa de ser
"todos os vínculos vivos" e passa a ser "exatamente os selecionados e elegíveis, com cada exclusão
nomeada". Promessa mantida por construção some junto com a construção — esta é afirmada por teste.

⚠️ **E A SEGREGAÇÃO DO 6.4 SEPARA (a) DE (b) NA AUTORIZAÇÃO.** (a) é cobrada com
`CONSULTAR_PESSOAL`, que é leitura. Quem pode VER a lista de servidores não pode, por isso, escolher
quem o ente paga: (b) tem ação PRÓPRIA, e a negativa dela se prova com ator fora do censo de
`test/usuarios-teste.ts`. A construção de (b)/(c) mora em `modules/m33-folha/`.

**Os seis entregues** (`lib/portas/recursos/pessoal.ts`, descritor `SERVIDORES`; a porta em
`pessoal-dados.ts`; o predicado puro em `dominio.ts`):

| eixo | natureza | como |
|---|---|---|
| matrícula | coluna (`Vinculo.matricula`) | `contains`, sem caixa |
| nome | duas fontes | ver abaixo |
| cargo | **derivado** (`cargoVigenteEm`) | texto → ids de `Cargo` (código ou denominação) → derivação na data |
| regime **jurídico** | coluna `String` livre | `contains` |
| regime **previdenciário** | **derivado** (`regimeVigenteEm`) | seleção RGPS/RPPS/ISENTO/não informado |
| local de trabalho | **derivado** (`lotacaoVigenteEm`) | texto → ids de `Lotacao` (código ou nome) |
| data de admissão | coluna indexada | janela `de`/`até`, inclusiva nas duas bordas |

São sete linhas para seis eixos porque **"regime" são DOIS eixos**, e fundi-los seria erro de
domínio: `regimeJuridico` é como a lei orgânica do ente nomeia o vínculo ("Estatutário", "CLT"), e o
previdenciário decide **qual tabela de contribuição a folha aplica**. Um estatutário pode estar no
RGPS — o teste afirma exatamente esse cruzamento.

**O NOME É PROCURADO PELOS DOIS, e é decisão de produto.** Há dois candidatos: a versão vigente da
`Pessoa` (M19) e `Servidor.nomeSocial`. O que a tela **mostra** continua sendo o social quando há
(Lei 14.164/2021, Decreto 8.727/2016 — `nomeDaPessoa` já fazia isso). O que a busca **acha** são os
dois: quem usa nome social e não é encontrado por ele é defeito de produto; quem é procurado pelo
nome que está na portaria e não é encontrado também. E a busca vai a **toda versão** da pessoa, não
só à vigente — quem procura pelo nome de solteira de alguém que casou está procurando a pessoa certa.

**A COMPOSIÇÃO É SOBRE UM MESMO VÍNCULO.** A professora que também é motorista tem duas matrículas;
"cargo de motorista E lotação Escola Central" tem de devolver vazio, e devolveria ELA se cada eixo
fosse conferido contra o conjunto dos vínculos. `vinculoAtendeAosEixos` recebe **um** vínculo e a
porta faz `.some(...)`. Exceções declaradas: `q`, `nome` e `situacao` são do **servidor** — os dois
primeiros porque a identidade é da pessoa, e `situacao` porque é o agregado que a coluna sempre
mostrou (torná-la per-vínculo mudaria em silêncio o significado de "só desligados" para quem já usa
o filtro).

**A DATA DE REFERÊNCIA É EXPLÍCITA** (filtro `dataRef`, vazio = hoje). Cargo, lotação e regime
previdenciário são derivados: "cargo hoje" e "cargo na competência de maio" dão listas diferentes, e
a promoção de junho move o servidor de uma para a outra. A **coluna** do cargo deriva na MESMA data
que o filtro usou — mostrar o cargo de hoje sob um filtro datado seria mentir na célula. E a linha
mostra a **matrícula que casou**, não a primeira viva, pelo mesmo motivo.

⚠️ **UM DEFEITO ACHADO E FECHADO NO CAMINHO.** O filtro `situacao` era aplicado **depois** do
`skip`/`take`, sobre as 25 linhas já recortadas: o total virava "quantos casam NESTA PÁGINA" e a
página 2 perdia quem ficou na 1. Com 25 servidores ou menos ninguém vê — a fixture do teste tem
**trinta**, e afirma que o total é igual nas duas páginas e que a união delas não repete nem perde
ninguém. Hoje a porta tem dois caminhos: sem eixo derivado, o banco recorta a página e o total é
dele; com eixo derivado, o conjunto é apurado inteiro **antes** de recortar.

⚠️ **O TETO RECUSA, NÃO TRUNCA.** Apurar o conjunto inteiro por evento tem um teto
(`TETO_DE_CANDIDATOS`); acima dele a consulta **recusa nomeando quantos alcançou e dizendo que não
truncou**. Truncar devolveria uma lista que parece completa com um total que parece certo.

#### Os dois eixos RECUSADOS — falta de MODELO no M32, nomeada

Não são falta de tela; não há dado nenhum a filtrar, e um seletor vazio no lugar deles seria pior
que a ausência.

11. ~~**`PESSOAL-SEM-CENTRO-DE-CUSTO`**~~ — **RESOLVIDA na V11 V9.4, e o levantamento mudou a
    resposta.** A pergunta registrada aqui era "o centro de custo do pessoal é o `Setor` do M21, a
    UO da ficha que paga, ou uma dimensão própria da folha?". O levantamento, feito ANTES do
    desenho, achou o cadastro **pronto**: o `Setor` já é, no texto do próprio schema, "o centro de
    custo administrativo", e **três módulos já o usam nesse papel** — o almoxarifado registra por
    ele o consumo de material (5.18.10, cujo comentário diz que "criar um departamento paralelo
    seria a segunda verdade"), as compras controlam por ele as solicitações (5.17.54) e o
    patrimônio localiza por ele os bens. Uma tabela só da folha seria a **quarta** estrutura sobre o
    mesmo organograma, depois de `Lotacao` (RH), `Setor` (custo) e `UnidadeOrcamentaria`
    (orçamento) — e a despesa de PESSOAL deixaria de somar com a de MATERIAL no mesmo eixo, que é
    para o que serve um centro de custo. **O que faltava nunca foi o cadastro: era o VÍNCULO, com
    vigência.** Entregue como `HistoricoVinculo.centroDeCustoId` + evento `MUDANCA_CENTRO_DE_CUSTO`.
    E `Setor.unidadeOrcId` é **obrigatório**, enquanto `Lotacao.unidadeOrcId` é opcional — para
    apropriar despesa, o `Setor` não era só o cadastro que já existia: é o que já chega ao orçamento.
12. ~~**`PESSOAL-SEM-FUNCAO`**~~ — **RESOLVIDA na V11 V9.4. Esta precisou mesmo nascer.** Entre as
    duas saídas registradas aqui, a escolhida foi a segunda: função é **atribuição designada com
    vigência própria**, não o `TipoCargo` do cargo vigente. Model `Funcao` (cadastro, com ato
    autorizativo e extinção, espelhando `Cargo`) + eventos `DESIGNACAO_FUNCAO` / `DISPENSA_FUNCAO`.
    Os dois candidatos antigos **continuam existindo de propósito**: `FUNCAO_GRATIFICADA` segue
    sendo a natureza do POSTO, e `gratificacaoDescricao` segue sendo a PARCELA que a função costuma
    pagar. O que mudou é as três deixarem de ser a mesma coisa.
13. **`SERVIDORES-ORDENAM-POR-CPF`** — ACHADO em V11 V9.4, **pré-existente e NÃO corrigido aqui**. A
    coluna "Nome" é declarada `ordenavel`, e a porta traduz isso em `orderBy: { pessoa: { documento } }`
    — quem clica em "Nome" ordena por **CPF**. É um controle que diz uma coisa e faz outra. Não foi
    consertado nesta unidade porque o conserto não é local: o nome exibido é derivado
    (`nomeSocial ?? versão vigente da pessoa`), e o Prisma não ordena por relação `1-N` com `take: 1`.
    As saídas reais são uma coluna desnormalizada de nome de exibição (mantida por evento, como tudo
    aqui) ou uma consulta crua — e as duas são decisão de MODELO, não ajuste de tela. Ordenar em
    memória só no caminho de duas fases faria a ordenação MUDAR conforme o filtro, que é pior.
14. **`PESSOAL-RECUSA-DO-TETO-SEM-PERCURSO`** — V11 V9.4. A recusa por consulta ampla demais
    (`ConsultaDePessoalAmplaDemaisError`) ganhou ramo próprio em `app/(areas)/pessoal/servidores/page.tsx`,
    que a mostra como estado com a mensagem inteira em vez de subir para a tela genérica do Next
    (onde, em produção, o operador veria só um digest). **O ramo NÃO está provado.** A primeira
    tentativa de prová-lo conferia o texto-fonte do arquivo, e a mutação mostrou que a guarda era
    inerte: trocar o ramo por `if (false && ...)` deixou a suíte verde. Guarda que casa com o texto
    atesta pela papelada. Quem prova é o **percurso de navegador**, não executado. Enquanto isso, o
    que está provado é só a porta: ela recusa, nas duas direções, e a mensagem carrega a
    providência e diz que não truncou.

#### As pendências que os dois eixos novos ABRIRAM — nomeadas, não caladas

15. **`CENTRO-DE-CUSTO-SEM-VIGENCIA-HISTORICA`** — `Setor` é cadastro do M21 e desativa por
    `ativo Boolean`, não por `dataExtincao`; o schema dele declara essa escolha ("cadastro, não
    fato"). Logo **não há como perguntar "este setor estava ativo em 2019"**, e o serviço pergunta
    "está ativo agora" (`exigirCentroDeCustoAtivo`) enquanto cargo, lotação e função perguntam
    "vigente na data do ato". A assimetria está no código, com o motivo. Fingir uma vigência —
    comparando contra `criadoEm`, por exemplo — inventaria um dado que o cadastro não guarda. O
    conserto é do M21 (dar vigência ao `Setor`), não daqui, e atravessa protocolo, almoxarifado,
    compras e patrimônio.
16. **`VINCULOS-ANTERIORES-SEM-CENTRO-DE-CUSTO`** — a coluna nasceu **nula** em todo vínculo
    anterior à migration, e não há de onde preenchê-la: escolher um setor para o histórico seria
    apropriar despesa passada num centro de custo que ninguém escolheu. Quem consome recusa com
    motivo quando `centroDeCustoVigenteEm` devolve nulo. **Consequência direta:** o eixo de centro
    de custo não acha ninguém enquanto o ente não registrar os eventos — e isso é o certo, não um
    defeito. É carga de dado do ente, não código.
17. **`FUNCAO-SEM-ACAO-PROPRIA`** — `cadastrarFuncao` reusa a ação `CADASTRAR_CARGO` (é o mesmo
    poder no eixo "criar estrutura", que é o lado da linha `CADASTRAR_CARGO` × `ADMITIR_SERVIDOR`).
    **Quem já tem `CADASTRAR_CARGO` passa a poder cadastrar função** — está escrito no censo, mas é
    ampliação. Uma ação própria custa valor novo no enum `AcaoDoSistema` (migration `ALTER TYPE`
    isolada), `atualizacoes-de-permissoes.ts`, `navegacao-permissoes.ts` e o mapa do M35: cinco
    sítios, com teste de instalação limpa E de atualização. É decisão de granularidade de perfil do
    ente, reversível, e não se toma junto com a que cria o modelo.
18. **`FUNCAO-SEM-EIXO-DE-AUSENCIA`** — não há como perguntar "quem NÃO exerce função nenhuma". O
    eixo aceita funções; `null` não é um valor pedível. O TR não pede, e inventar um
    `"SEM_FUNCAO"` sem pedido seria inventar requisito — fica nomeado para quando alguém precisar.

### O GATE DA CONSULTA MORA NA PORTA, NÃO NA TELA (V11 V9.4, pós-auditoria)

A auditoria acusou: `listarServidores` não cobrava ação nenhuma, e só não vazava porque a página era
o **único** chamador. **Proteção que depende de quem chama não é proteção — é uma coincidência que
dura até o próximo chamador.** A segunda rota a reusar a porta (exportação, API, worker) nasceria sem
gate, e o teste continuaria verde. Invariante 6: autorização no servidor, por ação nomeada.

Hoje o par é `listarServidores(c)` (invólucro que resolve a sessão) e **`listarServidoresPara(quem, c)`**,
que cobra `exigirLeituraDoEntePara(quem, "CONSULTAR_PESSOAL")`. Mesmo desenho de
`lerDossieDoEmpenho`/`lerDossieDoEmpenhoPara` (`lib/portas/empenho.ts`), cujo comentário já diz "a que
a suíte exercita".

⚠️ **A PORTA LANÇA; QUEM REDIRECIONA É A TELA.** `telaExigeLeituraDoEnte` responde à recusa com
`redirect("/sem-acesso")` — comportamento de TELA. Um worker não redireciona, e uma porta que
redireciona decide apresentação em nome de quem a chamou. A porta estoura `EscopoDeLeituraError`
**nomeando a ação que falta**; a página mantém o `exigirLeitura` dela e traduz. As duas cobranças
coexistem de propósito: a da tela dá a experiência, a da porta dá a garantia. É também o que torna a
prova possível **sem rota** — a suíte chama a porta direto.
