import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "../../../../../components/ui/Badge";
import { Card } from "../../../../../components/ui/Card";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import { lerArrecadacao, type ArrecadacaoDetalhada } from "../../../../../lib/portas/arrecadacao-detalhe";
import { EscopoDeLeituraError } from "../../../../../lib/portas/contexto";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { dataBr } from "../../../../../lib/recorte";

/**
 * UMA ARRECADAÇÃO (V33) — a cadeia da receita de ponta a ponta: classificação → entidade e fonte → conta bancária →
 * conciliação → lançamento → razão → demonstrativo. Cada elo abre onde mora; o que falta é dito.
 */
export const dynamic = "force-dynamic";

const LINK = "text-[color:var(--color-primary)] underline";

function Elo({ rotulo, children }: { readonly rotulo: string; readonly children: React.ReactNode }): React.ReactElement {
  return (
    <div>
      <dt className="text-[color:var(--color-ink-3)]">{rotulo}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export default async function ArrecadacaoPage({ params }: { readonly params: Promise<{ readonly id: string }> }): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_RECEITA");
  const { id } = await params;
  let a: ArrecadacaoDetalhada | null;
  try {
    a = await lerArrecadacao(id);
  } catch (e) {
    return (
      <div className="space-y-4">
        <PageHeader titulo="Arrecadação" subtitulo="" />
        <EstadoVazio titulo={e instanceof EscopoDeLeituraError ? "A receita do ente não está no seu acesso" : "Não foi possível ler a arrecadação"} descricao={e instanceof Error ? e.message : "Erro desconhecido."} />
      </div>
    );
  }
  if (a === null) notFound();
  const ano = a.dia.slice(0, 4);
  const periodo = `desde=${ano}-01-01&ate=${a.dia}&exercicio=${ano}`;
  return (
    <div className="space-y-4">
      <PageHeader titulo={`Arrecadação ${a.numero}`} subtitulo={`${dataBr(a.data)} · natureza ${a.natureza.codigo} — ${a.natureza.descricao}`} />
      <p className="text-xs" data-chrome>
        <Link className={LINK} href={`/receita/arrecadacoes?exercicio=${String(a.exercicio)}`}>Todas as arrecadações de {a.exercicio}</Link>
      </p>
      <Card>
        <h2 className="mb-2 text-sm font-semibold">A cadeia desta receita</h2>
        <dl className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3" data-cadeia-da-receita>
          <Elo rotulo="Valor">
            <ValorMonetario valor={a.valor} /> {a.anulacoes.length > 0 ? <Badge status="alerta">com anulação</Badge> : null}
          </Elo>
          <Elo rotulo="Classificação">
            natureza {a.natureza.codigo} · fonte {a.fonte}
            {a.co !== null ? ` · CO ${a.co}` : ""}
          </Elo>
          <Elo rotulo="Entidade titular">
            <span data-elo="entidade">{a.entidade === null ? "sem entidade atribuída" : `${a.entidade.codigo} — ${a.entidade.nome}`}</span>
          </Elo>
          <Elo rotulo="Conta bancária">
            <span data-elo="conta">
              {a.conta === null ? (
                "sem conta atribuída"
              ) : a.conta.contaContabil === null ? (
                `${a.conta.codigo} — ${a.conta.descricao} (sem conta contábil amarrada)`
              ) : (
                <Link className={LINK} href={`/relatorios/livros/razao?conta=${encodeURIComponent(a.conta.contaContabil)}&${periodo}`}>
                  {a.conta.codigo} — {a.conta.descricao} · razão da conta {a.conta.contaContabil}
                </Link>
              )}
            </span>
          </Elo>
          <Elo rotulo="Conciliação com o extrato">
            <span data-elo="conciliacao">
              {a.conciliacao.length === 0
                ? "não conciliada"
                : a.conciliacao.map((c) => `${dataBr(c.dataExtrato)} · ${c.conta} · ${c.memo}${c.documento !== null ? ` (${c.documento})` : ""}`).join("; ")}
            </span>
            {a.conta !== null ? (
              <>
                {" · "}
                <Link className={LINK} href={`/financeiro/conciliacao?exercicio=${ano}`}>conciliação bancária</Link>
              </>
            ) : null}
          </Elo>
          <Elo rotulo="Lançamento no razão">
            <Link className={LINK} href={`/contabilidade/lancamentos/${a.lancamentoId}`} data-elo="lancamento">abrir o lançamento</Link>
          </Elo>
          <Elo rotulo="Demonstrativo">
            <Link className={LINK} href={`/relatorios/demonstracoes/balanco-orcamentario?exercicio=${ano}`}>Balanço Orçamentário de {ano}</Link>
            {" · "}
            <Link className={LINK} href={`/relatorios/livros/balancete?${periodo}`}>balancete até o dia</Link>
          </Elo>
        </dl>
      </Card>
      {a.distribuicao.length > 0 ? (
        <Card>
          <h2 className="mb-2 text-sm font-semibold">Distribuição por fonte</h2>
          <ul className="text-xs" data-distribuicao>
            {a.distribuicao.map((d) => (
              <li key={d.fonte}>
                fonte {d.fonte}: <ValorMonetario valor={d.valor} /> {d.previstaNaLoa ? "" : "(não prevista na LOA)"}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {a.anulacoes.length > 0 ? (
        <Card>
          <h2 className="mb-2 text-sm font-semibold">Anulações</h2>
          <ul className="text-xs" data-anulacoes-da-receita>
            {a.anulacoes.map((n) => (
              <li key={n.id}>
                {n.numero} · {dataBr(n.data)} · <ValorMonetario valor={n.valor} /> ·{" "}
                <Link className={LINK} href={`/contabilidade/lancamentos/${n.lancamentoId}`}>lançamento da anulação</Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <p className="text-xs text-[color:var(--color-ink-3)]">Registrada por {a.criadoPor}.</p>
    </div>
  );
}
