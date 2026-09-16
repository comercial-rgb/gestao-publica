import { z } from "zod";
import { Decimal, sumMoney, toMoney } from "../../packages/contracts/index.js";
import { diaCivil, diaCivilBr } from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { nomeDoEnteNosDocumentos } from "../m16-travamento/apresentacao-do-ente.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { gravarAnexoNaTransacao } from "../m22-documentos/anexos.js";
import { contratoTravado, exigirDesignacao, zEvidencia } from "./fiscalizacao.js";
import { gravarMedicaoDaOrdemNaTransacao, manifestoCanonico, medidoLiquido, nomeEAto, preCondicoesDaMedicaoDaOrdem, SELECAO_DO_MEDIDO } from "./ordem-de-servico.js";

/**
 * ═══ M11 — A MEDIÇÃO DA ORDEM DE SERVIÇO PELA PLANILHA ORÇAMENTÁRIA DA OBRA (V7 M2 U7) ═══
 *
 * O CAMINHO continua o da ponte: contrato → planilha da obra (U6) com o VÍNCULO explícito serviço ↔ item do contrato →
 * ordem de serviço emitida (U1) → **o fiscal mede a ordem pelos serviços da versão aplicável** → recebimento provisório,
 * decisão e definitivo (U2) → liquidação da parcela pelo M05 (U3). Esta frente não cria outra medição, outro saldo nem
 * outro caminho de dinheiro: a quantidade do serviço vira a quantidade do item medido da ordem, pelo núcleo
 * `gravarMedicaoDaOrdemNaTransacao` (autorizado, vigência, suspensão, regime de período, unitário do contrato no primeiro
 * dia — ME06). Por cima dele, o que é da planilha:
 *
 *   · VERSÃO APLICÁVEL: a última versão da obra com vigência até o PRIMEIRO dia do período; o período não atravessa a
 *     vigência da seguinte (`PERIODO-ATRAVESSA-NOVA-VERSAO`). A pessoa escolhe a versão; o servidor confere que é ela
 *     (`VERSAO-NAO-APLICAVEL`) — nada é escolhido "pela mais recente" por conveniência.
 *   · CONCILIAÇÃO (`conciliarServico`, pura, a MESMA para a tela e para o ato): serviço (não grupo), com exatamente UM
 *     vínculo vivo, cujo item do contrato não está ligado a outro serviço na mesma versão, com a MESMA unidade, e que é
 *     item desta ordem. Qualquer outra relação é recusada nomeando o serviço e o motivo — quantidade não se converte
 *     entre unidades, e dois serviços não se somam num item.
 *   · PREVISTO NA PLANILHA: o acumulado do CÓDIGO na obra (atravessando as versões, sem medições estornadas) + a
 *     medição ≤ a quantidade da versão aplicável (`ACIMA-DO-PREVISTO-NA-PLANILHA`). O autorizado da ordem continua
 *     valendo por cima (`ITEM-ACIMA-DO-AUTORIZADO-NA-ORDEM`).
 *   · MEMÓRIA: manifesto + sha256 com versão, data-base e referência de preços, previsto/anterior/atual/acumulado/saldo,
 *     preço da planilha e unitário do contrato lado a lado, vínculo usado, arredondamento e evidências. O VALOR que se
 *     recebe e liquida é o do contrato (quantidade × unitário vigente do item); o da planilha é referência de orçamento.
 *     Nenhum fator (desconto, BDI, reajuste) é inventado entre os dois.
 *
 * ⚠️ Quem pratica: o FISCAL designado vigente hoje (e no dia do fato), com REGISTRAR_MEDICAO_DE_OBRA. Idempotência de
 * comando é da borda (`comComandoDoFormulario`); a mesma parcela com outra chave esgota o previsto/autorizado.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

const zDia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A data é um DIA civil AAAA-MM-DD.");
const zQuantidade = z.string().trim().regex(/^\d+(\.\d{1,4})?$/, "Quantidade com até 4 casas, ponto decimal.");
const br = (dia: string): string => dia.split("-").reverse().join("/");
const q4 = (d: Decimal.Value): string => new Decimal(d).toFixed(4);
const hoje = (): string => diaCivil(new Date());
const unidadeNormal = (u: string): string => u.trim().toLowerCase().replace(/\s+/g, " ");

export const ARREDONDAMENTO_DA_MEMORIA = "valor por linha = quantidade × unitário, arredondado uma vez aos centavos (meio para o par); total = soma das linhas";

// ═══════════════════════════════════════════════════════════════════════════════
// A CONCILIAÇÃO — pura; a tela e o ato usam a mesma
// ═══════════════════════════════════════════════════════════════════════════════

export interface ServicoParaConciliar {
  readonly id: string;
  readonly codigo: string;
  readonly tipo: string;
  readonly descricao: string;
  readonly unidade: string | null;
  readonly vinculosVivos: readonly { readonly id: string; readonly motivo: string; readonly itemDoContrato: { readonly id: string; readonly numero: number; readonly descricao: string; readonly unidade: string } }[];
}

export type Conciliacao =
  | { readonly apto: true; readonly vinculoId: string; readonly vinculoMotivo: string; readonly itemDoContrato: { readonly id: string; readonly numero: number; readonly descricao: string; readonly unidade: string }; readonly itemDaOrdemId: string }
  | { readonly apto: false; readonly recusa: string; readonly motivo: string };

/**
 * @param servicosPorItemDoContrato os CÓDIGOS dos serviços da MESMA versão com vínculo vivo a cada item do contrato.
 * @param itensDaOrdem item do contrato → item da ordem.
 */
export function conciliarServico(s: ServicoParaConciliar, servicosPorItemDoContrato: ReadonlyMap<string, readonly string[]>, itensDaOrdem: ReadonlyMap<string, string>, ordem: string): Conciliacao {
  if (s.tipo !== "SERVICO") return { apto: false, recusa: "MEDICAO-DE-GRUPO", motivo: `o item ${s.codigo} é grupo; mede-se o serviço` };
  if (s.vinculosVivos.length === 0) return { apto: false, recusa: "SERVICO-SEM-VINCULO", motivo: `o serviço ${s.codigo} não tem vínculo vivo com item do contrato nesta versão da planilha (a engenharia vincula na página da versão)` };
  if (s.vinculosVivos.length > 1) return { apto: false, recusa: "VINCULO-AMBIGUO", motivo: `o serviço ${s.codigo} está vinculado a ${s.vinculosVivos.length} itens do contrato (${s.vinculosVivos.map((v) => v.itemDoContrato.numero).join(", ")}); a quantidade não se reparte sem regra` };
  const v = s.vinculosVivos[0]!;
  const outros = servicosPorItemDoContrato.get(v.itemDoContrato.id) ?? [];
  if (outros.length > 1) return { apto: false, recusa: "VINCULO-AMBIGUO", motivo: `o item ${v.itemDoContrato.numero} do contrato está vinculado a ${outros.length} serviços desta versão (${outros.join(", ")}); quantidades de serviços diferentes não se somam num item` };
  if (s.unidade === null || unidadeNormal(s.unidade) !== unidadeNormal(v.itemDoContrato.unidade)) {
    return { apto: false, recusa: "UNIDADE-NAO-CONCILIADA", motivo: `o serviço ${s.codigo} é medido em "${s.unidade ?? "sem unidade"}" e o item ${v.itemDoContrato.numero} do contrato em "${v.itemDoContrato.unidade}"; o sistema não converte unidades` };
  }
  const itemDaOrdemId = itensDaOrdem.get(v.itemDoContrato.id);
  if (itemDaOrdemId === undefined) return { apto: false, recusa: "ITEM-FORA-DA-ORDEM", motivo: `o serviço ${s.codigo} corresponde ao item ${v.itemDoContrato.numero} do contrato, que não está autorizado na ordem nº ${ordem}` };
  return { apto: true, vinculoId: v.id, vinculoMotivo: v.motivo, itemDoContrato: v.itemDoContrato, itemDaOrdemId };
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEITURAS COMPARTILHADAS — versões da obra, serviços e acumulado por código
// ═══════════════════════════════════════════════════════════════════════════════

const SERVICO_SELECT = {
  id: true, planilhaId: true, codigo: true, tipo: true, descricao: true, unidade: true, quantidade: true, precoUnitario: true, ordem: true,
  vinculos: { where: { revogacao: null }, select: { id: true, motivo: true, itemDoContrato: { select: { id: true, numero: true, descricao: true, unidade: true, contratoId: true } } } },
} as const;

/** A versão aplicável da obra ao período e a seguinte que começa dentro dele (se houver). */
async function versoesDoPeriodo(tx: Tx, obraId: string, diaInicio: string, diaFim: string) {
  const versoes = await tx.planilhaOrcamentariaDaObra.findMany({ where: { obraId }, orderBy: { versao: "asc" }, select: { id: true, versao: true, vigenciaInicio: true } });
  const aplicavel = versoes.filter((v) => diaCivil(v.vigenciaInicio) <= diaInicio).at(-1) ?? null;
  const seguinte = aplicavel === null ? null : (versoes.find((v) => v.versao > aplicavel.versao && diaCivil(v.vigenciaInicio) <= diaFim) ?? null);
  return { aplicavel, seguinte };
}

/** Σ quantidade medida por CÓDIGO na obra (todas as versões), sem as medições estornadas. */
async function acumuladoPorCodigo(tx: Tx, obraId: string, codigos: readonly string[]): Promise<Map<string, Decimal>> {
  const medidos = await tx.itemMedidoDaOrdemNaPlanilha.findMany({
    where: { codigo: { in: [...codigos] }, medicaoNaPlanilha: { planilha: { obraId } }, itemMedido: { medicao: { estorno: null } } },
    select: { codigo: true, quantidade: true },
  });
  const m = new Map<string, Decimal>();
  for (const x of medidos) m.set(x.codigo, (m.get(x.codigo) ?? new Decimal(0)).plus(x.quantidade.toFixed(4)));
  return m;
}

function porItemDoContrato(servicos: readonly { readonly codigo: string; readonly tipo: string; readonly vinculos: readonly { readonly itemDoContrato: { readonly id: string } }[] }[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const s of servicos) if (s.tipo === "SERVICO") for (const v of s.vinculos) m.set(v.itemDoContrato.id, [...(m.get(v.itemDoContrato.id) ?? []), s.codigo]);
  return m;
}

// ═══════════════════════════════════════════════════════════════════════════════
// O ATO
// ═══════════════════════════════════════════════════════════════════════════════

export const zMedirOrdemPelaPlanilha = z
  .object({
    ordemId: z.string().min(1),
    planilhaId: z.string().min(1),
    diaInicio: zDia,
    diaFim: zDia,
    observacao: z.string().trim().min(1).optional(),
    // ⚠️ ESTRITO: o serviço e a quantidade. Item do contrato, unitário e vínculo saem do banco — um campo a mais é recusado.
    itens: z.array(z.object({ itemDaPlanilhaId: z.string().min(1), quantidade: zQuantidade }).strict()).min(1),
    evidencias: z.array(zEvidencia).max(10).default([]),
    criadoPor: z.string().min(1),
  })
  .strict();
export type MedirOrdemPelaPlanilhaInput = z.input<typeof zMedirOrdemPelaPlanilha>;

export interface ResultadoDaMedicaoPelaPlanilha {
  readonly medicaoId: string;
  readonly numero: number;
  readonly versao: number;
  readonly valor: string;
  readonly valorNaPlanilha: string;
  readonly sha256: string;
  readonly evidencias: number;
  readonly itens: readonly { readonly codigo: string; readonly item: number; readonly quantidade: string; readonly acumulado: string; readonly saldoNaPlanilha: string; readonly aExecutarNaOrdem: string }[];
}

export async function medirOrdemPelaPlanilha(prisma: PrismaClient, input: MedirOrdemPelaPlanilhaInput): Promise<ResultadoDaMedicaoPelaPlanilha> {
  const d = zMedirOrdemPelaPlanilha.parse(input);
  preCondicoesDaMedicaoDaOrdem(d, d.itens.map((i) => i.itemDaPlanilhaId));
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.medirOrdemPelaPlanilha, "ENTE");
    const alvo = await tx.ordemDeServicoDoContrato.findUnique({ where: { id: d.ordemId }, select: { contratoId: true } });
    if (alvo === null) throw new Error(`Ordem de serviço ${d.ordemId} não existe. Nada foi gravado.`);
    const c = await contratoTravado(tx, alvo.contratoId);
    const fiscal = await exigirDesignacao(tx, c, d.criadoPor, "FISCAL", hoje());

    const planilha = await tx.planilhaOrcamentariaDaObra.findUnique({
      where: { id: d.planilhaId },
      select: { id: true, obraId: true, versao: true, descricao: true, vigenciaInicio: true, dataBaseDosPrecos: true, referenciaDePrecos: true, sha256: true, contratoId: true, obra: { select: { identificador: true, descricao: true } } },
    });
    if (planilha === null) throw new Error(`PLANILHA-INEXISTENTE: a versão de planilha indicada não existe. Nada foi gravado.`);
    if (planilha.contratoId !== c.id) {
      throw new Error(`PLANILHA-DE-OUTRO-CONTRATO: a versão ${planilha.versao} da planilha da obra ${planilha.obra.identificador} não declara o contrato ${c.numeroContrato}; a medição da ordem só usa planilha deste contrato. Nada foi gravado.`);
    }
    const { aplicavel, seguinte } = await versoesDoPeriodo(tx, planilha.obraId, d.diaInicio, d.diaFim);
    if (aplicavel === null) throw new Error(`SEM-VERSAO-VIGENTE-NO-PERIODO: a obra ${planilha.obra.identificador} não tem versão da planilha valendo em ${br(d.diaInicio)}. Nada foi gravado.`);
    if (aplicavel.id !== planilha.id) {
      throw new Error(`VERSAO-NAO-APLICAVEL: o período começa em ${br(d.diaInicio)}, e nessa data vale a versão ${aplicavel.versao} da planilha da obra ${planilha.obra.identificador} (desde ${diaCivilBr(aplicavel.vigenciaInicio)}), não a versão ${planilha.versao}. Nada foi gravado.`);
    }
    if (seguinte !== null) {
      throw new Error(`PERIODO-ATRAVESSA-NOVA-VERSAO: a versão ${seguinte.versao} da planilha vale desde ${diaCivilBr(seguinte.vigenciaInicio)}, dentro do período ${br(d.diaInicio)} a ${br(d.diaFim)}. Meça em dois períodos. Nada foi gravado.`);
    }

    const [servicosDaVersao, ordem] = await Promise.all([
      tx.itemDaPlanilhaOrcamentaria.findMany({ where: { planilhaId: planilha.id }, select: SERVICO_SELECT }),
      tx.ordemDeServicoDoContrato.findUniqueOrThrow({ where: { id: d.ordemId }, select: { numero: true, ano: true, finalidade: true, itens: { select: { id: true, itemDoContratoId: true } }, contrato: { select: { numeroContrato: true, contratadoNome: true, contratadoDocumento: true } } } }),
    ]);
    const mapaPorItem = porItemDoContrato(servicosDaVersao);
    const itensDaOrdem = new Map(ordem.itens.map((i) => [i.itemDoContratoId, i.id]));
    const rotuloDaOrdem = `${ordem.numero}/${ordem.ano}`;
    const acumulado = await acumuladoPorCodigo(tx, planilha.obraId, servicosDaVersao.map((s) => s.codigo));

    const pedidos = d.itens.map((p) => {
      const s = servicosDaVersao.find((x) => x.id === p.itemDaPlanilhaId);
      if (s === undefined) throw new Error(`ITEM-DE-OUTRA-VERSAO: o serviço indicado não é da versão ${planilha.versao} da planilha da obra ${planilha.obra.identificador}. Nada foi gravado.`);
      const conc = conciliarServico({ ...s, vinculosVivos: s.vinculos }, mapaPorItem, itensDaOrdem, rotuloDaOrdem);
      if (!conc.apto) throw new Error(`${conc.recusa}: ${conc.motivo}. Nada foi gravado.`);
      const previsto = new Decimal(s.quantidade!.toFixed(4));
      const anterior = acumulado.get(s.codigo) ?? new Decimal(0);
      const depois = anterior.plus(p.quantidade);
      if (depois.gt(previsto)) {
        throw new Error(
          `ACIMA-DO-PREVISTO-NA-PLANILHA: o serviço ${s.codigo} (${s.descricao}) prevê ${q4(previsto)} ${s.unidade} na versão ${planilha.versao}, já mediu ${q4(anterior)} na obra e esta medição levaria a ${q4(depois)}. ` +
            `Quantidade acima do previsto exige nova versão da planilha (e o aditivo que a sustente). Nada foi gravado.`
        );
      }
      const precoDaPlanilha = new Decimal(s.precoUnitario!.toFixed(4));
      return { servico: s, conc, quantidade: q4(p.quantidade), previsto, anterior, depois, precoDaPlanilha, valorNaPlanilha: toMoney(new Decimal(p.quantidade).times(precoDaPlanilha)) };
    });

    const g = await gravarMedicaoDaOrdemNaTransacao(tx, c, fiscal, {
      ordemId: d.ordemId, diaInicio: d.diaInicio, diaFim: d.diaFim, observacao: d.observacao, criadoPor: d.criadoPor,
      itens: pedidos.map((p) => ({ itemDaOrdemId: (p.conc as Extract<Conciliacao, { apto: true }>).itemDaOrdemId, quantidade: p.quantidade })),
    });

    const evidencias: { nome: string; sha256: string }[] = [];
    for (const ev of d.evidencias) {
      const a = await gravarAnexoNaTransacao(tx, { nomeOriginal: ev.nomeOriginal, mimeType: ev.mimeType, conteudo: ev.conteudo, origem: "UPLOAD", medicaoDaOrdemId: g.medicaoId, criadoPor: d.criadoPor });
      evidencias.push({ nome: ev.nomeOriginal, sha256: a.sha256 });
    }

    const linhas = pedidos.map((p) => {
      const conc = p.conc as Extract<Conciliacao, { apto: true }>;
      const gl = g.linhas.find((l) => l.itemDaOrdemId === conc.itemDaOrdemId)!;
      return { p, conc, gl };
    });
    const totalContrato = g.valor;
    const totalPlanilha = sumMoney(linhas.map((l) => l.p.valorNaPlanilha)).toFixed(2);
    const f = await nomeEAto(tx, fiscal.id);
    const { manifesto, sha256 } = manifestoCanonico({
      documento: "MEMORIA_DA_MEDICAO",
      ente: await nomeDoEnteNosDocumentos(tx),
      contrato: { numero: ordem.contrato.numeroContrato, contratado: ordem.contrato.contratadoNome, documentoDoContratado: ordem.contrato.contratadoDocumento },
      ordem: { numero: ordem.numero, ano: ordem.ano, finalidade: ordem.finalidade },
      obra: { identificador: planilha.obra.identificador, descricao: planilha.obra.descricao },
      planilha: { versao: planilha.versao, descricao: planilha.descricao, vigenciaInicio: diaCivil(planilha.vigenciaInicio), dataBaseDosPrecos: diaCivil(planilha.dataBaseDosPrecos), referenciaDePrecos: planilha.referenciaDePrecos, sha256: planilha.sha256 },
      medicao: { numero: g.numero, periodo: { inicio: d.diaInicio, fim: d.diaFim }, registradaEm: hoje() },
      responsavel: { nome: f.nome, ato: f.ato, papel: "FISCAL" },
      observacao: d.observacao ?? null,
      itens: linhas.map(({ p, conc, gl }) => ({
        codigo: p.servico.codigo, descricao: p.servico.descricao, unidade: p.servico.unidade,
        previstoNaVersao: q4(p.previsto), anteriorNaObra: q4(p.anterior), atual: p.quantidade, acumulado: q4(p.depois), saldoNaPlanilha: q4(p.previsto.minus(p.depois)),
        precoDaPlanilha: q4(p.precoDaPlanilha), valorNaPlanilha: p.valorNaPlanilha.toFixed(2),
        itemDoContrato: { numero: conc.itemDoContrato.numero, descricao: conc.itemDoContrato.descricao, unidade: conc.itemDoContrato.unidade },
        vinculo: { motivo: conc.vinculoMotivo },
        autorizadoNaOrdem: gl.autorizado, anteriorNaOrdem: gl.anterior, aExecutarNaOrdem: gl.restante,
        unitarioDoContrato: gl.valorUnitario, valorNoContrato: gl.valor,
      })),
      totais: { contrato: totalContrato, planilha: totalPlanilha },
      arredondamento: ARREDONDAMENTO_DA_MEMORIA,
      evidencias,
    });
    await tx.medicaoDaOrdemNaPlanilha.create({
      data: {
        medicaoId: g.medicaoId, planilhaId: planilha.id, manifesto: manifesto as object, sha256, criadoPor: d.criadoPor,
        itens: { create: linhas.map(({ p, conc, gl }) => ({ itemMedidoId: gl.itemMedidoId, itemDaPlanilhaId: p.servico.id, vinculoId: conc.vinculoId, codigo: p.servico.codigo, quantidade: p.quantidade, precoDaPlanilha: q4(p.precoDaPlanilha), valorNaPlanilha: p.valorNaPlanilha.toFixed(2) })) },
      },
    });
    return {
      medicaoId: g.medicaoId, numero: g.numero, versao: planilha.versao, valor: totalContrato, valorNaPlanilha: totalPlanilha, sha256, evidencias: evidencias.length,
      itens: linhas.map(({ p, gl }) => ({ codigo: p.servico.codigo, item: gl.item, quantidade: p.quantidade, acumulado: q4(p.depois), saldoNaPlanilha: q4(p.previsto.minus(p.depois)), aExecutarNaOrdem: gl.restante })),
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEITURAS PARA A TELA
// ═══════════════════════════════════════════════════════════════════════════════

export interface LinhaDaMedicaoPelaPlanilha {
  readonly itemDaPlanilhaId: string;
  readonly codigo: string;
  readonly descricao: string;
  readonly unidade: string;
  readonly previsto: string;
  readonly anterior: string;
  readonly saldo: string;
  readonly precoDaPlanilha: string;
  /** Apto: o item do contrato e o que ainda falta executar na ordem. Não apto: o motivo, com a recusa do servidor. */
  readonly conciliacao: { readonly apto: true; readonly itemDoContrato: string; readonly aExecutarNaOrdem: string } | { readonly apto: false; readonly recusa: string; readonly motivo: string };
}

export interface VersaoParaMedir {
  readonly planilhaId: string;
  readonly obraId: string;
  readonly obra: string;
  readonly versao: number;
  readonly vigenciaInicio: string;
  /** A vigência da versão seguinte da obra, se houver: o período medido por esta termina antes dela. */
  readonly ateAntesDe: string | null;
  readonly linhas: readonly LinhaDaMedicaoPelaPlanilha[];
}

/**
 * As versões de planilha que declaram o contrato da ordem, com os serviços e a conciliação de cada um contra esta
 * ordem — a mesma `conciliarServico` do ato. Sem planilha para o contrato, lista vazia (a tela não oferece o formulário).
 */
export async function versoesParaMedirAOrdem(prisma: Tx, ordemId: string): Promise<readonly VersaoParaMedir[]> {
  const ordem = await prisma.ordemDeServicoDoContrato.findUnique({
    where: { id: ordemId },
    select: { numero: true, ano: true, contratoId: true, itens: { select: { id: true, itemDoContratoId: true, quantidade: true, cancelamentos: { select: { quantidade: true } }, medidosNaOrdem: SELECAO_DO_MEDIDO } } },
  });
  if (ordem === null) return [];
  const versoes = await prisma.planilhaOrcamentariaDaObra.findMany({
    where: { contratoId: ordem.contratoId },
    orderBy: [{ obraId: "asc" }, { versao: "asc" }],
    select: { id: true, obraId: true, versao: true, vigenciaInicio: true, obra: { select: { identificador: true } }, itens: { where: { tipo: "SERVICO" }, orderBy: { ordem: "asc" }, select: SERVICO_SELECT } },
  });
  const todasDasObras = await prisma.planilhaOrcamentariaDaObra.findMany({ where: { obraId: { in: [...new Set(versoes.map((v) => v.obraId))] } }, select: { obraId: true, versao: true, vigenciaInicio: true } });
  const itensDaOrdem = new Map(ordem.itens.map((i) => [i.itemDoContratoId, i.id]));
  // ⚠️ `medidoLiquido` (V9 N4): a quantidade glosada devolve saldo, aqui como no guard da medição
  // pela tela. Somar o bruto aqui faria a planilha e a tela discordarem sobre o mesmo item.
  const aExecutar = new Map(ordem.itens.map((i) => [i.id, new Decimal(i.quantidade.toFixed(4)).minus(i.cancelamentos.reduce((t, x) => t.plus(x.quantidade.toFixed(4)), new Decimal(0))).minus(medidoLiquido(i.medidosNaOrdem))]));
  const saida: VersaoParaMedir[] = [];
  for (const v of versoes) {
    const acumulado = await acumuladoPorCodigo(prisma, v.obraId, v.itens.map((s) => s.codigo));
    const mapa = porItemDoContrato(v.itens);
    const seguinte = todasDasObras.filter((x) => x.obraId === v.obraId && x.versao > v.versao).sort((a, b) => a.versao - b.versao)[0];
    saida.push({
      planilhaId: v.id, obraId: v.obraId, obra: v.obra.identificador, versao: v.versao, vigenciaInicio: diaCivil(v.vigenciaInicio), ateAntesDe: seguinte === undefined ? null : diaCivil(seguinte.vigenciaInicio),
      linhas: v.itens.map((s) => {
        const previsto = new Decimal(s.quantidade!.toFixed(4));
        const anterior = acumulado.get(s.codigo) ?? new Decimal(0);
        const conc = conciliarServico({ ...s, vinculosVivos: s.vinculos }, mapa, itensDaOrdem, `${ordem.numero}/${ordem.ano}`);
        return {
          itemDaPlanilhaId: s.id, codigo: s.codigo, descricao: s.descricao, unidade: s.unidade ?? "", previsto: q4(previsto), anterior: q4(anterior), saldo: q4(previsto.minus(anterior)), precoDaPlanilha: q4(s.precoUnitario!.toFixed(4)),
          conciliacao: conc.apto ? { apto: true as const, itemDoContrato: `${conc.itemDoContrato.numero} — ${conc.itemDoContrato.descricao}`, aExecutarNaOrdem: q4(aExecutar.get(conc.itemDaOrdemId) ?? 0) } : { apto: false as const, recusa: conc.recusa, motivo: conc.motivo },
        };
      }),
    });
  }
  return saida;
}

export interface AndamentoDaPlanilha {
  readonly servicos: readonly { readonly codigo: string; readonly descricao: string; readonly unidade: string; readonly previsto: string; readonly medido: string; readonly saldo: string; readonly valorMedidoNaPlanilha: string }[];
  readonly medicoes: readonly { readonly medicaoId: string; readonly contratoId: string; readonly ordemId: string; readonly ordem: string; readonly numero: number; readonly versao: number; readonly periodo: string; readonly valorNoContrato: string; readonly valorNaPlanilha: string; readonly situacao: "ESTORNADA" | "AGUARDANDO_PROVISORIO" | "RECEBIDA_PROVISORIAMENTE" | "COM_RECEBIMENTO_DEFINITIVO" }[];
}

/**
 * O ANDAMENTO DA OBRA na versão: por serviço desta versão, o previsto, o medido acumulado na obra pelo código (todas as
 * versões, sem estornadas) e o saldo; e as medições de ordem feitas pelas versões da obra, com a situação do recebimento.
 * Físico por serviço; o financeiro (conforme, controvérsia, recebido, liquidado) está na página da ordem.
 */
export async function andamentoDaPlanilha(prisma: Tx, planilhaId: string): Promise<AndamentoDaPlanilha | null> {
  const v = await prisma.planilhaOrcamentariaDaObra.findUnique({ where: { id: planilhaId }, select: { obraId: true, itens: { where: { tipo: "SERVICO" }, orderBy: { ordem: "asc" }, select: { codigo: true, descricao: true, unidade: true, quantidade: true } } } });
  if (v === null) return null;
  const [medidos, medicoes] = await Promise.all([
    prisma.itemMedidoDaOrdemNaPlanilha.findMany({ where: { medicaoNaPlanilha: { planilha: { obraId: v.obraId } }, itemMedido: { medicao: { estorno: null } } }, select: { codigo: true, quantidade: true, valorNaPlanilha: true } }),
    prisma.medicaoDaOrdemNaPlanilha.findMany({
      where: { planilha: { obraId: v.obraId } },
      orderBy: { criadoEm: "asc" },
      select: {
        planilha: { select: { versao: true } },
        itens: { select: { valorNaPlanilha: true } },
        medicao: { select: { id: true, numero: true, periodoInicio: true, periodoFim: true, estorno: { select: { id: true } }, recebimentoProvisorio: { select: { id: true } }, recebimentosDefinitivos: { select: { id: true } }, itens: { select: { valor: true } }, ordem: { select: { id: true, numero: true, ano: true, contratoId: true } } } },
      },
    }),
  ]);
  return {
    servicos: v.itens.map((i) => {
      const doCodigo = medidos.filter((m) => m.codigo === i.codigo);
      const medido = doCodigo.reduce((t, m) => t.plus(m.quantidade.toFixed(4)), new Decimal(0));
      const previsto = new Decimal(i.quantidade!.toFixed(4));
      return { codigo: i.codigo, descricao: i.descricao, unidade: i.unidade ?? "", previsto: q4(previsto), medido: q4(medido), saldo: q4(previsto.minus(medido)), valorMedidoNaPlanilha: sumMoney(doCodigo.map((m) => m.valorNaPlanilha.toFixed(2))).toFixed(2) };
    }),
    medicoes: medicoes.map((m) => ({
      medicaoId: m.medicao.id, contratoId: m.medicao.ordem.contratoId, ordemId: m.medicao.ordem.id, ordem: `${m.medicao.ordem.numero}/${m.medicao.ordem.ano}`, numero: m.medicao.numero, versao: m.planilha.versao,
      periodo: `${diaCivilBr(m.medicao.periodoInicio)} a ${diaCivilBr(m.medicao.periodoFim)}`,
      valorNoContrato: sumMoney(m.medicao.itens.map((x) => x.valor.toFixed(2))).toFixed(2), valorNaPlanilha: sumMoney(m.itens.map((x) => x.valorNaPlanilha.toFixed(2))).toFixed(2),
      situacao: m.medicao.estorno !== null ? "ESTORNADA" : m.medicao.recebimentosDefinitivos.length > 0 ? "COM_RECEBIMENTO_DEFINITIVO" : m.medicao.recebimentoProvisorio !== null ? "RECEBIDA_PROVISORIAMENTE" : "AGUARDANDO_PROVISORIO",
    })),
  };
}
