import { notFound } from "next/navigation";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { telaExigeLeituraEmAlgumEscopo } from "../../../../../lib/portas/leitura";
import { acoesPermitidas } from "../../../../../lib/portas/molde";
import { lerSetoresAtivos } from "../../../../../lib/portas/protocolo";
import { SERVICOS_DA_CARTA } from "../../../../../lib/portas/recursos/servicos-da-carta";
import { CAMPOS_DO_CADASTRO_DA_TELA, disponibilidadeDoServicoDaCarta, opcoesDoServicoDaCarta, TIPOS_DE_CAMPO_DA_TELA, verServicoDaCarta } from "../../../../../lib/portas/recursos/servicos-da-carta-dados";
import { servicosDaCartaAction, versaoDoServicoAction } from "../actions";
import { FormVersaoDoServico } from "./FormVersaoDoServico";

/**
 * O DETALHE DO SERVIÇO DA CARTA: as versões (rascunho e publicadas, com as etapas copiadas), a ilha de
 * cadastrar versão e a ação de publicar (só os rascunhos DESTE serviço).
 */
export const dynamic = "force-dynamic";

export default async function Detalhe({ params, searchParams }: { readonly params: Promise<{ readonly id: string }>; readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await telaExigeLeituraEmAlgumEscopo("CONSULTAR_PROTOCOLO");
  const { id } = await params;
  const consulta = lerConsulta(SERVICOS_DA_CARTA, await searchParams);
  const [detalhe, opcoes, permitidas, setores] = await Promise.all([verServicoDaCarta(id), opcoesDoServicoDaCarta(id), acoesPermitidas(["CONFIGURAR_CARTA_DE_SERVICOS"]), lerSetoresAtivos()]);
  if (detalhe === null) notFound();
  const disponibilidade = await disponibilidadeDoServicoDaCarta(id).catch(() => null);
  return (
    <DetalheDeRecurso
      definicao={SERVICOS_DA_CARTA}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      acoes={
        <div className="space-y-4">
          {permitidas.has("CONFIGURAR_CARTA_DE_SERVICOS") ? (
            <FormVersaoDoServico servicoId={id} tipoDoServico={detalhe.tipo} tipos={TIPOS_DE_CAMPO_DA_TELA} setores={setores.map((s) => ({ valor: s.id, rotulo: s.rotulo }))} camposDoCadastro={CAMPOS_DO_CADASTRO_DA_TELA} action={versaoDoServicoAction} />
          ) : null}
          <FormsDoRecurso definicao={SERVICOS_DA_CARTA} permitidas={[...permitidas]} opcoes={opcoes} registroId={id} action={servicosDaCartaAction} modo="acoes" disponibilidade={disponibilidade} />
        </div>
      }
    />
  );
}
