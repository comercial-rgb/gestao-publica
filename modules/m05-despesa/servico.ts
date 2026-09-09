import type { Money } from "../../packages/contracts/index.js";
import { gerarEstorno, type Partida } from "../../packages/ledger/index.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import type {
  ContaResolvida,
  PartidaParaPersistir,
} from "../m01-core-contabil/ports.js";
import {
  comporEmpenho,
  comporPartidas,
  zAnularEmpenhoInput,
  zLiberarReservaInput,
  zReservarDotacaoInput,
  type AnularEmpenhoInput,
  type CategoriaOrdemCronologica,
  type EmpenharInput,
  type LiberarReservaInput,
  type ReservarDotacaoInput,
  type RoteiroContabil,
  type SaldosFicha,
} from "./dominio.js";
import type { Divergencia, M05Deps } from "./ports.js";

/**
 * CASOS DE USO do M05.
 *
 * A checagem de saldo (INVARIANTE 5) NÃO acontece aqui: ela precisa ler o SUM
 * real DENTRO da transação do INSERT, senão duas requisições concorrentes
 * empenham em cima do mesmo saldo. Por isso ela vive no adapter, e o serviço
 * cuida da forma, das partidas e da resolução de contas.
 */

/**
 * Resolve os códigos PCASP em `contaId` e carimba a dimensão orçamentária.
 *
 * `fichaId` UNDEFINED = a perna não pertence à execução da ficha. É o caso das
 * pernas de passivo das retenções (M07): dinheiro de terceiro transita pelo
 * caixa da ficha, mas não é despesa dela.
 */
export async function resolverContas(
  partidas: readonly Partida[],
  fichaId: string | undefined,
  deps: M05Deps
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

  // ADITIVO M05: a partida do empenho carrega a dimensão orçamentária.
  return partidas.map((p) => ({
    contaId: porCodigo.get(p.conta)!.id,
    tipo: p.tipo,
    subsistema: p.subsistema,
    valor: p.valor,
    ...(fichaId !== undefined ? { fichaId } : {}),
  }));
}

/** Reserva dotação (pré-empenho). O saldo é conferido dentro da transação. */
export async function reservarDotacao(
  input: ReservarDotacaoInput,
  deps: M05Deps
): Promise<string> {
  const dados = zReservarDotacaoInput.parse(input);

  // ⚠️ A UG DO FATO É A DA FICHA — e é assim em TODO o M05. A despesa é o único lugar do
  // sistema onde a unidade gestora é um dado real (é a ficha que a carrega), e é por isso que
  // a segregação do 6.5 tem dentes aqui: um perfil de "empenhar na Saúde" não empenha na
  // Educação, e a negação diz exatamente qual unidade foi pedida.
  await deps.autz.exigir(dados.criadoPor, ACAO_DO_SERVICO.reservarDotacao, {
    ficha: dados.fichaId,
  });

  return deps.despesa.reservar({
    reservaId: deps.ids.novo(),
    fichaId: dados.fichaId,
    valor: dados.valor,
    historico: dados.historico,
    ...(dados.processoId !== undefined
      ? { processoId: dados.processoId }
      : {}),
    criadoPor: dados.criadoPor,
  });
}

/** Libera uma reserva não usada: registro NOVO + RESERVA_LIBERADA. */
export async function liberarReserva(
  input: LiberarReservaInput,
  deps: M05Deps
): Promise<string> {
  const dados = zLiberarReservaInput.parse(input);

  // A UG vem da RESERVA -> ficha. (O input não traz a ficha; traz a reserva.)
  await deps.autz.exigir(dados.criadoPor, ACAO_DO_SERVICO.liberarReserva, {
    reserva: dados.reservaId,
  });

  return deps.despesa.liberarReserva({
    reservaLiberacaoId: deps.ids.novo(),
    reservaOriginalId: dados.reservaId,
    historico: dados.historico,
    criadoPor: dados.criadoPor,
  });
}

/**
 * Empenha (de reserva ou direto).
 *
 * Ordem: forma (Zod) -> partidas balanceadas (motor puro) -> contas analíticas ->
 * TRANSAÇÃO (saldo da ficha pelo SUM real, guards do CONTRATO com a linha travada,
 * INSERTs, recálculo do cache).
 *
 * ⚠️ OS GUARDS DO CONTRATO SAÍRAM DAQUI E FORAM PARA DENTRO DA TRANSAÇÃO (adapter).
 * Enquanto moravam no serviço, rodavam ANTES da `tx`: dois empenhos concorrentes
 * liam o mesmo saldo e os dois passavam. Um guard de saldo que roda fora da
 * transação não é um guard — é uma sugestão.
 */
export async function empenhar(
  input: EmpenharInput,
  roteiro: RoteiroContabil,
  deps: M05Deps
): Promise<{ readonly empenhoId: string; readonly lancamentoId: string }> {
  const { dados, partidas } = comporEmpenho(input, roteiro);

  await deps.autz.exigir(dados.criadoPor, ACAO_DO_SERVICO.empenhar, {
    ficha: dados.fichaId,
  });

  const partidasParaPersistir = await resolverContas(
    partidas,
    dados.fichaId,
    deps
  );

  const empenhoId = deps.ids.novo();
  const lancamentoId = deps.ids.novo();

  await deps.despesa.empenhar(
    {
      empenhoId,
      fichaId: dados.fichaId,
      ...(dados.reservaId !== undefined ? { reservaId: dados.reservaId } : {}),
      ...(dados.subelementoId !== undefined
        ? { subelementoId: dados.subelementoId }
        : {}),
      ...(dados.contratoId !== undefined
        ? { contratoId: dados.contratoId }
        : {}),
      ...(dados.classeDeBensId !== undefined
        ? { classeDeBensId: dados.classeDeBensId }
        : {}),
      ...(dados.dividaId !== undefined ? { dividaId: dados.dividaId } : {}),
      // M11 (TR 4.50) — a obra. O guard vive no adapter (lê a natureza da ficha).
      ...(dados.obraId !== undefined ? { obraId: dados.obraId } : {}),
      numero: dados.numero,
      tipo: dados.tipo,
      valor: dados.valor,
      data: dados.data,
      credorCpfCnpj: dados.credorCpfCnpj,
      historico: dados.historico,
      // Pode vir INDEFINIDA quando há contrato: quem a resolve (herança) é o
      // adapter, DENTRO da transação, junto com os demais guards do contrato.
      ...(dados.categoriaOrdemCronologica !== undefined
        ? { categoriaOrdemCronologica: dados.categoriaOrdemCronologica }
        : {}),
      criadoPor: dados.criadoPor,
    },
    {
      id: lancamentoId,
      numeroControle: dados.numero,
      dataTransacao: dados.data,
      historico: dados.historico,
      origemTipo: "EMPENHO",
      origemId: empenhoId,
      criadoPor: dados.criadoPor,
      partidas: partidasParaPersistir,
    }
  );

  return { empenhoId, lancamentoId };
}

/**
 * Anula um empenho: INVARIANTE 2 — registro NOVO com o lançamento invertido,
 * referenciando o original. Devolve o saldo à ficha via EMPENHO_ANULADO.
 */
export async function anularEmpenho(
  input: AnularEmpenhoInput,
  deps: M05Deps
): Promise<{ readonly empenhoId: string; readonly lancamentoId: string }> {
  const dados = zAnularEmpenhoInput.parse(input);

  // A UG vem do EMPENHO -> ficha. Anular a despesa da Saúde é ato da Saúde.
  await deps.autz.exigir(dados.criadoPor, ACAO_DO_SERVICO.anularEmpenho, {
    empenho: dados.empenhoId,
  });

  const original = await deps.despesa.buscarEmpenho(dados.empenhoId);
  if (original === null) {
    throw new Error(`Empenho ${dados.empenhoId} não encontrado.`);
  }
  if (original.estornoDeId !== null) {
    throw new Error(
      `Empenho ${dados.empenhoId} JÁ É uma anulação — não se anula uma anulação.`
    );
  }
  if (original.estornos.length > 0) {
    throw new Error(
      `Empenho ${dados.empenhoId} já foi anulado ` +
        `(por ${original.estornos.join(", ")}).`
    );
  }

  const empenhoAnulacaoId = deps.ids.novo();
  const lancamentoId = deps.ids.novo();

  // O adapter devolve o lançamento original; o motor puro inverte as pernas.
  const lancamentoOriginal = await deps.despesa.buscarLancamentoDoEmpenho(
    original.id
  );
  const estorno = gerarEstorno(lancamentoOriginal, {
    idEstorno: lancamentoId,
    numeroControleEstorno: dados.numero,
    dataEstorno: dados.data,
  });

  const partidasParaPersistir = await resolverContas(
    estorno.partidas,
    original.fichaId,
    deps
  );

  await deps.despesa.anularEmpenho(
    {
      empenhoAnulacaoId,
      empenhoOriginalId: original.id,
      numero: dados.numero,
      data: dados.data,
      historico: dados.historico,
      criadoPor: dados.criadoPor,
    },
    {
      id: lancamentoId,
      numeroControle: dados.numero,
      dataTransacao: dados.data,
      historico: estorno.historico,
      origemTipo: "EMPENHO_ANULADO",
      origemId: empenhoAnulacaoId,
      estornoDeId: original.lancamentoId,
      criadoPor: dados.criadoPor,
      partidas: partidasParaPersistir,
    }
  );

  return { empenhoId: empenhoAnulacaoId, lancamentoId };
}

/**
 * INVARIANTE 4 — RECONCILIAÇÃO. Compara cada coluna de saldo com o SUM real dos
 * movimentos. DEVE devolver [] sempre; qualquer item aqui é bug de cache.
 *
 * Existe porque a alternativa (confiar que o cache está certo) é justamente o
 * que faz sistema de orçamento derrapar em silêncio.
 */
export async function reconciliarFicha(
  fichaId: string,
  deps: M05Deps
): Promise<readonly Divergencia[]> {
  const [cache, real] = await Promise.all([
    deps.despesa.saldosCache(fichaId),
    deps.despesa.saldosReais(fichaId),
  ]);

  const chaves = [
    "autorizado",
    "reservado",
    "empenhado",
    "disponivel",
  ] as const;

  const divergencias: Divergencia[] = [];
  for (const chave of chaves) {
    const c: Money = cache[chave];
    const r: Money = real[chave];
    if (!c.equals(r)) {
      divergencias.push({ saldo: chave, cache: c, real: r });
    }
  }
  return divergencias;
}

/** Saldos correntes (do SUM real — nunca do cache). */
export async function saldosDaFicha(
  fichaId: string,
  deps: M05Deps
): Promise<SaldosFicha> {
  return deps.despesa.saldosReais(fichaId);
}

export { comporPartidas };
