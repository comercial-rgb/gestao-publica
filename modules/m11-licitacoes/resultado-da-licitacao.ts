import { z } from "zod";
import { Decimal, toMoney, type Money } from "../../packages/contracts/index.js";
import { diaCivil } from "../../packages/datas/index.js";
import { normalizarDocumento } from "../../packages/documento/index.js";
import { travar } from "../../packages/locks/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { gravarContratoNaTransacao } from "./contratos.js";
import { zCadastrarContratoInput } from "./dominio.js";

/**
 * V39-R2 (R2-014 a 020; V39-041 a 046) — DO PROCESSO AO CONTRATO.
 *
 * Itens do processo, participantes (a PESSOA do cadastro único), propostas versionadas por item ou por lote, o ATO do
 * resultado (critério de julgamento da Lei 14.133/2021, art. 33, e a decisão por item), a adjudicação, a homologação
 * por ato com abrangência e correção, o contrato originado do resultado e a ata de registro de preços.
 *
 * ⚠️ O SISTEMA NÃO ESCOLHE O VENCEDOR. O ato diz quem venceu cada item; o serviço confere a coerência (a proposta do
 * vencedor existe, o valor final não é pior que o proposto pelo critério) e, quando há proposta mais vantajosa pelo
 * critério declarado, exige a justificativa — nunca troca o vencedor.
 * ⚠️ APPEND-ONLY. Proposta corrigida é versão nova; resultado corrigido é linha que substitui; homologação corrigida é
 * ato que corrige. Vigente é derivado.
 * ⚠️ UMA TRAVA: o processo. Todo ato que lê "o que vale" e grava em cima (resultado, adjudicação, homologação,
 * contrato, ata) trava o processo antes de ler — dois atos concorrentes não decidem sobre o mesmo estado.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export const CRITERIOS_DE_JULGAMENTO = ["MENOR_PRECO", "MAIOR_DESCONTO", "MELHOR_TECNICA", "TECNICA_E_PRECO", "MAIOR_LANCE", "MAIOR_RETORNO_ECONOMICO"] as const;
export type CriterioDeJulgamento = (typeof CRITERIOS_DE_JULGAMENTO)[number];
export const ROTULO_DO_CRITERIO: Readonly<Record<CriterioDeJulgamento, string>> = {
  MENOR_PRECO: "Menor preço",
  MAIOR_DESCONTO: "Maior desconto",
  MELHOR_TECNICA: "Melhor técnica ou conteúdo artístico",
  TECNICA_E_PRECO: "Técnica e preço",
  MAIOR_LANCE: "Maior lance",
  MAIOR_RETORNO_ECONOMICO: "Maior retorno econômico",
};
/** Pelo critério, o que é "mais vantajoso" no valor unitário: o menor, o maior, ou não se compara só pelo preço. */
const SENTIDO_DO_CRITERIO: Readonly<Record<CriterioDeJulgamento, "MENOR" | "MAIOR" | null>> = {
  MENOR_PRECO: "MENOR",
  MAIOR_DESCONTO: "MENOR",
  MELHOR_TECNICA: null,
  TECNICA_E_PRECO: null,
  MAIOR_LANCE: "MAIOR",
  MAIOR_RETORNO_ECONOMICO: null,
};

const zQuantidade = z.string().trim().regex(/^\d+(\.\d{1,4})?$/, "Quantidade com até quatro casas decimais.").refine((v) => new Decimal(v).greaterThan(0), "A quantidade deve ser maior que zero.");
const zUnitario = z.string().trim().regex(/^\d+(\.\d{1,4})?$/, "Valor unitário com até quatro casas decimais.").refine((v) => new Decimal(v).greaterThan(0), "O valor unitário deve ser maior que zero.");
const zData = z.coerce.date();
const zTexto = (min: number, msg: string) => z.string().trim().min(min, msg).max(500);
const nada = " Nada foi gravado.";

async function processoExistente(tx: Tx, processoId: string): Promise<{ readonly id: string; readonly numeroProcesso: string }> {
  const p = await tx.processoLicitatorio.findUnique({ where: { id: processoId }, select: { id: true, numeroProcesso: true } });
  if (p === null) throw new Error(`O processo ${processoId} não existe.${nada}`);
  return p;
}

// ── Leitura do que vale ─────────────────────────────────────────────────────────────────────────────

/** As linhas de resultado VIGENTES (não substituídas) do processo, por item. */
async function resultadosVigentes(tx: Tx, processoId: string) {
  return tx.itemDoResultado.findMany({
    where: { item: { processoId }, substituidaPor: { is: null } },
    select: {
      id: true, itemId: true, situacao: true, participanteId: true, valorUnitario: true,
      item: { select: { numero: true, lote: true, descricao: true, unidade: true, quantidade: true } },
      resultado: { select: { data: true, criterio: true } },
      participante: { select: { pessoa: { select: { documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } } } },
      adjudicacao: { select: { id: true, adjudicacao: { select: { data: true } }, homologacoes: { select: { ato: { select: { id: true, data: true, corrigidoPor: { select: { id: true } } } } } } } },
    },
  });
}

/** O ato de homologação VIGENTE que alcança o item adjudicado (o mais novo não corrigido que o contém). */
function homologacaoVigenteDe(adj: { readonly homologacoes: readonly { readonly ato: { readonly id: string; readonly data: Date; readonly corrigidoPor: { readonly id: string } | null } }[] } | null): { readonly id: string; readonly data: Date } | null {
  if (adj === null) return null;
  const vivos = adj.homologacoes.map((h) => h.ato).filter((a) => a.corrigidoPor === null);
  vivos.sort((a, b) => b.data.getTime() - a.data.getTime());
  return vivos[0] ?? null;
}

/** Quanto do item do resultado já foi comprometido: contratado direto, registrado em ata (as atas consomem pelo registrado). */
async function comprometidoDoItem(tx: Tx, itemDoResultadoId: string): Promise<{ readonly direto: Decimal; readonly emAta: Decimal }> {
  const [direto, atas] = await Promise.all([
    tx.itemContratadoDoResultado.findMany({ where: { itemDoResultadoId, itemDaAtaId: null }, select: { quantidade: true } }),
    tx.itemDaAta.findMany({ where: { itemDoResultadoId }, select: { quantidade: true } }),
  ]);
  const soma = (xs: readonly { readonly quantidade: { toFixed(n: number): string } }[]): Decimal => xs.reduce((t, x) => t.plus(x.quantidade.toFixed(4)), new Decimal(0));
  return { direto: soma(direto), emAta: soma(atas) };
}

// ── Itens, participantes, propostas ─────────────────────────────────────────────────────────────────

export const zCadastrarItemDoProcesso = z.object({
  processoId: z.string().min(1),
  numero: z.coerce.number().int().min(1).max(99999),
  lote: z.coerce.number().int().min(1).max(9999).optional(),
  descricao: zTexto(3, "Descreva o item."),
  unidade: z.string().trim().min(1, "Informe a unidade.").max(20),
  quantidade: zQuantidade,
  criadoPor: z.string().min(1),
});

export async function cadastrarItemDoProcesso(prisma: PrismaClient, input: z.input<typeof zCadastrarItemDoProcesso>): Promise<{ readonly itemId: string }> {
  const d = zCadastrarItemDoProcesso.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarItemDoProcesso, "ENTE");
    const p = await processoExistente(tx, d.processoId);
    await travar(tx, "ProcessoLicitatorio", [p.id]);
    if ((await tx.resultadoDoProcesso.count({ where: { processoId: p.id } })) > 0) {
      throw new Error(`O processo ${p.numeroProcesso} já tem resultado registrado: os itens não mudam depois do julgamento.${nada}`);
    }
    if ((await tx.itemDoProcesso.findUnique({ where: { processoId_numero: { processoId: p.id, numero: d.numero } }, select: { id: true } })) !== null) {
      throw new Error(`O item ${String(d.numero)} já existe no processo ${p.numeroProcesso}.${nada}`);
    }
    const i = await tx.itemDoProcesso.create({ data: { processoId: p.id, numero: d.numero, lote: d.lote ?? null, descricao: d.descricao, unidade: d.unidade, quantidade: d.quantidade, criadoPor: d.criadoPor }, select: { id: true } });
    return { itemId: i.id };
  });
}

export const zVincularParticipante = z.object({ processoId: z.string().min(1), documento: z.string().trim().min(11), criadoPor: z.string().min(1) });

/** O participante é a pessoa do cadastro único, pelo CPF/CNPJ. Pessoa fora do cadastro: recusa nomeando onde cadastrar. */
export async function vincularParticipante(prisma: PrismaClient, input: z.input<typeof zVincularParticipante>): Promise<{ readonly participanteId: string }> {
  const d = zVincularParticipante.parse(input);
  const documento = normalizarDocumento(d.documento);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.vincularParticipante, "ENTE");
    const p = await processoExistente(tx, d.processoId);
    const pessoa = await tx.pessoa.findUnique({ where: { documento }, select: { id: true } });
    if (pessoa === null) throw new Error(`O CPF/CNPJ ${documento} não está no cadastro de pessoas. Cadastre a pessoa em Cadastros › Pessoas e vincule de novo.${nada}`);
    const ja = await tx.participanteDoProcesso.findUnique({ where: { processoId_pessoaId: { processoId: p.id, pessoaId: pessoa.id } }, select: { id: true } });
    if (ja !== null) throw new Error(`O CPF/CNPJ ${documento} já participa do processo ${p.numeroProcesso}.${nada}`);
    const r = await tx.participanteDoProcesso.create({ data: { processoId: p.id, pessoaId: pessoa.id, criadoPor: d.criadoPor }, select: { id: true } });
    return { participanteId: r.id };
  });
}

export const zRegistrarProposta = z.object({
  participanteId: z.string().min(1),
  /** ITEM: um item; LOTE: todos os itens do lote, cada um com o seu unitário. */
  abrangencia: z.enum(["ITEM", "LOTE"]),
  valores: z.array(z.object({ itemId: z.string().min(1), valorUnitario: zUnitario })).min(1, "Informe o valor de pelo menos um item."),
  documento: zTexto(3, "Informe o documento da proposta."),
  motivo: z.string().trim().max(500).optional(),
  criadoPor: z.string().min(1),
});

export async function registrarProposta(prisma: PrismaClient, input: z.input<typeof zRegistrarProposta>): Promise<{ readonly propostas: readonly { readonly itemId: string; readonly versao: number }[] }> {
  const d = zRegistrarProposta.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarProposta, "ENTE");
    const part = await tx.participanteDoProcesso.findUnique({ where: { id: d.participanteId }, select: { processoId: true, processo: { select: { numeroProcesso: true } } } });
    if (part === null) throw new Error(`O participante ${d.participanteId} não existe.${nada}`);
    await travar(tx, "ProcessoLicitatorio", [part.processoId]);
    const ids = d.valores.map((v) => v.itemId);
    if (new Set(ids).size !== ids.length) throw new Error(`Um item aparece duas vezes na proposta.${nada}`);
    const itens = await tx.itemDoProcesso.findMany({ where: { id: { in: ids } }, select: { id: true, numero: true, lote: true, processoId: true } });
    if (itens.length !== ids.length || itens.some((i) => i.processoId !== part.processoId)) throw new Error(`Há item que não é do processo ${part.processo.numeroProcesso}.${nada}`);
    if (d.abrangencia === "ITEM" && ids.length !== 1) throw new Error(`A proposta por item tem um item só; para vários, registre uma por item ou por lote.${nada}`);
    if (d.abrangencia === "LOTE") {
      const lotes = new Set(itens.map((i) => i.lote));
      if (lotes.size !== 1 || itens[0]!.lote === null) throw new Error(`A proposta por lote cobre os itens de UM lote.${nada}`);
      const doLote = await tx.itemDoProcesso.count({ where: { processoId: part.processoId, lote: itens[0]!.lote } });
      if (doLote !== itens.length) throw new Error(`A proposta do lote ${String(itens[0]!.lote)} precisa cobrir os ${String(doLote)} itens dele; vieram ${String(itens.length)}.${nada}`);
    }
    const julgados = await tx.itemDoResultado.findMany({ where: { itemId: { in: ids } }, select: { item: { select: { numero: true } } } });
    if (julgados.length > 0) throw new Error(`O item ${String(julgados[0]!.item.numero)} já foi julgado: a proposta não muda depois do resultado.${nada}`);
    const out: { itemId: string; versao: number }[] = [];
    for (const v of d.valores) {
      const ultima = await tx.propostaDoParticipante.findFirst({ where: { participanteId: d.participanteId, itemId: v.itemId }, orderBy: { versao: "desc" }, select: { versao: true } });
      const versao = (ultima?.versao ?? 0) + 1;
      if (versao > 1 && (d.motivo ?? "").length < 10) {
        const n = itens.find((i) => i.id === v.itemId)!.numero;
        throw new Error(`O participante já tem proposta para o item ${String(n)}: a nova é a versão ${String(versao)} e precisa do motivo (mínimo 10 caracteres).${nada}`);
      }
      await tx.propostaDoParticipante.create({ data: { participanteId: d.participanteId, itemId: v.itemId, versao, abrangencia: d.abrangencia, valorUnitario: v.valorUnitario, documento: d.documento, motivo: d.motivo ?? null, criadoPor: d.criadoPor } });
      out.push({ itemId: v.itemId, versao });
    }
    return { propostas: out };
  });
}

// ── Resultado ───────────────────────────────────────────────────────────────────────────────────────

export const zRegistrarResultado = z.object({
  processoId: z.string().min(1),
  data: zData,
  criterio: z.enum(CRITERIOS_DE_JULGAMENTO),
  fundamento: zTexto(10, "Diga o fundamento do julgamento (edital, ata da sessão)."),
  documento: zTexto(3, "Informe o documento do resultado (ata da sessão, relatório)."),
  itens: z.array(z.object({
    itemId: z.string().min(1),
    situacao: z.enum(["VENCEDOR", "FRACASSADO", "DESERTO"]),
    participanteId: z.string().min(1).optional(),
    valorUnitario: zUnitario.optional(),
    justificativa: z.string().trim().max(500).optional(),
  })).min(1, "O resultado decide pelo menos um item."),
  criadoPor: z.string().min(1),
});

/**
 * O ATO DO RESULTADO. Item já julgado é CORRIGIDO por este ato (a linha nova substitui a vigente), salvo se já foi
 * adjudicado: aí a correção é recusada (desfazer adjudicação não é ato deste cadastro).
 */
export async function registrarResultado(prisma: PrismaClient, input: z.input<typeof zRegistrarResultado>): Promise<{ readonly resultadoId: string; readonly corrigidos: number }> {
  const d = zRegistrarResultado.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarResultado, "ENTE");
    const p = await processoExistente(tx, d.processoId);
    await travar(tx, "ProcessoLicitatorio", [p.id]);
    const ids = d.itens.map((i) => i.itemId);
    if (new Set(ids).size !== ids.length) throw new Error(`Um item aparece duas vezes no resultado.${nada}`);
    const itens = await tx.itemDoProcesso.findMany({ where: { id: { in: ids } }, select: { id: true, numero: true, lote: true, processoId: true } });
    if (itens.length !== ids.length || itens.some((i) => i.processoId !== p.id)) throw new Error(`Há item que não é do processo ${p.numeroProcesso}.${nada}`);
    const numeroDe = (id: string): number => itens.find((i) => i.id === id)!.numero;

    // Julgamento por lote: os itens de um lote vão juntos, e o vencedor do lote é um só.
    const lotes = new Set(itens.map((i) => i.lote).filter((l): l is number => l !== null));
    for (const lote of lotes) {
      const doLote = await tx.itemDoProcesso.findMany({ where: { processoId: p.id, lote }, select: { id: true } });
      const noAto = d.itens.filter((x) => doLote.some((i) => i.id === x.itemId));
      if (noAto.length !== doLote.length) throw new Error(`O lote ${String(lote)} se julga inteiro: tem ${String(doLote.length)} itens e o ato trouxe ${String(noAto.length)}.${nada}`);
      const vencedores = new Set(noAto.map((x) => (x.situacao === "VENCEDOR" ? x.participanteId : x.situacao)));
      if (vencedores.size !== 1) throw new Error(`O lote ${String(lote)} tem um resultado só (o mesmo vencedor, ou a mesma situação, em todos os itens).${nada}`);
    }

    const vigentes = await tx.itemDoResultado.findMany({ where: { itemId: { in: ids }, substituidaPor: { is: null } }, select: { id: true, itemId: true, adjudicacao: { select: { id: true } } } });
    const adjudicado = vigentes.find((v) => v.adjudicacao !== null);
    if (adjudicado !== undefined) throw new Error(`O item ${String(numeroDe(adjudicado.itemId))} já foi adjudicado: o resultado dele não se corrige por este ato.${nada}`);

    const resultado = await tx.resultadoDoProcesso.create({ data: { processoId: p.id, data: d.data, criterio: d.criterio, fundamento: d.fundamento, documento: d.documento, criadoPor: d.criadoPor }, select: { id: true } });
    const sentido = SENTIDO_DO_CRITERIO[d.criterio];
    for (const x of d.itens) {
      const n = numeroDe(x.itemId);
      let propostaId: string | null = null;
      if (x.situacao === "VENCEDOR") {
        if (x.participanteId === undefined || x.valorUnitario === undefined) throw new Error(`Item ${String(n)}: o vencedor precisa do participante e do valor unitário final.${nada}`);
        const propostas = await tx.propostaDoParticipante.findMany({ where: { itemId: x.itemId }, orderBy: { versao: "desc" }, select: { id: true, participanteId: true, valorUnitario: true } });
        const vigentePor = new Map<string, { id: string; valor: Decimal }>();
        for (const pr of propostas) if (!vigentePor.has(pr.participanteId)) vigentePor.set(pr.participanteId, { id: pr.id, valor: new Decimal(pr.valorUnitario.toFixed(4)) });
        const doVencedor = vigentePor.get(x.participanteId);
        if (doVencedor === undefined) throw new Error(`Item ${String(n)}: o participante escolhido não tem proposta para ele.${nada}`);
        propostaId = doVencedor.id;
        const final = new Decimal(x.valorUnitario);
        if (sentido === "MENOR" && final.greaterThan(doVencedor.valor)) throw new Error(`Item ${String(n)}: o valor final (${final.toFixed(4)}) passa do proposto pelo vencedor (${doVencedor.valor.toFixed(4)}); pelo critério de ${ROTULO_DO_CRITERIO[d.criterio].toLowerCase()}, a negociação só reduz.${nada}`);
        if (sentido === "MAIOR" && final.lessThan(doVencedor.valor)) throw new Error(`Item ${String(n)}: o valor final (${final.toFixed(4)}) é menor que o lance do vencedor (${doVencedor.valor.toFixed(4)}).${nada}`);
        if (sentido !== null) {
          const vantajosa = (a: Decimal, b: Decimal): boolean => (sentido === "MENOR" ? a.lessThan(b) : a.greaterThan(b));
          const lote = itens.find((i) => i.id === x.itemId)!.lote;
          let melhor: string | null = null;
          if (lote === null) {
            const m = [...vigentePor.entries()].filter(([pid]) => pid !== x.participanteId).find(([, v]) => vantajosa(v.valor, doVencedor.valor));
            if (m !== undefined) melhor = `${m[1].valor.toFixed(4)} contra ${doVencedor.valor.toFixed(4)} do escolhido`;
          } else {
            // Julgamento por LOTE: compara o TOTAL do lote (Σ quantidade × unitário vigente), entre quem propôs o lote
            // inteiro — não item a item (quem é mais barato num item e mais caro no lote não é "mais vantajoso").
            const doLote = await tx.itemDoProcesso.findMany({ where: { processoId: p.id, lote }, select: { quantidade: true, propostas: { orderBy: { versao: "desc" }, select: { participanteId: true, valorUnitario: true } } } });
            const total = new Map<string, { soma: Decimal; itens: number }>();
            for (const it of doLote) {
              const vistos = new Set<string>();
              for (const pr of it.propostas) {
                if (vistos.has(pr.participanteId)) continue;
                vistos.add(pr.participanteId);
                const t = total.get(pr.participanteId) ?? { soma: new Decimal(0), itens: 0 };
                total.set(pr.participanteId, { soma: t.soma.plus(new Decimal(it.quantidade.toFixed(4)).times(pr.valorUnitario.toFixed(4))), itens: t.itens + 1 });
              }
            }
            const completos = [...total.entries()].filter(([, t]) => t.itens === doLote.length);
            const doEscolhido = total.get(x.participanteId);
            if (doEscolhido === undefined || doEscolhido.itens !== doLote.length) throw new Error(`Item ${String(n)}: o escolhido não propôs o lote ${String(lote)} inteiro.${nada}`);
            const m = completos.filter(([pid]) => pid !== x.participanteId).find(([, t]) => vantajosa(t.soma, doEscolhido.soma));
            if (m !== undefined) melhor = `lote ${String(lote)} por ${toMoney(m[1].soma).toFixed(2)} contra ${toMoney(doEscolhido.soma).toFixed(2)} do escolhido`;
          }
          if (melhor !== null && (x.justificativa ?? "").length < 20) {
            throw new Error(`Item ${String(n)}: há proposta mais vantajosa pelo critério (${melhor}). Diga por que ela não venceu (desclassificação, inabilitação), com no mínimo 20 caracteres.${nada}`);
          }
        }
      } else {
        if (x.participanteId !== undefined || x.valorUnitario !== undefined) throw new Error(`Item ${String(n)}: item ${x.situacao === "DESERTO" ? "deserto" : "fracassado"} não tem vencedor nem valor.${nada}`);
        if (x.situacao === "FRACASSADO" && (x.justificativa ?? "").length < 20) throw new Error(`Item ${String(n)}: diga por que o item fracassou (mínimo 20 caracteres).${nada}`);
      }
      const anterior = vigentes.find((v) => v.itemId === x.itemId);
      await tx.itemDoResultado.create({
        data: {
          resultadoId: resultado.id, itemId: x.itemId, situacao: x.situacao, participanteId: x.participanteId ?? null, propostaId,
          valorUnitario: x.valorUnitario ?? null, justificativa: x.justificativa ?? null, substituiId: anterior?.id ?? null, criadoPor: d.criadoPor,
        },
      });
    }
    return { resultadoId: resultado.id, corrigidos: vigentes.length };
  });
}

// ── Adjudicação e homologação ───────────────────────────────────────────────────────────────────────

export const zAdjudicar = z.object({
  processoId: z.string().min(1),
  data: zData,
  autoridade: zTexto(3, "Informe a autoridade que adjudica."),
  documento: zTexto(3, "Informe o documento do ato."),
  itensDoResultado: z.array(z.string().min(1)).min(1, "Escolha os itens que o ato adjudica."),
  criadoPor: z.string().min(1),
});

export async function adjudicar(prisma: PrismaClient, input: z.input<typeof zAdjudicar>): Promise<{ readonly adjudicacaoId: string }> {
  const d = zAdjudicar.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.adjudicar, "ENTE");
    const p = await processoExistente(tx, d.processoId);
    await travar(tx, "ProcessoLicitatorio", [p.id]);
    const linhas = await tx.itemDoResultado.findMany({
      where: { id: { in: d.itensDoResultado } },
      select: { id: true, situacao: true, criadoPor: true, item: { select: { numero: true, processoId: true } }, substituidaPor: { select: { id: true } }, adjudicacao: { select: { id: true } }, resultado: { select: { data: true } } },
    });
    if (linhas.length !== new Set(d.itensDoResultado).size) throw new Error(`Há item do resultado que não existe.${nada}`);
    for (const l of linhas) {
      const n = String(l.item.numero);
      if (l.item.processoId !== p.id) throw new Error(`O item ${n} não é do processo ${p.numeroProcesso}.${nada}`);
      if (l.substituidaPor !== null) throw new Error(`O resultado do item ${n} foi corrigido: adjudique o vigente.${nada}`);
      if (l.situacao !== "VENCEDOR") throw new Error(`O item ${n} não tem vencedor (${l.situacao === "DESERTO" ? "deserto" : "fracassado"}): não há o que adjudicar.${nada}`);
      if (l.adjudicacao !== null) throw new Error(`O item ${n} já foi adjudicado.${nada}`);
      // Segregação de funções (Lei 14.133/2021, art. 5º e art. 7º, § 1º): quem julgou não adjudica o próprio julgamento.
      if (l.criadoPor === d.criadoPor) throw new Error(`SEGREGACAO: o resultado do item ${n} foi registrado por esta mesma pessoa; a adjudicação é de outra autoridade.${nada}`);
      if (diaCivil(d.data) < diaCivil(l.resultado.data)) throw new Error(`A adjudicação (${diaCivil(d.data)}) não pode ser anterior ao resultado do item ${n} (${diaCivil(l.resultado.data)}).${nada}`);
    }
    const a = await tx.adjudicacaoDoProcesso.create({ data: { processoId: p.id, data: d.data, autoridade: d.autoridade, documento: d.documento, criadoPor: d.criadoPor }, select: { id: true } });
    for (const l of linhas) await tx.itemAdjudicado.create({ data: { adjudicacaoId: a.id, itemDoResultadoId: l.id, criadoPor: d.criadoPor } });
    return { adjudicacaoId: a.id };
  });
}

export const zHomologarPorAto = z.object({
  processoId: z.string().min(1),
  data: zData,
  autoridade: zTexto(3, "Informe a autoridade que homologa."),
  documento: zTexto(3, "Informe o documento do ato."),
  itensAdjudicados: z.array(z.string().min(1)).min(1, "Escolha os itens que o ato homologa."),
  /** O ato que este corrige (o anterior continua no histórico). */
  corrigeId: z.string().min(1).optional(),
  motivo: z.string().trim().max(500).optional(),
  criadoPor: z.string().min(1),
});

/**
 * O ATO DE HOMOLOGAÇÃO com abrangência. O primeiro ato do processo registra também a homologação do processo (a data
 * que o cadastro de contrato confere). A correção é ato novo que aponta o corrigido: a abrangência dele substitui a do
 * anterior — e não pode deixar de fora item já contratado ou registrado em ata.
 */
export async function homologarPorAto(prisma: PrismaClient, input: z.input<typeof zHomologarPorAto>): Promise<{ readonly atoId: string }> {
  const d = zHomologarPorAto.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.homologarPorAto, "ENTE");
    const p = await processoExistente(tx, d.processoId);
    await travar(tx, "ProcessoLicitatorio", [p.id]);
    const adjs = await tx.itemAdjudicado.findMany({
      where: { id: { in: d.itensAdjudicados } },
      select: { id: true, adjudicacao: { select: { processoId: true, data: true } }, itemDoResultado: { select: { id: true, criadoPor: true, item: { select: { numero: true } }, contratacoes: { select: { itemDoContrato: { select: { contrato: { select: { numeroContrato: true, vigenciaInicio: true } } } } } }, itensDaAta: { select: { ata: { select: { numero: true, vigenciaInicio: true } } } } } }, homologacoes: { select: { ato: { select: { id: true, data: true, corrigidoPor: { select: { id: true } } } } } } },
    });
    if (adjs.length !== new Set(d.itensAdjudicados).size) throw new Error(`Há item adjudicado que não existe.${nada}`);
    for (const a of adjs) {
      const n = String(a.itemDoResultado.item.numero);
      if (a.adjudicacao.processoId !== p.id) throw new Error(`O item ${n} não é do processo ${p.numeroProcesso}.${nada}`);
      if (diaCivil(d.data) < diaCivil(a.adjudicacao.data)) throw new Error(`A homologação (${diaCivil(d.data)}) não pode ser anterior à adjudicação do item ${n} (${diaCivil(a.adjudicacao.data)}).${nada}`);
      if (a.itemDoResultado.criadoPor === d.criadoPor) throw new Error(`SEGREGACAO: o resultado do item ${n} foi registrado por esta mesma pessoa; a homologação é de outra autoridade.${nada}`);
      // A correção não pode levar a homologação para DEPOIS de contrato ou ata que já produzem efeito com ela.
      for (const c of a.itemDoResultado.contratacoes) {
        if (diaCivil(d.data) > diaCivil(c.itemDoContrato.contrato.vigenciaInicio)) throw new Error(`O item ${n} está no contrato ${c.itemDoContrato.contrato.numeroContrato}, vigente desde ${diaCivil(c.itemDoContrato.contrato.vigenciaInicio)}: a homologação não pode passar a ser de ${diaCivil(d.data)}.${nada}`);
      }
      for (const ia of a.itemDoResultado.itensDaAta) {
        if (diaCivil(d.data) > diaCivil(ia.ata.vigenciaInicio)) throw new Error(`O item ${n} está na ata ${ia.ata.numero}, vigente desde ${diaCivil(ia.ata.vigenciaInicio)}: a homologação não pode passar a ser de ${diaCivil(d.data)}.${nada}`);
      }
      const vig = homologacaoVigenteDe(a);
      if (vig !== null && vig.id !== d.corrigeId) throw new Error(`O item ${n} já está homologado por outro ato; para mudar, corrija aquele ato.${nada}`);
    }
    if (d.corrigeId !== undefined) {
      const anterior = await tx.atoDeHomologacao.findUnique({ where: { id: d.corrigeId }, select: { processoId: true, corrigidoPor: { select: { id: true } }, itens: { select: { itemAdjudicado: { select: { itemDoResultadoId: true, itemDoResultado: { select: { item: { select: { numero: true } } } } } } } } } });
      if (anterior === null || anterior.processoId !== p.id) throw new Error(`O ato a corrigir não é deste processo.${nada}`);
      if (anterior.corrigidoPor !== null) throw new Error(`Esse ato já foi corrigido; corrija o ato vigente.${nada}`);
      if ((d.motivo ?? "").length < 20) throw new Error(`A correção da homologação precisa do motivo (mínimo 20 caracteres).${nada}`);
      const fora = anterior.itens.filter((i) => !adjs.some((a) => a.itemDoResultado.id === i.itemAdjudicado.itemDoResultadoId));
      for (const f of fora) {
        const c = await comprometidoDoItem(tx, f.itemAdjudicado.itemDoResultadoId);
        if (c.direto.greaterThan(0) || c.emAta.greaterThan(0)) throw new Error(`O item ${String(f.itemAdjudicado.itemDoResultado.item.numero)} já foi contratado ou registrado em ata: a correção não o tira da homologação.${nada}`);
      }
    }
    const ato = await tx.atoDeHomologacao.create({ data: { processoId: p.id, data: d.data, autoridade: d.autoridade, documento: d.documento, corrigeId: d.corrigeId ?? null, motivo: d.motivo ?? null, criadoPor: d.criadoPor }, select: { id: true } });
    for (const a of adjs) await tx.itemHomologado.create({ data: { atoId: ato.id, itemAdjudicadoId: a.id, criadoPor: d.criadoPor } });
    // O processo homologado (a data que o contrato confere) nasce do primeiro ato; nunca se reescreve.
    const proc = await tx.processoLicitatorio.findUniqueOrThrow({ where: { id: p.id }, select: { dataHomologacao: true, homologacao: { select: { id: true } } } });
    if (proc.dataHomologacao === null && proc.homologacao === null) await tx.homologacaoProcesso.create({ data: { processoId: p.id, data: d.data, criadoPor: d.criadoPor } });
    return { atoId: ato.id };
  });
}

// ── Contrato do resultado e ata ─────────────────────────────────────────────────────────────────────

/** O item do resultado pronto para contratar: vigente, vencedor, adjudicado e homologado por ato vigente. */
async function exigirItemContratavel(tx: Tx, processoId: string, itemDoResultadoId: string) {
  const l = await tx.itemDoResultado.findUnique({
    where: { id: itemDoResultadoId },
    select: {
      id: true, situacao: true, participanteId: true, valorUnitario: true,
      item: { select: { processoId: true, numero: true, descricao: true, unidade: true, quantidade: true } },
      substituidaPor: { select: { id: true } },
      adjudicacao: { select: { id: true, homologacoes: { select: { ato: { select: { id: true, data: true, corrigidoPor: { select: { id: true } } } } } } } },
    },
  });
  if (l === null || l.item.processoId !== processoId) throw new Error(`O item do resultado ${itemDoResultadoId} não é deste processo.${nada}`);
  const n = String(l.item.numero);
  if (l.substituidaPor !== null || l.situacao !== "VENCEDOR" || l.participanteId === null || l.valorUnitario === null) throw new Error(`O item ${n} não tem resultado vencedor vigente.${nada}`);
  const hom = homologacaoVigenteDe(l.adjudicacao);
  if (hom === null) throw new Error(`O item ${n} não está adjudicado e homologado: não há o que contratar.${nada}`);
  return { ...l, participanteId: l.participanteId, valorUnitario: new Decimal(l.valorUnitario.toFixed(4)), homologadoEm: hom.data };
}

// Cada item UMA vez por ato: o mesmo item repetido seria conferido duas vezes contra o MESMO saldo (nada gravado ainda
// entre as voltas) e passaria o dobro.
const zItensQuantidade = z.array(z.object({ id: z.string().min(1), quantidade: zQuantidade })).min(1, "Escolha pelo menos um item.")
  .refine((xs) => new Set(xs.map((x) => x.id)).size === xs.length, "Um item aparece duas vezes no pedido. Nada foi gravado.");
const zDadosDoContrato = {
  numeroContrato: z.string().trim().min(1, "Informe o número do contrato.").max(40),
  vigenciaInicio: zData,
  vigenciaFimInicial: zData,
  categoriaOrdemCronologica: z.enum(["FORNECIMENTO_BENS", "LOCACAO", "PRESTACAO_SERVICOS", "REALIZACAO_OBRAS"]),
  criadoPor: z.string().min(1),
};

async function criarContratoComItens(
  tx: Tx,
  p: { readonly processoId: string; readonly participanteId: string; readonly numeroContrato: string; readonly vigenciaInicio: Date; readonly vigenciaFimInicial: Date; readonly categoriaOrdemCronologica: "FORNECIMENTO_BENS" | "LOCACAO" | "PRESTACAO_SERVICOS" | "REALIZACAO_OBRAS"; readonly criadoPor: string },
  itens: readonly { readonly itemDoResultadoId: string; readonly itemDaAtaId: string | null; readonly descricao: string; readonly unidade: string; readonly quantidade: Decimal; readonly valorUnitario: Decimal }[]
): Promise<{ readonly contratoId: string; readonly valor: Money }> {
  const part = await tx.participanteDoProcesso.findUniqueOrThrow({ where: { id: p.participanteId }, select: { pessoa: { select: { documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } } } });
  const nome = part.pessoa.versoes[0]?.nome;
  if (nome === undefined) throw new Error(`A pessoa ${part.pessoa.documento} não tem nome no cadastro.${nada}`);
  // O valor do contrato é a soma de quantidade × unitário de cada item, em centavos por item, pela régua do projeto
  // (`toMoney`: meio para o par) — a mesma de `fiscalizacao.ts` para o valor dos itens do contrato.
  const valor = itens.reduce((t, i) => toMoney(t.plus(toMoney(i.quantidade.times(i.valorUnitario)))), toMoney(0));
  // Pela MESMA validação do contrato avulso (zod do domínio): nada se grava por um atalho que ela não conferiu.
  const { contratoId } = await gravarContratoNaTransacao(tx, zCadastrarContratoInput.parse({
    numeroContrato: p.numeroContrato, processoId: p.processoId, contratadoDocumento: part.pessoa.documento, contratadoNome: nome,
    valorInicial: valor.toFixed(2), vigenciaInicio: p.vigenciaInicio, vigenciaFimInicial: p.vigenciaFimInicial, categoriaOrdemCronologica: p.categoriaOrdemCronologica, criadoPor: p.criadoPor,
  }));
  let numero = 0;
  for (const i of itens) {
    numero += 1;
    const ic = await tx.itemDoContrato.create({ data: { contratoId, numero, descricao: i.descricao, unidade: i.unidade, quantidade: i.quantidade.toFixed(4), valorUnitario: i.valorUnitario.toFixed(4), criadoPor: p.criadoPor }, select: { id: true } });
    await tx.itemContratadoDoResultado.create({ data: { itemDoContratoId: ic.id, itemDoResultadoId: i.itemDoResultadoId, itemDaAtaId: i.itemDaAtaId, quantidade: i.quantidade.toFixed(4), criadoPor: p.criadoPor } });
  }
  return { contratoId, valor };
}

export const zContratoDoResultado = z.object({ processoId: z.string().min(1), participanteId: z.string().min(1), itens: zItensQuantidade, ...zDadosDoContrato });

/**
 * O CONTRATO ORIGINADO DO RESULTADO: contratado, itens, quantidades e preços vêm do resultado homologado — nada se
 * redigita. A quantidade de cada item cabe no que resta dele (licitado menos o já contratado e o registrado em ata);
 * item registrado em ata se contrata pela ata.
 */
export async function cadastrarContratoDoResultado(prisma: PrismaClient, input: z.input<typeof zContratoDoResultado>): Promise<{ readonly contratoId: string; readonly valor: string }> {
  const d = zContratoDoResultado.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarContratoDoResultado, "ENTE");
    const p = await processoExistente(tx, d.processoId);
    await travar(tx, "ProcessoLicitatorio", [p.id]);
    const itens: { itemDoResultadoId: string; itemDaAtaId: null; descricao: string; unidade: string; quantidade: Decimal; valorUnitario: Decimal }[] = [];
    for (const x of d.itens) {
      const l = await exigirItemContratavel(tx, p.id, x.id);
      const n = String(l.item.numero);
      if (l.participanteId !== d.participanteId) throw new Error(`O item ${n} foi vencido por outro participante.${nada}`);
      if (diaCivil(d.vigenciaInicio) < diaCivil(l.homologadoEm)) throw new Error(`O contrato não pode começar (${diaCivil(d.vigenciaInicio)}) antes da homologação do item ${n} (${diaCivil(l.homologadoEm)}).${nada}`);
      const c = await comprometidoDoItem(tx, l.id);
      if (c.emAta.greaterThan(0)) throw new Error(`O item ${n} está registrado em ata de registro de preços: contrate pela ata.${nada}`);
      const resta = new Decimal(l.item.quantidade.toFixed(4)).minus(c.direto);
      const q = new Decimal(x.quantidade);
      if (q.greaterThan(resta)) throw new Error(`O item ${n} tem ${resta.toFixed(4)} ${l.item.unidade} a contratar (licitado ${l.item.quantidade.toFixed(4)}, já contratado ${c.direto.toFixed(4)}); o contrato pede ${q.toFixed(4)}.${nada}`);
      itens.push({ itemDoResultadoId: l.id, itemDaAtaId: null, descricao: l.item.descricao, unidade: l.item.unidade, quantidade: q, valorUnitario: l.valorUnitario });
    }
    const r = await criarContratoComItens(tx, d, itens);
    return { contratoId: r.contratoId, valor: r.valor.toFixed(2) };
  });
}

export const zRegistrarAta = z.object({
  processoId: z.string().min(1),
  numero: z.string().trim().min(1, "Informe o número da ata.").max(40),
  vigenciaInicio: zData,
  vigenciaFim: zData,
  documento: zTexto(3, "Informe o documento da ata."),
  itens: zItensQuantidade,
  criadoPor: z.string().min(1),
});

/** A ATA DE REGISTRO DE PREÇOS: itens homologados com fornecedor e preço do resultado, e a quantidade registrada. */
export async function registrarAta(prisma: PrismaClient, input: z.input<typeof zRegistrarAta>): Promise<{ readonly ataId: string }> {
  const d = zRegistrarAta.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarAta, "ENTE");
    const p = await processoExistente(tx, d.processoId);
    await travar(tx, "ProcessoLicitatorio", [p.id]);
    if (diaCivil(d.vigenciaFim) <= diaCivil(d.vigenciaInicio)) throw new Error(`A vigência da ata termina (${diaCivil(d.vigenciaFim)}) antes de começar (${diaCivil(d.vigenciaInicio)}).${nada}`);
    if ((await tx.ataDeRegistroDePrecos.findUnique({ where: { processoId_numero: { processoId: p.id, numero: d.numero } }, select: { id: true } })) !== null) throw new Error(`A ata ${d.numero} já existe no processo ${p.numeroProcesso}.${nada}`);
    const linhas: { id: string; q: Decimal }[] = [];
    for (const x of d.itens) {
      const l = await exigirItemContratavel(tx, p.id, x.id);
      const n = String(l.item.numero);
      if (diaCivil(d.vigenciaInicio) < diaCivil(l.homologadoEm)) throw new Error(`A ata não pode começar antes da homologação do item ${n}.${nada}`);
      const c = await comprometidoDoItem(tx, l.id);
      if (c.direto.greaterThan(0)) throw new Error(`O item ${n} já foi contratado direto do resultado: a ata não o registra (o saldo dele é do contrato).${nada}`);
      const resta = new Decimal(l.item.quantidade.toFixed(4)).minus(c.direto).minus(c.emAta);
      const q = new Decimal(x.quantidade);
      if (q.greaterThan(resta)) throw new Error(`O item ${n} tem ${resta.toFixed(4)} ${l.item.unidade} a registrar (licitado ${l.item.quantidade.toFixed(4)}, contratado ${c.direto.toFixed(4)}, em ata ${c.emAta.toFixed(4)}); a ata pede ${q.toFixed(4)}.${nada}`);
      linhas.push({ id: l.id, q });
    }
    const ata = await tx.ataDeRegistroDePrecos.create({ data: { processoId: p.id, numero: d.numero, vigenciaInicio: d.vigenciaInicio, vigenciaFim: d.vigenciaFim, documento: d.documento, criadoPor: d.criadoPor }, select: { id: true } });
    for (const l of linhas) await tx.itemDaAta.create({ data: { ataId: ata.id, itemDoResultadoId: l.id, quantidade: l.q.toFixed(4), criadoPor: d.criadoPor } });
    return { ataId: ata.id };
  });
}

export const zContratoDaAta = z.object({ ataId: z.string().min(1), participanteId: z.string().min(1), itens: zItensQuantidade, ...zDadosDoContrato });

/** O CONTRATO PELA ATA: dentro da vigência da ata, do fornecedor registrado, e no saldo da ata de cada item. */
export async function cadastrarContratoDaAta(prisma: PrismaClient, input: z.input<typeof zContratoDaAta>): Promise<{ readonly contratoId: string; readonly valor: string }> {
  const d = zContratoDaAta.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarContratoDaAta, "ENTE");
    const ata = await tx.ataDeRegistroDePrecos.findUnique({ where: { id: d.ataId }, select: { id: true, numero: true, processoId: true, vigenciaInicio: true, vigenciaFim: true } });
    if (ata === null) throw new Error(`A ata ${d.ataId} não existe.${nada}`);
    await travar(tx, "ProcessoLicitatorio", [ata.processoId]);
    const dia = diaCivil(d.vigenciaInicio);
    if (dia < diaCivil(ata.vigenciaInicio) || dia > diaCivil(ata.vigenciaFim)) throw new Error(`A ata ${ata.numero} vale de ${diaCivil(ata.vigenciaInicio)} a ${diaCivil(ata.vigenciaFim)}; o contrato começa em ${dia}.${nada}`);
    // E a contratação tem de acontecer com a ata VIGENTE: começar o contrato numa data passada não reabre ata vencida.
    const hoje = diaCivil(new Date());
    if (hoje > diaCivil(ata.vigenciaFim)) throw new Error(`A ata ${ata.numero} venceu em ${diaCivil(ata.vigenciaFim)}: não se contrata mais por ela.${nada}`);
    const itens: { itemDoResultadoId: string; itemDaAtaId: string; descricao: string; unidade: string; quantidade: Decimal; valorUnitario: Decimal }[] = [];
    for (const x of d.itens) {
      const ia = await tx.itemDaAta.findUnique({ where: { id: x.id }, select: { id: true, ataId: true, quantidade: true, itemDoResultadoId: true, contratacoes: { select: { quantidade: true } } } });
      if (ia === null || ia.ataId !== ata.id) throw new Error(`O item ${x.id} não é da ata ${ata.numero}.${nada}`);
      const l = await exigirItemContratavel(tx, ata.processoId, ia.itemDoResultadoId);
      const n = String(l.item.numero);
      if (l.participanteId !== d.participanteId) throw new Error(`O item ${n} da ata é de outro fornecedor.${nada}`);
      const contratado = ia.contratacoes.reduce((t, c) => t.plus(c.quantidade.toFixed(4)), new Decimal(0));
      const saldo = new Decimal(ia.quantidade.toFixed(4)).minus(contratado);
      const q = new Decimal(x.quantidade);
      if (q.greaterThan(saldo)) throw new Error(`O item ${n} tem saldo de ${saldo.toFixed(4)} ${l.item.unidade} na ata ${ata.numero} (registrado ${ia.quantidade.toFixed(4)}, contratado ${contratado.toFixed(4)}); o contrato pede ${q.toFixed(4)}.${nada}`);
      itens.push({ itemDoResultadoId: l.id, itemDaAtaId: ia.id, descricao: l.item.descricao, unidade: l.item.unidade, quantidade: q, valorUnitario: l.valorUnitario });
    }
    const r = await criarContratoComItens(tx, { ...d, processoId: ata.processoId }, itens);
    return { contratoId: r.contratoId, valor: r.valor.toFixed(2) };
  });
}

// ── Leitura ─────────────────────────────────────────────────────────────────────────────────────────

export interface ItemNoQuadro {
  readonly id: string;
  readonly numero: number;
  readonly lote: number | null;
  readonly descricao: string;
  readonly unidade: string;
  readonly quantidade: string;
  readonly propostas: readonly { readonly participanteId: string; readonly participante: string; readonly valorUnitario: string; readonly versao: number; readonly abrangencia: string }[];
  readonly resultado: { readonly id: string; readonly situacao: string; readonly participanteId: string | null; readonly participante: string | null; readonly valorUnitario: string | null; readonly criterio: string; readonly corrigido: boolean } | null;
  readonly adjudicado: { readonly id: string; readonly data: Date } | null;
  readonly homologado: { readonly atoId: string; readonly data: Date } | null;
  readonly contratadoDireto: string;
  readonly registradoEmAta: string;
}

/** O quadro do processo: itens com propostas vigentes, resultado, adjudicação, homologação e o comprometido. Leitura pura. */
export async function quadroDoResultado(tx: Tx, processoId: string): Promise<{
  readonly itens: readonly ItemNoQuadro[];
  readonly participantes: readonly { readonly id: string; readonly documento: string; readonly nome: string }[];
  readonly atos: readonly { readonly id: string; readonly data: Date; readonly autoridade: string; readonly documento: string; readonly corrigeId: string | null; readonly corrigido: boolean; readonly motivo: string | null; readonly itens: readonly number[] }[];
  readonly atas: readonly { readonly id: string; readonly numero: string; readonly vigenciaInicio: Date; readonly vigenciaFim: Date; readonly itens: readonly { readonly id: string; readonly item: number; readonly descricao: string; readonly unidade: string; readonly participanteId: string; readonly fornecedor: string; readonly valorUnitario: string; readonly registrado: string; readonly contratado: string; readonly saldo: string; readonly saldoEmReais: string }[] }[];
}> {
  const nomeDe = (p: { readonly documento: string; readonly versoes: readonly { readonly nome: string }[] }): string => p.versoes[0]?.nome ?? p.documento;
  const [itens, participantes, vigentes, atos, atas] = await Promise.all([
    tx.itemDoProcesso.findMany({ where: { processoId }, orderBy: { numero: "asc" }, select: { id: true, numero: true, lote: true, descricao: true, unidade: true, quantidade: true, propostas: { orderBy: { versao: "desc" }, select: { participanteId: true, valorUnitario: true, versao: true, abrangencia: true } }, resultados: { select: { id: true } } } }),
    tx.participanteDoProcesso.findMany({ where: { processoId }, orderBy: { criadoEm: "asc" }, select: { id: true, pessoa: { select: { documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } } } }),
    resultadosVigentes(tx, processoId),
    tx.atoDeHomologacao.findMany({ where: { processoId }, orderBy: { criadoEm: "asc" }, select: { id: true, data: true, autoridade: true, documento: true, corrigeId: true, motivo: true, corrigidoPor: { select: { id: true } }, itens: { select: { itemAdjudicado: { select: { itemDoResultado: { select: { item: { select: { numero: true } } } } } } } } } }),
    tx.ataDeRegistroDePrecos.findMany({ where: { processoId }, orderBy: { criadoEm: "asc" }, select: { id: true, numero: true, vigenciaInicio: true, vigenciaFim: true, itens: { select: { id: true, quantidade: true, contratacoes: { select: { quantidade: true } }, itemDoResultado: { select: { participanteId: true, valorUnitario: true, item: { select: { numero: true, descricao: true, unidade: true } }, participante: { select: { pessoa: { select: { documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } } } } } } } } } }),
  ]);
  const nomePorParticipante = new Map(participantes.map((p) => [p.id, nomeDe(p.pessoa)]));
  const quadro: ItemNoQuadro[] = [];
  for (const i of itens) {
    const vistos = new Set<string>();
    const props = i.propostas.filter((p) => (vistos.has(p.participanteId) ? false : (vistos.add(p.participanteId), true)));
    const r = vigentes.find((v) => v.itemId === i.id);
    const hom = r === undefined ? null : homologacaoVigenteDe(r.adjudicacao);
    const c = r === undefined ? { direto: new Decimal(0), emAta: new Decimal(0) } : await comprometidoDoItem(tx, r.id);
    quadro.push({
      id: i.id, numero: i.numero, lote: i.lote, descricao: i.descricao, unidade: i.unidade, quantidade: i.quantidade.toFixed(4),
      propostas: props.map((p) => ({ participanteId: p.participanteId, participante: nomePorParticipante.get(p.participanteId) ?? "", valorUnitario: p.valorUnitario.toFixed(4), versao: p.versao, abrangencia: p.abrangencia })),
      resultado: r === undefined ? null : { id: r.id, situacao: r.situacao, participanteId: r.participanteId, participante: r.participanteId === null ? null : (nomePorParticipante.get(r.participanteId) ?? null), valorUnitario: r.valorUnitario?.toFixed(4) ?? null, criterio: r.resultado.criterio, corrigido: i.resultados.length > 1 },
      adjudicado: r?.adjudicacao === null || r === undefined ? null : { id: r.adjudicacao.id, data: r.adjudicacao.adjudicacao.data },
      homologado: hom === null ? null : { atoId: hom.id, data: hom.data },
      contratadoDireto: c.direto.toFixed(4),
      registradoEmAta: c.emAta.toFixed(4),
    });
  }
  return {
    itens: quadro,
    participantes: participantes.map((p) => ({ id: p.id, documento: p.pessoa.documento, nome: nomeDe(p.pessoa) })),
    atos: atos.map((a) => ({ id: a.id, data: a.data, autoridade: a.autoridade, documento: a.documento, corrigeId: a.corrigeId, corrigido: a.corrigidoPor !== null, motivo: a.motivo, itens: a.itens.map((x) => x.itemAdjudicado.itemDoResultado.item.numero).sort((x, y) => x - y) })),
    atas: atas.map((a) => ({
      id: a.id, numero: a.numero, vigenciaInicio: a.vigenciaInicio, vigenciaFim: a.vigenciaFim,
      itens: a.itens.map((ia) => {
        const registrado = new Decimal(ia.quantidade.toFixed(4));
        const contratado = ia.contratacoes.reduce((t, c) => t.plus(c.quantidade.toFixed(4)), new Decimal(0));
        const saldo = registrado.minus(contratado);
        const unit = new Decimal(ia.itemDoResultado.valorUnitario?.toFixed(4) ?? "0");
        return {
          id: ia.id, item: ia.itemDoResultado.item.numero, descricao: ia.itemDoResultado.item.descricao, unidade: ia.itemDoResultado.item.unidade,
          participanteId: ia.itemDoResultado.participanteId ?? "", fornecedor: ia.itemDoResultado.participante === null ? "" : nomeDe(ia.itemDoResultado.participante.pessoa),
          valorUnitario: unit.toFixed(4), registrado: registrado.toFixed(4), contratado: contratado.toFixed(4), saldo: saldo.toFixed(4), saldoEmReais: toMoney(saldo.times(unit)).toFixed(2),
        };
      }),
    })),
  };
}
