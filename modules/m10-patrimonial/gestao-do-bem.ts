import { z } from "zod";
import { randomUUID } from "node:crypto";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import {
  diaCivil,
  diferencaEmDiasCivis,
  meioDiaCivil,
} from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import {
  CAMPO_OBRIGATORIO_DO_TIPO,
  TIPO_DO_ESTORNO_DE_GESTAO,
  comissaoVigenteEm,
  divergenciasDoInventario,
  estadoDoBemEm,
  type EstadoDeConservacao,
  type EstadoDoBem,
  type MovimentoDeGestaoParaLeitura,
  type SituacaoFisicaDoBem,
  type TipoMovimentoDeGestao,
} from "./gestao-do-bem-dominio.js";
import { avaliarFormula, validarFormula } from "./formula-avaliacao.js";
import { atualizacaoAcumulada, valorBruto } from "./dominio.js";
import type { TipoMovimentoPatrimonial } from "./dominio.js";

/**
 * M10 — PATRIMÔNIO, EIXO DE GESTÃO: OS CASOS DE USO (TR 5.19).
 *
 * ⚠️ NENHUM DESTES SERVIÇOS TOCA O RAZÃO. Valor de bem é `MovimentoPatrimonial`, que já
 * existe, já está provado e não muda. Aqui se move POSIÇÃO, RESPONSABILIDADE e ESTADO —
 * e é justamente por não serem contábeis que essas coisas nunca tiveram onde morar.
 *
 * A exceção declarada é `avaliarBemPorFormula`, que LÊ o valor contábil para calcular —
 * e não escreve nada: a reavaliação, quando o ente decidir lançá-la, é
 * `registrarReavaliacao`, que já existe e passa pelo funil do M01.
 */

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

const zMotivo = z
  .string()
  .trim()
  .min(5, "o motivo é o que explica o fato a quem auditar; cinco letras é o mínimo");

// ═══════════════════════════════════════════════════════════════════════════
// LEITURAS DERIVADAS — decisão D4
// ═══════════════════════════════════════════════════════════════════════════

async function movimentosDoBem(
  tx: Tx,
  bemId: string
): Promise<readonly MovimentoDeGestaoParaLeitura[]> {
  const ms = await tx.movimentoDeGestaoDoBem.findMany({
    where: { bemId },
    select: {
      id: true, tipo: true, dataMovimento: true, criadoEm: true,
      localizacaoId: true, responsavelId: true, estado: true, situacao: true,
      unidadeOrcId: true, estornoDeId: true,
    },
  });
  return ms.map((m) => ({
    id: m.id,
    tipo: m.tipo as TipoMovimentoDeGestao,
    dataMovimento: m.dataMovimento,
    criadoEm: m.criadoEm,
    localizacaoId: m.localizacaoId,
    responsavelId: m.responsavelId,
    estado: m.estado as EstadoDeConservacao | null,
    situacao: m.situacao as SituacaoFisicaDoBem | null,
    unidadeOrcId: m.unidadeOrcId,
    estornoDeId: m.estornoDeId,
  }));
}

/**
 * ONDE O BEM ESTAVA, COM QUEM, EM QUE ESTADO — numa data civil (TR 5.19.11, .12, .20).
 *
 * `ateDia` ausente = hoje. Presente = **naquela data**, que é a pergunta do inventário.
 */
export async function estadoDoBem(
  tx: Tx,
  bemId: string,
  ateDia?: string
): Promise<EstadoDoBem> {
  return estadoDoBemEm(await movimentosDoBem(tx, bemId), ateDia);
}

/**
 * OS BENS SOB RESPONSABILIDADE DE ALGUÉM (TR 5.19.10 — "visualizar somente os bens sob a
 * sua responsabilidade").
 *
 * ⚠️ ELE DERIVA, e não filtra por coluna. Um `responsavelId` no bem responderia mais
 * rápido e perderia a pergunta "de quem era este bem em dezembro?", que é a que o termo
 * de responsabilidade faz.
 */
export async function bensSobResponsabilidade(
  tx: Tx,
  responsavelId: string,
  ateDia?: string
): Promise<readonly { readonly bemId: string; readonly numeroTombamento: string }[]> {
  // Só os bens que ALGUMA vez apontaram para esta pessoa entram na conta — varrer o
  // acervo inteiro para descobrir isso seria ler N vezes o que um índice já responde.
  const candidatos = await tx.movimentoDeGestaoDoBem.findMany({
    where: { responsavelId, tipo: "RESPONSAVEL" },
    select: { bemId: true },
    distinct: ["bemId"],
  });

  const achados: { bemId: string; numeroTombamento: string }[] = [];
  for (const c of candidatos) {
    const estado = await estadoDoBem(tx, c.bemId, ateDia);
    if (estado.responsavelId !== responsavelId) continue;
    const bem = await tx.bemPatrimonial.findUnique({
      where: { id: c.bemId },
      select: { numeroTombamento: true },
    });
    if (bem !== null) achados.push({ bemId: c.bemId, numeroTombamento: bem.numeroTombamento });
  }
  return achados;
}

// ═══════════════════════════════════════════════════════════════════════════
// CADASTROS
// ═══════════════════════════════════════════════════════════════════════════

export const zCadastrarLocalizacaoFisicaInput = z.object({
  codigo: z.string().trim().min(1).max(20),
  descricao: z.string().trim().min(3),
  paiId: z.string().min(1).optional(),
  setorId: z.string().min(1).optional(),
  criadoPor: z.string().min(1),
});
export type CadastrarLocalizacaoFisicaInput = z.input<
  typeof zCadastrarLocalizacaoFisicaInput
>;

/** TR 5.19.14, 5.19.34 — a localização, hierárquica. */
export async function cadastrarLocalizacaoFisica(
  prisma: PrismaClient,
  input: CadastrarLocalizacaoFisicaInput
): Promise<{ readonly localizacaoId: string }> {
  const d = zCadastrarLocalizacaoFisicaInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(
      tx,
      d.criadoPor,
      ACAO_DO_SERVICO.cadastrarLocalizacaoFisica,
      d.setorId === undefined ? "ENTE" : { setor: d.setorId }
    );
    const criada = await tx.localizacaoFisica.create({
      data: {
        codigo: d.codigo, descricao: d.descricao,
        paiId: d.paiId ?? null, setorId: d.setorId ?? null, criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { localizacaoId: criada.id };
  });
}

export const zCadastrarComissaoPatrimonialInput = z.object({
  codigo: z.string().trim().min(1).max(20),
  descricao: z.string().trim().min(3),
  finalidade: z.enum(["INVENTARIO", "REAVALIACAO", "DEPRECIACAO", "BAIXA"]),
  atoDesignacao: z.string().trim().min(3),
  vigenciaInicio: z.coerce.date(),
  vigenciaFim: z.coerce.date().optional(),
  membros: z
    .array(
      z.object({
        pessoaId: z.string().min(1),
        atribuicao: z.string().trim().min(3),
        presidente: z.boolean().default(false),
      })
    )
    .min(1, "uma comissão sem membro não delibera coisa nenhuma"),
  criadoPor: z.string().min(1),
});
export type CadastrarComissaoPatrimonialInput = z.input<
  typeof zCadastrarComissaoPatrimonialInput
>;

/**
 * TR 5.19.16 — a comissão designada, com o ato que a designou e os membros.
 *
 * ⚠️ EXATAMENTE UM PRESIDENTE. Zero deixa o termo sem quem o assine na condição exigida;
 * dois fazem o mesmo termo ser assinado por dois presidentes, e nenhum dos dois responde.
 */
export async function cadastrarComissaoPatrimonial(
  prisma: PrismaClient,
  input: CadastrarComissaoPatrimonialInput
): Promise<{ readonly comissaoId: string }> {
  const d = zCadastrarComissaoPatrimonialInput.parse(input);

  const presidentes = d.membros.filter((m) => m.presidente);
  if (presidentes.length !== 1) {
    throw new Error(
      `A comissão ${d.codigo} declarou ${presidentes.length} presidentes, e tem de ter ` +
        `exatamente 1. Sem presidente o termo fica sem quem o assine na condição que a ` +
        `portaria exige; com dois, ninguém responde por ele.`
    );
  }
  if (d.vigenciaFim !== undefined && d.vigenciaFim < d.vigenciaInicio) {
    throw new Error(`Vigência invertida: o fim é anterior ao início.`);
  }

  return prisma.$transaction(async (tx) => {
    await autorizarNo(
      tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarComissaoPatrimonial, "ENTE"
    );
    const criada = await tx.comissaoPatrimonial.create({
      data: {
        codigo: d.codigo, descricao: d.descricao, finalidade: d.finalidade,
        atoDesignacao: d.atoDesignacao, vigenciaInicio: d.vigenciaInicio,
        vigenciaFim: d.vigenciaFim ?? null, criadoPor: d.criadoPor,
        membros: {
          create: d.membros.map((m) => ({
            pessoaId: m.pessoaId, atribuicao: m.atribuicao,
            presidente: m.presidente, criadoPor: d.criadoPor,
          })),
        },
      },
      select: { id: true },
    });
    return { comissaoId: criada.id };
  });
}

export const zCadastrarMotivoDeBaixaInput = z.object({
  codigo: z.string().trim().min(1).max(20),
  descricao: z.string().trim().min(3),
  criadoPor: z.string().min(1),
});
export type CadastrarMotivoDeBaixaInput = z.input<typeof zCadastrarMotivoDeBaixaInput>;

/** TR 5.19.30 — motivos de baixa "de acordo com a necessidade da instituição". */
export async function cadastrarMotivoDeBaixa(
  prisma: PrismaClient,
  input: CadastrarMotivoDeBaixaInput
): Promise<{ readonly motivoId: string }> {
  const d = zCadastrarMotivoDeBaixaInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarMotivoDeBaixa, "ENTE");
    const criado = await tx.motivoDeBaixa.create({
      data: { codigo: d.codigo, descricao: d.descricao, criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { motivoId: criado.id };
  });
}

export const zCadastrarTipoDeIncorporacaoInput = z.object({
  codigo: z.string().trim().min(1).max(20),
  descricao: z.string().trim().min(3),
  criadoPor: z.string().min(1),
});
export type CadastrarTipoDeIncorporacaoInput = z.input<
  typeof zCadastrarTipoDeIncorporacaoInput
>;

/** TR 5.19.3 e 5.19.7 — "outras incorporações configuráveis pela instituição". */
export async function cadastrarTipoDeIncorporacao(
  prisma: PrismaClient,
  input: CadastrarTipoDeIncorporacaoInput
): Promise<{ readonly tipoId: string }> {
  const d = zCadastrarTipoDeIncorporacaoInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(
      tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarTipoDeIncorporacao, "ENTE"
    );
    const criado = await tx.tipoDeIncorporacao.create({
      data: { codigo: d.codigo, descricao: d.descricao, criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { tipoId: criado.id };
  });
}

export const zCadastrarClasseDeBensInput = z.object({
  codigo: z.string().trim().min(1).max(30),
  descricao: z.string().trim().min(3),
  especie: z.enum(["MOVEL", "IMOVEL"]),
  contaContabilAtivoId: z.string().min(1),
  criadoPor: z.string().min(1),
});
export type CadastrarClasseDeBensInput = z.input<typeof zCadastrarClasseDeBensInput>;

/**
 * A CLASSE DE BENS — a classificação que diz em que conta do ativo o bem mora.
 *
 * ⚠️ A CONTA É CONFERIDA, NÃO SÓ REFERENCIADA. Ela tem de ser ANALÍTICA e da classe 1. Uma
 * classe apontando para conta SINTÉTICA faria toda aquisição daquela classe lançar num nível
 * que não recebe partida — e o razão só acusaria isso no fechamento, longe de quem cadastrou.
 * Conta fora do ativo seria pior: o bem entraria no razão DIMINUINDO o patrimônio.
 *
 * ⚠️ E A CONFERÊNCIA VEM ANTES DA ESCRITA. Gravar a classe e só depois descobrir a conta
 * errada deixaria uma classe inválida no cadastro — escolhível, na tela do bem, por quem não
 * tem como saber.
 */
export async function cadastrarClasseDeBens(
  prisma: PrismaClient,
  input: CadastrarClasseDeBensInput
): Promise<{ readonly classeId: string }> {
  const d = zCadastrarClasseDeBensInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarClasseDeBens, "ENTE");

    const conta = await tx.contaPcasp.findUnique({
      where: { id: d.contaContabilAtivoId },
      select: { codigo: true, analitica: true },
    });
    if (conta === null) {
      throw new Error(
        `Conta contábil ${d.contaContabilAtivoId} não existe. A classe não foi criada.`
      );
    }
    if (!conta.analitica) {
      throw new Error(
        `A conta ${conta.codigo} é SINTÉTICA e não recebe lançamento. A classe precisa de ` +
          `conta analítica do ativo: sem isso, toda aquisição desta classe lançaria num ` +
          `nível que não aceita partida. A classe não foi criada.`
      );
    }
    // ⚠️ O PONTO NÃO É ENFEITE: `"1."` casa a CLASSE 1, e `"1"` casaria qualquer código que
    // comece com o dígito. É o mesmo idioma que o recorte de contas da porta já usa.
    if (!conta.codigo.startsWith("1.")) {
      throw new Error(
        `A conta ${conta.codigo} não é do ATIVO. Um bem incorporado por classe que aponta ` +
          `para fora do ativo entraria no razão diminuindo o patrimônio. A classe não foi criada.`
      );
    }

    const criada = await tx.classeDeBens.create({
      data: {
        codigo: d.codigo,
        descricao: d.descricao,
        especie: d.especie,
        contaContabilAtivoId: d.contaContabilAtivoId,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { classeId: criada.id };
  });
}

export const zCadastrarBemInput = z.object({
  numeroTombamento: z.string().trim().min(1).max(60),
  descricao: z.string().trim().min(3),
  classeDeBensId: z.string().min(1),
  dataAquisicao: z.coerce.date(),
  tipoDeIncorporacaoId: z.string().min(1).optional(),
  criadoPor: z.string().min(1),
});
export type CadastrarBemInput = z.input<typeof zCadastrarBemInput>;

/**
 * O BEM ENTRA NO ACERVO — e até aqui NADA no domínio o criava.
 *
 * O modelo do bem existe desde o começo do M10, mas só o seed da POC e os testes o criavam,
 * por `prisma.bemPatrimonial.create` cru. `adquirirBem` exige `liquidacaoId` (o bem adquirido
 * nasce de despesa liquidada) e `registrarEntradaAvulsa` recebe um `bemId` que JÁ EXISTE —
 * ela registra o movimento financeiro, não o bem. Faltava o ato de cadastrar.
 *
 * ⚠️ O BEM NÃO NASCE COM VALOR, e isso não é falta. Valor é `MovimentoPatrimonial`, que já
 * existe e já é provado. Cadastrar e avaliar são dois atos, e quem faz um não é
 * necessariamente quem faz o outro — por isso são duas ações do censo, não uma.
 *
 * ⚠️ O TOMBAMENTO É INFORMADO PELO ENTE, não gerado. Não há numerador de tombamento neste
 * repositório, e inventar um formato seria inventar a regra de numeração do município.
 *
 * ⚠️ A CLASSE TEM DE ESTAR ATIVA. Bem cadastrado em classe desativada some de todo relatório
 * por classe: presente no banco e invisível na posição patrimonial.
 */
export async function cadastrarBem(
  prisma: PrismaClient,
  input: CadastrarBemInput
): Promise<{ readonly bemId: string }> {
  const d = zCadastrarBemInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarBem, "ENTE");

    const classe = await tx.classeDeBens.findUnique({
      where: { id: d.classeDeBensId },
      select: { codigo: true, ativa: true },
    });
    if (classe === null) {
      throw new Error(`Classe de bens ${d.classeDeBensId} não existe. O bem não foi criado.`);
    }
    if (!classe.ativa) {
      throw new Error(
        `A classe ${classe.codigo} está DESATIVADA. Um bem cadastrado nela ficaria fora de ` +
          `todo relatório por classe. O bem não foi criado.`
      );
    }

    if (d.tipoDeIncorporacaoId !== undefined) {
      const tipo = await tx.tipoDeIncorporacao.findUnique({
        where: { id: d.tipoDeIncorporacaoId },
        select: { id: true },
      });
      if (tipo === null) {
        throw new Error(
          `Tipo de incorporação ${d.tipoDeIncorporacaoId} não existe. O bem não foi criado.`
        );
      }
    }

    // ⚠️ A PRÉ-CONDIÇÃO VEM ANTES DA ESCRITA, e o índice único continua sendo a garantia
    // REAL — entre esta leitura e o `create` cabe outra transação. O que a conferência compra
    // é a MENSAGEM: "já existe o tombamento X" em vez do erro cru do banco, que não diz a
    // quem digitou o que fazer em seguida.
    const repetido = await tx.bemPatrimonial.findUnique({
      where: { numeroTombamento: d.numeroTombamento },
      select: { id: true },
    });
    if (repetido !== null) {
      throw new Error(
        `Já existe bem com o tombamento ${d.numeroTombamento}. Dois bens com o mesmo ` +
          `tombamento tornam ambígua a etiqueta colada na prateleira. O bem não foi criado.`
      );
    }

    const criado = await tx.bemPatrimonial.create({
      data: {
        numeroTombamento: d.numeroTombamento,
        descricao: d.descricao,
        classeDeBensId: d.classeDeBensId,
        dataAquisicao: d.dataAquisicao,
        ...(d.tipoDeIncorporacaoId !== undefined
          ? { tipoDeIncorporacaoId: d.tipoDeIncorporacaoId }
          : {}),
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { bemId: criado.id };
  });
}

export const zCadastrarFormulaDeAvaliacaoInput = z.object({
  codigo: z.string().trim().min(1).max(20),
  descricao: z.string().trim().min(3),
  expressao: z.string().trim().min(1),
  criadoPor: z.string().min(1),
});
export type CadastrarFormulaDeAvaliacaoInput = z.input<
  typeof zCadastrarFormulaDeAvaliacaoInput
>;

/**
 * TR 5.19.42 — a fórmula editável pelo usuário.
 *
 * ⚠️ VALIDADA NA HORA DE GUARDAR, não só na de usar. Uma fórmula inválida salva ficaria
 * esperando o dia da avaliação para quebrar — e aí quem a digitou já esqueceu o que quis
 * dizer. Ver `formula-avaliacao.ts`: a expressão é INTERPRETADA, nunca avaliada como
 * código.
 */
export async function cadastrarFormulaDeAvaliacao(
  prisma: PrismaClient,
  input: CadastrarFormulaDeAvaliacaoInput
): Promise<{ readonly formulaId: string }> {
  const d = zCadastrarFormulaDeAvaliacaoInput.parse(input);
  validarFormula(d.expressao);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(
      tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarFormulaDeAvaliacao, "ENTE"
    );
    const criada = await tx.formulaDeAvaliacao.create({
      data: {
        codigo: d.codigo, descricao: d.descricao,
        expressao: d.expressao, criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { formulaId: criada.id };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// OS MOVIMENTOS DE GESTÃO
// ═══════════════════════════════════════════════════════════════════════════

export const zRegistrarMovimentoDeGestaoInput = z.object({
  bemId: z.string().min(1),
  tipo: z.enum(["LOCALIZACAO", "RESPONSAVEL", "ESTADO", "SITUACAO"]),
  dataMovimento: z.coerce.date(),
  localizacaoId: z.string().min(1).optional(),
  responsavelId: z.string().min(1).optional(),
  estado: z.enum(["OTIMO", "BOM", "REGULAR", "RUIM", "INSERVIVEL"]).optional(),
  situacao: z
    .enum([
      "EM_USO", "EM_EMPRESTIMO", "EM_LOCACAO", "EM_MANUTENCAO_PREVENTIVA",
      "EM_MANUTENCAO_CORRETIVA", "EM_DESUSO", "BAIXADO",
    ])
    .optional(),
  inventarioId: z.string().min(1).optional(),
  motivo: zMotivo,
  criadoPor: z.string().min(1),
});
export type RegistrarMovimentoDeGestaoInput = z.input<
  typeof zRegistrarMovimentoDeGestaoInput
>;

/**
 * TR 5.19.15, 5.19.19, 5.19.23 — o bem mudou de lugar, de dono, de estado ou de situação.
 *
 * ⚠️ O CAMPO DO TIPO É OBRIGATÓRIO, E O GUARD É `CAMPO_OBRIGATORIO_DO_TIPO`. Um movimento
 * de LOCALIZACAO sem localização seria gravável e APAGARIA a posição do bem em silêncio:
 * a derivação leria o último movimento do tipo, acharia nulo, e concluiria que o bem não
 * está em lugar nenhum.
 */
export async function registrarMovimentoDeGestao(
  prisma: PrismaClient,
  input: RegistrarMovimentoDeGestaoInput
): Promise<{ readonly movimentoId: string }> {
  const d = zRegistrarMovimentoDeGestaoInput.parse(input);

  const obrigatorio = CAMPO_OBRIGATORIO_DO_TIPO[d.tipo];
  const valores: Record<string, unknown> = {
    localizacaoId: d.localizacaoId,
    responsavelId: d.responsavelId,
    estado: d.estado,
    situacao: d.situacao,
  };
  if (obrigatorio !== null && valores[obrigatorio] === undefined) {
    throw new Error(
      `Movimento do tipo ${d.tipo} exige "${obrigatorio}". Sem ele o movimento seria ` +
        `gravável e APAGARIA o eixo em silêncio: a leitura derivada acharia nulo no ` +
        `último movimento do tipo e concluiria que o bem não tem mais ${obrigatorio}.`
    );
  }

  return prisma.$transaction(async (tx) => {
    const bem = await exigirBem(tx, d.bemId);
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarMovimentoDeGestao, "ENTE");

    const criado = await tx.movimentoDeGestaoDoBem.create({
      data: {
        bemId: bem.id,
        tipo: d.tipo,
        dataMovimento: d.dataMovimento,
        localizacaoId: d.localizacaoId ?? null,
        responsavelId: d.responsavelId ?? null,
        estado: d.estado ?? null,
        situacao: d.situacao ?? null,
        inventarioId: d.inventarioId ?? null,
        motivo: d.motivo,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { movimentoId: criado.id };
  });
}

async function exigirBem(
  tx: Tx,
  id: string
): Promise<{ readonly id: string; readonly numeroTombamento: string }> {
  const bem = await tx.bemPatrimonial.findUnique({
    where: { id },
    select: { id: true, numeroTombamento: true },
  });
  if (bem === null) throw new Error(`Bem ${id} não existe.`);
  return bem;
}

export const zTransferirBemEntreEntidadesInput = z.object({
  bemId: z.string().min(1),
  unidadeOrcOrigemId: z.string().min(1),
  unidadeOrcDestinoId: z.string().min(1),
  dataMovimento: z.coerce.date(),
  motivo: zMotivo,
  criadoPor: z.string().min(1),
});
export type TransferirBemEntreEntidadesInput = z.input<
  typeof zTransferirBemEntreEntidadesInput
>;

/**
 * TR 5.19.28 — "baixa automática na entidade de origem e incorporação na entidade de
 * destino, possibilitando fazer o estorno da transferência". Decisão D10.
 *
 * ⚠️ DUAS PERNAS SOB UM `operacaoId`, tudo-ou-nada. Se a baixa gravasse antes de a
 * incorporação ser viável, o bem sumiria de uma entidade sem aparecer na outra — e o
 * estorno pedido pela cláusula exige que as duas andem juntas.
 */
export async function transferirBemEntreEntidades(
  prisma: PrismaClient,
  input: TransferirBemEntreEntidadesInput
): Promise<{
  readonly operacaoId: string;
  readonly saidaId: string;
  readonly entradaId: string;
}> {
  const d = zTransferirBemEntreEntidadesInput.parse(input);
  if (d.unidadeOrcOrigemId === d.unidadeOrcDestinoId) {
    throw new Error(
      `Origem e destino são a mesma unidade gestora. A transferência produziria um par ` +
        `que se anula e um histórico que engana quem audita.`
    );
  }

  return prisma.$transaction(async (tx) => {
    const bem = await exigirBem(tx, d.bemId);
    // ⚠️ AS DUAS UGs TÊM DE PASSAR — o ato tira de uma e põe na outra.
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.transferirBemEntreEntidades, {
      ugs: [d.unidadeOrcOrigemId, d.unidadeOrcDestinoId],
    });

    // ⚠️ VIABILIDADE ANTES DE QUALQUER ESCRITA — a forma do `porNaFila` do ENT03a.
    const estado = await estadoDoBem(tx, d.bemId, diaCivil(d.dataMovimento));
    if (estado.unidadeOrcId !== null && estado.unidadeOrcId !== d.unidadeOrcOrigemId) {
      throw new Error(
        `O bem ${bem.numeroTombamento} está na unidade ${estado.unidadeOrcId} em ` +
          `${diaCivil(d.dataMovimento)}, e não na origem declarada ` +
          `(${d.unidadeOrcOrigemId}). Transferir daqui produziria duas entidades ` +
          `achando que o bem é delas.`
      );
    }
    if (estado.situacao === "BAIXADO") {
      throw new Error(
        `O bem ${bem.numeroTombamento} está BAIXADO. Um bem baixado não se transfere: ` +
          `ele já saiu do acervo.`
      );
    }

    const operacaoId = randomUUID();
    const comum = {
      bemId: d.bemId,
      dataMovimento: d.dataMovimento,
      operacaoId,
      motivo: d.motivo,
      criadoPor: d.criadoPor,
    };
    const saida = await tx.movimentoDeGestaoDoBem.create({
      data: { ...comum, tipo: "TRANSFERENCIA_SAIDA", unidadeOrcId: d.unidadeOrcOrigemId },
      select: { id: true },
    });
    const entrada = await tx.movimentoDeGestaoDoBem.create({
      data: { ...comum, tipo: "TRANSFERENCIA_ENTRADA", unidadeOrcId: d.unidadeOrcDestinoId },
      select: { id: true },
    });
    return { operacaoId, saidaId: saida.id, entradaId: entrada.id };
  });
}

export const zEstornarMovimentoDeGestaoInput = z.object({
  movimentoId: z.string().min(1),
  dataMovimento: z.coerce.date(),
  motivo: zMotivo,
  criadoPor: z.string().min(1),
});
export type EstornarMovimentoDeGestaoInput = z.input<
  typeof zEstornarMovimentoDeGestaoInput
>;

/**
 * ESTORNO — APPEND-ONLY, e ele ANDA EM PAR quando o original é de uma operação composta.
 *
 * ⚠️ ESTORNAR SÓ UMA PERNA DA TRANSFERÊNCIA deixaria o bem em duas entidades ou em
 * nenhuma. A cláusula 5.19.28 pede o estorno DA TRANSFERÊNCIA, não de um movimento.
 */
export async function estornarMovimentoDeGestao(
  prisma: PrismaClient,
  input: EstornarMovimentoDeGestaoInput
): Promise<{ readonly movimentosId: readonly string[] }> {
  const d = zEstornarMovimentoDeGestaoInput.parse(input);

  return prisma.$transaction(async (tx) => {
    const original = await tx.movimentoDeGestaoDoBem.findUnique({
      where: { id: d.movimentoId },
      select: {
        id: true, tipo: true, bemId: true, operacaoId: true,
        localizacaoId: true, responsavelId: true, estado: true, situacao: true,
        unidadeOrcId: true, inventarioId: true,
        estornos: { select: { id: true } },
      },
    });
    if (original === null) throw new Error(`Movimento ${d.movimentoId} não existe.`);
    await autorizarNo(
      tx, d.criadoPor, ACAO_DO_SERVICO.estornarMovimentoDeGestao, "ENTE"
    );

    const alvos =
      original.operacaoId === null
        ? [original]
        : await tx.movimentoDeGestaoDoBem.findMany({
            where: { operacaoId: original.operacaoId },
            select: {
              id: true, tipo: true, bemId: true, operacaoId: true,
              localizacaoId: true, responsavelId: true, estado: true, situacao: true,
              unidadeOrcId: true, inventarioId: true,
              estornos: { select: { id: true } },
            },
          });

    const criados: string[] = [];
    for (const alvo of alvos) {
      const tipoEstorno =
        TIPO_DO_ESTORNO_DE_GESTAO[alvo.tipo as TipoMovimentoDeGestao];
      if (tipoEstorno === null) {
        throw new Error(
          `${alvo.tipo} JÁ É um estorno. A correção de um estorno é um fato NOVO — a ` +
            `razão é append-only.`
        );
      }
      if (alvo.estornos.length > 0) {
        throw new Error(
          `O movimento ${alvo.id} já foi estornado. Estornar duas vezes desfaria o ` +
            `mesmo fato em dobro.`
        );
      }
      const criado = await tx.movimentoDeGestaoDoBem.create({
        data: {
          bemId: alvo.bemId,
          tipo: tipoEstorno,
          dataMovimento: d.dataMovimento,
          localizacaoId: alvo.localizacaoId,
          responsavelId: alvo.responsavelId,
          estado: alvo.estado,
          situacao: alvo.situacao,
          unidadeOrcId: alvo.unidadeOrcId,
          inventarioId: alvo.inventarioId,
          operacaoId: alvo.operacaoId,
          estornoDeId: alvo.id,
          motivo: d.motivo,
          criadoPor: d.criadoPor,
        },
        select: { id: true },
      });
      criados.push(criado.id);
    }
    return { movimentosId: criados };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ETIQUETA, TERMO, INVENTÁRIO E AVALIAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

export const zGerarEtiquetaDeBemInput = z.object({
  bemId: z.string().min(1),
  criadoPor: z.string().min(1),
});
export type GerarEtiquetaDeBemInput = z.input<typeof zGerarEtiquetaDeBemInput>;

/**
 * TR 5.19.2 — a etiqueta com código de barras.
 *
 * ⚠️ O CÓDIGO É DERIVADO DO TOMBAMENTO, e é GRAVADO. Derivá-lo na hora de imprimir faria
 * duas impressões do mesmo bem saírem diferentes no dia em que a regra mudasse — e a
 * etiqueta colada no armário não muda junto. Gravar torna a reimpressão idêntica.
 *
 * ⚠️ E ELE É IDEMPOTENTE: pedir a etiqueta duas vezes devolve a MESMA. Gerar um código
 * novo faria o leitor de código de barras deixar de reconhecer a etiqueta já colada.
 */
export async function gerarEtiquetaDeBem(
  prisma: PrismaClient,
  input: GerarEtiquetaDeBemInput
): Promise<{ readonly codigoDeBarras: string; readonly reaproveitada: boolean }> {
  const d = zGerarEtiquetaDeBemInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.gerarEtiquetaDeBem, "ENTE");
    const bem = await tx.bemPatrimonial.findUnique({
      where: { id: d.bemId },
      select: { id: true, numeroTombamento: true, codigoDeBarras: true },
    });
    if (bem === null) throw new Error(`Bem ${d.bemId} não existe.`);
    if (bem.codigoDeBarras !== null) {
      return { codigoDeBarras: bem.codigoDeBarras, reaproveitada: true };
    }

    // O conteúdo é o próprio número de tombamento: é ele que identifica o bem no acervo,
    // e inventar um segundo identificador criaria duas verdades sobre o mesmo armário.
    const codigo = bem.numeroTombamento;
    await tx.bemPatrimonial.update({
      where: { id: bem.id },
      data: { codigoDeBarras: codigo },
    });
    return { codigoDeBarras: codigo, reaproveitada: false };
  });
}

export const zEmitirTermoPatrimonialInput = z.object({
  numero: z.string().trim().min(1).max(20),
  tipo: z.enum(["RESPONSABILIDADE", "BAIXA"]),
  responsavelId: z.string().min(1).optional(),
  setorId: z.string().min(1).optional(),
  data: z.coerce.date(),
  bensId: z.array(z.string().min(1)).min(1, "um termo sem bem não entrega nada a ninguém"),
  criadoPor: z.string().min(1),
});
export type EmitirTermoPatrimonialInput = z.input<typeof zEmitirTermoPatrimonialInput>;

/**
 * TR 5.19.36 e 5.19.37 — o termo de responsabilidade e o de baixa.
 *
 * ⚠️ O TERMO DE RESPONSABILIDADE EXIGE RESPONSÁVEL, e isso não é formalidade: um termo
 * sem em quem recair não entrega o bem a ninguém, e é exatamente o documento que o
 * controle interno cobra quando o bem some.
 *
 * ⚠️ E ELE REGISTRA O MOVIMENTO DE RESPONSABILIDADE JUNTO, na mesma transação. Sem isso,
 * o termo diria uma coisa e a derivação do bem outra — duas verdades sobre quem responde.
 */
export async function emitirTermoPatrimonial(
  prisma: PrismaClient,
  input: EmitirTermoPatrimonialInput
): Promise<{ readonly termoId: string; readonly movimentos: number }> {
  const d = zEmitirTermoPatrimonialInput.parse(input);
  if (d.tipo === "RESPONSABILIDADE" && d.responsavelId === undefined) {
    throw new Error(
      `Termo de RESPONSABILIDADE sem responsável não entrega o bem a ninguém — e é ` +
        `justamente este documento que o controle interno cobra quando o bem some.`
    );
  }

  return prisma.$transaction(async (tx) => {
    await autorizarNo(
      tx,
      d.criadoPor,
      ACAO_DO_SERVICO.emitirTermoPatrimonial,
      d.setorId === undefined ? "ENTE" : { setor: d.setorId }
    );

    const termo = await tx.termoPatrimonial.create({
      data: {
        numero: d.numero, tipo: d.tipo,
        responsavelId: d.responsavelId ?? null, setorId: d.setorId ?? null,
        data: d.data, criadoPor: d.criadoPor,
        itens: {
          create: d.bensId.map((bemId) => ({ bemId, criadoPor: d.criadoPor })),
        },
      },
      select: { id: true },
    });

    let movimentos = 0;
    for (const bemId of d.bensId) {
      if (d.tipo === "RESPONSABILIDADE") {
        await tx.movimentoDeGestaoDoBem.create({
          data: {
            bemId, tipo: "RESPONSAVEL", dataMovimento: d.data,
            responsavelId: d.responsavelId as string,
            motivo: `Termo de responsabilidade ${d.numero}`,
            criadoPor: d.criadoPor,
          },
        });
      } else {
        await tx.movimentoDeGestaoDoBem.create({
          data: {
            bemId, tipo: "SITUACAO", dataMovimento: d.data, situacao: "BAIXADO",
            motivo: `Termo de baixa ${d.numero}`, criadoPor: d.criadoPor,
          },
        });
      }
      movimentos += 1;
    }

    return { termoId: termo.id, movimentos };
  });
}

export const zAbrirInventarioDeBensInput = z.object({
  exercicio: z.number().int().min(2000).max(2100),
  comissaoId: z.string().min(1),
  unidadeOrcId: z.string().min(1),
  dataAbertura: z.coerce.date(),
  termoAberturaId: z.string().min(1).optional(),
  criadoPor: z.string().min(1),
});
export type AbrirInventarioDeBensInput = z.input<typeof zAbrirInventarioDeBensInput>;

/**
 * TR 5.19.1 e 5.19.22 — o inventário de bens, com comissão e termo.
 *
 * ⚠️ A COMISSÃO TEM DE ESTAR VIGENTE NA DATA E SER DE INVENTÁRIO. Abrir com a comissão de
 * reavaliação faria o termo ser assinado por quem a portaria não designou para isso — e é
 * o tipo de vício que anula o inventário inteiro depois de ele estar feito.
 */
export async function abrirInventarioDeBens(
  prisma: PrismaClient,
  input: AbrirInventarioDeBensInput
): Promise<{ readonly inventarioId: string }> {
  const d = zAbrirInventarioDeBensInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.abrirInventarioDeBens, {
      ug: d.unidadeOrcId,
    });

    const comissao = await tx.comissaoPatrimonial.findUnique({
      where: { id: d.comissaoId },
      select: { id: true, codigo: true, finalidade: true, vigenciaInicio: true, vigenciaFim: true },
    });
    if (comissao === null) throw new Error(`Comissão ${d.comissaoId} não existe.`);
    if (comissao.finalidade !== "INVENTARIO") {
      throw new Error(
        `A comissão ${comissao.codigo} foi designada para ${comissao.finalidade}, não ` +
          `para INVENTARIO. Assinar o termo com ela é vício que anula o inventário ` +
          `inteiro depois de pronto.`
      );
    }
    const dia = diaCivil(d.dataAbertura);
    if (!comissaoVigenteEm(comissao, dia)) {
      throw new Error(
        `A comissão ${comissao.codigo} não estava vigente em ${dia} — a portaria que a ` +
          `designou não cobre essa data.`
      );
    }

    const aberto = await tx.inventarioDeBens.findFirst({
      where: { unidadeOrcId: d.unidadeOrcId, dataFechamento: null },
      select: { id: true },
    });
    if (aberto !== null) {
      throw new Error(
        `Já há inventário de bens ABERTO nesta unidade gestora. Dois abertos tornariam ` +
          `ambíguo a qual deles cada contagem pertence.`
      );
    }

    const criado = await tx.inventarioDeBens.create({
      data: {
        exercicio: d.exercicio, comissaoId: d.comissaoId, unidadeOrcId: d.unidadeOrcId,
        dataAbertura: d.dataAbertura, termoAberturaId: d.termoAberturaId ?? null,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { inventarioId: criado.id };
  });
}

export const zRegistrarContagemDeBemInput = z.object({
  inventarioId: z.string().min(1),
  bemId: z.string().min(1),
  encontrado: z.boolean(),
  localizacaoObservadaId: z.string().min(1).optional(),
  estadoObservado: z.enum(["OTIMO", "BOM", "REGULAR", "RUIM", "INSERVIVEL"]).optional(),
  observacao: z.string().trim().optional(),
  /**
   * TR 5.19.19 — "transferência AUTOMÁTICA do bem quando o mesmo está alocado
   * fisicamente em departamento incorreto". Explícito, e não implícito: a comissão
   * DECIDE se corrige o cadastro ou se apenas registra a divergência.
   */
  transferirParaOndeFoiEncontrado: z.boolean().default(false),
  criadoPor: z.string().min(1),
});
export type RegistrarContagemDeBemInput = z.input<typeof zRegistrarContagemDeBemInput>;

/** TR 5.19.20 — a observação da comissão; a divergência é DERIVADA (decisão D3). */
export async function registrarContagemDeBem(
  prisma: PrismaClient,
  input: RegistrarContagemDeBemInput
): Promise<{ readonly contagemId: string; readonly transferido: boolean }> {
  const d = zRegistrarContagemDeBemInput.parse(input);
  if (!d.encontrado && d.transferirParaOndeFoiEncontrado) {
    throw new Error(
      `Não se transfere para onde o bem foi encontrado um bem que NÃO foi encontrado.`
    );
  }

  return prisma.$transaction(async (tx) => {
    const inv = await tx.inventarioDeBens.findUnique({
      where: { id: d.inventarioId },
      select: { id: true, dataAbertura: true, dataFechamento: true, unidadeOrcId: true },
    });
    if (inv === null) throw new Error(`Inventário ${d.inventarioId} não existe.`);
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarContagemDeBem, {
      ug: inv.unidadeOrcId,
    });
    if (inv.dataFechamento !== null) {
      throw new Error(
        `O inventário já foi FECHADO em ${diaCivil(inv.dataFechamento)}. Contar depois ` +
          `do fechamento mudaria um resultado já apurado.`
      );
    }

    const existente = await tx.contagemDeBem.findUnique({
      where: { inventarioId_bemId: { inventarioId: d.inventarioId, bemId: d.bemId } },
      select: { id: true },
    });
    const dados = {
      encontrado: d.encontrado,
      localizacaoObservadaId: d.localizacaoObservadaId ?? null,
      estadoObservado: d.estadoObservado ?? null,
      observacao: d.observacao ?? null,
    };
    const contagemId =
      existente === null
        ? (
            await tx.contagemDeBem.create({
              data: {
                inventarioId: d.inventarioId, bemId: d.bemId,
                ...dados, criadoPor: d.criadoPor,
              },
              select: { id: true },
            })
          ).id
        : (await tx.contagemDeBem.update({ where: { id: existente.id }, data: dados }), existente.id);

    let transferido = false;
    if (d.transferirParaOndeFoiEncontrado && d.localizacaoObservadaId !== undefined) {
      await tx.movimentoDeGestaoDoBem.create({
        data: {
          bemId: d.bemId, tipo: "LOCALIZACAO", dataMovimento: inv.dataAbertura,
          localizacaoId: d.localizacaoObservadaId, inventarioId: d.inventarioId,
          motivo: "Transferência pelo inventário — bem alocado em local incorreto",
          criadoPor: d.criadoPor,
        },
      });
      transferido = true;
    }
    if (d.estadoObservado !== undefined) {
      await tx.movimentoDeGestaoDoBem.create({
        data: {
          bemId: d.bemId, tipo: "ESTADO", dataMovimento: inv.dataAbertura,
          estado: d.estadoObservado, inventarioId: d.inventarioId,
          motivo: "Estado observado no inventário", criadoPor: d.criadoPor,
        },
      });
    }

    return { contagemId, transferido };
  });
}

export const zFecharInventarioDeBensInput = z.object({
  inventarioId: z.string().min(1),
  dataFechamento: z.coerce.date(),
  termoFechamentoId: z.string().min(1).optional(),
  criadoPor: z.string().min(1),
});
export type FecharInventarioDeBensInput = z.input<typeof zFecharInventarioDeBensInput>;

/** TR 5.19.22 — fecha, com termo. A divergência continua derivada. */
export async function fecharInventarioDeBens(
  prisma: PrismaClient,
  input: FecharInventarioDeBensInput
): Promise<{ readonly inventarioId: string; readonly contagens: number }> {
  const d = zFecharInventarioDeBensInput.parse(input);
  return prisma.$transaction(async (tx) => {
    const inv = await tx.inventarioDeBens.findUnique({
      where: { id: d.inventarioId },
      select: {
        id: true, dataAbertura: true, dataFechamento: true, unidadeOrcId: true,
        contagens: { select: { id: true } },
      },
    });
    if (inv === null) throw new Error(`Inventário ${d.inventarioId} não existe.`);
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.fecharInventarioDeBens, {
      ug: inv.unidadeOrcId,
    });
    if (inv.dataFechamento !== null) {
      throw new Error(`O inventário já foi fechado em ${diaCivil(inv.dataFechamento)}.`);
    }
    if (d.dataFechamento < inv.dataAbertura) {
      throw new Error(`Fechamento anterior à abertura — a janela ficaria invertida.`);
    }
    if (inv.contagens.length === 0) {
      throw new Error(
        `O inventário não tem contagem nenhuma. Fechar sem contar registraria um ` +
          `inventário que ninguém fez.`
      );
    }

    await tx.inventarioDeBens.update({
      where: { id: d.inventarioId },
      data: {
        dataFechamento: d.dataFechamento,
        termoFechamentoId: d.termoFechamentoId ?? null,
      },
    });
    return { inventarioId: inv.id, contagens: inv.contagens.length };
  });
}

/**
 * TR 5.19.21 — o relatório de inconsistência do inventário.
 *
 * ⚠️ DERIVADO, e comparado contra o estado do bem NA DATA DE ABERTURA do inventário —
 * não contra o de hoje. Comparar com hoje faria a movimentação posterior ao inventário
 * virar divergência dele.
 */
export async function inconsistenciasDoInventarioDeBens(
  tx: Tx,
  inventarioId: string
): Promise<
  readonly {
    readonly bemId: string;
    readonly numeroTombamento: string;
    readonly motivo: string;
    readonly esperado: string | null;
    readonly observado: string | null;
  }[]
> {
  const inv = await tx.inventarioDeBens.findUnique({
    where: { id: inventarioId },
    select: {
      dataAbertura: true,
      contagens: {
        select: {
          bemId: true, encontrado: true,
          localizacaoObservadaId: true, estadoObservado: true,
          bem: { select: { numeroTombamento: true } },
        },
      },
    },
  });
  if (inv === null) throw new Error(`Inventário ${inventarioId} não existe.`);

  const dia = diaCivil(inv.dataAbertura);
  const estados = new Map<string, EstadoDoBem>();
  for (const c of inv.contagens) {
    estados.set(c.bemId, await estadoDoBem(tx, c.bemId, dia));
  }

  const tombamentos = new Map(
    inv.contagens.map((c) => [c.bemId, c.bem.numeroTombamento])
  );

  return divergenciasDoInventario(
    inv.contagens.map((c) => ({
      bemId: c.bemId,
      encontrado: c.encontrado,
      localizacaoObservadaId: c.localizacaoObservadaId,
      estadoObservado: c.estadoObservado as EstadoDeConservacao | null,
    })),
    (bemId) =>
      estados.get(bemId) ?? {
        localizacaoId: null, responsavelId: null, estado: null,
        situacao: null, unidadeOrcId: null,
      }
  ).map((d) => ({
    bemId: d.bemId,
    numeroTombamento: tombamentos.get(d.bemId) ?? d.bemId,
    motivo: d.motivo,
    esperado: d.esperado,
    observado: d.observado,
  }));
}

/**
 * TR 5.19.42 — avalia um bem por uma fórmula cadastrada.
 *
 * ⚠️ ELE NÃO ESCREVE NADA, e é decisão declarada: lançar a reavaliação é
 * `registrarReavaliacao`, que passa pelo funil do M01 e cobra o período aberto. Uma
 * avaliação que já lançasse atravessaria esse controle — e a cláusula pede AVALIAR, que é
 * calcular; lançar é outro ato, com outro crachá.
 */
export async function avaliarBemPorFormula(
  tx: Tx,
  p: {
    readonly bemId: string;
    readonly formulaId: string;
    readonly ateDia: string;
  }
): Promise<{ readonly valor: Money; readonly expressao: string }> {
  const formula = await tx.formulaDeAvaliacao.findUnique({
    where: { id: p.formulaId },
    select: { expressao: true, ativa: true, codigo: true },
  });
  if (formula === null || !formula.ativa) {
    throw new Error(
      `Fórmula ${p.formulaId} não existe ou está inativa. Sem fórmula a avaliação ` +
        `RECUSA — inventar uma seria escolher o número no lugar do ente.`
    );
  }

  const bem = await tx.bemPatrimonial.findUnique({
    where: { id: p.bemId },
    select: {
      dataAquisicao: true,
      classeDeBens: { select: { parametro: { select: { vidaUtilMeses: true, percentualResidual: true } } } },
      movimentos: { select: { tipo: true, valor: true } },
    },
  });
  if (bem === null) throw new Error(`Bem ${p.bemId} não existe.`);
  const parametro = bem.classeDeBens.parametro;
  if (parametro === null) {
    throw new Error(
      `A classe do bem não tem parâmetro de atualização (vida útil e residual). A ` +
        `fórmula os usa, e não existe vida útil default — é dado do ente.`
    );
  }

  const movimentos = bem.movimentos.map((m) => ({
    tipo: m.tipo as TipoMovimentoPatrimonial,
    valor: toMoney(m.valor.toFixed(2)),
  }));

  const bruto = valorBruto(movimentos);
  const acumulada = atualizacaoAcumulada(movimentos);

  const valor = avaliarFormula(formula.expressao, {
    valorBruto: bruto,
    acumulada,
    valorContabil: bruto.minus(acumulada),
    idadeMeses: toMoney(
      String(
        Math.max(
          0,
          Math.floor(
            diferencaEmDiasCivis(meioDiaCivil(p.ateDia), bem.dataAquisicao) /
              30
          )
        )
      )
    ),
    vidaUtilMeses: toMoney(String(parametro.vidaUtilMeses)),
    percentualResidual: toMoney(parametro.percentualResidual.toFixed(6)),
  });

  return { valor, expressao: formula.expressao };
}
