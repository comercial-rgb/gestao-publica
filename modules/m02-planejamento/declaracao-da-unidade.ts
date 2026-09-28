import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { diaCivil } from "../../packages/datas/index.js";
import { documentoTemDigitoValido, normalizarDocumento } from "../../packages/documento/index.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";

/**
 * ═══ A DECLARAÇÃO DA UNIDADE ORÇAMENTÁRIA PARA A PRESTAÇÃO DE CONTAS (V21) ═══
 *
 * O que o Tribunal de Contas pede da unidade (SAGRES §4.1) e o modelo não tinha: a natureza jurídica,
 * o secretário responsável (nome e CPF) e o ato que o nomeou. A unidade em si continua como estava —
 * código, descrição e órgão.
 *
 * ⚠️ VERSIONADA. O secretário muda, e o arquivo de um mês passado tem de sair com quem estava no cargo
 * naquele mês. Cada declaração é um fato com a data desde quando vale; nada é sobrescrito. A vigente
 * num corte é a de maior `vigenteDesde` até o corte — empate no mesmo dia: a gravada por último, que
 * é como se corrige um erro de digitação sem apagar o que foi dito antes.
 *
 * ⚠️ NASCE EXPORTÁVEL. O nome vai a um campo de 60 caracteres que proíbe aspas; o CPF, a um numérico
 * de 11. O que não cabe é recusado aqui, e não no dia da remessa.
 */

export type NaturezaJuridicaDaUnidade =
  | "CAMARA_MUNICIPAL"
  | "PREFEITURA_OU_SECRETARIA"
  | "AUTARQUIA"
  | "FUNDACAO"
  | "SOCIEDADE_DE_ECONOMIA_MISTA"
  | "FUNDO"
  | "EMPRESA_PUBLICA"
  | "AUTARQUIA_PREVIDENCIARIA"
  | "FUNDO_PREVIDENCIARIO";
export type AtoDeNomeacao = "LEI" | "DECRETO" | "PORTARIA" | "OUTROS";

export const NATUREZAS_JURIDICAS: readonly NaturezaJuridicaDaUnidade[] = [
  "CAMARA_MUNICIPAL",
  "PREFEITURA_OU_SECRETARIA",
  "AUTARQUIA",
  "FUNDACAO",
  "SOCIEDADE_DE_ECONOMIA_MISTA",
  "FUNDO",
  "EMPRESA_PUBLICA",
  "AUTARQUIA_PREVIDENCIARIA",
  "FUNDO_PREVIDENCIARIO",
];
export const ATOS_DE_NOMEACAO: readonly AtoDeNomeacao[] = ["LEI", "DECRETO", "PORTARIA", "OUTROS"];

export const zDeclararDadosDaUnidade = z.object({
  unidadeOrcId: z.string().min(1),
  naturezaJuridica: z.enum(NATUREZAS_JURIDICAS as unknown as [NaturezaJuridicaDaUnidade, ...NaturezaJuridicaDaUnidade[]]),
  nomeSecretario: z
    .string()
    .trim()
    .min(3, "Informe o nome do secretário responsável.")
    .max(60, "O nome do secretário vai à prestação de contas em até 60 caracteres. Abrevie o nome do meio.")
    .refine((n) => !/["'\u0000-\u001f]/.test(n), "O nome não pode ter aspas, apóstrofo nem quebra de linha."),
  cpfSecretario: z
    .string()
    .transform((c) => normalizarDocumento(c))
    .refine((c) => /^\d{11}$/.test(c) && documentoTemDigitoValido(c), "CPF do secretário inválido (confira os dígitos)."),
  atoDeNomeacao: z.enum(ATOS_DE_NOMEACAO as unknown as [AtoDeNomeacao, ...AtoDeNomeacao[]]),
  vigenteDesde: z.coerce.date(),
  criadoPor: z.string().min(1),
});
export type DeclararDadosDaUnidadeInput = z.input<typeof zDeclararDadosDaUnidade>;

export async function declararDadosDaUnidade(
  prisma: PrismaClient,
  input: DeclararDadosDaUnidadeInput
): Promise<{ readonly declaracaoId: string; readonly unidadeCodigo: string; readonly vigenteDesde: string }> {
  const d = zDeclararDadosDaUnidade.parse(input);
  return prisma.$transaction(async (tx) => {
    // SEM UG: os dados da unidade são cadastro do ENTE (quem responde por ela), não um ato de execução
    // dentro dela — o mesmo corte do cadastro do plano.
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.declararDadosDaUnidade, "ENTE");
    const unidade = await tx.unidadeOrcamentaria.findUnique({
      where: { id: d.unidadeOrcId },
      select: { id: true, codigo: true },
    });
    if (unidade === null) throw new Error("Unidade orçamentária não encontrada. Nada foi gravado.");
    const criada = await tx.declaracaoDaUnidadeOrcamentaria.create({
      data: {
        unidadeOrcId: unidade.id,
        naturezaJuridica: d.naturezaJuridica,
        nomeSecretario: d.nomeSecretario,
        cpfSecretario: d.cpfSecretario,
        atoDeNomeacao: d.atoDeNomeacao,
        vigenteDesde: d.vigenteDesde,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { declaracaoId: criada.id, unidadeCodigo: unidade.codigo, vigenteDesde: diaCivil(d.vigenteDesde) };
  });
}

export interface DeclaracaoVigente {
  readonly naturezaJuridica: NaturezaJuridicaDaUnidade;
  readonly nomeSecretario: string;
  readonly cpfSecretario: string;
  readonly atoDeNomeacao: AtoDeNomeacao;
  readonly vigenteDesde: Date;
  readonly criadoPor: string;
}

/**
 * A declaração vigente num corte — ou `null`: a unidade ainda não foi declarada até ali.
 *
 * ⚠️ PELO DIA CIVIL, NÃO PELO INSTANTE. A declaração vale desde um DIA (ancorado ao meio-dia civil);
 * comparar instantes deixava a declaração de hoje "no futuro" para qualquer consulta feita de manhã —
 * medido no percurso: a troca de secretário gravada às 11h não aparecia como vigente.
 */
export function vigenteNoCorte<T extends { readonly vigenteDesde: Date; readonly criadoEm: Date }>(
  declaracoes: readonly T[],
  corte: Date
): T | null {
  let melhor: T | null = null;
  for (const x of declaracoes) {
    if (diaCivil(x.vigenteDesde) > diaCivil(corte)) continue;
    if (
      melhor === null ||
      diaCivil(x.vigenteDesde) > diaCivil(melhor.vigenteDesde) ||
      (diaCivil(x.vigenteDesde) === diaCivil(melhor.vigenteDesde) && x.criadoEm.getTime() > melhor.criadoEm.getTime())
    ) {
      melhor = x;
    }
  }
  return melhor;
}

export interface UnidadeComDeclaracao {
  readonly id: string;
  readonly codigo: string;
  readonly descricao: string;
  readonly orgaoCodigo: string;
  readonly vigente: DeclaracaoVigente | null;
  /** Quantas declarações a unidade já teve — o histórico existe mesmo quando a tela mostra só a vigente. */
  readonly declaracoes: number;
}

/** A leitura da tela: todas as unidades, com a declaração vigente HOJE (ou nenhuma). Não muta. */
export async function unidadesComDeclaracao(
  prisma: PrismaClient,
  p: { readonly corte: Date }
): Promise<readonly UnidadeComDeclaracao[]> {
  const unidades = await prisma.unidadeOrcamentaria.findMany({
    orderBy: { codigo: "asc" },
    select: {
      id: true,
      codigo: true,
      descricao: true,
      orgao: { select: { codigo: true } },
      declaracoes: {
        select: {
          naturezaJuridica: true,
          nomeSecretario: true,
          cpfSecretario: true,
          atoDeNomeacao: true,
          vigenteDesde: true,
          criadoEm: true,
          criadoPor: true,
        },
      },
    },
  });
  return unidades.map((u) => {
    const v = vigenteNoCorte(u.declaracoes, p.corte);
    return {
      id: u.id,
      codigo: u.codigo,
      descricao: u.descricao,
      orgaoCodigo: u.orgao.codigo,
      declaracoes: u.declaracoes.length,
      vigente:
        v === null
          ? null
          : {
              naturezaJuridica: v.naturezaJuridica,
              nomeSecretario: v.nomeSecretario,
              cpfSecretario: v.cpfSecretario,
              atoDeNomeacao: v.atoDeNomeacao,
              vigenteDesde: v.vigenteDesde,
              criadoPor: v.criadoPor,
            },
    };
  });
}
