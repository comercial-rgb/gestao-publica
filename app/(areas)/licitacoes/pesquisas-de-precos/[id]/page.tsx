import { notFound } from "next/navigation";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { exigirLeitura } from "../../../../../lib/portas/molde";
import { PESQUISAS_DE_PRECOS } from "../../../../../lib/portas/recursos/compras";
import { verPesquisa, opcoesDaPesquisa } from "../../../../../lib/portas/recursos/compras-dados";
import { lerPrecosDaPesquisa, ROTULO_DO_METODO, ROTULO_DO_PARAMETRO } from "../../../../../lib/portas/preco-estimado";
import { FormFixarPreco } from "./FormsDoPreco";

/**
 * O DETALHE DA PESQUISA: itens com média, mínimo e máximo DERIVADOS das cotações. V39-R3 (R3-020): cada preço com a
 * origem (de onde veio, de que dia, que documento) e o preço estimado FIXADO de cada item — método, preços usados,
 * descartes com o motivo — com o formulário para fixar.
 */
export const dynamic = "force-dynamic";

export default async function Detalhe({ params, searchParams }: { readonly params: Promise<{ readonly id: string }>; readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_LICITACOES");
  const { id } = await params;
  const consulta = lerConsulta(PESQUISAS_DE_PRECOS, await searchParams);
  const [detalhe, opcoes, precos] = await Promise.all([verPesquisa(id), opcoesDaPesquisa(), lerPrecosDaPesquisa(id)]);
  void opcoes;
  if (detalhe === null) notFound();
  const secao = (
    <section aria-label="Preço estimado de cada item" className="mt-4 grid gap-3" data-precos-estimados>
      <h2 className="text-sm font-semibold">Preço estimado de cada item</h2>
      <p className="text-xs text-[color:var(--color-ink-2)]">
        O preço estimado se fixa por um método (média, mediana ou o menor dos valores) sobre preços de origem conferível: de onde veio cada um, de
        que dia é e que documento o prova. Preço descartado vai com o motivo; com menos de {precos.minimo ?? "?"} preços, só com a justificativa do gestor, que a autoridade
        competente aprova nos autos do processo (essa aprovação não é registrada aqui).
      </p>
      {precos.itens.map((i) => (
        <div key={i.id} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3 text-xs" data-item-da-pesquisa={i.id}>
          <p className="font-medium">{i.material} · quantidade {i.quantidade}</p>
          <ul className="mt-1 grid gap-0.5">
            {i.precos.map((p) => (
              <li key={p.id} data-preco={p.id}>
                {p.fornecedor}: R$ {p.valor} — {p.parametro === null ? "sem origem informada" : `${ROTULO_DO_PARAMETRO[p.parametro] ?? p.parametro}, ${p.dataDoPreco ?? "sem data"}, ${p.documento ?? "sem documento"}`}
              </li>
            ))}
          </ul>
          <p className="mt-1" data-preco-fixado={i.fixado?.valor ?? ""}>
            {i.fixado === null
              ? "Preço estimado ainda não fixado."
              : `Preço estimado fixado: R$ ${i.fixado.valor}, pela ${ROTULO_DO_METODO[i.fixado.metodo] ?? i.fixado.metodo} de ${String(i.fixado.precosUsados)} preço(s)${i.fixado.descartes > 0 ? `, ${String(i.fixado.descartes)} descartado(s)` : ""}; por ${i.fixado.por} em ${i.fixado.em}.${i.fixado.justificativa === null ? "" : ` Justificativa: ${i.fixado.justificativa}`}`}
          </p>
          {precos.podeFixar && i.precos.length > 0 ? <FormFixarPreco itemId={i.id} precos={i.precos} rotulos={ROTULO_DO_PARAMETRO} minimo={precos.minimo} /> : null}
        </div>
      ))}
    </section>
  );
  return (
    <DetalheDeRecurso
      definicao={PESQUISAS_DE_PRECOS}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      acoes={secao}
    />
  );
}
