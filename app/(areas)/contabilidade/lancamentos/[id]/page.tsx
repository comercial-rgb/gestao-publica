import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "../../../../../components/ui/Badge";
import { Card } from "../../../../../components/ui/Card";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { TabelaDeDados, type ColunaTabela } from "../../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import { EscopoDeLeituraError } from "../../../../../lib/portas/contexto";
import { lerLancamento, PortaSemBancoError, type LancamentoDetalhado, type PartidaDoLancamento } from "../../../../../lib/portas/lancamento-detalhe";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { anoCivil, diaCivilBr } from "../../../../../packages/datas/index";
import { toMoney } from "../../../../../packages/contracts/index";

/**
 * UM LANÇAMENTO (V31) — resumo, partidas, origem e estornos. Cada conta abre o próprio razão no exercício
 * do lançamento; a origem abre o documento. É o elo entre "este valor no balanço" e "este empenho".
 */
export const dynamic = "force-dynamic";

const LINK = "text-[color:var(--color-primary)] hover:underline";
const SUBSISTEMA: Readonly<Record<string, string>> = { ORCAMENTARIO: "Orçamentário", PATRIMONIAL: "Patrimonial", CONTROLE: "Controle" };

function colunas(l: LancamentoDetalhado): readonly ColunaTabela<PartidaDoLancamento>[] {
  const ano = String(anoCivil(l.dataTransacao));
  return [
    {
      chave: "conta",
      cabecalho: "Conta",
      celula: (p) => (
        <Link className={LINK} href={`/relatorios/livros/razao?conta=${encodeURIComponent(p.contaCodigo)}&exercicio=${ano}`} title="Abrir o razão desta conta">
          {p.contaCodigo} — {p.contaTitulo}
        </Link>
      ),
    },
    { chave: "sub", cabecalho: "Subsistema", celula: (p) => SUBSISTEMA[p.subsistema] ?? p.subsistema },
    { chave: "d", cabecalho: "Débito", alinhamento: "direita", celula: (p) => (p.tipo === "DEBITO" ? <ValorMonetario valor={p.valor} /> : null) },
    { chave: "c", cabecalho: "Crédito", alinhamento: "direita", celula: (p) => (p.tipo === "CREDITO" ? <ValorMonetario valor={p.valor} /> : null) },
    {
      chave: "ficha",
      cabecalho: "Ficha",
      celula: (p) =>
        p.ficha === null ? null : (
          <Link className={LINK} href={`/planejamento/fichas/${p.ficha.id}`}>
            {p.ficha.numero}/{p.ficha.exercicio}
          </Link>
        ),
    },
  ];
}

export default async function LancamentoPage({ params }: { readonly params: Promise<{ readonly id: string }> }): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_CONTABILIDADE");
  const { id } = await params;
  let l: LancamentoDetalhado | null;
  try {
    l = await lerLancamento(id);
  } catch (e) {
    return (
      <div className="space-y-4">
        <PageHeader titulo="Lançamento contábil" subtitulo="" />
        <EstadoVazio
          titulo={e instanceof EscopoDeLeituraError ? "A contabilidade do ente não está no seu acesso" : e instanceof PortaSemBancoError ? "Banco de dados não configurado" : "Não foi possível ler o lançamento"}
          descricao={e instanceof Error ? e.message : "Erro desconhecido."}
        />
      </div>
    );
  }
  if (l === null) notFound();
  // A conferência por subsistema, mostrada: débitos e créditos fecham em cada um (o motor validou ao gravar).
  const porSub = new Map<string, { d: ReturnType<typeof toMoney>; c: ReturnType<typeof toMoney> }>();
  for (const p of l.partidas) {
    const x = porSub.get(p.subsistema) ?? { d: toMoney("0"), c: toMoney("0") };
    if (p.tipo === "DEBITO") x.d = toMoney(x.d.plus(p.valor));
    else x.c = toMoney(x.c.plus(p.valor));
    porSub.set(p.subsistema, x);
  }
  return (
    <div className="space-y-4">
      <PageHeader titulo={`Lançamento ${l.numeroControle}`} subtitulo={`${diaCivilBr(l.dataTransacao)} · ${l.historico}`} />
      <p className="text-xs">
        <Link className={LINK} href="/contabilidade/lancamentos">
          Todos os lançamentos
        </Link>
      </p>
      <Card>
        <h2 className="mb-2 text-sm font-semibold">Resumo</h2>
        <dl className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-[color:var(--color-ink-3)]">Origem</dt>
            <dd data-origem-do-lancamento>
              {l.origem === null ? (
                <span>{l.origemTipo} — sem documento de origem (lançamento manual ou de encerramento)</span>
              ) : (
                <Link className={LINK} href={l.origem.href}>
                  {l.origem.rotulo} →
                </Link>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[color:var(--color-ink-3)]">Natureza</dt>
            <dd>{l.natureza === "ENCERRAMENTO" ? "Encerramento do exercício" : "Normal"}</dd>
          </div>
          <div>
            <dt className="text-[color:var(--color-ink-3)]">Registrado</dt>
            <dd>
              {diaCivilBr(l.criadoEm)} por {l.criadoPor}
            </dd>
          </div>
          {l.estornoDe === null ? null : (
            <div>
              <dt className="text-[color:var(--color-ink-3)]">Estorno do lançamento</dt>
              <dd>
                <Link className={LINK} href={`/contabilidade/lancamentos/${l.estornoDe.id}`}>
                  {l.estornoDe.numeroControle}
                </Link>
              </dd>
            </div>
          )}
          {l.estornos.length === 0 ? null : (
            <div>
              <dt className="text-[color:var(--color-ink-3)]">Estornado por</dt>
              <dd>
                {l.estornos.map((e) => (
                  <Link key={e.id} className={`${LINK} mr-2`} href={`/contabilidade/lancamentos/${e.id}`}>
                    {e.numeroControle}
                  </Link>
                ))}
              </dd>
            </div>
          )}
        </dl>
      </Card>
      <section className="space-y-2" aria-label="Partidas do lançamento">
        <h2 className="text-sm font-semibold">Partidas ({l.partidas.length})</h2>
        <TabelaDeDados colunas={colunas(l)} linhas={l.partidas} keyDe={(p) => p.id} legenda="valores em R$ · a conta abre o razão no exercício do lançamento" />
        <ul className="flex flex-wrap gap-2 text-xs" data-fechamento-por-subsistema>
          {[...porSub.entries()].map(([s, x]) => (
            <li key={s}>
              <Badge status={x.d.equals(x.c) ? "ok" : "erro"}>
                {SUBSISTEMA[s] ?? s}: débitos {x.d.toFixed(2).replace(".", ",")} · créditos {x.c.toFixed(2).replace(".", ",")}
              </Badge>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
