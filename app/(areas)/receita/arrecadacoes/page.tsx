import { Badge } from "../../../../components/ui/Badge";
import { janelaCivilDoMes } from "../../../../packages/datas/index";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import {
  TabelaDeDados,
  type ColunaTabela,
} from "../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import {
  lerArrecadacoes,
  lerContasBancariasParaGuia,
  lerNaturezasPrevistas,
  PortaSemBancoError,
  type ArrecadacaoDaTela,
  type ArrecadacaoDoPeriodo,
  type NaturezaDaTela,
} from "../../../../lib/portas/arrecadacao";
import { dataBr, exercicioAutorizado, ExercicioIlegivelError } from "../../../../lib/recorte";
import { BotaoCsv } from "../../../../components/ui/BotaoCsv";
import { BotaoPdf } from "../../../../components/ui/BotaoPdf";
import { paraCsv } from "../../../../lib/csv/csv";
import { formatarMoeda } from "../../../../lib/format/moeda";
import { FormArrecadacao } from "./FormArrecadacao";
import { lerCopiaDaArrecadacao, type CopiaDaArrecadacao } from "../../../../lib/portas/duplicacao";
import { AvisoDeDuplicacao, idParaDuplicar, LinkDuplicar } from "../../../../components/ui/Duplicacao";
import { AnulacoesDaTela, FormAnularReceita } from "./FormAnularReceita";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";

import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
/**
 * ARRECADAÇÃO — as guias do exercício e o total realizado LÍQUIDO (TR 4.59).
 *
 * ⚠️ ESTA PÁGINA IGNORA O SELETOR DE UNIDADE, DE PROPÓSITO. A receita é do ENTE (CF art. 167,
 * IV): a `ReceitaArrecadada` tem natureza e fonte, e NÃO tem unidade orçamentária — a
 * Secretaria de Saúde não "possui" o IPTU que entrou. Filtrar receita por UG ensinaria ao
 * usuário um conceito que a Constituição não tem. A vinculação por FONTE é outra coisa, e ela
 * está na tabela.
 *
 * ⚠️ A ANULAÇÃO (4.61) é ato PRÓPRIO, com guia própria e total (o serviço não tem parcial). Cada
 * arrecadação viva ganha a ação "Anular"; a guia já anulada não a mostra (não se anula duas vezes).
 */
export const dynamic = "force-dynamic";

export default async function ArrecadacoesPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_RECEITA");
  const sp = await searchParams;

  // ⚠️ SÓ O EXERCÍCIO, SEM UNIDADE — e o subtítulo desta tela já dizia por quê: "a receita
  // não tem UG". As duas leituras (`lerArrecadacoes`, `lerNaturezasPrevistas`) não recebem
  // unidade nenhuma. Impor recusa de `?ug=` aqui quebraria link salvo sem proteger dado
  // algum, porque não há dado de outra unidade a proteger.
  //
  // O que ela ganha é a recusa do exercício ilegível: `?exercicio=abc` virava 2026 em
  // silêncio, e a tela afirmava as guias de um ano que ninguém pediu.
  let exercicio: number;
  try {
    exercicio = exercicioAutorizado(sp);
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader
          titulo="Arrecadação"
          subtitulo="Guias arrecadadas pelo ente, por natureza e fonte"
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
      titulo="Arrecadação"
      subtitulo={`Exercício ${exercicio}: guias arrecadadas pelo ente, por natureza e fonte.`}
    />
  );

  // V37 — o recorte que os demonstrativos da receita mandam (?natureza= e ?mes=AAAA-MM): a lista e o total seguem.
  // V37 — também o começo do código (a categoria, a origem ou a espécie do RREO) e um intervalo de meses (?de=, ?ate=).
  const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
  const lerMes = (k: string): string | undefined => {
    const v = sp[k];
    return typeof v === "string" && MES.test(v) ? v : undefined;
  };
  const naturezaPedida = typeof sp["natureza"] === "string" && /^\d{1,8}$/.test(sp["natureza"]) ? sp["natureza"] : undefined;
  const mesDe = lerMes("mes") ?? lerMes("de");
  const mesAte = lerMes("mes") ?? lerMes("ate") ?? mesDe;
  const mesPedido = mesDe !== undefined && mesAte !== undefined && mesDe <= mesAte ? mesDe : undefined;
  const janela = mesPedido !== undefined && mesAte !== undefined ? { inicio: janelaCivilDoMes(mesPedido).inicio, fim: janelaCivilDoMes(mesAte).fim } : undefined;
  const recorteDaLista = {
    ...(naturezaPedida !== undefined ? { naturezaCodigo: naturezaPedida } : {}),
    ...(janela !== undefined ? { inicio: janela.inicio, fim: janela.fim } : {}),
  };
  let periodo: ArrecadacaoDoPeriodo;
  let naturezas: readonly NaturezaDaTela[];
  let contas: Awaited<ReturnType<typeof lerContasBancariasParaGuia>>;
  // V36 (TR 5.10.2.5) — "duplicar" na lista: o formulário vem preenchido com a guia escolhida.
  const duplicar = idParaDuplicar(sp);
  let copia: CopiaDaArrecadacao | null = null;
  try {
    [periodo, naturezas, contas, copia] = await Promise.all([
      lerArrecadacoes({ exercicio, ...recorteDaLista }),
      lerNaturezasPrevistas({ exercicio }),
      lerContasBancariasParaGuia(),
      duplicar === "" ? Promise.resolve(null) : lerCopiaDaArrecadacao(duplicar),
    ]);
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        {cabecalho}
        <EstadoVazio
          titulo={
            erro instanceof PortaSemBancoError
              ? "Serviço indisponível"
              : "Não foi possível carregar a arrecadação"
          }
          descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      {cabecalho}

      {naturezaPedida !== undefined || mesPedido !== undefined ? (
        <p className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] px-3 py-2 text-sm" data-recorte-da-lista>
          <span>
            Mostrando só as guias {naturezaPedida !== undefined ? (naturezaPedida.length === 8 ? <>da receita <strong>{naturezaPedida}</strong></> : <>das receitas de código iniciado por <strong>{naturezaPedida}</strong></>) : null}
            {mesPedido !== undefined && mesAte !== undefined ? (mesPedido === mesAte ? <> de <strong>{mesPedido.split("-").reverse().join("/")}</strong></> : <> de <strong>{mesPedido.split("-").reverse().join("/")}</strong> a <strong>{mesAte.split("-").reverse().join("/")}</strong></>) : null}.
          </span>
          <a className="text-[color:var(--color-primary)] underline" href={`/receita/arrecadacoes?exercicio=${String(exercicio)}`}>Ver todas</a>
        </p>
      ) : null}

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        O <strong>total</strong> corresponde à receita realizada líquida (arrecadações menos anulações),
        apurada pela <strong>data de arrecadação</strong>; a guia anulada permanece na lista, e a
        anulação aparece com valor negativo. Depósitos que pertencem a <strong>mais de uma fonte</strong>{" "}
        (FPM, ICMS partilhado, convênio com contrapartida) são registrados em{" "}
        <strong>Repartir uma guia entre fontes</strong>.
      </div>

      <AvisoDeDuplicacao pedido={duplicar} achado={copia !== null} />
      <FormArrecadacao
        key={copia === null ? "nova" : duplicar}
        copia={copia ?? undefined}
        exercicio={exercicio}
        naturezas={naturezas.map((n) => ({
          naturezaCodigo: n.naturezaCodigo,
          naturezaDescricao: n.naturezaDescricao,
          fonteCodigo: n.fonteCodigo,
        }))}
        contas={contas.map((c) => ({ codigo: c.codigo, descricao: c.descricao, fonteCodigo: c.fonteCodigo, contaContabil: c.contaContabil }))}
      />

      {periodo.linhas.length === 0 ? (
        <EstadoVazio
          titulo="Sem arrecadação"
          descricao={`Nenhuma guia registrada no exercício ${exercicio}.`}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="flex items-center gap-2">
              <BotaoCsv csv={csvArrecadacoes(periodo.linhas)} nomeArquivo={`arrecadacoes-${exercicio}.csv`} />
              <BotaoPdf href={`/receita/arrecadacoes/pdf?exercicio=${exercicio}`} />
              <a
                className="text-xs font-medium text-[color:var(--color-primary)] hover:underline"
                href={`/receita/arrecadacoes/distribuir?exercicio=${exercicio}`}
              >
                Repartir uma guia entre fontes
              </a>
            </span>
            <span className="flex items-baseline gap-2">
              <span className="text-[color:var(--color-ink-2)]">Receita realizada líquida:</span>
              <strong className="text-base"><ValorMonetario valor={periodo.total} comSimbolo /></strong>
            </span>
          </div>
          {/* ⚠️ O PROVEDOR ENVOLVE A TABELA (V11 V9.3): a linha que se anula SOME, e com ela sumia
              a confirmação. Ver o cabeçalho de `FormAnularReceita.tsx`. */}
          <AnulacoesDaTela>
            <TabelaDeDados
              colunas={colunasArrecadacao(
                // As receitas JÁ anuladas: a `anulacaoDeId` de uma linha de anulação aponta a guia que ela nega.
                new Set(periodo.linhas.filter((l) => l.anulacaoDeId !== null).map((l) => l.anulacaoDeId!)),
                exercicio
              )}
              linhas={periodo.linhas}
              keyDe={(l) => l.id}
              legenda={`${periodo.linhas.length} guia(s) · valores em R$ · o total desconta as anulações.`}
            />
          </AnulacoesDaTela>
        </>
      )}
    </div>
  );
}

function colunasArrecadacao(anuladas: ReadonlySet<string>, exercicio: number): readonly ColunaTabela<ArrecadacaoDaTela>[] {
  return [...COLUNAS, colunaAcoes(anuladas, exercicio)];
}

function colunaAcoes(anuladas: ReadonlySet<string>, exercicio: number): ColunaTabela<ArrecadacaoDaTela> {
  return {
    chave: "acoes",
    cabecalho: "Ações",
    alinhamento: "esquerda",
    largura: "9rem",
    // Toda guia emite o seu documento (F3). Só a ARRECADAÇÃO viva se anula: não a própria anulação
    // (sinal −1), nem uma guia já anulada.
    celula: (l) => (
      <span className="flex flex-wrap items-center gap-2">
        <a href={`/receita/arrecadacoes/guia?id=${l.id}&exercicio=${exercicio}`} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-[color:var(--color-primary)] hover:underline">
          Emitir guia
        </a>
        {l.sinal === -1 ? null : <LinkDuplicar href={`/receita/arrecadacoes?exercicio=${exercicio}&duplicar=${l.id}`} />}
        {l.sinal === -1 || anuladas.has(l.id) ? null : <FormAnularReceita receitaId={l.id} />}
      </span>
    ),
  };
}

const COLUNAS: readonly ColunaTabela<ArrecadacaoDaTela>[] = [
  {
    chave: "data",
    cabecalho: "Data",
    alinhamento: "esquerda",
    largura: "6rem",
    celula: (l) => dataBr(l.dataArrecadacao),
  },
  {
    chave: "guia",
    cabecalho: "Guia",
    alinhamento: "esquerda",
    largura: "7rem",
    // V33 — o número abre a arrecadação e a cadeia dela (classificação, conta, conciliação, razão).
    celula: (l) => <a href={`/receita/arrecadacoes/${l.id}`} className="text-[color:var(--color-primary)] underline">{l.numeroReceita}</a>,
  },
  {
    chave: "natureza",
    cabecalho: "Natureza",
    alinhamento: "esquerda",
    largura: "7rem",
    celula: (l) => l.naturezaCodigo,
  },
  {
    chave: "descricao",
    cabecalho: "Descrição",
    alinhamento: "esquerda",
    celula: (l) => l.naturezaDescricao,
  },
  {
    chave: "fonte",
    cabecalho: "Fonte",
    alinhamento: "esquerda",
    largura: "9rem",
    // ⚠️ V16/C30 — A GUIA REPARTIDA MOSTRA AS FONTES E OS VALORES, e não a fonte padrão dela. Uma
    // coluna que dissesse "500" numa guia repartida entre 500 e 540 seria a mesma meia-verdade que
    // o modelo tinha antes desta unidade — e a única visível para quem confere pela tela.
    celula: (l) =>
      l.fontes.length === 0 ? (
        l.fonteCodigo
      ) : (
        <span className="flex flex-col gap-0.5">
          {l.fontes.map((f) => (
            <span className="whitespace-nowrap text-xs" key={f.codigo}>
              {f.codigo} · <ValorMonetario valor={f.valor} />
            </span>
          ))}
        </span>
      ),
  },
  {
    chave: "co",
    cabecalho: "CO",
    alinhamento: "esquerda",
    largura: "4rem",
    celula: (l) => l.coCodigo ?? "—",
  },
  {
    chave: "tipo",
    cabecalho: "Tipo",
    alinhamento: "esquerda",
    largura: "7rem",
    celula: (l) =>
      l.sinal === -1 ? (
        <Badge status="erro">Anulação</Badge>
      ) : (
        <Badge status="neutro">Arrecadação</Badge>
      ),
  },
  {
    chave: "valor",
    cabecalho: "Valor",
    alinhamento: "direita",
    largura: "10rem",
    // ⚠️ O SINAL ENTRA AQUI, não no dado: a anulação é gravada com valor POSITIVO
    // (o valor da guia que ela anula) e sinal −1. A tela mostra o efeito dela sobre
    // o total — que é o que o leitor está somando com o olho.
    celula: (l) => (
      <ValorMonetario valor={l.sinal === -1 ? `-${l.valor}` : l.valor} />
    ),
  },
];

/** ⚠️ O CSV É A TELA (TR 7.48) — a anulação leva o sinal −, como na coluna Valor. */
function csvArrecadacoes(linhas: readonly ArrecadacaoDaTela[]): string {
  return paraCsv(
    ["Data", "Guia", "Natureza", "Descrição", "Fonte", "CO", "Tipo", "Valor"],
    linhas.map((l) => [
      dataBr(l.dataArrecadacao), l.numeroReceita, l.naturezaCodigo, l.naturezaDescricao,
      // ⚠️ V16/C30 — A GUIA REPARTIDA EXPORTA AS FONTES E OS VALORES, e não só a fonte padrão: o
      // CSV é o que alguém abre na planilha para conferir por fonte, e ali a meia-verdade não
      // tem como ser notada.
      l.fontes.length === 0
        ? l.fonteCodigo
        : l.fontes.map((f) => `${f.codigo}=${f.valor}`).join(" "),
      l.coCodigo ?? "—", l.sinal === -1 ? "Anulação" : "Arrecadação",
      formatarMoeda(l.sinal === -1 ? `-${l.valor}` : l.valor).texto,
    ])
  );
}
