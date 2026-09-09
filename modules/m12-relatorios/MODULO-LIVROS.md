# M12 — os livros obrigatórios: Diário, Razão e Balancete

**TR 1.3.2** · **5.92** (Diário) · **5.93** (Razão) · **5.94** (Balancete) · art. 50 da LRF.

Os três livros que todo ente tem de manter e exibir ao TCE. Este bloco os entrega como **leitura
pura** — zero aritmética nova, zero escrita.

## 1. Um compositor, não um calculador

Toda soma do razão mora em **um** lugar: `somasPorConta` (M01, dono do razão). Os três livros
COMPÕEM essa soma em três formatos:

| livro | formato | compõe de |
|---|---|---|
| **Diário** (5.92) | lançamentos em ordem cronológica estável | `lancamentoContabil` com partidas, ordenado |
| **Razão** (5.93) | uma conta, com saldo corrente por linha | `somasPorContaELancamento` + `saldoDasContas` |
| **Balancete** (5.94) | saldos+somas por conta, sintético ou analítico | `somasPorConta` (três fotos: antes, período, acumulado) |

Um livro que somasse sozinho seria uma **segunda verdade** sobre o razão — e o dia em que ela
divergisse, o balancete fecharia e o balanço não, sem ninguém saber qual mentiu. O grep-teste
(`m12-livros.test.ts` t7) proíbe `.create`/`.aggregate`/`_sum` em `livros.ts` — a rede que mantém
a promessa. A única mudança fora do módulo foi **estender** `somasPorContaELancamento` com o
filtro `codigos?` (espelhando o `somasPorConta`), para o Razão de uma conta não puxar o razão
inteiro do banco. **+6 linhas, zero removidas.**

## 2. As quatro provas auto-executáveis

Cada livro carrega a prova de que fechou, e os testes as exercitam contra literais à mão:

- **0(a) — o Diário é reproduzível.** Ordem `(dataTransacao, criadoEm, id)`: a data do fato
  governa; dois fatos do mesmo dia desempatam por `criadoEm`; o `id` único é o desempate final. A
  auditoria reproduz o livro byte a byte amanhã (t1 relê e compara com uma ordenação independente).
- **L1 (Razão)** — a última linha do saldo corrente == `saldoDaConta` no corte. Omitir uma linha a
  quebra (t2: 200 ≠ −300).
- **L2 (Balancete sintético)** — cada sintética == Σ das analíticas sob o prefixo dela (a A3 do
  Anexo 14 generalizada). Uma filha fora do rolo diverge e nomeia a sintética (t4).
- **L3 (Balancete)** — Σ saldos devedores == Σ saldos credores. O balancete de verificação existe
  para provar isso; se não fechar, `fecha` vem `false` — ele **nomeia** a diferença, não a esconde
  (t3: 1800 == 1800).

## 3. O corte é por `dataTransacao`, e a natureza é ESCOLHA do leitor

Os livros cortam pela **data do fato** (não pela digitação) — um Diário ordenado por `criadoEm`
mostraria 2 de março antes de 1º de março se aquele fosse digitado depois. É a mesma escolha do
travamento (M16) e dos balanços.

O balancete **pré-encerramento** e o **pós-encerramento** são livros diferentes, e quem escolhe é
o leitor: `natureza: "NORMAL"` (default) exclui os lançamentos de `ENCERRAMENTO`; `"TODAS"` os
inclui (o balancete final, com as classes 3/4 zeradas — t3b prova a regressão do M08 pela lente do
livro). É a lição do M08: "excluir o encerramento" só faz sentido para o encerramento **deste**
exercício, então é escolha explícita, não default silencioso.

## 4. O guard sintético (0(c)) é provado, não presumido

O balancete sintético soma as **folhas** por prefixo — se uma conta sintética tivesse partida
direta, ela sumiria do rolo. O guard do M01 (*"conta sintética não recebe partida"*, enforçado em
toda composição de partidas) impede isso, e o t7b **prova a premissa** com uma query
(`partidaContabil` em conta `analitica: false` == 0), em vez de confiar nela.

## 5. Consolidado nasce; por-UG é pendência cruzada

Os três livros são **consolidados** (o ente inteiro), e **não há parâmetro de unidade gestora** nas
assinaturas. A ausência é deliberada: o `LancamentoContabil` não carrega UG (o censo de `8dd0c3c`
documenta por quê — a dimensão vive na ficha, não na partida), e nem todo lançamento tem ficha (o
manual puro, o patrimonial em lote). Um `unidadeGestora?` que não filtrasse nada seria **parâmetro
morto** — pior que a ausência, porque promete um recorte que não existe.

**PENDÊNCIA NOMEADA (livros-por-ug), cruzada com o censo de UG de `8dd0c3c`** — os dois documentos
apontam um para o outro. Fechá-la é a mesma decisão que dar UG ao lançamento.

### Parente: o de-para Órgão → Poder (RREO Anexo 7)

O RREO Anexo 7 publica os Restos a Pagar **por Poder e Órgão**, e o `Orgao` do sistema não tem
Poder. A solução foi um de-para fechado `DeParaOrgaoPoder` (Executivo/Legislativo), **fail-closed**:
órgão sem poder mapeado FAZ o gerador parar (é publicação por poder ao TCE, não apresentação). É a
**mesma família** desta pendência e do censo de UG — as três perguntam "de QUEM é este número". A
diferença: aqui a dimensão é o **órgão** (que já mora na ficha, via `Empenho → Ficha → Orgao`), não
a UG; e um [órgão TEM VÁRIAS UGs](../m16-travamento/MODULO-BLOCO3.md), então poder e UG NÃO se
derivam um do outro. Quando a segregação por UG amadurecer, os três se encontram. Ver o cabeçalho
de [`prisma/schema/m12-rreo-anexo7.prisma`](../../prisma/schema/m12-rreo-anexo7.prisma).
