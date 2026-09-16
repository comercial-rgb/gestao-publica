import { diaCivil } from "../../packages/datas/index.js";
import { ambienteDeExecucao } from "../identidade/produto";
import {
  cancelarLancamentoTributario,
  constituirCreditoTributario,
  lancamentosDoLote,
  lotesDeLancamento,
  prepararLoteDeLancamento,
  retificarLancamentoTributario,
  type LancamentoNaTela,
  type LoteNaTela,
} from "../../modules/m34-tributario/lancamento.js";
import {
  configuracaoVigente,
  configurarCertidao,
  decidirCertidao,
  levantarCobertura,
  solicitarCertidao,
  sugestaoDaCobertura,
  type LinhaDaCobertura,
} from "../../modules/m34-tributario/certidao.js";
import { cliente } from "./cliente";
import { acoesPermitidas } from "./molde";
import { comEscritaAutenticada } from "./sessao";

/**
 * ═══ PORTA — O LANÇAMENTO TRIBUTÁRIO E A CERTIDÃO (V10 T2 · N5) ═══
 *
 * ⚠️ NENHUMA REGRA AQUI. Autorização, inconsistência, roteiro contábil ausente, crédito já
 * movimentado, negativa sem cobertura e configuração de validade ausente são recusas do
 * DOMÍNIO (`modules/m34-tributario`). Esta camada traz o que exige servidor — a identidade, o
 * dia civil e o AMBIENTE — e encaminha.
 *
 * ⚠️ O AMBIENTE ENTRA AQUI, e não no domínio: "esta implantação é de avaliação" é fato do
 * processo, não do tributo. Ele vira `semValidadeOficial`, que o domínio CONGELA dentro do
 * documento emitido — um PDF de ambiente de avaliação que circulasse sem a marca seria um
 * documento falso em circulação.
 */

export type Campos = Readonly<Record<string, string>>;
const t = (c: Campos, k: string): string => (c[k] ?? "").trim();

/** `true` fora de produção — o que marca a certidão como sem validade oficial. */
export function semValidadeOficial(): boolean {
  return ambienteDeExecucao() !== "producao";
}

// ── LEITURAS ─────────────────────────────────────────────────────────────────

export interface LotesNaTela {
  readonly lotes: readonly LoteNaTela[];
  readonly podePreparar: boolean;
  readonly podeConstituir: boolean;
  readonly podeCorrigir: boolean;
  readonly hoje: string;
  readonly fontes: readonly { readonly id: string; readonly codigo: string; readonly descricao: string }[];
  readonly imoveis: readonly { readonly id: string; readonly inscricao: string }[];
}

export async function lotesParaTela(): Promise<LotesNaTela> {
  const prisma = cliente();
  const [lotes, permitidas, fontes, imoveis] = await Promise.all([
    lotesDeLancamento(prisma),
    acoesPermitidas([
      "PREPARAR_LANCAMENTO_TRIBUTARIO",
      "CONSTITUIR_CREDITO_TRIBUTARIO",
      "RETIFICAR_LANCAMENTO_TRIBUTARIO",
      "CANCELAR_LANCAMENTO_TRIBUTARIO",
    ]),
    prisma.fonteRecurso.findMany({ orderBy: { codigo: "asc" }, select: { id: true, codigo: true, descricao: true } }),
    // ⚠️ A LISTA DE IMÓVEIS É RECORTADA (200) e ordenada pela inscrição. Um `select` com todos
    // os imóveis de um município é o "formulário bonito e inútil" que a interface deste
    // repositório proíbe — a tela oferece busca, e o descritor declara o recorte.
    prisma.imovel.findMany({ orderBy: { inscricao: "asc" }, take: 200, select: { id: true, inscricao: true } }),
  ]);
  return {
    lotes,
    podePreparar: permitidas.has("PREPARAR_LANCAMENTO_TRIBUTARIO"),
    podeConstituir: permitidas.has("CONSTITUIR_CREDITO_TRIBUTARIO"),
    podeCorrigir:
      permitidas.has("RETIFICAR_LANCAMENTO_TRIBUTARIO") || permitidas.has("CANCELAR_LANCAMENTO_TRIBUTARIO"),
    hoje: diaCivil(new Date()),
    fontes,
    imoveis,
  };
}

export interface LoteAbertoNaTela {
  readonly lote: LoteNaTela;
  readonly lancamentos: readonly LancamentoNaTela[];
  readonly podeConstituir: boolean;
  readonly podeRetificar: boolean;
  readonly podeCancelar: boolean;
}

export async function loteParaTela(loteId: string): Promise<LoteAbertoNaTela | null> {
  const prisma = cliente();
  const [lotes, lancamentos, permitidas] = await Promise.all([
    lotesDeLancamento(prisma),
    lancamentosDoLote(prisma, loteId),
    acoesPermitidas([
      "CONSTITUIR_CREDITO_TRIBUTARIO",
      "RETIFICAR_LANCAMENTO_TRIBUTARIO",
      "CANCELAR_LANCAMENTO_TRIBUTARIO",
    ]),
  ]);
  const lote = lotes.find((l) => l.id === loteId);
  if (lote === undefined) return null;
  return {
    lote,
    lancamentos,
    podeConstituir: permitidas.has("CONSTITUIR_CREDITO_TRIBUTARIO"),
    podeRetificar: permitidas.has("RETIFICAR_LANCAMENTO_TRIBUTARIO"),
    podeCancelar: permitidas.has("CANCELAR_LANCAMENTO_TRIBUTARIO"),
  };
}

export interface CertidoesNaTela {
  readonly solicitacoes: readonly {
    readonly id: string;
    readonly protocolo: string;
    readonly titular: string;
    readonly documento: string;
    readonly imovel: string | null;
    readonly situacao: string;
    readonly tipo: string | null;
    readonly validadeAte: string | null;
    readonly pendencia: string | null;
    readonly criadoEm: Date;
    readonly cobertura: readonly { readonly base: string; readonly situacao: string; readonly detalhe: string }[];
  }[];
  readonly podeSolicitar: boolean;
  readonly podeDecidir: boolean;
  readonly podeConfigurar: boolean;
  readonly configuracao: { readonly validadeEmDias: number; readonly fundamento: string; readonly observacao: string | null } | null;
  readonly hoje: string;
  readonly semValidadeOficial: boolean;
}

export async function certidoesParaTela(): Promise<CertidoesNaTela> {
  const prisma = cliente();
  const hoje = diaCivil(new Date());
  const [lista, permitidas, config] = await Promise.all([
    prisma.solicitacaoDeCertidao.findMany({
      orderBy: { criadoEm: "desc" },
      take: 200,
      select: {
        id: true, protocolo: true, situacao: true, tipo: true, validadeAte: true, pendencia: true, criadoEm: true,
        pessoa: { select: { documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } },
        imovel: { select: { inscricao: true } },
        cobertura: { orderBy: { base: "asc" }, select: { base: true, situacao: true, detalhe: true } },
      },
    }),
    acoesPermitidas(["SOLICITAR_CERTIDAO", "DECIDIR_CERTIDAO", "GERIR_PARAMETROS_TRIBUTARIOS"]),
    configuracaoVigente(prisma, hoje),
  ]);
  return {
    solicitacoes: lista.map((s) => ({
      id: s.id,
      protocolo: s.protocolo,
      titular: s.pessoa.versoes[0]?.nome ?? s.pessoa.documento,
      documento: s.pessoa.documento,
      imovel: s.imovel?.inscricao ?? null,
      situacao: s.situacao,
      tipo: s.tipo,
      validadeAte: s.validadeAte,
      pendencia: s.pendencia,
      criadoEm: s.criadoEm,
      cobertura: s.cobertura,
    })),
    podeSolicitar: permitidas.has("SOLICITAR_CERTIDAO"),
    podeDecidir: permitidas.has("DECIDIR_CERTIDAO"),
    podeConfigurar: permitidas.has("GERIR_PARAMETROS_TRIBUTARIOS"),
    configuracao: config,
    hoje,
    semValidadeOficial: semValidadeOficial(),
  };
}

/** A prévia da cobertura, antes de pedir. LEITURA — não grava solicitação nenhuma. */
export async function previaDaCobertura(
  documento: string
): Promise<{ readonly cobertura: readonly LinhaDaCobertura[]; readonly sugestao: string; readonly pendencia: string | null } | null> {
  const prisma = cliente();
  const pessoa = await prisma.pessoa.findUnique({ where: { documento: documento.replace(/\D/g, "") }, select: { id: true } });
  if (pessoa === null) return null;
  const cobertura = await levantarCobertura(prisma, { pessoaId: pessoa.id, imovelId: null });
  const s = sugestaoDaCobertura(cobertura);
  return { cobertura, sugestao: s.sugestao, pendencia: s.pendencia };
}

/**
 * ⚠️ A CONFERÊNCIA PÚBLICA NÃO MORA AQUI. Ela está em `lib/portas/certidao-publica.ts`, porque a
 * página que a serve vive em `app/(publico)/` e importá-la daqui puxaria `comEscritaAutenticada`
 * — todo o caminho de ESCRITA — para dentro de uma rota sem sessão.
 */

// ── ESCRITAS ─────────────────────────────────────────────────────────────────

export async function prepararLoteNaTela(c: Campos): Promise<string> {
  const imoveisIds = t(c, "imoveisIds").split(",").map((x) => x.trim()).filter((x) => x !== "");
  const vencimentos = t(c, "vencimentos").split(",").map((x) => x.trim()).filter((x) => x !== "");
  const r = await comEscritaAutenticada("PREPARAR_LANCAMENTO_TRIBUTARIO", (criadoPor) =>
    prepararLoteDeLancamento(cliente(), {
      numero: t(c, "numero"),
      tributo: t(c, "tributo") as "IPTU",
      exercicio: Number(t(c, "exercicio")),
      fatoGerador: t(c, "fatoGerador"),
      descricao: t(c, "descricao"),
      naturezaCodigo: t(c, "naturezaCodigo"),
      fonteId: t(c, "fonteId"),
      vencimentos,
      criadoPor,
      imoveisIds,
    })
  );
  const recusas =
    r.recusados.length === 0
      ? ""
      : `\n${r.recusados.length} imóvel(is) recusado(s), e o lote NÃO foi abortado por causa deles:\n` +
        r.recusados.map((x) => `  · ${x.inscricao}: ${x.motivo}`).join("\n");
  return (
    `Lote ${r.numero} preparado: ${r.preparados} lançamento(s), ${r.comInconsistencia} com ` +
    `pendência de revisão. Nada foi constituído — preparar não cria crédito.${recusas}`
  );
}

export async function constituirNaTela(lancamentoId: string): Promise<string> {
  const r = await comEscritaAutenticada("CONSTITUIR_CREDITO_TRIBUTARIO", (criadoPor) =>
    constituirCreditoTributario(cliente(), { lancamentoId, criadoPor })
  );
  return r.novo ? r.detalhe : `${r.detalhe} (nada foi gravado desta vez)`;
}

export async function retificarNaTela(c: Campos): Promise<string> {
  const r = await comEscritaAutenticada("RETIFICAR_LANCAMENTO_TRIBUTARIO", (criadoPor) =>
    retificarLancamentoTributario(cliente(), { lancamentoId: t(c, "__lancamento"), motivo: t(c, "motivo"), criadoPor })
  );
  return r.detalhe;
}

export async function cancelarNaTela(c: Campos): Promise<string> {
  const r = await comEscritaAutenticada("CANCELAR_LANCAMENTO_TRIBUTARIO", (criadoPor) =>
    cancelarLancamentoTributario(cliente(), { lancamentoId: t(c, "__lancamento"), motivo: t(c, "motivo"), criadoPor })
  );
  return r.detalhe;
}

export async function solicitarCertidaoNaTela(c: Campos): Promise<string> {
  const imovelId = t(c, "imovelId");
  const r = await comEscritaAutenticada("SOLICITAR_CERTIDAO", (criadoPor) =>
    solicitarCertidao(cliente(), {
      documento: t(c, "documento").replace(/\D/g, ""),
      ...(imovelId === "" ? {} : { imovelId }),
      criadoPor,
    })
  );
  const semResposta = r.cobertura.filter((x) => x.situacao === "INDISPONIVEL" || x.situacao === "FORA_DO_ALCANCE");
  return (
    `Pedido ${r.protocolo} registrado, em análise. Bases consultadas: ${r.cobertura.length}; ` +
    `sem resposta: ${semResposta.length}.` +
    (r.pendencia === null ? " Nada devido nas bases lidas." : `\n${r.pendencia}`)
  );
}

export async function decidirCertidaoNaTela(c: Campos): Promise<string> {
  const decisao = t(c, "decisao") === "INDEFERIR" ? "INDEFERIR" : "EMITIR";
  const tipo = t(c, "tipo");
  const declaracao = t(c, "declaracaoDeConferencia");
  const motivo = t(c, "motivo");
  const r = await comEscritaAutenticada("DECIDIR_CERTIDAO", (criadoPor) =>
    decidirCertidao(cliente(), {
      solicitacaoId: t(c, "__solicitacao"),
      decisao,
      ...(tipo === "" ? {} : { tipo: tipo as "NEGATIVA" }),
      ...(declaracao === "" ? {} : { declaracaoDeConferencia: declaracao }),
      ...(motivo === "" ? {} : { motivo }),
      semValidadeOficial: semValidadeOficial(),
      criadoPor,
    })
  );
  return r.detalhe;
}

export async function configurarCertidaoNaTela(c: Campos): Promise<string> {
  const observacao = t(c, "observacao");
  const r = await comEscritaAutenticada("GERIR_PARAMETROS_TRIBUTARIOS", (criadoPor) =>
    configurarCertidao(cliente(), {
      vigenciaInicio: t(c, "vigenciaInicio"),
      validadeEmDias: Number(t(c, "validadeEmDias")),
      fundamento: t(c, "fundamento"),
      ...(observacao === "" ? {} : { observacao }),
      criadoPor,
    })
  );
  return `Versão ${r.versao} da configuração de certidão publicada. As certidões já emitidas mantêm a validade com que saíram.`;
}

export type { LancamentoNaTela, LoteNaTela, LinhaDaCobertura };
