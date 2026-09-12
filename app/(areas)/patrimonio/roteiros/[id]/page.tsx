import { notFound } from "next/navigation";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { ROTEIROS_PATRIMONIAIS } from "../../../../../lib/portas/recursos/roteiros";
import {
  opcoesDosRoteiros,
  verRoteiroPatrimonial,
} from "../../../../../lib/portas/recursos/roteiros-dados";
import { acaoDeRoteirosPatrimoniaisAction } from "../actions";

/**
 * O detalhe do roteiro de um evento.
 *
 * ⚠️ O `id` DA ROTA É O PRÓPRIO TIPO do evento, e não o id da linha do roteiro — porque o
 * evento existe ANTES de haver roteiro, e é justamente o evento sem roteiro que precisa de
 * tela. Com o id da linha, as pendências não teriam para onde apontar.
 *
 * ⚠️ TIPO DESCONHECIDO É `notFound`, e não um detalhe vazio: uma URL digitada à mão não pode
 * convidar a parametrizar um evento que o sistema não conhece.
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
  const consulta = lerConsulta(ROTEIROS_PATRIMONIAIS, await searchParams);

  const [detalhe, opcoes, permitidas] = await Promise.all([
    verRoteiroPatrimonial(id),
    opcoesDosRoteiros(),
    acoesPermitidas(ROTEIROS_PATRIMONIAIS.acoes.map((a) => a.acaoDoCenso)),
  ]);
  if (detalhe === null) notFound();

  return (
    <DetalheDeRecurso
      definicao={ROTEIROS_PATRIMONIAIS}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      acoes={
        <FormsDoRecurso
          definicao={ROTEIROS_PATRIMONIAIS}
          permitidas={[...permitidas]}
          opcoes={opcoes}
          registroId={id}
          action={acaoDeRoteirosPatrimoniaisAction}
          modo="acoes"
        />
      }
    />
  );
}
