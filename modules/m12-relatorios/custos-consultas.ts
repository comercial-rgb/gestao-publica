import { serializarPercentual, toMoney, toPercentual, type Money } from "../../packages/contracts/index.js";
import { janelaCivilDoAno } from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";

/**
 * M12 — O CUSTO ACUMULADO POR CENTRO, e a composição que volta ao fato (V19/C05).
 *
 * ═══ ⚠️ ESTA É A METADE QUE O REQUISITO COBRA COM MAIS INSISTÊNCIA ═══
 * *"O fato ou apropriação rastreável deve ALCANÇAR OS RELATÓRIOS"* — e a prova de C05 é
 * *"composição RASTREÁVEL sem lançar novamente a mesma despesa"*. Um acúmulo por centro que não
 * volta ao fato é um número que ninguém pode conferir: o secretário lê "minha secretaria custou
 * 140.000,00" e não tem como perguntar de onde veio. `composicaoDoCentro` responde exatamente isso,
 * liquidação por liquidação.
 *
 * ⚠️ E O RECORTE É A COMPETÊNCIA DO CUSTO, não a data da liquidação. A ordem de construção é
 * explícita: "custo não é necessariamente o mesmo instante do desembolso". O aluguel liquidado em
 * janeiro e apropriado à competência de dezembro entra no custo de DEZEMBRO — e é assim que o custo
 * de um mês para de mudar depois de fechado.
 */

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

export interface CustoDoCentro {
  readonly centroId: string;
  readonly centroCodigo: string;
  readonly centroNome: string;
  readonly unidadeCodigo: string;
  readonly unidadeNome: string;
  readonly total: Money;
  /** Quantas apropriações compõem este total — o tamanho da composição. */
  readonly apropriacoes: number;
}

export interface CustoPorCentro {
  readonly de: Date;
  readonly ate: Date;
  readonly centros: readonly CustoDoCentro[];
  /** Σ dos centros. A conta que o leitor faria com o dedo. */
  readonly total: Money;
}

/** A janela: o exercício civil do ente, ou o intervalo pedido. */
function janela(p: {
  readonly exercicio?: number;
  readonly de?: Date;
  readonly ate?: Date;
}): { readonly de: Date; readonly ate: Date } {
  if (p.de !== undefined && p.ate !== undefined) return { de: p.de, ate: p.ate };
  const ano = p.exercicio ?? new Date().getFullYear();
  const j = janelaCivilDoAno(ano);
  return { de: j.inicio, ate: j.fim };
}

/**
 * O CUSTO ACUMULADO DE CADA CENTRO no período.
 *
 * ⚠️ A SOMA É DAS PARTES GRAVADAS, e não um rateio recalculado na leitura. Recalcular aqui faria o
 * relatório mudar quando o critério mudasse de versão — e o custo de um mês fechado passaria a
 * depender da régua de hoje. As partes são o fato; a leitura soma o fato.
 */
export async function custoPorCentro(
  tx: Tx,
  p: { readonly exercicio?: number; readonly de?: Date; readonly ate?: Date }
): Promise<CustoPorCentro> {
  const { de, ate } = janela(p);

  const itens = await tx.itemDaApropriacaoDeCusto.findMany({
    where: { apropriacao: { competencia: { gte: de, lte: ate } } },
    select: {
      valor: true,
      apropriacaoId: true,
      centro: {
        select: {
          id: true,
          codigo: true,
          nome: true,
          unidadeOrc: { select: { codigo: true, descricao: true } },
        },
      },
    },
  });

  const porCentro = new Map<
    string,
    { dados: CustoDoCentro; apropriacoes: Set<string> }
  >();
  for (const i of itens) {
    const atual = porCentro.get(i.centro.id);
    const valor = toMoney(i.valor.toFixed(2));
    if (atual === undefined) {
      porCentro.set(i.centro.id, {
        dados: {
          centroId: i.centro.id,
          centroCodigo: i.centro.codigo,
          centroNome: i.centro.nome,
          unidadeCodigo: i.centro.unidadeOrc.codigo,
          unidadeNome: i.centro.unidadeOrc.descricao,
          total: valor,
          apropriacoes: 0,
        },
        apropriacoes: new Set([i.apropriacaoId]),
      });
    } else {
      atual.dados = { ...atual.dados, total: toMoney(atual.dados.total.plus(valor)) };
      atual.apropriacoes.add(i.apropriacaoId);
    }
  }

  const centros = [...porCentro.values()]
    .map((c) => ({ ...c.dados, apropriacoes: c.apropriacoes.size }))
    .sort((a, b) => a.centroCodigo.localeCompare(b.centroCodigo));

  return {
    de,
    ate,
    centros,
    total: centros.reduce((acc, c) => toMoney(acc.plus(c.total)), toMoney("0.00")),
  };
}

export interface LinhaDaComposicao {
  readonly apropriacaoId: string;
  readonly competencia: Date;
  readonly valorNoCentro: Money;
  readonly valorApropriado: Money;
  readonly motivo: string;
  readonly criterio: string | null;
  readonly criterioVersao: number | null;
  readonly criterioAto: string | null;
  /** O FATO: a liquidação que reconheceu a despesa. */
  readonly liquidacaoNumero: string;
  readonly liquidacaoData: Date;
  readonly liquidacaoValor: Money;
  readonly empenhoNumero: string;
  readonly credor: string;
  readonly criadoPor: string;
}

/**
 * A COMPOSIÇÃO DO CUSTO DE UM CENTRO — cada parte, com o fato de onde veio.
 *
 * ⚠️ É ESTA CONSULTA QUE FAZ A APROPRIAÇÃO SER "RASTREÁVEL": ela devolve, para cada centavo
 * acumulado no centro, a liquidação (número, data, valor), o empenho e o credor. Sem ela, o total
 * por centro seria um número sem procedência — e a primeira pergunta que um secretário faz é "de
 * onde veio isso?".
 */
export async function composicaoDoCentro(
  tx: Tx,
  p: {
    readonly centroId: string;
    readonly exercicio?: number;
    readonly de?: Date;
    readonly ate?: Date;
  }
): Promise<readonly LinhaDaComposicao[]> {
  const { de, ate } = janela(p);

  const itens = await tx.itemDaApropriacaoDeCusto.findMany({
    where: {
      centroId: p.centroId,
      apropriacao: { competencia: { gte: de, lte: ate } },
    },
    orderBy: { apropriacao: { competencia: "asc" } },
    select: {
      valor: true,
      apropriacao: {
        select: {
          id: true,
          competencia: true,
          valor: true,
          motivo: true,
          criadoPor: true,
          criterio: { select: { chave: true, versao: true, atoRef: true } },
          liquidacao: {
            select: {
              numero: true,
              data: true,
              valor: true,
              empenho: { select: { numero: true, credorCpfCnpj: true } },
            },
          },
        },
      },
    },
  });

  return itens.map((i) => ({
    apropriacaoId: i.apropriacao.id,
    competencia: i.apropriacao.competencia,
    valorNoCentro: toMoney(i.valor.toFixed(2)),
    valorApropriado: toMoney(i.apropriacao.valor.toFixed(2)),
    motivo: i.apropriacao.motivo,
    criterio: i.apropriacao.criterio?.chave ?? null,
    criterioVersao: i.apropriacao.criterio?.versao ?? null,
    criterioAto: i.apropriacao.criterio?.atoRef ?? null,
    liquidacaoNumero: i.apropriacao.liquidacao.numero,
    liquidacaoData: i.apropriacao.liquidacao.data,
    liquidacaoValor: toMoney(i.apropriacao.liquidacao.valor.toFixed(2)),
    empenhoNumero: i.apropriacao.liquidacao.empenho.numero,
    credor: i.apropriacao.liquidacao.empenho.credorCpfCnpj,
    criadoPor: i.apropriacao.criadoPor,
  }));
}

export interface CriterioNaLista {
  readonly id: string;
  readonly chave: string;
  readonly versao: number;
  readonly atoRef: string;
  readonly vigenteDesde: Date;
  readonly vigente: boolean;
  readonly centroDoResiduo: string;
  readonly itens: readonly { readonly centroCodigo: string; readonly centroNome: string; readonly percentual: string }[];
}

/**
 * OS CRITÉRIOS publicados, com a marca de qual está VIGENTE em cada chave.
 *
 * ⚠️ A VIGÊNCIA É DERIVADA AQUI PELO MESMO CRITÉRIO DO SERVIÇO (maior `vigenteDesde` já decorrida,
 * empate pela maior versão). Se a tela resolvesse de outro jeito, ela mostraria uma régua e o
 * sistema aplicaria outra.
 */
export async function criteriosDeRateio(
  tx: Tx,
  p: { readonly em?: Date }
): Promise<readonly CriterioNaLista[]> {
  const em = p.em ?? new Date();
  const todos = await tx.criterioDeRateioDeCusto.findMany({
    orderBy: [{ chave: "asc" }, { versao: "desc" }],
    select: {
      id: true,
      chave: true,
      versao: true,
      atoRef: true,
      vigenteDesde: true,
      centroDoResiduo: { select: { codigo: true } },
      itens: {
        orderBy: { centro: { codigo: "asc" } },
        select: { percentual: true, centro: { select: { codigo: true, nome: true } } },
      },
    },
  });

  const vigentePorChave = new Map<string, string>();
  for (const c of todos) {
    if (c.vigenteDesde > em) continue;
    if (!vigentePorChave.has(c.chave)) vigentePorChave.set(c.chave, c.id);
  }

  return todos.map((c) => ({
    id: c.id,
    chave: c.chave,
    versao: c.versao,
    atoRef: c.atoRef,
    vigenteDesde: c.vigenteDesde,
    vigente: vigentePorChave.get(c.chave) === c.id,
    centroDoResiduo: c.centroDoResiduo.codigo,
    itens: c.itens.map((i) => ({
      centroCodigo: i.centro.codigo,
      centroNome: i.centro.nome,
      // ⚠️ SEIS casas, pela régua do contrato de percentual — a tela mostra o que foi publicado.
      percentual: serializarPercentual(toPercentual(i.percentual.toFixed(6))),
    })),
  }));
}

/** Os setores ativos — o rol curto que o formulário do critério oferece como centro de custo. */
export async function centrosDeCusto(
  tx: Tx
): Promise<readonly { readonly id: string; readonly codigo: string; readonly nome: string; readonly unidade: string }[]> {
  const setores = await tx.setor.findMany({
    where: { ativo: true },
    orderBy: { codigo: "asc" },
    select: { id: true, codigo: true, nome: true, unidadeOrc: { select: { codigo: true } } },
  });
  return setores.map((s) => ({ id: s.id, codigo: s.codigo, nome: s.nome, unidade: s.unidadeOrc.codigo }));
}
