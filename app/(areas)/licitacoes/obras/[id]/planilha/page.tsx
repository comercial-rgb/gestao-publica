import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "../../../../../../components/ui/Card";
import { ValorMonetario } from "../../../../../../components/ui/ValorMonetario";
import { exigirLeitura } from "../../../../../../lib/portas/molde";
import { planilhasDaObraParaTela } from "../../../../../../lib/portas/planilha-da-obra";
import { FormImportarPlanilha } from "./FormulariosDaPlanilha";
import { AvisosDosAtos, ResultadosDosAtos } from "../../../../../../components/ui/ResultadosDosAtos";

/** A PLANILHA ORÇAMENTÁRIA DA OBRA (V7 M2 U6) — as versões confirmadas, as prévias em aberto e a importação. */
export const dynamic = "force-dynamic";

const br = (dia: string): string => dia.split("-").reverse().join("/");

export default async function PlanilhaDaObraPage({ params }: { readonly params: Promise<{ readonly id: string }> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_LICITACOES");
  const { id } = await params;
  const t = await planilhasDaObraParaTela(id);
  if (t === null) notFound();
  return (
    <ResultadosDosAtos>
    <div className="space-y-4" data-planilha-da-obra={t.obra.identificador}>
      <AvisosDosAtos />
      <nav aria-label="Trilha" className="text-xs text-[color:var(--color-ink-2)]">
        <Link href="/licitacoes/obras" className="underline underline-offset-2">Obras</Link> / <Link href={`/licitacoes/obras/${id}`} className="underline underline-offset-2">{t.obra.identificador}</Link> / Planilha orçamentária
      </nav>
      <header>
        <h1 className="text-xl font-semibold">Planilha orçamentária</h1>
        <p className="mt-1 text-sm text-[color:var(--color-ink-2)] [overflow-wrap:anywhere]">{t.obra.identificador} — {t.obra.descricao}</p>
      </header>
      <Card>
        <h2 className="mb-2 text-sm font-semibold">Versões</h2>
        {t.versoes.length === 0 ? <p className="text-sm text-[color:var(--color-ink-2)]" data-sem-versoes>Nenhuma versão confirmada. Importe o arquivo do orçamento e confirme a prévia.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm" data-versoes-da-planilha>
              <thead><tr className="text-xs text-[color:var(--color-ink-2)]"><th className="py-1 pr-2">Versão</th><th className="py-1 pr-2">Vale desde</th><th className="py-1 pr-2">Referência de preços</th><th className="py-1 pr-2">Contrato</th><th className="py-1 pr-2 text-right">Linhas</th><th className="py-1 text-right">Total</th></tr></thead>
              <tbody>
                {t.versoes.map((v) => (
                  <tr key={v.id} className="border-t border-[color:var(--color-border)]" data-versao={v.versao}>
                    <td className="py-2 pr-2"><Link href={`/licitacoes/obras/${id}/planilha/versoes/${v.id}`} className="text-[color:var(--color-primary)] underline underline-offset-2">versão {v.versao}</Link><span className="block text-xs text-[color:var(--color-ink-2)] [overflow-wrap:anywhere]">{v.descricao}</span></td>
                    <td className="py-2 pr-2">{br(v.vigenciaInicio)}</td>
                    <td className="py-2 pr-2 [overflow-wrap:anywhere]">{v.referenciaDePrecos} (data-base {br(v.dataBaseDosPrecos)})</td>
                    <td className="py-2 pr-2">{v.contrato ?? "não informado"}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{v.itens}</td>
                    <td className="py-2 text-right"><ValorMonetario valor={v.valorTotal} comSimbolo /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {t.previasPendentes.length === 0 ? null : (
        <Card>
          <h2 className="mb-2 text-sm font-semibold">Prévias não confirmadas</h2>
          <ul className="space-y-1 text-sm" data-previas-pendentes>
            {t.previasPendentes.map((p) => (
              <li key={p.id}><Link href={`/licitacoes/obras/${id}/planilha/previas/${p.id}`} className="text-[color:var(--color-primary)] underline underline-offset-2 [overflow-wrap:anywhere]">{p.nomeDoArquivo}</Link> · {p.formato} · {p.erros} erro(s) · {p.divergencias} divergência(s) · <ValorMonetario valor={p.totalCalculado} comSimbolo /></li>
            ))}
          </ul>
        </Card>
      )}
      {t.podeGerir ? <FormImportarPlanilha obraId={id} /> : <p className="text-xs text-[color:var(--color-ink-2)]" data-motivo-da-planilha>Importar e confirmar a planilha exige a permissão de gerir a planilha da obra.</p>}
    </div>
    </ResultadosDosAtos>
  );
}
