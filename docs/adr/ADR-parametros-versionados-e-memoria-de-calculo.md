# ADR — O parâmetro de atualização é versionado, e a competência guarda a memória de cálculo

**Situação:** aceita (orquestração V3, pacote 2, unidade 3 — 2026-09-13).

## Contexto

`ParametroAtualizacaoClasse` era uma linha por classe, mutável, sem serviço nem tela: só
seed e teste a escreviam. Método, vida útil e residual decidem o valor de cada parcela de
depreciação; uma troca em silêncio faz a competência de março e a de abril contarem
histórias diferentes sem que ninguém saiba quando a régua mudou. E "por que 450,00?" só se
respondia refazendo a conta com parâmetros que podiam já ter mudado.

## Decisão

1. **Versões append-only** (`VersaoDeParametroDeAtualizacao`): número sequencial por classe,
   autor, momento, motivo; a vigente é a de maior número; vigência derivada. A linha legada é
   ORIGEM: o resolvedor só cai nela enquanto não houver versão. Mesmo molde dos roteiros
   contábeis (ADR-versoes-de-roteiro-e-banco-de-percursos).
2. **Ação própria** `DEFINIR_PARAMETRO_DE_ATUALIZACAO`, derivada (v4) de quem parametriza
   roteiro do patrimônio. Vida útil e residual são decisão do contador sobre a NBC TSP 07,
   não efeito colateral de outra permissão.
3. **A regra é uma:** `validarParametrosDaClasse` é chamada por quem define e por quem
   calcula. Versão inválida não nasce.
4. **Prévia = a mesma conta, sem escrever.** `preverCompetencia` devolve a situação e a
   recusa nas mesmas palavras que `atualizarCompetencia` usa; a atualização a chama dentro
   da transação. Não há duas aritméticas para a mesma parcela.
5. **Memória na mesma transação.** `MemoriaDeAtualizacao` grava, por movimento, a versão do
   parâmetro e todos os números intermediários. Se a memória não grava, o movimento não
   existe.
6. **Encerrar** a atualização de uma classe é uma versão com `ativo = false` e motivo — o
   histórico continua legível; só a atualização para.

## Consequências

- `m10-competencia.test.ts` continua passando sem mudar um literal: a régua não mudou de
  lugar.
- As competências anteriores ao registro da memória aparecem "sem memória" no histórico —
  não se fabrica memória para o passado.
- Pendência `ROTEIRO-PATRIMONIAL-NAO-PARAMETRIZADO` continua: parâmetro sem roteiro do tipo
  ainda recusa lançar, nomeando.
