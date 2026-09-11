import { notFound } from "next/navigation";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { DIVIDA_FUNDADA } from "../../../../../lib/portas/recursos/definicoes";
import { opcoesDoCadastro, verDividaFundada } from "../../../../../lib/portas/recursos/dados";
import { acaoDeDividaFundadaAction } from "../actions";

/**
 * O DETALHE DE UM REGISTRO DE DÍVIDA FUNDADA — as cinco abas fixas do molde.
 *
 * ⚠️ A ABA VEM DA URL (`?aba=historico`), e cada aba é lida no servidor SÓ QUANDO PEDIDA.
 */
export const dynamic = "force-dynamic";

export default async function DividaFundadaDetalhePage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly id: string }>;
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura();
  const { id } = await params;
  const consulta = lerConsulta(DIVIDA_FUNDADA, await searchParams);

  const [detalhe, opcoes, permitidas] = await Promise.all([
    verDividaFundada(id),
    opcoesDoCadastro({ classesDeConta: DIVIDA_FUNDADA.classesDeConta ?? [] }),
    acoesPermitidas(DIVIDA_FUNDADA.acoes.map((a) => a.acaoDoCenso)),
  ]);
  if (detalhe === null) notFound();

  return (
    <DetalheDeRecurso
      definicao={DIVIDA_FUNDADA}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      acoes={
        <FormsDoRecurso
          definicao={DIVIDA_FUNDADA}
          permitidas={[...permitidas]}
          opcoes={opcoes}
          registroId={id}
          action={acaoDeDividaFundadaAction}
          modo="acoes"
        />
      }
    />
  );
}
