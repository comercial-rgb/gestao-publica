import { baixarGuiaDeRecolhimento, cancelarGuiaDeRecolhimento, guiasEObrigacoesDaFolha, registrarGuiaDeRecolhimento, type ObrigacaoDoGrupo } from "../../../modules/m33-folha/recolhimento.js";
import { formatarMoeda } from "../../format/moeda";
import type { DocumentoPdf, SecaoPdf } from "../../pdf/documento";
import { nomeDoEnteParaDocumentos } from "../../pdf/ente.js";
import { cliente } from "../cliente";
import { comEscritaAutenticada } from "../sessao";

/**
 * A PORTA DAS OBRIGAÇÕES E GUIAS DOS ENCARGOS (V7 M1 U3.2) — a mesma leitura na tela, no CSV e no
 * DEMONSTRATIVO INTERNO em PDF.
 *
 * ⚠️ O DEMONSTRATIVO NÃO É GUIA. Ele diz isso no título e em nota, não traz código de barras, linha
 * digitável, PIX nem autenticação, e mostra "não informado" onde a guia do emissor não informou o
 * vencimento. A guia real é o ARQUIVO do emissor, anexado ao cadastro.
 */
export type ObrigacoesLidas = readonly (ObrigacaoDoGrupo & { readonly pagamentosDisponiveis: readonly { readonly valor: string; readonly rotulo: string }[] })[];

export async function lerObrigacoesDaFolha(folhaId: string): Promise<ObrigacoesLidas> {
  const prisma = cliente();
  const mapa = await guiasEObrigacoesDaFolha(prisma, folhaId);
  const pagamentos = await prisma.pagamento.findMany({
    where: { estornoDeId: null, anulacaoParcialDeId: null, estornos: { none: {} }, baixaDeGuia: null, liquidacao: { liquidacaoDosEncargos: { empenhoDosEncargos: { apuracao: { folhaId } } } } },
    orderBy: { data: "asc" },
    select: { id: true, numero: true, valor: true, data: true, liquidacao: { select: { liquidacaoDosEncargos: { select: { empenhoDosEncargos: { select: { grupoId: true } } } } } } },
  });
  return mapa.map((o) => ({
    ...o,
    pagamentosDisponiveis: pagamentos
      .filter((p) => p.liquidacao.liquidacaoDosEncargos?.empenhoDosEncargos.grupoId === o.grupoId)
      .map((p) => ({ valor: p.id, rotulo: `${p.numero} — ${formatarMoeda(p.valor.toFixed(2)).texto}` })),
  }));
}

type Campos = Readonly<Record<string, string>>;
const t = (c: Campos, k: string): string => (c[k] ?? "").trim();
const decimalDoCampo = (v: string): string => v.replace(/\./g, "").replace(",", ".");

export async function registrarGuiaNaTela(folhaId: string, c: Campos, componentes: readonly { readonly rotulo: string; readonly valor: string }[], arquivo: File): Promise<string> {
  const conteudo = new Uint8Array(await arquivo.arrayBuffer());
  const grupo = await cliente().grupoDeEmpenhoDaFolha.findUnique({ where: { id: t(c, "grupoId") }, select: { credorId: true } });
  const r = await comEscritaAutenticada("GERIR_GUIA_DE_RECOLHIMENTO", (criadoPor) =>
    registrarGuiaDeRecolhimento(cliente(), {
      folhaId, grupoId: t(c, "grupoId"),
      // ⚠️ O destinatário da tela é o do GRUPO; o caso de uso confere de novo contra a guia.
      destinatarioId: grupo?.credorId ?? "",
      natureza: t(c, "natureza"), identificador: t(c, "identificador"),
      ...(t(c, "vencimento") !== "" ? { vencimento: t(c, "vencimento") } : {}),
      ...(t(c, "fundamentoDoVencimento") !== "" ? { fundamentoDoVencimento: t(c, "fundamentoDoVencimento") } : {}),
      principal: decimalDoCampo(t(c, "principal")), total: decimalDoCampo(t(c, "total")),
      componentes: componentes.map((x) => ({ rotulo: x.rotulo, valor: decimalDoCampo(x.valor) })),
      arquivo: { nomeOriginal: arquivo.name, mimeType: arquivo.type, conteudo }, criadoPor,
    })
  );
  return r.guiaId;
}

export async function baixarGuiaNaTela(c: Campos): Promise<string> {
  const r = await comEscritaAutenticada("GERIR_GUIA_DE_RECOLHIMENTO", (criadoPor) => baixarGuiaDeRecolhimento(cliente(), { guiaId: t(c, "guiaId"), pagamentoId: t(c, "pagamentoId"), observacao: t(c, "observacao"), criadoPor }));
  return r.divergencia.isZero() ? "Guia baixada pelo pagamento informado; o total da guia confere com o pagamento." : `Guia baixada. ATENÇÃO: o total da guia difere do pagamento em ${formatarMoeda(r.divergencia.toFixed(2)).texto} — confira os componentes (atualização, juros, multa) com o emissor.`;
}

export async function cancelarGuiaNaTela(c: Campos): Promise<string> {
  await comEscritaAutenticada("GERIR_GUIA_DE_RECOLHIMENTO", (criadoPor) => cancelarGuiaDeRecolhimento(cliente(), { guiaId: t(c, "guiaId"), motivo: t(c, "motivo"), criadoPor }));
  return "Guia cancelada. O cadastro e o arquivo continuam no histórico.";
}

const brl = (v: string): string => formatarMoeda(v).texto;
const ROTULO_DA_SITUACAO: Readonly<Record<string, string>> = { RECEBIDA: "recebida (não paga)", BAIXADA: "baixada por pagamento", CANCELADA: "cancelada" };
const COLUNAS_OBRIGACOES = ["Grupo", "Destinatário", "Natureza", "Liquidado (obrigação)", "Pago", "Restituição a providenciar"] as const;
const COLUNAS_GUIAS = ["Grupo", "Guia (emissor)", "Natureza", "Vencimento", "Principal", "Componentes", "Total", "Situação"] as const;

export function linhasDasObrigacoes(o: ObrigacoesLidas): readonly (readonly string[])[] {
  return o.map((g) => [g.grupo, g.destinatario, g.naturezas.join("; "), brl(g.liquidado), brl(g.pago), brl(g.restituicaoAProvidenciar)]);
}
export function linhasDasGuias(o: ObrigacoesLidas): readonly (readonly string[])[] {
  return o.flatMap((g) => g.guias.map((x) => [g.grupo, x.identificador, x.natureza, x.vencimento === null ? "não informado" : `${x.vencimento} (${x.fundamentoDoVencimento ?? ""})`, brl(x.principal), x.componentes.map((c) => `${c.rotulo} ${brl(c.valor)}`).join("; ") || "—", brl(x.total), ROTULO_DA_SITUACAO[x.situacao] ?? x.situacao]));
}
export const colunasDasObrigacoes = (): readonly string[] => COLUNAS_OBRIGACOES;

export async function demonstrativoInternoDasObrigacoes(competencia: string, o: ObrigacoesLidas): Promise<DocumentoPdf> {
  const obrigacoes: SecaoPdf = { titulo: "Obrigações dos encargos por grupo", colunas: COLUNAS_OBRIGACOES.map((c, i) => (i >= 3 ? { rotulo: c, alinhamento: "direita" as const } : { rotulo: c })), linhas: o.length === 0 ? [["—", "sem encargos liquidados nesta competência", "—", "—", "—", "—"]] : linhasDasObrigacoes(o) };
  const guias: SecaoPdf = { titulo: "Guias registradas (documentos do emissor)", colunas: COLUNAS_GUIAS.map((c) => ({ rotulo: c })), linhas: linhasDasGuias(o).length === 0 ? [["—", "nenhuma guia registrada", "—", "—", "—", "—", "—", "—"]] : linhasDasGuias(o) };
  return {
    ente: await nomeDoEnteParaDocumentos(),
    titulo: `DEMONSTRATIVO INTERNO — obrigações dos encargos de ${competencia}`,
    subtitulo: "NÃO É GUIA DE RECOLHIMENTO: não contém código de barras, linha digitável, PIX nem autenticação.",
    periodo: `Competência ${competencia}`,
    secoes: [obrigacoes, guias],
    notas: [
      "Documento interno de conferência. A guia oficial é a emitida pelo arrecadador/destinatário e anexada ao cadastro da guia; anexar não é validação do emissor.",
      "Liquidado é a obrigação reconhecida; pago vem dos pagamentos do M05; restituição a providenciar é valor pago acima do devido após ajuste — nada foi anulado sobre ele.",
      "Vencimento só aparece com o fundamento informado; sem ele, \"não informado\". Retorno bancário e transmissão externa não existem neste ambiente.",
    ],
  };
}
