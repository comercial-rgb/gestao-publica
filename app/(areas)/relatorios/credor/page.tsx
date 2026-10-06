import Link from "next/link";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import { EscopoDeLeituraError, ExercicioIlegivelError, recorteDePagina, type RecorteDaPagina } from "../../../../lib/portas/contexto";
import { ROTULO_DA_FASE, ROTULO_DA_SITUACAO } from "../../../../lib/portas/a-pagar";
import { credoresDoExercicio, lerFichaDoCredor, type FichaDoCredor } from "../../../../lib/portas/ficha-do-credor";
import { dataBr, descreverRecorte } from "../../../../lib/recorte";
import { formatarDocumento } from "../../../../packages/documento/index";

import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
/**
 * V36 — A FICHA DO CREDOR (TR 5.10.2.61). Numa página: os empenhos do exercício com empenhado, liquidado e pago; o que
 * está a liquidar e a pagar, do exercício e de restos; e os pagamentos efetuados no exercício, com retido e líquido.
 * Cada bloco é a leitura da tela própria dele (ver `lib/portas/ficha-do-credor.ts`), e cada um leva à tela completa
 * com o mesmo credor no filtro.
 */
export const dynamic = "force-dynamic";

const CAMPO = "h-8 w-72 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2";
const CELULA = "py-1.5 pr-3";

export default async function FichaDoCredorPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  const bruto = sp["documento"];
  const documento = (Array.isArray(bruto) ? (bruto[0] ?? "") : (bruto ?? "")).replace(/\D/g, "");
  let recorte: RecorteDaPagina;
  let credores: Awaited<ReturnType<typeof credoresDoExercicio>>;
  let ficha: FichaDoCredor | null = null;
  try {
    recorte = await recorteDePagina(sp, "CONSULTAR_DESPESA");
    const r = { exercicio: recorte.exercicio, unidadeCodigo: recorte.unidadeCodigo };
    credores = await credoresDoExercicio(r);
    if (documento !== "") ficha = await lerFichaDoCredor({ ...r, documento });
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo="Ficha do credor" subtitulo="Empenhos, valores a pagar e pagamentos de um credor" />
        <EstadoVazio
          titulo={erro instanceof EscopoDeLeituraError ? "Esta unidade não está no seu acesso" : erro instanceof ExercicioIlegivelError ? "Exercício inválido" : "Não foi possível ler o credor"}
          descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."}
        />
      </div>
    );
  }

  const comCredor = (base: string): string => {
    const q = new URLSearchParams({ exercicio: String(recorte.exercicio), credor: documento });
    if (recorte.unidadeCodigo !== undefined) q.set("ug", recorte.unidadeCodigo);
    return `${base}?${q.toString()}`;
  };

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader
        titulo="Ficha do credor"
        subtitulo={`${descreverRecorte(recorte)} — empenhos, valores a pagar e pagamentos de um credor`}
      />

      <form method="get" className="flex flex-wrap items-end gap-3 text-xs" data-chrome aria-label="Escolher o credor">
        <input type="hidden" name="exercicio" value={recorte.exercicio} />
        {recorte.unidadeCodigo !== undefined ? <input type="hidden" name="ug" value={recorte.unidadeCodigo} /> : null}
        <label>
          <span className="block font-semibold">Credor (nome ou CPF/CNPJ)</span>
          <input className={CAMPO} defaultValue={documento} list="credores-do-exercicio" name="documento" />
        </label>
        <datalist id="credores-do-exercicio">
          {credores.map((c) => (
            <option key={c.documento} value={c.documento}>
              {c.nome ?? formatarDocumento(c.documento)}
            </option>
          ))}
        </datalist>
        <button type="submit" className="h-8 rounded-[var(--radius-pilula)] bg-[color:var(--color-acao)] px-3 font-semibold text-[color:var(--color-acao-tinta)]">Abrir</button>
      </form>

      {ficha === null ? (
        <EstadoVazio
          titulo="Escolha o credor"
          descricao={`${String(credores.length)} credor(es) com empenho ou obrigação no exercício. Comece a digitar o nome ou o documento.`}
        />
      ) : (
        <Ficha ficha={ficha} comCredor={comCredor} />
      )}
    </div>
  );
}

function Ficha({ ficha, comCredor }: { readonly ficha: FichaDoCredor; readonly comCredor: (base: string) => string }): React.ReactElement {
  const obrigacoes = ficha.aPagar.credores.flatMap((c) => c.obrigacoes);
  const pg = ficha.pagamentos;
  return (
    <div className="space-y-4" data-ficha-do-credor={ficha.documento}>
      <h2 className="text-base font-semibold">
        {ficha.nome ?? "Credor sem cadastro"} <span className="font-normal text-[color:var(--color-ink-2)]">· {formatarDocumento(ficha.documento)}</span>
      </h2>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Total rotulo="Empenhado líquido" valor={ficha.totaisDosEmpenhos.empenhadoLiquido} chave="empenhado" />
        <Total rotulo="Liquidado" valor={ficha.totaisDosEmpenhos.liquidado} chave="liquidado" />
        <Total rotulo="Pago dos empenhos do exercício" valor={ficha.totaisDosEmpenhos.pago} chave="pago-empenhos" />
        <Total rotulo="A liquidar (exercício e restos)" valor={ficha.aPagar.totais.aLiquidar} chave="a-liquidar" />
        <Total rotulo="Liquidado a pagar (exercício e restos)" valor={ficha.aPagar.totais.liquidadoAPagar} chave="a-pagar" />
        <Total rotulo="Pago no exercício, líquido ao credor" valor={pg.totais.liquido} chave="liquido-pago" />
      </div>

      <Card>
        <Titulo texto={`Empenhos do exercício (${String(ficha.empenhos.length)})`} href={comCredor("/relatorios/gerenciais")} rotuloDoLink="relatório gerencial" />
        {ficha.empenhos.length === 0 ? (
          <p className="text-xs text-[color:var(--color-ink-2)]">Nenhum empenho do exercício para este credor.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" data-lista="empenhos-do-credor">
              <thead>
                <tr className="text-[color:var(--color-ink-3)]">
                  <th scope="col" className={CELULA}>Data</th>
                  <th scope="col" className={CELULA}>Empenho</th>
                  <th scope="col" className={CELULA}>Unidade</th>
                  <th scope="col" className={CELULA}>Fonte</th>
                  <th scope="col" className={CELULA}>Histórico</th>
                  <th scope="col" className={`${CELULA} text-right`}>Empenhado líquido</th>
                  <th scope="col" className={`${CELULA} text-right`}>Liquidado</th>
                  <th scope="col" className="py-1.5 text-right">Pago</th>
                </tr>
              </thead>
              <tbody>
                {ficha.empenhos.map((e) => (
                  <tr key={e.id} className="border-t border-[color:var(--color-border)]" data-empenho={e.numero}>
                    <td className={CELULA}>{dataBr(e.data)}</td>
                    <td className={CELULA}><Link className="underline" href={`/despesa/empenhos/${e.id}`}>{e.numero}</Link></td>
                    <td className={CELULA}>{e.unidadeCodigo}</td>
                    <td className={CELULA}>{e.fonteCodigo}</td>
                    <td className={CELULA}>{e.historico}</td>
                    <td className={`${CELULA} text-right`}><ValorMonetario valor={e.empenhadoLiquido} /></td>
                    <td className={`${CELULA} text-right`}><ValorMonetario valor={e.liquidado} /></td>
                    <td className="py-1.5 text-right"><ValorMonetario valor={e.pago} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <Titulo texto={`A liquidar e a pagar (${String(obrigacoes.length)})`} href={comCredor("/despesa/a-pagar")} rotuloDoLink="tela do a pagar" />
        {obrigacoes.length === 0 ? (
          <p className="text-xs text-[color:var(--color-ink-2)]">Nada a liquidar nem a pagar para este credor.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" data-lista="obrigacoes-do-credor">
              <thead>
                <tr className="text-[color:var(--color-ink-3)]">
                  <th scope="col" className={CELULA}>Empenho</th>
                  <th scope="col" className={CELULA}>Origem</th>
                  <th scope="col" className={CELULA}>Fase</th>
                  <th scope="col" className={CELULA}>Fonte</th>
                  <th scope="col" className={CELULA}>Vencimento</th>
                  <th scope="col" className="py-1.5 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {obrigacoes.map((o) => (
                  <tr key={o.chave} className="border-t border-[color:var(--color-border)]" data-obrigacao={o.fase}>
                    <td className={CELULA}><Link className="underline" href={`/despesa/empenhos/${o.empenhoId}`}>{o.empenhoNumero}</Link></td>
                    <td className={CELULA}>{o.situacao === "EXERCICIO" ? ROTULO_DA_SITUACAO[o.situacao] : `${ROTULO_DA_SITUACAO[o.situacao]} de ${String(o.exercicioOrigem)}`}</td>
                    <td className={CELULA}>{ROTULO_DA_FASE[o.fase]}</td>
                    <td className={CELULA}>{o.fonteCodigo}</td>
                    <td className={CELULA}>{o.vencimento === null ? "sem ordem" : dataBr(o.vencimento)}</td>
                    <td className="py-1.5 text-right"><ValorMonetario valor={o.saldo.toFixed(2)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <Titulo texto={`Pagamentos efetuados no exercício (${String(pg.linhas.length)})`} href={comCredor("/relatorios/pagamentos")} rotuloDoLink="relatório de pagamentos" />
        {pg.linhas.length === 0 ? (
          <p className="text-xs text-[color:var(--color-ink-2)]">Nenhum pagamento a este credor no exercício.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" data-lista="pagamentos-do-credor">
              <thead>
                <tr className="text-[color:var(--color-ink-3)]">
                  <th scope="col" className={CELULA}>Data</th>
                  <th scope="col" className={CELULA}>Nº</th>
                  <th scope="col" className={CELULA}>Origem</th>
                  <th scope="col" className={CELULA}>Empenho</th>
                  <th scope="col" className={`${CELULA} text-right`}>Pago</th>
                  <th scope="col" className={`${CELULA} text-right`}>Retido</th>
                  <th scope="col" className="py-1.5 text-right">Líquido</th>
                </tr>
              </thead>
              <tbody>
                {pg.linhas.map((l) => (
                  <tr key={l.id} className="border-t border-[color:var(--color-border)]" data-pagamento={l.numero}>
                    <td className={CELULA}>{dataBr(l.data)}</td>
                    <td className={`${CELULA} font-mono`}>{l.numero}{l.anulado ? " (anulado)" : ""}</td>
                    <td className={CELULA}>{l.origem === "RESTOS" ? `Restos a pagar de ${String(l.exercicioDaDotacao)}` : "Exercício"}</td>
                    <td className={CELULA}><Link className="underline" href={`/despesa/empenhos/${l.empenhoId}#pagamento-${l.id}`}>{l.empenhoNumero}</Link></td>
                    <td className={`${CELULA} text-right`}><ValorMonetario valor={l.pagoVivo} /></td>
                    <td className={`${CELULA} text-right`}><ValorMonetario valor={l.retido} /></td>
                    <td className="py-1.5 text-right"><ValorMonetario valor={l.liquido} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Total({ rotulo, valor, chave }: { readonly rotulo: string; readonly valor: string; readonly chave: string }): React.ReactElement {
  return (
    <Card>
      <p className="text-xs text-[color:var(--color-ink-3)]">{rotulo}</p>
      <p className="text-base font-semibold" data-total={chave}><ValorMonetario valor={valor} /></p>
    </Card>
  );
}

function Titulo({ texto, href, rotuloDoLink }: { readonly texto: string; readonly href: string; readonly rotuloDoLink: string }): React.ReactElement {
  return (
    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-sm font-semibold text-[color:var(--color-ink)]">{texto}</h3>
      <Link className="text-xs underline" href={href}>Abrir no {rotuloDoLink}</Link>
    </div>
  );
}
