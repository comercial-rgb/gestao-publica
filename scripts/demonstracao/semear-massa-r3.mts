import "dotenv/config";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import { exigirContaDaLiquidacao } from "../../modules/m01-core-contabil/conta-da-liquidacao.js";
import { CONTA_FORNECEDORES_A_PAGAR, roteiroEmpenho, roteiroLiquidacao } from "../../modules/m01-core-contabil/roteiros.js";
import { declararDadosDaUnidade, type NaturezaJuridicaDaUnidade } from "../../modules/m02-planejamento/declaracao-da-unidade.js";
import { declararDadosDaAcao, declararDadosDoPrograma } from "../../modules/m02-planejamento/declaracao-do-programa.js";
import { elaborarPropostaOrcamentaria } from "../../modules/m02-planejamento/proposta-orcamentaria.js";
import { empenhar } from "../../modules/m05-despesa/servico.js";
import { liquidar } from "../../modules/m05-despesa/servico-bloco2.js";
import { criarM05DepsComAlmoxarifado } from "../../modules/m10-patrimonial/adapter-m05-almox.js";
import { cadastrarClasseDeMaterial } from "../../modules/m10-patrimonial/almoxarifado.js";
import { cadastrarDeposito, cadastrarGrupoDeMaterial, cadastrarMaterial, cadastrarUnidadeDeMedida } from "../../modules/m10-patrimonial/estoque-fisico.js";
import { parametrizarRoteiroAlmoxarifado } from "../../modules/m10-patrimonial/roteiros.js";
import type { AcaoDoSistema } from "../../modules/m16-travamento/acoes.js";
import { declararNaturezaDaBase, naturezaDaBase } from "../../modules/m16-travamento/natureza-da-base.js";
import { concederPerfil, criarUsuario } from "../../modules/m16-travamento/servico-usuarios.js";
import { criarM19Deps } from "../../modules/m19-pessoas/adapter-prisma.js";
import { cadastrarPessoa } from "../../modules/m19-pessoas/servico.js";
import { vincularDepositoAFarmacia } from "../../modules/m37-farmacia/operacao.js";
import { cadastrarVeiculo } from "../../modules/m36-frota/servico.js";
import { cadastrarCondutor } from "../../modules/m36-frota/operacao.js";
import { cadastrarTanqueDeCombustivel } from "../../modules/m36-frota/tanque.js";
import { cadastrarFarmacia } from "../../modules/m37-farmacia/servico.js";
import { registrarPerfilFiscal } from "../../modules/m07-extraorcamentario/retencao-calculada.js";
import { criarSetor } from "../../modules/m21-protocolo/cadastros.js";
import { calcularDvDoCnpj, documentoTemDigitoValido } from "../../packages/documento/index.js";
import { meioDiaCivil } from "../../packages/datas/index.js";
import { toMoney } from "../../packages/contracts/index.js";
import { papelDoAmbiente, urlDoRuntime } from "../../prisma/papel-runtime.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";

/**
 * V39-R3 (R3-001) — A MASSA DE ENSAIO DAS JORNADAS DA R3, por cima da semente fictícia de Esperança.
 *
 * O QUE ESTA MASSA PREPARA (e o que ela NÃO faz). Ela grava os PRÉ-REQUISITOS das jornadas que os percursos da R3
 * operam pela tela: declarações do projeto da LOA, a proposta de 2027 com valores, a farmácia com estoque recebido por
 * liquidação, os usuários por papel. A operação que cada percurso prova (capturar a versão do projeto, dispensar,
 * registrar perda e sobra...) NÃO é feita aqui: fazer aqui seria pular a operação que o percurso testa.
 *
 * Tudo passa pelos serviços que as telas chamam (autorização, Zod, guardas, razão), CONECTADO PELO PAPEL DE RUNTIME
 * (`gestao_app`), não pelo dono do banco. Idempotente: cada item é procurado pela chave natural antes de ser criado;
 * rodar de novo não duplica fato nenhum.
 *
 * PARÂMETROS DE ENSAIO (decisão municipal que não existe; marcada no próprio registro como "(ensaio)"): as contas do
 * roteiro do almoxarifado (consumo, perda, sobra) escolhidas no plano do TCE-PB carregado, as declarações do projeto
 * (secretário, objetivo do programa, meta da ação), a farmácia e o estoque. Nenhuma conta é criada.
 *
 * Roda SÓ na base isolada de ensaio `gestao_publica_esperanca_r3`, declarada ENSAIO. A carga em ambiente de
 * apresentação é outra decisão (R3-002), com destino e autorização confirmados antes.
 *
 * Uso: DATABASE_URL=<…/gestao_publica_esperanca_r3, como dono> APP_DB_USUARIO=… APP_DB_SENHA=… npx tsx scripts/demonstracao/semear-massa-r3.mts
 * (a URL do dono só serve para montar a do runtime; nada é gravado como dono). Não imprime URL nem senha.
 */

const BANCO = "gestao_publica_esperanca_r3";
const ADMIN = process.env["FICTICIO_ADMIN"] ?? "admin@cg.pb.gov.br";
const SENHA = process.env["FICTICIO_SENHA"] ?? "Ficticio#2026";
const ENSAIO = "(ensaio)";
const D = (dia: string): Date => meioDiaCivil(dia);
const ORIGEM = "semear-massa-r3 (V39-R3, R3-001)";

/** Fundo Municipal de Saúde (02016): ficha 11311 da Lei 613/2025, elemento 30, fonte 500. */
const UO_SAUDE = "02016";
const FICHA_MEDICAMENTOS = 11311;
/** Secretaria de Administração (02004): o almoxarifado geral, ficha 10857 da Lei 613/2025 (elemento 30, fonte 500). */
const UO_ADMINISTRACAO = "02004";
/** Obras, Urbanismo e Transporte (02011): a garagem e o tanque, ficha 11034 da Lei 613/2025 (elemento 30, fonte 500). */
const UO_OBRAS = "02011";
const FICHA_COMBUSTIVEL = 11034;
const FICHA_EXPEDIENTE = 10857;
/** A outra unidade, para a recusa por escopo (o farmacêutico de lá não dispensa aqui). */
const UO_OUTRA = "02009";

function cpfComDv(raiz9: string): string {
  const d = raiz9.split("").map(Number);
  for (const tamanho of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += (d[i] as number) * (tamanho + 1 - i);
    const resto = soma % 11;
    d.push(resto < 2 ? 0 : 11 - resto);
  }
  const doc = d.join("");
  if (!documentoTemDigitoValido(doc)) throw new Error(`CPF gerado sem DV válido: ${doc}`);
  return doc;
}
const cnpjComDv = (raiz12: string): string => `${raiz12}${calcularDvDoCnpj(raiz12)}`;

type Resultado<T> = { readonly estado: "criado" | "existente"; readonly valor: T; readonly detalhe?: string };
let criados = 0;
let existentes = 0;
async function passo<T>(rotulo: string, f: () => Promise<Resultado<T>>): Promise<T> {
  try {
    const r = await f();
    if (r.estado === "criado") criados += 1;
    else existentes += 1;
    console.log(`${r.estado === "criado" ? "+" : "="} ${rotulo}${r.detalhe === undefined ? "" : ` — ${r.detalhe}`}`);
    return r.valor;
  } catch (e) {
    console.error(`! ${rotulo}: RECUSADO — ${e instanceof Error ? e.message : String(e)}`);
    throw new Error(`parou em "${rotulo}"`);
  }
}

async function uoId(prisma: PrismaClient, codigo: string): Promise<string> {
  const u = await prisma.unidadeOrcamentaria.findFirst({ where: { codigo }, select: { id: true } });
  if (u === null) throw new Error(`A unidade orçamentária ${codigo} não está nesta base. Nada foi gravado.`);
  return u.id;
}

async function contaId(prisma: PrismaClient, codigo: string): Promise<string> {
  const c = await prisma.contaPcasp.findUnique({ where: { codigo }, select: { id: true, analitica: true } });
  if (c === null || !c.analitica) throw new Error(`A conta ${codigo} precisa existir e ser analítica no plano carregado. Nada foi gravado.`);
  return c.id;
}

// ═══ 1. USUÁRIOS POR PAPEL DA R3 (os percursos operam com eles, não com o administrador) ═══

interface PapelR3 {
  readonly email: string;
  readonly nome: string;
  readonly perfil: string;
  readonly acoes: readonly AcaoDoSistema[];
  /** Ações concedidas SÓ numa unidade orçamentária (código). */
  readonly naUnidade?: { readonly codigo: string; readonly acoes: readonly AcaoDoSistema[] };
}

export const PAPEIS_R3: readonly PapelR3[] = [
  {
    email: "planejador@ficticio.local", nome: "Planejadora (fictícia)", perfil: "PLANEJAMENTO — ENSAIO",
    acoes: ["CADASTRAR_LOA", "CADASTRAR_EMENDA_AO_ORCAMENTO", "SANCIONAR_EMENDA_AO_ORCAMENTO", "CONSULTAR_PLANEJAMENTO", "CONSULTAR_CADASTROS"],
  },
  {
    email: "farmaceutica@ficticio.local", nome: "Farmacêutica do Fundo de Saúde (fictícia)", perfil: "FARMÁCIA DA SAÚDE — ENSAIO",
    acoes: ["CONSULTAR_PATRIMONIO", "CONSULTAR_CADASTROS"],
    naUnidade: { codigo: UO_SAUDE, acoes: ["DISPENSAR_MEDICAMENTO", "REGISTRAR_AJUSTE_DA_FARMACIA"] },
  },
  {
    email: "supervisora.farmacia@ficticio.local", nome: "Supervisora da Farmácia Básica (fictícia)", perfil: "SUPERVISÃO DA FARMÁCIA — ENSAIO",
    acoes: ["CONSULTAR_PATRIMONIO", "CONSULTAR_CADASTROS"],
    naUnidade: { codigo: UO_SAUDE, acoes: ["CORRIGIR_DISPENSACAO_DE_MEDICAMENTO"] },
  },
  {
    email: "coordenador.farmacia@ficticio.local", nome: "Coordenador da Assistência Farmacêutica (fictício)", perfil: "COORDENAÇÃO DA FARMÁCIA — ENSAIO",
    acoes: ["CADASTRAR_FARMACIA", "CONSULTAR_PATRIMONIO", "CONSULTAR_CADASTROS"],
  },
  {
    email: "almoxarife@ficticio.local", nome: "Almoxarife da Administração (fictício)", perfil: "ALMOXARIFADO GERAL — ENSAIO",
    acoes: ["CONSULTAR_PATRIMONIO", "CONSULTAR_CADASTROS"],
    naUnidade: { codigo: UO_ADMINISTRACAO, acoes: ["ABRIR_INVENTARIO_DE_ESTOQUE", "REGISTRAR_CONTAGEM_DE_INVENTARIO", "FECHAR_INVENTARIO_DE_ESTOQUE", "REGISTRAR_SAIDA_FISICA"] },
  },
  {
    email: "chefe.almoxarifado@ficticio.local", nome: "Chefe do Almoxarifado (fictícia)", perfil: "CHEFIA DO ALMOXARIFADO — ENSAIO",
    acoes: ["CONSULTAR_PATRIMONIO", "CONSULTAR_CADASTROS"],
    naUnidade: { codigo: UO_ADMINISTRACAO, acoes: ["REGISTRAR_AJUSTE_ALMOXARIFADO"] },
  },
  {
    email: "gestor.frota@ficticio.local", nome: "Gestor da Frota (fictício)", perfil: "GESTÃO DA FROTA — ENSAIO",
    acoes: ["CADASTRAR_FROTA", "REGISTRAR_ABASTECIMENTO", "EMITIR_ORDEM_DE_ABASTECIMENTO", "CONSULTAR_PATRIMONIO", "CONSULTAR_CADASTROS"],
  },
  {
    email: "conferente.despesa@ficticio.local", nome: "Conferente da despesa (fictícia)", perfil: "CONFERÊNCIA DA DESPESA — ENSAIO",
    acoes: ["REGISTRAR_REFERENCIA_EXTERNA_DO_EMPENHO", "CONSULTAR_DESPESA", "CONSULTAR_CADASTROS"],
  },
  // V39-R3 (R3-015) — quem transcreve o extrato e quem confere a transcrição: duas pessoas, a mesma ação.
  {
    email: "auxiliar.tesouraria@ficticio.local", nome: "Auxiliar da tesouraria (fictício)", perfil: "TRANSCRIÇÃO DE EXTRATO — ENSAIO",
    acoes: ["TRANSCREVER_EXTRATO", "CONSULTAR_FINANCEIRO", "CONSULTAR_CADASTROS"],
  },
  {
    email: "conferente.tesouraria@ficticio.local", nome: "Conferente da tesouraria (fictícia)", perfil: "CONFERÊNCIA DO EXTRATO — ENSAIO",
    acoes: ["TRANSCREVER_EXTRATO", "CONSULTAR_FINANCEIRO", "CONSULTAR_CADASTROS"],
  },
  // V39-R3 (R3-019) — quem registra e autoriza as solicitações de compra dos setores (a consolidação é do agente de contratação).
  {
    email: "solicitante.compras@ficticio.local", nome: "Solicitante de compras (fictícia)", perfil: "SOLICITAÇÕES DE COMPRA — ENSAIO",
    acoes: ["REGISTRAR_SOLICITACAO_DE_COMPRA", "MOVIMENTAR_SOLICITACAO_DE_COMPRA", "CONSULTAR_LICITACOES", "CONSULTAR_CADASTROS"],
  },
  // V39-R3 (R3-016) — quem parametriza os valores a receber de volta (categoria e conta) e quem os movimenta.
  {
    email: "contabilidade.parametros@ficticio.local", nome: "Contadora de parâmetros (fictícia)", perfil: "PARÂMETROS DO REALIZÁVEL — ENSAIO",
    acoes: ["PARAMETRIZAR_REALIZAVEL", "CONSULTAR_FINANCEIRO", "CONSULTAR_CADASTROS"],
  },
  {
    email: "tesouraria.realizavel@ficticio.local", nome: "Tesoureiro dos valores a receber (fictício)", perfil: "MOVIMENTO DO REALIZÁVEL — ENSAIO",
    acoes: ["MOVIMENTAR_REALIZAVEL", "CONSULTAR_FINANCEIRO", "CONSULTAR_CADASTROS"],
  },
  {
    email: "farmaceutico.assistencia@ficticio.local", nome: "Farmacêutico da Assistência Social (fictício)", perfil: "FARMÁCIA DA ASSISTÊNCIA — ENSAIO",
    acoes: ["CONSULTAR_PATRIMONIO", "CONSULTAR_CADASTROS"],
    naUnidade: { codigo: UO_OUTRA, acoes: ["DISPENSAR_MEDICAMENTO", "REGISTRAR_AJUSTE_DA_FARMACIA"] },
  },
];

async function semearUsuarios(prisma: PrismaClient): Promise<void> {
  for (const p of PAPEIS_R3) {
    await passo(`Usuário ${p.email} (${p.perfil})`, async () => {
      if ((await prisma.usuario.findUnique({ where: { identificador: p.email }, select: { id: true } })) !== null) return { estado: "existente", valor: null };
      const unidade = p.naUnidade === undefined ? null : await uoId(prisma, p.naUnidade.codigo);
      const perfil = await prisma.$transaction(async (tx) => {
        const criado = await tx.perfil.create({ data: { nome: p.perfil, descricao: `Papel da base de ensaio: ${[...p.acoes, ...(p.naUnidade?.acoes ?? [])].join(", ")}.`, criadoPor: ADMIN }, select: { id: true } });
        await tx.permissaoDePerfil.createMany({ data: p.acoes.map((acao) => ({ perfilId: criado.id, acao, unidadeOrcId: null, criadoPor: ADMIN })) });
        if (p.naUnidade !== undefined) await tx.permissaoDePerfil.createMany({ data: p.naUnidade.acoes.map((acao) => ({ perfilId: criado.id, acao, unidadeOrcId: unidade, criadoPor: ADMIN })) });
        return criado;
      });
      const { usuarioId } = await criarUsuario(prisma, { nome: p.nome, email: p.email, senhaInicial: SENHA, criadoPor: ADMIN });
      await concederPerfil(prisma, { usuarioId, perfilId: perfil.id, criadoPor: ADMIN });
      return { estado: "criado", valor: null };
    });
  }
}

// ═══ 2. PLANEJAMENTO DE 2027: as declarações que o arquivo do projeto exige, e a proposta com valores ═══

const NATUREZA_DA_UO: Readonly<Record<string, NaturezaJuridicaDaUnidade>> = {
  "01001": "CAMARA_MUNICIPAL",
  "02016": "FUNDO",
  "02017": "FUNDO",
  "02018": "FUNDO_PREVIDENCIARIO",
};
const semAspas = (s: string): string => s.replace(/["'\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();

async function semearPlanejamento(prisma: PrismaClient): Promise<void> {
  const fichas = await prisma.fichaOrcamentaria.findMany({
    where: { exercicio: 2026 },
    select: {
      programa: { select: { id: true, codigo: true, descricao: true, declaracoes: { select: { id: true } } } },
      acao: { select: { id: true, codigo: true, descricao: true, declaracoes: { select: { descMeta: true } } } },
      unidadeOrc: { select: { id: true, codigo: true, declaracoes: { select: { id: true } } } },
    },
  });
  const programas = new Map(fichas.map((f) => [f.programa.id, f.programa]));
  const acoes = new Map(fichas.map((f) => [f.acao.id, f.acao]));
  const unidades = new Map(fichas.map((f) => [f.unidadeOrc.id, f.unidadeOrc]));
  const vigenteDesde = D("2026-01-02");
  const fundamento = `PPA 2026-2029 e LOA 2026 de Esperança, dados declarados para o ensaio ${ENSAIO}`;

  let novos = 0;
  for (const p of programas.values()) {
    if (p.declaracoes.length > 0) continue;
    await declararDadosDoPrograma(prisma, { programaId: p.id, descricao: semAspas(p.descricao).slice(0, 70), objetivo: semAspas(`Objetivo do programa ${p.codigo} ${ENSAIO}`), tipoObjetivoMilenio: "16", fundamento, vigenteDesde, criadoPor: ADMIN });
    novos += 1;
  }
  await passo(`Programas de 2026 com objetivo declarado (${String(programas.size)})`, async () => ({ estado: novos > 0 ? "criado" : "existente", valor: null, detalhe: `${String(novos)} declarados agora` }));

  novos = 0;
  for (const a of acoes.values()) {
    if (a.declaracoes.some((x) => x.descMeta !== null)) continue;
    await declararDadosDaAcao(prisma, { acaoId: a.id, descricao: semAspas(a.descricao).slice(0, 70), descMeta: `Meta física da ação ${a.codigo} ${ENSAIO}`, unidadeMedida: "unidade", fundamento, vigenteDesde, criadoPor: ADMIN });
    novos += 1;
  }
  await passo(`Ações de 2026 com meta e unidade de medida (${String(acoes.size)})`, async () => ({ estado: novos > 0 ? "criado" : "existente", valor: null, detalhe: `${String(novos)} declaradas agora` }));

  novos = 0;
  let i = 0;
  for (const u of [...unidades.values()].sort((x, y) => x.codigo.localeCompare(y.codigo))) {
    i += 1;
    if (u.declaracoes.length > 0) continue;
    await declararDadosDaUnidade(prisma, {
      unidadeOrcId: u.id, naturezaJuridica: NATUREZA_DA_UO[u.codigo] ?? "PREFEITURA_OU_SECRETARIA",
      nomeSecretario: `Responsavel da unidade ${u.codigo} ficticio`, cpfSecretario: cpfComDv(`7${String(i).padStart(2, "0")}${u.codigo.slice(-5)}1`.slice(0, 9)),
      atoDeNomeacao: "PORTARIA", vigenteDesde, criadoPor: ADMIN,
    });
    novos += 1;
  }
  await passo(`Unidades de 2026 com responsável declarado (${String(unidades.size)})`, async () => ({ estado: novos > 0 ? "criado" : "existente", valor: null, detalhe: `${String(novos)} declaradas agora` }));

  await passo("Proposta orçamentária de 2027 a partir da LOA de 2026 (+5%)", async () => {
    const ja = await prisma.propostaOrcamentaria.findFirst({ where: { exercicio: 2027, descricao: { contains: ENSAIO } }, select: { id: true } });
    if (ja !== null) return { estado: "existente", valor: null };
    const r = await elaborarPropostaOrcamentaria(prisma, {
      exercicio: 2027, exercicioDeOrigem: 2026, aproveitaReceitas: true, aproveitaFichas: true,
      baseDaReceita: "PREVISAO_INICIAL", percentualDaReceita: "5", baseDaDespesa: "DOTACAO_INICIAL", percentualDaDespesa: "5",
      reajustaProjetos: true, incluiFichasAbertasPorCredito: false, descricao: `Proposta inicial 2027 ${ENSAIO}`, criadoPor: ADMIN,
    });
    return { estado: "criado", valor: null, detalhe: `${String(r.linhasDeDespesa)} linhas de despesa, ${String(r.linhasDeReceita)} de receita` };
  });
}

// ═══ 3. FARMÁCIA: parâmetros do almoxarifado, depósito, medicamentos, a farmácia e o estoque RECEBIDO por liquidação ═══

/** As contas do roteiro do almoxarifado — escolhidas no plano do TCE-PB carregado, como parâmetro de ensaio. */
const ROTEIROS_DO_ALMOXARIFADO = [
  { tipo: "SAIDA_CONSUMO", debito: "3.3.1.1.1.99.00", credito: "1.1.5.6.1.01.00", rotulo: "consumo: D outros materiais de consumo / C estoque" },
  { tipo: "AJUSTE_SAIDA", debito: "3.6.3.3.1.99.00", credito: "1.1.5.6.1.01.00", rotulo: "perda: D perdas involuntárias com outros estoques / C estoque" },
  { tipo: "AJUSTE_ENTRADA", debito: "1.1.5.6.1.01.00", credito: "4.6.3.9.1.00.00", rotulo: "sobra: D estoque / C outros ganhos com incorporação de ativos" },
] as const;

/** Os lotes recebidos: um medicamento com DOIS lotes (um vence antes do dia da dispensação) e outro com um. */
const LOTES = [
  { material: "R3MED001", lote: "DIP-2601", quantidade: "1000", unitario: "0.12", validade: "2027-06-30" },
  { material: "R3MED001", lote: "DIP-2509", quantidade: "200", unitario: "0.10", validade: "2026-10-05" },
  { material: "R3MED002", lote: "AMX-2603", quantidade: "300", unitario: "0.45", validade: "2027-03-31" },
] as const;
const DIA_DO_RECEBIMENTO = "2026-10-01";

async function semearFarmacia(prisma: PrismaClient): Promise<void> {
  for (const r of ROTEIROS_DO_ALMOXARIFADO) {
    await passo(`Roteiro do almoxarifado — ${r.rotulo} ${ENSAIO}`, async () => {
      const ja = await prisma.versaoDeRoteiro.findFirst({ where: { familia: "ALMOXARIFADO", chave: r.tipo, situacao: "PUBLICADA" }, select: { id: true } });
      if (ja !== null || (await prisma.roteiroAlmoxarifado.findUnique({ where: { tipo: r.tipo }, select: { id: true } })) !== null) return { estado: "existente", valor: null };
      await parametrizarRoteiroAlmoxarifado(prisma, { tipo: r.tipo, contaDebitoId: await contaId(prisma, r.debito), contaCreditoId: await contaId(prisma, r.credito), criadoPor: ADMIN });
      return { estado: "criado", valor: null };
    });
  }
  // A liquidação de material (elemento 30) debita a conta fixa do sistema; a classe tem de apontar a mesma.
  const contaDoEstoque = (await exigirContaDaLiquidacao(prisma, "30")).contaCodigo;
  const classeId = await passo(`Classe de material R3-30.09 Medicamentos (conta ${contaDoEstoque})`, async () => {
    const ja = await prisma.classeDeMaterial.findFirst({ where: { codigo: "R3-30.09" }, select: { id: true } });
    if (ja !== null) return { estado: "existente", valor: ja.id };
    return { estado: "criado", valor: (await cadastrarClasseDeMaterial(prisma, { codigo: "R3-30.09", descricao: `Medicamentos ${ENSAIO}`, contaContabilId: await contaId(prisma, contaDoEstoque), criadoPor: ADMIN })).classeDeMaterialId };
  });
  const saude = await uoId(prisma, UO_SAUDE);
  const depositoId = await passo("Depósito FARM-R3 da Farmácia Básica (Fundo de Saúde)", async () => {
    const ja = await prisma.deposito.findFirst({ where: { codigo: "FARM-R3" }, select: { id: true } });
    if (ja !== null) return { estado: "existente", valor: ja.id };
    return { estado: "criado", valor: (await cadastrarDeposito(prisma, { codigo: "FARM-R3", nome: `Farmácia Básica Central ${ENSAIO}`, unidadeOrcId: saude, criadoPor: ADMIN })).depositoId };
  });
  const unidadeDeMedidaId = await passo("Unidade de medida CP (comprimido)", async () => {
    const ja = await prisma.unidadeDeMedida.findFirst({ where: { sigla: "CP" }, select: { id: true } });
    if (ja !== null) return { estado: "existente", valor: ja.id };
    return { estado: "criado", valor: (await cadastrarUnidadeDeMedida(prisma, { sigla: "CP", descricao: "Comprimido ou cápsula", criadoPor: ADMIN })).unidadeDeMedidaId };
  });
  const grupoId = await passo("Grupo de material R3-09 Medicamentos", async () => {
    const ja = await prisma.grupoDeMaterial.findFirst({ where: { codigo: "R3-09" }, select: { id: true } });
    if (ja !== null) return { estado: "existente", valor: ja.id };
    return { estado: "criado", valor: (await cadastrarGrupoDeMaterial(prisma, { codigo: "R3-09", descricao: `Medicamentos ${ENSAIO}`, criadoPor: ADMIN })).grupoId };
  });
  const materiais: Record<string, string> = {};
  for (const [codigo, nome] of [["R3MED001", "Dipirona 500 mg comprimido"], ["R3MED002", "Amoxicilina 500 mg cápsula"]] as const) {
    materiais[codigo] = await passo(`Medicamento ${codigo} ${nome}`, async () => {
      const ja = await prisma.material.findFirst({ where: { codigo }, select: { id: true } });
      if (ja !== null) return { estado: "existente", valor: ja.id };
      const r = await cadastrarMaterial(prisma, {
        codigo, descricaoSucinta: nome, descricaoDetalhada: `${nome} ${ENSAIO}`, grupoId, classificacao: "CONSUMO", categoria: "PERECIVEL",
        classeDeMaterialId: classeId, controlaLote: true, unidades: [{ unidadeDeMedidaId, fatorParaEstoque: "1", ehDeEstoque: true }], criadoPor: ADMIN,
      });
      return { estado: "criado", valor: r.materialId };
    });
  }
  const ug = await prisma.unidadeGestora.findFirst({ where: { codigoTce: "201078" }, select: { id: true } });
  if (ug === null) throw new Error("A unidade gestora 201078 não está nesta base. Nada foi gravado.");
  const farmaciaId = await passo("Farmácia pública 9001 — Farmácia Básica Central", async () => {
    const ja = await prisma.farmaciaPublica.findFirst({ where: { codigo: "9001" }, select: { id: true } });
    if (ja !== null) return { estado: "existente", valor: ja.id };
    return {
      estado: "criado",
      valor: (await cadastrarFarmacia(prisma, {
        ugId: ug.id, codigo: "9001", descricao: `Farmácia Básica Central ${ENSAIO}`, endereco: "Rua da Saúde, 100, Centro (fictício)",
        nomeResponsavel: "Farmacêutica responsável (fictícia)", cpfResponsavel: cpfComDv("731845290"), crfResponsavel: "PB-99999",
        vigenteDesde: "2026-01-02", fundamento: `Designação da responsável técnica ${ENSAIO}`, criadoPor: ADMIN,
      })).id,
    };
  });
  await passo("Depósito FARM-R3 vinculado à farmácia 9001", async () => {
    if ((await prisma.depositoDaFarmacia.findUnique({ where: { farmaciaId }, select: { id: true } })) !== null) return { estado: "existente", valor: null };
    await vincularDepositoAFarmacia(prisma, { farmaciaId, depositoId, fundamento: `Organização da Farmácia Básica ${ENSAIO}`, criadoPor: ADMIN });
    return { estado: "criado", valor: null };
  });
  // V39-R3 (R3-010) — a segunda farmácia, só para a troca do depósito (a 9001 continua com o FARM-R3 e o estoque dela).
  const depositoDistrital = await passo("Depósito FARM-R3C da farmácia distrital", async () => {
    const ja = await prisma.deposito.findFirst({ where: { codigo: "FARM-R3C" }, select: { id: true } });
    if (ja !== null) return { estado: "existente", valor: ja.id };
    return { estado: "criado", valor: (await cadastrarDeposito(prisma, { codigo: "FARM-R3C", nome: `Farmácia do Posto Distrital ${ENSAIO}`, unidadeOrcId: saude, criadoPor: ADMIN })).depositoId };
  });
  await passo("Depósito FARM-R3D (livre, para receber a farmácia distrital)", async () => {
    const ja = await prisma.deposito.findFirst({ where: { codigo: "FARM-R3D" }, select: { id: true } });
    if (ja !== null) return { estado: "existente", valor: ja.id };
    return { estado: "criado", valor: (await cadastrarDeposito(prisma, { codigo: "FARM-R3D", nome: `Nova sala da farmácia distrital ${ENSAIO}`, unidadeOrcId: saude, criadoPor: ADMIN })).depositoId };
  });
  const distrital = await passo("Farmácia pública 9002 — Farmácia do Posto Distrital", async () => {
    const ja = await prisma.farmaciaPublica.findFirst({ where: { codigo: "9002" }, select: { id: true } });
    if (ja !== null) return { estado: "existente", valor: ja.id };
    return {
      estado: "criado",
      valor: (await cadastrarFarmacia(prisma, {
        ugId: ug.id, codigo: "9002", descricao: `Farmácia do Posto Distrital ${ENSAIO}`, endereco: "Sítio Lagoa de Pedra, s/n (fictício)",
        nomeResponsavel: "Farmacêutico distrital (fictício)", cpfResponsavel: cpfComDv("731845291"), crfResponsavel: "PB-99998",
        vigenteDesde: "2026-01-02", fundamento: `Designação do responsável técnico ${ENSAIO}`, criadoPor: ADMIN,
      })).id,
    };
  });
  await passo("Depósito FARM-R3C vinculado à farmácia 9002", async () => {
    if ((await prisma.depositoDaFarmacia.findUnique({ where: { farmaciaId: distrital }, select: { id: true } })) !== null) return { estado: "existente", valor: null };
    await vincularDepositoAFarmacia(prisma, { farmaciaId: distrital, depositoId: depositoDistrital, fundamento: `Organização da farmácia distrital ${ENSAIO}`, criadoPor: ADMIN });
    return { estado: "criado", valor: null };
  });

  // O estoque entra pela liquidação de material (empenho, liquidação com o recebimento físico por lote).
  const credor = cnpjComDv("612730480001");
  await passo(`Pessoa ${credor} Distribuidora de Medicamentos Borborema (fictícia)`, async () => {
    const m19 = criarM19Deps(prisma);
    if ((await m19.pessoas.buscarPorDocumento(credor)) !== null) return { estado: "existente", valor: null };
    await cadastrarPessoa({ documento: credor, nome: "Distribuidora de Medicamentos Borborema Ltda (fictícia)", municipio: "Campina Grande", uf: "PB", criadoPor: ADMIN }, m19);
    return { estado: "criado", valor: null };
  });
  const ficha = await prisma.fichaOrcamentaria.findUnique({ where: { exercicio_numero: { exercicio: 2026, numero: FICHA_MEDICAMENTOS } }, select: { id: true, naturezaDespesa: { select: { codigoCompleto: true } }, unidadeOrc: { select: { codigo: true } } } });
  if (ficha === null || !ficha.naturezaDespesa.codigoCompleto.startsWith("339030") || ficha.unidadeOrc.codigo !== UO_SAUDE) throw new Error(`A ficha ${String(FICHA_MEDICAMENTOS)} de material de consumo do Fundo de Saúde não está nesta base. Nada foi gravado.`);
  const total = LOTES.reduce((t, l) => t.plus(toMoney(l.quantidade).times(l.unitario)), toMoney(0)).toFixed(2);
  const m05 = criarM05DepsComAlmoxarifado(prisma);
  const empenhoId = await passo(`Empenho R3-MED-001/2026 de medicamentos R$ ${total}`, async () => {
    const ja = await prisma.empenho.findFirst({ where: { numero: "R3-MED-001/2026", fichaId: ficha.id }, select: { id: true } });
    if (ja !== null) return { estado: "existente", valor: ja.id };
    const r = await empenhar({ fichaId: ficha.id, numero: "R3-MED-001/2026", tipo: "ORDINARIO", valor: total, data: D("2026-09-20"), credorCpfCnpj: credor, historico: `Aquisição de medicamentos da farmácia básica ${ENSAIO}`, categoriaOrdemCronologica: "FORNECIMENTO_BENS", criadoPor: ADMIN }, roteiroEmpenho(), m05);
    return { estado: "criado", valor: r.empenhoId };
  });
  await passo(`Liquidação R3-MED-L1 com o recebimento de ${String(LOTES.length)} lotes no depósito FARM-R3`, async () => {
    if ((await prisma.liquidacao.findUnique({ where: { empenhoId_numero: { empenhoId, numero: "R3-MED-L1" } }, select: { id: true } })) !== null) return { estado: "existente", valor: null };
    await liquidar(
      {
        empenhoId, numero: "R3-MED-L1", valor: total, data: D(DIA_DO_RECEBIMENTO), responsavelAtesto: "Farmacêutica responsável (fictícia)",
        notaFiscalNum: "88001", notaFiscalSerie: "1", notaFiscalData: D("2026-09-30"), notaFiscalValor: total, historico: `Medicamentos recebidos e conferidos por lote ${ENSAIO}`, criadoPor: ADMIN,
        entradasDeMaterial: LOTES.map((l) => ({
          classeDeMaterialId: classeId, valor: toMoney(l.quantidade).times(l.unitario).toFixed(2),
          fisica: { materialId: materiais[l.material] as string, depositoId, quantidade: l.quantidade, valorUnitario: l.unitario, unidadeDeMedidaId, loteIdentificacao: l.lote, loteValidade: D(l.validade) },
        })),
      },
      roteiroLiquidacao({ codElemento: "30", obrigacaoAPagar: CONTA_FORNECEDORES_A_PAGAR, contaDebitada: contaDoEstoque }),
      m05
    );
    return { estado: "criado", valor: null };
  });
}

// ═══ 4. ALMOXARIFADO GERAL: depósito, material de expediente (um sem lote, um com lote), recebido por liquidação ═══

async function semearAlmoxarifadoGeral(prisma: PrismaClient): Promise<void> {
  const contaDoEstoque = (await exigirContaDaLiquidacao(prisma, "30")).contaCodigo;
  const classeId = await passo(`Classe de material R3-30.16 Material de expediente (conta ${contaDoEstoque})`, async () => {
    const ja = await prisma.classeDeMaterial.findFirst({ where: { codigo: "R3-30.16" }, select: { id: true } });
    if (ja !== null) return { estado: "existente", valor: ja.id };
    return { estado: "criado", valor: (await cadastrarClasseDeMaterial(prisma, { codigo: "R3-30.16", descricao: `Material de expediente ${ENSAIO}`, contaContabilId: await contaId(prisma, contaDoEstoque), criadoPor: ADMIN })).classeDeMaterialId };
  });
  const adm = await uoId(prisma, UO_ADMINISTRACAO);
  const depositoId = await passo("Depósito ALM-R3 do almoxarifado central (Administração)", async () => {
    const ja = await prisma.deposito.findFirst({ where: { codigo: "ALM-R3" }, select: { id: true } });
    if (ja !== null) return { estado: "existente", valor: ja.id };
    return { estado: "criado", valor: (await cadastrarDeposito(prisma, { codigo: "ALM-R3", nome: `Almoxarifado central ${ENSAIO}`, unidadeOrcId: adm, criadoPor: ADMIN })).depositoId };
  });
  const unidadeDeMedidaId = await passo("Unidade de medida UN (unidade)", async () => {
    const ja = await prisma.unidadeDeMedida.findFirst({ where: { sigla: "UN" }, select: { id: true } });
    if (ja !== null) return { estado: "existente", valor: ja.id };
    return { estado: "criado", valor: (await cadastrarUnidadeDeMedida(prisma, { sigla: "UN", descricao: "Unidade", criadoPor: ADMIN })).unidadeDeMedidaId };
  });
  const grupoId = await passo("Grupo de material R3-16 Expediente", async () => {
    const ja = await prisma.grupoDeMaterial.findFirst({ where: { codigo: "R3-16" }, select: { id: true } });
    if (ja !== null) return { estado: "existente", valor: ja.id };
    return { estado: "criado", valor: (await cadastrarGrupoDeMaterial(prisma, { codigo: "R3-16", descricao: `Material de expediente ${ENSAIO}`, criadoPor: ADMIN })).grupoId };
  });
  const materiais: Record<string, string> = {};
  for (const [codigo, nome, lote] of [["R3EXP001", "Papel A4, resma de 500 folhas", false], ["R3EXP002", "Caneta esferográfica azul", true]] as const) {
    materiais[codigo] = await passo(`Material ${codigo} ${nome}`, async () => {
      const ja = await prisma.material.findFirst({ where: { codigo }, select: { id: true } });
      if (ja !== null) return { estado: "existente", valor: ja.id };
      return { estado: "criado", valor: (await cadastrarMaterial(prisma, {
        codigo, descricaoSucinta: nome, descricaoDetalhada: `${nome} ${ENSAIO}`, grupoId, classificacao: "CONSUMO", categoria: "ESTOCAVEL",
        classeDeMaterialId: classeId, controlaLote: lote, unidades: [{ unidadeDeMedidaId, fatorParaEstoque: "1", ehDeEstoque: true }], criadoPor: ADMIN,
      })).materialId };
    });
  }
  const credor = cnpjComDv("704518260001");
  await passo(`Pessoa ${credor} Papelaria Borborema (fictícia)`, async () => {
    const m19 = criarM19Deps(prisma);
    if ((await m19.pessoas.buscarPorDocumento(credor)) !== null) return { estado: "existente", valor: null };
    await cadastrarPessoa({ documento: credor, nome: "Papelaria Borborema Ltda (fictícia)", municipio: "Esperança", uf: "PB", criadoPor: ADMIN }, m19);
    return { estado: "criado", valor: null };
  });
  const ficha = await prisma.fichaOrcamentaria.findUnique({ where: { exercicio_numero: { exercicio: 2026, numero: FICHA_EXPEDIENTE } }, select: { id: true, naturezaDespesa: { select: { codigoCompleto: true } }, unidadeOrc: { select: { codigo: true } } } });
  if (ficha === null || !ficha.naturezaDespesa.codigoCompleto.startsWith("339030") || ficha.unidadeOrc.codigo !== UO_ADMINISTRACAO) throw new Error(`A ficha ${String(FICHA_EXPEDIENTE)} de material de consumo da Administração não está nesta base. Nada foi gravado.`);
  const itens = [
    { material: "R3EXP001", quantidade: "100", unitario: "25.00", lote: null },
    { material: "R3EXP002", quantidade: "50", unitario: "2.00", lote: { identificacao: "CAN-2610", validade: "2029-12-31" } },
  ] as const;
  const total = itens.reduce((t, i) => t.plus(toMoney(i.quantidade).times(i.unitario)), toMoney(0)).toFixed(2);
  const m05 = criarM05DepsComAlmoxarifado(prisma);
  const empenhoId = await passo(`Empenho R3-EXP-001/2026 de material de expediente R$ ${total}`, async () => {
    const ja = await prisma.empenho.findFirst({ where: { numero: "R3-EXP-001/2026", fichaId: ficha.id }, select: { id: true } });
    if (ja !== null) return { estado: "existente", valor: ja.id };
    return { estado: "criado", valor: (await empenhar({ fichaId: ficha.id, numero: "R3-EXP-001/2026", tipo: "ORDINARIO", valor: total, data: D("2026-09-21"), credorCpfCnpj: credor, historico: `Material de expediente do almoxarifado central ${ENSAIO}`, categoriaOrdemCronologica: "FORNECIMENTO_BENS", criadoPor: ADMIN }, roteiroEmpenho(), m05)).empenhoId };
  });
  await passo("Liquidação R3-EXP-L1 com o recebimento no depósito ALM-R3", async () => {
    if ((await prisma.liquidacao.findUnique({ where: { empenhoId_numero: { empenhoId, numero: "R3-EXP-L1" } }, select: { id: true } })) !== null) return { estado: "existente", valor: null };
    await liquidar(
      {
        empenhoId, numero: "R3-EXP-L1", valor: total, data: D(DIA_DO_RECEBIMENTO), responsavelAtesto: "Almoxarife (fictício)", notaFiscalNum: "5521", notaFiscalSerie: "1", notaFiscalData: D("2026-09-30"), notaFiscalValor: total,
        historico: `Material de expediente recebido e conferido ${ENSAIO}`, criadoPor: ADMIN,
        entradasDeMaterial: itens.map((i) => ({
          classeDeMaterialId: classeId, valor: toMoney(i.quantidade).times(i.unitario).toFixed(2),
          fisica: { materialId: materiais[i.material] as string, depositoId, quantidade: i.quantidade, valorUnitario: i.unitario, unidadeDeMedidaId, ...(i.lote === null ? {} : { loteIdentificacao: i.lote.identificacao, loteValidade: D(i.lote.validade) }) },
        })),
      },
      roteiroLiquidacao({ codElemento: "30", obrigacaoAPagar: CONTA_FORNECEDORES_A_PAGAR, contaDebitada: contaDoEstoque }),
      m05
    );
    return { estado: "criado", valor: null };
  });
}

// ═══ 5. FROTA: o caminhão e a motocicleta, um condutor B, e o tanque próprio com diesel recebido por liquidação ═══

async function semearFrota(prisma: PrismaClient): Promise<void> {
  const ug = await prisma.unidadeGestora.findFirst({ where: { codigoTce: "201078" }, select: { id: true } });
  if (ug === null) throw new Error("A unidade gestora 201078 não está nesta base. Nada foi gravado.");
  for (const v of [
    { placa: "QRT3A01", anoModelo: 2022, renavam: "01234567891", combustivel: "DIESEL" as const, rotulo: "caminhão basculante" },
    { placa: "QRT3B02", anoModelo: 2024, renavam: "01234567892", combustivel: "GASOLINA" as const, rotulo: "ciclomotor de entregas" },
  ]) {
    await passo(`Veículo ${v.placa} (${v.rotulo})`, async () => {
      if ((await prisma.veiculoDaFrota.findFirst({ where: { placa: v.placa }, select: { id: true } })) !== null) return { estado: "existente", valor: null };
      await cadastrarVeiculo(prisma, { ugId: ug.id, placa: v.placa, anoModelo: v.anoModelo, renavam: v.renavam, numeroModelo: "1234", tipoFrota: "PROPRIO", combustivelPrincipal: v.combustivel, vigenteDesde: "2026-01-02", situacaoInicial: "EM_USO", fundamento: `Documento do veículo ${ENSAIO}`, criadoPor: ADMIN });
      return { estado: "criado", valor: null };
    });
  }
  await passo("Condutor 9001 com CNH B", async () => {
    if ((await prisma.condutorDaFrota.findFirst({ where: { matricula: "9001" }, select: { id: true } })) !== null) return { estado: "existente", valor: null };
    await cadastrarCondutor(prisma, { nome: "Bruna Motorista (fictícia)", matricula: "9001", cnhNumero: "55566677788", cnhCategoria: "B", cnhValidade: "2028-06-30", vinculo: "Servidora efetiva", vigenteDesde: "2026-01-02", fundamento: `CNH apresentada ${ENSAIO}`, criadoPor: ADMIN });
    return { estado: "criado", valor: null };
  });
  const contaDoEstoque = (await exigirContaDaLiquidacao(prisma, "30")).contaCodigo;
  const classeId = await passo(`Classe de material R3-30.01 Combustíveis (conta ${contaDoEstoque})`, async () => {
    const ja = await prisma.classeDeMaterial.findFirst({ where: { codigo: "R3-30.01" }, select: { id: true } });
    if (ja !== null) return { estado: "existente", valor: ja.id };
    return { estado: "criado", valor: (await cadastrarClasseDeMaterial(prisma, { codigo: "R3-30.01", descricao: `Combustíveis ${ENSAIO}`, contaContabilId: await contaId(prisma, contaDoEstoque), criadoPor: ADMIN })).classeDeMaterialId };
  });
  const obras = await uoId(prisma, UO_OBRAS);
  const depositoId = await passo("Depósito TQ-R3 (tanque da garagem)", async () => {
    const ja = await prisma.deposito.findFirst({ where: { codigo: "TQ-R3" }, select: { id: true } });
    if (ja !== null) return { estado: "existente", valor: ja.id };
    return { estado: "criado", valor: (await cadastrarDeposito(prisma, { codigo: "TQ-R3", nome: `Tanque de diesel da garagem ${ENSAIO}`, unidadeOrcId: obras, criadoPor: ADMIN })).depositoId };
  });
  const litro = await passo("Unidade de medida L (litro)", async () => {
    const ja = await prisma.unidadeDeMedida.findFirst({ where: { sigla: "L" }, select: { id: true } });
    if (ja !== null) return { estado: "existente", valor: ja.id };
    return { estado: "criado", valor: (await cadastrarUnidadeDeMedida(prisma, { sigla: "L", descricao: "Litro", criadoPor: ADMIN })).unidadeDeMedidaId };
  });
  const grupoId = await passo("Grupo de material R3-01 Combustíveis", async () => {
    const ja = await prisma.grupoDeMaterial.findFirst({ where: { codigo: "R3-01" }, select: { id: true } });
    if (ja !== null) return { estado: "existente", valor: ja.id };
    return { estado: "criado", valor: (await cadastrarGrupoDeMaterial(prisma, { codigo: "R3-01", descricao: `Combustíveis ${ENSAIO}`, criadoPor: ADMIN })).grupoId };
  });
  const diesel = await passo("Material R3CMB001 Óleo diesel S10 (litro)", async () => {
    const ja = await prisma.material.findFirst({ where: { codigo: "R3CMB001" }, select: { id: true } });
    if (ja !== null) return { estado: "existente", valor: ja.id };
    return { estado: "criado", valor: (await cadastrarMaterial(prisma, { codigo: "R3CMB001", descricaoSucinta: "Óleo diesel S10", descricaoDetalhada: `Óleo diesel S10 ${ENSAIO}`, grupoId, classificacao: "CONSUMO", categoria: "COMBUSTIVEL", classeDeMaterialId: classeId, controlaLote: false, unidades: [{ unidadeDeMedidaId: litro, fatorParaEstoque: "1", ehDeEstoque: true }], criadoPor: ADMIN })).materialId };
  });
  await passo("Tanque TQ-R3 de 5.000 L de diesel", async () => {
    if ((await prisma.tanqueDeCombustivel.findUnique({ where: { codigo: "TQ-R3" }, select: { id: true } })) !== null) return { estado: "existente", valor: null };
    await cadastrarTanqueDeCombustivel(prisma, { codigo: "TQ-R3", descricao: `Tanque aéreo da garagem municipal ${ENSAIO}`, depositoId, materialId: diesel, combustivel: "DIESEL", capacidade: "5000", fundamento: `Placa de identificação do tanque ${ENSAIO}`, criadoPor: ADMIN });
    return { estado: "criado", valor: null };
  });
  const credor = cnpjComDv("815204370001");
  await passo(`Pessoa ${credor} Distribuidora de Combustíveis do Brejo (fictícia)`, async () => {
    const m19 = criarM19Deps(prisma);
    if ((await m19.pessoas.buscarPorDocumento(credor)) !== null) return { estado: "existente", valor: null };
    await cadastrarPessoa({ documento: credor, nome: "Distribuidora de Combustíveis do Brejo Ltda (fictícia)", municipio: "Esperança", uf: "PB", criadoPor: ADMIN }, m19);
    return { estado: "criado", valor: null };
  });
  const ficha = await prisma.fichaOrcamentaria.findUnique({ where: { exercicio_numero: { exercicio: 2026, numero: FICHA_COMBUSTIVEL } }, select: { id: true, naturezaDespesa: { select: { codigoCompleto: true } }, unidadeOrc: { select: { codigo: true } } } });
  if (ficha === null || !ficha.naturezaDespesa.codigoCompleto.startsWith("339030") || ficha.unidadeOrc.codigo !== UO_OBRAS) throw new Error(`A ficha ${String(FICHA_COMBUSTIVEL)} de material de consumo de Obras não está nesta base. Nada foi gravado.`);
  const total = toMoney("3000").times("6.20").toFixed(2);
  const m05 = criarM05DepsComAlmoxarifado(prisma);
  const empenhoId = await passo(`Empenho R3-CMB-001/2026 de diesel R$ ${total}`, async () => {
    const ja = await prisma.empenho.findFirst({ where: { numero: "R3-CMB-001/2026", fichaId: ficha.id }, select: { id: true } });
    if (ja !== null) return { estado: "existente", valor: ja.id };
    return { estado: "criado", valor: (await empenhar({ fichaId: ficha.id, numero: "R3-CMB-001/2026", tipo: "ORDINARIO", valor: total, data: D("2026-09-22"), credorCpfCnpj: credor, historico: `Diesel para o tanque da garagem ${ENSAIO}`, categoriaOrdemCronologica: "FORNECIMENTO_BENS", criadoPor: ADMIN }, roteiroEmpenho(), m05)).empenhoId };
  });
  await passo("Liquidação R3-CMB-L1 com 3.000 L recebidos no tanque TQ-R3", async () => {
    if ((await prisma.liquidacao.findUnique({ where: { empenhoId_numero: { empenhoId, numero: "R3-CMB-L1" } }, select: { id: true } })) !== null) return { estado: "existente", valor: null };
    await liquidar(
      {
        empenhoId, numero: "R3-CMB-L1", valor: total, data: D(DIA_DO_RECEBIMENTO), responsavelAtesto: "Encarregado da garagem (fictício)", notaFiscalNum: "9012", notaFiscalSerie: "1", notaFiscalData: D("2026-09-30"), notaFiscalValor: total,
        historico: `Diesel recebido no tanque, régua conferida ${ENSAIO}`, criadoPor: ADMIN,
        entradasDeMaterial: [{ classeDeMaterialId: classeId, valor: total, fisica: { materialId: diesel, depositoId, quantidade: "3000", valorUnitario: "6.20", unidadeDeMedidaId: litro } }],
      },
      roteiroLiquidacao({ codElemento: "30", obrigacaoAPagar: CONTA_FORNECEDORES_A_PAGAR, contaDebitada: contaDoEstoque }),
      m05
    );
    return { estado: "criado", valor: null };
  });
}

// ═══ 6. RETENÇÃO NA FONTE: o perfil fiscal do fornecedor do material de expediente (fictício) ═══
// As tabelas do IR, do INSS e do ISS NÃO entram aqui: vêm de `scripts/carregar-tabelas-da-retencao.ts`, dos textos
// oficiais com o sha256 conferido. Aqui só a situação fiscal do fornecedor fictício, que um servidor cadastraria.

async function semearRetencao(prisma: PrismaClient): Promise<void> {
  const empenho = await prisma.empenho.findFirst({ where: { numero: "R3-EXP-001/2026" }, select: { credorCpfCnpj: true } });
  if (empenho === null) throw new Error("O empenho R3-EXP-001/2026 não está na base: rode a seção do almoxarifado antes. Nada foi gravado.");
  if ((await prisma.naturezaDaRetencaoDoIR.count()) === 0) throw new Error("As tabelas da retenção não estão carregadas nesta base: rode scripts/carregar-tabelas-da-retencao.ts antes. Nada foi gravado.");
  // O estabelecimento no próprio município do ente (do cadastro do ente, não de literal).
  const municipio = (await prisma.enteConfig.findFirstOrThrow({ select: { codigoIbge: true } })).codigoIbge;
  await passo(`Perfil fiscal do fornecedor ${empenho.credorCpfCnpj}: fora do Simples, sem dispensa do IR`, async () => {
    const ja = await prisma.perfilFiscalDoFornecedor.findFirst({ where: { documento: empenho.credorCpfCnpj }, select: { id: true } });
    if (ja !== null) return { estado: "existente", valor: null };
    await registrarPerfilFiscal(prisma, {
      documento: empenho.credorCpfCnpj, vigenteDesde: new Date("2026-01-01T00:00:00Z"), optanteSimplesNacional: false, tributadoNoAnexoIVDoSimples: false,
      contribuiSobreReceitaBruta: false, dispensaDoIR: null, municipioDoEstabelecimento: municipio,
      fundamento: `Situação fiscal fictícia do fornecedor da massa ${ENSAIO}`, criadoPor: ADMIN,
    });
    return { estado: "criado", valor: null };
  });
}

// ═══ 7. COMPRAS: dois setores que pedem (a solicitação de compra é de um setor) ═══

async function semearCompras(prisma: PrismaClient): Promise<void> {
  for (const [codigo, nome, uo] of [["R3-ADM", `Setor de compras da Administração ${ENSAIO}`, UO_ADMINISTRACAO], ["R3-SAU", `Setor de compras da Saúde ${ENSAIO}`, UO_SAUDE]] as const) {
    await passo(`Setor ${codigo}`, async () => {
      const ja = await prisma.setor.findFirst({ where: { codigo }, select: { id: true } });
      if (ja !== null) return { estado: "existente", valor: null };
      await criarSetor(prisma, { codigo, nome, unidadeOrcId: await uoId(prisma, uo), criadoPor: ADMIN });
      return { estado: "criado", valor: null };
    });
  }
}

// ═══ PRINCIPAL ═══

function exigirBanco(): string {
  const url = process.env["DATABASE_URL"] ?? "";
  let nome = "";
  try {
    nome = new URL(url).pathname.replace(/^\//, "");
  } catch {
    throw new Error("DATABASE_URL ausente ou ilegível. Nada foi gravado.");
  }
  if (nome !== BANCO) throw new Error(`Recusado: esta massa só se grava na base isolada de ensaio "${BANCO}", e o DATABASE_URL aponta para "${nome}". Nada foi gravado.`);
  return urlDoRuntime(url, papelDoAmbiente());
}

async function main(): Promise<void> {
  const prisma = criarPrismaClient(exigirBanco());
  try {
    const n = await naturezaDaBase(prisma);
    if (n.natureza !== "ENSAIO") throw new Error(`A base não está declarada de ENSAIO (está ${n.natureza}): a massa não se grava nela. Rode antes a semente fictícia nesta base.`);
    await passo(`Origem da massa registrada na declaração da natureza (${ORIGEM})`, async () => {
      const d = await prisma.declaracaoDaNaturezaDaBase.findFirst({ orderBy: { numero: "desc" }, select: { motivo: true } });
      if (d?.motivo.includes(ORIGEM) === true) return { estado: "existente", valor: null };
      await declararNaturezaDaBase(prisma, { natureza: "ENSAIO", motivo: `Base isolada de ensaio da V39-R3: semente fictícia de Esperança mais a massa ${ORIGEM}. Dados fictícios, gravados pelos serviços com o papel de runtime.`, declaradoPor: ADMIN });
      return { estado: "criado", valor: null };
    });
    console.log("\n[1] usuários por papel");
    await semearUsuarios(prisma);
    console.log("\n[2] planejamento de 2027");
    await semearPlanejamento(prisma);
    console.log("\n[3] farmácia");
    await semearFarmacia(prisma);
    console.log("\n[4] almoxarifado geral");
    await semearAlmoxarifadoGeral(prisma);
    console.log("\n[5] frota e tanque");
    await semearFrota(prisma);
    console.log("\n[6] retenção na fonte");
    await semearRetencao(prisma);
    console.log("\n[7] compras");
    await semearCompras(prisma);
    console.log(`\nPronto: ${String(criados)} criado(s), ${String(existentes)} já existente(s). Usuários da R3: ${PAPEIS_R3.map((p) => p.email).join(", ")}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
