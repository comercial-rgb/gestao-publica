import Link from "next/link";
import { Card } from "../../../../../components/ui/Card";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";

type Encargos = Awaited<ReturnType<typeof import("../../../../../lib/portas/recursos/encargos-dados").lerEncargosDaFolha>>;

const ROTULO_DA_SITUACAO: Readonly<Record<string, string>> = {
  NAO_APLICAVEL: "não aplicável",
  PARAMETRO_AUSENTE: "sem parâmetro",
  CALCULADO: "calculado",
  ZERO_CALCULADO: "zero calculado",
};
const ROTULO_DO_ATESTO: Readonly<Record<string, string>> = { PENDENTE: "Pendente de atesto", CERTIFICADA: "Certificada", DEVOLVIDA: "Devolvida", SUPERADA: "Superada" };

/**
 * OS ENCARGOS DO EMPREGADOR NA FOLHA (V6.2 U1) — a apuração vigente, o universo, o comparativo, o
 * atesto próprio e os empenhos.
 *
 * ⚠️ QUATRO DIMENSÕES SEPARADAS da folha salarial: apuração, atesto, empenho e liquidação dos
 * encargos. O painel nunca diz "encargos certificados" por causa do atesto da folha, e nunca soma o
 * patronal ao líquido do servidor.
 */
export function EncargosDaFolha({ encargos }: { readonly encargos: Encargos }): React.ReactElement {
  const v = encargos.vigente;
  if (v === null) {
    return (
      <Card>
        <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Encargos do empregador</h2>
        <p data-encargos="nao-apurados" className="text-xs text-[color:var(--color-ink-2)]">
          Os encargos desta competência ainda não foram apurados. O empenho dos encargos depende da apuração.
        </p>
      </Card>
    );
  }
  const sintetica = v.itens.some((i) => i.sintetica);
  return (
    <Card>
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Encargos do empregador — apuração nº {v.numero}</h2>
      <div data-encargos="apurados" data-completa={v.completa ? "sim" : "nao"} data-complementar={v.complementar ? "sim" : "nao"} className="mb-3 space-y-1 text-xs text-[color:var(--color-ink-2)]">
        <p>
          Apurada em {v.apuradaEm} por {v.apuradaPor}. Total do ente <strong><ValorMonetario valor={v.total} comSimbolo /></strong>, de responsabilidade
          do empregador, sem desconto do servidor e sem reflexo no contracheque. Atesto dos encargos: <strong data-atesto-dos-encargos={v.situacao}>{ROTULO_DO_ATESTO[v.situacao] ?? v.situacao}</strong>.
        </p>
        {v.complementar ? <p className="font-medium text-[color:var(--color-ink)]">Apuração complementar: a folha já estava atestada quando os encargos foram apurados, e aquele atesto não abrange estes valores.</p> : null}
        {!v.completa ? <p role="status" className="font-medium text-[color:var(--color-status-erro-fg)]">Apuração incompleta: há componente aplicável sem parâmetro aprovado. Enquanto isso, a apuração não pode ser certificada nem empenhada.</p> : null}
        {sintetica ? <p className="font-medium">Há versão sintética (de teste) nesta apuração; os valores não têm validade normativa.</p> : null}
        <p>Universo esperado: {v.esperados} combinação(ões) de vínculo e componente aplicáveis. Código de verificação da apuração: <span className="break-all">{v.sha256}</span></p>
      </div>
      <div className="overflow-x-auto">
        <table data-tabela="encargos-por-componente" className="w-full min-w-[40rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[color:var(--color-border)] text-[11px] uppercase tracking-wide text-[color:var(--color-ink-3)]">
              <th scope="col" className="py-2 pr-3 text-left">Componente</th>
              <th scope="col" className="py-2 pr-3 text-left">Regime</th>
              <th scope="col" className="py-2 pr-3 text-right">Calculados</th>
              <th scope="col" className="py-2 pr-3 text-right">Zero</th>
              <th scope="col" className="py-2 pr-3 text-right">Sem parâmetro</th>
              <th scope="col" className="py-2 pr-3 text-right">Não aplicáveis</th>
              <th scope="col" className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {v.porComponente.map((p) => (
              <tr key={p.codigo} data-componente={p.codigo} className="border-b border-[color:var(--color-border)]">
                <td className="py-2 pr-3">{p.codigo} — {p.descricao}</td>
                <td className="py-2 pr-3">{p.regime}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{p.calculados}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{p.zeros}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{p.ausentes}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{p.naoAplicaveis}</td>
                <td className="py-2 text-right"><ValorMonetario valor={p.total} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-[color:var(--color-ink)]">Memória por vínculo e componente ({v.itens.length} linha(s))</summary>
        <div className="mt-2 overflow-x-auto">
          <table data-tabela="memoria-dos-encargos" className="w-full min-w-[48rem] border-collapse">
            <thead>
              <tr className="border-b border-[color:var(--color-border)] text-[11px] uppercase tracking-wide text-[color:var(--color-ink-3)]">
                <th scope="col" className="py-1 pr-2 text-left">Matrícula</th>
                <th scope="col" className="py-1 pr-2 text-left">Componente</th>
                <th scope="col" className="py-1 pr-2 text-left">Situação</th>
                <th scope="col" className="py-1 pr-2 text-left">Base (rubricas)</th>
                <th scope="col" className="py-1 pr-2 text-right">Alíquota</th>
                <th scope="col" className="py-1 pr-2 text-right">Valor</th>
                <th scope="col" className="py-1 text-left">Fundamento / motivo</th>
              </tr>
            </thead>
            <tbody>
              {v.itens.map((i) => (
                <tr key={`${i.matricula}-${i.componente}`} data-situacao-do-encargo={i.situacao} className="border-b border-[color:var(--color-border)]">
                  <td className="py-1 pr-2 tabular-nums">{i.matricula}</td>
                  <td className="py-1 pr-2">{i.componente}</td>
                  <td className="py-1 pr-2">{ROTULO_DA_SITUACAO[i.situacao] ?? i.situacao}</td>
                  <td className="py-1 pr-2">{i.base === "" ? "—" : `${i.base}${i.tetoAplicado ? " (teto)" : ""} = ${i.rubricas}`}</td>
                  <td className="py-1 pr-2 text-right">{i.aliquota || "—"}</td>
                  <td className="py-1 pr-2 text-right">{i.valor === "" ? "—" : <ValorMonetario valor={i.valor} />}</td>
                  <td className="py-1 break-words [overflow-wrap:anywhere]">{i.motivo || i.fundamentacao}{i.sintetica ? " (sintética)" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      {encargos.comparativo.length > 0 ? (
        <div data-comparativo className="mt-3 text-xs">
          <h3 className="mb-1 font-semibold text-[color:var(--color-ink)]">Comparativo com a apuração anterior</h3>
          <ul className="space-y-0.5">
            {encargos.comparativo.map((c) => (
              <li key={c.codigo}>{c.codigo}: {c.anterior} → {c.vigente} (diferença {c.diferenca})</li>
            ))}
          </ul>
        </div>
      ) : null}
      {encargos.atestos.length > 0 ? (
        <div className="mt-3 text-xs">
          <h3 className="mb-1 font-semibold text-[color:var(--color-ink)]">Atestos dos encargos</h3>
          <ul className="space-y-0.5">
            {encargos.atestos.map((a) => (
              <li key={a.id}>Apuração nº {a.apuracao}: {a.tipo === "CERTIFICACAO" ? "certificada" : "devolvida"} em {a.quando} por {a.responsavel}{a.motivo !== null ? ` — ${a.motivo}` : ""}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {encargos.empenhos.length > 0 ? (
        <div className="mt-3 text-xs">
          <h3 className="mb-1 font-semibold text-[color:var(--color-ink)]">Empenhos dos encargos</h3>
          <ul className="space-y-0.5">
            {encargos.empenhos.map((e) => (
              <li key={e.empenhoId} data-empenho-dos-encargos={e.numero} data-liquidacao={e.liquidacao === null ? "pendente" : "liquidado"}>
                <Link href={`/despesa/empenhos/${e.empenhoId}`} className="underline underline-offset-2">{e.numero}</Link> — grupo {e.grupo}, apuração nº {e.apuracao}, <ValorMonetario valor={e.valor} comSimbolo /> ·{" "}
                {e.liquidacao === null ? "liquidação pendente" : `liquidado em ${e.liquidacao.data}`}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[color:var(--color-ink-3)]">A liquidação não corresponde ao recolhimento: a guia e o pagamento dos encargos são registrados à parte.</p>
        </div>
      ) : null}
    </Card>
  );
}
