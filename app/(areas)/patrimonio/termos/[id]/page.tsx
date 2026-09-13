import { notFound } from "next/navigation";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { exigirLeitura } from "../../../../../lib/portas/molde";
import { TERMOS_PATRIMONIAIS } from "../../../../../lib/portas/recursos/termos";
import { verTermo } from "../../../../../lib/portas/recursos/termos-dados";

/**
 * O detalhe do termo: dados, os bens (na aba de histórico, cada um com link) e o PDF em
 * "relacionados". Sem ações — o termo é imutável; corrigir é emitir outro.
 */
export const dynamic = "force-dynamic";

export default async function Detalhe({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly id: string }>;
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_PATRIMONIO");
  const { id } = await params;
  const consulta = lerConsulta(TERMOS_PATRIMONIAIS, await searchParams);
  const detalhe = await verTermo(id);
  if (detalhe === null) notFound();
  return (
    <DetalheDeRecurso
      definicao={TERMOS_PATRIMONIAIS}
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
