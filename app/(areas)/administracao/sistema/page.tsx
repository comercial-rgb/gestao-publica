import { Card } from "../../../../components/ui/Card";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { proveniencia, PRODUTO } from "../../../../lib/identidade/produto";
import { lerDiagnosticoDePermissoes } from "../../../../lib/portas/administracao";
import { exigirLeitura } from "../../../../lib/portas/molde";
import { instanteCivilBr } from "../../../../packages/datas/index";

/**
 * ADMINISTRAÇÃO · Sobre o sistema (V6 P0.1) — a ÁREA TÉCNICA AUTORIZADA. O SHA completo do
 * build saiu do rodapé comum e mora aqui: proveniência, ambiente, versão do Node e as
 * atualizações de permissões instaladas. Só quem consulta a administração vê.
 */
export const dynamic = "force-dynamic";

export default async function SistemaPage(): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_ADMINISTRACAO");
  const prov = proveniencia();
  let atualizacoes: Awaited<ReturnType<typeof lerDiagnosticoDePermissoes>>["atualizacoes"] | null = null;
  try {
    atualizacoes = (await lerDiagnosticoDePermissoes()).atualizacoes;
  } catch {
    atualizacoes = null;
  }

  return (
    <div className="space-y-6">
      <PageHeader titulo="Sobre o sistema" subtitulo="Proveniência técnica desta implantação — para quem confere versões e evidências." />
      <Card>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-[color:var(--color-ink-3)]">Produto</dt><dd className="text-[color:var(--color-ink)]">{PRODUTO.nome} — {PRODUTO.descricao}</dd></div>
          <div><dt className="text-xs text-[color:var(--color-ink-3)]">Ambiente</dt><dd className="text-[color:var(--color-ink)]">{prov.ambiente}</dd></div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-[color:var(--color-ink-3)]">Commit do build</dt>
            <dd className="break-all font-mono text-xs text-[color:var(--color-ink)]" data-build-commit>{prov.commit ?? "fora de um build versionado (desenvolvimento)"}</dd>
          </div>
          <div><dt className="text-xs text-[color:var(--color-ink-3)]">Node</dt><dd className="font-mono text-xs text-[color:var(--color-ink)]">{process.version}</dd></div>
        </dl>
      </Card>
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-ink)]">Atualizações de permissões</h2>
        {atualizacoes === null ? (
          <p className="text-sm text-[color:var(--color-ink-3)]">Indisponível agora — a situação das atualizações não pôde ser lida.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {atualizacoes.map((a) => (
              <li key={a.versao} className="flex flex-wrap gap-x-3">
                <span className="tabular font-medium text-[color:var(--color-ink)]">v{a.versao}</span>
                <span className="text-[color:var(--color-ink-2)]">{a.nome}</span>
                <span className="text-xs text-[color:var(--color-ink-3)]">
                  {a.aplicadaEm !== null ? `aplicada em ${instanteCivilBr(a.aplicadaEm)} por ${a.aplicadaPor ?? "—"}` : `pendente — prévia de ${a.previa} concessão(ões)`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
