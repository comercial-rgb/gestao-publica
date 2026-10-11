import { cliente } from "./cliente";
import { comEscritaAutenticada } from "./sessao";
import { diaCivilBr } from "../../packages/datas/index";
import { conferirReferenciaExterna, registrarReferenciaExterna } from "../../modules/m05-despesa/referencia-externa";

/**
 * V39-R3 (R3-017) — AS REFERÊNCIAS EXTERNAS NO DOSSIÊ DO EMPENHO. A leitura vai junto do dossiê (que já conferiu o
 * acesso ao empenho); a CONDIÇÃO vem sempre escrita: declarada e não conferida, confirmada ou divergente — a tela não
 * apresenta a referência declarada como protocolo confirmado.
 */

export interface ReferenciaNaTela {
  readonly id: string;
  readonly sistemaDeOrigem: string;
  readonly identificador: string;
  readonly documento: string;
  readonly declaradaPor: string;
  readonly declaradaEm: string;
  readonly condicao: "DECLARADA" | "CONFIRMADA" | "DIVERGENTE";
  readonly textoDaCondicao: string;
}

export async function lerReferenciasExternas(empenhoId: string): Promise<readonly ReferenciaNaTela[]> {
  const rs = await cliente().referenciaExternaDoEmpenho.findMany({
    where: { empenhoId }, orderBy: { criadoEm: "asc" },
    select: { id: true, sistemaDeOrigem: true, identificador: true, documento: true, criadoPor: true, criadoEm: true, conferencia: { select: { resultado: true, meio: true, observacao: true, criadoPor: true, criadoEm: true } } },
  });
  return rs.map((r) => {
    const c = r.conferencia;
    const condicao = c === null ? "DECLARADA" : c.resultado;
    const textoDaCondicao = c === null
      ? "declarada, ainda não conferida no sistema de origem"
      : c.resultado === "CONFIRMADA"
        ? `conferida e confirmada em ${diaCivilBr(c.criadoEm)} por ${c.criadoPor} (${c.meio})`
        : `conferida e DIVERGENTE em ${diaCivilBr(c.criadoEm)} por ${c.criadoPor} (${c.meio}): ${c.observacao ?? ""}`;
    return { id: r.id, sistemaDeOrigem: r.sistemaDeOrigem, identificador: r.identificador, documento: r.documento, declaradaPor: r.criadoPor, declaradaEm: diaCivilBr(r.criadoEm), condicao, textoDaCondicao };
  });
}

type Campos = Readonly<Record<string, string>>;
const t = (c: Campos, k: string): string => (c[k] ?? "").trim();

export async function registrarReferenciaPelaTela(c: Campos): Promise<string> {
  await comEscritaAutenticada("REGISTRAR_REFERENCIA_EXTERNA_DO_EMPENHO", (criadoPor) =>
    registrarReferenciaExterna(cliente(), { empenhoId: t(c, "empenhoId"), sistemaDeOrigem: t(c, "sistemaDeOrigem"), identificador: t(c, "identificador"), documento: t(c, "documento"), observacao: t(c, "observacao"), criadoPor })
  );
  return "Referência registrada como DECLARADA. Ela vale como protocolo confirmado só depois da conferência, por outra pessoa.";
}

export async function conferirReferenciaPelaTela(c: Campos): Promise<string> {
  const resultado = t(c, "resultado") === "DIVERGENTE" ? "DIVERGENTE" : "CONFIRMADA";
  await comEscritaAutenticada("REGISTRAR_REFERENCIA_EXTERNA_DO_EMPENHO", (criadoPor) =>
    conferirReferenciaExterna(cliente(), { referenciaId: t(c, "referenciaId"), resultado, meio: t(c, "meio"), observacao: t(c, "observacao"), criadoPor })
  );
  return resultado === "CONFIRMADA" ? "Referência conferida e confirmada." : "Referência conferida: divergente do sistema de origem.";
}
