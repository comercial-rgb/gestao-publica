import { Badge, type StatusBadge } from "../../../../../components/ui/Badge";
import { Card, CardEstatistica } from "../../../../../components/ui/Card";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { RelatoriosRelacionados } from "../../../../../components/ui/RelatoriosRelacionados";
import { TabelaDeDados, type ColunaTabela } from "../../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import {
  gerarRgfAnexo1,
  PortaSemBancoError,
  type Anexo1Rgf,
  type LinhaPessoal,
  type PoderRgf,
  type Quadrimestre,
} from "../../../../../lib/portas/rreo";
import { SeletorQuadrimestre } from "./SeletorQuadrimestre";

/** RGF — Anexo 1 · Despesa com Pessoal (LRF art. 55 I "a"). Server Component, força-dinâmica. */
export const dynamic = "force-dynamic";

const SITUACAO_BADGE: Record<PoderRgf["situacao"], { status: StatusBadge; texto: string }> = {
  abaixo: { status: "ok", texto: "abaixo do alerta" },
  alerta: { status: "alerta", texto: "entre alerta e prudencial" },
  acima: { status: "erro", texto: "acima do prudencial" },
};

export default async function RgfAnexo1Page({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  const exercicio = lerInteiro(sp["exercicio"], 2026);
  const q = lerInteiro(sp["quadrimestre"], 1);
  const quadrimestre = ([1, 2, 3] as const).includes(q as 1) ? (q as Quadrimestre) : 1;

  const cabecalho = (
    <PageHeader titulo="RGF — Anexo 1 · Despesa com Pessoal" subtitulo="Demonstrativo da despesa com pessoal · LRF art. 55, I, 'a' · limite por Poder (art. 20)" acoes={<SeletorQuadrimestre quadrimestre={quadrimestre} exercicio={exercicio} />} />
  );

  let dados: Anexo1Rgf;
  try {
    dados = await gerarRgfAnexo1({ exercicio, quadrimestre });
  } catch (erro) {
    return <div>{cabecalho}<EstadoVazio titulo={erro instanceof PortaSemBancoError ? "Banco de dados não configurado" : "Não foi possível gerar o RGF Anexo 1"} descricao={erro instanceof Error ? erro.message : "Erro desconhecido."} /></div>;
  }

  if (dados.poderes.length === 0) {
    return <div>{cabecalho}<EstadoVazio titulo="Sem despesa de pessoal no período" descricao={`Não há despesa de pessoal apurada nos 12 meses até o ${quadrimestre}º quadrimestre de ${exercicio}.`} /></div>;
  }

  return (
    <div className="space-y-6">
      {cabecalho}

      {/* ── APURAÇÃO por poder ── */}
      <div className="grid gap-3 lg:grid-cols-2">
        {dados.poderes.map((poder) => {
          const b = SITUACAO_BADGE[poder.situacao];
          return (
            <Card key={poder.poder}>
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">{poder.rotulo}</h2>
                <Badge status={b.status}>{b.texto}</Badge>
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-semibold tabular text-[color:var(--color-ink)]">{poder.percentDtp.replace(".", ",")}%</span>
                <span className="text-xs text-[color:var(--color-ink-3)]">da RCL ajustada · DTP <ValorMonetario valor={poder.dtp} /></span>
              </div>
              <p className="mt-1 text-xs text-[color:var(--color-ink-3)]">
                Máximo {poder.limiteMaximo.replace(".", ",")}% · prudencial {poder.limitePrudencial.replace(".", ",")}% · alerta {poder.limiteAlerta.replace(".", ",")}%
              </p>
            </Card>
          );
        })}
      </div>

      {/* ── RCL ajustada ── */}
      <div className="grid gap-3 sm:grid-cols-4">
        <CardEstatistica rotulo="RCL (IV)" nota="== Anexo 3 (III)"><ValorMonetario valor={dados.rcl} /></CardEstatistica>
        <CardEstatistica rotulo="(−) Emendas individuais (V)"><ValorMonetario valor={dados.emendasIndividuais} /></CardEstatistica>
        <CardEstatistica rotulo="(−) Emendas de bancada (VI)"><ValorMonetario valor={dados.emendasBancada} /></CardEstatistica>
        <CardEstatistica rotulo="RCL ajustada (VII)"><ValorMonetario valor={dados.rclAjustada} /></CardEstatistica>
      </div>

      {/* ── composição da DTP por poder ── */}
      {dados.poderes.map((poder) => (
        <section key={poder.poder}>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">{poder.rotulo} — composição da despesa</h2>
          <TabelaDeDados<LinhaPessoal>
            colunas={COLUNAS}
            linhas={[...poder.bruta, poder.despesaBruta]}
            keyDe={(l) => l.chave}
            ehTotal={(l) => l.chave === "BRUTA"}
            recuoDe={(l) => (l.chave === "BRUTA" ? 0 : 1)}
            legenda={`Não computadas (II): ${poder.totalNaoComputadas} · DTP (III) = ${poder.dtp}. Valores em R$ · últimos 12 meses.`}
          />
        </section>
      ))}

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        <p className="mb-1 font-medium uppercase tracking-wide">Notas do demonstrativo</p>
        <ul className="list-disc space-y-1 pl-4">{dados.notas.map((n, i) => <li key={i}>{n}</li>)}</ul>
      </div>

      <RelatoriosRelacionados relacoes={[
        { href: "/relatorios/rreo/anexo3", rotulo: "RREO Anexo 3 — RCL", motivo: "A RCL do limite de pessoal é a mesma linha III do Anexo 3." },
        { href: "/relatorios/rreo/anexo7", rotulo: "RREO Anexo 7 — Restos a Pagar", motivo: "A classificação por Poder usa o mesmo de-para órgão→poder." },
      ]} />
    </div>
  );
}

function lerInteiro(v: string | string[] | undefined, padrao: number): number {
  const bruto = Array.isArray(v) ? v[0] : v;
  if (bruto === undefined) return padrao;
  const n = Number.parseInt(bruto, 10);
  return Number.isNaN(n) ? padrao : n;
}

const COLUNAS: readonly ColunaTabela<LinhaPessoal>[] = [
  { chave: "rotulo", cabecalho: "Especificação", alinhamento: "esquerda", celula: (l) => l.rotulo },
  { chave: "liq", cabecalho: "Liquidadas (a)", alinhamento: "direita", largura: "9rem", celula: (l) => <ValorMonetario valor={l.liquidadas} /> },
  { chave: "rpnp", cabecalho: "Inscritas RPNP (b)", alinhamento: "direita", largura: "9rem", celula: (l) => <ValorMonetario valor={l.rpnp} /> },
  { chave: "total", cabecalho: "Total (a+b)", alinhamento: "direita", largura: "9rem", celula: (l) => <ValorMonetario valor={l.total} /> },
];
