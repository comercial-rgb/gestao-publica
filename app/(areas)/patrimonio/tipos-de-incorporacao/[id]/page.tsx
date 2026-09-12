import { notFound } from "next/navigation";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { TIPOS_DE_INCORPORACAO } from "../../../../../lib/portas/recursos/gestao-do-bem";
import {
  opcoesDaGestaoDoBem,
  verTipoDeIncorporacao,
} from "../../../../../lib/portas/recursos/gestao-do-bem-dados";
import { acaoDeTiposDeIncorporacaoAction } from "../actions";

/**
 * O detalhe. O "histórico" deste cadastro são os BENS que entraram por este tipo — é a
 * pergunta que alguém faz ao abri-lo: o que veio por doação, o que veio por compra.
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
  const consulta = lerConsulta(TIPOS_DE_INCORPORACAO, await searchParams);

  const [detalhe, opcoes, permitidas] = await Promise.all([
    verTipoDeIncorporacao(id),
    opcoesDaGestaoDoBem(),
    acoesPermitidas(TIPOS_DE_INCORPORACAO.acoes.map((a) => a.acaoDoCenso)),
  ]);
  if (detalhe === null) notFound();

  return (
    <DetalheDeRecurso
      definicao={TIPOS_DE_INCORPORACAO}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      acoes={
        <FormsDoRecurso
          definicao={TIPOS_DE_INCORPORACAO}
          permitidas={[...permitidas]}
          opcoes={opcoes}
          registroId={id}
          action={acaoDeTiposDeIncorporacaoAction}
          modo="acoes"
        />
      }
    />
  );
}
