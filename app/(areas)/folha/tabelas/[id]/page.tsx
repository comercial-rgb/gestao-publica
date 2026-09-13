import { notFound } from "next/navigation";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { exigirLeitura } from "../../../../../lib/portas/molde";
import { TABELAS_DA_FOLHA } from "../../../../../lib/portas/recursos/folha";
import { verTabela } from "../../../../../lib/portas/recursos/folha-dados";

/**
 * O DETALHE DA TABELA DO ENTE: vigência, parâmetros, faixas uma a uma e a fundamentação legal.
 * Sem ações — uma tabela publicada não se altera; o que muda é a NOVA tabela, com início posterior.
 * ⚠️ A ABA VEM DA URL. Ato do ENTE: a leitura é a da folha.
 */
export const dynamic = "force-dynamic";

export default async function Detalhe({ params, searchParams }: { readonly params: Promise<{ readonly id: string }>; readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_FOLHA");
  const { id } = await params;
  const consulta = lerConsulta(TABELAS_DA_FOLHA, await searchParams);
  const detalhe = await verTabela(id);
  if (detalhe === null) notFound();
  return (
    <DetalheDeRecurso
      definicao={TABELAS_DA_FOLHA}
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
