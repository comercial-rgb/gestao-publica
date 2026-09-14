import Link from "next/link";
import { Badge } from "../../../../components/ui/Badge";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { telaExigeLeituraEmAlgumEscopo } from "../../../../lib/portas/leitura";
import { manifestacoesDaOuvidoriaPara, OPCOES_DE_TIPO_DE_MANIFESTACAO, PortaSemBancoError } from "../../../../lib/portas/ouvidoria";
import { FormRespostaDaOuvidoria, FormTriagem } from "./FormulariosDaMesaDaOuvidoria";

/**
 * A MESA DA OUVIDORIA (M21, V7 M1 U4) — as manifestações sem conta que a sessão ALCANÇA pela regra do
 * protocolo. São sigilosas: aparecem a quem participa (lotação na ouvidoria, movimento); consulta do
 * protocolo no ente não basta. ⚠️ Imports RELATIVOS na UI. `force-dynamic`: depende de sessão.
 */
export const dynamic = "force-dynamic";

const TITULO = "Ouvidoria";
const DESCRICAO = "Manifestações recebidas sem conta: triagem interna, resposta ao manifestante e encerramento. Sigilosas — só quem está lotado na ouvidoria as vê.";

export default async function Pagina(): Promise<React.ReactElement> {
  const sessao = await telaExigeLeituraEmAlgumEscopo("CONSULTAR_PROTOCOLO");
  try {
    const ms = await manifestacoesDaOuvidoriaPara(sessao);
    const valorDoTipo = new Map(OPCOES_DE_TIPO_DE_MANIFESTACAO.map((t) => [t.rotulo, t.valor]));
    return (
      <div className="space-y-4">
        <PageHeader titulo={TITULO} subtitulo={DESCRICAO} acoes={<Link href="/ouvidoria" className="text-sm text-[color:var(--color-primary)] underline">Página pública</Link>} />
        {ms.length === 0 ? (
          <EstadoVazio titulo="Nenhuma manifestação ao seu alcance" descricao="Ou ainda não chegou manifestação, ou você não está lotado no setor da ouvidoria. A consulta do protocolo, sozinha, não abre manifestação sigilosa." />
        ) : (
          <ul className="space-y-4" data-manifestacoes>
            {ms.map((m) => (
              <li key={m.id} data-manifestacao={m.protocolo} className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4 shadow-[var(--shadow-card)]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-semibold">
                    <Link href={`/protocolo/processos/${m.processoId}`} className="text-[color:var(--color-primary)] hover:underline">Manifestação {m.protocolo}</Link>
                  </h2>
                  <Badge status={m.situacao === "Concluída" ? "ok" : m.situacao === "Aguardando triagem" ? "alerta" : "neutro"}>{m.situacao}</Badge>
                </div>
                <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">
                  {m.tipo}{m.tipoConfirmado !== null && m.tipoConfirmado !== m.tipo ? ` (confirmado como ${m.tipoConfirmado})` : ""} · recebida em {m.recebidaEm} · {m.contato === null ? "sem contato informado" : `contato: ${m.contato}`}
                </p>
                <p className="mt-3 whitespace-pre-line text-sm">{m.relato}</p>
                {m.anotacaoInterna !== null ? <p className="mt-2 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-surface-2,transparent)] text-xs text-[color:var(--color-ink-2)]"><strong>Triagem (interna):</strong> {m.anotacaoInterna}</p> : null}
                {m.respostas.length > 0 ? (
                  <ol className="mt-3 space-y-2 text-sm" aria-label="Respostas liberadas ao manifestante">
                    {m.respostas.map((r, i) => <li key={i}><span className="text-xs text-[color:var(--color-ink-3)]">{r.em}{r.conclusiva ? " · conclusiva" : ""}</span><p className="whitespace-pre-line">{r.texto}</p></li>)}
                  </ol>
                ) : null}
                <FormTriagem manifestacaoId={m.id} tipos={OPCOES_DE_TIPO_DE_MANIFESTACAO} tipoInformado={valorDoTipo.get(m.tipo) ?? "DENUNCIA"} motivo={m.triar.pode ? null : m.triar.motivo} />
                <FormRespostaDaOuvidoria manifestacaoId={m.id} motivo={m.responder.pode ? null : m.responder.motivo} />
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={TITULO} subtitulo={DESCRICAO} />
          <EstadoVazio titulo="Banco de dados indisponível" descricao="Esta tela lê as manifestações. Sem banco, não tem o que mostrar." />
        </div>
      );
    }
    throw e;
  }
}
