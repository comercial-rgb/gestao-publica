import Link from "next/link";
import { notFound } from "next/navigation";
import { formatarMoeda } from "../../../../../lib/format/moeda";
import { identidadePublica } from "../../../../../lib/portas/identidade";
import { obraPublica } from "../../../../../lib/portas/obras-no-portal";
import { TIPOS_DE_OBRA_OPCOES } from "../../../../../lib/portas/recursos/definicoes";
import { diaCivilBr } from "../../../../../packages/datas/index";

/**
 * V36 (TR 5.10.1.54) — UMA OBRA NO PORTAL: cadastro, valores, medições aprovadas e documentos. Obra não publicada
 * responde 404, como a inexistente.
 */
export const dynamic = "force-dynamic";

const reais = (v: string | null): string => (v === null ? "—" : `R$ ${formatarMoeda(v).texto}`);

export default async function ObraPublicaPage({ params }: { readonly params: Promise<{ readonly id: string }> }): Promise<React.ReactElement> {
  const ident = await identidadePublica();
  const { id } = await params;
  const o = await obraPublica(id);
  if (o === null) notFound();
  const tipo = TIPOS_DE_OBRA_OPCOES.find((t) => t.valor === o.tipoObraServico)?.rotulo ?? o.tipoObraServico;
  const dados: readonly (readonly [string, string])[] = [
    ["Descrição", o.descricao],
    ["Tipo", tipo],
    ["Órgão responsável", o.orgao ?? "não informado"],
    ["CEI", o.cei ?? "não informado"],
    ["Valor da obra", o.valorDaObra === null ? "sem planilha orçamentária registrada" : reais(o.valorDaObra)],
    ["Valor contratado", reais(o.valorContratado)],
    ["Valor empenhado", reais(o.valorEmpenhado)],
    ["Medido e aprovado", reais(o.medidoAprovado)],
    ["Percentual executado", o.percentualExecutado === null ? "sem valor contratado" : `${o.percentualExecutado.replace(".", ",")}%`],
    ["Publicada em", diaCivilBr(o.publicadaEm)],
  ];
  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6" data-tema={ident.ente?.tema ?? "PADRAO"}>
      <p className="mb-2 text-xs">
        <Link href="/transparencia" className="text-[color:var(--color-primary)] hover:underline">Transparência</Link> /{" "}
        <Link href="/transparencia/obras" className="text-[color:var(--color-primary)] hover:underline">Obras</Link> / {o.identificador}
      </p>
      <h1 className="mb-4 text-xl font-semibold text-[color:var(--color-ink)]">Obra {o.identificador}</h1>
      <dl className="grid gap-3 text-sm sm:grid-cols-2" data-obra-publica={o.id}>
        {dados.map(([r, v]) => (
          <div key={r}>
            <dt className="text-xs text-[color:var(--color-ink-2)]">{r}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold">Contratos</h2>
        {o.contratos.length === 0 ? (
          <p className="text-sm text-[color:var(--color-ink-2)]">Nenhum contrato ligado à obra.</p>
        ) : (
          <ul className="text-sm">
            {o.contratos.map((c) => (
              <li key={c.numero}>{c.numero}: {reais(c.valorAtualizado)} (com aditivos)</li>
            ))}
          </ul>
        )}
      </section>
      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold">Medições aprovadas</h2>
        {o.medicoesAprovadas.length === 0 ? (
          <p className="text-sm text-[color:var(--color-ink-2)]">Nenhuma medição aprovada.</p>
        ) : (
          <ul className="text-sm">
            {o.medicoesAprovadas.map((m) => (
              <li key={m.numero}>
                Medição {m.numero} (contrato {m.contrato}), de {diaCivilBr(m.periodoInicio)} a {diaCivilBr(m.periodoFim)}: {reais(m.valor)}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold">Documentos</h2>
        {o.anexos.length === 0 ? (
          <p className="text-sm text-[color:var(--color-ink-2)]">Nenhum documento anexado.</p>
        ) : (
          <ul className="text-sm" data-anexos-da-obra-publica>
            {o.anexos.map((a) => (
              <li key={a.id}>
                <a className="text-[color:var(--color-primary)] underline" href={`/transparencia/obras/anexo/${a.id}`}>{a.nome}</a> ({Math.max(1, Math.round(a.tamanhoBytes / 1024))} KB)
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
