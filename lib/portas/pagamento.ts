import { cliente, PortaSemBancoError } from "./cliente";
import { comEscritaAutenticada } from "./sessao";
import { criarOrdemCronologicaPrisma } from "../../modules/m06-ordem-cronologica/adapter-prisma";
import {
  dadosDasLiquidacoes,
  listarContasBancarias,
  type ContaBancariaNaLista,
} from "../../modules/m05-despesa/consultas";
import { criarM05Deps } from "../../modules/m05-despesa/adapter-prisma";
import { pagar } from "../../modules/m05-despesa/servico-bloco2";
import { roteiroPagamento } from "../../modules/m01-core-contabil/roteiros";
// O TIPO da justificativa é do M06 — a porta o encaminha, não o redeclara. Um
// `hipotese: string` aqui aceitaria "VI_OUTROS" na compilação e só quebraria no Zod.
import {
  zHipoteseQuebraOrdem,
  type HipoteseQuebraOrdem,
} from "../../modules/m06-ordem-cronologica/dominio";

/**
 * PORTA — A FILA DO ART. 141 (ordem cronológica de pagamentos, TR 5.29). **SÓ LEITURA.**
 *
 * ═══ A COMPOSIÇÃO, E POR QUE ELA É DE DOIS MÓDULOS ═══
 * A ORDEM é do M06: `filasEm(null)` devolve todas as filas (fonte × categoria) como
 * elas são AGORA, cada uma já ordenada por `ordenarFila` (data de liquidação, desempate
 * pelo número). A posição de cada linha é o índice+1 dessa ordenação — não se
 * recalcula nada aqui.
 *
 * O CREDOR não é do M06, e não deveria ser: a ordem cronológica não depende de quem vai
 * receber, e um campo `credor` no M06 viraria um segundo lugar onde o credor mora.
 * `LiquidacaoNaFila` é magra de propósito (id, número, data, fonte, categoria, saldo).
 * A tela precisa dizer QUEM está na frente — então a porta pergunta ao dono do dado
 * (`dadosDasLiquidacoes`, M05). Compor é o trabalho da porta; derivar não é.
 *
 * ═══ ⚠️ NÃO HÁ `pagar()` AQUI — E O DESENHO DELE JÁ ESTÁ DECIDIDO ═══
 * Quando a escrita nascer (bloqueada em **7.2-roteiro-pcasp**, ver `./empenho.ts`), ela
 * chama `pagar()` do **M05** passando `justificativaQuebraOrdem` — NUNCA o M06 direto.
 * A direção da dependência é explícita em `m06-ordem-cronologica/ports.ts`:
 *
 *   "o M06 **não importa o M05**. É o `pagar()` do M05 que chama
 *    `validarOrdemCronologica` — dentro da transação dele, antes de gravar."
 *
 * É isso que faz a justificativa da quebra e o pagamento serem ATÔMICOS: se o pagamento
 * falha, a justificativa não sobra; se a justificativa falha, o pagamento não acontece.
 * Uma porta que chamasse `validarOrdemCronologica` por fora da transação teria um guard
 * que não é guard — é sugestão. E a quebra sem justificativa já é fail-closed no
 * domínio (art. 141, §2º): a borda não precisa reimplementar a recusa, só deixá-la
 * subir com a mensagem que o domínio escreveu.
 */

export { PortaSemBancoError };

/** Uma liquidação esperando pagamento, na posição em que ela está. */
export interface LinhaDaFila {
  /** 1-based. A posição 1 é a cabeça: pagá-la não exige justificativa nenhuma. */
  readonly posicao: number;
  readonly liquidacaoId: string;
  readonly numero: string;
  readonly dataLiquidacao: Date;
  readonly empenhoNumero: string;
  readonly credorCpfCnpj: string;
  readonly historico: string;
  /** O valor líquido da liquidação. */
  readonly valorLiquidado: string;
  /** O que ainda falta pagar dela — é este o valor que a fila ordena. */
  readonly saldoAPagar: string;
}

/** Uma fila: um par (fonte, categoria). Filas diferentes não se disputam. */
export interface GrupoDaFila {
  readonly fonteCodigo: string;
  readonly categoria: string;
  readonly linhas: readonly LinhaDaFila[];
  /** Σ dos saldos a pagar do grupo. */
  readonly total: string;
}

/** O recorte OPCIONAL da leitura da fila. Ausente = todas as filas. */
export interface FiltroDaFila {
  /** Código da fonte de recurso. Ausente/vazio = todas as fontes. */
  readonly fonteCodigo?: string | undefined;
}

/**
 * TODAS as filas de agora, agrupadas por (fonte, categoria) — ou só as de UMA fonte.
 *
 * ⚠️ `filasEm(null)` = AGORA. A fila de um mês FECHADO é outra pergunta (o §3º manda
 * publicar a do mês, e o mês fecha) — ela tem corte próprio e já é do M12.
 *
 * ═══ POR QUE O FILTRO DE FONTE MORA AQUI, E NÃO NO SQL ═══
 * A regra da casa é "zero pós-filtro em JS onde o SQL alcança" (m12-relatorios/livros.ts,
 * TR 5.94) — e ela tem o "onde o SQL alcança" por um motivo. O contrato do M06
 * (`m06-ordem-cronologica/ports.ts`) é `filasEm(corte: CorteDaFila | null)`: o único
 * recorte que a fila conhece é o TEMPORAL. Não há parâmetro de fonte para empurrar, e
 * inventar um significaria mexer no port e no adapter do M06 — mudar o domínio para
 * mudar uma tela, que é exatamente a inversão que as portas existem para impedir.
 *
 * O que dá para fazer sem mentir, e é o que se faz: filtrar ANTES do join caro. A
 * consulta de fonte/categoria do M06 é barata (é ela que ordena a fila); o que custa é
 * `dadosDasLiquidacoes` (M05 — credor, empenho, histórico), que é proporcional ao número
 * de liquidações. Descartando as fontes de fora primeiro, o join só recebe os ids que a
 * tela vai de fato mostrar. O pós-filtro sobra sobre a lista de GRUPOS (algumas dezenas),
 * nunca sobre a de LINHAS — que é onde o custo estaria.
 *
 * ⚠️ E ele é do lado da PORTA, não da página: a tela e a rota de PDF pedem a mesma fonte
 * pelo mesmo caminho, e não há duas noções de "fila da fonte 500" no sistema.
 */
export async function lerFilasDePagamento(
  filtro: FiltroDaFila = {}
): Promise<readonly GrupoDaFila[]> {
  const prisma = cliente();
  const ordem = criarOrdemCronologicaPrisma(prisma);

  const fonte = filtro.fonteCodigo?.trim();
  const todas = await ordem.filasEm(null);
  const filas =
    fonte !== undefined && fonte !== ""
      ? todas.filter((f) => f.fonteCodigo === fonte)
      : todas;

  const todasAsLiquidacoes = filas.flatMap((f) =>
    f.liquidacoes.map((l) => l.liquidacaoId)
  );
  const dados = await dadosDasLiquidacoes(prisma, todasAsLiquidacoes);

  return filas
    .map((f) => {
      const linhas: LinhaDaFila[] = f.liquidacoes.map((l, i) => {
        const d = dados.get(l.liquidacaoId);
        return {
          // A ordenação é a do M06; a posição é só a leitura dela.
          posicao: i + 1,
          liquidacaoId: l.liquidacaoId,
          numero: l.numero,
          dataLiquidacao: l.dataLiquidacao,
          empenhoNumero: d?.empenhoNumero ?? "—",
          credorCpfCnpj: d?.credorCpfCnpj ?? "—",
          historico: d?.historico ?? "",
          valorLiquidado: (d?.valorLiquidado ?? l.saldoAPagar).toFixed(2),
          saldoAPagar: l.saldoAPagar.toFixed(2),
        };
      });

      let total = 0n;
      for (const l of f.liquidacoes) {
        // Centavos em inteiro: somar `string` de dinheiro em `number` é como o
        // float entra num sistema contábil. O domínio já garantiu 2 casas.
        total += BigInt(l.saldoAPagar.toFixed(2).replace(".", ""));
      }

      return {
        fonteCodigo: f.fonteCodigo,
        categoria: f.categoria,
        linhas,
        total: emReais(total),
      };
    })
    .sort(
      (a, b) =>
        a.fonteCodigo.localeCompare(b.fonteCodigo) ||
        a.categoria.localeCompare(b.categoria)
    );
}

/**
 * AS FONTES QUE HOJE TÊM FILA — as opções do seletor da tela de ordem cronológica.
 *
 * ⚠️ ELA NÃO SAI DAS FILAS JÁ FILTRADAS, e não poderia: uma vez que o usuário escolheu a
 * fonte 500, `lerFilasDePagamento({fonteCodigo:"500"})` só conhece a 500 — montar o select
 * a partir dela deixaria o usuário preso na primeira escolha, sem caminho de volta para as
 * outras fontes. Por isso a lista vem de uma leitura própria, sempre completa.
 *
 * ⚠️ E ela lista o que TEM FILA, não o cadastro de fontes: uma fonte sem liquidação em
 * aberto não é uma opção útil — escolhê-la só produziria uma tela vazia. A fila do art. 141
 * é derivada; o seletor dela também é.
 */
export async function lerFontesComFila(): Promise<readonly string[]> {
  const filas = await criarOrdemCronologicaPrisma(cliente()).filasEm(null);
  return [...new Set(filas.map((f) => f.fonteCodigo))].sort((a, b) =>
    a.localeCompare(b)
  );
}

/**
 * O ROL TAXATIVO do §1º, para o select — e o estreitamento de tipo que ele dá.
 *
 * A Server Action recebe uma `string` do `<select>`; `ehHipotese` a estreita para
 * `HipoteseQuebraOrdem` antes de chegar à porta. Sem isso, a alternativa seria um cast,
 * que faria "VI_OUTROS" compilar e só quebrar no Zod — com o form já submetido.
 */
export const HIPOTESES_DE_QUEBRA: readonly HipoteseQuebraOrdem[] =
  zHipoteseQuebraOrdem.options;

export function ehHipotese(v: string): v is HipoteseQuebraOrdem {
  return (zHipoteseQuebraOrdem.options as readonly string[]).includes(v);
}

export type { HipoteseQuebraOrdem };

/** A conta bancária como o SELECT do form a consome — a fonte vem junto (TR 5.23). */
export interface ContaBancariaDaTela {
  readonly codigo: string;
  readonly descricao: string;
  readonly fonteId: string;
  readonly fonteCodigo: string;
}

export async function lerContasBancarias(): Promise<
  readonly ContaBancariaDaTela[]
> {
  const contas = await listarContasBancarias(cliente());
  return contas.map((c: ContaBancariaNaLista) => ({ ...c }));
}

/** A obrigação que o pagamento extingue. */
const CONTA_FORNECEDORES = "2.1.3.1.1.00.00";

/**
 * PAGAR — escrita autenticada. Com ou sem quebra da ordem cronológica.
 *
 * ═══ ⚠️ A PORTA CHAMA SÓ O M05, E ISSO NÃO É ATALHO ═══
 * `m06-ordem-cronologica/ports.ts` é explícito: "o M06 **não importa o M05**. É o
 * `pagar()` do M05 que chama `validarOrdemCronologica` — dentro da transação dele,
 * antes de gravar."
 *
 * É isso que faz a justificativa da quebra e o pagamento serem ATÔMICOS: se o pagamento
 * falha, a justificativa não sobra; se a justificativa falha, o pagamento não acontece.
 * Uma porta que validasse a ordem por fora da transação teria um guard que não é guard
 * — é sugestão: entre a checagem e a gravação, outro pagamento anda a fila.
 *
 * ⚠️ E A RECUSA JÁ EXISTE NO DOMÍNIO. Pagar fora da posição 1 sem justificativa é
 * rejeitado pelo art. 141 §2º, fail-closed, no adapter. A borda não reimplementa a
 * regra: ela deixa o erro subir com a mensagem que o domínio escreveu. `justificativa`
 * ausente = pagamento da cabeça da fila.
 */
export async function registrarPagamento(input: {
  readonly liquidacaoId: string;
  readonly numero: string;
  readonly valor: string;
  readonly data: Date;
  readonly contaBancaria: string;
  readonly fonteId: string;
  readonly historico: string;
  /** Art. 141 §1º — SÓ para pagar fora da ordem. Ausente = cabeça da fila. */
  readonly justificativaQuebraOrdem?:
    | {
        readonly hipotese: HipoteseQuebraOrdem;
        readonly justificativa: string;
        readonly autorizadoPor: string;
      }
    | undefined;
}): Promise<string> {
  return comEscritaAutenticada("PAGAR", async (criadoPor) => {
    const r = await pagar(
      {
        liquidacaoId: input.liquidacaoId,
        numero: input.numero,
        valor: input.valor,
        data: input.data,
        contaBancaria: input.contaBancaria,
        fonteId: input.fonteId,
        historico: input.historico,
        criadoPor,
        ...(input.justificativaQuebraOrdem !== undefined
          ? { justificativaQuebraOrdem: input.justificativaQuebraOrdem }
          : {}),
      },
      roteiroPagamento({
        obrigacaoAPagar: CONTA_FORNECEDORES,
        disponibilidade: CONTA_DISPONIBILIDADE,
      }),
      criarM05Deps(cliente())
    );
    return r.pagamentoId;
  });
}

/**
 * ⚠️ A DISPONIBILIDADE DO ROTEIRO É O BANCO — e ela é UMA, não a da conta escolhida.
 *
 * `Pagamento.contaBancaria` guarda o CÓDIGO da conta (é ele que a TR 5.23 casa com a
 * fonte); a perna patrimonial do razão credita a conta CONTÁBIL de bancos. São coisas
 * diferentes: o ente tem várias contas bancárias e uma conta de Bancos no PCASP.
 *
 * ⚠️ Enquanto o plano mínimo tiver DUAS disponibilidades (Caixa 1.1.1.1.1 e Bancos
 * 1.1.1.1.2 — a divergência M04×M05 anotada no seed), esta escolha é a do M05, que é
 * quem paga. Pendência PCASP-COMPLETO.
 */
const CONTA_DISPONIBILIDADE = "1.1.1.1.2.00.00";

/** Centavos (BigInt) → "1234.56". Sem float em nenhum ponto. */
function emReais(centavos: bigint): string {
  const neg = centavos < 0n;
  const abs = neg ? -centavos : centavos;
  const s = abs.toString().padStart(3, "0");
  return `${neg ? "-" : ""}${s.slice(0, -2)}.${s.slice(-2)}`;
}
