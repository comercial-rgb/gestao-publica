import "dotenv/config";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import { CONTA_FORNECEDORES_A_PAGAR, roteiroEmpenho, roteiroLiquidacao } from "../../modules/m01-core-contabil/roteiros.js";
import { empenhar } from "../../modules/m05-despesa/servico.js";
import { liquidar } from "../../modules/m05-despesa/servico-bloco2.js";
import { criarM05DepsComAlmoxarifado } from "../../modules/m10-patrimonial/adapter-m05-almox.js";
import { declararContasDoControleDosRestos, PAPEIS_DO_CONTROLE, PAPEL_NO_MANUAL, type PapelDoControle } from "../../modules/m08-restos-a-pagar/controle-dos-restos.js";
import type { AcaoDoSistema } from "../../modules/m16-travamento/acoes.js";
import { naturezaDaBase } from "../../modules/m16-travamento/natureza-da-base.js";
import { concederPerfil, criarUsuario } from "../../modules/m16-travamento/servico-usuarios.js";
import { calcularDvDoCnpj } from "../../packages/documento/index.js";
import { meioDiaCivil } from "../../packages/datas/index.js";
import { papelDoAmbiente, urlDoRuntime } from "../../prisma/papel-runtime.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";

/**
 * V39-R3 (R3-024) — O EXERCÍCIO ISOLADO PARA O ENCERRAMENTO: os fatos e os parâmetros que o percurso do encerramento
 * precisa, gravados SÓ na cópia `gestao_publica_esperanca_r3_encerramento` (feita da base R3 por CREATE DATABASE ...
 * TEMPLATE, depois da massa). Encerrar 2026 na base R3 travaria os percursos das outras unidades; por isso a cópia.
 *
 * O QUE GRAVA, pelos serviços e pelo papel de runtime:
 *   · quem encerra (encerra, apura, classifica e vira os controles, abre 2027) e quem anula empenho; nenhum dos dois é
 *     administrador;
 *   · a declaração das contas do controle dos restos (5.3/6.3) — PARÂMETRO DE ENSAIO: os 18 papéis que o manual nomeia
 *     com a conta que ele sugere (`PAPEL_NO_MANUAL`), e os dois "cancelados", que o manual deixa ao ente, em
 *     6.3.1.9.9.00.00 e 6.3.2.9.9.00.00 OUTROS CANCELAMENTOS DE RP. O contador do ente decide os definitivos
 *     (pendência CONTROLE-DOS-RESTOS-DE-ENSAIO no MODULO do M08);
 *   · dois empenhos na ficha 10861 (Administração, serviços de terceiros, fonte 500): R3-ENC-001/2026 de 1.000,00 com
 *     400,00 liquidados e R3-ENC-002/2026 de 500,00 sem liquidação.
 * O QUE NÃO GRAVA: a anulação parcial, o encerramento, a apuração, a virada e a abertura — é isso que o percurso opera.
 *
 * Uso: DATABASE_URL=<.../gestao_publica_esperanca_r3_encerramento, como dono> npx tsx scripts/demonstracao/preparar-encerramento-r3.mts
 */
const BANCO = "gestao_publica_esperanca_r3_encerramento";
const ADMIN = process.env["FICTICIO_ADMIN"] ?? "admin@cg.pb.gov.br";
const SENHA = process.env["FICTICIO_SENHA"] ?? "Ficticio#2026";
const ENSAIO = "(ensaio)";
const D = (dia: string): Date => meioDiaCivil(dia);
const FICHA_SERVICOS = 10861;
const CREDOR = `558812340001${calcularDvDoCnpj("558812340001")}`;
const CANCELADOS_DE_ENSAIO: Partial<Record<PapelDoControle, string>> = { RPNP_CANCELADOS: "6.3.1.9.9.00.00", RPP_CANCELADOS: "6.3.2.9.9.00.00" };

const PAPEIS: readonly { readonly email: string; readonly nome: string; readonly perfil: string; readonly acoes: readonly AcaoDoSistema[] }[] = [
  {
    email: "encerramento@ficticio.local", nome: "Contadora do encerramento (fictícia)", perfil: "ENCERRAMENTO DO EXERCÍCIO — ENSAIO",
    acoes: ["ENCERRAR_EXERCICIO", "APURAR_RESULTADO", "PARAMETRIZAR_VIRADA_DOS_CONTROLES", "ENCERRAR_CONTROLES_ORCAMENTARIOS", "ABRIR_EXERCICIO", "CONSULTAR_DESPESA", "CONSULTAR_CONTABILIDADE", "CONSULTAR_PLANEJAMENTO"],
  },
  {
    email: "anulacao.despesa@ficticio.local", nome: "Anulação de empenho (fictícia)", perfil: "ANULAÇÃO DE EMPENHO — ENSAIO",
    acoes: ["ANULAR_EMPENHO_PARCIAL", "CONSULTAR_DESPESA"],
  },
];

let criados = 0;
let existentes = 0;
async function passo<T>(rotulo: string, f: () => Promise<{ readonly estado: "criado" | "existente"; readonly valor: T }>): Promise<T> {
  try {
    const r = await f();
    if (r.estado === "criado") criados += 1;
    else existentes += 1;
    console.log(`${r.estado === "criado" ? "+" : "="} ${rotulo}`);
    return r.valor;
  } catch (e) {
    console.error(`! ${rotulo}: RECUSADO — ${e instanceof Error ? e.message : String(e)}`);
    throw new Error(`parou em "${rotulo}"`);
  }
}

async function preparar(prisma: PrismaClient): Promise<void> {
  for (const p of PAPEIS) {
    await passo(`Usuário ${p.email} (${p.perfil})`, async () => {
      if ((await prisma.usuario.findUnique({ where: { identificador: p.email }, select: { id: true } })) !== null) return { estado: "existente", valor: null };
      const perfil = await prisma.$transaction(async (tx) => {
        const criado = await tx.perfil.create({ data: { nome: p.perfil, descricao: `Papel da base de ensaio: ${p.acoes.join(", ")}.`, criadoPor: ADMIN }, select: { id: true } });
        await tx.permissaoDePerfil.createMany({ data: p.acoes.map((acao) => ({ perfilId: criado.id, acao, unidadeOrcId: null, criadoPor: ADMIN })) });
        return criado;
      });
      const { usuarioId } = await criarUsuario(prisma, { nome: p.nome, email: p.email, senhaInicial: SENHA, criadoPor: ADMIN });
      await concederPerfil(prisma, { usuarioId, perfilId: perfil.id, criadoPor: ADMIN });
      return { estado: "criado", valor: null };
    });
  }
  await passo("Contas do controle dos restos (5.3/6.3): as sugeridas pelo manual e os cancelados em OUTROS CANCELAMENTOS DE RP", async () => {
    if ((await prisma.declaracaoDoControleDosRestos.count()) > 0) return { estado: "existente", valor: null };
    const contas: Record<string, string> = {};
    for (const papel of PAPEIS_DO_CONTROLE) {
      const conta = CANCELADOS_DE_ENSAIO[papel] ?? PAPEL_NO_MANUAL[papel].sugestao;
      if (conta === null || conta === undefined) throw new Error(`O papel ${papel} não tem conta sugerida nem de ensaio. Nada foi gravado.`);
      contas[papel] = conta;
    }
    await declararContasDoControleDosRestos(prisma, { contas, fundamento: `MCASP, Parte I, 4.7.4 a 4.7.6, com as contas que o manual nomeia; os cancelados em "outros" ${ENSAIO}.`, criadoPor: ADMIN });
    return { estado: "criado", valor: null };
  });
  const ficha = await prisma.fichaOrcamentaria.findUnique({ where: { exercicio_numero: { exercicio: 2026, numero: FICHA_SERVICOS } }, select: { id: true, naturezaDespesa: { select: { codigoCompleto: true } } } });
  if (ficha === null || ficha.naturezaDespesa.codigoCompleto !== "339039") throw new Error(`A ficha ${String(FICHA_SERVICOS)} de serviços de terceiros não está nesta base. Nada foi gravado.`);
  const m05 = criarM05DepsComAlmoxarifado(prisma);
  for (const e of [{ numero: "R3-ENC-001/2026", valor: "1000.00", liquidar: "400.00", o_que: "Manutenção dos aparelhos de ar-condicionado" }, { numero: "R3-ENC-002/2026", valor: "500.00", liquidar: null, o_que: "Recarga de extintores" }]) {
    const empenhoId = await passo(`Empenho ${e.numero} (${e.o_que}), R$ ${e.valor}`, async () => {
      const ja = await prisma.empenho.findFirst({ where: { numero: e.numero, fichaId: ficha.id }, select: { id: true } });
      if (ja !== null) return { estado: "existente", valor: ja.id };
      return { estado: "criado", valor: (await empenhar({ fichaId: ficha.id, numero: e.numero, tipo: "ORDINARIO", valor: e.valor, data: D("2026-10-05"), credorCpfCnpj: CREDOR, historico: `${e.o_que} ${ENSAIO}`, categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: ADMIN }, roteiroEmpenho(), m05)).empenhoId };
    });
    if (e.liquidar === null) continue;
    const valor = e.liquidar;
    await passo(`Liquidação de ${valor} de ${e.numero}`, async () => {
      if ((await prisma.liquidacao.count({ where: { empenhoId } })) > 0) return { estado: "existente", valor: null };
      await liquidar(
        { empenhoId, numero: "R3-ENC-L1", valor, data: D("2026-10-06"), responsavelAtesto: "Chefe da manutenção (fictício)", notaFiscalNum: "66001", notaFiscalSerie: "1", notaFiscalData: D("2026-10-06"), notaFiscalValor: valor, historico: `Primeira etapa da manutenção ${ENSAIO}`, criadoPor: ADMIN },
        roteiroLiquidacao({ codElemento: "39", obrigacaoAPagar: CONTA_FORNECEDORES_A_PAGAR }),
        m05
      );
      return { estado: "criado", valor: null };
    });
  }
}

function exigirBanco(): string {
  const url = process.env["DATABASE_URL"] ?? "";
  let nome = "";
  try {
    nome = new URL(url).pathname.replace(/^\//, "");
  } catch {
    throw new Error("DATABASE_URL ausente ou ilegível. Nada foi gravado.");
  }
  if (nome !== BANCO) throw new Error(`Recusado: esta preparação só se grava na cópia isolada "${BANCO}", e o DATABASE_URL aponta para "${nome}". Nada foi gravado.`);
  return urlDoRuntime(url, papelDoAmbiente());
}

const prisma = criarPrismaClient(exigirBanco());
try {
  const { natureza } = await naturezaDaBase(prisma);
  if (natureza !== "ENSAIO") throw new Error(`Recusado: a cópia está declarada ${natureza}, não ENSAIO. Nada foi gravado.`);
  await preparar(prisma);
  console.log(`\nPronto: ${String(criados)} criado(s), ${String(existentes)} já existente(s).`);
} finally {
  await prisma.$disconnect();
}
