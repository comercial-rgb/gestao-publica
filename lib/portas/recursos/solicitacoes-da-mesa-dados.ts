import { preCondicao, type Elegibilidade } from "../../../packages/contracts/index.js";
import { formatarDocumento } from "../../../packages/documento/index.js";
import { diaCivilBr, instanteCivilBr } from "../../../packages/datas/index.js";
import { pessoaDoUsuario } from "../../../modules/m16-travamento/servico-pessoa-do-usuario.js";
import { representacaoVigenteEm, representacoesVigentesDoUsuario } from "../../../modules/m19-pessoas/representacao.js";
import {
  elegibilidadeParaDecidir,
  elegibilidadeParaEmitirExigencia,
  ROTULO_PARA_REQUERENTE,
  situacaoParaRequerente,
  type CampoDoFormulario,
  type EstadoDaSolicitacao,
} from "../../../modules/m21-protocolo/carta.js";
import { podeVerProcesso } from "../../../modules/m21-protocolo/consultas.js";
import { podeAgirNoSetor } from "../../../modules/m21-protocolo/escopo-do-protocolo.js";
import { descreverSituacao, estaFechado, movimentosVigentes, setorAtual, situacaoDoProcesso } from "../../../modules/m21-protocolo/dominio.js";
import { decidirSolicitacao, disponibilizarRespostaDaSolicitacao, emitirExigenciaDaSolicitacao } from "../../../modules/m21-protocolo/servico.js";
import type { ConsultaDoMolde } from "../../molde/consulta.js";
import { TAMANHO_DE_PAGINA } from "../../molde/consulta.js";
import type { DadoDoDetalhe, DisponibilidadeDoRegistro, LinhaDoHistorico, LinhaDoMolde } from "../../molde/tipos.js";
import { cliente, PortaSemBancoError } from "../cliente";
import { apresentar, RegistroMudouError, versaoDoEstado } from "../disponibilidade";
import { comEscritaAutenticada, type Identidade } from "../sessao";
import type { DetalheLido, PaginaDoMolde } from "./dados";

/**
 * A PORTA DA MESA DAS SOLICITAÇÕES (M21, V6.2 P3). Lê e chama; quem decide é o domínio.
 *
 * ⚠️ A VISIBILIDADE É A DO PROCESSO. Cada solicitação passa por `podeVerProcesso` (a regra do M21:
 * setor, sigilo, gestor) — a mesa não inventa uma segunda régua. A tela exige CONSULTAR_PROTOCOLO antes.
 *
 * ⚠️ A DISPONIBILIDADE SOMA TRÊS PERGUNTAS, e nenhuma é permissão (essa é do `permitidas`): o estado
 * da solicitação (predicados de `carta.ts`), a lotação no setor em que o processo está e a autodecisão.
 * A transação refaz as três.
 */
export { PortaSemBancoError };

type Campos = Readonly<Record<string, string>>;
const t = (c: Campos, k: string): string => (c[k] ?? "").trim();

const SELECAO = {
  id: true, titularId: true, respostas: true, criadoEm: true, criadoPor: true,
  titular: { select: { documento: true, versoes: { orderBy: { criadoEm: "desc" as const }, take: 1, select: { id: true, nome: true, nomeFantasia: true, email: true, telefone: true, logradouro: true, numero: true, complemento: true, bairro: true, municipio: true, uf: true, cep: true } } } },
  representacao: { select: { fundamento: true, vigenciaInicio: true, vigenciaFim: true, revogacao: { select: { dataEfeito: true } }, representanteUsuario: { select: { identificador: true, nome: true } } } },
  versao: { select: { numero: true, campos: true, servico: { select: { titulo: true, tipo: true } } } },
  decisao: { select: { resultado: true, mensagemAoRequerente: true, fundamentoInterno: true, versaoDoCadastroId: true, criadoEm: true, criadoPor: true } },
  proposta: { select: { versaoBaseId: true, dados: true } },
  anexos: { orderBy: { criadoEm: "asc" as const }, select: { origem: true, criadoEm: true, criadoPor: true, anexo: { select: { id: true, nomeOriginal: true, tamanhoBytes: true } } } },
  processo: {
    select: {
      id: true, numero: true, sigiloso: true, setorAberturaId: true, exercicio: { select: { ano: true } },
      movimentos: { orderBy: { criadoEm: "asc" as const }, select: { id: true, tipo: true, setorOrigemId: true, setorDestinoId: true, respondeAId: true, tornaSemEfeitoId: true, criadoEm: true, criadoPor: true, texto: true } },
    },
  },
} as const;

const lerUma = (id: string) => cliente().solicitacaoDeServico.findUnique({ where: { id }, select: SELECAO });
type Lida = NonNullable<Awaited<ReturnType<typeof lerUma>>>;

function estadoDe(s: Lida): { readonly estado: EstadoDaSolicitacao; readonly situacaoRequerente: keyof typeof ROTULO_PARA_REQUERENTE; readonly onde: string; readonly situacaoInterna: string } {
  const vigentes = movimentosVigentes(s.processo.movimentos);
  const pendentesDe = (pedido: string, resposta: string): number => {
    const respondidos = new Set(vigentes.filter((m) => m.tipo === resposta).map((m) => m.respondeAId));
    return vigentes.filter((m) => m.tipo === pedido && !respondidos.has(m.id)).length;
  };
  const situacao = situacaoDoProcesso(s.processo.movimentos);
  const exigenciasPendentes = pendentesDe("READEQUACAO_SOLICITADA", "READEQUACAO_ATENDIDA");
  const estado: EstadoDaSolicitacao = {
    protocolo: `${s.processo.numero}/${s.processo.exercicio.ano}`, fechado: estaFechado(situacao), decidida: s.decisao !== null, exigenciasPendentes,
    emTramite: situacao === "EM_TRAMITE", pareceresPendentes: pendentesDe("PARECER_SOLICITADO", "PARECER_RESPONDIDO"),
  };
  return {
    estado,
    situacaoRequerente: situacaoParaRequerente({ situacao, exigenciasPendentes, decisao: s.decisao?.resultado ?? null, recebida: vigentes.length > 0 }),
    onde: setorAtual(s.processo.setorAberturaId, s.processo.movimentos),
    situacaoInterna: descreverSituacao(situacao),
  };
}

const nomeDoTitular = (s: Lida): string => `${s.titular.versoes[0]?.nome ?? ""} (${formatarDocumento(s.titular.documento)})`;

export async function listarSolicitacoesDaMesa(sessao: Identidade, c: ConsultaDoMolde): Promise<PaginaDoMolde & { readonly contagens: readonly { readonly situacao: string; readonly rotulo: string; readonly quantidade: number }[] }> {
  const prisma = cliente();
  const ids = await prisma.solicitacaoDeServico.findMany({ orderBy: { criadoEm: "desc" }, take: 500, select: { id: true, processoId: true } });
  const visiveis = [];
  for (const x of ids) if ((await podeVerProcesso(prisma, x.processoId, sessao.identificador)).pode) visiveis.push(x.id);
  const lidas = (await Promise.all(visiveis.map(lerUma))).filter((s): s is Lida => s !== null);
  const setores = new Map((await prisma.setor.findMany({ select: { id: true, codigo: true, nome: true } })).map((x) => [x.id, `${x.codigo} — ${x.nome}`]));
  const q = (c.filtros["q"] ?? "").trim().toLowerCase();
  const filtroSituacao = (c.filtros["situacao"] ?? "").trim();
  const todas = lidas.map((s) => {
    const e = estadoDe(s);
    return {
      situacao: e.situacaoRequerente,
      linha: {
        id: s.id, protocolo: e.estado.protocolo, servico: `${s.versao.servico.titulo} (v${s.versao.numero})`, titular: nomeDoTitular(s) + (s.representacao === null ? "" : " — por representação"),
        situacao: ROTULO_DA_MESA[e.situacaoRequerente], setor: setores.get(e.onde) ?? e.onde, protocoladaEm: diaCivilBr(s.criadoEm),
      } satisfies LinhaDoMolde,
    };
  });
  const contagens = Object.entries(ROTULO_DA_MESA).map(([situacao, rotulo]) => ({ situacao, rotulo, quantidade: todas.filter((x) => x.situacao === situacao).length }));
  const filtradas = todas.filter((x) => (filtroSituacao === "" || x.situacao === filtroSituacao) && (q === "" || `${x.linha.protocolo} ${x.linha.servico} ${x.linha.titular}`.toLowerCase().includes(q)));
  const inicio = (c.pagina - 1) * TAMANHO_DE_PAGINA;
  return { total: filtradas.length, linhas: filtradas.slice(inicio, inicio + TAMANHO_DE_PAGINA).map((x) => x.linha), contagens };
}

const ROTULO_DA_MESA: Readonly<Record<keyof typeof ROTULO_PARA_REQUERENTE, string>> = {
  RECEBIDA: "Aguardando recebimento",
  EM_ANALISE: "Em análise",
  AGUARDANDO_VOCE: "Aguardando o requerente",
  DEFERIDA: "Deferida",
  INDEFERIDA: "Indeferida",
  ENCERRADA: "Encerrada sem decisão",
};

const ROTULO_DO_CAMPO_CADASTRAL: Readonly<Record<string, string>> = {
  nome: "Nome", nomeFantasia: "Nome fantasia", email: "E-mail", telefone: "Telefone", logradouro: "Logradouro", numero: "Número", complemento: "Complemento",
  bairro: "Bairro", municipio: "Município", uf: "UF", cep: "CEP",
};

export interface DetalheNaMesa extends DetalheLido {
  readonly processoId: string;
  readonly documentos: readonly { readonly id: string; readonly nome: string; readonly origem: string; readonly em: string; readonly por: string }[];
  readonly aceitaResposta: boolean;
}

/** `null` quando não existe OU a sessão não vê o processo (a mesma resposta). */
export async function verSolicitacaoNaMesa(sessao: Identidade, id: string): Promise<DetalheNaMesa | null> {
  const s = await lerUma(id);
  if (s === null || !(await podeVerProcesso(cliente(), s.processo.id, sessao.identificador)).pode) return null;
  const e = estadoDe(s);
  const setor = await cliente().setor.findUnique({ where: { id: e.onde }, select: { codigo: true, nome: true } });
  const campos = (s.versao.campos as unknown as CampoDoFormulario[]) ?? [];
  const respostas = s.respostas as Readonly<Record<string, string>>;
  const atual = s.titular.versoes[0];
  const dados: DadoDoDetalhe[] = [
    { rotulo: "Serviço", valor: `${s.versao.servico.titulo} — versão ${s.versao.numero}`, nota: "Versão do formulário utilizada no pedido." },
    { rotulo: "Titular", valor: nomeDoTitular(s) },
    ...(s.representacao === null
      ? [{ rotulo: "Protocolada por", valor: `${s.criadoPor} (a própria pessoa)` }]
      : [{
          rotulo: "Protocolada por representação",
          valor: `${s.representacao.representanteUsuario.nome} (${s.representacao.representanteUsuario.identificador})`,
          nota: `Fundamento: ${s.representacao.fundamento}. ${representacaoVigenteEm(s.representacao, new Date()) ? "Vigente hoje." : "Não está vigente: o representante não acompanha mais este pedido."}`,
        }]),
    { rotulo: "Situação no processo", valor: e.situacaoInterna, nota: `Situação exibida ao requerente: "${ROTULO_PARA_REQUERENTE[e.situacaoRequerente]}".` },
    { rotulo: "Onde está", valor: setor === null ? e.onde : `${setor.codigo} — ${setor.nome}` },
    { rotulo: "Processo digital", valor: `${e.estado.protocolo}`, nota: "Tramitação, recebimento e pedido de parecer são feitos no processo digital (link abaixo)." },
    ...campos.filter((c) => (respostas[c.nome] ?? "") !== "").map((c) => ({ rotulo: c.rotulo, valor: respostas[c.nome] ?? "", tipo: c.tipo === "textoLongo" ? ("longo" as const) : ("texto" as const) })),
  ];
  if (s.proposta !== null && atual !== undefined) {
    const proposta = s.proposta.dados as Readonly<Record<string, string>>;
    const mudou = s.decisao === null && atual.id !== s.proposta.versaoBaseId;
    dados.push({
      rotulo: "Proposta de alteração do cadastro",
      valor: Object.entries(proposta).map(([k, v]) => `${ROTULO_DO_CAMPO_CADASTRAL[k] ?? k}: ${(atual as Record<string, string | null>)[k] ?? "(vazio)"} → ${v}`).join("\n"),
      tipo: "longo",
      nota: mudou ? "Atenção: o cadastro foi alterado depois do pedido, e o deferimento não será aceito. Emita exigência para o requerente confirmar os dados." : "O cadastro só é alterado com o deferimento.",
    });
  }
  if (s.decisao !== null) {
    dados.push(
      { rotulo: "Decisão", valor: `${s.decisao.resultado === "DEFERIDA" ? "Deferida" : "Indeferida"} em ${instanteCivilBr(s.decisao.criadoEm)} por ${s.decisao.criadoPor}` },
      { rotulo: "Mensagem ao requerente", valor: s.decisao.mensagemAoRequerente, tipo: "longo" },
      { rotulo: "Fundamento interno", valor: s.decisao.fundamentoInterno, tipo: "longo", nota: "Não é mostrado ao requerente." },
    );
  }
  const vigentes = new Set(movimentosVigentes(s.processo.movimentos).map((m) => m.id));
  const historico: LinhaDoHistorico[] = [
    { id: `s-${s.id}`, oQue: "Solicitação protocolada pela carta de serviços", quando: diaCivilBr(s.criadoEm), registradoEm: instanteCivilBr(s.criadoEm), por: s.criadoPor },
    ...s.processo.movimentos.map((m) => ({
      id: m.id,
      oQue: `${ROTULO_DO_MOVIMENTO[m.tipo] ?? m.tipo}${vigentes.has(m.id) ? "" : " (sem efeito)"}`,
      quando: diaCivilBr(m.criadoEm), registradoEm: instanteCivilBr(m.criadoEm), por: m.criadoPor,
      ...(m.texto !== null && m.texto !== "" ? { motivo: m.texto } : {}),
    })),
  ];
  return {
    titulo: `Solicitação ${e.estado.protocolo} — ${s.versao.servico.titulo}`,
    subtitulo: nomeDoTitular(s),
    selos: [{ texto: ROTULO_DA_MESA[e.situacaoRequerente], tom: s.decisao === null ? (e.estado.exigenciasPendentes > 0 ? "alerta" : "neutro") : s.decisao.resultado === "DEFERIDA" ? "ok" : "erro" }],
    dados,
    historico,
    processoId: s.processo.id,
    documentos: s.anexos.map((a) => ({ id: a.anexo.id, nome: a.anexo.nomeOriginal, origem: a.origem === "REQUERENTE" ? "enviado pelo requerente" : "resposta do ente", em: instanteCivilBr(a.criadoEm), por: a.criadoPor })),
    aceitaResposta: !e.estado.fechado,
  };
}

const ROTULO_DO_MOVIMENTO: Readonly<Record<string, string>> = {
  TRAMITE: "Tramitado", RECEBIMENTO: "Recebido", COMPLEMENTO: "Complemento", PARECER_SOLICITADO: "Parecer solicitado", PARECER_RESPONDIDO: "Parecer respondido",
  READEQUACAO_SOLICITADA: "Exigência emitida ao requerente", READEQUACAO_ATENDIDA: "Exigência respondida pelo requerente", PARALISACAO: "Paralisado",
  ENCERRAMENTO: "Encerrado (decisão)", ARQUIVAMENTO: "Arquivado", REABERTURA: "Reaberto", CANCELAMENTO: "Cancelado", ALTERACAO: "Alterado", TORNADO_SEM_EFEITO: "Movimento tornado sem efeito",
};

async function ehTitularOuRepresentante(identificador: string, titularId: string): Promise<boolean> {
  const prisma = cliente();
  const [p, reps] = await Promise.all([pessoaDoUsuario(prisma, identificador), representacoesVigentesDoUsuario(prisma, identificador)]);
  return p?.pessoaId === titularId || reps.some((r) => r.representadaId === titularId);
}

function versaoDe(s: Lida): string {
  return versaoDoEstado([s.processo.movimentos.map((m) => m.id), s.decisao?.criadoEm.toISOString() ?? null, s.titular.versoes[0]?.id ?? null]);
}

export async function disponibilidadeDaSolicitacao(sessao: Identidade, id: string): Promise<DisponibilidadeDoRegistro | null> {
  const s = await lerUma(id);
  if (s === null) return null;
  const e = estadoDe(s);
  const [lotado, titular] = await Promise.all([podeAgirNoSetor(cliente(), sessao.identificador, e.onde, "DECIDIR_SOLICITACAO_DE_SERVICO", s.processo.sigiloso), ehTitularOuRepresentante(sessao.identificador, s.titularId)]);
  const comAtor = (base: Elegibilidade, ato: string): Elegibilidade => {
    if (base.situacao !== "ELEGIVEL") return base;
    if (!lotado) return preCondicao("SEM-LOTACAO-NO-SETOR", `O processo desta solicitação está em outro setor, no qual você não está lotado.`, `Esta ação cabe a quem trabalha no setor em que o processo está. Solicite a lotação ou encaminhe pelo processo digital.`);
    return base;
  };
  const decidir = comAtor(elegibilidadeParaDecidir(e.estado), "decide");
  return {
    versao: versaoDe(s),
    porAcao: {
      "emitir-exigencia": apresentar(comAtor(elegibilidadeParaEmitirExigencia(e.estado), "emite exigência")),
      decidir: apresentar(decidir.situacao === "ELEGIVEL" && titular ? preCondicao("AUTODECISAO", "Você é o titular desta solicitação, ou representa o titular.", "Outra pessoa da mesa decide.") : decidir),
    },
  };
}

export async function acaoDaSolicitacao(acao: string, id: string, c: Campos): Promise<string> {
  const versaoDoFormulario = t(c, "__versao");
  if (versaoDoFormulario !== "") {
    const atual = await lerUma(id);
    if (atual !== null && versaoDe(atual) !== versaoDoFormulario) throw new RegistroMudouError("Esta solicitação");
  }
  if (acao === "emitir-exigencia") {
    await comEscritaAutenticada("DECIDIR_SOLICITACAO_DE_SERVICO", (criadoPor) => emitirExigenciaDaSolicitacao(cliente(), { solicitacaoId: id, mensagemAoRequerente: t(c, "mensagemAoRequerente"), criadoPor }));
    return "Exigência emitida. O requerente foi avisado no sistema e a solicitação aguarda a resposta dele.";
  }
  if (acao === "decidir") {
    const r = await comEscritaAutenticada("DECIDIR_SOLICITACAO_DE_SERVICO", (criadoPor) =>
      decidirSolicitacao(cliente(), { solicitacaoId: id, resultado: t(c, "resultado") as "DEFERIDA" | "INDEFERIDA", mensagemAoRequerente: t(c, "mensagemAoRequerente"), fundamentoInterno: t(c, "fundamentoInterno"), criadoPor })
    );
    return `Solicitação ${t(c, "resultado") === "DEFERIDA" ? "deferida" : "indeferida"} e processo encerrado.${r.versaoDoCadastro === null ? "" : " O cadastro da pessoa foi atualizado conforme a proposta."} O requerente foi avisado.`;
  }
  throw new Error(`Ação desconhecida: ${acao}. Nada foi gravado.`);
}

export async function disponibilizarRespostaNaTela(input: { readonly solicitacaoId: string; readonly arquivo: File }): Promise<void> {
  const conteudo = new Uint8Array(await input.arquivo.arrayBuffer());
  await comEscritaAutenticada("DECIDIR_SOLICITACAO_DE_SERVICO", (criadoPor) =>
    disponibilizarRespostaDaSolicitacao(cliente(), { solicitacaoId: input.solicitacaoId, nomeOriginal: input.arquivo.name, mimeType: input.arquivo.type, conteudo, criadoPor })
  );
}
