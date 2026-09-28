import "dotenv/config";
import { execFileSync } from "node:child_process";
import { Client } from "pg";
import { alvoDoBanco, mesmoAlvo } from "../test/db-teste.js";

/**
 * O BANCO DOS PERCURSOS DE NAVEGADOR — separado do de desenvolvimento e do de testes
 * (orquestração V3, 4.4).
 *
 * ═══ POR QUE UM TERCEIRO BANCO ═══
 * Os percursos (`scripts/smoke-*.ts`) entram pela tela e GRAVAM: roteiros, bens,
 * empenhos, perfis. Até aqui gravavam no banco do DESENVOLVEDOR — e foi assim que três
 * roteiros contábeis instrumentais (as "duas primeiras analíticas" que um percurso
 * escolheu para exercitar a mecânica) ficaram disponíveis como configuração operacional,
 * com quatro movimentos e quatro lançamentos por cima. A suíte de integração já tem o
 * banco dela (`DATABASE_URL_TEST`, truncado a cada teste); os percursos ganham o deles
 * (`DATABASE_URL_PERCURSOS`), povoado por uma sequência DECLARADA de seeds, e o servidor
 * dos percursos sobe apontando para ele (`npm run percursos:servir`).
 *
 * ═══ O QUE ESTE SCRIPT FAZ ═══
 *   1. recusa se `DATABASE_URL_PERCURSOS` faltar ou coincidir com o de dev ou de teste;
 *   2. cria o database se não existir;
 *   3. migrations, SQL manual e papel de runtime — os mesmos passos de qualquer instalação;
 *   4. os seeds, na ordem que uma instalação usa, mais os de cenário dos percursos, todos
 *      com `DATABASE_URL` apontado para o banco dos percursos e o autor em `SEED_IDENTIDADE`;
 *   5. as atualizações versionadas de permissões (v1 a v8) e a configuração de
 *      DEMONSTRAÇÃO dos roteiros (`seed:roteiros-demo`) — identificada como tal.
 *
 * ⚠️ ELE NÃO TOCA NO BANCO DE DESENVOLVIMENTO. Fixture isolada não é proibida; confundir
 * fixture com configuração de produção é — e é isso que a separação impede.
 *
 * Uso:  npm run percursos:preparar
 *       npm run percursos:servir          (next start -p 3010 sobre o banco dos percursos)
 */
const dev = process.env["DATABASE_URL"] ?? "";
const teste = process.env["DATABASE_URL_TEST"] ?? "";
const percursos = process.env["DATABASE_URL_PERCURSOS"] ?? "";
const senhaAdmin = process.env["SEED_ADMIN_SENHA"] ?? "";

if (percursos.trim() === "") {
  throw new Error(
    "DATABASE_URL_PERCURSOS não definida. Os percursos de navegador precisam de um banco SÓ " +
      "deles — ver .env.example. Nada foi feito."
  );
}
for (const [nome, outra] of [["DATABASE_URL", dev], ["DATABASE_URL_TEST", teste]] as const) {
  if (outra !== "" && mesmoAlvo(percursos, outra)) {
    throw new Error(
      `DATABASE_URL_PERCURSOS aponta para o MESMO banco que ${nome}. Os percursos gravam pela ` +
        `tela; num banco compartilhado eles deixam configuração instrumental como se fosse ` +
        `operacional. Aponte para um database próprio. Nada foi feito.`
    );
  }
}
if (senhaAdmin === "") throw new Error("SEED_ADMIN_SENHA ausente — o bootstrap do banco dos percursos precisa dela.");

/**
 * ⚠️ O LICENCIAMENTO É PASSO DESTA INSTALAÇÃO, E A PRÉ-CONDIÇÃO SE CONFERE AGORA (V11 V9.2).
 *
 * O QUE FALTAVA, MEDIDO EM 24/09/2026. Este preparador montava um banco completo — 7.864 contas,
 * 25 usuários, permissões v1 a v28 — e o servidor subia, servia `/login`, autenticava, e então a
 * home estourava com `LicenciamentoNaoInstaladoError` (digest 2220877542). O gate do M35 é
 * fail-closed e estava CERTO; o que estava errado era esta sequência, que nunca registrava
 * contrato. Quem preparasse o banco dos percursos ganhava um sistema onde toda tela autenticada
 * respondia 500, e o sintoma ("application error") manda procurar o defeito na tela.
 *
 * ⚠️ E O NÚMERO DO CONTRATO NÃO MORA NESTE ARQUIVO, DE PROPÓSITO. Cravar um número aqui faria um
 * script versionado carregar um instrumento comercial que não se confere contra documento nenhum —
 * e um valor padrão viraria o contrato de toda instalação que esquecesse de declarar o seu. Vêm do
 * ambiente, e sem eles a preparação PARA.
 *
 * ⚠️ E A CONFERÊNCIA É AQUI, ANTES DO PRIMEIRO `CREATE DATABASE`. A regra do repositório é que
 * efeito colateral antes da guarda envenena a tentativa seguinte: descobrir a falta no vigésimo
 * passo deixa um banco meio povoado para trás e cobra a corrida inteira de novo.
 */
const licencaNumero = process.env["LICENCA_NUMERO"] ?? "";
const licencaCliente = process.env["LICENCA_CLIENTE"] ?? "";
if (licencaNumero.trim() === "" || licencaCliente.trim() === "") {
  throw new Error(
    "LICENCA_NUMERO e LICENCA_CLIENTE são obrigatórias para preparar o banco dos percursos. O gate " +
      "comercial é fail-closed: sem contrato registrado nenhum módulo opera, e toda tela autenticada " +
      "responde 500. Declare as duas no ambiente — são de DEMONSTRAÇÃO, e o contrato é gravado como " +
      "tal. Não há valor padrão neste script de propósito. Nada foi feito."
  );
}

const alvo = alvoDoBanco(percursos);
const ADMIN = "admin@cg.pb.gov.br";

// (2) o database
{
  const admin = new URL(percursos);
  admin.pathname = "/postgres";
  admin.search = "";
  const c = new Client({ connectionString: admin.toString() });
  await c.connect();
  try {
    const existe = await c.query("SELECT 1 FROM pg_database WHERE datname = $1", [alvo.database]);
    if (existe.rowCount === 0) {
      if (!/^[a-zA-Z0-9_]+$/.test(alvo.database)) throw new Error(`Nome de database inseguro: "${alvo.database}".`);
      await c.query(`CREATE DATABASE "${alvo.database}"`);
      console.log(`[percursos] database "${alvo.database}" criado.`);
    } else {
      console.log(`[percursos] database "${alvo.database}" já existe — seeds idempotentes serão reaplicados.`);
    }
  } finally {
    await c.end();
  }
}

const env = { ...process.env, DATABASE_URL: percursos, SEED_IDENTIDADE: ADMIN };
/**
 * Roda um passo e ECOA a saída. A tolerância lê a saída CAPTURADA (stdout + stderr): com
 * `stdio: "inherit"` o erro do filho chega sem texto ("Command failed"), e a primeira
 * versão disto não reconhecia o "BOOTSTRAP RECUSADO" que ela mesma esperava tolerar.
 */
function rodar(rotulo: string, comando: string, args: readonly string[], tolerar?: RegExp): void {
  console.log(`\n[percursos] ${rotulo}`);
  try {
    const saida = execFileSync(comando, [...args], { env, stdio: ["inherit", "pipe", "pipe"], encoding: "utf8" });
    if (saida.trim() !== "") console.log(saida.trimEnd());
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message: string };
    const texto = `${err.stdout ?? ""}\n${err.stderr ?? ""}`;
    if (texto.trim() !== "") console.log(texto.trimEnd());
    if (tolerar !== undefined && tolerar.test(texto)) {
      // ⚠️ "já feito" ERA MENTIRA PARA DOIS DOS TRÊS CASOS (V11 V6.1). O bootstrap recusado de fato
      // já estava feito; a POC do SAGRES e os roteiros de demonstração NÃO foram feitos — eles
      // foram PULADOS por conta sintética, e o motivo está na saída logo acima. Chamar os três de
      // "já feito" é a papelada dizendo uma coisa e o efeito sendo outra.
      console.log(`[percursos] ${rotulo}: TOLERADO — o motivo está na saída acima.`);
      return;
    }
    throw new Error(`[percursos] o passo "${rotulo}" falhou — veja a saída acima.`);
  }
}

// (3) a instalação
rodar("migrations", "npx", ["prisma", "migrate", "deploy"]);
rodar("SQL manual", "npx", ["tsx", "scripts/aplicar-sql-manual.ts"]);
rodar("papel de runtime", "npx", ["tsx", "scripts/provisionar-papel-runtime.ts", percursos]);

// (4) os seeds, na ordem de uma instalação — depois os cenários dos percursos
// ⚠️ O PLANO OFICIAL (7.864 contas do TCE-PB), e não o mínimo de `pcasp.ts`: os roteiros da
// dívida ativa e a configuração de demonstração citam contas pelo código oficial, e a
// primeira execução deste preparador parou exatamente aí — "contas do PCASP ausentes".
rodar("plano de contas OFICIAL (PCASP TCE-PB)", "npx", ["tsx", "prisma/seed/pcasp-oficial.ts"]);
rodar("classificações oficiais (M02)", "npx", ["tsx", "prisma/seed/m02-seed-oficial.ts"]);
// ⚠️ DEPOIS do plano oficial, e a ordem é dependência real: este seed DERIVA as linhas do Anexo 14
// e do Anexo 15 das contas de nível 2 do plano oficial, e RECUSA se o plano não estiver carregado.
// Sem ele, o Balanço Patrimonial e a DVP dizem "mapeamento não configurado" — que é o comportamento
// correto, e não um demonstrativo zerado, mas não é um sistema apresentável.
rodar("mapeamento dos Anexos 14 e 15 (derivado do plano oficial)", "npx", [
  "tsx",
  "prisma/seed/m12-linhas-demonstrativos.ts",
]);
rodar("roteiro orçamentário", "npx", ["tsx", "prisma/seed/roteiro-orcamentario.ts"]);
rodar("tipos de consignação (M07)", "npx", ["tsx", "prisma/seed/m07-tipos-consignacao.ts"]);
rodar("exercício 2026", "npx", ["tsx", "prisma/seed/m08-exercicio.ts", "2026"]);
// ⚠️ O BOOTSTRAP RECUSA BANCO POVOADO — na reexecução ele falha nomeando, e isso é o
// comportamento certo; aqui a recusa é tolerada porque o admin já existe.
rodar("bootstrap do administrador", "npx", ["tsx", "prisma/seed/bootstrap-usuario.ts"], /BOOTSTRAP RECUSADO/);
rodar("cenário de aceite (ficha e dotação)", "npx", ["tsx", "prisma/seed/cenario-aceite.ts"]);
// ⚠️ A TOLERÂNCIA GENÉRICA SAIU (V11 V6.2), E O QUE FICOU DIZ EXATAMENTE O QUE FALTA. Na V6.1
// este passo tolerava QUALQUER "Conta sintética não recebe partida" — uma rede que pegava
// defeito de digitação junto com decisão pendente. `SAGRES-POC-CONTA-SINTETICA` foi RESOLVIDA
// (a POC desceu para `2.1.3.1.1.01.01` FORNECEDORES NÃO PARCELADOS A PAGAR).
//
// ⚠️ A TOLERÂNCIA ENCOLHEU DE NOVO (V11 V7.1), E O QUE ELA DIZ MUDOU DE FATO.
// `ROTEIRO-CREDITO-ADICIONAL-POR-TIPO` foi RESOLVIDA: `RoteiroOrcamentario` passou a ser
// chaveado pelo par (movimento, tipo de crédito), e o crédito adicional SUPLEMENTAR — o caso
// comum de um município — entra na analítica do plano (`5.2.2.1.2.01.00`). MEDIDO nesta
// instalação: a POC atravessa `executarCredito` e agora para UM passo adiante.
//
// ⚠️ O QUE SOBRA É A OUTRA PERNA. A POC abre o crédito por REMANEJAMENTO (origem ANULACAO):
// suplementa 5k e anula 5k. A perna de ANULAÇÃO continua sem roteiro porque no plano a
// redução de dotação não mora em `5.2.2.1.2`, e as duas candidatas têm o nome IDÊNTICO —
// `5.2.2.1.3.09.00` e `5.2.2.1.9.04.00`, ambas "(-) CANCELAMENTO DE DOTAÇÕES", em ramos
// diferentes. Pendência `ANULACAO-DE-DOTACAO-DOIS-CANCELAMENTOS-HOMONIMOS`.
//
// Portanto, e isto vai no relatório em vez de ficar aqui embaixo: **instalação limpa faz
// crédito adicional SUPLEMENTAR por recurso novo (superávit, excesso de arrecadação, operação
// de crédito) e NÃO faz crédito por anulação** — nem especial nem extraordinário, que esperam
// o fato "aberto ou reaberto" (`CREDITO-ESPECIAL-ABERTO-OU-REABERTO`).
rodar(
  "cenário SAGRES (UG 99001)",
  "npx",
  ["tsx", "prisma/seed/sagres-poc.ts"],
  /posição \d+ da fila|Conta SINTÉTICA 5\.2\.2\.1\.2\.00\.00 no roteiro orçamentário de ANULACAO_CREDITO/
);
/**
 * ⚠️ OS DOIS SEEDS QUE FALTAVAM NESTA SEQUÊNCIA, E O CONFERIDOR PRÉ-APRESENTAÇÃO ACHOU (V19).
 *
 * `npm run poc:conferir` reprovou o banco montado por este script em dois pontos do BLOCO 1 — "CMD
 * vigente com cotas > 0: NENHUMA versão" e "fila do art. 141 com saldo a pagar: FILA VAZIA" — e os
 * dois já tinham seed pronto, fora desta lista: `poc-programacao.ts` (a previsão da receita mais o
 * cronograma e as metas propostos dela) e `poc-fila.ts` (uma despesa liquidada e NÃO paga, sem a
 * qual a ordem cronológica não tem o que ordenar, porque a massa principal paga tudo o que liquida).
 *
 * Eles vêm DEPOIS da massa principal de propósito: os dois rodam SOBRE ela, com guarda própria.
 */
rodar("previsão da receita e programação financeira (CMD/MBA da LOA)", "npx", [
  "tsx",
  "prisma/seed/poc-programacao.ts",
]);
rodar("fila da ordem cronológica (despesa liquidada e não paga)", "npx", ["tsx", "prisma/seed/poc-fila.ts"]);
rodar("operador restrito (percurso de dois atores)", "npx", ["tsx", "scripts/poc-usuario-restrito.ts"]);
// V6 P1.3 — quatro usuários por papel (compras, almoxarifado, contabilidade, tesouraria): nunca o admin em todos os passos.
rodar("usuários por papel (cadeia por papel)", "npx", ["tsx", "scripts/percursos-usuarios-por-papel.ts"]);
rodar("roteiros da dívida ativa (fonte com motivo)", "npx", ["tsx", "prisma/seed/roteiros-patrimoniais.ts"]);
// V4 (§10): o percurso do ENT02 (protocolo) precisa dos assuntos, setores e tipos de comunicado; o seed
// é idempotente por recusa nomeada (reusa o que já existe).
rodar("cenário do ENT02 (protocolo, comunicação, suporte)", "npx", ["tsx", "prisma/seed/cenario-ent02.ts"]);

// (5) permissões versionadas e a configuração de DEMONSTRAÇÃO dos roteiros
rodar("versionar roteiros existentes", "npx", ["tsx", "scripts/versionar-roteiros-existentes.ts"]);
/**
 * ⚠️ AS ATUALIZAÇÕES VÊM DO REGISTRO, EM UMA CHAMADA — NÃO DE UMA LISTA ESCRITA AQUI.
 *
 * Até 15/09/2026 este trecho ENUMERAVA as versões: `v1` a `v12`, doze linhas escritas à mão. O
 * registro, nesse dia, já tinha VINTE E DUAS — a ponte contratual (v19), a planilha (v20), os tipos
 * de ocorrência (v21) e o cadastro imobiliário (v22) entre elas. Quem preparasse o banco dos
 * percursos ganhava um sistema onde a agenda, a medição pela planilha e o cadastro de imóveis
 * existiam no código e **ninguém tinha permissão para usá-los** — e o sintoma seria "a tela não
 * abre", que manda procurar o defeito na tela.
 *
 * É a regra "propriedade, não padrão" do repositório: uma lista escrita à mão acha só o que estava
 * escrito nela no dia em que foi escrita.
 *
 * ⚠️ E O MODO É `pendentes`, O MESMO DA INSTALAÇÃO E DO UPGRADE. Um laço que dispara `tsx` uma vez
 * por versão custa 22 processos para aplicar, quase sempre, zero atualização — e, pior, seria um
 * SEGUNDO caminho de provisionamento, diferente do que a implantação usa. `pendentes` já é ordenado,
 * idempotente (versão aplicada é estado reconhecido, não erro) e deriva do registro: o banco dos
 * percursos passa a ser provisionado exatamente como o servidor será.
 */
rodar("atualizações de permissões pendentes (o mesmo caminho da instalação)", "npx", [
  "tsx",
  "scripts/aplicar-atualizacao-de-permissoes.ts",
  "pendentes",
]);
/**
 * ⚠️ O CONTRATO COMERCIAL DE DEMONSTRAÇÃO — DEPOIS DAS PERMISSÕES, E NÃO ANTES.
 * `instalar-licenciamento.ts` DEDUZ os módulos contratados das permissões já concedidas
 * (`modulosEmUso`). Rodá-lo antes do passo acima registraria um contrato com os módulos de
 * ontem, e as telas das versões novas ficariam fora dele — travadas, com a mensagem certa e
 * a causa errada. Ele é idempotente: num banco que já tem contrato, não mexe e diz qual é.
 */
rodar("contrato comercial de DEMONSTRAÇÃO (o gate do M35 é fail-closed)", "npx", [
  "tsx",
  "scripts/instalar-licenciamento.ts",
  "--aplicar",
  "--demonstracao",
]);

// ⚠️ SEM TOLERÂNCIA (V11 V6.2). Este passo era tolerado pela mesma conta sintética da POC;
// com a descida para `2.1.3.1.1.01.01` ele grava em banco limpo. Se voltar a falhar, a
// instalação PARA — que é o comportamento certo para um passo que não tem mais desculpa.
rodar("roteiros de DEMONSTRAÇÃO do acervo (identificados como tal)", "npx", [
  "tsx",
  "prisma/seed/roteiros-demo.ts",
]);

console.log(
  `\n[percursos] pronto: ${alvo.host}:${alvo.porta}/${alvo.database}. ` +
    `Suba o servidor com \`npm run percursos:servir\` e rode os percursos contra http://localhost:3010.`
);
