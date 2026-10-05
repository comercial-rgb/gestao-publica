import { BotaoPdf } from "../../../../../components/ui/BotaoPdf";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { TabelaDeDados, type ColunaTabela } from "../../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import { gerarDmpl, type Dmpl, type LinhaDaDmpl } from "../../../../../lib/portas/dmpl";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { lerExercicio } from "../exercicio";
import { SeletorExercicio } from "../SeletorExercicio";

/**
 * V35 — DEMONSTRAÇÃO DAS MUTAÇÕES NO PATRIMÔNIO LÍQUIDO (MCASP 11ª ed., Parte V, item 7), lida do razão: colunas pelo
 * grupo 2.3, linhas pelo par do lançamento. O movimento sem regra aparece como pendência, com o lançamento.
 * Server Component, força-dinâmica.
 */
export const dynamic = "force-dynamic";

export default async function DmplPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_RELATORIOS");
  const { exercicio } = lerExercicio(await searchParams);
  const cabecalho = (
    <PageHeader
      titulo="Demonstração das Mutações no Patrimônio Líquido"
      subtitulo="Evolução do patrimônio líquido no exercício · MCASP 11ª ed., Parte V, item 7"
      acoes={<SeletorExercicio exercicio={String(exercicio)} />}
    />
  );
  let d: Dmpl;
  try {
    d = await gerarDmpl(exercicio);
  } catch (erro) {
    return (
      <div>
        {cabecalho}
        <EstadoVazio titulo="Não foi possível montar a DMPL" descricao={erro instanceof Error ? erro.message : "Erro desconhecido."} />
      </div>
    );
  }
  const colunas: ColunaTabela<LinhaDaDmpl>[] = [
    {
      chave: "especificacao",
      cabecalho: "Especificação",
      celula: (l) => (l.chave === "SALDOS_INICIAIS" || l.chave === "SALDOS_FINAIS" ? <strong>{l.rotulo}</strong> : l.rotulo),
    },
    ...d.colunas.map<ColunaTabela<LinhaDaDmpl>>((c, i) => ({ chave: `c${String(i)}`, cabecalho: c, alinhamento: "direita", celula: (l) => <ValorMonetario valor={l.valores[i] ?? "0.00"} /> })),
  ];
  return (
    <div className="space-y-6">
      {cabecalho}
      <div className="flex justify-end gap-2" data-chrome>
        <BotaoPdf href={`/relatorios/demonstracoes/dmpl/pdf?exercicio=${String(exercicio)}`} />
      </div>
      <TabelaDeDados<LinhaDaDmpl> colunas={colunas} linhas={d.linhas} keyDe={(l) => l.chave} legenda={`Exercício de ${String(exercicio)} · valores em R$ · aumento do patrimônio líquido positivo.`} />
      {d.semLinha.length > 0 ? (
        <section aria-label="Movimentos sem linha definida" className="rounded border border-[color:var(--color-border)] p-3 text-sm">
          <h2 className="font-semibold">Movimentos no patrimônio líquido sem linha definida</h2>
          <ul className="mt-1 list-disc pl-5">
            {d.semLinha.map((s, i) => (
              <li key={`${s.numeroControle}-${s.conta}-${String(i)}`}>
                Lançamento {s.numeroControle}, conta {s.conta}: <ValorMonetario valor={s.valor} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        <p className="mb-1 font-medium uppercase tracking-wide">Notas do demonstrativo</p>
        <ul className="list-disc space-y-1 pl-4">
          {d.notas.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
