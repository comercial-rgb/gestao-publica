import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { diaCivil, instanteCivilBr } from "../../packages/datas/index.js";
import { escopoDoProtocolo, podeAgirNoSetor, recorteDaCaixa } from "../../modules/m21-protocolo/escopo-do-protocolo.js";
import { descreverSituacao, estaFechado, setorAtual, situacaoDoProcesso } from "../../modules/m21-protocolo/dominio.js";
import {
  acompanharManifestacao,
  registrarManifestacaoAnonima,
  responderManifestacao,
  triarManifestacao,
  type AcompanhamentoDaManifestacao,
} from "../../modules/m21-protocolo/servico.js";
import {
  avaliarAtendimento,
  cadastrarMetodologiaDeAvaliacao,
  opinarSobreServico,
  removerAvaliacao,
  resultadoPublicoDasAvaliacoes,
  type ResultadoPublicoDasAvaliacoes,
} from "../../modules/m21-protocolo/avaliacao.js";
import { cliente, PortaSemBancoError } from "./cliente";
import { acoesPermitidas } from "./molde";
import { comEscritaAutenticada, type Identidade } from "./sessao";

/**
 * ═══ A OUVIDORIA SEM CONTA E A AVALIAÇÃO DOS SERVIÇOS (V7 M1 U4) — as portas ═══
 *
 * ATOS PÚBLICOS (sem sessão): registrar manifestação, acompanhar pelo segredo, opinar sobre um serviço.
 * A borda calcula a CHAVE DE QUOTA = sha256(dia civil + origem + finalidade); nem o IP nem o dia chegam
 * ao banco em claro. A origem é o primeiro endereço de `x-forwarded-for`; sem ele, todos os envios sem
 * origem declarada dividem UMA quota (mais restritivo, nunca mais permissivo).
 *
 * ⚠️ NENHUM ANTIABUSO EXTERNO ESTÁ CONECTADO (captcha, reputação de IP). A quota local é o que existe,
 * e as telas dizem isso — não se declara integração que não há.
 * ⚠️ O SEGREDO SÓ ANDA NO CORPO DO POST. Nenhuma rota GET o recebe; as páginas públicas declaram
 * `referrer: no-referrer`; a action não o registra em lugar nenhum.
 * ⚠️ O TOKEN DA OPINIÃO é um cookie httpOnly aleatório do navegador; o banco guarda o sha256. Não é
 * identidade: apagar o cookie permite opinar de novo, e a quota por origem é o limite dessa via.
 */

export { PortaSemBancoError };

const COOKIE_DO_AVALIADOR = "gp_avaliador";

async function chaveDeQuota(finalidade: string): Promise<string> {
  const h = await headers();
  const origem = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "sem-origem-declarada";
  return createHash("sha256").update(`${diaCivil(new Date())}|${origem}|${finalidade}`).digest("hex");
}

export const ROTULO_DO_TIPO_DE_MANIFESTACAO: Readonly<Record<string, string>> = {
  DENUNCIA: "Denúncia",
  RECLAMACAO: "Reclamação",
  SUGESTAO: "Sugestão",
  DUVIDA: "Dúvida",
  ELOGIO: "Elogio",
};

export const OPCOES_DE_TIPO_DE_MANIFESTACAO = Object.entries(ROTULO_DO_TIPO_DE_MANIFESTACAO).map(([valor, rotulo]) => ({ valor, rotulo }));

export const ROTULO_DA_SITUACAO_DA_MANIFESTACAO: Readonly<Record<AcompanhamentoDaManifestacao["situacao"], string>> = {
  RECEBIDA: "Recebida — aguardando triagem da ouvidoria",
  EM_TRIAGEM: "Em análise pela ouvidoria",
  RESPONDIDA: "Respondida — a ouvidoria ainda pode complementar",
  CONCLUIDA: "Concluída",
};

// ═══════════════════════════════════════════════════════════════════════════════
// PÚBLICO
// ═══════════════════════════════════════════════════════════════════════════════

export async function registrarManifestacaoPublica(input: {
  readonly slug: string;
  readonly tipo: string;
  readonly respostas: Readonly<Record<string, string>>;
  readonly contato: string;
  readonly aceitouTermo: boolean;
}): Promise<{ readonly protocolo: string; readonly segredo: string }> {
  return registrarManifestacaoAnonima(cliente(), {
    slug: input.slug,
    tipo: input.tipo as never,
    respostas: { ...input.respostas },
    ...(input.contato.trim() === "" ? {} : { contato: input.contato.trim() }),
    aceitouTermo: input.aceitouTermo,
    chaveDeQuota: await chaveDeQuota("MANIFESTACAO"),
  });
}

/** Os serviços de ouvidoria sem conta publicados — a porta de entrada de `/ouvidoria`. */
export async function lerOuvidoriasPublicadas(): Promise<readonly { readonly slug: string; readonly titulo: string; readonly resumo: string }[]> {
  const ss = await cliente().servicoDaCarta.findMany({
    where: { tipo: "MANIFESTACAO_ANONIMA", versoes: { some: { publicacao: { isNot: null } } } },
    orderBy: { titulo: "asc" },
    select: { slug: true, titulo: true, versoes: { where: { publicacao: { isNot: null } }, orderBy: { numero: "desc" }, take: 1, select: { descricao: true } } },
  });
  return ss.map((s) => ({ slug: s.slug, titulo: s.titulo, resumo: s.versoes[0]?.descricao ?? "" }));
}

export interface AcompanhamentoPublico {
  readonly protocolo: string;
  readonly situacao: AcompanhamentoDaManifestacao["situacao"];
  readonly rotuloDaSituacao: string;
  readonly recebidaEm: string;
  readonly respostas: readonly { readonly texto: string; readonly em: string; readonly conclusiva: boolean }[];
}

export async function acompanharManifestacaoPublica(protocolo: string, segredo: string): Promise<AcompanhamentoPublico | null> {
  const a = await acompanharManifestacao(cliente(), protocolo, segredo);
  if (a === null) return null;
  return {
    protocolo: a.protocolo,
    situacao: a.situacao,
    rotuloDaSituacao: ROTULO_DA_SITUACAO_DA_MANIFESTACAO[a.situacao],
    recebidaEm: instanteCivilBr(a.recebidaEm),
    respostas: a.respostas.map((r) => ({ texto: r.texto, em: instanteCivilBr(r.em), conclusiva: r.conclusiva })),
  };
}

export interface EscalaPublica {
  readonly versao: number;
  readonly minima: number;
  readonly maxima: number;
  readonly rotulos: readonly { readonly nota: number; readonly rotulo: string }[];
}

/** A escala vigente, para o formulário de avaliação (público ou do requerente). `null` = avaliação fechada. */
export async function escalaVigente(): Promise<EscalaPublica | null> {
  const m = await cliente().metodologiaDeAvaliacao.findFirst({ orderBy: { versao: "desc" }, select: { versao: true, escalaMinima: true, escalaMaxima: true, rotulos: true } });
  return m === null ? null : { versao: m.versao, minima: m.escalaMinima, maxima: m.escalaMaxima, rotulos: (m.rotulos as unknown as EscalaPublica["rotulos"]) ?? [] };
}

export interface ResultadoParaTela {
  readonly resultado: ResultadoPublicoDasAvaliacoes;
  readonly periodo: string | null;
}

export async function resultadoDoServicoPublico(slug: string): Promise<ResultadoParaTela | null> {
  const s = await cliente().servicoDaCarta.findFirst({ where: { slug, versoes: { some: { publicacao: { isNot: null } } } }, select: { id: true } });
  if (s === null) return null;
  const resultado = await resultadoPublicoDasAvaliacoes(cliente(), s.id);
  return { resultado, periodo: resultado.situacao === "PUBLICADO" ? `${diaCivilBrCurto(resultado.periodo.de)} a ${diaCivilBrCurto(resultado.periodo.ate)}` : null };
}

const diaCivilBrCurto = (d: Date): string => diaCivil(d).split("-").reverse().join("/");

export async function opinarPublicamente(input: { readonly slug: string; readonly satisfacao: number; readonly atendimento: number; readonly prazos: number; readonly descricao: string }): Promise<{ readonly revisao: boolean }> {
  const jar = await cookies();
  let token = jar.get(COOKIE_DO_AVALIADOR)?.value ?? "";
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) {
    token = randomBytes(32).toString("base64url");
    jar.set(COOKIE_DO_AVALIADOR, token, { httpOnly: true, sameSite: "lax", secure: process.env["NODE_ENV"] === "production", path: "/servicos", maxAge: 60 * 60 * 24 * 365 });
  }
  const r = await opinarSobreServico(cliente(), {
    slug: input.slug, token, satisfacao: input.satisfacao, atendimento: input.atendimento, prazos: input.prazos,
    ...(input.descricao.trim() === "" ? {} : { descricao: input.descricao.trim() }),
    chaveDeQuota: await chaveDeQuota("OPINIAO"),
  });
  return { revisao: r.revisao };
}

// ═══════════════════════════════════════════════════════════════════════════════
// O REQUERENTE — avaliar o atendimento (o acesso à solicitação é conferido na transação)
// ═══════════════════════════════════════════════════════════════════════════════

export interface AvaliacaoDoAtendimento {
  readonly escala: EscalaPublica | null;
  readonly ultima: { readonly satisfacao: number; readonly atendimento: number; readonly prazos: number; readonly em: string; readonly removida: boolean } | null;
}

/** Chamada DEPOIS de `minhaSolicitacaoPara` ter conferido que a solicitação é da sessão. */
export async function avaliacaoDoAtendimento(solicitacaoId: string): Promise<AvaliacaoDoAtendimento> {
  const [escala, ultima] = await Promise.all([
    escalaVigente(),
    cliente().avaliacaoDeServico.findFirst({ where: { chaveDoAvaliador: `sol:${solicitacaoId}`, revisadaPor: { is: null } }, select: { satisfacao: true, atendimento: true, prazos: true, criadoEm: true, remocao: { select: { id: true } } } }),
  ]);
  return { escala, ultima: ultima === null ? null : { satisfacao: ultima.satisfacao, atendimento: ultima.atendimento, prazos: ultima.prazos, em: instanteCivilBr(ultima.criadoEm), removida: ultima.remocao !== null } };
}

export async function avaliarAtendimentoNaTela(input: { readonly solicitacaoId: string; readonly satisfacao: number; readonly atendimento: number; readonly prazos: number; readonly descricao: string }): Promise<{ readonly revisao: boolean }> {
  return comEscritaAutenticada("SOLICITAR_SERVICO", (criadoPor) =>
    avaliarAtendimento(cliente(), { solicitacaoId: input.solicitacaoId, satisfacao: input.satisfacao, atendimento: input.atendimento, prazos: input.prazos, ...(input.descricao.trim() === "" ? {} : { descricao: input.descricao.trim() }), criadoPor })
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// A OUVIDORIA — a mesa das manifestações, recortada pelo escopo do protocolo
// ═══════════════════════════════════════════════════════════════════════════════

export interface ManifestacaoNaMesa {
  readonly id: string;
  readonly protocolo: string;
  readonly tipo: string;
  readonly tipoConfirmado: string | null;
  readonly recebidaEm: string;
  readonly situacao: string;
  readonly fechada: boolean;
  readonly relato: string;
  readonly contato: string | null;
  readonly anotacaoInterna: string | null;
  readonly respostas: readonly { readonly texto: string; readonly em: string; readonly conclusiva: boolean }[];
  readonly processoId: string;
  readonly triar: { readonly pode: true } | { readonly pode: false; readonly motivo: string };
  readonly responder: { readonly pode: true } | { readonly pode: false; readonly motivo: string };
}

/**
 * As manifestações que a sessão ALCANÇA pela regra do protocolo — e, como são sigilosas, isso é
 * participar (lotação na ouvidoria ou movimento). Consulta no ente não basta.
 */
export async function manifestacoesDaOuvidoriaPara(sessao: Identidade): Promise<readonly ManifestacaoNaMesa[]> {
  const prisma = cliente();
  const escopo = await escopoDoProtocolo(prisma, sessao.identificador);
  const recorte = recorteDaCaixa(escopo, sessao.identificador, false);
  if (recorte === null) return [];
  const [lidas, permitidas] = await Promise.all([
    prisma.manifestacaoDeOuvidoria.findMany({
      where: { processo: recorte },
      orderBy: { criadoEm: "desc" },
      take: 200,
      select: {
        id: true, tipo: true, contato: true, criadoEm: true,
        triagem: { select: { tipoConfirmado: true, anotacaoInterna: true } },
        respostas: { orderBy: { criadoEm: "asc" }, select: { texto: true, criadoEm: true, conclusiva: true } },
        processo: { select: { id: true, numero: true, sigiloso: true, textoAbertura: true, setorAberturaId: true, exercicio: { select: { ano: true } }, movimentos: { orderBy: { criadoEm: "asc" }, select: { id: true, tipo: true, setorOrigemId: true, setorDestinoId: true, respondeAId: true, tornaSemEfeitoId: true, criadoEm: true } } } },
      },
    }),
    acoesPermitidas(["TRIAR_MANIFESTACAO_DE_OUVIDORIA"]),
  ]);
  const podeTriarAlgures = permitidas.has("TRIAR_MANIFESTACAO_DE_OUVIDORIA");
  return Promise.all(
    lidas.map(async (m) => {
      const situacao = situacaoDoProcesso(m.processo.movimentos);
      const fechada = estaFechado(situacao);
      const onde = setorAtual(m.processo.setorAberturaId, m.processo.movimentos);
      const agir = podeTriarAlgures && (await podeAgirNoSetor(prisma, sessao.identificador, onde, "TRIAR_MANIFESTACAO_DE_OUVIDORIA", m.processo.sigiloso));
      const concluida = m.respostas.some((r) => r.conclusiva);
      const semAcao = !podeTriarAlgures ? "Seu perfil não tem a triagem da ouvidoria." : "Você não está lotado no setor em que a manifestação está.";
      const triar: ManifestacaoNaMesa["triar"] = !agir ? { pode: false, motivo: semAcao } : fechada ? { pode: false, motivo: `O processo está ${descreverSituacao(situacao).toLowerCase()}.` } : m.triagem !== null ? { pode: false, motivo: "A triagem já foi registrada." } : { pode: true };
      const responder: ManifestacaoNaMesa["responder"] = !agir ? { pode: false, motivo: semAcao } : fechada || concluida ? { pode: false, motivo: "A manifestação já tem resposta conclusiva ou o processo está fechado." } : m.triagem === null ? { pode: false, motivo: "Registre a triagem antes de responder." } : { pode: true };
      return {
        id: m.id,
        protocolo: `${m.processo.numero}/${m.processo.exercicio.ano}`,
        tipo: ROTULO_DO_TIPO_DE_MANIFESTACAO[m.tipo] ?? m.tipo,
        tipoConfirmado: m.triagem === null ? null : (ROTULO_DO_TIPO_DE_MANIFESTACAO[m.triagem.tipoConfirmado] ?? m.triagem.tipoConfirmado),
        recebidaEm: instanteCivilBr(m.criadoEm),
        situacao: concluida ? "Concluída" : m.respostas.length > 0 ? "Respondida" : m.triagem !== null ? "Triada" : "Aguardando triagem",
        fechada,
        relato: m.processo.textoAbertura,
        contato: m.contato,
        anotacaoInterna: m.triagem?.anotacaoInterna ?? null,
        respostas: m.respostas.map((r) => ({ texto: r.texto, em: instanteCivilBr(r.criadoEm), conclusiva: r.conclusiva })),
        processoId: m.processo.id,
        triar,
        responder,
      };
    })
  );
}

export async function triarNaTela(input: { readonly manifestacaoId: string; readonly tipoConfirmado: string; readonly anotacaoInterna: string }): Promise<void> {
  await comEscritaAutenticada("TRIAR_MANIFESTACAO_DE_OUVIDORIA", (criadoPor) => triarManifestacao(cliente(), { manifestacaoId: input.manifestacaoId, tipoConfirmado: input.tipoConfirmado as never, anotacaoInterna: input.anotacaoInterna, criadoPor }));
}

export async function responderNaTela(input: { readonly manifestacaoId: string; readonly texto: string; readonly conclusiva: boolean }): Promise<void> {
  await comEscritaAutenticada("TRIAR_MANIFESTACAO_DE_OUVIDORIA", (criadoPor) => responderManifestacao(cliente(), { ...input, criadoPor }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// A METODOLOGIA E A MODERAÇÃO
// ═══════════════════════════════════════════════════════════════════════════════

export interface MetodologiaNaTela {
  readonly versao: number;
  readonly escala: string;
  readonly rotulos: string;
  readonly descricaoDoMetodo: string;
  readonly periodoMeses: number;
  readonly criadaEm: string;
  readonly avaliacoes: number;
}

export async function metodologiasDaAvaliacao(): Promise<readonly MetodologiaNaTela[]> {
  const ms = await cliente().metodologiaDeAvaliacao.findMany({ orderBy: { versao: "desc" }, select: { versao: true, escalaMinima: true, escalaMaxima: true, rotulos: true, descricaoDoMetodo: true, periodoMeses: true, criadoEm: true, _count: { select: { avaliacoes: true } } } });
  return ms.map((m) => ({
    versao: m.versao, escala: `${m.escalaMinima} a ${m.escalaMaxima}`,
    rotulos: ((m.rotulos as unknown as EscalaPublica["rotulos"]) ?? []).map((r) => `${r.nota} = ${r.rotulo}`).join("; "),
    descricaoDoMetodo: m.descricaoDoMetodo, periodoMeses: m.periodoMeses, criadaEm: instanteCivilBr(m.criadoEm), avaliacoes: m._count.avaliacoes,
  }));
}

export async function cadastrarMetodologiaNaTela(input: { readonly escalaMinima: number; readonly escalaMaxima: number; readonly rotulos: readonly { readonly nota: number; readonly rotulo: string }[]; readonly descricaoDoMetodo: string; readonly periodoMeses: number }): Promise<{ readonly versao: number }> {
  return comEscritaAutenticada("CONFIGURAR_CARTA_DE_SERVICOS", (criadoPor) => cadastrarMetodologiaDeAvaliacao(cliente(), { ...input, rotulos: [...input.rotulos], criadoPor }));
}

export interface AvaliacaoParaModeracao {
  readonly id: string;
  readonly servico: string;
  readonly origem: string;
  readonly notas: string;
  readonly descricao: string | null;
  readonly em: string;
  readonly versaoDaMetodologia: number;
  readonly revisada: boolean;
  readonly remocao: { readonly motivo: string; readonly justificativa: string; readonly em: string } | null;
}

/**
 * A FILA DA MODERAÇÃO — as descrições são PRIVADAS e só chegam aqui, a quem tem a moderação. Quem
 * avaliou não aparece (nem a conta, nem o token).
 */
export async function avaliacoesParaModeracao(): Promise<readonly AvaliacaoParaModeracao[] | null> {
  const permitidas = await acoesPermitidas(["MODERAR_AVALIACAO_DE_SERVICO"]);
  if (!permitidas.has("MODERAR_AVALIACAO_DE_SERVICO")) return null;
  const as = await cliente().avaliacaoDeServico.findMany({
    orderBy: { criadoEm: "desc" },
    take: 200,
    select: { id: true, origem: true, satisfacao: true, atendimento: true, prazos: true, descricao: true, criadoEm: true, servico: { select: { titulo: true } }, metodologia: { select: { versao: true } }, revisadaPor: { select: { id: true } }, remocao: { select: { motivo: true, justificativa: true, criadoEm: true } } },
  });
  return as.map((a) => ({
    id: a.id, servico: a.servico.titulo, origem: a.origem === "ATENDIMENTO_COMPROVADO" ? "Atendimento comprovado" : "Opinião geral",
    notas: `satisfação ${a.satisfacao} · atendimento ${a.atendimento} · prazos ${a.prazos}`, descricao: a.descricao, em: instanteCivilBr(a.criadoEm),
    versaoDaMetodologia: a.metodologia.versao, revisada: a.revisadaPor !== null,
    remocao: a.remocao === null ? null : { motivo: a.remocao.motivo === "ABUSO" ? "Abuso" : "Dado pessoal", justificativa: a.remocao.justificativa, em: instanteCivilBr(a.remocao.criadoEm) },
  }));
}

export async function removerAvaliacaoNaTela(input: { readonly avaliacaoId: string; readonly motivo: string; readonly justificativa: string }): Promise<void> {
  await comEscritaAutenticada("MODERAR_AVALIACAO_DE_SERVICO", (criadoPor) => removerAvaliacao(cliente(), { avaliacaoId: input.avaliacaoId, motivo: input.motivo as never, justificativa: input.justificativa, criadoPor }));
}
