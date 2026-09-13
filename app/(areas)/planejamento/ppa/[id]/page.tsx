import { notFound } from "next/navigation";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { PLANOS_PLURIANUAIS } from "../../../../../lib/portas/recursos/plurianual";
import { verPlano, opcoesDoPlano } from "../../../../../lib/portas/recursos/plurianual-dados";
import { planosplurianuaisAction } from "../actions";

/**
 * O DETALHE DO PPA: dados, o histórico (programas, previsões e série histórica) e as ações que alimentam o plano.
 * ⚠️ A ABA VEM DA URL (`?aba=historico`). Ato do ENTE: a leitura é a do Planejamento.
 */
export const dynamic = "force-dynamic";

export default async function Detalhe({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly id: string }>;
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_PLANEJAMENTO");
  const { id } = await params;
  const consulta = lerConsulta(PLANOS_PLURIANUAIS, await searchParams);
  const [detalhe, opcoes, permitidas] = await Promise.all([
    verPlano(id),
    opcoesDoPlano(),
    acoesPermitidas(PLANOS_PLURIANUAIS.acoes.map((a) => a.acaoDoCenso)),
  ]);
  if (detalhe === null) notFound();
  return (
    <DetalheDeRecurso
      definicao={PLANOS_PLURIANUAIS}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      acoes={
        <FormsDoRecurso
          definicao={PLANOS_PLURIANUAIS}
          permitidas={[...permitidas]}
          opcoes={opcoes}
          registroId={id}
          action={planosplurianuaisAction}
          modo="acoes"
        />
      }
    />
  );
}
