import { notFound } from "next/navigation";
import { Badge } from "../../../../../components/ui/Badge";
import { Card } from "../../../../../components/ui/Card";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { lerChamado } from "../../../../../lib/portas/suporte";
import { FormAtendimento, FormAvaliar } from "../FormChamado";
import { instanteCivilBr } from "../../../../../packages/datas/index";

export const dynamic = "force-dynamic";

function instante(d: Date): string {
  // ⚠️ SEM `timeZone`, o `Intl` usa o relógio de QUEM RENDERIZA — a máquina, num
  // componente de servidor. `instanteCivilBr` fixa o fuso do ente.
  return instanteCivilBr(d);
}

export default async function ChamadoPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  const c = await lerChamado(id);
  if (c === null) notFound();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader titulo={`Chamado ${c.numero}`} subtitulo={c.titulo} />

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            status={
              c.situacao === "ENCERRADO" ? "ok" : c.situacao === "RESPONDIDO" ? "alerta" : "neutro"
            }
          >
            {c.situacao.toLowerCase()}
          </Badge>
          <Badge status="neutro">{c.severidade}</Badge>
          {c.prazoHoras !== null ? (
            <Badge status="neutro">prazo de resposta: {c.prazoHoras}h</Badge>
          ) : null}
          {c.nota !== null ? <Badge status="ok">nota {c.nota}</Badge> : null}
        </div>

        <p className="mt-3 text-xs text-[color:var(--color-ink-2)]">
          Aberto por {c.abertoPor} em {instante(c.abertoEm)}
          {c.rota !== null ? ` · tela ${c.rota}` : ""}
        </p>

        <p className="mt-3 whitespace-pre-line text-sm text-[color:var(--color-ink)]">
          {c.descricao}
        </p>

        {c.comentario !== null ? (
          <p className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
            <strong className="text-[color:var(--color-ink)]">Avaliação:</strong>{" "}
            {c.comentario}
          </p>
        ) : null}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FormAtendimento chamadoId={c.id} encerrado={c.situacao === "ENCERRADO"} />
        {c.podeAvaliar ? <FormAvaliar chamadoId={c.id} /> : null}
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">
          Histórico
        </h2>
        {c.movimentos.length === 0 ? (
          <p className="text-sm text-[color:var(--color-ink-2)]">
            Sem movimentação — o chamado está aguardando atendimento.
          </p>
        ) : (
          <ol className="text-sm">
            {c.movimentos.map((m, i) => (
              <li
                key={`${m.em.toISOString()}-${i}`}
                className="border-b border-[color:var(--color-border)] py-3 last:border-0"
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <strong>{m.tipo.toLowerCase()}</strong>
                  <span className="text-xs text-[color:var(--color-ink-2)]">
                    {instante(m.em)} · {m.por}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-line text-[color:var(--color-ink-2)]">
                  {m.texto}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
