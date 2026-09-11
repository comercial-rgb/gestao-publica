import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import type { Tx } from "../m16-travamento/autorizacao.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { registrarNotificacao } from "../m24-notificacoes/notificacoes.js";
import { COLUNAS_DA_FONTE, lerFonteComunicados, lerFonteProcessos } from "./fontes.js";
import { diaCivil } from "../../packages/datas/index.js";
import {
  analisar,
  avaliar,
  camposUsados,
  formatarCelula,
  type TipoDeColuna,
} from "./gramatica.js";

/**
 * M26 — OS CASOS DE USO DO DESIGNER.
 *
 * ═══ ⚠️ A EXPRESSÃO É VALIDADA NA GRAVAÇÃO, NÃO SÓ NA EXECUÇÃO ═══
 * Um modelo com expressão inválida gravado hoje só quebraria na primeira execução —
 * possivelmente às 3h da manhã, num agendamento, para outra pessoa. Aqui a análise roda
 * ao salvar: quem escreveu a expressão é quem vê o erro.
 *
 * E a validação confere os CAMPOS USADOS contra as colunas que a fonte publica. Um
 * `total` que não existe na fonte é recusado no ato — em vez de virar erro de execução
 * dentro de um relatório que já foi distribuído.
 */

const LIMITE_DE_LINHAS = 5_000;

// ═══════════════════════════════════════════════════════════════════════════
// O MODELO
// ═══════════════════════════════════════════════════════════════════════════

const zColuna = z.object({
  ordem: z.number().int().min(1).max(200),
  rotulo: z.string().trim().min(1).max(120),
  expressao: z.string().trim().min(1).max(500),
  tipo: z.enum(["TEXTO", "NUMERO", "MOEDA", "DATA", "BOOLEANO"]).default("TEXTO"),
});

export const zCriarModelo = z.object({
  unidadeOrcId: z.string().min(1),
  codigo: z
    .string()
    .trim()
    .min(1)
    .max(30)
    .regex(/^[a-z][a-z0-9_]*$/, "O código do modelo é identificador: minúsculas, dígitos e '_'."),
  nome: z.string().trim().min(3).max(120),
  descricao: z.string().trim().max(500).optional(),
  fonte: z.enum(["PROCESSOS", "COMUNICADOS"]),
  visibilidade: z.enum(["PUBLICO", "AUTOR"]).default("AUTOR"),
  colunas: z.array(zColuna).min(1, "Um relatório sem coluna nenhuma não é relatório."),
  criadoPor: z.string().min(1),
});
export type CriarModeloInput = z.input<typeof zCriarModelo>;

export async function criarModeloDeRelatorio(
  prisma: PrismaClient,
  input: CriarModeloInput
): Promise<{ readonly modeloId: string; readonly versao: number }> {
  const d = zCriarModelo.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.criarModeloDeRelatorio, {
      ug: d.unidadeOrcId,
    });

    validarColunas(d.fonte, d.colunas);

    const jaExiste = await tx.modeloDeRelatorio.findFirst({
      where: { unidadeOrcId: d.unidadeOrcId, codigo: d.codigo },
      select: { versao: true },
    });
    if (jaExiste !== null) {
      throw new Error(
        `Já existe o modelo "${d.codigo}" nesta unidade (versão ${jaExiste.versao}). ` +
          `Para mudá-lo, crie uma VERSÃO NOVA — assim as execuções antigas continuam ` +
          `explicáveis pelo modelo que as produziu. Para partir dele sem alterá-lo, ` +
          `COPIE. Nada foi gravado.`
      );
    }

    const m = await tx.modeloDeRelatorio.create({
      data: {
        unidadeOrcId: d.unidadeOrcId,
        codigo: d.codigo,
        nome: d.nome,
        descricao: d.descricao ?? null,
        fonte: d.fonte,
        visibilidade: d.visibilidade,
        versao: 1,
        vigenciaInicio: new Date(),
        criadoPor: d.criadoPor,
        colunas: { create: d.colunas },
      },
      select: { id: true, versao: true },
    });
    return { modeloId: m.id, versao: m.versao };
  });
}

export const zNovaVersao = z.object({
  modeloId: z.string().min(1),
  nome: z.string().trim().min(3).max(120).optional(),
  descricao: z.string().trim().max(500).optional(),
  visibilidade: z.enum(["PUBLICO", "AUTOR"]).optional(),
  colunas: z.array(zColuna).min(1),
  criadoPor: z.string().min(1),
});
export type NovaVersaoInput = z.input<typeof zNovaVersao>;

/**
 * VERSÃO NOVA — mesmo código, `versao + 1`, e a anterior FICA.
 *
 * ⚠️ ELA NÃO REESCREVE A ANTERIOR, e é o que torna uma execução antiga explicável: o
 * relatório que alguém emitiu em março continua tendo um modelo que diz exatamente como
 * ele foi calculado. Editar no lugar apagaria essa explicação.
 */
export async function novaVersaoDoModelo(
  prisma: PrismaClient,
  input: NovaVersaoInput
): Promise<{ readonly modeloId: string; readonly versao: number }> {
  const d = zNovaVersao.parse(input);

  return prisma.$transaction(async (tx) => {
    const base = await tx.modeloDeRelatorio.findUnique({
      where: { id: d.modeloId },
      select: {
        unidadeOrcId: true,
        codigo: true,
        nome: true,
        descricao: true,
        fonte: true,
        visibilidade: true,
      },
    });
    if (base === null) {
      throw new Error(`Modelo ${d.modeloId} não existe. Nada foi gravado.`);
    }
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.novaVersaoDoModelo, {
      ug: base.unidadeOrcId,
    });

    validarColunas(base.fonte, d.colunas);

    const ultima = await tx.modeloDeRelatorio.findFirst({
      where: { unidadeOrcId: base.unidadeOrcId, codigo: base.codigo },
      select: { versao: true },
      orderBy: { versao: "desc" },
    });

    const m = await tx.modeloDeRelatorio.create({
      data: {
        unidadeOrcId: base.unidadeOrcId,
        codigo: base.codigo,
        nome: d.nome ?? base.nome,
        descricao: d.descricao ?? base.descricao,
        fonte: base.fonte,
        visibilidade: d.visibilidade ?? base.visibilidade,
        versao: (ultima?.versao ?? 0) + 1,
        vigenciaInicio: new Date(),
        criadoPor: d.criadoPor,
        colunas: { create: d.colunas },
      },
      select: { id: true, versao: true },
    });
    return { modeloId: m.id, versao: m.versao };
  });
}

export const zCopiarModelo = z.object({
  modeloId: z.string().min(1),
  novoCodigo: z.string().trim().min(1).max(30).regex(/^[a-z][a-z0-9_]*$/),
  novoNome: z.string().trim().min(3).max(120),
  /** A cópia pode ir para OUTRA unidade, se quem copia puder lá. */
  unidadeOrcId: z.string().min(1).optional(),
  criadoPor: z.string().min(1),
});
export type CopiarModeloInput = z.input<typeof zCopiarModelo>;

/**
 * COPIA — e o ORIGINAL não é tocado. É o teste 17 do lote.
 *
 * ⚠️ A CÓPIA NASCE `AUTOR`, mesmo copiando um modelo público. Herdar a visibilidade
 * publicaria, sem que ninguém decidisse, um rascunho que alguém acabou de derivar de um
 * relatório oficial.
 */
export async function copiarModeloDeRelatorio(
  prisma: PrismaClient,
  input: CopiarModeloInput
): Promise<{ readonly modeloId: string }> {
  const d = zCopiarModelo.parse(input);

  return prisma.$transaction(async (tx) => {
    const base = await tx.modeloDeRelatorio.findUnique({
      where: { id: d.modeloId },
      select: {
        unidadeOrcId: true,
        descricao: true,
        fonte: true,
        visibilidade: true,
        criadoPor: true,
        colunas: {
          select: { ordem: true, rotulo: true, expressao: true, tipo: true },
          orderBy: { ordem: "asc" },
        },
      },
    });
    if (base === null) {
      throw new Error(`Modelo ${d.modeloId} não existe. Nada foi gravado.`);
    }

    const destino = d.unidadeOrcId ?? base.unidadeOrcId;
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.copiarModeloDeRelatorio, {
      ug: destino,
    });

    // ⚠️ MODELO RESTRITO SÓ É COPIÁVEL PELO AUTOR. Copiar seria a maneira mais simples
    // de ler o que o autor decidiu não publicar — as expressões vão junto.
    if (base.visibilidade === "AUTOR" && base.criadoPor !== d.criadoPor) {
      throw new Error(
        `Este modelo é RESTRITO ao autor e não pode ser copiado por terceiros: as ` +
          `expressões iriam junto, e copiar viraria a forma mais simples de ler o que o ` +
          `autor decidiu não publicar. Nada foi gravado.`
      );
    }

    const jaExiste = await tx.modeloDeRelatorio.findFirst({
      where: { unidadeOrcId: destino, codigo: d.novoCodigo },
      select: { id: true },
    });
    if (jaExiste !== null) {
      throw new Error(
        `Já existe um modelo com o código "${d.novoCodigo}" na unidade de destino. ` +
          `Nada foi gravado.`
      );
    }

    const copia = await tx.modeloDeRelatorio.create({
      data: {
        unidadeOrcId: destino,
        codigo: d.novoCodigo,
        nome: d.novoNome,
        descricao: base.descricao,
        fonte: base.fonte,
        // Ver o cabeçalho: a cópia nasce restrita.
        visibilidade: "AUTOR",
        versao: 1,
        vigenciaInicio: new Date(),
        copiadoDeId: d.modeloId,
        criadoPor: d.criadoPor,
        colunas: { create: base.colunas },
      },
      select: { id: true },
    });
    return { modeloId: copia.id };
  });
}

export const zDistribuirModelo = z.object({
  modeloId: z.string().min(1),
  unidadeOrcId: z.string().min(1),
  criadoPor: z.string().min(1),
});
export type DistribuirModeloInput = z.input<typeof zDistribuirModelo>;

/**
 * DISTRIBUI a outra unidade autorizada — com PERMISSÃO PRÓPRIA, como o catálogo pede.
 *
 * ⚠️ DISTRIBUIR DÁ ACESSO, NÃO COPIA. Copiar faria as duas versões divergirem na
 * primeira correção, e a entidade que recebeu continuaria com o defeito. E o modelo
 * distribuído roda sobre os dados de QUEM O EXECUTA — não sobre os de quem o desenhou.
 */
export async function distribuirModeloDeRelatorio(
  prisma: PrismaClient,
  input: DistribuirModeloInput
): Promise<{ readonly distribuicaoId: string }> {
  const d = zDistribuirModelo.parse(input);

  return prisma.$transaction(async (tx) => {
    const m = await tx.modeloDeRelatorio.findUnique({
      where: { id: d.modeloId },
      select: { unidadeOrcId: true, nome: true },
    });
    if (m === null) {
      throw new Error(`Modelo ${d.modeloId} não existe. Nada foi gravado.`);
    }
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.distribuirModeloDeRelatorio, {
      ug: m.unidadeOrcId,
    });

    if (m.unidadeOrcId === d.unidadeOrcId) {
      throw new Error(
        `O modelo já é da unidade de destino — distribuí-lo para ela não muda nada. ` +
          `Nada foi gravado.`
      );
    }
    const destino = await tx.unidadeOrcamentaria.findUnique({
      where: { id: d.unidadeOrcId },
      select: { id: true },
    });
    if (destino === null) {
      throw new Error(`Unidade gestora ${d.unidadeOrcId} não existe. Nada foi gravado.`);
    }

    const dist = await tx.distribuicaoDeModelo.upsert({
      where: {
        modeloId_unidadeOrcId: { modeloId: d.modeloId, unidadeOrcId: d.unidadeOrcId },
      },
      update: {},
      create: {
        modeloId: d.modeloId,
        unidadeOrcId: d.unidadeOrcId,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { distribuicaoId: dist.id };
  });
}

export const zRetirarModelo = z.object({
  modeloId: z.string().min(1),
  motivo: z.string().trim().min(10),
  criadoPor: z.string().min(1),
});
export type RetirarModeloInput = z.input<typeof zRetirarModelo>;

export async function retirarModeloDeRelatorio(
  prisma: PrismaClient,
  input: RetirarModeloInput
): Promise<{ readonly retiradaId: string }> {
  const d = zRetirarModelo.parse(input);

  return prisma.$transaction(async (tx) => {
    const m = await tx.modeloDeRelatorio.findUnique({
      where: { id: d.modeloId },
      select: { unidadeOrcId: true, retirada: { select: { id: true } } },
    });
    if (m === null) {
      throw new Error(`Modelo ${d.modeloId} não existe. Nada foi gravado.`);
    }
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.retirarModeloDeRelatorio, {
      ug: m.unidadeOrcId,
    });
    if (m.retirada !== null) {
      throw new Error(`Este modelo já foi retirado de vigência. Nada foi gravado.`);
    }

    const r = await tx.retiradaDeModelo.create({
      data: { modeloId: d.modeloId, motivo: d.motivo, criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { retiradaId: r.id };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// A EXECUÇÃO — enfileirar é o ato; processar é o trabalho
// ═══════════════════════════════════════════════════════════════════════════

export const zExecutarRelatorio = z.object({
  modeloId: z.string().min(1),
  unidadeOrcId: z.string().min(1),
  /** "campo=valor" por linha. Confrontado com as colunas da fonte — nunca vira SQL. */
  filtros: z.string().trim().max(1000).optional(),
  criadoPor: z.string().min(1),
});
export type ExecutarRelatorioInput = z.input<typeof zExecutarRelatorio>;

/**
 * ENFILEIRA a execução — e devolve na hora.
 *
 * ⚠️ O RELATÓRIO NÃO É CALCULADO AQUI, e é isso que o catálogo pede ao falar em
 * "execução em segundo plano". Calcular dentro da requisição faria o navegador esperar
 * por uma varredura que pode levar minutos — e o `timeout` do proxy mataria o pedido
 * sem deixar rastro de que ele existiu.
 */
export async function executarRelatorio(
  prisma: PrismaClient,
  input: ExecutarRelatorioInput
): Promise<{ readonly execucaoId: string }> {
  const d = zExecutarRelatorio.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.executarRelatorio, {
      ug: d.unidadeOrcId,
    });

    const m = await tx.modeloDeRelatorio.findUnique({
      where: { id: d.modeloId },
      select: {
        unidadeOrcId: true,
        visibilidade: true,
        criadoPor: true,
        retirada: { select: { criadoEm: true } },
        distribuicoes: { select: { unidadeOrcId: true } },
      },
    });
    if (m === null) {
      throw new Error(`Modelo ${d.modeloId} não existe. Nada foi gravado.`);
    }
    if (m.retirada !== null) {
      throw new Error(
        `Este modelo foi RETIRADO de vigência e não produz relatório novo. As execuções ` +
          `antigas continuam disponíveis. Nada foi gravado.`
      );
    }

    // ⚠️ MODELO RESTRITO SÓ RODA PARA O AUTOR — é o outro lado do teste 17 do lote.
    if (m.visibilidade === "AUTOR" && m.criadoPor !== d.criadoPor) {
      throw new Error(
        `Este modelo é RESTRITO ao autor. Nada foi gravado.`
      );
    }

    const podeNaUnidade =
      m.unidadeOrcId === d.unidadeOrcId ||
      m.distribuicoes.some((x) => x.unidadeOrcId === d.unidadeOrcId);
    if (!podeNaUnidade) {
      throw new Error(
        `O modelo não pertence a esta unidade gestora nem lhe foi distribuído. ` +
          `Distribuí-lo é ato próprio, com permissão própria. Nada foi gravado.`
      );
    }

    const e = await tx.execucaoDeRelatorio.create({
      data: {
        modeloId: d.modeloId,
        unidadeOrcId: d.unidadeOrcId,
        filtros: d.filtros ?? null,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { execucaoId: e.id };
  });
}

/**
 * PROCESSA a fila — o trabalho de fato.
 *
 * ⚠️ ELE NÃO COBRA AUTORIZAÇÃO, e a razão é que ele não é ato de usuário: a autorização
 * aconteceu no ENFILEIRAMENTO, com a identidade de quem pediu. Exigir crachá do
 * trabalhador seria pedir permissão ao processo — e a única saída seria dar-lhe um
 * crachá de superusuário, que é o oposto do que se quer.
 *
 * ⚠️ E CADA EXECUÇÃO É UMA TRANSAÇÃO. Uma falha na terceira não desfaz as duas
 * primeiras: elas concluíram de verdade, e o usuário já foi avisado.
 */
export async function processarExecucoesPendentes(
  prisma: PrismaClient,
  limiteDeExecucoes = 20
): Promise<{ readonly processadas: number; readonly falhas: number }> {
  const pendentes = await prisma.execucaoDeRelatorio.findMany({
    where: { movimentos: { none: {} } },
    select: { id: true },
    orderBy: { criadoEm: "asc" },
    take: limiteDeExecucoes,
  });

  let processadas = 0;
  let falhas = 0;

  for (const { id } of pendentes) {
    try {
      await prisma.$transaction(async (tx) => {
        await produzirResultado(tx, id);
      });
      processadas += 1;
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      // ⚠️ A FALHA É GRAVADA FORA DA TRANSAÇÃO QUE FALHOU. Dentro dela, o rollback
      // levaria o registro do erro junto — e a execução ficaria pendente para sempre,
      // sendo retentada eternamente sem que ninguém soubesse por quê.
      await prisma.$transaction(async (tx) => {
        await tx.movimentoDaExecucao.create({
          data: { execucaoId: id, tipo: "FALHA", detalhe: mensagem.slice(0, 2000) },
        });
        const e = await tx.execucaoDeRelatorio.findUniqueOrThrow({
          where: { id },
          select: { criadoPor: true, modelo: { select: { nome: true } } },
        });
        await registrarNotificacao(tx, {
          destinatario: e.criadoPor,
          evento: "RELATORIO_FALHOU",
          titulo: `O relatório "${e.modelo.nome}" não pôde ser gerado`,
          corpo: mensagem.slice(0, 500),
          rota: `/relatorios/execucoes/${id}`,
        });
      });
      falhas += 1;
    }
  }

  return { processadas, falhas };
}

async function produzirResultado(tx: Tx, execucaoId: string): Promise<void> {
  const e = await tx.execucaoDeRelatorio.findUniqueOrThrow({
    where: { id: execucaoId },
    select: {
      unidadeOrcId: true,
      filtros: true,
      criadoPor: true,
      modelo: {
        select: {
          nome: true,
          fonte: true,
          colunas: {
            select: { ordem: true, rotulo: true, expressao: true, tipo: true },
            orderBy: { ordem: "asc" },
          },
        },
      },
    },
  });

  const linhas =
    e.modelo.fonte === "PROCESSOS"
      ? await lerFonteProcessos(tx, e.unidadeOrcId, e.criadoPor, LIMITE_DE_LINHAS)
      : await lerFonteComunicados(tx, e.unidadeOrcId, e.criadoPor, LIMITE_DE_LINHAS);

  const filtros = analisarFiltros(e.filtros, e.modelo.fonte);
  const filtradas = linhas.filter((l) =>
    filtros.every((f) => {
      const v = l[f.campo];
      const texto =
        v === null ? "" : v instanceof Date ? diaCivil(v) : String(v);
      return texto.toLowerCase().includes(f.valor.toLowerCase());
    })
  );

  const arvores = e.modelo.colunas.map((c) => ({
    tipo: c.tipo as TipoDeColuna,
    arvore: analisar(c.expressao),
  }));

  const cabecalho = e.modelo.colunas.map((c) => c.rotulo);
  const corpo = filtradas.map((linha) =>
    arvores.map((c) => formatarCelula(c.tipo, avaliar(c.arvore, linha)))
  );

  await tx.resultadoDaExecucao.create({
    data: {
      execucaoId,
      csv: paraCsv([cabecalho, ...corpo]),
      linhas: corpo.length,
    },
  });
  await tx.movimentoDaExecucao.create({
    data: { execucaoId, tipo: "CONCLUSAO" },
  });

  // ⚠️ A NOTIFICAÇÃO É REAL, e o catálogo pede exatamente isto: aviso ao término com o
  // resultado abrível. Ela vai na MESMA transação da conclusão — avisar sobre um
  // resultado que o rollback levou embora seria avisar uma mentira.
  await registrarNotificacao(tx, {
    destinatario: e.criadoPor,
    evento: "RELATORIO_CONCLUIDO",
    titulo: `O relatório "${e.modelo.nome}" ficou pronto`,
    corpo: `${corpo.length} linha(s).`,
    rota: `/relatorios/execucoes/${execucaoId}`,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS — privados
// ═══════════════════════════════════════════════════════════════════════════

/**
 * VALIDA AS COLUNAS: a expressão analisa, e os campos existem na FONTE.
 *
 * ⚠️ CONFERIR OS CAMPOS AQUI É O QUE IMPEDE UM MODELO QUEBRADO DE SER DISTRIBUÍDO. Sem
 * isso, `total` — que não existe em fonte nenhuma — só estouraria na primeira execução,
 * possivelmente para outra pessoa, dentro de um relatório já compartilhado.
 */
function validarColunas(
  fonte: string,
  colunas: readonly { readonly ordem: number; readonly rotulo: string; readonly expressao: string }[]
): void {
  const publicadas = new Set(
    (COLUNAS_DA_FONTE[fonte] ?? []).map((c) => c.nome)
  );

  const ordens = new Set(colunas.map((c) => c.ordem));
  if (ordens.size !== colunas.length) {
    throw new Error("Duas colunas com a mesma ordem. Nada foi gravado.");
  }

  for (const c of colunas) {
    let arvore;
    try {
      arvore = analisar(c.expressao);
    } catch (erro) {
      throw new Error(
        `Coluna "${c.rotulo}": ${erro instanceof Error ? erro.message : String(erro)}. ` +
          `Nada foi gravado.`
      );
    }
    const usados = [...camposUsados(arvore)].filter((n) => !publicadas.has(n));
    if (usados.length > 0) {
      throw new Error(
        `Coluna "${c.rotulo}": campo(s) inexistente(s) na fonte ${fonte}: ` +
          `${usados.join(", ")}. Os campos disponíveis são ` +
          `${[...publicadas].join(", ")}. Nada foi gravado.`
      );
    }
  }
}

/** "campo=valor" por linha. NÃO vira SQL: é comparado em memória, sobre a fonte já lida. */
function analisarFiltros(
  bruto: string | null,
  fonte: string
): readonly { readonly campo: string; readonly valor: string }[] {
  if (bruto === null || bruto.trim() === "") return [];
  const publicadas = new Set((COLUNAS_DA_FONTE[fonte] ?? []).map((c) => c.nome));

  return bruto
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "")
    .map((linha) => {
      const i = linha.indexOf("=");
      if (i < 1) {
        throw new Error(
          `Filtro inválido: "${linha}". Use uma linha por filtro, no formato campo=valor.`
        );
      }
      const campo = linha.slice(0, i).trim();
      if (!publicadas.has(campo)) {
        throw new Error(
          `Filtro sobre campo inexistente na fonte ${fonte}: "${campo}". Os campos ` +
            `disponíveis são ${[...publicadas].join(", ")}.`
        );
      }
      return { campo, valor: linha.slice(i + 1).trim() };
    });
}

/** CSV RFC-4180 — mesmo dialeto do M13. */
function paraCsv(linhas: readonly (readonly string[])[]): string {
  const celula = (v: string): string =>
    /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  return linhas.map((l) => l.map(celula).join(",")).join("\r\n");
}
