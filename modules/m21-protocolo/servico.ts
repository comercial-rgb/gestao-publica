import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { AtoInelegivelError, exigirElegivel } from "../../packages/contracts/index.js";
import { diaCivil } from "../../packages/datas/index.js";
import { pessoaDoUsuario } from "../m16-travamento/servico-pessoa-do-usuario.js";
import { zAlterarPessoa } from "../m19-pessoas/dominio.js";
import { representacaoVigenteEm, representacoesVigentesDoUsuario } from "../m19-pessoas/representacao.js";
import { gravarAnexoNaTransacao } from "../m22-documentos/anexos.js";
import { recusaDoArquivo } from "../m22-documentos/armazenamento.js";
import {
  elegibilidadeParaDecidir,
  elegibilidadeParaEmitirExigencia,
  elegibilidadeParaResponderExigencia,
  errosDosCampos,
  exigeContaPorNatureza,
  textoDeAbertura,
  validarRespostas,
  type CampoDoFormulario,
  type EstadoDaSolicitacao as EstadoDaSolicitacaoDaCarta,
} from "./carta.js";
import { travar } from "../../packages/locks/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO, type AcaoDoSistema } from "../m16-travamento/acoes.js";
import { podeAgirNoSetor } from "./escopo-do-protocolo.js";
import type { Tx } from "../m16-travamento/autorizacao.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { notificarVarios } from "../m24-notificacoes/notificacoes.js";
import {
  apensosDe,
  codigoVerificador,
  descreverSituacao,
  estaFechado,
  movimentosVigentes,
  principalDoApenso,
  situacaoDaTaxa,
  situacaoDoProcesso,
  setorAtual,
  zAbrirProcesso,
  zApensar,
  zArquivar,
  zAtenderReadequacao,
  zComplementar,
  zDesapensar,
  zEncerrar,
  zReabrir,
  zReceber,
  zResponderParecer,
  zSolicitarParecer,
  zSolicitarReadequacao,
  zTornarMovimentoSemEfeito,
  zTramitar,
  type AbrirProcessoInput,
  type ApensarInput,
  type ArquivarInput,
  type AtenderReadequacaoInput,
  type ComplementarInput,
  type DesapensarInput,
  type EncerrarInput,
  type MovimentoParaDerivar,
  type ReabrirInput,
  type ReceberInput,
  type ResponderParecerInput,
  type SolicitarParecerInput,
  type SolicitarReadequacaoInput,
  type TornarMovimentoSemEfeitoInput,
  type TramitarInput,
} from "./dominio.js";

/**
 * M21 — OS CASOS DE USO DO PROCESSO DIGITAL.
 *
 * ═══ ⚠️ TODO GUARD DESTE ARQUIVO MORA DENTRO DA TRANSAÇÃO ═══
 * Situação fechada, taxa em aberto, lotação, sigilo: nada disso é verificado na tela.
 * A tela esconde o botão porque é gentil; o servidor recusa porque é obrigação. O
 * catálogo é explícito quanto ao bloqueio por taxa ("o bloqueio deve existir no caso
 * de uso, não apenas no botão"), e a mesma regra vale para os outros.
 *
 * ═══ ⚠️ O APENSO SEGUE O PRINCIPAL — DE VERDADE ═══
 * Quando um processo tem apensos vigentes, os movimentos de TRAMITAÇÃO são gravados
 * também para eles, na mesma transação. Um apensamento que só desenha um vínculo na
 * tela é um rótulo: o catálogo pede que "ambos sigam as mesmas movimentações".
 */

// ═══════════════════════════════════════════════════════════════════════════
// OS HELPERS — privados. Nenhum é `export async function`: eles não são atos.
// ═══════════════════════════════════════════════════════════════════════════

const MOVIMENTO_PARA_DERIVAR = {
  select: {
    id: true,
    tipo: true,
    setorOrigemId: true,
    setorDestinoId: true,
    respondeAId: true,
    tornaSemEfeitoId: true,
    criadoEm: true,
  },
} as const;

interface ProcessoCarregado {
  readonly id: string;
  readonly numero: number;
  readonly ano: number;
  readonly sigiloso: boolean;
  readonly setorAberturaId: string;
  readonly criadoPor: string;
  readonly requerenteId: string | null;
  readonly codigoVerificador: string;
  readonly assunto: {
    readonly id: string;
    readonly nome: string;
    readonly bloqueiaTramiteComTaxaAberta: boolean;
  };
  readonly movimentos: readonly MovimentoParaDerivar[];
}

async function carregar(tx: Tx, processoId: string): Promise<ProcessoCarregado> {
  const p = await tx.processo.findUnique({
    where: { id: processoId },
    select: {
      id: true,
      numero: true,
      sigiloso: true,
      setorAberturaId: true,
      criadoPor: true,
      requerenteId: true,
      codigoVerificador: true,
      exercicio: { select: { ano: true } },
      assunto: {
        select: { id: true, nome: true, bloqueiaTramiteComTaxaAberta: true },
      },
      movimentos: MOVIMENTO_PARA_DERIVAR,
    },
  });

  if (p === null) {
    throw new Error(
      `Processo ${processoId} não encontrado. Nada foi gravado.`
    );
  }
  return { ...p, ano: p.exercicio.ano };
}

/** O rótulo humano do processo, para as mensagens: "12/2026". */
function rotulo(p: { readonly numero: number; readonly ano: number }): string {
  return `${p.numero}/${p.ano}`;
}

/**
 * O PROCESSO ACEITA MOVIMENTO? — e a mensagem nomeia a situação e o caminho de volta.
 *
 * ⚠️ "PROCESSO ENCERRADO" SEM DIZER O QUE FAZER é a mensagem que gera chamado. Quem
 * lê precisa saber que existe reabertura e que ela é registrada.
 */
function exigirAberto(p: ProcessoCarregado, oQue: string): void {
  const situacao = situacaoDoProcesso(p.movimentos);
  if (!estaFechado(situacao)) return;
  throw new Error(
    `O processo ${rotulo(p)} está ${descreverSituacao(situacao).toUpperCase()} e não ` +
      `aceita ${oQue}. Para voltar a movimentá-lo, REABRA — a reabertura é um movimento ` +
      `registrado, com autor, hora e motivo. Nada foi gravado.`
  );
}

/**
 * O USUÁRIO ESTÁ LOTADO NESTE SETOR? — a pergunta "de qual mesa ele despacha".
 *
 * ⚠️ ELA NÃO SUBSTITUI A AUTORIZAÇÃO, ela se SOMA a ela. O M16 responde "ele pode
 * tramitar nesta unidade gestora?"; esta responde "o documento está na mesa dele?".
 * Um sistema que só perguntasse a primeira deixaria o servidor do Almoxarifado
 * despachar um processo que está no Gabinete — as duas salas são da mesma UG.
 */
async function exigirLotacao(
  tx: Tx,
  identificador: string,
  setorId: string,
  oQue: string,
  /** A ação DO ATO: só ela, concedida no ente, dispensa a lotação — e nunca sobre sigiloso. */
  acao: AcaoDoSistema,
  sigiloso = false
): Promise<void> {
  if (await podeAgirNoSetor(tx, identificador, setorId, acao, sigiloso)) return;

  const setor = await tx.setor.findUnique({
    where: { id: setorId },
    select: { codigo: true, nome: true },
  });
  throw new Error(
    `LOTAÇÃO: "${identificador}" não está lotado no setor ` +
      `${setor?.codigo ?? setorId} (${setor?.nome ?? "?"}) e por isso não pode ${oQue}. ` +
      `O processo está NESTE setor — quem o despacha é quem trabalha nele. Peça a ` +
      `lotação, ou tramite a partir do setor onde você está. Nada foi gravado.`
  );
}

/** O setor tem de existir e estar ativo — e a mensagem diz qual dos dois falhou. */
async function exigirSetorAtivo(tx: Tx, setorId: string): Promise<{ codigo: string; nome: string }> {
  const s = await tx.setor.findUnique({
    where: { id: setorId },
    select: { codigo: true, nome: true, ativo: true },
  });
  if (s === null) throw new Error(`Setor ${setorId} não existe. Nada foi gravado.`);
  if (!s.ativo) {
    throw new Error(
      `O setor ${s.codigo} (${s.nome}) está DESATIVADO e não recebe processo. Um setor ` +
        `desativado continua no histórico do que já passou por ele — o que ele não faz ` +
        `é receber trabalho novo. Nada foi gravado.`
    );
  }
  return { codigo: s.codigo, nome: s.nome };
}

/**
 * O BLOQUEIO POR TAXA EM ABERTO. Configuração do ASSUNTO, verificada aqui.
 *
 * ⚠️ ELE RODA NA TRAMITAÇÃO, NÃO NA ABERTURA. Bloquear a abertura seria impedir o
 * cidadão de protocolar antes de pagar — e a guia costuma nascer DO processo. O que a
 * entidade quer travar é o andamento, e é o andamento que trava.
 */
async function exigirTaxasEmDia(tx: Tx, p: ProcessoCarregado): Promise<void> {
  if (!p.assunto.bloqueiaTramiteComTaxaAberta) return;

  const taxas = await tx.taxaDoProcesso.findMany({
    where: { processoId: p.id },
    select: {
      descricao: true,
      valor: true,
      vencimento: true,
      movimentos: { select: { tipo: true, criadoEm: true } },
    },
  });

  const abertas = taxas.filter((t) => situacaoDaTaxa(t.movimentos) === "EM_ABERTO");
  if (abertas.length === 0) return;

  const lista = abertas
    .map((t) => `  · ${t.descricao} — R$ ${t.valor.toFixed(2)}`)
    .join("\n");
  throw new Error(
    `TAXA EM ABERTO: o processo ${rotulo(p)} tem ${abertas.length} taxa(s) não ` +
      `quitada(s), e o assunto "${p.assunto.nome}" bloqueia a tramitação nesse caso.\n` +
      `${lista}\n` +
      `Quite ou cancele a taxa para movimentar o processo. Nada foi gravado.`
  );
}

/**
 * OS PROCESSOS QUE ANDAM JUNTOS: este e os apensos VIGENTES dele.
 *
 * ⚠️ UM PROCESSO APENSADO NÃO ANDA SOZINHO. Tramitar o apenso diretamente
 * dessincronizaria o par — e é por isso que os serviços recusam movimentar um apenso
 * por fora, em vez de aceitar em silêncio.
 */
async function alvosDaMovimentacao(tx: Tx, processoId: string): Promise<readonly string[]> {
  const movimentos = await tx.movimentoDeApensamento.findMany({
    where: {
      OR: [{ processoPrincipalId: processoId }, { processoApensoId: processoId }],
    },
    select: {
      processoPrincipalId: true,
      processoApensoId: true,
      tipo: true,
      criadoEm: true,
    },
  });

  const principal = principalDoApenso(processoId, movimentos);
  if (principal !== null) {
    const p = await tx.processo.findUnique({
      where: { id: principal },
      select: { numero: true, exercicio: { select: { ano: true } } },
    });
    throw new Error(
      `O processo está APENSADO ao ${p?.numero ?? principal}/${p?.exercicio.ano ?? "?"} ` +
        `e acompanha a movimentação dele. Movimente o processo PRINCIPAL — o apenso vai ` +
        `junto, na mesma transação. Nada foi gravado.`
    );
  }

  return [processoId, ...apensosDe(processoId, movimentos)];
}

/** Quem tem de saber que algo aconteceu neste processo. */
async function interessados(tx: Tx, setorId: string): Promise<readonly string[]> {
  const lotados = await tx.usuarioDoSetor.findMany({
    where: { setorId },
    select: { usuarioIdent: true },
  });
  return lotados.map((l) => l.usuarioIdent);
}

// ═══════════════════════════════════════════════════════════════════════════
// ABERTURA
// ═══════════════════════════════════════════════════════════════════════════

export interface ProcessoAberto {
  readonly processoId: string;
  readonly numero: number;
  readonly ano: number;
  readonly codigoVerificador: string;
}

/**
 * A CRIAÇÃO DO PROCESSO dentro de uma transação já AUTORIZADA — o corpo comum da abertura interna
 * (`abrirProcesso`, que exige a ação e a lotação no setor) e do protocolo da carta de serviços
 * (`protocolarSolicitacao`, que exige a titularidade do requerente).
 *
 * ⚠️ EXPORTADA EM V11 V5.3, E CONTINUA NÃO SENDO ATO POR SI. Ela NÃO autoriza nada: quem a chama
 * já conferiu o crachá e está dentro da transação. O pedido de acesso à informação precisa dela
 * porque o pedido É executado por um processo — abrir um processo "por fora" e depois vincular
 * deixaria uma janela em que o processo existe sem o pedido.
 */
export async function criarProcessoNaTransacao(tx: Tx, d: ReturnType<typeof zAbrirProcesso.parse>): Promise<ProcessoAberto> {
  const exercicio = await tx.exercicio.findUnique({
    where: { ano: d.exercicio },
    select: { id: true, encerramento: { select: { id: true } } },
  });
  if (exercicio === null) {
    throw new Error(
      `Exercício ${d.exercicio} não cadastrado. A numeração do protocolo reinicia por ` +
        `exercício, e um exercício inexistente não tem fila. Nada foi gravado.`
    );
  }
  if (exercicio.encerramento !== null) {
    throw new Error(
      `O exercício ${d.exercicio} está ENCERRADO e não recebe processo novo. Abra no ` +
        `exercício corrente. Nada foi gravado.`
    );
  }

  const assunto = await tx.assunto.findUnique({
    where: { id: d.assuntoId },
    select: {
      id: true,
      codigo: true,
      nome: true,
      ativo: true,
      permiteAnonimo: true,
      sigiloPadrao: true,
      termoDeAceite: true,
      roteiro: {
        select: { ordem: true, setorId: true, prazoDias: true, descricao: true },
        orderBy: { ordem: "asc" },
      },
    },
  });
  if (assunto === null || !assunto.ativo) {
    throw new Error(
      `Assunto ${d.assuntoId} não existe ou está desativado. Nada foi gravado.`
    );
  }

  if (d.requerenteId === undefined && !assunto.permiteAnonimo) {
    throw new Error(
      `O assunto "${assunto.nome}" NÃO aceita requerente anônimo. Informe o requerente ` +
        `do cadastro único. Nada foi gravado.`
    );
  }
  if (assunto.termoDeAceite !== null && !d.aceitouTermo) {
    throw new Error(
      `O assunto "${assunto.nome}" exige o ACEITE DO TERMO para a abertura, e o aceite ` +
        `não veio. Um termo que a tela mostra e o servidor não cobra é um termo que ` +
        `ninguém aceitou. Nada foi gravado.`
    );
  }

  if (d.subassuntoId !== undefined) {
    const sub = await tx.subassunto.findUnique({
      where: { id: d.subassuntoId },
      select: { assuntoId: true, ativo: true, nome: true },
    });
    if (sub === null || !sub.ativo || sub.assuntoId !== assunto.id) {
      throw new Error(
        `Subassunto ${d.subassuntoId} não pertence ao assunto "${assunto.nome}" ou está ` +
          `desativado. Nada foi gravado.`
      );
    }
  }

  if (d.requerenteId !== undefined) {
    const pessoa = await tx.pessoa.findUnique({
      where: { id: d.requerenteId },
      select: { id: true },
    });
    if (pessoa === null) {
      throw new Error(
        `Requerente ${d.requerenteId} não está no cadastro único. Cadastre a pessoa ` +
          `antes de abrir o processo em nome dela. Nada foi gravado.`
      );
    }
  }

  // ⚠️ O TRINCO ANTES DA SOMA. Ver `packages/locks` — travar depois de ler o MAX é
  // travar um número que já está velho.
  await travar(tx, "SequenciaDeProtocolo", [exercicio.id]);

  const ultimo = await tx.processo.findFirst({
    where: { exercicioId: exercicio.id },
    select: { numero: true },
    orderBy: { numero: "desc" },
  });
  const numero = (ultimo?.numero ?? 0) + 1;

  const verificador = codigoVerificador(randomBytes(16));

  const processo = await tx.processo.create({
    data: {
      exercicioId: exercicio.id,
      numero,
      codigoVerificador: verificador,
      assuntoId: assunto.id,
      subassuntoId: d.subassuntoId ?? null,
      requerenteId: d.requerenteId ?? null,
      contatoAnonimo: d.contatoAnonimo ?? null,
      finalidade: d.finalidade,
      prioridade: d.prioridade,
      // ⚠️ O SIGILO DO ASSUNTO É PISO, NÃO TETO: quem abre pode elevar, nunca
      // rebaixar. Um assunto declarado sigiloso pela entidade não deixa de sê-lo
      // porque quem preencheu o formulário desmarcou a caixa.
      sigiloso: assunto.sigiloPadrao || d.sigiloso,
      documentacaoFisica: d.documentacaoFisica,
      textoAbertura: d.textoAbertura,
      setorAberturaId: d.setorAberturaId,
      criadoPor: d.criadoPor,
      etapas: {
        create: assunto.roteiro.map((e) => ({
          ordem: e.ordem,
          setorId: e.setorId,
          prazoDias: e.prazoDias,
          descricao: e.descricao,
        })),
      },
      requerentesAdicionais: {
        create: [...new Set(d.requerentesAdicionais)].map((pessoaId) => ({
          pessoaId,
          criadoPor: d.criadoPor,
        })),
      },
    },
    select: { id: true, numero: true, codigoVerificador: true },
  });

  return {
    processoId: processo.id,
    numero: processo.numero,
    ano: d.exercicio,
    codigoVerificador: processo.codigoVerificador,
  };
}

/**
 * ABRE O PROCESSO — e o número sai de dentro do trinco.
 *
 * ⚠️ O ROTEIRO DO ASSUNTO É COPIADO AQUI, e não referenciado. Ver o cabeçalho do
 * schema: sem a cópia, reconfigurar o prazo de uma etapa hoje deixaria atrasado, com
 * efeito retroativo, um processo que estava em dia ontem.
 */
export async function abrirProcesso(
  prisma: PrismaClient,
  input: AbrirProcessoInput
): Promise<ProcessoAberto> {
  const d = zAbrirProcesso.parse(input);

  return prisma.$transaction(async (tx) => {
    // A leitura que descobre a UG do fato — a única coisa que pode vir antes da
    // autorização, porque não dá para perguntar "ele pode AQUI?" sem saber onde é aqui.
    await exigirSetorAtivo(tx, d.setorAberturaId);
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.abrirProcesso, {
      setor: d.setorAberturaId,
    });
    await exigirLotacao(tx, d.criadoPor, d.setorAberturaId, "abrir processo aqui", ACAO_DO_SERVICO.abrirProcesso);

    return criarProcessoNaTransacao(tx, d);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// TRAMITAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * TRAMITA — e leva os apensos junto, na mesma transação.
 *
 * ⚠️ A UG DO FATO É A DO SETOR DE ORIGEM. Quem despacha é quem está com o documento;
 * a permissão que interessa é a do lugar de onde ele sai. Autorizar pelo DESTINO
 * deixaria alguém empurrar processo para uma unidade onde ele não tem poder nenhum.
 */
export async function tramitar(
  prisma: PrismaClient,
  input: TramitarInput
): Promise<{ readonly movimentoId: string; readonly alvos: number }> {
  const d = zTramitar.parse(input);

  return prisma.$transaction(async (tx) => tramitarNaTransacao(tx, d));
}

/**
 * O CORPO DO TRÂMITE, dentro de uma transação já aberta.
 *
 * ⚠️ EXTRAÍDO EM V11 V5.3, E ELE CONTINUA CONFERINDO TUDO. Autorização, lotação, processo
 * aberto, taxas em dia, setor ativo — nada saiu daqui para a casca. Quem chama de dentro de
 * outra transação (o pedido de acesso à informação, que distribui o pedido tramitando o
 * processo) recebe as mesmas recusas; o que ele ganha é ATOMICIDADE: ou o processo tramita e
 * o fato do rito é gravado, ou nenhum dos dois.
 */
export async function tramitarNaTransacao(
  tx: Tx,
  d: ReturnType<typeof zTramitar.parse>
): Promise<{ readonly movimentoId: string; readonly alvos: number }> {
  {
    const p = await carregar(tx, d.processoId);
    const origem = setorAtual(p.setorAberturaId, p.movimentos);

    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.tramitar, { setor: origem });
    await exigirLotacao(tx, d.criadoPor, origem, "tramitar este processo", ACAO_DO_SERVICO.tramitar, p.sigiloso);

    exigirAberto(p, "trâmite");
    await exigirTaxasEmDia(tx, p);

    if (d.setorDestinoId === origem) {
      throw new Error(
        `O processo ${rotulo(p)} já está neste setor. Tramitar para o próprio setor ` +
          `produziria um movimento que não move nada. Nada foi gravado.`
      );
    }
    await exigirSetorAtivo(tx, d.setorDestinoId);

    const alvos = await alvosDaMovimentacao(tx, p.id);

    let movimentoId = "";
    for (const alvo of alvos) {
      const m = await tx.movimentoDoProcesso.create({
        data: {
          processoId: alvo,
          tipo: "TRAMITE",
          setorOrigemId: origem,
          setorDestinoId: d.setorDestinoId,
          usuarioDestino: d.usuarioDestino ?? null,
          texto: d.texto,
          criadoPor: d.criadoPor,
        },
        select: { id: true },
      });
      if (alvo === p.id) movimentoId = m.id;
    }

    const destinatarios =
      d.usuarioDestino !== undefined
        ? [d.usuarioDestino]
        : await interessados(tx, d.setorDestinoId);

    await notificarVarios(tx, destinatarios, {
      evento: "TRAMITE_RECEBIDO",
      titulo: `Processo ${rotulo(p)} recebido para análise`,
      corpo: `${p.assunto.nome} — ${d.texto}`,
      rota: `/protocolo/processos/${p.id}`,
    });

    return { movimentoId, alvos: alvos.length };
  }
}

/**
 * RECEBE — e é o recebimento que inicia a contagem do prazo da etapa.
 *
 * ⚠️ RECEBER É ATO DE QUEM ESTÁ NO DESTINO. Quem enviou não pode receber em nome do
 * destinatário: seria dar por entregue um documento que ninguém abriu, e o prazo
 * passaria a correr contra alguém que não sabe que o tem.
 */
export async function receberProcesso(
  prisma: PrismaClient,
  input: ReceberInput
): Promise<{ readonly movimentoId: string }> {
  const d = zReceber.parse(input);

  return prisma.$transaction(async (tx) => receberNaTransacao(tx, d));
}

/**
 * O CORPO DO RECEBIMENTO, dentro de uma transação já aberta. Mesmo motivo e mesmas conferências
 * do trâmite: receber é ato de quem está no destino, e receber duas vezes continua recusado.
 */
export async function receberNaTransacao(
  tx: Tx,
  d: ReturnType<typeof zReceber.parse>
): Promise<{ readonly movimentoId: string }> {
  {
    const p = await carregar(tx, d.processoId);
    const destino = setorAtual(p.setorAberturaId, p.movimentos);

    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.receberProcesso, {
      setor: destino,
    });
    await exigirLotacao(tx, d.criadoPor, destino, "receber este processo", ACAO_DO_SERVICO.receberProcesso, p.sigiloso);

    exigirAberto(p, "recebimento");

    if (situacaoDoProcesso(p.movimentos) !== "EM_TRAMITE") {
      throw new Error(
        `O processo ${rotulo(p)} não está aguardando recebimento (situação: ` +
          `${descreverSituacao(situacaoDoProcesso(p.movimentos))}). Receber duas vezes ` +
          `reiniciaria a contagem do prazo sem que nada tivesse acontecido. Nada foi gravado.`
      );
    }

    const alvos = await alvosDaMovimentacao(tx, p.id);
    let movimentoId = "";
    for (const alvo of alvos) {
      const m = await tx.movimentoDoProcesso.create({
        data: {
          processoId: alvo,
          tipo: "RECEBIMENTO",
          setorDestinoId: destino,
          texto: d.texto,
          criadoPor: d.criadoPor,
        },
        select: { id: true },
      });
      if (alvo === p.id) movimentoId = m.id;
    }
    return { movimentoId };
  }
}

/** COMPLEMENTA — texto ou documento, sem mudar de setor. */
export async function complementarProcesso(
  prisma: PrismaClient,
  input: ComplementarInput
): Promise<{ readonly movimentoId: string }> {
  const d = zComplementar.parse(input);

  return prisma.$transaction(async (tx) => {
    const p = await carregar(tx, d.processoId);
    const onde = setorAtual(p.setorAberturaId, p.movimentos);

    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.complementarProcesso, {
      setor: onde,
    });
    await exigirLotacao(tx, d.criadoPor, onde, "complementar este processo", ACAO_DO_SERVICO.complementarProcesso, p.sigiloso);
    exigirAberto(p, "complemento");

    const m = await tx.movimentoDoProcesso.create({
      data: {
        processoId: p.id,
        tipo: "COMPLEMENTO",
        setorOrigemId: onde,
        texto: d.texto,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { movimentoId: m.id };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PARECER
// ═══════════════════════════════════════════════════════════════════════════

/** SOLICITA PARECER a outro setor — e o processo NÃO sai do lugar. */
export async function solicitarParecer(
  prisma: PrismaClient,
  input: SolicitarParecerInput
): Promise<{ readonly movimentoId: string }> {
  const d = zSolicitarParecer.parse(input);

  return prisma.$transaction(async (tx) => {
    const p = await carregar(tx, d.processoId);
    const onde = setorAtual(p.setorAberturaId, p.movimentos);

    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.solicitarParecer, {
      setor: onde,
    });
    await exigirLotacao(tx, d.criadoPor, onde, "pedir parecer neste processo", ACAO_DO_SERVICO.solicitarParecer, p.sigiloso);
    exigirAberto(p, "pedido de parecer");
    await exigirSetorAtivo(tx, d.setorDestinoId);

    const m = await tx.movimentoDoProcesso.create({
      data: {
        processoId: p.id,
        tipo: "PARECER_SOLICITADO",
        setorOrigemId: onde,
        setorDestinoId: d.setorDestinoId,
        usuarioDestino: d.usuarioDestino ?? null,
        texto: d.texto,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });

    const destinatarios =
      d.usuarioDestino !== undefined
        ? [d.usuarioDestino]
        : await interessados(tx, d.setorDestinoId);
    await notificarVarios(tx, destinatarios, {
      evento: "PARECER_SOLICITADO",
      titulo: `Parecer solicitado no processo ${rotulo(p)}`,
      corpo: d.texto,
      rota: `/protocolo/processos/${p.id}`,
    });

    return { movimentoId: m.id };
  });
}

/**
 * RESPONDE O PARECER — e a resposta APONTA para o pedido.
 *
 * ⚠️ SEM O APONTAMENTO, DOIS PEDIDOS E UMA RESPOSTA FECHARIAM OS DOIS. A derivação da
 * situação conta pedidos sem resposta; uma resposta solta zeraria a conta e o processo
 * voltaria a "em análise" com um parecer ainda pendente.
 */
export async function responderParecer(
  prisma: PrismaClient,
  input: ResponderParecerInput
): Promise<{ readonly movimentoId: string }> {
  const d = zResponderParecer.parse(input);

  return prisma.$transaction(async (tx) => {
    const p = await carregar(tx, d.processoId);

    const pedido = await tx.movimentoDoProcesso.findUnique({
      where: { id: d.solicitacaoId },
      select: {
        id: true,
        tipo: true,
        processoId: true,
        setorDestinoId: true,
        respostas: { select: { id: true } },
      },
    });
    if (pedido === null || pedido.processoId !== p.id || pedido.tipo !== "PARECER_SOLICITADO") {
      throw new Error(
        `O movimento ${d.solicitacaoId} não é um pedido de parecer deste processo. ` +
          `Nada foi gravado.`
      );
    }
    const setorDoParecer = pedido.setorDestinoId ?? setorAtual(p.setorAberturaId, p.movimentos);

    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.responderParecer, {
      setor: setorDoParecer,
    });
    await exigirLotacao(tx, d.criadoPor, setorDoParecer, "responder este parecer", ACAO_DO_SERVICO.responderParecer, p.sigiloso);
    exigirAberto(p, "parecer");

    if (pedido.respostas.length > 0) {
      throw new Error(
        `O pedido de parecer já foi respondido. Um segundo parecer sobre o mesmo pedido ` +
          `é um COMPLEMENTO — use complementar, e o histórico mostra os dois na ordem. ` +
          `Nada foi gravado.`
      );
    }

    const m = await tx.movimentoDoProcesso.create({
      data: {
        processoId: p.id,
        tipo: "PARECER_RESPONDIDO",
        setorOrigemId: setorDoParecer,
        respondeAId: pedido.id,
        texto: d.texto,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { movimentoId: m.id };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// READEQUAÇÃO — o único movimento que o REQUERENTE produz
// ═══════════════════════════════════════════════════════════════════════════

export async function solicitarReadequacao(
  prisma: PrismaClient,
  input: SolicitarReadequacaoInput
): Promise<{ readonly movimentoId: string }> {
  const d = zSolicitarReadequacao.parse(input);

  return prisma.$transaction(async (tx) => {
    const p = await carregar(tx, d.processoId);
    const onde = setorAtual(p.setorAberturaId, p.movimentos);

    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.solicitarReadequacao, {
      setor: onde,
    });
    await exigirLotacao(tx, d.criadoPor, onde, "pedir readequação neste processo", ACAO_DO_SERVICO.solicitarReadequacao, p.sigiloso);
    exigirAberto(p, "pedido de readequação");

    const m = await tx.movimentoDoProcesso.create({
      data: {
        processoId: p.id,
        tipo: "READEQUACAO_SOLICITADA",
        setorOrigemId: onde,
        texto: d.texto,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });

    // O requerente externo é notificado pelo canal que ele tem — e nenhum deles sai
    // deste repositório hoje. Ver `m24-notificacoes`.
    const requerente = p.requerenteId ?? "";
    if (requerente !== "") {
      await notificarVarios(tx, [requerente], {
        evento: "READEQUACAO_SOLICITADA",
        titulo: `Sua solicitação ${rotulo(p)} precisa de readequação`,
        corpo: d.texto,
        rota: `/protocolo/consulta`,
      });
    }

    return { movimentoId: m.id };
  });
}

/**
 * O REQUERENTE ATENDE A READEQUAÇÃO.
 *
 * ⚠️ ESTE É O ÚNICO SERVIÇO DO MÓDULO EM QUE O ATOR PODE NÃO SER SERVIDOR — e por isso
 * ele aceita o CÓDIGO VERIFICADOR como prova de posse. Quem responde tem de provar que
 * tem o processo em mãos; o código é o que a consulta externa entrega ao requerente.
 *
 * Quando quem atende É usuário do sistema (o servidor que digita a resposta trazida no
 * balcão), a autorização normal vale e o código não é exigido.
 */
export async function atenderReadequacao(
  prisma: PrismaClient,
  input: AtenderReadequacaoInput
): Promise<{ readonly movimentoId: string }> {
  const d = zAtenderReadequacao.parse(input);

  return prisma.$transaction(async (tx) => {
    const p = await carregar(tx, d.processoId);
    const onde = setorAtual(p.setorAberturaId, p.movimentos);

    // ⚠️ O CÓDIGO VERIFICADOR NÃO SUBSTITUI A AUTORIZAÇÃO — ele a DISPENSA apenas para
    // o ato do requerente, e só sobre ESTE processo. A comparação é sobre o código do
    // próprio registro; um código errado cai no caminho autorizado, que vai recusar.
    const comCodigo =
      d.codigoVerificador !== undefined &&
      d.codigoVerificador.toUpperCase() === p.codigoVerificador;

    if (!comCodigo) {
      await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.atenderReadequacao, {
        setor: onde,
      });
      await exigirLotacao(tx, d.criadoPor, onde, "atender a readequação por dentro", ACAO_DO_SERVICO.atenderReadequacao, p.sigiloso);
    }

    exigirAberto(p, "readequação");

    const pedido = await tx.movimentoDoProcesso.findUnique({
      where: { id: d.solicitacaoId },
      select: {
        id: true,
        tipo: true,
        processoId: true,
        setorOrigemId: true,
        respostas: { select: { id: true } },
      },
    });
    if (
      pedido === null ||
      pedido.processoId !== p.id ||
      pedido.tipo !== "READEQUACAO_SOLICITADA"
    ) {
      throw new Error(
        `O movimento ${d.solicitacaoId} não é um pedido de readequação deste processo. ` +
          `Nada foi gravado.`
      );
    }
    if (pedido.respostas.length > 0) {
      throw new Error(
        `Este pedido de readequação já foi atendido. Nada foi gravado.`
      );
    }

    const m = await tx.movimentoDoProcesso.create({
      data: {
        processoId: p.id,
        tipo: "READEQUACAO_ATENDIDA",
        respondeAId: pedido.id,
        texto: d.texto,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });

    if (pedido.setorOrigemId !== null) {
      await notificarVarios(tx, await interessados(tx, pedido.setorOrigemId), {
        evento: "READEQUACAO_ATENDIDA",
        titulo: `Readequação atendida no processo ${rotulo(p)}`,
        corpo: d.texto,
        rota: `/protocolo/processos/${p.id}`,
      });
    }

    return { movimentoId: m.id };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ENCERRAMENTO, ARQUIVAMENTO E REABERTURA
// ═══════════════════════════════════════════════════════════════════════════

export async function encerrarProcesso(
  prisma: PrismaClient,
  input: EncerrarInput
): Promise<{ readonly movimentoId: string }> {
  const d = zEncerrar.parse(input);

  return prisma.$transaction(async (tx) => {
    const p = await carregar(tx, d.processoId);
    const onde = setorAtual(p.setorAberturaId, p.movimentos);

    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.encerrarProcesso, { setor: onde });
    await exigirLotacao(tx, d.criadoPor, onde, "encerrar este processo", ACAO_DO_SERVICO.encerrarProcesso, p.sigiloso);
    exigirAberto(p, "encerramento");

    // ⚠️ PENDÊNCIA ABERTA IMPEDE O ENCERRAMENTO. Encerrar com um parecer pedido e não
    // respondido deixaria o setor consultado esperando para sempre — e a pendência
    // sumiria da caixa dele sem nunca ter sido resolvida.
    const situacao = situacaoDoProcesso(p.movimentos);
    if (situacao === "AGUARDANDO_PARECER" || situacao === "AGUARDANDO_READEQUACAO") {
      throw new Error(
        `O processo ${rotulo(p)} está ${descreverSituacao(situacao).toUpperCase()}. ` +
          `Encerrar agora deixaria a pendência sem resposta e ela sumiria da caixa de ` +
          `quem a espera. Resolva a pendência (ou torne o pedido sem efeito, com motivo) ` +
          `antes de encerrar. Nada foi gravado.`
      );
    }

    const alvos = await alvosDaMovimentacao(tx, p.id);
    let movimentoId = "";
    for (const alvo of alvos) {
      const m = await tx.movimentoDoProcesso.create({
        data: {
          processoId: alvo,
          tipo: "ENCERRAMENTO",
          setorOrigemId: onde,
          texto: d.texto,
          criadoPor: d.criadoPor,
        },
        select: { id: true },
      });
      if (alvo === p.id) movimentoId = m.id;
    }
    return { movimentoId };
  });
}

export async function arquivarProcesso(
  prisma: PrismaClient,
  input: ArquivarInput
): Promise<{ readonly movimentoId: string }> {
  const d = zArquivar.parse(input);

  return prisma.$transaction(async (tx) => {
    const p = await carregar(tx, d.processoId);
    const onde = setorAtual(p.setorAberturaId, p.movimentos);

    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.arquivarProcesso, { setor: onde });
    await exigirLotacao(tx, d.criadoPor, onde, "arquivar este processo", ACAO_DO_SERVICO.arquivarProcesso, p.sigiloso);

    // ⚠️ ARQUIVAR EXIGE ENCERRADO. São dois atos, e não um: encerrar é a decisão sobre
    // o MÉRITO ("está resolvido"); arquivar é a decisão sobre a GUARDA ("sai da mesa").
    // Fundi-los faria o histórico perder a data em que o pedido do cidadão foi de fato
    // respondido — que é o número que a ouvidoria mede.
    const situacao = situacaoDoProcesso(p.movimentos);
    if (situacao !== "ENCERRADO") {
      throw new Error(
        `O processo ${rotulo(p)} está ${descreverSituacao(situacao).toUpperCase()} e não ` +
          `pode ser arquivado: só se arquiva o que já foi ENCERRADO. Encerrar responde ` +
          `ao mérito; arquivar apenas guarda. Nada foi gravado.`
      );
    }

    const alvos = await alvosDaMovimentacao(tx, p.id);
    let movimentoId = "";
    for (const alvo of alvos) {
      const m = await tx.movimentoDoProcesso.create({
        data: {
          processoId: alvo,
          tipo: "ARQUIVAMENTO",
          setorOrigemId: onde,
          texto: d.texto,
          criadoPor: d.criadoPor,
        },
        select: { id: true },
      });
      if (alvo === p.id) movimentoId = m.id;
    }
    return { movimentoId };
  });
}

export async function reabrirProcesso(
  prisma: PrismaClient,
  input: ReabrirInput
): Promise<{ readonly movimentoId: string }> {
  const d = zReabrir.parse(input);

  return prisma.$transaction(async (tx) => {
    const p = await carregar(tx, d.processoId);
    const onde = setorAtual(p.setorAberturaId, p.movimentos);

    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.reabrirProcesso, { setor: onde });
    await exigirLotacao(tx, d.criadoPor, onde, "reabrir este processo", ACAO_DO_SERVICO.reabrirProcesso, p.sigiloso);

    const situacao = situacaoDoProcesso(p.movimentos);
    if (!estaFechado(situacao)) {
      throw new Error(
        `O processo ${rotulo(p)} já está aberto (${descreverSituacao(situacao)}). ` +
          `Reabrir o que está aberto acrescentaria um movimento que não muda nada. ` +
          `Nada foi gravado.`
      );
    }

    const alvos = await alvosDaMovimentacao(tx, p.id);
    let movimentoId = "";
    for (const alvo of alvos) {
      const m = await tx.movimentoDoProcesso.create({
        data: {
          processoId: alvo,
          tipo: "REABERTURA",
          setorDestinoId: onde,
          texto: d.texto,
          criadoPor: d.criadoPor,
        },
        select: { id: true },
      });
      if (alvo === p.id) movimentoId = m.id;
    }
    return { movimentoId };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// APENSAMENTO
// ═══════════════════════════════════════════════════════════════════════════

export async function apensarProcesso(
  prisma: PrismaClient,
  input: ApensarInput
): Promise<{ readonly movimentoId: string }> {
  const d = zApensar.parse(input);

  return prisma.$transaction(async (tx) => {
    if (d.processoPrincipalId === d.processoApensoId) {
      throw new Error("Um processo não se apensa a si mesmo. Nada foi gravado.");
    }

    const principal = await carregar(tx, d.processoPrincipalId);
    const apenso = await carregar(tx, d.processoApensoId);
    const onde = setorAtual(principal.setorAberturaId, principal.movimentos);

    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.apensarProcesso, { setor: onde });
    await exigirLotacao(tx, d.criadoPor, onde, "apensar processos aqui", ACAO_DO_SERVICO.apensarProcesso, principal.sigiloso);

    exigirAberto(principal, "apensamento");
    exigirAberto(apenso, "apensamento");

    const movimentos = await tx.movimentoDeApensamento.findMany({
      where: {
        OR: [
          { processoApensoId: apenso.id },
          { processoPrincipalId: apenso.id },
          { processoApensoId: principal.id },
        ],
      },
      select: {
        processoPrincipalId: true,
        processoApensoId: true,
        tipo: true,
        criadoEm: true,
      },
    });

    if (principalDoApenso(apenso.id, movimentos) !== null) {
      throw new Error(
        `O processo ${rotulo(apenso)} já está apensado a outro. Desapense antes. ` +
          `Nada foi gravado.`
      );
    }
    // ⚠️ CADEIA DE APENSAMENTO NÃO. Se o principal já é apenso de um terceiro, apensar
    // aqui criaria uma corrente em que a movimentação teria de subir dois níveis — e a
    // primeira quebra num dos elos deixaria metade da corrente para trás, em silêncio.
    if (principalDoApenso(principal.id, movimentos) !== null) {
      throw new Error(
        `O processo ${rotulo(principal)} é ele mesmo um apenso, e não pode receber ` +
          `apensos: a movimentação teria de percorrer uma corrente, e o elo que falhasse ` +
          `deixaria parte dela para trás sem ninguém perceber. Apense ao processo ` +
          `principal da cadeia. Nada foi gravado.`
      );
    }
    if (apensosDe(apenso.id, movimentos).length > 0) {
      throw new Error(
        `O processo ${rotulo(apenso)} já tem apensos e não pode virar apenso de outro ` +
          `— pelo mesmo motivo. Nada foi gravado.`
      );
    }

    const m = await tx.movimentoDeApensamento.create({
      data: {
        processoPrincipalId: principal.id,
        processoApensoId: apenso.id,
        tipo: "APENSADO",
        motivo: d.motivo,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { movimentoId: m.id };
  });
}

export async function desapensarProcesso(
  prisma: PrismaClient,
  input: DesapensarInput
): Promise<{ readonly movimentoId: string }> {
  const d = zDesapensar.parse(input);

  return prisma.$transaction(async (tx) => {
    const principal = await carregar(tx, d.processoPrincipalId);
    const onde = setorAtual(principal.setorAberturaId, principal.movimentos);

    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.desapensarProcesso, {
      setor: onde,
    });
    await exigirLotacao(tx, d.criadoPor, onde, "desapensar processos aqui", ACAO_DO_SERVICO.desapensarProcesso, principal.sigiloso);

    const movimentos = await tx.movimentoDeApensamento.findMany({
      where: { processoApensoId: d.processoApensoId },
      select: {
        processoPrincipalId: true,
        processoApensoId: true,
        tipo: true,
        criadoEm: true,
      },
    });
    if (principalDoApenso(d.processoApensoId, movimentos) !== principal.id) {
      throw new Error(
        `O processo indicado não está apensado ao ${rotulo(principal)}. Nada foi gravado.`
      );
    }

    const m = await tx.movimentoDeApensamento.create({
      data: {
        processoPrincipalId: principal.id,
        processoApensoId: d.processoApensoId,
        tipo: "DESAPENSADO",
        motivo: d.motivo,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { movimentoId: m.id };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// TORNAR SEM EFEITO — o que o catálogo chama de "excluir trâmite"
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ ISTO NÃO APAGA NADA, E A DIVERGÊNCIA COM O CATÁLOGO É DELIBERADA.
 *
 * O catálogo pede "exclusão de trâmite ou complemento". Aqui o movimento é ANULADO por
 * outro movimento que o aponta — a mesma doutrina do estorno do razão. O efeito para o
 * usuário é o pedido: o trâmite deixa de contar para a situação e para o prazo. O que
 * NÃO acontece é o histórico esquecer que ele existiu.
 *
 * A diferença aparece exatamente no caso que interessa a uma auditoria: alguém tramita
 * para o setor errado, percebe, e desfaz. Com DELETE, não houve nada. Aqui houve, e
 * está escrito quem desfez e por quê.
 *
 * ⚠️ SÓ O ÚLTIMO. Anular um trâmite do meio deixaria a cadeia de setores inconsistente
 * — o processo teria "chegado" a um lugar de onde nunca saiu.
 */
export async function tornarMovimentoSemEfeito(
  prisma: PrismaClient,
  input: TornarMovimentoSemEfeitoInput
): Promise<{ readonly movimentoId: string }> {
  const d = zTornarMovimentoSemEfeito.parse(input);

  return prisma.$transaction(async (tx) => {
    const p = await carregar(tx, d.processoId);
    const onde = setorAtual(p.setorAberturaId, p.movimentos);

    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.tornarMovimentoSemEfeito, {
      setor: onde,
    });
    await exigirLotacao(tx, d.criadoPor, onde, "tornar movimento sem efeito aqui", ACAO_DO_SERVICO.tornarMovimentoSemEfeito, p.sigiloso);
    exigirAberto(p, "anulação de movimento");

    const alvo = p.movimentos.find((m) => m.id === d.movimentoId);
    if (alvo === undefined) {
      throw new Error(
        `O movimento ${d.movimentoId} não pertence ao processo ${rotulo(p)}. ` +
          `Nada foi gravado.`
      );
    }
    if (alvo.tipo !== "TRAMITE" && alvo.tipo !== "COMPLEMENTO") {
      throw new Error(
        `Só TRÂMITE e COMPLEMENTO podem ser tornados sem efeito. Encerramento, ` +
          `arquivamento e parecer são decisões — desfazê-las é REABRIR ou responder de ` +
          `novo, e os dois deixam rastro próprio. Nada foi gravado.`
      );
    }

    const ordenados = [...p.movimentos].sort(
      (a, b) => a.criadoEm.getTime() - b.criadoEm.getTime()
    );
    const ultimo = ordenados[ordenados.length - 1];
    if (ultimo === undefined || ultimo.id !== alvo.id) {
      throw new Error(
        `Só o ÚLTIMO movimento pode ser tornado sem efeito. Anular um do meio deixaria a ` +
          `cadeia de setores inconsistente — o processo teria chegado a um lugar de onde ` +
          `nunca saiu. Nada foi gravado.`
      );
    }

    const m = await tx.movimentoDoProcesso.create({
      data: {
        processoId: p.id,
        tipo: "TORNADO_SEM_EFEITO",
        tornaSemEfeitoId: alvo.id,
        texto: d.motivo,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { movimentoId: m.id };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// V6.2 — P3: A CARTA DE SERVIÇOS E AS SOLICITAÇÕES DO REQUERENTE
//
// ⚠️ NÃO É OUTRO ENGINE. O serviço da carta aponta para um ASSUNTO do protocolo (roteiro, sigilo,
// termo); a solicitação protocolada É um processo do M21, aberto pela mesma criação da abertura
// interna, e a exigência, o complemento e o encerramento são movimentos do mesmo processo. O que
// este bloco acrescenta é o que o requerente pode fazer e ver — e a versão do formulário que valeu.
// ═══════════════════════════════════════════════════════════════════════════

export const zCadastrarServicoDaCarta = z.object({
  slug: z.string().trim().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "o endereço público: minúsculas, dígitos e hífen"),
  titulo: z.string().trim().min(5),
  categoria: z.string().trim().min(3),
  publico: z.enum(["CIDADAO", "FORNECEDOR", "SERVIDOR"]),
  tipo: z.enum(["REQUERIMENTO_ADMINISTRATIVO", "ATUALIZACAO_CADASTRAL", "COMPLEMENTO_DE_FORNECEDOR", "MANIFESTACAO_ANONIMA"]),
  assuntoId: z.string().min(1),
  criadoPor: z.string().min(1),
});
export type CadastrarServicoDaCartaInput = z.input<typeof zCadastrarServicoDaCarta>;

export async function cadastrarServicoDaCarta(prisma: PrismaClient, input: CadastrarServicoDaCartaInput): Promise<{ readonly servicoId: string }> {
  const d = zCadastrarServicoDaCarta.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarServicoDaCarta, "ENTE");
    const assunto = await tx.assunto.findUnique({ where: { id: d.assuntoId }, select: { ativo: true, permiteAnonimo: true, nome: true } });
    if (assunto === null || !assunto.ativo) throw new Error(`Assunto ${d.assuntoId} não existe ou está desativado. Nada foi gravado.`);
    if ((await tx.servicoDaCarta.findUnique({ where: { slug: d.slug }, select: { id: true } })) !== null) throw new Error(`SERVICO-REPETIDO: já existe serviço no endereço /servicos/${d.slug}. Nada foi gravado.`);
    const s = await tx.servicoDaCarta.create({ data: { slug: d.slug, titulo: d.titulo, categoria: d.categoria, publico: d.publico, tipo: d.tipo, assuntoId: d.assuntoId, criadoPor: d.criadoPor }, select: { id: true } });
    return { servicoId: s.id };
  });
}

export const zCadastrarVersaoDoServico = z
  .object({
    servicoId: z.string().min(1),
    descricao: z.string().trim().min(10),
    requisitos: z.string().trim().min(5),
    documentos: z.array(z.string().trim().min(3)).max(20),
    canais: z.string().trim().min(5),
    custo: z.string().trim().min(3).optional(),
    prazoDias: z.number().int().positive().optional(),
    fundamentoDoPrazo: z.string().trim().min(5).optional(),
    exigeAutenticacao: z.boolean(),
    setorDeEntradaId: z.string().min(1),
    campos: z.unknown(),
    criadoPor: z.string().min(1),
  })
  .refine((d) => (d.prazoDias === undefined) === (d.fundamentoDoPrazo === undefined), { message: "prazo e fundamento do prazo vêm juntos — prazo sem fundamento é prazo inventado" });
export type CadastrarVersaoDoServicoInput = z.input<typeof zCadastrarVersaoDoServico>;

export async function cadastrarVersaoDoServico(prisma: PrismaClient, input: CadastrarVersaoDoServicoInput): Promise<{ readonly versaoId: string; readonly numero: number }> {
  const d = zCadastrarVersaoDoServico.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarVersaoDoServico, "ENTE");
    const servico = await tx.servicoDaCarta.findUnique({ where: { id: d.servicoId }, select: { tipo: true, slug: true, assunto: { select: { nome: true, permiteAnonimo: true, sigiloPadrao: true } }, versoes: { orderBy: { numero: "desc" }, take: 1, select: { numero: true } } } });
    if (servico === null) throw new Error(`Serviço ${d.servicoId} não existe. Nada foi gravado.`);
    const erros = errosDosCampos(servico.tipo, d.campos);
    if (erros.length > 0) throw new Error(`FORMULARIO-INVALIDO: ${erros.join("; ")}. Nada foi gravado.`);
    await exigirSetorAtivo(tx, d.setorDeEntradaId);
    // ⚠️ V7 M1 U4 — A ENTRADA É DA NATUREZA DO SERVIÇO, não uma caixa livre: quem age em nome de uma pessoa
    // exige conta; a manifestação de ouvidoria anônima não exige, e só existe sobre assunto que aceita
    // anônimo E é sigiloso (quem a lê é a ouvidoria, não a unidade inteira).
    if (d.exigeAutenticacao !== exigeContaPorNatureza(servico.tipo)) {
      throw new Error(
        exigeContaPorNatureza(servico.tipo)
          ? "SERVICO-SEM-AUTENTICACAO: este serviço protocola em nome de uma pessoa do cadastro, e isso exige entrar. A leitura da carta continua pública. Nada foi gravado."
          : "MANIFESTACAO-ANONIMA-SEM-CONTA: a manifestação de ouvidoria anônima não exige conta — exigir entrada contradiria a natureza do serviço. Nada foi gravado."
      );
    }
    if (servico.tipo === "MANIFESTACAO_ANONIMA" && (!servico.assunto.permiteAnonimo || !servico.assunto.sigiloPadrao)) {
      throw new Error(`ASSUNTO-INADEQUADO-PARA-OUVIDORIA: o assunto "${servico.assunto.nome}" precisa aceitar requerente anônimo e ser sigiloso por padrão. Nada foi gravado.`);
    }
    const numero = (servico.versoes[0]?.numero ?? 0) + 1;
    const v = await tx.versaoDoServico.create({
      data: {
        servicoId: d.servicoId, numero, descricao: d.descricao, requisitos: d.requisitos, documentos: d.documentos, canais: d.canais,
        custo: d.custo ?? null, prazoDias: d.prazoDias ?? null, fundamentoDoPrazo: d.fundamentoDoPrazo ?? null,
        exigeAutenticacao: d.exigeAutenticacao, setorDeEntradaId: d.setorDeEntradaId, campos: d.campos as object, criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { versaoId: v.id, numero };
  });
}

export const zPublicarVersaoDoServico = z.object({ versaoId: z.string().min(1), criadoPor: z.string().min(1) });
export type PublicarVersaoDoServicoInput = z.input<typeof zPublicarVersaoDoServico>;

export async function publicarVersaoDoServico(prisma: PrismaClient, input: PublicarVersaoDoServicoInput): Promise<{ readonly publicacaoId: string; readonly etapas: number }> {
  const d = zPublicarVersaoDoServico.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.publicarVersaoDoServico, "ENTE");
    const v = await tx.versaoDoServico.findUnique({
      where: { id: d.versaoId },
      select: { numero: true, publicacao: { select: { id: true } }, servico: { select: { slug: true, assunto: { select: { roteiro: { orderBy: { ordem: "asc" }, select: { ordem: true, prazoDias: true, descricao: true, setor: { select: { codigo: true, nome: true } } } } } } } } },
    });
    if (v === null) throw new Error(`Versão ${d.versaoId} não existe. Nada foi gravado.`);
    if (v.publicacao !== null) throw new Error(`VERSAO-JA-PUBLICADA: a versão ${v.numero} de /servicos/${v.servico.slug} já está publicada e não muda. Nada foi gravado.`);
    // ⚠️ AS ETAPAS PUBLICADAS SÃO O ROTEIRO REAL, COPIADO AGORA: o que a carta mostra é o que executa.
    const etapas = v.servico.assunto.roteiro.map((e) => ({ ordem: e.ordem, setor: `${e.setor.codigo} — ${e.setor.nome}`, prazoDias: e.prazoDias, descricao: e.descricao }));
    const p = await tx.publicacaoDoServico.create({ data: { versaoId: d.versaoId, etapas, criadoPor: d.criadoPor }, select: { id: true } });
    return { publicacaoId: p.id, etapas: etapas.length };
  });
}

/** Em nome de quem este usuário pode agir sobre a pessoa — por si, ou por representação vigente. */
export const titularidadeDoUsuario = (tx: Tx, usuario: string, titularId: string, quando: Date) => titularidade(tx, usuario, titularId, quando);
async function titularidade(tx: Tx, usuario: string, titularId: string, quando: Date): Promise<{ readonly via: "PROPRIO" } | { readonly via: "REPRESENTACAO"; readonly representacaoId: string } | null> {
  const propria = await pessoaDoUsuario(tx, usuario);
  if (propria !== null && propria.pessoaId === titularId) return { via: "PROPRIO" };
  const r = (await representacoesVigentesDoUsuario(tx, usuario, quando)).find((x) => x.representadaId === titularId);
  return r === undefined ? null : { via: "REPRESENTACAO", representacaoId: r.id };
}

export const zProtocolarSolicitacao = z.object({
  slug: z.string().min(1),
  /** Ausente = por si (a pessoa vinculada à conta). Presente = a pessoa REPRESENTADA. */
  representadaId: z.string().min(1).optional(),
  respostas: z.record(z.string(), z.string()),
  aceitouTermo: z.boolean().default(false),
  criadoPor: z.string().min(1),
});
export type ProtocolarSolicitacaoInput = z.input<typeof zProtocolarSolicitacao>;

export interface SolicitacaoProtocolada {
  readonly solicitacaoId: string;
  readonly processoId: string;
  readonly protocolo: string;
  readonly versao: number;
  readonly titular: string;
  readonly viaRepresentacao: boolean;
}

export async function protocolarSolicitacao(prisma: PrismaClient, input: ProtocolarSolicitacaoInput): Promise<SolicitacaoProtocolada> {
  const d = zProtocolarSolicitacao.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.protocolarSolicitacao, "ENTE");
    const servico = await tx.servicoDaCarta.findUnique({
      where: { slug: d.slug },
      select: { titulo: true, tipo: true, assuntoId: true, versoes: { where: { publicacao: { isNot: null } }, orderBy: { numero: "desc" }, take: 1, select: { id: true, numero: true, campos: true, setorDeEntradaId: true } } },
    });
    const versao = servico?.versoes[0];
    if (servico === null || versao === undefined) throw new Error(`SERVICO-NAO-PUBLICADO: não há versão publicada de /servicos/${d.slug}. Nada foi protocolado.`);
    if (servico.tipo === "MANIFESTACAO_ANONIMA") throw new Error("SERVICO-DE-OUVIDORIA-ANONIMA: este serviço recebe manifestação sem conta, pela página da ouvidoria. Nada foi protocolado.");

    // ⚠️ O TITULAR SAI DA CONTA, NUNCA DO FORMULÁRIO. Por si: a pessoa vinculada à conta. Por
    // representação: a pessoa representada, com representação VIGENTE HOJE. Um CPF digitado não entra.
    const propria = await pessoaDoUsuario(tx, d.criadoPor);
    let titularId: string;
    let representacaoId: string | null = null;
    if (d.representadaId === undefined) {
      if (propria === null) throw new Error("CONTA-SEM-PESSOA: sua conta não está vinculada a uma pessoa do cadastro, e o pedido precisa de um titular. Procure o atendimento para o vínculo. Nada foi protocolado.");
      titularId = propria.pessoaId;
    } else {
      const t = await titularidade(tx, d.criadoPor, d.representadaId, new Date());
      if (t === null || t.via !== "REPRESENTACAO") throw new Error("SEM-REPRESENTACAO-VIGENTE: você não tem representação vigente dessa pessoa. Nada foi protocolado.");
      titularId = d.representadaId;
      representacaoId = t.representacaoId;
    }
    const titular = await tx.pessoa.findUnique({ where: { id: titularId }, select: { tipo: true, documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { id: true, nome: true } } } });
    if (titular === null) throw new Error("Titular inexistente. Nada foi protocolado.");
    if (servico.tipo === "COMPLEMENTO_DE_FORNECEDOR" && (representacaoId === null || titular.tipo !== "JURIDICA")) {
      throw new Error("COMPLEMENTO-SO-POR-REPRESENTACAO: o complemento documental de fornecedor é feito em nome da pessoa jurídica, por representação vigente. Escolha a empresa que você representa. Nada foi protocolado.");
    }

    const campos = (versao.campos as unknown as CampoDoFormulario[]) ?? [];
    const r = validarRespostas(campos, d.respostas);
    if ("erros" in r) throw new Error(`FORMULARIO-INCOMPLETO: ${r.erros.join("; ")}. Nada foi protocolado.`);

    const ano = Number(diaCivil(new Date()).slice(0, 4));
    const processo = await criarProcessoNaTransacao(tx, zAbrirProcesso.parse({
      exercicio: ano, assuntoId: servico.assuntoId, requerenteId: titularId, finalidade: "ATENDIMENTO_AO_PUBLICO",
      textoAbertura: textoDeAbertura(servico.titulo, versao.numero, campos, r.ok), setorAberturaId: versao.setorDeEntradaId,
      aceitouTermo: d.aceitouTermo, criadoPor: d.criadoPor,
    }));
    const s = await tx.solicitacaoDeServico.create({
      data: { versaoId: versao.id, processoId: processo.processoId, titularId, representacaoId, respostas: r.ok, criadoPor: d.criadoPor },
      select: { id: true },
    });
    if (servico.tipo === "ATUALIZACAO_CADASTRAL") {
      const base = await tx.versaoDePessoa.findFirst({ where: { pessoaId: titularId }, orderBy: { criadoEm: "desc" }, select: { id: true, nome: true, nomeFantasia: true, email: true, telefone: true, logradouro: true, numero: true, complemento: true, bairro: true, municipio: true, uf: true, cep: true, ativa: true } });
      if (base === null) throw new Error("CADASTRO-SEM-VERSAO: a pessoa não tem versão de cadastro para alterar. Nada foi protocolado.");
      dadosDaVersaoProposta(base, titularId, r.ok, "conferência da proposta", d.criadoPor);
      // ⚠️ A PROPOSTA GUARDA A VERSÃO QUE O REQUERENTE VIU. Nada no cadastro muda aqui.
      await tx.propostaDeAlteracaoCadastral.create({ data: { solicitacaoId: s.id, pessoaId: titularId, versaoBaseId: base.id, dados: r.ok, criadoPor: d.criadoPor } });
    }
    await notificarVarios(tx, await interessados(tx, versao.setorDeEntradaId), {
      evento: "SOLICITACAO_PROTOCOLADA",
      titulo: `Nova solicitação ${processo.numero}/${processo.ano}: ${servico.titulo}`,
      corpo: `Protocolada pela carta de serviços${representacaoId === null ? "" : " por representação"}.`,
      rota: `/protocolo/processos/${processo.processoId}`,
    });
    return { solicitacaoId: s.id, processoId: processo.processoId, protocolo: `${processo.numero}/${processo.ano}`, versao: versao.numero, titular: titular.versoes[0]?.nome ?? titular.documento, viaRepresentacao: representacaoId !== null };
  });
}

/** O estado da solicitação para os predicados de `carta.ts`, lido dentro da transação. */
async function estadoDaSolicitacao(tx: Tx, solicitacaoId: string) {
  await travar(tx, "SolicitacaoDeServico", [solicitacaoId]);
  const s = await tx.solicitacaoDeServico.findUnique({
    where: { id: solicitacaoId },
    select: { id: true, titularId: true, processoId: true, versao: { select: { servico: { select: { tipo: true, titulo: true } } } }, decisao: { select: { id: true } }, proposta: { select: { id: true, pessoaId: true, versaoBaseId: true, dados: true } } },
  });
  if (s === null) throw new Error(`Solicitação ${solicitacaoId} não existe. Nada foi gravado.`);
  const p = await carregar(tx, s.processoId);
  const vigentes = movimentosVigentes(p.movimentos);
  const pendentesDe = (pedido: string, resposta: string) => {
    const respondidos = new Set(vigentes.filter((m) => m.tipo === resposta).map((m) => m.respondeAId));
    return vigentes.filter((m) => m.tipo === pedido && !respondidos.has(m.id)).map((m) => m.id);
  };
  const pendentes = pendentesDe("READEQUACAO_SOLICITADA", "READEQUACAO_ATENDIDA");
  const situacao = situacaoDoProcesso(p.movimentos);
  const estado: EstadoDaSolicitacaoDaCarta = {
    protocolo: rotulo(p), fechado: estaFechado(situacao), decidida: s.decisao !== null, exigenciasPendentes: pendentes.length,
    emTramite: situacao === "EM_TRAMITE", pareceresPendentes: pendentesDe("PARECER_SOLICITADO", "PARECER_RESPONDIDO").length,
  };
  return { s, p, estado, pendentes };
}

export const zEmitirExigencia = z.object({ solicitacaoId: z.string().min(1), mensagemAoRequerente: z.string().trim().min(10), criadoPor: z.string().min(1) });
export type EmitirExigenciaInput = z.input<typeof zEmitirExigencia>;

export async function emitirExigenciaDaSolicitacao(prisma: PrismaClient, input: EmitirExigenciaInput): Promise<{ readonly movimentoId: string }> {
  const d = zEmitirExigencia.parse(input);
  return prisma.$transaction(async (tx) => {
    const { s, p, estado } = await estadoDaSolicitacao(tx, d.solicitacaoId);
    const onde = setorAtual(p.setorAberturaId, p.movimentos);
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.emitirExigenciaDaSolicitacao, { setor: onde });
    await exigirLotacao(tx, d.criadoPor, onde, "emitir exigência nesta solicitação", ACAO_DO_SERVICO.emitirExigenciaDaSolicitacao, p.sigiloso);
    exigirElegivel(elegibilidadeParaEmitirExigencia(estado));
    // A exigência É o pedido de readequação do M21 — o texto é a MENSAGEM AO REQUERENTE.
    const m = await tx.movimentoDoProcesso.create({ data: { processoId: p.id, tipo: "READEQUACAO_SOLICITADA", setorOrigemId: onde, texto: d.mensagemAoRequerente, criadoPor: d.criadoPor }, select: { id: true } });
    await notificarVarios(tx, await contasDoTitular(tx, s.titularId), {
      evento: "EXIGENCIA_NA_SOLICITACAO",
      titulo: `Sua solicitação ${rotulo(p)} tem uma exigência`,
      corpo: d.mensagemAoRequerente,
      rota: `/meus-servicos/${s.id}`,
    });
    return { movimentoId: m.id };
  });
}

/** As contas que agem pelo titular hoje: a vinculada à pessoa e os representantes vigentes. */
async function contasDoTitular(tx: Tx, titularId: string): Promise<readonly string[]> {
  const vinculos = await tx.vinculoUsuarioPessoa.findMany({ where: { pessoaId: titularId }, orderBy: { criadoEm: "desc" }, select: { usuarioId: true, tipo: true, usuario: { select: { identificador: true } } } });
  const vistos = new Set<string>();
  const contas: string[] = [];
  for (const v of vinculos) {
    if (vistos.has(v.usuarioId)) continue;
    vistos.add(v.usuarioId);
    const atual = await pessoaDoUsuario(tx, v.usuario.identificador);
    if (atual?.pessoaId === titularId) contas.push(v.usuario.identificador);
  }
  const reps = await tx.representacaoDePessoa.findMany({ where: { representadaId: titularId }, select: { vigenciaInicio: true, vigenciaFim: true, revogacao: { select: { dataEfeito: true } }, representanteUsuario: { select: { identificador: true, ativo: true } } } });
  for (const r of reps) if (r.representanteUsuario.ativo && representacaoVigenteEm(r, new Date())) contas.push(r.representanteUsuario.identificador);
  return contas;
}

export const zResponderExigencia = z.object({ solicitacaoId: z.string().min(1), texto: z.string().trim().min(5), criadoPor: z.string().min(1) });
export type ResponderExigenciaInput = z.input<typeof zResponderExigencia>;

export async function responderExigenciaDaSolicitacao(prisma: PrismaClient, input: ResponderExigenciaInput): Promise<{ readonly movimentoId: string }> {
  const d = zResponderExigencia.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.responderExigenciaDaSolicitacao, "ENTE");
    const { s, p, estado, pendentes } = await estadoDaSolicitacao(tx, d.solicitacaoId);
    // ⚠️ A TITULARIDADE É CONFERIDA HOJE: representação revogada não responde mais.
    if ((await titularidade(tx, d.criadoPor, s.titularId, new Date())) === null) throw new Error("SEM-ACESSO-A-SOLICITACAO: esta solicitação não é sua nem de quem você representa hoje. Nada foi gravado.");
    exigirElegivel(elegibilidadeParaResponderExigencia(estado));
    const m = await tx.movimentoDoProcesso.create({ data: { processoId: p.id, tipo: "READEQUACAO_ATENDIDA", respondeAId: pendentes[0] as string, texto: d.texto, criadoPor: d.criadoPor }, select: { id: true } });
    await notificarVarios(tx, await interessados(tx, setorAtual(p.setorAberturaId, p.movimentos)), {
      evento: "EXIGENCIA_RESPONDIDA",
      titulo: `Exigência respondida na solicitação ${rotulo(p)}`,
      corpo: d.texto,
      rota: `/protocolo/processos/${p.id}`,
    });
    return { movimentoId: m.id };
  });
}

export const zAnexarNaSolicitacao = z.object({
  solicitacaoId: z.string().min(1),
  nomeOriginal: z.string().trim().min(1).max(200),
  mimeType: z.string().min(1),
  conteudo: z.instanceof(Uint8Array),
  criadoPor: z.string().min(1),
});
export type AnexarNaSolicitacaoInput = z.input<typeof zAnexarNaSolicitacao>;

/** O REQUERENTE anexa (na solicitação aberta). O anexo nasce visível a ele — e só a ele e ao processo. */
export async function anexarDoRequerente(prisma: PrismaClient, input: AnexarNaSolicitacaoInput): Promise<{ readonly anexoId: string }> {
  const d = zAnexarNaSolicitacao.parse(input);
  const recusa = recusaDoArquivo(d.mimeType, d.conteudo.byteLength, "UPLOAD");
  if (recusa !== null) throw new Error(recusa);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.anexarDoRequerente, "ENTE");
    const { s, estado } = await estadoDaSolicitacao(tx, d.solicitacaoId);
    if ((await titularidade(tx, d.criadoPor, s.titularId, new Date())) === null) throw new Error("SEM-ACESSO-A-SOLICITACAO: esta solicitação não é sua nem de quem você representa hoje. Nada foi gravado.");
    if (estado.decidida || estado.fechado) throw new AtoInelegivelError({ situacao: "NAO_APLICAVEL", codigo: "SOLICITACAO-ENCERRADA", motivo: `A solicitação ${estado.protocolo} já foi decidida ou encerrada.` });
    return { anexoId: await gravarAnexoDaSolicitacao(tx, s.id, s.processoId, d, "REQUERENTE") };
  });
}

/** O ENTE disponibiliza um documento de RESPOSTA ao requerente. */
export async function disponibilizarRespostaDaSolicitacao(prisma: PrismaClient, input: AnexarNaSolicitacaoInput): Promise<{ readonly anexoId: string }> {
  const d = zAnexarNaSolicitacao.parse(input);
  const recusa = recusaDoArquivo(d.mimeType, d.conteudo.byteLength, "UPLOAD");
  if (recusa !== null) throw new Error(recusa);
  return prisma.$transaction(async (tx) => {
    const { s, p } = await estadoDaSolicitacao(tx, d.solicitacaoId);
    const onde = setorAtual(p.setorAberturaId, p.movimentos);
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.disponibilizarRespostaDaSolicitacao, { setor: onde });
    await exigirLotacao(tx, d.criadoPor, onde, "disponibilizar resposta nesta solicitação", ACAO_DO_SERVICO.disponibilizarRespostaDaSolicitacao, p.sigiloso);
    const anexoId = await gravarAnexoDaSolicitacao(tx, s.id, s.processoId, d, "RESPOSTA");
    await notificarVarios(tx, await contasDoTitular(tx, s.titularId), { evento: "RESPOSTA_DISPONIVEL", titulo: `Documento disponível na solicitação ${rotulo(p)}`, corpo: d.nomeOriginal, rota: `/meus-servicos/${s.id}` });
    return { anexoId };
  });
}

async function gravarAnexoDaSolicitacao(tx: Tx, solicitacaoId: string, processoId: string, d: z.output<typeof zAnexarNaSolicitacao>, origem: "REQUERENTE" | "RESPOSTA"): Promise<string> {
  // O anexo pertence ao PROCESSO (a visão da mesa é a do M21); a ligação diz o que o requerente vê.
  const { anexoId } = await gravarAnexoNaTransacao(tx, { nomeOriginal: d.nomeOriginal, mimeType: d.mimeType, conteudo: d.conteudo, origem: "UPLOAD", processoId, criadoPor: d.criadoPor });
  await tx.anexoDaSolicitacao.create({ data: { anexoId, solicitacaoId, origem, criadoPor: d.criadoPor } });
  return anexoId;
}

export const zDecidirSolicitacao = z.object({
  solicitacaoId: z.string().min(1),
  resultado: z.enum(["DEFERIDA", "INDEFERIDA"]),
  mensagemAoRequerente: z.string().trim().min(10),
  fundamentoInterno: z.string().trim().min(5),
  criadoPor: z.string().min(1),
});
export type DecidirSolicitacaoInput = z.input<typeof zDecidirSolicitacao>;

export async function decidirSolicitacao(prisma: PrismaClient, input: DecidirSolicitacaoInput): Promise<{ readonly decisaoId: string; readonly versaoDoCadastro: string | null }> {
  const d = zDecidirSolicitacao.parse(input);
  return prisma.$transaction(async (tx) => {
    const { s, p, estado } = await estadoDaSolicitacao(tx, d.solicitacaoId);
    const onde = setorAtual(p.setorAberturaId, p.movimentos);
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.decidirSolicitacao, { setor: onde });
    await exigirLotacao(tx, d.criadoPor, onde, "decidir esta solicitação", ACAO_DO_SERVICO.decidirSolicitacao, p.sigiloso);
    exigirElegivel(elegibilidadeParaDecidir(estado));
    // ⚠️ SEGREGAÇÃO MÍNIMA: quem pediu não decide o próprio pedido.
    if ((await titularidade(tx, d.criadoPor, s.titularId, new Date())) !== null) {
      throw new Error("AUTODECISAO: você é o titular (ou representa o titular) desta solicitação e não pode decidi-la. Nada foi gravado.");
    }
    const versaoDoCadastro = s.proposta !== null && d.resultado === "DEFERIDA" ? await aplicarPropostaCadastral(tx, s.proposta, rotulo(p), d.fundamentoInterno, d.criadoPor) : null;
    const decisao = await tx.decisaoDaSolicitacao.create({ data: { solicitacaoId: s.id, resultado: d.resultado, mensagemAoRequerente: d.mensagemAoRequerente, fundamentoInterno: d.fundamentoInterno, versaoDoCadastroId: versaoDoCadastro, criadoPor: d.criadoPor }, select: { id: true } });
    // O ENCERRAMENTO segue o principal e os apensos, como no encerramento interno.
    for (const alvo of await alvosDaMovimentacao(tx, p.id)) {
      await tx.movimentoDoProcesso.create({ data: { processoId: alvo, tipo: "ENCERRAMENTO", setorOrigemId: onde, texto: `Solicitação ${d.resultado === "DEFERIDA" ? "DEFERIDA" : "INDEFERIDA"}. Fundamento interno: ${d.fundamentoInterno}`, criadoPor: d.criadoPor } });
    }
    await notificarVarios(tx, await contasDoTitular(tx, s.titularId), { evento: "SOLICITACAO_DECIDIDA", titulo: `Sua solicitação ${rotulo(p)} foi ${d.resultado === "DEFERIDA" ? "deferida" : "indeferida"}`, corpo: d.mensagemAoRequerente, rota: `/meus-servicos/${s.id}` });
    return { decisaoId: decisao.id, versaoDoCadastro };
  });
}

/**
 * DEFERIR A ATUALIZAÇÃO CADASTRAL cria a versão nova da pessoa — o mesmo ato de alterar o cadastro,
 * e por isso cobra TAMBÉM a ação de alterar pessoa: decidir a solicitação não é atalho para editar o
 * cadastro de ninguém.
 *
 * ⚠️ SÓ SE O CADASTRO NÃO MUDOU desde a proposta. Senão o deferimento sobrescreveria uma alteração que
 * o requerente não viu.
 */
async function aplicarPropostaCadastral(
  tx: Tx,
  proposta: { readonly pessoaId: string; readonly versaoBaseId: string; readonly dados: unknown },
  protocolo: string,
  fundamento: string,
  criadoPor: string,
): Promise<string> {
  await autorizarNo(tx, criadoPor, ACAO_DO_SERVICO.alterarPessoa, "ENTE");
  const atual = await tx.versaoDePessoa.findFirst({ where: { pessoaId: proposta.pessoaId }, orderBy: { criadoEm: "desc" }, select: { id: true, nome: true, nomeFantasia: true, email: true, telefone: true, logradouro: true, numero: true, complemento: true, bairro: true, municipio: true, uf: true, cep: true, ativa: true } });
  if (atual === null || atual.id !== proposta.versaoBaseId) {
    throw new Error("CADASTRO-MUDOU-DESDE-A-PROPOSTA: o cadastro da pessoa foi alterado depois do pedido. Deferir agora sobrescreveria uma alteração que o requerente não viu — emita exigência para ele confirmar. Nada foi gravado.");
  }
  const v = dadosDaVersaoProposta(atual, proposta.pessoaId, proposta.dados as Readonly<Record<string, string>>, `Atualização cadastral deferida na solicitação ${protocolo}: ${fundamento}`, criadoPor);
  const nova = await tx.versaoDePessoa.create({
    data: {
      pessoaId: v.pessoaId, nome: v.nome, nomeFantasia: v.nomeFantasia ?? null, email: v.email ?? null, telefone: v.telefone ?? null,
      logradouro: v.logradouro ?? null, numero: v.numero ?? null, complemento: v.complemento ?? null, bairro: v.bairro ?? null,
      municipio: v.municipio ?? null, uf: v.uf ?? null, cep: v.cep ?? null, ativa: v.ativa, motivo: v.motivo, criadoPor: v.criadoPor,
    },
    select: { id: true },
  });
  return nova.id;
}

type VersaoCadastralAtual = { readonly nome: string } & { readonly [K in "nomeFantasia" | "email" | "telefone" | "logradouro" | "numero" | "complemento" | "bairro" | "municipio" | "uf" | "cep"]: string | null } & { readonly ativa: boolean };

/**
 * A versão que a proposta produziria — a atual com os campos propostos por cima, validada pela MESMA
 * regra do cadastro (`zAlterarPessoa`: e-mail, UF, CEP). Roda no protocolo (o requerente vê o erro na
 * hora) e de novo na decisão.
 */
function dadosDaVersaoProposta(atual: VersaoCadastralAtual, pessoaId: string, dados: Readonly<Record<string, string>>, motivo: string, criadoPor: string) {
  const campo = (k: keyof VersaoCadastralAtual & string): string | undefined => dados[k] ?? (atual[k] as string | null) ?? undefined;
  const r = zAlterarPessoa.safeParse({
    pessoaId, nome: campo("nome"), nomeFantasia: campo("nomeFantasia"), email: campo("email"), telefone: campo("telefone"), logradouro: campo("logradouro"),
    numero: campo("numero"), complemento: campo("complemento"), bairro: campo("bairro"), municipio: campo("municipio"), uf: campo("uf"), cep: campo("cep"),
    ativa: atual.ativa, motivo, criadoPor,
  });
  if (!r.success) throw new Error(`PROPOSTA-CADASTRAL-INVALIDA: ${r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}. Nada foi gravado.`);
  return r.data;
}

// ═══════════════════════════════════════════════════════════════════════════
// V7 M1 U4 — A MANIFESTAÇÃO DE OUVIDORIA SEM CONTA
// ═══════════════════════════════════════════════════════════════════════════

/** Quantos envios públicos sem conta a mesma chave (dia × origem × finalidade) pode fazer por hora. */
export const QUOTA_DE_ENVIOS_SEM_CONTA_POR_HORA = 5;

const hashDoSegredo = (segredo: string): string => createHash("sha256").update(`ouvidoria:${segredo.trim().toUpperCase()}`).digest("hex");

/** O segredo: 20 caracteres do alfabeto do verificador (sem ambíguos), de 32 bytes aleatórios. */
function novoSegredo(): string {
  const bytes = randomBytes(32);
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 20; i += 1) s += alfabeto[bytes[i]! % alfabeto.length];
  return `${s.slice(0, 5)}-${s.slice(5, 10)}-${s.slice(10, 15)}-${s.slice(15, 20)}`;
}

export const zRegistrarManifestacaoAnonima = z.object({
  slug: z.string().min(1),
  tipo: z.enum(["DENUNCIA", "DUVIDA", "SUGESTAO", "RECLAMACAO", "ELOGIO"]),
  respostas: z.record(z.string(), z.string()),
  /** Opcional: só se o manifestante QUIS informar como ser contatado. */
  contato: z.string().trim().min(5).max(200).optional(),
  aceitouTermo: z.boolean().default(false),
  /** sha256(dia + origem + finalidade), calculada pela borda; o IP em claro não chega aqui. */
  chaveDeQuota: z.string().regex(/^[0-9a-f]{64}$/),
});
export type RegistrarManifestacaoAnonimaInput = z.input<typeof zRegistrarManifestacaoAnonima>;

/**
 * REGISTRA A MANIFESTAÇÃO SEM CONTA — o ATO PÚBLICO da ouvidoria.
 *
 * ⚠️ NÃO HÁ AUTOR NEM PESSOA: o processo nasce sem requerente (nenhuma Pessoa fictícia), SIGILOSO, no
 * setor de entrada da versão publicada; quem o alcança é quem está lotado na ouvidoria. O autor técnico
 * gravado é a constante `OUVIDORIA-SEM-CONTA`.
 * ⚠️ QUOTA LOCAL, dita como tal: a mesma chave não passa de `QUOTA_DE_ENVIOS_SEM_CONTA_POR_HORA` por hora.
 * Nenhum captcha/antiabuso externo está conectado.
 * ⚠️ O SEGREDO VOLTA UMA VEZ, aqui. O banco guarda o sha256; quem perdeu o segredo não acompanha — e isso
 * é a proteção, não defeito.
 */
export async function registrarManifestacaoAnonima(prisma: PrismaClient, input: RegistrarManifestacaoAnonimaInput): Promise<{ readonly protocolo: string; readonly segredo: string }> {
  const d = zRegistrarManifestacaoAnonima.parse(input);
  return prisma.$transaction(async (tx) => {
    const recentes = await tx.envioPublicoSemConta.count({ where: { chave: d.chaveDeQuota, criadoEm: { gte: new Date(Date.now() - 3600_000) } } });
    if (recentes >= QUOTA_DE_ENVIOS_SEM_CONTA_POR_HORA) {
      throw new Error("QUOTA-DE-ENVIOS: muitos envios desta origem na última hora. Tente mais tarde — a leitura da carta e da ouvidoria continua livre.");
    }
    const servico = await tx.servicoDaCarta.findUnique({
      where: { slug: d.slug },
      select: { titulo: true, tipo: true, assuntoId: true, versoes: { where: { publicacao: { isNot: null } }, orderBy: { numero: "desc" }, take: 1, select: { numero: true, campos: true, setorDeEntradaId: true } } },
    });
    const versao = servico?.versoes[0];
    if (servico === null || versao === undefined || servico.tipo !== "MANIFESTACAO_ANONIMA") throw new Error("OUVIDORIA-NAO-PUBLICADA: não há serviço de ouvidoria sem conta publicado neste endereço. Nada foi registrado.");
    const campos = (versao.campos as unknown as CampoDoFormulario[]) ?? [];
    const r = validarRespostas(campos, d.respostas);
    if ("erros" in r) throw new Error(`FORMULARIO-INCOMPLETO: ${r.erros.join("; ")}. Nada foi registrado.`);
    const ano = Number(diaCivil(new Date()).slice(0, 4));
    const processo = await criarProcessoNaTransacao(tx, {
      exercicio: ano, assuntoId: servico.assuntoId, finalidade: "ATENDIMENTO_AO_PUBLICO", prioridade: "NORMAL", sigiloso: true, documentacaoFisica: false,
      textoAbertura: `Manifestação de ouvidoria (${d.tipo.toLowerCase()}) sem conta.\n${textoDeAbertura(servico.titulo, versao.numero, campos, r.ok)}`,
      setorAberturaId: versao.setorDeEntradaId, requerentesAdicionais: [], aceitouTermo: d.aceitouTermo, criadoPor: "OUVIDORIA-SEM-CONTA",
      // Sem requerente e sem contato obrigatório: o canal de retorno é o protocolo com o segredo. O
      // refinamento "requerente OU contato" da abertura interna não se aplica a este ato público.
      contatoAnonimo: d.contato,
    } as ReturnType<typeof zAbrirProcesso.parse>);
    const segredo = novoSegredo();
    await tx.manifestacaoDeOuvidoria.create({ data: { processoId: processo.processoId, tipo: d.tipo, hashDoSegredo: hashDoSegredo(segredo), contato: d.contato ?? null } });
    await tx.envioPublicoSemConta.create({ data: { chave: d.chaveDeQuota, finalidade: "MANIFESTACAO" } });
    await notificarVarios(tx, await interessados(tx, versao.setorDeEntradaId), {
      evento: "MANIFESTACAO_DE_OUVIDORIA",
      titulo: `Nova manifestação de ouvidoria ${processo.numero}/${processo.ano}`,
      corpo: "Manifestação sem conta aguardando triagem.",
      rota: `/protocolo/ouvidoria`,
    });
    return { protocolo: `${processo.numero}/${processo.ano}`, segredo };
  });
}

export interface AcompanhamentoDaManifestacao {
  readonly protocolo: string;
  readonly situacao: "RECEBIDA" | "EM_TRIAGEM" | "RESPONDIDA" | "CONCLUIDA";
  readonly recebidaEm: Date;
  readonly respostas: readonly { readonly texto: string; readonly em: Date; readonly conclusiva: boolean }[];
}

/**
 * ACOMPANHA PELO PROTOCOLO E PELO SEGREDO — a projeção LIMITADA: situação e respostas liberadas. Sem texto
 * original, sem triagem, sem setor, sem anexo. Protocolo ou segredo errado respondem `null`, igual.
 */
export async function acompanharManifestacao(prisma: PrismaClient, protocolo: string, segredo: string): Promise<AcompanhamentoDaManifestacao | null> {
  const m = /^(\d{1,8})\/(\d{4})$/.exec(protocolo.trim());
  if (m === null || segredo.trim().length < 20) return null;
  const achada = await prisma.manifestacaoDeOuvidoria.findUnique({
    where: { hashDoSegredo: hashDoSegredo(segredo) },
    select: { criadoEm: true, processo: { select: { numero: true, exercicio: { select: { ano: true } } } }, triagem: { select: { id: true } }, respostas: { orderBy: { criadoEm: "asc" }, select: { texto: true, criadoEm: true, conclusiva: true } } },
  });
  if (achada === null || achada.processo.numero !== Number(m[1]) || achada.processo.exercicio.ano !== Number(m[2])) return null;
  const situacao = achada.respostas.some((r) => r.conclusiva) ? "CONCLUIDA" : achada.respostas.length > 0 ? "RESPONDIDA" : achada.triagem !== null ? "EM_TRIAGEM" : "RECEBIDA";
  return { protocolo: `${achada.processo.numero}/${achada.processo.exercicio.ano}`, situacao, recebidaEm: achada.criadoEm, respostas: achada.respostas.map((r) => ({ texto: r.texto, em: r.criadoEm, conclusiva: r.conclusiva })) };
}

/** Trava a manifestação ANTES de ler — ler e depois travar decidiria sobre um estado já velho. */
async function manifestacaoParaOAto(tx: Tx, manifestacaoId: string) {
  await travar(tx, "ManifestacaoDeOuvidoria", [manifestacaoId]);
  const mf = await tx.manifestacaoDeOuvidoria.findUnique({ where: { id: manifestacaoId }, select: { id: true, processoId: true, triagem: { select: { id: true } }, respostas: { select: { conclusiva: true } } } });
  if (mf === null) throw new Error(`Manifestação ${manifestacaoId} não existe. Nada foi gravado.`);
  const p = await carregar(tx, mf.processoId);
  return { mf, p, onde: setorAtual(p.setorAberturaId, p.movimentos) };
}

export const zTriarManifestacao = z.object({ manifestacaoId: z.string().min(1), tipoConfirmado: z.enum(["DENUNCIA", "DUVIDA", "SUGESTAO", "RECLAMACAO", "ELOGIO"]), anotacaoInterna: z.string().trim().min(5), criadoPor: z.string().min(1) });
export type TriarManifestacaoInput = z.input<typeof zTriarManifestacao>;

/** A TRIAGEM — tipo confirmado e anotação INTERNA (não vai ao manifestante). Uma por manifestação. */
export async function triarManifestacao(prisma: PrismaClient, input: TriarManifestacaoInput): Promise<{ readonly triagemId: string }> {
  const d = zTriarManifestacao.parse(input);
  try {
    return await prisma.$transaction(async (tx) => {
      const { mf, p, onde } = await manifestacaoParaOAto(tx, d.manifestacaoId);
      await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.triarManifestacao, { setor: onde });
      await exigirLotacao(tx, d.criadoPor, onde, "triar esta manifestação", ACAO_DO_SERVICO.triarManifestacao, p.sigiloso);
      exigirAberto(p, "triagem");
      if (mf.triagem !== null) throw new Error("MANIFESTACAO-JA-TRIADA: a triagem desta manifestação já foi registrada. Nada foi gravado.");
      return { triagemId: (await tx.triagemDaManifestacao.create({ data: { manifestacaoId: mf.id, tipoConfirmado: d.tipoConfirmado, anotacaoInterna: d.anotacaoInterna, criadoPor: d.criadoPor }, select: { id: true } })).id };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new Error("MANIFESTACAO-JA-TRIADA: outra triagem foi registrada no mesmo instante. Nada foi gravado.");
    throw e;
  }
}

export const zResponderManifestacao = z.object({ manifestacaoId: z.string().min(1), texto: z.string().trim().min(10), conclusiva: z.boolean(), criadoPor: z.string().min(1) });
export type ResponderManifestacaoInput = z.input<typeof zResponderManifestacao>;

/** A RESPOSTA liberada ao manifestante; a conclusiva encerra o processo (e o apenso, se houver). */
export async function responderManifestacao(prisma: PrismaClient, input: ResponderManifestacaoInput): Promise<{ readonly respostaId: string }> {
  const d = zResponderManifestacao.parse(input);
  return prisma.$transaction(async (tx) => {
    const { mf, p, onde } = await manifestacaoParaOAto(tx, d.manifestacaoId);
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.responderManifestacao, { setor: onde });
    await exigirLotacao(tx, d.criadoPor, onde, "responder esta manifestação", ACAO_DO_SERVICO.responderManifestacao, p.sigiloso);
    exigirAberto(p, "resposta");
    if (mf.triagem === null) throw new Error("MANIFESTACAO-SEM-TRIAGEM: registre a triagem antes de responder. Nada foi gravado.");
    if (mf.respostas.some((r) => r.conclusiva)) throw new Error("MANIFESTACAO-CONCLUIDA: já há resposta conclusiva. Nada foi gravado.");
    const situacao = situacaoDoProcesso(p.movimentos);
    if (d.conclusiva && (situacao === "AGUARDANDO_PARECER" || situacao === "AGUARDANDO_READEQUACAO")) {
      throw new Error(`MANIFESTACAO-COM-PENDENCIA: o processo ${rotulo(p)} está ${descreverSituacao(situacao).toLowerCase()}; resolva a pendência antes da resposta conclusiva. Nada foi gravado.`);
    }
    const r = await tx.respostaDaOuvidoria.create({ data: { manifestacaoId: mf.id, texto: d.texto, conclusiva: d.conclusiva, criadoPor: d.criadoPor }, select: { id: true } });
    if (d.conclusiva) {
      for (const alvo of await alvosDaMovimentacao(tx, p.id)) {
        await tx.movimentoDoProcesso.create({ data: { processoId: alvo, tipo: "ENCERRAMENTO", setorOrigemId: onde, texto: "Manifestação respondida de forma conclusiva pela ouvidoria.", criadoPor: d.criadoPor } });
      }
    }
    return { respostaId: r.id };
  });
}
