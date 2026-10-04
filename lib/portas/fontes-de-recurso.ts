import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { listarNaturezasDeclaradas } from "../../modules/m01-core-contabil/natureza-da-fonte.js";
import { carregarTabelaDeFontes } from "../../modules/m02-planejamento/fontes-oficiais.js";
import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";

/**
 * ═══ AS FONTES DE RECURSO NA TELA (V35, onda A1) ═══
 *
 * O cadastro de fontes não tinha lugar: só seed e fixture criavam fonte, e a tela da natureza dizia "cadastre as
 * fontes" sem dizer onde. A fonte é classificação padronizada da STN, então o lugar é a CARGA da tabela oficial
 * versionada no repositório — o operador não digita código nem nome de fonte.
 */

/** O arquivo oficial, no repositório (a versão publicada é o conteúdo do commit, `docs/` incluído). */
export const ARQUIVO_DA_TABELA_DE_FONTES = "docs/oficial/stn-sof/fonte-ou-destinacao-de-recursos-2026.xlsx";
const ORIGEM =
  "STN, Fonte ou Destinação de Recursos 2026, https://thot-arquivos.tesouro.gov.br/publicacao-anexo/28902, sha256 271c9771c4e0e020bdad393a3552777c9253a120b920fdbf6950546483331071";

export interface FonteNoCadastro {
  readonly codigo: string;
  readonly descricao: string;
  readonly natureza: string | null;
}

export interface CadastroDeFontes {
  readonly fontes: readonly FonteNoCadastro[];
  readonly cos: readonly { readonly codigo: string; readonly descricao: string }[];
}

export async function lerCadastroDeFontes(): Promise<CadastroDeFontes> {
  await exigirLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
  const [fontes, cos, naturezas] = await Promise.all([
    cliente().fonteRecurso.findMany({ orderBy: { codigo: "asc" }, select: { codigo: true, descricao: true } }),
    cliente().codigoAcompanhamento.findMany({ orderBy: { codigo: "asc" }, select: { codigo: true, descricao: true } }),
    listarNaturezasDeclaradas(cliente()),
  ]);
  const porFonte = new Map(naturezas.map((n) => [n.fonteCodigo, n.natureza]));
  return { fontes: fontes.map((f) => ({ ...f, natureza: porFonte.get(f.codigo) ?? null })), cos };
}

export async function carregarTabelaOficialDeFontes(): Promise<string> {
  const conteudo = readFileSync(resolve(process.cwd(), ARQUIVO_DA_TABELA_DE_FONTES));
  const r = await comEscritaAutenticada("CADASTRAR_LOA", (criadoPor) =>
    carregarTabelaDeFontes(cliente(), { conteudo, origem: ORIGEM, criadoPor })
  );
  const partes = [
    `${String(r.fontesCriadas.length)} fonte(s) e ${String(r.cosCriados.length)} código(s) de acompanhamento cadastrados`,
    `${String(r.fontesJaExistentes)} fonte(s) já estavam no cadastro`,
    `${String(r.naturezasDeclaradas.length)} natureza(s) declaradas pelo bloco da tabela oficial`,
  ];
  if (r.semNatureza.length > 0) partes.push(`sem natureza, por definição da tabela: ${r.semNatureza.join(", ")}`);
  if (r.fontesDivergentes.length > 0) {
    partes.push(
      `com nome diferente da tabela, mantidas como estão: ${r.fontesDivergentes.map((d) => `${d.codigo} ("${d.noCadastro}" no cadastro, "${d.naTabela}" na tabela)`).join("; ")}`
    );
  }
  return `${partes.join("; ")}.`;
}
