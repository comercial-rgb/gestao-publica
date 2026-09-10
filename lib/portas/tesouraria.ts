import { cliente, PortaSemBancoError } from "./cliente";
import { comEscritaAutenticada } from "./sessao";
import { saldoDaContaBancaria } from "../../modules/m09-tesouraria/caixa";
import {
  estornarMovimentoBancario,
  registrarMovimentoBancario,
} from "../../modules/m09-tesouraria/movimentacao";
import {
  abrirConciliacao,
  conciliacoesDaConta,
  encerrarConciliacao,
  justificarPendencia,
  lerConciliacao,
  registrarPendenciaManual,
  type ConciliacaoDoPeriodo,
} from "../../modules/m09-tesouraria/servico-conciliacao";
import {
  criarLoteDePagamento,
  fecharLote,
  gerarBordero,
  incluirNoLote,
  processarRetornoBancario,
} from "../../modules/m09-tesouraria/servico-lote";
import { estadoDoLote } from "../../modules/m09-tesouraria/lote";
// ⚠️ REEXPORTADO para a tela poder DISTINGUIR "conta sem mapeamento contábil" de um erro
// qualquer. Sem isso a página devolvia 500 — e um 500 esconde a única coisa que o
// operador precisava ler: qual conta parametrizar.
import { MapeamentoContabilAusenteError } from "../../modules/m09-tesouraria/conciliacao";
import { diaCivil, diaCivilBr } from "../../packages/datas/index";

/**
 * PORTA — A TESOURARIA PELA TELA (ENT03a, item 3).
 *
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI. A porta traduz o que a tela sabe (strings de
 * formulário) no que o domínio pede, e devolve o erro do domínio **como ele veio**. Saldo
 * por fonte, rol de fontes, ordem cronológica, período aberto — tudo isso é decidido
 * dentro da transação, pelo módulo, e as mensagens de lá são melhores do que qualquer
 * paráfrase inventada aqui.
 *
 * ⚠️ E AS DATAS CHEGAM COMO DIA CIVIL (`YYYY-MM-DD`), nunca como `Date` montado na tela.
 * Ver `docs/adr/ADR-data-civil-do-ente.md`: um `new Date("2026-06-30")` é meia-noite UTC,
 * que no horário do ente ainda é **29/06 às 21:00**. A conversão para instante acontece
 * num lugar só, e é o `packages/datas` que a faz.
 */

export { PortaSemBancoError, MapeamentoContabilAusenteError };

// ═══════════════════════════════════════════════════════════════════════════
// AS CONTAS E O SALDO POR FONTE
// ═══════════════════════════════════════════════════════════════════════════

export interface FonteDaConta {
  readonly id: string;
  readonly codigo: string;
  readonly descricao: string;
}

export interface ContaDaTela {
  readonly id: string;
  readonly codigo: string;
  readonly descricao: string;
  readonly contaContabil: string | null;
  /** O rol de fontes que ESTA conta comporta (TR 5.10.2.6). */
  readonly fontes: readonly FonteDaConta[];
  readonly saldo: string;
  /** O saldo quebrado por fonte — ver a nota abaixo sobre o que não é atribuível. */
  readonly porFonte: readonly { readonly codigo: string; readonly saldo: string }[];
}

/**
 * ⚠️ O SALDO POR FONTE É PARCIAL, E A TELA TEM DE DIZER ISSO.
 *
 * Nem todo fato que move a conta declara a fonte: o `MovimentoExtraorcamentario` (M07)
 * tem conta bancária e **não tem fonte** no modelo. Atribuí-lo à fonte padrão da conta
 * seria inventar — e inventar justamente no número que prova que recurso vinculado não
 * custeou outra coisa.
 *
 * Por isso o que não é atribuível aparece como `(sem fonte declarada)`, e a soma das
 * fontes com esse balde bate com o saldo total. Pendência `M07-FONTE-NO-MOVIMENTO`.
 */
const SEM_FONTE = "(sem fonte declarada)";

export async function contasComSaldo(ate: string): Promise<readonly ContaDaTela[]> {
  const prisma = cliente();
  const corte = new Date(`${ate}T23:59:59.999Z`);

  const contas = await prisma.contaBancaria.findMany({
    orderBy: { codigo: "asc" },
    select: {
      id: true,
      codigo: true,
      descricao: true,
      fonteId: true,
      fonte: { select: { id: true, codigo: true, descricao: true } },
      contaContabil: { select: { codigo: true } },
      fontesPermitidas: {
        select: { fonte: { select: { id: true, codigo: true, descricao: true } } },
        orderBy: { fonte: { codigo: "asc" } },
      },
    },
  });

  const saida: ContaDaTela[] = [];
  for (const c of contas) {
    const s = await saldoDaContaBancaria(prisma, c.id, corte);

    // Os movimentos bancários do período, com a fonte que cada um declarou.
    const movimentos = await prisma.movimentoBancario.findMany({
      where: { contaBancariaId: c.id, data: { lte: corte }, estornoDeId: null, estornos: { none: {} } },
      select: { valor: true, tipo: true, fonte: { select: { codigo: true } } },
    });

    const porFonte = new Map<string, number>();
    for (const m of movimentos) {
      const sinal = ["DEPOSITO", "RESGATE", "RENDIMENTO"].includes(m.tipo) ? 1 : -1;
      const atual = porFonte.get(m.fonte.codigo) ?? 0;
      porFonte.set(m.fonte.codigo, atual + sinal * Number(m.valor.toFixed(2)));
    }

    // O que sobra do saldo total e não é movimento bancário não tem fonte declarada.
    const somaDasFontes = [...porFonte.values()].reduce((a, b) => a + b, 0);
    const resto = Number(s.saldo.toFixed(2)) - somaDasFontes;
    if (Math.abs(resto) >= 0.005) porFonte.set(SEM_FONTE, resto);

    saida.push({
      id: c.id,
      codigo: c.codigo,
      descricao: c.descricao,
      contaContabil: c.contaContabil?.codigo ?? null,
      fontes:
        c.fontesPermitidas.length > 0
          ? c.fontesPermitidas.map((f) => f.fonte)
          : [c.fonte],
      saldo: s.saldo.toFixed(2),
      porFonte: [...porFonte.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([codigo, v]) => ({ codigo, saldo: v.toFixed(2) })),
    });
  }
  return saida;
}

export interface MovimentoDaTela {
  readonly id: string;
  readonly tipo: string;
  readonly valor: string;
  readonly data: string;
  readonly historico: string;
  readonly contaCodigo: string;
  readonly fonteCodigo: string;
  readonly estornado: boolean;
  readonly ehEstorno: boolean;
  readonly criadoPor: string;
}

export async function movimentosBancarios(
  contaBancariaId: string
): Promise<readonly MovimentoDaTela[]> {
  const linhas = await cliente().movimentoBancario.findMany({
    where: { contaBancariaId },
    orderBy: [{ data: "desc" }, { criadoEm: "desc" }],
    take: 200,
    select: {
      id: true,
      tipo: true,
      valor: true,
      data: true,
      historico: true,
      criadoPor: true,
      estornoDeId: true,
      estornos: { select: { id: true } },
      contaBancaria: { select: { codigo: true } },
      fonte: { select: { codigo: true } },
    },
  });
  return linhas.map((m) => ({
    id: m.id,
    tipo: m.tipo,
    valor: m.valor.toFixed(2),
    data: diaCivilBr(m.data),
    historico: m.historico,
    contaCodigo: m.contaBancaria.codigo,
    fonteCodigo: m.fonte.codigo,
    estornado: m.estornos.length > 0,
    ehEstorno: m.estornoDeId !== null,
    criadoPor: m.criadoPor,
  }));
}

/** As contas contábeis analíticas, para escolher a contrapartida. */
export async function contasContabeisAnaliticas(): Promise<
  readonly { readonly id: string; readonly codigo: string; readonly nome: string }[]
> {
  return cliente().contaPcasp.findMany({
    where: { analitica: true },
    orderBy: { codigo: "asc" },
    select: { id: true, codigo: true, nome: true },
  });
}

export interface RegistrarMovimentoDaTela {
  readonly contaBancariaId: string;
  readonly fonteId: string;
  readonly tipo: "DEPOSITO" | "SAQUE" | "APLICACAO" | "RESGATE" | "RENDIMENTO" | "TARIFA";
  readonly valor: string;
  /** Dia civil `YYYY-MM-DD` — ver o cabeçalho. */
  readonly dia: string;
  readonly historico: string;
  readonly contaContrapartidaId: string;
}

export async function registrarMovimento(
  input: RegistrarMovimentoDaTela
): Promise<string> {
  return comEscritaAutenticada("REGISTRAR_MOVIMENTO_BANCARIO", async (criadoPor) => {
    const r = await registrarMovimentoBancario(cliente(), {
      contaBancariaId: input.contaBancariaId,
      fonteId: input.fonteId,
      tipo: input.tipo,
      valor: input.valor,
      // ⚠️ MEIO-DIA no dia civil informado. A data do fato é um DIA; o instante é só o
      // ancoradouro. O meio-dia mantém o dia civil estável em qualquer fuso do país.
      data: new Date(`${input.dia}T12:00:00Z`),
      historico: input.historico,
      contaContrapartidaId: input.contaContrapartidaId,
      criadoPor,
    });
    return r.movimentoId;
  });
}

export async function estornarMovimento(
  movimentoId: string,
  motivo: string,
  dia: string
): Promise<string> {
  return comEscritaAutenticada("ESTORNAR_MOVIMENTO_BANCARIO", async (criadoPor) => {
    const r = await estornarMovimentoBancario(cliente(), {
      movimentoId,
      motivo,
      data: new Date(`${dia}T12:00:00Z`),
      criadoPor,
    });
    return r.movimentoId;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// A CONCILIAÇÃO POR PERÍODO
// ═══════════════════════════════════════════════════════════════════════════

export type { ConciliacaoDoPeriodo };

export async function listarConciliacoes(
  contaBancariaId: string
): Promise<
  readonly {
    readonly id: string;
    readonly rotulo: string;
    readonly estado: string;
    readonly encerradaPor: string | null;
  }[]
> {
  return conciliacoesDaConta(cliente(), contaBancariaId);
}

export async function verConciliacao(id: string): Promise<ConciliacaoDoPeriodo> {
  return lerConciliacao(cliente(), id);
}

export async function abrirPeriodo(
  contaBancariaId: string,
  diaInicio: string,
  diaFim: string
): Promise<string> {
  return comEscritaAutenticada("ABRIR_CONCILIACAO", async (criadoPor) => {
    const r = await abrirConciliacao(cliente(), {
      contaBancariaId,
      diaInicio,
      diaFim,
      criadoPor,
    });
    return r.conciliacaoId;
  });
}

export async function encerrarPeriodo(conciliacaoId: string): Promise<string> {
  return comEscritaAutenticada("ENCERRAR_CONCILIACAO", async (criadoPor) => {
    const r = await encerrarConciliacao(cliente(), { conciliacaoId, criadoPor });
    return r.rotulo;
  });
}

export async function incluirPendenciaManual(input: {
  readonly conciliacaoId: string;
  readonly descricao: string;
  readonly motivo: string;
  readonly valor: string;
  readonly natureza: "CREDITO" | "DEBITO";
}): Promise<string> {
  return comEscritaAutenticada("REGISTRAR_PENDENCIA_MANUAL", async (criadoPor) => {
    const r = await registrarPendenciaManual(cliente(), { ...input, criadoPor });
    return r.pendenciaId;
  });
}

export async function justificar(input: {
  readonly conciliacaoId: string;
  readonly lado: string;
  readonly referencia: string;
  readonly motivo: string;
}): Promise<string> {
  return comEscritaAutenticada("JUSTIFICAR_PENDENCIA", async (criadoPor) => {
    const r = await justificarPendencia(cliente(), { ...input, criadoPor });
    return r.justificativaId;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// O LOTE, O BORDERÔ E O RETORNO
// ═══════════════════════════════════════════════════════════════════════════

export interface LoteDaTela {
  readonly id: string;
  readonly numero: number;
  readonly estado: string;
  readonly contaCodigo: string;
  readonly vencimento: string;
  readonly itens: number;
  readonly total: string;
  readonly borderoId: string | null;
  readonly borderoAssinado: boolean;
}

export async function lotes(): Promise<readonly LoteDaTela[]> {
  const linhas = await cliente().loteDePagamento.findMany({
    orderBy: { numero: "desc" },
    take: 100,
    select: {
      id: true,
      numero: true,
      dataVencimento: true,
      contaBancaria: { select: { codigo: true } },
      movimentos: { select: { tipo: true, criadoEm: true } },
      itens: {
        select: {
          ordem: { select: { valor: true } },
          movimentoExtra: { select: { valor: true } },
        },
      },
      borderos: {
        select: {
          id: true,
          filaAssinatura: {
            select: { signatarios: { select: { assinatura: { select: { id: true } } } } },
          },
        },
      },
    },
  });

  return linhas.map((l) => {
    const total = l.itens.reduce(
      (acc, i) => acc + Number((i.ordem?.valor ?? i.movimentoExtra?.valor ?? 0).toString()),
      0
    );
    const b = l.borderos[0];
    const sig = b?.filaAssinatura?.signatarios ?? [];
    return {
      id: l.id,
      numero: l.numero,
      estado: estadoDoLote(l.movimentos),
      contaCodigo: l.contaBancaria.codigo,
      vencimento: diaCivilBr(l.dataVencimento),
      itens: l.itens.length,
      total: total.toFixed(2),
      borderoId: b?.id ?? null,
      // ⚠️ `length > 0 &&` — `[].every(...)` é `true` em JavaScript, e uma fila VAZIA
      // passaria por "todas as assinaturas colhidas". É a mesma armadilha que o
      // `estadoDasAssinaturas` do domínio fecha.
      borderoAssinado: sig.length > 0 && sig.every((s) => s.assinatura !== null),
    };
  });
}

export interface OrdemParaLote {
  readonly id: string;
  readonly numero: string;
  readonly valor: string;
  readonly credor: string;
  readonly contaBancaria: string;
}

/** As ordens AUTORIZADAS que ainda não entraram em lote nenhum. */
export async function ordensDisponiveisParaLote(): Promise<readonly OrdemParaLote[]> {
  const linhas = await cliente().ordemDePagamento.findMany({
    where: { itemDeLote: null },
    orderBy: { numero: "asc" },
    select: {
      id: true,
      numero: true,
      valor: true,
      contaBancaria: true,
      movimentos: { select: { tipo: true } },
      liquidacao: { select: { empenho: { select: { credorCpfCnpj: true } } } },
    },
  });
  return linhas
    .filter((o) => o.movimentos.some((m) => m.tipo === "AUTORIZACAO"))
    .map((o) => ({
      id: o.id,
      numero: o.numero,
      valor: o.valor.toFixed(2),
      credor: o.liquidacao.empenho.credorCpfCnpj,
      contaBancaria: o.contaBancaria,
    }));
}

export async function criarLote(input: {
  readonly exercicio: number;
  readonly contaBancariaId: string;
  readonly diaVencimento: string;
  readonly descricao: string;
}): Promise<number> {
  return comEscritaAutenticada("CRIAR_LOTE_PAGAMENTO", async (criadoPor) => {
    const r = await criarLoteDePagamento(cliente(), {
      exercicio: input.exercicio,
      contaBancariaId: input.contaBancariaId,
      descricao: input.descricao,
      dataVencimento: new Date(`${input.diaVencimento}T12:00:00Z`),
      criadoPor,
    });
    return r.numero;
  });
}

export async function incluirOrdemNoLote(loteId: string, ordemId: string): Promise<void> {
  await comEscritaAutenticada("INCLUIR_NO_LOTE", async (criadoPor) => {
    await incluirNoLote(cliente(), { loteId, ordemId, criadoPor });
  });
}

export async function fechar(loteId: string): Promise<void> {
  await comEscritaAutenticada("FECHAR_LOTE", async (criadoPor) => {
    await fecharLote(cliente(), { loteId, criadoPor });
  });
}

export async function gerarBorderoDoLote(
  loteId: string,
  signatarios: readonly string[]
): Promise<{ readonly borderoId: string; readonly hash: string }> {
  return comEscritaAutenticada("GERAR_BORDERO", async (criadoPor) => {
    const r = await gerarBordero(cliente(), {
      loteId,
      signatarios: [...signatarios],
      modo: "AVANCADA",
      criadoPor,
    });
    return { borderoId: r.borderoId, hash: r.hash };
  });
}

export interface ItemDoBorderoDaTela {
  readonly id: string;
  readonly descricao: string;
  readonly valor: string;
  readonly baixado: boolean;
}

export async function itensDoBordero(
  borderoId: string
): Promise<readonly ItemDoBorderoDaTela[]> {
  const b = await cliente().bordero.findUnique({
    where: { id: borderoId },
    select: {
      lote: {
        select: {
          itens: {
            select: {
              id: true,
              ordem: { select: { numero: true, valor: true } },
              movimentoExtra: { select: { valor: true, credorConsignatario: true } },
              baixa: { select: { id: true } },
            },
          },
        },
      },
    },
  });
  return (b?.lote.itens ?? []).map((i) => ({
    id: i.id,
    descricao:
      i.ordem?.numero ?? `Nota extra — ${i.movimentoExtra?.credorConsignatario ?? "?"}`,
    valor: (i.ordem?.valor ?? i.movimentoExtra?.valor ?? 0).toString(),
    baixado: i.baixa !== null,
  }));
}

export async function registrarRetorno(
  borderoId: string,
  linhas: readonly {
    readonly itemId: string;
    readonly pagoEm: string;
    readonly identificadorBanco: string;
  }[]
): Promise<number> {
  return comEscritaAutenticada("PROCESSAR_RETORNO_BANCARIO", async (criadoPor) => {
    const r = await processarRetornoBancario(cliente(), {
      borderoId,
      linhas: linhas.map((l) => ({
        itemId: l.itemId,
        dataLiquidacaoBanco: new Date(`${l.pagoEm}T12:00:00Z`),
        identificadorBanco: l.identificadorBanco,
      })),
      criadoPor,
    });
    return r.baixados;
  });
}

/** Reexportado para a tela mostrar a data como o ente a lê. */
export { diaCivil, diaCivilBr };
