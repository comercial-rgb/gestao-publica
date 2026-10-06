import Link from "next/link";
import { notFound } from "next/navigation";
import { TabelaDeDados, type ColunaTabela } from "../../../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../../../components/ui/ValorMonetario";
import { identidadePublica } from "../../../../../../lib/portas/identidade";
import { lerLoaPublica, PortaSemBancoError, type LoaDaTela } from "../../../../../../lib/portas/planejamento-publico";

import { mensagemDoErro } from "../../../../../../lib/portas/mensagem-do-erro";
/**
 * V35 C9 — A LOA APROVADA NO PORTAL: o resumo e os anexos da Lei 4.320/1964, a mesma montagem e a mesma conferência da
 * tela interna (`loaDoExercicio`). Exercício sem lei de aprovação responde 404: o projeto não é publicado aqui.
 */
export const dynamic = "force-dynamic";

type Quadro = LoaDaTela["anexos"][number]["quadros"][number];
type Linha = Quadro["linhas"][number];

function colunas(q: Quadro): ColunaTabela<Linha>[] {
  return [
    { chave: "codigo", cabecalho: "Código", celula: (l) => <span className="font-mono text-xs">{l.codigo}</span> },
    {
      chave: "especificacao",
      cabecalho: "Especificação",
      celula: (l) => (
        <span style={{ paddingLeft: `${l.profundidade * 1.25}rem` }} className="inline-block">
          {l.nivel === "nivel1" || l.nivel === "total" ? <strong>{l.especificacao}</strong> : l.especificacao}
        </span>
      ),
    },
    ...q.colunas.map<ColunaTabela<Linha>>((c, i) => ({ chave: `v${String(i)}`, cabecalho: c, alinhamento: "direita", celula: (l) => <ValorMonetario valor={l.valores[i] ?? "0.00"} /> })),
  ];
}

export default async function LoaPublicaPage({ params }: { readonly params: Promise<{ readonly exercicio: string }> }): Promise<React.ReactElement> {
  const { exercicio: bruto } = await params;
  if (!/^\d{4}$/.test(bruto)) notFound();
  const exercicio = Number(bruto);
  const id = await identidadePublica();
  let loa: LoaDaTela | null;
  try {
    loa = await lerLoaPublica(exercicio);
  } catch (e) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <p role="alert" className="text-sm">{e instanceof PortaSemBancoError ? "Consulta indisponível no momento." : e instanceof Error ? mensagemDoErro(e, "") : "Não foi possível montar a LOA."}</p>
      </main>
    );
  }
  if (loa === null) notFound();
  const r = loa.resumo;
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <nav aria-label="Caminho" className="text-xs">
        <Link href="/transparencia" className="underline">Transparência</Link> › <Link href="/transparencia/planejamento" className="underline">Planejamento</Link> › LOA {exercicio}
      </nav>
      <header>
        <h1 className="text-2xl font-semibold text-[color:var(--color-ink)]">Lei Orçamentária Anual de {exercicio}</h1>
        <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">{id.ente?.nomeDeExibicao ?? "Ente não configurado"} · valores da lei aprovada: dotação inicial e previsão inicial da receita.</p>
      </header>
      <section aria-label="Resumo" className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
          <div className="text-xs text-[color:var(--color-ink-3)]">Receita prevista</div>
          <ValorMonetario valor={r.receitaPrevista} />
        </div>
        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
          <div className="text-xs text-[color:var(--color-ink-3)]">Despesa fixada</div>
          <ValorMonetario valor={r.despesaFixada} />
        </div>
        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
          <div className="text-xs text-[color:var(--color-ink-3)]">Diferença (receita − despesa)</div>
          <ValorMonetario valor={r.diferenca} />
        </div>
      </section>
      {loa.anexos.map((a) => (
        <section key={a.numero} aria-label={`Anexo ${a.numero}`} className="space-y-2">
          <h2 className="text-base font-semibold">Anexo {a.numero} — {a.titulo}</h2>
          <p className="text-xs text-[color:var(--color-ink-3)]">{a.fundamento}</p>
          {a.quadros.map((q, i) => (
            <TabelaDeDados key={`${a.numero}-${String(i)}`} colunas={colunas(q)} linhas={q.linhas} keyDe={(l) => String(q.linhas.indexOf(l))} legenda={q.titulo} />
          ))}
          {a.notas.length > 0 ? (
            <ul className="list-disc pl-5 text-xs text-[color:var(--color-ink-3)]">
              {a.notas.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
    </main>
  );
}
