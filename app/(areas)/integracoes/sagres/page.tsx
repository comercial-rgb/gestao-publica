import { Badge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import {
  lerPeriodosComMovimento,
  montarPreviewSagres,
  PortaSemBancoError,
  type DiaComMovimento,
  type MesComMovimento,
  type PeriodosComMovimento,
  type PreviewSagres,
} from "../../../../lib/portas/sagres";
import { POC_SAGRES } from "../../../../lib/portas/sagres-poc";
import { SeletorCompetencia } from "./SeletorCompetencia";
import { FormPlanoDoTribunal } from "./FormPlanoDoTribunal";
import { lerPlanoDoTribunal, ugDaRemessa, type ResumoDoPlanoDoTribunal, type UgDaRemessa } from "../../../../lib/portas/sagres";
import { acoesPermitidas } from "../../../../lib/portas/molde";
import { diaCivil, inicioDoDiaCivil, janelaCivilDoMes } from "../../../../packages/datas/index";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";

/**
 * TELA SAGRES 2026 (M15, S2) — prévia monoespaçada com régua de posições, lista de validações,
 * download do pacote, e a COMUNICAÇÃO HONESTA (DIRETIVA §7). A tela consome a PORTA (lib/portas/
 * sagres) — nunca o domínio direto (grep trivalente).
 *
 * ⚠️ A COMPETÊNCIA É ESCOLHIDA, NÃO PRESCRITA. Esta tela é operada AO VIVO diante de quem audita, e
 * o pedido natural de quem audita é "gere o dia que EU escolher". Antes, a tela oferecia seis dias
 * fixos numa constante: o avaliador podia clicar no que já tínhamos previsto, e em nada mais. Pior,
 * a constante envelheceu — a massa passou a ter movimento em agosto e setembro, e a lista continuou
 * anunciando o recorte de antes. Uma lista escrita à mão é uma afirmação sobre o banco que ninguém
 * revalida; ela apodrece em silêncio, e o silêncio aparece justamente na demonstração.
 *
 * Agora há (a) seletores de verdade — `<input type="date">` e `<input type="month">` — que aceitam
 * QUALQUER competência, e (b) atalhos para os períodos com movimento, DESCOBERTOS DO BANCO pela
 * porta (`lerPeriodosComMovimento`), com a contagem do que há em cada um. Os atalhos continuam
 * poupando cliques, mas nunca mais podem mentir sobre a base.
 *
 * ⚠️ DIA E MÊS SÃO INDEPENDENTES. O layout SAGRES tem duas periodicidades: o diário (empenho,
 * liquidação, pagamento, receita, retenção, despesa extra, movimentação entre contas, cadastro de
 * contas) e o mensal (Dotacao §4.4 e SaldoMensal §4.26). Derivar o mês do dia — o que a tela fazia —
 * escondia metade da escolha. O `?mes=` agora é parâmetro próprio, e a porta o recebe explicitamente.
 */
export const dynamic = "force-dynamic";

/**
 * O BLOCO MONOESPAÇADO: régua de posições EM CIMA, linhas de dado embaixo.
 *
 * ⚠️ ESTA FUNÇÃO EXISTE PARA CONSERTAR UM ERRO DE 2 COLUNAS. As linhas de dado levam o prefixo
 * `"  1 | "` — o número da linha em 3 casas mais " | " —, seis caracteres. A régua era emitida com
 * quatro espaços de indentação, e portanto ficava DUAS COLUNAS fora de fase: quem contasse "posições
 * 1 a 6" pela régua leria `| 9990` em vez de `999001`. Numa inspeção posicional diante do TCE, uma
 * régua desalinhada é pior do que régua nenhuma: ela CONVIDA à leitura errada e a resposta parece
 * conferida. O prefixo agora é o MESMO nos três tipos de linha, derivado de uma constante só.
 *
 * ⚠️ A ORDEM É dezenas → unidades → dados. As dezenas em cima é a convenção de régua de layout
 * posicional (o "1" da casa 10 fica sobre o "0" das unidades), e a régua vem ANTES do bloco porque
 * é assim que se lê: primeiro a escala, depois o que ela mede.
 */
const PREFIXO_LINHA = 6; // "  1 | " — três casas do número + " | "

function blocoComRegua(
  linhas: readonly string[],
  regua: { readonly dezenas: string; readonly unidades: string },
  largura: number
): string {
  const recuo = " ".repeat(PREFIXO_LINHA);
  const dados = linhas.map((l, i) => `${String(i + 1).padStart(3, " ")} | ${l}`);
  return [
    recuo + regua.dezenas.slice(0, largura),
    recuo + regua.unidades.slice(0, largura),
    ...dados,
  ].join("\n");
}

function BannerHonesto(): React.ReactElement {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[color:var(--color-status-alerta-fg)] bg-[color:var(--color-status-alerta-bg)] p-5 text-sm">
      <p className="font-semibold text-[color:var(--color-ink)]">Arquivos gerados e validados neste sistema</p>
      <ul className="mt-2 space-y-1 text-[color:var(--color-ink-2)]">
        <li>Leiaute SAGRES Contabilidade 2026 v1.1: arquivos e posições conforme o leiaute oficial.</li>
        <li>Validação de obrigatoriedade, domínios oficiais e integridade referencial.</li>
        <li><strong>Transmissão externa não realizada.</strong> Esta tela não se comunica com o TCE: não há recibo, protocolo nem aceite.</li>
        <li>A transmissão ao TCE depende da configuração da credencial de acesso.</li>
      </ul>
    </div>
  );
}

/**
 * MATRIZ DE COBERTURA — as 13 entidades da vertical slice, 10 exportando. O status de cada uma sai
 * de `adapters/tribunais/tce-pb/sagres/MODULO.md` (a fonte); aqui a tela a exibe para o avaliador não ter de abrir
 * o repositório. Nunca "linha vazia falsa": o que não exporta diz POR QUE (DIRETIVA §5).
 */
/**
 * ⚠️ O "§" DESTA TABELA É DO LEIAUTE DO TRIBUNAL — NÃO DO NOSSO CATÁLOGO.
 *
 * A regra do lote é clara: nenhum número de cláusula do termo de referência pode aparecer
 * em tela, como rótulo de atendimento ou identificador de catálogo. Foram removidos 85
 * deles do produto inteiro, e `test/ui/rotulos-de-conformidade.test.ts` impede que voltem.
 *
 * Estes §§ são outra coisa: são as seções do **leiaute publicado pelo TCE-PB** para o
 * SAGRES — documento normativo EXTERNO, da mesma natureza que "LRF art. 8º". Quando o
 * tribunal rejeita um arquivo, ele rejeita citando a seção; sem ela nesta tela, o operador
 * fica sem o vocabulário para responder. Removê-los tornaria a tela pior no exato trabalho
 * para o qual ela existe.
 *
 * O cabeçalho da coluna diz de quem é a seção, para que a leitura não fique ambígua. Esta
 * é a ÚNICA exceção do teste, e ela é nomeada lá — exceção declarada é decisão; exceção
 * silenciosa é buraco.
 */
const MATRIZ_SAGRES: readonly { readonly entidade: string; readonly secao: string; readonly exporta: boolean; readonly nota: string }[] = [
  // V23 — as 58 tabelas do leiaute 2026 v1.1 (§4.1 a §4.59; não há §4.47), conferidas contra o índice do leiaute oficial.
  { entidade: "UnidadeOrcamentaria", secao: "§4.1", exporta: true, nota: "Gerado a partir das unidades orçamentárias e da declaração vigente no fim do mês (responsável, ato e natureza jurídica)." },
  { entidade: "Programas", secao: "§4.2", exporta: true, nota: "Programas do orçamento, com o objetivo e o objetivo da Agenda 2030 declarados." },
  { entidade: "Acao", secao: "§4.3", exporta: true, nota: "Ações do orçamento, com a meta e a unidade de medida quando declaradas." },
  { entidade: "Dotacao", secao: "§4.4", exporta: true, nota: "Gerado a partir das fichas orçamentárias do exercício." },
  { entidade: "AtualizacaoOrcamentaria", secao: "§4.5", exporta: true, nota: "Os itens dos decretos de crédito do dia, com o tipo de alteração pela lei e pela origem do recurso, e as pernas dos decretos de remanejamento, transposição e transferência (origem e destino). A movimentação por ofício entre elementos de despesa não é oferecida sem autorização expressa na lei orçamentária." },
  { entidade: "DecretoseOficios", secao: "§4.6", exporta: true, nota: "Os decretos do dia (de crédito e de realocação) com o PDF publicado de cada um; sem o PDF, o arquivo fica fora da remessa, nomeando o decreto." },
  { entidade: "ReceitaPrevista", secao: "§4.7", exporta: true, nota: "Previsão da receita da LOA, com o tipo de cada dedução; no balancete de janeiro." },
  { entidade: "Empenhos", secao: "§4.8", exporta: true, nota: "Gerado a partir dos empenhos, com a classificação da ficha. As anulações não entram aqui." },
  { entidade: "Estornos", secao: "§4.9", exporta: true, nota: "Gerado a partir das anulações de empenho, inteiras e parciais, com o motivo informado na anulação." },
  { entidade: "Liquidacao", secao: "§4.10", exporta: true, nota: "Gerado a partir das liquidações, com o empenho e a ficha. As anulações não entram aqui." },
  { entidade: "EstornoLiquidacao", secao: "§4.11", exporta: true, nota: "Gerado a partir das anulações de liquidação, inteiras e parciais, com o motivo informado na anulação." },
  { entidade: "Pagamentos", secao: "§4.12", exporta: true, nota: "Gerado a partir dos pagamentos, com a conta pagadora." },
  { entidade: "EstornoPagamento", secao: "§4.13", exporta: true, nota: "Gerado a partir das anulações de pagamento, com o motivo informado na anulação." },
  { entidade: "Retencao", secao: "§4.14", exporta: true, nota: "Gerado a partir das retenções efetuadas nos pagamentos, conforme a correspondência do tipo de retenção (§5.24)." },
  { entidade: "EstornoRetencao", secao: "§4.15", exporta: true, nota: "Gerado a partir das retenções desfeitas pela anulação do pagamento." },
  { entidade: "ReceitaOrcamentaria", secao: "§4.16", exporta: true, nota: "Gerado a partir da receita arrecadada; a conta arrecadadora é informada na geração." },
  { entidade: "TransfRecebida", secao: "§4.17", exporta: true, nota: "Transferências recebidas de outra unidade gestora do município, no dia, com o estorno como tal." },
  { entidade: "TransfConcedida", secao: "§4.18", exporta: true, nota: "Transferências concedidas a outra unidade gestora do município (o duodécimo à Câmara), no dia." },
  { entidade: "ReceitaExtra", secao: "§4.19", exporta: true, nota: "Gerado a partir das retenções e dos ingressos avulsos. Depende do plano de contas do Tribunal importado para o exercício." },
  { entidade: "DespesaExtra", secao: "§4.20", exporta: true, nota: "Gerado a partir dos recolhimentos; a fonte (860/861/862/869) é informada na geração." },
  { entidade: "EstornoReceitaExtra", secao: "§4.21", exporta: true, nota: "Gerado a partir dos estornos de ingresso, com o motivo informado." },
  { entidade: "EstornoDespesaExtra", secao: "§4.22", exporta: true, nota: "Gerado a partir dos estornos de recolhimento, com o motivo informado." },
  { entidade: "CadastroContaBancaria", secao: "§4.23", exporta: true, nota: "Gerado a partir do cadastro das contas bancárias (banco, agência e conta)." },
  { entidade: "RelacionamentoCCorrenteFontePagadora", secao: "§4.24", exporta: true, nota: "Gerado a partir das fontes que cada conta bancária comporta (o rol da conta, ou a fonte padrão dela). Recusa a fonte do FUNDEB em mais de uma conta." },
  { entidade: "SaldoInicial", secao: "§4.25", exporta: true, nota: "Saldo contábil de abertura, da conciliação de dezembro encerrada; no balancete de janeiro." },
  { entidade: "SaldoMensal", secao: "§4.26", exporta: true, nota: "Soma do extrato bancário até o fim do mês." },
  { entidade: "ConciliacaoBancaria", secao: "§4.27", exporta: true, nota: "Gerado a partir da conciliação do fim do mês; a conta que não fecha fica fora, com o motivo." },
  { entidade: "PagamentosRestos", secao: "§4.28", exporta: true, nota: "Gerado a partir dos pagamentos de restos a pagar, com a conta pagadora e o CO da ficha. Saem daqui, e não do arquivo de pagamentos do exercício." },
  { entidade: "EstornoPagamentoRestos", secao: "§4.29", exporta: true, nota: "Gerado a partir das anulações de pagamento de restos, com o motivo informado." },
  { entidade: "CancelamentoRestos", secao: "§4.30", exporta: true, nota: "Gerado a partir dos cancelamentos de restos, com o motivo; o cancelamento desfeito não tem registro no leiaute e o arquivo do dia fica fora, com o motivo." },
  { entidade: "LiquidacaoRestos", secao: "§4.31", exporta: true, nota: "Gerado a partir das liquidações de restos não processados (empenho de exercício anterior). Saem daqui, e não do arquivo de liquidações." },
  { entidade: "EstornoLiquidacaoRestos", secao: "§4.32", exporta: true, nota: "Gerado a partir das anulações de liquidação de restos. Hoje o sistema não oferece anular liquidação de restos: o arquivo sai sem registros." },
  { entidade: "RetencaoRestos", secao: "§4.33", exporta: true, nota: "Gerado a partir das retenções feitas nos pagamentos de restos." },
  { entidade: "EstornoRetencaoRestos", secao: "§4.34", exporta: true, nota: "Gerado a partir das retenções de restos desfeitas pela anulação do pagamento." },
  { entidade: "Fornecedores", secao: "§4.35", exporta: true, nota: "Gerado a partir dos credores dos empenhos do dia e das pessoas que mudaram de nome no dia, com o nome do cadastro de pessoas. Credor sem cadastro deixa o arquivo fora, nomeando-o." },
  { entidade: "Ordenador", secao: "§4.36", exporta: true, nota: "Ordenadores designados por ato, no dia em que a designação começa." },
  { entidade: "RelacionamentoEmpenhoObra", secao: "§4.37", exporta: true, nota: "Gerado a partir dos empenhos do mês que apontam uma obra, com o número da obra do cadastro de obras." },
  { entidade: "RelacionamentoEmpenhoLicitacao", secao: "§4.38", exporta: true, nota: "Empenhos de contrato com a licitação como cadastrada no Tramita." },
  { entidade: "RelacionamentoLiquidacaoCodigoAgrupamentoFolhaPagamento", secao: "§4.39", exporta: true, nota: "Cada liquidação da folha com o código de agrupamento da remessa de pessoal, um para um." },
  { entidade: "RestosInscritos", secao: "§4.40", exporta: true, nota: "Gerado a partir das inscrições de restos a pagar do exercício, por empenho, e enviado no balancete de dezembro." },
  { entidade: "PloaAcao", secao: "§4.41", exporta: true, nota: "As ações do projeto encaminhado à Câmara, com meta e unidade de medida." },
  { entidade: "PloaDotacao", secao: "§4.42", exporta: true, nota: "A dotação do projeto encaminhado, como estava no encaminhamento." },
  { entidade: "PloaPrograma", secao: "§4.43", exporta: true, nota: "Os programas do projeto encaminhado, com o objetivo." },
  { entidade: "PloaReceitaPrevista", secao: "§4.44", exporta: true, nota: "A receita prevista no projeto encaminhado, com o tipo de cada dedução." },
  { entidade: "PloaUnidadeOrcamentaria", secao: "§4.45", exporta: true, nota: "As unidades do projeto encaminhado, com o secretário." },
  { entidade: "RelacionamentoEmpenhoNaturezaContratacao", secao: "§4.46", exporta: true, nota: "Gerado a partir de todos os empenhos emitidos no mês, com a natureza da contratação de cada um." },
  { entidade: "ResponsavelSiafic", secao: "§4.48", exporta: true, nota: "Responsável pelo sistema; no balancete de janeiro." },
  { entidade: "NormasOrcamentarias", secao: "§4.49", exporta: true, nota: "As leis orçamentárias publicadas no dia, com o protocolo do banco de legislação do Tribunal." },
  { entidade: "ProprietarioFrota", secao: "§4.50", exporta: true, nota: "Os donos dos veículos e máquinas cadastrados ou alterados no mês; no bem próprio, a própria unidade gestora." },
  { entidade: "LocadorPrestador", secao: "§4.51", exporta: true, nota: "Os locadores e prestadores dos veículos e máquinas cadastrados ou alterados no mês." },
  { entidade: "Veiculos", secao: "§4.52", exporta: true, nota: "Os veículos cadastrados ou alterados no mês (Patrimônio › Frota); sem o número do modelo da tabela do Tribunal, o arquivo fica fora nomeando a placa." },
  { entidade: "Maquinas", secao: "§4.53", exporta: true, nota: "As máquinas cadastradas ou alteradas no mês (Patrimônio › Frota)." },
  { entidade: "SituacaoFrota", secao: "§4.54", exporta: true, nota: "A situação de todos os veículos e máquinas no mês: a do dia 1 e cada mudança, na data em que começou." },
  { entidade: "Abastecimento", secao: "§4.55", exporta: true, nota: "Os litros abastecidos no mês por bem e combustível; sem abastecimento, o registro zerado no combustível principal (exceto o bem baixado o mês inteiro)." },
  { entidade: "Farmacia", secao: "§4.56", exporta: true, nota: "As farmácias públicas em funcionamento no fim do mês, com o responsável técnico (Patrimônio › Farmácias públicas)." },
  { entidade: "EstoqueFarmacia", secao: "§4.57", exporta: true, nota: "O estoque de medicamentos do mês de cada farmácia; sem o informe do mês, o arquivo fica fora nomeando a farmácia." },
  { entidade: "RelacionamentoLiquidacaoPagamento", secao: "§4.58", exporta: true, nota: "Gerado a partir dos pagamentos do mês com a liquidação que cada um paga, inclusive os de restos a pagar." },
  { entidade: "MovimentacaoEntreContasBancarias", secao: "§4.59", exporta: true, nota: "Gerado a partir das transferências entre contas do próprio ente." },
];

/** aaaa-mm-dd a partir de um Date UTC — o mesmo formato que a porta e o `<input type="date">` usam. */
function isoDia(d: Date): string {
  return diaCivil(d);
}

/**
 * O AVISO DE PERÍODO SEM MOVIMENTO (DIRETIVA §5 e §7).
 *
 * ⚠️ POR QUE ISTO É OBRIGATÓRIO, E NÃO UM DETALHE. Se a Comissão escolher um dia em que a base não
 * tem fato, os arquivos daquele dia saem com ZERO registro. Isso é o comportamento CORRETO do
 * layout — o arquivo do dia é gerado VAZIO, não omitido, porque a ausência de movimento também é
 * uma declaração e o TCE precisa recebê-la. O que seria desonesto é a tela ficar muda e deixar
 * alguém concluir que o sistema falhou, ou (pior) impedir a escolha do dia para esconder o vazio.
 */
function AvisoSemMovimento({
  escopo,
  competencia,
}: {
  readonly escopo: "dia" | "mes";
  readonly competencia: string;
}): React.ReactElement {
  const diario = escopo === "dia";
  return (
    <div className="rounded-[var(--radius-md)] border border-[color:var(--color-status-alerta-fg)] bg-[color:var(--color-status-alerta-bg)] p-4 text-sm">
      <p className="font-semibold text-[color:var(--color-ink)]">
        {diario ? "Não há movimento registrado neste dia" : "Não há movimento registrado neste mês"} — <span className="font-mono">{competencia}</span>
      </p>
      <p className="mt-1 text-[color:var(--color-ink-2)]">
        {diario ? (
          <>
            Os arquivos <strong>diários</strong> (Empenhos, Liquidacao, Pagamentos,
            ReceitaOrcamentaria, Retencao, DespesaExtra, MovimentacaoEntreContas) serão gerados{" "}
            <strong>sem registros</strong>.
          </>
        ) : (
          <>
            Os arquivos <strong>mensais</strong> desta competência refletirão um mês sem movimento; o
            SaldoMensal (§4.26) apresenta o saldo acumulado até o fim do mês.
          </>
        )}{" "}
        O arquivo vazio é gerado normalmente, pois a ausência de movimento também deve ser informada ao TCE.
      </p>
      <p className="mt-1 text-[color:var(--color-ink-3)]">
        {diario
          ? "O CadastroContaBancaria (§4.23) e os arquivos mensais não dependem do dia escolhido."
          : "A Dotacao (§4.4) é preenchida sempre que o exercício tiver fichas orçamentárias, pois reflete o orçamento autorizado."}{" "}
        Os atalhos da seção de competência indicam os períodos com movimento.
      </p>
    </div>
  );
}

/** O tipo da violação em português — o enum não vai para a tela. */
const ROTULO_DA_REGRA: Record<PreviewSagres["violacoes"][number]["regra"], string> = {
  RECORTE_POR_UG_INDISPONIVEL: "Dados de mais de uma unidade gestora: arquivo fora do pacote",
  ARQUIVO_SO_DA_PREFEITURA: "Arquivo do ente, remetido só pela Prefeitura",
  TABELA_SEM_ABRANGENCIA: "Abrangência do arquivo não declarada",
  UNIDADE_SEM_UG_DECLARADA: "Unidade orçamentária sem unidade gestora declarada",
  RECEITA_EXTRA_FORA_DO_PACOTE: "Receita extra fora do pacote",
  RESTOS_FORA_DO_PACOTE: "Restos a pagar fora do pacote",
  RELACIONAMENTO_FORA_DO_PACOTE: "Fornecedores ou relacionamento fora do pacote",
  CADASTRO_FORA_DO_PACOTE: "Cadastro do município incompleto: arquivo fora do pacote",
  PLANO_DO_TRIBUNAL_AUSENTE: "Plano do Tribunal não importado",
  OBRIGATORIEDADE: "Campo obrigatório vazio",
  DOMINIO: "Código fora da tabela",
  INTEGRIDADE_REFERENCIAL: "Referência inexistente",
  CONCILIACAO_NAO_FECHA: "Conciliação não fecha",
  DADOS_DA_UNIDADE_AUSENTES: "Dados da unidade ausentes",
};

export default async function SagresPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly dia?: string; readonly mes?: string; readonly ug?: string }>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_INTEGRACOES");
  const { dia: diaParam, mes: mesParam, ug: ugParam } = await searchParams;

  // ── NORMALIZAÇÃO DOS PARÂMETROS ──
  // O `dia` é livre (o seletor aceita qualquer data); só o FORMATO é validado. Data inválida vira
  // erro NOMEADO em vez de silenciosamente cair no padrão — quem digitou errado precisa saber.
  const diaEscolhido = diaParam !== undefined && diaParam !== "" ? inicioDoDiaCivil(diaParam) : POC_SAGRES.dia;
  const diaValido = !Number.isNaN(diaEscolhido.getTime());

  // O `mes` é INDEPENDENTE do dia; ausente, cai no mês do dia (o comportamento histórico da tela).
  // Qualquer data dentro do mês serve — a porta normaliza para o último dia dele.
  const mesFallback = diaValido ? isoDia(diaEscolhido).slice(0, 7) : "";
  const mesTexto = mesParam !== undefined && mesParam !== "" ? mesParam : mesFallback;
  const mesEscolhido = janelaCivilDoMes(mesTexto).inicio;
  const mesValido = !Number.isNaN(mesEscolhido.getTime());

  const cabecalho = (
    <PageHeader
      titulo="SAGRES 2026: arquivos TXT diários e mensais"
      subtitulo="Geração, validação e download do pacote no leiaute oficial 2026 v1.1."
      acoes={<Badge status="ok">Layout SAGRES 2026 v1.1</Badge>}
    />
  );

  // ── OS PERÍODOS COM MOVIMENTO, DO BANCO ──
  // Falha aqui é falha de INFRAESTRUTURA (sem DATABASE_URL, banco fora): a tela inteira depende do
  // banco, então o estado vazio nomeado substitui a página — não adianta oferecer seletor de dia
  // para um sistema que não consegue ler dia nenhum.
  let periodos: PeriodosComMovimento;
  try {
    periodos = await lerPeriodosComMovimento();
  } catch (erro) {
    return (
      <div className="space-y-6">
        {cabecalho}
        <BannerHonesto />
        <EstadoVazio
          titulo={erro instanceof PortaSemBancoError ? "Dados indisponíveis no momento" : "Não foi possível consultar os períodos com movimento"}
          descricao={erro instanceof Error ? erro.message : "Tente novamente em alguns instantes."}
        />
      </div>
    );
  }

  const diaIso = diaValido ? isoDia(diaEscolhido) : "";
  const mesIso = mesValido ? mesTexto : "";
  const movimentoDoDia: DiaComMovimento | undefined = periodos.dias.find((d) => d.dia === diaIso);
  const movimentoDoMes: MesComMovimento | undefined = periodos.meses.find((m) => m.mes === mesIso);

  let preview: PreviewSagres | null = null;
  let erro: string | null = null;
  // V26 — a unidade gestora da remessa: a cadastrada (escolhida, quando há mais de uma), ou a de demonstração.
  let ug: UgDaRemessa | null = null;
  if (!diaValido) erro = `Data inválida: "${diaParam}" (formato esperado: aaaa-mm-dd).`;
  else if (!mesValido) erro = `Mês inválido: "${mesParam}" (formato esperado: aaaa-mm).`;
  else {
    try {
      ug = await ugDaRemessa(diaEscolhido, ugParam, POC_SAGRES);
      preview = await montarPreviewSagres({ ...POC_SAGRES, codUnidadeGestora: ug.codUnidadeGestora, cnpjGerenciadora: ug.cnpjGerenciadora, dia: diaEscolhido, mes: mesEscolhido });
    } catch (e) {
      erro = e instanceof Error ? e.message : "Não foi possível gerar a prévia.";
    }
  }

  // O download precisa dos MESMOS dois parâmetros da prévia, senão o ZIP baixado não é o que a
  // Comissão acabou de ver na tela — e essa divergência seria invisível até alguém abrir o arquivo.
  const ugIso = ug !== null && !ug.demonstracao ? ug.codUnidadeGestora : "";
  const hrefDownload = `/integracoes/sagres/download?dia=${diaIso}&mes=${mesIso}${ugIso !== "" ? `&ug=${ugIso}` : ""}`;
  /** Href de atalho que preserva a OUTRA metade da escolha (troca só o dia, ou só o mês). */
  const sufixoUg = ugIso !== "" ? `&ug=${ugIso}` : "";
  const hrefDia = (d: string): string => `/integracoes/sagres?dia=${d}&mes=${mesIso}${sufixoUg}`;
  const hrefMes = (m: string): string => `/integracoes/sagres?dia=${diaIso}&mes=${m}${sufixoUg}`;

  // V23 — o plano de contas do Tribunal do exercício do dia escolhido, e quem pode importá-lo.
  const exercicioDoDia = diaValido ? Number(diaIso.slice(0, 4)) : Number(POC_SAGRES.dia.toISOString().slice(0, 4));
  const plano: ResumoDoPlanoDoTribunal = await lerPlanoDoTribunal(exercicioDoDia);
  const podeImportarPlano = (await acoesPermitidas(["IMPORTAR_PLANO_DO_TRIBUNAL"])).has("IMPORTAR_PLANO_DO_TRIBUNAL");

  return (
    <div className="space-y-6">
      {cabecalho}
      {ug !== null ? (
        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]" data-teste="ug-da-remessa">
          {ug.demonstracao ? (
            <span>Nenhuma unidade gestora cadastrada: o pacote sai com o código de demonstração {ug.codUnidadeGestora}. Cadastre a unidade em <a href="/contabilidade/unidades-gestoras" className="underline">Unidades gestoras</a>.</span>
          ) : (
            <span>
              Unidade gestora da remessa: <strong>{ug.codUnidadeGestora} {ug.nome}</strong>.
              {ug.opcoes.length > 1 && !ug.escolhidaNoPedido ? <span data-ug-implicita> Aberta na primeira das {ug.opcoes.length} escrituradas: escolha a unidade antes de baixar.</span> : null}
              {ug.opcoes.length > 1 ? (
                <span> Outras: {ug.opcoes.filter((o) => o.codigo !== ug?.codUnidadeGestora).map((o) => <a key={o.codigo} href={`/integracoes/sagres?dia=${diaIso}&mes=${mesIso}&ug=${o.codigo}`} className="ml-2 underline">{o.codigo} {o.nome}</a>)}</span>
              ) : null}
            </span>
          )}
        </div>
      ) : null}

      <BannerHonesto />

      {/* ── MATRIZ DE COBERTURA ── */}
      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">Arquivos do leiaute</h2>
          <Badge status="ok">{MATRIZ_SAGRES.filter((m) => m.exporta).length} de {MATRIZ_SAGRES.length} disponíveis</Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr className="border-b border-[color:var(--color-border)] text-xs uppercase tracking-wide text-[color:var(--color-ink-3)]">
                <th className="py-2 pr-3 font-semibold">Entidade</th>
                <th className="py-2 pr-3 font-semibold">Seção do leiaute do TCE</th>
                <th className="py-2 pr-3 font-semibold">Situação</th>
                <th className="py-2 font-semibold">Origem dos dados</th>
              </tr>
            </thead>
            <tbody>
              {MATRIZ_SAGRES.map((m) => (
                <tr key={m.entidade} className="border-b border-[color:var(--color-border)] last:border-0 align-top">
                  <td className="py-2 pr-3 font-medium text-[color:var(--color-ink)]">{m.entidade}</td>
                  <td className="py-2 pr-3 font-mono text-xs text-[color:var(--color-ink-3)]">{m.secao}</td>
                  <td className="py-2 pr-3">
                    <Badge status={m.exporta ? "ok" : "neutro"}>{m.exporta ? "disponível" : "não disponível"}</Badge>
                  </td>
                  <td className="py-2 text-[color:var(--color-ink-2)]">{m.nota}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── V23: O PLANO DE CONTAS DO TRIBUNAL (exigências por conta) ── */}
      <Card>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">Plano de contas do Tribunal — {plano.exercicio}</h2>
          <Badge status={plano.vigente !== null ? "ok" : "alerta"}>{plano.vigente !== null ? "importado" : "não importado"}</Badge>
        </div>
        {plano.vigente !== null ? (
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <div><dt className="inline text-[color:var(--color-ink-2)]">Planilha: </dt><dd className="inline">{plano.vigente.arquivoNome} (tabela de {plano.vigente.anoDaTabela})</dd></div>
            <div><dt className="inline text-[color:var(--color-ink-2)]">Contas: </dt><dd className="inline">{plano.vigente.contas} · {plano.vigente.exigemRetencao} exigem a retenção · {plano.vigente.exigemReceitaExtra} exigem a receita extra</dd></div>
            <div className="sm:col-span-2"><dt className="inline text-[color:var(--color-ink-2)]">Por que esta tabela: </dt><dd className="inline">{plano.vigente.fundamento}</dd></div>
            <div className="sm:col-span-2 break-all text-xs text-[color:var(--color-ink-3)]"><dt className="inline">Código de verificação da planilha: </dt><dd className="inline">{plano.vigente.arquivoSha256}</dd></div>
          </dl>
        ) : (
          <p className="text-sm text-[color:var(--color-ink-2)]">
            Sem a planilha do exercício, a receita extra fica fora do pacote e o recolhimento sai sem o vínculo conferido.
          </p>
        )}
        {podeImportarPlano ? <div className="mt-3"><FormPlanoDoTribunal exercicio={plano.exercicio} /></div> : null}
      </Card>

      {/* ── ESCOLHA DA COMPETÊNCIA ── */}
      <Card>
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">Competência a gerar</h2>
        <p className="mb-3 text-xs text-[color:var(--color-ink-3)]">
          Escolha qualquer dia e qualquer mês. O dia define os arquivos <strong>diários</strong>; o mês,
          os <strong>mensais</strong> (Dotacao §4.4 e SaldoMensal §4.26). As duas escolhas são independentes.
        </p>
        <SeletorCompetencia dia={diaIso} mes={mesIso} />

        {/* ── ATALHOS: os períodos com movimento, LIDOS DO BANCO ── */}
        <div className="mt-5 space-y-3">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-3)]">
              Dias com movimento ({periodos.dias.length})
            </h3>
            {periodos.dias.length === 0 ? (
              <p className="text-sm text-[color:var(--color-ink-3)]">
                Nenhum dia com movimento registrado. Os pacotes diários serão gerados sem registros.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {periodos.dias.map((d) => (
                  <a
                    key={d.dia}
                    href={hrefDia(d.dia)}
                    aria-current={d.dia === diaIso ? "true" : undefined}
                    className={`inline-flex h-11 items-center gap-2 rounded-[var(--radius-md)] border bg-[color:var(--color-surface-2)] px-3 text-sm hover:border-[color:var(--color-primary)] ${
                      d.dia === diaIso
                        ? "border-[color:var(--color-primary)] text-[color:var(--color-ink)]"
                        : "border-[color:var(--color-border)]"
                    }`}
                  >
                    <strong className="font-mono text-xs">{d.dia}</strong>
                    <span className="text-[color:var(--color-ink-2)]">{d.rotulo}</span>
                  </a>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-3)]">
              Meses com movimento ({periodos.meses.length})
            </h3>
            {periodos.meses.length === 0 ? (
              <p className="text-sm text-[color:var(--color-ink-3)]">Nenhum mês com movimento registrado.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {periodos.meses.map((m) => (
                  <a
                    key={m.mes}
                    href={hrefMes(m.mes)}
                    aria-current={m.mes === mesIso ? "true" : undefined}
                    className={`inline-flex h-11 items-center gap-2 rounded-[var(--radius-md)] border bg-[color:var(--color-surface-2)] px-3 text-sm hover:border-[color:var(--color-primary)] ${
                      m.mes === mesIso
                        ? "border-[color:var(--color-primary)] text-[color:var(--color-ink)]"
                        : "border-[color:var(--color-border)]"
                    }`}
                  >
                    <strong className="font-mono text-xs">{m.mes}</strong>
                    <span className="text-[color:var(--color-ink-2)]">
                      {m.diasComMovimento} dia(s) · {m.rotulo}
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>

          {/*
            A DOTACAO NÃO DEPENDE DO MOVIMENTO — depende do EXERCÍCIO ter fichas. Dizer quais
            exercícios existem evita a conclusão errada de que "mês sem movimento = Dotacao vazia".
          */}
          <p className="text-xs text-[color:var(--color-ink-3)]">
            Exercícios com ficha orçamentária (origem da Dotacao §4.4):{" "}
            {periodos.exercicios.length === 0 ? "nenhum" : periodos.exercicios.join(", ")}. Os períodos
            e as contagens acima são atualizados a cada acesso.
          </p>
        </div>
      </Card>

      {/* ── HONESTIDADE: competência escolhida sem movimento ── */}
      {diaValido && movimentoDoDia === undefined ? <AvisoSemMovimento escopo="dia" competencia={diaIso} /> : null}
      {mesValido && movimentoDoMes === undefined ? <AvisoSemMovimento escopo="mes" competencia={mesIso} /> : null}

      {erro !== null && (
        <Card>
          <p className="text-sm font-semibold text-[color:var(--color-status-erro-fg)]">Não foi possível gerar a prévia</p>
          <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">{erro}</p>
        </Card>
      )}

      {preview !== null && (
        <>
          <Card>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <span><span className="text-[color:var(--color-ink-2)]">Unidade gestora:</span> <strong>{preview.codUnidadeGestora}</strong> <Badge status="neutro">Demonstração</Badge></span>
              <span>
                <span className="text-[color:var(--color-ink-2)]">Competência diária:</span> <strong>{preview.competenciaDiaria}</strong>{" "}
                <Badge status={movimentoDoDia !== undefined ? "ok" : "alerta"}>
                  {movimentoDoDia !== undefined ? movimentoDoDia.rotulo : "sem movimento"}
                </Badge>
              </span>
              <span>
                <span className="text-[color:var(--color-ink-2)]">Competência mensal:</span> <strong>{preview.competenciaMensal}</strong>{" "}
                <Badge status={movimentoDoMes !== undefined ? "ok" : "alerta"}>
                  {movimentoDoMes !== undefined ? movimentoDoMes.rotulo : "sem movimento"}
                </Badge>
              </span>
              <span className="ml-auto">
                <a
                  href={hrefDownload}
                  className="inline-flex h-10 items-center rounded-[var(--radius-md)] bg-[color:var(--color-primary)] px-4 font-semibold text-[color:var(--color-primary-fg)] hover:bg-[color:var(--color-primary-hover)]"
                >
                  {preview.violacoes.length === 0 ? "Baixar pacote (.zip com manifesto)" : "Baixar para conferência (incompleto)"}
                </a>
              </span>
            </div>
            <p className="mt-2 break-all text-xs text-[color:var(--color-ink-3)]">Código de verificação do pacote: {preview.manifesto.hashPacote}</p>
            {preview.violacoes.length > 0 ? (
              <p className="mt-1 text-xs text-[color:var(--color-status-erro-fg)]" data-teste="pacote-de-conferencia">
                Há {preview.violacoes.length} pendência(s) nas validações abaixo: o pacote baixado é para conferência, com o nome
                começando por "conferencia-incompleto" e a lista do que ficou fora no manifesto. Ele não é a remessa pronta.
                Resolva as pendências e baixe de novo.
              </p>
            ) : null}
            <p className="mt-1 text-xs text-[color:var(--color-ink-3)]">
              O arquivo baixado corresponde exatamente à competência exibida. Os arquivos mensais levam{" "}
              {preview.competenciaMensal} no nome, mesmo quando o dia escolhido pertence a outro mês.
            </p>
          </Card>

          {/* ── VALIDAÇÕES ── */}
          <Card>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">Validações</h2>
            {preview.violacoes.length === 0 ? (
              <p className="text-sm text-[color:var(--color-status-ok-fg)]">Nenhuma inconsistência encontrada nas validações.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {preview.violacoes.map((v, i) => (
                  <li key={i} className="text-[color:var(--color-status-erro-fg)]">
                    <Badge status="erro">{ROTULO_DA_REGRA[v.regra]}</Badge> <strong>{v.arquivo}</strong>
                    {v.linha > 0 ? ` · linha ${v.linha}` : " · pacote"} · campo <code>{v.campo}</code>: {v.detalhe}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* ── PRÉVIA MONOESPAÇADA POR ARQUIVO ── */}
          {preview.arquivos.map((arq) => (
            <Card key={arq.nome}>
              <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                <strong>{arq.entidade}</strong>
                <Badge status="neutro">{arq.periodicidade}</Badge>
                <span className="text-[color:var(--color-ink-2)]">{arq.registros} registro(s) · largura {arq.largura}</span>
                <code className="ml-auto text-xs text-[color:var(--color-ink-3)]">{arq.nome}</code>
              </div>
              {arq.registros === 0 ? (
                <p className="text-sm text-[color:var(--color-ink-3)]">
                  Sem registros nesta competência. O arquivo é gerado vazio, pois a ausência de movimento também
                  deve ser informada ao TCE. Use os atalhos acima para escolher um período com movimento.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]">
                  <pre className="whitespace-pre px-3 py-2 font-mono text-xs leading-5 text-[color:var(--color-ink)]">
{blocoComRegua(arq.linhas, preview.regua, arq.largura)}
                  </pre>
                </div>
              )}
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
