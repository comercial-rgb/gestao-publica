import { BotaoCsv } from "../../../../../components/ui/BotaoCsv";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import { paraCsv } from "../../../../../lib/csv/csv";
import { formatarMoeda } from "../../../../../lib/format/moeda";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";
import {
  FONTE_NAO_IDENTIFICADA,
  gerarBalancetePorFonte,
  PortaSemBancoError,
  SEM_FONTE,
  type LinhaPorFonte,
} from "../../../../../lib/portas/livros";
import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
import { lerPeriodo } from "../periodo";

/**
 * V36 — BALANCETE ANALÍTICO POR FONTE DE RECURSOS. Cada conta do razão partida pela fonte do fato que a
 * movimentou. A regra é do M12 (`modules/m12-relatorios/balancete-por-fonte.ts`). Formulário GET: o recorte
 * mora na URL, e a página não grava nada.
 */
export const dynamic = "force-dynamic";

const umString = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));
const campo = "h-8 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 text-sm text-[color:var(--color-ink)]";
const celula = "border-b border-[color:var(--color-border)] px-2 py-1.5";
const num = `${celula} text-right tabular-nums`;

type Resumo = Omit<LinhaPorFonte, "conta">;

export default async function BalancetePorFontePage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_RELATORIOS");
  const sp = await searchParams;
  const { desde, ate, desdeStr, ateStr } = lerPeriodo(sp);
  const contas = umString(sp["contas"]).slice(0, 400);
  const fontes = umString(sp["fontes"]).slice(0, 400);
  const visao = umString(sp["visao"]) === "fonte" ? "fonte" : "conta";
  const exercicio = umString(sp["exercicio"]);

  const formulario = (
    <form method="get" className="flex flex-wrap items-end gap-3" data-chrome data-form-balancete-por-fonte>
      {/^\d{4}$/.test(exercicio) ? <input type="hidden" name="exercicio" value={exercicio} /> : null}
      <label className="flex flex-col gap-0.5 text-xs text-[color:var(--color-ink-2)]">
        De
        <input type="date" name="desde" defaultValue={desdeStr} className={campo} />
      </label>
      <label className="flex flex-col gap-0.5 text-xs text-[color:var(--color-ink-2)]">
        Até
        <input type="date" name="ate" defaultValue={ateStr} className={campo} />
      </label>
      <label className="flex flex-col gap-0.5 text-xs text-[color:var(--color-ink-2)]">
        Contas (início do código, uma ou mais, separadas por vírgula)
        <input type="text" name="contas" defaultValue={contas} placeholder="1.1.1, 6.2.1" className={`${campo} w-64`} />
      </label>
      <label className="flex flex-col gap-0.5 text-xs text-[color:var(--color-ink-2)]">
        Fontes (código, uma ou mais, separadas por vírgula)
        <input type="text" name="fontes" defaultValue={fontes} placeholder="500, 540" className={`${campo} w-48`} />
      </label>
      <label className="flex flex-col gap-0.5 text-xs text-[color:var(--color-ink-2)]">
        Organizar por
        <select name="visao" defaultValue={visao} className={campo}>
          <option value="conta">Conta, com as fontes de cada uma</option>
          <option value="fonte">Fonte, com as contas de cada uma</option>
        </select>
      </label>
      <button type="submit" className="h-8 rounded-[var(--radius-pilula)] bg-[color:var(--color-acao)] px-3 text-sm font-medium text-[color:var(--color-acao-tinta)] hover:bg-[color:var(--color-acao-hover)]">
        Emitir
      </button>
    </form>
  );
  const cabecalho = <PageHeader titulo="Balancete por Fonte de Recursos" subtitulo="Saldo anterior, movimento e saldo final de cada conta, separados pela fonte de recursos" />;

  let dados: Awaited<ReturnType<typeof gerarBalancetePorFonte>>;
  try {
    dados = await gerarBalancetePorFonte({ desde, ate, contas, fontes });
  } catch (erro) {
    return (
      <div className="space-y-4">
        {cabecalho}
        {formulario}
        <EstadoVazio titulo={erro instanceof PortaSemBancoError ? "Serviço indisponível" : "Não foi possível gerar o balancete por fonte"} descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."} />
      </div>
    );
  }

  const nomeDaFonte = (f: string): string =>
    f === SEM_FONTE
      ? "Sem fonte (fato sem recurso financeiro, como encerramento ou depreciação)"
      : f === FONTE_NAO_IDENTIFICADA
        ? "Fonte não identificada (lançamento sem documento de origem)"
        : `${f} — ${dados.descricoes.get(f) ?? "fonte sem cadastro"}`;

  const linhas =
    visao === "fonte"
      ? [...dados.linhas].sort((a, b) => {
          const ordem = (f: string): number => dados.resumo.findIndex((r) => r.fonte === f);
          return ordem(a.fonte) - ordem(b.fonte) || a.conta.localeCompare(b.conta);
        })
      : dados.linhas;

  const valores = (l: Resumo): readonly string[] => [l.saldoAnteriorDevedor, l.saldoAnteriorCredor, l.movimentoDebito, l.movimentoCredito, l.saldoFinalDevedor, l.saldoFinalCredor];
  const csv = paraCsv(
    ["Conta", "Fonte", "Saldo anterior devedor", "Saldo anterior credor", "Débito", "Crédito", "Saldo final devedor", "Saldo final credor"],
    linhas.map((l) => [l.conta, nomeDaFonte(l.fonte), ...valores(l).map((v) => formatarMoeda(v).texto)])
  );
  const cabecalhoDaTabela = (primeira: string, segunda: string | null): React.ReactElement => (
    <thead>
      <tr className="text-xs uppercase tracking-wide text-[color:var(--color-ink-2)]">
        <th scope="col" className={celula}>{primeira}</th>
        {segunda !== null ? <th scope="col" className={celula}>{segunda}</th> : null}
        <th scope="col" className={`${celula} text-right`}>Saldo anterior devedor</th>
        <th scope="col" className={`${celula} text-right`}>Saldo anterior credor</th>
        <th scope="col" className={`${celula} text-right`}>Débito</th>
        <th scope="col" className={`${celula} text-right`}>Crédito</th>
        <th scope="col" className={`${celula} text-right`}>Saldo final devedor</th>
        <th scope="col" className={`${celula} text-right`}>Saldo final credor</th>
      </tr>
    </thead>
  );

  return (
    <div className="space-y-4">
      {cabecalho}
      {formulario}
      <p className="text-xs text-[color:var(--color-ink-2)]">
        O razão não guarda a fonte em cada lançamento: ela vem do documento que gerou o lançamento (a arrecadação, a ficha do empenho, a conta bancária do pagamento). Somadas as fontes, cada conta volta ao valor do balancete de verificação.
      </p>
      {dados.lancamentosSemFonteIdentificada > 0 ? (
        <p className="text-xs text-[color:var(--color-ink-2)]" data-sem-fonte-identificada>
          {dados.lancamentosSemFonteIdentificada} lançamento(s) das contas listadas não têm documento de origem com fonte e aparecem como fonte não identificada.
        </p>
      ) : null}

      {linhas.length === 0 ? (
        <EstadoVazio titulo="Sem contas com saldo ou movimento" descricao="Nenhuma conta das escolhidas tem saldo ou movimento nas fontes escolhidas, no período." />
      ) : (
        <>
          <div className="flex justify-end">
            <BotaoCsv csv={csv} nomeArquivo={`balancete-por-fonte-${desdeStr}-a-${ateStr}.csv`} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" data-tabela-balancete-por-fonte>
              {visao === "fonte" ? cabecalhoDaTabela("Fonte", "Conta") : cabecalhoDaTabela("Conta", "Fonte")}
              <tbody>
                {linhas.map((l) => (
                  <tr key={`${l.conta}/${l.fonte}`} data-linha-conta={l.conta} data-linha-fonte={l.fonte}>
                    {visao === "fonte" ? (
                      <>
                        <td className={celula}>{nomeDaFonte(l.fonte)}</td>
                        <td className={`${celula} font-mono text-xs`}>{l.conta}</td>
                      </>
                    ) : (
                      <>
                        <td className={`${celula} font-mono text-xs`}>{l.conta}</td>
                        <td className={celula}>{nomeDaFonte(l.fonte)}</td>
                      </>
                    )}
                    {valores(l).map((v, i) => (
                      <td key={i} className={num}><ValorMonetario valor={v} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="text-sm font-semibold">Resumo por fonte</h2>
          <p className="text-xs text-[color:var(--color-ink-2)]">
            O código de fonte do cadastro é o da especificação (três dígitos); o resumo por fonte é, por isso, também o resumo por especificação.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" data-resumo-por-fonte>
              {cabecalhoDaTabela("Fonte", null)}
              <tbody>
                {dados.resumo.map((r) => (
                  <tr key={r.fonte} data-resumo-fonte={r.fonte}>
                    <td className={celula}>{nomeDaFonte(r.fonte)}</td>
                    {valores(r).map((v, i) => (
                      <td key={i} className={num}><ValorMonetario valor={v} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
