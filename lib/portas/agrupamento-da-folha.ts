import { liquidacoesDeFolhaSemAgrupamento, registrarAgrupamentoDaFolha } from "../../modules/m33-folha/agrupamento-no-tribunal.js";
import { diaCivil, diaCivilBr, janelaCivilDoMes } from "../../packages/datas/index.js";
import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";

/**
 * V26 — O CÓDIGO DE AGRUPAMENTO DA FOLHA NAS LIQUIDAÇÕES, na tela. A regra (formato, mês, um para um, unidade gestora
 * vigente) é do domínio (`modules/m33-folha/agrupamento-no-tribunal.ts`).
 */

export async function lerAgrupamentosDaFolha(p: { readonly ano: number; readonly mes: number }) {
  await exigirLeituraDoEnte("CONSULTAR_FOLHA");
  const prisma = cliente();
  const prefixo = `${String(p.ano)}-${String(p.mes).padStart(2, "0")}`;
  const [sem, registrados, ugs] = await Promise.all([
    liquidacoesDeFolhaSemAgrupamento(prisma, p),
    prisma.agrupamentoDaFolhaNaLiquidacao.findMany({
      where: { liquidacao: { data: { gte: janelaCivilDoMes(prefixo).inicio, lte: janelaCivilDoMes(prefixo).fim } } },
      select: { id: true, codigo: true, competencia: true, origem: true, sistemaDeOrigem: true, ug: { select: { codigoTce: true } }, liquidacao: { select: { numero: true, data: true, empenho: { select: { numero: true } } } } },
    }),
    prisma.unidadeGestora.findMany({ where: { entidadeContabilId: { not: null }, encerramento: null }, orderBy: { codigoTce: "asc" }, select: { id: true, codigoTce: true, nome: true } }),
  ]);
  return {
    sem,
    registrados: registrados
      .filter((r) => diaCivil(r.liquidacao.data).startsWith(prefixo))
      .map((r) => ({
        id: r.id,
        liquidacao: r.liquidacao.numero,
        empenho: r.liquidacao.empenho.numero,
        dia: diaCivilBr(r.liquidacao.data),
        codigo: r.codigo,
        competencia: r.competencia,
        ug: r.ug.codigoTce,
        origem: r.origem === "FOLHA_DESTE_SISTEMA" ? "Folha deste sistema" : `Folha de outro sistema (${r.sistemaDeOrigem})`,
      }))
      .sort((a, b) => a.liquidacao.localeCompare(b.liquidacao)),
    ugs: ugs.map((u) => ({ id: u.id, rotulo: `${u.codigoTce} — ${u.nome}` })),
  };
}

export async function registrarAgrupamentoPelaTela(input: {
  readonly liquidacaoId: string | null;
  readonly numeroDaLiquidacao: string | null;
  readonly ano: number;
  readonly codigo: string;
  readonly ugId: string;
  readonly competencia: string;
  readonly sistemaDeOrigem: string;
  readonly fundamento: string;
}): Promise<string> {
  await comEscritaAutenticada("LIQUIDAR_FOLHA", async (criadoPor) => {
    let liquidacaoId = input.liquidacaoId;
    if (liquidacaoId === null) {
      // A folha de outro sistema: a liquidação é achada pelo número no exercício, sem adivinhar entre homônimas.
      // A busca é feita já sob a autorização da escrita: quem não pode registrar não aprende se o número existe.
      const achadas = await cliente().liquidacao.findMany({
        where: { numero: input.numeroDaLiquidacao ?? "", estornoDeId: null, anulacaoParcialDeId: null, empenho: { ficha: { exercicio: input.ano } } },
        select: { id: true },
        take: 2,
      });
      if (achadas.length !== 1) throw new Error(`Nenhuma liquidação ${input.numeroDaLiquidacao ?? ""} única em ${String(input.ano)}. Nada foi gravado.`);
      liquidacaoId = achadas[0]!.id;
    }
    return registrarAgrupamentoDaFolha(cliente(), { liquidacaoId, codigo: input.codigo, ugId: input.ugId, competencia: input.competencia, sistemaDeOrigem: input.sistemaDeOrigem, fundamento: input.fundamento, criadoPor });
  });
  return `Código ${input.codigo} registrado na liquidação.`;
}
