import Link from "next/link";
import { Badge } from "../../components/ui/Badge";
import { Card, CardIndicador } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { ValorMonetario } from "../../components/ui/ValorMonetario";
import {
  gerarRgfAnexo1,
  gerarRreoAnexo1,
  gerarRreoAnexo3,
  gerarRreoAnexo8,
  gerarRreoAnexo12,
} from "../../lib/portas/rreo";
import { SincronizarHome } from "./SincronizarHome";

/**
 * DASHBOARD VIVO — os cards leem o banco pelas PORTAS (read-only, force-dynamic). Cada card é
 * INDEPENDENTE: se a sua porta falhar (banco ausente, fonte sem classe...), ele mostra um traço, e
 * a home NÃO quebra — um número indisponível não derruba os outros. Exercício vem do UiContext
 * (via `SincronizarHome`, que o espelha na URL). O painel usa o ano inteiro (6º bimestre) — a foto
 * mais completa da execução; cada card linka para o relatório de origem.
 */

export const dynamic = "force-dynamic";

const ANO_PADRAO = 2026;
const BIMESTRE_PAINEL = 6; // ano inteiro — a visão de painel

export default async function DashboardPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  const brutoAno = Array.isArray(sp["exercicio"]) ? sp["exercicio"][0] : sp["exercicio"];
  const exercicio = brutoAno !== undefined && !Number.isNaN(Number.parseInt(brutoAno, 10)) ? Number.parseInt(brutoAno, 10) : ANO_PADRAO;

  const [despesa, rcl, asps, mde] = await Promise.all([
    tentar(async () => (await gerarRreoAnexo1({ exercicio, bimestre: BIMESTRE_PAINEL })).subtotalDespesas),
    tentar(async () => (await gerarRreoAnexo3({ exercicio, bimestre: BIMESTRE_PAINEL })).rcl.total12m),
    tentar(async () => {
      const a12 = await gerarRreoAnexo12({ exercicio, bimestre: BIMESTRE_PAINEL });
      // base de cálculo (III realizada): zero = não há impostos no período → estado neutro, não "abaixo".
      return { percent: a12.percentualAplicacao, atingiu: a12.atingiuMinimo, semMovimento: ehZero(a12.baseAsps.realizada) };
    }),
    tentar(async () => {
      const a8 = await gerarRreoAnexo8({ exercicio, bimestre: BIMESTRE_PAINEL });
      // base (6 — recebido do FUNDEB): zero = sem FUNDEB no período → neutro, não "abaixo".
      return { percent: a8.indicadorProfissionais, atingiu: a8.atingiuProfissionais, semMovimento: ehZero(a8.totalRecebidoFundeb) };
    }),
  ]);

  // pessoal (RGF): o Executivo é o limite principal (54%). Quadrimestre 3 = ano inteiro.
  const pessoal = await tentar(async () => {
    const rgf = await gerarRgfAnexo1({ exercicio, quadrimestre: 3 });
    const exec = rgf.poderes.find((p) => p.poder === "EXECUTIVO") ?? rgf.poderes[0];
    // base (VII — RCL ajustada): zero = sem base no período → neutro, não "abaixo".
    return exec === undefined ? null : { percent: exec.percentDtp, abaixo: exec.situacao === "abaixo", semMovimento: ehZero(rgf.rclAjustada) };
  });

  return (
    <div>
      <SincronizarHome />
      <PageHeader titulo="Painel" subtitulo={`Execução do exercício ${exercicio} — números reais, atualizados a cada carregamento.`} />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <CardLink href="/relatorios/rreo/anexo1" rotulo="Despesa do exercício" nota="Empenhada / liquidada / paga">
          {despesa === null ? (
            <Traco />
          ) : (
            <div className="space-y-0.5">
              <div className="text-lg font-semibold text-[color:var(--color-ink)]"><ValorMonetario valor={despesa.empenhadasAte} /></div>
              <div className="text-xs font-normal text-[color:var(--color-ink-2)]">liq. <ValorMonetario valor={despesa.liquidadasAte} /> · pago <ValorMonetario valor={despesa.pagasAte} /></div>
            </div>
          )}
        </CardLink>

        <CardLink href="/relatorios/rreo/anexo3" rotulo="Receita Corrente Líquida" nota="Últimos 12 meses (III)">
          {rcl === null ? <Traco /> : <ValorMonetario valor={rcl} />}
        </CardLink>

        <CardLink href="/relatorios/rreo/anexo12" rotulo="Aplicação em Saúde" nota="Mínimo 15% (ASPS)">
          {asps === null ? <Traco /> : <Indicador percent={asps.percent} atingiu={asps.atingiu} rotulo="≥ 15%" semMovimento={asps.semMovimento} />}
        </CardLink>

        <CardLink href="/relatorios/rreo/anexo8" rotulo="Profissionais da Educação" nota="Mínimo 70% do FUNDEB">
          {mde === null ? <Traco /> : <Indicador percent={mde.percent} atingiu={mde.atingiu} rotulo="≥ 70%" semMovimento={mde.semMovimento} />}
        </CardLink>

        <CardLink href="/relatorios/rgf/anexo1" rotulo="Pessoal (Executivo)" nota="Limite 54% da RCL">
          {pessoal === null ? <SemMovimento /> : <Indicador percent={pessoal.percent} atingiu={pessoal.abaixo} rotulo="abaixo do alerta" semMovimento={pessoal.semMovimento} />}
        </CardLink>
      </div>

      <div className="mt-6">
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-ink)]">Relatórios</h2>
          <p className="text-sm text-[color:var(--color-ink-2)]">
            Os demonstrativos fiscais (RREO) estão em{" "}
            <Link href="/relatorios" className="font-medium text-[color:var(--color-primary)] hover:underline">Relatórios</Link>. Cada card acima leva ao seu.
          </p>
        </Card>
      </div>
    </div>
  );
}

/** Executa uma leitura de porta; qualquer falha vira `null` (o card mostra um traço). */
async function tentar<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

function CardLink({ href, rotulo, nota, children }: { readonly href: string; readonly rotulo: string; readonly nota: string; readonly children: React.ReactNode }): React.ReactElement {
  return <CardIndicador href={href} rotulo={rotulo} valor={children} descricao={nota} />;
}

/**
 * O indicador de limite. Quando NÃO há base de cálculo no período (`semMovimento`), o vermelho
 * "abaixo" seria alarme falso — não há o que aplicar. Nesse caso mostra o estado neutro; com base
 * real (>0), o vermelho continua, e a honestidade do alerta é preservada.
 */
function Indicador({ percent, atingiu, rotulo, semMovimento = false }: { readonly percent: string; readonly atingiu: boolean; readonly rotulo: string; readonly semMovimento?: boolean }): React.ReactElement {
  if (semMovimento) return <SemMovimento />;
  return (
    <div className="flex items-center gap-2">
      <span className="tabular">{percent.replace(".", ",")}%</span>
      <Badge status={atingiu ? "ok" : "erro"}>{atingiu ? rotulo : "abaixo"}</Badge>
    </div>
  );
}

/** Estado NEUTRO (cinza) — sem base/movimento no período. Nunca um travessão solto nem um alarme falso. */
function SemMovimento(): React.ReactElement {
  return (
    <span className="text-sm font-normal text-[color:var(--color-ink-3)]">
      <Badge status="neutro">sem movimento no período</Badge>
    </span>
  );
}

/** O valor monetário/percentual em string é zero? (só dígitos; "0,00"/"0.00"/"0"/"" contam). */
function ehZero(valor: string): boolean {
  return valor.replace(/\D/g, "").replace(/0+/g, "") === "";
}

function Traco(): React.ReactElement {
  return <span className="text-[color:var(--color-ink-3)]" title="Sem dado disponível">—</span>;
}
