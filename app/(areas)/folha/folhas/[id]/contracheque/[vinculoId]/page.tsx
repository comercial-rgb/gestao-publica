import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "../../../../../../../components/ui/Card";
import { PageHeader } from "../../../../../../../components/ui/PageHeader";
import { ValorMonetario } from "../../../../../../../components/ui/ValorMonetario";
import { exigirLeitura } from "../../../../../../../lib/portas/molde";
import { verContracheque } from "../../../../../../../lib/portas/recursos/folha-dados";

/**
 * O CONTRACHEQUE COM A MEMÓRIA DE CÁLCULO (TR 5.12.51, 5.12.53, 5.12.54) — sem imprimir nada.
 *
 * ⚠️ CADA LINHA MOSTRA A CONTA, não só o valor: o vencimento com o fator de dias, o percentual
 * sobre a base, os lançamentos somados, as faixas percorridas da contribuição e os três cenários
 * do imposto com o que cada um deduziu. É a memória gravada no cálculo, não uma recontagem da
 * tela — e o sha256 ao pé é o dela.
 */
export const dynamic = "force-dynamic";

interface FaixaDaMemoria { readonly ordem: number; readonly de: string; readonly ate: string; readonly baseNaFaixa: string; readonly aliquota: string; readonly valor: string }
interface CenarioDaMemoria { readonly nome: string; readonly aplicavel: boolean; readonly motivo?: string; readonly base: string; readonly valor: string; readonly deducoes: readonly { readonly tipo: string; readonly valor: string }[] }
interface MemoriaDoContracheque {
  readonly contribuicao?: { readonly regime: string; readonly base: string; readonly baseAntesDoTeto: string; readonly tetoAplicado: boolean; readonly aplicada: string; readonly faixas: readonly FaixaDaMemoria[]; readonly fundamentacao: string; readonly imposta?: string };
  readonly irrf?: { readonly rendaTributavel: string; readonly base: string; readonly aplicado: string; readonly cenario: string; readonly cenarios: readonly CenarioDaMemoria[]; readonly fundamentacao: string; readonly imposto?: string };
  readonly salarioFamilia?: { readonly rendaBruta: string; readonly rendaMaxima: string; readonly valorPorDependente: string; readonly elegiveis: number; readonly valor: string; readonly considerados: readonly { readonly nome: string; readonly idade: number; readonly elegivel: boolean; readonly motivo?: string }[]; readonly fundamentacao: string } | null;
  readonly dias?: { readonly dias: number; readonly explicacao: string };
}

export default async function Pagina({ params }: { readonly params: Promise<{ readonly id: string; readonly vinculoId: string }> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_FOLHA");
  const { id, vinculoId } = await params;
  const c = await verContracheque(id, vinculoId);
  if (c === null) notFound();
  const m = c.memoria as MemoriaDoContracheque;
  return (
    <div className="space-y-4">
      <PageHeader
        titulo={`Contracheque de ${c.servidor}`}
        subtitulo={`Matrícula ${c.matricula} · competência ${c.competencia} · cálculo nº ${c.calculoNumero} · regime ${c.regime} · ${m.dias?.explicacao ?? `${c.dias}/30 dias`}`}
      />
      <p className="text-xs">
        <Link href={`/folha/folhas/${c.folhaId}`} className="text-[color:var(--color-acento)] underline underline-offset-2">
          Voltar à folha de {c.competencia}
        </Link>
      </p>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">Linhas do contracheque</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] border-collapse text-sm">
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
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Contribuição previdenciária</h2>
        {m.contribuicao === undefined ? (
          <p className="text-xs text-[color:var(--color-ink-2)]">A memória deste cálculo não traz o detalhamento da contribuição.</p>
        ) : (
          <div className="space-y-2 text-xs text-[color:var(--color-ink-2)]">
            <p>
              Regime {m.contribuicao.regime} · base {m.contribuicao.base}
              {m.contribuicao.tetoAplicado ? ` (teto aplicado sobre ${m.contribuicao.baseAntesDoTeto})` : ""} · descontado {m.contribuicao.aplicada}
            </p>
            {m.contribuicao.imposta !== undefined ? <p className="text-[color:var(--color-ink)]">Imposta pela acumulação: {m.contribuicao.imposta}</p> : null}
            {m.contribuicao.faixas.length > 0 ? (
              <ul className="ml-4 list-disc">
                {m.contribuicao.faixas.map((f) => (
                  <li key={f.ordem}>faixa {f.ordem}: {f.baseNaFaixa} x {f.aliquota} = {f.valor} (de {f.de} ate {f.ate})</li>
                ))}
              </ul>
            ) : null}
            <p>Fundamentação: {m.contribuicao.fundamentacao}</p>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Imposto de renda retido na fonte</h2>
        {m.irrf === undefined ? (
          <p className="text-xs text-[color:var(--color-ink-2)]">A memória deste cálculo não traz o detalhamento do imposto.</p>
        ) : (
          <div className="space-y-2 text-xs text-[color:var(--color-ink-2)]">
            <p>Renda tributável {m.irrf.rendaTributavel} · base {m.irrf.base} · retido {m.irrf.aplicado} · cenário escolhido: {m.irrf.cenario} (o de menor imposto entre os aplicáveis)</p>
            {m.irrf.imposto !== undefined ? <p className="text-[color:var(--color-ink)]">Imposto pela acumulação: {m.irrf.imposto}</p> : null}
            <ul className="ml-4 list-disc">
              {m.irrf.cenarios.map((x) => (
                <li key={x.nome} className={x.nome === m.irrf?.cenario ? "text-[color:var(--color-ink)]" : ""}>
                  {x.nome}: {x.aplicavel ? `base ${x.base} → ${x.valor}${x.deducoes.length > 0 ? ` (deduções: ${x.deducoes.map((d) => `${d.tipo} ${d.valor}`).join(", ")})` : ""}` : `não aplicável — ${x.motivo ?? "sem motivo declarado"}`}
                </li>
              ))}
            </ul>
            <p>Fundamentação: {m.irrf.fundamentacao}</p>
          </div>
        )}
      </Card>

      {m.salarioFamilia !== undefined && m.salarioFamilia !== null ? (
        <Card>
          <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Salário-família</h2>
          <div className="space-y-2 text-xs text-[color:var(--color-ink-2)]">
            <p>Renda bruta {m.salarioFamilia.rendaBruta} (máxima {m.salarioFamilia.rendaMaxima}) · {m.salarioFamilia.elegiveis} dependente(s) elegível(is) x {m.salarioFamilia.valorPorDependente} = {m.salarioFamilia.valor}</p>
            <ul className="ml-4 list-disc">
              {m.salarioFamilia.considerados.map((d) => (
                <li key={d.nome}>{d.nome}, {d.idade} anos: {d.elegivel ? "elegível" : `não elegível — ${d.motivo ?? "sem motivo declarado"}`}</li>
              ))}
            </ul>
            <p>Fundamentação: {m.salarioFamilia.fundamentacao}</p>
          </div>
        </Card>
      ) : null}

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Impressão digital</h2>
        <p className="break-all font-mono text-xs text-[color:var(--color-ink-2)]" data-sha256={c.sha256}>{c.sha256}</p>
        <p className="mt-1 text-[11px] text-[color:var(--color-ink-3)]">
          sha256 da memória canônica deste contracheque. Recalcular com os mesmos dados devolve o mesmo valor; um centavo
          diferente muda o hash inteiro.
        </p>
      </Card>
    </div>
  );
}
