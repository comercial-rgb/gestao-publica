import { diaCivil, diaCivilBr } from "../../packages/datas/index.js";
import {
  acompanhamentoDoContrato,
  cadastrarItemDoContrato,
  designarNoContrato,
  programarFiscalizacao,
  projecaoPublicaDoContrato,
  registrarMedicaoPorItens,
  registrarOcorrencia,
  resolverOcorrencia,
  revogarDesignacaoNoContrato,
  type AcompanhamentoDoContrato,
  type ProjecaoPublicaDoContrato,
} from "../../modules/m11-licitacoes/fiscalizacao.js";
import { designacaoVigenteEm } from "../../modules/m33-folha/certificacao.js";
import { cliente, PortaSemBancoError } from "./cliente";
import { acoesPermitidas } from "./molde";
import { comEscritaAutenticada, type Identidade } from "./sessao";

/**
 * ═══ O CONTRATO ACOMPANHADO (V7 M2.1) — as portas do dossiê, dos atos e da projeção pública ═══
 *
 * O DOSSIÊ é leitura interna (a página cobra `CONSULTAR_LICITACOES`). Os atos passam pela escrita
 * autenticada com a ação do censo; a DESIGNAÇÃO no contrato é conferida pelo domínio, na transação. A
 * porta só antecipa à tela quais formulários fazem sentido para a sessão (tem a ação E, para gestor e
 * fiscal, está designada hoje) — a recusa continua sendo do servidor.
 *
 * A PROJEÇÃO PÚBLICA é a do domínio, escolhida campo a campo; esta porta não acrescenta nada a ela.
 */

export { PortaSemBancoError };

export interface PapeisDaSessao {
  readonly designar: boolean;
  readonly cadastrarItem: boolean;
  readonly gestor: boolean;
  readonly fiscal: boolean;
  readonly podeProgramar: boolean;
  readonly podeRegistrarOcorrencia: boolean;
  readonly podeResolver: boolean;
  readonly podeMedir: boolean;
}

export interface DossieParaTela extends AcompanhamentoDoContrato {
  readonly papeis: PapeisDaSessao;
  readonly opcoes: {
    readonly usuarios: readonly { readonly valor: string; readonly rotulo: string }[];
    readonly fiscais: readonly { readonly valor: string; readonly rotulo: string }[];
    readonly obras: readonly { readonly valor: string; readonly rotulo: string }[];
    readonly minhasOrdens: readonly { readonly valor: string; readonly rotulo: string }[];
    readonly proximaMedicao: number;
  };
}

export async function dossieDoContratoPara(sessao: Identidade, contratoId: string): Promise<DossieParaTela | null> {
  const prisma = cliente();
  const base = await acompanhamentoDoContrato(prisma, contratoId);
  if (base === null) return null;
  const [permitidas, minhas, usuarios, obras, ultimaMedicao] = await Promise.all([
    acoesPermitidas(["DESIGNAR_NO_CONTRATO", "CADASTRAR_ITEM_DO_CONTRATO", "PROGRAMAR_FISCALIZACAO_DO_CONTRATO", "REGISTRAR_OCORRENCIA_DE_FISCALIZACAO", "RESOLVER_OCORRENCIA_DE_FISCALIZACAO", "REGISTRAR_MEDICAO_DE_OBRA"]),
    prisma.designacaoNoContrato.findMany({ where: { contratoId, usuario: { identificador: sessao.identificador } }, select: { papel: true, vigenciaInicio: true, vigenciaFim: true, revogacao: { select: { dataEfeito: true } } } }),
    // Só contas ATIVAS com pessoa vinculada podem ser designadas; o recorte é do servidor, e o domínio confere de novo.
    prisma.usuario.findMany({ where: { ativo: true, vinculosDePessoa: { some: {} } }, orderBy: { identificador: "asc" }, take: 500, select: { identificador: true, nome: true } }),
    prisma.obra.findMany({ where: { ativa: true, OR: [{ medicoes: { some: { contratoId } } }, { empenhos: { some: { contratoId } } }] }, orderBy: { identificador: "asc" }, select: { id: true, identificador: true, descricao: true } }),
    prisma.medicaoDeObra.findFirst({ where: { contratoId }, orderBy: { numero: "desc" }, select: { numero: true } }),
  ]);
  const agora = new Date();
  const gestor = minhas.some((d) => d.papel === "GESTOR" && designacaoVigenteEm(d, agora));
  const fiscal = minhas.some((d) => d.papel === "FISCAL" && designacaoVigenteEm(d, agora));
  // Obras de medição: as já ligadas ao contrato (por medição ou empenho) e, se nenhuma, as obras ativas.
  const obrasDaTela = obras.length > 0 ? obras : await prisma.obra.findMany({ where: { ativa: true }, orderBy: { identificador: "asc" }, take: 200, select: { id: true, identificador: true, descricao: true } });
  return {
    ...base,
    papeis: {
      designar: permitidas.has("DESIGNAR_NO_CONTRATO"),
      cadastrarItem: permitidas.has("CADASTRAR_ITEM_DO_CONTRATO"),
      gestor, fiscal,
      podeProgramar: gestor && permitidas.has("PROGRAMAR_FISCALIZACAO_DO_CONTRATO"),
      podeRegistrarOcorrencia: fiscal && permitidas.has("REGISTRAR_OCORRENCIA_DE_FISCALIZACAO"),
      podeResolver: gestor && permitidas.has("RESOLVER_OCORRENCIA_DE_FISCALIZACAO"),
      podeMedir: fiscal && permitidas.has("REGISTRAR_MEDICAO_DE_OBRA"),
    },
    opcoes: {
      usuarios: usuarios.map((u) => ({ valor: u.identificador, rotulo: `${u.identificador} — ${u.nome}` })),
      fiscais: base.designacoes.filter((d) => d.papel === "FISCAL" && d.vigenteHoje).map((d) => ({ valor: d.id, rotulo: `${d.nome} (${d.ato})` })),
      obras: obrasDaTela.map((o) => ({ valor: o.id, rotulo: `${o.identificador} — ${o.descricao}` })),
      minhasOrdens: base.ordens.filter((o) => o.fiscal === sessao.identificador).map((o) => ({ valor: o.id, rotulo: `Ordem nº ${o.numero} — ${o.dataPrevista}` })),
      proximaMedicao: (ultimaMedicao?.numero ?? 0) + 1,
    },
  };
}

const t = (c: Readonly<Record<string, string>>, k: string): string => (c[k] ?? "").trim();

export async function designarNaTela(contratoId: string, c: Readonly<Record<string, string>>): Promise<string> {
  await comEscritaAutenticada("DESIGNAR_NO_CONTRATO", (criadoPor) =>
    designarNoContrato(cliente(), { contratoId, papel: t(c, "papel") as "GESTOR" | "FISCAL", usuarioIdentificador: t(c, "usuario"), atoDesignacao: t(c, "ato"), vigenciaInicio: t(c, "inicio"), ...(t(c, "fim") !== "" ? { vigenciaFim: t(c, "fim") } : {}), criadoPor })
  );
  return `Designação de ${t(c, "papel") === "GESTOR" ? "gestor" : "fiscal"} registrada. Ela autoriza os atos do papel dentro da vigência, neste contrato.`;
}

export async function revogarNaTela(c: Readonly<Record<string, string>>): Promise<string> {
  await comEscritaAutenticada("DESIGNAR_NO_CONTRATO", (criadoPor) => revogarDesignacaoNoContrato(cliente(), { designacaoId: t(c, "designacaoId"), dataEfeito: t(c, "dataEfeito"), motivo: t(c, "motivo"), criadoPor }));
  return "Designação revogada. Os atos praticados antes do efeito continuam com o lastro dela.";
}

export async function itemNaTela(contratoId: string, c: Readonly<Record<string, string>>): Promise<string> {
  const decimal = (k: string): string => t(c, k).replace(/\./g, "").replace(",", ".");
  const r = await comEscritaAutenticada("CADASTRAR_ITEM_DO_CONTRATO", (criadoPor) => cadastrarItemDoContrato(cliente(), { contratoId, descricao: t(c, "descricao"), unidade: t(c, "unidade"), quantidade: decimal("quantidade"), valorUnitario: decimal("valorUnitario"), criadoPor }));
  return `Item nº ${r.numero} cadastrado.`;
}

export async function programarNaTela(contratoId: string, c: Readonly<Record<string, string>>): Promise<string> {
  const r = await comEscritaAutenticada("PROGRAMAR_FISCALIZACAO_DO_CONTRATO", (criadoPor) => programarFiscalizacao(cliente(), { contratoId, fiscalDesignacaoId: t(c, "fiscalDesignacaoId"), dataPrevista: t(c, "dataPrevista"), objetivo: t(c, "objetivo"), criadoPor }));
  return `Ordem de fiscalização nº ${r.numero} programada para o fiscal escolhido.`;
}

export async function ocorrenciaNaTela(contratoId: string, c: Readonly<Record<string, string>>, arquivos: readonly File[]): Promise<string> {
  const evidencias = await Promise.all(arquivos.filter((a) => a.size > 0).map(async (a) => ({ nomeOriginal: a.name, mimeType: a.type, conteudo: new Uint8Array(await a.arrayBuffer()) })));
  const r = await comEscritaAutenticada("REGISTRAR_OCORRENCIA_DE_FISCALIZACAO", (criadoPor) =>
    registrarOcorrencia(cliente(), {
      contratoId, ...(t(c, "ordemId") !== "" ? { ordemId: t(c, "ordemId") } : {}), data: t(c, "data"), tipo: t(c, "tipo") as "OUTRO", descricao: t(c, "descricao"),
      encaminhamento: t(c, "encaminhamento") === "GESTOR" ? "GESTOR" : "NENHUM", evidencias, criadoPor,
    })
  );
  return `Ocorrência nº ${r.numero} registrada com ${r.evidencias} evidência(s)${t(c, "encaminhamento") === "GESTOR" ? ", encaminhada ao gestor" : ""}.`;
}

export async function resolverNaTela(c: Readonly<Record<string, string>>): Promise<string> {
  await comEscritaAutenticada("RESOLVER_OCORRENCIA_DE_FISCALIZACAO", (criadoPor) => resolverOcorrencia(cliente(), { ocorrenciaId: t(c, "ocorrenciaId"), texto: t(c, "texto"), criadoPor }));
  return "Resolução registrada na ocorrência.";
}

export async function medirNaTela(contratoId: string, c: Readonly<Record<string, string>>): Promise<string> {
  const itens = Object.entries(c)
    .filter(([k, v]) => k.startsWith("item.") && v.trim() !== "")
    .map(([k, v]) => ({ itemId: k.slice("item.".length), quantidade: v.trim().replace(/\./g, "").replace(",", ".") }));
  const r = await comEscritaAutenticada("REGISTRAR_MEDICAO_DE_OBRA", (criadoPor) =>
    registrarMedicaoPorItens(cliente(), {
      obraId: t(c, "obraId"), contratoId, numero: Number.parseInt(t(c, "numero"), 10), diaInicio: t(c, "diaInicio"), diaFim: t(c, "diaFim"), itens,
      responsavelTecnico: t(c, "responsavelTecnico"), registroProfissional: t(c, "registroProfissional"), criadoPor,
    })
  );
  return `Medição registrada por itens: R$ ${r.valorMedido.replace(".", ",")} no período (acumulado do contrato ${r.acumulado.replace(".", ",")}). Ela ainda precisa ser APROVADA por outra pessoa antes de liquidar.`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PÚBLICO
// ═══════════════════════════════════════════════════════════════════════════════

export interface ContratoNaListaPublica {
  readonly id: string;
  readonly numero: string;
  readonly objeto: string | null;
  readonly contratado: string;
  readonly inicio: string;
}

/** A lista pública: identificação e início; o detalhe traz a vigência derivada e os valores. */
export async function contratosPublicos(): Promise<readonly ContratoNaListaPublica[]> {
  const cs = await cliente().contrato.findMany({ orderBy: { vigenciaInicio: "desc" }, take: 200, select: { id: true, numeroContrato: true, objeto: true, contratadoNome: true, vigenciaInicio: true } });
  return cs.map((c) => ({ id: c.id, numero: c.numeroContrato, objeto: c.objeto, contratado: c.contratadoNome, inicio: diaCivilBr(c.vigenciaInicio) }));
}

export async function contratoPublico(id: string): Promise<ProjecaoPublicaDoContrato | null> {
  return projecaoPublicaDoContrato(cliente(), id);
}

export const hojeCivil = (): string => diaCivil(new Date());
