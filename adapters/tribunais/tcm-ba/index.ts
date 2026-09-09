import type {
  ArquivoRemessa,
  Competencia,
  ExportadorTribunal,
  Inconsistencia,
  PacoteExport,
} from "../../../packages/tribunais-core/porta.js";
import type { PrismaClient } from "../../../prisma/generated/client/client.js";
import { createHash } from "node:crypto";
import { montarArquivo, ENCODING_SIGA } from "./siga/writer.js";
import { SPECS_CAMINHO_CRITICO, SPEC_EMPENHO, ehGeravel } from "./siga/specs/index.js";
import { granularidadeSuportada, validarMassaSiga, type MassaParaValidar } from "./validar.js";

/**
 * ADAPTER TCM-BA — o Tribunal de Contas dos Municípios da Bahia, via SIGA.
 *
 * ═══ ⚠️ NÃO HOMOLOGADO. NÃO É "PRONTO PARA PRODUÇÃO". ═══
 * As specs vêm do manual "SIGA – Arquivos de Importação – Versão 44" (fev/2014), obtido de FONTE
 * SECUNDÁRIA e tratado como referência ESTRUTURAL, não normativa. Nenhum arquivo gerado por este
 * adapter foi submetido ao validador oficial do TCM-BA. Ver `README.md` para a lista do que está
 * confirmado e do que é suposição.
 *
 * O que ESTÁ garantido: a geometria de cada spec é conferida programaticamente (soma das larguras
 * × `totalBytes`, contiguidade, sequencial nos 10 últimos bytes), e o writer é fail-closed em todo
 * caminho de erro. O que NÃO está: que o TCM aceite o resultado.
 */

export const CODIGO_TCM_BA = "TCM-BA";
export const UF_TCM_BA = "BA";

/**
 * ⚠️ A VERSÃO É A DA TRANSCRIÇÃO, NÃO A DO LAYOUT DO HEADER.
 *
 * `layoutVersao` identifica CONTRA O QUE as specs foram escritas — "v44-2014", o documento. O
 * campo "Versão do layout" do header do arquivo recebe `1` (ver `VERSAO_LAYOUT_SIGA` no writer),
 * que é outra coisa. Confundir os dois é o erro que o manual convida a cometer.
 */
export const LAYOUT_VERSAO_TCM_BA = "v44-2014";

/** As dependências que o SIGA exige e que a competência não determina. */
export interface DependenciasTcmBa {
  readonly prisma: PrismaClient;
  /** `cd_Unidade` — a unidade gestora, 4 bytes. */
  readonly codUnidade: string;
  readonly nomeUnidade: string;
  /** O instante da geração, para o header. Injetado (não `new Date()`) para o pacote ser reprodutível. */
  readonly geradoEm: Date;
}

/** A massa já lida do banco, na forma que `gerar`/`validar` consomem. */
export interface MassaSiga extends MassaParaValidar {
  /** Os registros de cada arquivo, na chave da `identificacao` da spec. */
  readonly registrosPorArquivo: Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>>;
}

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * MONTA O PACOTE A PARTIR DA MASSA — na ORDEM DE CARGA do SIGA.
 *
 * ⚠️ A ORDEM É REGRA DO TRIBUNAL, NÃO ESTÉTICA. O TCM importa por módulo e recusa o arquivo cujo
 * pré-requisito ainda não entrou: o `PagEmp2` referencia `cd_ContaContabil`, que só existe depois
 * do `ContaCont` (módulo BASICOS). Por isso percorremos `SPECS_CAMINHO_CRITICO`, que já vem
 * ordenada por (módulo, ordem), e não a ordem em que alguém listou os registros.
 *
 * ⚠️ ARQUIVO SEM REGISTRO SAI VAZIO, NÃO SAI OMITIDO — header + trailer, zero detalhes. Omitir
 * diria ao TCM "não houve movimento nesta entidade", que é uma afirmação diferente de "houve zero".
 */
export function montarPacoteSiga(
  massa: MassaSiga,
  contexto: { readonly codUnidade: string; readonly nomeUnidade: string; readonly geradoEm: Date }
): PacoteExport {
  const arquivos: ArquivoRemessa[] = [];

  for (const spec of SPECS_CAMINHO_CRITICO) {
    // ⚠️ FAIL-CLOSED CONTRA SPEC INCOMPLETA. Uma spec marcada `-INCOMPLETO` tem geometria conferida
    // mas domínio faltante num campo obrigatório. Gerá-la produziria um arquivo que o TCM ACEITA e
    // que classifica o dado numa categoria inventada — erro sem recusa, o pior tipo. O validador
    // já emite SIGA-E014; isto é a rede para quem chamar `montarPacoteSiga` direto.
    if (!ehGeravel(spec)) {
      throw new Error(
        `SPEC_INCOMPLETA: ${spec.identificacao} (${spec.numeroManual}) tem origemSpec ` +
          `"${spec.origemSpec}" — falta a tabela de domínio de um campo obrigatório no manual v44. ` +
          `Obtenha-a junto ao TCM-BA antes de incluir este arquivo na remessa.`
      );
    }

    const registros = massa.registrosPorArquivo[spec.identificacao] ?? [];
    const conteudo = montarArquivo(spec, registros, contexto);
    arquivos.push({
      // O nome segue a `identificacao` do header — é assim que o TCM reconhece a entidade.
      nome: `${spec.identificacao}.txt`,
      conteudo,
      registros: registros.length,
      // ⚠️ A DEPENDÊNCIA DE IMPORTAÇÃO VIAJA COM O ARQUIVO. Quem receber este pacote e o
      // transmitir não precisa consultar as specs para saber a sequência — e não pode, porque uma
      // segunda fonte de ordem é uma segunda verdade. O TCM recusa remessa fora de ordem.
      ordem: spec.ordem,
      modulo: spec.modulo,
    });
  }

  // A impressão digital do pacote: derivada dos hashes dos arquivos, em ordem estável.
  //
  // ⚠️ O `geradoEm` NÃO ENTRA NO HASH, de propósito. A mesma massa tem de produzir o mesmo hash
  // hoje e daqui a um ano — é isso que torna a remessa reproduzível por quem audita. Um relógio
  // dentro do digest destruiria essa propriedade sem que ninguém percebesse.
  const hash = sha256(
    Buffer.from(
      arquivos.map((a) => `${a.nome}:${sha256(a.conteudo)}`).join("\n"),
      ENCODING_SIGA
    )
  );

  return {
    tribunal: CODIGO_TCM_BA,
    competencia: massa.competencia,
    layoutVersao: LAYOUT_VERSAO_TCM_BA,
    arquivos,
    hash,
    geradoEm: contexto.geradoEm,
    // ⚠️ O ÚNICO VALOR CONSTRUÍVEL — nada aqui transmite. Os demais valores de `NaturezaPacote`
    // existem para o dia em que houver transporte real. Um pacote SIGA que circule sem esta marca
    // é um pacote que alguém vai tratar como homologado.
    natureza: "FORMATO_OFICIAL_GERADO_E_VALIDADO_LOCALMENTE",
  };
}

/**
 * O EXPORTADOR TCM-BA DE VERDADE — o que recebe as dependências e trabalha.
 *
 * `lerMassa` é injetado porque a leitura do banco é território do M01–M14 (razão, planejamento,
 * despesa), que este PR não pode tocar. O adapter descreve o FORMATO; quem sabe montar a massa a
 * partir do razão entra num PR próprio, junto do de/para semeado.
 */
export function criarExportadorTcmBa(
  deps: DependenciasTcmBa,
  lerMassa: (prisma: PrismaClient, competencia: Competencia) => Promise<MassaSiga>
): ExportadorTribunal {
  return {
    codigo: CODIGO_TCM_BA,
    uf: UF_TCM_BA,
    layoutVersao: LAYOUT_VERSAO_TCM_BA,

    validar: async (competencia: Competencia): Promise<readonly Inconsistencia[]> => {
      const massa = await lerMassa(deps.prisma, competencia);
      return validarMassaSiga(massa, SPEC_EMPENHO);
    },

    gerar: async (competencia: Competencia): Promise<PacoteExport> => {
      // ⚠️ O SIGA NÃO TEM REMESSA DIÁRIA — e recusar é melhor que ignorar o campo.
      //
      // Com a `Competencia` etiquetada dá para dizer isso. Com `{ exercicio, mes?, dia? }` o
      // adapter receberia um `dia` que não sabe usar e devolveria o MÊS INTEIRO em silêncio: quem
      // pedisse 15/03 receberia março achando que pediu um dia. O `validar` já emite SIGA-E011
      // para o operador ver antes; aqui é o fail-closed de quem chamou `gerar` direto.
      if (!granularidadeSuportada(competencia)) {
        throw new Error(
          `GRANULARIDADE_NAO_SUPORTADA: TCM-BA/SIGA recebe remessa MENSAL ou ANUAL, e recebeu ` +
            `"${competencia.granularidade}". Gerar o mês e chamá-lo de "o dia pedido" seria ` +
            `entregar outra coisa.`
        );
      }
      const massa = await lerMassa(deps.prisma, competencia);
      return montarPacoteSiga(massa, {
        codUnidade: deps.codUnidade,
        nomeUnidade: deps.nomeUnidade,
        geradoEm: deps.geradoEm,
      });
    },
  };
}

/**
 * A ENTRADA DO REGISTRO — a identidade do tribunal, que é o que `resolverTribunal` precisa.
 *
 * ⚠️ `validar` E `gerar` FALHAM NOMEANDO, pelo mesmo motivo do TCE-PB: os dois precisam de um
 * `PrismaClient` e das designações da remessa (unidade gestora, nome, instante de geração), que a
 * competência não determina e que esta fatia não sabe de onde tirar sem inventar. Um client global
 * ou um valor padrão seria comportamento novo escondido num default. Quem tem as dependências
 * chama `criarExportadorTcmBa(deps, lerMassa)`.
 */
export const exportador: ExportadorTribunal = {
  codigo: CODIGO_TCM_BA,
  uf: UF_TCM_BA,
  layoutVersao: LAYOUT_VERSAO_TCM_BA,

  validar: (): Promise<readonly Inconsistencia[]> => {
    throw new Error(
      "EXPORTADOR_SEM_DEPENDENCIAS: TCM-BA — validar precisa do PrismaClient (para ler o de/para " +
        "de conta e fonte) e da massa da competência. Use `criarExportadorTcmBa(deps, lerMassa)`."
    );
  },

  gerar: (): Promise<PacoteExport> => {
    throw new Error(
      "EXPORTADOR_SEM_DEPENDENCIAS: TCM-BA — gerar precisa do PrismaClient e das designações da " +
        "remessa (codUnidade, nomeUnidade, geradoEm), que a competência não determina. Use " +
        "`criarExportadorTcmBa(deps, lerMassa)`."
    );
  },
};

export { validarMassaSiga, granularidadeSuportada, CODIGOS_SIGA } from "./validar.js";
export type { MassaParaValidar, EmpenhoParaValidar, DeParaConta, DeParaFonte } from "./validar.js";
export { SPECS_CAMINHO_CRITICO } from "./siga/specs/index.js";
export { validarArquivoSpec } from "./siga/validar-spec.js";
export {
  ENCODING_SIGA,
  TERMINADOR_LINHA_SIGA,
  montarArquivo,
  montarHeader,
  montarLinha,
  montarTrailer,
  sanitizarAN,
} from "./siga/writer.js";
