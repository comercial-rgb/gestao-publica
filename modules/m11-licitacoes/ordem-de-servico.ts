import { createHash } from "node:crypto";
import { z } from "zod";
import { Decimal, sumMoney, toMoney } from "../../packages/contracts/index.js";
import { anoCivil, diaCivil, diaCivilBr, fimDoDiaCivil, inicioDoDiaCivil } from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { nomeDoEnteNosDocumentos } from "../m16-travamento/apresentacao-do-ente.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { designacaoVigenteEm } from "../m33-folha/certificacao.js";
import { contratoTravado, exigirContratoVigente, exigirDesignacao } from "./fiscalizacao.js";
import { periodosSeSobrepoem } from "./medicoes.js";
import { conferenciaDoPeriodoPorItens } from "./regime-de-medicao.js";
import { historicosDosItens, novoPrecoDentroDoPeriodo, quantidadeParaComprometerDesde, versaoNoDia } from "./versoes-dos-itens.js";

/**
 * ═══ M11 — A ORDEM DE SERVIÇO DO CONTRATO, A MEDIÇÃO DA ORDEM E OS RECEBIMENTOS POR PARCELA (V7 M2 U1/U2) ═══
 *
 * O CAMINHO, e cada passo é um FATO com autor, designação usada e data:
 *   o GESTOR designado cria o rascunho da ordem com itens do contrato → EMITE (o saldo dos itens se compromete; o
 *   espelho é o manifesto com sha256) → o FISCAL mede por itens da ordem → o FISCAL recebe PROVISORIAMENTE, conferindo
 *   cada item (conforme e em controvérsia, art. 140, I, a) → o RECEBEDOR designado decide a controvérsia e recebe
 *   DEFINITIVAMENTE o que é elegível (art. 140, I, b). A liquidação é outro ato (U3), pelo M05.
 *
 * ⚠️ O QUE CADA ATO NÃO FAZ. Emitir não reserva, não empenha, não atesta, não paga. Medir não recebe. Receber
 * provisoriamente não aceita. Aceitar uma controvérsia não recebe. Receber definitivamente não liquida. Resolver
 * ocorrência não faz nenhum destes.
 *
 * ⚠️ O SALDO É DERIVADO, E ELE É A IDENTIDADE DA PARCELA:
 *   · por item do CONTRATO: contratado − Σ autorizado nas ordens emitidas (quantidade − cancelado) − Σ medido pela
 *     medição por itens sem ordem (M2.1). Duas ordens simultâneas sobre o mesmo item: o trinco do contrato serializa;
 *   · por item da ORDEM: autorizado − Σ medido. Repetir a mesma parcela com outra chave esgota o autorizado;
 *   · por item MEDIDO: elegível ao definitivo = conforme + controvérsia ACEITA − Σ recebido definitivamente.
 * Quantidades de unidades diferentes nunca se somam; valores (quantidade × unitário da ordem, centavos por item) sim.
 *
 * ⚠️ VIGÊNCIA: NOVA execução (emitir, período medido) exige o contrato vigente na data; o tratamento do que foi
 * executado regularmente durante a vigência (receber, decidir) não exige o contrato vigente HOJE — exige a designação
 * vigente hoje de quem pratica o ato (o sucessor designado trata o que o antecessor deixou).
 *
 * ⚠️ PRAZOS: nenhum prazo de recebimento é cravado aqui (art. 140, § 3º: regulamento ou contrato). As condições de
 * recebimento da ordem são texto do ente, impresso no espelho e nos termos.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

const zDia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A data é um DIA civil AAAA-MM-DD.");
const zQuantidade = z.string().trim().regex(/^\d+(\.\d{1,4})?$/, "Quantidade com até 4 casas, ponto decimal.");
const zQuantidadeOuZero = zQuantidade;
const hoje = (): string => diaCivil(new Date());
const br = (dia: string): string => dia.split("-").reverse().join("/");
const q4 = (d: Decimal.Value): string => new Decimal(d).toFixed(4);

/** O manifesto canônico (chaves ordenadas, recursivamente) e o sha256 do JSON — a identidade do termo. */
export function manifestoCanonico(valor: unknown): { readonly manifesto: unknown; readonly sha256: string } {
  const ordenar = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(ordenar);
    if (v !== null && typeof v === "object") return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, ordenar((v as Record<string, unknown>)[k])]));
    return v;
  };
  const manifesto = ordenar(valor);
  return { manifesto, sha256: createHash("sha256").update(JSON.stringify(manifesto), "utf8").digest("hex") };
}

export async function nomeEAto(tx: Tx, designacaoId: string): Promise<{ readonly nome: string; readonly ato: string; readonly usuario: string }> {
  const d = await tx.designacaoNoContrato.findUniqueOrThrow({ where: { id: designacaoId }, select: { atoDesignacao: true, usuario: { select: { identificador: true } }, pessoa: { select: { documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } } } });
  return { nome: d.pessoa.versoes[0]?.nome ?? d.pessoa.documento, ato: d.atoDesignacao, usuario: d.usuario.identificador };
}

/** A quantidade já comprometida de cada item do contrato: autorizada em ordens emitidas e medida sem ordem. */
export async function comprometidoPorItemDoContrato(tx: Tx, contratoId: string, excetoOrdemId: string | null): Promise<Map<string, Decimal>> {
  const [itensDeOrdens, medidosSemOrdem] = await Promise.all([
    tx.itemDaOrdemDeServico.findMany({
      where: { ordem: { contratoId, emissao: { isNot: null }, ...(excetoOrdemId === null ? {} : { id: { not: excetoOrdemId } }) } },
      select: { itemDoContratoId: true, quantidade: true, cancelamentos: { select: { quantidade: true } } },
    }),
    tx.itemDoContrato.findMany({ where: { contratoId }, select: { id: true, medidos: { select: { quantidade: true } } } }),
  ]);
  const m = new Map<string, Decimal>();
  const somar = (id: string, v: Decimal): void => void m.set(id, (m.get(id) ?? new Decimal(0)).plus(v));
  for (const i of itensDeOrdens) somar(i.itemDoContratoId, new Decimal(i.quantidade.toFixed(4)).minus(i.cancelamentos.reduce((t, c) => t.plus(c.quantidade.toFixed(4)), new Decimal(0))));
  for (const i of medidosSemOrdem) somar(i.id, i.medidos.reduce((t, x) => t.plus(x.quantidade.toFixed(4)), new Decimal(0)));
  return m;
}

// ═══════════════════════════════════════════════════════════════════════════════
// U1 — A ORDEM DE SERVIÇO
// ═══════════════════════════════════════════════════════════════════════════════

export const zCriarRascunhoDeOrdemDeServico = z
  .object({
    contratoId: z.string().min(1),
    finalidade: z.string().trim().min(5),
    local: z.string().trim().min(1).optional(),
    unidadeSolicitante: z.string().trim().min(1).optional(),
    inicioPrevisto: zDia,
    fimPrevisto: zDia,
    condicoesDeRecebimento: z.string().trim().min(5, "Diga o que o recebimento vai exigir (documentos, verificações)."),
    fiscalDesignacaoId: z.string().min(1),
    empenhoId: z.string().min(1).optional(),
    // ⚠️ ESTRITO: o item traz SÓ o item do contrato e a quantidade. Unitário, unidade e fornecedor saem do contrato;
    // um campo a mais (preço, fornecedor) é recusado, mesmo que a tela o esconda (OS02).
    itens: z.array(z.object({ itemDoContratoId: z.string().min(1), quantidade: zQuantidade }).strict()).min(1),
    criadoPor: z.string().min(1),
  })
  .strict();
export type CriarRascunhoDeOrdemDeServicoInput = z.input<typeof zCriarRascunhoDeOrdemDeServico>;

/** O RASCUNHO — não compromete saldo. O número é do contrato, sob o trinco. */
export async function criarRascunhoDeOrdemDeServico(prisma: PrismaClient, input: CriarRascunhoDeOrdemDeServicoInput): Promise<{ readonly ordemId: string; readonly numero: number; readonly ano: number; readonly valor: string }> {
  const d = zCriarRascunhoDeOrdemDeServico.parse(input);
  if (d.fimPrevisto < d.inicioPrevisto) throw new Error("PERIODO-INVERTIDO: o fim previsto é anterior ao início. Nada foi gravado.");
  const ids = d.itens.map((i) => i.itemDoContratoId);
  if (new Set(ids).size !== ids.length) throw new Error("ITEM-REPETIDO: cada item do contrato entra uma vez na ordem. Nada foi gravado.");
  if (d.itens.some((i) => new Decimal(i.quantidade).lte(0))) throw new Error("QUANTIDADE-INVALIDA: a quantidade da ordem precisa ser maior que zero. Nada foi gravado.");
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.criarRascunhoDeOrdemDeServico, "ENTE");
    const c = await contratoTravado(tx, d.contratoId);
    const gestor = await exigirDesignacao(tx, c, d.criadoPor, "GESTOR", hoje());
    const fiscal = await tx.designacaoNoContrato.findUnique({ where: { id: d.fiscalDesignacaoId }, select: { contratoId: true, papel: true, vigenciaInicio: true, vigenciaFim: true, revogacao: { select: { dataEfeito: true } } } });
    if (fiscal === null || fiscal.contratoId !== c.id || fiscal.papel !== "FISCAL" || !designacaoVigenteEm(fiscal, new Date())) {
      throw new Error(`FISCAL-DA-ORDEM-INVALIDO: a designação indicada não é de FISCAL vigente hoje no contrato ${c.numeroContrato}. Nada foi gravado.`);
    }
    if (d.empenhoId !== undefined) {
      const e = await tx.empenho.findUnique({ where: { id: d.empenhoId }, select: { numero: true, contratoId: true, estornoDeId: true, estornos: { select: { id: true } } } });
      if (e === null || e.contratoId !== c.id) throw new Error(`EMPENHO-DE-OUTRO-CONTRATO: o empenho indicado não informou o contrato ${c.numeroContrato}. Nada foi gravado.`);
      if (e.estornoDeId !== null || e.estornos.length > 0) throw new Error(`EMPENHO-ANULADO: o empenho ${e.numero} está anulado (ou é uma anulação) e não suporta a ordem. Nada foi gravado.`);
    }
    const itens = await tx.itemDoContrato.findMany({ where: { id: { in: ids } }, select: { id: true, contratoId: true, numero: true } });
    // V7 M2 U5 — o unitário é o da versão do item vigente no início previsto (aditivo por itens), nunca o original às cegas.
    const historicos = await historicosDosItens(tx, { ids });
    for (const pedido of d.itens) {
      const item = itens.find((i) => i.id === pedido.itemDoContratoId);
      if (item === undefined || item.contratoId !== c.id) throw new Error(`ITEM-DE-OUTRO-CONTRATO: o item ${pedido.itemDoContratoId} não é do contrato ${c.numeroContrato}. Nada foi gravado.`);
    }
    const ultima = await tx.ordemDeServicoDoContrato.findFirst({ where: { contratoId: c.id }, orderBy: { numero: "desc" }, select: { numero: true } });
    const numero = (ultima?.numero ?? 0) + 1;
    const ano = anoCivil(new Date());
    const linhas = d.itens.map((p) => {
      const item = itens.find((i) => i.id === p.itemDoContratoId)!;
      const unit = versaoNoDia(historicos.get(item.id)!, d.inicioPrevisto).valorUnitario;
      return { itemDoContratoId: item.id, quantidade: p.quantidade, valorUnitario: unit.toFixed(4), valor: toMoney(new Decimal(p.quantidade).times(unit)) };
    });
    const r = await tx.ordemDeServicoDoContrato.create({
      data: {
        contratoId: c.id, numero, ano, finalidade: d.finalidade, local: d.local ?? null, unidadeSolicitante: d.unidadeSolicitante ?? null,
        inicioPrevisto: inicioDoDiaCivil(d.inicioPrevisto), fimPrevisto: inicioDoDiaCivil(d.fimPrevisto), condicoesDeRecebimento: d.condicoesDeRecebimento,
        gestorDesignacaoId: gestor.id, fiscalDesignacaoId: d.fiscalDesignacaoId, empenhoId: d.empenhoId ?? null, criadoPor: d.criadoPor,
        itens: { create: linhas.map((l) => ({ itemDoContratoId: l.itemDoContratoId, quantidade: l.quantidade, valorUnitario: l.valorUnitario, criadoPor: d.criadoPor })) },
      },
      select: { id: true },
    });
    return { ordemId: r.id, numero, ano, valor: sumMoney(linhas.map((l) => l.valor)).toFixed(2) };
  });
}

export const zEmitirOrdemDeServico = z.object({ ordemId: z.string().min(1), inicioAutorizado: zDia, criadoPor: z.string().min(1) }).strict();
export type EmitirOrdemDeServicoInput = z.input<typeof zEmitirOrdemDeServico>;

/**
 * EMITIR — o fato que compromete o saldo dos itens do contrato. Sob o trinco do contrato: duas ordens simultâneas
 * sobre o mesmo saldo, só o conjunto que cabe confirma (OS03). Não reserva nem empenha (OS04).
 */
export async function emitirOrdemDeServico(prisma: PrismaClient, input: EmitirOrdemDeServicoInput): Promise<{ readonly emissaoId: string; readonly sha256: string; readonly valor: string }> {
  const d = zEmitirOrdemDeServico.parse(input);
  try {
    return await prisma.$transaction(async (tx) => {
      await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.emitirOrdemDeServico, "ENTE");
      const alvo = await tx.ordemDeServicoDoContrato.findUnique({ where: { id: d.ordemId }, select: { contratoId: true } });
      if (alvo === null) throw new Error(`Ordem de serviço ${d.ordemId} não existe. Nada foi gravado.`);
      const c = await contratoTravado(tx, alvo.contratoId);
      const gestor = await exigirDesignacao(tx, c, d.criadoPor, "GESTOR", hoje());
      const o = await tx.ordemDeServicoDoContrato.findUniqueOrThrow({
        where: { id: d.ordemId },
        select: {
          id: true, numero: true, ano: true, finalidade: true, local: true, unidadeSolicitante: true, inicioPrevisto: true, fimPrevisto: true, condicoesDeRecebimento: true, fiscalDesignacaoId: true,
          emissao: { select: { id: true } }, descarte: { select: { id: true } },
          empenho: { select: { numero: true, estornoDeId: true, estornos: { select: { id: true } } } },
          fiscalDesignacao: { select: { vigenciaInicio: true, vigenciaFim: true, revogacao: { select: { dataEfeito: true } } } },
          contrato: { select: { numeroContrato: true, contratadoNome: true, contratadoDocumento: true } },
          itens: { orderBy: { criadoEm: "asc" }, select: { id: true, quantidade: true, valorUnitario: true, itemDoContrato: { select: { id: true, numero: true, descricao: true, unidade: true } } } },
        },
      });
      if (o.emissao !== null) throw new Error(`ORDEM-JA-EMITIDA: a ordem de serviço nº ${o.numero}/${o.ano} já foi emitida. Nada foi gravado.`);
      if (o.descarte !== null) throw new Error(`RASCUNHO-DESCARTADO: a ordem nº ${o.numero}/${o.ano} foi descartada e não se emite. Nada foi gravado.`);
      const ini = diaCivil(o.inicioPrevisto);
      const fim = diaCivil(o.fimPrevisto);
      if (d.inicioAutorizado < ini || d.inicioAutorizado > fim) throw new Error(`INICIO-FORA-DO-PERIODO-PREVISTO: o início autorizado (${br(d.inicioAutorizado)}) precisa estar entre ${br(ini)} e ${br(fim)}. Nada foi gravado.`);
      // NOVA execução: o contrato vigente hoje, no início autorizado e no fim previsto — prorrogação não se presume.
      exigirContratoVigente(c, hoje(), "a emissão da ordem");
      exigirContratoVigente(c, d.inicioAutorizado, "o início autorizado");
      exigirContratoVigente(c, fim, "o fim previsto da ordem");
      if (!designacaoVigenteEm(o.fiscalDesignacao, new Date())) throw new Error(`FISCAL-DA-ORDEM-SEM-VIGENCIA: a designação do fiscal indicado na ordem nº ${o.numero} não está vigente hoje. Indique outro fiscal num novo rascunho. Nada foi gravado.`);
      if (o.empenho !== null && (o.empenho.estornoDeId !== null || o.empenho.estornos.length > 0)) throw new Error(`EMPENHO-ANULADO: o empenho ${o.empenho.numero} indicado na ordem foi anulado depois do rascunho. Nada foi gravado.`);
      const comprometido = await comprometidoPorItemDoContrato(tx, c.id, o.id);
      const historicos = await historicosDosItens(tx, { ids: o.itens.map((i) => i.itemDoContrato.id) });
      for (const i of o.itens) {
        const h = historicos.get(i.itemDoContrato.id)!;
        // V7 M2 U5 — o preço do rascunho tem de ser o da versão vigente no início autorizado; aditivo registrado depois
        // do rascunho não é aplicado em silêncio, nem ignorado.
        const unitVigente = versaoNoDia(h, d.inicioAutorizado).valorUnitario;
        if (!unitVigente.eq(i.valorUnitario.toFixed(4))) {
          throw new Error(
            `PRECO-DA-ORDEM-DESATUALIZADO: o item ${i.itemDoContrato.numero} (${i.itemDoContrato.descricao}) está no rascunho a R$ ${q4(i.valorUnitario.toFixed(4))}, e o unitário vigente em ${br(d.inicioAutorizado)} é R$ ${q4(unitVigente)} por aditivo. ` +
              `Descarte o rascunho e crie outro. Nada foi gravado.`
          );
        }
        const ja = comprometido.get(i.itemDoContrato.id) ?? new Decimal(0);
        const contratado = quantidadeParaComprometerDesde(h, hoje());
        const disponivel = contratado.minus(ja);
        if (new Decimal(i.quantidade.toFixed(4)).gt(disponivel)) {
          throw new Error(
            `SALDO-DO-ITEM-INSUFICIENTE: o item ${i.itemDoContrato.numero} (${i.itemDoContrato.descricao}) tem ${q4(contratado)} contratado(s) vigente(s) de hoje em diante, ${q4(ja)} já comprometido(s) em ordens emitidas ou medições, e esta ordem pede ${q4(i.quantidade.toFixed(4))}. ` +
              `Nada foi gravado — a quantidade acima do contratado exige aditivo antes.`
          );
        }
      }
      const [g, f] = await Promise.all([nomeEAto(tx, gestor.id), nomeEAto(tx, o.fiscalDesignacaoId)]);
      const linhas = o.itens.map((i) => ({ item: i.itemDoContrato.numero, descricao: i.itemDoContrato.descricao, unidade: i.itemDoContrato.unidade, quantidade: q4(i.quantidade.toFixed(4)), valorUnitario: q4(i.valorUnitario.toFixed(4)), valor: toMoney(new Decimal(i.quantidade.toFixed(4)).times(i.valorUnitario.toFixed(4))).toFixed(2) }));
      const total = sumMoney(linhas.map((l) => l.valor)).toFixed(2);
      const { manifesto, sha256 } = manifestoCanonico({
        documento: "ORDEM_DE_SERVICO",
        ente: await nomeDoEnteNosDocumentos(tx),
        contrato: { numero: o.contrato.numeroContrato, contratado: o.contrato.contratadoNome, documentoDoContratado: o.contrato.contratadoDocumento },
        ordem: { numero: o.numero, ano: o.ano, finalidade: o.finalidade, local: o.local, unidadeSolicitante: o.unidadeSolicitante, inicioPrevisto: ini, fimPrevisto: fim, inicioAutorizado: d.inicioAutorizado, emitidaEm: hoje(), condicoesDeRecebimento: o.condicoesDeRecebimento },
        gestor: { nome: g.nome, ato: g.ato },
        fiscal: { nome: f.nome, ato: f.ato },
        empenho: o.empenho?.numero ?? null,
        itens: linhas,
        total,
      });
      const r = await tx.emissaoDaOrdemDeServico.create({
        data: { ordemId: o.id, data: inicioDoDiaCivil(hoje()), inicioAutorizado: inicioDoDiaCivil(d.inicioAutorizado), designacaoId: gestor.id, manifesto: manifesto as object, sha256, criadoPor: d.criadoPor },
        select: { id: true },
      });
      return { emissaoId: r.id, sha256, valor: total };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new Error("ORDEM-JA-EMITIDA: outra emissão desta ordem foi gravada no mesmo instante. Nada foi gravado.");
    throw e;
  }
}

export const zDescartarRascunhoDeOrdemDeServico = z.object({ ordemId: z.string().min(1), motivo: z.string().trim().min(5), criadoPor: z.string().min(1) }).strict();
export type DescartarRascunhoDeOrdemDeServicoInput = z.input<typeof zDescartarRascunhoDeOrdemDeServico>;

/** DESCARTAR um rascunho — só o que não foi emitido. O rascunho continua no histórico. */
export async function descartarRascunhoDeOrdemDeServico(prisma: PrismaClient, input: DescartarRascunhoDeOrdemDeServicoInput): Promise<{ readonly descarteId: string }> {
  const d = zDescartarRascunhoDeOrdemDeServico.parse(input);
  try {
    return await prisma.$transaction(async (tx) => {
      await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.descartarRascunhoDeOrdemDeServico, "ENTE");
      const alvo = await tx.ordemDeServicoDoContrato.findUnique({ where: { id: d.ordemId }, select: { contratoId: true } });
      if (alvo === null) throw new Error(`Ordem de serviço ${d.ordemId} não existe. Nada foi gravado.`);
      const c = await contratoTravado(tx, alvo.contratoId);
      await exigirDesignacao(tx, c, d.criadoPor, "GESTOR", hoje());
      const o = await tx.ordemDeServicoDoContrato.findUniqueOrThrow({ where: { id: d.ordemId }, select: { numero: true, emissao: { select: { id: true } }, descarte: { select: { id: true } } } });
      if (o.emissao !== null) throw new Error(`ORDEM-EMITIDA-NAO-SE-DESCARTA: a ordem nº ${o.numero} já foi emitida; o que se faz com ela é cancelar o saldo não executado. Nada foi gravado.`);
      if (o.descarte !== null) throw new Error(`RASCUNHO-JA-DESCARTADO: a ordem nº ${o.numero} já foi descartada. Nada foi gravado.`);
      const r = await tx.descarteDaOrdemDeServico.create({ data: { ordemId: d.ordemId, motivo: d.motivo, criadoPor: d.criadoPor }, select: { id: true } });
      return { descarteId: r.id };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new Error("RASCUNHO-JA-DESCARTADO: outro descarte foi gravado no mesmo instante. Nada foi gravado.");
    throw e;
  }
}

export const zCancelarSaldoDaOrdemDeServico = z
  .object({
    ordemId: z.string().min(1),
    data: zDia,
    motivo: z.string().trim().min(5),
    itens: z.array(z.object({ itemDaOrdemId: z.string().min(1), quantidade: zQuantidade }).strict()).min(1),
    criadoPor: z.string().min(1),
  })
  .strict();
export type CancelarSaldoDaOrdemDeServicoInput = z.input<typeof zCancelarSaldoDaOrdemDeServico>;

/**
 * CANCELAR O SALDO NÃO EXECUTADO — por item, com motivo. O que foi MEDIDO continua comprometido (OS05): a recusa nomeia
 * o que ainda pode ser cancelado. O empenho indicado na ordem NÃO é anulado aqui: anulação é ato do M05, pelo fluxo do
 * empenho — a ordem não o contorna.
 */
export async function cancelarSaldoDaOrdemDeServico(prisma: PrismaClient, input: CancelarSaldoDaOrdemDeServicoInput): Promise<{ readonly cancelados: number; readonly empenhoIndicado: string | null }> {
  const d = zCancelarSaldoDaOrdemDeServico.parse(input);
  if (d.data > hoje()) throw new Error("DATA-FUTURA: o cancelamento tem a data de hoje ou anterior. Nada foi gravado.");
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cancelarSaldoDaOrdemDeServico, "ENTE");
    const alvo = await tx.ordemDeServicoDoContrato.findUnique({ where: { id: d.ordemId }, select: { contratoId: true } });
    if (alvo === null) throw new Error(`Ordem de serviço ${d.ordemId} não existe. Nada foi gravado.`);
    const c = await contratoTravado(tx, alvo.contratoId);
    const gestor = await exigirDesignacao(tx, c, d.criadoPor, "GESTOR", hoje());
    const o = await tx.ordemDeServicoDoContrato.findUniqueOrThrow({
      where: { id: d.ordemId },
      select: { numero: true, emissao: { select: { id: true } }, empenho: { select: { numero: true } }, itens: { select: { id: true, quantidade: true, itemDoContrato: { select: { numero: true, descricao: true } }, cancelamentos: { select: { quantidade: true } }, medidos: { where: { medicao: { estorno: null } }, select: { quantidade: true } } } } },
    });
    if (o.emissao === null) throw new Error(`ORDEM-NAO-EMITIDA: a ordem nº ${o.numero} é rascunho; rascunho se descarta, não se cancela saldo. Nada foi gravado.`);
    const ids = d.itens.map((i) => i.itemDaOrdemId);
    if (new Set(ids).size !== ids.length) throw new Error("ITEM-REPETIDO: cada item entra uma vez no cancelamento. Nada foi gravado.");
    for (const p of d.itens) {
      const i = o.itens.find((x) => x.id === p.itemDaOrdemId);
      if (i === undefined) throw new Error(`ITEM-DE-OUTRA-ORDEM: o item ${p.itemDaOrdemId} não é da ordem nº ${o.numero}. Nada foi gravado.`);
      const cancelado = i.cancelamentos.reduce((t, x) => t.plus(x.quantidade.toFixed(4)), new Decimal(0));
      const medido = i.medidos.reduce((t, x) => t.plus(x.quantidade.toFixed(4)), new Decimal(0));
      const aExecutar = new Decimal(i.quantidade.toFixed(4)).minus(cancelado).minus(medido);
      if (new Decimal(p.quantidade).lte(0) || new Decimal(p.quantidade).gt(aExecutar)) {
        throw new Error(
          `CANCELAMENTO-ACIMA-DO-NAO-EXECUTADO: o item ${i.itemDoContrato.numero} (${i.itemDoContrato.descricao}) autorizou ${q4(i.quantidade.toFixed(4))}, já cancelou ${q4(cancelado)} e mediu ${q4(medido)}; ` +
            `só ${q4(aExecutar)} ainda não foi executado. O medido continua comprometido. Nada foi gravado.`
        );
      }
    }
    await tx.cancelamentoDeSaldoDaOrdem.createMany({ data: d.itens.map((p) => ({ ordemId: d.ordemId, itemDaOrdemId: p.itemDaOrdemId, quantidade: p.quantidade, data: inicioDoDiaCivil(d.data), motivo: d.motivo, designacaoId: gestor.id, criadoPor: d.criadoPor })) });
    return { cancelados: d.itens.length, empenhoIndicado: o.empenho?.numero ?? null };
  });
}

export const zMovimentarExecucaoDaOrdemDeServico = z.object({ ordemId: z.string().min(1), tipo: z.enum(["SUSPENSAO", "RETOMADA"]), data: zDia, motivo: z.string().trim().min(5), criadoPor: z.string().min(1) }).strict();
export type MovimentarExecucaoDaOrdemDeServicoInput = z.input<typeof zMovimentarExecucaoDaOrdemDeServico>;

/** SUSPENDER ou RETOMAR — marco e motivo; alternados; nunca com data futura nem anterior ao último marco (RE07). */
export async function movimentarExecucaoDaOrdemDeServico(prisma: PrismaClient, input: MovimentarExecucaoDaOrdemDeServicoInput): Promise<{ readonly movimentoId: string }> {
  const d = zMovimentarExecucaoDaOrdemDeServico.parse(input);
  if (d.data > hoje()) throw new Error("DATA-FUTURA: a suspensão ou a retomada tem a data de hoje ou anterior. Nada foi gravado.");
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.movimentarExecucaoDaOrdemDeServico, "ENTE");
    const alvo = await tx.ordemDeServicoDoContrato.findUnique({ where: { id: d.ordemId }, select: { contratoId: true } });
    if (alvo === null) throw new Error(`Ordem de serviço ${d.ordemId} não existe. Nada foi gravado.`);
    const c = await contratoTravado(tx, alvo.contratoId);
    const gestor = await exigirDesignacao(tx, c, d.criadoPor, "GESTOR", hoje());
    const o = await tx.ordemDeServicoDoContrato.findUniqueOrThrow({ where: { id: d.ordemId }, select: { numero: true, emissao: { select: { inicioAutorizado: true } }, movimentos: { orderBy: [{ data: "desc" }, { criadoEm: "desc" }], take: 1, select: { tipo: true, data: true } } } });
    if (o.emissao === null) throw new Error(`ORDEM-NAO-EMITIDA: a ordem nº ${o.numero} não foi emitida; não há execução a suspender. Nada foi gravado.`);
    const ultimo = o.movimentos[0];
    if ((ultimo?.tipo ?? "RETOMADA") === d.tipo) throw new Error(`MOVIMENTO-REPETIDO: a ordem nº ${o.numero} já está ${d.tipo === "SUSPENSAO" ? "suspensa" : "em execução"}. Nada foi gravado.`);
    const marcoMinimo = ultimo === undefined ? diaCivil(o.emissao.inicioAutorizado) : diaCivil(ultimo.data);
    if (d.data < marcoMinimo) throw new Error(`MARCO-ANTERIOR: a data (${br(d.data)}) é anterior ao ${ultimo === undefined ? "início autorizado" : "último marco"} (${br(marcoMinimo)}). Nada foi gravado.`);
    const r = await tx.movimentoDeExecucaoDaOrdem.create({ data: { ordemId: d.ordemId, tipo: d.tipo, data: inicioDoDiaCivil(d.data), motivo: d.motivo, designacaoId: gestor.id, criadoPor: d.criadoPor }, select: { id: true } });
    return { movimentoId: r.id };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// U2 — A MEDIÇÃO DA ORDEM
// ═══════════════════════════════════════════════════════════════════════════════

export const zRegistrarMedicaoDaOrdem = z
  .object({
    ordemId: z.string().min(1),
    diaInicio: zDia,
    diaFim: zDia,
    observacao: z.string().trim().min(1).optional(),
    itens: z.array(z.object({ itemDaOrdemId: z.string().min(1), quantidade: zQuantidade }).strict()).min(1),
    criadoPor: z.string().min(1),
  })
  .strict();
export type RegistrarMedicaoDaOrdemInput = z.input<typeof zRegistrarMedicaoDaOrdem>;

/** Os intervalos em que a ordem esteve suspensa: [suspensão, retomada) — a retomada aberta vai até hoje. */
function intervalosSuspensos(movs: readonly { readonly tipo: string; readonly data: Date }[]): readonly { readonly de: string; readonly ate: string | null }[] {
  const saida: { de: string; ate: string | null }[] = [];
  for (const m of [...movs].sort((a, b) => a.data.getTime() - b.data.getTime())) {
    if (m.tipo === "SUSPENSAO") saida.push({ de: diaCivil(m.data), ate: null });
    else if (saida.length > 0 && saida[saida.length - 1]!.ate === null) saida[saida.length - 1]!.ate = diaCivil(m.data);
  }
  return saida;
}

/**
 * MEDIR A ORDEM — o fiscal vigente hoje (o sucessor mede o que o antecessor deixou). O período é FATO: dentro do
 * início autorizado e do fim previsto, dentro da vigência do contrato, fora de suspensão, até hoje. Por item: o
 * acumulado não passa do autorizado (quantidade − cancelado) — é essa a identidade da parcela (ME03). O período só é
 * conferido contra outras medições se o contrato configurar regime indivisível (ME05).
 */
export async function registrarMedicaoDaOrdem(prisma: PrismaClient, input: RegistrarMedicaoDaOrdemInput): Promise<{ readonly medicaoId: string; readonly numero: number; readonly valor: string; readonly aExecutar: readonly { readonly item: number; readonly quantidade: string }[] }> {
  const d = zRegistrarMedicaoDaOrdem.parse(input);
  preCondicoesDaMedicaoDaOrdem(d, d.itens.map((i) => i.itemDaOrdemId));
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarMedicaoDaOrdem, "ENTE");
    const alvo = await tx.ordemDeServicoDoContrato.findUnique({ where: { id: d.ordemId }, select: { contratoId: true } });
    if (alvo === null) throw new Error(`Ordem de serviço ${d.ordemId} não existe. Nada foi gravado.`);
    const c = await contratoTravado(tx, alvo.contratoId);
    const fiscal = await exigirDesignacao(tx, c, d.criadoPor, "FISCAL", hoje());
    // V7 M2 U7 — o item do contrato ligado a um serviço da planilha da obra mede-se PELA planilha: medi-lo avulso deixaria
    // o andamento da obra por serviço incompleto, sem que ninguém percebesse.
    const ligados = await tx.vinculoDeItemDaPlanilhaAoContrato.findMany({
      where: { revogacao: null, itemDoContrato: { itensDeOrdemDeServico: { some: { id: { in: d.itens.map((i) => i.itemDaOrdemId) }, ordemId: d.ordemId } } } },
      select: { itemDoContrato: { select: { numero: true, descricao: true } }, itemDaPlanilha: { select: { codigo: true, planilha: { select: { versao: true, obra: { select: { identificador: true } } } } } } },
    });
    if (ligados.length > 0) {
      const v = ligados[0]!;
      throw new Error(
        `MEDICAO-PELA-PLANILHA: o item ${v.itemDoContrato.numero} (${v.itemDoContrato.descricao}) está vinculado ao serviço ${v.itemDaPlanilha.codigo} da planilha da obra ${v.itemDaPlanilha.planilha.obra.identificador} (versão ${v.itemDaPlanilha.planilha.versao}). ` +
          `Meça pela planilha, para que o andamento por serviço registre a quantidade. Nada foi gravado.`
      );
    }
    const r = await gravarMedicaoDaOrdemNaTransacao(tx, c, fiscal, d);
    return { medicaoId: r.medicaoId, numero: r.numero, valor: r.valor, aExecutar: r.linhas.map((l) => ({ item: l.item, quantidade: l.restante })) };
  });
}

/** As pré-condições que não dependem do banco — as mesmas para a medição avulsa e pela planilha. */
export function preCondicoesDaMedicaoDaOrdem(d: { readonly diaInicio: string; readonly diaFim: string; readonly itens: readonly { readonly quantidade: string }[] }, ids: readonly string[]): void {
  if (d.diaFim < d.diaInicio) throw new Error("PERIODO-INVERTIDO: o fim do período é anterior ao início. Nada foi gravado.");
  if (d.diaFim > hoje()) throw new Error("PERIODO-FUTURO: não se mede execução que ainda não aconteceu. Nada foi gravado.");
  if (new Set(ids).size !== ids.length) throw new Error("ITEM-REPETIDO: cada item entra uma vez na medição. Nada foi gravado.");
  if (d.itens.some((i) => new Decimal(i.quantidade).lte(0))) throw new Error("QUANTIDADE-INVALIDA: a quantidade medida precisa ser maior que zero. Nada foi gravado.");
}

export interface LinhaGravadaDaMedicao { readonly itemDaOrdemId: string; readonly itemMedidoId: string; readonly item: number; readonly descricao: string; readonly unidade: string; readonly quantidade: string; readonly valorUnitario: string; readonly valor: string; readonly autorizado: string; readonly anterior: string; readonly restante: string }

/**
 * O NÚCLEO DA MEDIÇÃO DA ORDEM, dentro da transação de quem já cobrou a ação, travou o contrato e conferiu a designação
 * de FISCAL vigente — a medição avulsa (`registrarMedicaoDaOrdem`) e a medição pela planilha (U7) passam pelo mesmo
 * corpo: período dentro do autorizado, vigência, suspensão, regime de período, unitário vigente no primeiro dia (ME06)
 * e o acumulado ≤ autorizado (ME03). A medição ESTORNADA não conta no acumulado nem no regime de período.
 */
export async function gravarMedicaoDaOrdemNaTransacao(
  tx: Tx,
  c: Awaited<ReturnType<typeof contratoTravado>>,
  fiscal: { readonly id: string },
  d: { readonly ordemId: string; readonly diaInicio: string; readonly diaFim: string; readonly observacao?: string | undefined; readonly itens: readonly { readonly itemDaOrdemId: string; readonly quantidade: string }[]; readonly criadoPor: string }
): Promise<{ readonly medicaoId: string; readonly numero: number; readonly valor: string; readonly linhas: readonly LinhaGravadaDaMedicao[] }> {
  const o = await tx.ordemDeServicoDoContrato.findUniqueOrThrow({
    where: { id: d.ordemId },
    select: {
      numero: true, ano: true, contratoId: true, fimPrevisto: true, emissao: { select: { inicioAutorizado: true } }, descarte: { select: { id: true } },
      movimentos: { select: { tipo: true, data: true } },
      itens: { select: { id: true, quantidade: true, itemDoContrato: { select: { id: true, numero: true, descricao: true, unidade: true } }, cancelamentos: { select: { quantidade: true } }, medidos: { where: { medicao: { estorno: null } }, select: { quantidade: true } } } },
      medicoes: { orderBy: { numero: "desc" }, take: 1, select: { numero: true } },
    },
  });
  if (o.contratoId !== c.id) throw new Error(`ORDEM-DE-OUTRO-CONTRATO: a ordem nº ${o.numero}/${o.ano} não é do contrato ${c.numeroContrato}. Nada foi gravado.`);
  if (o.emissao === null || o.descarte !== null) throw new Error(`ORDEM-NAO-EMITIDA: a ordem nº ${o.numero}/${o.ano} não está emitida; sem autorização de execução não há o que medir. Nada foi gravado.`);
  const inicioAutorizado = diaCivil(o.emissao.inicioAutorizado);
  const fimPrevisto = diaCivil(o.fimPrevisto);
  if (d.diaInicio < inicioAutorizado || d.diaFim > fimPrevisto) {
    throw new Error(`PERIODO-FORA-DA-ORDEM: a ordem nº ${o.numero}/${o.ano} autoriza execução de ${br(inicioAutorizado)} a ${br(fimPrevisto)}; o período ${br(d.diaInicio)} a ${br(d.diaFim)} sai dela. Nada foi gravado.`);
  }
  exigirContratoVigente(c, d.diaInicio, "o início do período medido");
  exigirContratoVigente(c, d.diaFim, "o fim do período medido");
  const suspensa = intervalosSuspensos(o.movimentos).find((s) => s.de <= d.diaFim && d.diaInicio < (s.ate ?? "9999-12-31"));
  if (suspensa !== undefined) {
    throw new Error(`EXECUCAO-SUSPENSA: a ordem nº ${o.numero} esteve suspensa de ${br(suspensa.de)}${suspensa.ate === null ? " até hoje" : ` a ${br(suspensa.ate)} (retomada)`}, e o período medido cai nela. Nada foi gravado.`);
  }
  const periodo = await conferenciaDoPeriodoPorItens(tx, c.id, d.diaInicio);
  if (periodo.conferir) {
    const outras = await tx.medicaoDaOrdemDeServico.findMany({ where: { ordem: { contratoId: c.id }, estorno: null }, select: { numero: true, periodoInicio: true, periodoFim: true, ordem: { select: { numero: true } } } });
    const novo = { numero: -1, inicio: inicioDoDiaCivil(d.diaInicio), fim: fimDoDiaCivil(d.diaFim) };
    const conflito = outras.find((m) => periodosSeSobrepoem(novo, { numero: m.numero, inicio: m.periodoInicio, fim: m.periodoFim }));
    if (conflito !== undefined) {
      throw new Error(`PERÍODO SOBREPOSTO no contrato ${c.numeroContrato} (${periodo.fundamento}): o período ${br(d.diaInicio)} a ${br(d.diaFim)} invade a medição nº ${conflito.numero} da ordem nº ${conflito.ordem.numero} (${diaCivilBr(conflito.periodoInicio)} a ${diaCivilBr(conflito.periodoFim)}). Nada foi gravado.`);
    }
  }
  const historicos = await historicosDosItens(tx, { ids: o.itens.map((i) => i.itemDoContrato.id) });
  const linhas = d.itens.map((p) => {
    const i = o.itens.find((x) => x.id === p.itemDaOrdemId);
    if (i === undefined) throw new Error(`ITEM-DE-OUTRA-ORDEM: o item ${p.itemDaOrdemId} não é da ordem nº ${o.numero}. Nada foi gravado.`);
    // V7 M2 U5 (ME06) — o unitário da medição é o da versão do item vigente no PRIMEIRO dia do período; o da ordem é o
    // da autorização e não muda. Um novo unitário começando dentro do período obriga a dividir a medição.
    const h = historicos.get(i.itemDoContrato.id)!;
    const novoPreco = novoPrecoDentroDoPeriodo(h, d.diaInicio, d.diaFim);
    if (novoPreco !== null) {
      throw new Error(
        `PERIODO-ATRAVESSA-NOVO-PRECO: o item ${i.itemDoContrato.numero} (${i.itemDoContrato.descricao}) passa a R$ ${q4(novoPreco.valorUnitario)} em ${br(novoPreco.desde!)} pelo aditivo nº ${novoPreco.numeroAditivo}, dentro do período ${br(d.diaInicio)} a ${br(d.diaFim)}. ` +
          `Meça em dois períodos, antes e a partir dessa data. Nada foi gravado.`
      );
    }
    const unit = versaoNoDia(h, d.diaInicio).valorUnitario;
    const autorizado = new Decimal(i.quantidade.toFixed(4)).minus(i.cancelamentos.reduce((t, x) => t.plus(x.quantidade.toFixed(4)), new Decimal(0)));
    const medido = i.medidos.reduce((t, x) => t.plus(x.quantidade.toFixed(4)), new Decimal(0));
    if (medido.plus(p.quantidade).gt(autorizado)) {
      throw new Error(
        `ITEM-ACIMA-DO-AUTORIZADO-NA-ORDEM: o item ${i.itemDoContrato.numero} (${i.itemDoContrato.descricao}) tem ${q4(autorizado)} ${i.itemDoContrato.unidade} autorizado(s) na ordem nº ${o.numero}, já mediu ${q4(medido)} e esta medição levaria a ${q4(medido.plus(p.quantidade))}. ` +
          `A mesma parcela não se mede duas vezes; execução além do autorizado exige nova ordem. Nada foi gravado.`
      );
    }
    return { itemDaOrdemId: i.id, item: i.itemDoContrato.numero, descricao: i.itemDoContrato.descricao, unidade: i.itemDoContrato.unidade, quantidade: p.quantidade, valorUnitario: unit.toFixed(4), valor: toMoney(new Decimal(p.quantidade).times(unit)), autorizado, anterior: medido, restante: autorizado.minus(medido).minus(p.quantidade) };
  });
  const numero = (o.medicoes[0]?.numero ?? 0) + 1;
  const r = await tx.medicaoDaOrdemDeServico.create({
    data: {
      ordemId: d.ordemId, numero, periodoInicio: inicioDoDiaCivil(d.diaInicio), periodoFim: fimDoDiaCivil(d.diaFim), designacaoId: fiscal.id, observacao: d.observacao ?? null, criadoPor: d.criadoPor,
      itens: { create: linhas.map((l) => ({ itemDaOrdemId: l.itemDaOrdemId, quantidade: l.quantidade, valorUnitario: l.valorUnitario, valor: l.valor.toFixed(2) })) },
    },
    select: { id: true, itens: { select: { id: true, itemDaOrdemId: true } } },
  });
  return {
    medicaoId: r.id,
    numero,
    valor: sumMoney(linhas.map((l) => l.valor)).toFixed(2),
    linhas: linhas.map((l) => ({ itemDaOrdemId: l.itemDaOrdemId, itemMedidoId: r.itens.find((x) => x.itemDaOrdemId === l.itemDaOrdemId)!.id, item: l.item, descricao: l.descricao, unidade: l.unidade, quantidade: q4(l.quantidade), valorUnitario: q4(l.valorUnitario), valor: l.valor.toFixed(2), autorizado: q4(l.autorizado), anterior: q4(l.anterior), restante: q4(l.restante) })),
  };
}

export const zEstornarMedicaoDaOrdem = z.object({ medicaoId: z.string().min(1), motivo: z.string().trim().min(10, "Diga por que a medição é estornada (pelo menos 10 caracteres)."), criadoPor: z.string().min(1) }).strict();
export type EstornarMedicaoDaOrdemInput = z.input<typeof zEstornarMedicaoDaOrdem>;

/**
 * ESTORNAR A MEDIÇÃO DA ORDEM (V7 M2 U7) — o fiscal vigente hoje, enquanto NADA depende dela: sem recebimento
 * provisório (e, portanto, sem decisão, definitivo ou liquidação). A medição fica no histórico, marcada; a quantidade
 * volta a executar e sai do acumulado da planilha. Com dependente, a recusa nomeia cada um: a medição recebida não se
 * desfaz por aqui (o estorno do recebimento não existe nesta versão — `ESTORNO-DE-RECEBIMENTO`).
 */
export async function estornarMedicaoDaOrdem(prisma: PrismaClient, input: EstornarMedicaoDaOrdemInput): Promise<{ readonly estornoId: string; readonly numero: number; readonly valor: string }> {
  const d = zEstornarMedicaoDaOrdem.parse(input);
  try {
    return await prisma.$transaction(async (tx) => {
      await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.estornarMedicaoDaOrdem, "ENTE");
      const alvo = await tx.medicaoDaOrdemDeServico.findUnique({ where: { id: d.medicaoId }, select: { ordem: { select: { contratoId: true } } } });
      if (alvo === null) throw new Error(`Medição ${d.medicaoId} não existe. Nada foi gravado.`);
      const c = await contratoTravado(tx, alvo.ordem.contratoId);
      const fiscal = await exigirDesignacao(tx, c, d.criadoPor, "FISCAL", hoje());
      const m = await tx.medicaoDaOrdemDeServico.findUniqueOrThrow({
        where: { id: d.medicaoId },
        select: { numero: true, ordem: { select: { numero: true, ano: true } }, estorno: { select: { id: true } }, itens: { select: { valor: true } }, recebimentoProvisorio: { select: { data: true } }, recebimentosDefinitivos: { select: { numero: true, alocacoes: { select: { id: true } } } } },
      });
      if (m.estorno !== null) throw new Error(`MEDICAO-JA-ESTORNADA: a medição nº ${m.numero} da ordem nº ${m.ordem.numero}/${m.ordem.ano} já foi estornada. Nada foi gravado.`);
      if (m.recebimentoProvisorio !== null) {
        const dependentes = [
          `recebimento provisório de ${diaCivilBr(m.recebimentoProvisorio.data)}`,
          ...m.recebimentosDefinitivos.map((r) => `recebimento definitivo nº ${r.numero}${r.alocacoes.length > 0 ? " (já liquidado)" : ""}`),
        ];
        throw new Error(
          `MEDICAO-COM-RECEBIMENTO: a medição nº ${m.numero} da ordem nº ${m.ordem.numero}/${m.ordem.ano} já tem ${dependentes.join(", ")}. ` +
            `Medição recebida não se estorna: o que está errado se trata na conferência (controvérsia, decisão) e, depois de liquidada, pelo estorno da liquidação no M05. Nada foi gravado.`
        );
      }
      const r = await tx.estornoDeMedicaoDaOrdem.create({ data: { medicaoId: d.medicaoId, designacaoId: fiscal.id, motivo: d.motivo, criadoPor: d.criadoPor }, select: { id: true } });
      return { estornoId: r.id, numero: m.numero, valor: sumMoney(m.itens.map((i) => i.valor.toFixed(2))).toFixed(2) };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new Error("MEDICAO-JA-ESTORNADA: outro estorno desta medição foi gravado no mesmo instante. Nada foi gravado.");
    throw e;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// U2 — OS RECEBIMENTOS
// ═══════════════════════════════════════════════════════════════════════════════

interface MedicaoComContexto {
  readonly id: string;
  readonly numero: number;
  readonly periodoInicio: Date;
  readonly periodoFim: Date;
  readonly criadoPor: string;
  readonly ordem: { readonly id: string; readonly numero: number; readonly ano: number; readonly contratoId: string; readonly condicoesDeRecebimento: string; readonly contrato: { readonly numeroContrato: string; readonly contratadoNome: string; readonly contratadoDocumento: string } };
  readonly itens: readonly {
    readonly id: string;
    readonly quantidade: Decimal.Value & { toFixed(n: number): string };
    readonly valorUnitario: { toFixed(n: number): string };
    readonly itemDaOrdem: { readonly itemDoContrato: { readonly numero: number; readonly descricao: string; readonly unidade: string } };
    readonly conferencia: { readonly id: string; readonly quantidadeConforme: { toFixed(n: number): string }; readonly quantidadeEmControversia: { toFixed(n: number): string }; readonly motivo: string | null; readonly decisao: { readonly resultado: "ACEITA" | "REJEITADA" } | null } | null;
    readonly recebidos: readonly { readonly quantidade: { toFixed(n: number): string } }[];
  }[];
  readonly recebimentoProvisorio: { readonly id: string; readonly data: Date; readonly criadoPor: string } | null;
  readonly recebimentosDefinitivos: readonly { readonly numero: number }[];
  readonly estorno: { readonly id: string } | null;
}

async function medicaoComContexto(tx: Tx, medicaoId: string): Promise<MedicaoComContexto> {
  const m = await tx.medicaoDaOrdemDeServico.findUnique({
    where: { id: medicaoId },
    select: {
      id: true, numero: true, periodoInicio: true, periodoFim: true, criadoPor: true,
      ordem: { select: { id: true, numero: true, ano: true, contratoId: true, condicoesDeRecebimento: true, contrato: { select: { numeroContrato: true, contratadoNome: true, contratadoDocumento: true } } } },
      itens: { orderBy: { itemDaOrdem: { itemDoContrato: { numero: "asc" } } }, select: { id: true, quantidade: true, valorUnitario: true, itemDaOrdem: { select: { itemDoContrato: { select: { numero: true, descricao: true, unidade: true } } } }, conferencia: { select: { id: true, quantidadeConforme: true, quantidadeEmControversia: true, motivo: true, decisao: { select: { resultado: true } } } }, recebidos: { select: { quantidade: true } } } },
      recebimentoProvisorio: { select: { id: true, data: true, criadoPor: true } },
      recebimentosDefinitivos: { orderBy: { numero: "desc" }, take: 1, select: { numero: true } },
      estorno: { select: { id: true } },
    },
  });
  if (m === null) throw new Error(`Medição ${medicaoId} não existe. Nada foi gravado.`);
  return m as unknown as MedicaoComContexto;
}

/** O ELEGÍVEL de um item medido: conforme + controvérsia aceita − já recebido definitivamente. */
export function elegivelDoItemMedido(i: MedicaoComContexto["itens"][number]): { readonly elegivel: Decimal; readonly pendenteDeDecisao: Decimal; readonly glosado: Decimal; readonly recebido: Decimal } {
  const recebido = i.recebidos.reduce((t, r) => t.plus(r.quantidade.toFixed(4)), new Decimal(0));
  if (i.conferencia === null) return { elegivel: new Decimal(0), pendenteDeDecisao: new Decimal(0), glosado: new Decimal(0), recebido };
  const conforme = new Decimal(i.conferencia.quantidadeConforme.toFixed(4));
  const controversia = new Decimal(i.conferencia.quantidadeEmControversia.toFixed(4));
  const decisao = i.conferencia.decisao?.resultado ?? null;
  const aceito = decisao === "ACEITA" ? controversia : new Decimal(0);
  return {
    elegivel: conforme.plus(aceito).minus(recebido),
    pendenteDeDecisao: decisao === null ? controversia : new Decimal(0),
    glosado: decisao === "REJEITADA" ? controversia : new Decimal(0),
    recebido,
  };
}

export const zRegistrarRecebimentoProvisorio = z
  .object({
    medicaoId: z.string().min(1),
    data: zDia,
    verificacoes: z.string().trim().min(5, "Diga o que foi verificado."),
    itens: z.array(z.object({ itemMedidoId: z.string().min(1), quantidadeConforme: zQuantidadeOuZero, quantidadeEmControversia: zQuantidadeOuZero, motivo: z.string().trim().min(5).optional() }).strict()).min(1),
    criadoPor: z.string().min(1),
  })
  .strict();
export type RegistrarRecebimentoProvisorioInput = z.input<typeof zRegistrarRecebimentoProvisorio>;

/**
 * RECEBER PROVISORIAMENTE (art. 140, I, a) — o fiscal vigente hoje, "mediante termo detalhado". Todo item medido é
 * conferido uma vez: conforme + em controvérsia = medido, e a controvérsia exige motivo. A controvérsia não é glosa:
 * é quantidade cuja aceitação ainda não foi decidida (RE01, RE04).
 */
export async function registrarRecebimentoProvisorio(prisma: PrismaClient, input: RegistrarRecebimentoProvisorioInput): Promise<{ readonly recebimentoId: string; readonly sha256: string; readonly conforme: string; readonly emControversia: string }> {
  const d = zRegistrarRecebimentoProvisorio.parse(input);
  if (d.data > hoje()) throw new Error("DATA-FUTURA: o recebimento tem a data de hoje ou anterior. Nada foi gravado.");
  try {
    return await prisma.$transaction(async (tx) => {
      await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarRecebimentoProvisorio, "ENTE");
      const alvo = await tx.medicaoDaOrdemDeServico.findUnique({ where: { id: d.medicaoId }, select: { ordem: { select: { contratoId: true } } } });
      if (alvo === null) throw new Error(`Medição ${d.medicaoId} não existe. Nada foi gravado.`);
      const c = await contratoTravado(tx, alvo.ordem.contratoId);
      const fiscal = await exigirDesignacao(tx, c, d.criadoPor, "FISCAL", hoje());
      const m = await medicaoComContexto(tx, d.medicaoId);
      if (m.estorno !== null) throw new Error(`MEDICAO-ESTORNADA: a medição nº ${m.numero} da ordem nº ${m.ordem.numero} foi estornada e não se recebe. Nada foi gravado.`);
      if (m.recebimentoProvisorio !== null) throw new Error(`RECEBIMENTO-PROVISORIO-JA-REGISTRADO: a medição nº ${m.numero} da ordem nº ${m.ordem.numero} já foi recebida provisoriamente. Nada foi gravado.`);
      if (d.data < diaCivil(m.periodoFim)) throw new Error(`RECEBIMENTO-ANTES-DA-EXECUCAO: a medição termina em ${diaCivilBr(m.periodoFim)}; não se recebe antes. Nada foi gravado.`);
      const pedidos = new Map(d.itens.map((i) => [i.itemMedidoId, i]));
      if (pedidos.size !== d.itens.length) throw new Error("ITEM-REPETIDO: cada item medido é conferido uma vez. Nada foi gravado.");
      const faltam = m.itens.filter((i) => !pedidos.has(i.id));
      if (faltam.length > 0 || pedidos.size !== m.itens.length) {
        throw new Error(`CONFERENCIA-INCOMPLETA: todo item medido é conferido no recebimento provisório (faltam: ${faltam.map((i) => i.itemDaOrdem.itemDoContrato.numero).join(", ") || "item de outra medição informado"}). Nada foi gravado.`);
      }
      let conforme = new Decimal(0);
      let controversia = new Decimal(0);
      const linhas = m.itens.map((i) => {
        const p = pedidos.get(i.id)!;
        const medido = new Decimal(i.quantidade.toFixed(4));
        if (!new Decimal(p.quantidadeConforme).plus(p.quantidadeEmControversia).eq(medido)) {
          throw new Error(`CONFERENCIA-NAO-FECHA: no item ${i.itemDaOrdem.itemDoContrato.numero} (${i.itemDaOrdem.itemDoContrato.descricao}) foram medidos ${q4(medido)}; conforme ${q4(p.quantidadeConforme)} + em controvérsia ${q4(p.quantidadeEmControversia)} precisa somar isso. Nada foi gravado.`);
        }
        if (new Decimal(p.quantidadeEmControversia).gt(0) && p.motivo === undefined) {
          throw new Error(`CONTROVERSIA-SEM-MOTIVO: o item ${i.itemDaOrdem.itemDoContrato.numero} tem quantidade em controvérsia sem o motivo. Nada foi gravado.`);
        }
        const unit = i.valorUnitario.toFixed(4);
        conforme = conforme.plus(toMoney(new Decimal(p.quantidadeConforme).times(unit)));
        controversia = controversia.plus(toMoney(new Decimal(p.quantidadeEmControversia).times(unit)));
        return { itemMedidoId: i.id, item: i.itemDaOrdem.itemDoContrato.numero, descricao: i.itemDaOrdem.itemDoContrato.descricao, unidade: i.itemDaOrdem.itemDoContrato.unidade, medido: q4(medido), conforme: q4(p.quantidadeConforme), emControversia: q4(p.quantidadeEmControversia), motivo: new Decimal(p.quantidadeEmControversia).gt(0) ? (p.motivo ?? null) : null };
      });
      const f = await nomeEAto(tx, fiscal.id);
      const { manifesto, sha256 } = manifestoCanonico({
        documento: "TERMO_DE_RECEBIMENTO_PROVISORIO",
        ente: await nomeDoEnteNosDocumentos(tx),
        fundamento: "Lei 14.133/2021, art. 140, I, a",
        contrato: { numero: m.ordem.contrato.numeroContrato, contratado: m.ordem.contrato.contratadoNome, documentoDoContratado: m.ordem.contrato.contratadoDocumento },
        ordem: { numero: m.ordem.numero, ano: m.ordem.ano, condicoesDeRecebimento: m.ordem.condicoesDeRecebimento },
        medicao: { numero: m.numero, periodo: { inicio: diaCivil(m.periodoInicio), fim: diaCivil(m.periodoFim) } },
        data: d.data,
        responsavel: { nome: f.nome, ato: f.ato, papel: "FISCAL" },
        verificacoes: d.verificacoes,
        itens: linhas.map(({ itemMedidoId: _, ...l }) => l),
        valores: { conforme: conforme.toFixed(2), emControversia: controversia.toFixed(2) },
      });
      const r = await tx.recebimentoProvisorio.create({
        data: {
          medicaoId: m.id, data: inicioDoDiaCivil(d.data), designacaoId: fiscal.id, verificacoes: d.verificacoes, manifesto: manifesto as object, sha256, criadoPor: d.criadoPor,
          conferencias: { create: linhas.map((l) => ({ itemMedidoId: l.itemMedidoId, quantidadeConforme: l.conforme, quantidadeEmControversia: l.emControversia, motivo: l.motivo })) },
        },
        select: { id: true },
      });
      return { recebimentoId: r.id, sha256, conforme: conforme.toFixed(2), emControversia: controversia.toFixed(2) };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new Error("RECEBIMENTO-PROVISORIO-JA-REGISTRADO: outro recebimento provisório desta medição foi gravado no mesmo instante. Nada foi gravado.");
    throw e;
  }
}

export const zDecidirControversia = z.object({ conferenciaId: z.string().min(1), resultado: z.enum(["ACEITA", "REJEITADA"]), fundamento: z.string().trim().min(5), data: zDia, criadoPor: z.string().min(1) }).strict();
export type DecidirControversiaInput = z.input<typeof zDecidirControversia>;

/**
 * DECIDIR A CONTROVÉRSIA — o recebedor definitivo designado, que não é quem recebeu provisoriamente. ACEITA: a
 * quantidade fica elegível ao definitivo (o complemento, nunca a medição inteira de novo). REJEITADA: glosa
 * confirmada; o registro da divergência fica e a quantidade não é liberada por efeito desta decisão.
 */
export async function decidirControversia(prisma: PrismaClient, input: DecidirControversiaInput): Promise<{ readonly decisaoId: string; readonly sha256: string; readonly quantidade: string; readonly valor: string }> {
  const d = zDecidirControversia.parse(input);
  if (d.data > hoje()) throw new Error("DATA-FUTURA: a decisão tem a data de hoje ou anterior. Nada foi gravado.");
  try {
    return await prisma.$transaction(async (tx) => {
      await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.decidirControversia, "ENTE");
      const conf = await tx.conferenciaDoItemMedido.findUnique({ where: { id: d.conferenciaId }, select: { id: true, quantidadeEmControversia: true, motivo: true, decisao: { select: { id: true } }, recebimentoProvisorio: { select: { data: true, criadoPor: true } }, medido: { select: { valorUnitario: true, itemDaOrdem: { select: { itemDoContrato: { select: { numero: true, descricao: true, unidade: true } } } }, medicao: { select: { numero: true, ordem: { select: { numero: true, ano: true, contratoId: true, contrato: { select: { numeroContrato: true } } } } } } } } } });
      if (conf === null) throw new Error(`Conferência ${d.conferenciaId} não existe. Nada foi gravado.`);
      const c = await contratoTravado(tx, conf.medido.medicao.ordem.contratoId);
      const recebedor = await exigirDesignacao(tx, c, d.criadoPor, "RECEBEDOR_DEFINITIVO", hoje());
      if (new Decimal(conf.quantidadeEmControversia.toFixed(4)).lte(0)) throw new Error(`SEM-CONTROVERSIA: o item ${conf.medido.itemDaOrdem.itemDoContrato.numero} não tem quantidade em controvérsia. Nada foi gravado.`);
      if (conf.decisao !== null) throw new Error(`CONTROVERSIA-JA-DECIDIDA: a controvérsia do item ${conf.medido.itemDaOrdem.itemDoContrato.numero} já foi decidida. Nada foi gravado.`);
      if (conf.recebimentoProvisorio.criadoPor === d.criadoPor) throw new Error("QUEM-RECEBEU-PROVISORIAMENTE-NAO-DECIDE: a controvérsia apontada no recebimento provisório é decidida por outra pessoa (o recebedor definitivo). Nada foi gravado.");
      if (d.data < diaCivil(conf.recebimentoProvisorio.data)) throw new Error("DECISAO-ANTES-DO-PROVISORIO: a decisão não pode ser anterior ao recebimento provisório. Nada foi gravado.");
      const quantidade = q4(conf.quantidadeEmControversia.toFixed(4));
      const valor = toMoney(new Decimal(quantidade).times(conf.medido.valorUnitario.toFixed(4))).toFixed(2);
      const who = await nomeEAto(tx, recebedor.id);
      const { manifesto, sha256 } = manifestoCanonico({
        documento: d.resultado === "ACEITA" ? "DECISAO_DE_ACEITACAO" : "TERMO_DE_RECUSA",
        ente: await nomeDoEnteNosDocumentos(tx),
        fundamento: "Lei 14.133/2021, art. 140, § 1º e art. 143",
        contrato: conf.medido.medicao.ordem.contrato.numeroContrato,
        ordem: { numero: conf.medido.medicao.ordem.numero, ano: conf.medido.medicao.ordem.ano },
        medicao: conf.medido.medicao.numero,
        item: { numero: conf.medido.itemDaOrdem.itemDoContrato.numero, descricao: conf.medido.itemDaOrdem.itemDoContrato.descricao, unidade: conf.medido.itemDaOrdem.itemDoContrato.unidade, quantidade, valor, motivoDaControversia: conf.motivo },
        resultado: d.resultado,
        fundamentoDaDecisao: d.fundamento,
        data: d.data,
        responsavel: { nome: who.nome, ato: who.ato, papel: "RECEBEDOR_DEFINITIVO" },
      });
      const dec = await tx.decisaoDeControversia.create({ data: { conferenciaId: conf.id, resultado: d.resultado, fundamento: d.fundamento, data: inicioDoDiaCivil(d.data), designacaoId: recebedor.id, manifesto: manifesto as object, sha256, criadoPor: d.criadoPor }, select: { id: true } });
      return { decisaoId: dec.id, sha256, quantidade, valor };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new Error("CONTROVERSIA-JA-DECIDIDA: outra decisão foi gravada no mesmo instante. Nada foi gravado.");
    throw e;
  }
}

export const zRegistrarRecebimentoDefinitivo = z
  .object({
    medicaoId: z.string().min(1),
    data: zDia,
    conclusao: z.string().trim().min(5, "Diga o que o termo comprova."),
    itens: z.array(z.object({ itemMedidoId: z.string().min(1), quantidade: zQuantidade }).strict()).min(1),
    criadoPor: z.string().min(1),
  })
  .strict();
export type RegistrarRecebimentoDefinitivoInput = z.input<typeof zRegistrarRecebimentoDefinitivo>;

/**
 * RECEBER DEFINITIVAMENTE (art. 140, I, b) — o recebedor designado, que não recebeu provisoriamente nem mediu esta
 * medição. Só o ELEGÍVEL: a quantidade em controvérsia ainda sem decisão bloqueia SÓ aquele item, nomeando a
 * providência (RE03), e a parte regular segue (RE04, art. 143). O complemento, depois da aceitação, é outro
 * recebimento — pelo que faltava, não pela medição inteira.
 */
export async function registrarRecebimentoDefinitivo(prisma: PrismaClient, input: RegistrarRecebimentoDefinitivoInput): Promise<{ readonly recebimentoId: string; readonly numero: number; readonly sha256: string; readonly valor: string; readonly pendencias: readonly string[] }> {
  const d = zRegistrarRecebimentoDefinitivo.parse(input);
  if (d.data > hoje()) throw new Error("DATA-FUTURA: o recebimento tem a data de hoje ou anterior. Nada foi gravado.");
  const ids = d.itens.map((i) => i.itemMedidoId);
  if (new Set(ids).size !== ids.length) throw new Error("ITEM-REPETIDO: cada item entra uma vez no recebimento. Nada foi gravado.");
  try {
    return await prisma.$transaction(async (tx) => {
      await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarRecebimentoDefinitivo, "ENTE");
      const alvo = await tx.medicaoDaOrdemDeServico.findUnique({ where: { id: d.medicaoId }, select: { ordem: { select: { contratoId: true } } } });
      if (alvo === null) throw new Error(`Medição ${d.medicaoId} não existe. Nada foi gravado.`);
      const c = await contratoTravado(tx, alvo.ordem.contratoId);
      // ⚠️ DENTRO DA TRANSAÇÃO (RE02): sem designação de recebedor vigente hoje, recusa antes de ler o elegível.
      const recebedor = await exigirDesignacao(tx, c, d.criadoPor, "RECEBEDOR_DEFINITIVO", hoje());
      const m = await medicaoComContexto(tx, d.medicaoId);
      if (m.recebimentoProvisorio === null) throw new Error(`SEM-RECEBIMENTO-PROVISORIO: a medição nº ${m.numero} da ordem nº ${m.ordem.numero} ainda não foi recebida provisoriamente pelo fiscal; o definitivo vem depois dele. Nada foi gravado.`);
      if (m.recebimentoProvisorio.criadoPor === d.criadoPor || m.criadoPor === d.criadoPor) throw new Error("QUEM-MEDIU-OU-RECEBEU-PROVISORIAMENTE-NAO-RECEBE-DEFINITIVAMENTE: o art. 140 separa quem acompanha e fiscaliza de quem recebe em definitivo. Nada foi gravado.");
      if (d.data < diaCivil(m.recebimentoProvisorio.data)) throw new Error("DEFINITIVO-ANTES-DO-PROVISORIO: o recebimento definitivo não pode ser anterior ao provisório. Nada foi gravado.");
      const linhas = d.itens.map((p) => {
        const i = m.itens.find((x) => x.id === p.itemMedidoId);
        if (i === undefined) throw new Error(`ITEM-DE-OUTRA-MEDICAO: o item ${p.itemMedidoId} não é da medição nº ${m.numero}. Nada foi gravado.`);
        const e = elegivelDoItemMedido(i);
        const pedido = new Decimal(p.quantidade);
        const rotulo = `item ${i.itemDaOrdem.itemDoContrato.numero} (${i.itemDaOrdem.itemDoContrato.descricao})`;
        if (pedido.gt(e.elegivel)) {
          if (e.pendenteDeDecisao.gt(0)) {
            throw new Error(`CONTROVERSIA-PENDENTE: no ${rotulo}, ${q4(e.pendenteDeDecisao)} ${i.itemDaOrdem.itemDoContrato.unidade} estão em controvérsia sem decisão, e só ${q4(e.elegivel)} é elegível agora. Receba a parte regular; a controvérsia se decide antes do complemento. Nada foi gravado.`);
          }
          if (e.glosado.gt(0)) {
            throw new Error(`GLOSA-CONFIRMADA: no ${rotulo}, ${q4(e.glosado)} ${i.itemDaOrdem.itemDoContrato.unidade} foram rejeitados; elegível ${q4(e.elegivel)}. Nada foi gravado.`);
          }
          throw new Error(`ACIMA-DO-ELEGIVEL: no ${rotulo}, elegível ${q4(e.elegivel)} (conforme + aceito − já recebido ${q4(e.recebido)}), pedido ${q4(pedido)}. Nada foi gravado.`);
        }
        return { itemMedidoId: i.id, item: i.itemDaOrdem.itemDoContrato.numero, descricao: i.itemDaOrdem.itemDoContrato.descricao, unidade: i.itemDaOrdem.itemDoContrato.unidade, quantidade: q4(pedido), valorUnitario: q4(i.valorUnitario.toFixed(4)), valor: toMoney(pedido.times(i.valorUnitario.toFixed(4))).toFixed(2) };
      });
      const pendencias = m.itens.flatMap((i) => {
        const e = elegivelDoItemMedido(i);
        const recebidoAgora = new Decimal(linhas.find((l) => l.itemMedidoId === i.id)?.quantidade ?? "0");
        const saidas: string[] = [];
        if (e.pendenteDeDecisao.gt(0)) saidas.push(`item ${i.itemDaOrdem.itemDoContrato.numero}: ${q4(e.pendenteDeDecisao)} ${i.itemDaOrdem.itemDoContrato.unidade} em controvérsia aguardando decisão`);
        if (e.elegivel.minus(recebidoAgora).gt(0)) saidas.push(`item ${i.itemDaOrdem.itemDoContrato.numero}: ${q4(e.elegivel.minus(recebidoAgora))} ${i.itemDaOrdem.itemDoContrato.unidade} elegível ainda não recebido`);
        return saidas;
      });
      const valor = sumMoney(linhas.map((l) => l.valor)).toFixed(2);
      const numero = (m.recebimentosDefinitivos[0]?.numero ?? 0) + 1;
      const who = await nomeEAto(tx, recebedor.id);
      const { manifesto, sha256 } = manifestoCanonico({
        documento: "TERMO_DE_RECEBIMENTO_DEFINITIVO",
        ente: await nomeDoEnteNosDocumentos(tx),
        fundamento: "Lei 14.133/2021, art. 140, I, b",
        contrato: { numero: m.ordem.contrato.numeroContrato, contratado: m.ordem.contrato.contratadoNome, documentoDoContratado: m.ordem.contrato.contratadoDocumento },
        ordem: { numero: m.ordem.numero, ano: m.ordem.ano },
        medicao: { numero: m.numero, periodo: { inicio: diaCivil(m.periodoInicio), fim: diaCivil(m.periodoFim) } },
        recebimento: numero,
        data: d.data,
        responsavel: { nome: who.nome, ato: who.ato, papel: "RECEBEDOR_DEFINITIVO" },
        conclusao: d.conclusao,
        itens: linhas.map(({ itemMedidoId: _, ...l }) => l),
        valor,
        pendencias,
      });
      const r = await tx.recebimentoDefinitivo.create({
        data: { medicaoId: m.id, numero, data: inicioDoDiaCivil(d.data), designacaoId: recebedor.id, conclusao: d.conclusao, manifesto: manifesto as object, sha256, criadoPor: d.criadoPor, itens: { create: linhas.map((l) => ({ itemMedidoId: l.itemMedidoId, quantidade: l.quantidade, valor: l.valor })) } },
        select: { id: true },
      });
      return { recebimentoId: r.id, numero, sha256, valor, pendencias };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new Error("RECEBIMENTO-DEFINITIVO-CONCORRENTE: outro recebimento desta medição foi gravado no mesmo instante; recarregue e confira o elegível. Nada foi gravado.");
    throw e;
  }
}
