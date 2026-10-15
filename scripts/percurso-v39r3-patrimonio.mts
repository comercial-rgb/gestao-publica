import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { Decimal } from "../packages/contracts/index.js";
import { exigirDestinoDoPercurso } from "./destino-do-percurso.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V39-R3 (R3-026) — PELA TELA: O BEM DA LIQUIDAÇÃO À BAIXA, EM QUATRO EVIDÊNCIAS SEPARADAS.
 *
 * Pré-requisito: a massa da R3, seção 12 (classe R3-INFO com parâmetro de 60 meses e 10% de residual, roteiros
 * AQUISICAO, DEPRECIACAO e DOACAO_REALIZADA, as liquidações R3-PAT-L1 de 900,00 e R3-PAT-L2 de 150,00, os bens
 * R3-PAT-0001 e R3-PAT-0002 sem valor, duas salas, dois responsáveis, o motivo de baixa R3-DOACAO).
 *   A. INCORPORAÇÃO: 0001 incorporado por L1 (900,00); 0002 com 200,00 por L2 recusado (passa do liquidado); 0002 por
 *      L2 (150,00). SQL: origem (a liquidação), valor, razão (D imobilizado / C a classificar) e a conta a classificar
 *      zerada pelas duas.
 *   B. TRANSFERÊNCIA E RESPONSABILIDADE: 0001 recebe responsável e sala; transferência para a mesma unidade recusada;
 *      transferência da Administração (02004) para a 02002. SQL: o responsável, a sala, a saída e a entrada na mesma
 *      operação, e nenhum lançamento.
 *   C. DEPRECIAÇÃO: competências 2026-08 e 2026-09 da classe; a mesma competência outra vez recusada. Esperado feito
 *      AQUI à mão: (900 − 10% de 900) / 60 = 13,50 por mês, só do 0001 (o 0002 entrou em outubro). SQL: valor e razão.
 *   D. BAIXA: 0002 doado com 200,00 recusado (passa do valor do bem); com 150,00; a situação BAIXADO; mover o bem
 *      baixado recusado. SQL: motivo, valor do bem zerado e razão.
 * Quem só consulta o patrimônio abre o bem sem as ações. GRAVA (base de ensaio). Passos já feitos são ditos, não contados.
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3012" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação; este percurso grava.");
await exigirDestinoDoPercurso(n.base);
const prisma = criarPrismaClient(process.env["PERCURSO_BANCO"] ?? process.env["DATABASE_URL"] ?? "");
const senha = process.env["FICTICIO_SENHA"] ?? "Ficticio#2026";
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};
const nota = (o: string): void => console.log(`--  ${o}`);
const secao = (o: string): void => console.log(`\n== ${o} ==`);

const bem = async (t: string) => {
  const b = await prisma.bemPatrimonial.findFirst({ where: { numeroTombamento: t }, select: { id: true, classeDeBensId: true } });
  if (b === null) throw new Error(`A massa da R3 não tem o bem ${t}.`);
  return b;
};
const A = await bem("R3-PAT-0001");
const B = await bem("R3-PAT-0002");
const liq = async (numero: string) => {
  const l = await prisma.liquidacao.findFirst({ where: { numero, empenho: { numero: { startsWith: "R3-PAT-" } } }, select: { id: true } });
  if (l === null) throw new Error(`A massa da R3 não tem a liquidação ${numero}.`);
  return l.id;
};
const L1 = await liq("R3-PAT-L1");
const L2 = await liq("R3-PAT-L2");
/** O CPF da servidora da sala 1 da massa (raiz 731845301), com os dígitos calculados aqui. */
const cpf = (raiz9: string): string => {
  const d = raiz9.split("").map(Number);
  for (const t of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += (d[i] as number) * (t + 1 - i);
    d.push(soma % 11 < 2 ? 0 : 11 - (soma % 11));
  }
  return d.join("");
};
const responsavel = (await prisma.pessoa.findUnique({ where: { documento: cpf("731845301") }, select: { id: true } }))?.id ?? "";
const sala1 = (await prisma.localizacaoFisica.findFirst({ where: { codigo: "R3-SALA-01" }, select: { id: true } }))?.id ?? "";
const uo = async (codigo: string) => (await prisma.unidadeOrcamentaria.findFirst({ where: { codigo }, select: { id: true } }))?.id ?? "";
const adm = await uo("02004");
const outra = await uo("02002");
const motivoDoacao = (await prisma.motivoDeBaixa.findFirst({ where: { codigo: "R3-DOACAO" }, select: { id: true } }))?.id ?? "";
if ([responsavel, sala1, adm, outra, motivoDoacao].includes("")) throw new Error("A massa da R3 não tem responsável, sala, unidades ou motivo de baixa da seção 12.");

// O SINAL de cada tipo, escrito aqui (não importado do domínio): o que soma e o que tira do valor do bem.
const SINAL: Record<string, number> = { AQUISICAO: 1, DEPRECIACAO: -1, DOACAO_REALIZADA: -1 };
const vivos = (bemId: string, tipo?: string) =>
  prisma.movimentoPatrimonial.findMany({ where: { bemId, ...(tipo !== undefined ? { tipo: tipo as never } : {}), estornoDeId: null, estornos: { none: {} } }, select: { tipo: true, valor: true, liquidacaoId: true, lancamentoId: true, motivoDeBaixaId: true, competencia: true } });
const valorDo = async (bemId: string): Promise<string> =>
  (await vivos(bemId)).reduce((s, m) => s.plus(new Decimal(m.valor.toString()).times(SINAL[m.tipo] ?? Number.NaN)), new Decimal(0)).toFixed(2);
/** As pernas de um lançamento: "D conta valor" e "C conta valor", em ordem. */
const pernas = async (lancamentoId: string): Promise<string> =>
  (await prisma.partidaContabil.findMany({ where: { lancamentoId }, select: { tipo: true, valor: true, conta: { select: { codigo: true } } } }))
    .map((p) => `${p.tipo === "DEBITO" ? "D" : "C"} ${p.conta.codigo} ${p.valor.toFixed(2)}`)
    .sort()
    .join(" | ");
const saldoDaConta = async (codigo: string): Promise<string> =>
  (await prisma.partidaContabil.findMany({ where: { conta: { codigo } }, select: { tipo: true, valor: true } }))
    .reduce((s, p) => s.plus(new Decimal(p.valor.toString()).times(p.tipo === "DEBITO" ? 1 : -1)), new Decimal(0))
    .toFixed(2);

const nav = await lancarNavegadorDoPercurso();
try {
  // ── quem só consulta ──
  const ctxC = await nav.createBrowserContext();
  const pc = await ctxC.newPage();
  pc.setDefaultTimeout(300000);
  await entrar(n, pc, "consulta.patrimonio@ficticio.local", senha);
  await irPara(n, pc, `/patrimonio/bens-patrimoniais/${A.id}`);
  const titulo = await pc.$eval("h1", (e) => e.textContent ?? "").catch(() => "");
  const formsC = await pc.$$('form[data-acao="incorporar-pela-liquidacao"], form[data-acao="atribuir-responsavel"], form[data-acao="transferir-entre-entidades"], form[data-acao="baixar-do-acervo"]');
  conferir(titulo.includes("R3-PAT-0001") && formsC.length === 0, `quem só consulta abre o bem (${titulo.trim().slice(0, 60)}) e não recebe as ações`);
  await ctxC.close();

  const ctx = await nav.createBrowserContext();
  const p = await ctx.newPage();
  p.setDefaultTimeout(300000);
  await entrar(n, p, "patrimonio@ficticio.local", senha);
  const noBem = async (id: string, acao: string, campos: Parameters<typeof preencherEEnviar>[2]) => {
    await irPara(n, p, `/patrimonio/bens-patrimoniais/${id}`);
    return preencherEEnviar(p, `form[data-acao="${acao}"]`, campos);
  };

  // ═══ A. INCORPORAÇÃO ═══
  secao("A. incorporação pela liquidação");
  const incorporar = (id: string, liquidacaoId: string, busca: string, valor: string, dia: string) =>
    noBem(id, "incorporar-pela-liquidacao", [
      { sel: "liquidacaoId", valor: liquidacaoId, busca, tipo: "referencia" },
      { sel: '[data-mascara="valor"]', valor },
      { sel: 'input[name="dataMovimento"]', valor: dia, tipo: "data" },
    ]);
  if ((await vivos(A.id, "AQUISICAO")).length === 0) {
    const r = await incorporar(A.id, L1, "R3-PAT-L1", "900,00", "2026-08-20");
    conferir(r.tipo === "ok", `0001 incorporado por R3-PAT-L1 com 900,00 (${r.texto.slice(0, 70)})`);
  } else nota("0001 já incorporado numa corrida anterior");
  if ((await vivos(B.id, "AQUISICAO")).length === 0) {
    const r = await incorporar(B.id, L2, "R3-PAT-L2", "200,00", "2026-10-05");
    conferir(r.tipo === "erro" && /a liquidação R3-PAT-L2 vale 150\.00 .*já incorporou 0\.00 .*só cabem mais 150\.00; esta aquisição pede 200\.00/.test(r.texto) && (await vivos(B.id, "AQUISICAO")).length === 0, `0002 com 200,00 por R3-PAT-L2 (liquidada em 150,00): recusado, nada gravado (${r.texto.slice(0, 110)})`);
    const r2 = await incorporar(B.id, L2, "R3-PAT-L2", "150,00", "2026-10-05");
    conferir(r2.tipo === "ok", `0002 incorporado por R3-PAT-L2 com 150,00 (${r2.texto.slice(0, 70)})`);
  } else nota("0002 já incorporado numa corrida anterior (a recusa de 200,00 foi vista naquela corrida)");

  // ═══ B. TRANSFERÊNCIA E RESPONSABILIDADE ═══
  secao("B. responsável, sala e transferência entre unidades");
  const gestao = (tipo: string) => prisma.movimentoDeGestaoDoBem.findMany({ where: { bemId: A.id, tipo: tipo as never, estornoDeId: null }, select: { responsavelId: true, localizacaoId: true, unidadeOrcId: true, operacaoId: true } });
  if ((await gestao("RESPONSAVEL")).length === 0) {
    const r1 = await noBem(A.id, "atribuir-responsavel", [
      { sel: 'select[name="responsavelId"]', valor: responsavel, tipo: "select" },
      { sel: 'input[name="dataMovimento"]', valor: "2026-08-21", tipo: "data" },
      { sel: 'input[name="motivo"]', valor: "Entrega do computador à servidora da sala 1 (ensaio)" },
    ]);
    const r2 = await noBem(A.id, "mover-localizacao", [
      { sel: 'select[name="localizacaoId"]', valor: sala1, tipo: "select" },
      { sel: 'input[name="dataMovimento"]', valor: "2026-08-21", tipo: "data" },
      { sel: 'input[name="motivo"]', valor: "Instalado na sala 1 (ensaio)" },
    ]);
    conferir(r1.tipo === "ok" && r2.tipo === "ok", `0001 com responsável e na sala 1 (${r1.texto.slice(0, 40)} | ${r2.texto.slice(0, 40)})`);
  } else nota("0001 já tinha responsável e sala de uma corrida anterior");
  if ((await gestao("TRANSFERENCIA_SAIDA")).length === 0) {
    const transferir = (destino: string) =>
      noBem(A.id, "transferir-entre-entidades", [
        { sel: 'select[name="unidadeOrcOrigemId"]', valor: adm, tipo: "select" },
        { sel: 'select[name="unidadeOrcDestinoId"]', valor: destino, tipo: "select" },
        { sel: 'input[name="dataMovimento"]', valor: "2026-09-30", tipo: "data" },
        { sel: 'input[name="motivo"]', valor: "Computador cedido à outra secretaria (ensaio)" },
      ]);
    const rMesma = await transferir(adm);
    conferir(rMesma.tipo === "erro" && (await gestao("TRANSFERENCIA_SAIDA")).length === 0, `transferência para a mesma unidade: recusada, nada gravado (${rMesma.texto.slice(0, 100)})`);
    const r = await transferir(outra);
    conferir(r.tipo === "ok", `0001 transferido da 02004 para a 02002 (${r.texto.slice(0, 60)})`);
  } else nota("0001 já transferido numa corrida anterior");

  // ═══ C. DEPRECIAÇÃO ═══
  secao("C. depreciação por competência");
  const processar = async (competencia: string) => {
    await irPara(n, p, `/patrimonio/competencia?classe=${A.classeDeBensId}&competencia=${competencia}`);
    const situacao = await p.$eval("[data-previa]", (e) => e.getAttribute("data-previa") ?? "").catch(() => "");
    if (situacao !== "PRONTA") return { situacao, r: null, texto: await p.$eval("[data-previa]", (e) => (e.textContent ?? "").replace(/\s+/g, " ").trim()).catch(() => "") };
    return { situacao, r: await preencherEEnviar(p, 'form[data-acao="processar-competencia"]', []), texto: "" };
  };
  for (const c of ["2026-08", "2026-09"]) {
    const ja = (await vivos(A.id, "DEPRECIACAO")).some((m) => m.competencia?.toISOString().startsWith(c) === true);
    if (ja) {
      nota(`competência ${c} já processada numa corrida anterior`);
      continue;
    }
    const x = await processar(c);
    conferir(x.r?.tipo === "ok", `competência ${c} processada pela prévia pronta (${x.situacao} ${x.r?.texto.slice(0, 60) ?? x.texto.slice(0, 80)})`);
  }
  const de0802 = await vivos(B.id, "DEPRECIACAO");
  const outraVez = await processar("2026-09");
  const depoisDeOutraVez = (await vivos(A.id, "DEPRECIACAO")).length;
  conferir(outraVez.situacao !== "PRONTA" && outraVez.r === null && /JÁ FOI ATUALIZADA/i.test(outraVez.texto) && depoisDeOutraVez === 2 && de0802.length === 0, `2026-09 outra vez: sem botão, a prévia diz por quê; o 0002 (de outubro) fora (${outraVez.texto.slice(0, 110)})`);

  // ═══ D. BAIXA ═══
  secao("D. baixa por doação");
  const baixar = (valor: string) =>
    noBem(B.id, "baixar-do-acervo", [
      { sel: 'select[name="tipo"]', valor: "DOACAO_REALIZADA", tipo: "select" },
      { sel: 'select[name="motivoDeBaixaId"]', valor: motivoDoacao, tipo: "select" },
      { sel: '[data-mascara="valor"]', valor },
      { sel: 'input[name="dataMovimento"]', valor: "2026-10-10", tipo: "data" },
      { sel: 'input[name="motivo"]', valor: "Impressora doada ao município vizinho (ensaio)" },
    ]);
  if ((await vivos(B.id, "DOACAO_REALIZADA")).length === 0) {
    const r1 = await baixar("200,00");
    conferir(r1.tipo === "erro" && /excede o valor contábil do BEM/i.test(r1.texto) && (await vivos(B.id, "DOACAO_REALIZADA")).length === 0, `0002 doado com 200,00: recusado, nada gravado (${r1.texto.slice(0, 110)})`);
    const r2 = await baixar("150,00");
    conferir(r2.tipo === "ok", `0002 doado com 150,00 (${r2.texto.slice(0, 60)})`);
  } else nota("0002 já doado numa corrida anterior");
  const situacaoDeB = await prisma.movimentoDeGestaoDoBem.count({ where: { bemId: B.id, tipo: "SITUACAO" as never, situacao: "BAIXADO" as never } });
  if (situacaoDeB === 0) {
    const r = await noBem(B.id, "registrar-situacao", [
      { sel: 'select[name="situacao"]', valor: "BAIXADO", tipo: "select" },
      { sel: 'input[name="dataMovimento"]', valor: "2026-10-10", tipo: "data" },
      { sel: 'input[name="motivo"]', valor: "Termo de doação assinado (ensaio)" },
    ]);
    conferir(r.tipo === "ok", `0002 com a situação BAIXADO (${r.texto.slice(0, 60)})`);
  } else nota("0002 já estava com a situação BAIXADO");
  const antes = await prisma.movimentoDeGestaoDoBem.count({ where: { bemId: B.id } });
  const rMover = await noBem(B.id, "mover-localizacao", [
    { sel: 'select[name="localizacaoId"]', valor: sala1, tipo: "select" },
    { sel: 'input[name="dataMovimento"]', valor: "2026-10-12", tipo: "data" },
    { sel: 'input[name="motivo"]', valor: "Tentativa de mover a impressora doada (ensaio)" },
  ]);
  conferir(rMover.tipo === "erro" && /baixado não se movimenta/i.test(rMover.texto) && (await prisma.movimentoDeGestaoDoBem.count({ where: { bemId: B.id } })) === antes, `mover o bem baixado: recusado, nada gravado (${rMover.texto.slice(0, 110)})`);
  await ctx.close();
} finally {
  await nav.close();
}

// ═══ AS QUATRO EVIDÊNCIAS POR SQL, independentes das telas ═══
secao("evidência A — incorporação: origem, valor, razão");
const aqA = await vivos(A.id, "AQUISICAO");
const aqB = await vivos(B.id, "AQUISICAO");
const razaoA = aqA[0] === undefined ? "" : await pernas(aqA[0].lancamentoId);
conferir(aqA.length === 1 && aqA[0]?.liquidacaoId === L1 && aqA[0]?.valor.toFixed(2) === "900.00" && razaoA === "C 1.2.3.1.1.99.08 900.00 | D 1.2.3.1.1.02.01 900.00", `0001: origem R3-PAT-L1, 900,00, razão ${razaoA}`);
conferir(aqB.length === 1 && aqB[0]?.liquidacaoId === L2 && aqB[0]?.valor.toFixed(2) === "150.00", `0002: origem R3-PAT-L2, ${aqB[0]?.valor.toFixed(2) ?? "-"}`);
const aClassificar = await saldoDaConta("1.2.3.1.1.99.08");
conferir(aClassificar === "0.00", `a conta de bens a classificar volta a zero depois das duas incorporações: ${aClassificar}`);

secao("evidência B — responsabilidade e transferência");
const gA = await prisma.movimentoDeGestaoDoBem.findMany({ where: { bemId: A.id, estornoDeId: null }, select: { id: true, tipo: true, responsavelId: true, localizacaoId: true, unidadeOrcId: true, operacaoId: true } });
const resp = gA.find((g) => g.tipo === "RESPONSAVEL");
const loc = gA.find((g) => g.tipo === "LOCALIZACAO");
const saida = gA.find((g) => g.tipo === "TRANSFERENCIA_SAIDA");
const entrada = gA.find((g) => g.tipo === "TRANSFERENCIA_ENTRADA");
conferir(resp?.responsavelId === responsavel && loc?.localizacaoId === sala1, "0001: responsável é a servidora da sala 1, e o bem está na sala 1");
conferir(saida?.unidadeOrcId === adm && entrada?.unidadeOrcId === outra && saida.operacaoId !== null && saida.operacaoId === entrada.operacaoId, "0001: saída da 02004 e entrada na 02002 na mesma operação");
const ids = [A.id, ...gA.map((g) => g.id), ...gA.map((g) => g.operacaoId).filter((x): x is string => x !== null)];
const lancGestao = await prisma.lancamentoContabil.count({ where: { origemId: { in: ids }, origemTipo: { not: "PATRIMONIAL_AQUISICAO" } } });
conferir(lancGestao === 0, `responsável, sala e transferência não lançam no razão (${String(lancGestao)} lançamentos de gestão)`);

secao("evidência C — depreciação: valor e razão");
// À mão: residual 10% de 900,00 = 90,00; (900,00 − 90,00) / 60 = 13,50 por competência.
const dep = await vivos(A.id, "DEPRECIACAO");
const razoesDep = await Promise.all(dep.map((m) => pernas(m.lancamentoId)));
conferir(dep.length === 2 && dep.every((m) => m.valor.toFixed(2) === "13.50"), `0001: duas competências de 13,50 (${dep.map((m) => m.valor.toFixed(2)).join(", ")})`);
conferir(razoesDep.every((r) => r === "C 1.2.3.8.1.01.02 13.50 | D 3.3.3.1.1.01.01 13.50"), `razão de cada competência: ${razoesDep.join(" ; ")}`);
const valorA = await valorDo(A.id);
conferir(valorA === "873.00", `valor contábil do 0001: 900,00 − 27,00 = ${valorA}`);

secao("evidência D — baixa: motivo, valor e razão");
const doa = await vivos(B.id, "DOACAO_REALIZADA");
const razaoD = doa[0] === undefined ? "" : await pernas(doa[0].lancamentoId);
const valorB = await valorDo(B.id);
conferir(doa.length === 1 && doa[0]?.motivoDeBaixaId === motivoDoacao && doa[0]?.valor.toFixed(2) === "150.00" && razaoD === "C 1.2.3.1.1.02.01 150.00 | D 3.5.2.4.5.01.04 150.00" && valorB === "0.00", `0002: doação de 150,00 pelo motivo R3-DOACAO, razão ${razaoD}, valor do bem ${valorB}`);
await prisma.$disconnect();
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso do patrimônio completo.");
