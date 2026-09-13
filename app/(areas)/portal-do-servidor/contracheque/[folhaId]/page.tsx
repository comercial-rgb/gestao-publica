import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "../../../../../components/ui/Card";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { meuContrachequePara } from "../../../../../lib/portas/portal-do-servidor";

/**
 * O CONTRACHEQUE DO PRÓPRIO SERVIDOR (V6 P2.4; TR 5.39.23) — a competência fechada, linha a
 * linha, com a conta de cada uma.
 *
 * ⚠️ A FOLHA VEM POR ID NA URL; O VÍNCULO, NUNCA. A porta cruza o id da folha com os vínculos da
 * pessoa da sessão: trocar o id na barra de endereços devolve "não encontrado", não o contracheque
 * de outra pessoa. Quem tem mais de uma matrícula vê um bloco por matrícula.
 */
export const dynamic = "force-dynamic";

export default async function Pagina({ params }: { readonly params: Promise<{ readonly folhaId: string }> }): Promise<React.ReactElement> {
  const sessao = await telaExigeLeituraDoEnte("CONSULTAR_PORTAL_DO_SERVIDOR");
  const { folhaId } = await params;
  const contracheques = await meuContrachequePara(sessao, folhaId);
  if (contracheques.length === 0) notFound();
  const competencia = contracheques[0]?.competencia ?? "";
  return (
    <div className="space-y-4">
      <PageHeader titulo={`Contracheque de ${competencia}`} subtitulo={`Folha fechada em ${contracheques[0]?.fechadaEm ?? "—"} — os valores não mudam mais`} />
      <p className="text-xs">
        <Link href="/portal-do-servidor" className="text-[color:var(--color-acento)] underline underline-offset-2">
          Voltar ao portal
        </Link>
      </p>
      {contracheques.map((c) => (
        <Card key={c.matricula}>
          <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">Matrícula {c.matricula}</h2>
          <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
            Regime {c.regime} · {c.dias}/30 dias computados na competência
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[color:var(--color-border)] text-[11px] uppercase tracking-wide text-[color:var(--color-ink-3)]">
                  <th scope="col" className="py-2 pr-3 text-left">Código</th>
                  <th scope="col" className="py-2 pr-3 text-left">Descrição</th>
                  <th scope="col" className="py-2 pr-3 text-left">Como foi calculada</th>
                  <th scope="col" className="py-2 pr-3 text-right">Provento</th>
                  <th scope="col" className="py-2 text-right">Desconto</th>
                </tr>
              </thead>
              <tbody>
                {c.linhas.map((l) => (
                  <tr key={l.id} data-linha={l.codigo} className="border-b border-[color:var(--color-border)] align-top">
                    <td className="py-2 pr-3 font-medium tabular-nums">{l.codigo}</td>
                    <td className="py-2 pr-3 text-[color:var(--color-ink)]">{l.descricao}</td>
                    <td className="py-2 pr-3 text-xs text-[color:var(--color-ink-2)]">{l.memoria}</td>
                    <td className="py-2 pr-3 text-right">{l.tipo === "PROVENTO" ? <ValorMonetario valor={l.valor} /> : null}</td>
                    <td className="py-2 text-right">{l.tipo === "DESCONTO" ? <ValorMonetario valor={l.valor} /> : null}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="text-sm font-semibold">
                  <td className="py-2 pr-3" colSpan={3}>Totais</td>
                  <td className="py-2 pr-3 text-right"><ValorMonetario valor={c.totais.proventos} /></td>
                  <td className="py-2 text-right"><ValorMonetario valor={c.totais.descontos} /></td>
                </tr>
                <tr className="text-sm font-semibold">
                  <td className="py-2 pr-3" colSpan={4}>Líquido</td>
                  <td className="py-2 text-right"><ValorMonetario valor={c.totais.liquido} comSimbolo /></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-3 break-all font-mono text-[11px] text-[color:var(--color-ink-3)]" data-sha256={c.sha256}>
            Impressão digital do cálculo: {c.sha256}
          </p>
        </Card>
      ))}
    </div>
  );
}
