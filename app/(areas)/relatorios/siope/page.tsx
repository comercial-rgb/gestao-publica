import { Card, CardEstatistica } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { BotaoCsvDasTabelas } from "../../../../components/ui/BotaoCsvDasTabelas";
import { BotaoImprimir } from "../../../../components/ui/BotaoImprimir";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import { gerarPreviaDoSiope, PortaSemBancoError, type PreviaDoSiope } from "../../../../lib/portas/rreo";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { anoCivil } from "../../../../packages/datas/index";
import { SeletorBimestreRreo } from "../rreo/anexo3/SeletorBimestreRreo";

/**
 * V39-R3 (R3-023) — A PRÉVIA DO SIOPE. A despesa da função Educação por subfunção, agrupada pelo que o manual do SIOPE
 * diz de cada uma (considerada no ensino, considerada só se da secretaria de educação, não considerada), medida pelo
 * mesmo medidor do Anexo 8, e os indicadores do Anexo 8 como estão. O arquivo de importação não é gerado: o motivo vai
 * na tela. Server Component + force-dynamic.
 */
export const dynamic = "force-dynamic";

const CELULA = "px-3 py-2 text-sm";
const CABECA = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-3)]";
const ROTULO_DO_TRATAMENTO: Readonly<Record<string, string>> = {
  CONSIDERADA: "Considerada no ensino",
  CONSIDERADA_SE_DO_ENSINO_FUNDAMENTAL: "Considerada só para alunos do ensino fundamental",
  CONSIDERADA_SE_RECURSOS_PROPRIOS: "Considerada só com recursos próprios",
  NAO_CONSIDERADA: "Não considerada",
  SEM_CORRESPONDENCIA: "Sem correspondência no manual",
};
const pct = (v: string): string => `${v.replace(".", ",")}%`;
const ROTULO_DO_GRUPO: Readonly<Record<string, string>> = {
  TIPICA_DA_EDUCACAO: "Típica da educação",
  APOIO_ADMINISTRATIVO: "Apoio administrativo",
  OUTRA_CONSIDERADA: "Outra considerada",
  OUTRA_NAO_CONSIDERADA: "Outra não considerada",
};

function lerInteiro(v: string | string[] | undefined, padrao: number): number {
  const n = Number.parseInt(Array.isArray(v) ? (v[0] ?? "") : (v ?? ""), 10);
  return Number.isFinite(n) ? n : padrao;
}

export default async function PreviaDoSiopePage({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_RELATORIOS");
  const sp = await searchParams;
  const exercicio = lerInteiro(sp["exercicio"], anoCivil(new Date()));
  const bruto = lerInteiro(sp["bimestre"], 6);
  const bimestre = ([1, 2, 3, 4, 5, 6] as const).includes(bruto as 1) ? (bruto as 1) : 6;
  const cabecalho = (
    <PageHeader
      titulo="Prévia do SIOPE"
      subtitulo="Despesa da Educação por subfunção, como o manual do SIOPE a considera no ensino"
      acoes={<span className="flex flex-wrap items-center gap-2"><SeletorBimestreRreo bimestre={bimestre} exercicio={exercicio} /><BotaoCsvDasTabelas nomeArquivo="previa-siope.csv" /><BotaoImprimir /></span>}
    />
  );
  let p: PreviaDoSiope;
  try {
    p = await gerarPreviaDoSiope({ exercicio, bimestre });
  } catch (erro) {
    return (
      <div>
        {cabecalho}
        <EstadoVazio
          titulo={erro instanceof PortaSemBancoError ? "Serviço indisponível" : "Não foi possível montar a prévia"}
          descricao={erro instanceof PortaSemBancoError ? "Não foi possível acessar os dados. Tente novamente mais tarde." : erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."}
        />
      </div>
    );
  }
  const i = p.indicadores;
  return (
    <div className="space-y-4" data-previa-siope={`${String(p.exercicio)}-${String(p.bimestre)}`}>
      {cabecalho}
      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs leading-relaxed text-[color:var(--color-ink-2)]">
        Até o {p.bimestre}º bimestre de {p.exercicio}, pela despesa {p.base} (a mesma régua do RREO Anexo 8). Cada subfunção da função
        Educação aparece com o tratamento que o manual do SIOPE municipal lhe dá ({p.correspondencia.fonte}, versão{" "}
        {p.correspondencia.versao} da correspondência), com a despesa inteira e a parte custeada por recursos de impostos. Esta é
        uma prévia para conferir antes de preencher o SIOPE; a apuração do mínimo do ensino é a do RREO Anexo 8.
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CardEstatistica rotulo="Receita de impostos realizada"><ValorMonetario valor={i.receitaDeImpostosRealizada} /></CardEstatistica>
        <CardEstatistica rotulo="Mínimo além do FUNDEB"><ValorMonetario valor={i.minimoAlemDoFundeb} /></CardEstatistica>
        <CardEstatistica rotulo="Recebido do FUNDEB"><ValorMonetario valor={i.recebidoDoFundeb} /></CardEstatistica>
        <CardEstatistica rotulo={`Profissionais da educação (mínimo ${pct(i.limiteProfissionais)})`}>
          <span className="text-2xl font-semibold tabular">{i.recebidoDoFundeb === "0.00" ? "—" : pct(i.indicadorProfissionais)}</span>
        </CardEstatistica>
      </div>
      <Card>
        <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">Despesa da Educação por subfunção</h2>
        {p.linhas.length === 0 ? (
          <EstadoVazio titulo="Sem despesa da função Educação" descricao={`Nenhuma ficha da função Educação em ${String(p.exercicio)}.`} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" data-tabela="previa-siope">
              <thead>
                <tr className="border-b border-[color:var(--color-border)]">
                  <th className={CABECA}>Subfunção</th>
                  <th className={CABECA}>No manual</th>
                  <th className={CABECA}>Tratamento</th>
                  <th className={`${CABECA} text-right`}>Empenhada</th>
                  <th className={`${CABECA} text-right`}>Liquidada</th>
                  <th className={`${CABECA} text-right`}>Paga</th>
                  <th className={`${CABECA} text-right`}>Com impostos ({p.base})</th>
                </tr>
              </thead>
              <tbody>
                {p.linhas.map((l) => (
                  <tr key={l.subfuncao} className="border-b border-[color:var(--color-border)]" data-subfuncao={l.subfuncao}>
                    <td className={CELULA}><span className="tabular-nums">{l.subfuncao}</span> — {l.nome}</td>
                    <td className={CELULA}>{l.grupo === null ? "—" : ROTULO_DO_GRUPO[l.grupo]}</td>
                    <td className={CELULA}>{ROTULO_DO_TRATAMENTO[l.tratamento ?? "SEM_CORRESPONDENCIA"]}</td>
                    <td className={`${CELULA} text-right`}><ValorMonetario valor={l.despesa.empenhada} /></td>
                    <td className={`${CELULA} text-right`}><ValorMonetario valor={l.despesa.liquidada} /></td>
                    <td className={`${CELULA} text-right`}><ValorMonetario valor={l.despesa.paga} /></td>
                    <td className={`${CELULA} text-right`} data-de-impostos><ValorMonetario valor={l.deImpostos.acompanhamento} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card>
        <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">Parte custeada por impostos, por tratamento (despesa {p.base})</h2>
        <table className="w-full border-collapse" data-tabela="totais-siope">
          <tbody>
            {(["CONSIDERADA", "CONSIDERADA_SE_DO_ENSINO_FUNDAMENTAL", "CONSIDERADA_SE_RECURSOS_PROPRIOS", "NAO_CONSIDERADA", "SEM_CORRESPONDENCIA"] as const).map((k) => (
              <tr key={k} className="border-b border-[color:var(--color-border)]" data-total-tratamento={k}>
                <td className={CELULA}>{ROTULO_DO_TRATAMENTO[k]}</td>
                <td className={`${CELULA} text-right`}><ValorMonetario valor={p.totaisDeImpostos[k].toFixed(2)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-[color:var(--color-ink-3)]">
          Conferência para o preenchimento, não a apuração do mínimo: o manual exclui do ensino a despesa com recursos vinculados
          (FUNDEB, salário-educação, programas, convênios), e as condições (ensino fundamental, recursos próprios) se conferem ficha a
          ficha antes de lançar no SIOPE.
        </p>
      </Card>
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-ink)]">O que esta prévia não gera</h2>
        <ul className="grid gap-2 text-xs text-[color:var(--color-ink-2)]" data-lista="bloqueios-siope">
          {p.bloqueios.map((b) => (
            <li key={b.resultado}><strong>{b.resultado}: indisponível.</strong> {b.motivo}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
