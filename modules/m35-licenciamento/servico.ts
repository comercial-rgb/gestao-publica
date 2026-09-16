import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { diaCivil } from "../../packages/datas/index.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizar, type Tx } from "../m16-travamento/autorizacao.js";
import {
  dependenciasFaltantes,
  dependentesContratados,
  situacaoDoModulo,
  type ContratoVigente,
  type HabilitacaoRegistrada,
  type SituacaoDoModulo,
} from "./dominio.js";
import {
  MODULOS_LICENCIAVEIS,
  moduloDoCatalogo,
  nomeDoModulo,
  type ModuloComercial,
} from "./modulos.js";

/**
 * M35 — OS ATOS DO FORNECEDOR sobre o contrato desta implantação (V10 T1 · N6.1).
 *
 * ⚠️ CADA ATO COBRA A SUA AÇÃO, e elas são reservadas (`ACOES_DO_FORNECEDOR`, M16): a tela
 * de permissões do ENTE recusa concedê-las. O município administra os próprios usuários; o
 * contrato comercial é do fornecedor.
 *
 * ⚠️ IDEMPOTÊNCIA COM O ESCOPO DENTRO DA CHAVE (invariante 5). A chave de cada evento é
 * derivada de contrato + módulo + tipo + vigência. Repetir a MESMA operação não grava um
 * segundo evento nem altera o estado: responde `{ novo: false }`. Uma operação DIFERENTE
 * (outra vigência) tem outra chave e entra como fato novo — e é o certo: o histórico
 * registra as duas.
 *
 * ⚠️ O HISTÓRICO É APPEND-ONLY. `HabilitacaoDeModulo` é o estado corrente e muda; o que
 * nunca muda é `EventoDeLicenciamento`. Suspender NÃO apaga a habilitação: marca `ativa =
 * false` e grava o evento com motivo e autor. É o que preserva a leitura histórica.
 */

const zMotivo = z
  .string()
  .trim()
  .min(5, "O motivo é obrigatório e precisa dizer algo: ao menos 5 caracteres")
  .max(500, "O motivo tem no máximo 500 caracteres");

const zDiaCivil = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "A data precisa estar no formato AAAA-MM-DD (dia civil do ente)");

const zModulo = z.string().refine(
  (m): m is ModuloComercial => (MODULOS_LICENCIAVEIS as readonly string[]).includes(m),
  {
    message:
      `O módulo precisa ser um dos contratáveis: ${MODULOS_LICENCIAVEIS.join(", ")}. ` +
      `A PLATAFORMA não se contrata — ela existe em toda implantação.`,
  }
);

/** O dia civil do ente. Injetável para o teste; nunca `new Date().toISOString()`. */
export type Relogio = () => Date;

const AGORA: Relogio = () => new Date();

function hojeCivil(relogio: Relogio): string {
  return diaCivil(relogio());
}

// ═══════════════════════════════════════════════════════════════════════════
// LEITURA — a projeção que a tela e o gate usam
// ═══════════════════════════════════════════════════════════════════════════

export interface ModuloNaTela {
  readonly modulo: ModuloComercial;
  readonly nome: string;
  readonly descricao: string;
  readonly situacao: SituacaoDoModulo;
  readonly contratado: boolean;
  readonly inicio: string | null;
  readonly fim: string | null;
  readonly motivo: string | null;
  readonly depende: readonly ModuloComercial[];
  /** As dependências que ainda NÃO estão no contrato — o que a tela mostra antes de habilitar. */
  readonly dependenciasFaltantes: readonly ModuloComercial[];
  /** Quem quebraria se este fosse suspenso agora. */
  readonly dependentesAtivos: readonly ModuloComercial[];
}

export interface LicenciamentoDaImplantacao {
  readonly hoje: string;
  readonly contrato: {
    readonly id: string;
    readonly numero: string;
    readonly cliente: string;
    readonly situacao: "ATIVO" | "ENCERRADO";
    readonly inicio: string;
    readonly fim: string | null;
    readonly observacao: string | null;
    readonly demonstracao: boolean;
    readonly criadoPor: string;
    readonly criadoEm: Date;
  } | null;
  readonly modulos: readonly ModuloNaTela[];
  readonly eventos: readonly {
    readonly id: string;
    readonly tipo: string;
    readonly modulo: ModuloComercial | null;
    readonly motivo: string;
    readonly detalhe: string;
    readonly vigenciaInicio: string | null;
    readonly vigenciaFim: string | null;
    readonly criadoPor: string;
    readonly criadoEm: Date;
  }[];
}

/**
 * O CONTRATO VIGENTE desta implantação, com as habilitações e o histórico.
 *
 * ⚠️ "O contrato" é o ATIVO mais recente. Um contrato ENCERRADO continua no banco (e nos
 * eventos), porque o que se registrou sob ele continua tendo de ser lido — mas não habilita
 * nada. Ver `situacaoDoModulo`: contrato inativo põe o módulo FORA DE VIGÊNCIA, não
 * NÃO CONTRATADO, e é essa diferença que preserva a leitura histórica.
 */
export async function lerLicenciamento(
  prisma: Tx,
  enteId: string,
  relogio: Relogio = AGORA
): Promise<LicenciamentoDaImplantacao> {
  const hoje = hojeCivil(relogio);
  const contrato = await prisma.contratoComercial.findFirst({
    where: { enteId },
    orderBy: [{ situacao: "asc" }, { criadoEm: "desc" }],
    include: {
      habilitacoes: { orderBy: { modulo: "asc" } },
      eventos: { orderBy: { criadoEm: "desc" }, take: 100 },
    },
  });

  const contratoParaDecisao: ContratoVigente | null =
    contrato === null
      ? null
      : {
          numero: contrato.numero,
          ativo: contrato.situacao === "ATIVO",
          inicio: contrato.inicio,
          fim: contrato.fim,
        };

  const habilitacoes: readonly HabilitacaoRegistrada[] =
    contrato === null
      ? []
      : contrato.habilitacoes.map((h) => ({
          modulo: h.modulo as ModuloComercial,
          ativa: h.ativa,
          inicio: h.inicio,
          fim: h.fim,
        }));

  const contratados = habilitacoes.map((h) => h.modulo);
  const ativosHoje = contratados.filter(
    (m) =>
      situacaoDoModulo({ modulo: m, hoje, contrato: contratoParaDecisao, habilitacoes }) ===
      "HABILITADO"
  );

  const modulos: readonly ModuloNaTela[] = MODULOS_LICENCIAVEIS.map((m) => {
    const cat = moduloDoCatalogo(m);
    const h = habilitacoes.find((x) => x.modulo === m);
    const registrada = contrato?.habilitacoes.find((x) => x.modulo === m);
    return {
      modulo: m,
      nome: cat.nome,
      descricao: cat.descricao,
      situacao: situacaoDoModulo({ modulo: m, hoje, contrato: contratoParaDecisao, habilitacoes }),
      contratado: h !== undefined,
      inicio: h?.inicio ?? null,
      fim: h?.fim ?? null,
      motivo: registrada?.motivo ?? null,
      depende: cat.depende,
      dependenciasFaltantes: dependenciasFaltantes(m, contratados),
      dependentesAtivos: dependentesContratados(m, ativosHoje),
    };
  });

  return {
    hoje,
    contrato:
      contrato === null
        ? null
        : {
            id: contrato.id,
            numero: contrato.numero,
            cliente: contrato.cliente,
            situacao: contrato.situacao as "ATIVO" | "ENCERRADO",
            inicio: contrato.inicio,
            fim: contrato.fim,
            observacao: contrato.observacao,
            demonstracao: contrato.demonstracao,
            criadoPor: contrato.criadoPor,
            criadoEm: contrato.criadoEm,
          },
    modulos,
    eventos:
      contrato === null
        ? []
        : contrato.eventos.map((e) => ({
            id: e.id,
            tipo: e.tipo,
            modulo: e.modulo === null ? null : (e.modulo as ModuloComercial),
            motivo: e.motivo,
            detalhe: e.detalhe,
            vigenciaInicio: e.vigenciaInicio,
            vigenciaFim: e.vigenciaFim,
            criadoPor: e.criadoPor,
            criadoEm: e.criadoEm,
          })),
  };
}

/**
 * A SITUAÇÃO DE UM MÓDULO, para o gate. Consulta mínima: uma linha, sem histórico.
 *
 * ⚠️ ELA NÃO ENGOLE ERRO DE BANCO. Se o Postgres estiver fora, esta função ESTOURA — e o
 * chamador traduz para "serviço indisponível", nunca para "módulo não contratado". Confundir
 * as duas faria uma queda de banco parecer um problema comercial, e o município ligaria para
 * o setor errado. Ver `lib/portas/licenciamento.ts`.
 */
export async function situacaoDoModuloNaImplantacao(
  prisma: Tx,
  enteId: string,
  modulo: ModuloComercial,
  relogio: Relogio = AGORA
): Promise<SituacaoDoModulo> {
  if (!moduloDoCatalogo(modulo).licenciavel) return "HABILITADO";
  const hoje = hojeCivil(relogio);
  const contrato = await prisma.contratoComercial.findFirst({
    where: { enteId },
    orderBy: [{ situacao: "asc" }, { criadoEm: "desc" }],
    select: {
      numero: true,
      situacao: true,
      inicio: true,
      fim: true,
      habilitacoes: {
        where: { modulo },
        select: { modulo: true, ativa: true, inicio: true, fim: true },
      },
    },
  });
  if (contrato === null) return "NAO_CONTRATADO";
  return situacaoDoModulo({
    modulo,
    hoje,
    contrato: {
      numero: contrato.numero,
      ativo: contrato.situacao === "ATIVO",
      inicio: contrato.inicio,
      fim: contrato.fim,
    },
    habilitacoes: contrato.habilitacoes.map((h) => ({
      modulo: h.modulo as ModuloComercial,
      ativa: h.ativa,
      inicio: h.inicio,
      fim: h.fim,
    })),
  });
}

/** Existe ALGUM contrato registrado nesta implantação? — a pergunta "o licenciamento foi instalado?". */
export async function licenciamentoInstalado(prisma: Tx, enteId: string): Promise<boolean> {
  return (await prisma.contratoComercial.count({ where: { enteId } })) > 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// OS ATOS
// ═══════════════════════════════════════════════════════════════════════════

export interface ResultadoDoAto {
  readonly contratoId: string;
  /** `false` quando a operação já tinha sido aplicada com a MESMA chave — nada foi gravado. */
  readonly novo: boolean;
  readonly detalhe: string;
}

const zRegistrarContrato = z.object({
  enteId: z.string().min(1),
  numero: z.string().trim().min(1, "O número do contrato é obrigatório").max(60),
  cliente: z.string().trim().min(1, "A identificação do cliente é obrigatória").max(200),
  inicio: zDiaCivil,
  fim: zDiaCivil.nullable(),
  observacao: z.string().trim().max(1000).nullable(),
  demonstracao: z.boolean(),
  criadoPor: z.string().min(1),
});

export type RegistrarContratoInput = z.input<typeof zRegistrarContrato>;

/**
 * REGISTRA o contrato comercial desta implantação.
 *
 * ⚠️ UM CONTRATO ATIVO POR VEZ. Dois contratos ativos no mesmo banco fariam "qual vale?"
 * depender da ordem de leitura — e o gate responderia diferente conforme o índice. Registrar
 * um novo exige encerrar o anterior, por ato próprio e motivado.
 */
export async function registrarContratoComercial(
  prisma: PrismaClient,
  input: RegistrarContratoInput
): Promise<ResultadoDoAto> {
  const dados = zRegistrarContrato.parse(input);
  await autorizar(prisma, dados.criadoPor, ACAO_DO_SERVICO.registrarContratoComercial);

  if (dados.fim !== null && dados.fim < dados.inicio) {
    throw new Error(
      `VIGÊNCIA INVERTIDA: o fim (${dados.fim}) é anterior ao início (${dados.inicio}). ` +
        `Um contrato que acaba antes de começar não habilita nada em dia nenhum, e ficaria ` +
        `no banco parecendo vigente. Nada foi gravado.`
    );
  }

  const ativo = await prisma.contratoComercial.findFirst({
    where: { enteId: dados.enteId, situacao: "ATIVO" },
    select: { numero: true },
  });
  if (ativo !== null && ativo.numero !== dados.numero) {
    throw new Error(
      `JÁ HÁ CONTRATO ATIVO: esta implantação está sob o contrato "${ativo.numero}". Dois ` +
        `contratos ativos fariam a habilitação de um módulo depender de qual deles o sistema ` +
        `lesse primeiro. Encerre o atual (ato próprio, com motivo) antes de registrar outro. ` +
        `Nada foi gravado.`
    );
  }

  const chave = `${dados.enteId}:CONTRATO_REGISTRADO:${dados.numero}:${dados.inicio}:${dados.fim ?? "-"}`;
  const jaFeito = await prisma.eventoDeLicenciamento.findUnique({ where: { chave }, select: { contratoId: true } });
  if (jaFeito !== null) {
    return {
      contratoId: jaFeito.contratoId,
      novo: false,
      detalhe: `O contrato "${dados.numero}" já estava registrado com esta vigência. Nada foi gravado.`,
    };
  }

  return prisma.$transaction(async (tx) => {
    const contrato = await tx.contratoComercial.create({
      data: {
        enteId: dados.enteId,
        numero: dados.numero,
        cliente: dados.cliente,
        situacao: "ATIVO",
        inicio: dados.inicio,
        fim: dados.fim,
        observacao: dados.observacao,
        demonstracao: dados.demonstracao,
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });
    await tx.eventoDeLicenciamento.create({
      data: {
        contratoId: contrato.id,
        modulo: null,
        tipo: "CONTRATO_REGISTRADO",
        motivo: dados.observacao ?? "Registro do contrato comercial da implantação.",
        detalhe: `Contrato ${dados.numero} — ${dados.cliente}${dados.demonstracao ? " (demonstração)" : ""}.`,
        vigenciaInicio: dados.inicio,
        vigenciaFim: dados.fim,
        chave,
        criadoPor: dados.criadoPor,
      },
    });
    return {
      contratoId: contrato.id,
      novo: true,
      detalhe: `Contrato ${dados.numero} registrado. Nenhum módulo está habilitado ainda.`,
    };
  });
}

const zEncerrarContrato = z.object({
  contratoId: z.string().min(1),
  motivo: zMotivo,
  criadoPor: z.string().min(1),
});

/**
 * ENCERRA o contrato. ⚠️ NÃO apaga habilitação, evento nem fato do ente: põe os módulos
 * FORA DE VIGÊNCIA, que continua permitindo a LEITURA do que foi escriturado.
 */
export async function encerrarContratoComercial(
  prisma: PrismaClient,
  input: z.input<typeof zEncerrarContrato>
): Promise<ResultadoDoAto> {
  const dados = zEncerrarContrato.parse(input);
  await autorizar(prisma, dados.criadoPor, ACAO_DO_SERVICO.encerrarContratoComercial);

  const contrato = await exigirContrato(prisma, dados.contratoId);
  const chave = `${dados.contratoId}:CONTRATO_ENCERRADO`;
  const jaFeito = await prisma.eventoDeLicenciamento.findUnique({ where: { chave }, select: { id: true } });
  if (jaFeito !== null || contrato.situacao === "ENCERRADO") {
    return {
      contratoId: dados.contratoId,
      novo: false,
      detalhe: `O contrato "${contrato.numero}" já estava encerrado. Nada foi gravado.`,
    };
  }

  return prisma.$transaction(async (tx) => {
    await tx.contratoComercial.update({
      where: { id: dados.contratoId },
      data: { situacao: "ENCERRADO" },
    });
    await tx.eventoDeLicenciamento.create({
      data: {
        contratoId: dados.contratoId,
        modulo: null,
        tipo: "CONTRATO_ENCERRADO",
        motivo: dados.motivo,
        detalhe:
          `Contrato ${contrato.numero} encerrado. Os módulos passam a FORA DE VIGÊNCIA: ` +
          `a consulta ao que já foi registrado continua, operação nova não.`,
        vigenciaInicio: null,
        vigenciaFim: null,
        chave,
        criadoPor: dados.criadoPor,
      },
    });
    return {
      contratoId: dados.contratoId,
      novo: true,
      detalhe: `Contrato ${contrato.numero} encerrado.`,
    };
  });
}

async function exigirContrato(
  prisma: Tx,
  contratoId: string
): Promise<{
  readonly id: string;
  readonly enteId: string;
  readonly numero: string;
  readonly situacao: string;
  readonly inicio: string;
  readonly fim: string | null;
}> {
  const c = await prisma.contratoComercial.findUnique({
    where: { id: contratoId },
    select: { id: true, enteId: true, numero: true, situacao: true, inicio: true, fim: true },
  });
  if (c === null) {
    throw new Error(
      `CONTRATO INEXISTENTE: não há contrato comercial com id "${contratoId}". Nada foi gravado.`
    );
  }
  return c;
}

const zHabilitar = z.object({
  contratoId: z.string().min(1),
  modulo: zModulo,
  inicio: zDiaCivil,
  fim: zDiaCivil.nullable(),
  motivo: zMotivo,
  criadoPor: z.string().min(1),
});

export type HabilitarModuloInput = z.input<typeof zHabilitar>;

/**
 * HABILITA um módulo no contrato.
 *
 * ⚠️ DEPENDÊNCIA FALTANTE RECUSA, E NÃO HABILITA EM CASCATA. Ligar o núcleo contábil "porque
 * Compras precisa" entregaria um módulo que ninguém contratou — de graça, por efeito
 * colateral, sem aparecer em contrato nenhum. A recusa nomeia o que falta contratar.
 */
export async function habilitarModuloContratado(
  prisma: PrismaClient,
  input: HabilitarModuloInput
): Promise<ResultadoDoAto> {
  const dados = zHabilitar.parse(input);
  await autorizar(prisma, dados.criadoPor, ACAO_DO_SERVICO.habilitarModuloContratado);
  return gravarHabilitacao(prisma, {
    ...dados,
    modulo: dados.modulo as ModuloComercial,
    tipo: "MODULO_HABILITADO",
  });
}

const zProgramar = zHabilitar;

/**
 * PROGRAMA a vigência de um módulo já contratado — mesma tabela, outro ato e outra ação.
 *
 * ⚠️ AÇÃO PRÓPRIA, e não "habilitar de novo": quem pode ligar um módulo não necessariamente
 * pode empurrar o fim da vigência de um contrato que alguém negociou. Pendurar as duas na
 * mesma ação daria o segundo poder a todo mundo que tem o primeiro, em silêncio.
 */
export async function programarVigenciaDeModulo(
  prisma: PrismaClient,
  input: z.input<typeof zProgramar>
): Promise<ResultadoDoAto> {
  const dados = zProgramar.parse(input);
  await autorizar(prisma, dados.criadoPor, ACAO_DO_SERVICO.programarVigenciaDeModulo);
  const modulo = dados.modulo as ModuloComercial;
  const existente = await prisma.habilitacaoDeModulo.findUnique({
    where: { contratoId_modulo: { contratoId: dados.contratoId, modulo } },
    select: { id: true },
  });
  if (existente === null) {
    throw new Error(
      `MÓDULO NÃO CONTRATADO: "${nomeDoModulo(modulo)}" não está no contrato, e programar a ` +
        `vigência de algo que não foi habilitado criaria uma habilitação por caminho lateral — ` +
        `sem passar pela conferência de dependências. Habilite-o primeiro. Nada foi gravado.`
    );
  }
  return gravarHabilitacao(prisma, { ...dados, modulo, tipo: "VIGENCIA_PROGRAMADA" });
}

async function gravarHabilitacao(
  prisma: PrismaClient,
  dados: {
    readonly contratoId: string;
    readonly modulo: ModuloComercial;
    readonly inicio: string;
    readonly fim: string | null;
    readonly motivo: string;
    readonly criadoPor: string;
    readonly tipo: "MODULO_HABILITADO" | "VIGENCIA_PROGRAMADA";
  }
): Promise<ResultadoDoAto> {
  const contrato = await exigirContrato(prisma, dados.contratoId);
  if (contrato.situacao !== "ATIVO") {
    throw new Error(
      `CONTRATO ENCERRADO: o contrato "${contrato.numero}" está encerrado e não habilita ` +
        `módulo nenhum. Registre um contrato novo. Nada foi gravado.`
    );
  }
  if (dados.fim !== null && dados.fim < dados.inicio) {
    throw new Error(
      `VIGÊNCIA INVERTIDA: o fim (${dados.fim}) é anterior ao início (${dados.inicio}). Nada foi gravado.`
    );
  }

  // ⚠️ AS DEPENDÊNCIAS SÃO CONFERIDAS CONTRA O QUE ESTÁ NO CONTRATO, não contra o que está
  // vigente hoje: um módulo cuja base está suspensa pode ser habilitado (a base volta), mas um
  // módulo cuja base NÃO FOI CONTRATADA não pode — ela não vai voltar sozinha.
  const contratados = (
    await prisma.habilitacaoDeModulo.findMany({
      where: { contratoId: dados.contratoId },
      select: { modulo: true },
    })
  ).map((h) => h.modulo as ModuloComercial);

  const faltam = dependenciasFaltantes(dados.modulo, contratados);
  if (faltam.length > 0) {
    throw new Error(
      `DEPENDÊNCIA NÃO CONTRATADA: "${nomeDoModulo(dados.modulo)}" depende de ` +
        `${faltam.map(nomeDoModulo).map((n) => `"${n}"`).join(", ")}, que não está no contrato. ` +
        `O sistema NÃO habilita a dependência sozinho: isso entregaria um módulo que ninguém ` +
        `contratou, por efeito colateral. Contrate a dependência primeiro. Nada foi gravado.`
    );
  }

  const chave =
    `${dados.contratoId}:${dados.tipo}:${dados.modulo}:${dados.inicio}:${dados.fim ?? "-"}`;
  const jaFeito = await prisma.eventoDeLicenciamento.findUnique({ where: { chave }, select: { id: true } });
  if (jaFeito !== null) {
    return {
      contratoId: dados.contratoId,
      novo: false,
      detalhe:
        `"${nomeDoModulo(dados.modulo)}" já estava com esta vigência (${dados.inicio} a ` +
        `${dados.fim ?? "sem termo"}). Nada foi gravado.`,
    };
  }

  return prisma.$transaction(async (tx) => {
    await tx.habilitacaoDeModulo.upsert({
      where: { contratoId_modulo: { contratoId: dados.contratoId, modulo: dados.modulo } },
      create: {
        contratoId: dados.contratoId,
        modulo: dados.modulo,
        ativa: true,
        inicio: dados.inicio,
        fim: dados.fim,
        motivo: dados.motivo,
        criadoPor: dados.criadoPor,
        atualizadoPor: dados.criadoPor,
      },
      update: {
        ativa: true,
        inicio: dados.inicio,
        fim: dados.fim,
        motivo: dados.motivo,
        atualizadoPor: dados.criadoPor,
      },
    });
    await tx.eventoDeLicenciamento.create({
      data: {
        contratoId: dados.contratoId,
        modulo: dados.modulo,
        tipo: dados.tipo,
        motivo: dados.motivo,
        detalhe:
          `${nomeDoModulo(dados.modulo)} — vigência ${dados.inicio} a ${dados.fim ?? "sem termo"}.`,
        vigenciaInicio: dados.inicio,
        vigenciaFim: dados.fim,
        chave,
        criadoPor: dados.criadoPor,
      },
    });
    return {
      contratoId: dados.contratoId,
      novo: true,
      detalhe: `${nomeDoModulo(dados.modulo)} vigente de ${dados.inicio} a ${dados.fim ?? "sem termo"}.`,
    };
  });
}

const zSuspender = z.object({
  contratoId: z.string().min(1),
  modulo: zModulo,
  motivo: zMotivo,
  criadoPor: z.string().min(1),
});

/**
 * SUSPENDE um módulo. ⚠️ Não apaga nada, e a leitura histórica continua.
 *
 * ⚠️ RECUSA SE ALGUÉM DEPENDE. Suspender o núcleo contábil com "Compras" vigente deixaria a
 * tela de contratos aberta e cada empenho dela recusando por um motivo que não é o dela. A
 * recusa nomeia quem depende, e a sequência correta.
 */
export async function suspenderModuloContratado(
  prisma: PrismaClient,
  input: z.input<typeof zSuspender>,
  relogio: Relogio = AGORA
): Promise<ResultadoDoAto> {
  const dados = zSuspender.parse(input);
  await autorizar(prisma, dados.criadoPor, ACAO_DO_SERVICO.suspenderModuloContratado);
  const modulo = dados.modulo as ModuloComercial;
  const contrato = await exigirContrato(prisma, dados.contratoId);

  const atual = await prisma.habilitacaoDeModulo.findUnique({
    where: { contratoId_modulo: { contratoId: dados.contratoId, modulo } },
    select: { ativa: true },
  });
  if (atual === null) {
    throw new Error(
      `MÓDULO NÃO CONTRATADO: "${nomeDoModulo(modulo)}" não está no contrato "${contrato.numero}"; ` +
        `não há o que suspender. Nada foi gravado.`
    );
  }
  if (!atual.ativa) {
    return {
      contratoId: dados.contratoId,
      novo: false,
      detalhe: `"${nomeDoModulo(modulo)}" já estava suspenso. Nada foi gravado.`,
    };
  }

  const licenciamento = await lerLicenciamento(prisma, contrato.enteId, relogio);
  const dependentes = licenciamento.modulos.find((m) => m.modulo === modulo)?.dependentesAtivos ?? [];
  if (dependentes.length > 0) {
    throw new Error(
      `SUSPENSÃO INCOERENTE: "${nomeDoModulo(modulo)}" sustenta ` +
        `${dependentes.map(nomeDoModulo).map((n) => `"${n}"`).join(", ")}, que continua(m) vigente(s). ` +
        `Suspendê-lo agora deixaria a tela do dependente aberta recusando cada ato por um motivo ` +
        `que não é o dele. Suspenda primeiro quem depende. Nada foi gravado.`
    );
  }

  // ⚠️ A CHAVE LEVA O DIA CIVIL: suspender hoje, reativar amanhã e suspender de novo são TRÊS
  // fatos, e o histórico registra os três. Sem o dia, a segunda suspensão colidiria com a
  // primeira e o evento sumiria — a idempotência viraria perda de registro.
  const hoje = hojeCivil(relogio);
  const chave = `${dados.contratoId}:MODULO_SUSPENSO:${modulo}:${hoje}`;
  const jaFeito = await prisma.eventoDeLicenciamento.findUnique({ where: { chave }, select: { id: true } });
  if (jaFeito !== null) {
    return {
      contratoId: dados.contratoId,
      novo: false,
      detalhe: `"${nomeDoModulo(modulo)}" já foi suspenso hoje. Nada foi gravado.`,
    };
  }

  return prisma.$transaction(async (tx) => {
    await tx.habilitacaoDeModulo.update({
      where: { contratoId_modulo: { contratoId: dados.contratoId, modulo } },
      data: { ativa: false, motivo: dados.motivo, atualizadoPor: dados.criadoPor },
    });
    await tx.eventoDeLicenciamento.create({
      data: {
        contratoId: dados.contratoId,
        modulo,
        tipo: "MODULO_SUSPENSO",
        motivo: dados.motivo,
        detalhe:
          `${nomeDoModulo(modulo)} suspenso em ${hoje}. Operação nova bloqueada; consulta ao que ` +
          `já foi registrado preservada.`,
        vigenciaInicio: null,
        vigenciaFim: null,
        chave,
        criadoPor: dados.criadoPor,
      },
    });
    return {
      contratoId: dados.contratoId,
      novo: true,
      detalhe: `${nomeDoModulo(modulo)} suspenso.`,
    };
  });
}

/** REATIVA um módulo suspenso. A vigência registrada continua valendo — reativar não a estende. */
export async function reativarModuloContratado(
  prisma: PrismaClient,
  input: z.input<typeof zSuspender>,
  relogio: Relogio = AGORA
): Promise<ResultadoDoAto> {
  const dados = zSuspender.parse(input);
  await autorizar(prisma, dados.criadoPor, ACAO_DO_SERVICO.reativarModuloContratado);
  const modulo = dados.modulo as ModuloComercial;
  const contrato = await exigirContrato(prisma, dados.contratoId);

  const atual = await prisma.habilitacaoDeModulo.findUnique({
    where: { contratoId_modulo: { contratoId: dados.contratoId, modulo } },
    select: { ativa: true },
  });
  if (atual === null) {
    throw new Error(
      `MÓDULO NÃO CONTRATADO: "${nomeDoModulo(modulo)}" não está no contrato "${contrato.numero}". ` +
        `Reativar o que nunca foi habilitado criaria a habilitação sem conferir dependência. ` +
        `Nada foi gravado.`
    );
  }
  if (atual.ativa) {
    return {
      contratoId: dados.contratoId,
      novo: false,
      detalhe: `"${nomeDoModulo(modulo)}" já estava ativo. Nada foi gravado.`,
    };
  }

  const contratados = (
    await prisma.habilitacaoDeModulo.findMany({
      where: { contratoId: dados.contratoId, ativa: true },
      select: { modulo: true },
    })
  ).map((h) => h.modulo as ModuloComercial);
  const faltam = dependenciasFaltantes(modulo, contratados);
  if (faltam.length > 0) {
    throw new Error(
      `DEPENDÊNCIA SUSPENSA: reativar "${nomeDoModulo(modulo)}" com ` +
        `${faltam.map(nomeDoModulo).map((n) => `"${n}"`).join(", ")} fora do ar entregaria uma tela ` +
        `que recusa cada ato pela base que falta. Reative a base primeiro. Nada foi gravado.`
    );
  }

  const hoje = hojeCivil(relogio);
  const chave = `${dados.contratoId}:MODULO_REATIVADO:${modulo}:${hoje}`;
  const jaFeito = await prisma.eventoDeLicenciamento.findUnique({ where: { chave }, select: { id: true } });
  if (jaFeito !== null) {
    return {
      contratoId: dados.contratoId,
      novo: false,
      detalhe: `"${nomeDoModulo(modulo)}" já foi reativado hoje. Nada foi gravado.`,
    };
  }

  return prisma.$transaction(async (tx) => {
    await tx.habilitacaoDeModulo.update({
      where: { contratoId_modulo: { contratoId: dados.contratoId, modulo } },
      data: { ativa: true, motivo: dados.motivo, atualizadoPor: dados.criadoPor },
    });
    await tx.eventoDeLicenciamento.create({
      data: {
        contratoId: dados.contratoId,
        modulo,
        tipo: "MODULO_REATIVADO",
        motivo: dados.motivo,
        detalhe: `${nomeDoModulo(modulo)} reativado em ${hoje}. A vigência registrada continua valendo.`,
        vigenciaInicio: null,
        vigenciaFim: null,
        chave,
        criadoPor: dados.criadoPor,
      },
    });
    return {
      contratoId: dados.contratoId,
      novo: true,
      detalhe: `${nomeDoModulo(modulo)} reativado.`,
    };
  });
}
