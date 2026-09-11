import { notFound } from "next/navigation";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { anoCivil } from "../../../../../packages/datas/index";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { CONSORCIOS } from "../../../../../lib/portas/recursos/definicoes";
import { opcoesDoCadastro, verConsorcio } from "../../../../../lib/portas/recursos/dados";
import { acaoDeConsorcioAction } from "../actions";

/**
 * O DETALHE DE UM REGISTRO DE CONSORCIOS — as cinco abas fixas do molde.
 *
 * ⚠️ A ABA VEM DA URL (`?aba=historico`), e cada aba é lida no servidor SÓ QUANDO PEDIDA.
 * Com estado de componente, as cinco leituras aconteceriam a cada abertura.
 */
export const dynamic = "force-dynamic";

export default async function ConsorciosDetalhePage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly id: string }>;
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura();
  const { id } = await params;
  const consulta = lerConsulta(CONSORCIOS, await searchParams);

  const [detalhe, opcoes, permitidas] = await Promise.all([
    // ⚠️ O CONSÓRCIO PRECISA DO EXERCÍCIO — os saldos são POR EXERCÍCIO, e o rateio é anual.
    // É a única coisa que este detalhe pede além do id, e ela vem do filtro, com o ano CIVIL
    // do ente como padrão.
    verConsorcio(id, Number(consulta.filtros["exercicio"] ?? "") || anoCivil(new Date())),
    opcoesDoCadastro({ classesDeConta: CONSORCIOS.classesDeConta ?? [] }),
    acoesPermitidas(CONSORCIOS.acoes.map((a) => a.acaoDoCenso)),
  ]);
  if (detalhe === null) notFound();

  return (
    <DetalheDeRecurso
      definicao={CONSORCIOS}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      acoes={
        <FormsDoRecurso
          definicao={CONSORCIOS}
          permitidas={[...permitidas]}
          opcoes={opcoes}
          registroId={id}
          action={acaoDeConsorcioAction}
          modo="acoes"
        />
      }
    />
  );
}
