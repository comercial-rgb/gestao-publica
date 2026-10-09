import { alterarSituacaoDoSetor, criarSetor, desfazerLotacaoNoSetor, lotarUsuarioNoSetor } from "../../../modules/m21-protocolo/cadastros.js";
import { diaCivilBr } from "../../../packages/datas/index.js";
import type { ConsultaDoMolde } from "../../molde/consulta.js";
import { TAMANHO_DE_PAGINA } from "../../molde/consulta.js";
import { comEscritaAutenticada } from "../sessao";
import { cliente } from "../cliente";
import type { DetalheLido, PaginaDoMolde } from "./dados";

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

/** V37 — o detalhe do setor: unidade, situação e o uso (requisições, solicitações e lotados). */
export async function verSetor(id: string): Promise<DetalheLido | null> {
  const s = await cliente().setor.findUnique({
    where: { id },
    select: {
      codigo: true, nome: true, ativo: true, criadoEm: true, criadoPor: true,
      unidadeOrc: { select: { codigo: true, descricao: true } },
      lotados: { orderBy: { usuarioIdent: "asc" }, select: { usuarioIdent: true } },
    },
  });
  if (s === null) return null;
  const [requisicoes, solicitacoes] = await Promise.all([
    cliente().requisicaoDeMaterial.count({ where: { setorId: id } }),
    cliente().solicitacaoDeCompra.count({ where: { setorId: id } }),
  ]);
  return {
    titulo: `${s.codigo} — ${s.nome}`,
    subtitulo: `Unidade gestora ${s.unidadeOrc.codigo} — ${s.unidadeOrc.descricao}`,
    selos: [{ texto: s.ativo ? "Ativo" : "Desativado", tom: s.ativo ? "ok" : "neutro" }],
    dados: [
      { rotulo: "Código", valor: s.codigo },
      { rotulo: "Nome", valor: s.nome },
      { rotulo: "Unidade gestora", valor: `${s.unidadeOrc.codigo} — ${s.unidadeOrc.descricao}` },
      { rotulo: "Situação", valor: s.ativo ? "Ativo" : "Desativado", nota: "Desativado, não aparece nas requisições e solicitações novas." },
      { rotulo: "Requisições de material", valor: String(requisicoes), tipo: "inteiro" },
      { rotulo: "Solicitações de compra", valor: String(solicitacoes), tipo: "inteiro" },
      { rotulo: "Usuários lotados", valor: s.lotados.length === 0 ? "Nenhum" : s.lotados.map((l) => l.usuarioIdent).join(", "),
        nota: "Quem está lotado recebe os processos e as comunicações do setor." },
      { rotulo: "Cadastrado em", valor: diaCivilBr(s.criadoEm), tipo: "data" },
      { rotulo: "Cadastrado por", valor: s.criadoPor },
    ],
    historico: [],
  };
}

export async function acaoDoSetor(acao: string, setorId: string, c: Campos = {}): Promise<void> {
  if (acao === "lotar") {
    await comEscritaAutenticada("LOTAR_USUARIO_NO_SETOR", (criadoPor) => lotarUsuarioNoSetor(cliente(), { usuarioIdent: c["usuarioIdent"] ?? "", setorId, criadoPor }));
    return;
  }
  if (acao === "desfazer-lotacao") {
    await comEscritaAutenticada("LOTAR_USUARIO_NO_SETOR", (criadoPor) => desfazerLotacaoNoSetor(cliente(), { usuarioIdent: c["usuarioIdent"] ?? "", setorId, criadoPor }));
    return;
  }
  if (acao !== "desativar" && acao !== "reativar") throw new Error(`Ação "${acao}" não existe neste cadastro. Nada foi gravado.`);
  await comEscritaAutenticada("CRIAR_SETOR", (criadoPor) => alterarSituacaoDoSetor(cliente(), { setorId, ativo: acao === "reativar", criadoPor }));
}
