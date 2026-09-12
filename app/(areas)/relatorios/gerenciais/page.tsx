import { Badge, type StatusBadge } from "../../../../components/ui/Badge";
import { BotaoCsv } from "../../../../components/ui/BotaoCsv";
import { BotaoPdf } from "../../../../components/ui/BotaoPdf";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { TabelaDeDados, type ColunaTabela } from "../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import {
  lerVocabularioDeEmpenhos,
  listarEmpenhosDaExecucao,
  PortaSemBancoError,
  type EmpenhoDaTela,
  type VocabularioDaTela,
} from "../../../../lib/portas/empenho";
import { paraCsv } from "../../../../lib/csv/csv";
import { formatarMoeda } from "../../../../lib/format/moeda";
import { mascararCpfCnpj } from "../../../../lib/format/mascaras";
import {
  EscopoDeLeituraError,
  ExercicioIlegivelError,
  recorteDePagina,
  type RecorteDaPagina,
} from "../../../../lib/portas/contexto";
import { dataBr, descreverRecorte } from "../../../../lib/recorte";
import { descreverFiltroGerencial, recorteGerencialDe } from "./filtro";
import { FiltroGerencial } from "./FiltroGerencial";

/**
 * RELATÓRIOS GERENCIAIS — A EXECUÇÃO DA DESPESA POR CREDOR E POR FONTE.
 *
 * O roteiro que esta tela serve é um só: consultar os empenhos, recortar por credor e
 * fonte, imprimir o PDF, exportar o CSV. As três saídas nascem do MESMO recorte, e é isso
 * que permite conferir uma contra a outra.
 *
 * ═══ ⚠️ O FILTRO DESCE AO SQL — NÃO HÁ PÓS-FILTRO EM JS ═══
 * A regra está declarada no `diario` (modules/m12-relatorios/livros.ts): "os filtros
 * compõem o `where` — zero pós-filtro em JS onde o SQL alcança". Aqui ela é mais que
 * eficiência: filtrar em memória separaria o empenho das ANULAÇÕES dele (que a busca
 * traz junto de propósito), e o `empenhadoLiquido` passaria a mostrar dinheiro que já não
 * existe. O `where` do M05 sabe alcançar a anulação pelo empenho-pai; um `.filter()` na
 * borda, não.
 *
 * ═══ ⚠️ "CREDOR" AQUI É UM DOCUMENTO, E CONTINUA SENDO — MESMO DEPOIS DO CADASTRO ═══
 * O `Empenho` carrega uma STRING (`credorCpfCnpj`): o documento como foi informado NO ATO.
 * O ENT01 criou o cadastro de pessoas (M19), mas isso NÃO transformou esta coluna em chave
 * estrangeira, e não deveria — um empenho de 2026 não pode mudar de credor porque alguém
 * corrigiu um cadastro em 2027.
 *
 * Logo o filtro continua sendo CASAMENTO EXATO POR CPF/CNPJ, e a tela oferece um `select`
 * dos documentos que de fato existem no exercício — nunca um campo "nome do credor", que
 * devolveria vazio para todo empenho cujo credor não esteja cadastrado, fazendo o usuário
 * concluir "este fornecedor não recebeu nada". Prometer uma busca que o banco não pode
 * cumprir é a forma mais barata de um sistema mentir.
 *
 * PENDÊNCIA `NOME-DO-CREDOR-NA-CONSULTA`: exibir, AO LADO do documento, o nome cadastrado
 * quando ele existir — como enfeite de leitura, jamais como filtro. Enquanto houver
 * empenho de credor não cadastrado, filtrar por nome esconde execução real.
 */
export const dynamic = "force-dynamic";

export default async function RelatoriosGerenciaisPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  const filtro = recorteGerencialDe(sp);
  const recorteEmTexto = descreverFiltroGerencial(filtro);

  // ⚠️ AQUI NÃO HÁ VARIÁVEL `cabecalho` — o que carrega o recorte é o `subtitulo`, e é ele
  // que nasce DEPOIS do try. `descreverRecorte(recorte)` só pode ser escrito quando o
  // recorte existe E foi autorizado; o `catch` usa subtítulo fixo.
  //
  // ⚠️ E O `filtro` (credor e fonte) CONTINUA ANTES, de propósito: ele recorta DENTRO do
  // que o usuário pode ler, não decide o que ele pode ler. São perguntas diferentes.
  let recorte: RecorteDaPagina;
  let empenhos: readonly EmpenhoDaTela[];
  let vocabulario: VocabularioDaTela;
  try {
    recorte = await recorteDePagina(sp);
    // ⚠️ AS DUAS LEITURAS TÊM RECORTES DIFERENTES DE PROPÓSITO. A tabela leva o filtro; o
    // vocabulário do `select`, não — um vocabulário já filtrado colapsaria para a opção
    // escolhida e prenderia o usuário nela.
    [empenhos, vocabulario] = await Promise.all([
      listarEmpenhosDaExecucao({
        exercicio: recorte.exercicio,
        unidadeCodigo: recorte.unidadeCodigo,
        credorCpfCnpj: filtro.credorCpfCnpj,
        fonteCodigo: filtro.fonteCodigo,
      }),
      lerVocabularioDeEmpenhos({
        exercicio: recorte.exercicio,
        unidadeCodigo: recorte.unidadeCodigo,
      }),
    ]);
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader
          titulo="Relatórios gerenciais — despesa por credor e fonte"
          subtitulo="Execução da despesa por credor (CPF/CNPJ) e fonte de recursos"
        />
        <EstadoVazio
          titulo={
            erro instanceof EscopoDeLeituraError
              ? "Esta unidade não está no seu acesso"
              : erro instanceof ExercicioIlegivelError
                ? "O exercício pedido não é um ano"
                : erro instanceof PortaSemBancoError
                  ? "Banco de dados não configurado"
                  : "Não foi possível ler a execução da despesa"
          }
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }

  // ⚠️ AQUI: `recorte` autorizado, e só agora o subtítulo pode afirmar o escopo.
  const subtitulo =
    `${descreverRecorte(recorte)} — execução da despesa por credor (CPF/CNPJ) e fonte de recursos` +
    (recorteEmTexto.length > 0 ? ` · filtrado: ${recorteEmTexto.join(" · ")}` : "");

  // ⚠️ A QUERY DO PDF É A DA TELA. O botão "Imprimir PDF" é só um link: o recorte
  // atravessa pela URL, e o papel sai igual ao que está na frente do usuário.
  const query = new URLSearchParams({ exercicio: String(recorte.exercicio) });
  if (recorte.unidadeCodigo !== undefined) query.set("ug", recorte.unidadeCodigo);
  if (filtro.credorCpfCnpj !== undefined) query.set("credor", filtro.credorCpfCnpj);
  if (filtro.fonteCodigo !== undefined) query.set("fonte", filtro.fonteCodigo);

  const sufixoArquivo =
    (filtro.credorCpfCnpj !== undefined ? `-credor-${filtro.credorCpfCnpj}` : "") +
    (filtro.fonteCodigo !== undefined ? `-fonte-${filtro.fonteCodigo}` : "");

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader
        titulo="Relatórios gerenciais — despesa por credor e fonte"
        subtitulo={subtitulo}
        acoes={
          <FiltroGerencial
            credores={vocabulario.credores}
            fontes={vocabulario.fontes}
            credor={filtro.credorCpfCnpj ?? ""}
            fonte={filtro.fonteCodigo ?? ""}
          />
        }
      />

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        O filtro de <strong>credor</strong> é um <strong>casamento por CPF/CNPJ</strong>, não uma
        busca por nome: este sistema não tem cadastro de credores — o empenho guarda apenas o
        documento. Por isso a lista acima oferece os <strong>documentos que existem</strong> no
        exercício, e não um campo de texto livre. O filtro de <strong>fonte</strong> recorta pela
        fonte de recursos da <strong>ficha</strong> do empenho, que é onde a fonte mora.
      </div>

      {empenhos.length === 0 ? (
        <EstadoVazio
          titulo="Sem empenhos no recorte"
          descricao={
            recorteEmTexto.length > 0
              ? `Nenhum empenho em ${descreverRecorte(recorte).toLowerCase()} com ${recorteEmTexto.join(" e ")}. Limpe um dos filtros para ampliar o recorte.`
              : `Nenhum empenho em ${descreverRecorte(recorte).toLowerCase()}. Ou o exercício não foi executado, ou a unidade selecionada não tem fichas.`
          }
        />
      ) : (
        <>
          <div className="flex justify-end gap-2">
            {/* ⚠️ O CSV É MONTADO NO SERVIDOR, a partir das MESMAS linhas da tabela, e vai
                pronto para a ilha. Uma segunda consulta (por API route) poderia devolver um
                conjunto diferente do que está na tela — e ninguém perceberia. */}
            <BotaoCsv
              csv={csvGerencial(empenhos)}
              nomeArquivo={`gerencial-empenhos-${recorte.exercicio}${sufixoArquivo}.csv`}
            />
            <BotaoPdf href={`/relatorios/gerenciais/pdf?${query.toString()}`} />
          </div>
          <TabelaDeDados
            colunas={COLUNAS}
            linhas={empenhos}
            keyDe={(l) => l.id}
            legenda={
              `${empenhos.length} empenho(s) · valores em R$ · empenhado já líquido das anulações` +
              (recorteEmTexto.length > 0 ? ` · recorte: ${recorteEmTexto.join(" · ")}` : " · sem filtro") +
              "."
            }
          />
        </>
      )}

      <p className="text-xs text-[color:var(--color-ink-3)]">
        O <strong>PDF</strong> e o <strong>CSV</strong> levam exatamente este recorte — o filtro
        mora na URL, e as três saídas o leem do mesmo lugar. A execução completa, com emissão de
        NE e anulação, fica em{" "}
        <a href="/despesa/empenhos" className="text-[color:var(--color-primary)] hover:underline">
          Despesa · Empenhos
        </a>
        .
      </p>
    </div>
  );
}

/** ⚠️ O CSV É A TELA: as mesmas colunas, na mesma ordem, com os mesmos filtros (TR 7.48). */
function csvGerencial(empenhos: readonly EmpenhoDaTela[]): string {
  return paraCsv(
    // O documento vai em DUAS colunas: mascarado (como se lê) e cru (como se filtra numa
    // planilha ou se cola de volta na URL). Uma coluna só obrigaria a escolher entre
    // legibilidade e utilidade.
    ["Nº", "Data", "Credor (CPF/CNPJ)", "Credor (documento cru)", "Unidade", "Ficha", "Fonte", "Empenhado", "Liquidado", "Pago", "A liquidar", "A pagar", "Anulações", "Status"],
    empenhos.map((e) => [
      e.numero,
      dataBr(e.data),
      mascararCpfCnpj(e.credorCpfCnpj),
      e.credorCpfCnpj,
      `${e.unidadeCodigo} — ${e.unidadeNome}`,
      String(e.fichaNumero),
      e.fonteCodigo,
      formatarMoeda(e.empenhadoLiquido).texto,
      formatarMoeda(e.liquidado).texto,
      formatarMoeda(e.pago).texto,
      formatarMoeda(e.saldoALiquidar).texto,
      formatarMoeda(e.saldoAPagar).texto,
      formatarMoeda(e.anulacoes).texto,
      ROTULO_STATUS[e.status] ?? e.status,
    ])
  );
}

/** O status derivado, em tom sóbrio — nunca o verde/vermelho do sinal contábil. */
function tomDoStatus(status: string): StatusBadge {
  if (status === "ANULADO") return "erro";
  if (status === "PAGO") return "ok";
  if (status === "EMPENHADO") return "neutro";
  return "alerta";
}

const ROTULO_STATUS: Record<string, string> = {
  EMPENHADO: "Empenhado",
  PARCIAL_LIQUIDADO: "Liq. parcial",
  LIQUIDADO: "Liquidado",
  PARCIAL_PAGO: "Pago parcial",
  PAGO: "Pago",
  ANULADO: "Anulado",
};

const COLUNAS: readonly ColunaTabela<EmpenhoDaTela>[] = [
  { chave: "numero", cabecalho: "Nº", alinhamento: "esquerda", largura: "7rem", celula: (l) => l.numero },
  { chave: "data", cabecalho: "Data", alinhamento: "esquerda", largura: "6rem", celula: (l) => dataBr(l.data) },
  {
    chave: "credor",
    cabecalho: "Credor (CPF/CNPJ)",
    alinhamento: "esquerda",
    largura: "12rem",
    // ⚠️ MASCARADO NA TELA, CRU NO `title`. A máscara é apresentação; quem precisa do
    // documento para colar na URL ou numa planilha acha o valor real no hover.
    celula: (l) => (
      <span className="font-mono text-xs text-[color:var(--color-ink-2)]" title={l.credorCpfCnpj}>
        {mascararCpfCnpj(l.credorCpfCnpj)}
      </span>
    ),
  },
  {
    chave: "unidade",
    cabecalho: "Unidade",
    alinhamento: "esquerda",
    largura: "10rem",
    celula: (l) => (
      <span title={l.unidadeNome}>{l.unidadeCodigo}</span>
    ),
  },
  { chave: "ficha", cabecalho: "Ficha", alinhamento: "direita", largura: "4rem", celula: (l) => l.fichaNumero },
  { chave: "fonte", cabecalho: "Fonte", alinhamento: "esquerda", largura: "4rem", celula: (l) => l.fonteCodigo },
  { chave: "empenhado", cabecalho: "Empenhado", alinhamento: "direita", largura: "8rem", celula: (l) => <ValorMonetario valor={l.empenhadoLiquido} /> },
  { chave: "liquidado", cabecalho: "Liquidado", alinhamento: "direita", largura: "8rem", celula: (l) => <ValorMonetario valor={l.liquidado} /> },
  { chave: "pago", cabecalho: "Pago", alinhamento: "direita", largura: "8rem", celula: (l) => <ValorMonetario valor={l.pago} /> },
  { chave: "aLiquidar", cabecalho: "A liquidar", alinhamento: "direita", largura: "8rem", celula: (l) => <ValorMonetario valor={l.saldoALiquidar} /> },
  { chave: "aPagar", cabecalho: "A pagar", alinhamento: "direita", largura: "8rem", celula: (l) => <ValorMonetario valor={l.saldoAPagar} /> },
  {
    chave: "status",
    cabecalho: "Status",
    alinhamento: "esquerda",
    largura: "7rem",
    celula: (l) => <Badge status={tomDoStatus(l.status)}>{ROTULO_STATUS[l.status] ?? l.status}</Badge>,
  },
];
