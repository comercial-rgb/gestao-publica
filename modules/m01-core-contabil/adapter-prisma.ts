import { criarAutorizacaoPortPrisma } from "../m16-travamento/porta.js";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../prisma/generated/client/client.js";
import { toMoney } from "../../packages/contracts/index.js";
// ⚠️ O FUNIL DO RAZÃO (M01). Todo lançamento passa por ele — e é lá que mora o
// travamento de competência (M16). Ver `m01-funil.test.ts`: o grep-teste proíbe o
// `lancamentoContabil.create` fora dele.
import { lancarNoRazao } from "./razao.js";
import {
  classeDaConta,
  classeDeControle,
  CLASSE_PCASP,
  type ClasseDeControle,
  type ClassePcasp,
  type NaturezaDeSaldo,
} from "./dominio.js";
import type {
  LancamentoContabil,
  Partida,
} from "../../packages/ledger/index.js";
import type {
  ContaRepositoryPort,
  ContaResolvida,
  IdPort,
  LancamentoParaPersistir,
  LancamentoRepositoryPort,
  M01Deps,
} from "./ports.js";

/**
 * ADAPTERS do M01 — a única camada que conhece Prisma.
 *
 * O `valor` monetário atravessa a fronteira como STRING de 2 casas: o Decimal
 * do domínio (decimal.js) e o `Prisma.Decimal` são classes diferentes, e passar
 * uma pela outra é como o dinheiro se corrompe em silêncio (INVARIANTE 1).
 */

/** Qualquer coisa que fale Prisma: o client ou uma transação dele. */
export type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/** Qual data do lançamento recorta o saldo. */
export type CampoDeCorte = "criadoEm" | "dataTransacao";

/**
 * SALDO DE CONTAS DO RAZÃO, apurado pelas PARTIDAS. A aritmética é UMA só.
 *
 * ═══ POR QUE ELA MORA AQUI, E NÃO NO M12 ═══
 * Nasceu no Anexo 13 (Balanço Financeiro) para apurar o caixa. Agora o M09
 * (conciliação bancária) precisa EXATAMENTE do mesmo número, recortado por UMA
 * conta em vez do conjunto de caixa. Copiar a função para o M09 criaria duas
 * verdades sobre o mesmo saldo — e a conciliação existe justamente para provar
 * que o razão e o banco contam a mesma história. Então a função é uma, e o que
 * muda é o RECORTE (quais contas, até quando, por qual data).
 *
 * Conta de disponibilidade é DEVEDORA: débito entra, crédito sai. Saldo = ΣD − ΣC.
 *
 * `ate` nulo = sem limite superior. `campoData` escolhe a data do recorte:
 *  - `criadoEm`: o instante em que o fato foi registrado. É o que o encerramento
 *    de exercício usa (o corte do M08 é um `criadoEm`), e por isso é o default.
 *  - `dataTransacao`: a data do FATO. É o que a conciliação bancária usa — o
 *    extrato é recortado pela data de postagem, e comparar um lado por data de
 *    fato com o outro por data de digitação faria os dois nunca fecharem.
 */
/** As somas cruas de uma conta: ΣD e ΣC. É daqui que TODO saldo do razão sai. */
export interface SomasDaConta {
  readonly codigo: string;
  readonly debito: ReturnType<typeof toMoney>;
  readonly credito: ReturnType<typeof toMoney>;
}

/**
 * ΣD e ΣC por conta, com o recorte pedido. A LEITURA é uma só; o que muda é o
 * recorte (quais contas, até quando, por qual data) e o que se faz com as somas.
 *
 * `codigos` vazio/omitido = TODAS as contas com partida no recorte.
 */
export type NaturezaLancamento = "NORMAL" | "ENCERRAMENTO";

/**
 * O recorte por NATUREZA do lançamento.
 *
 * ⚠️ `natureza` NULA lê-se NORMAL. A coluna entrou aditiva (sem backfill), então
 * todo lançamento anterior à apuração tem `null` — e ele É normal. Excluir
 * `ENCERRAMENTO` NÃO pode excluir os nulos junto; daí o `OR` explícito abaixo.
 * (No SQL, `natureza <> 'ENCERRAMENTO'` é NULL — logo FALSO — para linha nula: a
 * armadilha clássica dos três valores.)
 */
export interface FiltroDeNatureza {
  /** Só estas naturezas. Nulos NÃO entram (nulo = NORMAL, então peça NORMAL). */
  readonly apenas?: readonly NaturezaLancamento[] | undefined;
  /** Todas MENOS estas. Os nulos CONTINUAM entrando (nulo = NORMAL). */
  readonly excluir?: readonly NaturezaLancamento[] | undefined;
  /**
   * ⚠️ O `excluir` VALE SÓ DAQUI PARA A FRENTE — e sem isto a MSC de janeiro mente.
   *
   * "Excluir o ENCERRAMENTO" é uma frase INCOMPLETA: ela só faz sentido para o
   * encerramento DO EXERCÍCIO QUE SE OLHA. O encerramento de um ano ANTERIOR não é
   * um fato pendente de nada — ele JÁ VIROU SALDO, e o saldo de abertura de qualquer
   * mês o inclui. Excluí-lo "para sempre" faz o `beginning_balance` de janeiro de E+1
   * descartar a apuração de E: a receita do ano morto ressuscita, o resultado
   * acumulado some do patrimônio líquido e — depois deste bloco — a dotação enterrada
   * volta a assombrar o orçamento novo.
   *
   * Este corte é o que separa "o encerramento que ainda não aconteceu para este
   * recorte" (excluir) de "o encerramento que já é história" (incluir). Ele é lido
   * pelo MESMO `campoData` do recorte — misturar as duas datas aqui seria comparar o
   * dia do fato com o dia da digitação.
   */
  readonly excluirDesde?: Date | undefined;
}

/** O `where` do lançamento, com data e natureza. */
function filtroDoLancamento(
  campoData: CampoDeCorte,
  data: { gte?: Date; lte?: Date } | undefined,
  natureza: FiltroDeNatureza | undefined
): Record<string, unknown> | undefined {
  const cond: Record<string, unknown> = {};
  const campo = campoData === "criadoEm" ? "criadoEm" : "dataTransacao";

  if (data !== undefined) {
    cond[campo] = data;
  }

  if (natureza?.apenas !== undefined) {
    cond["natureza"] = { in: [...natureza.apenas] };
  } else if (natureza?.excluir !== undefined && natureza.excluir.length > 0) {
    // A linha SOBREVIVE ao filtro se for normal... ou se já for história.
    const sobrevive: Record<string, unknown>[] = [
      // O nulo é NORMAL e tem de sobreviver ao filtro.
      { natureza: null },
      { natureza: { notIn: [...natureza.excluir] } },
    ];
    if (natureza.excluirDesde !== undefined) {
      sobrevive.push({ [campo]: { lt: natureza.excluirDesde } });
    }
    cond["OR"] = sobrevive;
  }

  return Object.keys(cond).length === 0 ? undefined : cond;
}

export async function somasPorConta(
  tx: Tx,
  p: {
    readonly codigos?: readonly string[] | undefined;
    /** Início da janela, INCLUSIVO. Omitido = desde sempre (saldo acumulado). */
    readonly desde?: Date | undefined;
    readonly ate: Date | null;
    readonly campoData?: CampoDeCorte;
    /** Omitido = NADA é excluído (o comportamento de sempre). */
    readonly natureza?: FiltroDeNatureza | undefined;
  }
): Promise<readonly SomasDaConta[]> {
  const campoData = p.campoData ?? "criadoEm";
  const filtroData =
    p.ate === null && p.desde === undefined
      ? undefined
      : {
          ...(p.desde !== undefined ? { gte: p.desde } : {}),
          ...(p.ate !== null ? { lte: p.ate } : {}),
        };

  const doLancamento = filtroDoLancamento(campoData, filtroData, p.natureza);

  const partidas = await tx.partidaContabil.findMany({
    where: {
      ...(p.codigos !== undefined
        ? { conta: { codigo: { in: [...p.codigos] } } }
        : {}),
      ...(doLancamento !== undefined ? { lancamento: doLancamento } : {}),
    },
    select: { tipo: true, valor: true, conta: { select: { codigo: true } } },
  });

  const por = new Map<string, { debito: ReturnType<typeof toMoney>; credito: ReturnType<typeof toMoney> }>();
  for (const partida of partidas) {
    const codigo = partida.conta.codigo;
    const acc = por.get(codigo) ?? { debito: toMoney("0.00"), credito: toMoney("0.00") };
    const v = toMoney(partida.valor.toFixed(2));
    if (partida.tipo === "DEBITO") {
      acc.debito = toMoney(acc.debito.plus(v));
    } else {
      acc.credito = toMoney(acc.credito.plus(v));
    }
    por.set(codigo, acc);
  }

  return [...por.entries()].map(([codigo, s]) => ({ codigo, ...s }));
}

export interface SomasDaContaPorLancamento extends SomasDaConta {
  readonly lancamentoId: string;
}

/**
 * ΣD e ΣC por conta **E POR LANÇAMENTO** — outro GRÃO, a MESMA aritmética.
 *
 * ⚠️ POR QUE O GRÃO FINO EXISTE, E POR QUE ELE MORA AQUI.
 * A MSC (M14) tem de quebrar o saldo de cada conta pelas DIMENSÕES (fonte de recurso,
 * natureza da receita, funcional...). E a dimensão não está na partida: ela está no
 * FATO que gerou o lançamento. Logo, para quebrar o saldo é preciso somar por
 * lançamento e só então agrupar pelas dimensões que o M14 resolve.
 *
 * Escrever essa soma DENTRO do M14 seria a segunda verdade sobre o razão: o arquivo
 * enviado à União somaria de um jeito e o balancete de outro. Aqui é o MESMO laço, a
 * MESMA conversão de `Decimal` e os MESMOS recortes (`desde`/`ate`/`campoData`/
 * `natureza`) do `somasPorConta` — muda a CHAVE, e mais nada. É a identidade M4 do M14
 * que amarra os dois grãos: somado de volta, o fino TEM de dar o grosso.
 */
export async function somasPorContaELancamento(
  tx: Tx,
  p: {
    /** Omitido = TODAS as contas (o comportamento de sempre; a MSC usa assim). O Razão
     *  analítico (M12) passa UMA conta — espelha o `codigos` do `somasPorConta`. */
    readonly codigos?: readonly string[] | undefined;
    readonly desde?: Date | undefined;
    readonly ate: Date | null;
    readonly campoData?: CampoDeCorte;
    readonly natureza?: FiltroDeNatureza | undefined;
  }
): Promise<readonly SomasDaContaPorLancamento[]> {
  const campoData = p.campoData ?? "criadoEm";
  const filtroData =
    p.ate === null && p.desde === undefined
      ? undefined
      : {
          ...(p.desde !== undefined ? { gte: p.desde } : {}),
          ...(p.ate !== null ? { lte: p.ate } : {}),
        };

  const doLancamento = filtroDoLancamento(campoData, filtroData, p.natureza);

  const partidas = await tx.partidaContabil.findMany({
    where: {
      ...(p.codigos !== undefined
        ? { conta: { codigo: { in: [...p.codigos] } } }
        : {}),
      ...(doLancamento !== undefined ? { lancamento: doLancamento } : {}),
    },
    select: {
      tipo: true,
      valor: true,
      lancamentoId: true,
      conta: { select: { codigo: true } },
    },
  });

  const por = new Map<string, { codigo: string; lancamentoId: string; debito: ReturnType<typeof toMoney>; credito: ReturnType<typeof toMoney> }>();
  for (const partida of partidas) {
    const codigo = partida.conta.codigo;
    const chave = `${codigo}|${partida.lancamentoId}`;
    const acc =
      por.get(chave) ??
      {
        codigo,
        lancamentoId: partida.lancamentoId,
        debito: toMoney("0.00"),
        credito: toMoney("0.00"),
      };
    const v = toMoney(partida.valor.toFixed(2));
    if (partida.tipo === "DEBITO") {
      acc.debito = toMoney(acc.debito.plus(v));
    } else {
      acc.credito = toMoney(acc.credito.plus(v));
    }
    por.set(chave, acc);
  }

  return [...por.values()];
}

/**
 * Saldo AGREGADO de um conjunto de contas, tratadas como DEVEDORAS (ΣD − ΣC).
 *
 * É o que o Anexo 13 (caixa) e a conciliação bancária (M09) usam — as contas de
 * disponibilidade são devedoras, e ali o que se quer é o saldo do conjunto.
 * Para o saldo de UMA conta COM A NATUREZA DA CLASSE dela, use `saldoDaConta`.
 */
export async function saldoDasContas(
  tx: Tx,
  codigos: readonly string[],
  ate: Date | null,
  campoData: CampoDeCorte = "criadoEm"
): Promise<ReturnType<typeof toMoney>> {
  const somas = await somasPorConta(tx, { codigos, ate, campoData });

  let saldo = toMoney("0.00");
  for (const s of somas) {
    saldo = toMoney(saldo.plus(s.debito).minus(s.credito));
  }
  return saldo;
}

/** O saldo de UMA conta, com a natureza da CLASSE dela (CLASSE_PCASP). */
export function saldoComNatureza(s: SomasDaConta): ReturnType<typeof toMoney> {
  const classe = classeDaConta(s.codigo);
  if (classe === null) {
    throw new Error(
      `Conta ${s.codigo} não é patrimonial (classe ${s.codigo.charAt(0)}): as ` +
        `classes 5 a 8 (orçamentário e controle) não têm natureza de saldo ` +
        `patrimonial e não entram no Balanço.`
    );
  }
  // DEVEDORA: ΣD − ΣC. CREDORA: ΣC − ΣD. O Record é a fonte única.
  return CLASSE_PCASP[classe].natureza === "DEVEDORA"
    ? toMoney(s.debito.minus(s.credito))
    : toMoney(s.credito.minus(s.debito));
}

export interface SaldoDeConta {
  readonly codigo: string;
  /** Já COM a natureza da classe: positivo = saldo normal da classe. */
  readonly saldo: ReturnType<typeof toMoney>;
}

/**
 * Os saldos (com natureza) de todas as contas PATRIMONIAIS de certas classes, com
 * partida no recorte. É a base do Balanço Patrimonial (Anexo 14).
 */
export async function saldosPorConta(
  tx: Tx,
  p: {
    readonly classes: readonly ClassePcasp[];
    readonly ate: Date | null;
    readonly campoData?: CampoDeCorte;
    readonly natureza?: FiltroDeNatureza | undefined;
  }
): Promise<readonly SaldoDeConta[]> {
  const somas = await somasPorConta(tx, {
    ate: p.ate,
    ...(p.campoData !== undefined ? { campoData: p.campoData } : {}),
    ...(p.natureza !== undefined ? { natureza: p.natureza } : {}),
  });

  return somas
    .filter((s) => {
      const classe = classeDaConta(s.codigo);
      return classe !== null && p.classes.includes(classe);
    })
    .map((s) => ({ codigo: s.codigo, saldo: saldoComNatureza(s) }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
}

export interface SaldoDeControle {
  readonly codigo: string;
  /** A natureza que o PLANO deu a esta conta — não a da classe (não existe). */
  readonly naturezaSaldo: NaturezaDeSaldo;
  /** Já COM a natureza da conta: positivo = saldo normal dela. */
  readonly saldo: ReturnType<typeof toMoney>;
}

/**
 * OS SALDOS DAS CONTAS DE CONTROLE (5 a 8) — a MESMA aritmética, OUTRA fonte de sinal.
 *
 * ═══ POR QUE NÃO DÁ PARA USAR O `saldosPorConta` ═══
 * Ele deriva o sinal do `CLASSE_PCASP`, que só conhece as classes 1 a 4 — e por isso
 * ele FILTRA fora tudo que é 5 a 8 (o `classeDaConta` devolve `null`). Não é um
 * descuido: é que a natureza de uma conta de controle NÃO se deduz da classe dela. A
 * 6.2.2.1.1 (crédito disponível) é CREDORA e a 6.2.1.2.0 (receita realizada) é
 * DEVEDORA — as duas na classe 6. Quem sabe é o PLANO, na coluna `naturezaSaldo`.
 *
 * Então esta leitura pergunta ao plano. As somas continuam vindo do `somasPorConta` — a
 * aritmética do razão é UMA só, e o que muda é de onde sai o sinal.
 *
 * ⚠️ A conta que o razão movimenta e o plano NÃO conhece faz a leitura CAIR. Um
 * encerramento que "não achou" uma conta de controle a deixaria com saldo vivo
 * atravessando o ano — em silêncio, que é exatamente como o furo de 46dfd5d viveu.
 */
export async function saldosDeControle(
  tx: Tx,
  p: {
    readonly classes: readonly ClasseDeControle[];
    readonly ate: Date | null;
    readonly campoData?: CampoDeCorte;
    readonly natureza?: FiltroDeNatureza | undefined;
  }
): Promise<readonly SaldoDeControle[]> {
  const somas = (
    await somasPorConta(tx, {
      ate: p.ate,
      ...(p.campoData !== undefined ? { campoData: p.campoData } : {}),
      ...(p.natureza !== undefined ? { natureza: p.natureza } : {}),
    })
  ).filter((s) => {
    const classe = classeDeControle(s.codigo);
    return classe !== null && p.classes.includes(classe);
  });

  const contas = await tx.contaPcasp.findMany({
    where: { codigo: { in: somas.map((s) => s.codigo) } },
    select: { codigo: true, naturezaSaldo: true },
  });
  const porCodigo = new Map(contas.map((c) => [c.codigo, c.naturezaSaldo]));

  const orfas = somas.filter((s) => !porCodigo.has(s.codigo));
  if (orfas.length > 0) {
    throw new Error(
      `Conta(s) de controle com partida no razão e AUSENTE(S) do plano: ` +
        `${orfas.map((s) => s.codigo).join(", ")}. Sem a natureza de saldo do plano ` +
        `não há como dizer o SINAL do saldo delas — e uma conta de controle sem saldo ` +
        `conhecido atravessa a virada em silêncio.`
    );
  }

  return somas
    .map((s) => {
      const natureza = porCodigo.get(s.codigo)!;
      return {
        codigo: s.codigo,
        naturezaSaldo: natureza,
        saldo:
          natureza === "DEVEDORA"
            ? toMoney(s.debito.minus(s.credito))
            : toMoney(s.credito.minus(s.debito)),
      };
    })
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
}

/**
 * O MOVIMENTO de cada conta NUM PERÍODO — a base da DVP (Anexo 15).
 *
 * ═══ FLUXO, NÃO SALDO ═══
 * O Balanço é uma FOTO (saldo num corte); a DVP é um FILME (o que se moveu entre
 * dois cortes). Por isso o parâmetro aqui é uma JANELA, e não um corte único.
 *
 * Matematicamente é a mesma coisa que `saldoDaConta(fim) − saldoDaConta(antes do
 * início)`: as partidas de fora da janela aparecem nos dois termos e se cancelam.
 * A ARITMÉTICA É A MESMA (`saldoComNatureza`, lendo o `CLASSE_PCASP`) — o que muda
 * é o recorte. Uma leitura, muitos recortes.
 *
 * `inicio` é INCLUSIVO e `fim` também: um fato do dia 1º pertence ao período.
 */
export async function movimentosPorConta(
  tx: Tx,
  p: {
    readonly classes: readonly ClassePcasp[];
    readonly inicio: Date;
    readonly fim: Date;
    readonly campoData?: CampoDeCorte;
    /** Omitido = NADA é excluído (o comportamento de sempre). */
    readonly natureza?: FiltroDeNatureza | undefined;
  }
): Promise<readonly SaldoDeConta[]> {
  if (p.fim < p.inicio) {
    throw new Error(
      `Período invertido: início ${p.inicio.toISOString()} depois do fim ` +
        `${p.fim.toISOString()}.`
    );
  }

  const somas = await somasPorConta(tx, {
    desde: p.inicio,
    ate: p.fim,
    ...(p.campoData !== undefined ? { campoData: p.campoData } : {}),
    ...(p.natureza !== undefined ? { natureza: p.natureza } : {}),
  });

  return somas
    .filter((s) => {
      const classe = classeDaConta(s.codigo);
      return classe !== null && p.classes.includes(classe);
    })
    .map((s) => ({ codigo: s.codigo, saldo: saldoComNatureza(s) }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
}

export function criarContaRepositoryPrisma(
  prisma: Tx
): ContaRepositoryPort {
  return {
    async buscarPorCodigos(codigos) {
      const linhas = await prisma.contaPcasp.findMany({
        where: { codigo: { in: [...codigos] } },
        select: {
          id: true,
          codigo: true,
          analitica: true,
          naturezaSaldo: true,
        },
      });
      return linhas satisfies readonly ContaResolvida[];
    },
  };
}

export function criarLancamentoRepositoryPrisma(
  prisma: PrismaClient
): LancamentoRepositoryPort {
  return {
    async persistir(lancamento: LancamentoParaPersistir): Promise<string> {
      return prisma.$transaction(async (tx) => {
        // INVARIANTE 5, dentro da transação: TODA partida tem de referenciar
        // conta analitica=true. O serviço já checou, mas entre a checagem e o
        // INSERT o plano de contas pode ter mudado — esta é a última barreira.
        const contaIds = [
          ...new Set(lancamento.partidas.map((p) => p.contaId)),
        ];
        const contas = await tx.contaPcasp.findMany({
          where: { id: { in: contaIds } },
          select: { id: true, codigo: true, analitica: true },
        });

        if (contas.length !== contaIds.length) {
          throw new Error(
            `Conta(s) inexistente(s) no plano PCASP ao persistir o lançamento ` +
              `${lancamento.numeroControle}.`
          );
        }
        const sinteticas = contas.filter((c) => !c.analitica);
        if (sinteticas.length > 0) {
          throw new Error(
            `Conta sintética não recebe partida: ` +
              `${sinteticas.map((c) => c.codigo).join(", ")}.`
          );
        }

        // INVARIANTE 3: um lançamento só é estornado UMA vez. A relação
        // `estornos` é 1-N no Prisma; a unicidade no banco vem do índice
        // parcial uq_estorno_unico (pós-migrate). Este recheck na tx cobre
        // a corrida antes do índice existir / dá mensagem clara.
        if (lancamento.estornoDeId !== undefined) {
          const jaEstornado = await tx.lancamentoContabil.count({
            where: { estornoDeId: lancamento.estornoDeId },
          });
          if (jaEstornado > 0) {
            throw new Error(
              `Lançamento ${lancamento.estornoDeId} já foi estornado.`
            );
          }
        }

        // ⚠️ O FUNIL. Este adapter era UM dos 19 escritores — agora é um CHAMADOR.
        return lancarNoRazao(tx, {
          id: lancamento.id,
          numeroControle: lancamento.numeroControle,
          dataTransacao: lancamento.dataTransacao,
          historico: lancamento.historico,
          origemTipo: lancamento.origemTipo,
          origemId: lancamento.origemId ?? null,
          estornoDeId: lancamento.estornoDeId ?? null,
          criadoPor: lancamento.criadoPor,
          partidas: lancamento.partidas.map((p) => ({
            contaId: p.contaId,
            tipo: p.tipo,
            subsistema: p.subsistema,
            valor: p.valor.toFixed(2),
            // ADITIVO M05 — nulo quando a partida não tem dimensão orçamentária.
            fichaId: p.fichaId ?? null,
          })),
        });
      });
    },

    async buscar(id: string): Promise<LancamentoContabil | null> {
      const linha = await prisma.lancamentoContabil.findUnique({
        where: { id },
        select: {
          id: true,
          numeroControle: true,
          dataTransacao: true,
          historico: true,
          estornoDeId: true,
          // INVARIANTE 3: "está estornado?" sai daqui — não de um campo mutável.
          estornos: { select: { id: true } },
          partidas: {
            select: {
              tipo: true,
              subsistema: true,
              valor: true,
              conta: { select: { codigo: true } },
            },
          },
        },
      });

      if (linha === null) return null;

      const partidas: readonly Partida[] = linha.partidas.map((p) => ({
        conta: p.conta.codigo,
        tipo: p.tipo,
        subsistema: p.subsistema,
        valor: toMoney(p.valor.toFixed(2)),
      }));

      return {
        id: linha.id,
        numeroControle: linha.numeroControle,
        partidas,
        dataTransacao: linha.dataTransacao,
        historico: linha.historico,
        ...(linha.estornoDeId !== null
          ? { estornoDeId: linha.estornoDeId }
          : {}),
        estornos: linha.estornos.map((e) => e.id),
      };
    },
  };
}

export const idsUuid: IdPort = {
  novo: () => randomUUID(),
};

/**
 * Cria o PrismaClient. No Prisma 7 o query compiler está ligado (não há mais
 * engine Rust), então o client EXIGE um driver adapter — `datasourceUrl` e
 * `datasources` não existem mais no construtor. Toda a app entra por aqui.
 */
export function criarPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/** Monta as deps do M01 sobre um PrismaClient. */
export function criarM01Deps(prisma: PrismaClient): M01Deps {
  return {
    autz: criarAutorizacaoPortPrisma(prisma),
    contas: criarContaRepositoryPrisma(prisma),
    lancamentos: criarLancamentoRepositoryPrisma(prisma),
    ids: idsUuid,
  };
}
