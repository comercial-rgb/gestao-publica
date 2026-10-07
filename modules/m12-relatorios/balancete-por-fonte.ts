import { toMoney, type Money } from "../../packages/contracts/index.js";
import {
  somasPorContaELancamento,
  type FiltroDeNatureza,
  type NaturezaLancamento,
} from "../m01-core-contabil/adapter-prisma.js";
import { resolverDimensoes } from "../m14-exports-federais/msc/resolver.js";
import type { Leitor } from "./livros.js";

/**
 * M12 — O BALANCETE ANALÍTICO POR FONTE DE RECURSOS.
 *
 * ═══ A FONTE NÃO ESTÁ NA PARTIDA — ESTÁ NO FATO ═══
 * A `PartidaContabil` não carrega fonte. A MSC (M14) já resolve, lançamento a lançamento, a
 * fonte do FATO que o gerou (`resolverDimensoes`). Este balancete usa as MESMAS duas peças da
 * MSC: as somas por conta e por lançamento do dono do razão (`somasPorContaELancamento`, M01)
 * e o resolver. Zero aritmética própria sobre o razão: o que muda é só o agrupamento. Um
 * resolver paralelo aqui seria uma segunda resposta para "de que fonte é este dinheiro", e o
 * dia em que divergisse a MSC enviada e o balancete impresso diriam coisas diferentes.
 *
 * ═══ O QUE NÃO TEM FONTE APARECE, COM O MOTIVO ═══
 * Três casos sem fonte, e nenhum some do relatório:
 *   SEM_FONTE ........ o fato não tem fonte por desenho (encerramento; fato patrimonial sem
 *                      dinheiro, como a depreciação).
 *   NAO_IDENTIFICADA . o fato tem fonte e o caminho não chegou nela (um lançamento manual, por
 *                      exemplo). É o mesmo NAO_RESOLVIDO que a MSC publica como pendência.
 * Somados de volta, os grupos de uma conta reconstituem a linha da conta no balancete comum
 * (identidade B1, exercida no teste). Se o balancete por fonte escondesse o que não resolveu,
 * a soma das fontes não fecharia com o balancete e ninguém saberia por quê.
 *
 * ═══ ESPECIFICAÇÃO ═══
 * O código de fonte cadastrado no ente é o de três dígitos da especificação (500, 540...); o
 * razão não distingue o indicador de exercício (corrente ou anterior). "Resumir por fonte" e
 * "resumir por especificação" são, neste cadastro, o mesmo agrupamento — e o relatório não
 * finge uma distinção que o dado não tem.
 */

export const SEM_FONTE = "SEM_FONTE";
export const FONTE_NAO_IDENTIFICADA = "NAO_IDENTIFICADA";

export interface LinhaPorFonte {
  readonly conta: string;
  /** Código da fonte, ou `SEM_FONTE` / `NAO_IDENTIFICADA`. */
  readonly fonte: string;
  readonly saldoAnteriorDevedor: string;
  readonly saldoAnteriorCredor: string;
  readonly movimentoDebito: string;
  readonly movimentoCredito: string;
  readonly saldoFinalDevedor: string;
  readonly saldoFinalCredor: string;
}

export interface BalancetePorFonte {
  readonly linhas: readonly LinhaPorFonte[];
  /** Um resumo por fonte: a soma das linhas de cada fonte (todas as contas listadas). */
  readonly resumo: readonly Omit<LinhaPorFonte, "conta">[];
  /** Quantos lançamentos do recorte caíram em `NAO_IDENTIFICADA`. */
  readonly lancamentosSemFonteIdentificada: number;
}

function colunas(liquido: Money): { devedor: Money; credor: Money } {
  return liquido.greaterThanOrEqualTo(0)
    ? { devedor: toMoney(liquido), credor: toMoney("0.00") }
    : { devedor: toMoney("0.00"), credor: toMoney(liquido.negated()) };
}

interface Acumulado {
  antes: Money;
  movD: Money;
  movC: Money;
}

const zero = (): Acumulado => ({ antes: toMoney("0.00"), movD: toMoney("0.00"), movC: toMoney("0.00") });

/**
 * O BALANCETE POR FONTE — saldo anterior, débito e crédito do período e saldo final, por conta e
 * por fonte. `contas` filtra por prefixo do código (uma ou mais); `fontes` por código (uma ou
 * mais, e aceita `SEM_FONTE` e `NAO_IDENTIFICADA`). Omitidos = tudo.
 *
 * O corte é o do balancete comum: `dataTransacao`, encerramento fora por padrão.
 */
export async function balancetePorFonte(
  leitor: Leitor,
  p: {
    readonly desde: Date;
    readonly ate: Date;
    readonly contas?: readonly string[] | undefined;
    readonly fontes?: readonly string[] | undefined;
    readonly natureza?: "NORMAL" | "TODAS";
  }
): Promise<BalancetePorFonte> {
  const natureza: FiltroDeNatureza | undefined =
    (p.natureza ?? "NORMAL") === "TODAS"
      ? undefined
      : { excluir: ["ENCERRAMENTO"] satisfies readonly NaturezaLancamento[] };
  const natArg = natureza !== undefined ? { natureza } : {};
  const antesDe = new Date(p.desde.getTime() - 1);

  const [somasAntes, somasPeriodo] = await Promise.all([
    somasPorContaELancamento(leitor, { ate: antesDe, campoData: "dataTransacao", ...natArg }),
    somasPorContaELancamento(leitor, { desde: p.desde, ate: p.ate, campoData: "dataTransacao", ...natArg }),
  ]);

  const prefixos = (p.contas ?? []).map((c) => c.trim()).filter((c) => c !== "");
  const contaEntra = (codigo: string): boolean => prefixos.length === 0 || prefixos.some((pre) => codigo.startsWith(pre));
  const antes = somasAntes.filter((s) => contaEntra(s.codigo));
  const periodo = somasPeriodo.filter((s) => contaEntra(s.codigo));

  const resolucoes = await resolverDimensoes(leitor, [...new Set([...antes, ...periodo].map((s) => s.lancamentoId))]);
  const naoIdentificados = new Set<string>();
  const fonteDe = (lancamentoId: string): string => {
    const r = resolucoes.get(lancamentoId);
    if (r === undefined || r.tipo === "NAO_RESOLVIDO") {
      naoIdentificados.add(lancamentoId);
      return FONTE_NAO_IDENTIFICADA;
    }
    if (r.tipo === "SEM_DIMENSAO_POR_DESIGN") return SEM_FONTE;
    return r.dimensoes.fonte ?? SEM_FONTE;
  };

  const filtroFontes = new Set((p.fontes ?? []).map((f) => f.trim()).filter((f) => f !== ""));
  const fonteEntra = (f: string): boolean => filtroFontes.size === 0 || filtroFontes.has(f);

  const grupos = new Map<string, Acumulado>();
  const chave = (conta: string, fonte: string): string => `${conta}\u0000${fonte}`;
  const pegar = (conta: string, fonte: string): Acumulado => {
    const k = chave(conta, fonte);
    let g = grupos.get(k);
    if (g === undefined) {
      g = zero();
      grupos.set(k, g);
    }
    return g;
  };
  for (const s of antes) {
    const f = fonteDe(s.lancamentoId);
    if (!fonteEntra(f)) continue;
    const g = pegar(s.codigo, f);
    g.antes = toMoney(g.antes.plus(s.debito).minus(s.credito));
  }
  for (const s of periodo) {
    const f = fonteDe(s.lancamentoId);
    if (!fonteEntra(f)) continue;
    const g = pegar(s.codigo, f);
    g.movD = toMoney(g.movD.plus(s.debito));
    g.movC = toMoney(g.movC.plus(s.credito));
  }

  const linhaDe = (conta: string, fonte: string, g: Acumulado): LinhaPorFonte => {
    const ca = colunas(g.antes);
    const cf = colunas(toMoney(g.antes.plus(g.movD).minus(g.movC)));
    return {
      conta,
      fonte,
      saldoAnteriorDevedor: ca.devedor.toFixed(2),
      saldoAnteriorCredor: ca.credor.toFixed(2),
      movimentoDebito: g.movD.toFixed(2),
      movimentoCredito: g.movC.toFixed(2),
      saldoFinalDevedor: cf.devedor.toFixed(2),
      saldoFinalCredor: cf.credor.toFixed(2),
    };
  };

  const ordemDaFonte = (f: string): string => (f === SEM_FONTE ? "￿1" : f === FONTE_NAO_IDENTIFICADA ? "￿2" : f);
  const linhas = [...grupos.entries()]
    .map(([k, g]) => {
      const [conta = "", fonte = ""] = k.split("\u0000");
      return linhaDe(conta, fonte, g);
    })
    .sort((a, b) => a.conta.localeCompare(b.conta) || ordemDaFonte(a.fonte).localeCompare(ordemDaFonte(b.fonte)));

  // O resumo por fonte soma as contas de cada fonte NO LÍQUIDO de cada conta: cada conta entra
  // com o saldo dela, devedor ou credor, como no balancete — a soma de duas linhas não se refaz
  // pelo líquido do grupo, senão um caixa devedor e um fornecedor credor se anulariam.
  const porFonte = new Map<string, { sad: Money; sac: Money; md: Money; mc: Money; sfd: Money; sfc: Money }>();
  for (const l of linhas) {
    const r = porFonte.get(l.fonte) ?? { sad: toMoney("0.00"), sac: toMoney("0.00"), md: toMoney("0.00"), mc: toMoney("0.00"), sfd: toMoney("0.00"), sfc: toMoney("0.00") };
    porFonte.set(l.fonte, {
      sad: toMoney(r.sad.plus(l.saldoAnteriorDevedor)),
      sac: toMoney(r.sac.plus(l.saldoAnteriorCredor)),
      md: toMoney(r.md.plus(l.movimentoDebito)),
      mc: toMoney(r.mc.plus(l.movimentoCredito)),
      sfd: toMoney(r.sfd.plus(l.saldoFinalDevedor)),
      sfc: toMoney(r.sfc.plus(l.saldoFinalCredor)),
    });
  }
  const resumo = [...porFonte.entries()]
    .sort(([a], [b]) => ordemDaFonte(a).localeCompare(ordemDaFonte(b)))
    .map(([fonte, r]) => ({
      fonte,
      saldoAnteriorDevedor: r.sad.toFixed(2),
      saldoAnteriorCredor: r.sac.toFixed(2),
      movimentoDebito: r.md.toFixed(2),
      movimentoCredito: r.mc.toFixed(2),
      saldoFinalDevedor: r.sfd.toFixed(2),
      saldoFinalCredor: r.sfc.toFixed(2),
    }));

  return { linhas, resumo, lancamentosSemFonteIdentificada: naoIdentificados.size };
}
