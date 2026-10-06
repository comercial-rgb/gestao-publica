import Link from "next/link";
import { Badge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import { formatarMoeda } from "../../../../lib/format/moeda";
import { lerTelaDeEmendas, type EmendaNaTela, type TelaDeEmendas } from "../../../../lib/portas/emendas";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { acoesPermitidas } from "../../../../lib/portas/molde";
import { FormNovaEmenda, FormSancao, FormsDoBloqueio } from "./FormsDaEmenda";

/**
 * V36 — EMENDAS AO PROJETO DA LOA (TR 5.9.3.13 a 5.9.3.15). A proposta orçamentária ainda não efetivada é o projeto
 * de lei; aqui se registram as emendas da Câmara sobre as dotações dela, os bloqueios de dotação para emenda e a
 * sanção. Só a sanção muda a proposta (os itens aprovados viram ajuste da linha, citando a emenda).
 */
export const dynamic = "force-dynamic";

const CELULA = "py-1.5 pr-3";
const diaBr = (d: string): string => d.split("-").reverse().join("/");
const SITUACAO: Readonly<Record<EmendaNaTela["situacao"], { readonly texto: string; readonly status: "neutro" | "ok" | "alerta" | "erro" }>> = {
  AGUARDANDO_SANCAO: { texto: "aguardando sanção", status: "neutro" },
  APROVADA: { texto: "aprovada", status: "ok" },
  PARCIAL: { texto: "sancionada em parte", status: "alerta" },
  REJEITADA: { texto: "reprovada", status: "erro" },
};

export default async function EmendasPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
  const sp = await searchParams;
  const bruto = sp["proposta"];
  const propostaId = (Array.isArray(bruto) ? (bruto[0] ?? "") : (bruto ?? "")).trim();
  const fichaBruta = sp["ficha"];
  const fichaPedida = (Array.isArray(fichaBruta) ? (fichaBruta[0] ?? "") : (fichaBruta ?? "")).trim();
  let t: TelaDeEmendas;
  try {
    t = await lerTelaDeEmendas({ propostaId });
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo="Emendas ao orçamento" subtitulo="Emendas da Câmara ao projeto da lei orçamentária" />
        <EstadoVazio titulo="Não foi possível ler as emendas" descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."} />
      </div>
    );
  }
  const permitidas = await acoesPermitidas(["CADASTRAR_EMENDA_AO_ORCAMENTO", "SANCIONAR_EMENDA_AO_ORCAMENTO"]);
  const e = t.escolhida;
  const aberta = e !== null && !e.efetivada;
  const podeCadastrar = aberta && permitidas.has("CADASTRAR_EMENDA_AO_ORCAMENTO");
  const podeSancionar = aberta && permitidas.has("SANCIONAR_EMENDA_AO_ORCAMENTO");
  // O RECORTE: o projeto tem uma dotação por ficha (centenas). A tabela mostra as citadas em emendas, as bloqueadas e
  // a ficha consultada — nunca o projeto inteiro numa lista.
  const citadas = new Set(e?.emendas.flatMap((m) => m.itens.map((i) => i.ficha)) ?? []);
  const mostradas = e?.dotacoes.filter((d) => d.bloqueio !== null || citadas.has(d.ficha) || String(d.ficha) === fichaPedida) ?? [];
  const fichaNaoAchada = e !== null && fichaPedida !== "" && !e.dotacoes.some((d) => String(d.ficha) === fichaPedida);

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader titulo="Emendas ao orçamento" subtitulo="Emendas da Câmara ao projeto da lei orçamentária: registro, bloqueio de dotações e sanção" />

      <form className="flex flex-wrap items-end gap-3 text-xs" data-chrome method="get" aria-label="Escolher a proposta">
        <label>
          <span className="block font-semibold">Projeto (proposta orçamentária)</span>
          <select className="h-8 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2" defaultValue={propostaId} name="proposta">
            <option value="">Escolha…</option>
            {t.propostas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.exercicio} · {p.descricao}{p.efetivada ? " (efetivada)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="block font-semibold">Consultar ficha (número)</span>
          <input className="h-8 w-28 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2" defaultValue={fichaPedida} inputMode="numeric" name="ficha" />
        </label>
        <button className="h-8 rounded-[var(--radius-pilula)] bg-[color:var(--color-acao)] px-3 font-semibold text-[color:var(--color-acao-tinta)]" type="submit">Ver</button>
      </form>

      {t.propostas.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma proposta orçamentária"
          descricao="As emendas são feitas sobre o projeto da lei orçamentária, que nasce da proposta. Elabore a proposta do exercício seguinte em Proposta orçamentária."
        />
      ) : null}

      {e !== null ? (
        <>
          <Card>
            <h2 className="mb-1 text-sm font-semibold" data-proposta-escolhida={e.id}>Projeto do orçamento de {e.exercicio}</h2>
            <p className="text-xs text-[color:var(--color-ink-3)]">
              {e.efetivada
                ? "Esta proposta já foi efetivada: o orçamento existe e não recebe mais emenda nem sanção. Alterações agora são por crédito adicional."
                : "As emendas ficam aguardando sanção; só a sanção leva os valores aprovados à proposta."}{" "}
              <Link className="text-[color:var(--color-primary)] underline" href={`/planejamento/proposta-orcamentaria/${e.id}`}>Ver a proposta</Link>
            </p>
          </Card>

          <Card>
            <h2 className="mb-2 text-sm font-semibold">Emendas ({e.emendas.length})</h2>
            {e.emendas.length === 0 ? (
              <p className="text-sm text-[color:var(--color-ink-3)]">Nenhuma emenda registrada neste projeto.</p>
            ) : (
              <div className="space-y-3" data-lista="emendas">
                {e.emendas.map((m) => (
                  <article className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3" data-emenda={m.numero} key={m.id}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold">Emenda nº {m.numero} · {diaBr(m.data)} · {m.vereador}</h3>
                      <Badge status={SITUACAO[m.situacao].status}>{SITUACAO[m.situacao].texto}</Badge>
                    </div>
                    <p className="mt-1 text-xs"><strong>Objetivo:</strong> {m.objetivo}</p>
                    <p className="text-xs"><strong>Justificativa:</strong> {m.justificativa}</p>
                    <p className="text-xs whitespace-pre-line"><strong>Texto jurídico:</strong> {m.textoJuridico}</p>
                    {m.ato !== null ? <p className="text-xs"><strong>Sanção:</strong> {m.ato}{m.dataDaSancao !== null ? `, em ${diaBr(m.dataDaSancao)}` : ""}</p> : null}
                    <table className="mt-2 w-full text-xs">
                      <thead>
                        <tr className="text-left text-[color:var(--color-ink-3)]">
                          <th className={CELULA}>Ficha</th>
                          <th className={`${CELULA} text-right`}>Acréscimo ou redução</th>
                          <th className={CELULA}>Na sanção</th>
                        </tr>
                      </thead>
                      <tbody>
                        {m.itens.map((i) => (
                          <tr className="border-t border-[color:var(--color-border)]" data-item-ficha={i.ficha} key={i.id}>
                            <td className={CELULA}>{i.ficha}</td>
                            <td className={`${CELULA} text-right`}><ValorMonetario valor={i.valor} /></td>
                            <td className={CELULA}>{i.sancionado === null ? "—" : i.sancionado ? "sancionada" : "vetada"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="mt-1 text-xs text-[color:var(--color-ink-3)]">
                      Acréscimos <ValorMonetario valor={m.acrescimos} /> · reduções <ValorMonetario valor={m.reducoes} />
                      {m.acrescimos !== m.reducoes ? " · a emenda não é compensada só por reduções desta mesma emenda" : ""}
                    </p>
                    {podeSancionar ? (
                      <FormSancao sancionada={m.situacao !== "AGUARDANDO_SANCAO"} emendaId={m.id} itens={m.itens.map((i) => ({ id: i.id, rotulo: `ficha ${String(i.ficha)}: R$ ${formatarMoeda(i.valor).texto}` }))} numero={m.numero} />
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </Card>

          {podeCadastrar ? <FormNovaEmenda propostaId={e.id} /> : null}

          <Card>
            <h2 className="mb-1 text-sm font-semibold">Dotações do projeto</h2>
            <p className="mb-2 text-xs text-[color:var(--color-ink-3)]">
              O projeto tem {e.dotacoes.length} dotações. Aqui aparecem as citadas em emendas, as bloqueadas e a ficha consultada acima.
              {fichaNaoAchada ? ` A ficha ${fichaPedida} não está neste projeto.` : ""}
            </p>
            {mostradas.length === 0 ? <p className="text-sm text-[color:var(--color-ink-3)]">Nenhuma dotação citada, bloqueada ou consultada.</p> : null}
            <div className="overflow-x-auto">
              <table className="w-full text-xs" data-lista="dotacoes-do-projeto">
                <thead>
                  <tr className="text-left text-[color:var(--color-ink-3)]">
                    <th className={CELULA}>Ficha</th>
                    <th className={CELULA}>Unidade</th>
                    <th className={CELULA}>Natureza</th>
                    <th className={CELULA}>Fonte</th>
                    <th className={`${CELULA} text-right`}>Valor no projeto</th>
                    <th className={CELULA}>Emendas</th>
                  </tr>
                </thead>
                <tbody>
                  {mostradas.map((d) => (
                    <tr className="border-t border-[color:var(--color-border)]" data-ficha={d.ficha} key={d.linhaId}>
                      <td className={CELULA}>{d.ficha}</td>
                      <td className={CELULA}>{d.unidade}</td>
                      <td className={CELULA}>{d.natureza}</td>
                      <td className={CELULA}>{d.fonte}</td>
                      <td className={`${CELULA} text-right`}><ValorMonetario valor={d.vigente} /></td>
                      <td className={CELULA}>{d.bloqueio === null ? "aceita" : `bloqueada: ${d.bloqueio.motivo}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {podeCadastrar ? (
              <div className="mt-3">
                <FormsDoBloqueio
                  bloqueadas={e.dotacoes.filter((d) => d.bloqueio !== null).map((d) => ({ bloqueioId: d.bloqueio!.id, rotulo: `ficha ${String(d.ficha)} · ${d.natureza}` }))}
                  propostaId={e.id}
                />
              </div>
            ) : null}
          </Card>
        </>
      ) : null}
    </div>
  );
}
