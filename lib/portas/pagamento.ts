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
import { CONTA_FORNECEDORES_A_PAGAR, roteiroPagamento } from "../../modules/m01-core-contabil/roteiros";
// O TIPO da justificativa é do M06 — a porta o encaminha, não o redeclara. Um
// `hipotese: string` aqui aceitaria "VI_OUTROS" na compilação e só quebraria no Zod.
import {
  zHipoteseQuebraOrdem,
  type HipoteseQuebraOrdem,
} from "../../modules/m06-ordem-cronologica/dominio";
// A RETENÇÃO NA FONTE é do M07, e a seta é sempre M05 -> M07: quem paga, retém, dentro
// da MESMA transação. A porta só reúne o que o `pagar()` precisa receber.
import { listarTiposConsignacao } from "../../modules/m07-extraorcamentario/consultas";
import type { RetencoesDoPagamento } from "../../modules/m07-extraorcamentario/dominio";
import {
  prepararRetencoesCalculadas,
  type DadosFiscaisDaOperacao,
} from "../../modules/m07-extraorcamentario/retencao-calculada";
import { descontosDaFolhaPendentes } from "../../modules/m33-folha/descontos-da-folha";
import { irDaFolhaNoPagamento } from "../../modules/m07-extraorcamentario/retencao-propria";
import { toMoney } from "../../packages/contracts/index";

/**
 * PORTA — PAGAMENTOS: a fila do art. 141 (leitura) e o ato de pagar (escrita).
 *
 * ⚠️ ESTE CABEÇALHO DIZIA "SÓ LEITURA" e que "não há `pagar()` aqui". Não é mais
 * verdade: `registrarPagamento` existe logo abaixo, e agora também recebe RETENÇÃO. A
 * afirmação ficou para trás quando a escrita chegou, e um comentário que descreve um
 * arquivo que já não existe é pior que nenhum — quem confia nele para de ler o código.
 * O que segue abaixo continua valendo, e é a parte que importa: a direção da dependência.
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
 * ═══ ⚠️ A ESCRITA CHAMA O M05, NUNCA O M06 DIRETO ═══
 * `registrarPagamento` chama `pagar()` do **M05** passando `justificativaQuebraOrdem` e
 * as retenções — NUNCA o M06 nem o M07 por fora.
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
  /**
   * RETENÇÃO NA FONTE (M07). Lista vazia ou ausente = pagamento SEM retenção, pelo
   * caminho idêntico ao de sempre.
   *
   * ⚠️ O VALOR VEM DO OPERADOR, NUNCA CALCULADO AQUI (o caminho calculado é `operacaoFiscal`, V24, e
   * o cálculo é do M07, com as tabelas oficiais). Quanto se retém de INSS ou de ISS
   * é matéria de legislação tributária (alíquota, base, retenção mínima, regime do
   * prestador) que este sistema NÃO conhece — e uma alíquota chutada na borda seria
   * dinheiro recolhido a menor, com o ente respondendo pela diferença. Por isso a tela
   * PERGUNTA o valor; o sistema garante o resto: que o lançamento feche, que o passivo
   * nasça na conta certa e que o caixa saia pelo líquido.
   */
  readonly retencoes?:
    | readonly {
        readonly tipoConsignacaoId: string;
        readonly credorConsignatario: string;
        readonly valor: string;
      }[]
    | undefined;
  /**
   * T07 — a ordem AUTORIZADA que lastreia este pagamento. Ausente = registro direto.
   *
   * ⚠️ A PORTA SÓ ENCAMINHA. Quem confere que a ordem está autorizada, é da mesma
   * liquidação, tem o valor exato e ainda não foi consumida é o domínio, DENTRO da
   * transação — entre conferir aqui e gravar lá, outra requisição pode consumi-la.
   */
  readonly ordemDePagamentoId?: string | undefined;
  /**
   * V24 — RETENÇÃO CALCULADA: os dados fiscais da operação (natureza do IR, serviço do INSS, subitem
   * do ISS...). O fornecedor vem do empenho e os valores retidos são CALCULADOS no servidor, dentro da
   * autorização do pagamento; a memória de cada tributo nasce na mesma transação. Exclui `retencoes`.
   */
  readonly operacaoFiscal?: DadosFiscaisDaOperacao | undefined;
  /**
   * V32 — a justificativa para pagar um PRECATÓRIO fora da ordem cronológica constitucional (acordo
   * homologado, sequestro de verba). Só texto; quem decide se é exigida é o `pagar`, na transação.
   */
  readonly justificativaOrdemConstitucional?: string | undefined;
  /** V36 — o número do cheque, quando o pagamento sai por cheque (o cheque nasce na mesma transação). */
  readonly numeroDoCheque?: string | undefined;
}): Promise<string> {
  // ⚠️ V6 P1.2 — A PERNA DE DISPONIBILIDADE É A CONTA CONTÁBIL DA CONTA BANCÁRIA QUE PAGA, lida
  // do cadastro (fail-closed). Vinha de uma constante (1.1.1.1.2.00.00) enquanto as contas
  // bancárias mapeiam outra (1.1.1.1.1.19.00): o pagamento saía da conta X na tesouraria e de
  // outra conta no razão — e a conciliação de X nunca fechava. "Nenhum código no código."
  const conta = await cliente().contaBancaria.findUnique({
    where: { codigo: input.contaBancaria },
    select: { id: true, codigo: true, contaContabil: { select: { codigo: true } } },
  });
  if (conta === null) throw new Error(`Conta bancária ${input.contaBancaria} não cadastrada. Nada foi gravado.`);
  if (conta.contaContabil === null) {
    throw new Error(`A conta bancária ${conta.codigo} não tem conta contábil mapeada; o pagamento não sabe de que conta do razão sai. Parametrize o mapeamento antes. Nada foi gravado.`);
  }
  const contaContabilDaConta = conta.contaContabil.codigo;
  if (input.operacaoFiscal !== undefined && (input.retencoes ?? []).length > 0) {
    throw new Error("Escolha entre calcular as retenções de IR, INSS e ISS e informá-las manualmente; as duas juntas não são aceitas. Nada foi gravado.");
  }
  const retencoesManuais = await comporRetencoes(input.retencoes ?? [], contaContabilDaConta);

  return comEscritaAutenticada("PAGAR", async (criadoPor) => {
    const deps = criarM05Deps(cliente());
    const obrigacaoDaLiquidacao = (await deps.despesa.buscarLiquidacao(input.liquidacaoId))?.obrigacoes ?? [];
    // V24 — calculadas DENTRO da autorização: quem não pode pagar não chega a calcular.
    const operacao = input.operacaoFiscal;
    const retencoes: RetencoesDoPagamento | undefined =
      operacao === undefined
        ? retencoesManuais
        : await (async () => {
            const p = await prepararRetencoesCalculadas(cliente(), {
              liquidacaoId: input.liquidacaoId,
              valorDoPagamento: toMoney(input.valor),
              data: input.data,
              operacao,
              contaBancariaId: conta.id,
            });
            return { contaDisponibilidade: contaContabilDaConta, retencoes: p.retencoes, calculos: p.calculos, proprias: p.proprias };
          })();
    // V26 — a liquidação de folha: o IR dos servidores ainda não retido entra no pagamento.
    const irDaFolha = await irDaFolhaNoPagamento(cliente(), { liquidacaoId: input.liquidacaoId, data: input.data, contaBancariaId: conta.id });
    const consignacaoDaFolha = irDaFolha?.consignacao ?? null;
    // V28 — os demais descontos dos servidores (previdência, pensão, consignado) que nenhum pagamento vivo
    // reteve, pela consignação declarada de cada rubrica. Um (tipo, credor) que o operador já informou não
    // é somado de novo; o `pagar` confere, na transação, que o retido cobre o devido.
    const descontos = await descontosDaFolhaPendentes(cliente(), input.liquidacaoId);
    const informadas = new Set((input.retencoes ?? []).map((r) => `${r.tipoConsignacaoId}|${r.credorConsignatario.trim()}`));
    const descontosAReter = (descontos?.porConsignacao ?? [])
      .filter((d) => !informadas.has(`${d.tipoConsignacaoId}|${d.credorConsignatario.trim()}`))
      .map((d) => ({ tipoConsignacaoId: d.tipoConsignacaoId, credorConsignatario: d.credorConsignatario, valor: d.valor.toFixed(2) }));
    const daFolha = [...(consignacaoDaFolha === null ? [] : [consignacaoDaFolha]), ...descontosAReter];
    const comFolha: RetencoesDoPagamento | undefined =
      irDaFolha === null && daFolha.length === 0
        ? retencoes
        : {
            contaDisponibilidade: contaContabilDaConta,
            retencoes: [
              ...(retencoes?.retencoes ?? []),
              ...(daFolha.length === 0 ? [] : ((await comporRetencoes(daFolha, contaContabilDaConta))?.retencoes ?? [])),
            ],
            ...(retencoes?.calculos !== undefined ? { calculos: retencoes.calculos } : {}),
            proprias: [...(retencoes?.proprias ?? []), ...(irDaFolha?.propria == null ? [] : [irDaFolha.propria])],
          };
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
        ...(input.ordemDePagamentoId !== undefined
          ? { ordemDePagamentoId: input.ordemDePagamentoId }
          : {}),
        ...(input.justificativaOrdemConstitucional !== undefined && input.justificativaOrdemConstitucional !== ""
          ? { justificativaOrdemConstitucional: input.justificativaOrdemConstitucional }
          : {}),
        ...(input.numeroDoCheque !== undefined && input.numeroDoCheque !== "" ? { numeroDoCheque: input.numeroDoCheque } : {}),
      },
      roteiroPagamento({
        // V24 — a obrigação que ESTA liquidação creditou (salário, encargo, fornecedor), e não sempre
        // fornecedores. Sem obrigação única, o `pagar` recusa nomeando; o fornecedor fica só de reserva.
        obrigacaoAPagar: obrigacaoDaLiquidacao[0] ?? CONTA_FORNECEDORES_A_PAGAR,
        disponibilidade: contaContabilDaConta,
      }),
      deps,
      // ⚠️ `undefined`, e não `{retencoes: []}`, quando não há retenção: é o que faz o
      // motor do M07 devolver EXATAMENTE as partidas de antes. Um objeto vazio passaria
      // pelo caminho composto para chegar ao mesmo lugar — e "chegar ao mesmo lugar" é
      // uma promessa que só um teste sustenta, não uma que se assuma.
      comFolha
    );
    return r.pagamentoId;
  });
}

/**
 * Resolve a CONTA DE PASSIVO de cada retenção no cadastro — fail-closed.
 *
 * ⚠️ A CONTA NÃO VEM DO NAVEGADOR. A tela manda tipo, credor e valor; qual passivo
 * recebe aquela consignação é parâmetro do ente, e lê-se aqui, do banco. Aceitar a conta
 * do formulário deixaria qualquer requisição escolher onde a dívida nasce — inclusive
 * numa conta de despesa, e o lançamento fecharia.
 */
async function comporRetencoes(
  pedidas: readonly {
    readonly tipoConsignacaoId: string;
    readonly credorConsignatario: string;
    readonly valor: string;
  }[],
  /** V6 P1.2 — a conta contábil da conta bancária que paga (a mesma perna do roteiro). */
  contaDisponibilidade: string
): Promise<RetencoesDoPagamento | undefined> {
  if (pedidas.length === 0) return undefined;

  const tipos = await listarTiposConsignacao(cliente());
  const porId = new Map(tipos.map((t) => [t.id, t] as const));

  return {
    contaDisponibilidade,
    retencoes: pedidas.map((r) => {
      const tipo = porId.get(r.tipoConsignacaoId);
      if (tipo === undefined) {
        throw new Error(
          `Tipo de consignação ${r.tipoConsignacaoId} não existe. Nada foi gravado.`
        );
      }
      if (!tipo.ativo) {
        throw new Error(
          `O tipo de consignação ${tipo.codigo} (${tipo.descricao}) está INATIVO e não ` +
            `pode receber retenção nova. Nada foi gravado.`
        );
      }
      if (tipo.contaPassivoCodigo === null) {
        throw new Error(
          `O tipo de consignação ${tipo.codigo} (${tipo.descricao}) não tem CONTA DE ` +
            `PASSIVO parametrizada. Reter é fazer nascer uma dívida com o consignatário, ` +
            `e sem saber em que conta ela nasce o lançamento não teria a perna do ` +
            `passivo. Cadastre a conta antes de reter. Nada foi gravado.`
        );
      }
      return {
        tipoConsignacaoId: r.tipoConsignacaoId,
        credorConsignatario: r.credorConsignatario,
        valor: r.valor,
        contaConsignacaoAPagar: tipo.contaPassivoCodigo,
      };
    }),
  };
}

/** Um tipo de consignação como o form de pagamento o consome. */
export interface TipoDeConsignacaoDaTela {
  readonly id: string;
  readonly codigo: string;
  readonly descricao: string;
  /** `false` = o tipo existe mas NÃO pode receber retenção; a tela diz por quê. */
  readonly disponivel: boolean;
  readonly motivoIndisponivel: string | null;
}

/**
 * OS TIPOS DE CONSIGNAÇÃO PARA A TELA — inclusive os que NÃO dá para usar, e o motivo.
 *
 * ⚠️ ESCONDER O INDISPONÍVEL SERIA PIOR. Quem precisa reter ISS e não encontra "ISS" na
 * lista conclui que o sistema não faz retenção de ISS, e vai gravar o pagamento cheio. A
 * lista mostra o tipo, desabilitado, dizendo que falta a conta de passivo — que é uma
 * pendência de CADASTRO, resolvível, e não um limite do sistema.
 */
export async function lerTiposDeConsignacao(): Promise<
  readonly TipoDeConsignacaoDaTela[]
> {
  const tipos = await listarTiposConsignacao(cliente());
  return tipos.map((t) => ({
    id: t.id,
    codigo: t.codigo,
    descricao: t.descricao,
    disponivel: t.ativo && t.contaPassivoCodigo !== null,
    motivoIndisponivel: !t.ativo
      ? "tipo inativo no cadastro"
      : t.contaPassivoCodigo === null
        ? "sem conta de passivo parametrizada"
        : null,
  }));
}

/**
 * ⚠️ A DISPONIBILIDADE DO ROTEIRO É O BANCO — e ela é UMA, não a da conta escolhida.
 *
 * `Pagamento.contaBancaria` guarda o CÓDIGO da conta (é ele que a TR 5.23 casa com a
 * fonte); a perna patrimonial do razão credita a conta CONTÁBIL de bancos. São coisas
 * diferentes: o ente tem várias contas bancárias e uma conta de Bancos no PCASP.
 *
 * ⚠️ V6 P1.2: a conta contábil de disponibilidade deixou de ser constante aqui — é a conta
 * contábil mapeada da conta bancária que paga (ver `registrarPagamento`). A divergência
 * M04×M05 do plano mínimo (Caixa 1.1.1.1.1 × Bancos 1.1.1.1.2) fica resolvida pelo cadastro
 * da conta, que é quem diz. Pendência PCASP-COMPLETO continua para o plano em si.
 */

/** Centavos (BigInt) → "1234.56". Sem float em nenhum ponto. */
function emReais(centavos: bigint): string {
  const neg = centavos < 0n;
  const abs = neg ? -centavos : centavos;
  const s = abs.toString().padStart(3, "0");
  return `${neg ? "-" : ""}${s.slice(0, -2)}.${s.slice(-2)}`;
}
