import { z } from "zod";
import { meioDiaCivil } from "../../packages/datas/index.js";
import { travar } from "../../packages/locks/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { escolherConfiguracaoVigente, type ConfiguracaoLida } from "./acesso-a-informacao.js";

/**
 * A PUBLICAÇÃO DA CONFIGURAÇÃO DO ACESSO À INFORMAÇÃO (V11 V5.1).
 *
 * ⚠️ PUBLICAR, NÃO EDITAR. Cada publicação cria uma VERSÃO nova; nenhuma reescreve a anterior.
 * Um `UPDATE` aqui reescreveria o prazo que valia no dia em que um pedido antigo foi protocolado
 * — e a pergunta que o controle interno faz não é "qual é o prazo?" e sim "qual era o prazo
 * NAQUELE dia?". É o mesmo desenho de `VersaoDaConfiguracaoDaCertidao` (M34) e de
 * `DesignacaoNaFolha` (M33), e pela mesma razão.
 *
 * ⚠️ A AÇÃO É PRÓPRIA, e essa decisão precisa aparecer. O censo do M21 diz "CONFIGURAR NÃO É
 * OPERAR" e dá a `CRIAR_ASSUNTO` o poder de fixar prazo de etapa. Este ato é outro: ele declara,
 * com citação de lei, a data que o ente promete a um cidadão que tem direito subjetivo à
 * informação. Quem desenha o fluxo interno de um assunto não é necessariamente quem responde por
 * uma norma — e juntar os dois daria o segundo poder a quem precisa do primeiro.
 */

export const zPublicarConfiguracaoDoAcesso = z
  .object({
    vigenciaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use o dia civil no formato AAAA-MM-DD."),
    prazoDeRespostaEmDias: z.number().int().min(1).max(3650),
    prazoDeProrrogacaoEmDias: z.number().int().min(1).max(3650),
    prorrogacoesPermitidas: z.number().int().min(0).max(10),
    instanciasDeRecurso: z.number().int().min(0).max(10),
    prazoDeRecursoEmDias: z.number().int().min(1).max(3650),
    normaFederal: z
      .string()
      .trim()
      .min(5, "Cite a lei federal e o artigo que fixam o prazo. Sem a citação, o prazo não tem norma."),
    normaFederalPublicadaEm: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use o dia civil no formato AAAA-MM-DD."),
    regulamentacaoLocal: z.string().trim().min(5).nullable(),
    regulamentacaoLocalPublicadaEm: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    observacao: z.string().trim().max(2000).nullable(),
    criadoPor: z.string().min(1),
  })
  .strict()
  // ⚠️ OS DOIS OU NENHUM, e o Zod cobra antes do banco. O CHECK da migration é a rede embaixo;
  // esta é a mensagem que a pessoa lê na tela.
  .refine(
    (d) => (d.regulamentacaoLocal === null) === (d.regulamentacaoLocalPublicadaEm === null),
    "A regulamentação local vem com a data de publicação, ou não vem — uma norma citada sem data não é conferível.",
  );

export type PublicarConfiguracaoDoAcessoInput = z.input<typeof zPublicarConfiguracaoDoAcesso>;

/**
 * O instante que ANCORA um dia civil — as datas de publicação são DIAS, não instantes.
 *
 * ⚠️ ERA `T12:00:00.000Z` (meio-dia em UTC) e passou a ser o meio-dia do FUSO DO ENTE. As duas
 * âncoras são seguras — nenhuma das duas atravessa a virada do dia em conversão —, mas eram DUAS
 * convenções para a mesma coisa no mesmo produto. Os valores que esta função grava
 * (`normaFederalPublicadaEm`, `regulamentacaoLocalPublicadaEm`) são lidos por DIA CIVIL, nunca
 * por igualdade de instante, e por isso as linhas antigas continuam significando o mesmo dia.
 */
const diaComoInstante = (dia: string): Date => meioDiaCivil(dia);

export async function publicarConfiguracaoDoAcesso(
  prisma: PrismaClient,
  input: PublicarConfiguracaoDoAcessoInput,
): Promise<{ readonly versao: number }> {
  const d = zPublicarConfiguracaoDoAcesso.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.publicarConfiguracaoDoAcesso, "ENTE");

    // ⚠️ TRINCO DE TABELA, E ELE FALTAVA (V11 V5.3). Abaixo se lê `MAX(versao)` e se grava
    // `MAX+1`: duas publicações simultâneas leem o mesmo máximo e tentam a mesma versão. O
    // `@unique` em `versao` faz a segunda falhar — fail-closed, mas com violação de índice no
    // lugar de motivo, e sem a conferência de retroatividade contra a versão que realmente
    // passou a ser a última. O id é CONSTANTE de propósito: o que se serializa é a fila de
    // versões, não uma linha.
    await travar(tx, "ConfiguracaoDoAcessoAInformacao", ["fila-de-versoes"]);

    const ultima = await tx.versaoDaConfiguracaoDoAcessoAInformacao.findFirst({
      orderBy: { versao: "desc" },
      select: { versao: true, vigenciaInicio: true },
    });

    // ⚠️ RETROAGIR É PROIBIDO, e a recusa nomeia a versão que impede. Uma configuração que
    // começasse a valer antes da vigente reescreveria, por efeito, o prazo de pedidos já
    // protocolados sob a outra — sem tocar em nenhuma linha deles.
    if (ultima !== null && d.vigenciaInicio < ultima.vigenciaInicio) {
      throw new Error(
        `VIGENCIA-ANTERIOR-A-VERSAO-VIGENTE: a versão ${ultima.versao} vale desde ${ultima.vigenciaInicio}; ` +
          `a nova não pode valer antes. Nada foi gravado.`,
      );
    }

    const versao = (ultima?.versao ?? 0) + 1;
    await tx.versaoDaConfiguracaoDoAcessoAInformacao.create({
      data: {
        versao,
        vigenciaInicio: d.vigenciaInicio,
        prazoDeRespostaEmDias: d.prazoDeRespostaEmDias,
        prazoDeProrrogacaoEmDias: d.prazoDeProrrogacaoEmDias,
        prorrogacoesPermitidas: d.prorrogacoesPermitidas,
        instanciasDeRecurso: d.instanciasDeRecurso,
        prazoDeRecursoEmDias: d.prazoDeRecursoEmDias,
        normaFederal: d.normaFederal,
        normaFederalPublicadaEm: diaComoInstante(d.normaFederalPublicadaEm),
        regulamentacaoLocal: d.regulamentacaoLocal,
        regulamentacaoLocalPublicadaEm:
          d.regulamentacaoLocalPublicadaEm === null ? null : diaComoInstante(d.regulamentacaoLocalPublicadaEm),
        observacao: d.observacao,
        criadoPor: d.criadoPor,
      },
    });
    return { versao };
  });
}

/** Todas as versões publicadas, da mais nova para a mais antiga. Histórico, nunca sobrescrito. */
export async function versoesDaConfiguracaoDoAcesso(prisma: PrismaClient): Promise<readonly ConfiguracaoLida[]> {
  const linhas = await prisma.versaoDaConfiguracaoDoAcessoAInformacao.findMany({ orderBy: { versao: "desc" } });
  return linhas.map((l) => ({
    versao: l.versao,
    vigenciaInicio: l.vigenciaInicio,
    prazoDeRespostaEmDias: l.prazoDeRespostaEmDias,
    prazoDeProrrogacaoEmDias: l.prazoDeProrrogacaoEmDias,
    prorrogacoesPermitidas: l.prorrogacoesPermitidas,
    instanciasDeRecurso: l.instanciasDeRecurso,
    prazoDeRecursoEmDias: l.prazoDeRecursoEmDias,
    normaFederal: l.normaFederal,
    normaFederalPublicadaEm: l.normaFederalPublicadaEm,
    regulamentacaoLocal: l.regulamentacaoLocal,
    regulamentacaoLocalPublicadaEm: l.regulamentacaoLocalPublicadaEm,
    observacao: l.observacao,
  }));
}

/** A configuração vigente no dia civil informado — ou `null`, que é resposta, não falha. */
export async function configuracaoDoAcessoVigente(
  prisma: PrismaClient,
  dia: string,
): Promise<ConfiguracaoLida | null> {
  return escolherConfiguracaoVigente(await versoesDaConfiguracaoDoAcesso(prisma), dia);
}
