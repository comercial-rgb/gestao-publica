import Link from "next/link";
import { Badge, type StatusBadge } from "../../../components/ui/Badge";
import { Card } from "../../../components/ui/Card";
import { PageHeader } from "../../../components/ui/PageHeader";
import { montarCentralIntegracoes, type EstadoCard } from "../../../lib/portas/integracoes";
import { telaExigeLeituraDoEnte } from "../../../lib/portas/leitura";

import { mensagemDoErro } from "../../../lib/portas/mensagem-do-erro";
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
  await telaExigeLeituraDoEnte("CONSULTAR_INTEGRACOES");
  let cards: Awaited<ReturnType<typeof montarCentralIntegracoes>> = [];
  let erro: string | null = null;
  try {
    cards = await montarCentralIntegracoes();
  } catch (e) {
    erro = e instanceof Error ? mensagemDoErro(e, "") : "Não foi possível carregar a Central de Integrações.";
  }

  return (
    <div className="space-y-6">
      <PageHeader titulo="Central de Integrações SIAFIC" subtitulo="Situação e modo de operação dos canais SAGRES TXT, Captura 2.0, Banco do Brasil e API do TCE." />

      <div className="rounded-[var(--radius-lg)] border border-[color:var(--color-status-alerta-fg)] bg-[color:var(--color-status-alerta-bg)] p-5 text-sm">
        <p className="font-semibold text-[color:var(--color-ink)]">Arquivos gerados e validados neste sistema</p>
        <p className="mt-1 text-[color:var(--color-ink-2)]">
          Os arquivos são gerados e validados neste sistema, e <strong>nenhuma transmissão externa</strong> ao TCE ou ao banco foi realizada.
          O modo de operação de cada canal é informado no respectivo quadro.
        </p>
      </div>

      {erro !== null && (
        <Card>
          <p className="text-sm font-semibold text-[color:var(--color-status-erro-fg)]">Não foi possível carregar a Central de Integrações</p>
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
                <div className="break-all"><dt className="inline font-medium">Código de verificação:</dt> <dd className="inline">{c.hash}</dd></div>
              )}
              {c.detalhe !== null && (
                <div className="text-[color:var(--color-ink-3)]">{c.detalhe}</div>
              )}
            </dl>

            {c.acaoHref !== null && c.acaoRotulo !== null && (
              <div className="mt-3">
                <Link href={c.acaoHref} className="inline-flex h-10 items-center rounded-[var(--radius-pilula)] bg-[color:var(--color-acao)] px-4 text-sm font-semibold text-[color:var(--color-acao-tinta)] hover:bg-[color:var(--color-acao-hover)]">
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
