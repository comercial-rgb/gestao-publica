import { BotaoPdf } from "../../../../components/ui/BotaoPdf";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { TabelaDeDados, type ColunaTabela } from "../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import {
  lerAcompanhamentoDasCotas,
  lerPeriodicidadeDasCotas,
  lerCmdVigente,
  lerConfrontoMba,
  lerLimitacaoDeEmpenho,
  lerMbaVigente,
  PortaSemBancoError,
  type ConfrontoMbaDaTela,
  type LinhaAcompanhamentoDasCotas,
  type LinhaConfronto,
  type LinhaProgramacao,
  type PlanoProgramacao,
  type VersaoProgramacao,
} from "../../../../lib/portas/programacao";
import { dataBr, exercicioAutorizado, ExercicioIlegivelError } from "../../../../lib/recorte";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import { FormCronogramaPorPercentual, FormLimitacao, FormLiberacao, FormPeriodicidade, FormProporDaLoa } from "./FormsDaProgramacao";

import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
/**
 * PROGRAMAÇÃO FINANCEIRA — CMD e MBA (TR 4.18/4.19/4.43/4.44 · LRF arts. 8º, 9º e 13).
 *
 * ═══ O QUE ESTA TELA RESPONDE ═══
 * A LOA diz quanto o ente pode gastar no ANO. O CMD diz quanto por MÊS, por FONTE — os DUODÉCIMOS —,
 * para o caixa não secar em março com o orçamento inteiro empenhado. O MBA faz o mesmo do lado da
 * RECEITA, em seis bimestres: é a meta que o art. 9º manda confrontar com o arrecadado, e a
 * frustração dela é o que autoriza (obriga, na verdade) o contingenciamento.
 *
 * ⚠️ OS TRÊS QUADROS SÃO UMA LEITURA SÓ, E É ISSO QUE OS FAZ CONVERSAR. A matriz do CMD, a do MBA e o
 * confronto saem todos de `lib/portas/programacao` — que por sua vez usa o MESMO critério de vigência
 * do guard do 4.43 (`modules/m05-despesa/guard-cmd.ts`: a versão de maior `vigenteDesde` já decorrida)
 * e o MESMO `confrontoMba` do domínio. Se esta tela resolvesse a vigência por conta própria, ela
 * poderia exibir a versão 2 enquanto o guard travasse o empenho contra a versão 1 — e o servidor
 * planejaria contra um cronograma que o sistema não honra.
 *
 * ⚠️ SEM UNIDADE ORÇAMENTÁRIA, DE PROPÓSITO. A programação financeira é do ENTE: o caixa é um só, e o
 * grão do decreto é fonte × período. O seletor de UG do cabeçalho não recorta esta tela — e a legenda
 * diz isso, em vez de deixar o usuário achar que filtrou algo.
 *
 * ⚠️ TELA DE LEITURA. Registrar CMD/MBA é ato POLÍTICO (decreto do Prefeito), não botão de sistema —
 * ver a nota da porta. Enquanto o fluxo de publicação do decreto não existir, aqui só se lê e se
 * imprime a MINUTA (TR 4.19).
 */
export const dynamic = "force-dynamic";

export default async function CmdMbaPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
  const sp = await searchParams;

  // ⚠️ SÓ O EXERCÍCIO, E O SUBTÍTULO DESTA TELA JÁ DIZIA ISSO: "consolidado do ente". A
  // programação financeira é do ENTE porque o caixa é um só — a mesma razão que a rota de
  // PDF dela registra em comentário. As três leituras (`lerCmdVigente`, `lerMbaVigente`,
  // `lerConfrontoMba`) recebem apenas o ano.
  //
  // ⚠️ E `recorte` DEIXOU DE EXISTIR aqui: o objeto carregava uma `unidadeCodigo` que esta
  // tela nunca usou, e manter um campo que ninguém lê é um convite a alguém passá-lo adiante
  // um dia, dando a esta página um recorte que a LRF não tem.
  let exercicio: number;
  try {
    exercicio = exercicioAutorizado(sp);
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader
          titulo="Programação financeira — CMD e MBA"
          subtitulo="Cronograma mensal de desembolso e metas bimestrais de arrecadação"
        />
        <EstadoVazio
          titulo={
            erro instanceof ExercicioIlegivelError
              ? "Exercício inválido"
              : "Não foi possível carregar a consulta"
          }
          descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."}
        />
      </div>
    );
  }
  const cabecalho = (
    <PageHeader
      titulo="Programação financeira — CMD e MBA"
      subtitulo={`Exercício ${exercicio}, consolidado do ente (LRF arts. 8º, 9º e 13).`}
    />
  );

  let cmd: PlanoProgramacao;
  let mba: PlanoProgramacao;
  let confronto: ConfrontoMbaDaTela;
  let acompanhamento: readonly LinhaAcompanhamentoDasCotas[];
  let periodicidade: Awaited<ReturnType<typeof lerPeriodicidadeDasCotas>>;
  let limitacao: { readonly ativa: boolean; readonly atoRef: string | null; readonly motivo: string | null; readonly desde: Date | null; readonly criadoPor: string | null };
  try {
    [cmd, mba, confronto, limitacao, acompanhamento, periodicidade] = await Promise.all([
      lerCmdVigente({ exercicio: exercicio }),
      lerMbaVigente({ exercicio: exercicio }),
      lerConfrontoMba({ exercicio: exercicio }),
      lerLimitacaoDeEmpenho({ exercicio: exercicio }),
      lerAcompanhamentoDasCotas({ exercicio: exercicio }),
      lerPeriodicidadeDasCotas({ exercicio: exercicio }),
    ]);
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        {cabecalho}
        <EstadoVazio
          titulo={erro instanceof PortaSemBancoError ? "Serviço indisponível" : "Não foi possível carregar a programação financeira"}
          descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."}
        />
      </div>
    );
  }

  // ⚠️ NADA REGISTRADO É UMA RESPOSTA, NÃO UM ERRO — e ela tem de dizer O QUE FALTA. Um "sem dados"
  // genérico deixaria o usuário sem saber se o decreto não foi cadastrado, se ele ainda não vige, ou
  // se a tela quebrou. As três situações têm remédios diferentes.
  const semNada = cmd.vigente === null && mba.vigente === null;

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      {cabecalho}

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        O <strong>CMD</strong> distribui a despesa fixada na LOA em <strong>doze cotas mensais por fonte</strong>, e o{" "}
        <strong>MBA</strong> distribui a receita prevista em <strong>seis metas bimestrais</strong>; diferenças de centavos
        são ajustadas no último período. Cada alteração é feita por novo decreto, e a tela exibe a versão{" "}
        <strong>vigente</strong>.
      </div>

      {semNada ? (
        <EstadoVazio
          titulo="Nenhuma programação financeira registrada"
          descricao={
            `Não há CMD nem MBA vigente para o exercício ${exercicio}. ${descreverAusencia(cmd, "CMD")} ` +
            `${descreverAusencia(mba, "MBA")} Utilize os formulários abaixo para propor a programação a partir da LOA.`
          }
        />
      ) : null}

      {/* ── OS DUODÉCIMOS ────────────────────────────────────────────────────────── */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[color:var(--color-ink)]">
              Cronograma Mensal de Desembolso
            </h2>
            <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">
              Quanto cada fonte pode desembolsar em cada mês (LRF art. 8º).
            </p>
          </div>
          {cmd.vigente !== null ? <Vigencia versao={cmd.vigente} versoes={cmd.versoes} /> : null}
        </div>

        <div className="mt-4">
          {cmd.vigente === null ? (
            <EstadoVazio titulo="Sem CMD vigente" descricao={descreverAusencia(cmd, "CMD")} />
          ) : (
            <TabelaDeDados
              colunas={colunasMatriz(MESES, "Total do exercício")}
              linhas={comTotal(cmd.vigente)}
              keyDe={(l) => l.fonteId}
              ehTotal={(l) => l.fonteId === CHAVE_TOTAL}
              legenda={`${cmd.vigente.linhas.length} fonte(s) · valores em R$ · a soma dos 12 meses corresponde ao total do exercício.`}
            />
          )}
        </div>

        <AvisoSemCota versao={cmd.vigente} rotulos={MESES} periodo="mês" />
      </Card>

      {/* ── AS METAS BIMESTRAIS ──────────────────────────────────────────────────── */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[color:var(--color-ink)]">
              Metas Bimestrais de Arrecadação
            </h2>
            <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">
              O desdobramento da receita prevista na LOA em seis bimestres (LRF art. 13).
            </p>
          </div>
          {mba.vigente !== null ? <Vigencia versao={mba.vigente} versoes={mba.versoes} /> : null}
        </div>

        <div className="mt-4">
          {mba.vigente === null ? (
            <EstadoVazio titulo="Sem MBA vigente" descricao={descreverAusencia(mba, "MBA")} />
          ) : (
            <TabelaDeDados
              colunas={colunasMatriz(BIMESTRES, "Total do exercício")}
              linhas={comTotal(mba.vigente)}
              keyDe={(l) => l.fonteId}
              ehTotal={(l) => l.fonteId === CHAVE_TOTAL}
              legenda={`${mba.vigente.linhas.length} fonte(s) · valores em R$ · a soma dos 6 bimestres corresponde à receita prevista da fonte.`}
            />
          )}
        </div>
      </Card>

      {/* ── V36: O ACOMPANHAMENTO DAS COTAS DE DESPESA — previsto × realizado ── */}
      <Card>
        <h2 className="text-base font-semibold text-[color:var(--color-ink)]">Acompanhamento das cotas de despesa — previsto × realizado</h2>
        <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">
          Por fonte e mês: a cota do cronograma vigente no fim do mês, as liberações, o previsto (cota + liberações) e o
          realizado (empenhado no mês, descontadas as anulações do próprio mês). Saldo <strong>negativo</strong> indica empenho além do previsto.
        </p>
        <div className="mt-4" data-acompanhamento-das-cotas>
          {acompanhamento.filter(temMovimento).length === 0 ? (
            <EstadoVazio titulo="Sem cotas nem empenhos no exercício" descricao={`O exercício ${exercicio} não tem cronograma de desembolso registrado nem empenho emitido.`} />
          ) : (
            <TabelaDeDados
              colunas={COLUNAS_ACOMPANHAMENTO}
              linhas={acompanhamento.filter(temMovimento)}
              keyDe={(l) => `${l.fonteId}-${l.mes}`}
              legenda="Valores em R$ · meses sem previsto e sem realizado são omitidos · saldo = previsto − realizado."
            />
          )}
        </div>
      </Card>

      {/* ── O CONFRONTO DO ART. 9º ───────────────────────────────────────────────── */}
      <Card>
        <h2 className="text-base font-semibold text-[color:var(--color-ink)]">
          Confronto do art. 9º — meta × arrecadado
        </h2>
        <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">
          {/* ⚠️ O ACUMULADO É DE PROPÓSITO: o art. 9º pergunta se, AO FINAL do bimestre, a realização da
              receita comporta o cumprimento das metas — e a meta é o desdobramento ATÉ ali, não a fatia
              isolada do bimestre. O arrecadado vem do M04 (o dono do dado), nunca de uma segunda soma. */}
          Meta <strong>acumulada</strong> comparada ao arrecadado <strong>acumulado</strong>, por fonte, até o fim de cada
          bimestre. Diferença <strong>negativa</strong> indica frustração de receita, que pode exigir limitação de empenho.
        </p>

        <div className="mt-4">
          {confronto.linhas.length === 0 ? (
            <EstadoVazio
              titulo="Sem dados para o confronto"
              descricao={
                confronto.ateBimestre === 0
                  ? `Nenhum bimestre do exercício ${exercicio} foi encerrado até o momento. O confronto é feito ao final de cada bimestre (LRF art. 9º).`
                  : mba.vigente === null
                    ? "Não há MBA vigente. O confronto depende das metas bimestrais de arrecadação."
                    : `O MBA vigente não tem metas nos bimestres já decorridos (até o ${confronto.ateBimestre}º).`
              }
            />
          ) : (
            <TabelaDeDados
              colunas={COLUNAS_CONFRONTO}
              linhas={confronto.linhas}
              keyDe={(l) => `${l.fonteId}-${l.bimestre}`}
              legenda={`Acumulado até o ${confronto.ateBimestre}º bimestre (último bimestre encerrado) · valores em R$ · diferença = arrecadado − meta.`}
            />
          )}
        </div>
      </Card>

      <div className="flex justify-end">
        {/* O PDF é esta tela — as mesmas leituras — mais as MINUTAS de decreto (TR 4.19). */}
        <BotaoPdf
          href={`/planejamento/cmd-mba/pdf?exercicio=${exercicio}`}
          rotulo="Imprimir programação e minutas de decreto"
        />
      </div>

      {/*
        ⚠️ OS ATOS DA PROGRAMAÇÃO (V19). Até aqui esta tela só LIA, e o regime do cronograma só podia
        ser ligado por script — o que deixava a recusa por programação ativa fora do alcance de quem
        opera. Os três formulários exigem o ato que os autoriza; a minuta dele sai do botão acima.
      */}
      <FormProporDaLoa exercicio={exercicio} peca="CMD" />
      <FormCronogramaPorPercentual exercicio={exercicio} />
      <FormProporDaLoa exercicio={exercicio} peca="MBA" />
      <FormLimitacao ativa={limitacao.ativa} exercicio={exercicio} />
      <FormPeriodicidade exercicio={exercicio} vigente={periodicidade.vigente} atos={periodicidade.atos.map((a) => ({ periodicidade: a.periodicidade, desde: dataBr(a.desde), atoRef: a.atoRef }))} />
      {cmd.vigente !== null && cmd.vigente.linhas.length > 0 ? (
        <FormLiberacao
          exercicio={exercicio}
          fontes={cmd.vigente.linhas.map((l) => ({ id: l.fonteId, codigo: l.fonteCodigo }))}
        />
      ) : null}

      <p className="text-xs text-[color:var(--color-ink-3)]">
        {limitacao.ativa && limitacao.atoRef !== null ? (
          <>
            A limitação de empenho está <strong>ativa</strong> conforme {limitacao.atoRef}
            {limitacao.desde !== null ? <> desde {dataBr(limitacao.desde)}</> : null}.{" "}
          </>
        ) : null}
        A <strong>limitação de empenho</strong> é ativada por exercício. Enquanto inativa, o cronograma tem caráter de
        planejamento; quando ativa, o empenho fica limitado à cota da fonte no período de controle (o mês, salvo outra periodicidade registrada), e fonte <strong>sem cota</strong>{" "}
        no mês tem o empenho recusado. As{" "}
        <a href="/receita/arrecadacoes" className="text-[color:var(--color-primary)] hover:underline">arrecadações</a>{" "}
        consideradas no confronto podem ser consultadas na área de Receita.
      </p>
    </div>
  );
}

// ── AUXILIARES DE APRESENTAÇÃO ─────────────────────────────────────────────────────

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"] as const;
const BIMESTRES = ["1º bim.", "2º bim.", "3º bim.", "4º bim.", "5º bim.", "6º bim."] as const;

/** A `fonteId` sintética da linha de TOTAL — um cuid real nunca colide com ela. */
const CHAVE_TOTAL = "__total__";

/**
 * A explicação HONESTA de por que um plano não aparece — e são situações distintas, com remédios
 * distintos: cadastrar o decreto, ou esperar a data de vigência chegar.
 */
function descreverAusencia(plano: PlanoProgramacao, nome: string): string {
  if (plano.versoes === 0) {
    return `Nenhuma versão de ${nome} foi registrada para este exercício.`;
  }
  return (
    `Há ${plano.versoes} versão(ões) de ${nome} registrada(s), mas nenhuma vigente em ` +
    `${dataBr(plano.referencia)}${plano.futuras > 0 ? `, ${plano.futuras} com vigência futura` : ""}.`
  );
}

/** O carimbo da versão vigente: qual é, de que ato veio, desde quando vale e quantas a precederam. */
function Vigencia({ versao, versoes }: { readonly versao: VersaoProgramacao; readonly versoes: number }): React.ReactElement {
  return (
    <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2 text-xs text-[color:var(--color-ink-2)]">
      <div>
        Versão <strong className="text-[color:var(--color-ink)]">{versao.numero}</strong> · ato{" "}
        <strong className="text-[color:var(--color-ink)]">{versao.atoRef}</strong>
      </div>
      <div>
        Vigente desde {dataBr(versao.vigenteDesde)} · {versoes} versão(ões) no exercício
      </div>
    </div>
  );
}

/**
 * O aviso de FONTE/PERÍODO SEM LINHA — e ele não é decorativo.
 *
 * Ausência de cota e cota de valor 0,00 travam o empenho do mesmo jeito quando a limitação do 4.43
 * está ligada, mas só a segunda foi DECIDIDA por alguém. Sem este aviso, um mês esquecido no decreto
 * pareceria um mês zerado de propósito — e o operador só descobriria a diferença no dia em que o
 * empenho fosse recusado.
 */
function AvisoSemCota({
  versao,
  rotulos,
  periodo,
}: {
  readonly versao: VersaoProgramacao | null;
  readonly rotulos: readonly string[];
  readonly periodo: string;
}): React.ReactElement | null {
  if (versao === null) return null;
  const comBuraco = versao.linhas.filter((l) => l.periodosSemLinha.length > 0);
  if (comBuraco.length === 0) return null;
  return (
    <div className="mt-3 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
      <strong className="text-[color:var(--color-ink)]">Períodos sem cota no decreto:</strong>{" "}
      {comBuraco
        .map((l) => `${l.fonteCodigo} → ${l.periodosSemLinha.map((i) => rotulos[i - 1] ?? String(i)).join(", ")}`)
        .join(" · ")}
      . Esses valores aparecem como 0,00 porque o decreto não define cota para o {periodo}. Com a limitação
      de empenho ativa, o empenho nessa fonte e {periodo} é <strong>recusado</strong>.
    </div>
  );
}

/** As linhas da matriz mais o rodapé de TOTAL — o total já vem somado da porta, aqui só se anexa. */
function comTotal(versao: VersaoProgramacao): readonly LinhaProgramacao[] {
  return [
    ...versao.linhas,
    {
      fonteId: CHAVE_TOTAL,
      fonteCodigo: "TOTAL",
      fonteDescricao: "todas as fontes",
      parcelas: versao.totalPorPeriodo,
      total: versao.total,
      periodosSemLinha: [],
    },
  ];
}

/**
 * As colunas da matriz: a fonte à esquerda, um período por coluna à direita, o total ao fim.
 *
 * ⚠️ A COLUNA DE FONTE MOSTRA O CÓDIGO, e a descrição vai no `title` (hover). Doze colunas de
 * dinheiro já ocupam a largura toda; a descrição por extenso empurraria os valores para fora da tela,
 * e é justamente a régua vertical de algarismos que o leitor do cronograma compara.
 */
function colunasMatriz(
  rotulos: readonly string[],
  rotuloTotal: string
): readonly ColunaTabela<LinhaProgramacao>[] {
  return [
    {
      chave: "fonte",
      cabecalho: "Fonte",
      alinhamento: "esquerda",
      largura: "6rem",
      celula: (l) => (
        <span className="font-mono text-xs text-[color:var(--color-ink-2)]" title={l.fonteDescricao}>
          {l.fonteCodigo}
        </span>
      ),
    },
    ...rotulos.map((rotulo, i) => ({
      chave: `p${i + 1}`,
      cabecalho: rotulo,
      alinhamento: "direita" as const,
      largura: "7rem",
      celula: (l: LinhaProgramacao) => <ValorMonetario valor={l.parcelas[i] ?? "0.00"} />,
    })),
    {
      chave: "total",
      cabecalho: rotuloTotal,
      alinhamento: "direita",
      largura: "9rem",
      celula: (l) => (
        <strong>
          <ValorMonetario valor={l.total} />
        </strong>
      ),
    },
  ];
}

/** Linha com previsto ou realizado diferente de zero — a forma é a da string do domínio ("0.00"). */
const temMovimento = (l: LinhaAcompanhamentoDasCotas): boolean => l.previsto !== "0.00" || l.realizado !== "0.00";

const COLUNAS_ACOMPANHAMENTO: readonly ColunaTabela<LinhaAcompanhamentoDasCotas>[] = [
  { chave: "fonte", cabecalho: "Fonte", alinhamento: "esquerda", largura: "6rem", celula: (l) => <span className="font-mono text-xs text-[color:var(--color-ink-2)]">{l.fonteCodigo}</span> },
  { chave: "mes", cabecalho: "Mês", alinhamento: "centro", largura: "5rem", celula: (l) => MESES[l.mes - 1] ?? String(l.mes) },
  { chave: "cota", cabecalho: "Cota", alinhamento: "direita", largura: "9rem", celula: (l) => <ValorMonetario valor={l.cota} /> },
  { chave: "liberado", cabecalho: "Liberado", alinhamento: "direita", largura: "9rem", celula: (l) => <ValorMonetario valor={l.liberado} /> },
  { chave: "previsto", cabecalho: "Previsto", alinhamento: "direita", largura: "9rem", celula: (l) => <ValorMonetario valor={l.previsto} /> },
  { chave: "realizado", cabecalho: "Realizado", alinhamento: "direita", largura: "9rem", celula: (l) => <ValorMonetario valor={l.realizado} /> },
  { chave: "saldo", cabecalho: "Saldo", alinhamento: "direita", largura: "9rem", celula: (l) => <strong><ValorMonetario valor={l.saldo} /></strong> },
  // V36 (TR 5.9.3.33) — o período do controle e o saldo dele: o que o empenho ainda pode consumir no período.
  { chave: "periodo", cabecalho: "Período", alinhamento: "centro", largura: "6rem", celula: (l) => (l.periodicidade === "MENSAL" ? "mês" : l.periodo.split(" a ").map((m) => MESES[Number(m) - 1] ?? m).join("–")) },
  { chave: "saldoDoPeriodo", cabecalho: "Saldo do período", alinhamento: "direita", largura: "9rem", celula: (l) => <span data-saldo-do-periodo={`${l.fonteCodigo}-${String(l.mes)}`}><ValorMonetario valor={l.saldoDoPeriodo} /></span> },
];

const COLUNAS_CONFRONTO: readonly ColunaTabela<LinhaConfronto>[] = [
  { chave: "fonte", cabecalho: "Fonte", alinhamento: "esquerda", largura: "6rem", celula: (l) => <span className="font-mono text-xs text-[color:var(--color-ink-2)]">{l.fonteCodigo}</span> },
  { chave: "bimestre", cabecalho: "Bimestre", alinhamento: "centro", largura: "6rem", celula: (l) => `${l.bimestre}º` },
  { chave: "meta", cabecalho: "Meta acumulada", alinhamento: "direita", largura: "10rem", celula: (l) => <ValorMonetario valor={l.metaAcumulada} /> },
  { chave: "arrecadado", cabecalho: "Arrecadado acumulado", alinhamento: "direita", largura: "11rem", celula: (l) => <ValorMonetario valor={l.arrecadadoAcumulado} /> },
  // ⚠️ O `ValorMonetario` já pinta o negativo — a coluna não precisa reinterpretar o sinal, e a
  // coluna "Situação" ao lado NOMEIA a condição, para quem lê em preto e branco (ou impresso).
  { chave: "diferenca", cabecalho: "Diferença", alinhamento: "direita", largura: "10rem", celula: (l) => <strong><ValorMonetario valor={l.diferenca} /></strong> },
  {
    chave: "situacao",
    cabecalho: "Situação",
    alinhamento: "esquerda",
    celula: (l) =>
      l.frustrada ? (
        <span className="text-[color:var(--color-negativo)]">Frustração de receita (LRF art. 9º)</span>
      ) : (
        <span className="text-[color:var(--color-ink-3)]">Meta cumprida</span>
      ),
  },
];
