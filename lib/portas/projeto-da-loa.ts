import { capturarVersaoDoProjetoDaLoa, type CapturarVersaoDoProjetoDaLoaInput } from "../../modules/m02b-plurianual/projeto-da-loa.js";
import { toMoney } from "../../packages/contracts/index.js";
import { diaCivilBr } from "../../packages/datas/index.js";
import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";

/**
 * V26 — AS VERSÕES DO PROJETO DA LOA ENCAMINHADO À CÂMARA, na tela do projeto. A regra (cópia só antes da lei
 * aprovada, o que o projeto exige) é do domínio (`modules/m02b-plurianual/projeto-da-loa.ts`).
 */

const TIPO: Record<string, string> = {
  ENCAMINHADO: "Projeto encaminhado",
  MENSAGEM_MODIFICATIVA: "Mensagem modificativa",
  EMENDADO_NA_CAMARA: "Emendado na Câmara",
};

export interface VersaoNaTela {
  readonly id: string;
  readonly numero: number;
  readonly tipo: string;
  readonly vaiAoTribunal: boolean;
  readonly encaminhamento: string;
  readonly remessa: string;
  readonly documento: string;
  readonly despesa: string;
  readonly receita: string;
  readonly linhas: string;
}

export async function lerVersoesDoProjeto(leiId: string): Promise<{ readonly versoes: readonly VersaoNaTela[]; readonly aprovada: boolean; readonly exercicio: number | null }> {
  await exigirLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
  const prisma = cliente();
  const lei = await prisma.leiOrcamentariaAnual.findUnique({ where: { id: leiId }, select: { exercicio: true, aprovacao: { select: { id: true } } } });
  if (lei === null) return { versoes: [], aprovada: false, exercicio: null };
  const vs = await prisma.versaoDoProjetoDaLoa.findMany({
    where: { leiId },
    orderBy: { numero: "asc" },
    select: {
      id: true,
      numero: true,
      tipo: true,
      dataDoEncaminhamento: true,
      competenciaDaRemessa: true,
      documento: true,
      dotacoes: { select: { valor: true } },
      receitas: { select: { valor: true, tipoReceita: true } },
      _count: { select: { programas: true, acoes: true, unidades: true } },
    },
  });
  // Vai ao Tribunal, em cada remessa, a última versão do Executivo (a emenda da Câmara não é o projeto).
  const doExecutivo = vs.filter((v) => v.tipo !== "EMENDADO_NA_CAMARA");
  const ultimaPorRemessa = new Map(doExecutivo.map((v) => [v.competenciaDaRemessa, v.id]));
  return {
    exercicio: lei.exercicio,
    aprovada: lei.aprovacao !== null,
    versoes: vs.map((v) => ({
      id: v.id,
      numero: v.numero,
      tipo: TIPO[v.tipo] ?? v.tipo,
      vaiAoTribunal: ultimaPorRemessa.get(v.competenciaDaRemessa) === v.id,
      encaminhamento: diaCivilBr(v.dataDoEncaminhamento),
      remessa: `${v.competenciaDaRemessa.slice(5, 7)}/${v.competenciaDaRemessa.slice(0, 4)}`,
      documento: v.documento,
      despesa: v.dotacoes.reduce((s, d) => s.plus(toMoney(d.valor.toFixed(2))), toMoney("0")).toFixed(2),
      receita: v.receitas.reduce((s, r) => (r.tipoReceita === "DEDUCAO" ? s.minus(toMoney(r.valor.toFixed(2))) : s.plus(toMoney(r.valor.toFixed(2)))), toMoney("0")).toFixed(2),
      linhas: `${String(v.dotacoes.length)} dotações, ${String(v.receitas.length)} receitas, ${String(v._count.programas)} programas, ${String(v._count.acoes)} ações, ${String(v._count.unidades)} unidades`,
    })),
  };
}

export async function capturarVersaoPelaTela(input: Omit<CapturarVersaoDoProjetoDaLoaInput, "criadoPor">): Promise<string> {
  const r = await comEscritaAutenticada("CADASTRAR_LOA", (criadoPor) => capturarVersaoDoProjetoDaLoa(cliente(), { ...input, criadoPor }));
  return `Versão ${String(r.numero)} do projeto guardada, com a cópia da despesa, da receita, dos programas, das ações e das unidades.`;
}
