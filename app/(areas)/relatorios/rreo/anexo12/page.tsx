import { Badge } from "../../../../../components/ui/Badge";
import { Card, CardEstatistica } from "../../../../../components/ui/Card";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { RelatoriosRelacionados } from "../../../../../components/ui/RelatoriosRelacionados";
import { TabelaDeDados, type ColunaTabela } from "../../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import { RELACOES_RREO } from "../../../../../lib/navegacao";
import {
  gerarRreoAnexo12,
  PortaSemBancoError,
  type Anexo12,
  type LinhaDespesaAsps,
  type LinhaNaoComputada,
  type LinhaReceitaAsps,
} from "../../../../../lib/portas/rreo";
import { SeletorBimestreRreo } from "../anexo3/SeletorBimestreRreo";

/**
 * RREO — ANEXO 12: ASPS (Saúde), BLOCO 1 (LC 141/2012 art. 35; MDF Tabela 12.2). Server Component
 * + force-dynamic, lê pela porta. Quadros empilhados: receitas (base), despesas com saúde, não
 * computadas, apuração. O percentual de aplicação (VII) ganha semântica: >= 15% verde, < 15%
 * vermelho — via tokens do design system (Badge), nunca hex. Notas ¹ ³ no rodapé.
 */

export const dynamic = "force-dynamic";

const ANO_PADRAO = 2026;
const BIMESTRE_PADRAO = 1;

export default async function RreoAnexo12Page({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  const exercicio = lerInteiro(sp["exercicio"], ANO_PADRAO);
  const bimestreBruto = lerInteiro(sp["bimestre"], BIMESTRE_PADRAO);
  const bimestre = ([1, 2, 3, 4, 5, 6] as const).includes(bimestreBruto as 1) ? (bimestreBruto as 1) : BIMESTRE_PADRAO;

  const cabecalho = (
    <PageHeader
      titulo="RREO — Anexo 12 · Saúde (ASPS)"
      subtitulo="Ações e Serviços Públicos de Saúde · LC 141/2012 art. 35 · limite 15% · MDF 15ª ed."
      acoes={<SeletorBimestreRreo bimestre={bimestre} exercicio={exercicio} />}
    />
  );

  let dados: Anexo12;
  try {
    dados = await gerarRreoAnexo12({ exercicio, bimestre });
  } catch (erro) {
    return (
      <div>
        {cabecalho}
        <EstadoVazio
          titulo={erro instanceof PortaSemBancoError ? "Banco de dados não configurado" : "Não foi possível gerar o Anexo 12"}
          descricao={
            erro instanceof PortaSemBancoError
              ? "A variável DATABASE_URL não está definida. Configure o banco e recarregue."
              : erro instanceof Error
                ? erro.message
                : "Erro desconhecido ao ler o demonstrativo."
          }
        />
      </div>
    );
  }

  if (dados.baseAsps.realizada === "0.00" && dados.totalDespesasSaude.liquidada === "0.00") {
    return (
      <div>
        {cabecalho}
        <EstadoVazio titulo="Sem dados de saúde no período" descricao={`Não há receita de impostos nem despesa de saúde apurada até o ${bimestre}º bimestre de ${exercicio}.`} />
      </div>
    );
  }

  const atingiu = dados.atingiuMinimo;

  return (
    <div className="space-y-6">
      {cabecalho}

      {/* ── APURAÇÃO (destaque no topo) ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CardEstatistica rotulo="Base de impostos (III)">
          <ValorMonetario valor={dados.baseAsps.realizada} />
        </CardEstatistica>
        <CardEstatistica rotulo="Aplicado em ASPS (VI)">
          <ValorMonetario valor={dados.totalAsps} />
        </CardEstatistica>
        <Card>
          <p className="text-xs uppercase tracking-wide text-[color:var(--color-ink-2)]">Aplicação (VII)</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-2xl font-semibold tabular text-[color:var(--color-ink)]">{fmtPercent(dados.percentualAplicacao)}</span>
            <Badge status={atingiu ? "ok" : "erro"}>{atingiu ? "≥ 15%" : "abaixo de 15%"}</Badge>
          </div>
          <p className="mt-1 text-xs text-[color:var(--color-ink-3)]">Mínimo constitucional: {fmtPercent(dados.limitePercentual)}</p>
        </Card>
        <CardEstatistica rotulo={atingiu ? "Acima do mínimo" : "Falta para o mínimo"} nota="VI − 15% da base">
          <ValorMonetario valor={dados.valorDiferenca} />
        </CardEstatistica>
      </div>

      {/* ── QUADRO 1: RECEITAS ── */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">Receitas para apuração</h2>
        <TabelaDeDados<LinhaReceitaAsps>
          colunas={COLUNAS_RECEITA}
          linhas={[...dados.impostos, dados.totalImpostos, ...dados.transferencias, dados.totalTransferencias, dados.baseAsps]}
          keyDe={(l) => l.chave}
          ehTotal={(l) => l.nivel === "total"}
          recuoDe={(l) => (l.nivel === "item" ? 1 : 0)}
          legenda="Valores em R$ · transferências pelo BRUTO (a dedução do FUNDEB não abate a base do art. 198)."
        />
      </section>

      {/* ── QUADRO 2: DESPESAS COM SAÚDE ── */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">Despesas com saúde (função 10)</h2>
        <TabelaDeDados<LinhaDespesaAsps>
          colunas={COLUNAS_DESPESA}
          linhas={[...dados.despesas, dados.totalDespesasSaude]}
          keyDe={(l) => l.chave}
          ehTotal={(l) => l.nivel === "total"}
          recuoDe={(l) => (l.nivel === "grupo" ? 1 : 0)}
          legenda="Valores em R$ · corte pela data do fato, líquido de estornos."
        />
      </section>

      {/* ── QUADRO 3: NÃO COMPUTADAS ── */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">Despesas não computadas (V)</h2>
        <TabelaDeDados<LinhaNaoComputada | { chave: string; rotulo: string; valor: string; ehTotal: true }>
          colunas={COLUNAS_NAO_COMPUTADA}
          linhas={[...dados.naoComputadas, { chave: "TOTAL_V", rotulo: "TOTAL DAS DESPESAS NÃO COMPUTADAS (V)", valor: dados.totalNaoComputadas, ehTotal: true as const }]}
          keyDe={(l) => l.chave}
          ehTotal={(l) => "ehTotal" in l && l.ehTotal === true}
        />
      </section>

      {/* ── NOTAS ── */}
      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        <p className="mb-1 font-medium uppercase tracking-wide">Notas do demonstrativo</p>
        <ul className="list-disc space-y-1 pl-4">
          {dados.naoComputadas.filter((n) => n.nota !== undefined).map((n) => (
            <li key={n.chave}>
              <span className="font-medium">{n.rotulo}:</span> {n.nota}
            </li>
          ))}
          {dados.notas.map((n, i) => (
            <li key={`nota-${i}`}>{n}</li>
          ))}
        </ul>
      </div>

      <RelatoriosRelacionados relacoes={RELACOES_RREO["/relatorios/rreo/anexo12"] ?? []} />
    </div>
  );
}

function lerInteiro(v: string | string[] | undefined, padrao: number): number {
  const bruto = Array.isArray(v) ? v[0] : v;
  if (bruto === undefined) return padrao;
  const n = Number.parseInt(bruto, 10);
  return Number.isNaN(n) ? padrao : n;
}

/** "15.00" → "15,00%". Formata por parse textual (a vírgula é a decimal brasileira). */
function fmtPercent(v: string): string {
  return `${v.replace(".", ",")}%`;
}

const COLUNAS_RECEITA: readonly ColunaTabela<LinhaReceitaAsps>[] = [
  { chave: "rotulo", cabecalho: "Especificação", alinhamento: "esquerda", celula: (l) => l.rotulo },
  { chave: "pi", cabecalho: "Previsão Inicial", alinhamento: "direita", largura: "8rem", celula: (l) => <ValorMonetario valor={l.previsaoInicial} /> },
  { chave: "pa", cabecalho: "Previsão Atualizada (a)", alinhamento: "direita", largura: "8rem", celula: (l) => <ValorMonetario valor={l.previsaoAtualizada} /> },
  { chave: "b", cabecalho: "Realizadas até o Bim. (b)", alinhamento: "direita", largura: "8rem", celula: (l) => <ValorMonetario valor={l.realizada} /> },
  { chave: "pct", cabecalho: "% (b/a)", alinhamento: "direita", largura: "5rem", celula: (l) => `${l.percentRealizada.replace(".", ",")}%` },
];

const COLUNAS_DESPESA: readonly ColunaTabela<LinhaDespesaAsps>[] = [
  { chave: "rotulo", cabecalho: "Especificação", alinhamento: "esquerda", celula: (l) => l.rotulo },
  { chave: "di", cabecalho: "Dotação Inicial", alinhamento: "direita", largura: "7rem", celula: (l) => <ValorMonetario valor={l.dotacaoInicial} /> },
  { chave: "c", cabecalho: "Dotação Atualizada (c)", alinhamento: "direita", largura: "7rem", celula: (l) => <ValorMonetario valor={l.dotacaoAtualizada} /> },
  { chave: "d", cabecalho: "Empenhadas (d)", alinhamento: "direita", largura: "7rem", celula: (l) => <ValorMonetario valor={l.empenhada} /> },
  { chave: "pd", cabecalho: "%(d/c)", alinhamento: "direita", largura: "4.5rem", celula: (l) => `${l.percentEmpenhada.replace(".", ",")}%` },
  { chave: "e", cabecalho: "Liquidadas (e)", alinhamento: "direita", largura: "7rem", celula: (l) => <ValorMonetario valor={l.liquidada} /> },
  { chave: "pe", cabecalho: "%(e/c)", alinhamento: "direita", largura: "4.5rem", celula: (l) => `${l.percentLiquidada.replace(".", ",")}%` },
  { chave: "rpnp", cabecalho: "RPNP inscritos", alinhamento: "direita", largura: "7rem", celula: (l) => <ValorMonetario valor={l.rpnpInscritos} /> },
];

type LinhaV = LinhaNaoComputada | { chave: string; rotulo: string; valor: string; ehTotal: true };
const COLUNAS_NAO_COMPUTADA: readonly ColunaTabela<LinhaV>[] = [
  { chave: "rotulo", cabecalho: "Especificação", alinhamento: "esquerda", celula: (l) => l.rotulo },
  { chave: "valor", cabecalho: "Valor", alinhamento: "direita", largura: "9rem", celula: (l) => <ValorMonetario valor={l.valor} /> },
];
