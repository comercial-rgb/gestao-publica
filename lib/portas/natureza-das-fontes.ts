import {
  declararNaturezaDaFonte,
  listarNaturezasDeclaradas,
  NATUREZAS_DA_FONTE,
} from "../../modules/m01-core-contabil/natureza-da-fonte.js";
import {
  CONTA_CONTROLE_DDR_POR_NATUREZA,
  type NaturezaDaFonteDdr,
} from "../../modules/m01-core-contabil/roteiros.js";
import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";

/**
 * ═══ A NATUREZA DAS FONTES NA TELA (V11 V9.3) ═══
 *
 * ⚠️ ELA EXISTE PARA FECHAR `CONTROLE-DDR-POR-NATUREZA-DA-FONTE` — e, como a tela irmã dos
 * roteiros orçamentários, NÃO escolhendo pelo ente, o que seria classificar FUNDEB por
 * palpite, mas dando a ele o LUGAR de classificar. Enquanto este lugar não existiu, a
 * arrecadação era impossível em instalação nova: o roteiro debitava a conta sintética
 * `7.2.1.1.0.00.00` e o razão recusava, corretamente.
 *
 * ⚠️ O RÓTULO DE CADA NATUREZA É O NOME DA CONTA NO PLANO, não uma paráfrase. Quem classifica
 * precisa ver em que conta do razão a escolha vai cair — é o que torna a escolha conferível
 * contra o `Pcasp_2025.xlsx`.
 */

const ROTULO: Readonly<Record<NaturezaDaFonteDdr, string>> = {
  ORDINARIOS: "Recursos ordinários",
  VINCULADOS: "Recursos vinculados",
  EXTRAORCAMENTARIOS: "Recursos extraorçamentários",
  COMPENSACAO_FINANCEIRA: "Recursos para compensação financeira",
  OUTROS: "Outros controles da disponibilidade de recursos",
};

export interface NaturezaEscolhivel {
  readonly valor: NaturezaDaFonteDdr;
  readonly rotulo: string;
  readonly conta: string;
}

export const NATUREZAS_ESCOLHIVEIS: readonly NaturezaEscolhivel[] = NATUREZAS_DA_FONTE.map(
  (n) => ({ valor: n, rotulo: ROTULO[n], conta: CONTA_CONTROLE_DDR_POR_NATUREZA[n] })
);

/** Uma fonte como a tela a mostra: o cadastro, mais a classificação (ou a falta dela). */
export interface FonteNaTela {
  readonly codigo: string;
  readonly descricao: string;
  readonly natureza: NaturezaDaFonteDdr | null;
  readonly naturezaRotulo: string | null;
  readonly contaDeControle: string | null;
  readonly fundamento: string | null;
  readonly versao: number | null;
  readonly criadoPor: string | null;
}

/**
 * TODAS AS FONTES DO CADASTRO, classificadas ou não.
 *
 * ⚠️ A LISTA PARTE DO CADASTRO, não das declarações. Listar só o que já foi classificado
 * esconderia exatamente o que a tela existe para resolver: a fonte que ainda trava a
 * arrecadação não apareceria em lugar nenhum, e o servidor municipal descobriria a pendência
 * pela recusa de uma guia.
 */
export async function lerFontesEAsNaturezas(): Promise<readonly FonteNaTela[]> {
  await exigirLeituraDoEnte("CONSULTAR_CONTABILIDADE");
  const [fontes, declaradas] = await Promise.all([
    cliente().fonteRecurso.findMany({
      orderBy: { codigo: "asc" },
      select: { codigo: true, descricao: true },
    }),
    listarNaturezasDeclaradas(cliente()),
  ]);
  const porFonte = new Map(declaradas.map((d) => [d.fonteCodigo, d]));
  return fontes.map((f) => {
    const d = porFonte.get(f.codigo);
    return {
      codigo: f.codigo,
      descricao: f.descricao,
      natureza: d?.natureza ?? null,
      naturezaRotulo: d === undefined ? null : ROTULO[d.natureza],
      contaDeControle: d?.contaDeControle ?? null,
      fundamento: d?.fundamento ?? null,
      versao: d?.versao ?? null,
      criadoPor: d?.criadoPor ?? null,
    };
  });
}

export async function declararNatureza(input: {
  readonly fonteCodigo: string;
  readonly natureza: string;
  readonly fundamento: string;
}): Promise<string> {
  const r = await comEscritaAutenticada("PARAMETRIZAR_ROTEIRO_ORCAMENTARIO", (criadoPor) =>
    declararNaturezaDaFonte(cliente(), {
      fonteCodigo: input.fonteCodigo,
      natureza: input.natureza as never,
      fundamento: input.fundamento,
      criadoPor,
    })
  );
  return (
    `Fonte ${input.fonteCodigo} declarada como ${ROTULO[r.natureza]} na versão ${String(r.versao)}: ` +
    `a arrecadação dela passa a escriturar o controle da disponibilidade em ${r.contaDeControle}` +
    (r.anterior === null
      ? "."
      : `, no lugar de ${ROTULO[r.anterior.natureza]}. O que já foi arrecadado permanece na conta ` +
        `em que entrou — a reclassificação vale para o que vier.`)
  );
}
