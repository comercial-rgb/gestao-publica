import { diaCivilBr } from "../../packages/datas/index.js";
import { loaDoExercicio } from "../../modules/m02b-plurianual/consultas-loa.js";
import { baixarAnexoPublicoDaLoa } from "../../modules/m22-documentos/anexos.js";
import { cliente, PortaSemBancoError } from "./cliente.js";
import { loaParaTela, type LoaDaTela } from "./loa";

export { PortaSemBancoError };
export type { LoaDaTela };

/**
 * ═══ V35 C9 — O PLANEJAMENTO NO PORTAL DA TRANSPARÊNCIA (LRF, art. 48) ═══
 *
 * "São instrumentos de transparência da gestão fiscal, aos quais será dada ampla divulgação [...]: os planos,
 * orçamentos e leis de diretrizes orçamentárias". Sem sessão, como as outras consultas públicas.
 *
 * ⚠️ SÓ O QUE VIROU LEI. O PPA entra com a lei que o instituiu; a LDO, depois da sanção (os oito anexos em PDF);
 * a LOA, depois da lei de aprovação (o resumo, os anexos da Lei 4.320 e os documentos anexados). O projeto em
 * tramitação não é publicado por aqui: ainda não é o orçamento do município.
 *
 * ⚠️ O QUE NUNCA SAI: `criadoPor` (quem digitou) e qualquer anexo que não seja de LOA aprovada.
 */

export interface PlanejamentoPublico {
  readonly ppas: readonly { readonly anoInicio: number; readonly anoFim: number; readonly lei: string; readonly publicacao: string }[];
  readonly ldos: readonly { readonly id: string; readonly exercicio: number; readonly vigencia: string; readonly sancao: string }[];
  readonly loas: readonly {
    readonly exercicio: number;
    readonly ementa: string;
    readonly lei: string;
    readonly sancao: string;
    readonly publicacao: string;
    readonly veiculo: string;
    readonly documentos: readonly { readonly id: string; readonly nome: string; readonly tamanhoBytes: number; readonly sha256: string }[];
  }[];
}

export async function lerPlanejamentoPublico(): Promise<PlanejamentoPublico> {
  const db = cliente();
  const [ppas, ldos, loas] = await Promise.all([
    db.planoPlurianual.findMany({ orderBy: { anoInicio: "desc" }, select: { anoInicio: true, anoFim: true, leiRef: true, dataPublicacao: true } }),
    db.leiDiretrizesOrcamentarias.findMany({ where: { dataSancao: { not: null } }, orderBy: { exercicio: "desc" }, select: { id: true, exercicio: true, inicioVigencia: true, fimVigencia: true, dataSancao: true } }),
    db.leiOrcamentariaAnual.findMany({
      where: { aprovacao: { isNot: null } },
      orderBy: { exercicio: "desc" },
      select: {
        exercicio: true,
        ementa: true,
        aprovacao: { select: { numeroDaLei: true, dataDaSancao: true, dataDaPublicacao: true, veiculoDePublicacao: true } },
        anexos: { orderBy: { nomeOriginal: "asc" }, select: { id: true, nomeOriginal: true, tamanhoBytes: true, sha256: true } },
      },
    }),
  ]);
  return {
    ppas: ppas.map((p) => ({ anoInicio: p.anoInicio, anoFim: p.anoFim, lei: p.leiRef, publicacao: diaCivilBr(p.dataPublicacao) })),
    ldos: ldos.map((l) => ({ id: l.id, exercicio: l.exercicio, vigencia: `${diaCivilBr(l.inicioVigencia)} a ${diaCivilBr(l.fimVigencia)}`, sancao: diaCivilBr(l.dataSancao!) })),
    loas: loas.map((l) => ({
      exercicio: l.exercicio,
      ementa: l.ementa,
      lei: l.aprovacao!.numeroDaLei,
      sancao: diaCivilBr(l.aprovacao!.dataDaSancao),
      publicacao: diaCivilBr(l.aprovacao!.dataDaPublicacao),
      veiculo: l.aprovacao!.veiculoDePublicacao,
      documentos: l.anexos.map((a) => ({ id: a.id, nome: a.nomeOriginal, tamanhoBytes: a.tamanhoBytes, sha256: a.sha256 })),
    })),
  };
}

/** A LOA aprovada do exercício, consolidada como na tela interna; `null` se não há lei de aprovação. */
export async function lerLoaPublica(exercicio: number): Promise<LoaDaTela | null> {
  const db = cliente();
  const lei = await db.leiOrcamentariaAnual.findUnique({ where: { exercicio }, select: { aprovacao: { select: { id: true } } } });
  if (lei?.aprovacao == null) return null;
  return loaParaTela(await loaDoExercicio(db, { exercicio }));
}

/** A LDO sancionada: `true` se o id existe e a lei tem sanção registrada. */
export async function ldoEstaSancionada(id: string): Promise<boolean> {
  const l = await cliente().leiDiretrizesOrcamentarias.findUnique({ where: { id }, select: { dataSancao: true } });
  return l?.dataSancao != null;
}

export async function entregarDocumentoPublicoDaLoa(anexoId: string) {
  return baixarAnexoPublicoDaLoa(cliente(), anexoId);
}
