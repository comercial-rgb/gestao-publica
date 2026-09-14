import { notFound } from "next/navigation";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { exigirLeitura } from "../../../../../lib/portas/molde";
import { FICHAS } from "../../../../../lib/portas/recursos/fichas";
import { verFicha } from "../../../../../lib/portas/recursos/fichas-dados";

/**
 * O DETALHE DA FICHA: a chave completa, a dotação inicial, os saldos (cache) e o HISTÓRICO dos
 * movimentos de dotação — cada um com a competência e o instante do registro.
 */
export const dynamic = "force-dynamic";

export default async function Detalhe({ params, searchParams }: { readonly params: Promise<{ readonly id: string }>; readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_PLANEJAMENTO");
  const { id } = await params;
  const consulta = lerConsulta(FICHAS, await searchParams);
  const detalhe = await verFicha(id);
  if (detalhe === null) notFound();
  return (
    <DetalheDeRecurso
      definicao={FICHAS}
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
