import Link from "next/link";
import { Badge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import { formatarMoeda } from "../../../../lib/format/moeda";
import { lerTelaDasEmendasDoPlanejamento, type EmendaDoPlanejamentoNaTela, type TelaDasEmendasDoPlanejamento } from "../../../../lib/portas/emendas-do-planejamento";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { acoesPermitidas } from "../../../../lib/portas/molde";
import { FormNovaEmendaDoPlano, FormSancaoDoPlano, FormsDoBloqueioDoPlano } from "./FormsDaEmendaDoPlano";

/**
 * V36 — EMENDAS AO PPA E À LDO. As emendas da Câmara sobre as linhas da peça (previsões de receita, programas e ações
 * do PPA; metas fiscais da LDO), o bloqueio de linhas para emenda e a sanção. Só a sanção muda a peça: os itens
 * aprovados entram no ato de alteração da lei, que aparece em Alterações do planejamento.
 */
export const dynamic = "force-dynamic";

const CELULA = "py-1.5 pr-3";
const diaBr = (d: string): string => d.split("-").reverse().join("/");
const SITUACAO: Readonly<Record<EmendaDoPlanejamentoNaTela["situacao"], { readonly texto: string; readonly status: "neutro" | "ok" | "alerta" | "erro" }>> = {
  AGUARDANDO_SANCAO: { texto: "aguardando sanção", status: "neutro" },
  APROVADA: { texto: "aprovada", status: "ok" },
  PARCIAL: { texto: "sancionada em parte", status: "alerta" },
  REJEITADA: { texto: "reprovada", status: "erro" },
};

export default async function EmendasDoPlanoPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
  const sp = await searchParams;
  const bruto = sp["peca"];
  const peca = (Array.isArray(bruto) ? (bruto[0] ?? "") : (bruto ?? "")).trim();
  const cabecalho = <PageHeader titulo="Emendas ao PPA e à LDO" subtitulo="Emendas da Câmara ao plano plurianual e às diretrizes orçamentárias: registro, bloqueio de linhas e sanção" />;
  let t: TelaDasEmendasDoPlanejamento;
  try {
    t = await lerTelaDasEmendasDoPlanejamento({ peca });
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        {cabecalho}
        <EstadoVazio titulo="Não foi possível ler as emendas" descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."} />
      </div>
    );
  }
  const permitidas = await acoesPermitidas(["CADASTRAR_EMENDA_AO_ORCAMENTO", "SANCIONAR_EMENDA_AO_ORCAMENTO"]);
  const e = t.escolhida;
  return (
    <div className="space-y-4">
      <SincronizarContexto />
      {cabecalho}

      {e === null ? (
        <EstadoVazio titulo="Nenhum PPA ou LDO cadastrado" descricao="As emendas são feitas sobre o plano plurianual ou a lei de diretrizes. Cadastre a peça antes." />
      ) : (
        <>
          <form className="flex flex-wrap items-end gap-3 text-xs" data-chrome method="get" aria-label="Escolher a peça">
            <label>
              <span className="block font-semibold">Peça</span>
              <select className="h-8 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2" defaultValue={e.valor} name="peca">
                {t.pecas.map((p) => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
              </select>
            </label>
            <button className="h-8 rounded-[var(--radius-pilula)] bg-[color:var(--color-acao)] px-3 font-semibold text-[color:var(--color-acao-tinta)]" type="submit">Ver</button>
          </form>

          <Card>
            <h2 className="mb-1 text-sm font-semibold" data-peca-escolhida={e.valor}>{e.rotulo}</h2>
            <p className="text-xs text-[color:var(--color-ink-3)]">
              As emendas ficam aguardando sanção; só a sanção altera {e.peca === "PPA" ? "o plano" : "a LDO"}, pela lei informada na sanção.
              {e.peca === "LDO" ? " Na LDO, o que a emenda altera são as metas fiscais anuais." : ""}{" "}
              <Link className="text-[color:var(--color-primary)] underline" href={`/planejamento/alteracoes?peca=${encodeURIComponent(e.valor)}`}>Ver as alterações da peça</Link>
            </p>
          </Card>

          <Card>
            <h2 className="mb-2 text-sm font-semibold">Emendas ({e.emendas.length})</h2>
            {e.emendas.length === 0 ? (
              <p className="text-sm text-[color:var(--color-ink-3)]">Nenhuma emenda registrada nesta peça.</p>
            ) : (
              <div className="space-y-3" data-lista="emendas-do-plano">
                {e.emendas.map((m) => (
                  <article className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3" data-emenda-do-plano={m.numero} data-situacao={m.situacao} key={m.id}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold">Emenda nº {m.numero} · {diaBr(m.data)} · {m.vereador}</h3>
                      <Badge status={SITUACAO[m.situacao].status}>{SITUACAO[m.situacao].texto}</Badge>
                    </div>
                    <p className="mt-1 text-xs"><strong>Objetivo:</strong> {m.objetivo}</p>
                    <p className="text-xs"><strong>Justificativa:</strong> {m.justificativa}</p>
                    <p className="whitespace-pre-line text-xs"><strong>Texto jurídico:</strong> {m.textoJuridico}</p>
                    {m.lei !== null ? <p className="text-xs"><strong>Sanção:</strong> lei {m.lei}{m.dataDaSancao !== null ? `, em ${diaBr(m.dataDaSancao)}` : ""}</p> : null}
                    <table className="mt-2 w-full text-xs">
                      <thead>
                        <tr className="text-left text-[color:var(--color-ink-3)]">
                          <th className={CELULA}>Linha</th>
                          <th className={`${CELULA} text-right`}>Acréscimo ou redução</th>
                          <th className={CELULA}>Na sanção</th>
                        </tr>
                      </thead>
                      <tbody>
                        {m.itens.map((i) => (
                          <tr className="border-t border-[color:var(--color-border)]" key={i.id}>
                            <td className={CELULA}>{i.rotulo}</td>
                            <td className={`${CELULA} text-right`}><ValorMonetario valor={i.valor} /></td>
                            <td className={CELULA}>{i.sancionado === null ? "—" : i.sancionado ? "sancionada" : "vetada"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="mt-1 text-xs text-[color:var(--color-ink-3)]">
                      Acréscimos <ValorMonetario valor={m.acrescimos} /> · reduções <ValorMonetario valor={m.reducoes} />
                    </p>
                    {permitidas.has("SANCIONAR_EMENDA_AO_ORCAMENTO") ? (
                      <FormSancaoDoPlano sancionada={m.situacao !== "AGUARDANDO_SANCAO"} emendaId={m.id} itens={m.itens.map((i) => ({ id: i.id, rotulo: `${i.rotulo}: R$ ${formatarMoeda(i.valor).texto}` }))} numero={m.numero} />
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </Card>

          {permitidas.has("CADASTRAR_EMENDA_AO_ORCAMENTO") ? <FormNovaEmendaDoPlano linhas={e.linhas} peca={e.valor} /> : null}

          <Card>
                <h2 className="mb-1 text-sm font-semibold">Linhas bloqueadas para emendas ({e.bloqueios.length})</h2>
                {e.bloqueios.length === 0 ? (
                  <p className="text-xs text-[color:var(--color-ink-3)]">Nenhuma linha bloqueada.</p>
                ) : (
                  <ul className="text-xs" data-lista="bloqueios-do-plano">
                    {e.bloqueios.map((b) => <li key={b.id}>{b.rotulo}: {b.motivo}</li>)}
                  </ul>
                )}
                {permitidas.has("CADASTRAR_EMENDA_AO_ORCAMENTO") ? (
                  <div className="mt-3">
                    <FormsDoBloqueioDoPlano bloqueadas={e.bloqueios.map((b) => ({ id: b.id, rotulo: b.rotulo }))} linhas={e.linhas} />
                  </div>
                ) : null}
              </Card>
        </>
      )}
    </div>
  );
}
