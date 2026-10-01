import "dotenv/config";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import type { PrismaClient } from "../prisma/generated/client/client.js";
import { POC_SAGRES } from "../lib/portas/sagres-poc.js";
import { fecharBrowser } from "../lib/pdf/gerar.js";
import {
  emitir,
  montarDecreto,
  montarExtraorcamentario,
  montarNotaEmpenho,
  montarPatrimonio,
  montarPdfArrecadacao,
  montarPdfEmpenhos,
  montarPdfLiquidacoes,
} from "../lib/pdf/operacionais.js";
import { gerarPdfPublico } from "../lib/pdf/demonstrativos.js";
import {
  datasetDespesa,
  datasetReceita,
  paraCsv as paraCsvDadoAberto,
} from "../modules/m13-transparencia/index.js";
import {
  gerarCadastroContaBancaria,
  gerarDespesaExtra,
  gerarDotacao,
  gerarEmpenhos,
  gerarLiquidacao,
  gerarMovimentacaoEntreContas,
  gerarPagamentos,
  gerarEstornoPagamento,
  gerarEstornos,
  gerarEstornoLiquidacao,
  gerarEstornoRetencao,
  gerarArquivosDeRestos,
  gerarRestosInscritos,
  gerarEstornoDespesaExtra,
  gerarReceitaExtraOuRecusa,
  gerarEstornoReceitaExtraOuRecusa,
  gerarConciliacaoBancariaOuRecusa,
  gerarUnidadeOrcamentariaOuRecusa,
  gerarReceitaOrcamentaria,
  gerarRetencao,
  gerarSaldoMensal,
  lerFatosEmpenhos,
  montarPacote,
  type ArquivoGerado,
} from "../adapters/tribunais/tce-pb/sagres/index.js";
import {
  empenhoParaCaptura,
  montarEnvelope,
  transicaoSubmissaoMock,
  transicaoValidacao,
  validarEnvelopeCaptura,
  type EstadoCaptura,
} from "../adapters/tribunais/tce-pb/captura/index.js";

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POC — PACOTE DE CONTINGÊNCIA (S-fechamento, F4c).
 *
 * Gera, FORA da aplicação web e FORA do git, TODOS os artefatos da POC para TODOS os períodos que
 * têm movimento no banco. É a saída operacional: se a aplicação não subir no dia da demonstração,
 * a pasta CONTINGENCIA/ sozinha prova o que o sistema faz.
 *
 * O QUE GERA (por período com movimento, descoberto do banco — nunca lista fixa):
 *   · SAGRES DIÁRIO  — os 8 arquivos diários + ZIP + manifesto, para CADA DIA com fato.
 *   · SAGRES MENSAL  — Dotacao + SaldoMensal + ZIP + manifesto, para CADA MÊS com fato.
 *   · JSON Captura   — envelope validado contra o schema oficial, com a trilha de estado terminando
 *                      em SIMULATED (simulação local — JAMAIS aceite do TCE).
 *   · PDFs           — Nota de Empenho, decreto de crédito, posição patrimonial, extraorçamentário,
 *                      transparência (RREO anexo 1), empenhos, liquidações, arrecadação.
 *   · CSVs           — dado aberto de despesa e receita (RFC-4180, M13).
 *
 * CADA artefato entra no MANIFEST-CONTINGENCIA.json com o seu SHA-256 — a hierarquia de evidência
 * da POC vale tanto para o que a tela mostra quanto para o que esta pasta contém.
 *
 * ⚠️ COMUNICAÇÃO HONESTA (DIRETIVA §7): tudo aqui é "formato oficial GERADO E VALIDADO LOCALMENTE".
 * Nada foi transmitido. Não há protocolo, recibo nem aceite do TCE em nenhum artefato.
 *
 * ⚠️ LEITURA PURA: este script NÃO escreve no banco. Por isso a trilha da Captura usa as transições
 * PURAS da máquina de estados (`transicaoValidacao`/`transicaoSubmissaoMock`) em vez de
 * `submeterCaptura` — que persistiria uma ExecucaoCaptura. O estado é derivado, não inventado: é a
 * mesma função que a tela usa.
 *
 * Uso:  npx tsx scripts/poc-contingencia.ts   (ou `npm run poc:contingencia`)
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 */

const RAIZ = "CONTINGENCIA"; // fora do git (.gitignore) — é artefato, não código.

/** Uma entrada do manifesto: o artefato e a sua impressão digital. */
interface ArtefatoNoManifesto {
  readonly caminho: string;
  readonly bytes: number;
  readonly sha256: string;
  /** O que este artefato prova, em uma linha — o manifesto é lido por humano. */
  readonly descricao: string;
}

const artefatos: ArtefatoNoManifesto[] = [];

function sha256De(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** Escreve o artefato e o registra no manifesto. Único caminho de escrita — nada escapa ao SHA. */
function gravar(caminhoRelativo: string, conteudo: Buffer | string, descricao: string): void {
  const buf = typeof conteudo === "string" ? Buffer.from(conteudo, "utf8") : conteudo;
  const destino = join(RAIZ, caminhoRelativo);
  mkdirSync(join(destino, ".."), { recursive: true });
  writeFileSync(destino, buf);
  artefatos.push({ caminho: caminhoRelativo.replaceAll("\\", "/"), bytes: buf.length, sha256: sha256De(buf), descricao });
}

/**
 * A RECUSA DE UM PERÍODO VIRA ARTEFATO, e o pacote segue para os outros. O gerador do SAGRES recusa
 * dado fora do leiaute (ex.: número de empenho que não é numérico de 7 dígitos) — e a recusa está
 * certa. Parar tudo na primeira deixava a pasta inteira velha por causa de um dia; engolir a recusa
 * deixava o dia sem prova. O arquivo RECUSA.txt diz o período e o motivo, e o manifesto a lista.
 */
const recusas: { readonly periodo: string; readonly motivo: string }[] = [];
function registrarRecusa(pasta: string, periodo: string, erro: unknown): string {
  const motivo = erro instanceof Error ? erro.message : String(erro);
  gravar(join(pasta, "RECUSA.txt"), `Período ${periodo}: o pacote NÃO foi gerado.\r\nMotivo: ${motivo}\r\n`, `Recusa do período ${periodo}, com o motivo.`);
  recusas.push({ periodo, motivo });
  return motivo;
}

const iso = (d: Date): string => d.toISOString().slice(0, 10);
const diaUtc = (s: string): Date => new Date(`${s}T00:00:00Z`);

/**
 * OS PERÍODOS COM MOVIMENTO — descobertos do banco, não fixados. Se a massa mudar, a contingência
 * acompanha sozinha. Cada fato exportável contribui com o seu dia; o mês vem do dia.
 */
async function periodosComMovimento(prisma: PrismaClient): Promise<{ dias: string[]; meses: string[]; exercicios: number[] }> {
  const dias = new Set<string>();
  const juntar = (linhas: readonly { readonly [k: string]: unknown }[], campo: string): void => {
    for (const l of linhas) dias.add(iso(l[campo] as Date));
  };

  juntar(await prisma.empenho.findMany({ select: { data: true } }), "data");
  juntar(await prisma.liquidacao.findMany({ select: { data: true } }), "data");
  // Só pagamentos genuínos — o mesmo filtro do exporter (estorno/anulação não é pagamento).
  juntar(await prisma.pagamento.findMany({ where: { estornoDeId: null, anulacaoParcialDeId: null }, select: { data: true } }), "data");
  // V23 — a anulação de pagamento também é dia com arquivo (EstornoPagamento §4.13). As de empenho e de
  // liquidação já entram pelas duas linhas acima, que não filtram (Estornos §4.9, EstornoLiquidacao §4.11).
  juntar(await prisma.pagamento.findMany({ where: { OR: [{ estornoDeId: { not: null } }, { anulacaoParcialDeId: { not: null } }] }, select: { data: true } }), "data");
  // V23 — os estornos extraorçamentários (EstornoRetencao §4.15 e EstornoDespesaExtra §4.22).
  juntar(await prisma.movimentoExtraorcamentario.findMany({ where: { OR: [{ tipo: "ESTORNO_INGRESSO", pagamentoId: { not: null } }, { tipo: "ESTORNO_DISPENDIO" }] }, select: { data: true } }), "data");
  // V23 — o ingresso avulso e o estorno de ingresso também têm arquivo (ReceitaExtra §4.19, EstornoReceitaExtra §4.21).
  juntar(await prisma.movimentoExtraorcamentario.findMany({ where: { OR: [{ tipo: "INGRESSO" }, { tipo: "ESTORNO_INGRESSO" }] }, select: { data: true } }), "data");
  juntar(await prisma.receitaArrecadada.findMany({ select: { dataArrecadacao: true } }), "dataArrecadacao");
  juntar(await prisma.transferenciaEntreContas.findMany({ select: { data: true } }), "data");
  juntar(await prisma.movimentoExtraorcamentario.findMany({ where: { tipo: "INGRESSO", pagamentoId: { not: null } }, select: { data: true } }), "data");
  juntar(await prisma.movimentoExtraorcamentario.findMany({ where: { tipo: "DISPENDIO" }, select: { data: true } }), "data");

  const ordenados = [...dias].sort();
  const meses = [...new Set(ordenados.map((d) => d.slice(0, 7)))].sort();
  const fichas = await prisma.fichaOrcamentaria.findMany({ select: { exercicio: true }, distinct: ["exercicio"] });
  const exercicios = [...new Set(fichas.map((f) => f.exercicio))].sort();
  return { dias: ordenados, meses, exercicios };
}

/** Empacota um conjunto de arquivos SAGRES: os .txt soltos + o ZIP + o manifesto do pacote. */
function gravarPacoteSagres(pasta: string, competencia: string, periodicidade: "DIARIO" | "MENSAL", arquivos: ArquivoGerado[]): number {
  for (const a of arquivos) {
    gravar(join(pasta, a.nome), a.conteudo, `SAGRES ${periodicidade.toLowerCase()} ${competencia} — ${a.registros} registro(s), largura fixa, UTF-8 sem BOM, CRLF.`);
  }
  const pacote = montarPacote(
    { layout: "2026 v1.1 (12/12/2025)", periodicidade, competencia, codUnidadeGestora: POC_SAGRES.codUnidadeGestora },
    arquivos
  );
  gravar(join(pasta, pacote.nome), pacote.zip, `Pacote SAGRES ${periodicidade.toLowerCase()} ${competencia} (ZIP determinístico + manifesto interno). hashPacote=${pacote.manifesto.hashPacote}`);
  gravar(join(pasta, "manifesto.json"), JSON.stringify(pacote.manifesto, null, 2), `Manifesto do pacote SAGRES ${competencia} — natureza: ${pacote.manifesto.natureza}.`);
  return arquivos.reduce((s, a) => s + a.registros, 0);
}

async function gerarSagresDiario(prisma: PrismaClient, dia: string): Promise<number> {
  const d = diaUtc(dia);
  const ug = POC_SAGRES.codUnidadeGestora;
  const cnpj = POC_SAGRES.cnpjGerenciadora;
  const arquivos = await Promise.all([
    gerarEmpenhos(prisma, { codUnidadeGestora: ug, dia: d }),
    gerarLiquidacao(prisma, { codUnidadeGestora: ug, dia: d }),
    gerarPagamentos(prisma, { codUnidadeGestora: ug, cnpjGerenciadora: cnpj, dia: d }),
    gerarEstornoPagamento(prisma, { codUnidadeGestora: ug, dia: d }),
    gerarEstornos(prisma, { codUnidadeGestora: ug, dia: d }),
    gerarEstornoLiquidacao(prisma, { codUnidadeGestora: ug, dia: d }),
    gerarEstornoRetencao(prisma, { codUnidadeGestora: ug, dia: d }),
    gerarEstornoDespesaExtra(prisma, { codUnidadeGestora: ug, dia: d }),
    gerarReceitaOrcamentaria(prisma, { codUnidadeGestora: ug, cnpjGerenciadora: cnpj, codContaArrecadadora: POC_SAGRES.codContaArrecadadora, dia: d }),
    gerarCadastroContaBancaria(prisma, { codUnidadeGestora: ug, cnpjGerenciadora: cnpj, dia: d }),
    gerarMovimentacaoEntreContas(prisma, { codUnidadeGestora: ug, dia: d }),
    gerarRetencao(prisma, { codUnidadeGestora: ug, dia: d }),
    gerarDespesaExtra(prisma, { codUnidadeGestora: ug, cnpjGerenciadora: cnpj, codFonteRecursoExtra: POC_SAGRES.codFonteRecursoExtra, dia: d }),
  ]);
  // V23 — a receita extra e o estorno dela: o arquivo, ou o motivo no console (o pacote não cai por eles).
  const receitaExtra = await gerarReceitaExtraOuRecusa(prisma, { codUnidadeGestora: ug, cnpjGerenciadora: cnpj, codFonteRecursoExtra: POC_SAGRES.codFonteRecursoExtra, dia: d });
  if ("arquivo" in receitaExtra) arquivos.push(receitaExtra.arquivo);
  else console.log(`  · ${dia} — ReceitaExtra fora do pacote: ${receitaExtra.recusa.slice(0, 160)}`);
  const estornoReceitaExtra = await gerarEstornoReceitaExtraOuRecusa(prisma, { codUnidadeGestora: ug, dia: d });
  if ("arquivo" in estornoReceitaExtra) arquivos.push(estornoReceitaExtra.arquivo);
  else console.log(`  · ${dia} — EstornoReceitaExtra fora do pacote: ${estornoReceitaExtra.recusa.slice(0, 160)}`);
  // V24 — os restos a pagar diários (§4.28–§4.34); os inscritos (§4.40) vão no mensal de dezembro.
  const restos = await gerarArquivosDeRestos(prisma, { codUnidadeGestora: ug, cnpjGerenciadora: cnpj, dia: d, competencia: new Date(Date.UTC(d.getUTCFullYear(), 0, 1)) });
  arquivos.push(...restos.arquivos.map((r) => r.arquivo));
  for (const r of restos.recusas) console.log(`  · ${dia} — ${r.arquivo} fora do pacote: ${r.detalhe.slice(0, 160)}`);
  return gravarPacoteSagres(join("sagres", "diario", dia), dia, "DIARIO", arquivos);
}

async function gerarSagresMensal(prisma: PrismaClient, mes: string): Promise<number> {
  // O último dia do mês é a competência canônica do mensal (o SaldoMensal soma até ali).
  const [ano, mm] = mes.split("-").map(Number) as [number, number];
  const fimDoMes = new Date(Date.UTC(ano, mm, 0));
  const ug = POC_SAGRES.codUnidadeGestora;
  const arquivos: ArquivoGerado[] = await Promise.all([
    gerarDotacao(prisma, { codUnidadeGestora: ug, exercicio: ano, competencia: fimDoMes }),
    gerarSaldoMensal(prisma, { codUnidadeGestora: ug, cnpjGerenciadora: POC_SAGRES.cnpjGerenciadora, competencia: fimDoMes }),
  ]);
  // V21 — a conciliação (§4.27) quando a conta fecha; quando não, o motivo vai ao console.
  const conciliacao = await gerarConciliacaoBancariaOuRecusa(prisma, { codUnidadeGestora: ug, cnpjGerenciadora: POC_SAGRES.cnpjGerenciadora, competencia: fimDoMes });
  if ("arquivo" in conciliacao) arquivos.push(conciliacao.arquivo);
  else console.log(`  · ${mes} — ConciliacaoBancaria fora do pacote: ${conciliacao.recusa.slice(0, 160)}`);
  const unidades = await gerarUnidadeOrcamentariaOuRecusa(prisma, { codUnidadeGestora: ug, competencia: fimDoMes });
  if ("arquivo" in unidades) arquivos.push(unidades.arquivo);
  else console.log(`  · ${mes} — UnidadeOrcamentaria fora do pacote: ${unidades.recusa.slice(0, 160)}`);
  // V24 — os restos inscritos (§4.40) só no balancete de dezembro.
  if (mm === 12) arquivos.push(await gerarRestosInscritos(prisma, { codUnidadeGestora: ug, competencia: fimDoMes }));
  return gravarPacoteSagres(join("sagres", "mensal", mes), mes, "MENSAL", arquivos);
}

/**
 * JSON CAPTURA — o envelope validado contra o schema oficial, com a TRILHA DE ESTADO.
 * O estado final é SIMULATED: simulação LOCAL, com id interno. Não é protocolo, não é recibo,
 * não é aceite. O artefato carrega essa frase para quem o abrir fora de contexto.
 */
async function gerarCaptura(prisma: PrismaClient, dia: string): Promise<{ elementos: number; violacoes: number; estado: EstadoCaptura }> {
  const fatos = await lerFatosEmpenhos(prisma, { codUnidadeGestora: POC_SAGRES.codUnidadeGestora, dia: diaUtc(dia) });
  const elementos = fatos.map((f) => empenhoParaCaptura(f));
  // Timestamp derivado do PERÍODO (não do relógio): o artefato é determinístico e reproduzível.
  const envelope = montarEnvelope(elementos, `${dia}T00:00:00.000000`);
  const violacoes = validarEnvelopeCaptura("empenhos", envelope);

  // A trilha, pelas transições PURAS do módulo — as mesmas que a tela usa.
  let estado: EstadoCaptura = "DRAFT";
  estado = transicaoValidacao(estado, violacoes.length === 0);
  const trilha: EstadoCaptura[] = ["DRAFT", estado];
  if (estado === "VALIDATED_LOCAL") {
    estado = transicaoSubmissaoMock(estado);
    trilha.push("SUBMITTED_MOCK", estado);
  }

  const artefato = {
    _natureza: "SIMULACAO_LOCAL — o estado SIMULATED e o simulationId são INTERNOS. Nenhuma transmissão ao TCE foi feita: não há protocolo, recibo nem aceite.",
    entidade: "empenhos",
    competencia: dia,
    modo: "MOCK",
    estado,
    trilhaDeEstados: trilha,
    violacoes,
    envelope,
  };
  gravar(
    join("captura", `captura-empenhos-${dia}.json`),
    JSON.stringify(artefato, null, 2),
    `JSON Captura 2.0 (empenhos, ${dia}) — ${elementos.length} elemento(s), ${violacoes.length} violação(ões), estado ${estado} (simulação local).`
  );
  return { elementos: elementos.length, violacoes: violacoes.length, estado };
}

/** Grava um PDF já emitido (ou avisa que a origem não existe — nunca um PDF falso). */
async function gravarPdf(nomeBase: string, doc: Awaited<ReturnType<typeof montarPdfEmpenhos>> | null, descricao: string): Promise<boolean> {
  if (doc === null) return false;
  const r = await emitir(doc, nomeBase);
  gravar(join("pdf", r.nomeArquivo), Buffer.from(r.pdf), `${descricao} (hash do conteúdo: ${r.hash.slice(0, 12)}…).`);
  return true;
}

async function gerarPdfs(prisma: PrismaClient, exercicio: number): Promise<string[]> {
  const feitos: string[] = [];
  const marcar = (nome: string, ok: boolean): void => {
    if (ok) feitos.push(nome);
  };

  marcar("empenhos", await gravarPdf(`empenhos-${exercicio}`, await montarPdfEmpenhos({ exercicio }), `Relação de empenhos do exercício ${exercicio}`));
  marcar("liquidacoes", await gravarPdf(`liquidacoes-${exercicio}`, await montarPdfLiquidacoes({ exercicio }), `Relação de liquidações do exercício ${exercicio}`));
  marcar("arrecadacoes", await gravarPdf(`arrecadacoes-${exercicio}`, await montarPdfArrecadacao({ exercicio }), `Relação de arrecadações do exercício ${exercicio}`));
  marcar("extraorcamentario", await gravarPdf(`extraorcamentario-${exercicio}`, await montarExtraorcamentario({ exercicio }), `Posição extraorçamentária (consignações e saldos por consignatário) ${exercicio}`));
  marcar("patrimonio", await gravarPdf(`patrimonio-${exercicio}`, await montarPatrimonio({ exercicio }), `Posição patrimonial por classe ${exercicio}`));

  // NOTA DE EMPENHO — documento POR DOCUMENTO: emite a do primeiro empenho do exercício.
  const empenho = await prisma.empenho.findFirst({ where: { data: { gte: new Date(Date.UTC(exercicio, 0, 1)), lt: new Date(Date.UTC(exercicio + 1, 0, 1)) } }, orderBy: [{ numero: "asc" }], select: { id: true, numero: true } });
  if (empenho !== null) {
    marcar(`nota-empenho-${empenho.numero}`, await gravarPdf(`nota-empenho-${exercicio}`, await montarNotaEmpenho({ exercicio, id: empenho.id }), `Nota de Empenho nº ${empenho.numero}/${exercicio}`));
  }

  // DECRETO de crédito adicional — idem, o primeiro do ano.
  const decreto = await prisma.decretoCredito.findFirst({ where: { ano: exercicio }, orderBy: [{ numero: "asc" }], select: { id: true, numero: true } });
  if (decreto !== null) {
    marcar(`decreto-${decreto.numero}`, await gravarPdf(`decreto-credito-${exercicio}`, await montarDecreto({ ano: exercicio, id: decreto.id }), `Decreto de crédito adicional nº ${decreto.numero}/${exercicio}`));
  }

  // TRANSPARÊNCIA — o demonstrativo público (RREO anexo 1), já vem emitido.
  const publico = await gerarPdfPublico("rreo-anexo1", { exercicio, bimestre: 1 });
  if (publico !== null) {
    gravar(join("pdf", publico.nomeArquivo), Buffer.from(publico.pdf), `Transparência — RREO Anexo 1, ${exercicio} (1º bimestre).`);
    feitos.push("transparencia-rreo-anexo1");
  }
  return feitos;
}

async function gerarCsvs(prisma: PrismaClient, exercicio: number): Promise<string[]> {
  const ate = new Date(Date.UTC(exercicio, 11, 31));
  const despesa = await datasetDespesa(prisma, { ate, exercicio });
  const receita = await datasetReceita(prisma, { exercicio, ate });
  gravar(join("csv", `dado-aberto-despesa-${exercicio}.csv`), paraCsvDadoAberto(despesa), `Dado aberto — despesa ${exercicio} (RFC-4180), ${despesa.length} linha(s).`);
  gravar(join("csv", `dado-aberto-receita-${exercicio}.csv`), paraCsvDadoAberto(receita), `Dado aberto — receita ${exercicio} (RFC-4180), ${receita.length} linha(s).`);

  // Índice dos períodos, em CSV Excel-BR (`;` + BOM) — o que abre com dois cliques no Windows.
  return [`despesa (${despesa.length})`, `receita (${receita.length})`];
}

async function main(): Promise<void> {
  const url = process.env["DATABASE_URL"];
  if (url === undefined || url === "") {
    throw new Error("DATABASE_URL não configurada — o pacote de contingência lê o banco de demonstração.");
  }
  const prisma = criarPrismaClient(url);
  try {
    console.log("═══ POC — PACOTE DE CONTINGÊNCIA ═══");
    const { dias, meses, exercicios } = await periodosComMovimento(prisma);
    console.log(`Períodos descobertos no banco: ${dias.length} dia(s), ${meses.length} mês(es), exercício(s) ${exercicios.join(", ") || "—"}.`);
    if (dias.length === 0) {
      throw new Error(
        "Nenhum período com movimento no banco. Rode a massa POC antes (npm run seed:sagres-poc) — " +
          "a contingência EXPORTA o que existe, nunca inventa massa."
      );
    }

    // ── SAGRES diário, dia a dia ──
    const resumoDias: string[] = [];
    for (const dia of dias) {
      let sagres: string;
      try {
        sagres = `${await gerarSagresDiario(prisma, dia)} registro(s)`;
      } catch (e) {
        sagres = `RECUSADO — ${registrarRecusa(join("sagres", "diario", dia), dia, e).slice(0, 140)}`;
      }
      const cap = await gerarCaptura(prisma, dia);
      resumoDias.push(`  · ${dia} — SAGRES diário: ${sagres} | Captura: ${cap.elementos} elemento(s), ${cap.violacoes} violação(ões), estado ${cap.estado}`);
    }

    // ── SAGRES mensal, mês a mês ──
    const resumoMeses: string[] = [];
    for (const mes of meses) {
      try {
        resumoMeses.push(`  · ${mes} — SAGRES mensal: ${await gerarSagresMensal(prisma, mes)} registro(s)`);
      } catch (e) {
        resumoMeses.push(`  · ${mes} — SAGRES mensal: RECUSADO — ${registrarRecusa(join("sagres", "mensal", mes), mes, e).slice(0, 140)}`);
      }
    }

    // ── PDFs e CSVs, por exercício ──
    const resumoDocs: string[] = [];
    for (const ex of exercicios.length > 0 ? exercicios : [Number(dias[0]!.slice(0, 4))]) {
      const pdfs = await gerarPdfs(prisma, ex);
      const csvs = await gerarCsvs(prisma, ex);
      resumoDocs.push(`  · ${ex} — PDFs: ${pdfs.join(", ") || "nenhum"} | CSVs: ${csvs.join(", ")}`);
    }

    // ── O MANIFESTO DE TUDO ──
    const manifesto = {
      natureza: "FORMATO_OFICIAL_GERADO_E_VALIDADO_LOCALMENTE",
      aviso:
        "Pacote de contingência da POC SIAFIC. Todos os artefatos foram gerados e validados LOCALMENTE a " +
        "partir do banco de demonstração. NENHUM foi transmitido ao TCE-PB: não há protocolo, recibo nem " +
        "aceite em nenhum arquivo desta pasta. A massa é sintética (UG fictícia 999001).",
      layoutSagres: "2026 v1.1 (12/12/2025)",
      unidadeGestora: POC_SAGRES.codUnidadeGestora,
      periodos: { dias, meses, exercicios },
      recusas,
      totalArtefatos: artefatos.length,
      artefatos: [...artefatos].sort((a, b) => a.caminho.localeCompare(b.caminho)),
    };
    const manifestoJson = JSON.stringify(manifesto, null, 2);
    mkdirSync(RAIZ, { recursive: true });
    writeFileSync(join(RAIZ, "MANIFEST-CONTINGENCIA.json"), manifestoJson, "utf8");

    console.log("\n── DIAS COM MOVIMENTO ──");
    resumoDias.forEach((l) => console.log(l));
    console.log("\n── MESES COM MOVIMENTO ──");
    resumoMeses.forEach((l) => console.log(l));
    console.log("\n── DOCUMENTOS ──");
    resumoDocs.forEach((l) => console.log(l));
    if (recusas.length > 0) console.log(`\n⚠ ${recusas.length} período(s) recusado(s) pelo leiaute, cada um com RECUSA.txt: ${recusas.map((r) => r.periodo).join(", ")}`);
    console.log(`\n✓ ${artefatos.length} artefato(s) em ${RAIZ}/, cada um com SHA-256 em MANIFEST-CONTINGENCIA.json`);
    console.log(`✓ manifesto: ${sha256De(Buffer.from(manifestoJson, "utf8")).slice(0, 16)}…`);
  } finally {
    await fecharBrowser();
    await prisma.$disconnect();
  }
}

await main();
