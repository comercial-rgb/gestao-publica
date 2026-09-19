import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "../../../../../../components/ui/Card";
import { PageHeader } from "../../../../../../components/ui/PageHeader";
import { exigirLeitura } from "../../../../../../lib/portas/molde";
import { pedidoDeAcessoParaTela } from "../../../../../../lib/portas/pedido-de-acesso";
import { instanteCivilBr } from "../../../../../../packages/datas/index";
import {
  FormDecidirRecurso,
  FormDistribuir,
  FormInterporRecurso,
  FormProrrogar,
  FormReceber,
  FormResponder,
} from "../FormsDoPedido";

/**
 * UM PEDIDO DE ACESSO À INFORMAÇÃO — a trilha interna e os atos (V11 V5.3).
 *
 * ⚠️ AS DUAS PROJEÇÕES APARECEM LADO A LADO, e isso é deliberado. O servidor precisa saber o que
 * o cidadão está lendo antes de responder — e ver as duas juntas torna óbvio o que NÃO atravessa:
 * fundamento interno, prévia, ator e setor ficam só do lado de cá. Elas não são a mesma estrutura
 * filtrada: são montadas por funções diferentes, e a do requerente nunca leu aqueles campos.
 *
 * ⚠️ `force-dynamic`: depende de SESSÃO e do dia civil.
 */
export const dynamic = "force-dynamic";

export default async function Pagina({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_PROTOCOLO");
  const { id } = await params;

  const p = await pedidoDeAcessoParaTela(id);
  if (p === null) notFound();

  const v = p.interna;
  const r = p.doRequerente;

  return (
    <>
      <PageHeader
        titulo={`Pedido ${v.protocolo}`}
        subtitulo={v.rotulo}
        acoes={
          <Link href="/protocolo/acesso-a-informacao/pedidos" className="text-xs text-[color:var(--color-primary)] underline underline-offset-2">
            voltar à lista
          </Link>
        }
      />

      <div className="space-y-4">
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-ink)]">O que foi pedido</h2>
          <p className="whitespace-pre-line text-xs text-[color:var(--color-ink-2)]" data-texto-do-pedido>{p.textoAbertura}</p>
          <dl className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3" data-prazo-do-pedido>
            <div>
              <dt className="text-[color:var(--color-ink-2)]">Prazo de resposta</dt>
              <dd className="font-semibold" data-limite>{v.prazo.limiteBr ?? "sem data"}</dd>
            </div>
            <div>
              <dt className="text-[color:var(--color-ink-2)]">Prorrogações aplicadas</dt>
              <dd className="font-semibold" data-prorrogacoes>{v.prorrogacoesAplicadas}</dd>
            </div>
            <div>
              <dt className="text-[color:var(--color-ink-2)]">Norma obedecida</dt>
              <dd className="font-semibold" data-norma>{v.prazo.normaFederal ?? "nenhuma publicada"}</dd>
            </div>
          </dl>
          {v.prazo.pendencias.length > 0 ? (
            <ul className="mt-3 space-y-1 text-xs text-[color:var(--color-status-alerta-fg)]" data-pendencias-da-configuracao>
              {v.prazo.pendencias.map((x) => (
                <li key={x.codigo}>{x.mensagem}</li>
              ))}
            </ul>
          ) : null}
        </Card>

        <Card>
          <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-ink)]">Trilha interna</h2>
          <ol className="space-y-2 text-xs" data-trilha-interna>
            {v.trilha.map((l, i) => (
              <li key={`${l.natureza}-${i}`} data-fato={l.natureza} className="border-t border-[color:var(--color-border)] pt-2 first:border-0 first:pt-0">
                <p className="font-semibold text-[color:var(--color-ink)]">
                  {l.rotulo} — {instanteCivilBr(l.em)} por {l.ator}
                  {l.configuracaoVersao === null ? "" : ` (norma versão ${l.configuracaoVersao})`}
                </p>
                {l.mensagemAoRequerente === null ? null : (
                  <p className="text-[color:var(--color-ink-2)]">Ao requerente: {l.mensagemAoRequerente}</p>
                )}
                {l.fundamentoInterno === null ? null : (
                  <p className="text-[color:var(--color-ink-2)]" data-fundamento-interno>Registro interno: {l.fundamentoInterno}</p>
                )}
              </li>
            ))}
          </ol>
        </Card>

        <Card>
          <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">O que o requerente vê</h2>
          <p className="mb-2 text-xs text-[color:var(--color-ink-2)]">
            Esta é a mesma projeção da consulta pública, pelo número {v.protocolo} e o código {p.codigoVerificador}.
            O registro interno, a prévia, o autor de cada ato e o setor não aparecem para ele.
          </p>
          <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2" data-visao-do-requerente>
            <div>
              <dt className="text-[color:var(--color-ink-2)]">Situação</dt>
              <dd className="font-semibold">{r.rotulo}</dd>
            </div>
            <div>
              <dt className="text-[color:var(--color-ink-2)]">Prazo</dt>
              <dd className="font-semibold">{r.limite ?? "sem data informada"}</dd>
            </div>
          </dl>
          {r.avisos.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs text-[color:var(--color-ink-2)]" data-avisos-ao-requerente>
              {r.avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          ) : null}
          {r.prorrogacoes.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs" data-prorrogacoes-ao-requerente>
              {r.prorrogacoes.map((x) => (
                <li key={x.em}>{x.em}: {x.mensagem}</li>
              ))}
            </ul>
          ) : null}
          {r.resposta === null ? (
            <p className="mt-2 text-xs text-[color:var(--color-ink-2)]" data-sem-resposta-ao-requerente>
              Nenhuma resposta entregue até aqui.
            </p>
          ) : (
            <p className="mt-2 text-xs" data-resposta-ao-requerente>
              {r.resposta.em}: {r.resposta.mensagem}
            </p>
          )}
        </Card>

        <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {p.podeDistribuir ? <FormDistribuir pedidoId={p.id} setores={p.setores} /> : null}
          {p.podeReceber ? <FormReceber pedidoId={p.id} /> : null}
          {p.podeProrrogar ? (
            <FormProrrogar pedidoId={p.id} motivoSeNaoPode={v.podeProrrogar.pode ? null : v.podeProrrogar.motivo} />
          ) : null}
          {p.podeResponder ? (
            <>
              <FormResponder pedidoId={p.id} entregar={false} />
              <FormResponder pedidoId={p.id} entregar />
            </>
          ) : null}
          {p.podeDecidirRecurso ? (
            <>
              <FormInterporRecurso pedidoId={p.id} motivoSeNaoPode={v.podeRecorrer.pode ? null : v.podeRecorrer.motivo} />
              <FormDecidirRecurso pedidoId={p.id} />
            </>
          ) : null}
        </section>
      </div>
    </>
  );
}
