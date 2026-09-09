import type {
  ArquivoRemessa,
  Competencia,
  ExportadorTribunal,
  Inconsistencia,
  PacoteExport,
} from "../../../packages/tribunais-core/porta.js";
import type { PrismaClient } from "../../../prisma/generated/client/client.js";
import {
  gerarCadastroContaBancaria,
  gerarDespesaExtra,
  gerarDotacao,
  gerarEmpenhos,
  gerarLiquidacao,
  gerarMovimentacaoEntreContas,
  gerarPagamentos,
  gerarReceitaOrcamentaria,
  gerarRetencao,
  gerarSaldoMensal,
  montarPacote,
  type ArquivoGerado,
} from "./sagres/index.js";

/**
 * ADAPTER TCE-PB — o tribunal da Paraíba, atrás da porta de tribunal.
 *
 * ═══ ⚠️ ESTE ARQUIVO NÃO IMPLEMENTA SAGRES. ELE O ENVELOPA. ═══
 * Toda a lógica de layout, domínio, serialização e empacotamento continua onde sempre esteve
 * (`./sagres/`), byte a byte. O que existe aqui é tradução de vocabulário: `Competencia` da porta
 * vira os parâmetros que os `gerar*` já pediam, e o `PacoteGerado` do SAGRES vira `PacoteExport`.
 * Nenhuma regra fiscal foi reescrita nesta fatia — se alguma tivesse sido, o pacote mudaria de
 * hash, e o hash é justamente o que prova que não mudou.
 */

/** A versão do layout vigente — a MESMA string que a porta SAGRES já carimbava no manifesto. */
export const LAYOUT_VERSAO_TCE_PB = "2026 v1.1 (12/12/2025)";

/**
 * OS PARÂMETROS DE EXPORTAÇÃO que o SAGRES exige e que a COMPETÊNCIA não determina.
 *
 * ⚠️ POR QUE ELES NÃO CABEM NA `Competencia`. UG, CNPJ gerenciador, conta arrecadadora e fonte da
 * despesa extra não são período: são DESIGNAÇÕES do ente para aquela remessa (ver o porquê de cada
 * uma em `ParamsSagres`, na porta SAGRES). Enfiá-los na `Competencia` obrigaria todo tribunal a
 * carregar parâmetros do TCE-PB; inventá-los aqui dentro seria escrever regra nova — o que esta
 * fatia proíbe. Então eles entram por INJEÇÃO, e quem os conhece continua sendo a porta.
 */
export interface DependenciasTcePb {
  readonly prisma: PrismaClient;
  readonly codUnidadeGestora: string;
  readonly cnpjGerenciadora: string;
  readonly codContaArrecadadora: string;
  readonly codFonteRecursoExtra: string;
  /** Injetado (nunca `new Date()` interno) para o pacote ser reproduzível. */
  readonly geradoEm: Date;
}

/**
 * A COMPETÊNCIA MENSAL CANÔNICA — o ÚLTIMO DIA do mês pedido.
 *
 * ⚠️ É A MESMA CONVENÇÃO do `competenciaMensalDe` da porta SAGRES, e tem de continuar sendo: o
 * `lerFatosSaldoMensal` soma o extrato ATÉ o fim do mês. Se o adapter normalizasse diferente da
 * porta, o mesmo mês produziria dois pacotes distintos — exatamente a "segunda verdade" que o
 * projeto recusa em toda parte.
 *
 * ⚠️ `ANUAL` CAI EM DEZEMBRO. O SAGRES não tem remessa anual; pedir o exercício inteiro só faz
 * sentido como "o fechamento", e o fechamento é dezembro. O `switch` é exaustivo de propósito:
 * uma granularidade nova na porta faz o compilador apontar para cá.
 */
function fimDoMes(c: Competencia): Date {
  switch (c.granularidade) {
    case "ANUAL":
      return new Date(Date.UTC(c.exercicio, 12, 0));
    case "MENSAL":
    case "DIARIA":
      return new Date(Date.UTC(c.exercicio, c.mes, 0));
  }
}

/** O dia de referência do pacote DIÁRIO. Sem granularidade diária, cai no último dia do mês. */
function diaDeReferencia(c: Competencia): Date {
  return c.granularidade === "DIARIA"
    ? new Date(Date.UTC(c.exercicio, c.mes - 1, c.dia))
    : fimDoMes(c);
}

/**
 * ⚠️ O SAGRES NÃO TEM MÓDULOS DE IMPORTAÇÃO — e por isso o valor é `NAO_APLICAVEL`, não um chute.
 *
 * `ArquivoRemessa.modulo` existe na porta porque o SIGA (TCM-BA) carrega em cascata e RECUSA
 * remessa fora de ordem. O TCE-PB não tem esse conceito: o pacote SAGRES é um ZIP único, e o que
 * distingue seus arquivos é PERIODICIDADE (diário/mensal), não módulo.
 *
 * Carimbar "INFORMES" aqui seria DADO FALSO — e dado falso sobrevive ao comentário que o explica,
 * porque o comentário não viaja dentro do objeto. `NAO_APLICAVEL` diz a verdade e obriga quem
 * ordena a tratá-la explicitamente. O `ordem` continua sendo só desempate dentro do pacote, e
 * nenhum dos dois campos altera um byte do que o TCE-PB recebe.
 */
function paraArquivoRemessa(a: ArquivoGerado, ordem: number): ArquivoRemessa {
  return {
    nome: a.nome,
    conteudo: a.conteudo,
    registros: a.registros,
    ordem,
    modulo: "NAO_APLICAVEL",
  };
}

/**
 * O EXPORTADOR TCE-PB DE VERDADE — o que delega ao gerador SAGRES existente.
 *
 * ⚠️ `validar` DEVOLVE `[]` NESTA FATIA, E ISSO É DELIBERADO — NÃO É "SEM VALIDAÇÃO". As três
 * camadas de validação (obrigatoriedade, domínio, integridade referencial) seguem VIVAS e seguem
 * rodando onde sempre rodaram: na porta SAGRES, antes de serializar (ver `montarPreviewSagres`).
 * Movê-las para cá nesta fatia significaria executá-las DUAS vezes, ou removê-las de lá — e as
 * duas coisas são mudança de comportamento. Elas sobem para a porta quando o segundo tribunal
 * chegar e houver o que unificar.
 */
export function criarExportadorTcePb(deps: DependenciasTcePb): ExportadorTribunal {
  return {
    codigo: "TCE-PB",
    uf: "PB",
    layoutVersao: LAYOUT_VERSAO_TCE_PB,

    validar: async (): Promise<readonly Inconsistencia[]> => [],

    gerar: async (competencia: Competencia): Promise<PacoteExport> => {
      const { prisma, codUnidadeGestora, cnpjGerenciadora } = deps;
      const mesRef = fimDoMes(competencia);
      const dia = diaDeReferencia(competencia);
      const exercicio = mesRef.getUTCFullYear();

      // A MESMA lista, na MESMA ordem do `baixarPacoteSagres`. A ordem não muda os bytes (o ZIP
      // ordena por nome), mas mantê-la idêntica torna a comparação entre os dois caminhos trivial.
      const arquivos = await Promise.all([
        gerarDotacao(prisma, { codUnidadeGestora, exercicio, competencia: mesRef }),
        gerarEmpenhos(prisma, { codUnidadeGestora, dia }),
        gerarLiquidacao(prisma, { codUnidadeGestora, dia }),
        gerarPagamentos(prisma, { codUnidadeGestora, cnpjGerenciadora, dia }),
        gerarReceitaOrcamentaria(prisma, {
          codUnidadeGestora,
          cnpjGerenciadora,
          codContaArrecadadora: deps.codContaArrecadadora,
          dia,
        }),
        gerarCadastroContaBancaria(prisma, { codUnidadeGestora, cnpjGerenciadora, dia }),
        gerarSaldoMensal(prisma, { codUnidadeGestora, cnpjGerenciadora, competencia: mesRef }),
        gerarMovimentacaoEntreContas(prisma, { codUnidadeGestora, dia }),
        gerarRetencao(prisma, { codUnidadeGestora, dia }),
        gerarDespesaExtra(prisma, {
          codUnidadeGestora,
          cnpjGerenciadora,
          codFonteRecursoExtra: deps.codFonteRecursoExtra,
          dia,
        }),
      ]);

      const mm = String(dia.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(dia.getUTCDate()).padStart(2, "0");
      const pacote = montarPacote(
        {
          layout: LAYOUT_VERSAO_TCE_PB,
          periodicidade: "PACOTE",
          competencia: `${dia.getUTCFullYear()}-${mm}-${dd}`,
          codUnidadeGestora,
        },
        arquivos
      );

      return {
        tribunal: "TCE-PB",
        competencia,
        layoutVersao: LAYOUT_VERSAO_TCE_PB,
        arquivos: arquivos.map((a, i) => paraArquivoRemessa(a, i + 1)),
        hash: pacote.manifesto.hashPacote,
        geradoEm: deps.geradoEm,
        // ⚠️ O ÚNICO VALOR CONSTRUÍVEL. Nada aqui transmite, logo nada aqui pode alegar submissão
        // ou aceitação — os outros valores de `NaturezaPacote` existem para o dia em que houver
        // transporte real, e o compilador apontará onde ligá-los.
        natureza: "FORMATO_OFICIAL_GERADO_E_VALIDADO_LOCALMENTE",
      };
    },
  };
}

/**
 * A ENTRADA DO REGISTRO — a identidade do tribunal, que é o que o `resolverTribunal` precisa.
 *
 * ⚠️ POR QUE O `gerar` DAQUI FALHA NOMEANDO, EM VEZ DE GERAR. Gerar exige um `PrismaClient` e as
 * designações do ente (UG, CNPJ, conta, fonte) — coisas que só existem no contexto de um request,
 * e que ESTA fatia não sabe de onde tirar sem inventar. Inventar (um client global, um valor
 * padrão) seria escrever comportamento novo num PR que promete não mudar nenhum. Então ele para,
 * e diz o que falta e onde está o caminho certo — o mesmo fail-closed do MANAD, que não sai sem o
 * registro 0000 em vez de sair errado.
 *
 * Quem tem as dependências chama `criarExportadorTcePb(deps)`, que gera de verdade.
 */
export const exportador: ExportadorTribunal = {
  codigo: "TCE-PB",
  uf: "PB",
  layoutVersao: LAYOUT_VERSAO_TCE_PB,

  validar: async (): Promise<readonly Inconsistencia[]> => [],

  gerar: (): Promise<PacoteExport> => {
    throw new Error(
      "EXPORTADOR_SEM_DEPENDENCIAS: TCE-PB — o gerador SAGRES precisa do PrismaClient e das " +
        "designações da remessa (codUnidadeGestora, cnpjGerenciadora, codContaArrecadadora, " +
        "codFonteRecursoExtra), que a competência não determina. Use " +
        "`criarExportadorTcePb(deps)` a partir da porta, que é quem as conhece."
    );
  },
};
