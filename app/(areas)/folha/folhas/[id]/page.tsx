import { notFound } from "next/navigation";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { FOLHAS } from "../../../../../lib/portas/recursos/folha";
import { disponibilidadeDaFolha, verFolha } from "../../../../../lib/portas/recursos/folha-dados";
import { folhasAction } from "../actions";
import { lerEncargosDaFolha } from "../../../../../lib/portas/recursos/encargos-dados";
import { CertificacaoDaFolha } from "./CertificacaoDaFolha";
import { EncargosDaFolha } from "./EncargosDaFolha";
import { ObrigacoesDaFolha } from "./ObrigacoesDaFolha";
import { lerObrigacoesDaFolha } from "../../../../../lib/portas/recursos/obrigacoes-dos-encargos";
import { Contracheques } from "./Contracheques";
import { EmpenhosDaFolha } from "./EmpenhosDaFolha";

/**
 * O DETALHE DA FOLHA: a situação derivada, o cálculo vivo com o seu sha256, as ações (calcular,
 * cancelar o cálculo, fechar) e a LISTA DE CONTRACHEQUES do cálculo vivo — cada um com link para
 * a sua memória de cálculo.
 *
 * ⚠️ A LISTA DE CONTRACHEQUES É ESCRITA À MÃO, fora do molde (limite 2): ela é uma segunda coleção
 * dentro de um detalhe, e não cabe nas cinco abas fixas sem torcer o significado de "anexos". O
 * mesmo vale para o atesto (V6.1) e para os empenhos.
 *
 * ⚠️ AS DIMENSÕES APARECEM SEPARADAS — cálculo, certificação, apropriação e liquidação. Uma coluna
 * única que as somasse faria a tela dizer "liquidada" sobre folha que ninguém atestou, e "paga"
 * sobre dinheiro que não saiu.
 */
export const dynamic = "force-dynamic";

export default async function Detalhe({ params, searchParams }: { readonly params: Promise<{ readonly id: string }>; readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_FOLHA");
  const { id } = await params;
  const consulta = lerConsulta(FOLHAS, await searchParams);
  const [detalhe, permitidas] = await Promise.all([verFolha(id), acoesPermitidas([...FOLHAS.acoes.map((a) => a.acaoDoCenso), "DESIGNAR_NA_FOLHA", "CADASTRAR_GRUPO_DE_EMPENHO_DA_FOLHA", "GERIR_GUIA_DE_RECOLHIMENTO"])]);
  if (detalhe === null) notFound();
  // ⚠️ FALHAR A CONFERÊNCIA NÃO LIBERA A BARRA: `null` faz o molde travar cada ato com o motivo.
  const disponibilidade = await disponibilidadeDaFolha(id, permitidas).catch(() => null);
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
        acoes={<FormsDoRecurso definicao={FOLHAS} permitidas={[...permitidas]} opcoes={{}} registroId={id} action={folhasAction} modo="acoes" disponibilidade={disponibilidade} />}
      />
      {consulta.aba === "dados" && detalhe.certificacao !== null ? <CertificacaoDaFolha situacao={detalhe.certificacao.situacao} fatos={detalhe.certificacao.fatos} /> : null}
      {consulta.aba === "dados" && detalhe.apropriacao !== null ? <EmpenhosDaFolha apropriacao={detalhe.apropriacao} liquidacoes={detalhe.liquidacao?.porEmpenho ?? {}} /> : null}
      {consulta.aba === "dados" ? <EncargosDaFolha encargos={await lerEncargosDaFolha(id)} /> : null}
      {consulta.aba === "dados" && detalhe.situacao === "FECHADA" ? <ObrigacoesDaFolha folhaId={id} obrigacoes={await lerObrigacoesDaFolha(id)} podeGerir={permitidas.has("GERIR_GUIA_DE_RECOLHIMENTO")} /> : null}
      {consulta.aba === "dados" && detalhe.situacao === "FECHADA" ? (
        <p data-resumo-da-folha className="flex flex-wrap gap-3 text-sm">
          <a href={`/folha/folhas/${id}/resumo?formato=pdf`} target="_blank" rel="noopener noreferrer" className="font-medium text-[color:var(--color-primary)] hover:underline">Resumo da folha (PDF): bruto, descontos, líquido e patronal</a>
          <a href={`/folha/folhas/${id}/resumo?formato=csv`} className="font-medium text-[color:var(--color-primary)] hover:underline">Resumo da folha (CSV)</a>
        </p>
      ) : null}
      {consulta.aba === "dados" ? <Contracheques folhaId={id} linhas={detalhe.contracheques} /> : null}
    </div>
  );
}
