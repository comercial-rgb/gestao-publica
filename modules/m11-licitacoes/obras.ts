import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";

/**
 * M11 — OBRAS (TR 4.50). O cadastro, os dois Records fechados e o guard.
 *
 * ═══ O FURO QUE ISTO FECHA ═══
 * O registro L800 do MANAD é "obras e serviços sujeitos à RETENÇÃO PREVIDENCIÁRIA" — e é
 * exatamente ele que a AFPS vem procurar no arquivo. Sem cadastro de obras, ele saía
 * VAZIO (a pendência nomeada em cae5f45): um município que constrói escola entregava à
 * Receita um MANAD sem a parte que interessa à fiscalização.
 */

// ═══════════════════════════════════════════════════════════════════════════
// O GATILHO — e ele é um Record FECHADO, não um `includes`
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ OS ELEMENTOS DE DESPESA QUE **SÃO** OBRA. Hoje: só o 51.
 *
 * 51 — "Obras e Instalações" (literal do seed oficial, `prisma/seed/dados/elementos.ts`).
 *
 * ═══ E POR QUE ISTO É UM RECORD, E NÃO UM `nome.includes("Obra")` ═══
 * ⚠️⚠️ A ARMADILHA ESTÁ NO PRÓPRIO ROL, E ELA É LITERAL: o elemento **37** chama-se
 * **"Locação de Mão-de-Obra"**. Ele tem "Obra" no nome e **não é obra nenhuma** — é
 * locação de PESSOAL. Qualquer derivação por texto o pegaria, e todo empenho de mão de
 * obra passaria a exigir uma matrícula CEI que não existe. O rol oficial diz que o
 * elemento EXISTE; só este Record diz se ele é OBRA.
 *
 * ═══ OS CANDIDATOS QUE FICARAM DE FORA, E POR QUÊ (o precedente do 32) ═══
 *   · 37 "Locação de Mão-de-Obra"              — pessoal, não obra (ver acima).
 *   · 52 "Equipamentos e Material Permanente"  — bem MÓVEL: é o território do
 *     `ClasseDeBens` (TR 4.49), que já tem guard próprio. Uma retroescavadeira não tem
 *     matrícula CEI.
 *   · 39 "Outros Serviços de Terceiros - PJ"   — é AQUI que caem os "serviços sujeitos à
 *     retenção" SEM obra (o tipo 01 do rol da IN 100/2003, avulso). Eles precisam de um
 *     ROL PRÓPRIO (ASTEC), e isso é decisão que ninguém tomou. PENDÊNCIA NOMEADA.
 *
 * Quando o ente disser como trata cada um, ele entra AQUI, numa linha. Enquanto ninguém
 * disser, ele NÃO é obra — e o silêncio não vira regra por descuido. É o mesmo desenho do
 * `ELEMENTOS_DE_ALMOXARIFADO` (M10), que nasceu `{30}` e deixou o 32 de fora pelo mesmo
 * motivo.
 */
export const ELEMENTOS_DE_OBRA: Record<string, true> = {
  "51": true, // Obras e Instalações
};

// ═══════════════════════════════════════════════════════════════════════════
// O ROL DA IN/INSS/DC 100/2003 — colado do leiaute do MANAD (L800, campo 06)
// ═══════════════════════════════════════════════════════════════════════════

export type TipoObraServicoRepo =
  | "SERVICOS_DIVERSOS_SUJEITOS_A_RETENCAO"
  | "TRANSPORTE_DE_PASSAGEIROS_POR_PF"
  | "LIMPEZA_HOSPITALAR"
  | "DEMAIS_LIMPEZAS"
  | "PAVIMENTACAO_ASFALTICA"
  | "TERRAPLANAGEM_ATERRO_SANITARIO_E_DRAGAGEM"
  | "OBRAS_DE_ARTE"
  | "DRENAGEM"
  | "DEMAIS_SERVICOS_DE_CONSTRUCAO_CIVIL_COM_EQUIPAMENTOS"
  | "EDIFICACOES_EM_GERAL";

/**
 * ⚠️ RECORD EXAUSTIVO — o tipo do enum → o CÓDIGO DE 2 DÍGITOS do arquivo.
 *
 * O leiaute é NUMÉRICO (N|002) e os códigos são de NORMA. Um tipo novo no enum do Prisma
 * **não compila** até alguém lhe dar o código aqui — e é esse o ponto: ninguém inventa um
 * código de 2 dígitos para a Receita "no embalo".
 *
 * Rol literal (IN/INSS/DC 100/2003), como está no manual do MANAD.
 */
export const TIP_OBRA_SERVICO: Record<TipoObraServicoRepo, string> = {
  SERVICOS_DIVERSOS_SUJEITOS_A_RETENCAO: "01",
  TRANSPORTE_DE_PASSAGEIROS_POR_PF: "02",
  LIMPEZA_HOSPITALAR: "03",
  DEMAIS_LIMPEZAS: "04",
  PAVIMENTACAO_ASFALTICA: "05",
  TERRAPLANAGEM_ATERRO_SANITARIO_E_DRAGAGEM: "06",
  OBRAS_DE_ARTE: "07",
  DRENAGEM: "08",
  DEMAIS_SERVICOS_DE_CONSTRUCAO_CIVIL_COM_EQUIPAMENTOS: "09",
  EDIFICACOES_EM_GERAL: "10",
};

/** Os nomes do rol, para as mensagens de erro (quem lê o erro vê o rol inteiro). */
export const TIPOS_DE_OBRA: readonly TipoObraServicoRepo[] = Object.keys(
  TIP_OBRA_SERVICO
) as TipoObraServicoRepo[];

// ═══════════════════════════════════════════════════════════════════════════
// O CADASTRO
// ═══════════════════════════════════════════════════════════════════════════

export const zCadastrarObraInput = z.object({
  identificador: z.string().trim().min(1),
  descricao: z.string().trim().min(1),
  /**
   * ⚠️ O ZOD LEVA O ROL NA MENSAGEM. Um tipo fora dele é recusado nomeando os dez — quem
   * digitou vê o que PODIA ter digitado, e não um "invalid enum value" que não ensina nada.
   */
  tipoObraServico: z.enum(TIPOS_DE_OBRA as [TipoObraServicoRepo, ...TipoObraServicoRepo[]], {
    message:
      `Tipo de obra/serviço fora do rol da IN/INSS/DC 100/2003. O rol é FECHADO (é norma, ` +
      `não catálogo do ente) e tem exatamente estes dez: ` +
      TIPOS_DE_OBRA.map((t) => `${TIP_OBRA_SERVICO[t]}-${t}`).join(" · ") +
      `.`,
  }),
  /**
   * ⚠️ 12 dígitos, e NULO É LEGÍTIMO. A obra existe antes da matrícula (o CEI se abre na
   * Receita, e isso leva dias). Exigi-lo aqui obrigaria o ente a INVENTAR um CEI para
   * conseguir empenhar — e um CEI inventado num arquivo da Receita é muito pior do que um
   * campo vazio, que ao menos é honesto.
   */
  cei: z
    .string()
    .trim()
    .regex(/^\d{1,12}$/, "O CEI é numérico e tem no máximo 12 dígitos.")
    .optional(),
  orgaoId: z.string().min(1).optional(),
  criadoPor: z.string().min(1),
});

export type CadastrarObraInput = z.input<typeof zCadastrarObraInput>;

export async function cadastrarObra(
  prisma: PrismaClient,
  input: CadastrarObraInput
): Promise<{ readonly obraId: string }> {
  const d = zCadastrarObraInput.parse(input);
  // ⚠️ SEM UG — E A OBRA TEM `orgaoId`, QUE É A ARMADILHA. Órgão NÃO é unidade gestora: um órgão TEM
  // VÁRIAS UGs, e derivar a unidade a partir dele daria, na prática, poder sobre todas as irmãs dela.
  // A obra fica no escopo do ente. Ver o cabeçalho de `escopo.ts`.
  await autorizarNo(prisma, d.criadoPor, ACAO_DO_SERVICO.cadastrarObra, "ENTE");


  const obra = await prisma.obra.create({
    data: {
      identificador: d.identificador,
      descricao: d.descricao,
      tipoObraServico: d.tipoObraServico,
      cei: d.cei ?? null,
      orgaoId: d.orgaoId ?? null,
      criadoPor: d.criadoPor,
    },
    select: { id: true },
  });
  return { obraId: obra.id };
}
