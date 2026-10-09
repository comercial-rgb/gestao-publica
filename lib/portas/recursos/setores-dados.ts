import { criarSetor } from "../../../modules/m21-protocolo/cadastros.js";
import type { ConsultaDoMolde } from "../../molde/consulta.js";
import { TAMANHO_DE_PAGINA } from "../../molde/consulta.js";
import { comEscritaAutenticada } from "../sessao";
import { cliente } from "../cliente";
import type { PaginaDoMolde } from "./dados";

/**
 * V37 — A PORTA DO CADASTRO DE SETORES: a listagem do molde e a escrita pelo caso de uso do M21. Nenhuma regra
 * aqui: código, unicidade, unidade e autorização são do `criarSetor`, e a recusa sobe como veio.
 */

type Campos = Readonly<Record<string, string>>;

const ORDENAVEIS = new Set(["codigo", "nome"]);

export async function listarSetoresDoMolde(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const prisma = cliente();
  const q = (c.filtros["q"] ?? "").trim();
  const where = q === "" ? {} : { OR: [{ codigo: { contains: q, mode: "insensitive" as const } }, { nome: { contains: q, mode: "insensitive" as const } }] };
  const [total, linhas] = await Promise.all([
    prisma.setor.count({ where }),
    prisma.setor.findMany({
      where,
      skip: (c.pagina - 1) * TAMANHO_DE_PAGINA,
      take: TAMANHO_DE_PAGINA,
      orderBy: c.ordem !== null && ORDENAVEIS.has(c.ordem) ? { [c.ordem]: c.direcao } : { codigo: "asc" },
      select: { id: true, codigo: true, nome: true, ativo: true, unidadeOrc: { select: { codigo: true, descricao: true } } },
    }),
  ]);
  return {
    total,
    linhas: linhas.map((s) => ({
      id: s.id,
      codigo: s.codigo,
      nome: s.nome,
      unidade: `${s.unidadeOrc.codigo} — ${s.unidadeOrc.descricao}`,
      situacao: s.ativo ? "Ativo" : "Desativado",
      situacaoTom: s.ativo ? "ok" : "neutro",
    })),
  };
}

export async function cadastrarSetorDoMolde(c: Campos): Promise<void> {
  await comEscritaAutenticada("CRIAR_SETOR", (criadoPor) =>
    criarSetor(cliente(), {
      codigo: c["codigo"] ?? "",
      nome: c["nome"] ?? "",
      unidadeOrcId: c["unidadeOrcId"] ?? "",
      criadoPor,
    })
  );
}
