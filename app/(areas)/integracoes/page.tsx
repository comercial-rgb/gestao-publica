import Link from "next/link";
import { Badge, type StatusBadge } from "../../../components/ui/Badge";
import { Card } from "../../../components/ui/Card";
import { PageHeader } from "../../../components/ui/PageHeader";
import { montarCentralIntegracoes, type EstadoCard } from "../../../lib/portas/integracoes";

/**
 * CENTRAL DE INTEGRAÇÕES (S6) — o hub que a Comissão vê. Quatro canais (SAGRES TXT · Captura 2.0 ·
 * Banco do Brasil · API TCE), cada um com o MODO vigente, o último evento e a ação principal — ou o
 * BLOQUEIO NOMEADO (DIRETIVA §3). Comunicação honesta §7 no topo. Consome a porta (grep trivalente).
 */
export const dynamic = "force-dynamic";

const TOM: Record<EstadoCard, StatusBadge> = {
  OPERACIONAL: "ok",
  SIMULACAO: "neutro",
  AGUARDANDO_CREDENCIAL: "alerta",
  BLOQUEADO_DOCUMENTO: "alerta",
};

export default async function CentralIntegracoesPage(): Promise<React.ReactElement> {
  let cards: Awaited<ReturnType<typeof montarCentralIntegracoes>> = [];
  let erro: string | null = null;
  try {
    cards = await montarCentralIntegracoes();
  } catch (e) {
    erro = e instanceof Error ? e.message : "Falha ao montar a Central.";
  }

  return (
    <div className="space-y-6">
      <PageHeader titulo="Central de Integrações SIAFIC" subtitulo="SAGRES TXT · Captura 2.0 · Banco do Brasil · API TCE — cada canal com o seu modo e estado." />

      <div className="rounded-[var(--radius-lg)] border border-[color:var(--color-status-alerta-fg)] bg-[color:var(--color-status-alerta-bg)] p-5 text-sm">
        <p className="font-semibold text-[color:var(--color-ink)]">Formato oficial gerado e validado localmente</p>
        <p className="mt-1 text-[color:var(--color-ink-2)]">
          Toda geração aqui é <strong>local</strong>. Simulações são <strong>simulações</strong> — <strong>nenhuma transmissão externa</strong> ao TCE ou ao banco foi realizada.
          O <strong>modo aparece em cada card</strong>: o modo exibido é o modo que executa (nunca há fallback silencioso).
        </p>
      </div>

      {erro !== null && (
        <Card>
          <p className="text-sm font-semibold text-[color:var(--color-status-erro-fg)]">Não foi possível montar a Central</p>
          <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">{erro}</p>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {cards.map((c) => (
          <Card key={c.chave}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">{c.titulo}</h2>
                <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">{c.descricao}</p>
              </div>
              <Badge status={TOM[c.estado]}>{c.modo}</Badge>
            </div>

            <dl className="mt-3 space-y-1 text-xs text-[color:var(--color-ink-2)]">
              {c.ultimoEvento !== null && (
                <div><dt className="inline font-medium">Último evento:</dt> <dd className="inline">{c.ultimoEvento}</dd></div>
              )}
              {c.hash !== null && (
                <div className="break-all"><dt className="inline font-medium">Hash:</dt> <dd className="inline">{c.hash}</dd></div>
              )}
              {c.detalhe !== null && (
                <div className="text-[color:var(--color-ink-3)]">{c.detalhe}</div>
              )}
            </dl>

            {c.acaoHref !== null && c.acaoRotulo !== null && (
              <div className="mt-3">
                <Link href={c.acaoHref} className="inline-flex h-10 items-center rounded-[var(--radius-md)] bg-[color:var(--color-primary)] px-4 text-sm font-semibold text-[color:var(--color-primary-fg)] hover:bg-[color:var(--color-primary-hover)]">
                  {c.acaoRotulo}
                </Link>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
