import { informarProtocoloDaNorma, protocoloDaNorma, registrarNormaNoTce, type RegistrarNormaNoTceInput } from "../../modules/m03-creditos/norma-no-tce.js";
import { diaCivilBr } from "../../packages/datas/index.js";
import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";

/**
 * V26 — AS LEIS ORÇAMENTÁRIAS COM O PROTOCOLO DO BANCO DE LEGISLAÇÃO DO TCE-PB, na tela. A regra (formato do
 * protocolo, conferência com a lei de crédito do cadastro, duplicidade) é do domínio (`modules/m03-creditos/norma-no-tce.ts`).
 * A pendência é a lei de crédito ou a LOA publicada sem a norma registrada: o arquivo do dia em que ela saiu fica fora
 * do pacote até o registro.
 */

const TIPO: Record<string, string> = {
  LOA: "Lei orçamentária anual",
  CREDITO_SUPLEMENTAR: "Crédito suplementar",
  CREDITO_ESPECIAL: "Crédito especial",
  TRANSPOSICAO: "Transposição, remanejamento ou transferência",
};

export interface NormaNaTela {
  readonly id: string;
  readonly lei: string;
  readonly tipo: string;
  readonly publicacao: string;
  /** Nulo enquanto o comprovante do Tribunal não chega. */
  readonly protocolo: string | null;
  readonly autorizacao: string;
  readonly fundamento: string;
}

export interface LeiSemProtocolo {
  readonly lei: string;
  readonly tipo: string;
  readonly publicacao: string;
}

export async function lerNormasNoTce(): Promise<{
  readonly normas: readonly NormaNaTela[];
  readonly semProtocolo: readonly LeiSemProtocolo[];
  readonly leis: readonly { readonly id: string; readonly rotulo: string }[];
}> {
  await exigirLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
  const prisma = cliente();
  const [normas, leis, loas] = await Promise.all([
    prisma.normaOrcamentariaNoTce.findMany({ orderBy: [{ ano: "desc" }, { numero: "desc" }], include: { protocolo: { select: { protocoloTce: true } } } }),
    prisma.leiCredito.findMany({ orderBy: [{ ano: "desc" }, { numero: "desc" }], select: { id: true, numero: true, ano: true, tipoCredito: true, dataPublicacao: true } }),
    prisma.aprovacaoDaLeiOrcamentaria.findMany({ select: { numeroDaLei: true, dataDaPublicacao: true, lei: { select: { exercicio: true } } } }),
  ]);
  const semProtocolo: LeiSemProtocolo[] = [
    ...leis
      .filter((l) => l.tipoCredito !== "EXTRAORDINARIO" && !normas.some((n) => n.tipo !== "LOA" && n.numero === l.numero.replace(/\D/g, "") && n.ano === l.ano))
      .map((l) => ({ lei: `${l.numero}/${String(l.ano)}`, tipo: l.tipoCredito === "ESPECIAL" ? TIPO.CREDITO_ESPECIAL ?? "" : TIPO.CREDITO_SUPLEMENTAR ?? "", publicacao: diaCivilBr(l.dataPublicacao) })),
    ...loas
      .filter((l) => !normas.some((n) => n.tipo === "LOA" && n.numero === l.numeroDaLei.replace(/\D/g, "")))
      .map((l) => ({ lei: `${l.numeroDaLei} (exercício ${String(l.lei.exercicio)})`, tipo: TIPO.LOA ?? "", publicacao: diaCivilBr(l.dataDaPublicacao) })),
  ];
  return {
    normas: normas.map((n) => ({
      id: n.id,
      lei: `${n.numero}/${String(n.ano)}`,
      tipo: TIPO[n.tipo] ?? n.tipo,
      publicacao: diaCivilBr(n.dataPublicacao),
      protocolo: protocoloDaNorma(n),
      autorizacao: n.autorizacaoPercentual ? `${n.valor.toFixed(2).replace(".", ",")}% da despesa fixada` : `R$ ${n.valor.toFixed(2).replace(".", ",")}`,
      fundamento: n.fundamento,
    })),
    semProtocolo,
    leis: leis
      .filter((l) => l.tipoCredito !== "EXTRAORDINARIO")
      .map((l) => ({ id: l.id, rotulo: `Lei ${l.numero}/${String(l.ano)} — ${l.tipoCredito === "ESPECIAL" ? "especial" : "suplementar"}` })),
  };
}

export async function registrarNormaPelaTela(input: Omit<RegistrarNormaNoTceInput, "criadoPor">): Promise<string> {
  await comEscritaAutenticada("CRIAR_LEI_DE_CREDITO", (criadoPor) => registrarNormaNoTce(cliente(), { ...input, criadoPor }));
  return input.protocoloTce === null || input.protocoloTce === undefined || input.protocoloTce === ""
    ? `Lei ${input.numero}/${String(input.ano)} registrada, sem o protocolo do Tribunal. Anexe o PDF e informe o protocolo quando o comprovante chegar.`
    : `Lei ${input.numero}/${String(input.ano)} registrada com o protocolo ${input.protocoloTce}.`;
}

export async function informarProtocoloPelaTela(input: { readonly normaId: string; readonly protocoloTce: string; readonly fundamento: string }): Promise<string> {
  await comEscritaAutenticada("CRIAR_LEI_DE_CREDITO", (criadoPor) => informarProtocoloDaNorma(cliente(), { ...input, criadoPor }));
  return `Protocolo ${input.protocoloTce} informado.`;
}
