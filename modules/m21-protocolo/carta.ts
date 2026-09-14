import { z } from "zod";
import { ELEGIVEL, naoAplicavel, preCondicao, type Elegibilidade } from "../../packages/contracts/index.js";
import type { SituacaoDoProcesso } from "./dominio.js";

/**
 * ═══ M21 — A CARTA DE SERVIÇOS: o formulário, as respostas e o que o requerente vê — MOTOR PURO ═══
 *
 * ⚠️ O FORMULÁRIO É VOCABULÁRIO FECHADO. Cinco tipos de campo, nome e rótulo — nada de expressão,
 * condição avaliada ou URL. O que a carta pede é o que o caso de uso confere: as respostas são
 * validadas contra os campos DA VERSÃO em que o pedido foi feito, e a versão não muda depois.
 *
 * ⚠️ ATUALIZAÇÃO CADASTRAL SÓ PEDE CAMPOS DO CADASTRO. Um formulário de atualização com um campo
 * "renda" produziria uma proposta que o caso de uso de Pessoa não sabe aplicar — e a decisão de
 * deferir descobriria isso tarde demais. O cadastro da versão recusa.
 *
 * ⚠️ O REQUERENTE VÊ UMA PROJEÇÃO, não o processo. A situação que ele lê é derivada dos movimentos
 * (recebida, em análise, aguardando você, deferida, indeferida), sem despacho interno, sem parecer e
 * sem o nome de quem analisa.
 */

export const TIPOS_DE_CAMPO = ["texto", "textoLongo", "data", "email", "telefone"] as const;
export type TipoDeCampoDaCarta = (typeof TIPOS_DE_CAMPO)[number];

export const zCampoDoFormulario = z.object({
  nome: z.string().regex(/^[a-z][a-zA-Z0-9]{1,40}$/, "nome do campo: letras e dígitos, começando por minúscula"),
  rotulo: z.string().trim().min(2).max(120),
  tipo: z.enum(TIPOS_DE_CAMPO),
  obrigatorio: z.boolean(),
});
export type CampoDoFormulario = z.infer<typeof zCampoDoFormulario>;

/** Os campos que uma proposta cadastral pode carregar — os que o caso de uso de Pessoa versiona. */
export const CAMPOS_DO_CADASTRO = ["nome", "nomeFantasia", "email", "telefone", "logradouro", "numero", "complemento", "bairro", "municipio", "uf", "cep"] as const;

export type TipoDeServico = "REQUERIMENTO_ADMINISTRATIVO" | "ATUALIZACAO_CADASTRAL" | "COMPLEMENTO_DE_FORNECEDOR" | "MANIFESTACAO_ANONIMA";

/** A NATUREZA do serviço decide a entrada: autenticada (age em nome de uma pessoa) ou sem conta (ouvidoria anônima). */
export const exigeContaPorNatureza = (tipo: TipoDeServico): boolean => tipo !== "MANIFESTACAO_ANONIMA";

/** Os problemas da definição do formulário. Vazio = consistente. */
export function errosDosCampos(tipo: TipoDeServico, campos: unknown): readonly string[] {
  const r = z.array(zCampoDoFormulario).min(1, "o formulário precisa de ao menos um campo").max(30).safeParse(campos);
  if (!r.success) return r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  const e: string[] = [];
  const nomes = new Set<string>();
  for (const c of r.data) {
    if (nomes.has(c.nome)) e.push(`o campo "${c.nome}" está repetido`);
    nomes.add(c.nome);
    if (tipo === "ATUALIZACAO_CADASTRAL" && !(CAMPOS_DO_CADASTRO as readonly string[]).includes(c.nome)) {
      e.push(`"${c.nome}" não é campo do cadastro de pessoa — a atualização cadastral só propõe ${CAMPOS_DO_CADASTRO.join(", ")}`);
    }
  }
  return e;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const TELEFONE = /^[\d\s()+-]{8,20}$/;

/** As respostas validadas contra os campos. Texto vazio de campo opcional some; desconhecido recusa. */
export function validarRespostas(campos: readonly CampoDoFormulario[], respostas: Readonly<Record<string, string>>): { readonly ok: Readonly<Record<string, string>> } | { readonly erros: readonly string[] } {
  const erros: string[] = [];
  const ok: Record<string, string> = {};
  const conhecidos = new Set(campos.map((c) => c.nome));
  for (const k of Object.keys(respostas)) if (!conhecidos.has(k)) erros.push(`"${k}" não é campo deste formulário`);
  for (const c of campos) {
    const v = (respostas[c.nome] ?? "").trim();
    if (v === "") {
      if (c.obrigatorio) erros.push(`${c.rotulo}: obrigatório`);
      continue;
    }
    const max = c.tipo === "textoLongo" ? 5000 : 300;
    if (v.length > max) erros.push(`${c.rotulo}: no máximo ${max} caracteres`);
    if (c.tipo === "email" && !EMAIL.test(v)) erros.push(`${c.rotulo}: e-mail inválido`);
    if (c.tipo === "data" && !DATA.test(v)) erros.push(`${c.rotulo}: data no formato AAAA-MM-DD`);
    if (c.tipo === "telefone" && !TELEFONE.test(v)) erros.push(`${c.rotulo}: telefone inválido`);
    ok[c.nome] = v;
  }
  return erros.length > 0 ? { erros } : { ok };
}

/** O texto de abertura do processo — as respostas na ordem do formulário, com o rótulo. */
export function textoDeAbertura(titulo: string, versao: number, campos: readonly CampoDoFormulario[], respostas: Readonly<Record<string, string>>): string {
  const linhas = campos.filter((c) => (respostas[c.nome] ?? "") !== "").map((c) => `${c.rotulo}: ${respostas[c.nome]}`);
  return `Solicitação pela carta de serviços — ${titulo} (versão ${versao}).\n${linhas.join("\n")}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// O QUE O REQUERENTE VÊ
// ═══════════════════════════════════════════════════════════════════════════════

export type SituacaoParaRequerente = "RECEBIDA" | "EM_ANALISE" | "AGUARDANDO_VOCE" | "DEFERIDA" | "INDEFERIDA" | "ENCERRADA";

export function situacaoParaRequerente(e: { readonly situacao: SituacaoDoProcesso; readonly exigenciasPendentes: number; readonly decisao: "DEFERIDA" | "INDEFERIDA" | null; readonly recebida: boolean }): SituacaoParaRequerente {
  if (e.decisao !== null) return e.decisao;
  if (e.situacao === "ENCERRADO" || e.situacao === "ARQUIVADO" || e.situacao === "CANCELADO") return "ENCERRADA";
  if (e.exigenciasPendentes > 0) return "AGUARDANDO_VOCE";
  return e.recebida ? "EM_ANALISE" : "RECEBIDA";
}

export const ROTULO_PARA_REQUERENTE: Readonly<Record<SituacaoParaRequerente, string>> = {
  RECEBIDA: "Protocolada — aguardando recebimento pelo setor",
  EM_ANALISE: "Em análise",
  AGUARDANDO_VOCE: "Aguardando você — há exigência a responder",
  DEFERIDA: "Deferida",
  INDEFERIDA: "Indeferida",
  ENCERRADA: "Encerrada",
};

// ═══════════════════════════════════════════════════════════════════════════════
// OS ATOS SOBRE A SOLICITAÇÃO — o mesmo predicado na tela e no caso de uso
// ═══════════════════════════════════════════════════════════════════════════════

export interface EstadoDaSolicitacao {
  readonly protocolo: string;
  readonly fechado: boolean;
  readonly decidida: boolean;
  readonly exigenciasPendentes: number;
  /** Trâmite sem recebimento: o setor de destino ainda não tem o processo em mãos. */
  readonly emTramite: boolean;
  readonly pareceresPendentes: number;
}

const EM_TRAMITE = (e: EstadoDaSolicitacao) => preCondicao("SOLICITACAO-EM-TRAMITE", `A solicitação ${e.protocolo} foi tramitada e ainda não foi recebida.`, "Receba o processo no setor antes de agir sobre ele.");

export function elegibilidadeParaEmitirExigencia(e: EstadoDaSolicitacao): Elegibilidade {
  if (e.decidida || e.fechado) return naoAplicavel("SOLICITACAO-ENCERRADA", `A solicitação ${e.protocolo} já foi decidida ou encerrada.`);
  if (e.emTramite) return EM_TRAMITE(e);
  if (e.exigenciasPendentes > 0) return preCondicao("EXIGENCIA-PENDENTE", `A solicitação ${e.protocolo} já tem exigência sem resposta.`, "Aguarde o requerente responder antes de emitir outra.");
  return ELEGIVEL;
}

export function elegibilidadeParaDecidir(e: EstadoDaSolicitacao): Elegibilidade {
  if (e.decidida) return naoAplicavel("SOLICITACAO-JA-DECIDIDA", `A solicitação ${e.protocolo} já foi decidida.`);
  if (e.fechado) return naoAplicavel("SOLICITACAO-ENCERRADA", `O processo da solicitação ${e.protocolo} está encerrado.`);
  if (e.emTramite) return EM_TRAMITE(e);
  if (e.exigenciasPendentes > 0) return preCondicao("EXIGENCIA-PENDENTE", `A solicitação ${e.protocolo} tem exigência sem resposta do requerente.`, "Decidir agora ignoraria o que foi pedido a ele; aguarde a resposta.");
  if (e.pareceresPendentes > 0) return preCondicao("PARECER-PENDENTE", `A solicitação ${e.protocolo} tem parecer pedido e não respondido.`, "Aguarde o parecer ou torne o pedido sem efeito, com motivo.");
  return ELEGIVEL;
}

export function elegibilidadeParaResponderExigencia(e: EstadoDaSolicitacao): Elegibilidade {
  if (e.decidida || e.fechado) return naoAplicavel("SOLICITACAO-ENCERRADA", `A solicitação ${e.protocolo} já foi decidida ou encerrada.`);
  if (e.exigenciasPendentes === 0) return naoAplicavel("SEM-EXIGENCIA-PENDENTE", `Não há exigência a responder na solicitação ${e.protocolo}.`);
  return ELEGIVEL;
}
