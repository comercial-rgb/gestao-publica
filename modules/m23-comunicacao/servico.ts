import { travar } from "../../packages/locks/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import type { Tx } from "../m16-travamento/autorizacao.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { notificarVarios } from "../m24-notificacoes/notificacoes.js";
import {
  foiEnviado,
  hashDoComunicado,
  setoresEnvolvidos,
  zCriarTipoDeComunicado,
  zEditarRascunho,
  zEncaminharComunicado,
  zEnviarComunicado,
  zEtiquetarComunicado,
  zMarcarLeitura,
  zMovimentoPessoal,
  zRascunharComunicado,
  zResponderComunicado,
  type CriarTipoDeComunicadoInput,
  type EditarRascunhoInput,
  type EncaminharComunicadoInput,
  type EnviarComunicadoInput,
  type EtiquetarComunicadoInput,
  type MarcarLeituraInput,
  type MovimentoPessoalInput,
  type RascunharComunicadoInput,
  type ResponderComunicadoInput,
} from "./dominio.js";

/**
 * M23 — OS CASOS DE USO DA COMUNICAÇÃO INTERNA.
 *
 * ═══ ⚠️ CIRCULAR NÃO ACEITA RESPOSTA, E ISSO É REGRA DO SERVIDOR ═══
 * Não é um botão escondido: `responderComunicado` recusa um comunicado cujo tipo tem
 * `aceitaResposta = false`. Um botão oculto e um servidor permissivo é o desenho que
 * uma requisição direta atravessa.
 *
 * ═══ ⚠️ RESPONDER ALCANÇA QUEM JÁ ESTAVA; ENCAMINHAR É QUE INCLUI ALGUÉM NOVO ═══
 * A resposta só pode ir para os setores já envolvidos. Se pudesse ir para qualquer um,
 * "responder" seria "encaminhar" sem o registro — e o setor novo receberia a conversa
 * inteira sem que nenhum ato tivesse decidido incluí-lo.
 */

// ═══════════════════════════════════════════════════════════════════════════
// CADASTRO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ MEMORANDO, OFÍCIO E CIRCULAR SÃO DADOS, NÃO VALORES DE ENUM. O catálogo pede
 * "entre outros tipos adicionais, conforme a necessidade da contratante" — um enum
 * obrigaria uma migration a cada tipo que uma prefeitura inventasse.
 */
export async function criarTipoDeComunicado(
  prisma: PrismaClient,
  input: CriarTipoDeComunicadoInput
): Promise<{ readonly tipoId: string }> {
  const d = zCriarTipoDeComunicado.parse(input);

  return prisma.$transaction(async (tx) => {
    // Cadastro do ENTE: um tipo de comunicado vale para a entidade inteira, e por isso
    // só a permissão global o autoriza — como o cadastro de pessoas (M19).
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.criarTipoDeComunicado, "ENTE");

    const existente = await tx.tipoDeComunicado.findUnique({
      where: { codigo: d.codigo },
      select: { nome: true },
    });
    if (existente !== null) {
      throw new Error(
        `Já existe o tipo de comunicado "${d.codigo}" (${existente.nome}). Nada foi gravado.`
      );
    }

    const tipo = await tx.tipoDeComunicado.create({
      data: {
        codigo: d.codigo,
        nome: d.nome,
        aceitaResposta: d.aceitaResposta,
        modoDeAssinaturaExigido: d.modoDeAssinaturaExigido ?? null,
        criadoPor: d.criadoPor,
        setoresAutorizados: {
          create: [...new Set(d.setoresAutorizados)].map((setorId) => ({ setorId })),
        },
      },
      select: { id: true },
    });
    return { tipoId: tipo.id };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// RASCUNHO E ENVIO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * O RASCUNHO — um comunicado sem movimento de `ENVIO`.
 *
 * ⚠️ ELE JÁ NASCE NUMERADO, e é de propósito. Numerar só no envio pareceria mais
 * limpo, mas faria o número do documento mudar de lugar na fila conforme a ordem em que
 * as pessoas terminassem de escrever — e um memorando que já foi impresso para
 * assinatura mudaria de número antes de sair. Numerar na criação fixa a identidade do
 * documento no instante em que ele passa a existir.
 */
export async function rascunharComunicado(
  prisma: PrismaClient,
  input: RascunharComunicadoInput
): Promise<{ readonly comunicadoId: string; readonly numero: number }> {
  const d = zRascunharComunicado.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.rascunharComunicado, {
      setor: d.setorRemetenteId,
    });
    await exigirLotacao(tx, d.criadoPor, d.setorRemetenteId, "emitir comunicado por aqui");

    const tipo = await tx.tipoDeComunicado.findUnique({
      where: { id: d.tipoId },
      select: {
        id: true,
        nome: true,
        ativo: true,
        setoresAutorizados: { select: { setorId: true } },
      },
    });
    if (tipo === null || !tipo.ativo) {
      throw new Error(
        `Tipo de comunicado ${d.tipoId} não existe ou está desativado. Nada foi gravado.`
      );
    }
    // ⚠️ LISTA VAZIA = LIBERADO A TODOS. É a escolha oposta ao fail-closed do resto do
    // repositório, e é deliberada: aqui não se protege dinheiro nem sigilo — o pior caso
    // é um setor emitir um memorando que não devia. Ver o schema.
    if (
      tipo.setoresAutorizados.length > 0 &&
      !tipo.setoresAutorizados.some((s) => s.setorId === d.setorRemetenteId)
    ) {
      throw new Error(
        `O tipo "${tipo.nome}" está restrito a setores específicos, e este não é um ` +
          `deles. Nada foi gravado.`
      );
    }

    const exercicio = await tx.exercicio.findUnique({
      where: { ano: d.exercicio },
      select: { id: true },
    });
    if (exercicio === null) {
      throw new Error(`Exercício ${d.exercicio} não cadastrado. Nada foi gravado.`);
    }

    if (d.processoId !== undefined) {
      const p = await tx.processo.findUnique({
        where: { id: d.processoId },
        select: { id: true },
      });
      if (p === null) {
        throw new Error(`Processo ${d.processoId} não existe. Nada foi gravado.`);
      }
    }

    // ⚠️ O TRINCO É SOBRE A TRÍPLICE (exercício, tipo, setor), que é o grão da
    // numeração. Travar o exercício inteiro faria a Educação esperar a Saúde para
    // numerar um documento que não disputa fila nenhuma com ela.
    const chave = `${exercicio.id}:${tipo.id}:${d.setorRemetenteId}`;
    await travar(tx, "SequenciaDeComunicado", [chave]);

    const ultimo = await tx.comunicado.findFirst({
      where: {
        exercicioId: exercicio.id,
        tipoId: tipo.id,
        setorRemetenteId: d.setorRemetenteId,
      },
      select: { numero: true },
      orderBy: { numero: "desc" },
    });
    const numero = (ultimo?.numero ?? 0) + 1;

    const c = await tx.comunicado.create({
      data: {
        exercicioId: exercicio.id,
        numero,
        tipoId: tipo.id,
        setorRemetenteId: d.setorRemetenteId,
        assunto: d.assunto,
        corpo: d.corpo,
        processoId: d.processoId ?? null,
        criadoPor: d.criadoPor,
      },
      select: { id: true, numero: true },
    });
    return { comunicadoId: c.id, numero: c.numero };
  });
}

/**
 * EDITA O RASCUNHO — e recusa editar o que já foi enviado.
 *
 * ⚠️ ESTE É O ÚNICO UPDATE DE CONTEÚDO DO REPOSITÓRIO INTEIRO, e o grant do papel de
 * runtime é por COLUNA por isso (`Comunicado("assunto","corpo")`). O grant não sabe
 * dizer "só antes de enviar" — quem diz é este guard. E o que denuncia uma edição feita
 * mesmo assim, por outro caminho, é o hash carimbado no movimento de `ENVIO`.
 */
export async function editarRascunho(
  prisma: PrismaClient,
  input: EditarRascunhoInput
): Promise<{ readonly comunicadoId: string }> {
  const d = zEditarRascunho.parse(input);

  return prisma.$transaction(async (tx) => {
    const c = await carregar(tx, d.comunicadoId);

    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.editarRascunho, {
      setor: c.setorRemetenteId,
    });
    await exigirLotacao(tx, d.criadoPor, c.setorRemetenteId, "editar este rascunho");

    if (foiEnviado(c)) {
      throw new Error(
        `O comunicado ${c.rotulo} JÁ FOI ENVIADO e não se edita mais. Quem já leu leu o ` +
          `texto que saiu; alterá-lo agora mudaria, em silêncio, o documento que está na ` +
          `caixa de outras pessoas. Para corrigir, emita um novo comunicado referenciando ` +
          `este. Nada foi gravado.`
      );
    }

    await tx.comunicado.update({
      where: { id: c.id },
      data: { assunto: d.assunto, corpo: d.corpo },
    });
    return { comunicadoId: c.id };
  });
}

/**
 * ENVIA — cria os destinatários, carimba o hash do conteúdo e notifica.
 *
 * ⚠️ A ASSINATURA EXIGIDA PELO TIPO É COBRADA AQUI (Lei 14.063/2020). Um tipo que
 * declara exigir assinatura e um envio que passa sem ela é uma configuração decorativa.
 */
export async function enviarComunicado(
  prisma: PrismaClient,
  input: EnviarComunicadoInput
): Promise<{ readonly movimentoId: string; readonly destinatarios: number }> {
  const d = zEnviarComunicado.parse(input);

  return prisma.$transaction(async (tx) => {
    const c = await carregar(tx, d.comunicadoId);

    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.enviarComunicado, {
      setor: c.setorRemetenteId,
    });
    await exigirLotacao(tx, d.criadoPor, c.setorRemetenteId, "enviar este comunicado");

    if (foiEnviado(c)) {
      throw new Error(
        `O comunicado ${c.rotulo} já foi enviado. Reenviar duplicaria o documento na ` +
          `caixa de quem já o recebeu. Para incluir alguém novo, ENCAMINHE — e o ` +
          `encaminhamento fica registrado. Nada foi gravado.`
      );
    }

    if (c.modoDeAssinaturaExigido !== null) {
      if (d.modoDeAssinatura === undefined) {
        throw new Error(
          `O tipo "${c.tipoNome}" EXIGE assinatura ${c.modoDeAssinaturaExigido} e ela não ` +
            `veio. Um tipo que declara exigir assinatura e um envio que passa sem ela é ` +
            `configuração decorativa. Nada foi gravado.`
        );
      }
      if (d.modoDeAssinatura !== c.modoDeAssinaturaExigido) {
        throw new Error(
          `O tipo "${c.tipoNome}" exige assinatura ${c.modoDeAssinaturaExigido}, e veio ` +
            `${d.modoDeAssinatura}. Os modos da Lei 14.063/2020 não são intercambiáveis. ` +
            `Nada foi gravado.`
        );
      }
      if (d.modoDeAssinatura === "QUALIFICADA") {
        throw new Error(
          `Assinatura qualificada (ICP-Brasil) indisponível: nenhum provedor de ` +
            `certificado configurado neste ambiente. Ver a pendência ASSINATURA-ICP-HSM. ` +
            `Nada foi gravado.`
        );
      }
    }

    const setoresDestino = [...new Set(d.destinatarios.map((x) => x.setorId))];
    for (const setorId of setoresDestino) {
      await exigirSetorAtivo(tx, setorId);
    }
    if (setoresDestino.includes(c.setorRemetenteId)) {
      throw new Error(
        `O setor remetente não pode ser destinatário do próprio comunicado: ele já o tem ` +
          `na caixa de saída. Nada foi gravado.`
      );
    }

    await tx.destinatarioDoComunicado.createMany({
      data: d.destinatarios.map((x) => ({
        comunicadoId: c.id,
        setorId: x.setorId,
        aosCuidadosDe: x.aosCuidadosDe ?? null,
        porEncaminhamento: false,
      })),
      skipDuplicates: true,
    });

    const movimento = await tx.movimentoDoComunicado.create({
      data: {
        comunicadoId: c.id,
        tipo: "ENVIO",
        setorId: c.setorRemetenteId,
        // ⚠️ O CARIMBO DO CONTEÚDO — ver `editarRascunho` e o schema.
        hashConteudo: hashDoComunicado(c.assunto, c.corpo),
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });

    if (d.modoDeAssinatura !== undefined) {
      await tx.assinaturaDeDocumento.create({
        data: {
          modo: d.modoDeAssinatura,
          assinadoPor: d.criadoPor,
          hashConteudo: hashDoComunicado(c.assunto, c.corpo),
          movimentoComunicadoId: movimento.id,
        },
      });
    }

    await notificarVarios(tx, await lotadosEm(tx, setoresDestino), {
      evento: "COMUNICADO_RECEBIDO",
      titulo: `${c.tipoNome} ${c.rotulo}: ${c.assunto}`,
      corpo: c.corpo.slice(0, 280),
      rota: `/comunicacao/comunicados/${c.id}`,
    });

    return { movimentoId: movimento.id, destinatarios: setoresDestino.length };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// RESPOSTA, ENCAMINHAMENTO E LEITURA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * RESPONDE — e a resposta só alcança quem JÁ estava na conversa.
 *
 * ⚠️ CIRCULAR NÃO ACEITA RESPOSTA. Uma circular é comunicação de um para muitos: se
 * cada destinatário pudesse responder a todos, ela viraria uma lista de discussão, que
 * é exatamente o que ela não é.
 */
export async function responderComunicado(
  prisma: PrismaClient,
  input: ResponderComunicadoInput
): Promise<{ readonly comunicadoId: string; readonly numero: number }> {
  const d = zResponderComunicado.parse(input);

  return prisma.$transaction(async (tx) => {
    const original = await carregar(tx, d.comunicadoId);

    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.responderComunicado, {
      setor: d.setorRemetenteId,
    });
    await exigirLotacao(tx, d.criadoPor, d.setorRemetenteId, "responder por este setor");

    if (!original.aceitaResposta) {
      throw new Error(
        `"${original.tipoNome}" NÃO aceita resposta. Uma circular é comunicação de um ` +
          `para muitos; se cada destinatário respondesse a todos, ela viraria lista de ` +
          `discussão. Emita um comunicado novo, se for o caso. Nada foi gravado.`
      );
    }
    if (!foiEnviado(original)) {
      throw new Error(
        `O comunicado ${original.rotulo} ainda é RASCUNHO e não foi enviado a ninguém — ` +
          `não há o que responder. Nada foi gravado.`
      );
    }

    const envolvidos = setoresEnvolvidos(original);
    if (!envolvidos.includes(d.setorRemetenteId)) {
      throw new Error(
        `O setor que responde tem de estar entre os já envolvidos no comunicado ` +
          `${original.rotulo}. Nada foi gravado.`
      );
    }

    const exercicio = await tx.comunicado.findUniqueOrThrow({
      where: { id: original.id },
      select: { exercicioId: true, tipoId: true },
    });

    const chave = `${exercicio.exercicioId}:${exercicio.tipoId}:${d.setorRemetenteId}`;
    await travar(tx, "SequenciaDeComunicado", [chave]);
    const ultimo = await tx.comunicado.findFirst({
      where: {
        exercicioId: exercicio.exercicioId,
        tipoId: exercicio.tipoId,
        setorRemetenteId: d.setorRemetenteId,
      },
      select: { numero: true },
      orderBy: { numero: "desc" },
    });
    const numero = (ultimo?.numero ?? 0) + 1;

    // ⚠️ A RESPOSTA VAI PARA OS ENVOLVIDOS, MENOS QUEM RESPONDE. Ver o cabeçalho.
    const destinos = envolvidos.filter((s) => s !== d.setorRemetenteId);

    const resposta = await tx.comunicado.create({
      data: {
        exercicioId: exercicio.exercicioId,
        numero,
        tipoId: exercicio.tipoId,
        setorRemetenteId: d.setorRemetenteId,
        assunto: d.assunto,
        corpo: d.corpo,
        respondeAId: original.id,
        criadoPor: d.criadoPor,
        destinatarios: {
          create: destinos.map((setorId) => ({ setorId, porEncaminhamento: false })),
        },
        movimentos: {
          create: {
            tipo: "ENVIO",
            setorId: d.setorRemetenteId,
            hashConteudo: hashDoComunicado(d.assunto, d.corpo),
            criadoPor: d.criadoPor,
          },
        },
      },
      select: { id: true, numero: true },
    });

    await notificarVarios(tx, await lotadosEm(tx, destinos), {
      evento: "COMUNICADO_RECEBIDO",
      titulo: `Resposta ao ${original.rotulo}: ${d.assunto}`,
      corpo: d.corpo.slice(0, 280),
      rota: `/comunicacao/comunicados/${resposta.id}`,
    });

    return { comunicadoId: resposta.id, numero: resposta.numero };
  });
}

/** ENCAMINHA — o ato que INCLUI alguém novo, e fica registrado como tal. */
export async function encaminharComunicado(
  prisma: PrismaClient,
  input: EncaminharComunicadoInput
): Promise<{ readonly movimentoId: string }> {
  const d = zEncaminharComunicado.parse(input);

  return prisma.$transaction(async (tx) => {
    const c = await carregar(tx, d.comunicadoId);
    const meuSetor = await setorDoUsuarioNoComunicado(tx, c, d.criadoPor);

    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.encaminharComunicado, {
      setor: meuSetor,
    });

    if (!foiEnviado(c)) {
      throw new Error(
        `O comunicado ${c.rotulo} ainda é rascunho: envie-o antes de encaminhá-lo. ` +
          `Nada foi gravado.`
      );
    }
    if (setoresEnvolvidos(c).includes(d.setorDestinoId)) {
      throw new Error(
        `O setor já está no comunicado ${c.rotulo}. Nada foi gravado.`
      );
    }
    await exigirSetorAtivo(tx, d.setorDestinoId);

    await tx.destinatarioDoComunicado.create({
      data: {
        comunicadoId: c.id,
        setorId: d.setorDestinoId,
        aosCuidadosDe: d.aosCuidadosDe ?? null,
        // ⚠️ MARCADO COMO ENCAMINHAMENTO — é o que distingue quem estava na conversa
        // desde o começo de quem foi trazido depois. A resposta usa essa distinção.
        porEncaminhamento: true,
      },
    });

    const m = await tx.movimentoDoComunicado.create({
      data: {
        comunicadoId: c.id,
        tipo: "ENCAMINHAMENTO",
        setorId: d.setorDestinoId,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });

    await notificarVarios(
      tx,
      d.aosCuidadosDe !== undefined
        ? [d.aosCuidadosDe]
        : await lotadosEm(tx, [d.setorDestinoId]),
      {
        evento: "COMUNICADO_RECEBIDO",
        titulo: `${c.tipoNome} ${c.rotulo} encaminhado: ${c.assunto}`,
        corpo: c.corpo.slice(0, 280),
        rota: `/comunicacao/comunicados/${c.id}`,
      }
    );

    return { movimentoId: m.id };
  });
}

/**
 * REGISTRA A LEITURA — quem, quando e por qual origem.
 *
 * ⚠️ A PRIMEIRA LEITURA É QUE VALE, e as seguintes não são gravadas. Um registro por
 * abertura encheria o histórico de ruído e afogaria justamente o dado que o catálogo
 * pede: QUANDO aquela pessoa tomou ciência.
 */
export async function marcarLeitura(
  prisma: PrismaClient,
  input: MarcarLeituraInput
): Promise<{ readonly movimentoId: string | null; readonly jaLida: boolean }> {
  const d = zMarcarLeitura.parse(input);

  return prisma.$transaction(async (tx) => {
    const c = await carregar(tx, d.comunicadoId);
    const meuSetor = d.setorId ?? (await setorDoUsuarioNoComunicado(tx, c, d.criadoPor));

    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.marcarLeitura, { setor: meuSetor });

    const ja = await tx.movimentoDoComunicado.findFirst({
      where: { comunicadoId: c.id, tipo: "LEITURA", criadoPor: d.criadoPor },
      select: { id: true },
    });
    if (ja !== null) return { movimentoId: ja.id, jaLida: true };

    const m = await tx.movimentoDoComunicado.create({
      data: {
        comunicadoId: c.id,
        tipo: "LEITURA",
        setorId: meuSetor,
        origem: d.origem,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { movimentoId: m.id, jaLida: false };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// OS MOVIMENTOS PESSOAIS — arquivar e favoritar são DE QUEM OLHA
// ═══════════════════════════════════════════════════════════════════════════

export async function arquivarComunicado(
  prisma: PrismaClient,
  input: MovimentoPessoalInput
): Promise<{ readonly movimentoId: string }> {
  const d = zMovimentoPessoal.parse(input);
  return movimentoPessoal(prisma, d, "ARQUIVAMENTO", ACAO_DO_SERVICO.arquivarComunicado);
}

export async function desarquivarComunicado(
  prisma: PrismaClient,
  input: MovimentoPessoalInput
): Promise<{ readonly movimentoId: string }> {
  const d = zMovimentoPessoal.parse(input);
  return movimentoPessoal(
    prisma,
    d,
    "DESARQUIVAMENTO",
    ACAO_DO_SERVICO.desarquivarComunicado
  );
}

export async function favoritarComunicado(
  prisma: PrismaClient,
  input: MovimentoPessoalInput
): Promise<{ readonly movimentoId: string }> {
  const d = zMovimentoPessoal.parse(input);
  return movimentoPessoal(prisma, d, "FAVORITADO", ACAO_DO_SERVICO.favoritarComunicado);
}

export async function desfavoritarComunicado(
  prisma: PrismaClient,
  input: MovimentoPessoalInput
): Promise<{ readonly movimentoId: string }> {
  const d = zMovimentoPessoal.parse(input);
  return movimentoPessoal(
    prisma,
    d,
    "DESFAVORITADO",
    ACAO_DO_SERVICO.desfavoritarComunicado
  );
}

/** ETIQUETA — o marcador do 5.43.3. A tag nasce se ainda não existir. */
export async function etiquetarComunicado(
  prisma: PrismaClient,
  input: EtiquetarComunicadoInput
): Promise<{ readonly tagId: string }> {
  const d = zEtiquetarComunicado.parse(input);

  return prisma.$transaction(async (tx) => {
    const c = await carregar(tx, d.comunicadoId);
    const meuSetor = await setorDoUsuarioNoComunicado(tx, c, d.criadoPor);

    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.etiquetarComunicado, {
      setor: meuSetor,
    });

    const tag = await tx.tagDeComunicado.upsert({
      where: { nome: d.tag },
      update: {},
      create: { nome: d.tag, criadoPor: d.criadoPor },
      select: { id: true },
    });
    await tx.tagAplicadaAoComunicado.upsert({
      where: { comunicadoId_tagId: { comunicadoId: c.id, tagId: tag.id } },
      update: {},
      create: { comunicadoId: c.id, tagId: tag.id },
    });
    return { tagId: tag.id };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS — privados
// ═══════════════════════════════════════════════════════════════════════════

interface ComunicadoCarregado {
  readonly id: string;
  readonly rotulo: string;
  readonly assunto: string;
  readonly corpo: string;
  readonly criadoPor: string;
  readonly setorRemetenteId: string;
  readonly tipoNome: string;
  readonly aceitaResposta: boolean;
  readonly modoDeAssinaturaExigido: "SIMPLES" | "AVANCADA" | "QUALIFICADA" | null;
  readonly destinatarios: readonly string[];
  readonly movimentos: readonly {
    readonly tipo:
      | "ENVIO"
      | "LEITURA"
      | "ENCAMINHAMENTO"
      | "ARQUIVAMENTO"
      | "DESARQUIVAMENTO"
      | "FAVORITADO"
      | "DESFAVORITADO";
    readonly criadoPor: string;
    readonly setorId: string | null;
    readonly criadoEm: Date;
  }[];
}

async function carregar(tx: Tx, comunicadoId: string): Promise<ComunicadoCarregado> {
  const c = await tx.comunicado.findUnique({
    where: { id: comunicadoId },
    select: {
      id: true,
      numero: true,
      assunto: true,
      corpo: true,
      criadoPor: true,
      setorRemetenteId: true,
      exercicio: { select: { ano: true } },
      tipo: {
        select: { nome: true, codigo: true, aceitaResposta: true, modoDeAssinaturaExigido: true },
      },
      destinatarios: { select: { setorId: true } },
      movimentos: {
        select: { tipo: true, criadoPor: true, setorId: true, criadoEm: true },
      },
    },
  });
  if (c === null) {
    throw new Error(`Comunicado ${comunicadoId} não encontrado. Nada foi gravado.`);
  }
  return {
    id: c.id,
    rotulo: `${c.tipo.codigo} ${c.numero}/${c.exercicio.ano}`,
    assunto: c.assunto,
    corpo: c.corpo,
    criadoPor: c.criadoPor,
    setorRemetenteId: c.setorRemetenteId,
    tipoNome: c.tipo.nome,
    aceitaResposta: c.tipo.aceitaResposta,
    modoDeAssinaturaExigido: c.tipo.modoDeAssinaturaExigido,
    destinatarios: c.destinatarios.map((d) => d.setorId),
    movimentos: c.movimentos,
  };
}

/**
 * O SETOR PELO QUAL ESTE USUÁRIO PARTICIPA DO COMUNICADO.
 *
 * ⚠️ ELE RECUSA QUEM NÃO PARTICIPA. Sem isso, qualquer usuário do ente poderia
 * encaminhar, etiquetar ou marcar como lido um documento que nunca lhe foi endereçado —
 * e o registro de leitura, que é o dado que o catálogo pede, encheria de nomes de quem
 * só passou por perto.
 */
async function setorDoUsuarioNoComunicado(
  tx: Tx,
  c: ComunicadoCarregado,
  usuarioIdent: string
): Promise<string> {
  const envolvidos = new Set(setoresEnvolvidos(c));
  const lotacoes = await tx.usuarioDoSetor.findMany({
    where: { usuarioIdent },
    select: { setorId: true },
  });
  const meu = lotacoes.find((l) => envolvidos.has(l.setorId));
  if (meu !== undefined) return meu.setorId;

  if (c.criadoPor === usuarioIdent) return c.setorRemetenteId;

  throw new Error(
    `"${usuarioIdent}" não participa do comunicado ${c.rotulo}: não está lotado em ` +
      `nenhum dos setores envolvidos nem foi quem o emitiu. Nada foi gravado.`
  );
}

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

  const u = await tx.usuario.findUnique({
    where: { identificador },
    select: {
      vinculos: {
        select: { perfil: { select: { permissoes: { select: { unidadeOrcId: true } } } } },
      },
    },
  });
  const gestor =
    u !== null &&
    u.vinculos.some((v) => v.perfil.permissoes.some((p) => p.unidadeOrcId === null));
  if (gestor) return;

  const setor = await tx.setor.findUnique({
    where: { id: setorId },
    select: { codigo: true, nome: true },
  });
  throw new Error(
    `LOTAÇÃO: "${identificador}" não está lotado no setor ` +
      `${setor?.codigo ?? setorId} (${setor?.nome ?? "?"}) e por isso não pode ${oQue}. ` +
      `Nada foi gravado.`
  );
}

async function exigirSetorAtivo(tx: Tx, setorId: string): Promise<void> {
  const s = await tx.setor.findUnique({
    where: { id: setorId },
    select: { codigo: true, nome: true, ativo: true },
  });
  if (s === null) throw new Error(`Setor ${setorId} não existe. Nada foi gravado.`);
  if (!s.ativo) {
    throw new Error(
      `O setor ${s.codigo} (${s.nome}) está DESATIVADO e não recebe comunicado. ` +
        `Nada foi gravado.`
    );
  }
}

async function lotadosEm(tx: Tx, setores: readonly string[]): Promise<readonly string[]> {
  const l = await tx.usuarioDoSetor.findMany({
    where: { setorId: { in: [...setores] } },
    select: { usuarioIdent: true },
  });
  return l.map((x) => x.usuarioIdent);
}

async function movimentoPessoal(
  prisma: PrismaClient,
  d: { readonly comunicadoId: string; readonly criadoPor: string },
  tipo: "ARQUIVAMENTO" | "DESARQUIVAMENTO" | "FAVORITADO" | "DESFAVORITADO",
  acao: Parameters<typeof autorizarNo>[2]
): Promise<{ readonly movimentoId: string }> {
  return prisma.$transaction(async (tx) => {
    const c = await carregar(tx, d.comunicadoId);
    const meuSetor = await setorDoUsuarioNoComunicado(tx, c, d.criadoPor);
    await autorizarNo(tx, d.criadoPor, acao, { setor: meuSetor });

    const m = await tx.movimentoDoComunicado.create({
      data: {
        comunicadoId: c.id,
        tipo,
        setorId: meuSetor,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { movimentoId: m.id };
  });
}
