import { formatarDocumento } from "../../packages/documento/index.js";
import { diaCivilBr, instanteCivilBr } from "../../packages/datas/index.js";
import { pessoaDoUsuario } from "../../modules/m16-travamento/servico-pessoa-do-usuario.js";
import { representacoesVigentesDoUsuario } from "../../modules/m19-pessoas/representacao.js";
import { lerArquivo, MIMES_ACEITOS, TAMANHO_MAXIMO_BYTES } from "../../modules/m22-documentos/armazenamento.js";
import { movimentosVigentes, situacaoDoProcesso } from "../../modules/m21-protocolo/dominio.js";
import {
  elegibilidadeParaResponderExigencia,
  ROTULO_PARA_REQUERENTE,
  situacaoParaRequerente,
  type CampoDoFormulario,
  type SituacaoParaRequerente,
} from "../../modules/m21-protocolo/carta.js";
import {
  anexarDoRequerente,
  protocolarSolicitacao,
  responderExigenciaDaSolicitacao,
  type SolicitacaoProtocolada,
} from "../../modules/m21-protocolo/servico.js";
import { cliente, PortaSemBancoError } from "./cliente";
import { comEscritaAutenticada, type Identidade } from "./sessao";

/**
 * ═══ A CARTA DE SERVIÇOS (V6.2 P3) — o que o público lê e o que o requerente acompanha ═══
 *
 * Duas audiências, duas projeções, nenhuma é o processo:
 *
 *  · A CARTA é pública: serviços com versão PUBLICADA, requisitos, documentos, prazo com fundamento,
 *    custo quando declarado e as etapas copiadas do roteiro real. Nenhum id interno, nenhum usuário.
 *  · O ACOMPANHAMENTO é do requerente: a porta resolve QUEM ele é pela sessão (vínculo usuário → pessoa)
 *    e pelas representações VIGENTES HOJE. Não há `pessoaId` na entrada — uma solicitação de outra
 *    pessoa responde `null`, igual a uma que não existe (a diferença ensinaria quais existem).
 *
 * ⚠️ O REQUERENTE NÃO VÊ: despacho interno, parecer, fundamento interno da decisão, anexos internos do
 * processo, nome de quem analisa. Vê a situação derivada, as exigências dirigidas a ele (e as próprias
 * respostas), os documentos que ELE enviou, as respostas liberadas pelo ente e a mensagem da decisão.
 *
 * ⚠️ REPRESENTAÇÃO REVOGADA PARA DE VER. A lista e o detalhe perguntam a vigência a cada leitura; o que
 * foi protocolado continua com lastro no banco, mas a conta do ex-representante não o alcança mais.
 */

export { PortaSemBancoError };

const ROTULO_DO_PUBLICO: Readonly<Record<string, string>> = { CIDADAO: "Cidadão", FORNECEDOR: "Fornecedor", SERVIDOR: "Servidor" };
const ROTULO_DO_TIPO: Readonly<Record<string, string>> = {
  REQUERIMENTO_ADMINISTRATIVO: "Requerimento administrativo",
  ATUALIZACAO_CADASTRAL: "Atualização cadastral",
  COMPLEMENTO_DE_FORNECEDOR: "Complemento documental de fornecedor",
  MANIFESTACAO_ANONIMA: "Ouvidoria — manifestação sem conta",
};

export interface EtapaPublicada {
  readonly ordem: number;
  readonly setor: string;
  readonly prazoDias: number | null;
  readonly descricao: string | null;
}

export interface ServicoNaCarta {
  readonly slug: string;
  readonly titulo: string;
  readonly categoria: string;
  readonly publico: string;
  readonly tipo: string;
  readonly resumo: string;
  readonly prazo: string | null;
}

export interface ServicoPublicado extends ServicoNaCarta {
  readonly versao: number;
  readonly publicadaEm: string;
  readonly descricao: string;
  readonly requisitos: string;
  readonly documentos: readonly string[];
  readonly canais: string;
  readonly custo: string | null;
  readonly fundamentoDoPrazo: string | null;
  readonly exigeAutenticacao: boolean;
  readonly etapas: readonly EtapaPublicada[];
  readonly campos: readonly CampoDoFormulario[];
  readonly termoDeAceite: string | null;
  readonly representacaoObrigatoria: boolean;
}

const prazoDe = (v: { prazoDias: number | null }): string | null => (v.prazoDias === null ? null : `${v.prazoDias} dias corridos`);

const VERSAO_PUBLICADA = {
  where: { publicacao: { isNot: null } },
  orderBy: { numero: "desc" as const },
  take: 1,
  select: {
    numero: true, descricao: true, requisitos: true, documentos: true, canais: true, custo: true, prazoDias: true, fundamentoDoPrazo: true,
    exigeAutenticacao: true, campos: true, publicacao: { select: { criadoEm: true, etapas: true } },
  },
};

/** A CARTA — só serviços com versão publicada, por categoria e título. Leitura PÚBLICA. */
export async function lerCartaPublica(filtro: { readonly publico?: string } = {}): Promise<readonly ServicoNaCarta[]> {
  const publico = filtro.publico !== undefined && filtro.publico in ROTULO_DO_PUBLICO ? filtro.publico : undefined;
  const ss = await cliente().servicoDaCarta.findMany({
    where: { versoes: { some: { publicacao: { isNot: null } } }, ...(publico !== undefined ? { publico: publico as never } : {}) },
    orderBy: [{ categoria: "asc" }, { titulo: "asc" }],
    select: { slug: true, titulo: true, categoria: true, publico: true, tipo: true, versoes: VERSAO_PUBLICADA },
  });
  return ss.flatMap((s) => {
    const v = s.versoes[0];
    if (v === undefined) return [];
    return [{ slug: s.slug, titulo: s.titulo, categoria: s.categoria, publico: ROTULO_DO_PUBLICO[s.publico] ?? s.publico, tipo: ROTULO_DO_TIPO[s.tipo] ?? s.tipo, resumo: v.descricao.length > 180 ? `${v.descricao.slice(0, 177)}...` : v.descricao, prazo: prazoDe(v) }];
  });
}

/** O SERVIÇO PUBLICADO — a última versão publicada; rascunho não aparece. Leitura PÚBLICA. */
export async function lerServicoPublicado(slug: string): Promise<ServicoPublicado | null> {
  const s = await cliente().servicoDaCarta.findUnique({
    where: { slug },
    select: { slug: true, titulo: true, categoria: true, publico: true, tipo: true, assunto: { select: { termoDeAceite: true } }, versoes: VERSAO_PUBLICADA },
  });
  const v = s?.versoes[0];
  if (s === null || v === undefined || v.publicacao === null) return null;
  return {
    slug: s.slug, titulo: s.titulo, categoria: s.categoria, publico: ROTULO_DO_PUBLICO[s.publico] ?? s.publico, tipo: ROTULO_DO_TIPO[s.tipo] ?? s.tipo,
    resumo: v.descricao, prazo: prazoDe(v), versao: v.numero, publicadaEm: diaCivilBr(v.publicacao.criadoEm), descricao: v.descricao, requisitos: v.requisitos,
    documentos: v.documentos, canais: v.canais, custo: v.custo, fundamentoDoPrazo: v.fundamentoDoPrazo, exigeAutenticacao: v.exigeAutenticacao,
    etapas: (v.publicacao.etapas as unknown as EtapaPublicada[]) ?? [], campos: (v.campos as unknown as CampoDoFormulario[]) ?? [],
    termoDeAceite: s.assunto.termoDeAceite, representacaoObrigatoria: s.tipo === "COMPLEMENTO_DE_FORNECEDOR",
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// O REQUERENTE — recortado pela sessão
// ═══════════════════════════════════════════════════════════════════════════════

export interface TitularPossivel {
  /** "" = a própria pessoa da conta; senão o id da pessoa REPRESENTADA (conferido de novo na transação). */
  readonly valor: string;
  readonly nome: string;
  readonly documento: string;
  readonly via: "PROPRIO" | "REPRESENTACAO";
}

export interface QuemPede {
  /** `null` = a conta não está vinculada a uma pessoa do cadastro. */
  readonly pessoa: { readonly nome: string; readonly documento: string } | null;
  readonly titulares: readonly TitularPossivel[];
}

async function titularesAlcancaveis(identificador: string): Promise<{ readonly propria: string | null; readonly representadas: ReadonlyMap<string, string> }> {
  const prisma = cliente();
  const [p, reps] = await Promise.all([pessoaDoUsuario(prisma, identificador), representacoesVigentesDoUsuario(prisma, identificador)]);
  return { propria: p?.pessoaId ?? null, representadas: new Map(reps.map((r) => [r.representadaId, r.id])) };
}

/** Em nome de quem esta sessão pode pedir HOJE. */
export async function quemPedePara(sessao: Identidade): Promise<QuemPede> {
  const prisma = cliente();
  const [p, reps] = await Promise.all([pessoaDoUsuario(prisma, sessao.identificador), representacoesVigentesDoUsuario(prisma, sessao.identificador)]);
  const propria = p === null ? null : await prisma.pessoa.findUnique({ where: { id: p.pessoaId }, select: { documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } });
  const titulares: TitularPossivel[] = [];
  if (p !== null && propria !== null) titulares.push({ valor: "", nome: propria.versoes[0]?.nome ?? "", documento: formatarDocumento(propria.documento), via: "PROPRIO" });
  for (const r of reps) titulares.push({ valor: r.representadaId, nome: r.representada, documento: formatarDocumento(r.documento), via: "REPRESENTACAO" });
  return { pessoa: propria === null ? null : { nome: propria.versoes[0]?.nome ?? "", documento: formatarDocumento(propria.documento) }, titulares };
}

export interface SolicitacaoDoRequerente {
  readonly id: string;
  readonly protocolo: string;
  readonly servico: string;
  readonly versao: number;
  readonly titular: string;
  readonly viaRepresentacao: boolean;
  readonly situacao: SituacaoParaRequerente;
  readonly rotuloDaSituacao: string;
  readonly protocoladaEm: string;
}

const SELECAO_DO_REQUERENTE = {
  id: true, titularId: true, representacaoId: true, criadoEm: true, respostas: true,
  titular: { select: { documento: true, versoes: { orderBy: { criadoEm: "desc" as const }, take: 1, select: { nome: true } } } },
  versao: { select: { numero: true, campos: true, prazoDias: true, fundamentoDoPrazo: true, publicacao: { select: { etapas: true } }, servico: { select: { titulo: true, slug: true, tipo: true } } } },
  decisao: { select: { resultado: true, mensagemAoRequerente: true, criadoEm: true } },
  processo: {
    select: {
      numero: true, codigoVerificador: true, exercicio: { select: { ano: true } },
      movimentos: { orderBy: { criadoEm: "asc" as const }, select: { id: true, tipo: true, setorOrigemId: true, setorDestinoId: true, respondeAId: true, tornaSemEfeitoId: true, criadoEm: true, texto: true } },
    },
  },
} as const;

type SolicitacaoLida = NonNullable<Awaited<ReturnType<typeof lerUma>>>;
const lerUma = (id: string) => cliente().solicitacaoDeServico.findUnique({ where: { id }, select: SELECAO_DO_REQUERENTE });

function projetar(s: SolicitacaoLida): SolicitacaoDoRequerente & { readonly exigenciasPendentes: number; readonly fechado: boolean } {
  const vigentes = movimentosVigentes(s.processo.movimentos);
  const respondidas = new Set(vigentes.filter((m) => m.tipo === "READEQUACAO_ATENDIDA").map((m) => m.respondeAId));
  const pendentes = vigentes.filter((m) => m.tipo === "READEQUACAO_SOLICITADA" && !respondidas.has(m.id)).length;
  const situacaoInterna = situacaoDoProcesso(s.processo.movimentos);
  // Qualquer movimento vigente depois do protocolo é o ente agindo sobre o pedido.
  const recebida = vigentes.length > 0;
  const situacao = situacaoParaRequerente({ situacao: situacaoInterna, exigenciasPendentes: pendentes, decisao: s.decisao?.resultado ?? null, recebida });
  return {
    id: s.id, protocolo: `${s.processo.numero}/${s.processo.exercicio.ano}`, servico: s.versao.servico.titulo, versao: s.versao.numero,
    titular: s.titular.versoes[0]?.nome ?? formatarDocumento(s.titular.documento), viaRepresentacao: s.representacaoId !== null,
    situacao, rotuloDaSituacao: ROTULO_PARA_REQUERENTE[situacao], protocoladaEm: diaCivilBr(s.criadoEm), exigenciasPendentes: pendentes,
    fechado: situacaoInterna === "ENCERRADO" || situacaoInterna === "ARQUIVADO" || situacaoInterna === "CANCELADO",
  };
}

/** As solicitações da pessoa da conta e das pessoas que ela representa HOJE. */
export async function minhasSolicitacoesPara(sessao: Identidade): Promise<readonly SolicitacaoDoRequerente[]> {
  const { propria, representadas } = await titularesAlcancaveis(sessao.identificador);
  const titulares = [...(propria === null ? [] : [propria]), ...representadas.keys()];
  if (titulares.length === 0) return [];
  const ids = await cliente().solicitacaoDeServico.findMany({ where: { titularId: { in: titulares } }, orderBy: { criadoEm: "desc" }, take: 200, select: { id: true } });
  const lidas = await Promise.all(ids.map((x) => lerUma(x.id)));
  return lidas.filter((s): s is SolicitacaoLida => s !== null).map((s) => {
    const { exigenciasPendentes: _e, fechado: _f, ...linha } = projetar(s);
    return linha;
  });
}

export interface DetalheParaRequerente extends SolicitacaoDoRequerente {
  readonly codigoVerificador: string;
  readonly slug: string;
  readonly prazo: string | null;
  readonly respostas: readonly { readonly rotulo: string; readonly valor: string }[];
  readonly etapas: readonly EtapaPublicada[];
  readonly exigencias: readonly { readonly id: string; readonly mensagem: string; readonly emitidaEm: string; readonly resposta: { readonly texto: string; readonly em: string } | null }[];
  readonly documentos: readonly { readonly id: string; readonly nome: string; readonly origem: "REQUERENTE" | "RESPOSTA"; readonly tamanho: string; readonly em: string }[];
  readonly decisao: { readonly resultado: "DEFERIDA" | "INDEFERIDA"; readonly mensagem: string; readonly em: string } | null;
  readonly linhaDoTempo: readonly { readonly rotulo: string; readonly em: string }[];
  readonly podeResponder: { readonly pode: true } | { readonly pode: false; readonly motivo: string };
  readonly podeAnexar: boolean;
}

/** O que a linha do tempo do REQUERENTE mostra — sem despacho, parecer nem setor interno. */
const ROTULO_DO_MOVIMENTO_AO_REQUERENTE: Readonly<Record<string, string>> = {
  TRAMITE: "Encaminhada para análise",
  RECEBIMENTO: "Recebida pelo setor responsável",
  READEQUACAO_SOLICITADA: "Exigência emitida para você",
  READEQUACAO_ATENDIDA: "Exigência respondida",
  ENCERRAMENTO: "Solicitação decidida",
  REABERTURA: "Solicitação reaberta",
  ARQUIVAMENTO: "Arquivada",
  CANCELAMENTO: "Cancelada",
};

const tamanho = (b: number): string => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

/** `null` quando a solicitação não existe OU não é da sessão (a mesma resposta, de propósito). */
export async function minhaSolicitacaoPara(sessao: Identidade, id: string): Promise<DetalheParaRequerente | null> {
  const s = await lerUma(id);
  if (s === null) return null;
  const { propria, representadas } = await titularesAlcancaveis(sessao.identificador);
  if (s.titularId !== propria && !representadas.has(s.titularId)) return null;

  const base = projetar(s);
  const vigentes = movimentosVigentes(s.processo.movimentos);
  const campos = (s.versao.campos as unknown as CampoDoFormulario[]) ?? [];
  const respostas = s.respostas as Readonly<Record<string, string>>;
  const textoDe = new Map(s.processo.movimentos.map((m) => [m.id, m.texto]));
  const exigencias = vigentes.filter((m) => m.tipo === "READEQUACAO_SOLICITADA").map((m) => {
    const r = vigentes.find((x) => x.tipo === "READEQUACAO_ATENDIDA" && x.respondeAId === m.id);
    return { id: m.id, mensagem: textoDe.get(m.id) ?? "", emitidaEm: instanteCivilBr(m.criadoEm), resposta: r === undefined ? null : { texto: textoDe.get(r.id) ?? "", em: instanteCivilBr(r.criadoEm) } };
  });
  const anexos = await cliente().anexoDaSolicitacao.findMany({ where: { solicitacaoId: s.id }, orderBy: { criadoEm: "asc" }, select: { origem: true, criadoEm: true, anexo: { select: { id: true, nomeOriginal: true, tamanhoBytes: true } } } });
  const responder = elegibilidadeParaResponderExigencia({ protocolo: base.protocolo, fechado: base.fechado, decidida: s.decisao !== null, exigenciasPendentes: base.exigenciasPendentes, emTramite: false, pareceresPendentes: 0 });
  const { exigenciasPendentes: _e, fechado, ...linha } = base;
  return {
    ...linha,
    codigoVerificador: s.processo.codigoVerificador,
    slug: s.versao.servico.slug,
    prazo: s.versao.prazoDias === null ? null : `${s.versao.prazoDias} dias corridos (${s.versao.fundamentoDoPrazo ?? ""})`,
    respostas: campos.filter((c) => (respostas[c.nome] ?? "") !== "").map((c) => ({ rotulo: c.rotulo, valor: respostas[c.nome] ?? "" })),
    etapas: (s.versao.publicacao?.etapas as unknown as EtapaPublicada[]) ?? [],
    exigencias,
    documentos: anexos.map((a) => ({ id: a.anexo.id, nome: a.anexo.nomeOriginal, origem: a.origem, tamanho: tamanho(a.anexo.tamanhoBytes), em: instanteCivilBr(a.criadoEm) })),
    decisao: s.decisao === null ? null : { resultado: s.decisao.resultado, mensagem: s.decisao.mensagemAoRequerente, em: instanteCivilBr(s.decisao.criadoEm) },
    linhaDoTempo: vigentes.flatMap((m) => {
      const rotulo = ROTULO_DO_MOVIMENTO_AO_REQUERENTE[m.tipo];
      return rotulo === undefined ? [] : [{ rotulo, em: instanteCivilBr(m.criadoEm) }];
    }),
    podeResponder: responder.situacao === "ELEGIVEL" ? { pode: true } : { pode: false, motivo: responder.motivo },
    podeAnexar: s.decisao === null && !fechado,
  };
}

export interface DocumentoEntregue {
  readonly nomeOriginal: string;
  readonly mimeType: string;
  readonly tamanhoBytes: number;
  readonly sha256: string;
  readonly conteudo: Uint8Array;
}

/**
 * O DOCUMENTO DA SOLICITAÇÃO para o requerente: só os que ELE enviou e as respostas liberadas, e só
 * de solicitação que a sessão alcança HOJE. Anexo interno do processo não está em `AnexoDaSolicitacao`
 * e por isso não sai por aqui — nem pedindo o id certo.
 */
export async function documentoDaSolicitacaoPara(sessao: Identidade, solicitacaoId: string, anexoId: string): Promise<DocumentoEntregue | null> {
  const ligacao = await cliente().anexoDaSolicitacao.findUnique({ where: { anexoId }, select: { solicitacaoId: true, solicitacao: { select: { titularId: true } }, anexo: { select: { id: true, nomeOriginal: true, mimeType: true, tamanhoBytes: true, sha256: true } } } });
  if (ligacao === null || ligacao.solicitacaoId !== solicitacaoId) return null;
  const { propria, representadas } = await titularesAlcancaveis(sessao.identificador);
  if (ligacao.solicitacao.titularId !== propria && !representadas.has(ligacao.solicitacao.titularId)) return null;
  const conteudo = await lerArquivo(ligacao.anexo.id, ligacao.anexo.sha256);
  return { nomeOriginal: ligacao.anexo.nomeOriginal, mimeType: ligacao.anexo.mimeType, tamanhoBytes: ligacao.anexo.tamanhoBytes, sha256: ligacao.anexo.sha256, conteudo };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ESCRITA DO REQUERENTE — o `criadoPor` vem da sessão; o titular é conferido na transação
// ═══════════════════════════════════════════════════════════════════════════════

export async function protocolarNaTela(input: { readonly slug: string; readonly representadaId?: string; readonly respostas: Readonly<Record<string, string>>; readonly aceitouTermo: boolean }): Promise<SolicitacaoProtocolada> {
  return comEscritaAutenticada("SOLICITAR_SERVICO", (criadoPor) =>
    protocolarSolicitacao(cliente(), { slug: input.slug, ...(input.representadaId !== undefined ? { representadaId: input.representadaId } : {}), respostas: { ...input.respostas }, aceitouTermo: input.aceitouTermo, criadoPor })
  );
}

export async function responderExigenciaNaTela(input: { readonly solicitacaoId: string; readonly texto: string }): Promise<void> {
  await comEscritaAutenticada("SOLICITAR_SERVICO", (criadoPor) => responderExigenciaDaSolicitacao(cliente(), { ...input, criadoPor }));
}

export const ACEITE_DO_DOCUMENTO = Object.keys(MIMES_ACEITOS).join(",");
export const TETO_DO_DOCUMENTO = TAMANHO_MAXIMO_BYTES;

export async function anexarNaSolicitacaoNaTela(input: { readonly solicitacaoId: string; readonly arquivo: File }): Promise<void> {
  const conteudo = new Uint8Array(await input.arquivo.arrayBuffer());
  await comEscritaAutenticada("SOLICITAR_SERVICO", (criadoPor) =>
    anexarDoRequerente(cliente(), { solicitacaoId: input.solicitacaoId, nomeOriginal: input.arquivo.name, mimeType: input.arquivo.type, conteudo, criadoPor })
  );
}
