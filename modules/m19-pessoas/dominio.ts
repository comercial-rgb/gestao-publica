/**
 * M19 — PESSOAS E CREDORES: o domínio PURO. Zero I/O, zero Prisma.
 *
 * O que mora aqui: a validação do documento (com dígito verificador), a normalização,
 * a derivação do estado vigente a partir das versões, e a derivação dos papéis vigentes
 * a partir dos movimentos. Tudo função pura — é o que permite testá-lo sem banco e é o
 * que impede a tela de reimplementar a regra "só um pouquinho diferente".
 */

import { z } from "zod";
import {
  documentoTemDigitoValido,
  formatarDocumento,
  normalizarDocumento,
  tipoDeDocumento,
} from "../../packages/documento/index.js";

/**
 * ⚠️ A NORMALIZAÇÃO E O DV VÊM DE `packages/documento` — não são reimplementados aqui.
 * `Empenho.credorCpfCnpj` é FK LÓGICA para `Pessoa.documento`, e a FK lógica só se
 * sustenta se os dois lados gravarem a MESMA string. Uma segunda cópia da normalização
 * faria o mesmo fornecedor virar duas pessoas, cada uma com metade do histórico.
 */
export { formatarDocumento, normalizarDocumento };

// ════════════════════════════════════════════════════════════════════════════
// O DOCUMENTO
// ════════════════════════════════════════════════════════════════════════════

export type TipoDePessoa = "FISICA" | "JURIDICA";

/**
 * ⚠️ O DV É CONFERIDO NO CADASTRO DE PESSOAS, E ISSO NÃO É PRECIOSISMO. Um CPF de onze
 * algarismos quaisquer passa em qualquer validação de FORMATO — e vira credor. O dígito
 * verificador é a única coisa que separa "documento" de "onze algarismos", e é ele que
 * impede o erro de digitação de virar um credor novo, com histórico próprio e nenhum dono.
 *
 * O M11 (contratos) deliberadamente NÃO o confere — lá um contratado estrangeiro não tem
 * CPF nem CNPJ. Duas perguntas diferentes sobre o mesmo dado; ver `packages/documento`.
 */
export function documentoValido(documento: string): boolean {
  return documentoTemDigitoValido(documento);
}

export function tipoPeloDocumento(documento: string): TipoDePessoa | null {
  const t = tipoDeDocumento(normalizarDocumento(documento));
  if (t === "CPF") return "FISICA";
  if (t === "CNPJ") return "JURIDICA";
  return null;
}

// ════════════════════════════════════════════════════════════════════════════
// ENTRADA — Zod, fail-closed
// ════════════════════════════════════════════════════════════════════════════

const zDocumento = z
  .string()
  .transform(normalizarDocumento)
  .refine((d) => d.length === 11 || d.length === 14, {
    message: "Documento deve ter 11 dígitos (CPF) ou 14 (CNPJ).",
  })
  .refine(documentoValido, {
    message:
      "Documento inválido: o dígito verificador não confere. " +
      "Confira a digitação — um documento errado cria um credor que não é ninguém.",
  });

const zUf = z
  .string()
  .length(2)
  .transform((s) => s.toUpperCase())
  .optional();

/** CEP não é documento: a função é a mesma, o nome não pode ser. */
const soDigitos = (s: string): string => s.replace(/\D/g, "");

const zCep = z
  .string()
  .transform(soDigitos)
  .refine((s) => s.length === 8, { message: "CEP deve ter 8 dígitos." })
  .optional();

/** Os campos cadastrais — o que uma VERSÃO carrega. */
const camposCadastrais = {
  nome: z.string().trim().min(3, "Nome ou razão social é obrigatório."),
  nomeFantasia: z.string().trim().min(1).optional(),
  email: z.email("E-mail inválido.").optional(),
  telefone: z.string().trim().min(8).optional(),
  logradouro: z.string().trim().min(1).optional(),
  numero: z.string().trim().min(1).optional(),
  complemento: z.string().trim().min(1).optional(),
  bairro: z.string().trim().min(1).optional(),
  municipio: z.string().trim().min(1).optional(),
  uf: zUf,
  cep: zCep,
};

export const zCadastrarPessoa = z
  .object({
    documento: zDocumento,
    ...camposCadastrais,
    criadoPor: z.string().min(1),
  })
  .refine(
    (p) => p.nomeFantasia === undefined || p.documento.length === 14,
    {
      message: "Nome fantasia é atributo de pessoa jurídica.",
      path: ["nomeFantasia"],
    }
  );

export type CadastrarPessoaInput = z.input<typeof zCadastrarPessoa>;
export type CadastrarPessoaDados = z.output<typeof zCadastrarPessoa>;

export const zAlterarPessoa = z.object({
  pessoaId: z.string().min(1),
  ...camposCadastrais,
  ativa: z.boolean(),
  /**
   * ⚠️ OBRIGATÓRIO na alteração, e ausente na criação. Uma versão nova sem motivo é um
   * carimbo — e a timeline vira uma lista de instantes que não explica nada. A primeira
   * versão não precisa: ela não corrige coisa alguma.
   */
  motivo: z.string().trim().min(3, "Diga o que esta alteração corrige."),
  criadoPor: z.string().min(1),
});

export type AlterarPessoaInput = z.input<typeof zAlterarPessoa>;

export const PAPEIS = [
  "CREDOR",
  "CONSIGNATARIO",
  "SERVIDOR",
  "REPRESENTANTE",
] as const;
export type PapelDePessoa = (typeof PAPEIS)[number];

export const zMoverPapel = z.object({
  pessoaId: z.string().min(1),
  papel: z.enum(PAPEIS),
  movimento: z.enum(["CONCEDIDO", "ENCERRADO"]),
  data: z.date(),
  motivo: z.string().trim().min(1).optional(),
  criadoPor: z.string().min(1),
});

export type MoverPapelInput = z.input<typeof zMoverPapel>;

// ════════════════════════════════════════════════════════════════════════════
// DERIVAÇÃO — o estado é função do histórico
// ════════════════════════════════════════════════════════════════════════════

export interface VersaoParaDerivar {
  readonly criadoEm: Date;
  readonly ativa: boolean;
}

/**
 * A versão VIGENTE é a mais recente. Empate de `criadoEm` (mesmo milissegundo) é
 * possível numa carga em lote — desempata pela ordem em que vieram, que é a do índice.
 */
export function versaoVigente<T extends VersaoParaDerivar>(
  versoes: readonly T[]
): T | null {
  if (versoes.length === 0) return null;
  return versoes.reduce((maisNova, v) =>
    v.criadoEm.getTime() >= maisNova.criadoEm.getTime() ? v : maisNova
  );
}

export interface MovimentoParaDerivar {
  readonly papel: PapelDePessoa;
  readonly movimento: "CONCEDIDO" | "ENCERRADO";
  readonly data: Date;
  readonly criadoEm: Date;
}

/**
 * OS PAPÉIS VIGENTES numa data — o último movimento de cada papel ATÉ ela.
 *
 * ⚠️ O CORTE É `data` (a do ATO), e o desempate é `criadoEm`. Dois movimentos do mesmo
 * papel na MESMA data acontecem: concedeu por engano e encerrou no mesmo dia. Quem
 * decide é o que foi REGISTRADO por último — e é por isso que os dois campos existem.
 */
export function papeisVigentesEm(
  movimentos: readonly MovimentoParaDerivar[],
  quando: Date
): readonly PapelDePessoa[] {
  const ultimo = new Map<PapelDePessoa, MovimentoParaDerivar>();

  for (const m of movimentos) {
    if (m.data.getTime() > quando.getTime()) continue;
    const atual = ultimo.get(m.papel);
    if (
      atual === undefined ||
      m.data.getTime() > atual.data.getTime() ||
      (m.data.getTime() === atual.data.getTime() &&
        m.criadoEm.getTime() >= atual.criadoEm.getTime())
    ) {
      ultimo.set(m.papel, m);
    }
  }

  return [...ultimo.entries()]
    .filter(([, m]) => m.movimento === "CONCEDIDO")
    .map(([papel]) => papel)
    .sort();
}

/**
 * ⚠️ CREDOR NÃO É SERVIDOR — e a especificação do ENT01 diz isso em voz alta. Esta
 * função existe para que a pergunta "ele pode ser credor de um empenho?" tenha UMA
 * resposta, no domínio, e não uma checagem repetida em cada tela com um `includes`
 * ligeiramente diferente.
 */
export function podeSerCredorEm(
  movimentos: readonly MovimentoParaDerivar[],
  quando: Date
): boolean {
  return papeisVigentesEm(movimentos, quando).includes("CREDOR");
}
