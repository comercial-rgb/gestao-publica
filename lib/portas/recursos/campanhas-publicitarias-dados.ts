import {
  cadastrarCampanhaPublicitaria,
  empenhadoLiquidoDaCampanha,
} from "../../../modules/m05-despesa/campanha-publicitaria.js";
import { diaCivilBr } from "../../../packages/datas/index.js";
import type { ConsultaDoMolde } from "../../molde/consulta.js";
import { TAMANHO_DE_PAGINA } from "../../molde/consulta.js";
import { comEscritaAutenticada } from "../sessao";
import { cliente, PortaSemBancoError } from "../cliente";
import type { PaginaDoMolde } from "./dados";

export { PortaSemBancoError };

/**
 * ═══ OS DADOS DAS CAMPANHAS PUBLICITÁRIAS (V22, M05) ═══
 *
 * O empenhado da lista é a MESMA soma do seletor do empenho (`empenhadoLiquidoDaCampanha`, líquida
 * de anulações) — uma régua só para "quanto já se comprometeu com a campanha".
 */
export async function listarCampanhasPublicitarias(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = (c.filtros["q"] ?? "").trim();
  const where =
    q === ""
      ? {}
      : {
          OR: [
            { identificador: { contains: q, mode: "insensitive" as const } },
            { titulo: { contains: q, mode: "insensitive" as const } },
            { objetivo: { contains: q, mode: "insensitive" as const } },
          ],
        };
  const [total, linhas] = await Promise.all([
    prisma.campanhaPublicitaria.count({ where }),
    prisma.campanhaPublicitaria.findMany({
      where,
      skip: (c.pagina - 1) * TAMANHO_DE_PAGINA,
      take: TAMANHO_DE_PAGINA,
      orderBy: c.ordem === null ? { identificador: "desc" } : { [c.ordem]: c.direcao },
      select: {
        id: true,
        identificador: true,
        titulo: true,
        inicio: true,
        fim: true,
        contrato: { select: { numeroContrato: true, contratadoNome: true } },
        _count: { select: { empenhos: true } },
      },
    }),
  ]);
  const saida = [];
  for (const x of linhas) {
    const empenhado = await empenhadoLiquidoDaCampanha(prisma, x.id);
    saida.push({
      id: x.id,
      identificador: x.identificador,
      titulo: x.titulo,
      periodo: x.fim === null ? `de ${diaCivilBr(x.inicio)} em diante` : `${diaCivilBr(x.inicio)} a ${diaCivilBr(x.fim)}`,
      contrato: x.contrato === null ? "" : `${x.contrato.numeroContrato} — ${x.contrato.contratadoNome}`,
      empenhos: String(x._count.empenhos),
      empenhado: empenhado.toFixed(2),
    });
  }
  return { total, linhas: saida };
}

type Campos = Readonly<Record<string, string>>;

export async function criarCampanhaPublicitaria(c: Campos): Promise<string> {
  const r = await comEscritaAutenticada("CADASTRAR_CONTRATO", (criadoPor) =>
    cadastrarCampanhaPublicitaria(cliente(), {
      identificador: c["identificador"] ?? "",
      titulo: c["titulo"] ?? "",
      objetivo: c["objetivo"] ?? "",
      inicio: c["inicio"] ?? "",
      fim: c["fim"] ?? "",
      contratoId: c["contratoId"] ?? "",
      criadoPor,
    })
  );
  return r.identificador;
}

export async function semAcaoNasCampanhas(acao: string): Promise<void> {
  throw new Error(`Ação "${acao}" não existe neste cadastro. Nada foi gravado.`);
}
