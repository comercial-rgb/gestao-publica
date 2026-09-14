import { notFound } from "next/navigation";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { REPRESENTACOES } from "../../../../../lib/portas/recursos/representacoes";
import { disponibilidadeDaRepresentacao, verRepresentacao } from "../../../../../lib/portas/recursos/representacoes-dados";
import { representacoesAction } from "../actions";

/** O DETALHE DA REPRESENTAÇÃO: fundamento, vigência derivada, solicitações feitas sob ela e a revogação. */
export const dynamic = "force-dynamic";

export default async function Detalhe({ params, searchParams }: { readonly params: Promise<{ readonly id: string }>; readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_CADASTROS");
  const { id } = await params;
  const consulta = lerConsulta(REPRESENTACOES, await searchParams);
  const [detalhe, permitidas] = await Promise.all([verRepresentacao(id), acoesPermitidas(["REGISTRAR_REPRESENTACAO"])]);
  if (detalhe === null) notFound();
  const disponibilidade = await disponibilidadeDaRepresentacao(id).catch(() => null);
  return (
    <DetalheDeRecurso
      definicao={REPRESENTACOES}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      acoes={<FormsDoRecurso definicao={REPRESENTACOES} permitidas={[...permitidas]} opcoes={{}} registroId={id} action={representacoesAction} modo="acoes" disponibilidade={disponibilidade} />}
    />
  );
}
