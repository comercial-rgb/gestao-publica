import Link from "next/link";
import { DEMONSTRATIVOS_META } from "../../../lib/pdf/lista-publica";

/**
 * ÁREA PÚBLICA — DEMONSTRATIVOS (LC 131/2009 · TR 7.5). FORA do shell autenticado `(areas)`: esta
 * rota mora em `app/transparencia/**`, sob o layout RAIZ (como `/login`), então NÃO passa por
 * `exigirSessao`. Relatório oficial é público POR LEI — qualquer cidadão baixa o PDF sem login.
 *
 * ⚠️ A separação é ESTRUTURAL, não um `if`: a autenticação vive no layout de `(areas)`; o que está
 * fora dele é público por construção. Por isso não há (nem deve haver) allowlist no middleware — o
 * middleware não controla sessão neste projeto (só põe o `x-pathname`).
 */
export const dynamic = "force-dynamic";

const EXERCICIOS = [2026, 2025] as const;
const BIMESTRES = [1, 2, 3, 4, 5, 6] as const;

export default function DemonstrativosPublicosPage(): React.ReactElement {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-4 border-b border-[color:var(--color-border)] pb-3">
        <h1 className="text-xl font-semibold text-[color:var(--color-ink)]">Transparência — Demonstrativos Fiscais</h1>
        <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">
          Município de Campina Grande — PB · relatórios oficiais em PDF (LC 131/2009). Acesso público, sem cadastro.
        </p>
      </header>

      <p className="mb-4 text-xs text-[color:var(--color-ink-3)]">
        Escolha o exercício e o período — o PDF é gerado sob demanda, com hash SHA-256 do conteúdo no rodapé.
        ⚠️ Os documentos ainda <strong>não são assinados digitalmente</strong> (certificado ICP-Brasil pendente).
      </p>

      <ul className="space-y-3">
        {DEMONSTRATIVOS_META.map((d) => (
          <li key={d.slug} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3">
            <div className="mb-2 text-sm font-medium text-[color:var(--color-ink)]">{d.rotulo}</div>
            <div className="flex flex-wrap gap-2">
              {EXERCICIOS.flatMap((ex) =>
                BIMESTRES.map((bim) => (
                  <Link
                    key={`${ex}-${bim}`}
                    href={`/transparencia/demonstrativos/pdf?slug=${d.slug}&exercicio=${ex}&bimestre=${bim}`}
                    prefetch={false}
                    className="rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] px-2 py-1 text-xs text-[color:var(--color-primary)] hover:bg-[color:var(--color-surface-2)]"
                  >
                    {ex}/{bim}º bim · PDF
                  </Link>
                ))
              )}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
