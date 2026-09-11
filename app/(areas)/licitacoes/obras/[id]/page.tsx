import { notFound } from "next/navigation";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { OBRAS } from "../../../../../lib/portas/recursos/definicoes";
import { opcoesDoCadastro, verObra } from "../../../../../lib/portas/recursos/dados";
import { acaoDeObraAction } from "../actions";

/**
 * O DETALHE DE UM REGISTRO DE OBRAS — as cinco abas fixas do molde.
 *
 * ⚠️ A ABA VEM DA URL (`?aba=historico`), e cada aba é lida no servidor SÓ QUANDO PEDIDA.
 */
export const dynamic = "force-dynamic";

export default async function ObrasDetalhePage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly id: string }>;
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura();
  const { id } = await params;
  const consulta = lerConsulta(OBRAS, await searchParams);

  const [detalhe, opcoes, permitidas] = await Promise.all([
    verObra(id),
    opcoesDoCadastro({ obraId: id, classesDeConta: OBRAS.classesDeConta ?? [] }),
    acoesPermitidas(OBRAS.acoes.map((a) => a.acaoDoCenso)),
  ]);
  if (detalhe === null) notFound();

  return (
    <DetalheDeRecurso
      definicao={OBRAS}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      acoes={
        <FormsDoRecurso
          definicao={OBRAS}
          permitidas={[...permitidas]}
          opcoes={opcoes}
          registroId={id}
          action={acaoDeObraAction}
          modo="acoes"
        />
      }
    />
  );
}
