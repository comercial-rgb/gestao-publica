import Link from "next/link";
import { Badge } from "../../../../components/ui/Badge";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { telaExigeLeituraEmAlgumEscopo } from "../../../../lib/portas/leitura";
import { manifestacoesDaOuvidoriaPara, OPCOES_DE_TIPO_DE_MANIFESTACAO, PortaSemBancoError } from "../../../../lib/portas/ouvidoria";
import { lerSetoresAtivos } from "../../../../lib/portas/protocolo";
import { FormEncaminharManifestacao, FormReceberManifestacao, FormRespostaDaOuvidoria, FormTriagem } from "./FormulariosDaMesaDaOuvidoria";

/**
 * A MESA DA OUVIDORIA (M21, V7 M1 U4) — as manifestações sem conta que a sessão ALCANÇA pela regra do
 * protocolo. São sigilosas: aparecem a quem participa (lotação na ouvidoria, movimento); consulta do
 * protocolo no ente não basta. ⚠️ Imports RELATIVOS na UI. `force-dynamic`: depende de sessão.
 */
export const dynamic = "force-dynamic";

const TITULO = "Ouvidoria";
const DESCRICAO = "Triagem, encaminhamento e resposta das manifestações. O acesso é restrito aos servidores do setor responsável.";

export default async function Pagina(): Promise<React.ReactElement> {
  const sessao = await telaExigeLeituraEmAlgumEscopo("CONSULTAR_PROTOCOLO");
  try {
    const [ms, setores] = await Promise.all([manifestacoesDaOuvidoriaPara(sessao), lerSetoresAtivos()]);
    const valorDoTipo = new Map(OPCOES_DE_TIPO_DE_MANIFESTACAO.map((t) => [t.rotulo, t.valor]));
    return (
      <div className="space-y-4">
        <PageHeader titulo={TITULO} subtitulo={DESCRICAO} acoes={<Link href="/ouvidoria" className="text-sm text-[color:var(--color-primary)] underline">Página pública</Link>} />
        {ms.length === 0 ? (
          <EstadoVazio titulo="Nenhuma manifestação disponível" descricao="Não há manifestações recebidas ou seu usuário não está lotado no setor responsável pela ouvidoria." />
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
                {/* ⚠️ ONDE ELA ESTÁ, E COMO CHEGOU. Sem isto, quem encaminha não sabe se
                    encaminhou; e quem recebe não sabe por quê. Era o que faltava para o trâmite —
                    que já existia no protocolo — ser utilizável pela ouvidoria. */}
                <p className="mt-3 text-xs text-[color:var(--color-ink-2)]" data-onde-esta>
                  <strong>Onde está:</strong>{" "}
                  {m.setorAtual === null ? "setor não identificado" : m.setorAtual.rotulo}
                  {m.aguardandoRecebimento ? " · aguardando recebimento no destino" : ""}
                </p>
                {m.historico.length > 0 ? (
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer text-[color:var(--color-primary)]">
                      Histórico ({m.historico.length} {m.historico.length === 1 ? "movimento" : "movimentos"})
                    </summary>
                    <ol className="mt-2 space-y-1.5 border-l border-[color:var(--color-border)] pl-3" data-historico-da-manifestacao>
                      {m.historico.map((h, i) => (
                        <li key={i}>
                          <span className="text-[color:var(--color-ink-3)]">{h.em}</span>{" "}
                          <strong>{h.oQue}</strong>
                          {h.de !== null || h.para !== null ? (
                            <span className="text-[color:var(--color-ink-2)]">
                              {" "}— de {h.de ?? "—"} para {h.para ?? "—"}
                              {h.paraPessoa !== null ? ` (designado: ${h.paraPessoa})` : ""}
                            </span>
                          ) : null}
                          {h.texto !== "" ? <span className="block whitespace-pre-line text-[color:var(--color-ink-2)]">{h.texto}</span> : null}
                        </li>
                      ))}
                    </ol>
                  </details>
                ) : null}
                {m.receber.pode ? <FormReceberManifestacao processoId={m.processoId} protocolo={m.protocolo} motivo={null} /> : null}
                <FormTriagem manifestacaoId={m.id} protocolo={m.protocolo} tipos={OPCOES_DE_TIPO_DE_MANIFESTACAO} tipoInformado={valorDoTipo.get(m.tipo) ?? "DENUNCIA"} motivo={m.triar.pode ? null : m.triar.motivo} />
                <FormEncaminharManifestacao processoId={m.processoId} protocolo={m.protocolo} setores={setores.filter((x) => x.id !== m.setorAtual?.id)} motivo={m.encaminhar.pode ? null : m.encaminhar.motivo} />
                <FormRespostaDaOuvidoria manifestacaoId={m.id} protocolo={m.protocolo} motivo={m.responder.pode ? null : m.responder.motivo} />
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
          <EstadoVazio titulo="Dados indisponíveis" descricao="Não foi possível acessar a base de dados deste ambiente." />
        </div>
      );
    }
    throw e;
  }
}
