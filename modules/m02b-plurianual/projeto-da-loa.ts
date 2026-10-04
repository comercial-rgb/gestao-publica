import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { diaCivil, diaCivilBr, fimDoDiaCivil } from "../../packages/datas/index.js";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import { vigenteNoCorte } from "../m02-planejamento/declaracao-da-unidade.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";

/**
 * V26 (ordem, item 2.1) — A VERSÃO DO PROJETO DA LOA ENCAMINHADA À CÂMARA, com a cópia dos valores naquele dia (ver
 * `prisma/schema/m02b-projeto-da-loa.prisma`).
 *
 * A cópia sai do planejamento do exercício de destino como está no momento do registro: as fichas (dotação inicial),
 * a receita prevista com o subtipo das deduções, e os programas, ações e unidades com as declarações vigentes no dia do
 * encaminhamento. Recusa, nomeando, o que o arquivo do projeto exige e falta — e recusa tudo depois da lei aprovada.
 */

export const zCapturarVersaoDoProjetoDaLoa = z.object({
  leiId: z.string().min(1),
  tipo: z.enum(["ENCAMINHADO", "MENSAGEM_MODIFICATIVA", "EMENDADO_NA_CAMARA"]),
  dataDoEncaminhamento: z.coerce.date(),
  competenciaDaRemessa: z.string().trim().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Informe o mês da remessa ao Tribunal (AAAA-MM)."),
  documento: z.string().trim().min(5, "Informe o documento do encaminhamento (mensagem, ofício, protocolo na Câmara)."),
  fundamento: z.string().trim().min(10, "Diga de onde vem a versão (o ato de encaminhamento, a emenda)."),
  criadoPor: z.string().min(1),
});
export type CapturarVersaoDoProjetoDaLoaInput = z.input<typeof zCapturarVersaoDoProjetoDaLoa>;

export async function capturarVersaoDoProjetoDaLoa(prisma: PrismaClient, input: CapturarVersaoDoProjetoDaLoaInput): Promise<{ readonly id: string; readonly numero: number }> {
  const d = zCapturarVersaoDoProjetoDaLoa.parse(input);
  return prisma.$transaction(
    async (tx) => {
      await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.capturarVersaoDoProjetoDaLoa, "ENTE");
      const lei = await tx.leiOrcamentariaAnual.findUnique({
        where: { id: d.leiId },
        select: { exercicio: true, numeroDoProjeto: true, aprovacao: { select: { numeroDaLei: true } }, versoesDoProjeto: { select: { numero: true, tipo: true }, orderBy: { numero: "desc" } } },
      });
      if (lei === null) throw new Error("Projeto da LOA não encontrado. Nada foi gravado.");
      if (lei.aprovacao !== null) {
        throw new Error(
          `A LOA de ${String(lei.exercicio)} já foi aprovada (Lei ${lei.aprovacao.numeroDaLei}): o projeto não se reconstrói a partir da lei aprovada. ` +
            "Sem a versão registrada antes da aprovação, o projeto fica como pendência. Nada foi gravado."
        );
      }
      if (d.tipo !== "ENCAMINHADO" && lei.versoesDoProjeto.length === 0) {
        throw new Error("A primeira versão é a do projeto encaminhado; a mensagem modificativa e a emenda vêm depois dela. Nada foi gravado.");
      }
      if (Number(d.competenciaDaRemessa.slice(0, 4)) !== lei.exercicio - 1) {
        throw new Error(`A remessa do projeto da LOA de ${String(lei.exercicio)} é do ano anterior (${String(lei.exercicio - 1)}), não de ${d.competenciaDaRemessa.slice(0, 4)}. Nada foi gravado.`);
      }
      const corte = fimDoDiaCivil(diaCivil(d.dataDoEncaminhamento));

      // A despesa: as fichas do exercício de destino, pela dotação inicial.
      const fichas = await tx.fichaOrcamentaria.findMany({
        where: { exercicio: lei.exercicio },
        orderBy: [{ unidadeOrcId: "asc" }, { numero: "asc" }],
        select: {
          exercicioFonte: true,
          valorDotado: true,
          unidadeOrc: { select: { id: true, codigo: true, descricao: true, declaracoes: { select: { naturezaJuridica: true, nomeSecretario: true, cpfSecretario: true, atoDeNomeacao: true, vigenteDesde: true, criadoEm: true } } } },
          funcao: { select: { codigo: true } },
          subfuncao: { select: { codigo: true } },
          programa: { select: { id: true, codigo: true, declaracoes: { select: { descricao: true, objetivo: true, tipoObjetivoMilenio: true, vigenteDesde: true, criadoEm: true } } } },
          acao: { select: { id: true, codigo: true, tipo: true, declaracoes: { select: { descricao: true, descMeta: true, unidadeMedida: true, vigenteDesde: true, criadoEm: true } } } },
          naturezaDespesa: { select: { codCategoria: true, codNatureza: true, codModalidade: true, codElemento: true } },
          fonte: { select: { codigo: true } },
        },
      });
      if (fichas.length === 0) throw new Error(`Não há fichas de ${String(lei.exercicio)} no planejamento: não há projeto para guardar. Nada foi gravado.`);
      const receitas = await tx.receitaPrevista.findMany({
        where: { exercicio: lei.exercicio },
        select: { exercicioFonte: true, tipoReceita: true, valorPrevisto: true, naturezaReceita: { select: { codigo: true } }, fonte: { select: { codigo: true } }, detalhe: { select: { tipoDeducaoSagres: true } } },
      });

      // O que o arquivo do projeto exige e falta, nomeado de uma vez.
      const falta: string[] = [];
      const programas = new Map<string, { codigo: string; descricao: string; objetivo: string; tipoObjetivoMilenio: string }>();
      const acoes = new Map<string, { codigo: string; descricao: string; tipo: "PROJETO" | "ATIVIDADE" | "OPERACAO_ESPECIAL"; descMeta: string; unidadeMedida: string }>();
      type DeclaracaoDaUo = (typeof fichas)[number]["unidadeOrc"]["declaracoes"][number];
      const unidades = new Map<string, { codigo: string; descricao: string; nomeSecretario: string; cpfSecretario: string; atoDeNomeacao: DeclaracaoDaUo["atoDeNomeacao"]; naturezaJuridica: DeclaracaoDaUo["naturezaJuridica"] }>();
      for (const f of fichas) {
        if (!programas.has(f.programa.codigo)) {
          const v = vigenteNoCorte(f.programa.declaracoes, corte);
          if (v === null) falta.push(`programa ${f.programa.codigo} sem objetivo declarado`);
          else programas.set(f.programa.codigo, { codigo: f.programa.codigo, descricao: v.descricao, objetivo: v.objetivo, tipoObjetivoMilenio: v.tipoObjetivoMilenio });
        }
        if (!acoes.has(f.acao.codigo)) {
          const v = vigenteNoCorte(f.acao.declaracoes, corte);
          // No projeto, meta e unidade de medida são obrigatórias (§4.41) — na ação em execução não (§4.3).
          if (v === null || v.descMeta === null || v.unidadeMedida === null) falta.push(`ação ${f.acao.codigo} sem meta e unidade de medida`);
          else acoes.set(f.acao.codigo, { codigo: f.acao.codigo, descricao: v.descricao, tipo: f.acao.tipo, descMeta: v.descMeta, unidadeMedida: v.unidadeMedida });
        }
        if (!unidades.has(f.unidadeOrc.codigo)) {
          const v = vigenteNoCorte(f.unidadeOrc.declaracoes, corte);
          if (v === null) falta.push(`unidade ${f.unidadeOrc.codigo} sem secretário declarado`);
          else if (f.unidadeOrc.descricao.trim().length > 50) falta.push(`unidade ${f.unidadeOrc.codigo} com descrição acima de 50 caracteres`);
          else unidades.set(f.unidadeOrc.codigo, { codigo: f.unidadeOrc.codigo, descricao: f.unidadeOrc.descricao.trim(), nomeSecretario: v.nomeSecretario, cpfSecretario: v.cpfSecretario, atoDeNomeacao: v.atoDeNomeacao, naturezaJuridica: v.naturezaJuridica });
        }
      }
      for (const r of receitas) {
        if (r.tipoReceita === "DEDUCAO" && (r.detalhe?.tipoDeducaoSagres ?? null) === null) falta.push(`dedução ${r.naturezaReceita.codigo}/${r.fonte.codigo} sem o subtipo`);
      }
      if (falta.length > 0) {
        throw new Error(`O projeto de ${String(lei.exercicio)} não pode ser guardado como está em ${diaCivilBr(d.dataDoEncaminhamento)}: ${[...new Set(falta)].sort().join("; ")}. Nada foi gravado.`);
      }

      const numero = (lei.versoesDoProjeto[0]?.numero ?? 0) + 1;
      const v = await tx.versaoDoProjetoDaLoa.create({
        data: { leiId: d.leiId, numero, tipo: d.tipo, dataDoEncaminhamento: d.dataDoEncaminhamento, competenciaDaRemessa: d.competenciaDaRemessa, documento: d.documento, fundamento: d.fundamento, criadoPor: d.criadoPor },
        select: { id: true },
      });
      await tx.dotacaoDoProjetoDaLoa.createMany({
        data: fichas.map((f) => ({
          versaoId: v.id,
          codUnidadeOrcamentaria: f.unidadeOrc.codigo,
          codFuncao: f.funcao.codigo,
          codSubfuncao: f.subfuncao.codigo,
          codPrograma: f.programa.codigo,
          codAcao: f.acao.codigo,
          codCategoria: f.naturezaDespesa.codCategoria,
          codNatureza: f.naturezaDespesa.codNatureza,
          codModalidade: f.naturezaDespesa.codModalidade,
          codElemento: f.naturezaDespesa.codElemento,
          exercicioFonte: f.exercicioFonte,
          codFonte: f.fonte.codigo,
          valor: f.valorDotado,
        })),
      });
      await tx.receitaDoProjetoDaLoa.createMany({
        data: receitas.map((r) => ({
          versaoId: v.id,
          codNatureza: r.naturezaReceita.codigo,
          exercicioFonte: r.exercicioFonte,
          codFonte: r.fonte.codigo,
          tipoReceita: r.tipoReceita,
          tipoDeducaoSagres: r.detalhe?.tipoDeducaoSagres ?? null,
          valor: r.valorPrevisto,
        })),
      });
      await tx.programaDoProjetoDaLoa.createMany({ data: [...programas.values()].map((p) => ({ versaoId: v.id, ...p })) });
      await tx.acaoDoProjetoDaLoa.createMany({ data: [...acoes.values()].map((a) => ({ versaoId: v.id, ...a })) });
      await tx.unidadeDoProjetoDaLoa.createMany({ data: [...unidades.values()].map((u) => ({ versaoId: v.id, ...u })) });
      return { id: v.id, numero };
    },
    { timeout: 60_000 }
  );
}

/**
 * A versão do projeto que vai ao Tribunal na remessa de um mês: a última do Executivo (encaminhado ou mensagem
 * modificativa) cuja remessa é aquele mês. A emenda da Câmara não é o projeto.
 */
export async function versaoDoProjetoNaRemessa(prisma: PrismaClient, competencia: string): Promise<{ readonly id: string; readonly exercicio: number; readonly numero: number } | null> {
  const v = await prisma.versaoDoProjetoDaLoa.findFirst({
    where: { competenciaDaRemessa: competencia, tipo: { in: ["ENCAMINHADO", "MENSAGEM_MODIFICATIVA"] } },
    orderBy: { numero: "desc" },
    select: { id: true, numero: true, lei: { select: { exercicio: true } } },
  });
  return v === null ? null : { id: v.id, exercicio: v.lei.exercicio, numero: v.numero };
}

// ── V27 — o projeto contra a lei aprovada ─────────────────────────────────────────────────────────────

export interface DiferencaDoProjeto {
  readonly tipo: "DESPESA" | "RECEITA";
  /** A classificação da linha, legível. */
  readonly linha: string;
  readonly projeto: string;
  readonly lei: string;
  readonly diferenca: string;
}

/**
 * O que mudou entre uma versão guardada do projeto e a lei como está no orçamento (a dotação inicial das fichas e a
 * receita prevista). Só leitura: nada é recalculado nem sobrescrito. Linha presente só de um lado aparece com zero do
 * outro; linha igual não aparece. Os totais vêm junto.
 */
export async function diferencasDoProjetoParaALei(
  prisma: PrismaClient,
  versaoId: string
): Promise<{ readonly diferencas: readonly DiferencaDoProjeto[]; readonly totais: { readonly despesaProjeto: string; readonly despesaLei: string; readonly receitaProjeto: string; readonly receitaLei: string } }> {
  const v = await prisma.versaoDoProjetoDaLoa.findUnique({
    where: { id: versaoId },
    select: {
      lei: { select: { exercicio: true } },
      dotacoes: { select: { codUnidadeOrcamentaria: true, codFuncao: true, codSubfuncao: true, codPrograma: true, codAcao: true, codCategoria: true, codNatureza: true, codModalidade: true, codElemento: true, exercicioFonte: true, codFonte: true, valor: true } },
      receitas: { select: { codNatureza: true, exercicioFonte: true, codFonte: true, tipoReceita: true, valor: true } },
    },
  });
  if (v === null) throw new Error("Versão do projeto não encontrada.");
  const [fichas, previstas] = await Promise.all([
    prisma.fichaOrcamentaria.findMany({
      where: { exercicio: v.lei.exercicio },
      select: { valorDotado: true, exercicioFonte: true, unidadeOrc: { select: { codigo: true } }, funcao: { select: { codigo: true } }, subfuncao: { select: { codigo: true } }, programa: { select: { codigo: true } }, acao: { select: { codigo: true } }, naturezaDespesa: { select: { codCategoria: true, codNatureza: true, codModalidade: true, codElemento: true } }, fonte: { select: { codigo: true } } },
    }),
    prisma.receitaPrevista.findMany({ where: { exercicio: v.lei.exercicio }, select: { exercicioFonte: true, tipoReceita: true, valorPrevisto: true, naturezaReceita: { select: { codigo: true } }, fonte: { select: { codigo: true } } } }),
  ]);
  const somar = (m: Map<string, Money>, k: string, x: { toString(): string }): void => {
    m.set(k, toMoney((m.get(k) ?? toMoney("0")).plus(x.toString())));
  };
  const dp = new Map<string, Money>();
  const dl = new Map<string, Money>();
  for (const d of v.dotacoes) somar(dp, `${d.codUnidadeOrcamentaria}.${d.codFuncao}.${d.codSubfuncao}.${d.codPrograma}.${d.codAcao} ${d.codCategoria}.${d.codNatureza}.${d.codModalidade}.${d.codElemento} fonte ${String(d.exercicioFonte)}${d.codFonte}`, d.valor);
  for (const f of fichas) {
    const n = f.naturezaDespesa;
    somar(dl, `${f.unidadeOrc.codigo}.${f.funcao.codigo}.${f.subfuncao.codigo}.${f.programa.codigo}.${f.acao.codigo} ${n.codCategoria}.${n.codNatureza}.${n.codModalidade}.${n.codElemento} fonte ${String(f.exercicioFonte)}${f.fonte.codigo}`, f.valorDotado);
  }
  const rp = new Map<string, Money>();
  const rl = new Map<string, Money>();
  for (const r of v.receitas) somar(rp, `${r.codNatureza} fonte ${String(r.exercicioFonte)}${r.codFonte}${r.tipoReceita === "DEDUCAO" ? " (dedução)" : ""}`, r.valor);
  for (const r of previstas) somar(rl, `${r.naturezaReceita.codigo} fonte ${String(r.exercicioFonte)}${r.fonte.codigo}${r.tipoReceita === "DEDUCAO" ? " (dedução)" : ""}`, r.valorPrevisto);
  const diferencas: DiferencaDoProjeto[] = [];
  const comparar = (tipo: "DESPESA" | "RECEITA", projeto: Map<string, Money>, lei: Map<string, Money>): void => {
    for (const k of [...new Set([...projeto.keys(), ...lei.keys()])].sort()) {
      const a = projeto.get(k) ?? toMoney("0");
      const b = lei.get(k) ?? toMoney("0");
      if (!a.equals(b)) diferencas.push({ tipo, linha: k, projeto: a.toFixed(2), lei: b.toFixed(2), diferenca: b.minus(a).toFixed(2) });
    }
  };
  comparar("DESPESA", dp, dl);
  comparar("RECEITA", rp, rl);
  const total = (m: Map<string, Money>): string => [...m.values()].reduce((s, x) => toMoney(s.plus(x)), toMoney("0")).toFixed(2);
  return { diferencas, totais: { despesaProjeto: total(dp), despesaLei: total(dl), receitaProjeto: total(rp), receitaLei: total(rl) } };
}
