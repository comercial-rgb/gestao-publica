import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V37 — PERCURSO DO CADASTRO DE MATERIAL ATÉ A PESQUISA DE PREÇOS, PELOS CAMPOS DE BUSCA:
 *   1. a trilha do cadastro, pela tela: classe contábil (conta de estoque do PCASP), grupo, unidade de medida e dois
 *      materiais (o que já existir de uma corrida anterior se reaproveita);
 *   2. a pesquisa de preços se registra escolhendo o material e o fornecedor da cotação pela BUSCA (nada de lista de
 *      500), e fica gravada com o material e o fornecedor escolhidos;
 *   3. na solicitação e na ordem de compra, o material também se acha pela busca, e nenhum `select` de material resta;
 *   4. a ordem de compra se emite pela tela com fornecedor, ficha e material pela busca, e o detalhe dela abre sem as
 *      listas que nunca chegavam a campo nenhum, com o caminho para o empenho.
 * Escreve na base fictícia (cadastros, uma pesquisa de preços e uma ordem de compra).
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 SEED_ADMIN_SENHA=... \
 *      npx tsx scripts/percurso-v37-compras-por-busca.mts
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação.");
const URL_BANCO = process.env["PERCURSO_BANCO"] ?? "";
if (!/\/gestao_publica_esperanca_ficticio(_[a-z]+)?(\?|$)/.test(URL_BANCO)) throw new Error("Recusado: PERCURSO_BANCO tem de ser a base fictícia que a BASE serve.");
const senha = process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const prisma = criarPrismaClient(URL_BANCO);
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};
const ALMOX = "/patrimonio/almoxarifado";

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(180000);
  page.on("dialog", (d) => void d.accept());
  await entrar(n, page, "admin@cg.pb.gov.br", senha);

  // ── 1. a trilha do cadastro ──
  const conta = await prisma.contaPcasp.findFirst({ where: { codigo: "1.1.5.6.1.01.00", analitica: true }, select: { id: true } });
  if (conta === null) throw new Error("A base não tem a conta 1.1.5.6.1.01.00 (material de consumo) do PCASP: o percurso não inventa conta.");
  if ((await prisma.classeDeMaterial.findUnique({ where: { codigo: "3.01" } })) === null) {
    await irPara(n, page, `${ALMOX}/classes`);
    const r = await preencherEEnviar(page, "criar-classes-de-material", [
      { sel: '[name="codigo"]', valor: "3.01" },
      { sel: '[name="descricao"]', valor: "Material de consumo" },
      { sel: 'select[name="contaContabilId"]', valor: conta.id, tipo: "select" },
    ]);
    conferir(r.tipo === "ok", `classe contábil 3.01 cadastrada pela tela (${r.texto.slice(0, 80)})`);
  } else console.log("   classe 3.01 já existe");
  if ((await prisma.grupoDeMaterial.findFirst({ where: { codigo: "01" } })) === null) {
    await irPara(n, page, `${ALMOX}/grupos`);
    const r = await preencherEEnviar(page, "criar-grupos-de-material", [
      { sel: '[name="codigo"]', valor: "01" },
      { sel: '[name="descricao"]', valor: "Expediente" },
    ]);
    conferir(r.tipo === "ok", `grupo 01 cadastrado pela tela (${r.texto.slice(0, 80)})`);
  } else console.log("   grupo 01 já existe");
  if ((await prisma.unidadeDeMedida.findFirst({ where: { sigla: "UN" } })) === null) {
    await irPara(n, page, `${ALMOX}/unidades`);
    const r = await preencherEEnviar(page, "criar-unidades-de-medida", [
      { sel: '[name="sigla"]', valor: "UN" },
      { sel: '[name="descricao"]', valor: "Unidade" },
    ]);
    conferir(r.tipo === "ok", `unidade UN cadastrada pela tela (${r.texto.slice(0, 80)})`);
  } else console.log("   unidade UN já existe");
  const classe = await prisma.classeDeMaterial.findUniqueOrThrow({ where: { codigo: "3.01" }, select: { id: true } });
  const grupo = await prisma.grupoDeMaterial.findFirstOrThrow({ where: { codigo: "01" }, select: { id: true } });
  const unidade = await prisma.unidadeDeMedida.findFirstOrThrow({ where: { sigla: "UN" }, select: { id: true } });
  for (const [codigo, descricao, catmat] of [["MAT-0001", "Resma de papel A4 75 g", "461230"], ["MAT-0002", "Caneta esferográfica azul", ""]] as const) {
    if ((await prisma.material.findUnique({ where: { codigo } })) !== null) {
      console.log(`   material ${codigo} já existe`);
      continue;
    }
    await irPara(n, page, `${ALMOX}/materiais`);
    const r = await preencherEEnviar(page, "criar-materiais", [
      { sel: '[name="codigo"]', valor: codigo },
      { sel: '[name="descricaoSucinta"]', valor: descricao },
      { sel: '[name="descricaoDetalhada"]', valor: `${descricao}, para uso administrativo` },
      { sel: 'select[name="grupoId"]', valor: grupo.id, tipo: "select" },
      { sel: 'select[name="classeDeMaterialId"]', valor: classe.id, tipo: "select" },
      { sel: 'select[name="classificacao"]', valor: "CONSUMO", tipo: "select" },
      { sel: 'select[name="categoria"]', valor: "ESTOCAVEL", tipo: "select" },
      ...(catmat !== "" ? [{ sel: '[name="catmat"]', valor: catmat }] : []),
      { sel: 'select[name="unidadeDeMedidaId"]', valor: unidade.id, tipo: "select" },
    ]);
    conferir(r.tipo === "ok", `material ${codigo} cadastrado pela tela (${r.texto.slice(0, 80)})`);
  }

  // ── 2. a pesquisa de preços pelos campos de busca ──
  const mat1 = await prisma.material.findUniqueOrThrow({ where: { codigo: "MAT-0001" }, select: { id: true } });
  const pessoa = await prisma.pessoa.findFirst({ orderBy: { documento: "desc" }, select: { id: true, documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } });
  const nome = pessoa?.versoes[0]?.nome ?? "";
  if (pessoa === null || nome === "") {
    console.log("NAO EXECUTADO passo 2: sem pessoa com nome para a cotação");
  } else {
    const numero = `PP-V37-${Date.now().toString(36).toUpperCase()}`;
    await irPara(n, page, "/licitacoes/pesquisas-de-precos");
    const selects = await page.$$eval('form[data-acao="criar-pesquisa"] select', (xs) => xs.length);
    const r = await preencherEEnviar(page, "criar-pesquisa", [
      { sel: '[name="numero"]', valor: numero },
      { sel: '[name="objeto"]', valor: "Material de expediente para as secretarias" },
      { sel: '[name="data"]', valor: "2026-10-08", tipo: "data" },
      { sel: "itens.0.materialId", valor: mat1.id, busca: "papel A4", tipo: "referencia" },
      { sel: '[name="itens.0.quantidade"]', valor: "10" },
      { sel: "itens.0.cotacoes.0.fornecedorId", valor: pessoa.id, busca: nome.slice(0, 12), tipo: "referencia" },
      { sel: '[name="itens.0.cotacoes.0.valorUnitario"]', valor: "24,90" },
      { sel: '[name="itens.0.cotacoes.0.origem"]', valor: "proposta por e-mail" },
    ]);
    const gravada = await prisma.pesquisaDePrecos.findFirst({ where: { numero }, select: { itens: { select: { materialId: true, cotacoes: { select: { fornecedorId: true, valorUnitario: true } } } } } });
    const item = gravada?.itens[0];
    conferir(
      selects === 0 && r.tipo === "ok" && item?.materialId === mat1.id && item.cotacoes[0]?.fornecedorId === pessoa.id && item.cotacoes[0].valorUnitario.toFixed(2) === "24.90",
      `pesquisa ${numero} registrada pela busca: material MAT-0001 e fornecedor "${nome.slice(0, 25)}" gravados, 24,90 (${r.texto.slice(0, 60)})`
    );
  }

  // ── 3. o material pela busca na solicitação e na ordem de compra ──
  const mat2 = await prisma.material.findUniqueOrThrow({ where: { codigo: "MAT-0002" }, select: { id: true } });
  for (const [rota, acao] of [["/licitacoes/solicitacoes", "criar-solicitacao"], ["/licitacoes/ordens-de-compra", "criar-ordem"]] as const) {
    await irPara(n, page, rota);
    const form = `form[data-acao="${acao}"]`;
    const raiz = `${form} [data-seletor]:has(input[type="hidden"][name="itens.0.materialId"])`;
    await page.waitForSelector(`${raiz} input[role="combobox"]`);
    const selectAntigo = await page.$(`${form} select[name="itens.0.materialId"]`);
    await page.type(`${raiz} input[role="combobox"]`, "caneta", { delay: 10 });
    await page.waitForSelector(`${raiz} [role="option"][data-valor="${mat2.id}"]`, { timeout: 30000 }).catch(() => undefined);
    const achou = (await page.$(`${raiz} [role="option"][data-valor="${mat2.id}"]`)) !== null;
    conferir(selectAntigo === null && achou, `${rota}: o material MAT-0002 aparece ao digitar "caneta", sem a lista de 500`);
  }

  // ── 4. a ordem de compra emitida pela tela, com tudo pela busca, e o detalhe dela ──
  const ficha = await prisma.fichaOrcamentaria.findFirst({ where: { exercicio: 2026, saldoDisponivel: { gt: 1000 }, naturezaDespesa: { codigoCompleto: { startsWith: "339030" } } }, orderBy: { numero: "asc" }, select: { id: true, numero: true } });
  // O fornecedor da ordem é credor vigente (o último movimento do papel é CONCEDIDO): é quem o empenho aceita.
  const vigente = async (id: string): Promise<boolean> => (await prisma.movimentoDePapelDaPessoa.findFirst({ where: { pessoaId: id, papel: "CREDOR" }, orderBy: [{ data: "desc" }, { criadoEm: "desc" }], select: { movimento: true } }))?.movimento === "CONCEDIDO";
  const ORDEM = 'form[data-acao="criar-ordem"]';
  const RAIZ_FORNECEDOR = `${ORDEM} [data-seletor]:has(input[type="hidden"][name="fornecedorId"])`;
  let fornecedor: { readonly id: string; readonly nome: string } | null = null;
  let jaEscolhido = false;
  if (pessoa !== null && nome !== "" && !(await vigente(pessoa.id))) {
    // 4a. quem cotou e não é credor NÃO se oferece como fornecedor da ordem...
    await irPara(n, page, "/licitacoes/ordens-de-compra");
    await page.waitForSelector(`${RAIZ_FORNECEDOR} input[role="combobox"]`);
    await page.type(`${RAIZ_FORNECEDOR} input[role="combobox"]`, pessoa.documento, { delay: 10 });
    // ...e no lugar aparece o atalho "Cadastrar este fornecedor" (o documento não está entre os credores).
    const atalho = await page.waitForSelector(`${RAIZ_FORNECEDOR} a[data-atalho-de-cadastro]`, { timeout: 30000 }).then(() => true).catch(() => false);
    const oferecido = (await page.$(`${RAIZ_FORNECEDOR} [role="option"][data-valor="${pessoa.id}"]`)) !== null;
    conferir(!oferecido && atalho, `ordem de compra: "${nome.slice(0, 25)}", que cotou mas não é credor, não se oferece como fornecedor; aparece "Cadastrar este fornecedor"`);
    // 4b. o atalho: a pessoa já está no cadastro, então a tela concede o papel de credor e volta à ordem com ela escolhida.
    if (atalho) {
      await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }), page.click(`${RAIZ_FORNECEDOR} a[data-atalho-de-cadastro]`)]);
      await page.waitForSelector('form[data-acao="conceder-papel-pelo-aviso"] button[type="submit"]');
      await page.waitForSelector('form[data-acao="conceder-papel-pelo-aviso"] input[name="__chave"][data-chave-de-comando="pronta"]', { timeout: 30000 }).catch(() => undefined);
      await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => undefined), page.click('form[data-acao="conceder-papel-pelo-aviso"] button[type="submit"]')]);
      await page.waitForFunction((sel) => (document.querySelector(sel) as HTMLInputElement | null)?.value !== "", { timeout: 60000 }, `${RAIZ_FORNECEDOR} input[type="hidden"][name="fornecedorId"]`).catch(() => undefined);
      const noCampo = await page.$eval(`${RAIZ_FORNECEDOR} input[type="hidden"][name="fornecedorId"]`, (e) => (e as HTMLInputElement).value).catch(() => "");
      const virouCredor = await vigente(pessoa.id);
      conferir(virouCredor && noCampo === pessoa.id && page.url().includes("/licitacoes/ordens-de-compra"), `"Cadastrar este fornecedor": o papel de credor foi concedido e a ordem voltou com "${nome.slice(0, 25)}" escolhido (${page.url().replace(n.base, "")})`);
      if (virouCredor && noCampo === pessoa.id) {
        fornecedor = { id: pessoa.id, nome };
        jaEscolhido = true;
      }
    }
  } else if (pessoa !== null && nome !== "") {
    console.log("   (a pessoa da cotação já é credora, de uma corrida anterior: os passos 4a e 4b não se repetem)");
    fornecedor = { id: pessoa.id, nome };
  }
  if (fornecedor === null || ficha === null) {
    console.log("NAO EXECUTADO passo 4: sem fornecedor credor ou sem ficha de material de consumo com saldo em 2026");
  } else {
    const numeroDaOrdem = `OC-V37-${Date.now().toString(36).toUpperCase()}`;
    if (!jaEscolhido) await irPara(n, page, "/licitacoes/ordens-de-compra");
    const r = await preencherEEnviar(page, "criar-ordem", [
      { sel: '[name="numero"]', valor: numeroDaOrdem },
      ...(jaEscolhido ? [] : [{ sel: "fornecedorId", valor: fornecedor.id, busca: fornecedor.nome.slice(0, 12), tipo: "referencia" as const }]),
      { sel: "fichaId", valor: ficha.id, busca: String(ficha.numero), tipo: "referencia" },
      { sel: '[name="dataEmissao"]', valor: "2026-10-08", tipo: "data" },
      { sel: '[name="finalidade"]', valor: "Material de expediente para as secretarias" },
      { sel: "itens.0.materialId", valor: mat1.id, busca: "MAT-0001", tipo: "referencia" },
      { sel: '[name="itens.0.quantidade"]', valor: "10" },
      { sel: '[name="itens.0.valorUnitario"]', valor: "24,90" },
    ]);
    const ordem = await prisma.ordemDeCompra.findUnique({ where: { numero: numeroDaOrdem }, select: { id: true, fornecedorId: true, fichaId: true, itens: { select: { materialId: true } } } });
    conferir(
      r.tipo === "ok" && ordem?.fornecedorId === fornecedor.id && ordem.fichaId === ficha.id && ordem.itens[0]?.materialId === mat1.id,
      `ordem ${numeroDaOrdem} emitida pela tela: fornecedor, ficha ${String(ficha.numero)} e material gravados como escolhidos na busca (${r.texto.slice(0, 60)})`
    );
    if (ordem !== null) {
      await irPara(n, page, `/licitacoes/ordens-de-compra/${ordem.id}`);
      const selects = await page.$$eval('main select[name="fornecedorId"], main select[name="fichaId"], main select[name="processoId"]', (xs) => xs.length);
      const empenhar = await page.$eval(`a[href="/despesa/empenhos?ordemId=${ordem.id}"]`, (a) => (a.textContent ?? "").trim()).catch(() => "");
      const titulo = await page.$eval("main h1", (h) => (h.textContent ?? "").trim()).catch(() => "");
      conferir(selects === 0 && titulo.includes(numeroDaOrdem) && empenhar !== "", `detalhe da ordem abre sem as listas, com "${empenhar}" para o empenho`);

      // ── 5. "Empenhar esta ordem": a ordem chega escolhida e preenche ficha, credor e valor; o empenho se grava ──
      if (empenhar !== "") {
        await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }), page.click(`a[href="/despesa/empenhos?ordemId=${ordem.id}"]`)]);
        const form = 'form[data-acao="empenhar"]';
        await page.waitForFunction((sel) => (document.querySelector(sel) as HTMLInputElement | null)?.value !== "", { timeout: 60000 }, `${form} input[type="hidden"][name="ordemDeCompraId"]`).catch(() => undefined);
        await page.waitForFunction((sel) => (document.querySelector(sel) as HTMLInputElement | null)?.value !== "", { timeout: 30000 }, `${form} [name="valor"]`).catch(() => undefined);
        const valorDe = (s: string): Promise<string> => page.$eval(`${form} ${s}`, (e) => (e as HTMLInputElement).value).catch(() => "");
        const lido = { ordem: await valorDe('input[type="hidden"][name="ordemDeCompraId"]'), ficha: await valorDe('[name="fichaId"]'), valor: await valorDe('[name="valor"]') };
        conferir(lido.ordem === ordem.id && lido.ficha === ficha.id && /249[,.]?0?0?$/.test(lido.valor.replace(/\s/g, "")), `o empenho chega com a ordem, a ficha ${String(ficha.numero)} e o valor ${lido.valor} preenchidos`);
        // A data e a categoria a pessoa escolhe: a ordem não as traz (a categoria não tem sugestão, por decisão do domínio).
        const r5 = await preencherEEnviar(page, "empenhar", [
          { sel: '[name="data"]', valor: "2026-10-08", tipo: "data" },
          { sel: 'select[name="categoria"]', valor: "FORNECIMENTO_BENS", tipo: "select" },
          { sel: '[name="historico"]', valor: `Empenho da ordem ${numeroDaOrdem}, material de expediente` },
        ]);
        const empenho = await prisma.empenho.findFirst({ where: { ordemDeCompraId: ordem.id }, select: { numero: true, valor: true } });
        conferir(r5.tipo === "ok" && empenho !== null && empenho.valor.toFixed(2) === "249.00", `empenho gravado pela ordem: nº ${String(empenho?.numero ?? "-")}, R$ ${empenho?.valor.toFixed(2) ?? "-"} (${r5.texto.slice(0, 80)})`);
      }
    }
  }
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso das compras pela busca completo.");
