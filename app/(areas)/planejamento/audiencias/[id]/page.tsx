import { notFound } from "next/navigation";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { ListaDeAnexos } from "../../../../../components/ui/ListaDeAnexos";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { EXTENSOES_ACEITAS, lerAnexosDaAudiencia, TAMANHO_MAXIMO_BYTES } from "../../../../../lib/portas/documentos";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { AUDIENCIAS_PUBLICAS } from "../../../../../lib/portas/recursos/audiencias";
import { opcoesDaAudiencia, verAudiencia } from "../../../../../lib/portas/recursos/audiencias-dados";
import { FormAnexo } from "../../../documentos/FormAnexo";
import { audienciasAction } from "../actions";

/**
 * V36 — O DETALHE DA AUDIÊNCIA PÚBLICA (TR 5.9.1.1-2): as solicitações da comunidade com bairro, solicitante e
 * contato, órgão que analisa e situação; as ações de registrar e decidir; os documentos na aba Anexos.
 * Ato do ENTE: a leitura é a do Planejamento.
 */
export const dynamic = "force-dynamic";

const celula = "border-b border-[color:var(--color-border)] px-2 py-1.5 align-top";

export default async function Detalhe({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly id: string }>;
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_PLANEJAMENTO");
  const { id } = await params;
  const consulta = lerConsulta(AUDIENCIAS_PUBLICAS, await searchParams);
  const [detalhe, opcoes, permitidas] = await Promise.all([
    verAudiencia(id),
    opcoesDaAudiencia(id),
    acoesPermitidas([...AUDIENCIAS_PUBLICAS.acoes.map((a) => a.acaoDoCenso), "ANEXAR_ARQUIVO"]),
  ]);
  if (detalhe === null) notFound();
  const anexos = consulta.aba === "anexos" ? await lerAnexosDaAudiencia(id) : [];
  return (
    <DetalheDeRecurso
      definicao={AUDIENCIAS_PUBLICAS}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      resumo={
        <section aria-label="Solicitações da comunidade" className="overflow-x-auto" data-solicitacoes-da-audiencia>
          <h2 className="mb-2 text-sm font-semibold">Solicitações da comunidade</h2>
          {detalhe.solicitacoes.length === 0 ? (
            <p className="text-sm text-[color:var(--color-ink-2)]">Nenhuma solicitação registrada nesta audiência.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className={celula}>Solicitação</th>
                  <th className={celula}>Bairro</th>
                  <th className={celula}>Solicitante</th>
                  <th className={celula}>Contato</th>
                  <th className={celula}>Órgão que analisa</th>
                  <th className={celula}>Situação</th>
                  <th className={celula}>Parecer</th>
                </tr>
              </thead>
              <tbody>
                {detalhe.solicitacoes.map((s) => (
                  <tr key={s.id} data-solicitacao={s.id}>
                    <td className={celula}>{s.descricao}</td>
                    <td className={celula}>{s.bairro}</td>
                    <td className={celula}>{s.solicitante}</td>
                    <td className={celula}>{s.contato}</td>
                    <td className={celula}>{s.orgao}</td>
                    <td className={celula} data-situacao>{s.situacao}</td>
                    <td className={celula}>{s.parecer ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      }
      anexos={
        <>
          <ListaDeAnexos anexos={anexos} />
          {permitidas.has("ANEXAR_ARQUIVO") ? (
            <div className="mt-3">
              <FormAnexo accept={EXTENSOES_ACEITAS} dono={{ audienciaPublicaId: id }} rotulo="Anexar documento da audiência" tamanhoMaximoBytes={TAMANHO_MAXIMO_BYTES} />
            </div>
          ) : null}
        </>
      }
      acoes={
        <FormsDoRecurso
          definicao={AUDIENCIAS_PUBLICAS}
          permitidas={[...permitidas]}
          opcoes={opcoes}
          registroId={id}
          action={audienciasAction}
          modo="acoes"
        />
      }
    />
  );
}
