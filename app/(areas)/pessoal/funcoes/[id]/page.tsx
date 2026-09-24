import { notFound } from "next/navigation";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { FUNCOES } from "../../../../../lib/portas/recursos/pessoal";
import { verFuncao, opcoesDaFuncao } from "../../../../../lib/portas/recursos/pessoal-dados";
import { funcoesAction } from "../actions";

/**
 * O DETALHE DA FUNÇÃO: quem a exerce hoje (derivado), o ato de criação e as designações que
 * passaram por ela.
 * ⚠️ A ABA VEM DA URL (`?aba=historico`). Ato do ENTE: a leitura é a do pessoal.
 */
export const dynamic = "force-dynamic";

export default async function Detalhe({ params, searchParams }: { readonly params: Promise<{ readonly id: string }>; readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_PESSOAL");
  const { id } = await params;
  const consulta = lerConsulta(FUNCOES, await searchParams);
  const [detalhe, opcoes, permitidas] = await Promise.all([verFuncao(id), opcoesDaFuncao(), acoesPermitidas(FUNCOES.acoes.map((a) => a.acaoDoCenso))]);
  if (detalhe === null) notFound();
  return (
    <DetalheDeRecurso
      definicao={FUNCOES}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      acoes={<FormsDoRecurso definicao={FUNCOES} permitidas={[...permitidas]} opcoes={opcoes} registroId={id} action={funcoesAction} modo="acoes" />}
    />
  );
}
