import Link from "next/link";
import { Card } from "../../../../components/ui/Card";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { AvisosDosAtos, ResultadosDosAtos } from "../../../../components/ui/ResultadosDosAtos";
import { imoveisParaTela } from "../../../../lib/portas/cadastro-imobiliario";
import { exigirLeitura } from "../../../../lib/portas/molde";
import { FormCadastrarImovel } from "./FormulariosDoImovel";

/**
 * O CADASTRO IMOBILIÁRIO (V7 B1) — a lista e a busca por inscrição, logradouro ou bairro. O cadastro é HISTÓRICO: o
 * detalhe mostra as versões e a simulação usa a versão que vale no dia.
 */
export const dynamic = "force-dynamic";

const USO: Readonly<Record<string, string>> = { RESIDENCIAL: "residencial", COMERCIAL: "comercial", INDUSTRIAL: "industrial", TERRITORIAL: "territorial", MISTO: "misto", OUTRO: "outro" };

export default async function Imoveis({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_RECEITA");
  const q = await searchParams;
  const busca = typeof q["q"] === "string" ? q["q"] : "";
  const t = await imoveisParaTela(busca);
  return (
    <ResultadosDosAtos>
      <div className="space-y-4" data-imoveis={t.imoveis.length}>
        <PageHeader titulo="Cadastro imobiliário" subtitulo="Imóveis do município, com o histórico de cada cadastro. Simular não lança tributo nem constitui dívida." />
        <AvisosDosAtos />
        <Card>
          <form method="get" className="flex flex-wrap items-end gap-2" data-busca-de-imovel>
            <label className="text-xs text-[color:var(--color-ink-2)]">
              <span className="mb-1 block font-medium text-[color:var(--color-ink)]">Buscar por inscrição, logradouro ou bairro</span>
              <input name="q" defaultValue={busca} className="w-72 rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-2 py-1 text-sm" />
            </label>
            <button type="submit" className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-3 py-1 text-sm">Buscar</button>
          </form>
          {t.imoveis.length === 0 ? (
            <p className="mt-3 text-sm text-[color:var(--color-ink-2)]" data-sem-imoveis>{busca === "" ? "Nenhum imóvel cadastrado." : "Nenhum imóvel encontrado para a busca."}</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-sm" data-lista-de-imoveis>
                <thead><tr className="text-xs text-[color:var(--color-ink-2)]"><th className="py-1 pr-2">Inscrição</th><th className="py-1 pr-2">Endereço (versão atual)</th><th className="py-1 pr-2">Uso</th><th className="py-1 text-right">Versões</th></tr></thead>
                <tbody>
                  {t.imoveis.map((i) => (
                    <tr key={i.id} data-imovel={i.inscricao} className="border-t border-[color:var(--color-border)]">
                      <td className="py-2 pr-2"><Link href={`/receita/imoveis/${encodeURIComponent(i.inscricao)}`} className="text-[color:var(--color-primary)] underline underline-offset-2">{i.inscricao}</Link></td>
                      <td className="py-2 pr-2 [overflow-wrap:anywhere]">{i.endereco}</td>
                      <td className="py-2 pr-2">{USO[i.uso] ?? i.uso}</td>
                      <td className="py-2 text-right tabular-nums">{i.versoes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {t.podeCadastrar ? null : <p className="mt-2 text-xs text-[color:var(--color-ink-2)]" data-motivo-do-cadastro>Cadastrar imóvel e registrar versões é do cadastro imobiliário (a ação de gerir o cadastro imobiliário no seu perfil).</p>}
        </Card>
        {t.podeCadastrar ? <FormCadastrarImovel hoje={t.hoje} /> : null}
      </div>
    </ResultadosDosAtos>
  );
}
