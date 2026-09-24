import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import {
  CONTA_CONTROLE_DDR_POR_NATUREZA,
  contaDeControleDaDdr,
  type NaturezaDaFonteDdr,
} from "./roteiros.js";

/**
 * ═══ A NATUREZA DA FONTE — O ATO DO ENTE QUE DESTRAVA A ARRECADAÇÃO (V11 V9.3) ═══
 *
 * ⚠️ O QUE ESTE ARQUIVO FECHA. A pendência `CONTROLE-DDR-POR-NATUREZA-DA-FONTE` deixava
 * instalação limpa SEM ARRECADAÇÃO NENHUMA: `roteiroArrecadacao` debitava
 * `7.2.1.1.0.00.00`, que é SINTÉTICA no `Pcasp_2025.xlsx` do TCE-PB, e o `INVARIANTE 5` do
 * adapter recusava a partida — corretamente. Três passos da jornada J9 (carimbo, troca de
 * titular, estorno pela tela) ficaram não executados por causa disso.
 *
 * A correção tem duas metades, e só UMA delas é código:
 *
 *   1. **A perna do roteiro passa a ser resolvida pela natureza** — `roteiros.ts`. Isso é
 *      leitura do plano: o PCASP particiona `7.2.1.1` em cinco analíticas, uma por natureza.
 *   2. **De que natureza é CADA FONTE do município** — este arquivo. Isso o plano NÃO diz, e
 *      o corpus oficial deste repositório também não: `relacionamento_fonterecursos_co_2026.
 *      xlsx` relaciona fonte com CÓDIGO DE ACOMPANHAMENTO, não com natureza. É ato do ente.
 *
 * ⚠️ E NÃO SE DERIVA DA DESCRIÇÃO. A tentação é ler "Recursos não vinculados de impostos" e
 * concluir ORDINARIOS. Isso é atestar pela papelada que declara: a descrição é texto livre de
 * cadastro, e no dia em que alguém a reescrever a classificação muda sozinha — sem lançamento,
 * sem ato, sem rastro. O erro sairia no RGF Anexo 5 e na remessa, não aqui.
 *
 * ⚠️ FAIL-CLOSED, E O SEED NÃO SEMEIA. Fonte não declarada faz a arrecadação RECUSAR nomeando
 * a fonte e o caminho da tela. Semear um palpite com fundamento "SEED" seria exatamente o que
 * `RoteiroDaDotacaoPorFonte` se recusa a fazer com o EIXO: fingir fundamento é pior que a
 * ausência dele.
 *
 * ⚠️ APPEND-ONLY, E ISSO TEM CONSEQUÊNCIA CONTÁBIL, não só de auditoria. A conta de classe 7
 * é gravada NAS PARTIDAS do lançamento. Reclassificar a fonte hoje NÃO reescreve o que já foi
 * escriturado — é a mesma propriedade que faz a arrecadação CARIMBAR a entidade titular em vez
 * de rederivá-la da conta bancária de agora. Fato antigo preserva a classificação que valia no
 * instante dele.
 */

type TxDeLeitura = Pick<PrismaClient, "deParaFonteNaturezaDdr">;

/** O rol fechado — é a partição do plano, e não um enum de conveniência. */
export const NATUREZAS_DA_FONTE = Object.keys(
  CONTA_CONTROLE_DDR_POR_NATUREZA
) as readonly NaturezaDaFonteDdr[];

const zNatureza = z.enum([
  "ORDINARIOS",
  "VINCULADOS",
  "EXTRAORCAMENTARIOS",
  "COMPENSACAO_FINANCEIRA",
  "OUTROS",
]);

export interface NaturezaDeclarada {
  readonly fonteCodigo: string;
  readonly natureza: NaturezaDaFonteDdr;
  readonly contaDeControle: string;
  readonly fundamento: string;
  readonly versao: number;
  readonly criadoEm: Date;
  readonly criadoPor: string;
}

/**
 * A DECLARAÇÃO VIGENTE de uma fonte — a de maior versão —, ou `null` se o ente nunca a
 * classificou. Leitura pura: quem decide o que fazer com o `null` é o chamador.
 */
export async function naturezaVigenteDaFonte(
  tx: TxDeLeitura,
  fonteCodigo: string
): Promise<NaturezaDeclarada | null> {
  const r = await tx.deParaFonteNaturezaDdr.findFirst({
    where: { fonteCodigo },
    orderBy: { versao: "desc" },
    select: {
      fonteCodigo: true,
      natureza: true,
      fundamento: true,
      versao: true,
      criadoEm: true,
      criadoPor: true,
    },
  });
  if (r === null) return null;
  return { ...r, contaDeControle: contaDeControleDaDdr(r.natureza) };
}

/**
 * A NATUREZA, OU A RECUSA — e a recusa diz a fonte, o porquê e para onde ir.
 *
 * ⚠️ A MENSAGEM É PARTE DO COMPORTAMENTO. Uma recusa que diz só "não configurado" manda o
 * servidor municipal procurar; esta nomeia a fonte que faltou e a tela que resolve.
 */
export async function exigirNaturezaDaFonte(
  tx: TxDeLeitura,
  fonteCodigo: string
): Promise<NaturezaDeclarada> {
  const d = await naturezaVigenteDaFonte(tx, fonteCodigo);
  if (d === null) {
    throw new Error(
      `A FONTE ${fonteCodigo} AINDA NÃO TEM NATUREZA DECLARADA. O controle da disponibilidade ` +
        `(PCASP 7.2.1.1) é particionado pela natureza do recurso — ordinários, vinculados, ` +
        `extraorçamentários, compensação financeira ou outros —, e sem ela não há em que conta ` +
        `escriturar a entrada do dinheiro. Declare-a em /contabilidade/natureza-das-fontes, com ` +
        `o fundamento. Nada foi gravado.`
    );
  }
  return d;
}

/** Todas as vigentes, para a tela. Uma fonte aparece uma vez, na maior versão. */
export async function listarNaturezasDeclaradas(
  tx: TxDeLeitura
): Promise<readonly NaturezaDeclarada[]> {
  const todas = await tx.deParaFonteNaturezaDdr.findMany({
    orderBy: [{ fonteCodigo: "asc" }, { versao: "desc" }],
    select: {
      fonteCodigo: true,
      natureza: true,
      fundamento: true,
      versao: true,
      criadoEm: true,
      criadoPor: true,
    },
  });
  const vistas = new Set<string>();
  const vigentes: NaturezaDeclarada[] = [];
  for (const r of todas) {
    if (vistas.has(r.fonteCodigo)) continue;
    vistas.add(r.fonteCodigo);
    vigentes.push({ ...r, contaDeControle: contaDeControleDaDdr(r.natureza) });
  }
  return vigentes;
}

export const zDeclararNatureza = z.object({
  fonteCodigo: z.string().trim().regex(/^\d{3}$/, "O código da fonte tem 3 dígitos."),
  natureza: zNatureza,
  // ⚠️ O MESMO PISO DO ATO IRMÃO (`zFundamento` de `servico-dotacao-por-fonte.ts`), e isso é
  // decisão, não cópia: declarar a natureza de uma fonte e publicar o roteiro de uma origem são
  // a MESMA autoridade — dizer em que conta do plano o movimento entra. Um piso mais baixo aqui
  // seria a porta de trás para o "porque sim" que o outro recusa. MEDIDO: com `min(10)`,
  // "porque sim" (10 caracteres) era aceito, e o t8 acusou.
  fundamento: z
    .string()
    .trim()
    .min(20, "Diga POR QUE — citando a norma, o ato do ente ou a orientação do tribunal.")
    .max(500),
  criadoPor: z.string().min(1),
});

export interface NaturezaPublicada {
  readonly versao: number;
  readonly natureza: NaturezaDaFonteDdr;
  readonly contaDeControle: string;
  readonly anterior: { readonly natureza: NaturezaDaFonteDdr; readonly versao: number } | null;
}

/**
 * DECLARA a natureza de uma fonte — versão nova, nunca `UPDATE`.
 *
 * ⚠️ A FONTE TEM DE EXISTIR NO CADASTRO. Declarar a natureza de uma fonte que ninguém
 * cadastrou cria uma linha que jamais será lida — e que dá a impressão de que a classificação
 * está feita. A recusa nomeia a fonte.
 */
export async function declararNaturezaDaFonte(
  prisma: PrismaClient,
  input: z.input<typeof zDeclararNatureza>
): Promise<NaturezaPublicada> {
  const d = zDeclararNatureza.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.declararNaturezaDaFonte, "ENTE");

    const fonte = await tx.fonteRecurso.findUnique({
      where: { codigo: d.fonteCodigo },
      select: { codigo: true },
    });
    if (fonte === null) {
      throw new Error(
        `A fonte ${d.fonteCodigo} não está no cadastro de fontes de recurso. Classificar uma ` +
          `fonte inexistente produz uma declaração que nada lê. Nada foi gravado.`
      );
    }

    const vigente = await naturezaVigenteDaFonte(tx, d.fonteCodigo);
    if (vigente !== null && vigente.natureza === d.natureza) {
      throw new Error(
        `A fonte ${d.fonteCodigo} já está declarada como ${d.natureza} (versão ${String(vigente.versao)}). ` +
          `Redeclarar a mesma natureza não é um fato novo. Nada foi gravado.`
      );
    }

    const r = await tx.deParaFonteNaturezaDdr.create({
      data: {
        fonteCodigo: d.fonteCodigo,
        natureza: d.natureza,
        fundamento: d.fundamento,
        versao: (vigente?.versao ?? 0) + 1,
        criadoPor: d.criadoPor,
      },
      select: { versao: true, natureza: true },
    });

    return {
      versao: r.versao,
      natureza: r.natureza,
      contaDeControle: contaDeControleDaDdr(r.natureza),
      anterior:
        vigente === null ? null : { natureza: vigente.natureza, versao: vigente.versao },
    };
  });
}
