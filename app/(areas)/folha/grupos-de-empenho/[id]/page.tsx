import { notFound } from "next/navigation";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { GRUPOS_DE_EMPENHO_DA_FOLHA } from "../../../../../lib/portas/recursos/folha";
import { opcoesDoGrupoDeEmpenho, verGrupoDeEmpenho } from "../../../../../lib/portas/recursos/folha-dados";
import { grupoDeEmpenhoAction } from "../actions";

/**
 * O DETALHE DO GRUPO DE EMPENHO: a ficha com o saldo de hoje, a série do número, o credor e as
 * rubricas que ele empenha.
 *
 * ⚠️ UMA ÚNICA AÇÃO: definir as duas contas da LIQUIDAÇÃO. Ficha, série, credor e "por servidor"
 * continuam imutáveis — trocá-los depois de o grupo ter gerado empenhos mudaria a leitura do que
 * já aconteceu (a ficha moveria a despesa de dotação). As contas são exceção nomeada porque as
 * colunas nasceram nullable, e sem este caminho um grupo antigo nunca liquidaria.
 * ⚠️ A ABA VEM DA URL. Ato do ENTE: a leitura é a da folha.
 */
export const dynamic = "force-dynamic";

export default async function Detalhe({ params, searchParams }: { readonly params: Promise<{ readonly id: string }>; readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_FOLHA");
  const { id } = await params;
  const consulta = lerConsulta(GRUPOS_DE_EMPENHO_DA_FOLHA, await searchParams);
  const [detalhe, opcoes, permitidas] = await Promise.all([
    verGrupoDeEmpenho(id),
    opcoesDoGrupoDeEmpenho(),
    acoesPermitidas(GRUPOS_DE_EMPENHO_DA_FOLHA.acoes.map((a) => a.acaoDoCenso)),
  ]);
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
      acoes={<FormsDoRecurso definicao={GRUPOS_DE_EMPENHO_DA_FOLHA} permitidas={[...permitidas]} opcoes={opcoes} registroId={id} action={grupoDeEmpenhoAction} modo="acoes" />}
    />
  );
}
