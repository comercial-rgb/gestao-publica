import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "../../../../../components/ui/Card";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { exigirLeitura } from "../../../../../lib/portas/molde";
import { loteParaTela } from "../../../../../lib/portas/lancamento-tributario";
import { AcoesDoLancamento } from "./AcoesDoLancamento";

/**
 * RECEITA · O lote de lançamentos, imóvel a imóvel (V10 T2 · N5).
 *
 * ⚠️ A MEMÓRIA APARECE, e não é enfeite: é ela que responde "por que deu este valor?" num
 * recurso, dois anos depois. Cada variável com o seu valor e a sua origem, a fórmula e o
 * fundamento da tabela que valia no fato gerador.
 */
export const dynamic = "force-dynamic";

const RÓTULO_DA_SITUACAO: Record<string, string> = {
  PREPARADO: "Preparado",
  CONSTITUIDO: "Constituído",
  CANCELADO: "Cancelado",
  RETIFICADO: "Retificado",
};

interface VariavelDaMemoria {
  readonly nome: string;
  readonly valor: string;
  readonly origem: string;
}

interface MemoriaCongelada {
  readonly tabela?: { readonly versao?: number; readonly fundamento?: string; readonly formula?: string };
  readonly imovel?: { readonly versao?: number };
  readonly variaveis?: readonly VariavelDaMemoria[];
}

export default async function LotePage({
  params,
}: {
  readonly params: Promise<{ readonly loteId: string }>;
}): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_RECEITA");
  const { loteId } = await params;
  const dados = await loteParaTela(loteId);
  if (dados === null) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        titulo={`Lote ${dados.lote.numero}`}
        subtitulo={`${dados.lote.tributo}/${dados.lote.exercicio} — fato gerador em ${dados.lote.fatoGerador.split("-").reverse().join("/")}. Natureza ${dados.lote.naturezaCodigo}. ${dados.lote.descricao}`}
      />

      <p className="text-sm">
        <Link href="/receita/lancamentos" className="underline">
          Voltar aos lotes
        </Link>
      </p>

      <Card>
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-[color:var(--color-ink-3)]">Total do lote</dt>
            <dd className="tabular text-[color:var(--color-ink)]" data-papel="total-do-lote">{dados.lote.total}</dd>
          </div>
          <div>
            <dt className="text-xs text-[color:var(--color-ink-3)]">Preparados</dt>
            <dd className="tabular text-[color:var(--color-ink)]">{dados.lote.preparados}</dd>
          </div>
          <div>
            <dt className="text-xs text-[color:var(--color-ink-3)]">Constituídos</dt>
            <dd className="tabular text-[color:var(--color-ink)]">{dados.lote.constituidos}</dd>
          </div>
          <div>
            <dt className="text-xs text-[color:var(--color-ink-3)]">Com pendência de revisão</dt>
            <dd className="tabular text-[color:var(--color-ink)]">{dados.lote.comInconsistencia}</dd>
          </div>
        </dl>
      </Card>

      {dados.lancamentos.map((l) => {
        const memoria = (l.memoria ?? {}) as MemoriaCongelada;
        return (
          <Card key={l.id}>
            <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">Imóvel {l.inscricao}</h2>
              <span data-papel="situacao" className="text-xs font-medium text-[color:var(--color-ink-2)]">
                {RÓTULO_DA_SITUACAO[l.situacao] ?? l.situacao} · {l.valor}
              </span>
            </header>

            {l.inconsistencias.length > 0 ? (
              <ul role="list" data-papel="inconsistencias" className="mb-3 space-y-1">
                {l.inconsistencias.map((i) => (
                  <li key={i.codigo} className="rounded-[var(--radius-md)] bg-[color:var(--color-status-alerta-bg)] px-3 py-2 text-xs text-[color:var(--color-status-alerta-fg)]">
                    {i.detalhe}
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <h3 className="mb-1 text-xs font-semibold text-[color:var(--color-ink-2)]">Quem responde</h3>
                {l.responsaveis.length === 0 ? (
                  <p className="text-xs text-[color:var(--color-ink-3)]">Nenhum vínculo vigente no fato gerador.</p>
                ) : (
                  <ul role="list" className="space-y-0.5 text-xs">
                    {l.responsaveis.map((r) => (
                      <li key={`${r.documento}-${r.papel}`} className="text-[color:var(--color-ink)]">
                        {r.nome} — {r.papel.toLowerCase().replace(/_/g, " ")}, fração {r.fracao} ({r.valorProporcional})
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="mb-1 text-xs font-semibold text-[color:var(--color-ink-2)]">Vencimentos</h3>
                <ul role="list" className="space-y-0.5 text-xs">
                  {l.vencimentos.map((v) => (
                    <li key={v.numero} className="tabular text-[color:var(--color-ink)]">
                      {v.numero}/{l.vencimentos.length} — {v.vencimento.split("-").reverse().join("/")} — {v.valor}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-semibold text-[color:var(--color-ink-2)]">
                Memória do cálculo (congelada na preparação)
              </summary>
              <div className="mt-2 text-xs" data-papel="memoria">
                <p className="text-[color:var(--color-ink-3)]">
                  Cadastro na versão {memoria.imovel?.versao ?? "—"}; tabela na versão {memoria.tabela?.versao ?? "—"}.
                  Fundamento: {memoria.tabela?.fundamento ?? "—"}.
                </p>
                <p className="mt-1 font-mono text-[color:var(--color-ink)]">{memoria.tabela?.formula ?? "—"}</p>
                <ul role="list" className="mt-1 space-y-0.5">
                  {(memoria.variaveis ?? []).map((v) => (
                    <li key={v.nome} className="text-[color:var(--color-ink)]">
                      <span className="font-mono">{v.nome}</span> = {v.valor}{" "}
                      <span className="text-[color:var(--color-ink-3)]">({v.origem})</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-[color:var(--color-ink-3)]">
                  Impressão digital da memória: <span className="font-mono">{l.memoriaSha256.slice(0, 16)}…</span>
                </p>
              </div>
            </details>

            {l.correcoes.length > 0 ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-semibold text-[color:var(--color-ink-2)]">
                  Correções ({l.correcoes.length})
                </summary>
                <ul role="list" className="mt-1 space-y-0.5 text-xs" data-papel="correcoes">
                  {l.correcoes.map((c, i) => (
                    <li key={`${c.tipo}-${i}`} className="text-[color:var(--color-ink)]">
                      {c.tipo === "RETIFICACAO" ? "Retificado" : "Cancelado"} por {c.criadoPor}: {c.motivo}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}

            <div className="mt-3">
              <AcoesDoLancamento
                loteId={loteId}
                lancamentoId={l.id}
                inscricao={l.inscricao}
                situacao={l.situacao}
                temInconsistencia={l.inconsistencias.length > 0}
                podeConstituir={dados.podeConstituir}
                podeRetificar={dados.podeRetificar}
                podeCancelar={dados.podeCancelar}
              />
            </div>
          </Card>
        );
      })}
    </div>
  );
}
