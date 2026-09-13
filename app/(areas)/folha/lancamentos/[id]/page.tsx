import { notFound } from "next/navigation";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { exigirLeitura } from "../../../../../lib/portas/molde";
import { LANCAMENTOS_DA_FOLHA } from "../../../../../lib/portas/recursos/folha";
import { verLancamento } from "../../../../../lib/portas/recursos/folha-dados";

/**
 * O DETALHE DO LANÇAMENTO: matrícula, rubrica, vigência, valor e o ato legal. Sem ações — encerrar um fixo é outro lançamento.
 * ⚠️ A ABA VEM DA URL (`?aba=historico`). Ato do ENTE: a leitura é a da folha.
 */
export const dynamic = "force-dynamic";

export default async function Detalhe({ params, searchParams }: { readonly params: Promise<{ readonly id: string }>; readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_FOLHA");
  const { id } = await params;
  const consulta = lerConsulta(LANCAMENTOS_DA_FOLHA, await searchParams);
  const detalhe = await verLancamento(id);
  if (detalhe === null) notFound();
  return (
    <DetalheDeRecurso
      definicao={LANCAMENTOS_DA_FOLHA}
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
