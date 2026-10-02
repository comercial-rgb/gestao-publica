import "dotenv/config";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import { criarM19Deps } from "../../modules/m19-pessoas/adapter-prisma.js";
import { cadastrarPessoa } from "../../modules/m19-pessoas/servico.js";
import { vincularPessoaAoUsuario, pessoaDoUsuario } from "../../modules/m16-travamento/servico-pessoa-do-usuario.js";
import { admitirServidor, cadastrarCargo, cadastrarLotacao, cadastrarServidor } from "../../modules/m32-pessoal/servico.js";
import { abrirFolha, cadastrarRubrica, cadastrarTabelaDeContribuicao, cadastrarTabelaIrrf, calcularFolha, fecharFolha } from "../../modules/m33-folha/servico.js";
import { apropriarFolha, cadastrarGrupoDeEmpenhoDaFolha } from "../../modules/m33-folha/apropriacao.js";
import { certificarFolha, designarNaFolha, liquidarFolha } from "../../modules/m33-folha/certificacao.js";
import { documentoTemDigitoValido } from "../../packages/documento/index.js";
import { criarM02Deps } from "../../modules/m02-planejamento/adapter-prisma.js";
import { criarFicha } from "../../modules/m02-planejamento/servico.js";
import { criarDecreto, criarLei, executarCredito } from "../../modules/m03-creditos/index.js";
import { criarM03DepsAmarrado } from "../../modules/m12-relatorios/adapter-m03.js";
import {
  apropriarEncargosDaFolha,
  apurarEncargosDaFolha,
  aprovarVersaoDoEncargo,
  cadastrarComponenteDeEncargo,
  cadastrarGrupoDosEncargos,
  cadastrarVersaoDoEncargo,
  certificarEncargosDaFolha,
  liquidarEncargosDaFolha,
} from "../../modules/m33-folha/encargos-servico.js";
import { meioDiaCivil } from "../../packages/datas/index.js";
import { listarTiposConsignacao } from "../../modules/m07-extraorcamentario/consultas.js";
import { redefinirContaDaConsignacao } from "../../modules/m07-extraorcamentario/servico-tipos-de-consignacao.js";
import { consignacaoVigenteDaRubrica, declararConsignacaoDaRubrica } from "../../modules/m33-folha/descontos-da-folha.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";

/**
 * A FOLHA DA DEMONSTRAÇÃO (V22) — para que o RGF Anexo 1 (despesa com pessoal) saia com números
 * pelo caminho LEGÍTIMO: folha calculada pelas tabelas oficiais, fechada, apropriada (empenho),
 * certificada por quem foi designado e liquidada por outra pessoa. Nenhum lançamento, saldo ou
 * razão é gravado por fora: cada passo chama o MESMO serviço que a tela chama, com autorização,
 * guards e Zod.
 *
 * TABELAS NORMATIVAS — só valores oficiais, conferidos na fonte antes de gravar (2026-09-28):
 *  · IRRF mensal 2026: Receita Federal, Lei 15.191/2025 (faixas, dependente, desconto simplificado,
 *    parcela isenta 65+) e Lei 15.270/2025 (redução), em
 *    https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026
 *  · Contribuição do segurado empregado RGPS 2026: Portaria Interministerial MPS/MF nº 13, de
 *    9/1/2026, em https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal
 *
 * DADOS DE DEMONSTRAÇÃO (não são pessoas nem atos reais): dois servidores (N=2) com vencimentos
 * de 2.400,00 e 2.800,00 — baixos o bastante para o IRRF ser zero em todos os cenários, sem
 * depender das nuances do redutor —, a atestadora designada pela "Portaria 001/2026 —
 * demonstração", cargo, lotação e as rubricas do estatuto de demonstração.
 *
 * PAPÉIS (segregação exigida pelo M33): admin@cg.pb.gov.br cadastra, calcula, fecha e apropria;
 * atestador@percursos.local certifica; liquidante@percursos.local liquida.
 *
 * Contas do grupo de empenho (decisão do contador, conferidas no PCASP carregado):
 *   VPD 3.1.1.2.1.01.01 (vencimentos e salários — pessoal civil RGPS);
 *   obrigação 2.1.1.1.1.01.01 (salários, remunerações e benefícios a pagar).
 * Ficha 103/2026 (319011, fonte 500, órgão 01).
 *
 * OS ENCARGOS PATRONAIS DA COMPETÊNCIA (V22) — os dois servidores são RGPS, e o ente é "empresa"
 * para a Seguridade Social (Lei 8.212/1991 art. 15, I: "os órgãos e entidades da administração
 * pública direta, indireta e fundacional"). Fontes conferidas no texto oficial em 2026-09-28:
 *  · cota patronal de 20% — Lei 8.212/1991 art. 22, I,
 *    https://www.planalto.gov.br/ccivil_03/leis/l8212cons.htm
 *  · RAT de 2% (risco médio) — art. 22, II, "b", com o grau de risco da atividade preponderante do
 *    Decreto 3.048/1999 Anexo V: CNAE 8411-6/00 "Administração pública em geral" → 2,
 *    https://www.planalto.gov.br/ccivil_03/decreto/D3048anexov-vol1.htm
 *  · FAP 1,0000 — VALOR DE DEMONSTRAÇÃO. O FAP é do estabelecimento, divulgado anualmente; não há
 *    fonte local para o do ente. Por isso a versão do RAT nasce SINTÉTICA (a tela avisa "sem
 *    validade normativa"), e a da cota patronal não.
 *  · elemento 13 "Obrigações Patronais" com modalidade 90 (Portaria Interministerial STN/SOF
 *    163/2001, Anexo II): a 91 é só "quando o recebedor dos recursos também for [...] entidade
 *    constante desses orçamentos, no âmbito da mesma esfera de Governo" — o RGPS é federal. Daí a
 *    ficha 104 em 319013, e não em 319113.
 * Contas do grupo (decisão do contador, conferidas no PCASP carregado; o INSS é autarquia da União,
 * por isso o 5º nível "inter OFSS - União"): VPD 3.1.2.2.3.01.00 (contribuições previdenciárias -
 * RGPS) e 3.1.2.2.3.03.00 (seguro de acidente no trabalho); obrigação 2.1.1.4.3.01.01
 * (contribuições ao RGPS sobre salários e remunerações). Credor: INSS, CNPJ 29.979.036/0001-40.
 * Dotação: crédito especial por lei e decreto de demonstração, anulando parte da ficha 2.
 * Papéis: admin cadastra e apura; aprovador-encargos@percursos.local aprova a versão (quem cadastra
 * não aprova); atestador@percursos.local certifica (designado para os encargos); admin empenha;
 * liquidante@percursos.local liquida.
 *
 * Idempotente: cada item é procurado pela chave natural antes de ser criado; o cálculo só roda se
 * a folha não tem cálculo vivo nem fechamento; apropriar e liquidar são idempotentes por si.
 * Recusa rodar fora do banco gestao_publica_local.
 *
 * Uso: npx tsx scripts/demonstracao/semear-folha-da-demonstracao.ts
 */

// Só os dois bancos de demonstração: o local (onde a apresentação foi montada) e o da apresentação.
const BANCOS_PERMITIDOS: readonly string[] = ["gestao_publica_local", "gestao_publica_apresentacao"];
const AUTOR = "admin@cg.pb.gov.br";
const ATESTADOR = "atestador@percursos.local";
const LIQUIDANTE = "liquidante@percursos.local";

const EXERCICIO = 2026;
const COMPETENCIA = "2026-08";
const ADMISSAO = "2026-08-01";
const DATA_DO_ATO = "2026-08-31"; // último dia da competência: empenho, atesto e liquidação
const FICHA_NUMERO = 103;
const CONTA_VPD = "3.1.1.2.1.01.01";
const CONTA_OBRIGACAO = "2.1.1.1.1.01.01";
const APROVADOR_ENCARGOS = "aprovador-encargos@percursos.local";
const FICHA_ENCARGOS = 104;
const NATUREZA_ENCARGOS = "319013";
const CREDITO_ENCARGOS = "3000.00";
const LEI_ENCARGOS = { numero: "1.521", data: "2026-08-20" } as const; // dado de demonstração
const DECRETO_ENCARGOS = { numero: "0042", data: "2026-08-21" } as const; // dado de demonstração
const CONTA_OBRIGACAO_RGPS = "2.1.1.4.3.01.01";
const INSS = { cnpj: "29979036000140", nome: "Instituto Nacional do Seguro Social - INSS" };
const FONTE_PATRONAL =
  "Lei 8.212/1991 art. 22, I (20% sobre as remunerações dos segurados empregados), c/c art. 15, I (a administração pública direta é empresa para a Seguridade Social) — " +
  "https://www.planalto.gov.br/ccivil_03/leis/l8212cons.htm";
const FONTE_RAT =
  "Lei 8.212/1991 art. 22, II, b (2%, risco médio) e Decreto 3.048/1999 Anexo V (CNAE 8411-6/00 Administração pública em geral, grau 2), " +
  "× FAP 1,0000 — FAP de DEMONSTRAÇÃO, não o do ente";
const FONTE_IRRF_REDUCAO =
  "Lei 15.191/2025 (tabela progressiva mensal, dedução por dependente, desconto simplificado e parcela isenta 65+) " +
  "e Lei 9.250/1995 art. 3º-A, incluído pela Lei 15.270/2025 (redução: até R$ 5.000,00 até R$ 312,89; de 5.000,01 a 7.350,00, 978,62 − 0,133145 × rendimentos) — " +
  "https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15270.htm e " +
  "https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026";

const FONTE_IRRF =
  "Lei 15.191/2025 (tabela progressiva mensal, dedução por dependente, desconto simplificado e parcela isenta 65+) " +
  "e Lei 15.270/2025 (redução do imposto) — Receita Federal, " +
  "https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026";
const FONTE_RGPS =
  "Portaria Interministerial MPS/MF nº 13, de 9 de janeiro de 2026 — tabela de contribuição do segurado empregado, " +
  "https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal";
/** V28 — a conta analítica da contribuição do segurado ao RGPS no PCASP do TCE-PB 2025. */
const CONTA_INSS_DO_SERVIDOR = "2.1.8.8.1.01.02";
const FONTE_ESTATUTO = "Estatuto dos servidores do município — dado de demonstração";

function exigirBancoPermitido(): string {
  const url = process.env["DATABASE_URL"];
  if (url === undefined || url === "") throw new Error("DATABASE_URL ausente. Nada foi gravado.");
  let nome: string;
  try {
    nome = new URL(url).pathname.replace(/^\//, "");
  } catch {
    throw new Error("DATABASE_URL ilegível. Nada foi gravado.");
  }
  if (!BANCOS_PERMITIDOS.includes(nome)) {
    throw new Error(`Recusado: este script só semeia o banco "${BANCOS_PERMITIDOS.join(" ou ")}", e o DATABASE_URL aponta para "${nome}". Nada foi gravado.`);
  }
  return url;
}

/** DV do CPF pela regra oficial (módulo 11), escrito aqui e conferido pelo pacote. */
function cpfComDv(raiz9: string): string {
  const digitos = raiz9.split("").map(Number);
  for (const tamanho of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += (digitos[i] as number) * (tamanho + 1 - i);
    const resto = soma % 11;
    digitos.push(resto < 2 ? 0 : 11 - resto);
  }
  const doc = digitos.join("");
  if (!documentoTemDigitoValido(doc)) throw new Error(`CPF gerado sem DV válido: ${doc}`);
  return doc;
}

const SERVIDORES = [
  { cpf: cpfComDv("738291465"), nome: "Ana Beatriz Tavares (demonstração)", nascimento: "1988-04-12", sexo: "FEMININO" as const, matricula: "DEMO-0001", salario: "2400.00" },
  { cpf: cpfComDv("846152937"), nome: "Bruno Henrique Araújo (demonstração)", nascimento: "1991-11-03", sexo: "MASCULINO" as const, matricula: "DEMO-0002", salario: "2800.00" },
] as const;
const ATESTADORA = { cpf: cpfComDv("629374851"), nome: "Carla Mendes Rocha (demonstração)" };

const D = (dia: string): Date => meioDiaCivil(dia);

async function passo<T>(rotulo: string, f: () => Promise<{ readonly estado: "criado" | "existente"; readonly valor: T; readonly detalhe?: string }>): Promise<T> {
  try {
    const r = await f();
    console.log(`${r.estado === "criado" ? "+" : "="} ${rotulo}${r.detalhe === undefined ? "" : ` — ${r.detalhe}`}`);
    return r.valor;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`! ${rotulo}: RECUSADO — ${msg}`);
    throw new Error(`parou em "${rotulo}"`);
  }
}

async function pessoaPorCpf(prisma: PrismaClient, cpf: string, nome: string): Promise<string> {
  const m19 = criarM19Deps(prisma);
  return passo(`Pessoa ${cpf} ${nome}`, async () => {
    const ja = await m19.pessoas.buscarPorDocumento(cpf);
    if (ja !== null) return { estado: "existente", valor: ja.id };
    const { pessoaId } = await cadastrarPessoa({ documento: cpf, nome, municipio: "Campina Grande", uf: "PB", criadoPor: AUTOR }, m19);
    return { estado: "criado", valor: pessoaId };
  });
}

async function main(): Promise<void> {
  const url = exigirBancoPermitido();
  const prisma = criarPrismaClient(url);
  try {
    // ── 0. pré-condições que este script NÃO cria (fail-closed) ──
    const ficha = await prisma.fichaOrcamentaria.findUnique({ where: { exercicio_numero: { exercicio: EXERCICIO, numero: FICHA_NUMERO } }, select: { id: true, saldoDisponivel: true, naturezaDespesa: { select: { codigoCompleto: true } } } });
    if (ficha === null) throw new Error(`A ficha ${FICHA_NUMERO}/${EXERCICIO} não existe — rode scripts/demonstracao/semear-demonstrativos.ts antes. Nada foi gravado.`);
    if (ficha.naturezaDespesa.codigoCompleto !== "319011") throw new Error(`A ficha ${FICHA_NUMERO}/${EXERCICIO} é ${ficha.naturezaDespesa.codigoCompleto}, não 319011. Nada foi gravado.`);
    const contas = await prisma.contaPcasp.findMany({ where: { codigo: { in: [CONTA_VPD, CONTA_OBRIGACAO] } }, select: { id: true, codigo: true, analitica: true } });
    const vpd = contas.find((c) => c.codigo === CONTA_VPD);
    const obrigacao = contas.find((c) => c.codigo === CONTA_OBRIGACAO);
    if (vpd === undefined || obrigacao === undefined || !vpd.analitica || !obrigacao.analitica) {
      throw new Error(`As contas ${CONTA_VPD} e ${CONTA_OBRIGACAO} precisam existir e ser analíticas no PCASP carregado. Nada foi gravado.`);
    }
    console.log(`[ficha ${FICHA_NUMERO}/${EXERCICIO} 319011, disponível ${ficha.saldoDisponivel.toFixed(2)}; VPD ${CONTA_VPD}; obrigação ${CONTA_OBRIGACAO}]`);

    // ── 1. tabelas oficiais ──
    await passo(`Tabela de contribuição RGPS desde ${"2026-01"}`, async () => {
      const ja = await prisma.tabelaDeContribuicao.findFirst({ where: { regime: "RGPS", competenciaInicio: "2026-01" }, select: { id: true } });
      if (ja !== null) return { estado: "existente", valor: ja.id };
      const { tabelaId } = await cadastrarTabelaDeContribuicao(prisma, {
        regime: "RGPS",
        competenciaInicio: "2026-01",
        teto: "8475.55",
        fundamentacaoLegal: FONTE_RGPS,
        faixas: [
          { ordem: 1, ate: "1621.00", aliquota: "0.075" },
          { ordem: 2, ate: "2902.84", aliquota: "0.09" },
          { ordem: 3, ate: "4354.27", aliquota: "0.12" },
          { ordem: 4, ate: "8475.55", aliquota: "0.14" },
        ],
        criadoPor: AUTOR,
      });
      return { estado: "criado", valor: tabelaId };
    });
    await passo(`Tabela de IRRF desde 2026-01`, async () => {
      const ja = await prisma.tabelaIrrf.findFirst({ where: { competenciaInicio: "2026-01" }, select: { id: true } });
      if (ja !== null) return { estado: "existente", valor: ja.id };
      const { tabelaId } = await cadastrarTabelaIrrf(prisma, {
        competenciaInicio: "2026-01",
        deducaoPorDependente: "189.59",
        descontoSimplificado: "607.20",
        isencaoMaior65: "1903.98",
        redutorBase: "978.62",
        redutorFator: "0.133145",
        redutorRendaMaxima: "7350.00",
        fundamentacaoLegal: FONTE_IRRF,
        faixas: [
          { ordem: 1, ate: "2428.80", aliquota: "0" },
          { ordem: 2, ate: "2826.65", aliquota: "0.075", parcelaADeduzir: "182.16" },
          { ordem: 3, ate: "3751.05", aliquota: "0.15", parcelaADeduzir: "394.16" },
          { ordem: 4, ate: "4664.68", aliquota: "0.225", parcelaADeduzir: "675.49" },
          { ordem: 5, ate: null, aliquota: "0.275", parcelaADeduzir: "908.73" },
        ],
        criadoPor: AUTOR,
      });
      return { estado: "criado", valor: tabelaId };
    });

    // ── 1b. a mesma tabela de 2026 com a faixa isenta da redução (V22). A de 2026-01 é FATO e não se
    // altera; a correção entra como NOVA VIGÊNCIA, a partir da primeira competência ainda não
    // calculada (a de 2026-08 está fechada). Os valores são os mesmos da de 2026-01, mais a faixa.
    await passo("Tabela de IRRF desde 2026-09 (com a faixa isenta da redução do art. 3º-A)", async () => {
      const ja = await prisma.tabelaIrrf.findFirst({ where: { competenciaInicio: "2026-09" }, select: { id: true } });
      if (ja !== null) return { estado: "existente", valor: ja.id };
      const { tabelaId } = await cadastrarTabelaIrrf(prisma, {
        competenciaInicio: "2026-09",
        deducaoPorDependente: "189.59",
        descontoSimplificado: "607.20",
        isencaoMaior65: "1903.98",
        redutorBase: "978.62",
        redutorFator: "0.133145",
        redutorRendaMaxima: "7350.00",
        redutorRendaDaFaixaIsenta: "5000.00",
        redutorMaximoNaFaixaIsenta: "312.89",
        fundamentacaoLegal: FONTE_IRRF_REDUCAO,
        faixas: [
          { ordem: 1, ate: "2428.80", aliquota: "0" },
          { ordem: 2, ate: "2826.65", aliquota: "0.075", parcelaADeduzir: "182.16" },
          { ordem: 3, ate: "3751.05", aliquota: "0.15", parcelaADeduzir: "394.16" },
          { ordem: 4, ate: "4664.68", aliquota: "0.225", parcelaADeduzir: "675.49" },
          { ordem: 5, ate: null, aliquota: "0.275", parcelaADeduzir: "908.73" },
        ],
        criadoPor: AUTOR,
      });
      return { estado: "criado", valor: tabelaId };
    });

    // ── 2. rubricas (VENC é o único provento; PREV e IRRF são as sistêmicas de desconto) ──
    const rubricas = [
      { codigo: "VENC", descricao: "Vencimento", tipo: "PROVENTO" as const, natureza: "VENCIMENTO_BASE" as const, incideContribuicao: true, incideIrrf: true, proporcionalAosDias: true, ordem: 1, fundamentacaoLegal: FONTE_ESTATUTO },
      { codigo: "PREV", descricao: "Contribuição previdenciária (RGPS)", tipo: "DESCONTO" as const, natureza: "CONTRIBUICAO_PREVIDENCIARIA" as const, incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 90, fundamentacaoLegal: FONTE_RGPS },
      { codigo: "IRRF", descricao: "Imposto de renda retido na fonte", tipo: "DESCONTO" as const, natureza: "IMPOSTO_DE_RENDA" as const, incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 91, fundamentacaoLegal: FONTE_IRRF },
    ];
    const idDaRubrica = new Map<string, string>();
    for (const r of rubricas) {
      const id = await passo(`Rubrica ${r.codigo}`, async () => {
        const ja = (await prisma.rubrica.findUnique({ where: { codigo: r.codigo }, select: { id: true } })) ?? (await prisma.rubrica.findFirst({ where: { natureza: r.natureza }, select: { id: true } }));
        if (ja !== null) return { estado: "existente", valor: ja.id };
        const { rubricaId } = await cadastrarRubrica(prisma, { ...r, criadoPor: AUTOR });
        return { estado: "criado", valor: rubricaId };
      });
      idDaRubrica.set(r.codigo, id);
    }

    // ── 2b. V28 — a contribuição do servidor retida no pagamento e devida ao INSS ──
    // Sem esta declaração o pagamento da folha é recusado (o banco pagaria ao servidor o que é do INSS).
    // A conta do tipo INSS do seed (2.1.8.8.1.01.00) é SINTÉTICA no PCASP do TCE-PB 2025; a analítica da
    // contribuição do segurado ao RGPS é 2.1.8.8.1.01.02 — trocada por decisão versionada, com o plano por fundamento.
    await passo("Retenção da contribuição do servidor (PREV → INSS)", async () => {
      const inss = await prisma.tipoConsignacao.findUnique({ where: { codigo: "INSS" }, select: { id: true } });
      if (inss === null) throw new Error("O tipo de consignação INSS não existe neste banco; rode o seed das consignações antes.");
      const vigente = (await listarTiposConsignacao(prisma)).find((t) => t.id === inss.id);
      if (vigente?.contaPassivoCodigo !== CONTA_INSS_DO_SERVIDOR) {
        await redefinirContaDaConsignacao(prisma, {
          tipoId: inss.id,
          contaPassivoCodigo: CONTA_INSS_DO_SERVIDOR,
          fundamento: "PCASP do TCE-PB 2025 (docs/oficial/tce-pb/Pcasp_2025.xlsx): 2.1.8.8.1.01.02 Contribuição ao RGPS; a 2.1.8.8.1.01.00 é sintética.",
          criadoPor: AUTOR,
        });
      }
      const rubricaPrev = idDaRubrica.get("PREV")!;
      const ja = await consignacaoVigenteDaRubrica(prisma, rubricaPrev);
      if (ja !== null) return { estado: "existente", valor: ja.versao };
      const r = await declararConsignacaoDaRubrica(prisma, {
        rubricaId: rubricaPrev,
        tipoConsignacaoId: inss.id,
        credorConsignatario: "Instituto Nacional do Seguro Social - INSS",
        fundamento: `Contribuição do segurado ao RGPS, retida pelo ente e recolhida ao INSS — ${FONTE_RGPS}`,
        criadoPor: AUTOR,
      });
      return { estado: "criado", valor: r.versao };
    });

    // ── 3. cargo, lotação, servidores e vínculos (N=2) ──
    const cargoId = await passo("Cargo DEMO-AGADM", async () => {
      const ja = await prisma.cargo.findFirst({ where: { codigo: "DEMO-AGADM" }, select: { id: true } });
      if (ja !== null) return { estado: "existente", valor: ja.id };
      const { cargoId } = await cadastrarCargo(prisma, { codigo: "DEMO-AGADM", denominacao: "Agente administrativo", tipo: "EFETIVO", vagasFixadas: 10, leiAutorizativa: "Lei municipal de demonstração nº 001/2020", dataPublicacaoLei: D("2020-01-02"), criadoPor: AUTOR });
      return { estado: "criado", valor: cargoId };
    });
    const lotacaoId = await passo("Lotação DEMO-SEDUC", async () => {
      const ja = await prisma.lotacao.findFirst({ where: { codigo: "DEMO-SEDUC" }, select: { id: true } });
      if (ja !== null) return { estado: "existente", valor: ja.id };
      const { lotacaoId } = await cadastrarLotacao(prisma, { codigo: "DEMO-SEDUC", nome: "Secretaria de Educação", criadoPor: AUTOR });
      return { estado: "criado", valor: lotacaoId };
    });
    for (const s of SERVIDORES) {
      const pessoaId = await pessoaPorCpf(prisma, s.cpf, s.nome);
      const servidorId = await passo(`Servidor ${s.nome}`, async () => {
        const ja = await prisma.servidor.findFirst({ where: { pessoaId }, select: { id: true } });
        if (ja !== null) return { estado: "existente", valor: ja.id };
        const { servidorId } = await cadastrarServidor(prisma, { pessoaId, dataNascimento: D(s.nascimento), sexo: s.sexo, criadoPor: AUTOR });
        return { estado: "criado", valor: servidorId };
      });
      await passo(`Vínculo ${s.matricula} (RGPS, ${s.salario}, admissão ${ADMISSAO})`, async () => {
        const ja = await prisma.vinculo.findUnique({ where: { matricula: s.matricula }, select: { id: true } });
        if (ja !== null) return { estado: "existente", valor: ja.id };
        const { vinculoId } = await admitirServidor(prisma, { servidorId, matricula: s.matricula, tipo: "EFETIVO", regimeJuridico: "Estatutário", regimePrevidenciario: "RGPS", dataAdmissao: D(ADMISSAO), cargoId, lotacaoId, salarioBase: s.salario, criadoPor: AUTOR });
        return { estado: "criado", valor: vinculoId };
      });
    }

    // ── 4. grupo de empenho da folha ──
    await passo("Grupo de empenho FOLHA-VENC (por servidor, ficha 103)", async () => {
      const ja = await prisma.grupoDeEmpenhoDaFolha.findUnique({ where: { codigo: "FOLHA-VENC" }, select: { id: true } });
      if (ja !== null) return { estado: "existente", valor: ja.id };
      const { grupoId } = await cadastrarGrupoDeEmpenhoDaFolha(prisma, {
        codigo: "FOLHA-VENC", descricao: "Vencimentos e vantagens fixas", fichaId: ficha.id,
        categoriaOrdemCronologica: "PRESTACAO_SERVICOS", tipoEmpenho: "ORDINARIO", serie: "FP", porServidor: true,
        contaVariacaoId: vpd.id, contaObrigacaoId: obrigacao.id, rubricaIds: [idDaRubrica.get("VENC") as string], criadoPor: AUTOR,
      });
      return { estado: "criado", valor: grupoId };
    });

    // ── 5. a folha: abrir, calcular, fechar (admin) ──
    const folhaId = await passo(`Folha MENSAL ${COMPETENCIA}`, async () => {
      const ja = await prisma.folhaDePagamento.findUnique({ where: { competencia_tipo: { competencia: COMPETENCIA, tipo: "MENSAL" } }, select: { id: true } });
      if (ja !== null) return { estado: "existente", valor: ja.id };
      const { folhaId } = await abrirFolha(prisma, { competencia: COMPETENCIA, tipo: "MENSAL", criadoPor: AUTOR });
      return { estado: "criado", valor: folhaId };
    });
    const situacao = async () => prisma.folhaDePagamento.findUniqueOrThrow({ where: { id: folhaId }, select: { fechamento: { select: { calculoId: true } }, calculos: { where: { cancelamento: null }, select: { id: true } } } });
    await passo(`Cálculo da folha ${COMPETENCIA}`, async () => {
      const f = await situacao();
      if (f.fechamento !== null || f.calculos.length > 0) return { estado: "existente", valor: null };
      const r = await calcularFolha(prisma, { folhaId, motivo: "folha da demonstração", criadoPor: AUTOR });
      return { estado: "criado", valor: null, detalhe: JSON.stringify(r, (_k, v: unknown) => (typeof v === "object" && v !== null && "toFixed" in v ? (v as { toFixed(n: number): string }).toFixed(2) : v)).slice(0, 400) };
    });
    await passo(`Fechamento da folha ${COMPETENCIA}`, async () => {
      if ((await situacao()).fechamento !== null) return { estado: "existente", valor: null };
      const r = await fecharFolha(prisma, { folhaId, criadoPor: AUTOR });
      return { estado: "criado", valor: null, detalhe: `cálculo nº ${r.numero}` };
    });
    const fechado = (await situacao()).fechamento?.calculoId as string;
    const contracheques = await prisma.contracheque.findMany({ where: { calculoId: fechado }, select: { vinculo: { select: { matricula: true } }, totalProventos: true, totalDescontos: true, liquido: true, linhas: { select: { rubrica: { select: { codigo: true } }, valor: true } } }, orderBy: { vinculo: { matricula: "asc" } } });
    for (const c of contracheques) {
      console.log(`    contracheque ${c.vinculo.matricula}: proventos ${c.totalProventos.toFixed(2)}, descontos ${c.totalDescontos.toFixed(2)}, líquido ${c.liquido.toFixed(2)} [${c.linhas.map((l) => `${l.rubrica.codigo} ${l.valor.toFixed(2)}`).join("; ")}]`);
    }

    // ── 6. apropriar (empenho do bruto, por servidor) ──
    await passo(`Apropriação da folha ${COMPETENCIA} (empenhos em ${DATA_DO_ATO})`, async () => {
      const r = await apropriarFolha(prisma, { folhaId, dataDoEmpenho: D(DATA_DO_ATO), criadoPor: AUTOR });
      return { estado: r.empenhados > 0 ? "criado" : "existente", valor: null, detalhe: `${r.empenhados} empenhado(s), ${r.jaExistiam} já existiam, total ${r.total.toFixed(2)}` };
    });

    // ── 7. a atestadora: pessoa, vínculo usuário↔pessoa, designação ──
    const pessoaAtestadora = await pessoaPorCpf(prisma, ATESTADORA.cpf, ATESTADORA.nome);
    await passo(`Vínculo do usuário ${ATESTADOR} à pessoa ${ATESTADORA.cpf}`, async () => {
      const ja = await pessoaDoUsuario(prisma, ATESTADOR);
      if (ja !== null) {
        if (ja.pessoaId !== pessoaAtestadora) throw new Error(`o usuário já é outra pessoa (${ja.documento}); não se troca em silêncio.`);
        return { estado: "existente", valor: null };
      }
      const u = await prisma.usuario.findUniqueOrThrow({ where: { identificador: ATESTADOR }, select: { id: true } });
      await vincularPessoaAoUsuario(prisma, { usuarioId: u.id, documento: ATESTADORA.cpf, motivo: "Designação para o atesto da folha — dado de demonstração", criadoPor: AUTOR });
      return { estado: "criado", valor: null };
    });
    await passo(`Designação de ${ATESTADOR} para certificar a folha (Portaria 001/2026 — demonstração)`, async () => {
      const u = await prisma.usuario.findUniqueOrThrow({ where: { identificador: ATESTADOR }, select: { id: true } });
      const ja = await prisma.designacaoNaFolha.findFirst({ where: { usuarioId: u.id, atribuicao: "CERTIFICAR_FOLHA", revogacao: null }, select: { id: true } });
      if (ja !== null) return { estado: "existente", valor: null };
      await designarNaFolha(prisma, { atribuicao: "CERTIFICAR_FOLHA", pessoaId: pessoaAtestadora, usuarioIdentificador: ATESTADOR, atoDesignacao: "Portaria 001/2026 — demonstração", vigenciaInicio: D(ADMISSAO), criadoPor: AUTOR });
      return { estado: "criado", valor: null };
    });

    // ── 8. certificar (atestador) e liquidar (liquidante) ──
    await passo(`Certificação da folha ${COMPETENCIA} por ${ATESTADOR}`, async () => {
      const ja = await prisma.certificacaoDaFolha.findFirst({ where: { folhaId, calculoId: fechado, tipo: "CERTIFICACAO" }, select: { id: true } });
      if (ja !== null) return { estado: "existente", valor: null };
      const r = await certificarFolha(prisma, { folhaId, data: D(DATA_DO_ATO), criadoPor: ATESTADOR });
      return { estado: "criado", valor: null, detalhe: `sha256 ${r.sha256.slice(0, 12)}…` };
    });
    await passo(`Liquidação da folha ${COMPETENCIA} por ${LIQUIDANTE}`, async () => {
      const r = await liquidarFolha(prisma, { folhaId, data: D(DATA_DO_ATO), criadoPor: LIQUIDANTE });
      return { estado: r.liquidadas > 0 ? "criado" : "existente", valor: null, detalhe: `${r.liquidadas} liquidada(s), ${r.jaExistiam} já existiam, ${r.pendentes} pendente(s), total ${r.total.toFixed(2)}` };
    });

    // ══ 9. OS ENCARGOS PATRONAIS DA COMPETÊNCIA ═══════════════════════════════════
    await semearEncargos(prisma, folhaId, idDaRubrica.get("VENC") as string);
  } finally {
    await prisma.$disconnect();
  }
}

async function semearEncargos(prisma: PrismaClient, folhaId: string, rubricaVenc: string): Promise<void> {
  // ── 9.1 pré-condições que não se criam aqui (fail-closed) ──
  const natureza = await prisma.naturezaDespesa.findFirst({ where: { codigoCompleto: NATUREZA_ENCARGOS }, select: { id: true } });
  if (natureza === null) throw new Error(`A natureza ${NATUREZA_ENCARGOS} não está no catálogo carregado. Nada foi gravado.`);
  const contas = await prisma.contaPcasp.findMany({ where: { codigo: { in: ["3.1.2.2.3.01.00", "3.1.2.2.3.03.00", CONTA_OBRIGACAO_RGPS] } }, select: { id: true, codigo: true, analitica: true } });
  const conta = (codigo: string): string => {
    const c = contas.find((x) => x.codigo === codigo);
    if (c === undefined || !c.analitica) throw new Error(`A conta ${codigo} precisa existir e ser analítica no PCASP carregado. Nada foi gravado.`);
    return c.id;
  };
  const vpdPatronal = conta("3.1.2.2.3.01.00");
  const vpdRat = conta("3.1.2.2.3.03.00");
  const obrigacaoRgps = conta(CONTA_OBRIGACAO_RGPS);
  const fonte = await prisma.fonteRecurso.findUniqueOrThrow({ where: { codigo: "500" }, select: { id: true } });
  const fichaDoisId = (await prisma.fichaOrcamentaria.findUniqueOrThrow({ where: { exercicio_numero: { exercicio: EXERCICIO, numero: 2 } }, select: { id: true } })).id;

  // ── 9.2 a ficha 104 (nasce sem dotação, como na tela) e o crédito especial que a dota ──
  const fichaId = await passo(`Ficha ${FICHA_ENCARGOS}/${EXERCICIO} Educação — obrigações patronais (${NATUREZA_ENCARGOS})`, async () => {
    const ja = await prisma.fichaOrcamentaria.findUnique({ where: { exercicio_numero: { exercicio: EXERCICIO, numero: FICHA_ENCARGOS } }, select: { id: true, naturezaDespesa: { select: { codigoCompleto: true } } } });
    if (ja !== null) {
      if (ja.naturezaDespesa.codigoCompleto !== NATUREZA_ENCARGOS) throw new Error(`a ficha ${FICHA_ENCARGOS} já existe com a natureza ${ja.naturezaDespesa.codigoCompleto}.`);
      return { estado: "existente", valor: ja.id };
    }
    const id = await criarFicha({
      exercicio: EXERCICIO, numero: FICHA_ENCARGOS, exercicioFonte: 1, valorDotado: "0.00", criadoPor: AUTOR,
      classificacao: { orgao: "01", unidadeOrc: "01001", funcao: "12", subfuncao: "361", programa: "0001", acao: "2001", naturezaDespesa: NATUREZA_ENCARGOS, fonte: "500" },
    }, criarM02Deps(prisma));
    return { estado: "criado", valor: id };
  });
  const m03 = criarM03DepsAmarrado(prisma);
  const leiId = await passo(`Lei de crédito especial nº ${LEI_ENCARGOS.numero}/${EXERCICIO} (R$ ${CREDITO_ENCARGOS}) — demonstração`, async () => {
    const ja = await prisma.leiCredito.findUnique({ where: { ano_numero: { ano: EXERCICIO, numero: LEI_ENCARGOS.numero } }, select: { id: true } });
    if (ja !== null) return { estado: "existente", valor: ja.id };
    const id = await criarLei({ numero: LEI_ENCARGOS.numero, ano: EXERCICIO, tipoCredito: "ESPECIAL", valorAutorizado: CREDITO_ENCARGOS, dataPublicacao: D(LEI_ENCARGOS.data), criadoPor: AUTOR }, m03);
    return { estado: "criado", valor: id };
  });
  const decretoId = await passo(`Decreto nº ${DECRETO_ENCARGOS.numero}/${EXERCICIO} (crédito especial por anulação da ficha 2) — demonstração`, async () => {
    const ja = await prisma.decretoCredito.findUnique({ where: { ano_numero: { ano: EXERCICIO, numero: DECRETO_ENCARGOS.numero } }, select: { id: true } });
    if (ja !== null) return { estado: "existente", valor: ja.id };
    const id = await criarDecreto({ leiId, numero: DECRETO_ENCARGOS.numero, ano: EXERCICIO, data: D(DECRETO_ENCARGOS.data), origemRecurso: "ANULACAO", criadoPor: AUTOR }, m03);
    return { estado: "criado", valor: id };
  });
  await passo(`Movimentos do decreto ${DECRETO_ENCARGOS.numero}/${EXERCICIO} (anula R$ ${CREDITO_ENCARGOS} da ficha 2; abre a ficha ${FICHA_ENCARGOS})`, async () => {
    if ((await prisma.itemCredito.count({ where: { decretoId } })) > 0) return { estado: "existente", valor: null };
    await executarCredito({
      decretoId,
      itens: [
        { fichaId: fichaDoisId, tipo: "ANULACAO", valor: CREDITO_ENCARGOS, fonteId: fonte.id },
        { fichaId, tipo: "SUPLEMENTACAO", valor: CREDITO_ENCARGOS, fonteId: fonte.id },
      ],
      criadoPor: AUTOR,
    }, m03);
    return { estado: "criado", valor: null };
  });

  // ── 9.3 o credor (o regime) ──
  // Sede em Brasília/DF (cadastro do CNPJ no Portal da Transparência, portaldatransparencia.gov.br/pessoa-juridica/29979036000140).
  const credorId = await passo(`Pessoa ${INSS.cnpj} ${INSS.nome}`, async () => {
    const m19 = criarM19Deps(prisma);
    const ja = await m19.pessoas.buscarPorDocumento(INSS.cnpj);
    if (ja !== null) return { estado: "existente", valor: ja.id };
    const { pessoaId } = await cadastrarPessoa({ documento: INSS.cnpj, nome: INSS.nome, municipio: "Brasília", uf: "DF", criadoPor: AUTOR }, m19);
    return { estado: "criado", valor: pessoaId };
  });

  // ── 9.4 componentes e versões (cadastra o admin, aprova outra pessoa) ──
  const COMPONENTES = [
    { codigo: "RGPS-PATRONAL", descricao: "Contribuição patronal ao RGPS (20%)", tipo: "PREVIDENCIA_PATRONAL" as const, aliquota: "0.20", fundamento: FONTE_PATRONAL, sintetica: false, grupo: "ENC-RGPS-PATR", vpd: vpdPatronal, rotuloGrupo: "Contribuição patronal ao RGPS" },
    { codigo: "RGPS-RAT", descricao: "RAT ajustado pelo FAP (2% × 1,0000)", tipo: "RISCO_AMBIENTAL_DO_TRABALHO" as const, aliquota: "0.02", fundamento: FONTE_RAT, sintetica: true, grupo: "ENC-RGPS-RAT", vpd: vpdRat, rotuloGrupo: "RAT (riscos ambientais do trabalho)" },
  ];
  for (const c of COMPONENTES) {
    const componenteId = await passo(`Componente de encargo ${c.codigo}`, async () => {
      const ja = await prisma.componenteDeEncargo.findUnique({ where: { codigo: c.codigo }, select: { id: true } });
      if (ja !== null) return { estado: "existente", valor: ja.id };
      const { componenteId } = await cadastrarComponenteDeEncargo(prisma, { codigo: c.codigo, descricao: c.descricao, tipo: c.tipo, regime: "RGPS", criadoPor: AUTOR });
      return { estado: "criado", valor: componenteId };
    });
    const versaoId = await passo(`Versão de ${c.codigo} desde 2026-01 (${c.aliquota} sobre VENC${c.sintetica ? ", sintética" : ""})`, async () => {
      const ja = await prisma.versaoDoEncargo.findFirst({ where: { componenteId, competenciaInicio: "2026-01" }, select: { id: true } });
      if (ja !== null) return { estado: "existente", valor: ja.id };
      const { versaoId } = await cadastrarVersaoDoEncargo(prisma, { componenteId, competenciaInicio: "2026-01", aliquota: c.aliquota, fundamentacaoLegal: c.fundamento, sintetica: c.sintetica, rubricaIds: [rubricaVenc], criadoPor: AUTOR });
      return { estado: "criado", valor: versaoId };
    });
    await passo(`Aprovação da versão de ${c.codigo} por ${APROVADOR_ENCARGOS}`, async () => {
      if ((await prisma.aprovacaoDoEncargo.findFirst({ where: { versaoId }, select: { id: true } })) !== null) return { estado: "existente", valor: null };
      await aprovarVersaoDoEncargo(prisma, { versaoId, motivo: "alíquota, base e fundamento conferidos — demonstração", criadoPor: APROVADOR_ENCARGOS });
      return { estado: "criado", valor: null };
    });
    await passo(`Grupo de empenho ${c.grupo} (ficha ${FICHA_ENCARGOS}, credor INSS)`, async () => {
      const ja = await prisma.grupoDeEmpenhoDaFolha.findUnique({ where: { codigo: c.grupo }, select: { id: true } });
      if (ja !== null) return { estado: "existente", valor: ja.id };
      const { grupoId } = await cadastrarGrupoDosEncargos(prisma, {
        codigo: c.grupo, descricao: c.rotuloGrupo, fichaId, serie: "FE", credorId, tipoEmpenho: "ORDINARIO", categoriaOrdemCronologica: "PRESTACAO_SERVICOS",
        contaVariacaoId: c.vpd, contaObrigacaoId: obrigacaoRgps, componenteIds: [componenteId], criadoPor: AUTOR,
      });
      return { estado: "criado", valor: grupoId };
    });
  }

  // ── 9.5 apurar (admin), designar e certificar (atestador), empenhar (admin), liquidar (liquidante) ──
  await passo(`Apuração dos encargos de ${COMPETENCIA}`, async () => {
    const ja = await prisma.apuracaoDeEncargos.findFirst({ where: { folhaId }, orderBy: { numero: "desc" }, select: { numero: true, total: true } });
    if (ja !== null) return { estado: "existente", valor: null, detalhe: `nº ${ja.numero}, total ${ja.total.toFixed(2)}` };
    const r = await apurarEncargosDaFolha(prisma, { folhaId, motivo: "encargos patronais da folha da demonstração", criadoPor: AUTOR });
    return { estado: "criado", valor: null, detalhe: `nº ${r.numero}, completa ${r.completa}, total ${r.total.toFixed(2)} [${r.porComponente.map((p) => `${p.codigo} ${p.total}`).join("; ")}]` };
  });
  const pessoaAtestadora = await pessoaPorCpf(prisma, ATESTADORA.cpf, ATESTADORA.nome);
  await passo(`Designação de ${ATESTADOR} para certificar os encargos (Portaria 001/2026 — demonstração)`, async () => {
    const u = await prisma.usuario.findUniqueOrThrow({ where: { identificador: ATESTADOR }, select: { id: true } });
    const ja = await prisma.designacaoNaFolha.findFirst({ where: { usuarioId: u.id, atribuicao: "CERTIFICAR_ENCARGOS_DA_FOLHA", revogacao: null }, select: { id: true } });
    if (ja !== null) return { estado: "existente", valor: null };
    await designarNaFolha(prisma, { atribuicao: "CERTIFICAR_ENCARGOS_DA_FOLHA", pessoaId: pessoaAtestadora, usuarioIdentificador: ATESTADOR, atoDesignacao: "Portaria 001/2026 — demonstração", vigenciaInicio: D(ADMISSAO), criadoPor: AUTOR });
    return { estado: "criado", valor: null };
  });
  await passo(`Certificação dos encargos de ${COMPETENCIA} por ${ATESTADOR}`, async () => {
    const ja = await prisma.certificacaoDosEncargos.findFirst({ where: { apuracao: { folhaId }, tipo: "CERTIFICACAO" }, select: { id: true } });
    if (ja !== null) return { estado: "existente", valor: null };
    const r = await certificarEncargosDaFolha(prisma, { folhaId, data: D(DATA_DO_ATO), criadoPor: ATESTADOR });
    return { estado: "criado", valor: null, detalhe: `apuração nº ${r.numero}, sha256 ${r.sha256.slice(0, 12)}…` };
  });
  // O empenho e a liquidação dos encargos RECUSAM a repetição (ENCARGOS-JA-EMPENHADOS), em vez de
  // devolver "já existia" como os da folha salarial: a chave natural se confere aqui antes.
  const gruposDosEncargos = COMPONENTES.map((c) => c.grupo);
  await passo(`Empenho dos encargos de ${COMPETENCIA} (em ${DATA_DO_ATO})`, async () => {
    const ultima = await prisma.apuracaoDeEncargos.findFirst({ where: { folhaId }, orderBy: { numero: "desc" }, select: { id: true } });
    const feitos = ultima === null ? 0 : await prisma.empenhoDosEncargos.count({ where: { apuracaoId: ultima.id, grupo: { codigo: { in: gruposDosEncargos } } } });
    if (feitos === gruposDosEncargos.length) return { estado: "existente", valor: null, detalhe: `${feitos} empenho(s) da apuração vigente` };
    const r = await apropriarEncargosDaFolha(prisma, { folhaId, dataDoEmpenho: D(DATA_DO_ATO), criadoPor: AUTOR });
    return { estado: r.empenhados > 0 ? "criado" : "existente", valor: null, detalhe: `${r.empenhados} empenhado(s), ${r.jaExistiam} já existiam, total ${r.total.toFixed(2)} [${r.porGrupo.map((g) => `${g.codigo} ${g.pedido}`).join("; ")}]` };
  });
  await passo(`Liquidação dos encargos de ${COMPETENCIA} por ${LIQUIDANTE}`, async () => {
    const empenhos = await prisma.empenhoDosEncargos.findMany({ where: { apuracao: { folhaId }, grupo: { codigo: { in: gruposDosEncargos } } }, select: { liquidacao: { select: { id: true } } } });
    if (empenhos.length > 0 && empenhos.every((e) => e.liquidacao !== null)) return { estado: "existente", valor: null, detalhe: `${empenhos.length} liquidação(ões)` };
    const r = await liquidarEncargosDaFolha(prisma, { folhaId, data: D(DATA_DO_ATO), criadoPor: LIQUIDANTE });
    return { estado: r.liquidadas > 0 ? "criado" : "existente", valor: null, detalhe: `${r.liquidadas} liquidada(s), ${r.jaExistiam} já existiam, ${r.pendentes} pendente(s), total ${r.total.toFixed(2)}` };
  });
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
