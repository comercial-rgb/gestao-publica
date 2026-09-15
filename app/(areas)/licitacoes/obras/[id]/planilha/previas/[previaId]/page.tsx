import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "../../../../../../../../components/ui/Badge";
import { Card } from "../../../../../../../../components/ui/Card";
import { ValorMonetario } from "../../../../../../../../components/ui/ValorMonetario";
import { diaCivil } from "../../../../../../../../packages/datas/index.js";
import { qtdBr } from "../../../../../../../../lib/format/quantidade";
import { exigirLeitura } from "../../../../../../../../lib/portas/molde";
import { previaParaTela } from "../../../../../../../../lib/portas/planilha-da-obra";
import { FormConfirmarPrevia } from "../../FormulariosDaPlanilha";
import { AvisosDosAtos, ResultadosDosAtos } from "../../../../../../../../components/ui/ResultadosDosAtos";

/** A PRÉVIA DA IMPORTAÇÃO (V7 M2 U6) — colunas reconhecidas, linhas, erros, divergências e o que foi ignorado. */
export const dynamic = "force-dynamic";

const NOME: Readonly<Record<string, string>> = { codigo: "item", referencia: "referência", descricao: "descrição", unidade: "unidade", quantidade: "quantidade", precoUnitario: "preço unitário", total: "total" };

export default async function PreviaDaPlanilhaPage({ params }: { readonly params: Promise<{ readonly id: string; readonly previaId: string }> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_LICITACOES");
  const { id, previaId } = await params;
  const p = await previaParaTela(id, previaId);
  if (p === null) notFound();
  const a = p.analise;
  return (
    <ResultadosDosAtos>
    <div className="space-y-4" data-previa-da-planilha={p.id}>
      <AvisosDosAtos />
      <nav aria-label="Trilha" className="text-xs text-[color:var(--color-ink-2)]">
        <Link href="/licitacoes/obras" className="underline underline-offset-2">Obras</Link> / <Link href={`/licitacoes/obras/${id}/planilha`} className="underline underline-offset-2">Planilha orçamentária</Link> / Prévia
      </nav>
      <header>
        <h1 className="text-xl font-semibold [overflow-wrap:anywhere]">Prévia de {p.nomeDoArquivo}</h1>
        <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">{p.formato} · {(p.tamanhoBytes / 1024).toFixed(0)} KB · aba “{a.aba}” · cabeçalho na linha {a.linhaDoCabecalho} · sha256 <span className="break-all font-mono text-xs">{p.sha256}</span></p>
      </header>
      <Card>
        <div className="flex flex-wrap gap-2" data-resumo-da-previa>
          <Badge status={a.erros.length === 0 ? "ok" : "alerta"}>{a.erros.length} linha(s) com erro</Badge>
          <Badge status={a.divergencias.length === 0 ? "ok" : "alerta"}>{a.divergencias.length} divergência(s) de conciliação</Badge>
          <Badge status="neutro">{a.itens.filter((i) => i.tipo === "SERVICO").length} serviço(s)</Badge>
          <Badge status="neutro">{a.celulasComFormula} célula(s) com fórmula: vale o valor gravado</Badge>
          {a.macros ? <Badge status="alerta">o arquivo tem macros: não foram executadas</Badge> : null}
        </div>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-[color:var(--color-ink-2)]">Total calculado (quantidade × preço, por linha)</dt><dd><ValorMonetario valor={a.totalCalculado} comSimbolo /></dd></div>
          <div><dt className="text-xs text-[color:var(--color-ink-2)]">Total declarado no arquivo</dt><dd>{a.totalDeclarado === null ? "não encontrado" : <ValorMonetario valor={a.totalDeclarado} comSimbolo />}</dd></div>
          <div><dt className="text-xs text-[color:var(--color-ink-2)]">Colunas</dt><dd className="[overflow-wrap:anywhere]">{Object.entries(p.colunas).map(([k, l]) => `${NOME[k] ?? k}: ${l}`).join(" · ")}</dd></div>
        </dl>
      </Card>
      {a.erros.length === 0 ? null : (
        <Card>
          <h2 className="mb-2 text-sm font-semibold">Erros por linha (impedem a confirmação)</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm" data-erros-da-previa>{a.erros.map((e, k) => <li key={k}>Linha {e.linha}{e.codigo === null ? "" : ` (item ${e.codigo})`}: {e.mensagem}</li>)}</ul>
        </Card>
      )}
      {a.divergencias.length === 0 ? null : (
        <Card>
          <h2 className="mb-2 text-sm font-semibold">Divergências de conciliação (exigem ciência para confirmar)</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm" data-divergencias-da-previa>{a.divergencias.map((d, k) => <li key={k}>{d.linha === 0 ? "Total geral" : `Linha ${d.linha}${d.codigo === null ? "" : ` (item ${d.codigo})`}`}: {d.mensagem}</li>)}</ul>
        </Card>
      )}
      <Card>
        <h2 className="mb-2 text-sm font-semibold">Linhas que serão importadas</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-left text-sm" data-itens-da-previa>
            <thead><tr className="text-xs text-[color:var(--color-ink-2)]"><th className="py-1 pr-2">Linha</th><th className="py-1 pr-2">Item</th><th className="py-1 pr-2">Descrição</th><th className="py-1 pr-2">Unidade</th><th className="py-1 pr-2 text-right">Quantidade</th><th className="py-1 pr-2 text-right">Preço unitário</th><th className="py-1 pr-2 text-right">Total calculado</th><th className="py-1 text-right">Total no arquivo</th></tr></thead>
            <tbody>
              {a.itens.map((i) => (
                <tr key={`${i.linha}-${i.codigo}`} className={`border-t border-[color:var(--color-border)] ${i.tipo === "GRUPO" ? "font-semibold" : ""}`}>
                  <td className="py-1 pr-2 tabular-nums">{i.linha}</td>
                  <td className="py-1 pr-2">{i.codigo}</td>
                  <td className="py-1 pr-2 [overflow-wrap:anywhere]" style={{ paddingLeft: `${(i.nivel - 1) * 0.75}rem` }}>{i.descricao}{i.referencia === null ? "" : <span className="block text-xs font-normal text-[color:var(--color-ink-2)]">{i.referencia}</span>}</td>
                  <td className="py-1 pr-2">{i.unidade ?? ""}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{i.quantidade === null ? "" : qtdBr(i.quantidade)}</td>
                  <td className="py-1 pr-2 text-right">{i.precoUnitario === null ? "" : <ValorMonetario valor={i.precoUnitario} />}</td>
                  <td className="py-1 pr-2 text-right"><ValorMonetario valor={i.valor} /></td>
                  <td className="py-1 text-right">{i.valorNoArquivo === null ? "" : <ValorMonetario valor={i.valorNoArquivo} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {a.ignoradas.length === 0 ? null : <details className="mt-3 text-sm"><summary className="cursor-pointer text-xs font-semibold">{a.ignoradas.length} linha(s) sem código, não importadas</summary><ul className="mt-1 list-disc pl-5 text-xs">{a.ignoradas.map((x, k) => <li key={k} className="[overflow-wrap:anywhere]">Linha {x.linha}: {x.mensagem}</li>)}</ul></details>}
      </Card>
      {p.confirmada !== null ? <p className="text-sm" data-previa-confirmada>Esta prévia já é a <Link href={`/licitacoes/obras/${id}/planilha/versoes/${p.confirmada.planilhaId}`} className="text-[color:var(--color-primary)] underline underline-offset-2">versão {p.confirmada.versao}</Link>.</p>
        : a.erros.length > 0 ? <p className="text-sm font-semibold" data-previa-bloqueada>Corrija as linhas com erro no arquivo e importe de novo: esta prévia não pode ser confirmada.</p>
          : p.podeGerir ? <FormConfirmarPrevia obraId={id} previaId={p.id} divergencias={a.divergencias.length} hoje={diaCivil(new Date())} />
            : <p className="text-xs text-[color:var(--color-ink-2)]">Confirmar a prévia é da engenharia de obras (a ação de gerir a planilha da obra no seu perfil).</p>}
    </div>
    </ResultadosDosAtos>
  );
}
