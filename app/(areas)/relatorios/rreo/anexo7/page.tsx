import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { RelatoriosRelacionados } from "../../../../../components/ui/RelatoriosRelacionados";
import { RELACOES_RREO } from "../../../../../lib/navegacao";
import {
  TabelaDeDados,
  type ColunaTabela,
  type GrupoColuna,
} from "../../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import {
  gerarRreoAnexo7,
  PortaSemBancoError,
  type Anexo7,
  type LinhaAnexo7,
} from "../../../../../lib/portas/rreo";
import { SeletorExercicioAnexo7 } from "./SeletorExercicioAnexo7";

/**
 * RREO — ANEXO 7: DEMONSTRATIVO DOS RESTOS A PAGAR POR PODER E ÓRGÃO (LRF art. 53, V; MDF Tab. 7).
 *
 * Server Component + `force-dynamic` — lê o banco pela PORTA (`lib/portas/rreo`), nunca o domínio
 * direto. A tabela tem CABEÇALHO DE DOIS NÍVEIS (os dois blocos do MDF); poderes em destaque,
 * órgãos indentados; dinheiro STRING de ponta a ponta. Estados: carregando (SSR), vazio, e erro
 * NOMEADO — inclusive o fail-closed do órgão sem Poder mapeado (a mensagem nomeia o órgão).
 */

export const dynamic = "force-dynamic";

const ANO_PADRAO = 2026;

export default async function RreoAnexo7Page({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  const exercicio = lerInteiro(sp["exercicio"], ANO_PADRAO);

  const cabecalho = (
    <PageHeader
      titulo="RREO — Anexo 7 · Restos a Pagar por Poder e Órgão"
      subtitulo="Demonstrativo dos Restos a Pagar · LRF art. 53, V · MDF 15ª ed. (STN), Tabela 7"
      acoes={<SeletorExercicioAnexo7 exercicio={exercicio} />}
    />
  );

  let dados: Anexo7;
  try {
    dados = await gerarRreoAnexo7({ exercicio });
  } catch (erro) {
    return (
      <div>
        {cabecalho}
        {erro instanceof PortaSemBancoError ? (
          <EstadoVazio
            titulo="Banco de dados não configurado"
            descricao="A variável DATABASE_URL não está definida. Configure o banco e recarregue."
          />
        ) : (
          <EstadoVazio
            titulo="Não foi possível gerar o Anexo 7"
            descricao={erro instanceof Error ? erro.message : "Erro desconhecido ao ler o demonstrativo."}
          />
        )}
      </div>
    );
  }

  const linhas: LinhaAnexo7[] = [
    ...dados.excetoIntra,
    dados.subtotalExcetoIntra,
    ...dados.intra,
    dados.subtotalIntra,
    dados.total,
  ];

  const temMovimento = dados.total.saldoTotal !== "0.00" || dados.excetoIntra.length > 0;
  if (!temMovimento) {
    return (
      <div>
        {cabecalho}
        <EstadoVazio
          titulo="Sem Restos a Pagar no período"
          descricao={`Não há Restos a Pagar de exercícios anteriores a ${exercicio} com saldo ou movimento no período.`}
        />
      </div>
    );
  }

  return (
    <div>
      {cabecalho}
      <TabelaDeDados<LinhaAnexo7>
        colunas={COLUNAS}
        grupos={GRUPOS}
        linhas={linhas}
        keyDe={(l) => l.chave}
        ehTotal={(l) => l.nivel === "total" || l.nivel === "poder"}
        recuoDe={(l) => (l.nivel === "orgao" ? 1 : 0)}
        legenda={`Valores em R$ · exercício de referência ${exercicio} · (h) Liquidados é informativa e NÃO entra no saldo (k). e=(a+b)−(c+d) · k=(f+g)−(i+j) · l=e+k.`}
      />
      <RelatoriosRelacionados relacoes={RELACOES_RREO["/relatorios/rreo/anexo7"] ?? []} />
    </div>
  );
}

function lerInteiro(v: string | string[] | undefined, padrao: number): number {
  const bruto = Array.isArray(v) ? v[0] : v;
  if (bruto === undefined) return padrao;
  const n = Number.parseInt(bruto, 10);
  return Number.isNaN(n) ? padrao : n;
}

// ── cabeçalho de dois níveis: rótulo + BLOCO 1 (5) + BLOCO 2 (6) + total ──
const GRUPOS: readonly GrupoColuna[] = [
  { rotulo: "", colSpan: 1 },
  { rotulo: "RP Processados e RPNP Liquidados em Exercícios Anteriores", colSpan: 5 },
  { rotulo: "RP Não Processados", colSpan: 6 },
  { rotulo: "", colSpan: 1 },
];

const val = (get: (l: LinhaAnexo7) => string, largura: string): Omit<ColunaTabela<LinhaAnexo7>, "chave" | "cabecalho"> => ({
  alinhamento: "direita",
  largura,
  celula: (l) => <ValorMonetario valor={get(l)} />,
});

const COLUNAS: readonly ColunaTabela<LinhaAnexo7>[] = [
  { chave: "rotulo", cabecalho: "Especificação", alinhamento: "esquerda", celula: (l) => l.rotulo },
  // BLOCO 1
  { chave: "a", cabecalho: "Insc. Ex. Anteriores (a)", ...val((l) => l.inscExAnterioresB1, "6.5rem") },
  { chave: "b", cabecalho: "Insc. 31/12 Ant. (b)", ...val((l) => l.inscAnoAnteriorB1, "6.5rem") },
  { chave: "c", cabecalho: "Pagos (c)", ...val((l) => l.pagosB1, "6.5rem") },
  { chave: "d", cabecalho: "Cancelados (d)", ...val((l) => l.canceladosB1, "6.5rem") },
  { chave: "e", cabecalho: "Saldo (e)", ...val((l) => l.saldoB1, "7rem") },
  // BLOCO 2
  { chave: "f", cabecalho: "Insc. Ex. Anteriores (f)", ...val((l) => l.inscExAnterioresB2, "6.5rem") },
  { chave: "g", cabecalho: "Insc. 31/12 Ant. (g)", ...val((l) => l.inscAnoAnteriorB2, "6.5rem") },
  { chave: "h", cabecalho: "Liquidados (h)", ...val((l) => l.liquidadosB2, "6.5rem") },
  { chave: "i", cabecalho: "Pagos (i)", ...val((l) => l.pagosB2, "6.5rem") },
  { chave: "j", cabecalho: "Cancelados (j)", ...val((l) => l.canceladosB2, "6.5rem") },
  { chave: "k", cabecalho: "Saldo (k)", ...val((l) => l.saldoB2, "7rem") },
  // TOTAL
  { chave: "l", cabecalho: "Saldo Total (l)", ...val((l) => l.saldoTotal, "7.5rem") },
];
