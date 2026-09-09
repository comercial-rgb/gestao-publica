import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";

/**
 * CADASTRO das linhas dos demonstrativos (M12) — a ÚNICA parte do M12 que grava.
 *
 * E ela não grava FATO: grava PARAMETRIZAÇÃO (o mapeamento linha → contas), como
 * o roteiro contábil do M10. Os RELATÓRIOS continuam sendo leitura pura.
 *
 * ═══ O GUARD QUE JUSTIFICA ESTE ARQUIVO EXISTIR ═══
 * Dois prefixos que se sobrepõem (um contido no outro, ou iguais) em linhas
 * diferentes do MESMO anexo fariam a mesma conta cair em DUAS linhas — e o mesmo
 * dinheiro seria somado duas vezes no Ativo. O balanço fecharia (a conta apareceria
 * dos dois lados do total) e estaria mentindo o dobro.
 *
 * FAIL-CLOSED NA ENTRADA: é aqui que se barra, e não no relatório. (O relatório
 * ainda defende a invariante — um INSERT direto dribla este serviço.)
 */

export const zCadastrarLinhaInput = z.object({
  anexo: z.enum(["ANEXO_14", "ANEXO_15"]),
  codigoLinha: z.string().min(1),
  rotulo: z.string().min(1),
  grupo: z.enum([
    // Anexo 14 (Balanço Patrimonial)
    "ATIVO_CIRCULANTE",
    "ATIVO_NAO_CIRCULANTE",
    "PASSIVO_CIRCULANTE",
    "PASSIVO_NAO_CIRCULANTE",
    "PATRIMONIO_LIQUIDO",
    // Anexo 15 (DVP)
    "VPA",
    "VPD",
  ]),
  ordem: z.number().int(),
  /** Uma conta pertence à linha se o código dela COMEÇA com um destes. */
  prefixos: z.array(z.string().min(1)).min(1, "A linha precisa de ao menos um prefixo"),
  criadoPor: z.string().min(1),
});
export type CadastrarLinhaInput = z.input<typeof zCadastrarLinhaInput>;

/** Um prefixo cobre o outro? (iguais, ou um é começo do outro) */
export function seSobrepoem(a: string, b: string): boolean {
  return a.startsWith(b) || b.startsWith(a);
}

export async function cadastrarLinhaDemonstrativo(
  prisma: PrismaClient,
  input: CadastrarLinhaInput
): Promise<{ readonly linhaId: string }> {
  const dados = zCadastrarLinhaInput.parse(input);

  return prisma.$transaction(async (tx) => {
    // SEM UG: a linha do demonstrativo é PARAMETRIZAÇÃO do ente (o de-para conta -> linha do balanço).
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.cadastrarLinhaDemonstrativo, "ENTE");

    // Sobreposição DENTRO da própria linha nova.
    for (let i = 0; i < dados.prefixos.length; i += 1) {
      for (let j = i + 1; j < dados.prefixos.length; j += 1) {
        if (seSobrepoem(dados.prefixos[i]!, dados.prefixos[j]!)) {
          throw new Error(
            `PREFIXOS SOBREPOSTOS na própria linha ${dados.codigoLinha}: ` +
              `"${dados.prefixos[i]}" e "${dados.prefixos[j]}".`
          );
        }
      }
    }

    // Sobreposição com as linhas JÁ cadastradas do MESMO anexo.
    const existentes = await tx.prefixoDaLinha.findMany({
      where: { linha: { anexo: dados.anexo } },
      select: {
        prefixoConta: true,
        linha: { select: { codigoLinha: true, rotulo: true } },
      },
    });

    for (const novo of dados.prefixos) {
      const choque = existentes.find((e) => seSobrepoem(novo, e.prefixoConta));
      if (choque !== undefined) {
        throw new Error(
          `PREFIXO SOBREPOSTO: "${novo}" (linha ${dados.codigoLinha}) colide com ` +
            `"${choque.prefixoConta}", já mapeado na linha ` +
            `${choque.linha.codigoLinha} (${choque.linha.rotulo}). Uma conta cairia ` +
            `em DUAS linhas, e o mesmo dinheiro entraria duas vezes no balanço.`
        );
      }
    }

    const linha = await tx.linhaDemonstrativo.create({
      data: {
        anexo: dados.anexo,
        codigoLinha: dados.codigoLinha,
        rotulo: dados.rotulo,
        grupo: dados.grupo,
        ordem: dados.ordem,
        criadoPor: dados.criadoPor,
        prefixos: {
          create: dados.prefixos.map((p) => ({
            prefixoConta: p,
            criadoPor: dados.criadoPor,
          })),
        },
      },
      select: { id: true },
    });

    return { linhaId: linha.id };
  });
}
