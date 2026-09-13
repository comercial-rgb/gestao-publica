import { notFound } from "next/navigation";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { FOLHAS } from "../../../../../lib/portas/recursos/folha";
import { verFolha } from "../../../../../lib/portas/recursos/folha-dados";
import { folhasAction } from "../actions";
import { Contracheques } from "./Contracheques";

/**
 * O DETALHE DA FOLHA: a situação derivada, o cálculo vivo com o seu sha256, as ações (calcular,
 * cancelar o cálculo, fechar) e a LISTA DE CONTRACHEQUES do cálculo vivo — cada um com link para
 * a sua memória de cálculo.
 *
 * ⚠️ A LISTA DE CONTRACHEQUES É ESCRITA À MÃO, fora do molde (limite 2): ela é uma segunda coleção
 * dentro de um detalhe, e não cabe nas cinco abas fixas sem torcer o significado de "anexos".
 */
export const dynamic = "force-dynamic";

export default async function Detalhe({ params, searchParams }: { readonly params: Promise<{ readonly id: string }>; readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_FOLHA");
  const { id } = await params;
  const consulta = lerConsulta(FOLHAS, await searchParams);
  const [detalhe, permitidas] = await Promise.all([verFolha(id), acoesPermitidas(FOLHAS.acoes.map((a) => a.acaoDoCenso))]);
  if (detalhe === null) notFound();
  return (
    <div className="space-y-4">
      <DetalheDeRecurso
        definicao={FOLHAS}
        id={id}
        titulo={detalhe.titulo}
        subtitulo={detalhe.subtitulo}
        selos={detalhe.selos}
        abaAtiva={consulta.aba as AbaDoMolde}
        dados={detalhe.dados}
        historico={detalhe.historico}
        acoes={<FormsDoRecurso definicao={FOLHAS} permitidas={[...permitidas]} opcoes={{}} registroId={id} action={folhasAction} modo="acoes" />}
      />
      {consulta.aba === "dados" ? <Contracheques folhaId={id} linhas={detalhe.contracheques} /> : null}
    </div>
  );
}
