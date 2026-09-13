import { notFound } from "next/navigation";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { exigirLeitura } from "../../../../../lib/portas/molde";
import { RUBRICAS } from "../../../../../lib/portas/recursos/folha";
import { verRubrica } from "../../../../../lib/portas/recursos/folha-dados";

/**
 * O DETALHE DA RUBRICA: natureza, incidências, proporcionalidade e a fundamentação legal. Sem ações — a rubrica não se altera depois de usada num cálculo.
 * ⚠️ A ABA VEM DA URL (`?aba=historico`). Ato do ENTE: a leitura é a da folha.
 */
export const dynamic = "force-dynamic";

export default async function Detalhe({ params, searchParams }: { readonly params: Promise<{ readonly id: string }>; readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_FOLHA");
  const { id } = await params;
  const consulta = lerConsulta(RUBRICAS, await searchParams);
  const detalhe = await verRubrica(id);
  if (detalhe === null) notFound();
  return (
    <DetalheDeRecurso
      definicao={RUBRICAS}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
    />
  );
}
