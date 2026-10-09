import { notFound } from "next/navigation";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { SETORES } from "../../../../../lib/portas/recursos/setores";
import { verSetor } from "../../../../../lib/portas/recursos/setores-dados";
import { acaoDeSetoresAction } from "../actions";

/** V37 — o detalhe do setor (M21): a situação, o uso, e desativar ou reativar. */
export const dynamic = "force-dynamic";

export default async function Detalhe({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly id: string }>;
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_PROTOCOLO");
  const { id } = await params;
  const consulta = lerConsulta(SETORES, await searchParams);
  const [detalhe, permitidas] = await Promise.all([verSetor(id), acoesPermitidas(SETORES.acoes.map((a) => a.acaoDoCenso))]);
  if (detalhe === null) notFound();
  return (
    <DetalheDeRecurso
      definicao={SETORES}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      acoes={<FormsDoRecurso definicao={SETORES} permitidas={[...permitidas]} opcoes={{}} registroId={id} action={acaoDeSetoresAction} modo="acoes" />}
    />
  );
}
