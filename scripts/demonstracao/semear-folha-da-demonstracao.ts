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
import { meioDiaCivil } from "../../packages/datas/index.js";
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
 * Idempotente: cada item é procurado pela chave natural antes de ser criado; o cálculo só roda se
 * a folha não tem cálculo vivo nem fechamento; apropriar e liquidar são idempotentes por si.
 * Recusa rodar fora do banco gestao_publica_local.
 *
 * Uso: npx tsx scripts/demonstracao/semear-folha-da-demonstracao.ts
 */

const BANCO_PERMITIDO = "gestao_publica_local";
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

const FONTE_IRRF =
  "Lei 15.191/2025 (tabela progressiva mensal, dedução por dependente, desconto simplificado e parcela isenta 65+) " +
  "e Lei 15.270/2025 (redução do imposto) — Receita Federal, " +
  "https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026";
const FONTE_RGPS =
  "Portaria Interministerial MPS/MF nº 13, de 9 de janeiro de 2026 — tabela de contribuição do segurado empregado, " +
  "https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal";
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
  if (nome !== BANCO_PERMITIDO) {
    throw new Error(`Recusado: este script só semeia o banco "${BANCO_PERMITIDO}", e o DATABASE_URL aponta para "${nome}". Nada foi gravado.`);
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
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
