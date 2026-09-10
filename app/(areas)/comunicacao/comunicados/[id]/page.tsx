import { notFound } from "next/navigation";
import { Badge } from "../../../../../components/ui/Badge";
import { Card } from "../../../../../components/ui/Card";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import {
  lerCaixa,
  lerComunicado,
  lerMeusSetoresParaComunicado,
  lerSetoresParaDestino,
} from "../../../../../lib/portas/comunicacao";
import {
  FormAcoesPessoais,
  FormEditarRascunho,
  FormEncaminhar,
  FormEnviar,
  FormResponder,
} from "./FormAcoes";

/**
 * O COMUNICADO — e as ações acontecem aqui, não numa tela à parte.
 *
 * ⚠️ COMUNICADO FORA DO ALCANCE DÁ 404. A porta devolve `null` a quem não participa, e a
 * tela não distingue "não existe" de "não é seu" — distingui-los entregaria a lista do
 * que existe a quem tenta identificadores ao acaso.
 */
export const dynamic = "force-dynamic";

function instante(d: Date): string {
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default async function ComunicadoPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;

  const c = await lerComunicado(id);
  if (c === null) notFound();

  const [meusSetores, todosSetores, caixa] = await Promise.all([
    lerMeusSetoresParaComunicado(),
    lerSetoresParaDestino(),
    lerCaixa("TODAS"),
  ]);

  const naCaixa = caixa.find((x) => x.id === id);
  const arquivado = naCaixa?.caixa === "ARQUIVADO";

  // O destino não pode ser o próprio remetente — ele já tem o documento na saída.
  const destinos = todosSetores.filter((s) => s.id !== c.remetenteId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader titulo={`${c.rotulo}`} subtitulo={`${c.tipo} · ${c.assunto}`} />

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <Badge status={c.enviado ? "ok" : "neutro"}>
            {c.enviado ? "enviado" : "rascunho"}
          </Badge>
          {!c.conteudoIntegro ? (
            <Badge status="erro">texto alterado depois do envio</Badge>
          ) : null}
          {c.tags.map((t) => (
            <Badge key={t} status="neutro">
              #{t}
            </Badge>
          ))}
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
          <div>
            <dt className="text-xs text-[color:var(--color-ink-2)]">Remetente</dt>
            <dd>{c.remetente}</dd>
          </div>
          <div>
            <dt className="text-xs text-[color:var(--color-ink-2)]">Emitido por</dt>
            <dd>
              {c.criadoPor} em {instante(c.criadoEm)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[color:var(--color-ink-2)]">Destinatários</dt>
            <dd>
              {c.destinatarios.length === 0
                ? "— (ainda não enviado)"
                : c.destinatarios.map((d) => (
                    <span key={d.setor} className="mr-2">
                      {d.setor}
                      {d.aosCuidadosDe !== null ? ` (A/C ${d.aosCuidadosDe})` : ""}
                      {d.porEncaminhamento ? " · por encaminhamento" : ""}
                    </span>
                  ))}
            </dd>
          </div>
        </dl>

        <p className="mt-4 whitespace-pre-line text-sm text-[color:var(--color-ink)]">
          {c.corpo}
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {!c.enviado ? (
          <FormEditarRascunho comunicadoId={c.id} assunto={c.assunto} corpo={c.corpo} />
        ) : null}
        {!c.enviado ? (
          <FormEnviar
            comunicadoId={c.id}
            setores={destinos}
            assinaturaExigida={c.assinaturaExigida}
          />
        ) : null}
        {c.enviado ? (
          <FormResponder
            comunicadoId={c.id}
            setores={meusSetores}
            aceitaResposta={c.aceitaResposta}
            assuntoOriginal={c.assunto}
          />
        ) : null}
        {c.enviado ? <FormEncaminhar comunicadoId={c.id} setores={destinos} /> : null}
        {c.enviado ? (
          <FormAcoesPessoais comunicadoId={c.id} arquivado={arquivado} />
        ) : null}
      </div>

      {c.enviado ? (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">
            Quem leu
          </h2>
          <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
            A primeira leitura de cada pessoa é a que vale — um registro por abertura
            afogaria o dado que interessa (quando ela tomou ciência) num histórico de
            ruído.
          </p>
          {c.leituras.length === 0 ? (
            <p className="text-sm text-[color:var(--color-ink-2)]">
              Ninguém registrou ciência ainda.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-[color:var(--color-border)] text-left text-xs uppercase tracking-wide text-[color:var(--color-ink-2)]">
                <tr>
                  <th className="py-2 pr-3">Quem</th>
                  <th className="py-2 pr-3">Quando</th>
                  <th className="py-2 pr-3">Origem</th>
                  <th className="py-2 pr-3">Setor</th>
                </tr>
              </thead>
              <tbody>
                {c.leituras.map((l) => (
                  <tr
                    key={`${l.usuario}-${l.em.toISOString()}`}
                    className="border-b border-[color:var(--color-border)] last:border-0"
                  >
                    <td className="py-2 pr-3">{l.usuario}</td>
                    <td className="py-2 pr-3">{instante(l.em)}</td>
                    <td className="py-2 pr-3">{l.origem}</td>
                    <td className="py-2 pr-3">{l.setor ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      ) : null}
    </div>
  );
}
