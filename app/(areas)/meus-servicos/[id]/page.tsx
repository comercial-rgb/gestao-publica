import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "../../../../components/ui/Card";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import { acoesPermitidas } from "../../../../lib/portas/molde";
import { ACEITE_DO_DOCUMENTO, minhaSolicitacaoPara, TETO_DO_DOCUMENTO } from "../../../../lib/portas/carta-de-servicos";
import { FormDocumentoDoRequerente, FormResponderExigencia } from "../FormulariosDoRequerente";

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
  return (
    <div className="space-y-4">
      <PageHeader titulo={`Solicitação ${s.protocolo}`} subtitulo={`${s.servico} (versão ${s.versao}) · em nome de ${s.titular}${s.viaRepresentacao ? " por representação" : ""}`} acoes={<Link href="/meus-servicos" className="text-sm text-[color:var(--color-primary)] underline">Minhas solicitações</Link>} />

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

      {s.exigencias.length > 0 ? (
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
      ) : null}

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
