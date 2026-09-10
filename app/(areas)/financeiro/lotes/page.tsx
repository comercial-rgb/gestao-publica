import { Badge } from "../../../../components/ui/Badge";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { possiveisSignatarios } from "../../../../lib/portas/assinatura-despesa";
import {
  contasComSaldo,
  itensDoBordero,
  lotes,
  ordensDisponiveisParaLote,
  PortaSemBancoError,
} from "../../../../lib/portas/tesouraria";
import {
  FormCriarLote,
  FormFechar,
  FormGerarBordero,
  FormIncluir,
  FormRetorno,
} from "./FormsDoLote";

/**
 * LOTE DE PAGAMENTO, BORDERÔ E RETORNO — a segunda metade do primeiro percurso.
 *
 * ⚠️ O LOTE AGRUPA, NÃO PAGA. Ele reúne `OrdemDePagamento` já autorizadas; quem paga
 * continua sendo o M05. Ele não é uma segunda rota que escape dos guards do pagamento —
 * e é por isso que a ORDEM CRONOLÓGICA é conferida aqui, na inclusão, contra a mesma fila
 * que o pagamento individual consulta.
 *
 * ⚠️ E O ENVIO AO BANCO É INDISPONÍVEL, com motivo. Não há convênio bancário configurado;
 * `enviarBordero` RECUSA em vez de gravar um "enviado" local que pareceria transmissão na
 * tela enquanto o dinheiro não saiu. Por isso esta tela não oferece o botão.
 */
export const dynamic = "force-dynamic";

export default async function LotesPage(): Promise<React.ReactElement> {
  const cabecalho = (
    <PageHeader
      titulo="Lotes de pagamento e borderô"
      subtitulo="Agrupar ordens autorizadas, fechar, gerar o borderô assinável e baixar pelo retorno do banco"
    />
  );

  try {
    const [contas, lista, ordens, signatarios] = await Promise.all([
      contasComSaldo(new Date().toISOString().slice(0, 10)),
      lotes(),
      ordensDisponiveisParaLote(),
      possiveisSignatarios(),
    ]);

    const exercicio = new Date().getFullYear();

    return (
      <div className="space-y-6">
        {cabecalho}

        <FormCriarLote
          contas={contas.map((c) => ({ id: c.id, codigo: c.codigo, descricao: c.descricao }))}
          exercicio={exercicio}
        />

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">Lotes</h2>
          {lista.length === 0 ? (
            <EstadoVazio
              titulo="Nenhum lote"
              descricao="Crie o primeiro lote acima e inclua nele as ordens de pagamento já autorizadas."
            />
          ) : (
            <div className="grid gap-3">
              {await Promise.all(
                lista.map(async (l) => {
                  const itens =
                    l.borderoId === null ? [] : await itensDoBordero(l.borderoId);
                  return (
                    <article
                      key={l.id}
                      data-lote={l.numero}
                      className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-1)] p-4"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="text-sm font-semibold text-[color:var(--color-ink)]">
                          Lote {l.numero} — conta {l.contaCodigo}
                        </h3>
                        <span data-estado-lote={l.estado}>
                          <Badge
                            status={
                              l.estado === "CANCELADO"
                                ? "erro"
                                : l.estado === "FECHADO"
                                  ? "neutro"
                                  : "ok"
                            }
                          >
                            {l.estado.toLowerCase()}
                          </Badge>
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-[color:var(--color-ink-2)]">
                        vencimento {l.vencimento} · {l.itens} item(ns) ·{" "}
                        <span data-total-lote={l.numero} className="tabular-nums">
                          {l.total}
                        </span>
                      </p>

                      {l.estado === "ABERTO" ? (
                        <>
                          <FormIncluir loteId={l.id} ordens={ordens} />
                          <FormFechar loteId={l.id} />
                        </>
                      ) : null}

                      {l.estado === "FECHADO" && l.borderoId === null ? (
                        <FormGerarBordero loteId={l.id} signatarios={signatarios} />
                      ) : null}

                      {l.borderoId === null ? null : (
                        <div className="mt-3 border-t border-[color:var(--color-border)] pt-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold">Borderô</span>
                            <span data-bordero-assinado={l.borderoAssinado ? "sim" : "nao"}>
                              <Badge status={l.borderoAssinado ? "ok" : "alerta"}>
                                {l.borderoAssinado
                                  ? "todas as assinaturas colhidas"
                                  : "aguardando assinatura"}
                              </Badge>
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-[color:var(--color-ink-2)]">
                            O envio ao banco está indisponível: não há convênio bancário
                            configurado. O borderô é assinável e baixável; a transmissão
                            não é simulada.
                          </p>
                          <ul className="mt-2 space-y-1 text-xs">
                            {itens.map((i) => (
                              <li
                                key={i.id}
                                data-item-bordero={i.id}
                                className="flex flex-wrap justify-between gap-2"
                              >
                                <span>{i.descricao}</span>
                                <span className="flex items-center gap-2">
                                  <span className="tabular-nums">{i.valor}</span>
                                  <Badge status={i.baixado ? "ok" : "neutro"}>
                                    {i.baixado ? "baixado" : "em aberto"}
                                  </Badge>
                                </span>
                              </li>
                            ))}
                          </ul>
                          <FormRetorno borderoId={l.borderoId} itens={itens} />
                        </div>
                      )}
                    </article>
                  );
                })
              )}
            </div>
          )}
        </section>
      </div>
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          {cabecalho}
          <EstadoVazio
            titulo="Banco de dados indisponível"
            descricao="O lote agrupa ordens que vivem no banco. Sem ele, esta tela não tem o que mostrar."
          />
        </div>
      );
    }
    throw e;
  }
}
