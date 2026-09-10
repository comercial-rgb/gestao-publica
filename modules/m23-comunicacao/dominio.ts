import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * M23 — COMUNICAÇÃO INTERNA. O domínio PURO: sem Prisma, sem I/O.
 *
 * ═══ ⚠️ AS CAIXAS NÃO SÃO ESTADO, SÃO PONTO DE VISTA ═══
 * Entrada, saída, rascunhos, favoritos e arquivados não são cinco tabelas nem uma
 * coluna `caixa`. O MESMO comunicado está, ao mesmo tempo, na saída de quem enviou e
 * na entrada de quem recebeu — uma coluna teria de valer duas coisas de uma vez.
 *
 * `caixaDoComunicado` abaixo é a função que resolve isso: ela recebe QUEM OLHA e
 * responde onde aquele documento aparece para AQUELA pessoa.
 */

export type Caixa =
  | "RASCUNHO"
  | "SAIDA"
  | "ENTRADA"
  | "ARQUIVADO"
  | "FORA_DA_MINHA_CAIXA";

export type TipoMovimento =
  | "ENVIO"
  | "LEITURA"
  | "ENCAMINHAMENTO"
  | "ARQUIVAMENTO"
  | "DESARQUIVAMENTO"
  | "FAVORITADO"
  | "DESFAVORITADO";

export interface MovimentoParaDerivar {
  readonly tipo: TipoMovimento;
  readonly criadoPor: string;
  readonly setorId?: string | null | undefined;
  readonly criadoEm: Date;
}

export interface ComunicadoParaDerivar {
  readonly criadoPor: string;
  readonly setorRemetenteId: string;
  readonly destinatarios: readonly string[];
  readonly movimentos: readonly MovimentoParaDerivar[];
}

/** Foi enviado? — é a EXISTÊNCIA do movimento `ENVIO`, não uma coluna. */
export function foiEnviado(c: ComunicadoParaDerivar): boolean {
  return c.movimentos.some((m) => m.tipo === "ENVIO");
}

/**
 * ONDE ESTE COMUNICADO APARECE PARA ESTA PESSOA.
 *
 * ⚠️ ARQUIVAMENTO E FAVORITO SÃO POR USUÁRIO. O mesmo documento pode estar arquivado
 * para mim e ativo para você; uma coluna `arquivado` no comunicado o esconderia de todo
 * mundo porque UMA pessoa o arquivou.
 */
export function caixaDoComunicado(
  c: ComunicadoParaDerivar,
  usuarioIdent: string,
  meusSetores: readonly string[]
): Caixa {
  const meus = new Set(meusSetores);
  const enviado = foiEnviado(c);

  const arquivadoPorMim = ultimoDoUsuario(c.movimentos, usuarioIdent, [
    "ARQUIVAMENTO",
    "DESARQUIVAMENTO",
  ]);
  if (arquivadoPorMim === "ARQUIVAMENTO") return "ARQUIVADO";

  // ⚠️ RASCUNHO É DE QUEM O ESCREVE, E DE MAIS NINGUÉM. Um rascunho visível ao setor
  // inteiro seria um documento circulando antes de alguém decidir enviá-lo.
  if (!enviado) {
    return c.criadoPor === usuarioIdent || meus.has(c.setorRemetenteId)
      ? "RASCUNHO"
      : "FORA_DA_MINHA_CAIXA";
  }

  if (c.destinatarios.some((d) => meus.has(d))) return "ENTRADA";
  if (meus.has(c.setorRemetenteId) || c.criadoPor === usuarioIdent) return "SAIDA";
  return "FORA_DA_MINHA_CAIXA";
}

export function ehFavoritoDe(
  c: ComunicadoParaDerivar,
  usuarioIdent: string
): boolean {
  return (
    ultimoDoUsuario(c.movimentos, usuarioIdent, ["FAVORITADO", "DESFAVORITADO"]) ===
    "FAVORITADO"
  );
}

/** O último movimento DAQUELE usuário entre os tipos dados. */
function ultimoDoUsuario(
  movimentos: readonly MovimentoParaDerivar[],
  usuarioIdent: string,
  tipos: readonly TipoMovimento[]
): TipoMovimento | null {
  const meus = movimentos
    .filter((m) => m.criadoPor === usuarioIdent && tipos.includes(m.tipo))
    .sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime());
  return meus[meus.length - 1]?.tipo ?? null;
}

/**
 * OS SETORES JÁ ENVOLVIDOS — remetente + destinatários.
 *
 * ⚠️ É ELE QUE LIMITA A RESPOSTA. Se responder pudesse alcançar qualquer setor,
 * "responder" seria "encaminhar" com outro nome, e o destinatário novo receberia o
 * histórico inteiro sem que ninguém tivesse decidido incluí-lo. Encaminhar é justamente
 * o ato de decidir isso — e ele fica registrado.
 */
export function setoresEnvolvidos(c: ComunicadoParaDerivar): readonly string[] {
  return [...new Set([c.setorRemetenteId, ...c.destinatarios])];
}

/**
 * O CARIMBO DO CONTEÚDO NO ENVIO.
 *
 * ⚠️ ELE EXISTE PORQUE O RASCUNHO É EDITÁVEL. O papel de runtime tem UPDATE em
 * `Comunicado("assunto","corpo")` — é o que um rascunho exige —, e o grant por coluna
 * não sabe dizer "só antes de enviar". Quem diz isso é o caso de uso; e este hash é o
 * que denuncia uma edição feita DEPOIS, que de outro modo seria invisível para quem já
 * leu o documento.
 */
export function hashDoComunicado(assunto: string, corpo: string): string {
  return createHash("sha256").update(`${assunto}\n${corpo}`, "utf8").digest("hex");
}

// ═══════════════════════════════════════════════════════════════════════════
// AS ENTRADAS
// ═══════════════════════════════════════════════════════════════════════════

const texto = (min: number, oQue: string) =>
  z.string().trim().min(min, `${oQue} tem de ter ao menos ${min} caracteres.`);

export const zCriarTipoDeComunicado = z.object({
  codigo: z.string().trim().min(1).max(10),
  nome: texto(3, "O nome do tipo"),
  /** Circular = false. Verificado no caso de uso de `responder`. */
  aceitaResposta: z.boolean().default(true),
  modoDeAssinaturaExigido: z.enum(["SIMPLES", "AVANCADA", "QUALIFICADA"]).optional(),
  /** Vazio = liberado a todos os setores. Ver o schema. */
  setoresAutorizados: z.array(z.string().min(1)).default([]),
  criadoPor: z.string().min(1),
});
export type CriarTipoDeComunicadoInput = z.input<typeof zCriarTipoDeComunicado>;

export const zRascunharComunicado = z.object({
  exercicio: z.number().int().min(1900).max(2200),
  tipoId: z.string().min(1),
  setorRemetenteId: z.string().min(1),
  assunto: texto(3, "O assunto"),
  corpo: texto(10, "O corpo do comunicado"),
  processoId: z.string().min(1).optional(),
  criadoPor: z.string().min(1),
});
export type RascunharComunicadoInput = z.input<typeof zRascunharComunicado>;

export const zEditarRascunho = z.object({
  comunicadoId: z.string().min(1),
  assunto: texto(3, "O assunto"),
  corpo: texto(10, "O corpo do comunicado"),
  criadoPor: z.string().min(1),
});
export type EditarRascunhoInput = z.input<typeof zEditarRascunho>;

export const zEnviarComunicado = z.object({
  comunicadoId: z.string().min(1),
  destinatarios: z
    .array(
      z.object({
        setorId: z.string().min(1),
        /** A/C: destaca para uma pessoa DENTRO do setor. Não restringe o setor. */
        aosCuidadosDe: z.string().min(1).optional(),
      })
    )
    .min(1, "Um comunicado sem destinatário não é comunicado: é anotação."),
  /** Exigida quando o tipo a exige — o caso de uso cobra. */
  modoDeAssinatura: z.enum(["SIMPLES", "AVANCADA", "QUALIFICADA"]).optional(),
  criadoPor: z.string().min(1),
});
export type EnviarComunicadoInput = z.input<typeof zEnviarComunicado>;

export const zResponderComunicado = z.object({
  comunicadoId: z.string().min(1),
  setorRemetenteId: z.string().min(1),
  assunto: texto(3, "O assunto"),
  corpo: texto(10, "O corpo da resposta"),
  criadoPor: z.string().min(1),
});
export type ResponderComunicadoInput = z.input<typeof zResponderComunicado>;

export const zEncaminharComunicado = z.object({
  comunicadoId: z.string().min(1),
  setorDestinoId: z.string().min(1),
  aosCuidadosDe: z.string().min(1).optional(),
  criadoPor: z.string().min(1),
});
export type EncaminharComunicadoInput = z.input<typeof zEncaminharComunicado>;

export const zMarcarLeitura = z.object({
  comunicadoId: z.string().min(1),
  setorId: z.string().min(1).optional(),
  /** "SISTEMA", "APLICATIVO"... O catálogo pede a origem da leitura. */
  origem: z.string().trim().min(1).default("SISTEMA"),
  criadoPor: z.string().min(1),
});
export type MarcarLeituraInput = z.input<typeof zMarcarLeitura>;

export const zMovimentoPessoal = z.object({
  comunicadoId: z.string().min(1),
  criadoPor: z.string().min(1),
});
export type MovimentoPessoalInput = z.input<typeof zMovimentoPessoal>;

export const zEtiquetarComunicado = z.object({
  comunicadoId: z.string().min(1),
  tag: z.string().trim().min(1).max(40),
  criadoPor: z.string().min(1),
});
export type EtiquetarComunicadoInput = z.input<typeof zEtiquetarComunicado>;
