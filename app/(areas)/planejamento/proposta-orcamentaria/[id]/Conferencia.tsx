import Link from "next/link";
import { Badge } from "../../../../../components/ui/Badge";
import { TabelaDeDados, type ColunaTabela } from "../../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import type { ConferenciaDaProposta } from "../../../../../lib/portas/proposta-orcamentaria";
import { toMoney } from "../../../../../packages/contracts/index";

/**
 * A CONFERÊNCIA ANTES DA VOTAÇÃO (V31) — o laudo que `conferirProposta` calcula a cada leitura, na
 * linguagem do contador: cada verificação diz o que foi conferido, o que achou e onde se corrige.
 * Nada aqui decide: a tela só mostra.
 */

const SELO = {
  CONFORME: { status: "ok", rotulo: "Conforme" },
  ATENCAO: { status: "alerta", rotulo: "Atenção" },
  IMPEDE: { status: "erro", rotulo: "Impede gerar" },
} as const;

type LinhaAcao = ConferenciaDaProposta["acoesDoPpa"][number];

export function ConferenciaDaPropostaSecao({ c }: { readonly c: ConferenciaDaProposta }): React.ReactElement {
  const pendentes = c.verificacoes.filter((v) => v.situacao !== "CONFORME").length;
  const colunas: readonly ColunaTabela<LinhaAcao>[] = [
    { chave: "acao", cabecalho: "Programa / ação", celula: (a) => <span>{a.programaCodigo} / {a.acaoCodigo} — {a.acaoDescricao}</span> },
    {
      chave: "meta",
      cabecalho: "Meta do plano",
      alinhamento: "direita",
      celula: (a) => (
        <span>
          <ValorMonetario valor={a.metaDoPlano} />
          {a.alteracoesDaMeta > 0 ? <span className="block text-xs text-[color:var(--color-ink-3)]">com {a.alteracoesDaMeta} alteração(ões)</span> : null}
        </span>
      ),
    },
    {
      chave: "anteriores",
      cabecalho: "Dotação atualizada nos anos anteriores",
      celula: (a) =>
        a.anosAnteriores.length === 0 ? (
          <span className="text-xs text-[color:var(--color-ink-3)]">sem fichas</span>
        ) : (
          <span className="text-xs">
            {a.anosAnteriores.map((x) => (
              <span key={x.exercicio} className="block">
                {x.exercicio}: <ValorMonetario valor={x.dotacaoAtualizada} />
              </span>
            ))}
          </span>
        ),
    },
    { chave: "proposta", cabecalho: `Na proposta de ${c.exercicio}`, alinhamento: "direita", celula: (a) => <ValorMonetario valor={a.naProposta} /> },
    {
      chave: "restante",
      cabecalho: "Restante da meta",
      alinhamento: "direita",
      celula: (a) => (
        <span className={toMoney(a.restanteDaMeta).isNegative() ? "font-semibold text-[color:var(--color-status-erro-fg)]" : undefined}>
          <ValorMonetario valor={a.restanteDaMeta} />
          {toMoney(a.restanteDaMeta).isNegative() ? <span className="block text-xs">passa da meta do plano</span> : null}
        </span>
      ),
    },
  ];
  return (
    <section className="space-y-3 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3" aria-label="Conferência antes da votação" data-conferencia-da-proposta>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">Conferência antes da votação</h2>
        <p className="text-xs text-[color:var(--color-ink-3)]">
          {pendentes === 0 ? "Todas as verificações conformes." : `${pendentes} verificação(ões) pedem atenção.`} Recalculada a cada abertura desta página.
        </p>
      </div>
      <ul className="space-y-2">
        {c.verificacoes.map((v) => (
          <li key={v.codigo} data-verificacao={v.codigo} data-situacao={v.situacao} className="text-sm">
            <p>
              <Badge status={SELO[v.situacao].status}>{SELO[v.situacao].rotulo}</Badge> <strong>{v.titulo}.</strong> {v.resumo}
              {v.ondeCorrigir !== undefined ? (
                <>
                  {" "}
                  <Link className="text-[color:var(--color-primary)] underline" href={v.ondeCorrigir.href}>
                    {v.ondeCorrigir.rotulo}
                  </Link>
                </>
              ) : null}
            </p>
            {v.itens.length > 0 ? (
              <ul className="ml-5 mt-1 list-disc text-xs text-[color:var(--color-ink-2)]">
                {v.itens.slice(0, 20).map((i) => (
                  <li key={i}>{i}</li>
                ))}
                {v.itens.length > 20 ? <li>e mais {v.itens.length - 20}.</li> : null}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
      {c.plano !== null && c.acoesDoPpa.length > 0 ? (
        <details className="text-sm" data-acoes-do-ppa>
          <summary className="cursor-pointer font-medium text-[color:var(--color-ink)]">
            Ações do PPA {c.plano.anoInicio}–{c.plano.anoFim} e as fichas ({c.acoesDoPpa.length})
          </summary>
          <p className="my-2 text-xs text-[color:var(--color-ink-2)]">
            Por que a ação difere das fichas: a meta financeira do PPA ({c.plano.leiRef}) vale para os quatro anos do plano; as fichas trazem o valor de
            cada ano. O restante é a meta menos o que os anos anteriores já dotaram e o que esta proposta põe.
          </p>
          <TabelaDeDados colunas={colunas} linhas={c.acoesDoPpa} keyDe={(a) => `${a.programaCodigo}/${a.acaoCodigo}`} legenda="valores em R$" />
        </details>
      ) : null}
    </section>
  );
}
