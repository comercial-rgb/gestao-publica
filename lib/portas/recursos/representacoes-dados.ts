import { ELEGIVEL, naoAplicavel } from "../../../packages/contracts/index.js";
import { formatarDocumento } from "../../../packages/documento/index.js";
import { diaCivilBr, instanteCivilBr, meioDiaCivil } from "../../../packages/datas/index.js";
import { registrarRepresentacao, representacaoVigenteEm, revogarRepresentacao } from "../../../modules/m19-pessoas/representacao.js";
import type { ConsultaDoMolde } from "../../molde/consulta.js";
import { TAMANHO_DE_PAGINA } from "../../molde/consulta.js";
import type { DisponibilidadeDoRegistro, LinhaDoHistorico } from "../../molde/tipos.js";
import { cliente, PortaSemBancoError } from "../cliente";
import { apresentar, RegistroMudouError, versaoDoEstado } from "../disponibilidade";
import { comEscritaAutenticada } from "../sessao";
import type { DetalheLido, PaginaDoMolde } from "./dados";

/**
 * A PORTA DAS REPRESENTAÇÕES (M19, V6.2 P3). A situação "vigente hoje" é DERIVADA a cada leitura (início,
 * fim e revogação pelo dia civil do ente) — não há coluna de situação a envelhecer.
 */
export { PortaSemBancoError };

type Campos = Readonly<Record<string, string>>;
const t = (c: Campos, k: string): string => (c[k] ?? "").trim();

const SELECAO = {
  id: true, fundamento: true, vigenciaInicio: true, vigenciaFim: true, criadoEm: true, criadoPor: true,
  revogacao: { select: { id: true, dataEfeito: true, motivo: true, criadoEm: true, criadoPor: true } },
  representada: { select: { documento: true, versoes: { orderBy: { criadoEm: "desc" as const }, take: 1, select: { nome: true } } } },
  representanteUsuario: { select: { identificador: true, nome: true } },
  _count: { select: { solicitacoes: true } },
} as const;

type Lida = NonNullable<Awaited<ReturnType<typeof lerUma>>>;
const lerUma = (id: string) => cliente().representacaoDePessoa.findUnique({ where: { id }, select: SELECAO });

const situacao = (r: Lida): string => {
  if (representacaoVigenteEm(r, new Date())) return r.revogacao === null ? "vigente" : `vigente até a revogação em ${diaCivilBr(r.revogacao.dataEfeito)}`;
  if (r.revogacao !== null && r.revogacao.dataEfeito <= new Date()) return `revogada desde ${diaCivilBr(r.revogacao.dataEfeito)}`;
  return r.vigenciaInicio > new Date() ? "ainda não começou" : "vencida";
};
const vigencia = (r: Lida): string => `${diaCivilBr(r.vigenciaInicio)} a ${r.vigenciaFim === null ? "sem prazo" : diaCivilBr(r.vigenciaFim)}`;
const representada = (r: Lida): string => `${r.representada.versoes[0]?.nome ?? ""} (${formatarDocumento(r.representada.documento)})`;

export async function listarRepresentacoes(c: ConsultaDoMolde): Promise<PaginaDoMolde> {
  const q = (c.filtros["q"] ?? "").trim();
  const digitos = q.replace(/\D/g, "");
  const where = q === "" ? {} : {
    OR: [
      { representada: { versoes: { some: { nome: { contains: q, mode: "insensitive" as const } } } } },
      ...(digitos.length >= 3 ? [{ representada: { documento: { startsWith: digitos } } }] : []),
      { representanteUsuario: { identificador: { contains: q, mode: "insensitive" as const } } },
    ],
  };
  const [total, lista] = await Promise.all([
    cliente().representacaoDePessoa.count({ where }),
    cliente().representacaoDePessoa.findMany({ where, orderBy: { criadoEm: "desc" }, skip: (c.pagina - 1) * TAMANHO_DE_PAGINA, take: TAMANHO_DE_PAGINA, select: SELECAO }),
  ]);
  return { total, linhas: lista.map((r) => ({ id: r.id, representada: representada(r), representante: `${r.representanteUsuario.nome} (${r.representanteUsuario.identificador})`, vigencia: vigencia(r), situacao: situacao(r) })) };
}

export async function verRepresentacao(id: string): Promise<DetalheLido | null> {
  const r = await lerUma(id);
  if (r === null) return null;
  const historico: LinhaDoHistorico[] = [
    { id: r.id, oQue: "Representação registrada", quando: diaCivilBr(r.vigenciaInicio), registradoEm: instanteCivilBr(r.criadoEm), por: r.criadoPor, motivo: r.fundamento },
    ...(r.revogacao === null ? [] : [{ id: r.revogacao.id, oQue: "Representação revogada", quando: diaCivilBr(r.revogacao.dataEfeito), registradoEm: instanteCivilBr(r.revogacao.criadoEm), por: r.revogacao.criadoPor, motivo: r.revogacao.motivo }]),
  ];
  const vigente = representacaoVigenteEm(r, new Date());
  return {
    titulo: `Representação de ${representada(r)}`,
    subtitulo: `por ${r.representanteUsuario.nome} (${r.representanteUsuario.identificador})`,
    selos: [{ texto: situacao(r).toUpperCase(), tom: vigente ? "ok" : "alerta" }],
    dados: [
      { rotulo: "Representada", valor: representada(r) },
      { rotulo: "Conta do representante", valor: `${r.representanteUsuario.nome} (${r.representanteUsuario.identificador})` },
      { rotulo: "Fundamento", valor: r.fundamento, tipo: "longo" },
      { rotulo: "Vigência", valor: vigencia(r) },
      { rotulo: "Solicitações protocoladas sob esta representação", valor: String(r._count.solicitacoes) },
    ],
    historico,
  };
}

export async function disponibilidadeDaRepresentacao(id: string): Promise<DisponibilidadeDoRegistro | null> {
  const r = await lerUma(id);
  if (r === null) return null;
  return {
    versao: versaoDoEstado([r.revogacao?.id ?? null]),
    porAcao: { revogar: apresentar(r.revogacao === null ? ELEGIVEL : naoAplicavel("REPRESENTACAO-JA-REVOGADA", `Já revogada, com efeito em ${diaCivilBr(r.revogacao.dataEfeito)}.`)) },
  };
}

export async function criarRepresentacao(c: Campos): Promise<string> {
  const r = await comEscritaAutenticada("REGISTRAR_REPRESENTACAO", (criadoPor) =>
    registrarRepresentacao(cliente(), {
      representadaId: t(c, "representadaId"), representanteUsuario: t(c, "representanteUsuario"), fundamento: t(c, "fundamento"),
      vigenciaInicio: meioDiaCivil(t(c, "vigenciaInicio")), ...(t(c, "vigenciaFim") !== "" ? { vigenciaFim: meioDiaCivil(t(c, "vigenciaFim")) } : {}), criadoPor,
    })
  );
  return r.representacaoId;
}

export async function acaoDaRepresentacao(acao: string, id: string, c: Campos): Promise<string> {
  if (acao !== "revogar") throw new Error(`Ação desconhecida: ${acao}. Nada foi gravado.`);
  const versaoDoFormulario = t(c, "__versao");
  if (versaoDoFormulario !== "") {
    const atual = await lerUma(id);
    if (atual !== null && versaoDoEstado([atual.revogacao?.id ?? null]) !== versaoDoFormulario) throw new RegistroMudouError("Esta representação");
  }
  await comEscritaAutenticada("REGISTRAR_REPRESENTACAO", (criadoPor) => revogarRepresentacao(cliente(), { representacaoId: id, dataEfeito: meioDiaCivil(t(c, "dataEfeito")), motivo: t(c, "motivo"), criadoPor }));
  return `Representação revogada com efeito em ${t(c, "dataEfeito").split("-").reverse().join("/")}. A partir dessa data, o representante não pode agir nem acompanhar pedidos em nome da representada.`;
}
