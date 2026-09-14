import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "../../../../components/ui/Card";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import { acoesPermitidas } from "../../../../lib/portas/molde";
import { ACEITE_DO_DOCUMENTO, minhaSolicitacaoPara, TETO_DO_DOCUMENTO } from "../../../../lib/portas/carta-de-servicos";
import { avaliacaoDoAtendimento } from "../../../../lib/portas/ouvidoria";
import { FormAvaliarAtendimento, FormDocumentoDoRequerente, FormResponderExigencia } from "../FormulariosDoRequerente";

/**
 * O ACOMPANHAMENTO DE UMA SOLICITAÇÃO (V6.2 P3) — a projeção do REQUERENTE.
 *
 * ⚠️ O ID NA URL NÃO DÁ ACESSO: a porta cruza a solicitação com a pessoa da sessão e as representações
 * vigentes; de outra pessoa (ou de representação revogada) responde "não encontrado", igual a um id que
 * não existe. Despacho interno, parecer e fundamento interno da decisão NÃO chegam a esta tela.
 */
export const dynamic = "force-dynamic";

export default async function Pagina({ params }: { readonly params: Promise<{ readonly id: string }> }): Promise<React.ReactElement> {
  const sessao = await telaExigeLeituraDoEnte("CONSULTAR_MEUS_SERVICOS");
  const { id } = await params;
  const [s, permitidas] = await Promise.all([minhaSolicitacaoPara(sessao, id), acoesPermitidas(["SOLICITAR_SERVICO"])]);
  if (s === null) notFound();
  const pendente = s.exigencias.find((e) => e.resposta === null);
  // A solicitação já foi conferida contra a sessão acima; a avaliação é lida só depois disso.
  const avaliacao = s.decisao !== null ? await avaliacaoDoAtendimento(s.id) : null;
  return (
    <div className="space-y-4">
      <PageHeader titulo={`Solicitação ${s.protocolo}`} subtitulo={`${s.servico} (versão ${s.versao}) · em nome de ${s.titular}${s.viaRepresentacao ? " por representação" : ""}`} acoes={<Link href="/meus-servicos" className="text-sm text-[color:var(--color-primary)] underline">Minhas solicitações</Link>} />

      {/* V7 M1 U5 — O QUE FALTA, no topo: a providência que cabe ao requerente agora, com o salto para o
          formulário. As condições são as mesmas que decidem se cada formulário aparece abaixo. */}
      <section aria-label="O que falta" data-o-que-falta className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4 shadow-[var(--shadow-card)]">
        <h2 className="text-sm font-semibold">O que falta</h2>
        {(() => {
          const passos: { readonly texto: string; readonly href: string }[] = [];
          if (permitidas.has("SOLICITAR_SERVICO") && pendente !== undefined && s.podeResponder.pode) passos.push({ texto: "Responder a exigência do setor", href: "#exigencias" });
          if (permitidas.has("SOLICITAR_SERVICO") && s.podeAnexar && pendente !== undefined) passos.push({ texto: "Enviar o documento pedido", href: "#enviar-documento" });
          if (permitidas.has("SOLICITAR_SERVICO") && avaliacao !== null && avaliacao.escala !== null && avaliacao.ultima === null) passos.push({ texto: "Avaliar o atendimento (opcional)", href: "#avaliacao" });
          if (passos.length === 0) {
            return <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">{s.decisao !== null ? "Nada a fazer por você: a solicitação foi decidida." : "Nada a fazer por você agora: a solicitação está com o setor responsável. Você será avisado se houver exigência."}</p>;
          }
          return (
            <ul className="mt-2 flex flex-wrap gap-2">
              {passos.map((p) => <li key={p.href}><a href={p.href} className="inline-flex min-h-11 items-center rounded-[var(--radius-md)] bg-[color:var(--color-primary)] px-4 text-sm font-semibold text-[color:var(--color-primary-fg)]">{p.texto}</a></li>)}
            </ul>
          );
        })()}
      </section>

      <Card>
        <p className="text-sm" data-situacao-do-requerente={s.situacao}><strong>Situação:</strong> {s.rotuloDaSituacao}</p>
        <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">
          Protocolada em {s.protocoladaEm} · prazo: {s.prazo ?? "não declarado"} · código verificador <span data-codigo-verificador>{s.codigoVerificador}</span> (serve na <Link href="/consulta" className="underline">consulta pública</Link>)
        </p>
        {s.decisao !== null ? (
          <div data-decisao={s.decisao.resultado} className="mt-3 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
            <p className="text-sm font-semibold">{s.decisao.resultado === "DEFERIDA" ? "Deferida" : "Indeferida"} em {s.decisao.em}</p>
            <p className="mt-1 whitespace-pre-line text-sm">{s.decisao.mensagem}</p>
          </div>
        ) : null}
      </Card>

      {s.decisao !== null ? (
        <div id="avaliacao" data-ancora className="scroll-mt-24">
        <Card>
          <h2 className="mb-1 text-sm font-semibold">Avalie o atendimento</h2>
          {avaliacao?.escala === null || avaliacao === null ? (
            <p className="text-sm text-[color:var(--color-ink-2)]" data-avaliacao="fechada">A avaliação dos serviços ainda não foi aberta pelo ente.</p>
          ) : (
            <>
              <p className="mb-3 text-xs text-[color:var(--color-ink-2)]" data-avaliacao={avaliacao.ultima === null ? "pendente" : "feita"}>
                {avaliacao.ultima === null
                  ? "Satisfação, atendimento e cumprimento de prazos. A média publicada não mostra quem avaliou."
                  : `Sua avaliação mais recente (${avaliacao.ultima.em}): satisfação ${avaliacao.ultima.satisfacao}, atendimento ${avaliacao.ultima.atendimento}, prazos ${avaliacao.ultima.prazos}${avaliacao.ultima.removida ? " — removida pela moderação" : ""}. Enviar de novo revisa esta.`}
              </p>
              {permitidas.has("SOLICITAR_SERVICO") ? <FormAvaliarAtendimento solicitacaoId={s.id} escala={avaliacao.escala} jaAvaliou={avaliacao.ultima !== null} /> : null}
            </>
          )}
        </Card>
        </div>
      ) : null}

      {s.exigencias.length > 0 ? (
        <div id="exigencias" data-ancora className="scroll-mt-24">
        <Card>
          <h2 className="mb-2 text-sm font-semibold">Exigências</h2>
          <ul className="space-y-3" data-exigencias>
            {s.exigencias.map((e) => (
              <li key={e.id} className="text-sm" data-exigencia={e.resposta === null ? "pendente" : "respondida"}>
                <p className="whitespace-pre-line">{e.mensagem}</p>
                <p className="text-xs text-[color:var(--color-ink-3)]">emitida em {e.emitidaEm}</p>
                {e.resposta !== null ? <p className="mt-1 whitespace-pre-line text-xs text-[color:var(--color-ink-2)]">Sua resposta ({e.resposta.em}): {e.resposta.texto}</p> : null}
              </li>
            ))}
          </ul>
        </Card>
        </div>
      ) : null}

      {permitidas.has("SOLICITAR_SERVICO") && s.podeAnexar ? <div id="enviar-documento" data-ancora className="scroll-mt-24" /> : null}
      {permitidas.has("SOLICITAR_SERVICO") && s.podeAnexar ? <FormDocumentoDoRequerente solicitacaoId={s.id} accept={ACEITE_DO_DOCUMENTO} tamanhoMaximoBytes={TETO_DO_DOCUMENTO} /> : null}
      {permitidas.has("SOLICITAR_SERVICO") ? <FormResponderExigencia solicitacaoId={s.id} pendente={pendente !== undefined} motivo={s.podeResponder.pode ? null : s.podeResponder.motivo} /> : null}

      <Card>
        <h2 className="mb-2 text-sm font-semibold">Documentos</h2>
        {s.documentos.length === 0 ? (
          <p className="text-xs text-[color:var(--color-ink-2)]">Nenhum documento enviado por você ou liberado pelo ente.</p>
        ) : (
          <ul className="space-y-1 text-sm" data-documentos>
            {s.documentos.map((d) => (
              <li key={d.id} data-documento={d.origem}>
                <a href={`/meus-servicos/${s.id}/documentos/${d.id}`} className="text-[color:var(--color-primary)] underline">{d.nome}</a>{" "}
                <span className="text-xs text-[color:var(--color-ink-3)]">{d.origem === "REQUERENTE" ? "enviado por você" : "resposta do ente"} · {d.tamanho} · {d.em}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold">O que você informou</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          {s.respostas.map((r) => (
            <div key={r.rotulo}><dt className="text-xs text-[color:var(--color-ink-2)]">{r.rotulo}</dt><dd className="whitespace-pre-line">{r.valor}</dd></div>
          ))}
        </dl>
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold">Andamento</h2>
        <ol className="space-y-1 text-sm" data-andamento>
          <li>Solicitação protocolada — {s.protocoladaEm}</li>
          {s.linhaDoTempo.map((m, i) => <li key={`${m.em}-${i}`}>{m.rotulo} — {m.em}</li>)}
        </ol>
        {s.etapas.length > 0 ? <p className="mt-2 text-xs text-[color:var(--color-ink-2)]">Etapas previstas: {s.etapas.map((e) => `${e.ordem}. ${e.setor}`).join(" · ")}</p> : null}
      </Card>
    </div>
  );
}
