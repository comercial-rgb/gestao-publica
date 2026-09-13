import { notFound } from "next/navigation";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { LOTACOES } from "../../../../../lib/portas/recursos/pessoal";
import { verLotacao, opcoesDaLotacao } from "../../../../../lib/portas/recursos/pessoal-dados";
import { lotacoesAction } from "../actions";

/**
 * O DETALHE DA LOTAÇÃO: superior, subordinadas, unidade orçamentária e os lotados hoje (derivados).
 * ⚠️ A ABA VEM DA URL (`?aba=historico`). Ato do ENTE: a leitura é a do pessoal.
 */
export const dynamic = "force-dynamic";

export default async function Detalhe({ params, searchParams }: { readonly params: Promise<{ readonly id: string }>; readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_PESSOAL");
  const { id } = await params;
  const consulta = lerConsulta(LOTACOES, await searchParams);
  const [detalhe, opcoes, permitidas] = await Promise.all([verLotacao(id), opcoesDaLotacao(), acoesPermitidas(LOTACOES.acoes.map((a) => a.acaoDoCenso))]);
  if (detalhe === null) notFound();
  return (
    <DetalheDeRecurso
      definicao={LOTACOES}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      acoes={<FormsDoRecurso definicao={LOTACOES} permitidas={[...permitidas]} opcoes={opcoes} registroId={id} action={lotacoesAction} modo="acoes" />}
    />
  );
}
