import { notFound } from "next/navigation";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { ROTEIROS_DE_RESULTADO } from "../../../../../lib/portas/recursos/roteiros";
import {
  opcoesDosRoteiros,
  verRoteiroDeResultado,
} from "../../../../../lib/portas/recursos/roteiros-dados";
import { acaoDeRoteirosDeResultadoAction } from "../actions";

/** O detalhe do roteiro de ganho ou de perda. O `id` da rota é a própria chave. */
export const dynamic = "force-dynamic";

export default async function Detalhe({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly id: string }>;
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura();
  const { id } = await params;
  const consulta = lerConsulta(ROTEIROS_DE_RESULTADO, await searchParams);

  const [detalhe, opcoes, permitidas] = await Promise.all([
    verRoteiroDeResultado(id),
    opcoesDosRoteiros(),
    acoesPermitidas(ROTEIROS_DE_RESULTADO.acoes.map((a) => a.acaoDoCenso)),
  ]);
  if (detalhe === null) notFound();

  return (
    <DetalheDeRecurso
      definicao={ROTEIROS_DE_RESULTADO}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      acoes={
        <FormsDoRecurso
          definicao={ROTEIROS_DE_RESULTADO}
          permitidas={[...permitidas]}
          opcoes={opcoes}
          registroId={id}
          action={acaoDeRoteirosDeResultadoAction}
          modo="acoes"
        />
      }
    />
  );
}
