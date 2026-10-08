import { Card } from "../../../../components/ui/Card";
import { formatarMoeda } from "../../../../packages/contracts/moeda";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { BotaoCsvDasTabelas } from "../../../../components/ui/BotaoCsvDasTabelas";
import { BotaoImprimir } from "../../../../components/ui/BotaoImprimir";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { lerLimiteDoLegislativo } from "../../../../lib/portas/limite-do-legislativo";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import { exercicioAutorizado } from "../../../../lib/recorte";
import { FormLimite } from "./FormLimite";

import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
/**
 * O LIMITE DO REPASSE AO LEGISLATIVO (CF art. 29-A) — V35. Faixa pela população, base do exercício anterior, limite,
 * a LOA da Câmara contida nele, o duodécimo e os repasses de cada mês até o dia 20.
 *
 * ⚠️ `force-dynamic`: depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

// o formatador contábil do repositório (textual, sem `number` e sem o hospedeiro decidir o formato)
const brl = (v: string): string => formatarMoeda(v).texto;
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export default async function LimiteDoLegislativoPage({ searchParams }: { readonly searchParams: Promise<Record<string, string | undefined>> }): Promise<React.ReactElement> {
  const sp = await searchParams;
  let exercicio = 0;
  let titulo = <PageHeader acoes={<span className="flex gap-2"><BotaoCsvDasTabelas nomeArquivo="limite-do-legislativo.csv" /><BotaoImprimir /></span>} titulo="Limite do Legislativo" subtitulo="Repasse à Câmara Municipal (CF art. 29-A)" />;
  let a: Awaited<ReturnType<typeof lerLimiteDoLegislativo>> | null = null;
  let motivo: string | null = null;
  try {
    exercicio = exercicioAutorizado(sp);
    titulo = <PageHeader acoes={<span className="flex gap-2"><BotaoCsvDasTabelas nomeArquivo="limite-do-legislativo.csv" /><BotaoImprimir /></span>} titulo="Limite do Legislativo" subtitulo={`Repasse à Câmara Municipal (CF art. 29-A) — exercício ${String(exercicio)}`} />;
    await telaExigeLeituraDoEnte("CONSULTAR_RELATORIOS");
    a = await lerLimiteDoLegislativo(exercicio);
  } catch (erro) {
    motivo = erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido.";
  }

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      {titulo}
      {a === null ? (
        <Card>
          <EstadoVazio titulo="O limite ainda não pode ser apurado" descricao={motivo ?? ""} />
          {exercicio > 0 ? <div className="mt-3"><FormLimite exercicio={exercicio} /></div> : null}
        </Card>
      ) : (
        <>
          {a.alertas.length > 0 ? (
            <div role="alert" className="rounded-[var(--radius-md)] border border-[color:var(--color-status-alerta-fg)] p-3 text-xs" data-teste="alertas-do-limite">
              <ul className="list-disc pl-4">{a.alertas.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          ) : null}
          <Card>
            <dl className="grid gap-2 text-xs sm:grid-cols-2">
              <div><dt className="text-[color:var(--color-ink-3)]">População</dt><dd>{String(a.populacao).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} — {a.fontePopulacao}</dd></div>
              <div><dt className="text-[color:var(--color-ink-3)]">Faixa</dt><dd>Inciso {a.inciso}: {a.percentual.replace(".", ",")}%</dd></div>
              <div><dt className="text-[color:var(--color-ink-3)]">Base do exercício anterior</dt><dd>R$ {brl(a.base)} ({a.origemDaBase === "SISTEMA" ? "escriturada neste sistema" : `declarada — ${a.documentoDaBase ?? ""}`})</dd></div>
              <div><dt className="text-[color:var(--color-ink-3)]">Limite anual</dt><dd>R$ {brl(a.limiteAnual)}</dd></div>
              <div><dt className="text-[color:var(--color-ink-3)]">LOA da Câmara</dt><dd>R$ {brl(a.dotacaoDaCamaraNaLoa)}</dd></div>
              <div><dt className="text-[color:var(--color-ink-3)]">Devido no ano / duodécimo</dt><dd>R$ {brl(a.devidoNoAno)} / R$ {brl(a.duodecimo)}</dd></div>
            </dl>
          </Card>
          <Card>
            <table className="w-full text-left text-xs">
              <caption className="sr-only">Repasses mensais à Câmara Municipal</caption>
              <thead>
                <tr className="text-[color:var(--color-ink-3)]">
                  <th scope="col" className="py-2 pr-3">Mês</th>
                  <th scope="col" className="py-2 pr-3 text-right">Devido</th>
                  <th scope="col" className="py-2 pr-3 text-right">Repassado até o dia 20</th>
                  <th scope="col" className="py-2 pr-3 text-right">Repassado no mês</th>
                  <th scope="col" className="py-2 pr-3">Situação</th>
                </tr>
              </thead>
              <tbody>
                {a.meses.map((m) => (
                  <tr key={m.mes} className="border-t border-[color:var(--color-border)]">
                    <th scope="row" className="py-2 pr-3 font-normal">{MESES[m.mes - 1]}</th>
                    <td className="py-2 pr-3 text-right tabular-nums">{brl(m.devido)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{brl(m.repassadoAteDia20)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{brl(m.repassadoNoMes)}</td>
                    <td className="py-2 pr-3">{m.emDia ? "Em dia" : "Abaixo do devido até o dia 20"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs">Repassado no ano: R$ {brl(a.repassadoNoAno)}</p>
          </Card>
          <Card>
            <details>
              <summary className="cursor-pointer text-sm">Declarar outra população ou base (cria nova versão)</summary>
              <div className="mt-3"><FormLimite exercicio={exercicio} /></div>
            </details>
          </Card>
        </>
      )}
    </div>
  );
}
