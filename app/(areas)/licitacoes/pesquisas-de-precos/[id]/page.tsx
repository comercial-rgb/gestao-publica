import { notFound } from "next/navigation";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { exigirLeitura } from "../../../../../lib/portas/molde";
import { PESQUISAS_DE_PRECOS } from "../../../../../lib/portas/recursos/compras";
import { verPesquisa, opcoesDaPesquisa } from "../../../../../lib/portas/recursos/compras-dados";

/**
 * O DETALHE DA PESQUISA: itens com média, mínimo e máximo DERIVADOS das cotações. Sem ações — a pesquisa é registrada inteira.
 */
export const dynamic = "force-dynamic";

export default async function Detalhe({ params, searchParams }: { readonly params: Promise<{ readonly id: string }>; readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_LICITACOES");
  const { id } = await params;
  const consulta = lerConsulta(PESQUISAS_DE_PRECOS, await searchParams);
  const [detalhe, opcoes] = await Promise.all([verPesquisa(id), opcoesDaPesquisa()]);
  void opcoes;
  if (detalhe === null) notFound();
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
      acoes={null}
    />
  );
}
