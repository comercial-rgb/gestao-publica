import { CardNavegacao } from "../../../components/ui/Card";
import { PageHeader } from "../../../components/ui/PageHeader";
import { AREAS, RELATORIOS_DESIGNER, RELATORIOS_GERENCIAIS, RELATORIOS_LIVROS, RELATORIOS_RGF, RELATORIOS_RREO } from "../../../lib/navegacao";

/**
 * Landing da área RELATÓRIOS — o índice dos demonstrativos. Cada grupo (RREO, RGF, Livros) lista os
 * relatórios já publicados, com fonte única nas listas de `lib/navegacao`.
 */

export default function RelatoriosPage(): React.ReactElement {
  const area = AREAS.find((a) => a.slug === "relatorios")!;
  return (
    <div className="space-y-6">
      <PageHeader titulo={area.rotulo} subtitulo={area.descricao} />

      {/* ── RREO ── */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">
          RREO — Relatório Resumido da Execução Orçamentária
        </h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {RELATORIOS_RREO.map((rel) => (
            <CardNavegacao key={rel.href} href={rel.href} rotulo={rel.numero} titulo={rel.rotulo} descricao={rel.descricao} />
          ))}
        </div>
      </section>

      {/* ── RGF ── */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">
          RGF — Relatório de Gestão Fiscal
        </h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {RELATORIOS_RGF.map((rel) => (
            <CardNavegacao key={rel.href} href={rel.href} rotulo={rel.numero} titulo={rel.rotulo} descricao={rel.descricao} />
          ))}
        </div>
      </section>

      {/* ── Livros ── */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">Livros obrigatórios</h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {RELATORIOS_LIVROS.map((rel) => (
            <CardNavegacao key={rel.href} href={rel.href} rotulo={rel.numero} titulo={rel.rotulo} descricao={rel.descricao} />
          ))}
        </div>
      </section>

      {/* ── Gerenciais ──
          ⚠️ SEÇÃO SEPARADA DOS LIVROS de propósito. RREO, RGF e livros têm forma FIXADA por lei —
          o ente não escolhe as colunas. Os gerenciais são o oposto: consulta livre, com filtro do
          usuário e export aberto (CSV). Misturá-los sugeriria que um demonstrativo legal também é
          configurável, que é justamente o que ele não pode ser. */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">Gerenciais</h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {RELATORIOS_GERENCIAIS.map((rel) => (
            <CardNavegacao key={rel.href} href={rel.href} rotulo={rel.numero} titulo={rel.rotulo} descricao={rel.descricao} />
          ))}
        </div>
      </section>

      {/* ── Designer ──
          ⚠️ SEÇÃO PRÓPRIA, e a razão é a mesma que separa os gerenciais dos livros, levada
          um passo adiante: nos gerenciais o usuário escolhe o FILTRO; aqui ele escreve a
          COLUNA. Pô-lo entre os relatórios legais sugeriria que um RREO também se desenha —
          e a fórmula do RREO está na lei, não na tela. */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">Desenhados pela entidade</h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {RELATORIOS_DESIGNER.map((rel) => (
            <CardNavegacao key={rel.href} href={rel.href} rotulo={rel.numero} titulo={rel.rotulo} descricao={rel.descricao} />
          ))}
        </div>
      </section>

    </div>
  );
}
