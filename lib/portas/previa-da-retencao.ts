import { cliente } from "./cliente";
import { autorizarLeituraDoRegistroPara, exigirLeituraEmAlgumEscopo } from "./leitura";
import { comEscritaAutenticada } from "./sessao";
import { diaCivil, diaCivilBr, instanteCivilBr } from "../../packages/datas/index";
import { Decimal, toMoney } from "../../packages/contracts/index.js";
import { liquidoDoFato, somaLiquidaEstornaveis } from "../../packages/estornaveis/index.js";
import { registrarPreviaDeRetencao } from "../../modules/m07-extraorcamentario/previa-da-retencao";
import type { DadosFiscaisDaOperacao } from "../../modules/m07-extraorcamentario/retencao-calculada";

/**
 * V39-R3 (R3-014) — A TELA DA PRÉVIA DAS RETENÇÕES NA LIQUIDAÇÃO: a liquidação, as prévias guardadas (versões, com a
 * memória por tributo) e o formulário para guardar uma nova. Leitura sob CONSULTAR_DESPESA; guardar cobra LIQUIDAR na
 * unidade da liquidação (no serviço).
 */

export interface TelaDaPrevia {
  readonly id: string;
  readonly numero: string;
  readonly empenho: string;
  readonly empenhoId: string;
  readonly credor: string;
  readonly valor: string;
  readonly saldoAPagar: string;
  readonly anulada: boolean;
  readonly previas: readonly {
    readonly versao: number;
    readonly dataPrevista: string;
    readonly valorPrevisto: string;
    readonly totalPrevisto: string;
    readonly por: string;
    readonly em: string;
    readonly linhas: readonly { readonly tributo: string; readonly resultado: string; readonly base: string | null; readonly aliquota: string | null; readonly valor: string | null; readonly explicacao: string }[];
  }[];
  readonly podeGuardar: boolean;
  readonly hoje: string;
}

interface LinhaGuardada { readonly tributo: string; readonly resultado: string; readonly base: string | null; readonly aliquota: string | null; readonly valor: string | null; readonly explicacao: string }
const SITUACAO: Readonly<Record<string, string>> = { RETIDO: "Retido", NAO_RETIDO: "Não retido", INFORMADO: "Informado", NAO_CALCULAVEL: "Sem cálculo" };
/** A alíquota guardada como fração ("0.015") em porcentagem ("1,5%"), sem passar por number. */
const pct = (s: string): string => `${new Decimal(s).times(100).toDecimalPlaces(4).toString().replace(".", ",")}%`;

export async function lerTelaDaPrevia(liquidacaoId: string): Promise<TelaDaPrevia | null> {
  // A leitura é a da DESPESA na unidade da liquidação (o mesmo desenho do dossiê e dos documentos do pagamento).
  const sessao = await exigirLeituraEmAlgumEscopo("CONSULTAR_DESPESA");
  const l = await cliente().liquidacao.findUnique({
    where: { id: liquidacaoId },
    select: {
      id: true, numero: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true, estornos: { select: { id: true, valor: true, estornoDeId: true } },
      anulacoesParciais: { select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true, estornos: { select: { id: true, valor: true, estornoDeId: true } } } },
      empenho: { select: { id: true, numero: true, credorCpfCnpj: true, ficha: { select: { unidadeOrc: { select: { id: true, codigo: true } } } } } },
      pagamentos: { select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true } },
      previasDeRetencao: { orderBy: { versao: "desc" }, select: { versao: true, dataPrevista: true, valorPrevisto: true, totalPrevisto: true, memoria: true, criadoPor: true, criadoEm: true } },
    },
  });
  if (l === null) return null;
  const unidade = l.empenho.ficha.unidadeOrc;
  await autorizarLeituraDoRegistroPara(sessao, "CONSULTAR_DESPESA", unidade.codigo);
  // O líquido da liquidação (descontadas as parciais vivas) menos os pagamentos vivos — a mesma régua de packages/estornaveis.
  const m = (v: { toFixed(n: number): string }) => toMoney(v.toFixed(2));
  const daLiquidacao = [
    { id: l.id, valor: m(l.valor), estornoDeId: l.estornoDeId, anulacaoParcialDeId: l.anulacaoParcialDeId },
    ...l.estornos.map((e) => ({ id: e.id, valor: m(e.valor), estornoDeId: e.estornoDeId })),
    ...l.anulacoesParciais.flatMap((p) => [
      { id: p.id, valor: m(p.valor), estornoDeId: p.estornoDeId, anulacaoParcialDeId: p.anulacaoParcialDeId },
      ...p.estornos.map((e) => ({ id: e.id, valor: m(e.valor), estornoDeId: e.estornoDeId })),
    ]),
  ];
  const pago = somaLiquidaEstornaveis(l.pagamentos.map((p) => ({ id: p.id, valor: m(p.valor), estornoDeId: p.estornoDeId, anulacaoParcialDeId: p.anulacaoParcialDeId })));
  const saldo = toMoney(liquidoDoFato(l.id, daLiquidacao).minus(pago));
  // O formulário aparece para quem liquida no ente inteiro ou NESTA unidade; quem decide, no fim, é o serviço.
  const podeGuardar = (await cliente().permissaoDePerfil.count({
    where: { acao: "LIQUIDAR", OR: [{ unidadeOrcId: null }, { unidadeOrcId: unidade.id }], perfil: { vinculos: { some: { usuario: { identificador: sessao.identificador, ativo: true } } } } },
  })) > 0;
  return {
    id: l.id, numero: l.numero, empenho: l.empenho.numero, empenhoId: l.empenho.id, credor: l.empenho.credorCpfCnpj,
    valor: l.valor.toFixed(2), saldoAPagar: saldo.toFixed(2), anulada: l.estornoDeId !== null || l.estornos.length > 0,
    previas: l.previasDeRetencao.map((p) => ({
      versao: p.versao, dataPrevista: diaCivilBr(p.dataPrevista), valorPrevisto: p.valorPrevisto.toFixed(2), totalPrevisto: p.totalPrevisto.toFixed(2),
      por: p.criadoPor, em: instanteCivilBr(p.criadoEm),
      linhas: (p.memoria as unknown as readonly LinhaGuardada[]).map((x) => ({ ...x, resultado: SITUACAO[x.resultado] ?? x.resultado, aliquota: x.aliquota === null ? null : pct(x.aliquota) })),
    })),
    podeGuardar,
    hoje: diaCivil(new Date()),
  };
}

export async function registrarPreviaPelaTela(input: { readonly liquidacaoId: string; readonly valorPrevisto: string; readonly dataPrevista: string; readonly operacao: DadosFiscaisDaOperacao }): Promise<string> {
  const r = await comEscritaAutenticada("LIQUIDAR", (criadoPor) => registrarPreviaDeRetencao(cliente(), { ...input, criadoPor }));
  return `Prévia versão ${String(r.versao)} guardada na liquidação: retenção prevista de R$ ${r.totalPrevisto.replace(".", ",")}. É previsão: nada foi lançado; o pagamento recalcula com o valor e a data dele.`;
}
