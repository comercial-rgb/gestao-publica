import { notFound } from "next/navigation";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { DIVIDA_ATIVA } from "../../../../../lib/portas/recursos/definicoes";
import { opcoesDoCadastro, verDividaAtiva } from "../../../../../lib/portas/recursos/dados";
import { acaoDeDividaAtivaAction } from "../actions";

/**
 * O DETALHE DE UM REGISTRO DE DÍVIDA ATIVA — as cinco abas fixas do molde.
 *
 * ⚠️ A ABA VEM DA URL (`?aba=historico`), e cada aba é lida no servidor SÓ QUANDO PEDIDA.
 */
export const dynamic = "force-dynamic";

export default async function DividaAtivaDetalhePage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly id: string }>;
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura();
  const { id } = await params;
  const consulta = lerConsulta(DIVIDA_ATIVA, await searchParams);

  const [detalhe, opcoes, permitidas] = await Promise.all([
    verDividaAtiva(id),
    opcoesDoCadastro(),
    acoesPermitidas(DIVIDA_ATIVA.acoes.map((a) => a.acaoDoCenso)),
  ]);
  if (detalhe === null) notFound();

  return (
    <DetalheDeRecurso
      definicao={DIVIDA_ATIVA}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      acoes={
        <FormsDoRecurso
          definicao={DIVIDA_ATIVA}
          permitidas={[...permitidas]}
          opcoes={opcoes}
          registroId={id}
          action={acaoDeDividaAtivaAction}
          modo="acoes"
        />
      }
    />
  );
}
