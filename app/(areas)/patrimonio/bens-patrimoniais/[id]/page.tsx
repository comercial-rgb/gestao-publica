import { notFound } from "next/navigation";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { BENS_PATRIMONIAIS } from "../../../../../lib/portas/recursos/acervo";
import { opcoesDoAcervo, verBemPatrimonial } from "../../../../../lib/portas/recursos/acervo-dados";
import { acaoDeBensPatrimoniaisAction } from "../actions";

/**
 * O detalhe do bem.
 *
 * ⚠️ A ABA DE HISTÓRICO É O EIXO DE GESTÃO — onde o bem esteve, quem respondeu por ele, em
 * que estado e em que situação —, e NÃO o eixo financeiro. Os dois são separados de propósito:
 * mover um bem de sala não toca o razão, e misturá-los na mesma lista faria uma transferência
 * de prateleira parecer um fato contábil. A contagem dos movimentos de valor aparece nos dados.
 */
export const dynamic = "force-dynamic";

export default async function Detalhe({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly id: string }>;
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura();
  const { id } = await params;
  const consulta = lerConsulta(BENS_PATRIMONIAIS, await searchParams);

  const [detalhe, opcoes, permitidas] = await Promise.all([
    verBemPatrimonial(id),
    opcoesDoAcervo(),
    acoesPermitidas(BENS_PATRIMONIAIS.acoes.map((a) => a.acaoDoCenso)),
  ]);
  if (detalhe === null) notFound();

  return (
    <DetalheDeRecurso
      definicao={BENS_PATRIMONIAIS}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      acoes={
        <FormsDoRecurso
          definicao={BENS_PATRIMONIAIS}
          permitidas={[...permitidas]}
          opcoes={opcoes}
          registroId={id}
          action={acaoDeBensPatrimoniaisAction}
          modo="acoes"
        />
      }
    />
  );
}
