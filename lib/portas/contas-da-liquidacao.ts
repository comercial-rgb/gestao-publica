import {
  EFEITOS_DA_LIQUIDACAO,
  declararContaDaLiquidacao,
  listarContasDaLiquidacao,
  rotuloDoEfeito,
  type EfeitoDaLiquidacao,
} from "../../modules/m01-core-contabil/conta-da-liquidacao.js";
import { CONTA_ESTOQUE, ELEMENTOS_COM_ROTEIRO, contrapartidaDaLiquidacao } from "../../modules/m01-core-contabil/roteiros.js";
import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";

/**
 * ═══ AS CONTAS DA LIQUIDAÇÃO POR ELEMENTO, NA TELA (V28) ═══
 *
 * ⚠️ A LISTA PARTE DAS FICHAS, não das declarações — como a tela irmã da natureza das fontes. Um
 * elemento que tem dotação e não tem conta é o que vai recusar a liquidação; listar só o que já
 * foi declarado esconderia justamente isso.
 */

export interface EfeitoEscolhivel {
  readonly valor: EfeitoDaLiquidacao;
  readonly rotulo: string;
}

export const EFEITOS_ESCOLHIVEIS: readonly EfeitoEscolhivel[] = EFEITOS_DA_LIQUIDACAO.map((e) => ({ valor: e, rotulo: rotuloDoEfeito(e) }));

export interface ElementoNaTela {
  readonly elemento: string;
  /** Uma descrição de natureza com esse elemento, para quem lê saber de que despesa se trata. */
  readonly exemplo: string | null;
  readonly fichas: number;
  readonly situacao: "FIXA" | "DECLARADA" | "PENDENTE";
  readonly contaCodigo: string | null;
  readonly contaNome: string | null;
  readonly efeitoRotulo: string | null;
  readonly fundamento: string | null;
  readonly versao: number | null;
  readonly criadoPor: string | null;
}

export async function lerElementosEAsContas(): Promise<readonly ElementoNaTela[]> {
  await exigirLeituraDoEnte("CONSULTAR_CONTABILIDADE");
  const prisma = cliente();
  const [naturezas, declaradas] = await Promise.all([
    prisma.naturezaDespesa.findMany({
      where: { fichas: { some: {} } },
      orderBy: { codigoCompleto: "asc" },
      select: { codElemento: true, descricao: true, _count: { select: { fichas: true } } },
    }),
    listarContasDaLiquidacao(prisma),
  ]);
  const porElemento = new Map<string, { exemplo: string; fichas: number }>();
  for (const n of naturezas) {
    const atual = porElemento.get(n.codElemento);
    porElemento.set(n.codElemento, { exemplo: atual?.exemplo ?? n.descricao, fichas: (atual?.fichas ?? 0) + n._count.fichas });
  }
  for (const d of declaradas) if (!porElemento.has(d.elemento)) porElemento.set(d.elemento, { exemplo: "", fichas: 0 });
  for (const e of ELEMENTOS_COM_ROTEIRO) if (!porElemento.has(e)) porElemento.set(e, { exemplo: "", fichas: 0 });

  const declaradaPor = new Map(declaradas.map((d) => [d.elemento, d]));
  const codigos = [
    ...declaradas.map((d) => d.contaCodigo),
    ...ELEMENTOS_COM_ROTEIRO.map((e) => contrapartidaDaLiquidacao(e)),
  ];
  const nomes = new Map(
    (await prisma.contaPcasp.findMany({ where: { codigo: { in: codigos } }, select: { codigo: true, nome: true } })).map((c) => [c.codigo, c.nome])
  );

  return [...porElemento.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([elemento, info]) => {
      if (ELEMENTOS_COM_ROTEIRO.includes(elemento)) {
        const conta = contrapartidaDaLiquidacao(elemento);
        return {
          elemento, exemplo: info.exemplo || null, fichas: info.fichas, situacao: "FIXA" as const,
          contaCodigo: conta, contaNome: nomes.get(conta) ?? null,
          efeitoRotulo: conta === CONTA_ESTOQUE ? "entrada em estoque (almoxarifado)" : "regra fixa do sistema",
          fundamento: null, versao: null, criadoPor: null,
        };
      }
      const d = declaradaPor.get(elemento);
      if (d === undefined) {
        return {
          elemento, exemplo: info.exemplo || null, fichas: info.fichas, situacao: "PENDENTE" as const,
          contaCodigo: null, contaNome: null, efeitoRotulo: null, fundamento: null, versao: null, criadoPor: null,
        };
      }
      return {
        elemento, exemplo: info.exemplo || null, fichas: info.fichas, situacao: "DECLARADA" as const,
        contaCodigo: d.contaCodigo, contaNome: nomes.get(d.contaCodigo) ?? null,
        efeitoRotulo: d.efeito === null || d.efeito === "ESTOQUE" ? null : rotuloDoEfeito(d.efeito),
        fundamento: d.fundamento, versao: d.versao, criadoPor: d.criadoPor,
      };
    });
}

export async function declararContaDaLiquidacaoNaTela(input: {
  readonly elemento: string;
  readonly efeito: string;
  readonly contaCodigo: string;
  readonly fundamento: string;
}): Promise<string> {
  const r = await comEscritaAutenticada("PARAMETRIZAR_ROTEIRO_ORCAMENTARIO", (criadoPor) =>
    declararContaDaLiquidacao(cliente(), {
      elemento: input.elemento,
      efeito: input.efeito as EfeitoDaLiquidacao,
      contaCodigo: input.contaCodigo,
      fundamento: input.fundamento,
      criadoPor,
    })
  );
  return (
    `Elemento ${input.elemento} declarado na versão ${String(r.versao)}: as próximas liquidações dele debitam ` +
    `${input.contaCodigo}` +
    (r.anterior === null
      ? "."
      : `, no lugar de ${r.anterior.contaCodigo}. As liquidações já feitas permanecem na conta em que foram lançadas.`)
  );
}
