import { Badge } from "../../../../components/ui/Badge";
import { BotaoPdf } from "../../../../components/ui/BotaoPdf";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import {
  TabelaDeDados,
  type ColunaTabela,
} from "../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import {
  lerFilasDePagamento,
  lerFontesComFila,
  PortaSemBancoError,
  HIPOTESES_DE_QUEBRA,
  type GrupoDaFila,
  type LinhaDaFila,
} from "../../../../lib/portas/pagamento";
import { mascararCpfCnpj } from "../../../../lib/format/mascaras";
import { dataBr, descreverRecorte, recorteDe } from "../../../../lib/recorte";
import { SeletorFonte } from "./SeletorFonte";

/**
 * ORDEM CRONOLÓGICA — O PAINEL DE CONFORMIDADE do art. 141 da Lei 14.133/2021.
 *
 * ═══ ⚠️ POR QUE ESTA TELA NÃO É `/despesa/pagamentos` ═══
 * As duas leem a MESMA porta (`lerFilasDePagamento`) e nunca vão divergir por isso — mas
 * respondem a perguntas de pessoas diferentes, e é por isso que são duas:
 *
 *   `/despesa/pagamentos`  é a FILA OPERACIONAL — "o que eu pago AGORA". Ela traz o formulário
 *                          de pagamento, as contas bancárias, a lista do que já saiu e o botão de
 *                          anular. É a mesa de trabalho da tesouraria.
 *
 *   ESTA TELA             é o PAINEL DE CONFORMIDADE — "a ordem está sendo respeitada, e eis a
 *                          prova". Zero escrita: nenhum formulário, nenhuma ação. Em troca, tem o
 *                          que a auditoria precisa e a mesa de trabalho não usa — FILTRO POR FONTE
 *                          (o §3º manda publicar a ordem, e ela se publica por fonte) e IMPRESSÃO,
 *                          que produz o documento com hash e rodapé de honestidade.
 *
 * Juntar as duas daria uma tela que é ferramenta de trabalho e peça de prestação de contas ao mesmo
 * tempo: o auditor teria botões de pagar na frente, e o tesoureiro rolaria por filtros que não usa.
 * Separá-las NÃO duplica leitura — a fila continua tendo uma definição só, na porta.
 *
 * ═══ ⚠️ A FILA NÃO TEM RECORTE POR EXERCÍCIO NEM POR UG ═══
 * A ordem é por FONTE e CATEGORIA DE CONTRATO, e isso é do art. 141, não desta tela: o credor de
 * obras da fonte 500 disputa com os outros credores de obras da fonte 500 — não com os de bens, nem
 * com os da fonte 999, nem "com os da Secretaria de Saúde". Recortar por unidade partiria a fila em
 * pedaços que a lei não criou, cada um com uma "posição 1" própria. Por isso o seletor de exercício/UG
 * do cabeçalho NÃO afeta esta página, e o único filtro que ela oferece é o da FONTE — que é recorte
 * legítimo porque cada fonte já É uma fila separada, não um pedaço de uma.
 *
 * ⚠️ E o filtro é da PORTA, não desta página: a tela e a rota de PDF pedem a mesma fonte pelo mesmo
 * caminho (`lerFilasDePagamento({fonteCodigo})`), coerente com "zero pós-filtro em JS onde o SQL
 * alcança" (m12-relatorios/livros.ts). O porquê de ele morar na porta e não no adapter do M06 está
 * escrito no cabeçalho de `lib/portas/pagamento.ts`.
 */
export const dynamic = "force-dynamic";

const ROTULO_CATEGORIA: Record<string, string> = {
  FORNECIMENTO_BENS: "Fornecimento de bens",
  LOCACAO: "Locações",
  PRESTACAO_SERVICOS: "Prestação de serviços",
  REALIZACAO_OBRAS: "Realização de obras",
};

/**
 * O rol taxativo do §1º, por extenso.
 *
 * ⚠️ OS RÓTULOS SÃO OS MESMOS do `FormPagamento` — palavra por palavra, e de propósito. Quem
 * justifica a quebra (lá) e quem a audita (aqui) têm de estar lendo a MESMA hipótese: um "III —
 * sistemas estruturantes de TI" no formulário e um "III — risco de descontinuidade" no painel
 * fariam as duas telas parecerem falar de leis diferentes.
 */
const ROTULO_HIPOTESE: Record<string, string> = {
  I_EMERGENCIA_CALAMIDADE: "I — emergência ou calamidade pública",
  II_ME_EPP_RISCO: "II — ME/EPP em risco de descontinuidade",
  III_SISTEMAS_ESTRUTURANTES: "III — sistemas estruturantes de TI",
  IV_FALENCIA_RECUPERACAO: "IV — falência ou recuperação judicial",
  V_ATIVIDADE_FINALISTICA: "V — atividade finalística",
};

export default async function OrdemCronologicaPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  // ⚠️ O recorte é LIDO mesmo sem a fila usá-lo — e é lido pelo mesmo parser das outras telas. Ele
  // não filtra nada aqui (a fila do art. 141 não se recorta por exercício/UG, ver o topo); serve
  // para a nota ao pé DIZER isso com o valor que o usuário escolheu no cabeçalho. Um recorte que a
  // tela ignora em silêncio é pior que um recorte que ela ignora em voz alta: o usuário troca a
  // unidade, nada muda, e ele conclui que a tela está quebrada.
  const recorte = recorteDe(sp);

  // `?fonte=` pode vir repetido na URL; vale o primeiro — a mesma regra do `recorteDe`.
  const bruto = sp["fonte"];
  const fonte = (Array.isArray(bruto) ? bruto[0] : bruto)?.trim() ?? "";

  // ⚠️ O CABEÇALHO É FUNÇÃO DAS FONTES porque ele aparece nos DOIS caminhos — o de sucesso e o do
  // `catch`. No caminho de erro a lista de opções não existe (foi a leitura que falhou), mas o
  // seletor continua desenhado com a fonte pedida: o usuário vê o que perguntou junto do porquê de
  // não ter resposta, em vez de um cabeçalho mutilado que parece outra tela.
  const cabecalho = (opcoes: readonly string[]): React.ReactElement => (
    <PageHeader
      titulo="Ordem Cronológica de Pagamentos"
      subtitulo="Painel de conformidade do art. 141 da Lei 14.133/2021 — a ordem de exigibilidade, por fonte e categoria"
      acoes={
        <>
          <SeletorFonte fonte={fonte} fontes={opcoes} />
          <BotaoPdf
            // ⚠️ O PDF LEVA O FILTRO: o papel tem de ser exatamente a tela que o usuário viu ao
            // clicar. Um "imprimir" que ignorasse a fonte entregaria um documento que não confere
            // com a consulta que o motivou — e é justamente esse documento que vira prova.
            href={fonte !== "" ? `/despesa/ordem-cronologica/pdf?fonte=${encodeURIComponent(fonte)}` : "/despesa/ordem-cronologica/pdf"}
            rotulo="Imprimir ordem (PDF)"
          />
        </>
      }
    />
  );

  let filas: readonly GrupoDaFila[];
  let fontes: readonly string[];
  try {
    [filas, fontes] = await Promise.all([
      lerFilasDePagamento({ fonteCodigo: fonte }),
      // ⚠️ As opções do seletor NÃO saem de `filas`: uma vez filtrada na fonte 500, `filas` só conhece
      // a 500, e montar o select a partir dela prenderia o usuário na primeira escolha.
      lerFontesComFila(),
    ]);
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        {cabecalho([])}
        <EstadoVazio
          titulo={
            erro instanceof PortaSemBancoError
              ? "Banco de dados não configurado"
              : "Não foi possível ler a ordem cronológica"
          }
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }

  // Agrupamento de APRESENTAÇÃO: a porta devolve (fonte × categoria) já ordenado; aqui só se junta
  // as categorias sob a fonte a que pertencem, porque é a FONTE que o usuário desta tela persegue.
  // Nenhuma ordenação nova — a ordem das linhas continua sendo a que o M06 estabeleceu.
  const porFonte = new Map<string, GrupoDaFila[]>();
  for (const g of filas) {
    const atual = porFonte.get(g.fonteCodigo);
    if (atual !== undefined) atual.push(g);
    else porFonte.set(g.fonteCodigo, [g]);
  }

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      {cabecalho(fontes)}

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        Cada <strong>fonte × categoria</strong> é uma fila própria — elas não se disputam. A ordem é a{" "}
        <strong>data de liquidação</strong> (o marco de exigibilidade do caput), com desempate pelo
        número. Pagar fora da <strong>posição 1</strong> exige justificativa prévia numa das cinco
        hipóteses taxativas do §1º; sem ela o domínio recusa o pagamento — e quem confere a posição é
        ele, dentro da transação, contra a fila de agora. Esta tela é{" "}
        <strong>só leitura</strong>: o pagamento se faz em{" "}
        <a href="/despesa/pagamentos" className="text-[color:var(--color-primary)] hover:underline">
          Despesa · Pagamentos
        </a>
        .
      </div>

      {filas.length === 0 ? (
        <EstadoVazio
          titulo={fonte !== "" ? `Nenhuma fila na fonte ${fonte}` : "Nenhuma fila aberta"}
          descricao={
            fonte !== ""
              ? "Esta fonte não tem liquidação com saldo a pagar. Escolha outra fonte, ou volte a “todas” para ver o quadro inteiro."
              : "Não há liquidação com saldo a pagar. A fila do art. 141 é derivada: ela existe enquanto houver despesa liquidada e não paga."
          }
        />
      ) : (
        [...porFonte.entries()].map(([codigo, grupos]) => (
          <Card key={codigo} className="space-y-4">
            <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">
              Fonte de recurso {codigo}
            </h2>
            {grupos.map((g) => (
              <section key={g.categoria} className="space-y-2">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-3)]">
                    {ROTULO_CATEGORIA[g.categoria] ?? g.categoria}
                  </h3>
                  {/* ⚠️ O total é o do GRUPO, somado pela porta em centavos inteiros — a tela não
                      soma dinheiro. Não há total "por fonte" aqui de propósito: somar categorias
                      diferentes daria um número que a lei não usa para nada (filas distintas não se
                      compensam), e ele seria lido como se fosse um saldo devido pela fonte. */}
                  <span className="text-xs text-[color:var(--color-ink-2)]">
                    {g.linhas.length} na fila · total a pagar <ValorMonetario valor={g.total} />
                  </span>
                </div>
                <TabelaDeDados
                  colunas={COLUNAS}
                  linhas={g.linhas}
                  keyDe={(l) => l.liquidacaoId}
                  legenda={`Ordem cronológica da fonte ${codigo} — ${ROTULO_CATEGORIA[g.categoria] ?? g.categoria}. Pagar fora da posição 1 exige justificativa (§1º).`}
                />
              </section>
            ))}
          </Card>
        ))
      )}

      {/* ⚠️ O ROL TAXATIVO IMPRESSO NA TELA. É o §1º inteiro — cinco hipóteses, nem uma a mais. Ele
          está aqui porque este é o painel de CONFORMIDADE: quem confere a ordem precisa saber contra
          o que a quebra seria admitida, sem sair para a lei. E a lista vem da porta (que a reexporta
          do Zod do M06), não digitada: se o domínio ganhar ou perder uma hipótese, esta tela muda
          junto — uma lista fixa aqui viraria, no primeiro dia, uma promessa que o sistema não cumpre. */}
      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        <span className="font-semibold text-[color:var(--color-ink)]">
          Hipóteses do §1º — as únicas que autorizam quebra da ordem:
        </span>
        <ul className="mt-2 space-y-1">
          {HIPOTESES_DE_QUEBRA.map((h) => (
            <li key={h}>{ROTULO_HIPOTESE[h] ?? h}</li>
          ))}
        </ul>
        <p className="mt-2 text-[color:var(--color-ink-3)]">
          Toda quebra exige justificativa prévia, autorizada pela autoridade competente, e fica
          registrada junto ao pagamento — a justificativa e o pagamento são gravados na mesma
          transação, então não existe um sem o outro.
        </p>
      </div>

      {/* ⚠️ A NOTA QUE EXPLICA O SELETOR INERTE do cabeçalho — ver o comentário no `recorteDe` acima. */}
      <p className="text-xs text-[color:var(--color-ink-3)]">
        O recorte do cabeçalho (<strong>{descreverRecorte(recorte).toLowerCase()}</strong>) não se
        aplica a esta tela: a ordem cronológica é do <strong>ente</strong>, por fonte e categoria de
        contrato — recortá-la por unidade a partiria em filas que a lei não criou, cada uma com uma
        “posição 1” própria. O único recorte legítimo é o da <strong>fonte</strong>, porque cada
        fonte já é uma fila separada.
      </p>
    </div>
  );
}

const COLUNAS: readonly ColunaTabela<LinhaDaFila>[] = [
  {
    chave: "posicao",
    cabecalho: "Pos.",
    alinhamento: "direita",
    largura: "3.5rem",
    // A cabeça da fila é a única que se paga sem justificar nada — e é a informação mais
    // importante desta tela: é ela que diz onde a conformidade começa.
    celula: (l) => (l.posicao === 1 ? <Badge status="ok">1</Badge> : l.posicao),
  },
  {
    chave: "credor",
    cabecalho: "Credor",
    alinhamento: "esquerda",
    largura: "12rem",
    // ⚠️ MÁSCARA É APRESENTAÇÃO: a porta entrega os dígitos crus; quem confere a ordem lê CPF/CNPJ
    // pontuado. Nada aqui volta para o domínio.
    celula: (l) => (
      <span className="font-mono text-xs">{mascararCpfCnpj(l.credorCpfCnpj)}</span>
    ),
  },
  {
    chave: "empenho",
    cabecalho: "Empenho",
    alinhamento: "esquerda",
    largura: "7rem",
    celula: (l) => l.empenhoNumero,
  },
  {
    chave: "liquidacao",
    cabecalho: "Liquidação",
    alinhamento: "esquerda",
    largura: "7rem",
    celula: (l) => l.numero,
  },
  {
    // A data é o CRITÉRIO da ordenação — sem ela na tela, a posição vira um número sem prova.
    chave: "data",
    cabecalho: "Liquidada em",
    alinhamento: "esquerda",
    largura: "7rem",
    celula: (l) => dataBr(l.dataLiquidacao),
  },
  {
    chave: "aPagar",
    cabecalho: "Saldo a pagar",
    alinhamento: "direita",
    largura: "9rem",
    celula: (l) => <ValorMonetario valor={l.saldoAPagar} />,
  },
];
