import { notFound } from "next/navigation";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { CARGOS } from "../../../../../lib/portas/recursos/pessoal";
import { verCargo, opcoesDoCargo } from "../../../../../lib/portas/recursos/pessoal-dados";
import { cargosAction } from "../actions";

/**
 * O DETALHE DO CARGO: vagas fixadas e ocupadas (derivadas), lei de criação/extinção e os eventos que passaram por ele.
 * ⚠️ A ABA VEM DA URL (`?aba=historico`). Ato do ENTE: a leitura é a do pessoal.
 */
export const dynamic = "force-dynamic";

export default async function Detalhe({ params, searchParams }: { readonly params: Promise<{ readonly id: string }>; readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_PESSOAL");
  const { id } = await params;
  const consulta = lerConsulta(CARGOS, await searchParams);
  const [detalhe, opcoes, permitidas] = await Promise.all([verCargo(id), opcoesDoCargo(), acoesPermitidas(CARGOS.acoes.map((a) => a.acaoDoCenso))]);
  if (detalhe === null) notFound();
  return (
    <DetalheDeRecurso
      definicao={CARGOS}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      acoes={<FormsDoRecurso definicao={CARGOS} permitidas={[...permitidas]} opcoes={opcoes} registroId={id} action={cargosAction} modo="acoes" />}
    />
  );
}
