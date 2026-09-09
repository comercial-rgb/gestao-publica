import { CardEstatistica } from "../../../../../components/ui/Card";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { RelatoriosRelacionados } from "../../../../../components/ui/RelatoriosRelacionados";
import { TabelaDeDados, type ColunaTabela } from "../../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import {
  gerarRreoAnexo11,
  PortaSemBancoError,
  type Anexo11,
  type LinhaAplicacaoAlienacao,
  type LinhaReceitaAlienacao,
} from "../../../../../lib/portas/rreo";
import { SeletorBimestreRreo } from "../anexo3/SeletorBimestreRreo";

/** RREO — Anexo 11 · Alienação de Ativos (LRF art. 44 e 53 §1º III). Server Component, força-dinâmica. */
export const dynamic = "force-dynamic";

export default async function RreoAnexo11Page({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  const exercicio = lerInteiro(sp["exercicio"], 2026);
  const b = lerInteiro(sp["bimestre"], 1);
  const bimestre = ([1, 2, 3, 4, 5, 6] as const).includes(b as 1) ? (b as 1) : 1;

  const cabecalho = (
    <PageHeader titulo="RREO — Anexo 11 · Alienação de Ativos" subtitulo="Receitas de alienação e aplicação dos recursos (LRF art. 44 e 53 §1º III)" acoes={<SeletorBimestreRreo bimestre={bimestre} exercicio={exercicio} />} />
  );

  let dados: Anexo11;
  try {
    dados = await gerarRreoAnexo11({ exercicio, bimestre });
  } catch (erro) {
    return <div>{cabecalho}<EstadoVazio titulo={erro instanceof PortaSemBancoError ? "Banco de dados não configurado" : "Não foi possível gerar o Anexo 11"} descricao={erro instanceof Error ? erro.message : "Erro desconhecido."} /></div>;
  }

  const semDados = dados.totalReceitas.realizada === "0.00" && dados.totalReceitas.previsaoAtualizada === "0.00" && dados.aplicacoes.length === 0;
  if (semDados) {
    return <div>{cabecalho}<EstadoVazio titulo="Sem alienação de ativos no período" descricao={`Não há receita de alienação nem aplicação de recursos até o ${bimestre}º bimestre de ${exercicio}.`} /></div>;
  }

  return (
    <div className="space-y-6">
      {cabecalho}

      <div className="grid gap-3 sm:grid-cols-3">
        <CardEstatistica rotulo="Receitas de alienação (I)"><ValorMonetario valor={dados.totalReceitas.realizada} /></CardEstatistica>
        <CardEstatistica rotulo="Saldo anterior (i)" nota="Tabela-parâmetro"><ValorMonetario valor={dados.saldoAnterior} /></CardEstatistica>
        <CardEstatistica rotulo="Saldo do exercício (j)" nota="i + receitas − (pagas + RP)"><ValorMonetario valor={dados.saldoExercicio} /></CardEstatistica>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">Receitas de alienação de ativos</h2>
        <TabelaDeDados<LinhaReceitaAlienacao>
          colunas={COLUNAS_RECEITA}
          linhas={[...dados.receitas, dados.totalReceitas]}
          keyDe={(l) => l.chave}
          ehTotal={(l) => l.nivel === "total"}
          recuoDe={(l) => (l.nivel === "item" ? 1 : 0)}
          legenda="Valores em R$ · saldo (c) = previsão − realizada."
        />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">Aplicação dos recursos (despesas de capital)</h2>
        <TabelaDeDados<LinhaAplicacaoAlienacao>
          colunas={COLUNAS_APLIC}
          linhas={[...dados.aplicacoes, dados.totalAplicacao]}
          keyDe={(l) => l.chave}
          ehTotal={(l) => l.nivel === "total"}
          recuoDe={(l) => (l.nivel === "grupo" ? 1 : 0)}
          legenda="Valores em R$ · saldo (h) = dotação − empenhada · art. 44 da LRF (recursos de alienação em despesa de capital)."
        />
      </section>

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        <p className="mb-1 font-medium uppercase tracking-wide">Notas do demonstrativo</p>
        <ul className="list-disc space-y-1 pl-4">{dados.notas.map((n, i) => <li key={i}>{n}</li>)}</ul>
      </div>

      <RelatoriosRelacionados relacoes={[{ href: "/relatorios/rreo/anexo1", rotulo: "Anexo 1 — Balanço Orçamentário", motivo: "As receitas de alienação (I) são um recorte da origem de alienação no balanço." }]} />
    </div>
  );
}

function lerInteiro(v: string | string[] | undefined, padrao: number): number {
  const bruto = Array.isArray(v) ? v[0] : v;
  if (bruto === undefined) return padrao;
  const n = Number.parseInt(bruto, 10);
  return Number.isNaN(n) ? padrao : n;
}

const COLUNAS_RECEITA: readonly ColunaTabela<LinhaReceitaAlienacao>[] = [
  { chave: "rotulo", cabecalho: "Especificação", alinhamento: "esquerda", celula: (l) => l.rotulo },
  { chave: "a", cabecalho: "Previsão Atualizada (a)", alinhamento: "direita", largura: "9rem", celula: (l) => <ValorMonetario valor={l.previsaoAtualizada} /> },
  { chave: "b", cabecalho: "Realizadas (b)", alinhamento: "direita", largura: "9rem", celula: (l) => <ValorMonetario valor={l.realizada} /> },
  { chave: "c", cabecalho: "Saldo (c)", alinhamento: "direita", largura: "9rem", celula: (l) => <ValorMonetario valor={l.saldo} /> },
];

const COLUNAS_APLIC: readonly ColunaTabela<LinhaAplicacaoAlienacao>[] = [
  { chave: "rotulo", cabecalho: "Especificação", alinhamento: "esquerda", celula: (l) => l.rotulo },
  { chave: "d", cabecalho: "Dotação Atualizada (d)", alinhamento: "direita", largura: "7.5rem", celula: (l) => <ValorMonetario valor={l.dotacaoAtualizada} /> },
  { chave: "e", cabecalho: "Empenhadas (e)", alinhamento: "direita", largura: "7rem", celula: (l) => <ValorMonetario valor={l.empenhada} /> },
  { chave: "f", cabecalho: "Liquidadas (f)", alinhamento: "direita", largura: "7rem", celula: (l) => <ValorMonetario valor={l.liquidada} /> },
  { chave: "g", cabecalho: "Pagas (g)", alinhamento: "direita", largura: "7rem", celula: (l) => <ValorMonetario valor={l.paga} /> },
  { chave: "h", cabecalho: "Saldo (h)", alinhamento: "direita", largura: "7.5rem", celula: (l) => <ValorMonetario valor={l.saldo} /> },
];
