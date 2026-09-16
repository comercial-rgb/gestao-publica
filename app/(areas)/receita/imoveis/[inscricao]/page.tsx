import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "../../../../../components/ui/Badge";
import { Card } from "../../../../../components/ui/Card";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import { AvisosDosAtos, ResultadosDosAtos } from "../../../../../components/ui/ResultadosDosAtos";
import { imovelParaTela, simularNaTela } from "../../../../../lib/portas/cadastro-imobiliario";
import { qtdBr } from "../../../../../lib/format/quantidade";
import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
import { exigirLeitura } from "../../../../../lib/portas/molde";
import { FormEncerrarVinculo, FormNovaVersao, FormVincularPessoa } from "../FormulariosDoImovel";

/**
 * O IMÓVEL (V7 B1) — as versões do cadastro, os vínculos com a Pessoa e a SIMULAÇÃO com memória.
 *
 * ⚠️ A simulação é LEITURA: ela vem pela URL (`GET`), não grava nada, não lança tributo, não constitui dívida e não
 * escreve no ledger. O que ela mostra é a conta que a tabela do ente produz para a versão do cadastro daquele dia.
 */
export const dynamic = "force-dynamic";

const USO: Readonly<Record<string, string>> = { RESIDENCIAL: "residencial", COMERCIAL: "comercial", INDUSTRIAL: "industrial", TERRITORIAL: "territorial", MISTO: "misto", OUTRO: "outro" };
const PAPEL: Readonly<Record<string, string>> = { PROPRIETARIO: "proprietário", COMPROMISSARIO: "compromissário", POSSUIDOR: "possuidor", RESPONSAVEL_TRIBUTARIO: "responsável tributário" };
const TRIBUTOS = ["IPTU", "ITBI", "ISS", "TAXA"] as const;
const br = (dia: string): string => dia.split("-").reverse().join("/");

export default async function ImovelPage({ params, searchParams }: { readonly params: Promise<{ readonly inscricao: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_RECEITA");
  const { inscricao } = await params;
  const q = await searchParams;
  const texto = (k: string): string => (typeof q[k] === "string" ? (q[k] as string) : "");
  const i = await imovelParaTela(decodeURIComponent(inscricao));
  if (i === null) notFound();
  const tributo = (TRIBUTOS as readonly string[]).includes(texto("tributo")) ? texto("tributo") : "IPTU";
  const exercicio = /^\d{4}$/.test(texto("exercicio")) ? Number(texto("exercicio")) : i.exercicio;
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(texto("dia")) ? texto("dia") : "";
  const simular = texto("simular") === "1";
  let resultado: Awaited<ReturnType<typeof simularNaTela>> | null = null;
  let recusa: string | null = null;
  if (simular) {
    try {
      resultado = await simularNaTela(i.id, tributo, exercicio, dia);
    } catch (e) {
      recusa = mensagemDoErro(e, "Não foi possível simular.");
    }
  }
  const atual = i.versoes[0];
  return (
    <ResultadosDosAtos>
      <div className="space-y-4" data-imovel-pagina={i.inscricao}>
        <nav aria-label="Trilha" className="text-xs text-[color:var(--color-ink-2)]">
          <Link href="/receita/imoveis" className="underline underline-offset-2">Cadastro imobiliário</Link> / {i.inscricao}
        </nav>
        <header>
          <h1 className="text-xl font-semibold">Imóvel {i.inscricao}</h1>
          {atual === undefined ? null : <p className="mt-1 text-sm text-[color:var(--color-ink-2)] [overflow-wrap:anywhere]">{atual.endereco} — {atual.bairro}{atual.zona === null ? "" : ` · ${atual.zona}`} · {USO[atual.uso] ?? atual.uso}</p>}
        </header>
        <AvisosDosAtos />

        <Card>
          <h2 className="mb-2 text-sm font-semibold">Versões do cadastro</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-left text-sm" data-versoes-do-imovel={i.versoes.length}>
              <thead><tr className="text-xs text-[color:var(--color-ink-2)]"><th className="py-1 pr-2">Versão</th><th className="py-1 pr-2">Vale desde</th><th className="py-1 pr-2">Endereço</th><th className="py-1 pr-2">Uso</th><th className="py-1 pr-2 text-right">Terreno (m²)</th><th className="py-1 pr-2 text-right">Construída (m²)</th><th className="py-1">Atributos e motivo</th></tr></thead>
              <tbody>
                {i.versoes.map((v) => (
                  <tr key={v.id} data-versao-do-imovel={v.versao} className="border-t border-[color:var(--color-border)] align-top">
                    <td className="py-2 pr-2">{v.versao}</td>
                    <td className="py-2 pr-2">{br(v.vigenciaInicio)}</td>
                    <td className="py-2 pr-2 [overflow-wrap:anywhere]">{v.endereco} — {v.bairro}</td>
                    <td className="py-2 pr-2">{USO[v.uso] ?? v.uso}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{qtdBr(v.areaDoTerreno)}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{qtdBr(v.areaConstruida)}</td>
                    <td className="py-2 text-xs [overflow-wrap:anywhere]">{v.atributos.length === 0 ? "" : <span className="block">{v.atributos.map((a) => `${a.chave} = ${a.valor}`).join(" · ")}</span>}{v.motivo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {i.podeCadastrar && atual !== undefined ? <FormNovaVersao imovelId={i.id} atual={{ logradouro: atual.endereco.split(",")[0] ?? "", numero: (atual.endereco.split(",")[1] ?? "").trim(), bairro: atual.bairro, zona: atual.zona, uso: atual.uso, padraoConstrutivo: atual.padraoConstrutivo, areaDoTerreno: atual.areaDoTerreno, areaConstruida: atual.areaConstruida, fracaoIdeal: atual.fracaoIdeal }} hoje={i.hoje} /> : null}
        </Card>

        <Card>
          <h2 className="mb-2 text-sm font-semibold">Pessoas vinculadas</h2>
          {i.vinculos.length === 0 ? <p className="text-sm text-[color:var(--color-ink-2)]" data-sem-vinculos>Nenhuma pessoa vinculada. Sem vínculo, a simulação não tem a quem atribuir o valor.</p> : (
            <ul className="space-y-2 text-sm" data-vinculos-do-imovel={i.vinculos.length}>
              {i.vinculos.map((v) => (
                <li key={v.id} data-vinculo={v.id} className="border-t border-[color:var(--color-border)] pt-2 first:border-t-0 first:pt-0">
                  <p>
                    {PAPEL[v.papel] ?? v.papel} · {v.pessoa.nome} ({v.pessoa.documento}) · fração {v.fracao} · desde {br(v.vigenciaInicio)}{" "}
                    {v.encerrado === null ? <Badge status="ok">vigente</Badge> : <Badge status="neutro">encerrado em {br(v.encerrado.dataEfeito)}</Badge>}
                  </p>
                  <p className="text-xs text-[color:var(--color-ink-2)] [overflow-wrap:anywhere]">{v.motivo}{v.encerrado === null ? "" : ` · encerramento: ${v.encerrado.motivo}`}</p>
                  {v.encerrado === null && i.podeCadastrar ? <FormEncerrarVinculo vinculoId={v.id} rotulo={`${PAPEL[v.papel] ?? v.papel} ${v.pessoa.nome}`} hoje={i.hoje} /> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
        {i.podeCadastrar ? <FormVincularPessoa imovelId={i.id} hoje={i.hoje} /> : null}

        <Card>
          <h2 className="mb-1 text-sm font-semibold">Simulação</h2>
          <p className="mb-2 text-xs text-[color:var(--color-ink-2)]">A simulação usa a versão do cadastro e a tabela de parâmetros que valem no dia escolhido. Ela <strong>não lança o tributo, não constitui dívida e não grava nada</strong>.</p>
          <form method="get" className="flex flex-wrap items-end gap-2" data-form-de-simulacao>
            <input type="hidden" name="simular" value="1" />
            <label className="text-xs text-[color:var(--color-ink-2)]"><span className="mb-1 block font-medium text-[color:var(--color-ink)]">Tributo</span>
              <select name="tributo" defaultValue={tributo} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-2 py-1 text-sm">
                {TRIBUTOS.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </label>
            <label className="text-xs text-[color:var(--color-ink-2)]"><span className="mb-1 block font-medium text-[color:var(--color-ink)]">Exercício</span>
              <input name="exercicio" defaultValue={String(exercicio)} inputMode="numeric" className="w-24 rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-2 py-1 text-sm" />
            </label>
            <label className="text-xs text-[color:var(--color-ink-2)]"><span className="mb-1 block font-medium text-[color:var(--color-ink)]">Dia (opcional; padrão 1º de janeiro)</span>
              <input name="dia" type="date" defaultValue={dia} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-2 py-1 text-sm" />
            </label>
            <button type="submit" className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-3 py-1 text-sm">Simular</button>
          </form>
          {recusa === null ? null : <p role="alert" className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]" data-recusa-da-simulacao>{recusa}</p>}
          {resultado === null ? null : (
            <div className="mt-3" data-resultado-da-simulacao={resultado.valor}>
              <p className="text-sm">Valor simulado: <strong><ValorMonetario valor={resultado.valor} comSimbolo /></strong> · {tributo} {exercicio} · cadastro na versão {resultado.imovel.versao} (desde {br(resultado.imovel.vigenciaInicio)}) · tabela versão {resultado.tabela.versao} (desde {br(resultado.tabela.vigenciaInicio)})</p>
              <p className="mt-1 text-xs text-[color:var(--color-ink-2)] [overflow-wrap:anywhere]">Fundamento: {resultado.tabela.fundamento} · fórmula: <span className="font-mono">{resultado.tabela.formula}</span></p>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[32rem] text-left text-xs" data-memoria-da-simulacao={resultado.memoria.length}>
                  <caption className="sr-only">Memória do cálculo: cada variável usada, o seu valor e de onde ele veio</caption>
                  <thead><tr className="text-[color:var(--color-ink-2)]"><th className="py-1 pr-2">Variável</th><th className="py-1 pr-2 text-right">Valor</th><th className="py-1">Origem</th></tr></thead>
                  <tbody>
                    {resultado.memoria.map((m) => (
                      <tr key={m.nome} className="border-t border-[color:var(--color-border)]"><td className="py-1 pr-2 font-mono">{m.nome}</td><td className="py-1 pr-2 text-right tabular-nums">{m.valor}</td><td className="py-1">{m.origem}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {resultado.responsaveis.length === 0 ? null : (
                <ul className="mt-2 text-xs" data-responsaveis-da-simulacao={resultado.responsaveis.length}>
                  {resultado.responsaveis.map((r) => <li key={`${r.documento}-${r.papel}`}>{PAPEL[r.papel] ?? r.papel} {r.nome} ({r.documento}) · fração {r.fracao} · proporcional <ValorMonetario valor={r.valorProporcional} comSimbolo /></li>)}
                </ul>
              )}
              {resultado.avisos.length === 0 ? null : <ul className="mt-2 list-disc pl-5 text-xs" data-avisos-da-simulacao>{resultado.avisos.map((x) => <li key={x}>{x}</li>)}</ul>}
              <p className="mt-2 text-xs text-[color:var(--color-ink-2)]">Esta simulação não foi gravada: nenhum lançamento, nenhuma dívida e nenhum registro contábil saem daqui.</p>
            </div>
          )}
        </Card>
      </div>
    </ResultadosDosAtos>
  );
}
