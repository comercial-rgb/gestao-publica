import { cliente, PortaSemBancoError } from "./cliente";
import { exigirSessao } from "./sessao";
import { serializar, toMoney, type Money } from "../../packages/contracts/index.js";
import { conciliacaoBancaria } from "../../modules/m09-tesouraria/conciliacao";
import type { TipoInternoConciliacao } from "../../modules/m09-tesouraria/dominio";
import type { TipoMovimentoBancario } from "../../prisma/generated/client/client";
import { estadoDoModoBb, mascararAgencia, mascararConta } from "../../modules/m17-banco-bb/modos";
import { mascararCpfCnpj } from "../format/mascaras";

/**
 * PORTA — CONCILIAÇÃO BANCÁRIA (M09 bloco 3 + M17-a). SÓ LEITURA.
 *
 * ═══ POR QUE ESTA PORTA EXISTE ═══
 * O MOTOR já existia e já estava testado (`modules/m09-tesouraria/conciliacao.ts`,
 * `m09-conciliacao.test.ts`): ele responde "o banco e o razão contam a mesma história? se não,
 * ONDE?". O que NÃO existia era o caminho da tela até ele — a Central de Integrações mostrava o
 * card do Banco do Brasil sem ação, e o hub do Financeiro mandava o usuário para a Central. Um
 * anel: dois links que se apontam e nenhum que chega ao número. Esta porta fecha o anel.
 *
 * ═══ O QUE O MOTOR DÁ E O QUE ELE NÃO DÁ ═══
 * `conciliacaoBancaria` devolve os SALDOS (extrato × contábil), a DIFERENÇA e as PENDÊNCIAS dos
 * dois lados — mas não devolve as CORRESPONDÊNCIAS (o que já casou), porque o relatório contábil
 * só precisa nomear o que NÃO casou. A tela precisa do outro lado da mesma moeda: mostrar o
 * pagamento ao lado da linha do extrato que o explica. Essa parte é leitura direta dos
 * `VinculoConciliacao` — o mesmo dado append-only de onde o motor tira os residuais, lido pelo
 * outro ângulo. Nenhuma aritmética nova: o vínculo JÁ carrega o valor conciliado.
 *
 * ═══ ⚠️ MASCARAMENTO ACONTECE AQUI, NÃO NA TELA (DIRETIVA §4) ═══
 * Agência e conta saem desta porta JÁ MASCARADAS. A alternativa — devolver o dado cru e mascarar
 * no JSX — deixaria o número completo atravessar a fronteira e ir parar no payload RSC que o
 * navegador recebe; a máscara seria cosmética. Mascarando na porta, o dado cru nunca sai do
 * servidor. As funções são as do M17 (`mascararAgencia`/`mascararConta`), as MESMAS que o log da
 * integração usa — uma fonte só para "o que se pode mostrar".
 *
 * ⚠️ DINHEIRO ATRAVESSA COMO STRING DECIMAL. Toda soma daqui usa `toMoney`/`serializar`
 * (a aritmética Decimal do domínio), nunca `number`.
 */

export { PortaSemBancoError };

/** O MODO da integração — o que o badge da tela mostra. O modo exibido é o modo que executa. */
export interface ModoIntegracaoBb {
  readonly modo: string;
  readonly estado: string;
  readonly mensagem: string;
  /** O estado de LIVE (produção), que nesta missão é BLOQUEADO — dito, não escondido. */
  readonly live: string;
}

export interface ContaConciliada {
  readonly codigo: string;
  readonly descricao: string;
  /** Código FEBRABAN (3 dígitos). "001" = Banco do Brasil. */
  readonly banco: string | null;
  /** ⚠️ JÁ MASCARADA — o dado cru não atravessa esta fronteira. */
  readonly agenciaMascarada: string;
  /** ⚠️ JÁ MASCARADA — idem. */
  readonly contaMascarada: string;
  /** A conta do PCASP contra a qual o extrato tem de fechar (sem ela não há conciliação). */
  readonly contaContabil: string;
}

export interface ExtratoImportado {
  /** `API_BB` = veio da API do Banco do Brasil; `OFX` = veio de arquivo. */
  readonly origem: "OFX" | "API_BB";
  readonly periodoInicio: Date;
  readonly periodoFim: Date;
  readonly importadoPor: string;
  readonly importadoEm: Date;
  /** sha256 da origem — a prova de idempotência do import (reimportar o mesmo período é no-op). */
  readonly hashOrigem: string;
  readonly quantidadeLinhas: number;
}

/** Um lado da correspondência: a linha do extrato (o que o BANCO disse). */
export interface LadoExtrato {
  readonly fitid: string;
  readonly data: Date;
  /** SEMPRE positivo — o sinal está na `natureza`. */
  readonly valor: string;
  readonly natureza: "CREDITO" | "DEBITO";
  readonly memo: string;
  readonly documento: string | null;
}

/** O outro lado: o fato do sistema (pagamento, arrecadação, movimento extraorçamentário). */
export interface LadoInterno {
  /**
   * ⚠️ O TIPO VEM DO DOMÍNIO, e não é mais recopiado aqui.
   *
   * Esta união era escrita à mão, com três membros. Quando o M09 ganhou
   * `MOVIMENTO_BANCARIO` e `TRANSFERENCIA`, a cópia ficou para trás — e o compilador
   * pegou, mas só porque a origem é um tipo. Se fosse `string`, a tela teria passado a
   * receber dois tipos que ela não sabe desenhar, em silêncio.
   */
  readonly tipo: TipoInternoConciliacao;
  /** "Pagamento nº 1", "Arrecadação nº 7"… — o documento como o usuário o chama. */
  readonly rotulo: string;
  readonly data: Date;
  readonly valor: string;
  /** Contexto de drill: empenho de origem, credor mascarado, consignatário. `null` quando não há. */
  readonly detalhe: string | null;
}

/** PAGAMENTO × LANÇAMENTO DO EXTRATO — o que já casou, com valor e data DOS DOIS LADOS. */
export interface Correspondencia {
  readonly vinculoId: string;
  readonly extrato: LadoExtrato;
  readonly interno: LadoInterno;
  /** O valor CONCILIADO. Pode ser menor que os dois lados: parcial é legítimo (1-N dos dois lados). */
  readonly valorConciliado: string;
  readonly conciliadoEm: Date;
  readonly conciliadoPor: string;
}

/** No BANCO e não no razão (tarifa não contabilizada, crédito ainda não registrado). */
export interface PendenciaExtrato {
  readonly data: Date;
  readonly descricao: string;
  /** RESIDUAL COM SINAL: positivo = entrou, negativo = saiu. */
  readonly residual: string;
}

/** No RAZÃO e não no banco (cheque não compensado, depósito não creditado). */
export interface PendenciaInterna extends PendenciaExtrato {
  readonly tipo: TipoInternoConciliacao;
}

/**
 * O RESUMO QUE FECHA. A identidade é do motor e é AUTO-EXECUTÁVEL:
 *
 *     saldoExtrato − saldoContábil == Σresidual(extrato) − Σresidual(interno)
 *
 * Ela vale porque cada vínculo aparece dos DOIS lados com o mesmo valor e o mesmo sinal: os
 * vínculos se cancelam e sobra exatamente a diferença de saldos. Se ela não fechasse, o motor
 * teria LANÇADO em vez de devolver — a conciliação não sai com diferença sem nome. Esta porta
 * repassa os números para que a tela mostre a conta sendo feita, não só o resultado.
 */
export interface ResumoConciliacao {
  readonly saldoExtrato: string;
  readonly saldoContabil: string;
  readonly diferenca: string;
  readonly totalPendenteExtrato: string;
  readonly totalPendenteInterno: string;
  /** `Σresidual(extrato) − Σresidual(interno)` — tem de ser IGUAL a `diferenca`. */
  readonly diferencaExplicada: string;
  /** Σ dos vínculos vivos — quanto do extrato já tem fato interno correspondente. */
  readonly totalConciliado: string;
}

export interface PainelConciliacao {
  readonly modo: ModoIntegracaoBb;
  readonly conta: ContaConciliada;
  readonly extrato: ExtratoImportado;
  /** A data de corte do relatório = fim do período do extrato. */
  readonly corte: Date;
  readonly correspondencias: readonly Correspondencia[];
  readonly pendenciasExtrato: readonly PendenciaExtrato[];
  readonly pendenciasInternas: readonly PendenciaInterna[];
  readonly resumo: ResumoConciliacao;
}

/** Agência/conta com o dígito verificador junto — e SEMPRE mascaradas. */
function identificacaoMascarada(c: {
  agencia: string | null;
  digitoAgencia: string | null;
  conta: string | null;
  digitoConta: string | null;
}): { agencia: string; conta: string } {
  const dv = (d: string | null): string => (d !== null && d !== "" ? `-${d}` : "");
  return {
    agencia: `${mascararAgencia(c.agencia)}${dv(c.digitoAgencia)}`,
    conta: `${mascararConta(c.conta)}${dv(c.digitoConta)}`,
  };
}

const zero = (): Money => toMoney("0.00");

/**
 * O PAINEL DE UMA CONTA, no exercício pedido.
 *
 * ⚠️ A CONTA É ESCOLHIDA PELO EXTRATO, não o contrário: conciliar é confrontar um extrato com o
 * razão, e sem extrato importado não há o que confrontar. Pegamos o extrato mais recente do
 * exercício — na massa POC é o do Banco do Brasil (origem API_BB) da conta A. Sem extrato no
 * exercício, devolvemos `null` e a tela diz isso com todas as letras, em vez de mostrar uma
 * conciliação vazia que pareceria "tudo conciliado".
 */
export async function lerPainelConciliacao(p: {
  readonly exercicio: number;
}): Promise<PainelConciliacao | null> {
  await exigirSessao();
  const prisma = cliente();

  // O recorte do exercício é pelo FIM do período: um extrato é do ano em que ele fecha.
  const inicioDoAno = new Date(Date.UTC(p.exercicio, 0, 1));
  const inicioDoAnoSeguinte = new Date(Date.UTC(p.exercicio + 1, 0, 1));

  const extrato = await prisma.extratoBancario.findFirst({
    where: { periodoFim: { gte: inicioDoAno, lt: inicioDoAnoSeguinte } },
    orderBy: [{ periodoFim: "desc" }, { criadoEm: "desc" }],
    select: {
      id: true,
      origem: true,
      periodoInicio: true,
      periodoFim: true,
      importadoPor: true,
      criadoEm: true,
      arquivoHash: true,
      contaBancaria: {
        select: {
          id: true, codigo: true, descricao: true, banco: true,
          agencia: true, digitoAgencia: true, conta: true, digitoConta: true,
          contaContabil: { select: { codigo: true } },
        },
      },
      _count: { select: { lancamentos: true } },
    },
  });
  if (extrato === null) return null;

  const conta = extrato.contaBancaria;
  const corte = extrato.periodoFim;

  // ── O MOTOR (M09 bloco 3): saldos, diferença e pendências dos dois lados ──
  // Ele é FAIL-CLOSED: se a diferença não estivesse toda nomeada, ele lança — e a tela mostra o
  // erro nomeado em vez de um relatório que não fecha. É de propósito.
  const relatorio = await conciliacaoBancaria(prisma, conta.id, corte);

  // ── AS CORRESPONDÊNCIAS — os vínculos VIVOS desta conta até o corte ──
  // "Vivo" é DERIVADO, nunca flag: um vínculo estornado tem `estornos` preenchido (append-only,
  // M09). Filtrar por `estornos: { none: {} }` é a mesma leitura que o `vinculoLiquido` faz com
  // os sinais — aqui em forma de lista, para a tela poder exibir cada par.
  const vinculos = await prisma.vinculoConciliacao.findMany({
    where: {
      tipo: "VINCULO",
      estornos: { none: {} },
      criadoEm: { lte: corte },
      lancamentoExtrato: { contaBancariaId: conta.id },
    },
    orderBy: { criadoEm: "asc" },
    select: {
      id: true, valor: true, tipoInterno: true, internoId: true,
      criadoEm: true, criadoPor: true,
      lancamentoExtrato: {
        select: { fitid: true, dataPostagem: true, valor: true, natureza: true, memo: true, documento: true },
      },
    },
  });

  const correspondencias: Correspondencia[] = [];
  let totalConciliado = zero();
  for (const v of vinculos) {
    const interno = await resolverInterno(prisma, v.tipoInterno, v.internoId);
    if (interno === null) continue; // o fato sumiu do banco: não inventamos um lado.
    totalConciliado = toMoney(totalConciliado.plus(toMoney(v.valor.toFixed(2))));
    correspondencias.push({
      vinculoId: v.id,
      extrato: {
        fitid: v.lancamentoExtrato.fitid,
        data: v.lancamentoExtrato.dataPostagem,
        valor: v.lancamentoExtrato.valor.toFixed(2),
        natureza: v.lancamentoExtrato.natureza,
        memo: v.lancamentoExtrato.memo,
        documento: v.lancamentoExtrato.documento,
      },
      interno,
      valorConciliado: v.valor.toFixed(2),
      conciliadoEm: v.criadoEm,
      conciliadoPor: v.criadoPor,
    });
  }

  // Σ dos residuais de cada lado — a conta que o motor já provou (ele lança se não bater).
  const somar = (linhas: readonly { residual: string }[]): Money =>
    linhas.reduce((acc, l) => toMoney(acc.plus(toMoney(l.residual))), zero());
  const pendExtrato = somar(relatorio.noExtratoSemVinculo);
  const pendInterno = somar(relatorio.internoSemVinculo);

  const ident = identificacaoMascarada(conta);
  const mock = estadoDoModoBb("MOCK");
  const live = estadoDoModoBb("LIVE");

  return {
    modo: { modo: mock.modo, estado: mock.estado, mensagem: mock.mensagem, live: live.mensagem },
    conta: {
      codigo: conta.codigo,
      descricao: conta.descricao,
      banco: conta.banco,
      agenciaMascarada: ident.agencia,
      contaMascarada: ident.conta,
      // O motor já falhou nomeando se o mapeamento faltasse — aqui ele existe.
      contaContabil: conta.contaContabil?.codigo ?? relatorio.contaBancaria.contaContabil,
    },
    extrato: {
      origem: extrato.origem,
      periodoInicio: extrato.periodoInicio,
      periodoFim: extrato.periodoFim,
      importadoPor: extrato.importadoPor,
      importadoEm: extrato.criadoEm,
      hashOrigem: extrato.arquivoHash,
      quantidadeLinhas: extrato._count.lancamentos,
    },
    corte,
    correspondencias,
    pendenciasExtrato: relatorio.noExtratoSemVinculo.map((l) => ({
      data: l.data, descricao: l.descricao, residual: l.residual,
    })),
    pendenciasInternas: relatorio.internoSemVinculo.map((l) => ({
      tipo: l.tipoInterno, data: l.data, descricao: l.descricao, residual: l.residual,
    })),
    resumo: {
      saldoExtrato: relatorio.saldoExtrato,
      saldoContabil: relatorio.saldoContabil,
      diferenca: relatorio.diferenca,
      totalPendenteExtrato: serializar(pendExtrato),
      totalPendenteInterno: serializar(pendInterno),
      diferencaExplicada: serializar(toMoney(pendExtrato.minus(pendInterno))),
      totalConciliado: serializar(totalConciliado),
    },
  };
}

/**
 * O LADO INTERNO de um vínculo — três tabelas (M05, M04, M07), resolvidas pelo `tipoInterno`.
 * São três porque o vínculo aponta para as três; um `switch` exaustivo é o que o modelo pede
 * (`internoId` é String, não FK — ver o comentário do schema M09).
 */
async function resolverInterno(
  prisma: ReturnType<typeof cliente>,
  tipo: TipoInternoConciliacao,
  id: string
): Promise<LadoInterno | null> {
  switch (tipo) {
    case "PAGAMENTO": {
      const pg = await prisma.pagamento.findUnique({
        where: { id },
        select: {
          numero: true, valor: true, data: true,
          liquidacao: { select: { numero: true, empenho: { select: { numero: true, credorCpfCnpj: true, historico: true } } } },
        },
      });
      if (pg === null) return null;
      const emp = pg.liquidacao.empenho;
      return {
        tipo,
        rotulo: `Pagamento nº ${pg.numero}`,
        data: pg.data,
        valor: pg.valor.toFixed(2),
        // O CPF/CNPJ sai FORMATADO (máscara BR de apresentação, `lib/format/mascaras.ts`) — é dado
        // público do credor no empenho, ao contrário de agência/conta, que saem OCULTADAS.
        detalhe: `Empenho ${emp.numero} · liquidação ${pg.liquidacao.numero} · credor ${mascararCpfCnpj(emp.credorCpfCnpj)} — ${emp.historico}`,
      };
    }
    case "ARRECADACAO": {
      const ar = await prisma.receitaArrecadada.findUnique({
        where: { id },
        select: { numeroReceita: true, valor: true, dataArrecadacao: true, fonte: { select: { codigo: true, descricao: true } } },
      });
      if (ar === null) return null;
      return {
        tipo,
        rotulo: `Arrecadação nº ${ar.numeroReceita}`,
        data: ar.dataArrecadacao,
        valor: ar.valor.toFixed(2),
        detalhe: `Fonte ${ar.fonte.codigo} — ${ar.fonte.descricao}`,
      };
    }
    case "MOVIMENTO_EXTRA": {
      const mv = await prisma.movimentoExtraorcamentario.findUnique({
        where: { id },
        select: { tipo: true, valor: true, data: true, credorConsignatario: true, tipoConsignacao: { select: { codigo: true, descricao: true } } },
      });
      if (mv === null) return null;
      return {
        tipo,
        rotulo: `${mv.tipo === "INGRESSO" ? "Ingresso" : "Dispêndio"} extraorçamentário ${mv.tipoConsignacao.codigo}`,
        data: mv.data,
        valor: mv.valor.toFixed(2),
        detalhe: `${mv.tipoConsignacao.descricao} · ${mv.credorConsignatario}`,
      };
    }
    // ── M09, TR 5.62 ────────────────────────────────────────────────────────
    case "MOVIMENTO_BANCARIO": {
      const mb = await prisma.movimentoBancario.findUnique({
        where: { id },
        select: {
          tipo: true, valor: true, data: true, historico: true,
          contaBancaria: { select: { codigo: true, descricao: true } },
        },
      });
      if (mb === null) return null;
      return {
        tipo,
        rotulo: `${ROTULO_MOVIMENTO_BANCARIO[mb.tipo]} — conta ${mb.contaBancaria.codigo}`,
        data: mb.data,
        valor: mb.valor.toFixed(2),
        detalhe: `${mb.contaBancaria.descricao} · ${mb.historico}`,
      };
    }
    // ── M09, TR 5.61 ────────────────────────────────────────────────────────
    case "TRANSFERENCIA": {
      const tr = await prisma.transferenciaEntreContas.findUnique({
        where: { id },
        select: {
          codigo: true, valor: true, data: true, historico: true,
          contaOrigem: { select: { codigo: true } },
          contaDestino: { select: { codigo: true } },
        },
      });
      if (tr === null) return null;
      return {
        tipo,
        rotulo: `Transferência nº ${tr.codigo}`,
        data: tr.data,
        valor: tr.valor.toFixed(2),
        detalhe:
          `De ${tr.contaOrigem.codigo} para ${tr.contaDestino.codigo} · ${tr.historico}`,
      };
    }
  }
}

/**
 * O rótulo de cada tipo na TELA. Record exaustivo — um tipo novo não compila até
 * alguém escrever como ele se chama para quem lê, em vez de vazar o nome do enum.
 */
const ROTULO_MOVIMENTO_BANCARIO: Record<TipoMovimentoBancario, string> = {
  DEPOSITO: "Depósito",
  SAQUE: "Saque",
  APLICACAO: "Aplicação financeira",
  RESGATE: "Resgate de aplicação",
  RENDIMENTO: "Rendimento creditado",
  TARIFA: "Tarifa bancária",
};
