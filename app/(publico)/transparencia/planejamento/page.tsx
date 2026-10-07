import Link from "next/link";
import { identidadePublica } from "../../../../lib/portas/identidade";
import { ANEXOS_DA_LDO } from "../../../../lib/portas/anexos-ldo";
import { lerPlanejamentoPublico, PortaSemBancoError, type PlanejamentoPublico } from "../../../../lib/portas/planejamento-publico";

/**
 * V35 C9 — PLANEJAMENTO NO PORTAL DA TRANSPARÊNCIA (LRF, art. 48): PPA, LDO e LOA que já são lei. Sem sessão.
 */
export const dynamic = "force-dynamic";

const ROTULO_DO_ANEXO_DA_LDO: Readonly<Record<(typeof ANEXOS_DA_LDO)[number], string>> = {
  "metas-anuais": "Metas fiscais anuais",
  "riscos-fiscais": "Riscos fiscais",
  "renuncia-receita": "Renúncia de receita",
  "alienacao-bens": "Alienação de bens",
  "projecao-rpps": "Projeção atuarial do regime próprio",
  "divida-consolidada": "Dívida consolidada",
  "margem-expansao": "Margem de expansão das despesas obrigatórias",
  prioridades: "Prioridades e metas",
  "obras-e-conservacao": "Obras e conservação do patrimônio",
};

const tamanho = (b: number): string => (b >= 1_048_576 ? `${(Math.round((b / 1_048_576) * 10) / 10).toString().replace(".", ",")} MB` : `${String(Math.max(1, Math.round(b / 1024)))} KB`);

export default async function PlanejamentoPublicoPage(): Promise<React.ReactElement> {
  const id = await identidadePublica();
  let dados: PlanejamentoPublico | null = null;
  let erro: string | null = null;
  try {
    dados = await lerPlanejamentoPublico();
  } catch (e) {
    erro = e instanceof PortaSemBancoError ? "Consulta indisponível no momento." : "Não foi possível consultar o planejamento.";
  }
  const caixa = "rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3";
  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <nav aria-label="Caminho" className="mb-3 text-xs">
        <Link href="/transparencia" className="underline">Transparência</Link> › Planejamento
      </nav>
      <header className="mb-4">
        <h1 className="text-2xl font-semibold text-[color:var(--color-ink)]">Planejamento e orçamento</h1>
        <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">
          {id.ente?.nomeDeExibicao ?? "Ente não configurado"} · Plano Plurianual, Lei de Diretrizes Orçamentárias e Lei Orçamentária Anual
          já aprovados (Lei Complementar 101/2000, art. 48).
        </p>
      </header>
      {erro !== null || dados === null ? (
        <p role="alert" className="text-sm">{erro}</p>
      ) : (
        <div className="space-y-6">
          <section aria-label="Lei Orçamentária Anual" className="space-y-2">
            <h2 className="text-lg font-semibold">Lei Orçamentária Anual</h2>
            {dados.loas.length === 0 ? <p className="text-sm text-[color:var(--color-ink-3)]">Nenhuma lei orçamentária aprovada registrada.</p> : null}
            {dados.loas.map((l) => (
              <article key={l.exercicio} className={caixa}>
                <h3 className="font-medium">Exercício {l.exercicio} · Lei nº {l.lei}</h3>
                <p className="text-sm text-[color:var(--color-ink-2)]">{l.ementa}</p>
                <p className="text-xs text-[color:var(--color-ink-3)]">
                  Sancionada em {l.sancao}; publicada em {l.publicacao} ({l.veiculo}).
                </p>
                <p className="mt-2 text-sm">
                  <Link href={`/transparencia/planejamento/loa/${String(l.exercicio)}`} className="underline">Receita prevista, despesa fixada e anexos da Lei 4.320/1964</Link>
                </p>
                {l.documentos.length > 0 ? (
                  <ul className="mt-2 list-disc pl-5 text-sm">
                    {l.documentos.map((d) => (
                      <li key={d.id}>
                        <a href={`/transparencia/planejamento/documento/${d.id}`} className="underline">{d.nome}</a>{" "}
                        <span className="text-xs text-[color:var(--color-ink-3)]">({tamanho(d.tamanhoBytes)}; SHA-256 {d.sha256.slice(0, 12)}…)</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </section>
          <section aria-label="Lei de Diretrizes Orçamentárias" className="space-y-2">
            <h2 className="text-lg font-semibold">Lei de Diretrizes Orçamentárias</h2>
            {dados.ldos.length === 0 ? <p className="text-sm text-[color:var(--color-ink-3)]">Nenhuma lei de diretrizes sancionada registrada.</p> : null}
            {dados.ldos.map((l) => (
              <article key={l.id} className={caixa}>
                <h3 className="font-medium">LDO {l.exercicio}</h3>
                <p className="text-xs text-[color:var(--color-ink-3)]">Sancionada em {l.sancao}; vigência de {l.vigencia}.</p>
                <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                  {ANEXOS_DA_LDO.map((a) => (
                    <li key={a}>
                      <a href={`/transparencia/planejamento/ldo/${l.id}/${a}`} className="underline">{ROTULO_DO_ANEXO_DA_LDO[a]}</a> <span className="text-xs">(PDF)</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </section>
          <section aria-label="Plano Plurianual" className="space-y-2">
            <h2 className="text-lg font-semibold">Plano Plurianual</h2>
            {dados.ppas.length === 0 ? <p className="text-sm text-[color:var(--color-ink-3)]">Nenhum plano plurianual registrado.</p> : null}
            {dados.ppas.map((p) => (
              <article key={p.anoInicio} className={caixa}>
                <h3 className="font-medium">PPA {p.anoInicio} a {p.anoFim}</h3>
                <p className="text-xs text-[color:var(--color-ink-3)]">Lei {p.lei}, publicada em {p.publicacao}.</p>
              </article>
            ))}
          </section>
        </div>
      )}
    </main>
  );
}
