import { notFound } from "next/navigation";
import { FormsDoRecurso } from "../../../../../../components/molde/FormsDoRecurso";
import { DetalheDeRecurso } from "../../../../../../components/molde/DetalheDeRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../../lib/molde/tipos";
import { acoesPermitidas, exigirLeitura } from "../../../../../../lib/portas/molde";
import { PROGRAMAS_DO_PPA } from "../../../../../../lib/portas/recursos/plurianual";
import { verProgramaDoPpa, opcoesDoProgramaDoPpa } from "../../../../../../lib/portas/recursos/plurianual-dados";
import { programasdoppaAction } from "../actions";

/**
 * O DETALHE DO PROGRAMA NO PLANO: estratégia, valor previsto, indicadores e ações (produto, meta física, meta financeira).
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
  const consulta = lerConsulta(PROGRAMAS_DO_PPA, await searchParams);
  const [detalhe, opcoes, permitidas] = await Promise.all([
    verProgramaDoPpa(id),
    opcoesDoProgramaDoPpa(),
    acoesPermitidas(PROGRAMAS_DO_PPA.acoes.map((a) => a.acaoDoCenso)),
  ]);
  if (detalhe === null) notFound();
  return (
    <DetalheDeRecurso
      definicao={PROGRAMAS_DO_PPA}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      acoes={
        <FormsDoRecurso
          definicao={PROGRAMAS_DO_PPA}
          permitidas={[...permitidas]}
          opcoes={opcoes}
          registroId={id}
          action={programasdoppaAction}
          modo="acoes"
        />
      }
    />
  );
}
