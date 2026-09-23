import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import {
  conferirAtoDeclarado,
  zAtoDeclarado,
  type AncoradouroDoAto,
  type AtoDeclarado,
} from "./ato-declarado.js";
import { exigirTipoManad, TIPO_MANAD } from "./tipo-manad.js";

/**
 * ═══ M01 — A ENTIDADE CONTÁBIL E A TITULARIDADE DA CONTA (V11 V9) ═══
 *
 * A pergunta que este arquivo responde é "de QUEM é o dinheiro que entrou", e ela não tinha
 * resposta: `RECEITA-SEM-ENTIDADE-ARRECADADORA`.
 *
 * ⚠️ ENTIDADE É QUEM TEM BALANCETE PRÓPRIO — a prefeitura, a câmara, a autarquia, o fundo, o
 * RPPS (TR 5.10.1.3: "contabilização distinta", consolidável). NÃO é órgão nem unidade
 * orçamentária: essas são a estrutura da DESPESA, e a receita é do ente (art. 167, IV), nunca da
 * Secretaria de Saúde. Carimbar órgão numa guia seria a segunda aritmética sobre o mesmo
 * dinheiro que a V8.11 recusou.
 *
 * ⚠️ O CADASTRO NASCE VAZIO, e nenhum seed o preenche. Entidade, CNPJ e código são dado do ente;
 * semear uma prefeitura plausível seria inventário inventado.
 *
 * ⚠️ E O ESCOPO É "ENTE" NAS TRÊS AÇÕES. Entidade contábil NÃO virou eixo de autorização: o eixo
 * continua sendo `ENTE | UG`, e a UG só sai de uma ficha (`escopo.ts`). Fazer da entidade um
 * terceiro eixo seria reescrever a segregação inteira para carimbar uma coluna.
 */

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

const zCodigo = z
  .string()
  .trim()
  .regex(/^[0-9A-Za-z]{1,4}$/u, "O código da entidade tem de 1 a 4 caracteres, sem espaço nem pontuação.");

const zNome = z.string().trim().min(1, "O nome da entidade é obrigatório.");

/**
 * ⚠️ O CNPJ É DÍGITO OU AUSENTE. Vazio não é "sem CNPJ": é a mesma coisa dita por outro caminho,
 * e duas formas de dizer o mesmo divergem no dia em que só uma for tratada. A tela manda
 * `undefined` quando o campo fica em branco.
 */
const zCnpj = z
  .string()
  .trim()
  .regex(/^\d{14}$/u, "O CNPJ tem 14 dígitos, sem máscara.")
  .optional();

export const zCadastrarEntidadeInput = zAtoDeclarado.extend({
  codigo: zCodigo,
  nome: zNome,
  cnpj: zCnpj,
  tipoManad: z.string().trim(),
  criadoPor: z.string().min(1),
});
export type CadastrarEntidadeInput = z.input<typeof zCadastrarEntidadeInput>;

export const zPublicarVersaoInput = zAtoDeclarado.extend({
  entidadeId: z.string().min(1),
  nome: zNome,
  cnpj: zCnpj,
  tipoManad: z.string().trim(),
  criadoPor: z.string().min(1),
});
export type PublicarVersaoInput = z.input<typeof zPublicarVersaoInput>;

export const zDeclararTitularInput = zAtoDeclarado.extend({
  contaBancariaId: z.string().min(1),
  entidadeId: z.string().min(1),
  criadoPor: z.string().min(1),
});
export type DeclararTitularInput = z.input<typeof zDeclararTitularInput>;

/**
 * O ANCORADOURO DA ENTIDADE: a citação a nomeia, ou traz o CNPJ dela.
 *
 * ⚠️ SÃO DOIS ANCORADOUROS, NÃO UM COM DOIS TERMOS. Dentro de um ancoradouro os termos são
 * conjunção (todos têm de aparecer); entre ancoradouros, basta um. Exigir nome **e** CNPJ
 * juntos reprovaria o ato que só diz "Fundo Municipal de Saúde" — que é como os atos falam.
 */
function ancoradourosDaEntidade(nome: string, cnpj: string | null): readonly AncoradouroDoAto[] {
  const a: AncoradouroDoAto[] = [{ rotulo: `o nome da entidade ("${nome}")`, termos: [nome] }];
  if (cnpj !== null) a.push({ rotulo: `o CNPJ dela (${cnpj})`, termos: [cnpj] });
  return a;
}

function ato(i: AtoDeclarado): AtoDeclarado {
  return {
    atoTipo: i.atoTipo,
    atoNumero: i.atoNumero,
    atoAno: i.atoAno,
    atoDispositivo: i.atoDispositivo,
    atoCitacao: i.atoCitacao,
  };
}

/**
 * CADASTRA A ENTIDADE — identidade nova, versão 1 dos atributos, numa transação.
 *
 * @param agora o instante de referência do ente, para o ano civil do ato. Por parâmetro porque
 *   uma régua que lê o relógio por dentro não se testa em dezembro sem viajar no tempo.
 */
export async function cadastrarEntidadeContabil(
  prisma: PrismaClient,
  input: CadastrarEntidadeInput,
  agora: Date
): Promise<{ readonly entidadeId: string }> {
  const d = zCadastrarEntidadeInput.parse(input);
  exigirTipoManad(d.tipoManad);
  conferirAtoDeclarado(ato(d), {
    hoje: agora,
    ancoradouros: ancoradourosDaEntidade(d.nome, d.cnpj ?? null),
  });

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarEntidadeContabil, "ENTE");

    // ⚠️ PRÉ-CONDIÇÃO ANTES DE GRAVAR. Criar a identidade e só então descobrir que o código
    // repete deixaria uma `EntidadeContabil` sem versão nenhuma — órfã, invisível na consulta
    // (que junta pela versão vigente) e impossível de remover sem DELETE. É a regra do efeito
    // colateral antes da guarda, e ela já custou um defeito real neste repositório.
    const repetido = await tx.entidadeContabil.findUnique({
      where: { codigo: d.codigo },
      select: { id: true },
    });
    if (repetido !== null) {
      throw new Error(
        `Já existe uma entidade com o código ${d.codigo}. O código identifica a entidade nos ` +
          `demonstrativos e não se repete. Nada foi gravado.`
      );
    }

    try {
      const e = await tx.entidadeContabil.create({
        data: { codigo: d.codigo, criadoPor: d.criadoPor },
        select: { id: true },
      });
      await tx.versaoDaEntidadeContabil.create({
        data: {
          entidadeId: e.id,
          versao: 1,
          nome: d.nome,
          ...(d.cnpj !== undefined ? { cnpj: d.cnpj } : {}),
          tipoManad: d.tipoManad,
          ...ato(d),
          criadoPor: d.criadoPor,
        },
      });
      return { entidadeId: e.id };
    } catch (erro) {
      if (erro instanceof Error && /Unique constraint/iu.test(erro.message)) {
        throw new Error(
          `CONCORRÊNCIA: o código ${d.codigo} acabou de ser usado por outro cadastro. ` +
            `Recarregue a lista de entidades. Nada foi gravado.`
        );
      }
      throw erro;
    }
  });
}

/**
 * PUBLICA UMA VERSÃO NOVA dos atributos — corrigir o nome, o CNPJ ou o tipo.
 *
 * ⚠️ VERSÃO NOVA, NUNCA `UPDATE`. A entidade cadastrada errado precisa ter volta: sem isto o
 * erro ficaria para sempre e a única saída seria afrouxar o grant do papel de runtime, que é o
 * oposto da regra da casa. É a lição da V8.12, aplicada antes de doer.
 */
export async function publicarVersaoDaEntidadeContabil(
  prisma: PrismaClient,
  input: PublicarVersaoInput,
  agora: Date
): Promise<{ readonly versao: number }> {
  const d = zPublicarVersaoInput.parse(input);
  exigirTipoManad(d.tipoManad);
  conferirAtoDeclarado(ato(d), {
    hoje: agora,
    ancoradouros: ancoradourosDaEntidade(d.nome, d.cnpj ?? null),
  });

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.publicarVersaoDaEntidadeContabil, "ENTE");

    const atual = await tx.versaoDaEntidadeContabil.findFirst({
      where: { entidadeId: d.entidadeId },
      orderBy: { versao: "desc" },
      select: { versao: true },
    });
    if (atual === null) {
      throw new Error(
        `A entidade ${d.entidadeId} não existe (ou não tem versão). Nada foi gravado.`
      );
    }

    try {
      const nova = await tx.versaoDaEntidadeContabil.create({
        data: {
          entidadeId: d.entidadeId,
          versao: atual.versao + 1,
          nome: d.nome,
          ...(d.cnpj !== undefined ? { cnpj: d.cnpj } : {}),
          tipoManad: d.tipoManad,
          ...ato(d),
          criadoPor: d.criadoPor,
        },
        select: { versao: true },
      });
      return { versao: nova.versao };
    } catch (erro) {
      if (erro instanceof Error && /Unique constraint/iu.test(erro.message)) {
        throw new Error(
          `CONCORRÊNCIA: outra versão desta entidade foi publicada agora mesmo. Recarregue e ` +
            `refaça a correção sobre o texto atual. Nada foi gravado.`
        );
      }
      throw erro;
    }
  });
}

/**
 * DECLARA DE QUEM É UMA CONTA BANCÁRIA — versão nova, nunca `UPDATE`.
 *
 * ⚠️ TROCAR DE TITULAR É FATO NOVO, não correção do velho. A guia carimbada em fevereiro foi
 * carimbada sob a declaração de fevereiro, e "sob que titularidade esta guia entrou?" tem de ter
 * resposta depois que a conta mudar de dono. É por isso que isto é tabela versionada e não uma
 * coluna em `ContaBancaria`.
 */
export async function declararTitularDaContaBancaria(
  prisma: PrismaClient,
  input: DeclararTitularInput,
  agora: Date
): Promise<{ readonly versao: number }> {
  const d = zDeclararTitularInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.declararTitularDaContaBancaria, "ENTE");

    const conta = await tx.contaBancaria.findUnique({
      where: { id: d.contaBancariaId },
      select: { id: true, codigo: true, banco: true, agencia: true, conta: true },
    });
    if (conta === null) {
      throw new Error(`Conta bancária ${d.contaBancariaId} não cadastrada. Nada foi gravado.`);
    }

    const entidade = await tx.entidadeContabil.findUnique({
      where: { id: d.entidadeId },
      select: {
        codigo: true,
        versoes: { orderBy: { versao: "desc" }, take: 1, select: { nome: true, cnpj: true } },
      },
    });
    const vigente = entidade?.versoes[0];
    if (entidade === null || entidade === undefined || vigente === undefined) {
      throw new Error(`A entidade ${d.entidadeId} não existe. Nada foi gravado.`);
    }

    /**
     * ⚠️ DOIS ANCORADOUROS, E É AQUI QUE A RÉGUA DEIXA DE SER TEATRO. O ato que fundamenta esta
     * declaração pode ser o que CRIOU a entidade (nele aparece a entidade) ou o que ABRIU a conta
     * (nele aparece a conta). Exigir sempre a entidade reprovaria o segundo, que é legítimo — e
     * uma régua que reprova o caso legítimo vira régua que alguém desliga.
     *
     * ⚠️ E O ANCORADOURO DA CONTA SÓ EXISTE QUANDO A IDENTIFICAÇÃO BANCÁRIA ESTÁ CADASTRADA. Ela
     * é nullable (bloco SAGRES de `ContaBancaria`); sem ela, o único caminho é o ato que nomeia a
     * entidade. Casar por "banco/agência/conta" com campos nulos aceitaria qualquer citação.
     */
    const ancoradouros: AncoradouroDoAto[] = [
      ...ancoradourosDaEntidade(vigente.nome, vigente.cnpj),
    ];
    if (conta.banco !== null && conta.agencia !== null && conta.conta !== null) {
      ancoradouros.push({
        rotulo: `a conta (banco ${conta.banco}, agência ${conta.agencia}, conta ${conta.conta})`,
        termos: [conta.banco, conta.agencia, conta.conta],
      });
    }

    conferirAtoDeclarado(ato(d), { hoje: agora, ancoradouros });

    const atual = await tx.declaracaoDeTitularDaConta.findFirst({
      where: { contaBancariaId: conta.id },
      orderBy: { versao: "desc" },
      select: { versao: true },
    });

    try {
      const nova = await tx.declaracaoDeTitularDaConta.create({
        data: {
          contaBancariaId: conta.id,
          entidadeId: d.entidadeId,
          versao: (atual?.versao ?? 0) + 1,
          ...ato(d),
          criadoPor: d.criadoPor,
        },
        select: { versao: true },
      });
      return { versao: nova.versao };
    } catch (erro) {
      if (erro instanceof Error && /Unique constraint/iu.test(erro.message)) {
        throw new Error(
          `CONCORRÊNCIA: a conta ${conta.codigo} acabou de receber outra declaração de ` +
            `titularidade. Recarregue a conta e confira quem é o titular antes de declarar de ` +
            `novo. Nada foi gravado.`
        );
      }
      throw erro;
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// LEITURAS — nenhuma grava, e por isso nenhuma vira ação de permissão (ver `FORA_DO_CENSO`).
// ═══════════════════════════════════════════════════════════════════════════════════════════

export interface EntidadeNaLista {
  readonly id: string;
  readonly codigo: string;
  readonly nome: string;
  readonly cnpj: string | null;
  readonly tipoManad: string;
  readonly tipoRotulo: string;
  readonly versao: number;
}

/** O rol de entidades, cada uma com a VERSÃO VIGENTE (a de maior número). */
export async function entidadesContabeis(prisma: Tx): Promise<readonly EntidadeNaLista[]> {
  const linhas = await prisma.entidadeContabil.findMany({
    orderBy: { codigo: "asc" },
    select: {
      id: true,
      codigo: true,
      versoes: {
        orderBy: { versao: "desc" },
        take: 1,
        select: { nome: true, cnpj: true, tipoManad: true, versao: true },
      },
    },
  });

  const saida: EntidadeNaLista[] = [];
  for (const l of linhas) {
    const v = l.versoes[0];
    // Uma identidade sem versão não deveria existir — o cadastro grava as duas na mesma
    // transação. Se aparecer, ela é OMITIDA e não vira uma linha com nome vazio: uma entidade
    // sem nome na tela é pior que uma entidade a menos, porque ninguém sabe o que ela é.
    if (v === undefined) continue;
    saida.push({
      id: l.id,
      codigo: l.codigo,
      nome: v.nome,
      cnpj: v.cnpj,
      tipoManad: v.tipoManad,
      tipoRotulo: TIPO_MANAD[v.tipoManad] ?? v.tipoManad,
      versao: v.versao,
    });
  }
  return saida;
}

export interface TitularVigente {
  readonly entidadeId: string;
  readonly codigo: string;
  readonly nome: string;
  readonly versao: number;
}

/**
 * DE QUEM É ESTA CONTA HOJE — a declaração de maior versão, ou `null` se nunca foi declarada.
 *
 * ⚠️ É A MESMA PROJEÇÃO QUE O REGISTRO DA GUIA USA PARA DERIVAR O CARIMBO, e isso é de
 * propósito: se a tela lesse o titular por um caminho e a arrecadação carimbasse por outro, a
 * tela anunciaria um titular e a guia gravaria outro — e quem estivesse certo só se descobriria
 * depois. Uma leitura, um caminho.
 */
export async function titularVigenteDaConta(
  prisma: Tx,
  contaBancariaId: string
): Promise<TitularVigente | null> {
  const d = await prisma.declaracaoDeTitularDaConta.findFirst({
    where: { contaBancariaId },
    orderBy: { versao: "desc" },
    select: {
      versao: true,
      entidadeId: true,
      entidade: {
        select: {
          codigo: true,
          versoes: { orderBy: { versao: "desc" }, take: 1, select: { nome: true } },
        },
      },
    },
  });
  if (d === null) return null;
  const nome = d.entidade.versoes[0]?.nome;
  if (nome === undefined) return null;
  return { entidadeId: d.entidadeId, codigo: d.entidade.codigo, nome, versao: d.versao };
}
