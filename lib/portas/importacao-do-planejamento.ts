import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";
import { mensagemDoErro } from "./mensagem-do-erro";
import {
  BLOCOS_DA_LDO,
  BLOCOS_COM_ANO,
  ROTULO_DO_BLOCO_DA_LDO,
  importarLdo,
  previaDaImportacaoDaLdo,
  type BlocoDaLdo,
} from "../../modules/m02b-plurianual/importacao-da-ldo";
import { BLOCOS_DO_PPA, ROTULO_DO_BLOCO_DO_PPA, importarPpa, previaDaImportacaoDoPpa, type BlocoDoPpa } from "../../modules/m02b-plurianual/importacao-do-ppa";

/**
 * V39-R2 (R2-021, R2-022) — A TELA DA IMPORTAÇÃO NA LDO E NO PPA. A prévia é leitura (GET, sob CONSULTAR_PLANEJAMENTO);
 * a confirmação cobra, no serviço, a ação da peça e a de cada bloco. Esta borda converte o mapa dos anos digitado
 * ("2027=2027", uma linha por ano) e traduz as duas prévias para o mesmo formato de tela.
 */

export type PecaDoPlanejamento = "LDO" | "PPA";

export interface PreviaNaTela {
  readonly origem: string;
  readonly destino: string;
  /** Só no PPA: a versão da origem que se copia. */
  readonly versaoDaOrigem: string | null;
  readonly linhas: readonly { readonly bloco: string; readonly descricao: string; readonly anos: string; readonly observacao: string }[];
  readonly fora: readonly { readonly bloco: string; readonly descricao: string; readonly motivo: string }[];
  readonly recusas: readonly string[];
  readonly versao: string;
}

export interface TelaDeImportacao {
  readonly origens: readonly { readonly id: string; readonly rotulo: string; readonly anos: readonly number[] }[];
  readonly blocos: readonly { readonly codigo: string; readonly rotulo: string; readonly comAno: boolean }[];
  readonly escolha: { readonly origemId: string; readonly blocos: readonly string[]; readonly anos: string };
  readonly previa: PreviaNaTela | null;
  readonly erroDaPrevia: string | null;
  readonly importacoes: readonly { readonly id: string; readonly quando: Date; readonly por: string; readonly origem: string; readonly blocos: string; readonly linhas: number; readonly versaoDaOrigem: string | null }[];
}

/** "2027=2027" (ou "2027 > 2028", "2027 -> 2028"), uma correspondência por linha; linha vazia é ignorada. */
export function lerMapaDeAnos(texto: string): { de: number; para: number }[] {
  const mapa: { de: number; para: number }[] = [];
  for (const bruta of texto.split(/\r?\n|;/)) {
    const linha = bruta.trim();
    if (linha === "") continue;
    const m = /^(\d{4})\s*(?:=|>|->|→)\s*(\d{4})$/.exec(linha);
    if (m === null) throw new Error(`Não entendi "${linha}" no mapa dos anos: escreva o ano da origem e o do destino, como 2027=2028.`);
    mapa.push({ de: Number(m[1]), para: Number(m[2]) });
  }
  return mapa;
}

const rotuloLdo = (b: string): string => ROTULO_DO_BLOCO_DA_LDO[b as BlocoDaLdo] ?? b;
const rotuloPpa = (b: string): string => ROTULO_DO_BLOCO_DO_PPA[b as BlocoDoPpa] ?? b;
const periodo = (p: { anoInicio: number; anoFim: number }): string => `PPA ${String(p.anoInicio)}–${String(p.anoFim)}`;

export async function lerTelaDeImportacao(
  peca: PecaDoPlanejamento,
  destinoId: string,
  pedido: { readonly origem?: string; readonly blocos: readonly string[]; readonly anos?: string }
): Promise<TelaDeImportacao> {
  await exigirLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
  const prisma = cliente();
  const escolha = { origemId: pedido.origem ?? "", blocos: [...pedido.blocos], anos: pedido.anos ?? "" };
  let previa: PreviaNaTela | null = null;
  let erroDaPrevia: string | null = null;

  if (peca === "LDO") {
    const ldos = await prisma.leiDiretrizesOrcamentarias.findMany({
      where: { id: { not: destinoId } },
      orderBy: { exercicio: "desc" },
      select: { id: true, exercicio: true, metasAnuais: { select: { ano: true } }, dividas: { select: { ano: true } }, projecoesRpps: { select: { ano: true } }, margens: { select: { ano: true } }, alienacoes: { select: { aplicacoes: { select: { anoAplicacao: true } } } } },
    });
    const origens = ldos.map((l) => ({
      id: l.id,
      rotulo: `LDO ${String(l.exercicio)}`,
      anos: [...new Set([...l.metasAnuais, ...l.dividas, ...l.projecoesRpps, ...l.margens].map((x) => x.ano).concat(l.alienacoes.flatMap((a) => a.aplicacoes.map((x) => x.anoAplicacao))))].sort(),
    }));
    if (escolha.origemId !== "" && escolha.blocos.length > 0) {
      try {
        const p = await previaDaImportacaoDaLdo(prisma, { origemId: escolha.origemId, destinoId, blocos: escolha.blocos as BlocoDaLdo[], anos: lerMapaDeAnos(escolha.anos) });
        previa = {
          origem: `LDO ${String(p.origem.exercicio)}`, destino: `LDO ${String(p.destino.exercicio)}`, versaoDaOrigem: null,
          linhas: p.copias.flatMap((c) => [
            { bloco: rotuloLdo(c.bloco), descricao: c.descricao, anos: c.anoDeOrigem === null ? "" : `${String(c.anoDeOrigem)} → ${String(c.anoDeDestino)}`, observacao: [c.alterada ? "valor vigente, com alteração por ato" : "", c.aviso ?? ""].filter((x) => x !== "").join("; ") },
            ...c.aplicacoes.map((a) => ({ bloco: rotuloLdo(c.bloco), descricao: `aplicação: ${String(a.dados["descricao"])}`, anos: `para ${String(a.dados["anoAplicacao"])}`, observacao: "" })),
          ]),
          fora: p.fora.map((f) => ({ bloco: rotuloLdo(f.bloco), descricao: f.descricao, motivo: f.motivo })),
          recusas: p.recusas,
          versao: p.versao,
        };
      } catch (e) {
        erroDaPrevia = mensagemDoErro(e, "Não foi possível montar a prévia. Confira a origem, os blocos e o mapa dos anos.");
      }
    }
    const imps = await prisma.importacaoDaLdo.findMany({ where: { destinoId }, orderBy: { criadoEm: "desc" }, select: { id: true, criadoEm: true, criadoPor: true, blocos: true, origem: { select: { exercicio: true } }, _count: { select: { itens: true } } } });
    return {
      origens,
      blocos: BLOCOS_DA_LDO.map((b) => ({ codigo: b, rotulo: ROTULO_DO_BLOCO_DA_LDO[b], comAno: BLOCOS_COM_ANO.includes(b) })),
      escolha, previa, erroDaPrevia,
      importacoes: imps.map((i) => ({ id: i.id, quando: i.criadoEm, por: i.criadoPor, origem: `LDO ${String(i.origem.exercicio)}`, blocos: i.blocos.map(rotuloLdo).join("; "), linhas: i._count.itens, versaoDaOrigem: null })),
    };
  }

  const planos = await prisma.planoPlurianual.findMany({ where: { id: { not: destinoId } }, orderBy: { anoInicio: "desc" }, select: { id: true, anoInicio: true, anoFim: true, previsoes: { select: { ano: true } } } });
  const origens = planos.map((p) => ({ id: p.id, rotulo: periodo(p), anos: [...new Set(p.previsoes.map((x) => x.ano))].sort() }));
  if (escolha.origemId !== "" && escolha.blocos.length > 0) {
    try {
      const p = await previaDaImportacaoDoPpa(prisma, { origemId: escolha.origemId, destinoId, blocos: escolha.blocos as BlocoDoPpa[], anos: lerMapaDeAnos(escolha.anos) });
      previa = {
        origem: periodo(p.origem), destino: periodo(p.destino),
        versaoDaOrigem: p.versaoDaOrigem === null ? "o plano como publicado (sem ato de alteração)" : `até o ${p.versaoDaOrigem.descricao}`,
        linhas: [
          ...p.programas.flatMap((g) => [
            { bloco: rotuloPpa("PROGRAMAS"), descricao: `programa ${g.descricao}`, anos: "", observacao: g.alterado ? "valor vigente, com alteração por ato" : "" },
            ...g.indicadores.map((i) => ({ bloco: rotuloPpa("PROGRAMAS"), descricao: `indicador: ${i.descricao}`, anos: "", observacao: "" })),
            ...g.acoes.map((a) => ({ bloco: rotuloPpa("PROGRAMAS"), descricao: `ação ${a.codigo}: ${a.produto}`, anos: "", observacao: a.alterada ? "valor vigente, com alteração por ato" : "" })),
          ]),
          ...p.previsoes.map((r) => ({ bloco: rotuloPpa("PREVISOES_RECEITA"), descricao: r.descricao, anos: `${String(r.anoDeOrigem)} → ${String(r.dados.ano)}`, observacao: r.alterada ? "valor vigente, com alteração por ato" : "" })),
        ],
        fora: p.fora.map((f) => ({ bloco: rotuloPpa(f.bloco), descricao: f.descricao, motivo: f.motivo })),
        recusas: p.recusas,
        versao: p.versao,
      };
    } catch (e) {
      erroDaPrevia = e instanceof Error ? e.message : String(e);
    }
  }
  const imps = await prisma.importacaoDoPpa.findMany({ where: { destinoId }, orderBy: { criadoEm: "desc" }, select: { id: true, criadoEm: true, criadoPor: true, blocos: true, origem: { select: { anoInicio: true, anoFim: true } }, versaoDaOrigemAto: { select: { numero: true, ano: true } }, _count: { select: { itens: true } } } });
  return {
    origens,
    blocos: BLOCOS_DO_PPA.map((b) => ({ codigo: b, rotulo: ROTULO_DO_BLOCO_DO_PPA[b], comAno: b === "PREVISOES_RECEITA" })),
    escolha, previa, erroDaPrevia,
    importacoes: imps.map((i) => ({
      id: i.id, quando: i.criadoEm, por: i.criadoPor, origem: periodo(i.origem), blocos: i.blocos.map(rotuloPpa).join("; "), linhas: i._count.itens,
      versaoDaOrigem: i.versaoDaOrigemAto === null ? "como publicado" : `até o ato ${i.versaoDaOrigemAto.numero}/${String(i.versaoDaOrigemAto.ano)}`,
    })),
  };
}

export async function confirmarImportacaoPelaTela(input: {
  readonly peca: PecaDoPlanejamento;
  readonly origemId: string;
  readonly destinoId: string;
  readonly blocos: readonly string[];
  readonly anos: string;
  readonly versaoDaPrevia: string;
}): Promise<string> {
  const anos = lerMapaDeAnos(input.anos);
  if (input.peca === "LDO") {
    const r = await comEscritaAutenticada("CADASTRAR_LDO", (criadoPor) =>
      importarLdo(cliente(), { origemId: input.origemId, destinoId: input.destinoId, blocos: input.blocos as BlocoDaLdo[], anos, versaoDaPrevia: input.versaoDaPrevia, criadoPor })
    );
    return `Importação registrada: ${String(r.copiadas)} linha(s) copiada(s) para o rascunho. O trâmite da LDO de origem não foi copiado.`;
  }
  const r = await comEscritaAutenticada("CADASTRAR_PPA", (criadoPor) =>
    importarPpa(cliente(), { origemId: input.origemId, destinoId: input.destinoId, blocos: input.blocos as BlocoDoPpa[], anos, versaoDaPrevia: input.versaoDaPrevia, criadoPor })
  );
  return `Plano preparado: ${String(r.programas)} programa(s), ${String(r.acoes)} ação(ões) e ${String(r.previsoes)} previsão(ões) de receita copiados, com a origem registrada.`;
}
