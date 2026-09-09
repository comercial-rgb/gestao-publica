import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import {
  gerarEstorno,
  type Partida,
} from "../../packages/ledger/index.js";
import type {
  ContaResolvida,
  PartidaParaPersistir,
} from "../m01-core-contabil/ports.js";
import {
  comporArrecadacao,
  zAnularArrecadacaoInput,
  type AnularArrecadacaoInput,
  type RegistrarArrecadacaoInput,
  type RoteiroContabil,
} from "./dominio.js";
import type { ConfrontoPrevisao, M04Deps } from "./ports.js";

/**
 * CASOS DE USO do M04. Orquestra domain puro + ports. Não fala Prisma.
 *
 * Ordem em `registrarArrecadacao`:
 *   forma (Zod) -> partidas balanceadas (motor puro) -> classificação existe
 *   (fail-closed) -> contas existem e são ANALÍTICAS (fail-closed, M01) ->
 *   persistência ATÔMICA (arrecadação + lançamento na mesma transação).
 *
 * Nada toca o banco antes do lançamento fechar.
 */

export interface ResultadoArrecadacao {
  readonly receitaId: string;
  readonly lancamentoId: string;
  /** INVARIANTE 5: excesso de arrecadação é LEGÍTIMO — sinalizado, não barrado. */
  readonly confronto: ConfrontoPrevisao;
}

/**
 * FAIL-CLOSED: nenhuma partida pode tocar conta RESERVADA por outro módulo.
 *
 * Quem responde "esta conta é gerida por alguém?" é o dono dela (o M10, pelo
 * `ContaReservadaPort`) — o M04 não sabe o que é uma dívida, e não deve saber.
 */
async function exigirContasLivres(
  partidas: readonly PartidaParaPersistir[],
  deps: M04Deps
): Promise<void> {
  const port = deps.contasReservadas!;
  for (const contaId of new Set(partidas.map((p) => p.contaId))) {
    const gestor = await port.quemGere(contaId);
    if (gestor !== null) {
      throw new Error(
        `CONTA RESERVADA: a conta desta partida é gerida pelo ${gestor} — o saldo ` +
          `dela é o Σ dos movimentos daquele livro, e uma arrecadação avulsa a ` +
          `moveria no RAZÃO sem mover os MOVIMENTOS. A amarração razão×movimentos ` +
          `passaria a acusar para sempre, sem que ninguém soubesse de onde veio a ` +
          `diferença. Use a OPERAÇÃO COMPOSTA do M10 — ela grava os dois lados na ` +
          `mesma transação.`
      );
    }
  }
}

/** Resolve os códigos PCASP em contaIds, aplicando a regra da conta analítica. */
async function resolverContas(
  partidas: readonly Partida[],
  deps: M04Deps
): Promise<readonly PartidaParaPersistir[]> {
  const codigos = [...new Set(partidas.map((p) => p.conta))];
  const encontradas = await deps.contas.buscarPorCodigos(codigos);
  const porCodigo = new Map<string, ContaResolvida>(
    encontradas.map((c) => [c.codigo, c])
  );

  const inexistentes = codigos.filter((c) => !porCodigo.has(c));
  if (inexistentes.length > 0) {
    throw new Error(
      `Conta(s) inexistente(s) no plano PCASP: ${inexistentes.join(", ")}.`
    );
  }

  const sinteticas = encontradas.filter((c) => !c.analitica);
  if (sinteticas.length > 0) {
    throw new Error(
      `Conta sintética não recebe partida: ` +
        `${sinteticas.map((c) => c.codigo).join(", ")}.`
    );
  }

  return partidas.map((p) => ({
    contaId: porCodigo.get(p.conta)!.id,
    tipo: p.tipo,
    subsistema: p.subsistema,
    valor: p.valor,
  }));
}

/** Registra uma arrecadação e sua contabilização. */
/**
 * ⚠️ CANAL INTERNO — NÃO USE.
 *
 * É por aqui que a OPERAÇÃO COMPOSTA do M10 se identifica: ela É a dona da conta
 * reservada (a arrecadação e o movimento da dívida nascem juntos, na mesma
 * transação), e o guard da entrada lateral não pode barrá-la. Qualquer outro
 * chamador que passe isto está driblando o guard — e o grep de `origem:` mostra
 * exatamente quem.
 */
export interface OrigemInterna {
  readonly origem: "OPERACAO_COMPOSTA_M10";
}

export async function registrarArrecadacao(
  input: RegistrarArrecadacaoInput,
  roteiro: RoteiroContabil,
  deps: M04Deps,
  interno?: OrigemInterna
): Promise<ResultadoArrecadacao> {
  // 1. Domain puro: forma + partidas balanceadas por subsistema.
  const { dados, partidas } = comporArrecadacao(input, roteiro);

  // ⚠️ SEM UG: a receita é do ENTE, e isso não é um detalhe do schema — é o art. 167, IV da
  // Constituição em ação. O dinheiro que entra é do município; a `ReceitaArrecadada` tem
  // natureza e fonte, e NÃO tem unidade orçamentária, porque a receita não "pertence" à
  // Secretaria de Saúde. A vinculação por FONTE é outra coisa, e ela já existe (TR 5.23).
  //
  // ⚠️ E NA OPERAÇÃO COMPOSTA (M10 × M04 — receber dívida ativa, tomar empréstimo) esta é a
  // ÚNICA autorização que roda, DENTRO da transação dela: `criarM04DepsNaTx(tx)` monta a porta
  // sobre a tx. Os linkers (`receberNaTx`, `ingressoNaTx`) não são atos do usuário — são
  // pernas do mesmo fato, e autorizá-los de novo seria cobrar duas vezes pela mesma coisa.
  await deps.autz.exigir(
    dados.criadoPor,
    ACAO_DO_SERVICO.registrarArrecadacao,
    "ENTE"
  );

  // 2. Classificação existe? (fail-closed — nunca cria implicitamente)
  const resolucao = await deps.classificacao.resolver({
    naturezaReceita: dados.naturezaReceita,
    fonte: dados.fonte,
    co: dados.co,
  });

  const faltantes: string[] = [];
  if (resolucao.naturezaReceita === null) {
    faltantes.push(`naturezaReceita="${dados.naturezaReceita}"`);
  }
  if (resolucao.fonte === null) faltantes.push(`fonte="${dados.fonte}"`);
  if (dados.co !== undefined && resolucao.co === null) {
    faltantes.push(`co="${dados.co}"`);
  }
  if (faltantes.length > 0) {
    throw new Error(
      `Componente(s) inexistente(s) na classificação: ${faltantes.join(", ")}.`
    );
  }

  const naturezaReceitaId = resolucao.naturezaReceita!.id;

  // 3. Contas existem e são analíticas (regra do M01).
  const partidasParaPersistir = await resolverContas(partidas, deps);

  // ═══ 3b. A ENTRADA LATERAL — TR do M10 (dívida e dívida ativa) ═══
  // Uma conta RESERVADA é gerida por um livro próprio (o saldo dela é Σ dos
  // movimentos da dívida). Uma arrecadação AVULSA que a toque mexe no RAZÃO sem
  // mexer nos MOVIMENTOS — e a amarração razão×movimentos passa a acusar para
  // sempre, sem que ninguém saiba de onde veio a diferença.
  //
  // A operação COMPOSTA (que grava os dois lados na mesma transação) é a dona da
  // conta: ela se identifica pelo canal interno e passa.
  if (interno === undefined && deps.contasReservadas !== undefined) {
    await exigirContasLivres(partidasParaPersistir, deps);
  }

  // 4. Confronto com a previsão. SINALIZA, não bloqueia (INVARIANTE 5):
  //    excesso de arrecadação é legítimo e vira fonte de crédito adicional.
  const confronto = await confrontarPrevisao(
    dados.exercicio,
    naturezaReceitaId,
    dados.valor,
    deps
  );

  // 5. Persistência atômica.
  const receitaId = deps.ids.novo();
  const lancamentoId = deps.ids.novo();

  await deps.receitas.persistir(
    {
      id: receitaId,
      exercicio: dados.exercicio,
      naturezaReceitaId,
      fonteId: resolucao.fonte!.id,
      ...(resolucao.co !== null ? { coId: resolucao.co.id } : {}),
      exercicioFonte: dados.exercicioFonte,
      tipo: "ARRECADACAO",
      valor: dados.valor,
      dataArrecadacao: dados.dataArrecadacao,
      numeroReceita: dados.numeroReceita,
      criadoPor: dados.criadoPor,
    },
    {
      id: lancamentoId,
      numeroControle: dados.numeroReceita,
      dataTransacao: dados.dataArrecadacao,
      historico: `Arrecadação da receita ${dados.naturezaReceita} (guia ${dados.numeroReceita})`,
      origemTipo: "ARRECADACAO",
      origemId: receitaId,
      criadoPor: dados.criadoPor,
      partidas: partidasParaPersistir,
    }
  );

  return { receitaId, lancamentoId, confronto };
}

async function confrontarPrevisao(
  exercicio: number,
  naturezaReceitaId: string,
  valor: Money,
  deps: M04Deps
): Promise<ConfrontoPrevisao> {
  const [previsto, acumuladoAnterior] = await Promise.all([
    deps.receitas.previsaoTotal(exercicio, naturezaReceitaId),
    deps.receitas.acumuladoLiquido(exercicio, naturezaReceitaId),
  ]);

  const acumuladoComEsta = toMoney(acumuladoAnterior.plus(valor));

  return {
    previsto,
    acumuladoAnterior,
    acumuladoComEsta,
    excedeuPrevisao: acumuladoComEsta.greaterThan(previsto),
  };
}

/**
 * Anula uma arrecadação: INVARIANTE 2 — não escreve de volta na original.
 * Persiste uma ReceitaArrecadada NOVA (tipo ANULACAO) e um LancamentoContabil
 * NOVO com as partidas invertidas, ambos referenciando os originais.
 *
 * O motor puro (`gerarEstorno`) rejeita duplo estorno lendo
 * `lancamento.estornos`; a corrida se fecha no índice único parcial
 * `uq_estorno_receita_unico` (prisma/sql/).
 */
export async function anularArrecadacao(
  input: AnularArrecadacaoInput,
  deps: M04Deps
): Promise<{ readonly receitaId: string; readonly lancamentoId: string }> {
  const dados = zAnularArrecadacaoInput.parse(input);

  // ⚠️ SEM UG (mesma razão da arrecadação) — e repare no que ISTO autoriza: a anulação dispara
  // a CASCATA do M10 (`AoAnularArrecadacaoPort`), que estorna, na mesma transação, tudo o que
  // a receita quitou — o recebimento de dívida ativa, o ingresso da operação de crédito.
  //
  // A cascata roda com ESTA autorização, a do ato original, e não pede outra. Ver t3: exigir
  // uma permissão própria para cada perna partiria a anulação ao meio — o dinheiro desfeito no
  // razão e a dívida do contribuinte ainda baixada. Ele teria "pago" sem ter pago.
  await deps.autz.exigir(
    dados.criadoPor,
    ACAO_DO_SERVICO.anularArrecadacao,
    "ENTE"
  );

  const original = await deps.receitas.buscar(dados.receitaId);
  if (original === null) {
    throw new Error(`Receita ${dados.receitaId} não encontrada.`);
  }
  if (original.tipo === "ANULACAO") {
    throw new Error(
      `Receita ${dados.receitaId} JÁ É uma anulação — não se anula uma anulação.`
    );
  }
  if (original.estornos.length > 0) {
    throw new Error(
      `Receita ${dados.receitaId} já foi anulada ` +
        `(por ${original.estornos.join(", ")}).`
    );
  }

  const idReceita = deps.ids.novo();
  const idLancamento = deps.ids.novo();

  // Motor puro: inverte cada perna, valida o resultado, não muta o original.
  const estorno = gerarEstorno(original.lancamento, {
    idEstorno: idLancamento,
    numeroControleEstorno: dados.numeroReceita,
    dataEstorno: dados.dataAnulacao,
  });

  const partidasParaPersistir = await resolverContas(estorno.partidas, deps);

  await deps.receitas.persistir(
    {
      id: idReceita,
      exercicio: original.exercicio,
      naturezaReceitaId: original.naturezaReceitaId,
      fonteId: original.fonteId,
      ...(original.coId !== null ? { coId: original.coId } : {}),
      exercicioFonte: original.exercicioFonte,
      tipo: "ANULACAO",
      valor: original.valor,
      dataArrecadacao: dados.dataAnulacao,
      numeroReceita: dados.numeroReceita,
      estornoDeId: original.id,
      criadoPor: dados.criadoPor,
    },
    {
      id: idLancamento,
      numeroControle: dados.numeroReceita,
      dataTransacao: dados.dataAnulacao,
      historico: estorno.historico,
      origemTipo: "ANULACAO_RECEITA",
      origemId: idReceita,
      estornoDeId: original.lancamentoId,
      criadoPor: dados.criadoPor,
      partidas: partidasParaPersistir,
    }
  );

  return { receitaId: idReceita, lancamentoId: idLancamento };
}
