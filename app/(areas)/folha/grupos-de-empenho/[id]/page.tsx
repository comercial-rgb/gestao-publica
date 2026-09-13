import { notFound } from "next/navigation";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { exigirLeitura } from "../../../../../lib/portas/molde";
import { GRUPOS_DE_EMPENHO_DA_FOLHA } from "../../../../../lib/portas/recursos/folha";
import { verGrupoDeEmpenho } from "../../../../../lib/portas/recursos/folha-dados";

/**
 * O DETALHE DO GRUPO DE EMPENHO: a ficha com o saldo de hoje, a série do número, o credor e as
 * rubricas que ele empenha. Sem ações — mudar o grupo depois de ele ter gerado empenhos mudaria a
 * leitura do que já aconteceu; o caminho é outro grupo.
 * ⚠️ A ABA VEM DA URL. Ato do ENTE: a leitura é a da folha.
 */
export const dynamic = "force-dynamic";

export default async function Detalhe({ params, searchParams }: { readonly params: Promise<{ readonly id: string }>; readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_FOLHA");
  const { id } = await params;
  const consulta = lerConsulta(GRUPOS_DE_EMPENHO_DA_FOLHA, await searchParams);
  const detalhe = await verGrupoDeEmpenho(id);
  if (detalhe === null) notFound();
  return (
    <DetalheDeRecurso
      definicao={GRUPOS_DE_EMPENHO_DA_FOLHA}
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
