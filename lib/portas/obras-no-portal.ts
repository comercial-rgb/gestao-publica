import { cliente, PortaSemBancoError } from "./cliente";
import { exigirLeituraEmAlgumEscopo } from "./leitura";
import { comEscritaAutenticada } from "./sessao";
import { obraEstaPublicada, obraNoPortal, obrasNoPortal, publicarObraNoPortal, type ObraNoPortal } from "../../modules/m11-licitacoes/obra-no-portal";
import { baixarAnexoPublicoDaObra } from "../../modules/m22-documentos/anexos";

/**
 * V36 (TR 5.10.1.54) — A OBRA NO PORTAL DA TRANSPARÊNCIA. A escrita (publicar, retirar) é de quem cadastra obra; a
 * leitura pública não tem sessão por desenho e só alcança o que foi publicado — o M11 e o M22 conferem a publicação em
 * toda leitura.
 */

export { PortaSemBancoError };

/** Uma obra do portal como a tela pública a consome — dinheiro em string. */
export interface ObraPublica {
  readonly id: string;
  readonly identificador: string;
  readonly descricao: string;
  readonly tipoObraServico: string;
  readonly cei: string | null;
  readonly orgao: string | null;
  readonly publicadaEm: Date;
  readonly valorDaObra: string | null;
  readonly valorContratado: string;
  readonly valorEmpenhado: string;
  readonly medidoAprovado: string;
  readonly percentualExecutado: string | null;
  readonly contratos: readonly { readonly numero: string; readonly valorAtualizado: string }[];
  readonly medicoesAprovadas: ObraNoPortal["medicoesAprovadas"];
  readonly anexos: ObraNoPortal["anexos"];
}

function paraTela(o: ObraNoPortal): ObraPublica {
  return {
    id: o.id,
    identificador: o.identificador,
    descricao: o.descricao,
    tipoObraServico: o.tipoObraServico,
    cei: o.cei,
    orgao: o.orgao,
    publicadaEm: o.publicadaEm,
    valorDaObra: o.posicao.valorDaObra?.toFixed(2) ?? null,
    valorContratado: o.posicao.valorContratado.toFixed(2),
    valorEmpenhado: o.posicao.valorEmpenhado.toFixed(2),
    medidoAprovado: o.posicao.medidoAprovado.toFixed(2),
    percentualExecutado: o.posicao.percentualExecutado,
    contratos: o.posicao.contratos.map((c) => ({ numero: c.numero, valorAtualizado: c.valorAtualizado.toFixed(2) })),
    medicoesAprovadas: o.medicoesAprovadas,
    anexos: o.anexos,
  };
}

export async function obrasPublicas(): Promise<readonly ObraPublica[]> {
  return (await obrasNoPortal(cliente())).map(paraTela);
}

export async function obraPublica(id: string): Promise<ObraPublica | null> {
  const o = await obraNoPortal(cliente(), id);
  return o === null ? null : paraTela(o);
}

export async function entregarAnexoPublicoDaObra(anexoId: string) {
  return baixarAnexoPublicoDaObra(cliente(), anexoId);
}

/** A situação da obra no portal, para a tela interna da obra (leitura de licitações). */
export async function lerPublicacaoDaObra(obraId: string): Promise<{ readonly publicada: boolean; readonly atos: readonly { readonly publicada: boolean; readonly motivo: string | null; readonly em: Date; readonly por: string }[] }> {
  await exigirLeituraEmAlgumEscopo("CONSULTAR_LICITACOES");
  const db = cliente();
  const atos = await db.publicacaoDaObra.findMany({ where: { obraId }, orderBy: { criadoEm: "desc" }, select: { publicada: true, motivo: true, criadoEm: true, criadoPor: true } });
  return { publicada: await obraEstaPublicada(db, obraId), atos: atos.map((a) => ({ publicada: a.publicada, motivo: a.motivo, em: a.criadoEm, por: a.criadoPor })) };
}

export async function publicarOuRetirarObra(input: { readonly obraId: string; readonly publicar: boolean; readonly motivo: string }): Promise<string> {
  await comEscritaAutenticada("CADASTRAR_OBRA", (criadoPor) =>
    publicarObraNoPortal(cliente(), { obraId: input.obraId, publicar: input.publicar, ...(input.motivo !== "" ? { motivo: input.motivo } : {}), criadoPor })
  );
  return input.publicar ? "A obra está no portal da transparência, com o cadastro, os valores e os anexos." : "A obra saiu do portal da transparência.";
}
