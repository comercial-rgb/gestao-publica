import { notFound } from "next/navigation";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { LEIS_DE_DIRETRIZES } from "../../../../../lib/portas/recursos/plurianual";
import { verLdo, opcoesDaLdo } from "../../../../../lib/portas/recursos/plurianual-dados";
import { leisdediretrizesAction } from "../actions";

/**
 * O DETALHE DA LDO: o trâmite, o histórico de tudo que a compõe, as ações e os oito anexos em PDF (relacionados). As alienações oferecidas à aplicação são SÓ as desta LDO.
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
  const consulta = lerConsulta(LEIS_DE_DIRETRIZES, await searchParams);
  const [detalhe, opcoes, permitidas] = await Promise.all([
    verLdo(id),
    opcoesDaLdo(id),
    acoesPermitidas(LEIS_DE_DIRETRIZES.acoes.map((a) => a.acaoDoCenso)),
  ]);
  if (detalhe === null) notFound();
  return (
    <DetalheDeRecurso
      definicao={LEIS_DE_DIRETRIZES}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      acoes={
        <FormsDoRecurso
          definicao={LEIS_DE_DIRETRIZES}
          permitidas={[...permitidas]}
          opcoes={opcoes}
          registroId={id}
          action={leisdediretrizesAction}
          modo="acoes"
        />
      }
    />
  );
}
