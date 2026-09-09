import { revalidatePath } from "next/cache";
import { Badge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { PageHeader } from "../../../../components/ui/PageHeader";
import {
  contarSchemasOficiais,
  montarPreviewCaptura,
  simularSubmissaoCaptura,
  ultimasExecucoesCaptura,
  type EntidadeCaptura,
} from "../../../../lib/portas/captura";

/**
 * TELA SAGRES CAPTURA 2.0 (M18, S3) — a MESMA massa em JSON, validada contra o schema OFICIAL, com
 * simulação de submissão (MOCK → SIMULATED). Consome a PORTA (grep trivalente). Comunicação honesta
 * (DIRETIVA §7): "Simulação executada · Transmissão externa NÃO realizada" — o modo aparece sempre.
 */
export const dynamic = "force-dynamic";

/** Server action: simular a submissão (MOCK) de uma entidade. Mutação — o serviço cobra o censo. */
async function acaoSimular(formData: FormData): Promise<void> {
  "use server";
  const entidade = formData.get("entidade") as EntidadeCaptura;
  await simularSubmissaoCaptura(entidade, "MOCK");
  revalidatePath("/integracoes/captura");
}

function BannerHonesto(): React.ReactElement {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[color:var(--color-status-alerta-fg)] bg-[color:var(--color-status-alerta-bg)] p-5 text-sm">
      <p className="font-semibold text-[color:var(--color-ink)]">SAGRES Captura 2.0 — JSON gerado e validado localmente</p>
      <ul className="mt-2 space-y-1 text-[color:var(--color-ink-2)]">
        {/* ⚠️ O NÚMERO É CONTADO do arquivo de schemas, não digitado: a tela afirma isto a uma
            Comissão, e uma constante no JSX viraria mentira silenciosa no dia em que o TCE
            publicasse mais uma entidade. Ver `totalDeSchemasOficiais` no M18. */}
        <li>✓ JSON conforme os <strong>{contarSchemasOficiais()} JSON Schemas oficiais</strong> do TCE (draft 2020-12, versionados no repo com SHA-256 no manifesto).</li>
        <li>Modo: <Badge status="neutro">MOCK</Badge> — a simulação gera apenas um <code>simulationId</code> interno.</li>
        <li>⚠ <strong>Transmissão externa não realizada.</strong> SANDBOX/LIVE respondem <code>CREDENTIAL_NOT_CONFIGURED</code> até haver credencial — nunca caem em MOCK.</li>
        <li>○ Nenhum protocolo, recibo ou aceite do TCE: isso só existe com resposta real.</li>
      </ul>
    </div>
  );
}

export default async function CapturaPage(): Promise<React.ReactElement> {
  let preview: Awaited<ReturnType<typeof montarPreviewCaptura>> = [];
  let execucoes: Awaited<ReturnType<typeof ultimasExecucoesCaptura>> = [];
  let erro: string | null = null;
  try {
    preview = await montarPreviewCaptura();
    execucoes = await ultimasExecucoesCaptura(8);
  } catch (e) {
    erro = e instanceof Error ? e.message : "Falha ao montar a prévia.";
  }

  return (
    <div className="space-y-6">
      <PageHeader titulo="SAGRES Captura 2.0 — JSON" subtitulo="A mesma massa do TXT, em JSON, validada contra o schema oficial e simulada (MOCK)." />
      <BannerHonesto />

      {erro !== null && (
        <Card>
          <p className="text-sm font-semibold text-[color:var(--color-status-erro-fg)]">Não foi possível gerar a prévia</p>
          <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">{erro}</p>
        </Card>
      )}

      {/* ── LINHA DO TEMPO / HISTÓRICO DE SIMULAÇÕES ── */}
      {execucoes.length > 0 && (
        <Card>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">Simulações recentes</h2>
          <ul className="space-y-1 text-sm">
            {execucoes.map((x) => (
              <li key={x.correlationId} className="flex flex-wrap items-center gap-2">
                <Badge status={x.estado === "SIMULATED" ? "ok" : x.estado === "REJECTED_LOCAL" ? "erro" : "neutro"}>{x.estado}</Badge>
                <strong>{x.entidade}</strong>
                <span className="text-[color:var(--color-ink-2)]">DRAFT → VALIDATED_LOCAL → {x.estado === "SIMULATED" ? "SUBMITTED_MOCK → SIMULATED" : x.estado}</span>
                {x.simulationId !== null && <code className="text-xs text-[color:var(--color-ink-3)]">sim:{x.simulationId.slice(0, 8)}</code>}
                <code className="ml-auto text-xs text-[color:var(--color-ink-3)]">{x.modo}</code>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ── JSON POR ENTIDADE ── */}
      {preview.map((p) => (
        <Card key={p.entidade}>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
            <strong>{p.rotulo}</strong>
            <span className="text-[color:var(--color-ink-2)]">{p.registros} registro(s)</span>
            {p.violacoes.length === 0 ? (
              <Badge status="ok">schema oficial · válido</Badge>
            ) : (
              <Badge status="erro">{p.violacoes.length} violação(ões)</Badge>
            )}
            <form action={acaoSimular} className="ml-auto">
              <input type="hidden" name="entidade" value={p.entidade} />
              <button type="submit" disabled={p.registros === 0}
                className="inline-flex h-10 items-center rounded-[var(--radius-md)] bg-[color:var(--color-primary)] px-4 font-semibold text-[color:var(--color-primary-fg)] hover:bg-[color:var(--color-primary-hover)] disabled:opacity-40">
                Simular submissão (MOCK)
              </button>
            </form>
          </div>
          {p.violacoes.length > 0 && (
            <ul className="mb-2 space-y-1 text-sm text-[color:var(--color-status-erro-fg)]">
              {p.violacoes.slice(0, 8).map((v, i) => (
                <li key={i}><code>{v.campo}</code>: {v.regra} — {v.detalhe}</li>
              ))}
            </ul>
          )}
          {p.registros > 0 && (
            <details>
              <summary className="cursor-pointer text-sm text-[color:var(--color-ink-2)]">ver JSON gerado</summary>
              <div className="mt-2 overflow-x-auto rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]">
                <pre className="whitespace-pre px-3 py-2 font-mono text-xs leading-5 text-[color:var(--color-ink)]">{p.json}</pre>
              </div>
            </details>
          )}
        </Card>
      ))}
    </div>
  );
}
