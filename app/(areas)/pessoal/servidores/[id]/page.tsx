import { notFound } from "next/navigation";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { SERVIDORES } from "../../../../../lib/portas/recursos/pessoal";
import { verServidor, opcoesDoServidor } from "../../../../../lib/portas/recursos/pessoal-dados";
import { servidoresAction } from "../actions";

/**
 * O DETALHE DO SERVIDOR: dados civis, vínculos com cargo/lotação/salário/situação DERIVADOS até hoje, e as ações (admitir, movimentar, remuneração, desligar, dependente, portaria, anotação, treinamento). As matrículas oferecidas são SÓ as deste servidor, vivas.
 * ⚠️ A ABA VEM DA URL (`?aba=historico`). Ato do ENTE: a leitura é a do pessoal.
 */
export const dynamic = "force-dynamic";

export default async function Detalhe({ params, searchParams }: { readonly params: Promise<{ readonly id: string }>; readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_PESSOAL");
  const { id } = await params;
  const consulta = lerConsulta(SERVIDORES, await searchParams);
  const [detalhe, opcoes, permitidas] = await Promise.all([verServidor(id), opcoesDoServidor(id), acoesPermitidas(SERVIDORES.acoes.map((a) => a.acaoDoCenso))]);
  if (detalhe === null) notFound();
  return (
    <DetalheDeRecurso
      definicao={SERVIDORES}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      acoes={<FormsDoRecurso definicao={SERVIDORES} permitidas={[...permitidas]} opcoes={opcoes} registroId={id} action={servidoresAction} modo="acoes" />}
    />
  );
}
