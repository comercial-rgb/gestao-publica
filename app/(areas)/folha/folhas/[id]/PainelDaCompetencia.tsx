import { Badge, type StatusBadge } from "../../../../../components/ui/Badge";
import type { DisponibilidadeDoRegistro } from "../../../../../lib/molde/tipos";

/**
 * O PAINEL DA COMPETÊNCIA (V7 M1 U5) — o resumo no topo do detalhe da folha.
 *
 * Antes dele, a folha era uma pilha de seções (dados, barra, atesto, empenhos, encargos, obrigações,
 * contracheques) e a pessoa rolava para descobrir em que pé estava cada dimensão. Aqui cada DIMENSÃO
 * aparece com a sua situação, lado a lado e SEPARADAS (atestado não é liquidado, liquidado não é pago),
 * com o salto para a seção; e a PRÓXIMA AÇÃO sai da mesma disponibilidade que monta a barra — o painel
 * não tem regra própria, só lê o que o servidor já decidiu.
 *
 * Só apresentação: nenhum valor é recalculado aqui.
 */

export interface EtapaDoPainel {
  readonly nome: string;
  readonly situacao: string;
  readonly tom: StatusBadge;
  readonly detalhe?: string;
  readonly ancora?: string;
}

export function PainelDaCompetencia({ etapas, acoes, disponibilidade, permitidas }: {
  readonly etapas: readonly EtapaDoPainel[];
  readonly acoes: readonly { readonly nome: string; readonly rotulo: string; readonly acaoDoCenso: string }[];
  readonly disponibilidade: DisponibilidadeDoRegistro | null;
  readonly permitidas: ReadonlySet<string>;
}): React.ReactElement {
  const minhas = acoes.filter((a) => permitidas.has(a.acaoDoCenso));
  const disponiveis = disponibilidade === null ? [] : minhas.filter((a) => disponibilidade.porAcao[a.nome]?.apresentacao === "disponivel");
  const travadas = disponibilidade === null ? [] : minhas.filter((a) => disponibilidade.porAcao[a.nome]?.apresentacao === "bloqueada");
  return (
    <section aria-label="Situação da competência" data-painel-da-competencia className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4 shadow-[var(--shadow-card)] sm:p-5">
      <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">Situação da competência</h2>
      <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {etapas.map((e) => (
          <li key={e.nome} data-etapa={e.nome} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-3 py-2">
            <p className="text-xs text-[color:var(--color-ink-2)]">{e.nome}</p>
            <p className="mt-1"><Badge status={e.tom}>{e.situacao}</Badge></p>
            {e.detalhe !== undefined ? <p className="mt-1 text-xs text-[color:var(--color-ink-2)] [overflow-wrap:anywhere]">{e.detalhe}</p> : null}
            {e.ancora !== undefined ? <a href={`#${e.ancora}`} className="mt-1 inline-block text-xs text-[color:var(--color-primary)] underline underline-offset-2">Ver a seção</a> : null}
          </li>
        ))}
      </ol>
      <div className="mt-4 border-t border-[color:var(--color-border)] pt-3" data-proxima-acao={disponiveis.length > 0 ? "sim" : "nao"}>
        {disponibilidade === null ? (
          <p className="text-sm text-[color:var(--color-ink-2)]">Não foi possível conferir os atos agora: a barra abaixo aparece travada, e nada foi liberado por falta de conferência.</p>
        ) : disponiveis.length > 0 ? (
          <>
            <p className="text-sm font-semibold text-[color:var(--color-ink)]">O que você pode fazer agora</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {disponiveis.map((a) => (
                <li key={a.nome}><a href={`#ato-${a.nome}`} className="inline-flex min-h-9 items-center rounded-[var(--radius-md)] bg-[color:var(--color-primary)] px-3 text-xs font-semibold text-[color:var(--color-primary-fg)]">{a.rotulo}</a></li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-[color:var(--color-ink-2)]">Nenhum ato do seu perfil está disponível nesta folha agora.</p>
        )}
        {travadas.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {travadas.map((a) => (
              <li key={a.nome} className="text-xs text-[color:var(--color-ink-2)]"><span className="font-medium text-[color:var(--color-ink)]">{a.rotulo}:</span> {disponibilidade?.porAcao[a.nome]?.motivo ?? "travado"}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
