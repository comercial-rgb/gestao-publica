import { createHash } from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import { travar } from "../../packages/locks/index.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { valorVigente } from "./alteracao.js";

/**
 * V39-R2 (R2-021, V39-017) — IMPORTAR A LDO DE OUTRO EXERCÍCIO PARA UMA LDO EM RASCUNHO.
 *
 * Quem prepara a LDO do ano seguinte parte da anterior: escolhe os blocos (prioridades, metas, riscos...), diz como os
 * anos se correspondem (a meta de 2027 da LDO de 2026 pode ser a de 2027 da nova, ou não ser copiada), vê a PRÉVIA do
 * que será copiado e do que fica de fora com o motivo, e confirma. A confirmação recalcula a prévia e recusa se ela
 * mudou desde que foi apresentada.
 *
 * O DESTINO É RASCUNHO: a LDO de destino não tem envio, devolução, protocolo nem sanção, nem ato de alteração, e os
 * blocos escolhidos estão vazios nela (a importação não mistura nem substitui). NADA DO TRÂMITE DA ORIGEM É COPIADO:
 * as datas e o protocolo pertencem à lei, não ao conteúdo.
 *
 * AS METAS ANUAIS vão pelo valor VIGENTE da origem (original mais os ajustes dos atos de alteração), e a prévia diz
 * quais foram alteradas. As emendas e os atos da origem não se copiam: o que eles mudaram já está no valor vigente.
 *
 * Cada linha copiada fica registrada com a linha de origem (`ItemImportadoDaLdo`).
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export const BLOCOS_DA_LDO = ["PRIORIDADES", "METAS_ANUAIS", "RISCOS_FISCAIS", "RENUNCIAS", "ALIENACOES", "DIVIDAS", "PROJECOES_RPPS", "MARGENS", "OBRAS_PREVISTAS"] as const;
export type BlocoDaLdo = (typeof BLOCOS_DA_LDO)[number];

export const ROTULO_DO_BLOCO_DA_LDO: Readonly<Record<BlocoDaLdo, string>> = {
  PRIORIDADES: "Prioridades",
  METAS_ANUAIS: "Metas anuais",
  RISCOS_FISCAIS: "Riscos fiscais",
  RENUNCIAS: "Renúncias de receita",
  ALIENACOES: "Alienações de bens e aplicação do produto",
  DIVIDAS: "Dívida consolidada projetada",
  PROJECOES_RPPS: "Projeção atuarial do regime próprio",
  MARGENS: "Margem de expansão das despesas obrigatórias",
  OBRAS_PREVISTAS: "Obras previstas",
};

/** Os blocos cujas linhas têm ano (o mapa dos anos se aplica a elas; na alienação, ao ano da aplicação). */
export const BLOCOS_COM_ANO: readonly BlocoDaLdo[] = ["METAS_ANUAIS", "ALIENACOES", "DIVIDAS", "PROJECOES_RPPS", "MARGENS"];

/** A ação que cada bloco exige de quem importa: a mesma do cadastro manual daquele bloco. */
const ACAO_DO_BLOCO: Readonly<Record<BlocoDaLdo, string>> = {
  PRIORIDADES: ACAO_DO_SERVICO.criarPrioridadeLdo,
  METAS_ANUAIS: ACAO_DO_SERVICO.criarMetaAnualLdo,
  RISCOS_FISCAIS: ACAO_DO_SERVICO.criarRiscoFiscal,
  RENUNCIAS: ACAO_DO_SERVICO.criarRenunciaReceitaLdo,
  ALIENACOES: ACAO_DO_SERVICO.criarAlienacaoBemLdo,
  DIVIDAS: ACAO_DO_SERVICO.criarDividaConsolidadaLdo,
  PROJECOES_RPPS: ACAO_DO_SERVICO.criarProjecaoAtuarialRpps,
  MARGENS: ACAO_DO_SERVICO.criarMargemExpansaoLdo,
  OBRAS_PREVISTAS: ACAO_DO_SERVICO.criarObraPrevistaLdo,
};

const zAno = z.number().int().min(1900).max(2200);
export const zMapaDeAnos = z
  .array(z.object({ de: zAno, para: zAno }))
  .refine((m) => new Set(m.map((x) => x.de)).size === m.length, "Cada ano de origem aparece uma vez só no mapa dos anos.")
  .refine((m) => new Set(m.map((x) => x.para)).size === m.length, "Dois anos de origem não podem ir para o mesmo ano de destino.");

export const zPreviaDaImportacaoDaLdo = z.object({
  origemId: z.string().min(1),
  destinoId: z.string().min(1),
  blocos: z.array(z.enum(BLOCOS_DA_LDO)).min(1, "Escolha ao menos um bloco para importar.").refine((b) => new Set(b).size === b.length, "Bloco repetido."),
  anos: zMapaDeAnos,
});
export type PreviaDaImportacaoDaLdoInput = z.input<typeof zPreviaDaImportacaoDaLdo>;

export const zImportarLdo = zPreviaDaImportacaoDaLdo.extend({
  versaoDaPrevia: z.string().regex(/^[0-9a-f]{64}$/, "A importação se confirma a partir da prévia."),
  criadoPor: z.string().min(1),
});
export type ImportarLdoInput = z.input<typeof zImportarLdo>;

/** Uma linha que a importação copia: o que será gravado no destino (sem a LDO e o autor). */
export interface CopiaDaLdo {
  readonly bloco: BlocoDaLdo;
  readonly origemId: string;
  readonly descricao: string;
  readonly anoDeOrigem: number | null;
  readonly anoDeDestino: number | null;
  /** Meta anual com ajuste por ato de alteração: o valor copiado é o vigente. */
  readonly alterada: boolean;
  /** O que a pessoa precisa conferir na linha copiada (não impede a importação). */
  readonly aviso: string | null;
  readonly dados: Readonly<Record<string, string | number | null>>;
  /** Só na alienação: as aplicações que vão junto (as de ano sem correspondência ficam em `fora`). */
  readonly aplicacoes: readonly { readonly origemId: string; readonly dados: Readonly<Record<string, string | number>> }[];
}

export interface PreviaDaImportacaoDaLdo {
  readonly origem: { readonly id: string; readonly exercicio: number };
  readonly destino: { readonly id: string; readonly exercicio: number };
  readonly copias: readonly CopiaDaLdo[];
  readonly fora: readonly { readonly bloco: BlocoDaLdo; readonly origemId: string; readonly descricao: string; readonly motivo: string }[];
  /** Por que a importação não pode ser confirmada (vazio: pode). */
  readonly recusas: readonly string[];
  readonly versao: string;
}

const dec2 = (d: { toFixed(n: number): string }): string => d.toFixed(2);
const dec6 = (d: { toFixed(n: number): string }): string => d.toFixed(6);
const brl = (s: string): string => toMoney(s).toFixed(2);

const GRANDEZAS_DA_META = ["receitaTotal", "receitaPrimaria", "despesaTotal", "despesaPrimaria", "resultadoNominal", "dividaPublicaConsolidada", "dividaConsolidadaLiquida", "receitaPrimariaPpp", "despesaPrimariaPpp", "impactoSaldoPpp"] as const;

async function contarNoDestino(tx: Tx, ldoId: string): Promise<Record<BlocoDaLdo, number>> {
  const w = { where: { ldoId } };
  const [p, m, r, re, a, d, pr, mg, o] = await Promise.all([
    tx.prioridadeLdo.count(w), tx.metaAnualLdo.count(w), tx.riscoFiscal.count(w), tx.renunciaReceitaLdo.count(w), tx.alienacaoBemLdo.count(w),
    tx.dividaConsolidadaLdo.count(w), tx.projecaoAtuarialRpps.count(w), tx.margemExpansaoLdo.count(w), tx.obraPrevistaLdo.count(w),
  ]);
  return { PRIORIDADES: p, METAS_ANUAIS: m, RISCOS_FISCAIS: r, RENUNCIAS: re, ALIENACOES: a, DIVIDAS: d, PROJECOES_RPPS: pr, MARGENS: mg, OBRAS_PREVISTAS: o };
}

export async function previaDaImportacaoDaLdo(tx: Tx, input: PreviaDaImportacaoDaLdoInput): Promise<PreviaDaImportacaoDaLdo> {
  const d = zPreviaDaImportacaoDaLdo.parse(input);
  const sel = { id: true, exercicio: true, dataEnvioLegislativo: true, dataDevolucaoExecutivo: true, numeroProtocolo: true, dataSancao: true, _count: { select: { atosDeAlteracao: true } } } as const;
  const [origem, destino] = await Promise.all([
    tx.leiDiretrizesOrcamentarias.findUnique({ where: { id: d.origemId }, select: sel }),
    tx.leiDiretrizesOrcamentarias.findUnique({ where: { id: d.destinoId }, select: sel }),
  ]);
  if (origem === null) throw new Error("A LDO de origem não existe. Nada foi gravado.");
  if (destino === null) throw new Error("A LDO de destino não existe. Nada foi gravado.");

  const recusas: string[] = [];
  if (origem.id === destino.id) recusas.push("A LDO de origem e a de destino são a mesma.");
  const tramite = [
    destino.dataEnvioLegislativo !== null ? "envio ao Legislativo" : null,
    destino.dataDevolucaoExecutivo !== null ? "devolução ao Executivo" : null,
    destino.numeroProtocolo !== null ? "protocolo" : null,
    destino.dataSancao !== null ? "sanção" : null,
    destino._count.atosDeAlteracao > 0 ? "ato de alteração" : null,
  ].filter((x): x is string => x !== null);
  if (tramite.length > 0) recusas.push(`A LDO de ${String(destino.exercicio)} já tem ${tramite.join(", ")}: a importação só grava em LDO em rascunho.`);
  const noDestino = await contarNoDestino(tx, destino.id);
  for (const b of d.blocos) if (noDestino[b] > 0) recusas.push(`A LDO de ${String(destino.exercicio)} já tem ${ROTULO_DO_BLOCO_DA_LDO[b].toLowerCase()} (${String(noDestino[b])}): a importação não mistura nem substitui.`);

  const para = new Map(d.anos.map((x) => [x.de, x.para]));
  const copias: CopiaDaLdo[] = [];
  const fora: { bloco: BlocoDaLdo; origemId: string; descricao: string; motivo: string }[] = [];
  const semAno = (bloco: BlocoDaLdo, origemId: string, descricao: string, ano: number): void => {
    fora.push({ bloco, origemId, descricao, motivo: `o ano ${String(ano)} não tem correspondência no mapa dos anos` });
  };
  const w = { where: { ldoId: origem.id } };
  // Aviso, não recusa: a regra de quais anos cada anexo traz é da lei e do manual, não deste serviço.
  const avisoDoAno = (ano: number): string | null => (ano < destino.exercicio ? `ano anterior ao exercício da LDO de destino (${String(destino.exercicio)})` : null);
  const quer = (b: BlocoDaLdo): boolean => d.blocos.includes(b);

  if (quer("PRIORIDADES")) {
    for (const x of await tx.prioridadeLdo.findMany({ ...w, orderBy: { criadoEm: "asc" } })) {
      copias.push({ bloco: "PRIORIDADES", origemId: x.id, descricao: x.descricaoAcao, anoDeOrigem: null, anoDeDestino: null, alterada: false, aviso: null, aplicacoes: [],
        dados: { acaoId: x.acaoId, descricaoAcao: x.descricaoAcao, produto: x.produto, unidadeMedida: x.unidadeMedida, meta: dec6(x.meta) } });
    }
  }
  if (quer("METAS_ANUAIS")) {
    for (const x of await tx.metaAnualLdo.findMany({ ...w, orderBy: { ano: "asc" }, include: { alteracoes: { select: { grandeza: true, valorAjuste: true } } } })) {
      const destinoAno = para.get(x.ano);
      if (destinoAno === undefined) { semAno("METAS_ANUAIS", x.id, `metas de ${String(x.ano)}`, x.ano); continue; }
      const dados: Record<string, string | number> = { ano: destinoAno };
      for (const g of GRANDEZAS_DA_META) {
        const ajustes: Money[] = x.alteracoes.filter((a) => a.grandeza === g).map((a) => toMoney(dec2(a.valorAjuste)));
        dados[g] = valorVigente(toMoney(dec2(x[g])), ajustes).toFixed(2);
      }
      copias.push({ bloco: "METAS_ANUAIS", origemId: x.id, descricao: `metas de ${String(x.ano)}`, anoDeOrigem: x.ano, anoDeDestino: destinoAno, alterada: x.alteracoes.length > 0, aviso: avisoDoAno(destinoAno), aplicacoes: [], dados });
    }
  }
  if (quer("RISCOS_FISCAIS")) {
    for (const x of await tx.riscoFiscal.findMany({ ...w, orderBy: { criadoEm: "asc" } })) {
      copias.push({ bloco: "RISCOS_FISCAIS", origemId: x.id, descricao: x.descricaoPassivo, anoDeOrigem: null, anoDeDestino: null, alterada: false, aviso: null, aplicacoes: [],
        dados: { codigoPassivo: x.codigoPassivo, descricaoPassivo: x.descricaoPassivo, valorPassivo: dec2(x.valorPassivo), descricaoProvidencia: x.descricaoProvidencia, valorProvidencia: dec2(x.valorProvidencia) } });
    }
  }
  if (quer("RENUNCIAS")) {
    for (const x of await tx.renunciaReceitaLdo.findMany({ ...w, orderBy: { criadoEm: "asc" } })) {
      copias.push({ bloco: "RENUNCIAS", origemId: x.id, descricao: x.descricao, anoDeOrigem: null, anoDeDestino: null, alterada: false, aviso: null, aplicacoes: [],
        dados: { descricao: x.descricao, valor: dec2(x.valor), descricaoCompensacao: x.descricaoCompensacao, valorCompensacao: dec2(x.valorCompensacao) } });
    }
  }
  if (quer("ALIENACOES")) {
    for (const x of await tx.alienacaoBemLdo.findMany({ ...w, orderBy: { criadoEm: "asc" }, include: { aplicacoes: { orderBy: { criadoEm: "asc" } } } })) {
      const aplicacoes: { origemId: string; dados: Record<string, string | number> }[] = [];
      for (const a of x.aplicacoes) {
        const destinoAno = para.get(a.anoAplicacao);
        if (destinoAno === undefined) { semAno("ALIENACOES", a.id, `aplicação de ${x.descricaoBem} em ${String(a.anoAplicacao)}`, a.anoAplicacao); continue; }
        aplicacoes.push({ origemId: a.id, dados: { tipoAplicacao: a.tipoAplicacao, anoAplicacao: destinoAno, descricao: a.descricao, valor: dec2(a.valor) } });
      }
      copias.push({ bloco: "ALIENACOES", origemId: x.id, descricao: x.descricaoBem, anoDeOrigem: null, anoDeDestino: null, alterada: false, aviso: null, aplicacoes,
        dados: { descricaoBem: x.descricaoBem, valorAlienacao: dec2(x.valorAlienacao), numeroLaudo: x.numeroLaudo } });
    }
  }
  const porAno = async <T extends { id: string; ano: number }>(bloco: BlocoDaLdo, linhas: readonly T[], rotulo: string, dados: (x: T) => Record<string, string>): Promise<void> => {
    for (const x of linhas) {
      const destinoAno = para.get(x.ano);
      if (destinoAno === undefined) { semAno(bloco, x.id, `${rotulo} de ${String(x.ano)}`, x.ano); continue; }
      copias.push({ bloco, origemId: x.id, descricao: `${rotulo} de ${String(x.ano)}`, anoDeOrigem: x.ano, anoDeDestino: destinoAno, alterada: false, aviso: avisoDoAno(destinoAno), aplicacoes: [], dados: { ano: destinoAno, ...dados(x) } });
    }
  };
  if (quer("DIVIDAS")) {
    await porAno("DIVIDAS", await tx.dividaConsolidadaLdo.findMany({ ...w, orderBy: { ano: "asc" } }), "dívida consolidada",
      (x) => ({ dividaConsolidada: dec2(x.dividaConsolidada), deducoes: dec2(x.deducoes), receitaCorrenteLiquida: dec2(x.receitaCorrenteLiquida), percentualRcl: dec6(x.percentualRcl) }));
  }
  if (quer("PROJECOES_RPPS")) {
    await porAno("PROJECOES_RPPS", await tx.projecaoAtuarialRpps.findMany({ ...w, orderBy: { ano: "asc" } }), "projeção atuarial",
      (x) => ({ receitasPrevidenciarias: dec2(x.receitasPrevidenciarias), despesasPrevidenciarias: dec2(x.despesasPrevidenciarias), resultadoPrevidenciario: dec2(x.resultadoPrevidenciario), saldoFinanceiro: dec2(x.saldoFinanceiro) }));
  }
  if (quer("MARGENS")) {
    await porAno("MARGENS", await tx.margemExpansaoLdo.findMany({ ...w, orderBy: { ano: "asc" } }), "margem de expansão",
      (x) => ({ aumentoPermanenteReceita: dec2(x.aumentoPermanenteReceita), reducaoPermanenteDespesa: dec2(x.reducaoPermanenteDespesa), novasDespesasObrigatorias: dec2(x.novasDespesasObrigatorias) }));
  }
  if (quer("OBRAS_PREVISTAS")) {
    for (const x of await tx.obraPrevistaLdo.findMany({ ...w, orderBy: { criadoEm: "asc" } })) {
      copias.push({ bloco: "OBRAS_PREVISTAS", origemId: x.id, descricao: x.descricao, anoDeOrigem: null, anoDeDestino: null, alterada: false, aviso: "valor no exercício e data de início copiados como estavam na origem: confira para o novo exercício", aplicacoes: [],
        dados: { orgaoId: x.orgaoId, obraId: x.obraId, descricao: x.descricao, dataInicio: x.dataInicio.toISOString(), valorPrevisto: dec2(x.valorPrevisto), valorConservacao: dec2(x.valorConservacao), valorNovosProjetos: dec2(x.valorNovosProjetos), valorNoExercicio: dec2(x.valorNoExercicio) } });
    }
  }
  if (copias.length === 0 && recusas.length === 0) recusas.push("Nos blocos escolhidos não há linha a copiar (ou todas ficaram de fora pelo mapa dos anos).");

  const versao = createHash("sha256").update(JSON.stringify({ o: origem.id, d: destino.id, b: d.blocos, a: d.anos, c: copias, f: fora, r: recusas })).digest("hex");
  return { origem: { id: origem.id, exercicio: origem.exercicio }, destino: { id: destino.id, exercicio: destino.exercicio }, copias, fora, recusas, versao };
}

export async function importarLdo(prisma: PrismaClient, input: ImportarLdoInput): Promise<{ readonly importacaoId: string; readonly copiadas: number }> {
  const d = zImportarLdo.parse(input);
  return prisma.$transaction(
    async (tx) => {
      await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.importarLdo, "ENTE");
      for (const b of d.blocos) await autorizarNo(tx, d.criadoPor, ACAO_DO_BLOCO[b] as Parameters<typeof autorizarNo>[2], "ENTE");
      // A origem trava junto: um ato de alteração concorrente nela mudaria o vigente que a prévia mostrou.
      await travar(tx, "PecaDoPlanejamento", [d.origemId, d.destinoId]);
      const previa = await previaDaImportacaoDaLdo(tx, d);
      if (previa.recusas.length > 0) throw new Error(`${previa.recusas.join(" ")} Nada foi gravado.`);
      if (previa.versao !== d.versaoDaPrevia) throw new Error("O que seria importado mudou desde a prévia (a LDO de origem ou a de destino foi alterada): confira a nova prévia antes de confirmar. Nada foi gravado.");

      const imp = await tx.importacaoDaLdo.create({ data: { origemId: d.origemId, destinoId: d.destinoId, blocos: [...d.blocos], anos: d.anos, versaoDaPrevia: d.versaoDaPrevia, criadoPor: d.criadoPor }, select: { id: true } });
      const ldoId = d.destinoId;
      const criadoPor = d.criadoPor;
      const itens: { importacaoId: string; bloco: string; origemId: string; destinoId: string }[] = [];
      const s = (c: CopiaDaLdo, k: string): string => String(c.dados[k]);
      for (const c of previa.copias) {
        let id: string;
        switch (c.bloco) {
          case "PRIORIDADES":
            id = (await tx.prioridadeLdo.create({ data: { ldoId, criadoPor, acaoId: (c.dados["acaoId"] as string | null) ?? null, descricaoAcao: s(c, "descricaoAcao"), produto: s(c, "produto"), unidadeMedida: s(c, "unidadeMedida"), meta: s(c, "meta") }, select: { id: true } })).id;
            break;
          case "METAS_ANUAIS":
            id = (await tx.metaAnualLdo.create({ data: { ldoId, criadoPor, ano: c.dados["ano"] as number, ...Object.fromEntries(GRANDEZAS_DA_META.map((g) => [g, brl(s(c, g))])) as Record<(typeof GRANDEZAS_DA_META)[number], string> }, select: { id: true } })).id;
            break;
          case "RISCOS_FISCAIS":
            id = (await tx.riscoFiscal.create({ data: { ldoId, criadoPor, codigoPassivo: s(c, "codigoPassivo"), descricaoPassivo: s(c, "descricaoPassivo"), valorPassivo: s(c, "valorPassivo"), descricaoProvidencia: s(c, "descricaoProvidencia"), valorProvidencia: s(c, "valorProvidencia") }, select: { id: true } })).id;
            break;
          case "RENUNCIAS":
            id = (await tx.renunciaReceitaLdo.create({ data: { ldoId, criadoPor, descricao: s(c, "descricao"), valor: s(c, "valor"), descricaoCompensacao: s(c, "descricaoCompensacao"), valorCompensacao: s(c, "valorCompensacao") }, select: { id: true } })).id;
            break;
          case "ALIENACOES": {
            id = (await tx.alienacaoBemLdo.create({ data: { ldoId, criadoPor, descricaoBem: s(c, "descricaoBem"), valorAlienacao: s(c, "valorAlienacao"), numeroLaudo: (c.dados["numeroLaudo"] as string | null) ?? null }, select: { id: true } })).id;
            for (const a of c.aplicacoes) {
              const ap = await tx.aplicacaoAlienacaoLdo.create({ data: { alienacaoId: id, criadoPor, tipoAplicacao: String(a.dados["tipoAplicacao"]), anoAplicacao: a.dados["anoAplicacao"] as number, descricao: String(a.dados["descricao"]), valor: String(a.dados["valor"]) }, select: { id: true } });
              itens.push({ importacaoId: imp.id, bloco: "APLICACOES", origemId: a.origemId, destinoId: ap.id });
            }
            break;
          }
          case "DIVIDAS":
            id = (await tx.dividaConsolidadaLdo.create({ data: { ldoId, criadoPor, ano: c.dados["ano"] as number, dividaConsolidada: s(c, "dividaConsolidada"), deducoes: s(c, "deducoes"), receitaCorrenteLiquida: s(c, "receitaCorrenteLiquida"), percentualRcl: s(c, "percentualRcl") }, select: { id: true } })).id;
            break;
          case "PROJECOES_RPPS":
            id = (await tx.projecaoAtuarialRpps.create({ data: { ldoId, criadoPor, ano: c.dados["ano"] as number, receitasPrevidenciarias: s(c, "receitasPrevidenciarias"), despesasPrevidenciarias: s(c, "despesasPrevidenciarias"), resultadoPrevidenciario: s(c, "resultadoPrevidenciario"), saldoFinanceiro: s(c, "saldoFinanceiro") }, select: { id: true } })).id;
            break;
          case "MARGENS":
            id = (await tx.margemExpansaoLdo.create({ data: { ldoId, criadoPor, ano: c.dados["ano"] as number, aumentoPermanenteReceita: s(c, "aumentoPermanenteReceita"), reducaoPermanenteDespesa: s(c, "reducaoPermanenteDespesa"), novasDespesasObrigatorias: s(c, "novasDespesasObrigatorias") }, select: { id: true } })).id;
            break;
          case "OBRAS_PREVISTAS":
            id = (await tx.obraPrevistaLdo.create({ data: { ldoId, criadoPor, orgaoId: s(c, "orgaoId"), obraId: (c.dados["obraId"] as string | null) ?? null, descricao: s(c, "descricao"), dataInicio: new Date(s(c, "dataInicio")), valorPrevisto: s(c, "valorPrevisto"), valorConservacao: s(c, "valorConservacao"), valorNovosProjetos: s(c, "valorNovosProjetos"), valorNoExercicio: s(c, "valorNoExercicio") }, select: { id: true } })).id;
            break;
        }
        itens.push({ importacaoId: imp.id, bloco: c.bloco, origemId: c.origemId, destinoId: id });
      }
      await tx.itemImportadoDaLdo.createMany({ data: itens });
      return { importacaoId: imp.id, copiadas: previa.copias.length };
    },
    { timeout: 60000 }
  );
}
