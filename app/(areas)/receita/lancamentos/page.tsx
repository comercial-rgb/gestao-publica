import Link from "next/link";
import { Card } from "../../../../components/ui/Card";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { exigirLeitura } from "../../../../lib/portas/molde";
import { lotesParaTela } from "../../../../lib/portas/lancamento-tributario";
import { instanteCivilBr } from "../../../../packages/datas/index";
import { FormLote } from "./FormLote";

/**
 * RECEITA · Lançamentos tributários (V10 T2 · N5).
 *
 * ⚠️ A CADEIA É PREPARAR → REVISAR → CONSTITUIR, e a tela a torna visível. Preparar não cria
 * crédito; o lote sai com o placar de quantos ainda têm pendência de revisão, e constituir é
 * ato próprio, um lançamento por vez, com ação própria.
 */
export const dynamic = "force-dynamic";

export default async function LancamentosPage(): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_RECEITA");
  const dados = await lotesParaTela();

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Lançamentos tributários"
        subtitulo="Preparação dos lotes de lançamento e constituição do crédito tributário."
      />

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-ink)]">Lotes</h2>
        {dados.lotes.length === 0 ? (
          <p className="text-sm text-[color:var(--color-ink-3)]">
            Nenhum lote preparado. Um lote reúne os lançamentos de um tributo num exercício.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Lotes de lançamento tributário</caption>
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-[color:var(--color-ink-3)]">
                  <th scope="col" className="py-1 pr-3">Lote</th>
                  <th scope="col" className="py-1 pr-3">Tributo</th>
                  <th scope="col" className="py-1 pr-3">Fato gerador</th>
                  <th scope="col" className="py-1 pr-3">Total</th>
                  <th scope="col" className="py-1 pr-3">Preparados</th>
                  <th scope="col" className="py-1 pr-3">Constituídos</th>
                  <th scope="col" className="py-1 pr-3">Com pendência</th>
                  <th scope="col" className="py-1">Aberto em</th>
                </tr>
              </thead>
              <tbody data-papel="lotes">
                {dados.lotes.map((l) => (
                  <tr key={l.id} className="border-t border-[color:var(--color-border)]" data-lote={l.numero}>
                    <td className="py-1 pr-3">
                      <Link href={`/receita/lancamentos/${l.id}`} className="underline">
                        {l.numero}
                      </Link>
                    </td>
                    <td className="py-1 pr-3">{l.tributo}/{l.exercicio}</td>
                    <td className="py-1 pr-3 tabular">{l.fatoGerador.split("-").reverse().join("/")}</td>
                    <td className="py-1 pr-3 tabular" data-papel="total">{l.total}</td>
                    <td className="py-1 pr-3 tabular">{l.preparados}</td>
                    <td className="py-1 pr-3 tabular" data-papel="constituidos">{l.constituidos}</td>
                    <td className="py-1 pr-3 tabular">{l.comInconsistencia}</td>
                    <td className="py-1">{instanteCivilBr(l.criadoEm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {dados.podePreparar ? (
        <FormLote opcoes={{ hoje: dados.hoje, fontes: dados.fontes, imoveis: dados.imoveis }} />
      ) : (
        <Card>
          <p className="text-sm text-[color:var(--color-ink-3)]">
            Seu perfil permite consultar os lotes, mas não prepará-los.
          </p>
        </Card>
      )}
    </div>
  );
}
