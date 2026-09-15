import { confirmarPreviaDePlanilha, gerarPreviaDePlanilha, planilhaOrcamentaria, planilhasDaObra, previaDePlanilha, revogarVinculoDaPlanilha, TAMANHO_MAXIMO_DA_PLANILHA, vincularItemDaPlanilhaAoContrato } from "../../modules/m11-licitacoes/planilha-orcamentaria.js";
import { mapeamentoEmLetras } from "../../modules/m11-licitacoes/analise-da-planilha.js";
import { cliente } from "./cliente";
import { acoesPermitidas } from "./molde";
import { comEscritaAutenticada } from "./sessao";

/**
 * ═══ A PLANILHA ORÇAMENTÁRIA DA OBRA NA TELA (V7 M2 U6) ═══
 *
 * As páginas chamam `exigirLeitura("CONSULTAR_LICITACOES")` antes destas leituras; os formulários só aparecem com
 * GERIR_PLANILHA_DA_OBRA, e o domínio cobra de novo. A porta não interpreta a planilha: repassa o arquivo e o que o
 * domínio devolveu.
 */

const FORMATO = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl = (v: string): string => FORMATO.format(Number(v));

export async function planilhasDaObraParaTela(obraId: string) {
  const prisma = cliente();
  const obra = await prisma.obra.findUnique({ where: { id: obraId }, select: { id: true, identificador: true, descricao: true } });
  if (obra === null) return null;
  const [versoes, permitidas, previas] = await Promise.all([
    planilhasDaObra(prisma, obraId),
    acoesPermitidas(["GERIR_PLANILHA_DA_OBRA"]),
    prisma.previaDePlanilhaOrcamentaria.findMany({ where: { obraId, planilha: { is: null } }, orderBy: { criadoEm: "desc" }, take: 10, select: { id: true, nomeDoArquivo: true, formato: true, erros: true, divergencias: true, totalCalculado: true, criadoEm: true } }),
  ]);
  return { obra, versoes, podeGerir: permitidas.has("GERIR_PLANILHA_DA_OBRA"), previasPendentes: previas.map((p) => ({ ...p, totalCalculado: p.totalCalculado.toFixed(2) })), limiteEmMb: TAMANHO_MAXIMO_DA_PLANILHA / 1048576 };
}

export async function previaParaTela(obraId: string, previaId: string) {
  const prisma = cliente();
  const p = await previaDePlanilha(prisma, previaId);
  if (p === null || p.obraId !== obraId) return null;
  const permitidas = await acoesPermitidas(["GERIR_PLANILHA_DA_OBRA"]);
  return { ...p, colunas: mapeamentoEmLetras(p.analise.mapeamento), podeGerir: permitidas.has("GERIR_PLANILHA_DA_OBRA") };
}

export async function planilhaParaTela(obraId: string, planilhaId: string) {
  const prisma = cliente();
  const v = await planilhaOrcamentaria(prisma, planilhaId);
  if (v === null || v.obraId !== obraId) return null;
  const permitidas = await acoesPermitidas(["GERIR_PLANILHA_DA_OBRA"]);
  return { ...v, podeGerir: permitidas.has("GERIR_PLANILHA_DA_OBRA") };
}

type Campos = Readonly<Record<string, string>>;
const t = (c: Campos, k: string): string => (c[k] ?? "").trim();

export async function previaNaTela(obraId: string, arquivo: File, c: Campos): Promise<{ readonly mensagem: string; readonly previaId: string }> {
  if (arquivo.size === 0) throw new Error("Escolha o arquivo da planilha (.xlsx ou .xls). Nada foi gravado.");
  const conteudo = new Uint8Array(await arquivo.arrayBuffer());
  const colunas = Object.fromEntries((["codigo", "referencia", "descricao", "unidade", "quantidade", "precoUnitario", "total"] as const).map((k) => [k, t(c, `coluna.${k}`)]).filter(([, v]) => v !== ""));
  const linha = t(c, "linhaDoCabecalho");
  const r = await comEscritaAutenticada("GERIR_PLANILHA_DA_OBRA", (criadoPor) => gerarPreviaDePlanilha(cliente(), {
    obraId, nomeDoArquivo: arquivo.name || "planilha", conteudo, criadoPor,
    ...(t(c, "aba") === "" ? {} : { aba: t(c, "aba") }),
    ...(linha === "" ? {} : { linhaDoCabecalho: Number(linha) }),
    ...(Object.keys(colunas).length === 0 ? {} : { colunas }),
  }));
  return {
    previaId: r.previaId,
    mensagem: `Prévia gerada, nada foi importado ainda: ${r.servicos} serviço(s), total calculado R$ ${brl(r.totalCalculado)}, ${r.erros} linha(s) com erro e ${r.divergencias} divergência(s) de conciliação.${r.erros > 0 ? " Corrija o arquivo antes de confirmar." : " Confira e confirme na prévia."}`,
  };
}

export async function confirmarNaTela(c: Campos): Promise<string> {
  const r = await comEscritaAutenticada("GERIR_PLANILHA_DA_OBRA", (criadoPor) => confirmarPreviaDePlanilha(cliente(), {
    previaId: t(c, "previaId"), descricao: t(c, "descricao"), dataBaseDosPrecos: t(c, "dataBaseDosPrecos"), referenciaDePrecos: t(c, "referenciaDePrecos"),
    vigenciaInicio: t(c, "vigenciaInicio"), motivo: t(c, "motivo"), cienteDasDivergencias: t(c, "ciente") === "sim",
    ...(t(c, "numeroDoContrato") === "" ? {} : { numeroDoContrato: t(c, "numeroDoContrato") }), criadoPor,
  }));
  return `Versão ${r.versao} da planilha confirmada: ${r.itens} linha(s), total R$ ${brl(r.valorTotal)}. As versões anteriores continuam como estavam.`;
}

export async function vincularNaTela(c: Campos): Promise<string> {
  await comEscritaAutenticada("GERIR_PLANILHA_DA_OBRA", (criadoPor) => vincularItemDaPlanilhaAoContrato(cliente(), { itemDaPlanilhaId: t(c, "itemDaPlanilhaId"), itemDoContratoId: t(c, "itemDoContratoId"), motivo: t(c, "motivo"), criadoPor }));
  return "Vínculo registrado. Planilha e contrato continuam com as próprias quantidades e valores.";
}

export async function revogarVinculoNaTela(c: Campos): Promise<string> {
  await comEscritaAutenticada("GERIR_PLANILHA_DA_OBRA", (criadoPor) => revogarVinculoDaPlanilha(cliente(), { vinculoId: t(c, "vinculoId"), motivo: t(c, "motivo"), criadoPor }));
  return "Vínculo revogado; o registro anterior continua no histórico.";
}
