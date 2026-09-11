import Link from "next/link";
import { pendenciasDoUsuario } from "../../lib/portas/pendencias";

/**
 * O QUE ESPERA POR VOCÊ — a faixa de pendências da home.
 *
 * ⚠️ ELA SOME QUANDO NÃO HÁ NADA. Uma faixa permanente com três zeros ocupa o topo da tela
 * todo dia e ensina o operador a não olhar para ali — e no dia em que aparecer um número
 * de verdade ele também não vai olhar. Sem pendência, sem faixa.
 *
 * ⚠️ E CADA NÚMERO CARREGA O CRITÉRIO. "Assinaturas na fila: 3" sem dizer o que foi contado
 * obriga o usuário a abrir a tela para descobrir se aquilo é dele. A legenda diz o `where`
 * em português — é a mesma disciplina das mensagens de recusa do domínio.
 *
 * ⚠️ NADA AQUI É CONTADOR ESTÁTICO. Ver `lib/portas/pendencias.ts`: toda linha é uma
 * contagem sobre registro existente, e um indicador sem origem não aparece.
 */
export async function PainelDePendencias(): Promise<React.ReactElement | null> {
  const pendencias = await pendenciasDoUsuario();
  if (pendencias.length === 0) return null;

  return (
    // ⚠️ `aria-label` NO LUGAR DE `aria-labelledby`, e não é preferência: um `id` literal
    // em JSX colide se o componente aparecer duas vezes na mesma página, e `id` duplicado
    // quebra justamente a associação que ele deveria criar. O guard
    // `test/ui/formularios-na-mesma-pagina.test.tsx` cobra isso.
    <section aria-label="O que espera por você" className="mb-6">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-3)]">
        O que espera por você
      </h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {pendencias.map((p) => (
          <li key={p.chave}>
            <Link
              href={p.href}
              className="flex items-baseline gap-3 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-4 py-3 transition-colors hover:border-[color:var(--color-primary)]"
            >
              <span className="text-2xl font-semibold leading-none text-[color:var(--color-primary)]">
                {p.quantidade}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-[color:var(--color-ink)]">
                  {p.rotulo}
                </span>
                <span className="block text-xs text-[color:var(--color-ink-3)]">
                  {p.criterio}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
