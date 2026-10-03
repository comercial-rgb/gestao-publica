import { z } from "zod";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { Decimal, toMoney, sumMoney, type Money } from "../../packages/contracts/index.js";
import { diaCivil } from "../../packages/datas/index.js";
import { empenhar } from "../m05-despesa/servico.js";
import { reservarNumero } from "../m05-despesa/numerador.js";
import { elementoDebitaEstoque, roteiroEmpenho } from "../m01-core-contabil/roteiros.js";
import { criarM05DepsComContratos } from "../m11-licitacoes/adapter-m05.js";
import { zCompetencia, type TipoDeFolha } from "./dominio.js";
/**
 * ⚠️ V11 V9.3 — A EFETIVAÇÃO PRECISA SABER SE O QUE ELA VAI EMPENHAR É APURAÇÃO OU SIMULAÇÃO.
 * O leitor vive no serviço do parâmetro do 13º porque é lá que mora a leitura da memória; aqui se
 * decide o que fazer com a resposta.
 */
import { criterioDoAbatimentoNoCalculo } from "./decimo-terceiro-servico.js";

/**
 * ═══ M33 — A APROPRIAÇÃO CONTÁBIL DA FOLHA (V6 P2.3b; TR 5.12.71/72) ═══
 *
 * A folha FECHADA vira despesa: os PROVENTOS de cada contracheque, agrupados pelo GRUPO DE
 * EMPENHO (quais rubricas, em qual ficha), geram empenhos pelo M05 — com o roteiro contábil de
 * sempre, o saldo da ficha travado e conferido na transação, o exercício conferido e a fila do
 * art. 141 alimentada. Nada aqui reimplementa despesa: o ato é o `empenhar` do M05.
 *
 * ⚠️ SÓ O BRUTO. Contribuição e imposto retidos do servidor NÃO são despesa orçamentária — são
 * retenções que viajam no PAGAMENTO. Empenhá-los duplicaria a despesa e inflaria o empenhado do
 * ente pela metade do líquido de cada servidor.
 *
 * ⚠️ A NUMERAÇÃO É DETERMINÍSTICA — e é ela que dá IDEMPOTÊNCIA. O número do empenho é
 * `<série>/<competência>/<matrícula ou código do grupo>`, e o `@@unique([fichaId, numero])` do
 * M05 faz a segunda tentativa bater na constraint. Reexecutar a apropriação CONTINUA de onde
 * parou em vez de duplicar a despesa.
 *
 * ⚠️ E ELA NÃO É ATÔMICA ENTRE EMPENHOS, por medida e não por descuido: `deps.despesa.empenhar`
 * abre a PRÓPRIA transação no adapter do M05 (é lá que a ficha é travada), e uma transação única
 * para mil empenhos manteria as fichas do ente travadas por minutos. Cada empenho é um fato; a
 * apropriação que parar por falta de saldo DIZ em qual ficha e em qual matrícula parou, e
 * continuar é reexecutá-la.
 */

export class FolhaNaoFechadaError extends Error {
  constructor(competencia: string) {
    super(
      `FOLHA-NAO-FECHADA: a folha de ${competencia} ainda não foi fechada. Só o cálculo congelado pelo fechamento vira ` +
        `despesa — apropriar um cálculo que ainda pode ser cancelado empenharia um valor que a competência pode mudar. Nada foi gravado.`
    );
    this.name = "FolhaNaoFechadaError";
  }
}

/**
 * ═══ V11 V9.3 — LACUNA NORMATIVA BLOQUEIA A EFETIVAÇÃO CORRESPONDENTE ═══
 *
 * ⚠️ O RECORTE É O PONTO, e ele é estreito de propósito: o que fica bloqueado é a apropriação da
 * FOLHA DE 13º QUE APLICOU ABATIMENTO. A folha mensal segue, o adiantamento segue, um 13º sem
 * abatimento segue, e o CÁLCULO desta mesma folha segue — ele é a simulação, e é ela que mostra
 * ao ente o que está em jogo quando ele for declarar o critério. Bloquear a construção em vez da
 * efetivação transformaria uma pergunta normativa em paralisação.
 *
 * ⚠️ E NÃO HÁ CAIXA DE ACEITE. Não existe "confirmo sob minha responsabilidade" que destrave
 * isto: essa caixa transfere a culpa para quem clicou e deixa o desconto no contracheque do
 * servidor do mesmo jeito. O que destrava é o ENTE declarar o critério no parâmetro versionado,
 * com o ato que o fundamenta — o mesmo mecanismo do avo e do percentual da 1ª parcela.
 *
 * ⚠️ NADA ANTERIOR É DESFEITO. Uma folha de 13º já apropriada continua apropriada; os empenhos
 * gravados continuam valendo. O que se impede é o ato que ainda não aconteceu.
 */
export class AbatimentoSemCriterioDeclaradoError extends Error {
  constructor(competencia: string, exercicio: number | null, totalAbatido: string) {
    super(
      `ABATIMENTO-SEM-CRITERIO-DECLARADO: o 13º de ${competencia} abateu ${totalAbatido} de 1ª parcela, ` +
        `e o parâmetro do 13º${exercicio === null ? "" : ` de ${exercicio}`} sob o qual este cálculo rodou ` +
        `NÃO declara qual estado o adiantamento precisa ter alcançado para ser abatido. O abatimento saiu ` +
        `pelo FECHAMENTO da folha de adiantamento — critério de ENGENHARIA, não norma do ente —, e ` +
        `empenhar isso seria transformar em despesa uma apuração que nenhum ato sustenta. ` +
        `O que destrava: o ente cadastra a versão seguinte do parâmetro declarando o critério ` +
        `(FECHADO, CERTIFICADO ou PAGO) com o ato que o fundamenta, em Folha > Parâmetros do 13º, e a ` +
        `folha é recalculada. Não há dispensa nem confirmação que substitua o ato. ` +
        `O cálculo continua disponível como SIMULAÇÃO. Nada foi gravado.`
    );
    this.name = "AbatimentoSemCriterioDeclaradoError";
  }
}

/**
 * ═══ V13 rodada 3 — O RAMO DO PCASP QUE A TABELA TEM PARA O VALE ═══
 *
 * ⚠️ ESTE PREFIXO NÃO FOI ESCOLHIDO: FOI PROCURADO E ENCONTRADO. O plano oficial do TCE-PB
 * (`docs/oficial/tce-pb/Pcasp_2025.xlsx`, sha256 conferido no `MANIFEST.json`, 7.864 contas) traz
 * o ramo `1.1.3.1 ADIANTAMENTOS CONCEDIDOS`, e dentro dele
 * `1.1.3.1.1.01 ADIANTAMENTOS CONCEDIDOS A PESSOAL` com
 * **`1.1.3.1.1.01.01 SALÁRIOS E ORDENADOS - ADIANTAMENTOS`** — analítica, DEVEDORA, que é
 * exatamente o vale: um DIREITO a receber do servidor, ativo, e não despesa de pessoal do mês.
 *
 * ⚠️ E O PREFIXO É O RAMO, NÃO A FOLHA. Aceitar `1.1.3.1` e não cravar `...01.01` é deliberado:
 * quem escolhe a conta analítica é o ente (o ramo tem consolidação, INTRA e INTER OFSS, e o ente
 * pode ter desdobramento próprio). O sistema exige que a contrapartida seja um ADIANTAMENTO
 * CONCEDIDO; qual delas é decisão dele, e a mensagem nomeia a que o TCE tem para este caso.
 */
const RAMO_ADIANTAMENTOS_CONCEDIDOS = "1.1.3.1";
const CONTA_SUGERIDA_DO_VALE = "1.1.3.1.1.01.01 (SALÁRIOS E ORDENADOS - ADIANTAMENTOS)";

/**
 * ⚠️ A RECUSA QUE IMPEDE O VALE DE VIRAR DESPESA DE PESSOAL DUAS VEZES NO PATRIMÔNIO.
 *
 * A liquidação da folha debita a conta que o GRUPO declara (`contaVariacaoId`, o parâmetro
 * `variacaoDiminutiva` de `roteiroLiquidacaoDaFolha`). Apontá-la para a VPD de pessoal faz o vale
 * reconhecer despesa — e a folha MENSAL da mesma competência reconhece a MESMA remuneração de
 * novo, inteira. Medido na V13 rodada 2: 4.200,00 para 3.000,00 de custo.
 *
 * ⚠️ E ELA NÃO ESCOLHE NORMA: a conta existe na tabela oficial, e a recusa só exige que a
 * contrapartida seja um ADIANTAMENTO CONCEDIDO em vez de uma variação diminutiva. Comprar um
 * computador também empenha e não gera VPD — debita o imobilizado; o vale é a mesma forma.
 */
export class VariacaoDoValeNaoEAdiantamentoError extends Error {
  constructor(grupo: string, conta: string | null, nome: string | null) {
    super(
      `CONTRAPARTIDA-DO-VALE-NAO-E-ADIANTAMENTO: o grupo ${grupo} empenha o adiantamento salarial e declara, como ` +
        `contrapartida patrimonial da liquidação, ` +
        (conta === null
          ? `NENHUMA conta`
          : `a conta ${conta}${nome === null ? "" : ` (${nome})`}, que não é um ADIANTAMENTO CONCEDIDO (${RAMO_ADIANTAMENTOS_CONCEDIDOS}.x)`) +
        `. O vale NÃO é despesa de pessoal do mês: ele é um DIREITO a receber do servidor, que a folha mensal abate ` +
        `depois. Liquidá-lo contra uma variação patrimonial diminutiva faz o ente reconhecer a MESMA remuneração ` +
        `duas vezes na mesma competência — uma no vale e outra na mensal, que empenha o BRUTO. ` +
        `O QUE FAZER: em Folha > Grupos de empenho, declare para este grupo uma conta do ramo ` +
        `${RAMO_ADIANTAMENTOS_CONCEDIDOS} ADIANTAMENTOS CONCEDIDOS. O plano oficial do TCE-PB traz ` +
        `${CONTA_SUGERIDA_DO_VALE} para exatamente este caso; se ela não estiver no seu plano de contas, semeie o ` +
        `plano oficial antes. Nada foi gravado.`
    );
    this.name = "VariacaoDoValeNaoEAdiantamentoError";
  }
}

/**
 * ⚠️ A RECUSA QUE IMPEDE O CRÉDITO ORÇAMENTÁRIO DE SER CONSUMIDO DUAS VEZES PELA MESMA VERBA.
 *
 * ⚠️ E AQUI NÃO HÁ NADA NA TABELA PARA DECIDIR, e é por isso que a saída é RECUSA e não escolha.
 * O PCASP responde onde o vale entra no PATRIMÔNIO; ele não diz se o vale consome dotação, nem em
 * que natureza de despesa. As duas práticas conhecidas são coerentes entre si e incompatíveis:
 *   (a) o vale é EXTRAORÇAMENTÁRIO — não empenha, e só a mensal consome dotação;
 *   (b) o vale é despesa orçamentária de natureza PRÓPRIA, distinta da remuneração do mês.
 * A fonte que escolhe entre as duas não foi localizada, e escolher aqui seria inventar norma.
 *
 * O que NÃO precisa de norma nenhuma é a aritmética: a MESMA natureza de despesa empenhando a
 * remuneração do mês E o adiantamento dela, na mesma competência, consome o crédito duas vezes
 * para o mesmo dinheiro. Isso não é prática alguma — é engano, sob (a) e sob (b). É isso, e só
 * isso, que esta recusa impede.
 *
 * Pendência `VALE-EMPENHADO-DUPLICA-A-DESPESA-DO-MES` no MODULO do M33, com as duas opções postas.
 */
export class ValeNaMesmaNaturezaDaRemuneracaoError extends Error {
  constructor(natureza: string, grupoDoVale: string, outros: readonly string[]) {
    super(
      `VALE-NA-MESMA-NATUREZA-DA-REMUNERACAO: o grupo ${grupoDoVale}, que empenha o adiantamento salarial, aponta ` +
        `para a natureza de despesa ${natureza} — a MESMA de ${outros.join(", ")}, que empenha${outros.length > 1 ? "m" : ""} ` +
        `a remuneração do mês. A mensal empenha o BRUTO (desconto é retenção do pagamento, não despesa), então a mesma ` +
        `verba consumiria a dotação DUAS VEZES na mesma competência: o vale e, de novo, a remuneração inteira de que ` +
        `ele já era parte. ` +
        `⚠️ ESTE SISTEMA NÃO ESCOLHE QUAL É O TRATAMENTO CERTO, porque isso é normativo e a fonte não foi localizada. ` +
        `As duas práticas conhecidas são: (a) o vale é EXTRAORÇAMENTÁRIO e não empenha — caminho que este sistema ` +
        `ainda não tem; (b) o vale é despesa orçamentária de natureza PRÓPRIA, e aí basta apontar este grupo para uma ` +
        `ficha de natureza distinta da remuneração. O QUE FAZER: decida com fundamento e, se for (b), aponte o grupo ` +
        `para a outra ficha; se for (a), registre a pendência — empenhar assim seria somar ao gasto do ente um valor ` +
        `que ele não gastou. Nada foi gravado.`
    );
    this.name = "ValeNaMesmaNaturezaDaRemuneracaoError";
  }
}

export class SemGrupoDeEmpenhoError extends Error {
  constructor(rubricas: readonly string[]) {
    super(
      `RUBRICA-SEM-GRUPO-DE-EMPENHO: ${rubricas.join(", ")} — ${rubricas.length === 1 ? "esta rubrica de provento não está" : "estas rubricas de provento não estão"} ` +
        `em nenhum grupo de empenho, e por isso ${rubricas.length === 1 ? "não teria" : "não teriam"} ficha onde empenhar. Apropriar assim empenharia MENOS do que a folha paga. ` +
        `Inclua-${rubricas.length === 1 ? "a" : "as"} num grupo antes. Nada foi gravado.`
    );
    this.name = "SemGrupoDeEmpenhoError";
  }
}

export class ApropriacaoInterrompidaError extends Error {
  constructor(
    readonly feitos: number,
    readonly ondeParou: string,
    readonly motivo: string
  ) {
    super(
      `APROPRIACAO-INTERROMPIDA: ${feitos} empenho(s) já gravado(s), e a apropriação parou em ${ondeParou}. Motivo: ${motivo} ` +
        `Os empenhos gravados CONTINUAM válidos (cada um é um fato); resolva a causa e apropriar de novo continua de onde parou — ` +
        `a numeração é determinística e não duplica.`
    );
    this.name = "ApropriacaoInterrompidaError";
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// O CADASTRO DO GRUPO
// ═══════════════════════════════════════════════════════════════════════════════

export const zCadastrarGrupoDeEmpenhoInput = z
  .object({
    codigo: z.string().trim().min(1).max(20),
    descricao: z.string().trim().min(3),
    fichaId: z.string().min(1),
    categoriaOrdemCronologica: z.enum(["FORNECIMENTO_BENS", "LOCACAO", "PRESTACAO_SERVICOS", "REALIZACAO_OBRAS"]),
    tipoEmpenho: z.enum(["ORDINARIO", "GLOBAL", "ESTIMATIVO"]),
    serie: z.string().trim().regex(/^[A-Z0-9-]{1,10}$/, "série em maiúsculas, dígitos ou hífen (até 10)"),
    porServidor: z.boolean(),
    credorId: z.string().min(1).optional(),
    /**
     * V6.1 — AS DUAS CONTAS PATRIMONIAIS DA LIQUIDAÇÃO, obrigatórias no CADASTRO (a coluna é
     * nullable só para não inventar conta nos grupos já gravados). A VPD que a liquidação debita
     * e a obrigação de pessoal que ela credita são decisão do contador do ente — o rol
     * elemento→conta do M01 não cobre a folha, e a VPD dele é de serviços de terceiros.
     */
    contaVariacaoId: z.string().min(1),
    contaObrigacaoId: z.string().min(1),
    rubricaIds: z.array(z.string().min(1)).min(1, "o grupo empenha ao menos uma rubrica"),
    criadoPor: z.string().min(1),
  })
  .superRefine((v, ctx) => {
    if (!v.porServidor && v.credorId === undefined) {
      ctx.addIssue({ code: "custom", path: ["credorId"], message: "O empenho ÚNICO do grupo precisa de um credor declarado — no empenho por servidor o credor é o CPF de cada um." });
    }
    if (v.porServidor && v.credorId !== undefined) {
      ctx.addIssue({ code: "custom", path: ["credorId"], message: "No empenho POR SERVIDOR o credor é o CPF de cada servidor; um credor declarado aqui seria ignorado, e ignorar em silêncio é pior do que recusar." });
    }
  });
export type CadastrarGrupoDeEmpenhoInput = z.input<typeof zCadastrarGrupoDeEmpenhoInput>;

export async function cadastrarGrupoDeEmpenhoDaFolha(prisma: PrismaClient, input: CadastrarGrupoDeEmpenhoInput): Promise<{ readonly grupoId: string }> {
  const d = zCadastrarGrupoDeEmpenhoInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarGrupoDeEmpenhoDaFolha, "ENTE");

    if ((await tx.grupoDeEmpenhoDaFolha.findUnique({ where: { codigo: d.codigo }, select: { id: true } })) !== null) {
      throw new Error(`GRUPO-REPETIDO: já existe grupo de empenho com o código ${d.codigo}. Nada foi gravado.`);
    }
    const ficha = await tx.fichaOrcamentaria.findUnique({
      where: { id: d.fichaId },
      select: { id: true, numero: true, naturezaDespesa: { select: { codElemento: true, codigoCompleto: true } } },
    });
    if (ficha === null) throw new Error(`Ficha orçamentária ${d.fichaId} não existe. Nada foi gravado.`);
    // ⚠️ O GANCHO DE ESTOQUE NÃO PODE DISPARAR EM FOLHA, e a hora de impedir é AQUI — não na
    // liquidação, quando metade dos empenhos já existe. O M05 exige entrada no almoxarifado para
    // todo elemento que DEBITA ESTOQUE; um grupo de folha apontado para uma ficha de material
    // empenharia normalmente e travaria na liquidação, com uma mensagem sobre almoxarifado que
    // não explica nada a quem cadastrou o grupo.
    if (elementoDebitaEstoque(ficha.naturezaDespesa.codElemento)) {
      throw new Error(
        `FICHA-DE-MATERIAL-NO-GRUPO-DA-FOLHA: a ficha ${ficha.numero} é do elemento ` +
          `${ficha.naturezaDespesa.codElemento} (${ficha.naturezaDespesa.codigoCompleto}), que debita ESTOQUE — material de ` +
          `consumo, não remuneração. A liquidação dessa despesa exige entrada no almoxarifado, que a folha não tem. ` +
          `Aponte o grupo para uma ficha de pessoal. Nada foi gravado.`
      );
    }
    for (const [campo, id] of [["contaVariacaoId", d.contaVariacaoId], ["contaObrigacaoId", d.contaObrigacaoId]] as const) {
      if ((await tx.contaPcasp.findUnique({ where: { id }, select: { id: true } })) === null) {
        throw new Error(`Conta do plano ${id} (${campo}) não existe. Nada foi gravado.`);
      }
    }
    if (d.credorId !== undefined && (await tx.pessoa.findUnique({ where: { id: d.credorId }, select: { id: true } })) === null) {
      throw new Error(`Credor ${d.credorId} não existe no cadastro de pessoas. Nada foi gravado.`);
    }

    const rubricas = await tx.rubrica.findMany({ where: { id: { in: d.rubricaIds } }, select: { id: true, codigo: true, tipo: true, grupoDeEmpenho: { select: { grupo: { select: { codigo: true } } } } } });
    if (rubricas.length !== d.rubricaIds.length) throw new Error("Rubrica inexistente entre as informadas. Nada foi gravado.");
    // ⚠️ SÓ PROVENTO SE EMPENHA: o desconto é retenção do pagamento, e empenhá-lo duplicaria a
    // despesa. Recusar aqui é mais barato que descobrir no empenhado do ente.
    const descontos = rubricas.filter((r) => r.tipo !== "PROVENTO");
    if (descontos.length > 0) {
      throw new Error(
        `RUBRICA-DE-DESCONTO-NO-GRUPO: ${descontos.map((r) => r.codigo).join(", ")} — desconto não é despesa orçamentária, é retenção do pagamento. ` +
          `Empenhá-lo somaria à despesa do ente um valor que ele nunca gastou. Nada foi gravado.`
      );
    }
    const jaEmOutro = rubricas.filter((r) => r.grupoDeEmpenho !== null);
    if (jaEmOutro.length > 0) {
      throw new Error(
        `RUBRICA-JA-EM-OUTRO-GRUPO: ${jaEmOutro.map((r) => `${r.codigo} (no grupo ${r.grupoDeEmpenho?.grupo.codigo ?? "?"})`).join(", ")}. ` +
          `Uma rubrica empenha numa ficha só — em duas, a mesma verba viraria despesa duas vezes. Nada foi gravado.`
      );
    }

    const g = await tx.grupoDeEmpenhoDaFolha.create({
      data: {
        codigo: d.codigo, descricao: d.descricao, fichaId: d.fichaId,
        categoriaOrdemCronologica: d.categoriaOrdemCronologica, tipoEmpenho: d.tipoEmpenho,
        serie: d.serie, porServidor: d.porServidor, credorId: d.credorId ?? null, criadoPor: d.criadoPor,
        contaVariacaoId: d.contaVariacaoId, contaObrigacaoId: d.contaObrigacaoId,
        rubricas: { create: d.rubricaIds.map((rubricaId) => ({ rubricaId, criadoPor: d.criadoPor })) },
      },
      select: { id: true },
    });
    return { grupoId: g.id };
  });
}

export const zDefinirContasDaLiquidacaoInput = z.object({
  grupoId: z.string().min(1),
  contaVariacaoId: z.string().min(1),
  contaObrigacaoId: z.string().min(1),
  criadoPor: z.string().min(1),
});
export type DefinirContasDaLiquidacaoInput = z.input<typeof zDefinirContasDaLiquidacaoInput>;

/**
 * DEFINE (OU TROCA) AS DUAS CONTAS PATRIMONIAIS DA LIQUIDAÇÃO DESTE GRUPO.
 *
 * ⚠️ É O ÚNICO UPDATE DO M33, e ele existe por uma razão medida: as colunas nasceram NULLABLE
 * (migration aditiva, sem inventar conta para grupo já gravado), e sem este ato os grupos
 * cadastrados antes desta entrega ficariam para sempre sem caminho pela tela — a liquidação
 * recusaria e não haveria como resolver. Criar um grupo novo também não serviria: uma rubrica
 * pertence a um grupo só, e mudá-la de grupo exigiria DELETE.
 *
 * ⚠️ O PASSADO NÃO MUDA. As liquidações já gravadas têm o seu lançamento no razão, com as contas
 * que valiam no ato; trocar aqui vale para as PRÓXIMAS. É a mesma doutrina da tabela do ente:
 * parâmetro novo não recalcula competência fechada.
 *
 * O grant é por COLUNA (`prisma/papel-runtime.ts`): o runtime não alcança ficha, série, credor
 * nem `porServidor` — trocar a ficha de um grupo já empenhado moveria a despesa de dotação.
 */
export async function definirContasDaLiquidacaoDoGrupo(prisma: PrismaClient, input: DefinirContasDaLiquidacaoInput): Promise<{ readonly grupoId: string }> {
  const d = zDefinirContasDaLiquidacaoInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.definirContasDaLiquidacaoDoGrupo, "ENTE");
    const g = await tx.grupoDeEmpenhoDaFolha.findUnique({ where: { id: d.grupoId }, select: { id: true, codigo: true } });
    if (g === null) throw new Error(`Grupo de empenho ${d.grupoId} não existe. Nada foi gravado.`);
    for (const [campo, id] of [["contaVariacaoId", d.contaVariacaoId], ["contaObrigacaoId", d.contaObrigacaoId]] as const) {
      if ((await tx.contaPcasp.findUnique({ where: { id }, select: { id: true } })) === null) {
        throw new Error(`Conta do plano ${id} (${campo}) não existe. Nada foi gravado.`);
      }
    }
    await tx.grupoDeEmpenhoDaFolha.update({ where: { id: g.id }, data: { contaVariacaoId: d.contaVariacaoId, contaObrigacaoId: d.contaObrigacaoId } });
    return { grupoId: g.id };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// O ATO — a folha fechada vira despesa
// ═══════════════════════════════════════════════════════════════════════════════

export const zApropriarFolhaInput = z.object({
  folhaId: z.string().min(1),
  /** A data dos empenhos; precisa cair no exercício ABERTO da ficha (o M05 confere). */
  dataDoEmpenho: z.coerce.date(),
  criadoPor: z.string().min(1),
});
export type ApropriarFolhaInput = z.input<typeof zApropriarFolhaInput>;

export interface ResultadoDaApropriacao {
  readonly apropriacaoId: string;
  readonly competencia: string;
  /** Empenhos gravados NESTA execução. */
  readonly empenhados: number;
  /** Já existiam (execução anterior): a numeração determinística os reconheceu. */
  readonly jaExistiam: number;
  /** V32 — dos que já existiam, quantos estavam SEM o elo com a folha (a janela da queda) e foram amarrados agora. */
  readonly religados: number;
  readonly total: Money;
  readonly porGrupo: readonly { readonly codigo: string; readonly ficha: number; readonly empenhos: number; readonly valor: Money }[];
}

/** O grupo, tal como a apropriação e a certificação o leem. */
export interface GrupoParaApropriacao {
  readonly id: string;
  readonly codigo: string;
  readonly descricao: string;
  readonly serie: string;
  readonly porServidor: boolean;
  readonly tipoEmpenho: "ORDINARIO" | "GLOBAL" | "ESTIMATIVO";
  readonly categoriaOrdemCronologica: "FORNECIMENTO_BENS" | "LOCACAO" | "PRESTACAO_SERVICOS" | "REALIZACAO_OBRAS";
  readonly fichaId: string;
  readonly ficha: { readonly numero: number };
  readonly credor: { readonly documento: string } | null;
  readonly contaVariacao: { readonly codigo: string } | null;
  readonly contaObrigacao: { readonly codigo: string } | null;
  readonly rubricas: readonly { readonly rubricaId: string }[];
}

/**
 * O NÚMERO DO EMPENHO DA FOLHA — determinístico, e é o que impede a duplicação.
 *
 * ═══ ⚠️ V11 V9.3 — O TIPO DA FOLHA ENTROU, E ELE CONSERTA UMA COLISÃO REAL ═══
 *
 * Até aqui o número era `série/competência/sufixo`, sem o tipo. **Duas folhas de tipos
 * DIFERENTES na MESMA competência produziam o MESMO número** quando compartilhavam grupo e
 * matrícula — e isso não é hipótese futura: basta o ente pôr o vencimento e a rubrica do
 * adiantamento do 13º no mesmo grupo (mesma ficha, mesmas contas patrimoniais) para que a folha
 * MENSAL de 2026-06 e o ADIANTAMENTO de 2026-06 colidam. `apropriarFolha` encontrava o empenho
 * da primeira, contava `jaExistiam` e **pulava em silêncio**: a segunda folha ficava apropriada
 * com ZERO empenhos, os totais fechavam e nenhuma etapa adiante acusava.
 *
 * ⚠️ A MENSAL FICA BYTE A BYTE IGUAL, e isso é a metade que torna a mudança segura. Todo empenho
 * de folha mensal já gravado continua sendo encontrado pela mesma chave, e a reexecução continua
 * idempotente. Quem ganha segmento é só quem não o tinha por que ter — os tipos que nasceram
 * depois da numeração.
 *
 * ⚠️ E O SEGMENTO É O NOME DO ENUM, NÃO UM CÓDIGO CURTO. Um `Record<TipoDeFolha, "A13" | ...>`
 * seria mais curto e seria uma SEGUNDA tabela a manter em dia com a primeira — a cópia que
 * diverge. O número é chave de negócio; um mapa paralelo que envelhece é pior que dez caracteres.
 *
 * ⚠️ APURADO ANTES DE ESCOLHER: nenhuma restrição externa impede o nome longo. O SAGRES (TCE-PB)
 * lê `empenho.numero` no campo `numEmpenho`, NUMÉRICO de 7 posições (`layout-2026v11.ts:122`,
 * `captura/dto-captura.ts:62`) — e a numeração da folha, com série e barras, **já estava fora
 * desse campo antes desta mudança**; o próprio `sagres/MODULO.md:137` declara que "a numeração da
 * UG precisa ser numérica". Isso é pendência anterior e independente
 * (`NUMERACAO-DA-FOLHA-FORA-DO-CAMPO-DO-SAGRES`, ver o MODULO do M33), não algo que este
 * segmento cria. Internamente não há limite: `numero` é `z.string().min(1)` e coluna `TEXT`.
 */
export function numeroDoEmpenhoDaFolha(serie: string, competencia: string, sufixo: string, tipo: TipoDeFolha): string {
  return tipo === "MENSAL" ? `${serie}/${competencia}/${sufixo}` : `${serie}/${competencia}/${tipo}/${sufixo}`;
}

/**
 * O NÚMERO COMO ELE ERA ANTES DA V11 V9.3 — e ele existe só para ser RECONHECIDO, nunca gravado.
 *
 * ⚠️ IDEMPOTÊNCIA QUE QUEBRA PARA TRÁS É PIOR QUE A COLISÃO. Uma folha de 13º apropriada ANTES
 * desta mudança tem empenhos gravados com o número sem o segmento. Sem esta função, a reexecução
 * não os encontraria e empenharia TUDO DE NOVO — duplicando a despesa de quem só quis retomar.
 *
 * ⚠️ E O RECONHECIMENTO É PELO ELO, NUNCA PELA COINCIDÊNCIA DO NÚMERO. Achar um empenho com o
 * número legado não prova que ele é desta folha: numa colisão, o que está lá é o empenho da
 * MENSAL. Quem prova é `EmpenhoDaFolha → apropriação → folhaId`. Sem essa conferência, a retomada
 * do legado passaria a ser a própria colisão, com outro nome.
 */
export function numeroLegadoDoEmpenhoDaFolha(serie: string, competencia: string, sufixo: string): string {
  return `${serie}/${competencia}/${sufixo}`;
}

/**
 * AS PARCELAS QUE UM CÁLCULO GERA — quem empenha o quê, em qual ficha, por quem.
 *
 * ⚠️ EXTRAÍDA PARA SER A ÚNICA VERDADE. A certificação (V6.1) precisa mostrar ao atestador as
 * "alocações a conferir" — e se ela reconstruísse o agrupamento por conta própria, o atesto
 * poderia descrever uma distribuição e a apropriação empenhar outra, sem que nada quebrasse.
 * Quem chama a aplica: `apropriarFolha` empenha parcela a parcela; a certificação soma por grupo.
 */
export interface ParcelaDaFolha {
  readonly grupo: GrupoParaApropriacao;
  readonly vinculoId: string | null;
  readonly matricula: string | null;
  readonly credorCpfCnpj: string;
  valor: Money;
}

export interface ParcelasDoCalculo {
  readonly parcelas: readonly ParcelaDaFolha[];
  /** Rubricas de provento que nenhum grupo empenha — a folha pagaria mais do que o ente empenhou. */
  readonly rubricasSemGrupo: readonly string[];
  /** Quantas linhas de provento o cálculo tem (zero significa cálculo sem provento nenhum). */
  readonly linhasDeProvento: number;
}

export async function parcelasDoCalculo(prisma: PrismaClient, calculoId: string): Promise<ParcelasDoCalculo> {
  const grupos = await prisma.grupoDeEmpenhoDaFolha.findMany({
    orderBy: { codigo: "asc" },
    select: {
      id: true, codigo: true, descricao: true, serie: true, porServidor: true, tipoEmpenho: true, categoriaOrdemCronologica: true,
      fichaId: true, ficha: { select: { numero: true } },
      credor: { select: { documento: true } },
      contaVariacao: { select: { codigo: true } },
      contaObrigacao: { select: { codigo: true } },
      rubricas: { select: { rubricaId: true } },
    },
  });
  const grupoDaRubrica = new Map<string, GrupoParaApropriacao>();
  for (const g of grupos) for (const r of g.rubricas) grupoDaRubrica.set(r.rubricaId, g);

  const linhas = await prisma.linhaDoContracheque.findMany({
    where: { contracheque: { calculoId }, tipo: "PROVENTO" },
    select: {
      valor: true, rubricaId: true, rubrica: { select: { codigo: true } },
      contracheque: { select: { vinculoId: true, vinculo: { select: { matricula: true, servidor: { select: { pessoa: { select: { documento: true } } } } } } } },
    },
  });

  const rubricasSemGrupo = [...new Set(linhas.filter((l) => !grupoDaRubrica.has(l.rubricaId)).map((l) => l.rubrica.codigo))].sort();

  const porChave = new Map<string, ParcelaDaFolha>();
  for (const l of linhas) {
    const g = grupoDaRubrica.get(l.rubricaId);
    if (g === undefined) continue;
    const chave = g.porServidor ? `${g.id}::${l.contracheque.vinculoId}` : g.id;
    const credor = g.porServidor ? l.contracheque.vinculo.servidor.pessoa.documento : (g.credor?.documento ?? "");
    const atual = porChave.get(chave);
    if (atual === undefined) {
      porChave.set(chave, {
        grupo: g,
        vinculoId: g.porServidor ? l.contracheque.vinculoId : null,
        matricula: g.porServidor ? l.contracheque.vinculo.matricula : null,
        credorCpfCnpj: credor,
        valor: toMoney(l.valor),
      });
    } else {
      atual.valor = toMoney(atual.valor.plus(toMoney(l.valor)));
    }
  }

  // ⚠️ A PARCELA ZERADA NÃO É PARCELA, e o filtro fica AQUI — não no laço do empenho.
  // Achado do teste do atesto: com o filtro só na apropriação, o manifesto do atestador listava
  // uma alocação ("grupo X, 1 empenho, 0.00") que a apropriação nunca empenhava. O atesto
  // descrevia uma distribuição e a despesa fazia outra — exatamente o que a função única existe
  // para impedir. Uma rubrica pode zerar por dias trabalhados, por lançamento cessado ou por
  // gratificação não devida naquela competência; empenho de 0,00 não é fato.
  const parcelas = [...porChave.values()]
    .filter((p) => p.valor.gt(0))
    .sort((a, b) => a.grupo.codigo.localeCompare(b.grupo.codigo) || (a.matricula ?? "").localeCompare(b.matricula ?? ""));
  return { parcelas, rubricasSemGrupo, linhasDeProvento: linhas.length };
}

/**
 * ═══ V13 rodada 3 — O QUE O VALE DA COMPETÊNCIA EXIGE, CONFERIDO ANTES DE QUALQUER GRAVAÇÃO ═══
 *
 * Roda para QUALQUER folha que se aproprie numa competência que tenha uma folha de adiantamento
 * salarial FECHADA — e a simetria é o ponto: se ela só olhasse a folha do vale, bastaria apropriar
 * o vale primeiro e a mensal depois para a duplicação voltar pela outra ponta.
 *
 * ⚠️ E ELA NÃO LÊ O PARÂMETRO DO VALE, de propósito. Ler exigiria importar
 * `adiantamento-salarial-servico.ts`, que importa `certificacao.ts`, que importa ESTE arquivo —
 * ciclo de VALOR entre módulos ES, que não é erro de compilação: é uma função que chega
 * `undefined` em tempo de execução. Quem diz quais rubricas o vale pagou é o FATO: as linhas de
 * PROVENTO do cálculo que fechou aquela folha.
 */
async function exigirTratamentoDoValeDaCompetencia(
  prisma: PrismaClient,
  folha: { readonly id: string; readonly competencia: string; readonly tipo: string }
): Promise<void> {
  const vale = await prisma.folhaDePagamento.findUnique({
    where: { competencia_tipo: { competencia: folha.competencia, tipo: "ADIANTAMENTO_SALARIAL" } },
    select: { id: true, fechamento: { select: { calculoId: true } } },
  });
  // ⚠️ SEM VALE FECHADO NÃO HÁ NADA A CONFERIR, e isto NÃO é guarda desligada: é o estado normal
  // de toda competência de todo município que não paga adiantamento salarial.
  if (vale === null || vale.fechamento === null) return;

  const rubricasDoVale = await prisma.linhaDoContracheque.findMany({
    where: { contracheque: { calculoId: vale.fechamento.calculoId }, tipo: "PROVENTO" },
    select: { rubricaId: true },
    distinct: ["rubricaId"],
  });
  if (rubricasDoVale.length === 0) return;

  const noGrupo = await prisma.rubricaDoGrupoDeEmpenho.findMany({
    where: { rubricaId: { in: rubricasDoVale.map((r) => r.rubricaId) } },
    select: {
      grupoId: true,
      grupo: {
        select: {
          codigo: true,
          contaVariacaoId: true,
          ficha: { select: { naturezaDespesaId: true, naturezaDespesa: { select: { codigoCompleto: true, descricao: true } } } },
        },
      },
    },
  });
  // Sem grupo, quem recusa é `SemGrupoDeEmpenhoError`, com a mensagem dele. Aqui não se duplica.
  if (noGrupo.length === 0) return;

  /**
   * ── (1) A CONTRAPARTIDA PATRIMONIAL, e ela só se exige de QUEM É O VALE ──
   *
   * Recusar a MENSAL por causa da conta declarada no grupo do vale mandaria o operador procurar o
   * defeito na folha errada. A duplicação patrimonial acontece no ato de liquidar o vale, e é o
   * ato do vale que tem de parar.
   */
  if (folha.tipo === "ADIANTAMENTO_SALARIAL") {
    for (const g of noGrupo) {
      const contaId = g.grupo.contaVariacaoId;
      const conta =
        contaId === null
          ? null
          : await prisma.contaPcasp.findUnique({ where: { id: contaId }, select: { codigo: true, nome: true } });
      if (conta === null || !conta.codigo.startsWith(`${RAMO_ADIANTAMENTOS_CONCEDIDOS}.`)) {
        throw new VariacaoDoValeNaoEAdiantamentoError(g.grupo.codigo, conta?.codigo ?? null, conta?.nome ?? null);
      }
    }
  }

  /**
   * ── (2) A NATUREZA DE DESPESA, e esta vale para as DUAS pontas ──
   *
   * ⚠️ A CONFERÊNCIA É POR NATUREZA, NÃO POR FICHA. Duas fichas diferentes da MESMA natureza
   * consomem a mesma dotação classificada — trocar de ficha e manter o elemento seria contornar a
   * guarda sem corrigir nada, e o ente veria o gasto dobrado no mesmo 3.1.90.11.
   */
  const naturezasDoVale = new Map(noGrupo.map((g) => [g.grupo.ficha.naturezaDespesaId, g]));
  const idsDoVale = new Set(noGrupo.map((g) => g.grupoId));
  const outros = await prisma.grupoDeEmpenhoDaFolha.findMany({
    where: { id: { notIn: [...idsDoVale] }, ficha: { naturezaDespesaId: { in: [...naturezasDoVale.keys()] } } },
    select: { codigo: true, ficha: { select: { naturezaDespesaId: true } } },
    orderBy: { codigo: "asc" },
  });
  if (outros.length > 0) {
    const naturezaId = outros[0]!.ficha.naturezaDespesaId;
    const g = naturezasDoVale.get(naturezaId)!;
    const nd = g.grupo.ficha.naturezaDespesa;
    throw new ValeNaMesmaNaturezaDaRemuneracaoError(
      `${nd.codigoCompleto} (${nd.descricao})`,
      g.grupo.codigo,
      outros.filter((o) => o.ficha.naturezaDespesaId === naturezaId).map((o) => o.codigo)
    );
  }
}

export async function apropriarFolha(prisma: PrismaClient, input: ApropriarFolhaInput): Promise<ResultadoDaApropriacao> {
  const d = zApropriarFolhaInput.parse(input);

  const folha = await prisma.folhaDePagamento.findUnique({
    where: { id: d.folhaId },
    select: { id: true, competencia: true, tipo: true, exercicio: true, fechamento: { select: { calculoId: true } }, apropriacao: { select: { id: true } } },
  });
  if (folha === null) throw new Error(`Folha ${d.folhaId} não existe. Nada foi gravado.`);
  zCompetencia.parse(folha.competencia);
  if (folha.fechamento === null) throw new FolhaNaoFechadaError(folha.competencia);

  // A autorização do ATO (a do EMPENHO é exigida de novo, por empenho, dentro do M05).
  await prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.apropriarFolha, "ENTE");
  });

  /**
   * ⚠️ V11 V9.3 — ANTES DE QUALQUER GRAVAÇÃO, E ANTES DAS OUTRAS PRÉ-CONDIÇÕES DE CADASTRO.
   * Criar a `ApropriacaoDaFolha` e só então descobrir a lacuna deixaria o registro do ato de
   * apropriar existindo sobre uma folha que não podia ser apropriada — o efeito colateral antes
   * da guarda que este repositório já pagou para não repetir.
   */
  if (folha.tipo === "DECIMO_TERCEIRO") {
    const criterio = await criterioDoAbatimentoNoCalculo(prisma, folha.fechamento.calculoId);
    if (criterio.abateu && criterio.criterioDeclarado === null) {
      throw new AbatimentoSemCriterioDeclaradoError(folha.competencia, folha.exercicio, criterio.totalAbatido);
    }
  }

  /**
   * ⚠️ V13 rodada 3 — ANTES DE QUALQUER GRAVAÇÃO, pela mesma razão do bloco acima: criar a
   * `ApropriacaoDaFolha` e só então descobrir a duplicação deixaria o registro do ato de apropriar
   * existindo sobre uma folha que não podia ser apropriada.
   */
  await exigirTratamentoDoValeDaCompetencia(prisma, folha);

  const agrupamento = await parcelasDoCalculo(prisma, folha.fechamento.calculoId);
  if (agrupamento.linhasDeProvento === 0) throw new Error(`FOLHA-SEM-PROVENTO: o cálculo fechado de ${folha.competencia} não tem linha de provento nenhuma. Nada foi gravado.`);
  if (agrupamento.rubricasSemGrupo.length > 0) throw new SemGrupoDeEmpenhoError(agrupamento.rubricasSemGrupo);

  const apropriacaoId =
    folha.apropriacao?.id ??
    (await prisma.apropriacaoDaFolha.create({ data: { folhaId: folha.id, dataDoEmpenho: d.dataDoEmpenho, criadoPor: d.criadoPor }, select: { id: true } })).id;

  const deps = criarM05DepsComContratos(prisma);
  const roteiro = roteiroEmpenho();
  let empenhados = 0;
  let jaExistiam = 0;
  let religados = 0;
  const porGrupo = new Map<string, { codigo: string; ficha: number; empenhos: number; valor: Money }>();

  for (const p of agrupamento.parcelas) {
    const sufixo = p.matricula ?? p.grupo.codigo;
    /**
     * ⚠️ V22 — O TEXTO É A IDENTIDADE, O NÚMERO VEM DO NUMERADOR. O SAGRES só recebe número de 7
     * dígitos; o texto determinístico ("FP/2026-08/DEMO-0001") passou a ser a CHAVE da reserva
     * (`m05-despesa/numerador.ts`), que devolve sempre o mesmo número — a retomada continua achando
     * o empenho pelo número, como antes. E o empenho gravado ANTES do numerador, com o texto como
     * número, continua reconhecido por ele.
     */
    const identidade = numeroDoEmpenhoDaFolha(p.grupo.serie, folha.competencia, sufixo, folha.tipo as TipoDeFolha);
    const onde = `${p.grupo.codigo} / ${sufixo}`;

    const jaComOTexto = await prisma.empenho.findUnique({ where: { fichaId_numero: { fichaId: p.grupo.fichaId, numero: identidade } }, select: { id: true } });
    /**
     * ⚠️ V11 V9.3 — A RETOMADA DO NÚMERO LEGADO, e ela é o que impede a duplicação para trás.
     *
     * Só para folha não-mensal (a mensal não mudou de número), e só quando o elo prova que o
     * empenho legado é DESTA folha. Um empenho legado que pertence a OUTRA folha é exatamente a
     * colisão que esta rodada conserta: ele não bloqueia nada, porque o número novo está livre e
     * é com ele que a segunda folha empenha — com o valor dela.
     *
     * ⚠️ E O `?? null` NO ELO NÃO É DEFENSIVA: um empenho com o número legado e SEM elo nenhum é
     * a janela entre `empenhar` e a gravação do elo (`ELO-DO-EMPENHO-PERDIDO-NA-JANELA` no
     * MODULO). Ele não prova que é desta folha, então não vale como retomada — e o comportamento
     * de hoje para esse caso fica exatamente como está, sem regressão e sem conserto disfarçado.
     */
    const legado =
      jaComOTexto !== null || folha.tipo === "MENSAL"
        ? null
        : await prisma.empenho.findUnique({
            where: { fichaId_numero: { fichaId: p.grupo.fichaId, numero: numeroLegadoDoEmpenhoDaFolha(p.grupo.serie, folha.competencia, sufixo) } },
            select: { id: true, daFolha: { select: { apropriacao: { select: { folhaId: true } } } } },
          });
    const legadoEDestaFolha = legado !== null && legado.daFolha?.apropriacao.folhaId === folha.id;

    // A reserva só depois de descartar o texto e o legado: documento já gravado não gasta número.
    // ⚠️ Achar um empenho pelo número reservado PROVA que ele é este documento: o M05 recusa gravar
    // número reservado a quem não traz a chave (`exigirUsoDoNumero`) — o operador não o digita.
    const reserva =
      jaComOTexto !== null || legadoEDestaFolha ? null : await reservarNumero(prisma, { fichaId: p.grupo.fichaId, identidade, criadoPor: d.criadoPor });
    const numero = reserva?.numero ?? identidade;
    const ja = jaComOTexto ?? (reserva === null ? null : await prisma.empenho.findUnique({ where: { fichaId_numero: { fichaId: p.grupo.fichaId, numero } }, select: { id: true } }));

    if (ja !== null || legadoEDestaFolha) {
      /**
       * ⚠️ V32 — `ELO-DO-EMPENHO-PERDIDO-NA-JANELA`, FECHADA. Se o processo morreu entre `empenhar` e a
       * gravação do elo, o empenho existe (achado pelo texto ou pelo número reservado, que PROVAM que é
       * este documento) e o elo não: a liquidação da folha nunca o alcançaria. A retomada amarra agora —
       * desde que o valor seja o desta parcela; diferente, recusa nomeando, sem amarrar o que não confere.
       */
      if (ja !== null) {
        const elo = await prisma.empenhoDaFolha.findUnique({ where: { empenhoId: ja.id }, select: { id: true } });
        if (elo === null) {
          const emp = await prisma.empenho.findUniqueOrThrow({ where: { id: ja.id }, select: { numero: true, valor: true } });
          if (!toMoney(emp.valor.toFixed(2)).equals(p.valor)) {
            throw new ApropriacaoInterrompidaError(
              empenhados,
              onde,
              `o empenho ${emp.numero} existe sem o elo com a folha, e o valor dele (${emp.valor.toFixed(2)}) não é o desta parcela (${p.valor.toFixed(2)}); confira-o antes de retomar.`
            );
          }
          await prisma.empenhoDaFolha.create({
            data: { apropriacaoId, grupoId: p.grupo.id, vinculoId: p.vinculoId, empenhoId: ja.id, valor: p.valor.toFixed(2), criadoPor: d.criadoPor },
          });
          religados += 1;
        }
      }
      jaExistiam += 1;
    } else {
      if (p.credorCpfCnpj === "") throw new ApropriacaoInterrompidaError(empenhados, onde, "o grupo não tem credor e não empenha por servidor — o cadastro do grupo está incoerente.");
      try {
        const r = await empenhar(
          {
            fichaId: p.grupo.fichaId,
            numero,
            ...(reserva !== null ? { chaveDoNumero: reserva.chave } : {}),
            tipo: p.grupo.tipoEmpenho,
            valor: p.valor.toFixed(2),
            data: d.dataDoEmpenho,
            credorCpfCnpj: p.credorCpfCnpj,
            categoriaOrdemCronologica: p.grupo.categoriaOrdemCronologica,
            historico:
              `Folha ${folha.tipo.toLowerCase()} de ${folha.competencia} — ${p.grupo.descricao}` +
              (p.matricula === null ? "" : `, matrícula ${p.matricula}`) +
              ` (apropriação de ${diaCivil(d.dataDoEmpenho)}).`,
            criadoPor: d.criadoPor,
          },
          roteiro,
          deps
        );
        await prisma.empenhoDaFolha.create({
          data: { apropriacaoId, grupoId: p.grupo.id, vinculoId: p.vinculoId, empenhoId: r.empenhoId, valor: p.valor.toFixed(2), criadoPor: d.criadoPor },
        });
        empenhados += 1;
      } catch (e) {
        throw new ApropriacaoInterrompidaError(empenhados, onde, e instanceof Error ? e.message : String(e));
      }
    }
    const acc = porGrupo.get(p.grupo.codigo) ?? { codigo: p.grupo.codigo, ficha: p.grupo.ficha.numero, empenhos: 0, valor: toMoney(0) };
    acc.empenhos += 1;
    acc.valor = toMoney(acc.valor.plus(p.valor));
    porGrupo.set(p.grupo.codigo, acc);
  }

  return {
    apropriacaoId,
    competencia: folha.competencia,
    empenhados,
    jaExistiam,
    religados,
    total: sumMoney([...porGrupo.values()].map((g) => g.valor)),
    porGrupo: [...porGrupo.values()],
  };
}

/** O que o detalhe da folha mostra sobre a apropriação — derivado, nunca coluna. */
export interface ApropriacaoLida {
  readonly dataDoEmpenho: Date;
  readonly criadoPor: string;
  readonly criadoEm: Date;
  readonly empenhos: readonly {
    readonly numero: string;
    readonly ficha: number;
    readonly grupo: string;
    readonly matricula: string | null;
    readonly credor: string;
    readonly valor: Money;
    readonly empenhoId: string;
  }[];
  readonly total: Money;
}

export async function apropriacaoDaFolha(prisma: PrismaClient, folhaId: string): Promise<ApropriacaoLida | null> {
  const a = await prisma.apropriacaoDaFolha.findUnique({
    where: { folhaId },
    select: {
      dataDoEmpenho: true, criadoPor: true, criadoEm: true,
      empenhos: {
        orderBy: [{ grupo: { codigo: "asc" } }, { criadoEm: "asc" }],
        select: {
          valor: true, empenhoId: true,
          grupo: { select: { codigo: true, descricao: true } },
          vinculo: { select: { matricula: true } },
          empenho: { select: { numero: true, credorCpfCnpj: true, ficha: { select: { numero: true } } } },
        },
      },
    },
  });
  if (a === null) return null;
  return {
    dataDoEmpenho: a.dataDoEmpenho,
    criadoPor: a.criadoPor,
    criadoEm: a.criadoEm,
    empenhos: a.empenhos.map((e) => ({
      numero: e.empenho.numero, ficha: e.empenho.ficha.numero, grupo: `${e.grupo.codigo} — ${e.grupo.descricao}`,
      matricula: e.vinculo?.matricula ?? null, credor: e.empenho.credorCpfCnpj, valor: toMoney(e.valor), empenhoId: e.empenhoId,
    })),
    total: sumMoney(a.empenhos.map((e) => toMoney(e.valor))),
  };
}

export { Decimal };
