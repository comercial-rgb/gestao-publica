/**
 * M04 — O EMENTÁRIO DA RECEITA: o cadastro das naturezas de receita do ente.
 *
 * ═══ POR QUE EXISTE ═══
 * `NaturezaReceita` era lida por toda a execução da receita (arrecadação, previsão, PPA, RREO) e
 * não tinha escritor fora de seed e de script: o ente não tinha como cadastrar o IPTU dele. Sem a
 * natureza no cadastro, a guia não se registra (a classificação resolve a natureza pelo código) e
 * os demonstrativos que dependem da base de impostos (Anexos 3, 8 e 12) saem zerados.
 *
 * ═══ O QUE O SERVIÇO GARANTE ═══
 *   · o CÓDIGO passa pelo parser do M04 (`parsearNaturezaReceita`): 8 dígitos, origem do rol da
 *     própria categoria e tipo 0 a 4. Fail-closed — um código que o parser recusa seria uma linha
 *     que nenhum demonstrativo sabe ler;
 *   · a hierarquia pode vir com pontos (1.1.1.8.01.1.1), que é como o ementário oficial a escreve.
 *     Os pontos saem; qualquer outro caractere recusa;
 *   · DUPLICATA recusa nomeando a natureza que já está lá. O `@unique` do banco é a garantia dura
 *     contra a corrida; a conferência antes do INSERT é para a mensagem;
 *   · a descrição é a do ementário do ente, digitada — o serviço não completa nem sugere rótulo.
 *
 * ═══ SEM EDIÇÃO, E ISSO É O MODELO ═══
 * O model não tem versão nem vigência. Reescrever a descrição de uma natureza já usada mudaria,
 * em silêncio, o rótulo de toda receita arrecadada nela. Este serviço só CADASTRA; a correção de
 * rótulo pede versão no model, e fica declarada como pendência (`MODULO.md`).
 *
 * Autorização: `PARAMETRIZAR_ROTEIRO_ORCAMENTARIO`, escopo do ENTE — a justificativa está no
 * `ACAO_DO_SERVICO` do M16.
 */

import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { parsearNaturezaReceita, type NaturezaReceitaDecomposta } from "./natureza.js";

export const zCadastrarNaturezaReceitaInput = z.object({
  codigo: z.string().trim().min(1, "Informe o código da natureza de receita."),
  descricao: z
    .string()
    .trim()
    .min(3, "Informe a descrição da natureza de receita, como consta no ementário do ente.")
    .max(200, "A descrição da natureza de receita tem no máximo 200 caracteres."),
  criadoPor: z.string().min(1),
});
export type CadastrarNaturezaReceitaInput = z.input<typeof zCadastrarNaturezaReceitaInput>;

export interface NaturezaReceitaCadastrada {
  readonly id: string;
  readonly codigo: string;
  readonly descricao: string;
  readonly classificacao: NaturezaReceitaDecomposta;
}

/** "1.1.1.8.01.1.1" -> "11180111". Só dígitos e pontos entram; o resto é recusado nomeando. */
export function normalizarCodigoNaturezaReceita(bruto: string): string {
  const s = bruto.trim();
  if (!/^[\d.]+$/.test(s)) {
    throw new Error(
      `Código de natureza de receita "${bruto}" inválido: use só dígitos, com ou sem pontos ` +
        `(por exemplo 1.1.1.8.01.1.1 ou 11180111). Nada foi gravado.`
    );
  }
  return s.replaceAll(".", "");
}

/** A hierarquia do ementário a partir dos 8 dígitos: c.o.e.d.dd.d.t (1.1.1.8.01.1.1). */
export function hierarquiaDaNaturezaReceita(codigo: string): string {
  if (!/^\d{8}$/.test(codigo)) return codigo;
  return `${codigo[0]}.${codigo[1]}.${codigo[2]}.${codigo[3]}.${codigo.slice(4, 6)}.${codigo[6]}.${codigo[7]}`;
}

export async function cadastrarNaturezaReceita(
  prisma: PrismaClient,
  input: CadastrarNaturezaReceitaInput
): Promise<NaturezaReceitaCadastrada> {
  const lido = zCadastrarNaturezaReceitaInput.safeParse(input);
  if (!lido.success) {
    throw new Error(`${lido.error.issues.map((i) => i.message).join(" ")} Nada foi gravado.`);
  }
  const d = lido.data;

  // ⚠️ A FORMA É CONFERIDA ANTES DA TRANSAÇÃO — e antes da autorização, porque não depende de
  // ninguém: um código malformado é recusado pelo mesmo motivo para qualquer ator.
  const codigo = normalizarCodigoNaturezaReceita(d.codigo);
  let classificacao: NaturezaReceitaDecomposta;
  try {
    classificacao = parsearNaturezaReceita(codigo);
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    throw new Error(`${motivo} Nada foi gravado.`);
  }

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarNaturezaReceita, "ENTE");

    const existente = await tx.naturezaReceita.findUnique({
      where: { codigo },
      select: { descricao: true },
    });
    if (existente !== null) {
      throw new Error(
        `A natureza de receita ${hierarquiaDaNaturezaReceita(codigo)} já está cadastrada no ` +
          `ementário como "${existente.descricao}". Nada foi gravado.`
      );
    }

    try {
      const criada = await tx.naturezaReceita.create({
        data: { codigo, descricao: d.descricao },
        select: { id: true, codigo: true, descricao: true },
      });
      return { ...criada, classificacao };
    } catch (e) {
      // A corrida entre duas abas: a conferência acima não viu, o índice único viu.
      if (typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002") {
        throw new Error(
          `A natureza de receita ${hierarquiaDaNaturezaReceita(codigo)} acabou de ser cadastrada ` +
            `por outra operação. Nada foi gravado.`
        );
      }
      throw e;
    }
  });
}
