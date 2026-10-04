import { primeiraAba, lerPlanilha } from "../../packages/planilha/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { declararNaturezaDaFonte, listarNaturezasDeclaradas } from "../m01-core-contabil/natureza-da-fonte.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import type { NaturezaDaFonteDdr } from "../m01-core-contabil/roteiros.js";

/**
 * ═══ A TABELA OFICIAL DE FONTES (V35, onda A1) ═══
 *
 * Até a V34 nenhum serviço criava `FonteRecurso` nem `CodigoAcompanhamento`: só seed, fixture e scripts de
 * demonstração. Numa instalação real, sem fonte não há ficha, receita prevista, crédito nem arrecadação — o ciclo
 * inteiro parava no primeiro cadastro. A fonte não é decisão do município: a classificação é padronizada pela STN
 * (Portaria STN 710/2021, atualizada) e o TCE-PB a usa como está (dados abertos de 2026 de Esperança trazem os
 * mesmos códigos e nomes). Por isso a carga lê o arquivo OFICIAL da STN, versionado em
 * `docs/oficial/stn-sof/fonte-ou-destinacao-de-recursos-2026.xlsx`, e não uma lista escrita no código.
 *
 * ⚠️ SÓ ACRESCENTA. Fonte que já existe não é regravada: se o nome divergir da tabela, a divergência sai nomeada no
 * resultado e o cadastro fica como está (uma fonte já usada em ficha e guia não muda de nome por carga).
 *
 * ⚠️ A NATUREZA PELO BLOCO DA STN. A tabela agrupa as fontes em blocos (livres, vinculados à educação, à saúde, …,
 * extraorçamentários). A natureza do controle da disponibilidade (PCASP 7.2.1.1.x) segue o bloco: livres →
 * ordinários; os blocos de vinculação → vinculados; extraorçamentários → extraorçamentários. É a própria
 * classificação oficial, não palpite; ela é gravada pelo serviço de sempre (`declararNaturezaDaFonte`, versionado),
 * com o bloco como fundamento, e o ente pode declarar outra versão. "Recursos a classificar" (898) não recebe
 * natureza: é classificação temporária por definição da própria tabela.
 */

export interface FonteDaTabela {
  readonly codigo: string;
  readonly nomenclatura: string;
  readonly especificacao: string;
  readonly bloco: string;
}

export interface CoDaTabela {
  readonly codigo: string;
  readonly nomenclatura: string;
  readonly especificacao: string;
}

export interface TabelaDeFontes {
  readonly titulo: string;
  readonly fontes: readonly FonteDaTabela[];
  readonly cos: readonly CoDaTabela[];
}

const limpo = (s: string | undefined): string => (s ?? "").replace(/\s+/g, " ").trim();

/** Lê o xlsx da STN: aba FR (códigos de 3 dígitos, sob o cabeçalho do bloco) e aba CO (4 dígitos). */
export function lerTabelaDeFontes(conteudo: Buffer): TabelaDeFontes {
  const abas = lerPlanilha(conteudo);
  const fr = abas.get("FR") ?? primeiraAba(conteudo);
  const co = abas.get("CO");
  if (co === undefined) throw new Error("Tabela de fontes sem a aba CO: o arquivo não é o da STN.");
  const titulo = limpo(fr[0]?.[0]);
  if (!/Fonte ou Destina/i.test(titulo)) throw new Error(`Tabela de fontes não reconhecida: o título é "${titulo}".`);

  const fontes: FonteDaTabela[] = [];
  let bloco = "";
  for (const l of fr) {
    const c0 = limpo(l[0]);
    if (/^\d{3}$/.test(c0)) {
      if (bloco === "") throw new Error(`Fonte ${c0} antes de qualquer bloco: a tabela mudou de forma.`);
      fontes.push({ codigo: c0, nomenclatura: limpo(l[1]), especificacao: limpo(l[2]), bloco });
    } else if (limpo(l[1]) === "" && /^(RECURSOS|DEMAIS|OUTRAS) [A-ZÀ-Ú]/.test(c0)) {
      bloco = c0;
    }
  }
  const cos: CoDaTabela[] = [];
  for (const l of co) {
    const c0 = limpo(l[0]);
    if (/^\d{4}$/.test(c0)) cos.push({ codigo: c0, nomenclatura: limpo(l[1]), especificacao: limpo(l[2]) });
  }
  const repetida = fontes.find((f, i) => fontes.findIndex((g) => g.codigo === f.codigo) !== i);
  if (repetida !== undefined) throw new Error(`Fonte ${repetida.codigo} repetida na tabela.`);
  if (fontes.length === 0 || cos.length === 0) throw new Error("Tabela de fontes sem fontes ou sem CO.");
  return { titulo, fontes, cos };
}

/** A natureza do controle da disponibilidade que o bloco oficial determina; `null` quando o bloco não determina. */
export function naturezaDoBloco(f: FonteDaTabela): NaturezaDaFonteDdr | null {
  if (f.codigo === "898") return null;
  if (/^RECURSOS LIVRES/.test(f.bloco)) return "ORDINARIOS";
  if (/^RECURSOS EXTRAOR/.test(f.bloco)) return "EXTRAORCAMENTARIOS";
  if (/VINCULA/.test(f.bloco)) return "VINCULADOS";
  return null;
}

export interface ResultadoDaCarga {
  readonly fontesCriadas: readonly string[];
  readonly fontesJaExistentes: number;
  readonly fontesDivergentes: readonly { readonly codigo: string; readonly noCadastro: string; readonly naTabela: string }[];
  readonly cosCriados: readonly string[];
  readonly cosJaExistentes: number;
  readonly naturezasDeclaradas: readonly string[];
  readonly semNatureza: readonly string[];
}

/**
 * Carrega a tabela no cadastro. Idempotente: a segunda carga não cria nada e não declara nada.
 * A natureza só é declarada para fonte que ainda não tem natureza nenhuma (a declaração do ente prevalece).
 */
export async function carregarTabelaDeFontes(
  prisma: PrismaClient,
  input: { readonly conteudo: Buffer; readonly origem: string; readonly criadoPor: string }
): Promise<ResultadoDaCarga> {
  if (input.criadoPor.trim() === "") throw new Error("Quem carrega a tabela de fontes não foi identificado.");
  const tabela = lerTabelaDeFontes(input.conteudo);
  await autorizarNo(prisma, input.criadoPor, ACAO_DO_SERVICO.carregarTabelaDeFontes, "ENTE");
  const existentes = new Map((await prisma.fonteRecurso.findMany({ select: { codigo: true, descricao: true } })).map((f) => [f.codigo, f.descricao]));
  const fontesCriadas: string[] = [];
  const fontesDivergentes: { codigo: string; noCadastro: string; naTabela: string }[] = [];
  for (const f of tabela.fontes) {
    const ja = existentes.get(f.codigo);
    if (ja === undefined) {
      await prisma.fonteRecurso.create({ data: { codigo: f.codigo, descricao: f.nomenclatura, codigoTce: f.codigo, codigoStn: f.codigo, exercicioPadrao: 1 } });
      fontesCriadas.push(f.codigo);
    } else if (limpo(ja).toLowerCase() !== f.nomenclatura.toLowerCase()) {
      fontesDivergentes.push({ codigo: f.codigo, noCadastro: ja, naTabela: f.nomenclatura });
    }
  }
  const cosExistentes = new Set((await prisma.codigoAcompanhamento.findMany({ select: { codigo: true } })).map((c) => c.codigo));
  const cosCriados: string[] = [];
  for (const c of tabela.cos) {
    if (cosExistentes.has(c.codigo)) continue;
    await prisma.codigoAcompanhamento.create({ data: { codigo: c.codigo, descricao: c.nomenclatura } });
    cosCriados.push(c.codigo);
  }

  const comNatureza = new Set((await listarNaturezasDeclaradas(prisma)).map((n) => n.fonteCodigo));
  const naturezasDeclaradas: string[] = [];
  const semNatureza: string[] = [];
  for (const f of tabela.fontes) {
    if (comNatureza.has(f.codigo)) continue;
    const natureza = naturezaDoBloco(f);
    if (natureza === null) {
      semNatureza.push(f.codigo);
      continue;
    }
    await declararNaturezaDaFonte(prisma, {
      fonteCodigo: f.codigo,
      natureza,
      fundamento: `Bloco "${f.bloco}" da tabela oficial ${tabela.titulo} (${input.origem}).`,
      criadoPor: input.criadoPor,
    });
    naturezasDeclaradas.push(f.codigo);
  }
  return {
    fontesCriadas,
    fontesJaExistentes: tabela.fontes.length - fontesCriadas.length,
    fontesDivergentes,
    cosCriados,
    cosJaExistentes: tabela.cos.length - cosCriados.length,
    naturezasDeclaradas,
    semNatureza,
  };
}
