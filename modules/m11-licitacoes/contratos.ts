import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
// A soma do empenhado é do M05 — dono do `Empenho`. O M11 delega, não recopia.
import { empenhadoLiquidoPorContrato } from "../m05-despesa/consultas.js";
import { exigirTetoDaDispensa } from "./limites.js";
import {
  estaVigente,
  tipoDoEstorno,
  valorAtualizado,
  vigenciaFim,
  zCadastrarContratoInput,
  zCadastrarProcessoInput,
  zEstornarMovimentoContratualInput,
  zHomologarProcessoInput,
  zRegistrarAditivoInput,
  type CadastrarContratoInput,
  type CadastrarProcessoInput,
  type EstornarMovimentoContratualInput,
  type HomologarProcessoInput,
  type MovimentoDoContrato,
  type RegistrarAditivoInput,
} from "./dominio.js";

/**
 * M11 — SERVIÇOS de licitações e contratos.
 *
 * APPEND-ONLY: nenhum UPDATE, nenhum DELETE. Um aditivo é um FATO NOVO; corrigir
 * um aditivo é ESTORNÁ-LO (outro fato). O contrato original nunca muda de linha.
 *
 * FAIL-CLOSED COM SELECT: todo guard lê o banco DENTRO da transação. Checar fora
 * dela é checar um passado que já pode ter mudado.
 */

/** Qualquer coisa que fale Prisma: o client ou uma transação dele. */
type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/** Os movimentos VIVOS do contrato até o corte, no formato do domínio. */
async function movimentosDoContrato(
  tx: Tx,
  contratoId: string,
  corte?: Date
): Promise<readonly MovimentoDoContrato[]> {
  const linhas = await tx.movimentoContratual.findMany({
    where: {
      contratoId,
      // ⚠️ O CORTE É PELA DATA DO FATO (a assinatura do aditivo), nunca pelo
      // `criadoEm`. Um aditivo de março digitado em maio pertence a março.
      ...(corte !== undefined ? { data: { lte: corte } } : {}),
    },
    select: { tipo: true, valor: true, dias: true },
  });

  // ⚠️ O ESTORNO NÃO É FILTRADO — ele SOMA, com o sinal dele. É o oposto do
  // padrão "originais vivos": aqui o estorno de um acréscimo tem sinal −1 e
  // desfaz o acréscimo somando. Filtrar o par (original + estorno) daria o mesmo
  // número por dois caminhos — e dois caminhos é um a mais do que se precisa.
  return linhas.map((m) => ({
    tipo: m.tipo,
    valor: m.valor === null ? null : toMoney(m.valor.toFixed(2)),
    dias: m.dias,
  }));
}

async function exigirContrato(
  tx: Tx,
  contratoId: string
): Promise<{
  readonly id: string;
  readonly numeroContrato: string;
  readonly valorInicial: Money;
  readonly vigenciaInicio: Date;
  readonly vigenciaFimInicial: Date;
}> {
  const c = await tx.contrato.findUnique({
    where: { id: contratoId },
    select: {
      id: true,
      numeroContrato: true,
      valorInicial: true,
      vigenciaInicio: true,
      vigenciaFimInicial: true,
    },
  });
  if (c === null) {
    throw new Error(`Contrato ${contratoId} não existe.`);
  }
  return { ...c, valorInicial: toMoney(c.valorInicial.toFixed(2)) };
}

// ═══════════════════════════════════════════════════════════════════════════
// AS DERIVAÇÕES — o estado do contrato NÃO mora em coluna nenhuma
// ═══════════════════════════════════════════════════════════════════════════

export async function valorAtualizadoDoContrato(
  prisma: Tx,
  contratoId: string,
  corte?: Date
): Promise<Money> {
  const c = await exigirContrato(prisma, contratoId);
  return valorAtualizado(
    c.valorInicial,
    await movimentosDoContrato(prisma, contratoId, corte)
  );
}

export async function vigenciaFimDoContrato(
  prisma: Tx,
  contratoId: string,
  corte?: Date
): Promise<Date> {
  const c = await exigirContrato(prisma, contratoId);
  return vigenciaFim(
    c.vigenciaFimInicial,
    await movimentosDoContrato(prisma, contratoId, corte)
  );
}

export async function estaVigenteEm(
  prisma: Tx,
  contratoId: string,
  data: Date
): Promise<boolean> {
  const c = await exigirContrato(prisma, contratoId);
  const fim = vigenciaFim(
    c.vigenciaFimInicial,
    await movimentosDoContrato(prisma, contratoId)
  );
  return estaVigente(c.vigenciaInicio, fim, data);
}

/**
 * O EMPENHADO LÍQUIDO CONTRA O CONTRATO.
 *
 * ✅ BLOCO 2: A DÍVIDA FOI PAGA. No bloco 1 esta função somava sobre conjunto
 * vazio (o vínculo `Empenho.contratoId` não existia) — e foi por ela ter nascido
 * com a FORMA FINAL que o pagamento custou UMA LINHA: nenhum chamador mudou, e o
 * guard da supressão (que já a chamava) passou a morder sozinho.
 *
 * A soma é do M05, dono do `Empenho` — aqui só se delega. `somaLiquidaEstornaveis`
 * garante que a ANULAÇÃO derrube o empenhado (e ela só entra porque a anulação
 * copia o `contratoId` do original).
 */
export async function empenhadoLiquidoDoContrato(
  prisma: Tx,
  contratoId: string,
  corte?: Date
): Promise<Money> {
  return empenhadoLiquidoPorContrato(prisma, contratoId, corte);
}

/**
 * QUANDO O PROCESSO FOI HOMOLOGADO — a leitura ÚNICA, e as DUAS fontes.
 *
 * `dataHomologacao` (cadastro) é o processo que JÁ NASCE homologado — carga
 * histórica, ou cadastro feito depois do ato. `HomologacaoProcesso` é o EVENTO:
 * homologar um processo que já existe, sem UPDATE (append-only).
 *
 * ⚠️ AS DUAS NUNCA CONVIVEM: `homologarProcesso()` recusa um processo que já
 * trouxe a data no cadastro. Duas datas para o mesmo ato são duas verdades — e
 * uma delas está errada. Aqui, o `??` não é uma escolha: é a leitura de uma fonte
 * que, por construção, é única.
 */
export async function homologadoEm(
  prisma: Tx,
  processoId: string
): Promise<Date | null> {
  const p = await prisma.processoLicitatorio.findUnique({
    where: { id: processoId },
    select: {
      dataHomologacao: true,
      homologacao: { select: { data: true } },
    },
  });
  if (p === null) return null;
  return p.dataHomologacao ?? p.homologacao?.data ?? null;
}

/**
 * HOMOLOGAR — o FATO, append-only. Nenhum UPDATE em `dataHomologacao`.
 *
 * Fail-closed, na ordem: o processo existe; não trouxe a data no cadastro (duas
 * verdades = erro); e não foi homologado antes. A terceira barreira é do BANCO
 * (`@unique` em `processoId`) — o guard do serviço dá a mensagem, o índice
 * sustenta a invariante contra o INSERT direto.
 */
export async function homologarProcesso(
  prisma: PrismaClient,
  input: HomologarProcessoInput
): Promise<{ readonly homologacaoId: string }> {
  const dados = zHomologarProcessoInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.homologarProcesso, "ENTE");

    const processo = await tx.processoLicitatorio.findUnique({
      where: { id: dados.processoId },
      select: {
        id: true,
        numeroProcesso: true,
        dataHomologacao: true,
        homologacao: { select: { data: true } },
      },
    });
    if (processo === null) {
      throw new Error(`Processo licitatório ${dados.processoId} não existe.`);
    }

    if (processo.dataHomologacao !== null) {
      throw new Error(
        `DUAS VERDADES DE HOMOLOGAÇÃO: o processo ${processo.numeroProcesso} já ` +
          `nasceu homologado no cadastro (${processo.dataHomologacao.toISOString()}). ` +
          `Registrar o evento agora criaria uma SEGUNDA data para o mesmo ato — e ` +
          `uma das duas estaria errada, sem que ninguém soubesse qual.`
      );
    }
    if (processo.homologacao !== null) {
      throw new Error(
        `Processo ${processo.numeroProcesso} JÁ FOI HOMOLOGADO em ` +
          `${processo.homologacao.data.toISOString()}. Homologar duas vezes não é ` +
          `corrigir — é inventar outra data para o mesmo ato.`
      );
    }

    const criada = await tx.homologacaoProcesso.create({
      data: {
        processoId: dados.processoId,
        data: dados.data,
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });
    return { homologacaoId: criada.id };
  });
}

/** valorAtualizado − empenhadoLiquido: o que ainda dá para empenhar. */
export async function saldoDoContrato(
  prisma: Tx,
  contratoId: string,
  corte?: Date
): Promise<Money> {
  const [valor, empenhado] = await Promise.all([
    valorAtualizadoDoContrato(prisma, contratoId, corte),
    empenhadoLiquidoDoContrato(prisma, contratoId, corte),
  ]);
  return toMoney(valor.minus(empenhado));
}

/** HOMOLOGADO é DERIVADO da data — não há coluna `situacao`. */
export type SituacaoProcesso = "EM_ANDAMENTO" | "HOMOLOGADO";

export function situacaoDoProcesso(dataHomologacao: Date | null): SituacaoProcesso {
  return dataHomologacao === null ? "EM_ANDAMENTO" : "HOMOLOGADO";
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVIÇOS
// ═══════════════════════════════════════════════════════════════════════════

export async function cadastrarProcesso(
  prisma: PrismaClient,
  input: CadastrarProcessoInput
): Promise<{ readonly processoId: string }> {
  const dados = zCadastrarProcessoInput.parse(input);
  // SEM UG: o `ProcessoLicitatorio` não tem unidade no schema — a licitação é do ente. A unidade só
  // aparece quando o EMPENHO amarra o contrato a uma ficha, e lá a autorização é a do M05.
  await autorizarNo(prisma, dados.criadoPor, ACAO_DO_SERVICO.cadastrarProcesso, "ENTE");


  const criado = await prisma.processoLicitatorio.create({
    data: {
      numeroProcesso: dados.numeroProcesso,
      modalidade: dados.modalidade,
      objeto: dados.objeto,
      valorLicitado: dados.valorLicitado.toFixed(2),
      dataHomologacao: dados.dataHomologacao ?? null,
      hipoteseDispensa: dados.hipoteseDispensa ?? null,
      criadoPor: dados.criadoPor,
    },
    select: { id: true },
  });
  return { processoId: criado.id };
}

/**
 * CADASTRAR CONTRATO.
 *
 * ═══ POR QUE **NÃO** EXISTE GUARD `valorInicial <= valorLicitado` ═══
 * Porque a licitação é um TETO da estimativa, e o contrato sai do LANCE — que
 * quase sempre vem abaixo dele (é o ponto de licitar). Um guard de "<=" barraria
 * o caso normal se o ente registrasse o valor licitado já com desconto, e um de
 * ">=" barraria o desconto. A relação entre licitado e contratado é assunto de
 * RELATÓRIO (TR 5.103 compara os dois), não de bloqueio: comparar é informar;
 * bloquear seria inventar uma regra que a lei não escreveu.
 */
export async function cadastrarContrato(
  prisma: PrismaClient,
  input: CadastrarContratoInput
): Promise<{ readonly contratoId: string }> {
  const dados = zCadastrarContratoInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.cadastrarContrato, "ENTE");

    // (a) O PROCESSO EXISTE E ESTÁ HOMOLOGADO — derivado do FATO (a data), nunca
    //     de flag. Contratar sobre processo não homologado é assinar antes de
    //     poder assinar.
    const processo = await tx.processoLicitatorio.findUnique({
      where: { id: dados.processoId },
      select: {
        id: true,
        numeroProcesso: true,
        modalidade: true,
        hipoteseDispensa: true,
      },
    });
    if (processo === null) {
      throw new Error(`Processo licitatório ${dados.processoId} não existe.`);
    }

    // A leitura é UMA (cadastro ?? evento) — o serviço não sabe, e não precisa
    // saber, por qual das duas portas a homologação entrou.
    const homologacao = await homologadoEm(tx, dados.processoId);
    if (situacaoDoProcesso(homologacao) !== "HOMOLOGADO") {
      throw new Error(
        `PROCESSO NÃO HOMOLOGADO: o processo ${processo.numeroProcesso} não tem ` +
          `homologação — nem no cadastro, nem como evento. Sem homologação não há ` +
          `o que contratar. Homologue antes de assinar o contrato.`
      );
    }

    // (b) A VIGÊNCIA NÃO COMEÇA ANTES DA HOMOLOGAÇÃO.
    if (dados.vigenciaInicio < homologacao!) {
      throw new Error(
        `VIGÊNCIA ANTERIOR À HOMOLOGAÇÃO: o contrato começa a valer em ` +
          `${dados.vigenciaInicio.toISOString()}, mas o processo ` +
          `${processo.numeroProcesso} só foi homologado em ` +
          `${homologacao!.toISOString()}. O contrato não pode produzir efeito ` +
          `antes de existir o direito de contratar.`
      );
    }

    // (c) A VIGÊNCIA TEM DE TER DURAÇÃO.
    if (dados.vigenciaFimInicial <= dados.vigenciaInicio) {
      throw new Error(
        `VIGÊNCIA INVERTIDA: fim ${dados.vigenciaFimInicial.toISOString()} não é ` +
          `posterior ao início ${dados.vigenciaInicio.toISOString()}.`
      );
    }

    // ═══ (d) O TETO DA DISPENSA POR VALOR — TR 5.106, art. 75 ═══
    // O limite é o VIGENTE NA DATA DO CONTRATO (a data do fato), e o valor testado
    // é o valorAtualizado — que no cadastro é o inicial (não há aditivo ainda).
    if (processo.modalidade === "DISPENSA") {
      await exigirTetoDaDispensa(tx, {
        // O CHECK do banco garante que dispensa TEM hipótese.
        hipotese: processo.hipoteseDispensa!,
        data: dados.vigenciaInicio,
        valor: dados.valorInicial,
        identificacao: `o contrato ${dados.numeroContrato} (processo ${processo.numeroProcesso})`,
      });
    }

    const criado = await tx.contrato.create({
      data: {
        numeroContrato: dados.numeroContrato,
        processoId: dados.processoId,
        contratadoDocumento: dados.contratadoDocumento,
        contratadoNome: dados.contratadoNome,
        valorInicial: dados.valorInicial.toFixed(2),
        vigenciaInicio: dados.vigenciaInicio,
        vigenciaFimInicial: dados.vigenciaFimInicial,
        categoriaOrdemCronologica: dados.categoriaOrdemCronologica,
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });
    return { contratoId: criado.id };
  });
}

/**
 * REGISTRAR ADITIVO — acréscimo, supressão ou prorrogação.
 *
 * ═══ PENDÊNCIA DECLARADA: OS LIMITES DO ART. 125 (25% / 50%) ═══
 * A Lei 14.133, art. 125, limita acréscimos e supressões a 25% do valor inicial
 * (50% para reforma de edifício/equipamento). NÃO validamos isso aqui, e é
 * decisão consciente: o limite tem EXCEÇÕES (o § do próprio artigo, e o acordo
 * das partes para supressão), e a base de cálculo é o valor inicial ATUALIZADO
 * por reajuste — que este módulo ainda não modela. Uma "meia-regra" escrita de
 * memória barraria aditivos legítimos e deixaria passar os ilegais com a mesma
 * convicção. Fica registrado no MODULO.md; entra quando a regra vier inteira.
 */
export async function registrarAditivo(
  prisma: PrismaClient,
  input: RegistrarAditivoInput
): Promise<{ readonly movimentoId: string }> {
  const dados = zRegistrarAditivoInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.registrarAditivo, "ENTE");

    const contrato = await exigirContrato(tx, dados.contratoId);

    if (dados.tipo === "SUPRESSAO_VALOR") {
      const valor = dados.valor!; // o Zod já garantiu (XOR)

      // ⚠️ NÃO SE SUPRIME O QUE JÁ SE EMPENHOU.
      // As duas formas do guard — `valor <= saldo` e `valorAtualizado − valor >=
      // empenhado` — são a MESMA desigualdade (saldo = valorAtualizado −
      // empenhado). Escrevê-la duas vezes daria dois lugares para ela divergir;
      // está escrita UMA, e a mensagem mostra as três parcelas.
      const [atual, empenhado] = await Promise.all([
        valorAtualizadoDoContrato(tx, dados.contratoId),
        empenhadoLiquidoDoContrato(tx, dados.contratoId),
      ]);
      const saldo = toMoney(atual.minus(empenhado));

      if (valor.greaterThan(saldo)) {
        throw new Error(
          `SUPRESSÃO MAIOR QUE O SALDO do contrato ${contrato.numeroContrato}: ` +
            `suprimir ${valor.toFixed(2)} deixaria o contrato valendo ` +
            `${atual.minus(valor).toFixed(2)}, abaixo do que já foi empenhado ` +
            `(${empenhado.toFixed(2)}). Valor atual ${atual.toFixed(2)}, saldo ` +
            `disponível ${saldo.toFixed(2)}. Anule os empenhos antes de suprimir.`
        );
      }
    }

    // ═══ O TETO DA DISPENSA, NO ADITIVO — TR 5.106 ═══
    // Um acréscimo não pode levar o contrato de dispensa por valor a ALCANÇAR o
    // teto: seria licitar por fatiamento (dispensa hoje, aditivo amanhã). O limite
    // é o VIGENTE NA DATA DO ADITIVO — o fato é de lá, e é por lá que se julga.
    if (dados.tipo === "ACRESCIMO_VALOR") {
      const processo = await tx.processoLicitatorio.findFirstOrThrow({
        where: { contratos: { some: { id: dados.contratoId } } },
        select: { numeroProcesso: true, modalidade: true, hipoteseDispensa: true },
      });
      if (processo.modalidade === "DISPENSA") {
        const depois = toMoney(
          (await valorAtualizadoDoContrato(tx, dados.contratoId)).plus(
            dados.valor!
          )
        );
        await exigirTetoDaDispensa(tx, {
          hipotese: processo.hipoteseDispensa!,
          data: dados.data,
          valor: depois,
          identificacao:
            `o aditivo ${dados.numeroAditivo} do contrato ` +
            `${contrato.numeroContrato} (que ficaria em ${depois.toFixed(2)})`,
        });
      }
    }

    const criado = await tx.movimentoContratual.create({
      data: {
        contratoId: dados.contratoId,
        tipo: dados.tipo,
        valor: dados.valor === undefined ? null : dados.valor.toFixed(2),
        dias: dados.dias ?? null,
        data: dados.data,
        numeroAditivo: dados.numeroAditivo,
        motivo: dados.motivo,
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });
    return { movimentoId: criado.id };
  });
}

/**
 * ESTORNAR MOVIMENTO CONTRATUAL — simétrico, e no mesmo commit dos originais.
 *
 * O estorno é um MOVIMENTO NOVO, com o tipo espelhado e o MESMO valor/dias na
 * mesma dimensão. Nada é apagado: o aditivo errado continua na base, com o
 * estorno pendurado nele — que é o que o TCE precisa ver.
 */
export async function estornarMovimentoContratual(
  prisma: PrismaClient,
  input: EstornarMovimentoContratualInput
): Promise<{ readonly movimentoId: string }> {
  const dados = zEstornarMovimentoContratualInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.estornarMovimentoContratual, "ENTE");

    const original = await tx.movimentoContratual.findUnique({
      where: { id: dados.movimentoId },
      select: {
        id: true,
        contratoId: true,
        tipo: true,
        valor: true,
        dias: true,
        numeroAditivo: true,
        // "Já estornado?" é DERIVADO — nunca uma flag.
        estornos: { select: { id: true } },
      },
    });
    if (original === null) {
      throw new Error(`Movimento contratual ${dados.movimentoId} não existe.`);
    }

    // Estorno de estorno: o Record devolve null e a função lança.
    const tipo = tipoDoEstorno(original.tipo);

    if (original.estornos.length > 0) {
      throw new Error(
        `Movimento contratual ${original.id} (aditivo ` +
          `${original.numeroAditivo}) JÁ FOI ESTORNADO. Estornar duas vezes ` +
          `devolveria o valor em dobro — o contrato passaria a valer menos do ` +
          `que valia antes do aditivo.`
      );
    }

    // As pernas do original, preservadas: o estorno desfaz EXATAMENTE o que foi
    // feito. Copiar valor/dias (em vez de recebê-los na entrada) é o que impede
    // um "estorno" de 10.000 desfazer um acréscimo de 20.000.
    const criado = await tx.movimentoContratual.create({
      data: {
        contratoId: original.contratoId,
        tipo,
        valor: original.valor === null ? null : original.valor.toFixed(2),
        dias: original.dias,
        data: dados.data,
        numeroAditivo: original.numeroAditivo,
        estornoDeId: original.id,
        motivo: dados.motivo,
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });
    return { movimentoId: criado.id };
  });
}
