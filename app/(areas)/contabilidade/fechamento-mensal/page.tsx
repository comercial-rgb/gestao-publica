import Link from "next/link";
import { Badge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import { lerConferenciaDoMes, lerFechamentoDoExercicio, type SituacaoDoMes, type Verificacao } from "../../../../lib/portas/fechamento-mensal";
import { anoCivil } from "../../../../packages/datas/index";
import { acoesPermitidas } from "../../../../lib/portas/molde";
import { AcoesDoMes } from "./FormsDoFechamento";

/**
 * O FECHAMENTO MENSAL — onde a contabilidade confere e fecha cada mês (V32).
 *
 * ⚠️ POR QUE ESTA TELA EXISTE. O travamento de competência existia, testado, e nada chegava a ele: o
 * contador não tinha como fechar o mês. Fechar aqui roda a mesma conferência do relatório de
 * consistência e recusa quando há divergência; reabrir exige motivo, que fica registrado.
 *
 * ⚠️ `force-dynamic`: depende de SESSÃO e do razão.
 */
export const dynamic = "force-dynamic";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const rotuloDoMes = (competencia: string): string =>
  `${MESES[Number.parseInt(competencia.slice(5, 7), 10) - 1] ?? competencia} de ${competencia.slice(0, 4)}`;

const SITUACAO: Readonly<Record<SituacaoDoMes["situacao"], { readonly rotulo: string; readonly status: "ok" | "alerta" | "neutro" }>> = {
  FECHADO: { rotulo: "Fechado", status: "ok" },
  ABERTO: { rotulo: "Aberto", status: "neutro" },
  PARCIAL: { rotulo: "Fechado em parte", status: "alerta" },
};
const RESULTADO: Readonly<Record<string, { readonly rotulo: string; readonly status: "ok" | "alerta" | "neutro" }>> = {
  OK: { rotulo: "Confere", status: "ok" },
  DIVERGE: { rotulo: "Diverge", status: "alerta" },
  SEM_DADO: { rotulo: "Sem dado", status: "neutro" },
};
const SEM_DADO = { rotulo: "Sem dado", status: "neutro" } as const;

function umString(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export default async function FechamentoMensalPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  const pedido = Number.parseInt(umString(sp["exercicio"]), 10);
  const exercicio = Number.isInteger(pedido) && pedido >= 2000 && pedido <= 2100 ? pedido : anoCivil(new Date());
  const mesPedido = umString(sp["mes"]);
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(mesPedido) && mesPedido.startsWith(String(exercicio)) ? mesPedido : null;
  const cabecalho = <PageHeader titulo="Fechamento mensal" subtitulo="Conferir os saldos e fechar cada mês do exercício" />;

  let meses: readonly SituacaoDoMes[];
  let conferencia: readonly Verificacao[] | null = null;
  let permitidas: ReadonlySet<string> = new Set();
  try {
    await telaExigeLeituraDoEnte("CONSULTAR_CONTABILIDADE");
    [meses, permitidas] = await Promise.all([lerFechamentoDoExercicio(exercicio), acoesPermitidas(["TRAVAR_COMPETENCIA", "DESTRAVAR_COMPETENCIA"])]);
    if (mes !== null) conferencia = await lerConferenciaDoMes(mes);
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        {cabecalho}
        <EstadoVazio titulo="Não foi possível ler o fechamento" descricao={erro instanceof Error ? erro.message : "Erro desconhecido."} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      {cabecalho}

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        Fechar um mês confere se o balancete fecha até o último dia dele e, se conferir, impede qualquer lançamento com
        data naquele mês, para todos os usuários. <strong>Com divergência o mês não é fechado</strong>, e a mensagem
        diz qual conferência falhou e a diferença. Reabrir exige o motivo, que fica registrado com o nome de quem reabriu.
      </div>

      <nav aria-label="Exercício" className="flex items-center gap-3 text-sm">
        <Link href={`/contabilidade/fechamento-mensal?exercicio=${String(exercicio - 1)}`} className="underline">
          {exercicio - 1}
        </Link>
        <strong data-exercicio={exercicio}>{exercicio}</strong>
        <Link href={`/contabilidade/fechamento-mensal?exercicio=${String(exercicio + 1)}`} className="underline">
          {exercicio + 1}
        </Link>
      </nav>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Os meses do exercício {exercicio} e a situação do fechamento de cada um</caption>
            <thead>
              <tr className="text-[color:var(--color-ink-3)]">
                <th scope="col" className="py-2 pr-3">Mês</th>
                <th scope="col" className="py-2 pr-3">Situação</th>
                <th scope="col" className="py-2 pr-3">Conferência</th>
                <th scope="col" className="py-2 pr-3">Ação</th>
              </tr>
            </thead>
            <tbody>
              {meses.map((m) => (
                <tr key={m.competencia} data-competencia={m.competencia} className="border-t border-[color:var(--color-border)] align-top">
                  <th scope="row" className="py-2 pr-3 font-normal">{rotuloDoMes(m.competencia)}</th>
                  <td className="py-2 pr-3" data-papel="situacao" data-situacao={m.situacao}>
                    <Badge status={SITUACAO[m.situacao].status}>{SITUACAO[m.situacao].rotulo}</Badge>
                    {m.fechadoPor !== null ? <span className="block text-[color:var(--color-ink-3)]">por {m.fechadoPor}</span> : null}
                  </td>
                  <td className="py-2 pr-3">
                    <Link href={`/contabilidade/fechamento-mensal?exercicio=${String(exercicio)}&mes=${m.competencia}`} className="underline">
                      Ver a conferência
                    </Link>
                  </td>
                  <td className="py-2 pr-3">
                    <AcoesDoMes
                      competencia={m.competencia}
                      rotulo={rotuloDoMes(m.competencia)}
                      aberto={m.situacao === "ABERTO"}
                      podeFechar={permitidas.has("TRAVAR_COMPETENCIA")}
                      podeReabrir={permitidas.has("DESTRAVAR_COMPETENCIA")}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {mes !== null && conferencia !== null ? (
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-ink)]">Conferência de {rotuloDoMes(mes)}</h2>
          <table className="w-full text-left text-xs" data-conferencia={mes}>
            <caption className="sr-only">O que o fechamento de {rotuloDoMes(mes)} confere</caption>
            <thead>
              <tr className="text-[color:var(--color-ink-3)]">
                <th scope="col" className="py-2 pr-3">Conferência</th>
                <th scope="col" className="py-2 pr-3">Resultado</th>
                <th scope="col" className="py-2 pr-3">Um lado</th>
                <th scope="col" className="py-2 pr-3">Outro lado</th>
                <th scope="col" className="py-2 pr-3">Diferença</th>
              </tr>
            </thead>
            <tbody>
              {conferencia.map((v) => {
                const r = RESULTADO[v.resultado] ?? SEM_DADO;
                return (
                  <tr key={v.chave} data-verificacao={v.chave} className="border-t border-[color:var(--color-border)] align-top">
                    <th scope="row" className="py-2 pr-3 font-normal">
                      {v.titulo}
                      {v.detalhe !== undefined && v.detalhe !== "" ? <span className="block text-[color:var(--color-ink-3)]">{v.detalhe}</span> : null}
                    </th>
                    <td className="py-2 pr-3">
                      <Badge status={r.status}>{r.rotulo}</Badge>
                    </td>
                    <td className="py-2 pr-3">{v.esquerda}</td>
                    <td className="py-2 pr-3">{v.direita}</td>
                    <td className="py-2 pr-3">{v.diferenca}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ) : null}
    </div>
  );
}
