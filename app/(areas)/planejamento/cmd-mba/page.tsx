import { BotaoPdf } from "../../../../components/ui/BotaoPdf";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { TabelaDeDados, type ColunaTabela } from "../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import {
  lerCmdVigente,
  lerConfrontoMba,
  lerMbaVigente,
  PortaSemBancoError,
  type ConfrontoMbaDaTela,
  type LinhaConfronto,
  type LinhaProgramacao,
  type PlanoProgramacao,
  type VersaoProgramacao,
} from "../../../../lib/portas/programacao";
import { dataBr, exercicioAutorizado, ExercicioIlegivelError } from "../../../../lib/recorte";

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
              ? "O exercício pedido não é um ano"
              : "Não foi possível ler o recorte"
          }
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }
  const cabecalho = (
    <PageHeader
      titulo="Programação financeira — CMD e MBA"
      subtitulo={`Exercício ${exercicio} · consolidado do ente — cronograma mensal de desembolso e metas bimestrais de arrecadação (LRF arts. 8º, 9º e 13)`}
    />
  );

  let cmd: PlanoProgramacao;
  let mba: PlanoProgramacao;
  let confronto: ConfrontoMbaDaTela;
  try {
    [cmd, mba, confronto] = await Promise.all([
      lerCmdVigente({ exercicio: exercicio }),
      lerMbaVigente({ exercicio: exercicio }),
      lerConfrontoMba({ exercicio: exercicio }),
    ]);
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        {cabecalho}
        <EstadoVazio
          titulo={erro instanceof PortaSemBancoError ? "Banco de dados não configurado" : "Não foi possível ler a programação financeira"}
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
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
        O <strong>CMD</strong> reparte a despesa fixada na LOA em <strong>doze cotas mensais por fonte</strong> (os
        duodécimos); o <strong>MBA</strong> reparte a receita prevista em <strong>seis metas bimestrais</strong>. A
        distribuição <strong>fecha ao centavo</strong> com a LOA: cada parcela leva o valor truncado a dois decimais e o{" "}
        <strong>último período absorve a diferença</strong> — por isso dezembro (ou o 6º bimestre) costuma diferir dos
        demais em alguns centavos. Planos são <strong>versionados e append-only</strong>: retificar é publicar decreto
        novo, e a versão anterior fica na base. Exibe-se aqui a <strong>vigente</strong> — a de vigência mais recente já
        decorrida, o mesmo critério contra o qual a limitação de empenho julga o empenho.
      </div>

      {semNada ? (
        <EstadoVazio
          titulo="Nenhuma programação financeira registrada"
          descricao={
            `Não há CMD nem MBA vigente para o exercício ${exercicio}. ${descreverAusencia(cmd, "CMD")} ` +
            `${descreverAusencia(mba, "MBA")} A programação nasce de decreto do Executivo (proposta a partir da LOA, ` +
            `depois retificada por versões novas) — o banco atual foi semeado sem nenhuma. Nada foi arbitrado nesta tela: ` +
            `um cronograma inventado viraria teto de empenho falso quando a limitação de empenho fosse ligada.`
          }
        />
      ) : null}

      {/* ── OS DUODÉCIMOS ────────────────────────────────────────────────────────── */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[color:var(--color-ink)]">
              Cronograma Mensal de Desembolso — os duodécimos
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
              legenda={`${cmd.vigente.linhas.length} fonte(s) · valores em R$ · a linha fecha na horizontal (Σ dos 12 meses = total do exercício) e na vertical.`}
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
              legenda={`${mba.vigente.linhas.length} fonte(s) · valores em R$ · Σ dos 6 bimestres = receita prevista da fonte.`}
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
          Meta <strong>acumulada</strong> contra arrecadado <strong>acumulado</strong>, por fonte, até o fim de cada
          bimestre. Diferença <strong>negativa</strong> é frustração de receita — o gatilho da limitação de empenho.
        </p>

        <div className="mt-4">
          {confronto.linhas.length === 0 ? (
            <EstadoVazio
              titulo="Confronto sem linhas"
              descricao={
                confronto.ateBimestre === 0
                  ? `Nenhum bimestre do exercício ${exercicio} fechou até hoje. O art. 9º julga "ao final de um bimestre" — confrontar o bimestre em curso compararia a meta cheia com uma arrecadação pela metade e acusaria frustração inexistente.`
                  : mba.vigente === null
                    ? "Sem MBA vigente não há meta contra a qual confrontar o arrecadado. O confronto é meta × realização: sem a primeira, ele não existe."
                    : `O MBA vigente não tem metas nos bimestres já decorridos (até o ${confronto.ateBimestre}º).`
              }
            />
          ) : (
            <TabelaDeDados
              colunas={COLUNAS_CONFRONTO}
              linhas={confronto.linhas}
              keyDe={(l) => `${l.fonteId}-${l.bimestre}`}
              legenda={`Acumulado até o ${confronto.ateBimestre}º bimestre (o último inteiramente decorrido) · valores em R$ · diferença = arrecadado − meta.`}
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

      <p className="text-xs text-[color:var(--color-ink-3)]">
        A <strong>limitação de empenho</strong> é <strong>opt-in por exercício</strong>: ausente, ela está
        DESLIGADA e o cronograma acima é planejamento, não trava. Ligada, o empenho passa a ser julgado contra a cota da
        fonte no mês — e uma fonte <strong>sem cota</strong> naquele mês é rejeitada (fail-closed), o que é diferente de
        uma cota de valor 0,00 (bloqueio deliberado). As{" "}
        <a href="/receita/arrecadacao" className="text-[color:var(--color-primary)] hover:underline">arrecadações</a>{" "}
        que alimentam o confronto são as do M04.
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
    `${dataBr(plano.referencia)}${plano.futuras > 0 ? ` — ${plano.futuras} com vigência FUTURA` : ""}.`
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
      <strong className="text-[color:var(--color-ink)]">Ausência de cota (≠ cota zero):</strong>{" "}
      {comBuraco
        .map((l) => `${l.fonteCodigo} → ${l.periodosSemLinha.map((i) => rotulos[i - 1] ?? String(i)).join(", ")}`)
        .join(" · ")}
      . Estas células mostram 0,00 porque não existe linha no decreto para aquele {periodo} — e não porque
      alguém programou zero. Com a limitação de empenho ativa, empenho em fonte/{periodo} sem cota é
      <strong> rejeitado</strong>.
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
        <span className="text-[color:var(--color-negativo)]">Frustração — gatilho do art. 9º</span>
      ) : (
        <span className="text-[color:var(--color-ink-3)]">Meta cumprida</span>
      ),
  },
];
