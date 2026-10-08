import Link from "next/link";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import { DEDUCAO_SAGRES, lerReceitaPrevista } from "../../../../lib/portas/receita-prevista";
import { anoCivil } from "../../../../packages/datas/index";
import { FormDoDetalhe } from "./FormDoDetalhe";
import { FormDoRateio, type NaturezaQueRateia } from "./FormDoRateio";
import { naturezasQueRateiam } from "../../../../lib/portas/fontes-da-natureza";
import { acoesPermitidas } from "../../../../lib/portas/molde";

import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
/**
 * V26 — A RECEITA PREVISTA DO EXERCÍCIO, com o subtipo de cada dedução e a origem de cada linha.
 *
 * ⚠️ `force-dynamic`: depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

const TIPO: Record<string, string> = { ORCAMENTARIA: "Receita", INTRA_ORCAMENTARIA: "Intraorçamentária", DEDUCAO: "Dedução" };

export default async function ReceitaPrevistaPage({ searchParams }: { readonly searchParams: Promise<Record<string, string | undefined>> }): Promise<React.ReactElement> {
  const sp = await searchParams;
  const exercicio = /^\d{4}$/.test(sp["exercicio"] ?? "") ? Number(sp["exercicio"]) : anoCivil(new Date());
  let linhas: Awaited<ReturnType<typeof lerReceitaPrevista>>;
  let rateaveis: readonly NaturezaQueRateia[] = [];
  let podeRatear = false;
  try {
    await telaExigeLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
    const [l, permitidas] = await Promise.all([lerReceitaPrevista(exercicio), acoesPermitidas(["CRIAR_RECEITA_PREVISTA"])]);
    linhas = l;
    podeRatear = permitidas.has("CRIAR_RECEITA_PREVISTA");
    if (podeRatear) rateaveis = await naturezasQueRateiam();
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo="Receita prevista" subtitulo="As linhas da previsão da receita do exercício" />
        <EstadoVazio titulo="Não foi possível carregar" descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."} />
      </div>
    );
  }
  const deducoes = Object.entries(DEDUCAO_SAGRES);
  const semSubtipo = linhas.filter((l) => l.tipo === "DEDUCAO" && l.detalhe === null).length;
  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader titulo="Receita prevista" subtitulo={`As linhas da previsão da receita de ${exercicio}, como publicadas na LOA`} />
      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        A prestação de contas pede, de cada dedução da receita, se ela é para o Fundeb, de rendimentos de investimentos ou
        outra. A linha publicada não muda: o detalhe a descreve, com o documento de onde ela vem.
      </div>
      {semSubtipo > 0 ? (
        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-status-alerta-fg)] p-3 text-xs" data-teste="deducoes-sem-subtipo">
          <strong>{semSubtipo} dedução(ões) sem o tipo.</strong> A previsão da receita fica fora do balancete de janeiro até o registro.
        </div>
      ) : null}
      {podeRatear ? <FormDoRateio exercicio={exercicio} naturezas={rateaveis} /> : null}
      <Card>
        {linhas.length === 0 ? (
          <p className="text-xs text-[color:var(--color-ink-3)]">Nenhuma linha de receita prevista no exercício.</p>
        ) : (
          <table className="w-full text-sm" data-lista="receita-prevista">
            <thead>
              <tr className="border-b border-[color:var(--color-border)] text-left text-[color:var(--color-ink-2)]">
                <th className="py-1.5 pr-4">Natureza</th>
                <th className="py-1.5 pr-4">Fonte</th>
                <th className="py-1.5 pr-4">Tipo</th>
                <th className="py-1.5 pr-4 text-right">Previsto</th>
                <th className="py-1.5">Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id} className="border-b border-[color:var(--color-border)] align-top" data-natureza={l.natureza} data-tipo={l.tipo}>
                  <td className="py-1.5 pr-4 text-xs">
                    {/* V37 — da previsão para o realizado: as guias desta receita no exercício. */}
                    <Link className="hover:underline" href={`/receita/arrecadacoes?exercicio=${String(exercicio)}&natureza=${l.natureza}`} title="Ver as guias arrecadadas desta receita">
                      <span className="font-mono">{l.natureza}</span> <span className="text-[color:var(--color-ink-3)]">{l.descricao}</span>
                    </Link>
                  </td>
                  <td className="py-1.5 pr-4 text-xs">{l.fonte}</td>
                  <td className="py-1.5 pr-4 text-xs">{TIPO[l.tipo] ?? l.tipo}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{l.valor}</td>
                  <td className="py-1.5 text-xs">
                    {l.detalhe === null ? (
                      <FormDoDetalhe id={l.id} deducao={l.tipo === "DEDUCAO"} deducoes={deducoes} />
                    ) : (
                      <>
                        {l.detalhe.deducao ?? ""}
                        <span className="block text-[color:var(--color-ink-3)]">
                          {l.detalhe.codigoNoDocumento ?? ""} {l.detalhe.documento}
                        </span>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
