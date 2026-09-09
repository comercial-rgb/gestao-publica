import { randomBytes } from "node:crypto";
import { travar } from "../../packages/locks/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import type { Tx } from "../m16-travamento/autorizacao.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { notificarVarios } from "../m24-notificacoes/notificacoes.js";
import {
  apensosDe,
  codigoVerificador,
  descreverSituacao,
  estaFechado,
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

/** Este usuário tem alguma permissão GLOBAL? É o que o catálogo chama de gestor. */
async function ehGestor(tx: Tx, identificador: string): Promise<boolean> {
  const u = await tx.usuario.findUnique({
    where: { identificador },
    select: {
      vinculos: {
        select: {
          perfil: { select: { permissoes: { select: { unidadeOrcId: true } } } },
        },
      },
    },
  });
  if (u === null) return false;
  return u.vinculos.some((v) =>
    v.perfil.permissoes.some((perm) => perm.unidadeOrcId === null)
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
  oQue: string
): Promise<void> {
  const lotado = await tx.usuarioDoSetor.findUnique({
    where: { usuarioIdent_setorId: { usuarioIdent: identificador, setorId } },
    select: { id: true },
  });
  if (lotado !== null) return;

  if (await ehGestor(tx, identificador)) return;

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
    await exigirLotacao(tx, d.criadoPor, d.setorAberturaId, "abrir processo aqui");

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

  return prisma.$transaction(async (tx) => {
    const p = await carregar(tx, d.processoId);
    const origem = setorAtual(p.setorAberturaId, p.movimentos);

    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.tramitar, { setor: origem });
    await exigirLotacao(tx, d.criadoPor, origem, "tramitar este processo");

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
  });
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

  return prisma.$transaction(async (tx) => {
    const p = await carregar(tx, d.processoId);
    const destino = setorAtual(p.setorAberturaId, p.movimentos);

    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.receberProcesso, {
      setor: destino,
    });
    await exigirLotacao(tx, d.criadoPor, destino, "receber este processo");

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
  });
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
    await exigirLotacao(tx, d.criadoPor, onde, "complementar este processo");
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
    await exigirLotacao(tx, d.criadoPor, onde, "pedir parecer neste processo");
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
    await exigirLotacao(tx, d.criadoPor, setorDoParecer, "responder este parecer");
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
    await exigirLotacao(tx, d.criadoPor, onde, "pedir readequação neste processo");
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
      await exigirLotacao(tx, d.criadoPor, onde, "atender a readequação por dentro");
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
    await exigirLotacao(tx, d.criadoPor, onde, "encerrar este processo");
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
    await exigirLotacao(tx, d.criadoPor, onde, "arquivar este processo");

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
    await exigirLotacao(tx, d.criadoPor, onde, "reabrir este processo");

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
    await exigirLotacao(tx, d.criadoPor, onde, "apensar processos aqui");

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
    await exigirLotacao(tx, d.criadoPor, onde, "desapensar processos aqui");

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
    await exigirLotacao(tx, d.criadoPor, onde, "tornar movimento sem efeito aqui");
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
