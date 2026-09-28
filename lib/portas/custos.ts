import { cliente, PortaSemBancoError } from "./cliente";
import { comEscritaAutenticada } from "./sessao";
import {
  centrosDeCusto,
  composicaoDoCentro,
  criteriosDeRateio,
  custoPorCentro,
} from "../../modules/m12-relatorios/custos-consultas";
import {
  apropriarCustoDaLiquidacao,
  publicarCriterioDeRateio,
} from "../../modules/m12-relatorios/custos-servico";

/**
 * PORTA — O CUSTO POR CENTRO: a régua do rateio, a apropriação e a composição (V19/C05).
 *
 * ⚠️ AS DUAS ESCRITAS PASSAM POR `comEscritaAutenticada`, cada uma com a SUA ação: publicar o
 * critério cobra `PARAMETRIZAR_RATEIO_DE_CUSTO` e apropriar cobra `APROPRIAR_CUSTO`. Não é
 * cerimônia: publicar a régua é ato normativo do ente e apropriar é ato de execução mensal — quem
 * lança não deveria poder reescrever a régua pela qual ele próprio é medido.
 *
 * ⚠️ E DINHEIRO ATRAVESSA A FRONTEIRA COMO STRING DECIMAL. Um `Decimal` cruzando para o Server
 * Component funcionaria por acidente e quebraria no dia em que a tela virasse ilha client: objeto
 * de decimal.js não é serializável.
 */

export { PortaSemBancoError };

export interface CentroParaTela {
  readonly id: string;
  readonly codigo: string;
  readonly nome: string;
  readonly unidade: string;
}

export interface CustoDoCentroParaTela {
  readonly centroId: string;
  readonly codigo: string;
  readonly nome: string;
  readonly unidadeCodigo: string;
  readonly unidadeNome: string;
  readonly total: string;
  readonly apropriacoes: number;
}

export interface CustoParaTela {
  readonly de: Date;
  readonly ate: Date;
  readonly centros: readonly CustoDoCentroParaTela[];
  readonly total: string;
}

export interface LinhaDaComposicaoParaTela {
  readonly id: string;
  readonly competencia: Date;
  readonly valorNoCentro: string;
  readonly valorApropriado: string;
  readonly motivo: string;
  readonly criterio: string | null;
  readonly criterioVersao: number | null;
  readonly criterioAto: string | null;
  readonly liquidacaoNumero: string;
  readonly liquidacaoData: Date;
  readonly liquidacaoValor: string;
  readonly empenhoNumero: string;
  readonly credor: string;
  readonly criadoPor: string;
}

export interface CriterioParaTela {
  readonly id: string;
  readonly chave: string;
  readonly versao: number;
  readonly atoRef: string;
  readonly vigenteDesde: Date;
  readonly vigente: boolean;
  readonly centroDoResiduo: string;
  readonly itens: readonly {
    readonly centroCodigo: string;
    readonly centroNome: string;
    readonly percentual: string;
  }[];
}

/** O ACUMULADO por centro na janela — a leitura de cima da tela. */
export async function lerCustoPorCentro(p: {
  readonly exercicio?: number;
  readonly de?: Date;
  readonly ate?: Date;
}): Promise<CustoParaTela> {
  const r = await custoPorCentro(cliente(), p);
  return {
    de: r.de,
    ate: r.ate,
    total: r.total.toFixed(2),
    centros: r.centros.map((c) => ({
      centroId: c.centroId,
      codigo: c.centroCodigo,
      nome: c.centroNome,
      unidadeCodigo: c.unidadeCodigo,
      unidadeNome: c.unidadeNome,
      total: c.total.toFixed(2),
      apropriacoes: c.apropriacoes,
    })),
  };
}

/** A COMPOSIÇÃO de um centro — cada parte, com a liquidação de onde veio. */
export async function lerComposicaoDoCentro(p: {
  readonly centroId: string;
  readonly exercicio?: number;
  readonly de?: Date;
  readonly ate?: Date;
}): Promise<readonly LinhaDaComposicaoParaTela[]> {
  const linhas = await composicaoDoCentro(cliente(), p);
  return linhas.map((l, i) => ({
    id: `${l.apropriacaoId}-${String(i)}`,
    competencia: l.competencia,
    valorNoCentro: l.valorNoCentro.toFixed(2),
    valorApropriado: l.valorApropriado.toFixed(2),
    motivo: l.motivo,
    criterio: l.criterio,
    criterioVersao: l.criterioVersao,
    criterioAto: l.criterioAto,
    liquidacaoNumero: l.liquidacaoNumero,
    liquidacaoData: l.liquidacaoData,
    liquidacaoValor: l.liquidacaoValor.toFixed(2),
    empenhoNumero: l.empenhoNumero,
    credor: l.credor,
    criadoPor: l.criadoPor,
  }));
}

export async function lerCriteriosDeRateio(): Promise<readonly CriterioParaTela[]> {
  const lista = await criteriosDeRateio(cliente(), {});
  return lista.map((c) => ({ ...c, itens: c.itens.map((i) => ({ ...i })) }));
}

export async function lerCentrosDeCusto(): Promise<readonly CentroParaTela[]> {
  const centros = await centrosDeCusto(cliente());
  return centros.map((c) => ({ ...c }));
}

/**
 * As liquidações que ainda têm custo a apropriar — o rol curto do formulário.
 *
 * ⚠️ NÃO É UM `select` COM TUDO O QUE FOI LIQUIDADO. A regra de interface é explícita: um `select`
 * com 500 itens ordenados por código é um formulário bonito e inútil. O recorte aqui é duplo — só
 * liquidações que NÃO são anulação (apropriar-se sobre a linha de anulação é recusado pelo serviço)
 * e só as que ainda não foram apropriadas por inteiro. A conta do que resta é a MESMA do serviço,
 * por isso ela não decide nada: o serviço reconfere e recusa.
 */
export interface LiquidacaoApropriavelParaTela {
  readonly id: string;
  readonly numero: string;
  readonly data: Date;
  readonly valor: string;
  readonly disponivel: string;
  readonly credor: string;
  readonly empenhoNumero: string;
}

export async function lerLiquidacoesApropriaveis(p: {
  readonly exercicio: number;
  readonly limite?: number;
}): Promise<readonly LiquidacaoApropriavelParaTela[]> {
  const prisma = cliente();
  const liquidacoes = await prisma.liquidacao.findMany({
    where: {
      estornoDeId: null,
      anulacaoParcialDeId: null,
      empenho: { ficha: { exercicio: p.exercicio } },
    },
    orderBy: { data: "desc" },
    take: p.limite ?? 60,
    select: {
      id: true,
      numero: true,
      data: true,
      valor: true,
      empenho: { select: { numero: true, credorCpfCnpj: true } },
      estornos: { select: { valor: true } },
      anulacoesParciais: { select: { valor: true } },
      apropriacoesDeCusto: { select: { valor: true } },
    },
  });

  const saida: LiquidacaoApropriavelParaTela[] = [];
  for (const l of liquidacoes) {
    const bruto = l.valor;
    const anulado = [...l.estornos, ...l.anulacoesParciais].reduce(
      (acc, x) => acc.plus(x.valor),
      bruto.minus(bruto)
    );
    const apropriado = l.apropriacoesDeCusto.reduce(
      (acc, x) => acc.plus(x.valor),
      bruto.minus(bruto)
    );
    const disponivel = bruto.minus(anulado).minus(apropriado);
    if (!disponivel.greaterThan(0)) continue;
    saida.push({
      id: l.id,
      numero: l.numero,
      data: l.data,
      valor: bruto.toFixed(2),
      disponivel: disponivel.toFixed(2),
      credor: l.empenho.credorCpfCnpj,
      empenhoNumero: l.empenho.numero,
    });
  }
  return saida;
}

/** PUBLICAR uma versão do critério — ESCRITA AUTENTICADA (`PARAMETRIZAR_RATEIO_DE_CUSTO`). */
export async function publicarCriterio(input: {
  readonly chave: string;
  readonly atoRef: string;
  readonly vigenteDesde: Date;
  readonly centroDoResiduoId: string;
  readonly itens: readonly { readonly centroId: string; readonly percentual: string }[];
}): Promise<{ readonly versao: number; readonly centros: number }> {
  return comEscritaAutenticada("PARAMETRIZAR_RATEIO_DE_CUSTO", async (criadoPor) => {
    const r = await publicarCriterioDeRateio(cliente(), {
      chave: input.chave,
      atoRef: input.atoRef,
      vigenteDesde: input.vigenteDesde,
      centroDoResiduoId: input.centroDoResiduoId,
      itens: input.itens.map((i) => ({ centroId: i.centroId, percentual: i.percentual })),
      criadoPor,
    });
    return { versao: r.versao, centros: r.centros };
  });
}

/** APROPRIAR o custo de uma liquidação — ESCRITA AUTENTICADA (`APROPRIAR_CUSTO`). */
export async function apropriarCusto(input: {
  readonly liquidacaoId: string;
  readonly criterioChave: string;
  readonly competencia: Date;
  readonly valor?: string;
  readonly motivo: string;
}): Promise<{ readonly valor: string; readonly centros: number }> {
  return comEscritaAutenticada("APROPRIAR_CUSTO", async (criadoPor) => {
    const r = await apropriarCustoDaLiquidacao(cliente(), {
      liquidacaoId: input.liquidacaoId,
      criterioChave: input.criterioChave,
      competencia: input.competencia,
      valor: input.valor,
      motivo: input.motivo,
      criadoPor,
    });
    return { valor: r.valor.toFixed(2), centros: r.partes.length };
  });
}
