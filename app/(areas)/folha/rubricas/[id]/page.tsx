import { notFound } from "next/navigation";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { exigirLeitura } from "../../../../../lib/portas/molde";
import { RUBRICAS } from "../../../../../lib/portas/recursos/folha";
import { verRubrica } from "../../../../../lib/portas/recursos/folha-dados";
import { painelDeVersoes } from "../../../../../lib/portas/versoes-da-rubrica";
import { VersoesDaRubrica } from "./VersoesDaRubrica";

/**
 * O DETALHE DA RUBRICA: natureza, incidências, proporcionalidade e a fundamentação legal.
 *
 * ⚠️ V11 V1.1 — AS VERSÕES ENTRAM FORA DO MOLDE, como a política de divulgação do M10. O molde
 * monta formulário a partir do descritor do recurso, e escrever uma versão não é "editar um campo
 * do cadastro": é um ato com vigência, fundamento, grafo de dependências e um aprovador que não
 * pode ser o autor. Espremer isso num campo faria a regra passar sem revisão.
 * ⚠️ A ABA VEM DA URL (`?aba=historico`). Ato do ENTE: a leitura é a da folha.
 */
export const dynamic = "force-dynamic";

export default async function Detalhe({ params, searchParams }: { readonly params: Promise<{ readonly id: string }>; readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_FOLHA");
  const { id } = await params;
  const consulta = lerConsulta(RUBRICAS, await searchParams);
  const [detalhe, painel] = await Promise.all([verRubrica(id), painelDeVersoes(id)]);
  if (detalhe === null) notFound();
  return (
    <DetalheDeRecurso
      definicao={RUBRICAS}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      acoes={painel === null ? null : <VersoesDaRubrica p={painel} />}
    />
  );
}
