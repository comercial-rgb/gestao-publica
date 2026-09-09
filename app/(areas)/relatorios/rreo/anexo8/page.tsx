import { Badge } from "../../../../../components/ui/Badge";
import { Card, CardEstatistica } from "../../../../../components/ui/Card";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { RelatoriosRelacionados } from "../../../../../components/ui/RelatoriosRelacionados";
import { TabelaDeDados, type ColunaTabela } from "../../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import { RELACOES_RREO } from "../../../../../lib/navegacao";
import {
  gerarBloco2Mde,
  gerarDiferimentoMde,
  gerarRreoAnexo8,
  PortaSemBancoError,
  type Anexo8,
  type DespesaFundeb,
  type LinhaFundebReceita,
  type LinhaReceitaMde,
  type AreaDeAtuacao,
  type Bloco2Mde,
  type DiferimentoFundeb,
  type IndicadorVaat,
  type RpDaFonte,
} from "../../../../../lib/portas/rreo";
import { SeletorBimestreRreo } from "../anexo3/SeletorBimestreRreo";

/**
 * RREO — ANEXO 8: MDE (Educação), BLOCO 1 (LDB art. 72; CF art. 212/212-A). Server Component +
 * force-dynamic. Quadros empilhados: receitas (base + apuração), FUNDEB (receitas/despesas), e o
 * indicador de 70% dos profissionais em Badge semântico (≥70% verde / <70% vermelho, via tokens).
 */

export const dynamic = "force-dynamic";

const ANO_PADRAO = 2026;
const BIMESTRE_PADRAO = 1;

export default async function RreoAnexo8Page({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  const exercicio = lerInteiro(sp["exercicio"], ANO_PADRAO);
  const bimestreBruto = lerInteiro(sp["bimestre"], BIMESTRE_PADRAO);
  const bimestre = ([1, 2, 3, 4, 5, 6] as const).includes(bimestreBruto as 1) ? (bimestreBruto as 1) : BIMESTRE_PADRAO;

  const cabecalho = (
    <PageHeader
      titulo="RREO — Anexo 8 · Educação (MDE)"
      subtitulo="Manutenção e Desenvolvimento do Ensino · LDB art. 72 · CF art. 212/212-A · FUNDEB"
      acoes={<SeletorBimestreRreo bimestre={bimestre} exercicio={exercicio} />}
    />
  );

  let dados: Anexo8;
  let dif: DiferimentoFundeb | null = null;
  let b2: Bloco2Mde | null = null;
  try {
    dados = await gerarRreoAnexo8({ exercicio, bimestre });
    // O bloco 2 SEGUE o bimestre (os indicadores VAAT usam a regra bimestral do bloco 1)
    // — ao contrário do diferimento, que é sempre o retrato de 31/12.
    b2 = await gerarBloco2Mde({ exercicio, bimestre });
    // ⚠️ O DIFERIMENTO É SEMPRE O RETRATO DE 31/12 — o §3º pergunta sobre o FIM do
    // exercício. Por isso ele não segue o seletor de bimestre da página: mostrá-lo
    // "no 2º bimestre" seria responder uma pergunta que a lei não faz.
    dif = await gerarDiferimentoMde({ exercicio });
  } catch (erro) {
    return (
      <div>
        {cabecalho}
        <EstadoVazio
          titulo={erro instanceof PortaSemBancoError ? "Banco de dados não configurado" : "Não foi possível gerar o Anexo 8"}
          descricao={erro instanceof PortaSemBancoError ? "A variável DATABASE_URL não está definida." : erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }

  if (dados.totalReceitas.realizada === "0.00" && dados.totalRecebidoFundeb === "0.00") {
    return (
      <div>
        {cabecalho}
        <EstadoVazio titulo="Sem dados de educação no período" descricao={`Não há receita de impostos nem recurso do FUNDEB apurado até o ${bimestre}º bimestre de ${exercicio}.`} />
      </div>
    );
  }

  const atingiu = dados.atingiuProfissionais;

  return (
    <div className="space-y-6">
      {cabecalho}

      {/* ── APURAÇÃO / INDICADOR ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CardEstatistica rotulo="Total das receitas (3)"><ValorMonetario valor={dados.totalReceitas.realizada} /></CardEstatistica>
        <CardEstatistica rotulo="Destinado ao FUNDEB (4)" nota="20% da base"><ValorMonetario valor={dados.totalDestinadoFundeb} /></CardEstatistica>
        <CardEstatistica rotulo="Mínimo além do FUNDEB (5)"><ValorMonetario valor={dados.minimoAlemFundeb} /></CardEstatistica>
        <Card>
          <p className="text-xs uppercase tracking-wide text-[color:var(--color-ink-2)]">Profissionais da educação (70%)</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-2xl font-semibold tabular text-[color:var(--color-ink)]">{fmtPct(dados.indicadorProfissionais)}</span>
            <Badge status={atingiu ? "ok" : "erro"}>{atingiu ? "≥ 70%" : "abaixo de 70%"}</Badge>
          </div>
          <p className="mt-1 text-xs text-[color:var(--color-ink-3)]">Acompanhamento pela {dados.baseAcompanhamento} · mínimo {fmtPct(dados.limiteProfissionais)}</p>
        </Card>
      </div>

      {/* ── QUADRO RECEITAS ── */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">Receitas de impostos e transferências</h2>
        <TabelaDeDados<LinhaReceitaMde>
          colunas={COLUNAS_RECEITA}
          linhas={[...dados.receitas, dados.totalReceitas]}
          keyDe={(l) => l.numero}
          ehTotal={(l) => l.nivel === "total" || l.nivel === "grupo"}
          recuoDe={(l) => (l.nivel === "item" ? 1 : 0)}
          legenda="Valores em R$ · transferências pelo bruto · a linha 4 é calculada (20% da base do FUNDEB); a dedução registrada pode divergir (nota STN)."
        />
      </section>

      {/* ── QUADRO FUNDEB — RECEITAS ── */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">Recursos recebidos do FUNDEB</h2>
        <TabelaDeDados<LinhaFundebRec>
          colunas={COLUNAS_FUNDEB_REC}
          linhas={[
            ...dados.receitasFundeb,
            { numero: "6", rotulo: "TOTAL RECEBIDO DO FUNDEB (6)", valor: dados.totalRecebidoFundeb, ehTotal: true },
            { numero: "8", rotulo: "Superávit do Exercício Anterior (8)", valor: dados.superavitAnterior },
            { numero: "9", rotulo: "TOTAL DISPONÍVEL (9) = (6) + (8)", valor: dados.totalDisponivelFundeb, ehTotal: true },
          ]}
          keyDe={(l) => l.numero}
          ehTotal={(l) => "ehTotal" in l && l.ehTotal === true}
        />
      </section>

      {/* ── QUADRO FUNDEB — DESPESAS ── */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">Despesas com recursos do FUNDEB</h2>
        <TabelaDeDados<DespesaFundeb>
          colunas={COLUNAS_FUNDEB_DESP}
          linhas={[dados.despesaFundebTotal, dados.despesaProfissionais]}
          keyDe={(l) => l.rotulo}
          ehTotal={(l) => l.rotulo.startsWith("Total")}
          legenda={`Valores em R$ · acompanhamento (indicador de 70%) pela coluna ${dados.baseAcompanhamento}.`}
        />
      </section>

      {/* ── NOTAS ── */}
      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        <p className="mb-1 font-medium uppercase tracking-wide">Notas do demonstrativo</p>
        <ul className="list-disc space-y-1 pl-4">
          {dados.notas.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </div>

      {b2 !== null ? <SecaoBloco2 b2={b2} /> : null}

      {dif !== null ? <SecaoDiferimento dif={dif} /> : null}

      <RelatoriosRelacionados
        relacoes={[
          ...(RELACOES_RREO["/relatorios/rreo/anexo8"] ?? []),
          {
            href: "/relatorios/rgf/anexo5",
            rotulo: "RGF Anexo 5 — Disponibilidade de Caixa",
            motivo:
              "R-DIF: o que o FUNDEB não aplicou tem de estar na conta vinculada da fonte — o não aplicado daqui se confronta com a disponibilidade líquida (i) de lá. Dois caminhos, um razão.",
          },
        ]}
      />
    </div>
  );
}

/**
 * A SEÇÃO DO DIFERIMENTO (art. 25, §3º da Lei 14.113/2020).
 *
 * ⚠️ O ESTOURO É A INFORMAÇÃO, não um detalhe. O §3º permite diferir **até 10%**; acima
 * disso o não aplicado não é diferimento legal — é recurso do FUNDEB que o ente deixou
 * de aplicar no exercício, e vira glosa. Por isso o número sai como é e a linha acusa.
 */
function SecaoDiferimento({
  dif,
}: {
  readonly dif: DiferimentoFundeb;
}): React.ReactElement {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">
        Diferimento — art. 25, §3º (retrato de 31/12)
      </h2>

      {dif.estourou ? (
        <div
          role="alert"
          className="rounded-[var(--radius-md)] border border-[color:var(--color-status-erro-fg)] bg-[color:var(--color-status-erro-bg)] p-3 text-sm text-[color:var(--color-status-erro-fg)]"
        >
          <strong>Não aplicado acima do limite de 10%.</strong> O §3º permite diferir até{" "}
          <strong>{dif.limite}</strong> para o 1º quadrimestre seguinte; o não aplicado foi{" "}
          <strong>{dif.naoAplicado}</strong> — excesso de <strong>{dif.excesso}</strong>.
          O que passa do teto não é diferimento: é recurso do FUNDEB não aplicado no
          exercício.
        </div>
      ) : null}

      <TabelaDeDados
        colunas={COLUNAS_DIF}
        linhas={[dif]}
        keyDe={() => "dif"}
        legenda={`Diferimento é exceção estreita: até 10% do recebido, no 1º quadrimestre seguinte, mediante crédito adicional. As disponibilidades permanecem em conta vinculada.`}
      />

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        <p>
          <strong>Aplicado até 30/04 do exercício seguinte:</strong>{" "}
          {dif.aplicadoNaJanela ?? "sem movimento na janela"} — medido pela{" "}
          <strong>data do fato</strong>, não pela digitação.
        </p>
        <p className="mt-1">
          <strong>Lastro (R-DIF):</strong> o não aplicado ({dif.naoAplicado}) está na conta
          vinculada da fonte? Disponibilidade líquida do{" "}
          <a href="/relatorios/rgf/anexo5" className="underline">
            Anexo 5
          </a>{" "}
          em 31/12: <strong>{dif.disponibilidadeLiquida}</strong> —{" "}
          {dif.lastreado ? "lastreado" : "SEM LASTRO"}. Fontes FUNDEB:{" "}
          {dif.fontesFundeb.join(", ") || "nenhuma classificada"}.
        </p>
        {/* ⚠️ INTERRUPTOR NOMEADO — o §3º exige crédito adicional para usar o diferido,
            e o M03 não tem leitor de créditos por fonte. Inventar o vínculo seria dizer
            que o crédito existe sem ter olhado. */}
        <p className="mt-1">
          <strong>Crédito adicional (§3º):</strong> o uso do diferido exige abertura de
          crédito adicional. Este relatório <strong>não o referencia</strong> — a leitura de
          créditos por fonte ainda não está disponível, e afirmar o vínculo sem ela seria
          declarar um crédito que não foi conferido.
        </p>
      </div>
    </section>
  );
}

const COLUNAS_DIF: readonly ColunaTabela<DiferimentoFundeb>[] = [
  {
    chave: "rec",
    cabecalho: "Recebido (6)",
    alinhamento: "direita",
    largura: "9rem",
    celula: (d) => <ValorMonetario valor={d.recebido} />,
  },
  {
    chave: "apl",
    cabecalho: "Aplicado (10)",
    alinhamento: "direita",
    largura: "9rem",
    celula: (d) => <ValorMonetario valor={d.aplicado} />,
  },
  {
    chave: "nap",
    cabecalho: "Não aplicado",
    alinhamento: "direita",
    largura: "9rem",
    celula: (d) => <ValorMonetario valor={d.naoAplicado} />,
  },
  {
    chave: "lim",
    cabecalho: "Limite (10%)",
    alinhamento: "direita",
    largura: "9rem",
    celula: (d) => <ValorMonetario valor={d.limite} />,
  },
  {
    chave: "sit",
    cabecalho: "Situação",
    alinhamento: "esquerda",
    largura: "9rem",
    celula: (d) =>
      d.estourou ? (
        <Badge status="erro">Excede 10%</Badge>
      ) : (
        <Badge status="ok">Dentro do teto</Badge>
      ),
  },
];

function lerInteiro(v: string | string[] | undefined, padrao: number): number {
  const bruto = Array.isArray(v) ? v[0] : v;
  if (bruto === undefined) return padrao;
  const n = Number.parseInt(bruto, 10);
  return Number.isNaN(n) ? padrao : n;
}
function fmtPct(v: string): string {
  return `${v.replace(".", ",")}%`;
}

const COLUNAS_RECEITA: readonly ColunaTabela<LinhaReceitaMde>[] = [
  { chave: "n", cabecalho: "", alinhamento: "esquerda", largura: "3.5rem", celula: (l) => l.numero },
  { chave: "rotulo", cabecalho: "Especificação", alinhamento: "esquerda", celula: (l) => l.rotulo },
  { chave: "a", cabecalho: "Previsão Atualizada (a)", alinhamento: "direita", largura: "8rem", celula: (l) => <ValorMonetario valor={l.previsaoAtualizada} /> },
  { chave: "b", cabecalho: "Realizadas até o Bim. (b)", alinhamento: "direita", largura: "8rem", celula: (l) => <ValorMonetario valor={l.realizada} /> },
  { chave: "pct", cabecalho: "% (b/a)", alinhamento: "direita", largura: "5rem", celula: (l) => fmtPct(l.percentRealizada) },
];

type LinhaFundebRec = LinhaFundebReceita | { numero: string; rotulo: string; valor: string; ehTotal?: boolean };
const COLUNAS_FUNDEB_REC: readonly ColunaTabela<LinhaFundebRec>[] = [
  { chave: "n", cabecalho: "", alinhamento: "esquerda", largura: "3.5rem", celula: (l) => l.numero },
  { chave: "rotulo", cabecalho: "Especificação", alinhamento: "esquerda", celula: (l) => l.rotulo },
  { chave: "valor", cabecalho: "Valor", alinhamento: "direita", largura: "10rem", celula: (l) => <ValorMonetario valor={l.valor} /> },
];

const COLUNAS_FUNDEB_DESP: readonly ColunaTabela<DespesaFundeb>[] = [
  { chave: "rotulo", cabecalho: "Especificação", alinhamento: "esquerda", celula: (l) => l.rotulo },
  { chave: "emp", cabecalho: "Empenhadas", alinhamento: "direita", largura: "9rem", celula: (l) => <ValorMonetario valor={l.empenhada} /> },
  { chave: "liq", cabecalho: "Liquidadas", alinhamento: "direita", largura: "9rem", celula: (l) => <ValorMonetario valor={l.liquidada} /> },
  { chave: "pag", cabecalho: "Pagas", alinhamento: "direita", largura: "9rem", celula: (l) => <ValorMonetario valor={l.paga} /> },
];

/**
 * O BLOCO 2 — VAAT (arts. 27 e 28), áreas de atuação e RP × lastro.
 *
 * ⚠️ OS INTERRUPTORES SÃO VISÍVEIS. Quando um indicador não compara (falta o IEI, ou não
 * houve complementação no exercício), a tela DIZ isso — em vez de exibir um "0%" ou um
 * "50%" que o leitor tomaria por apuração.
 */
function SecaoBloco2({ b2 }: { readonly b2: Bloco2Mde }): React.ReactElement {
  return (
    <>
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">
          Complementação VAAT — aplicação vinculada (Lei 14.113/2020, arts. 27 e 28)
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <CardIndicador
            titulo="Despesas de capital (art. 27)"
            nota="mínimo 15% da complementação-VAAT"
            ind={b2.vaatCapital}
          />
          <CardIndicador
            titulo="Educação infantil (art. 28)"
            nota="o percentual do município é o IEI publicado pelo Executivo Federal"
            ind={b2.vaatEducacaoInfantil}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">
          Despesas por área de atuação
        </h2>
        <TabelaDeDados<AreaDeAtuacao>
          colunas={COLUNAS_AREA}
          linhas={[
            ...b2.areas,
            // ⚠️ LINHA PRÓPRIA, não uma área: é a despesa que nenhuma subfunção de ensino
            // identifica. A nota 6 do MDF admite ratear por matrículas — e a tabela está
            // vazia, então nada é dividido. Ver MATRICULAS-POR-AREA.
            { chave: "NAO_RATEADO", subfuncao: "—", rotulo: "Não rateado (sem parâmetro de matrículas)", despesa: b2.naoRateado },
          ]}
          keyDe={(a) => a.chave}
          ehTotal={(a) => a.chave === "NAO_RATEADO"}
          legenda="Valores em R$ · por subfunção · acompanhamento pela regra bimestral do bloco 1."
        />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">
          Restos a pagar da educação × lastro na conta vinculada
        </h2>
        {Number(b2.rpSemLastroTotal) > 0 ? (
          <div
            role="alert"
            className="mb-2 rounded-[var(--radius-md)] border border-[color:var(--color-status-erro-fg)] bg-[color:var(--color-status-erro-bg)] p-3 text-sm text-[color:var(--color-status-erro-fg)]"
          >
            <strong>RP sem lastro: {b2.rpSemLastroTotal}.</strong> O art. 25, §3º manda as
            disponibilidades — <strong>inclusive as que cobrem restos a pagar</strong> —
            permanecerem em conta vinculada. O que excede o caixa da própria fonte não pode
            contar como aplicação do mínimo.
          </div>
        ) : null}
        <TabelaDeDados<RpDaFonte>
          colunas={COLUNAS_RP}
          linhas={b2.rpPorFonte}
          keyDe={(r) => r.fonte}
          legenda="Por FONTE, nunca pelo total: o dinheiro da educação é carimbado, e o superávit de outra fonte não lastreia o RP desta."
        />
      </section>

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        <p className="mb-1 font-medium uppercase tracking-wide">Notas do bloco 2</p>
        <ul className="list-disc space-y-1 pl-4">
          {b2.notas.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </div>
    </>
  );
}

/** Um indicador do VAAT. `percentual: null` = não há o que comparar — e a tela diz. */
function CardIndicador({
  titulo,
  nota,
  ind,
}: {
  readonly titulo: string;
  readonly nota: string;
  readonly ind: IndicadorVaat;
}): React.ReactElement {
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-[color:var(--color-ink-2)]">{titulo}</p>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-2xl font-semibold tabular text-[color:var(--color-ink)]">
          {ind.percentual === null ? "—" : `${ind.percentual}%`}
        </span>
        {ind.atingiu === null ? (
          <Badge status="alerta">{ind.interruptor ?? "sem parâmetro"}</Badge>
        ) : (
          <Badge status={ind.atingiu ? "ok" : "erro"}>
            {ind.atingiu ? `≥ ${ind.minimo}%` : `abaixo de ${ind.minimo}%`}
          </Badge>
        )}
      </div>
      <p className="mt-1 text-xs text-[color:var(--color-ink-3)]">
        Aplicado <ValorMonetario valor={ind.aplicado} /> sobre uma base de{" "}
        <ValorMonetario valor={ind.base} /> · {nota}
      </p>
    </Card>
  );
}

const COLUNAS_AREA: readonly ColunaTabela<AreaDeAtuacao>[] = [
  { chave: "sub", cabecalho: "Subfunção", alinhamento: "esquerda", largura: "5rem", celula: (a) => a.subfuncao },
  { chave: "rot", cabecalho: "Área de atuação", alinhamento: "esquerda", celula: (a) => a.rotulo },
  { chave: "val", cabecalho: "Despesa", alinhamento: "direita", largura: "10rem", celula: (a) => <ValorMonetario valor={a.despesa} /> },
];

const COLUNAS_RP: readonly ColunaTabela<RpDaFonte>[] = [
  { chave: "fonte", cabecalho: "Fonte", alinhamento: "esquerda", largura: "4rem", celula: (r) => r.fonte },
  { chave: "classe", cabecalho: "Classe", alinhamento: "esquerda", largura: "7rem", celula: (r) => r.classe },
  { chave: "rp", cabecalho: "RP inscrito (b+d)", alinhamento: "direita", largura: "9rem", celula: (r) => <ValorMonetario valor={r.restosAPagar} /> },
  { chave: "caixa", cabecalho: "Caixa bruto (a)", alinhamento: "direita", largura: "9rem", celula: (r) => <ValorMonetario valor={r.caixaBruto} /> },
  {
    chave: "sem",
    cabecalho: "Sem lastro",
    alinhamento: "direita",
    largura: "9rem",
    celula: (r) => (
      <span className="inline-flex items-center gap-1.5">
        <ValorMonetario valor={r.semLastro} />
        {Number(r.semLastro) > 0 ? <Badge status="erro">Glosa</Badge> : null}
      </span>
    ),
  },
];
