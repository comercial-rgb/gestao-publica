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
import { alcanceNoContrato, contratosNoAlcanceDaFiscalizacao, definirAdministradorDaFiscalizacao, revogarAdministradorDaFiscalizacao, type AlcanceNoContrato } from "../../modules/m11-licitacoes/acesso-da-fiscalizacao.js";
import { cliente, PortaSemBancoError } from "./cliente";
import { acoesPermitidas } from "./molde";
import { comEscritaAutenticada, type Identidade } from "./sessao";

/**
 * ═══ O CONTRATO ACOMPANHADO (V7 M2.1) — as portas do dossiê, dos atos e da projeção pública ═══
 *
 * O DOSSIÊ é leitura interna em DUAS projeções (V7 M2 U0.1): a de FISCALIZAÇÃO, só para quem tem designação vigente
 * no contrato ou definição vigente de administrador da fiscalização; a FINANCEIRA, sem agenda, ocorrência nem
 * evidência, para quem lê licitações ou despesa. `alcanceDaSessaoNoContrato` é a mesma decisão para a página e
 * para o anexo. Os atos passam pela escrita
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
  readonly alcance: AlcanceNoContrato;
  readonly papeis: PapeisDaSessao;
  readonly opcoes: {
    readonly usuarios: readonly { readonly valor: string; readonly rotulo: string }[];
    readonly fiscais: readonly { readonly valor: string; readonly rotulo: string }[];
    readonly obras: readonly { readonly valor: string; readonly rotulo: string }[];
    readonly minhasOrdens: readonly { readonly valor: string; readonly rotulo: string }[];
    readonly proximaMedicao: number;
  };
}

/** O alcance da sessão neste contrato — a decisão do domínio, lida uma vez por requisição. */
export async function alcanceDaSessaoNoContrato(sessao: Identidade, contratoId: string): Promise<AlcanceNoContrato> {
  return alcanceNoContrato(cliente(), sessao.identificador, contratoId);
}

/**
 * O DOSSIÊ na projeção que o alcance permite — `null` se o contrato não existe OU se a sessão não alcança
 * projeção nenhuma (a mesma resposta: a página responde 404 nos dois casos).
 */
export async function dossieDoContratoPara(sessao: Identidade, contratoId: string): Promise<DossieParaTela | null> {
  const prisma = cliente();
  const alcance = await alcanceNoContrato(prisma, sessao.identificador, contratoId);
  if (!alcance.fiscalizacao && !alcance.financeira) return null;
  const base = await acompanhamentoDoContrato(prisma, contratoId, alcance.fiscalizacao ? "FISCALIZACAO" : "FINANCEIRA");
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
    alcance,
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
    designarNoContrato(cliente(), { contratoId, papel: t(c, "papel") as "GESTOR" | "FISCAL" | "RECEBEDOR_DEFINITIVO", usuarioIdentificador: t(c, "usuario"), atoDesignacao: t(c, "ato"), vigenciaInicio: t(c, "inicio"), ...(t(c, "fim") !== "" ? { vigenciaFim: t(c, "fim") } : {}), criadoPor })
  );
  return `Designação de ${t(c, "papel") === "GESTOR" ? "gestor" : t(c, "papel") === "FISCAL" ? "fiscal" : "recebedor definitivo"} registrada. Ela autoriza os atos do papel dentro da vigência, neste contrato.`;
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

// ═══════════════════════════════════════════════════════════════════════════════
// A FISCALIZAÇÃO DA SESSÃO (V7 M2 U0.1) — a lista de trabalho e os administradores
// ═══════════════════════════════════════════════════════════════════════════════

export interface ContratoNaFiscalizacao {
  readonly id: string;
  readonly numero: string;
  readonly objeto: string | null;
  readonly contratado: string;
  readonly vigencia: string;
  readonly papeis: readonly string[];
}

export interface FiscalizacoesDaSessao {
  /** Administrador da fiscalização vigente: vê todos os contratos. */
  readonly administrador: boolean;
  readonly contratos: readonly ContratoNaFiscalizacao[];
}

/**
 * OS CONTRATOS QUE A SESSÃO FISCALIZA — o recorte é o do domínio (`contratosNoAlcanceDaFiscalizacao`): designação
 * vigente hoje, ou todos para o administrador. Nenhum contrato fora do recorte é lido, nem contado.
 */
export async function fiscalizacoesDaSessao(sessao: Identidade): Promise<FiscalizacoesDaSessao> {
  const prisma = cliente();
  const alcance = await contratosNoAlcanceDaFiscalizacao(prisma, sessao.identificador);
  if (!alcance.todos && alcance.ids.length === 0) return { administrador: false, contratos: [] };
  const cs = await prisma.contrato.findMany({
    where: alcance.todos ? {} : { id: { in: [...alcance.ids] } },
    orderBy: { vigenciaInicio: "desc" },
    take: 300,
    select: {
      id: true, numeroContrato: true, objeto: true, contratadoNome: true, vigenciaInicio: true, vigenciaFimInicial: true,
      designacoes: { where: { usuario: { identificador: sessao.identificador } }, select: { papel: true, vigenciaInicio: true, vigenciaFim: true, revogacao: { select: { dataEfeito: true } } } },
    },
  });
  const agora = new Date();
  return {
    administrador: alcance.todos,
    contratos: cs.map((c) => ({
      id: c.id, numero: c.numeroContrato, objeto: c.objeto, contratado: c.contratadoNome,
      vigencia: `${diaCivilBr(c.vigenciaInicio)} a ${diaCivilBr(c.vigenciaFimInicial)} (inicial)`,
      papeis: [...new Set(c.designacoes.filter((d) => designacaoVigenteEm(d, agora)).map((d) => d.papel))].sort(),
    })),
  };
}

export interface AdministradorNaTela {
  readonly id: string;
  readonly nome: string;
  readonly usuario: string;
  readonly ato: string;
  readonly inicio: string;
  readonly fim: string | null;
  readonly revogadaEm: string | null;
  readonly vigenteHoje: boolean;
}

/** As definições de administrador — só para quem tem o poder de DEFINIR; os demais recebem `null`. */
export async function administradoresDaFiscalizacaoPara(): Promise<{ readonly lista: readonly AdministradorNaTela[]; readonly usuarios: readonly { readonly valor: string; readonly rotulo: string }[] } | null> {
  const permitidas = await acoesPermitidas(["DEFINIR_ADMINISTRADOR_DA_FISCALIZACAO"]);
  if (!permitidas.has("DEFINIR_ADMINISTRADOR_DA_FISCALIZACAO")) return null;
  const prisma = cliente();
  const [as, usuarios] = await Promise.all([
    prisma.administradorDaFiscalizacao.findMany({ orderBy: { vigenciaInicio: "desc" }, select: { id: true, atoDesignacao: true, vigenciaInicio: true, vigenciaFim: true, revogacao: { select: { dataEfeito: true } }, usuario: { select: { identificador: true } }, pessoa: { select: { documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } } } }),
    prisma.usuario.findMany({ where: { ativo: true, vinculosDePessoa: { some: {} } }, orderBy: { identificador: "asc" }, take: 500, select: { identificador: true, nome: true } }),
  ]);
  const agora = new Date();
  return {
    lista: as.map((a) => ({
      id: a.id, nome: a.pessoa.versoes[0]?.nome ?? a.pessoa.documento, usuario: a.usuario.identificador, ato: a.atoDesignacao,
      inicio: diaCivilBr(a.vigenciaInicio), fim: a.vigenciaFim === null ? null : diaCivilBr(a.vigenciaFim), revogadaEm: a.revogacao === null ? null : diaCivilBr(a.revogacao.dataEfeito), vigenteHoje: designacaoVigenteEm(a, agora),
    })),
    usuarios: usuarios.map((u) => ({ valor: u.identificador, rotulo: `${u.identificador} — ${u.nome}` })),
  };
}

export async function definirAdministradorNaTela(c: Readonly<Record<string, string>>): Promise<string> {
  await comEscritaAutenticada("DEFINIR_ADMINISTRADOR_DA_FISCALIZACAO", (criadoPor) =>
    definirAdministradorDaFiscalizacao(cliente(), { usuarioIdentificador: t(c, "usuario"), atoDesignacao: t(c, "ato"), vigenciaInicio: t(c, "inicio"), ...(t(c, "fim") !== "" ? { vigenciaFim: t(c, "fim") } : {}), criadoPor })
  );
  return `Administrador da fiscalização definido para ${t(c, "usuario")}. Dentro da vigência ele alcança a fiscalização de qualquer contrato.`;
}

export async function revogarAdministradorNaTela(c: Readonly<Record<string, string>>): Promise<string> {
  await comEscritaAutenticada("DEFINIR_ADMINISTRADOR_DA_FISCALIZACAO", (criadoPor) => revogarAdministradorDaFiscalizacao(cliente(), { administradorId: t(c, "administradorId"), dataEfeito: t(c, "dataEfeito"), motivo: t(c, "motivo"), criadoPor }));
  return "Definição revogada. A partir do efeito, o alcance à fiscalização dos contratos cessa; o que foi feito antes continua registrado.";
}
