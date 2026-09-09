import "dotenv/config";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import { registrarMovimentoDotacao } from "../../modules/m05-despesa/dotacao-razao.js";
import { recalcularCache } from "../../modules/m05-despesa/adapter-prisma.js";

/**
 * O CENÁRIO DE ACEITE — só os CADASTROS. A execução é da TELA.
 *
 * ═══ ⚠️ A DIVISÃO É O PONTO DESTE ARQUIVO ═══
 * Este seed cria o que existe ANTES de alguém executar despesa: exercício aberto, órgão,
 * unidade, programa, ação, fonte, conta bancária e uma ficha com R$ 10.000,00 de dotação.
 * Ele **NÃO** empenha, não liquida e não paga.
 *
 * E não pode. O gate do lote pede que a cadeia atravesse **pela interface**; um seed que
 * já deixasse o empenho pronto transformaria o smoke numa conferência de leitura, e a
 * pergunta que importa — "o formulário grava mesmo?" — ficaria sem resposta. Quem empenha,
 * liquida e paga é `scripts/smoke-cadeia-despesa.ts`, pelo navegador.
 *
 * ═══ IDEMPOTENTE, E NÃO DESTRUTIVO ═══
 * Tudo por `upsert` com id fixo. Ele NÃO apaga nada e NÃO limpa o banco: rodar duas vezes
 * deixa o mesmo estado. A ficha, se já existir com dotação, é deixada como está — refazer
 * a DOTACAO_INICIAL criaria uma segunda perna no razão para a mesma LOA.
 *
 * Uso: npm run seed:cenario-aceite
 */

const DATABASE_URL = process.env["DATABASE_URL"];
if (DATABASE_URL === undefined) {
  throw new Error("DATABASE_URL não definida — veja .env.example.");
}

const prisma = criarPrismaClient(DATABASE_URL);

/**
 * ⚠️ A IDENTIDADE NÃO PODE SER INVENTADA — e este seed NÃO LÊ A TABELA DE USUÁRIOS.
 *
 * ═══ AS DUAS COISAS QUE ENSINARAM ESTE TRECHO ═══
 * (1) A primeira versão gravava a dotação com `criadoPor: "LOA"` e caiu com *"USUÁRIO NÃO
 *     CADASTRADO"* — corretamente. Todo fato do razão carrega a identidade de quem o
 *     criou, e essa identidade tem de existir: uma string livre é um nome que ninguém
 *     pode cobrar depois.
 *
 * (2) A segunda versão consertava isso lendo o primeiro usuário ativo do banco — e o
 *     grep-teste do M16 (`m16-rollout.test.ts`, t5) a reprovou por tocar na TABELA DE
 *     USUÁRIOS dentro de `prisma/seed/`. O guard existe porque um seed que mexe
 *     em usuário é o caminho pelo qual um superusuário vaza para um banco de produção, e
 *     ele é TEXTUAL de propósito: abrir exceção para uma leitura abriria a porta para uma
 *     escrita no mesmo arquivo, amanhã, sem ninguém notar.
 *
 * Então o seed NÃO consulta e NÃO escolhe: ele exige que quem executa se identifique, e
 * deixa a validação com quem já é dona dela — o funil do M16, dentro da transação. Se a
 * identidade não existir ou estiver inativa, a gravação inteira cai com a mensagem que o
 * domínio escreveu. Uma checagem aqui seria a segunda verdade sobre "quem pode assinar".
 */
const POR = (process.env["SEED_IDENTIDADE"] ?? "").trim();
if (POR === "") {
  throw new Error(
    "SEED_IDENTIDADE não definida. A dotação da LOA é um fato do razão e precisa de AUTOR " +
      "— um usuário que exista e esteja ativo. Ex.: SEED_IDENTIDADE=fulano@cg.pb.gov.br " +
      "npm run seed:cenario-aceite. (Se o banco ainda não tem ninguém: npm run seed:bootstrap.)"
  );
}
const EXERCICIO = 2026;
/** Os números do §2.4. Dotação folgada de propósito: o teto não é o assunto aqui. */
const DOTACAO = "10000.00";

const ORGAO = { id: "ac-org", codigo: "01", nome: "Prefeitura Municipal" };
const UNIDADE = { id: "ac-uo", codigo: "01001", descricao: "Secretaria de Administracao" };
const PROGRAMA = { id: "ac-prg", codigo: "0001", descricao: "Gestao Administrativa" };
const ACAO = { id: "ac-aca", codigo: "2001", descricao: "Manutencao dos Servicos Administrativos" };
const FONTE = { id: "ac-fnt", codigo: "500", descricao: "Recursos nao vinculados de impostos" };
const CONTA_BANCARIA = { id: "ac-cb", codigo: "CC-500-01", descricao: "Conta movimento - fonte 500" };
const FICHA_ID = "ac-ficha";
const FICHA_NUMERO = 1;

/**
 * A SEGUNDA FICHA — orçamento de REEXECUÇÃO, e ela existe por um motivo medido.
 *
 * A ficha do cenário tem exatamente os 10.000,00 do §2.4, e cada execução do smoke da
 * cadeia consome 1.000,00 dela. Na décima primeira, o domínio recusa o empenho por saldo
 * insuficiente — corretamente, e foi o que aconteceu aqui.
 *
 * A saída ERRADA seria inflar a ficha do cenário: os 10.000,00 são o número que a
 * especificação fixou, e mexer nele para caber mais teste é adulterar o cenário. A outra
 * saída errada seria o seed "repor" a dotação — repor dotação é CRÉDITO ADICIONAL, ato do
 * M03 com lei ou decreto, não efeito colateral de seed.
 *
 * Então há uma segunda ficha, declarada como o que é: orçamento de desenvolvimento para
 * reexecutar o smoke. O smoke escolhe a de maior saldo; a do cenário fica intacta para
 * quem quiser conferi-la.
 */
const FICHA_REEXECUCAO_ID = "ac-ficha-reexec";
const FICHA_REEXECUCAO_NUMERO = 2;
const DOTACAO_REEXECUCAO = "500000.00";

/**
 * ⚠️ ELEMENTO 39 (serviços de terceiros PJ), e a escolha NÃO é arbitrária.
 * O elemento 30 (material) cai na recusa nomeada `LiquidacaoDeMaterialBloqueadaError`:
 * material vira ESTOQUE, e a entrada no almoxarifado é ato do M10 que a tela de
 * liquidação ainda não faz. Semear a ficha no 30 daria um cenário que trava no meio, por
 * um limite conhecido — e o smoke acusaria como falha o que é pendência declarada.
 */
const ELEMENTO = "339039";

// ⚠️ O ROTEIRO ORÇAMENTÁRIO É PRÉ-REQUISITO, e tem seed PRÓPRIO (`npm run seed:roteiro-orc`).
// Repeti-lo aqui criaria a segunda definição de "qual conta é o crédito disponível".
const roteiros = await prisma.roteiroOrcamentario.count();
if (roteiros === 0) {
  throw new Error(
    "Nenhum RoteiroOrcamentario cadastrado — sem ele a ficha não nasce (o movimento de " +
      "dotação lança no razão, e o lançamento é fail-closed). Rode antes: npm run seed:roteiro-orc."
  );
}

// M08: ficha só existe dentro de um exercício ABERTO.
await prisma.exercicio.upsert({
  where: { ano: EXERCICIO },
  update: {},
  create: { ano: EXERCICIO, criadoPor: POR },
});

await prisma.orgao.upsert({
  where: { codigo: ORGAO.codigo },
  update: { nome: ORGAO.nome },
  create: ORGAO,
});
await prisma.unidadeOrcamentaria.upsert({
  where: { codigo: UNIDADE.codigo },
  update: { descricao: UNIDADE.descricao },
  create: { ...UNIDADE, orgaoId: ORGAO.id },
});
await prisma.programa.upsert({
  where: { codigo: PROGRAMA.codigo },
  update: { descricao: PROGRAMA.descricao },
  create: PROGRAMA,
});
await prisma.acao.upsert({
  where: { codigo: ACAO.codigo },
  update: { descricao: ACAO.descricao },
  create: { ...ACAO, tipo: "ATIVIDADE" },
});
await prisma.fonteRecurso.upsert({
  where: { codigo: FONTE.codigo },
  update: { descricao: FONTE.descricao },
  create: { ...FONTE, codigoTce: FONTE.codigo },
});
await prisma.contaBancaria.upsert({
  where: { codigo: CONTA_BANCARIA.codigo },
  update: { descricao: CONTA_BANCARIA.descricao },
  create: { ...CONTA_BANCARIA, fonteId: FONTE.id },
});

const funcao = await prisma.funcao.findUniqueOrThrow({ where: { codigo: "04" }, select: { id: true } });
const subfuncao = await prisma.subfuncao.findUniqueOrThrow({ where: { codigo: "122" }, select: { id: true } });
const natureza = await prisma.naturezaDespesa.findUniqueOrThrow({
  where: { codigoCompleto: ELEMENTO },
  select: { id: true },
});

const jaExiste = await prisma.fichaOrcamentaria.findUnique({
  where: { id: FICHA_ID },
  select: { id: true, saldoDisponivel: true },
});

if (jaExiste === null) {
  // ⚠️ FICHA E DOTACAO_INICIAL NA MESMA TRANSAÇÃO. Uma ficha sem a perna da dotação é
  // órfã: o cache dela mostraria zero disponível e o razão nunca teria recebido o
  // crédito. O `garantirDotacaoInicial` do M05 recusa essa ficha, e com razão.
  await prisma.$transaction(async (tx) => {
    await tx.fichaOrcamentaria.create({
      data: {
        id: FICHA_ID,
        exercicio: EXERCICIO,
        numero: FICHA_NUMERO,
        orgaoId: ORGAO.id,
        unidadeOrcId: UNIDADE.id,
        funcaoId: funcao.id,
        subfuncaoId: subfuncao.id,
        programaId: PROGRAMA.id,
        acaoId: ACAO.id,
        naturezaDespesaId: natureza.id,
        fonteId: FONTE.id,
        exercicioFonte: 1,
        valorDotado: DOTACAO,
      },
    });
    await registrarMovimentoDotacao(tx, {
      fichaId: FICHA_ID,
      tipo: "DOTACAO_INICIAL",
      valor: DOTACAO,
      origemTipo: "LOA",
      origemId: FICHA_ID,
      criadoPor: POR,
      data: new Date(Date.UTC(EXERCICIO, 0, 1, 12, 0, 0)),
      historico: `Dotação inicial da ficha ${FICHA_NUMERO} (LOA ${EXERCICIO})`,
    });
    await recalcularCache(tx, FICHA_ID);
  });
}

// A ficha de reexecução — mesma classificação, orçamento próprio e declarado.
const reexecucaoExiste = await prisma.fichaOrcamentaria.findUnique({
  where: { id: FICHA_REEXECUCAO_ID },
  select: { id: true },
});
if (reexecucaoExiste === null) {
  await prisma.$transaction(async (tx) => {
    await tx.fichaOrcamentaria.create({
      data: {
        id: FICHA_REEXECUCAO_ID,
        exercicio: EXERCICIO,
        numero: FICHA_REEXECUCAO_NUMERO,
        orgaoId: ORGAO.id,
        unidadeOrcId: UNIDADE.id,
        funcaoId: funcao.id,
        subfuncaoId: subfuncao.id,
        programaId: PROGRAMA.id,
        acaoId: ACAO.id,
        naturezaDespesaId: natureza.id,
        fonteId: FONTE.id,
        // ⚠️ `exercicioFonte: 2` só para não colidir com a unicidade SAGRES da ficha 1
        // (mesma unidade, função, subfunção, programa, ação, natureza e fonte).
        exercicioFonte: 2,
        valorDotado: DOTACAO_REEXECUCAO,
      },
    });
    await registrarMovimentoDotacao(tx, {
      fichaId: FICHA_REEXECUCAO_ID,
      tipo: "DOTACAO_INICIAL",
      valor: DOTACAO_REEXECUCAO,
      origemTipo: "LOA",
      origemId: FICHA_REEXECUCAO_ID,
      criadoPor: POR,
      data: new Date(Date.UTC(EXERCICIO, 0, 1, 12, 0, 0)),
      historico: `Dotação inicial da ficha ${FICHA_REEXECUCAO_NUMERO} (orçamento de reexecução do smoke)`,
    });
    await recalcularCache(tx, FICHA_REEXECUCAO_ID);
  });
}

const reexecucao = await prisma.fichaOrcamentaria.findUniqueOrThrow({
  where: { id: FICHA_REEXECUCAO_ID },
  select: { numero: true, saldoDisponivel: true },
});

const ficha = await prisma.fichaOrcamentaria.findUniqueOrThrow({
  where: { id: FICHA_ID },
  select: { numero: true, saldoDisponivel: true, saldoEmpenhado: true },
});

const semConta = await prisma.tipoConsignacao.count({ where: { contaPassivoId: null } });

console.log(`CENÁRIO DE ACEITE — cadastros prontos (exercício ${EXERCICIO}):\n`);
console.log(`  ficha ${ficha.numero}  ${UNIDADE.codigo} ${UNIDADE.descricao}`);
console.log(`  elemento ${ELEMENTO} · fonte ${FONTE.codigo} · conta ${CONTA_BANCARIA.codigo}`);
console.log(`  dotado ${DOTACAO} · empenhado ${ficha.saldoEmpenhado.toFixed(2)} · disponível ${ficha.saldoDisponivel.toFixed(2)}`);
console.log(
  `  tipos de consignação sem conta de passivo: ${semConta}` +
    (semConta > 0 ? "  <- estes NÃO aparecem disponíveis para retenção (npm run seed:m07)" : "")
);
/*
  ⚠️ A DOTAÇÃO NÃO SE RECARREGA RODANDO O SEED DE NOVO — e ela não deveria.
  Cada execução do smoke consome 1.000,00 desta ficha, e o seed é idempotente: ele não
  acrescenta crédito. Repor dotação seria CRÉDITO ADICIONAL, que é ato do M03 (lei ou
  decreto), não efeito colateral de um seed. Quando o saldo acabar, o domínio recusa o
  empenho com a mensagem dele — que é a resposta certa, e não um defeito do smoke.
*/
console.log(
  `  ficha ${reexecucao.numero} (reexecução do smoke) · disponível ${reexecucao.saldoDisponivel.toFixed(2)}`
);
const cabem = Math.floor(Number(reexecucao.saldoDisponivel.toFixed(2)) / 1000);
console.log(
  `  cabem ~${cabem} execução(ões) do smoke na ficha de reexecução` +
    (cabem === 0
      ? "  <- esgotada: o próximo empenho será recusado pelo domínio, corretamente"
      : "")
);
console.log(
  `\n  ⚠️ NADA foi empenhado, liquidado nem pago aqui — de propósito. A cadeia atravessa ` +
    `pela\n     interface: npm run smoke:cadeia`
);

await prisma.$disconnect();
