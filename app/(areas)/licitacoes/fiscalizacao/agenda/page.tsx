import Link from "next/link";
import { Badge } from "../../../../../components/ui/Badge";
import { Card } from "../../../../../components/ui/Card";
import { AvisosDosAtos, ResultadosDosAtos } from "../../../../../components/ui/ResultadosDosAtos";
import { agendaParaTela } from "../../../../../lib/portas/agenda-da-fiscalizacao";
import { exigirLeitura } from "../../../../../lib/portas/molde";
import { exigirSessao } from "../../../../../lib/portas/sessao";
import { FormCancelarFiscalizacao, FormReagendar, FormRealizar } from "./FormulariosDaAgenda";

/**
 * A AGENDA DA FISCALIZAÇÃO (V7 M2 U8) — dia, semana e mês dos MESMOS compromissos, no calendário do ente.
 * O recorte é do servidor: só os contratos que a pessoa alcança pela fiscalização. Reagendar e cancelar são do gestor
 * designado, registrar a realização é do fiscal do compromisso — e o servidor recusa de novo.
 */
export const dynamic = "force-dynamic";

const VISTAS: readonly { readonly valor: "dia" | "semana" | "mes"; readonly rotulo: string }[] = [
  { valor: "dia", rotulo: "Dia" },
  { valor: "semana", rotulo: "Semana" },
  { valor: "mes", rotulo: "Mês" },
];
const SITUACAO: Readonly<Record<string, { readonly texto: string; readonly tom: "ok" | "alerta" | "neutro" }>> = {
  PROGRAMADA: { texto: "programada", tom: "neutro" },
  REAGENDADA: { texto: "reagendada", tom: "alerta" },
  CANCELADA: { texto: "cancelada", tom: "neutro" },
  REALIZADA: { texto: "realizada", tom: "ok" },
};
const DIA_DA_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const br = (dia: string): string => dia.split("-").reverse().join("/");
const nomeDoDia = (dia: string): string => {
  const [a, m, d] = dia.split("-").map(Number) as [number, number, number];
  return DIA_DA_SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()] ?? "";
};

export default async function AgendaDaFiscalizacao({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_LICITACOES");
  const sessao = await exigirSessao();
  const q = await searchParams;
  const texto = (k: string): string | undefined => (typeof q[k] === "string" ? (q[k] as string) : undefined);
  // ⚠️ `exactOptionalPropertyTypes`: o que não veio na URL não vira a chave com `undefined` — a chave nem existe.
  const opcoes = Object.fromEntries((["vista", "dia", "contrato", "fiscal", "situacao"] as const).flatMap((k) => {
    const v = texto(k);
    const nome = k === "contrato" ? "contratoId" : k === "fiscal" ? "fiscalUsuario" : k;
    return v === undefined ? [] : [[nome, v] as const];
  }));
  const a = await agendaParaTela(sessao, opcoes);
  const link = (extra: Record<string, string>): string => {
    const p = new URLSearchParams({ vista: a.vista, dia: a.dia, ...(a.filtros.contratoId === "" ? {} : { contrato: a.filtros.contratoId }), ...(a.filtros.fiscalUsuario === "" ? {} : { fiscal: a.filtros.fiscalUsuario }), ...(a.filtros.situacao === "" ? {} : { situacao: a.filtros.situacao }), ...extra });
    return `/licitacoes/fiscalizacao/agenda?${p.toString()}`;
  };
  const passo = a.vista === "dia" ? 1 : a.vista === "semana" ? 7 : 30;
  const mover = (dias: number): string => {
    const [ano, mes, d] = a.dia.split("-").map(Number) as [number, number, number];
    const x = new Date(Date.UTC(ano, mes - 1, d + dias));
    return link({ dia: `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}-${String(x.getUTCDate()).padStart(2, "0")}` });
  };

  return (
    <ResultadosDosAtos>
      <div className="space-y-4" data-agenda-da-fiscalizacao={a.vista}>
        <nav aria-label="Trilha" className="text-xs text-[color:var(--color-ink-2)]">
          <Link href="/licitacoes/fiscalizacao" className="underline underline-offset-2">Fiscalização</Link> / Agenda
        </nav>
        <header>
          <h1 className="text-xl font-semibold">Agenda de fiscalização</h1>
          <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">De {br(a.de)} a {br(a.ate)} — os compromissos dos contratos que você acompanha, no calendário do município.</p>
        </header>
        <AvisosDosAtos />

        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <nav aria-label="Vista da agenda" className="flex gap-1" data-vistas>
              {VISTAS.map((v) => (
                <Link key={v.valor} href={link({ vista: v.valor })} data-vista={v.valor} aria-current={a.vista === v.valor ? "page" : undefined}
                  className={`rounded-[var(--radius-md)] border px-3 py-1 text-sm ${a.vista === v.valor ? "border-[color:var(--color-primary)] font-semibold text-[color:var(--color-primary)]" : "border-[color:var(--color-border)]"}`}>{v.rotulo}</Link>
              ))}
            </nav>
            <div className="flex gap-1">
              <Link href={mover(-passo)} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-3 py-1 text-sm" data-anterior>Anterior</Link>
              <Link href={link({ dia: a.hoje })} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-3 py-1 text-sm" data-hoje>Hoje</Link>
              <Link href={mover(passo)} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-3 py-1 text-sm" data-proximo>Próximo</Link>
            </div>
          </div>
          {/* Os rótulos ENVOLVEM o campo: a associação é implícita, sem id literal (que se repetiria noutro render). */}
          <form method="get" className="mt-3 grid gap-2 sm:grid-cols-4" data-filtros-da-agenda>
            <input type="hidden" name="vista" value={a.vista} />
            <input type="hidden" name="dia" value={a.dia} />
            <label className="text-xs text-[color:var(--color-ink-2)]"><span className="mb-1 block font-medium text-[color:var(--color-ink)]">Contrato</span>
              <select name="contrato" defaultValue={a.filtros.contratoId} className="w-full rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-2 py-1 text-sm">
                <option value="">Todos que você acompanha</option>
                {a.contratos.map((c) => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}
              </select>
            </label>
            <label className="text-xs text-[color:var(--color-ink-2)]"><span className="mb-1 block font-medium text-[color:var(--color-ink)]">Fiscal</span>
              <select name="fiscal" defaultValue={a.filtros.fiscalUsuario} className="w-full rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-2 py-1 text-sm">
                <option value="">Todos</option>
                {a.fiscais.map((f) => <option key={f.valor} value={f.valor}>{f.rotulo}</option>)}
              </select>
            </label>
            <label className="text-xs text-[color:var(--color-ink-2)]"><span className="mb-1 block font-medium text-[color:var(--color-ink)]">Situação</span>
              <select name="situacao" defaultValue={a.filtros.situacao} className="w-full rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-2 py-1 text-sm">
                <option value="">Todas</option>
                {Object.entries(SITUACAO).map(([v, s]) => <option key={v} value={v}>{s.texto}</option>)}
              </select>
            </label>
            <div className="flex items-end"><button type="submit" className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-3 py-1 text-sm">Filtrar</button></div>
          </form>
        </Card>

        {a.semAlcance ? (
          <Card><p className="text-sm text-[color:var(--color-ink-2)]" data-sem-alcance-na-agenda>Você não tem designação vigente em contrato nenhum nem definição de administrador da fiscalização: a agenda não mostra compromissos de outros.</p></Card>
        ) : (
          <Card>
            {a.compromissos.length === 0 ? <p className="text-sm text-[color:var(--color-ink-2)]" data-agenda-vazia>Nenhum compromisso no período.</p> : null}
            <div className={a.vista === "mes" ? "grid gap-2 sm:grid-cols-2 lg:grid-cols-4" : "space-y-3"} data-grade-da-agenda={a.dias.length}>
              {a.dias.map((d) => (
                <section key={d.dia} data-dia-da-agenda={d.dia} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-2">
                  <h2 className="text-xs font-semibold">{br(d.dia)} <span className="font-normal text-[color:var(--color-ink-2)]">{nomeDoDia(d.dia)}{d.dia === a.hoje ? " · hoje" : ""}</span></h2>
                  {d.compromissos.length === 0 ? <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">—</p> : (
                    <ul className="mt-1 space-y-2">
                      {d.compromissos.map((c) => (
                        <li key={c.id} data-compromisso={c.numero} className="rounded-[var(--radius-md)] bg-[color:var(--color-surface-2)] p-2 text-sm">
                          <p>
                            <strong>{c.horaInicio === null ? "sem horário" : `${c.horaInicio}${c.horaFim === null ? "" : `–${c.horaFim}`}`}</strong> · nº {c.numero} ·{" "}
                            <Link href={`/licitacoes/contratos/${c.contratoId}`} className="text-[color:var(--color-primary)] underline underline-offset-2">{c.contrato}</Link>{" "}
                            <Badge status={SITUACAO[c.situacao]?.tom ?? "neutro"}>{SITUACAO[c.situacao]?.texto ?? c.situacao}</Badge>
                            {c.conflitos.length > 0 ? <Badge status="alerta">horário cruza com a nº {c.conflitos.join(", nº ")}</Badge> : null}
                          </p>
                          <p className="text-xs text-[color:var(--color-ink-2)] [overflow-wrap:anywhere]">{c.objetivo}{c.local === null ? "" : ` · ${c.local}`} · {c.fiscal}</p>
                          {c.historico.length === 0 ? null : <p className="text-xs text-[color:var(--color-ink-2)]" data-historico-do-compromisso={c.historico.length}>Reagendada {c.historico.length}×; a última para {br(c.historico[c.historico.length - 1]!.data)}: {c.historico[c.historico.length - 1]!.motivo}</p>}
                          {c.cancelamento === null ? null : <p className="text-xs" data-cancelamento-do-compromisso>Cancelada por {c.cancelamento.por}: {c.cancelamento.motivo}</p>}
                          {c.realizacao === null ? null : <p className="text-xs" data-realizacao-do-compromisso>Realizada em {br(c.realizacao.data)}{c.realizacao.horaInicio === null ? "" : ` das ${c.realizacao.horaInicio} às ${c.realizacao.horaFim ?? "—"}`} por {c.realizacao.por}: {c.realizacao.relato}</p>}
                          {c.ocorrencias.length === 0 ? null : <p className="text-xs">Ocorrências: {c.ocorrencias.map((o) => `nº ${o.numero} (${o.tipo})`).join(", ")}</p>}
                          {c.situacao === "CANCELADA" || c.situacao === "REALIZADA" ? null : (
                            <>
                              {a.podeProgramar ? <FormReagendar ordemId={c.id} contratoId={c.contratoId} numero={c.numero} data={c.data} horaInicio={c.horaInicio} duracaoMinutos={c.duracaoMinutos} local={c.local} hoje={a.hoje} /> : null}
                              {a.podeProgramar ? <FormCancelarFiscalizacao ordemId={c.id} contratoId={c.contratoId} numero={c.numero} /> : null}
                              {a.podeRealizar ? <FormRealizar ordemId={c.id} contratoId={c.contratoId} numero={c.numero} data={c.data} hoje={a.hoje} /> : null}
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
            </div>
            <p className="mt-3 text-xs text-[color:var(--color-ink-2)]">Reagendar e cancelar são do gestor designado; registrar a realização, do fiscal do compromisso. Quem não pode não recebe o formulário, e o servidor recusa de novo.</p>
          </Card>
        )}
      </div>
    </ResultadosDosAtos>
  );
}
