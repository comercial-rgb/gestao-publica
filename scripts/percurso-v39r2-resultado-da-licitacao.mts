import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { diaCivil } from "../packages/datas/index.js";
import { exigirDestinoDoPercurso } from "./destino-do-percurso.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, sair, type CampoDoPercurso, type Navegador } from "./percursos-navegador.js";

/**
 * V39-R2 (R2-014 a 020) — PELA TELA: DO PROCESSO AO CONTRATO.
 *   1. cadastra o processo, três itens (1 avulso; 2 e 3 no lote 1) e vincula dois participantes do cadastro de pessoas;
 *   2. registra as propostas (item 1 dos dois; o lote 1 dos dois) — o item e o lote pelo número digitado;
 *   3. julga: item 1 vence o de MAIOR valor com a justificativa (a tela não escolhe); o lote vence o outro; e confere
 *      que, sem a justificativa, o ato é recusado nomeando a proposta melhor;
 *   4. adjudica os três; homologa os itens 1 e 2 e corrige o ato incluindo o 3 (o primeiro fica no histórico);
 *   5. contrato do resultado (item 1, 60 unidades), ata (itens 2 e 3) e contrato pela ata (item 2, 10);
 *   6. no banco e na tela: o contrato com contratado, itens e preço do resultado; o saldo da ata do item 2.
 * SEGREGAÇÃO: o agente de contratação (PERCURSO_AGENTE) cadastra, julga e contrata; a autoridade (PERCURSO_USUARIO, o
 * administrador) adjudica e homologa — o domínio recusa que quem julgou adjudique ou homologue.
 * GRAVA (base de demonstração ou ensaio, conferida pelo `entrar`). Os participantes são pessoas jurídicas JÁ
 * cadastradas (PERCURSO_PARTICIPANTES="cnpj1,cnpj2"; sem isso, as duas primeiras fictícias do cadastro).
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação; este percurso grava.");
await exigirDestinoDoPercurso(n.base);
const prisma = criarPrismaClient(process.env["PERCURSO_BANCO"] ?? process.env["DATABASE_URL"] ?? "");
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};
const dia = (d: number): string => diaCivil(new Date(Date.now() + d * 86_400_000));
const marca = String(Date.now()).slice(-6);
const numeroProcesso = `${dia(0).slice(0, 4)}/PE-${marca}`;
const agente = process.env["PERCURSO_AGENTE"] ?? "agente.contratacao@ficticio.local";
const senhaDoAgente = process.env["PERCURSO_AGENTE_SENHA"] ?? process.env["FICTICIO_SENHA"] ?? "Ficticio#2026";
const autoridade = process.env["PERCURSO_USUARIO"] ?? "admin@cg.pb.gov.br";
const senhaDaAutoridade = process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "";

const docs = (process.env["PERCURSO_PARTICIPANTES"] ?? "").split(",").map((s) => s.trim()).filter((s) => s !== "");
const pessoas = docs.length === 2
  ? await prisma.pessoa.findMany({ where: { documento: { in: docs } }, select: { documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } })
  : (await prisma.pessoa.findMany({ where: { tipo: "JURIDICA" }, orderBy: { criadoEm: "asc" }, select: { documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } })).filter((p) => /fict/i.test(p.versoes[0]?.nome ?? "")).slice(0, 2);
if (pessoas.length !== 2) throw new Error("São precisas duas pessoas jurídicas no cadastro (PERCURSO_PARTICIPANTES).");
const [A, B] = pessoas as [typeof pessoas[number], typeof pessoas[number]];
const nomeA = A.versoes[0]?.nome ?? A.documento;
const nomeB = B.versoes[0]?.nome ?? B.documento;

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(300000);
  page.on("dialog", (d) => void d.accept());
  await entrar(n, page, agente, senhaDoAgente);

  // 1. processo, itens, participantes
  await irPara(n, page, "/licitacoes/processos");
  const rp = await preencherEEnviar(page, "criar-processos-licitatorios", [
    { sel: 'input[name="numeroProcesso"]', valor: numeroProcesso },
    { sel: 'select[name="modalidade"]', valor: "PREGAO_ELETRONICO", tipo: "select" },
    { sel: 'input[data-mascara="valor"]:has(+ input[name="valorLicitado"])', valor: "60000,00" },
    { sel: 'textarea[name="objeto"]', valor: "Materiais de construção para manutenção dos prédios públicos (ensaio)" },
  ]);
  const proc = await prisma.processoLicitatorio.findFirst({ where: { numeroProcesso }, select: { id: true } });
  conferir(rp.tipo === "ok" && proc !== null, `processo ${numeroProcesso} cadastrado pela tela`);
  if (proc === null) throw new Error("sem processo");
  const P = `/licitacoes/processos/${proc.id}`;
  const ato = async (acao: string, campos: readonly CampoDoPercurso[]): Promise<{ tipo: string; texto: string }> => {
    await irPara(n, page, P);
    return preencherEEnviar(page, acao, campos);
  };
  for (const [numero, lote, descricao, unidade, qtd] of [["1", "", "Cimento CP-II 50 kg", "saco", "100"], ["2", "1", "Areia lavada", "m3", "20"], ["3", "1", "Brita 1", "m3", "10"]] as const) {
    const r = await ato("cadastrar-item-do-processo", [
      { sel: 'input[name="numero"]', valor: numero }, ...(lote === "" ? [] : [{ sel: 'input[name="lote"]', valor: lote }]),
      { sel: 'input[name="descricao"]', valor: descricao }, { sel: 'input[name="unidade"]', valor: unidade }, { sel: 'input[name="quantidade"]', valor: qtd },
    ]);
    conferir(r.tipo === "ok", `item ${numero} cadastrado (${r.texto.slice(0, 50)})`);
  }
  for (const p of [A, B]) {
    const r = await ato("vincular-participante", [{ sel: 'input[name="documento"]', valor: p.documento }]);
    conferir(r.tipo === "ok", `participante ${p.documento} vinculado (${r.texto.slice(0, 50)})`);
  }
  const itens = await prisma.itemDoProcesso.findMany({ where: { processoId: proc.id }, orderBy: { numero: "asc" }, select: { id: true } });
  const part = await prisma.participanteDoProcesso.findMany({ where: { processoId: proc.id }, select: { id: true, pessoa: { select: { documento: true } } } });
  const pA = part.find((x) => x.pessoa.documento === A.documento)!.id;
  const pB = part.find((x) => x.pessoa.documento === B.documento)!.id;
  const [i1, i2, i3] = itens.map((i) => i.id) as [string, string, string];

  // 2. propostas
  const proposta = (participanteId: string, abrangencia: "ITEM" | "LOTE", numero: string, valores: readonly [string, string][]) => ato("registrar-proposta", [
    { sel: 'select[name="participanteId"]', valor: participanteId, tipo: "select" },
    { sel: 'select[name="abrangencia"]', valor: abrangencia, tipo: "select" },
    { sel: "input[data-numero-da-proposta]", valor: numero },
    ...valores.map(([id, v]) => ({ sel: `input[name="valor_${id}"]`, valor: v })),
    { sel: 'input[name="documento"]', valor: "Proposta pelo sistema de compras (ensaio)" },
  ]);
  for (const [p, ab, num, vals] of [[pA, "ITEM", "1", [[i1, "30,00"]]], [pB, "ITEM", "1", [[i1, "28,50"]]], [pA, "LOTE", "1", [[i2, "120,00"], [i3, "150,00"]]], [pB, "LOTE", "1", [[i2, "110,00"], [i3, "140,00"]]]] as const) {
    const r = await proposta(p, ab, num, vals as unknown as [string, string][]);
    conferir(r.tipo === "ok", `proposta ${ab === "ITEM" ? "do item" : "do lote"} ${num} de ${p === pA ? "A" : "B"} (${r.texto.slice(0, 50)})`);
  }

  // 3. resultado: sem a justificativa, recusa; com ela, passa
  const resultado = (justificativa: string) => ato("registrar-resultado", [
    { sel: 'input[name="data"]', valor: dia(-10), tipo: "data" },
    { sel: 'select[name="criterio"]', valor: "MENOR_PRECO", tipo: "select" },
    { sel: 'input[name="fundamento"]', valor: "Ata da sessão pública do pregão (ensaio)" },
    { sel: 'input[name="documento"]', valor: "Ata da sessão" },
    { sel: `select[name="situacao_${i1}"]`, valor: "VENCEDOR", tipo: "select" }, { sel: `select[name="participante_${i1}"]`, valor: pA, tipo: "select" }, { sel: `input[name="valorfinal_${i1}"]`, valor: "29,00" },
    ...(justificativa === "" ? [] : [{ sel: `input[name="justificativa_${i1}"]`, valor: justificativa }]),
    { sel: `select[name="situacao_${i2}"]`, valor: "VENCEDOR", tipo: "select" }, { sel: `select[name="participante_${i2}"]`, valor: pB, tipo: "select" }, { sel: `input[name="valorfinal_${i2}"]`, valor: "105,00" },
    { sel: `select[name="situacao_${i3}"]`, valor: "VENCEDOR", tipo: "select" }, { sel: `select[name="participante_${i3}"]`, valor: pB, tipo: "select" }, { sel: `input[name="valorfinal_${i3}"]`, valor: "140,00" },
  ]);
  const semJ = await resultado("");
  conferir(semJ.tipo === "erro" && /proposta mais vantajosa pelo critério/.test(semJ.texto) && (await prisma.resultadoDoProcesso.count({ where: { processoId: proc.id } })) === 0, `sem justificativa, o ato é recusado nomeando a proposta melhor: ${semJ.texto.slice(0, 90)}`);
  const comJ = await resultado("O segundo colocado foi inabilitado no item 1 por certidão vencida");
  conferir(comJ.tipo === "ok", `resultado registrado com a justificativa (${comJ.texto.slice(0, 50)})`);
  // A proposta corrigida depois do julgamento é recusada pela tela
  const tarde = await proposta(pA, "ITEM", "1", [[i1, "27,00"]]);
  conferir(tarde.tipo === "erro" && /já foi julgado/.test(tarde.texto), `proposta depois do julgamento recusada (${tarde.texto.slice(0, 60)})`);

  // 4. adjudicação e homologação com correção — pela autoridade
  await sair(n, page);
  await entrar(n, page, autoridade, senhaDaAutoridade);
  const linhas = await prisma.itemDoResultado.findMany({ where: { item: { processoId: proc.id }, substituidaPor: { is: null } }, select: { id: true, itemId: true } });
  const linha = (itemId: string): string => linhas.find((l) => l.itemId === itemId)!.id;
  const ra = await ato("adjudicar", [
    { sel: 'input[name="data"]', valor: dia(-8), tipo: "data" }, { sel: 'input[name="autoridade"]', valor: "Secretário de Administração" }, { sel: 'input[name="documento"]', valor: "Termo de adjudicação" },
    ...[i1, i2, i3].map((i) => ({ sel: `input[name="linha"][value="${linha(i)}"]`, valor: "sim", tipo: "marcar" as const })),
  ]);
  conferir(ra.tipo === "ok", `adjudicação dos três itens (${ra.texto.slice(0, 50)})`);
  const adjs = await prisma.itemAdjudicado.findMany({ where: { itemDoResultadoId: { in: linhas.map((l) => l.id) } }, select: { id: true, itemDoResultadoId: true } });
  const adj = (itemId: string): string => adjs.find((a) => a.itemDoResultadoId === linha(itemId))!.id;
  const h1 = await ato("homologar-por-ato", [
    { sel: 'input[name="data"]', valor: dia(-5), tipo: "data" }, { sel: 'input[name="autoridade"]', valor: "Prefeito" }, { sel: 'input[name="documento"]', valor: "Termo de homologação" },
    { sel: `input[name="adjudicado"][value="${adj(i1)}"]`, valor: "sim", tipo: "marcar" }, { sel: `input[name="adjudicado"][value="${adj(i2)}"]`, valor: "sim", tipo: "marcar" },
  ]);
  conferir(h1.tipo === "ok", `homologação dos itens 1 e 2 (${h1.texto.slice(0, 50)})`);
  const ato1 = await prisma.atoDeHomologacao.findFirstOrThrow({ where: { processoId: proc.id }, select: { id: true } });
  const h2 = await ato("homologar-por-ato", [
    { sel: 'input[name="data"]', valor: dia(-3), tipo: "data" }, { sel: 'input[name="autoridade"]', valor: "Prefeito" }, { sel: 'input[name="documento"]', valor: "Termo de homologação retificado" },
    ...[i1, i2, i3].map((i) => ({ sel: `input[name="adjudicado"][value="${adj(i)}"]`, valor: "sim", tipo: "marcar" as const })),
    { sel: 'select[name="corrigeId"]', valor: ato1.id, tipo: "select" }, { sel: 'input[name="motivo"]', valor: "O item 3 ficou de fora do primeiro termo por lapso" },
  ]);
  const atos = await prisma.atoDeHomologacao.findMany({ where: { processoId: proc.id }, orderBy: { criadoEm: "asc" }, select: { id: true, corrigeId: true, _count: { select: { itens: true } } } });
  conferir(h2.tipo === "ok" && atos.length === 2 && atos[1]!.corrigeId === ato1.id && atos.map((a) => a._count.itens).join(",") === "2,3", `homologação corrigida por novo ato; o primeiro fica (${h2.texto.slice(0, 60)})`);

  // 5. contrato do resultado, ata e contrato pela ata — de novo pelo agente
  await sair(n, page);
  await entrar(n, page, agente, senhaDoAgente);
  const dadosDoContrato = (numero: string, inicio: string): CampoDoPercurso[] => [
    { sel: 'input[name="numeroContrato"]', valor: numero }, { sel: 'input[name="vigenciaInicio"]', valor: inicio, tipo: "data" },
    { sel: 'input[name="vigenciaFimInicial"]', valor: dia(300), tipo: "data" }, { sel: 'select[name="categoriaOrdemCronologica"]', valor: "FORNECIMENTO_BENS", tipo: "select" },
  ];
  const ctNum = `CT-${marca}`;
  const rc = await ato("contrato-do-resultado", [{ sel: 'select[name="participanteId"]', valor: pA, tipo: "select" }, { sel: `input[name="qtd_${linha(i1)}"]`, valor: "60" }, ...dadosDoContrato(ctNum, dia(-2))]);
  const ct = await prisma.contrato.findFirst({ where: { numeroContrato: ctNum }, select: { id: true, contratadoDocumento: true, valorInicial: true, itens: { select: { descricao: true, quantidade: true, valorUnitario: true } } } });
  conferir(rc.tipo === "ok" && ct !== null && ct.contratadoDocumento === A.documento && ct.valorInicial.toFixed(2) === "1740.00" && ct.itens.map((i) => `${i.descricao}|${i.quantidade.toFixed(4)}|${i.valorUnitario.toFixed(4)}`).join(";") === "Cimento CP-II 50 kg|60.0000|29.0000",
    `contrato do resultado com ${nomeA}, cimento 60 × 29,00 = 1.740,00 (${rc.texto.slice(0, 60)})`);
  const ataNum = `ARP-${marca}`;
  const rata = await ato("registrar-ata", [
    { sel: 'input[name="numero"]', valor: ataNum }, { sel: 'input[name="vigenciaInicio"]', valor: dia(-2), tipo: "data" }, { sel: 'input[name="vigenciaFim"]', valor: dia(360), tipo: "data" },
    { sel: 'input[name="documento"]', valor: "Ata de registro de preços" }, { sel: `input[name="qtdata_${linha(i2)}"]`, valor: "15" }, { sel: `input[name="qtdata_${linha(i3)}"]`, valor: "10" },
  ]);
  conferir(rata.tipo === "ok", `ata ${ataNum} registrada com ${nomeB} (${rata.texto.slice(0, 50)})`);
  const ata = await prisma.ataDeRegistroDePrecos.findFirstOrThrow({ where: { processoId: proc.id }, select: { id: true, itens: { select: { id: true, itemDoResultadoId: true } } } });
  const iaAreia = ata.itens.find((x) => x.itemDoResultadoId === linha(i2))!.id;
  await irPara(n, page, P);
  await page.select('form[data-acao="contrato-da-ata"] select[name="ataId"]', ata.id).catch(() => undefined);
  const ctAta = `CT-ATA-${marca}`;
  const rca = await preencherEEnviar(page, "contrato-da-ata", [
    { sel: 'select[name="ataId"]', valor: ata.id, tipo: "select" }, { sel: 'select[name="participanteId"]', valor: pB, tipo: "select" },
    { sel: `input[name="qtdcontratoata_${iaAreia}"]`, valor: "10" }, ...dadosDoContrato(ctAta, dia(-1)),
  ]);
  const cta = await prisma.contrato.findFirst({ where: { numeroContrato: ctAta }, select: { valorInicial: true } });
  conferir(rca.tipo === "ok" && cta?.valorInicial.toFixed(2) === "1050.00", `contrato pela ata: areia 10 × 105,00 = 1.050,00 (${rca.texto.slice(0, 60)})`);

  // 6. a tela: o saldo da ata e os atos
  await irPara(n, page, P);
  const saldo = await page.$$eval("[data-saldo-da-ata]", (ls) => ls.map((l) => l.getAttribute("data-saldo-da-ata") ?? ""));
  conferir(saldo.includes(`${ataNum}|2|5.0000|525.00`), `a tela mostra o saldo da ata do item 2: 5 m3, R$ 525,00 (${saldo.join(" ; ")})`);
  const corrigidos = await page.$$eval("[data-ato-corrigido]", (ls) => ls.map((l) => l.getAttribute("data-ato-corrigido") ?? ""));
  conferir(corrigidos.join(",") === "sim,nao", `a tela lista os dois atos de homologação, o primeiro corrigido (${corrigidos.join(",")})`);
  if (ct !== null) {
    const t = await irPara(n, page, `/licitacoes/contratos/${ct.id}`);
    conferir(/cimento cp-ii 50 kg/i.test(t), "o contrato do resultado abre com o item transportado");
  }
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso do resultado da licitação completo.");
