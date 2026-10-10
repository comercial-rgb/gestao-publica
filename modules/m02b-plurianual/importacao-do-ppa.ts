import { createHash } from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { toMoney } from "../../packages/contracts/index.js";
import { travar } from "../../packages/locks/index.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { valorVigente } from "./alteracao.js";
import { atribuirCodigoReduzidoNaTransacao } from "./codigo-reduzido.js";
import { anoNoQuadrienio } from "./dominio.js";
import { zMapaDeAnos } from "./importacao-da-ldo.js";

/**
 * V39-R2 (R2-022, V39-018) — PREPARAR O PPA DO CICLO SEGUINTE A PARTIR DO PLANO ANTERIOR.
 *
 * DUAS COISAS DIFERENTES, E SÓ UMA É ESTA:
 *   · REVISAR O CICLO VIGENTE é o ato de alteração no próprio plano (`servico-alteracao.ts`): ajuste com sinal por
 *     linha, a versão anterior preservada (o estado até cada ato). A importação RECUSA destino que se sobrepõe à origem
 *     e diz isso.
 *   · PREPARAR O SEGUINTE é esta cópia: o plano de destino começa depois do fim da origem, não tem ato de alteração e
 *     tem vazios os blocos escolhidos. Copia programas (com indicadores e ações) e previsões de receita (pelo mapa dos
 *     anos, dentro do quadriênio do destino), pelos valores VIGENTES da origem.
 *
 * A ORIGEM E A VERSÃO FICAM GRAVADAS: o registro diz de que plano veio, qual era o último ato de alteração dele no
 * momento da cópia (a versão copiada), e cada linha copiada aponta a de origem. Prévia e confirmação como na LDO.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export const BLOCOS_DO_PPA = ["PROGRAMAS", "PREVISOES_RECEITA"] as const;
export type BlocoDoPpa = (typeof BLOCOS_DO_PPA)[number];
export const ROTULO_DO_BLOCO_DO_PPA: Readonly<Record<BlocoDoPpa, string>> = {
  PROGRAMAS: "Programas, com indicadores e ações",
  PREVISOES_RECEITA: "Previsões de receita",
};

/** As ações que cada bloco exige de quem importa: as mesmas do cadastro manual do bloco. */
const ACOES_DO_BLOCO: Readonly<Record<BlocoDoPpa, readonly string[]>> = {
  PROGRAMAS: [ACAO_DO_SERVICO.criarProgramaPpa, ACAO_DO_SERVICO.criarAcaoPpa, ACAO_DO_SERVICO.criarIndicadorPrograma],
  PREVISOES_RECEITA: [ACAO_DO_SERVICO.criarPrevisaoReceitaPpa],
};

export const zPreviaDaImportacaoDoPpa = z.object({
  origemId: z.string().min(1),
  destinoId: z.string().min(1),
  blocos: z.array(z.enum(BLOCOS_DO_PPA)).min(1, "Escolha ao menos um bloco para importar.").refine((b) => new Set(b).size === b.length, "Bloco repetido."),
  anos: zMapaDeAnos,
});
export type PreviaDaImportacaoDoPpaInput = z.input<typeof zPreviaDaImportacaoDoPpa>;
export const zImportarPpa = zPreviaDaImportacaoDoPpa.extend({
  versaoDaPrevia: z.string().regex(/^[0-9a-f]{64}$/, "A importação se confirma a partir da prévia."),
  criadoPor: z.string().min(1),
});
export type ImportarPpaInput = z.input<typeof zImportarPpa>;

export interface ProgramaCopiado {
  readonly origemId: string;
  readonly descricao: string;
  readonly alterado: boolean;
  readonly dados: { readonly programaId: string; readonly areaTematicaId: string; readonly publicoAlvoId: string | null; readonly estrategia: string | null; readonly valorPrevisto: string };
  readonly indicadores: readonly { readonly origemId: string; readonly descricao: string; readonly unidadeMedida: string; readonly situacaoInicial: string; readonly situacaoModificada: string }[];
  readonly acoes: readonly {
    readonly origemId: string; readonly acaoId: string; readonly codigo: string; readonly macroacaoId: string | null; readonly unidadeExecutoraId: string; readonly funcaoId: string; readonly subfuncaoId: string;
    readonly produto: string; readonly unidadeMedida: string; readonly regiaoAtendida: string | null; readonly metaFisica: string; readonly metaFinanceira: string; readonly alterada: boolean;
  }[];
}
export interface PrevisaoCopiada {
  readonly origemId: string;
  readonly descricao: string;
  readonly anoDeOrigem: number;
  readonly alterada: boolean;
  readonly dados: { readonly naturezaReceitaId: string; readonly fonteId: string; readonly ano: number; readonly valor: string };
}

export interface PreviaDaImportacaoDoPpa {
  readonly origem: { readonly id: string; readonly anoInicio: number; readonly anoFim: number };
  readonly destino: { readonly id: string; readonly anoInicio: number; readonly anoFim: number };
  /** O último ato de alteração da origem: a versão que se copia (nulo: o plano como publicado). */
  readonly versaoDaOrigem: { readonly atoId: string; readonly descricao: string } | null;
  readonly programas: readonly ProgramaCopiado[];
  readonly previsoes: readonly PrevisaoCopiada[];
  readonly fora: readonly { readonly bloco: BlocoDoPpa; readonly origemId: string; readonly descricao: string; readonly motivo: string }[];
  readonly recusas: readonly string[];
  readonly versao: string;
}

const dec2 = (d: { toFixed(n: number): string }): string => d.toFixed(2);
const dec6 = (d: { toFixed(n: number): string }): string => d.toFixed(6);
const vigente = (original: { toFixed(n: number): string }, alteracoes: readonly { readonly grandeza: string; readonly valorAjuste: { toFixed(n: number): string } }[], grandeza: string): string =>
  valorVigente(toMoney(dec2(original)), alteracoes.filter((a) => a.grandeza === grandeza).map((a) => toMoney(dec2(a.valorAjuste)))).toFixed(2);

export async function previaDaImportacaoDoPpa(tx: Tx, input: PreviaDaImportacaoDoPpaInput): Promise<PreviaDaImportacaoDoPpa> {
  const d = zPreviaDaImportacaoDoPpa.parse(input);
  const sel = { id: true, anoInicio: true, anoFim: true, _count: { select: { atosDeAlteracao: true, programas: true, previsoes: true } } } as const;
  const [origem, destino] = await Promise.all([
    tx.planoPlurianual.findUnique({ where: { id: d.origemId }, select: sel }),
    tx.planoPlurianual.findUnique({ where: { id: d.destinoId }, select: sel }),
  ]);
  if (origem === null) throw new Error("O plano de origem não existe. Nada foi gravado.");
  if (destino === null) throw new Error("O plano de destino não existe. Nada foi gravado.");
  const periodo = (p: { anoInicio: number; anoFim: number }): string => `${String(p.anoInicio)}–${String(p.anoFim)}`;

  const recusas: string[] = [];
  if (destino.anoInicio <= origem.anoFim) {
    recusas.push(
      `O plano ${periodo(destino)} não começa depois do fim do plano ${periodo(origem)}: isto seria revisar o ciclo em vigor, e a revisão se faz por ato de alteração no próprio plano (que preserva a versão anterior). A importação só prepara o plano seguinte.`
    );
  }
  if (destino._count.atosDeAlteracao > 0) recusas.push(`O plano ${periodo(destino)} já tem ato de alteração: a importação só grava em plano em preparação.`);
  if (d.blocos.includes("PROGRAMAS") && destino._count.programas > 0) recusas.push(`O plano ${periodo(destino)} já tem programas (${String(destino._count.programas)}): a importação não mistura nem substitui.`);
  if (d.blocos.includes("PREVISOES_RECEITA") && destino._count.previsoes > 0) recusas.push(`O plano ${periodo(destino)} já tem previsões de receita (${String(destino._count.previsoes)}): a importação não mistura nem substitui.`);
  for (const m of d.anos) if (!anoNoQuadrienio(destino.anoInicio, destino.anoFim, m.para)) recusas.push(`O ano ${String(m.para)} do mapa dos anos está fora do quadriênio do destino (${periodo(destino)}).`);

  const ultimoAto = await tx.atoDeAlteracaoDoPlanejamento.findFirst({ where: { planoId: origem.id }, orderBy: [{ criadoEm: "desc" }, { id: "desc" }], select: { id: true, numero: true, ano: true } });
  const fora: { bloco: BlocoDoPpa; origemId: string; descricao: string; motivo: string }[] = [];
  const programas: ProgramaCopiado[] = [];
  if (d.blocos.includes("PROGRAMAS")) {
    const lidos = await tx.programaPpa.findMany({
      where: { planoId: origem.id },
      orderBy: { programa: { codigo: "asc" } },
      include: {
        programa: { select: { codigo: true, descricao: true } },
        alteracoes: { select: { grandeza: true, valorAjuste: true } },
        indicadores: { orderBy: { criadoEm: "asc" } },
        acoes: { orderBy: { acao: { codigo: "asc" } }, include: { acao: { select: { codigo: true } }, alteracoes: { select: { grandeza: true, valorAjuste: true } } } },
      },
    });
    for (const p of lidos) {
      const acoes: ProgramaCopiado["acoes"][number][] = [];
      for (const a of p.acoes) {
        if (a.unidadeExecutoraId === null || a.funcaoId === null || a.subfuncaoId === null) {
          fora.push({ bloco: "PROGRAMAS", origemId: a.id, descricao: `ação ${a.acao.codigo} do programa ${p.programa.codigo}`, motivo: "a ação não tem unidade executora, função e subfunção na origem: o plano novo exige as três (cadastre-a no destino)" });
          continue;
        }
        acoes.push({
          origemId: a.id, acaoId: a.acaoId, codigo: a.acao.codigo, macroacaoId: a.macroacaoId, unidadeExecutoraId: a.unidadeExecutoraId, funcaoId: a.funcaoId, subfuncaoId: a.subfuncaoId,
          produto: a.produto, unidadeMedida: a.unidadeMedida, regiaoAtendida: a.regiaoAtendida, metaFisica: dec6(a.metaFisica), metaFinanceira: vigente(a.metaFinanceira, a.alteracoes, "metaFinanceira"), alterada: a.alteracoes.length > 0,
        });
      }
      programas.push({
        origemId: p.id, descricao: `${p.programa.codigo} ${p.programa.descricao}`, alterado: p.alteracoes.length > 0,
        dados: { programaId: p.programaId, areaTematicaId: p.areaTematicaId, publicoAlvoId: p.publicoAlvoId, estrategia: p.estrategia, valorPrevisto: vigente(p.valorPrevisto, p.alteracoes, "valorPrevisto") },
        indicadores: p.indicadores.map((i) => ({ origemId: i.id, descricao: i.descricao, unidadeMedida: i.unidadeMedida, situacaoInicial: dec6(i.situacaoInicial), situacaoModificada: dec6(i.situacaoModificada) })),
        acoes,
      });
    }
  }
  const previsoes: PrevisaoCopiada[] = [];
  if (d.blocos.includes("PREVISOES_RECEITA")) {
    const para = new Map(d.anos.map((x) => [x.de, x.para]));
    const lidas = await tx.previsaoReceitaPpa.findMany({
      where: { planoId: origem.id },
      orderBy: [{ ano: "asc" }, { naturezaReceita: { codigo: "asc" } }, { fonte: { codigo: "asc" } }],
      include: { naturezaReceita: { select: { codigo: true } }, fonte: { select: { codigo: true } }, alteracoes: { select: { grandeza: true, valorAjuste: true } } },
    });
    for (const r of lidas) {
      const descricao = `${r.naturezaReceita.codigo} / fonte ${r.fonte.codigo} em ${String(r.ano)}`;
      const ano = para.get(r.ano);
      if (ano === undefined) { fora.push({ bloco: "PREVISOES_RECEITA", origemId: r.id, descricao, motivo: `o ano ${String(r.ano)} não tem correspondência no mapa dos anos` }); continue; }
      previsoes.push({ origemId: r.id, descricao, anoDeOrigem: r.ano, alterada: r.alteracoes.length > 0, dados: { naturezaReceitaId: r.naturezaReceitaId, fonteId: r.fonteId, ano, valor: vigente(r.valor, r.alteracoes, "valor") } });
    }
  }
  if (programas.length === 0 && previsoes.length === 0 && recusas.length === 0) recusas.push("Nos blocos escolhidos não há linha a copiar (ou todas ficaram de fora pelo mapa dos anos).");

  const versaoDaOrigem = ultimoAto === null ? null : { atoId: ultimoAto.id, descricao: `ato ${ultimoAto.numero}/${String(ultimoAto.ano)}` };
  const versao = createHash("sha256").update(JSON.stringify({ o: origem.id, d: destino.id, b: d.blocos, a: d.anos, v: versaoDaOrigem, p: programas, r: previsoes, f: fora, x: recusas })).digest("hex");
  return { origem: { id: origem.id, anoInicio: origem.anoInicio, anoFim: origem.anoFim }, destino: { id: destino.id, anoInicio: destino.anoInicio, anoFim: destino.anoFim }, versaoDaOrigem, programas, previsoes, fora, recusas, versao };
}

export async function importarPpa(prisma: PrismaClient, input: ImportarPpaInput): Promise<{ readonly importacaoId: string; readonly programas: number; readonly acoes: number; readonly previsoes: number }> {
  const d = zImportarPpa.parse(input);
  return prisma.$transaction(
    async (tx) => {
      await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.importarPpa, "ENTE");
      for (const b of d.blocos) for (const a of [...new Set(ACOES_DO_BLOCO[b])]) await autorizarNo(tx, d.criadoPor, a as Parameters<typeof autorizarNo>[2], "ENTE");
      await travar(tx, "PecaDoPlanejamento", [d.origemId, d.destinoId]);
      const previa = await previaDaImportacaoDoPpa(tx, d);
      if (previa.recusas.length > 0) throw new Error(`${previa.recusas.join(" ")} Nada foi gravado.`);
      if (previa.versao !== d.versaoDaPrevia) throw new Error("O que seria importado mudou desde a prévia (o plano de origem ou o de destino foi alterado): confira a nova prévia antes de confirmar. Nada foi gravado.");

      const imp = await tx.importacaoDoPpa.create({
        data: { origemId: d.origemId, destinoId: d.destinoId, versaoDaOrigemAtoId: previa.versaoDaOrigem?.atoId ?? null, blocos: [...d.blocos], anos: d.anos, versaoDaPrevia: d.versaoDaPrevia, criadoPor: d.criadoPor },
        select: { id: true },
      });
      const planoId = d.destinoId;
      const criadoPor = d.criadoPor;
      const itens: { importacaoId: string; bloco: string; origemId: string; destinoId: string }[] = [];
      let acoes = 0;
      for (const p of previa.programas) {
        const novo = await tx.programaPpa.create({ data: { planoId, criadoPor, ...p.dados }, select: { id: true } });
        itens.push({ importacaoId: imp.id, bloco: "PROGRAMAS", origemId: p.origemId, destinoId: novo.id });
        for (const i of p.indicadores) {
          const ind = await tx.indicadorPrograma.create({ data: { programaPpaId: novo.id, criadoPor, descricao: i.descricao, unidadeMedida: i.unidadeMedida, situacaoInicial: i.situacaoInicial, situacaoModificada: i.situacaoModificada }, select: { id: true } });
          itens.push({ importacaoId: imp.id, bloco: "INDICADORES", origemId: i.origemId, destinoId: ind.id });
        }
        for (const a of p.acoes) {
          const nova = await tx.acaoPpa.create({
            data: { programaPpaId: novo.id, criadoPor, acaoId: a.acaoId, macroacaoId: a.macroacaoId, unidadeExecutoraId: a.unidadeExecutoraId, funcaoId: a.funcaoId, subfuncaoId: a.subfuncaoId, produto: a.produto, unidadeMedida: a.unidadeMedida, regiaoAtendida: a.regiaoAtendida, metaFisica: a.metaFisica, metaFinanceira: a.metaFinanceira },
            select: { id: true },
          });
          // O código reduzido é do plano NOVO: numerado nele, como no cadastro manual da ação.
          await atribuirCodigoReduzidoNaTransacao(tx, { planoId, unidadeExecutoraId: a.unidadeExecutoraId, funcaoId: a.funcaoId, subfuncaoId: a.subfuncaoId, programaId: p.dados.programaId, acaoId: a.acaoId, criadoPor });
          itens.push({ importacaoId: imp.id, bloco: "ACOES", origemId: a.origemId, destinoId: nova.id });
          acoes += 1;
        }
      }
      for (const r of previa.previsoes) {
        const nova = await tx.previsaoReceitaPpa.create({ data: { planoId, criadoPor, ...r.dados }, select: { id: true } });
        itens.push({ importacaoId: imp.id, bloco: "PREVISOES_RECEITA", origemId: r.origemId, destinoId: nova.id });
      }
      await tx.itemImportadoDoPpa.createMany({ data: itens });
      return { importacaoId: imp.id, programas: previa.programas.length, acoes, previsoes: previa.previsoes.length };
    },
    { timeout: 60_000 }
  );
}
