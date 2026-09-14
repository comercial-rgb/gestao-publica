import { notFound } from "next/navigation";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { DESIGNACOES_DA_FOLHA } from "../../../../../lib/portas/recursos/folha";
import { verDesignacao } from "../../../../../lib/portas/recursos/folha-dados";
import { designacoesAction } from "../actions";

/**
 * O DETALHE DA DESIGNAÇÃO: quem, por qual ato, de quando até quando — e se vigora HOJE (derivado).
 * A única ação é REVOGAR, e ela é um fato com data de efeito: a designação nunca é apagada nem
 * editada, porque o atesto praticado sob ela continua tendo de ter lastro.
 * ⚠️ A ABA VEM DA URL (`?aba=historico`). Ato do ENTE: a leitura é a da folha.
 */
export const dynamic = "force-dynamic";

export default async function Detalhe({ params, searchParams }: { readonly params: Promise<{ readonly id: string }>; readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_FOLHA");
  const { id } = await params;
  const consulta = lerConsulta(DESIGNACOES_DA_FOLHA, await searchParams);
  const [detalhe, permitidas] = await Promise.all([verDesignacao(id), acoesPermitidas(DESIGNACOES_DA_FOLHA.acoes.map((a) => a.acaoDoCenso))]);
  if (detalhe === null) notFound();
  return (
    <DetalheDeRecurso
      definicao={DESIGNACOES_DA_FOLHA}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      acoes={<FormsDoRecurso definicao={DESIGNACOES_DA_FOLHA} permitidas={[...permitidas]} opcoes={{}} registroId={id} action={designacoesAction} modo="acoes" />}
    />
  );
}
