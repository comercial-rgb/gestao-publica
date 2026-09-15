import Link from "next/link";
import { notFound } from "next/navigation";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import { identidadePublica } from "../../../../lib/portas/identidade";
import { contratoPublico } from "../../../../lib/portas/contrato-acompanhado";

/**
 * UM CONTRATO — PROJEÇÃO PÚBLICA (V7 M2.1). O que a porta devolve é o que aparece: nada de ocorrência,
 * evidência, agenda, conta de usuário, documento de pessoa ou medição não aprovada.
 */
export const dynamic = "force-dynamic";

const TIPO: Readonly<Record<string, string>> = {
  ACRESCIMO_VALOR: "Acréscimo de valor", SUPRESSAO_VALOR: "Supressão de valor", PRORROGACAO_PRAZO: "Prorrogação de prazo",
  ESTORNO_ACRESCIMO_VALOR: "Estorno de acréscimo", ESTORNO_SUPRESSAO_VALOR: "Estorno de supressão", ESTORNO_PRORROGACAO_PRAZO: "Estorno de prorrogação",
};
const num = (v: string): string => v.replace(/\.?0+$/, "").replace(".", ",");

export default async function ContratoPublicoPage({ params }: { readonly params: Promise<{ readonly id: string }> }): Promise<React.ReactElement> {
  const { id } = await params;
  const [c, ente] = await Promise.all([contratoPublico(id), identidadePublica()]);
  if (c === null) notFound();
  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6" data-tema={ente.ente?.tema ?? "PADRAO"} data-contrato-publico>
      <p className="mb-2 text-xs"><Link href="/transparencia/contratos" className="text-[color:var(--color-primary)] hover:underline">Contratos</Link> / {c.numero}</p>
      <header className="mb-4 border-b border-[color:var(--color-border)] pb-3">
        <h1 className="text-xl font-semibold">Contrato {c.numero}</h1>
        <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">{c.contratado} · vigência {c.vigencia.inicio} a {c.vigencia.fim}</p>
      </header>
      <section className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3"><p className="text-xs text-[color:var(--color-ink-2)]">Valor inicial</p><p><ValorMonetario valor={c.valorInicial} comSimbolo /></p></div>
        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3"><p className="text-xs text-[color:var(--color-ink-2)]">Valor vigente (com aditivos)</p><p><ValorMonetario valor={c.valorVigente} comSimbolo /></p></div>
        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3"><p className="text-xs text-[color:var(--color-ink-2)]">Medições aprovadas</p><p>{c.medicoesAprovadas.quantidade} · <ValorMonetario valor={c.medicoesAprovadas.valor} comSimbolo /></p></div>
      </section>
      {c.objeto !== null ? <p className="mb-4 whitespace-pre-line text-sm"><strong>Objeto:</strong> {c.objeto}</p> : null}
      <h2 className="mb-1 text-sm font-semibold">Gestão e fiscalização</h2>
      {c.responsaveis.length === 0 ? <p className="mb-4 text-sm text-[color:var(--color-ink-2)]">Nenhum gestor ou fiscal com designação vigente registrada.</p> : (
        <ul className="mb-4 list-disc pl-5 text-sm" data-responsaveis>{c.responsaveis.map((r, i) => <li key={i}>{r.papel === "GESTOR" ? "Gestor" : "Fiscal"}: {r.nome} — {r.ato} (desde {r.desde})</li>)}</ul>
      )}
      <h2 className="mb-1 text-sm font-semibold">Aditivos</h2>
      {c.aditivos.length === 0 ? <p className="mb-4 text-sm text-[color:var(--color-ink-2)]">Nenhum aditivo.</p> : (
        <ul className="mb-4 list-disc pl-5 text-sm">{c.aditivos.map((a, i) => <li key={i}>{a.numero ?? "sem número"} · {TIPO[a.tipo] ?? a.tipo} · {a.data}{a.valor === null ? "" : ` · R$ ${num(a.valor)}`}{a.dias === null ? "" : ` · ${a.dias} dia(s)`}</li>)}</ul>
      )}
      <h2 className="mb-1 text-sm font-semibold">Execução física (medições aprovadas)</h2>
      {c.execucaoFisica.length === 0 ? <p className="text-sm text-[color:var(--color-ink-2)]">Sem itens publicados.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm" data-execucao-fisica>
            <thead><tr className="text-xs text-[color:var(--color-ink-2)]"><th className="py-1 pr-3">Item</th><th className="py-1 pr-3">Unidade</th><th className="py-1 pr-3 text-right">Contratado</th><th className="py-1 pr-3 text-right">Medido e aprovado</th><th className="py-1 text-right">%</th></tr></thead>
            <tbody>{c.execucaoFisica.map((i) => <tr key={i.item} className="border-t border-[color:var(--color-border)]"><td className="py-2 pr-3">{i.item} — {i.descricao}</td><td className="py-2 pr-3">{i.unidade}</td><td className="py-2 pr-3 text-right">{num(i.contratado)}</td><td className="py-2 pr-3 text-right">{num(i.medidoAprovado)}</td><td className="py-2 text-right">{i.percentual}%</td></tr>)}</tbody>
          </table>
        </div>
      )}
      <h2 className="mb-1 mt-4 text-sm font-semibold">Execução por ordens de serviço</h2>
      {c.execucaoPorOrdens.ordens.length === 0 ? <p className="text-sm text-[color:var(--color-ink-2)]" data-publico-sem-ordens>Nenhuma ordem de serviço emitida.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-left text-sm" data-publico-ordens>
            <thead><tr className="text-xs text-[color:var(--color-ink-2)]"><th className="py-1 pr-3">Ordem</th><th className="py-1 pr-3">Período autorizado</th><th className="py-1 pr-3 text-right">Autorizado</th><th className="py-1 text-right">Recebido em definitivo</th></tr></thead>
            <tbody>{c.execucaoPorOrdens.ordens.map((o) => <tr key={o.numero} className="border-t border-[color:var(--color-border)]"><td className="py-2 pr-3">nº {o.numero}</td><td className="py-2 pr-3">{o.periodo}</td><td className="py-2 pr-3 text-right"><ValorMonetario valor={o.autorizado} comSimbolo /></td><td className="py-2 text-right"><ValorMonetario valor={o.recebido} comSimbolo /></td></tr>)}</tbody>
          </table>
        </div>
      )}
      <p className="mt-4 text-xs text-[color:var(--color-ink-3)]">Execução física é a medida aprovada ou recebida; não é pagamento. Pagamentos seguem pela despesa do ente.</p>
    </main>
  );
}
