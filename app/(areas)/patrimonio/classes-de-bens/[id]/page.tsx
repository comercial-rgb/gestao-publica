import { notFound } from "next/navigation";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { CLASSES_DE_BENS } from "../../../../../lib/portas/recursos/acervo";
import { opcoesDoAcervo, verClasseDeBens } from "../../../../../lib/portas/recursos/acervo-dados";
import { acaoDeClassesDeBensAction } from "../actions";

/**
 * O detalhe da classe.
 *
 * ⚠️ A ABA DE HISTÓRICO AQUI LISTA OS BENS DA CLASSE, e as duas datas aparecem separadas: a
 * AQUISIÇÃO do bem é o fato, e o cadastro é quando alguém o registrou. Um bem adquirido em
 * março e cadastrado em maio pareceria de maio se só uma delas fosse mostrada.
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
  const consulta = lerConsulta(CLASSES_DE_BENS, await searchParams);

  const [detalhe, opcoes, permitidas] = await Promise.all([
    verClasseDeBens(id),
    opcoesDoAcervo(),
    acoesPermitidas(CLASSES_DE_BENS.acoes.map((a) => a.acaoDoCenso)),
  ]);
  if (detalhe === null) notFound();

  return (
    <DetalheDeRecurso
      definicao={CLASSES_DE_BENS}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      acoes={
        <FormsDoRecurso
          definicao={CLASSES_DE_BENS}
          permitidas={[...permitidas]}
          opcoes={opcoes}
          registroId={id}
          action={acaoDeClassesDeBensAction}
          modo="acoes"
        />
      }
    />
  );
}
