import { notFound } from "next/navigation";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { PARAMETROS_DE_ATUALIZACAO } from "../../../../../lib/portas/recursos/parametros";
import { opcoesDosParametros, verParametro } from "../../../../../lib/portas/recursos/parametros-dados";
import { acaoDeParametrosAction } from "../actions";

/**
 * O detalhe do parâmetro de uma classe. O `id` da rota é o id da CLASSE — ela existe antes do
 * parâmetro, e é a classe sem parâmetro que mais precisa de tela. Classe desconhecida é
 * `notFound`.
 */
export const dynamic = "force-dynamic";

export default async function Detalhe({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly id: string }>;
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_PATRIMONIO");
  const { id } = await params;
  const consulta = lerConsulta(PARAMETROS_DE_ATUALIZACAO, await searchParams);
  const [detalhe, opcoes, permitidas] = await Promise.all([
    verParametro(id),
    opcoesDosParametros(),
    acoesPermitidas(PARAMETROS_DE_ATUALIZACAO.acoes.map((a) => a.acaoDoCenso)),
  ]);
  if (detalhe === null) notFound();
  return (
    <DetalheDeRecurso
      definicao={PARAMETROS_DE_ATUALIZACAO}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      acoes={
        <FormsDoRecurso
          definicao={PARAMETROS_DE_ATUALIZACAO}
          permitidas={[...permitidas]}
          opcoes={opcoes}
          registroId={id}
          action={acaoDeParametrosAction}
          modo="acoes"
        />
      }
    />
  );
}
