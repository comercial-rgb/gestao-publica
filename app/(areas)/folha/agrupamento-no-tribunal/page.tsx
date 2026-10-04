import { competenciaCivil } from "../../../../packages/datas/index";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import { lerAgrupamentosDaFolha } from "../../../../lib/portas/agrupamento-da-folha";
import { FormDoAgrupamento } from "./FormDoAgrupamento";

/**
 * V26 — O CÓDIGO DE AGRUPAMENTO DA FOLHA DE CADA LIQUIDAÇÃO, para a prestação de contas ao Tribunal: o que falta no
 * mês e o que já foi informado.
 *
 * ⚠️ `force-dynamic`: depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

const TITULO = "Agrupamento da folha no Tribunal";
const SUBTITULO = "O código da remessa de pessoal em cada liquidação da folha";

export default async function AgrupamentoNoTribunalPage({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<React.ReactElement> {
  const sp = await searchParams;
  const hoje = new Date();
  const mesTexto = typeof sp.mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes) ? sp.mes : competenciaCivil(hoje);
  const ano = Number(mesTexto.slice(0, 4));
  const mes = Number(mesTexto.slice(5, 7));
  let dados: Awaited<ReturnType<typeof lerAgrupamentosDaFolha>>;
  try {
    await telaExigeLeituraDoEnte("CONSULTAR_FOLHA");
    dados = await lerAgrupamentosDaFolha({ ano, mes });
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo={TITULO} subtitulo={SUBTITULO} />
        <EstadoVazio titulo="Não foi possível carregar" descricao={erro instanceof Error ? erro.message : "Erro desconhecido."} />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader titulo={TITULO} subtitulo={`${SUBTITULO} — ${mesTexto.slice(5, 7)}/${mesTexto.slice(0, 4)}`} />
      <form method="get" className="flex items-end gap-2 text-xs">
        <label><span className="block text-[color:var(--color-ink-2)]">Mês das liquidações</span><input name="mes" type="month" defaultValue={mesTexto} className="rounded border border-[color:var(--color-border)] px-2 py-1" /></label>
        <button type="submit" className="rounded border border-[color:var(--color-border)] px-3 py-1">Ver</button>
      </form>
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-ink)]">Liquidações da folha sem o código</h2>
        {dados.sem.length === 0 ? (
          <p className="text-xs text-[color:var(--color-ink-3)]" data-teste="sem-pendencia-de-agrupamento">Nenhuma: todas as liquidações de folha do mês têm o código.</p>
        ) : (
          <>
            <p className="mb-2 text-xs text-[color:var(--color-status-erro-fg)]">Enquanto faltar, o arquivo que relaciona liquidação e agrupamento fica fora da remessa do mês.</p>
            <ul className="space-y-1 text-sm" data-lista="liquidacoes-sem-agrupamento">
              {dados.sem.map((s) => (
                <li key={s.liquidacaoId} data-liquidacao-sem-agrupamento={s.numero}>Liquidação <strong>{s.numero}</strong> <span className="text-xs text-[color:var(--color-ink-3)]">· empenho {s.empenho} · folha {s.competencia} · {s.dia}</span></li>
              ))}
            </ul>
          </>
        )}
      </Card>
      <FormDoAgrupamento ano={ano} liquidacoes={dados.sem.map((s) => ({ id: s.liquidacaoId, rotulo: `Liquidação ${s.numero} — empenho ${s.empenho} — folha ${s.competencia}` }))} ugs={dados.ugs} />
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-ink)]">Códigos informados no mês</h2>
        {dados.registrados.length === 0 ? (
          <p className="text-xs text-[color:var(--color-ink-3)]">Nenhum.</p>
        ) : (
          <table className="w-full text-sm" data-lista="agrupamentos-da-folha">
            <tbody>
              {dados.registrados.map((r) => (
                <tr key={r.id} className="border-b border-[color:var(--color-border)]" data-agrupamento={r.codigo}>
                  <td className="py-1.5 pr-4">Liquidação <strong>{r.liquidacao}</strong><span className="block text-xs">empenho {r.empenho} · {r.dia}</span></td>
                  <td className="py-1.5 pr-4 font-mono text-xs">{r.codigo}</td>
                  <td className="py-1.5 pr-4 text-xs">folha {r.competencia} · unidade {r.ug}</td>
                  <td className="py-1.5 text-xs text-[color:var(--color-ink-3)]">{r.origem}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
