import Link from "next/link";
import { notFound } from "next/navigation";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { Card } from "../../../../../components/ui/Card";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { ACEITE_DO_DOCUMENTO } from "../../../../../lib/portas/carta-de-servicos";
import { telaExigeLeituraEmAlgumEscopo } from "../../../../../lib/portas/leitura";
import { acoesPermitidas } from "../../../../../lib/portas/molde";
import { SOLICITACOES_DA_MESA } from "../../../../../lib/portas/recursos/solicitacoes-da-mesa";
import { disponibilidadeDaSolicitacao, verSolicitacaoNaMesa } from "../../../../../lib/portas/recursos/solicitacoes-da-mesa-dados";
import { mesaAction, respostaDaMesaAction } from "../actions";
import { FormRespostaDaMesa } from "./FormRespostaDaMesa";

/**
 * A SOLICITAÇÃO NA MESA: o que o requerente informou, a representação usada, a proposta cadastral com o
 * valor atual ao lado, os documentos (baixados pela rota de anexos do processo), a decisão com o
 * fundamento interno, e a barra projetada pelo estado.
 */
export const dynamic = "force-dynamic";

export default async function Detalhe({ params, searchParams }: { readonly params: Promise<{ readonly id: string }>; readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  const sessao = await telaExigeLeituraEmAlgumEscopo("CONSULTAR_PROTOCOLO");
  const { id } = await params;
  const consulta = lerConsulta(SOLICITACOES_DA_MESA, await searchParams);
  const [detalhe, permitidas] = await Promise.all([verSolicitacaoNaMesa(sessao, id), acoesPermitidas(["DECIDIR_SOLICITACAO_DE_SERVICO"])]);
  if (detalhe === null) notFound();
  const disponibilidade = await disponibilidadeDaSolicitacao(sessao, id).catch(() => null);
  return (
    <DetalheDeRecurso
      definicao={SOLICITACOES_DA_MESA}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      acoes={
        <div className="space-y-4">
          <p className="text-xs"><Link href={`/protocolo/processos/${detalhe.processoId}`} className="text-[color:var(--color-primary)] underline">Abrir o processo digital (tramitação, recebimento e pareceres)</Link></p>
          <Card>
            <h2 className="mb-2 text-sm font-semibold">Documentos da solicitação</h2>
            {detalhe.documentos.length === 0 ? (
              <p className="text-xs text-[color:var(--color-ink-2)]">Nenhum documento enviado pelo requerente ou disponibilizado a ele.</p>
            ) : (
              <ul className="space-y-1 text-sm" data-documentos-da-mesa>
                {detalhe.documentos.map((d) => (
                  <li key={d.id}><a href={`/documentos/anexos/${d.id}`} className="text-[color:var(--color-primary)] underline">{d.nome}</a> <span className="text-xs text-[color:var(--color-ink-3)]">{d.origem} · {d.em} · {d.por}</span></li>
                ))}
              </ul>
            )}
          </Card>
          {permitidas.has("DECIDIR_SOLICITACAO_DE_SERVICO") && detalhe.aceitaResposta ? <FormRespostaDaMesa solicitacaoId={id} accept={ACEITE_DO_DOCUMENTO} action={respostaDaMesaAction} /> : null}
          <FormsDoRecurso definicao={SOLICITACOES_DA_MESA} permitidas={[...permitidas]} opcoes={{}} registroId={id} action={mesaAction} modo="acoes" disponibilidade={disponibilidade} />
        </div>
      }
    />
  );
}
