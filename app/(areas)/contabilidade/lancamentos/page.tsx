import { Badge } from "../../../../components/ui/Badge";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { TabelaDeDados, type ColunaTabela } from "../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import {
  gerarDiario,
  totaisPorSubsistema,
  PortaSemBancoError,
  type LancamentoDoDiario,
} from "../../../../lib/portas/livros";
import { SelecaoESoma, type LancamentoSelecionavel } from "./SelecaoESoma";
import { somarValoresDigitados } from "../../../../lib/format/moeda";
import {
  EscopoDeLeituraError,
  ExercicioIlegivelError,
  recorteDePagina,
  type RecorteDaPagina,
} from "../../../../lib/portas/contexto";
import { dataBr, descreverRecorte } from "../../../../lib/recorte";
import { lerPeriodo } from "../../relatorios/livros/periodo";
import { FiltroDeLancamentos } from "./FiltroDeLancamentos";

/**
 * LANÇAMENTOS — a CONSULTA ANALÍTICA do razão: filtra, mostra as partidas e leva ao documento.
 *
 * ═══ ⚠️ ESTA TELA NÃO É O LIVRO DIÁRIO — E A DIFERENÇA NÃO É COSMÉTICA ═══
 * `/relatorios/livros/diario` e esta página chamam a MESMA porta (`gerarDiario`), e é de propósito:
 * uma segunda leitura do razão seria uma segunda verdade. O que muda é o PAPEL.
 *
 *   · O DIÁRIO (`/relatorios/livros/diario`) é LIVRO OBRIGATÓRIO (TR 5.92, art. 50 da LRF). Ele
 *     chama `gerarDiario` SEM FILTRO nenhum, e tem de ser assim: um livro obrigatório é a
 *     narrativa CRONOLÓGICA e COMPLETA do período. Filtrá-lo o descaracteriza — um diário com
 *     linhas omitidas não é um diário, é um extrato. Por isso ele mostra um total por lançamento
 *     e nada mais: a forma é a do livro.
 *
 *   · ESTA TELA é CONSULTA ANALÍTICA de trabalho. Ela existe para responder "onde foi parar este
 *     valor" — filtra por período, conta, subsistema e origem; abre as PARTIDAS de cada
 *     lançamento (D e C, conta a conta); e faz o DRILL até o documento que gerou o fato. Ela não
 *     é livro, não se imprime como livro e não substitui o Diário na prestação de contas.
 *
 * Em resumo: o Diário PROVA (completo, cronológico, imutável na forma); esta tela INVESTIGA
 * (recortada, expandida, navegável). Mesmo dado, duas perguntas.
 *
 * ═══ O DRILL, E O QUE FALTAVA PARA ELE EXISTIR ═══
 * `LancamentoContabil` sempre teve `origemTipo` + `origemId` (e o índice composto dos dois), mas
 * o `LancamentoDoDiario` só expunha o TIPO. "EMPENHO" diz a espécie do fato e nunca QUAL empenho —
 * um livro que afirma sem deixar conferir. O `origemId` foi ADICIONADO ao contrato do M12 (mudança
 * aditiva: quem já consumia o diário não muda uma linha), e aqui ele vira link.
 *
 * ⚠️ O MAPA `origemTipo → rota` MORA NESTA CAMADA, não no módulo. Rota é assunto de apresentação:
 * o M12 não sabe (nem deve saber) que existe uma URL `/despesa/empenhos`. E o mapa é PARCIAL de
 * propósito — origem sem rota conhecida mostra o tipo e o id em texto, sem link. Inventar um link
 * para uma tela que não existe seria pior do que não ter link: mandaria o auditor para o vazio.
 */
export const dynamic = "force-dynamic";

export default async function LancamentosPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  // ⚠️ O RECORTE MUDOU DE LUGAR — ele nasce DENTRO do try, porque agora pode RECUSAR.
  // Reaproveita o leitor de período dos livros — mesma semântica de corte (o `ate` cobre o dia
  // inteiro). Duplicá-lo aqui faria "31/12" significar coisas diferentes em duas telas do sistema.
  const { desde, ate, desdeStr, ateStr } = lerPeriodo(sp);
  const conta = umTexto(sp["conta"]);
  const subsistema = umSubsistema(sp["subsistema"]);
  const origem = umTexto(sp["origem"]);
  // T08 — os filtros que faltavam: o IDENTIFICADOR DO FATO e a FONTE.
  //
  // ⚠️ ESTA NOTA DIZIA QUE A UNIDADE "VEM DO SELETOR DO CABEÇALHO, QUE JÁ É O CONTEXTO DA
  // SESSÃO" — e a metade errada dessa frase é a que importava. O seletor de fato só oferece
  // unidades que o usuário pode ler (`SincronizarContexto` apaga da URL o que não está na
  // lista). Mas a URL não vem só do seletor: ela é digitada, salva e compartilhada. Medido
  // em `test/caracterizacao/leitura-por-unidade.test.ts`. Quem confere agora é
  // `recorteDePagina`, no servidor, a cada leitura.
  const origemId = umTexto(sp["fato"]);
  const fonte = umTexto(sp["fonte"]);

  let recorte: RecorteDaPagina;
  let lancamentos: readonly LancamentoDoDiario[];
  try {
    recorte = await recorteDePagina(sp);
    // ⚠️ OS FILTROS VÃO À PORTA, não a um `.filter()` depois. O `diario` do M12 os compõe no
    // `where` do SQL; filtrar em memória traria o razão inteiro do banco para descartar quase tudo.
    lancamentos = await gerarDiario({
      desde,
      ate,
      filtros: {
        ...(conta !== "" ? { conta } : {}),
        ...(subsistema !== undefined ? { subsistema } : {}),
        ...(origem !== "" ? { origemTipo: origem } : {}),
        ...(origemId !== "" ? { origemId } : {}),
        ...(fonte !== "" ? { fonteCodigo: fonte } : {}),
        ...(recorte.unidadeCodigo !== undefined
          ? { unidadeCodigo: recorte.unidadeCodigo }
          : {}),
      },
    });
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        {/* ⚠️ SEM `descreverRecorte(recorte)` AQUI. Este cabeçalho imprimia o recorte — e
            este é justamente o caminho em que o recorte pode NÃO EXISTIR, porque a recusa
            acontece ao montá-lo. Subtítulo fixo: um estado de erro não afirma escopo. */}
        <PageHeader titulo="Lançamentos contábeis" subtitulo="Consulta analítica do razão" />
        <EstadoVazio
          titulo={
            erro instanceof EscopoDeLeituraError
              ? "Esta unidade não está no seu acesso"
              : erro instanceof ExercicioIlegivelError
                ? "O exercício pedido não é um ano"
                : erro instanceof PortaSemBancoError
                  ? "Banco de dados não configurado"
                  : "Não foi possível consultar os lançamentos"
          }
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }

  const linhas: readonly LinhaDeLancamento[] = lancamentos.map((l) => {
    // ⚠️ SOMA EM CENTAVOS INTEIROS (string → BigInt → string), nunca `Number`. É soma de EXIBIÇÃO:
    // ela não decide nada — quem garante ΣD == ΣC é o motor de partidas do M01, na escrituração.
    // Aqui ela só mostra ao leitor que o lançamento que ele está vendo fecha.
    const totalDebito = somarValoresDigitados(l.partidas.filter((p) => p.tipo === "DEBITO").map((p) => p.valor));
    const totalCredito = somarValoresDigitados(l.partidas.filter((p) => p.tipo === "CREDITO").map((p) => p.valor));
    return { ...l, totalDebito, totalCredito, balanceado: totalDebito === totalCredito };
  });

  // A lista de origens do `select` sai do DADO do período, não de um enum inventado à mão — um enum
  // divergiria em silêncio no dia em que um módulo novo gravasse um `origemTipo` que ele não tem.
  const origensDisponiveis = [...new Set(lancamentos.map((l) => l.origemTipo))].sort();
  const desbalanceados = linhas.filter((l) => !l.balanceado).length;

  // ⚠️ OS TOTAIS VÊM DO MÓDULO. Somar aqui pareceria inofensivo — é um `reduce` — e seria
  // a segunda aritmética do razão: no dia em que o corte por natureza mudar lá, a tela
  // continuaria somando do jeito antigo, e discordaria do relatório com a mesma certeza.
  const totais = totaisPorSubsistema(lancamentos);
  const selecionaveis: readonly LancamentoSelecionavel[] = lancamentos.map((l) => ({
    id: l.id,
    rotulo: `${l.numeroControle} · ${dataBr(l.data)} · ${l.origemTipo}${l.estornoDeId !== null ? " (estorno)" : ""} — ${l.historico.slice(0, 70)}`,
    partidas: l.partidas.map((p) => ({
      tipo: p.tipo,
      subsistema: p.subsistema,
      valor: p.valor,
    })),
  }));

  const cabecalho = (
    <PageHeader
      titulo="Lançamentos contábeis"
      subtitulo={`${descreverRecorte(recorte)} — consulta analítica do razão: partidas, subsistema e drill até o documento de origem`}
      acoes={
        <FiltroDeLancamentos
          desde={desdeStr}
          ate={ateStr}
          conta={conta}
          subsistema={subsistema ?? ""}
          origem={origem}
          fato={origemId}
          fonte={fonte}
          origensDisponiveis={origensDisponiveis}
        />
      }
    />
  );

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      {cabecalho}

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs leading-relaxed text-[color:var(--color-ink-2)]">
        Consulta <strong>analítica</strong> — recortada, com as partidas abertas e link para o
        documento de origem. Ela <strong>não substitui</strong> o{" "}
        <a href="/relatorios/livros/diario" className="text-[color:var(--color-primary)] hover:underline">Livro Diário</a>,
        que é o livro obrigatório: completo, cronológico e sem filtro. O <strong>subsistema</strong> de
        cada partida (orçamentário / patrimonial / controle) é a <em>natureza da informação</em> do
        MSC como ela foi de fato escriturada — é atributo da partida, não da conta.
      </div>

      {desbalanceados > 0 ? (
        // ⚠️ NOMEAR, NÃO ESCONDER. ΣD == ΣC é invariante do M01; se uma linha não fecha, o problema
        // é grave e a tela tem de gritar em vez de exibir o número torto como se fosse normal.
        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink)]">
          <strong>{desbalanceados} lançamento(s) com ΣD ≠ ΣC</strong> no recorte. Isso não deveria
          acontecer: o balanceamento é invariante do motor de partidas. Verifique a consistência do
          razão em <a href="/relatorios/consistencia" className="text-[color:var(--color-primary)] hover:underline">Relatórios · Consistência</a>.
        </div>
      ) : null}

      {/*
        T08 — TOTALIZADORES POR SUBSISTEMA.
        ⚠️ A DIFERENÇA POR SUBSISTEMA, e não só o total geral: um conjunto pode fechar no
        total com o orçamentário faltando 100 e o patrimonial sobrando 100. O total geral
        diria "fecha", e os DOIS subsistemas estariam errados.
      */}
      {totais.length === 0 ? null : (
        <div className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4 shadow-[var(--shadow-card)]">
          <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">
            Totais do recorte, por subsistema
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[30rem] text-xs">
              <thead>
                <tr className="border-b border-[color:var(--color-border)] text-[color:var(--color-ink-3)]">
                  <th scope="col" className="py-1 pr-3 text-left font-medium">Subsistema</th>
                  <th scope="col" className="py-1 pr-3 text-right font-medium">Débito</th>
                  <th scope="col" className="py-1 pr-3 text-right font-medium">Crédito</th>
                  <th scope="col" className="py-1 text-right font-medium">Diferença</th>
                </tr>
              </thead>
              <tbody>
                {totais.map((t) => (
                  <tr key={t.subsistema} className="border-b border-[color:var(--color-border)] last:border-0">
                    <td className="py-1 pr-3 text-[color:var(--color-ink-2)]">{t.subsistema}</td>
                    <td className="py-1 pr-3 text-right"><ValorMonetario valor={t.debito} /></td>
                    <td className="py-1 pr-3 text-right"><ValorMonetario valor={t.credito} /></td>
                    <td className="py-1 text-right font-semibold">
                      <ValorMonetario valor={t.diferenca} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-[color:var(--color-ink-2)]">
            Diferença zero em cada linha é o esperado. O recorte pode conter apenas um lado
            de um lançamento quando o filtro é por conta — nesse caso a diferença reflete o
            recorte, não um erro do razão.
          </p>
        </div>
      )}

      {linhas.length === 0 ? null : <SelecaoESoma lancamentos={selecionaveis} />}

      {linhas.length === 0 ? (
        <EstadoVazio
          titulo="Sem lançamentos no recorte"
          descricao={`Nenhum lançamento entre ${dataBr(desde)} e ${dataBr(ate)}${conta !== "" ? ` na conta ${conta}` : ""}${subsistema !== undefined ? ` no subsistema ${subsistema.toLowerCase()}` : ""}${origem !== "" ? ` com origem ${origem}` : ""}. Amplie o período ou remova um filtro.`}
        />
      ) : (
        <TabelaDeDados
          colunas={colunasDe(recorte.exercicio)}
          linhas={linhas}
          keyDe={(l) => l.id}
          legenda={`${linhas.length} lançamento(s) · valores em R$ · ordem (data do fato, registro, id) · D e C por lançamento; cada partida traz sua conta e seu subsistema.`}
        />
      )}
    </div>
  );
}

type LinhaDeLancamento = LancamentoDoDiario & {
  readonly totalDebito: string;
  readonly totalCredito: string;
  readonly balanceado: boolean;
};

function umTexto(v: string | string[] | undefined): string {
  const bruto = Array.isArray(v) ? v[0] : v;
  return bruto?.trim() ?? "";
}

/** Só os três valores do enum `Subsistema` passam — lixo na URL vale "sem filtro". */
function umSubsistema(
  v: string | string[] | undefined
): "ORCAMENTARIO" | "PATRIMONIAL" | "CONTROLE" | undefined {
  const bruto = umTexto(v);
  return bruto === "ORCAMENTARIO" || bruto === "PATRIMONIAL" || bruto === "CONTROLE" ? bruto : undefined;
}

/**
 * O MAPA `origemTipo → rota` — o drill até o DOCUMENTO que gerou o lançamento.
 *
 * ⚠️ PARCIAL DE PROPÓSITO. Só entra aqui a espécie cuja tela EXISTE. O que não está mapeado
 * aparece como texto (tipo + id), sem link: uma origem sem destino é informação honesta; um link
 * quebrado é uma promessa falsa a quem está auditando.
 *
 * ⚠️ AS VARIANTES DO MESMO DOCUMENTO APONTAM PARA A MESMA TELA. "EMPENHO", "EMPENHO_ANULADO" e
 * "ANULACAO_PARCIAL_EMPENHO" são atos DIFERENTES sobre o MESMO empenho — e o `origemId` de todos
 * é o id do empenho. Levar os três para `/despesa/empenhos` é o comportamento certo: o auditor
 * quer a NE, não o ato.
 */
/** A Nota de Empenho do empenho de `origemId`, no exercício do recorte da tela. */
function neDoEmpenho(origemId: string, exercicio: number): string {
  return `/despesa/empenhos/ne?id=${encodeURIComponent(origemId)}&exercicio=${exercicio}`;
}

interface DestinoDoDrill {
  readonly rota: string;
  readonly documento: string;
  /**
   * O DOCUMENTO EM SI, quando ele existe como emissão própria — recebe o `origemId` e o exercício
   * e devolve a URL da rota que o imprime. Quando presente, o drill leva ao PAPEL; quando ausente,
   * leva à lista onde o documento pode ser localizado.
   */
  readonly emissao?: (origemId: string, exercicio: number) => string;
}

const ROTA_DA_ORIGEM: Readonly<Record<string, DestinoDoDrill>> = {
  // ── Despesa: a NOTA DE EMPENHO e sua cadeia (o caminho do roteiro de demonstração). ──
  // ⚠️ AQUI O DRILL CHEGA AO DOCUMENTO, não à lista: `/despesa/empenhos/ne?id=` já emite a Nota de
  // Empenho em PDF, e o `origemId` destas cinco espécies É o id do empenho. Um auditor que sai do
  // lançamento quer a NE na mão — mandá-lo à lista para procurar a linha certa seria devolver-lhe
  // o trabalho que o sistema pode fazer. O exercício vai junto porque a rota o exige no recorte.
  EMPENHO: { rota: "/despesa/empenhos", documento: "Nota de Empenho", emissao: neDoEmpenho },
  EMPENHO_DE_RESERVA: { rota: "/despesa/empenhos", documento: "Nota de Empenho", emissao: neDoEmpenho },
  EMPENHO_ANULADO: { rota: "/despesa/empenhos", documento: "Nota de Empenho", emissao: neDoEmpenho },
  ANULACAO_PARCIAL_EMPENHO: { rota: "/despesa/empenhos", documento: "Nota de Empenho", emissao: neDoEmpenho },
  ESTORNO_ANULACAO_PARCIAL_EMPENHO: { rota: "/despesa/empenhos", documento: "Nota de Empenho", emissao: neDoEmpenho },
  LIQUIDACAO: { rota: "/despesa/liquidacoes", documento: "Liquidação" },
  LIQUIDACAO_ANULADA: { rota: "/despesa/liquidacoes", documento: "Liquidação" },
  ANULACAO_PARCIAL_LIQUIDACAO: { rota: "/despesa/liquidacoes", documento: "Liquidação" },
  PAGAMENTO: { rota: "/despesa/pagamentos", documento: "Ordem de Pagamento" },
  PAGAMENTO_ANULADO: { rota: "/despesa/pagamentos", documento: "Ordem de Pagamento" },
  ANULACAO_PARCIAL_PAGAMENTO: { rota: "/despesa/pagamentos", documento: "Ordem de Pagamento" },
  // ── Receita ──
  ARRECADACAO: { rota: "/receita/arrecadacoes", documento: "Arrecadação" },
  ANULACAO_RECEITA: { rota: "/receita/arrecadacoes", documento: "Arrecadação" },
  // ── Planejamento / créditos ──
  CREDITO_ADICIONAL: { rota: "/planejamento/creditos-adicionais", documento: "Decreto de crédito" },
  CREDITO_ANULADO: { rota: "/planejamento/creditos-adicionais", documento: "Decreto de crédito" },
  LOA: { rota: "/planejamento/qdd", documento: "Dotação inicial (LOA)" },
};

/**
 * A CÉLULA DO DRILL — em dois níveis, porque nem toda origem tem documento emitido.
 *
 * ⚠️ QUANDO HÁ EMISSÃO (hoje, o empenho), o link primário abre o DOCUMENTO: a Nota de Empenho em
 * PDF, com o mesmo rodapé de hash SHA-256 de qualquer emissão do sistema. É o fim do caminho que o
 * auditor quer — do lançamento ao papel que o originou, sem escala.
 *
 * ⚠️ QUANDO NÃO HÁ, o link leva à LISTA do documento, porque página de detalhe por id ainda não
 * existe no app. PENDÊNCIA NOMEADA (rota-de-detalhe-por-documento). Nesse caso o `origemId` fica
 * VISÍVEL ao lado (monoespaçado), para quem audita localizar a linha na lista de destino. Esconder
 * o id e prometer um detalhe que não abre seria trocar uma limitação declarada por uma surpresa.
 */
function Drill({ l, exercicio }: { readonly l: LinhaDeLancamento; readonly exercicio: number }): React.ReactElement {
  const destino = ROTA_DA_ORIGEM[l.origemTipo];
  const rotulo = <span className="text-xs text-[color:var(--color-ink-2)]">{l.origemTipo}</span>;

  // Origem sem documento externo (lançamento manual, encerramento): não há a que fazer drill.
  if (l.origemId === null || destino === undefined) {
    return (
      <span title={l.origemId === null ? "Lançamento sem documento de origem (manual ou de encerramento)." : `Origem "${l.origemTipo}" ainda não tem tela própria no sistema.`}>
        {rotulo}
      </span>
    );
  }

  // Há emissão: o link primário É o documento; a lista fica como caminho secundário, para quem
  // quer o contexto (os outros empenhos da mesma UG) em vez do papel.
  if (destino.emissao !== undefined) {
    return (
      <span className="flex flex-col gap-0.5">
        <a
          href={destino.emissao(l.origemId, exercicio)}
          target="_blank"
          rel="noopener"
          className="text-xs font-medium text-[color:var(--color-primary)] hover:underline"
          title={`Abre ${destino.documento} em PDF — origem ${l.origemTipo}, documento ${l.origemId}`}
        >
          {destino.documento} (PDF) →
        </a>
        <a href={destino.rota} className="text-[10px] text-[color:var(--color-ink-3)] hover:underline">
          ver na lista
        </a>
      </span>
    );
  }

  return (
    <span className="flex flex-col gap-0.5">
      <a
        href={destino.rota}
        className="text-xs text-[color:var(--color-primary)] hover:underline"
        title={`${destino.documento} — origem ${l.origemTipo}, documento ${l.origemId}`}
      >
        {destino.documento} →
      </a>
      <span className="font-mono text-[10px] text-[color:var(--color-ink-3)]" title={`origemId: ${l.origemId}`}>
        {l.origemId}
      </span>
    </span>
  );
}

/** As PARTIDAS abertas — o que distingue esta consulta do Diário: D e C, conta a conta. */
function Partidas({ l }: { readonly l: LinhaDeLancamento }): React.ReactElement {
  return (
    <span className="flex flex-col gap-0.5">
      {l.partidas.map((p, i) => (
        <span key={`${p.conta}-${p.tipo}-${i}`} className="flex items-baseline gap-2 text-xs">
          {/* D/C em largura fixa para os códigos de conta alinharem verticalmente na coluna. */}
          <span className={`w-3 shrink-0 font-semibold ${p.tipo === "DEBITO" ? "text-[color:var(--color-ink)]" : "text-[color:var(--color-ink-2)]"}`}>
            {p.tipo === "DEBITO" ? "D" : "C"}
          </span>
          <span className="font-mono text-[color:var(--color-ink)]">{p.conta}</span>
          <span className="text-[10px] uppercase tracking-wide text-[color:var(--color-ink-3)]" title="Subsistema da partida — a natureza da informação do MSC, como escriturada.">
            {p.subsistema.toLowerCase()}
          </span>
          <ValorMonetario valor={p.valor} className="ml-auto text-xs" />
        </span>
      ))}
    </span>
  );
}

/**
 * As colunas dependem do EXERCÍCIO porque a coluna de drill monta a URL da Nota de Empenho, e a
 * rota de emissão exige o exercício no recorte. Constante de módulo não teria como sabê-lo.
 */
const colunasDe = (exercicio: number): readonly ColunaTabela<LinhaDeLancamento>[] => [
  { chave: "data", cabecalho: "Data", alinhamento: "esquerda", largura: "6rem", celula: (l) => dataBr(l.data) },
  {
    chave: "nc",
    cabecalho: "Nº controle",
    alinhamento: "esquerda",
    largura: "9rem",
    celula: (l) => (
      <span className="font-mono text-xs" title={`Natureza: ${l.natureza} · registrado por ${l.criadoPor}`}>
        {l.numeroControle}
      </span>
    ),
  },
  { chave: "hist", cabecalho: "Histórico", alinhamento: "esquerda", celula: (l) => l.historico },
  { chave: "partidas", cabecalho: "Partidas (conta · subsistema · valor)", alinhamento: "esquerda", largura: "24rem", celula: (l) => <Partidas l={l} /> },
  {
    chave: "dc",
    cabecalho: "ΣD / ΣC",
    alinhamento: "direita",
    largura: "10rem",
    celula: (l) => (
      <span className="flex flex-col items-end gap-0.5">
        <ValorMonetario valor={l.totalDebito} />
        <ValorMonetario valor={l.totalCredito} className="text-[color:var(--color-ink-2)]" />
        {l.balanceado ? null : <Badge status="erro">não fecha</Badge>}
      </span>
    ),
  },
  { chave: "origem", cabecalho: "Origem (drill)", alinhamento: "esquerda", largura: "12rem", celula: (l) => <Drill l={l} exercicio={exercicio} /> },
  {
    chave: "estorno",
    cabecalho: "Estorno de",
    alinhamento: "esquerda",
    largura: "8rem",
    /*
      ⚠️ A RELAÇÃO DE ESTORNO NA TELA, e não deduzida pelo valor espelhado.
      A correção neste sistema é um lançamento NOVO apontando para o original — nunca um
      UPDATE. Sem esta coluna, quem lê vê dois lançamentos que se anulam e tem de adivinhar
      qual é a correção de qual; com um estorno parcial, adivinhar deixa de funcionar.
    */
    celula: (l) =>
      l.estornoDeId === null ? (
        <span className="text-[color:var(--color-ink-3)]">—</span>
      ) : (
        <a
          href={`?fato=${encodeURIComponent(l.origemId ?? "")}`}
          title={`Estorna o lançamento ${l.estornoDeId}`}
          className="text-xs text-[color:var(--color-primary)] hover:underline"
        >
          ver o par
        </a>
      ),
  },
];
