import "dotenv/config";
import type { Page } from "puppeteer-core";
import {
  entrar,
  irPara,
  lancarNavegadorDoPercurso,
  preencherEEnviar,
  registroDePassos,
  sair,
  texto,
  type Navegador,
} from "./percursos-navegador.js";

/**
 * ═══ O PERCURSO DO ACESSO À INFORMAÇÃO (V11 V5.3) ═══
 *
 * O que ele afirma, e por que cada um importa:
 *
 *  1. O pedido entra PELA TELA e nasce com a norma congelada — a tela mostra a data E a norma
 *     que a fixa, nunca a data sozinha.
 *  2. O rito anda: encaminhar tramita o processo junto; receber é ato de quem está no destino.
 *  3. A PRORROGAÇÃO é motivada, e ela MUDA a data. Dois textos, porque são duas coisas: o que
 *     instrui o processo e o que o cidadão lê.
 *  4. A PRÉVIA NÃO É RESPOSTA: ela fica na trilha interna, NÃO aparece para o requerente e NÃO
 *     inicia prazo de recurso. Esta é a afirmação central do lote — "prévia de resposta não
 *     equivale a resposta entregue" — e ela se prova no navegador, não no tipo.
 *  5. A REPETIÇÃO NÃO DUPLICA: reenviar o mesmo ato devolve "já estava registrado", e a trilha
 *     continua com um fato só.
 *  6. A NEGATIVA tem motivo: quem não tem a ação não recebe o formulário, e a tela diz por quê.
 *  7. O CIDADÃO vê a projeção dele, sem sessão — e o fundamento interno NÃO atravessa.
 *
 * Uso: PERCURSO_BANCO=<banco> ACESSO_JSON='{...}' npx tsx scripts/smoke-acesso-a-informacao.ts [base]
 */

interface Cenario {
  readonly sufixo: string;
  readonly exercicio: number;
  readonly assuntoId: string;
  readonly assuntoRotulo: string;
  readonly setorEntradaId: string;
  readonly setorEntradaRotulo: string;
  readonly setorDestinoId: string;
  readonly setorDestinoRotulo: string;
  readonly usuarioFraco: string;
}

const N: Navegador = { base: process.argv[2] ?? "http://localhost:3010" };
const SENHA = process.env["PERCURSOS_SENHA_PAPEIS"] ?? "Percurso#2026";
const ADMIN = process.env["SEED_IDENTIDADE"] ?? "admin@cg.pb.gov.br";
const SENHA_ADMIN = process.env["SEED_ADMIN_SENHA"] ?? "";
const C: Cenario = JSON.parse(process.env["ACESSO_JSON"] ?? "null") as Cenario;

const ROTA_LISTA = "/protocolo/acesso-a-informacao/pedidos";

/** O texto que NUNCA pode chegar ao requerente. */
const SEGREDO = `Consultar a procuradoria antes de responder (percurso ${C?.sufixo ?? ""})`;

async function conteudo(page: Page, seletor: string): Promise<string> {
  return page.evaluate((s) => document.querySelector(s)?.textContent?.trim() ?? "", seletor);
}

async function main(): Promise<void> {
  const R = registroDePassos();
  if (C === null) {
    R.conferir("preparação — ACESSO_JSON ausente: rode scripts/preparar-acesso-a-informacao.ts antes", false, "sem cenário");
    R.encerrar();
    return;
  }
  if (SENHA_ADMIN === "") {
    R.conferir("preparação — SEED_ADMIN_SENHA ausente", false, "sem senha do administrador");
    R.encerrar();
    return;
  }

  const navegador = await lancarNavegadorDoPercurso();
  const page = await navegador.newPage();
  page.setDefaultTimeout(120000);
  await page.setViewport({ width: 1366, height: 900 });

  try {
    console.log(`      [banco ${process.env["PERCURSO_BANCO"] ?? "não declarado"} · cenário ${C.sufixo}]`);

    // ══ 1. O PEDIDO ENTRA PELA TELA ═══════════════════════════════════════════
    await entrar(N, page, ADMIN, SENHA_ADMIN);
    await irPara(N, page, ROTA_LISTA);

    const pedidoTexto = `Relação dos contratos de obras vigentes e o valor pago em cada um (percurso ${C.sufixo}).`;
    const prot = await preencherEEnviar(page, "protocolar-pedido", [
      { sel: 'select[name="exercicio"]', valor: String(C.exercicio), tipo: "select" },
      { sel: 'select[name="assuntoId"]', valor: C.assuntoId, tipo: "select" },
      { sel: 'select[name="setorAberturaId"]', valor: C.setorEntradaId, tipo: "select" },
      { sel: 'input[name="contatoAnonimo"]', valor: `cidada-${C.sufixo}@exemplo.org` },
      { sel: 'textarea[name="pedido"]', valor: pedidoTexto },
    ]);
    R.conferir(
      "1.1 o pedido entra pela tela e a mensagem diz sob QUE versão da norma ele corre",
      prot.tipo === "ok" && /protocolado sob o n[úu]mero/i.test(prot.texto) && /vers[ãa]o \d+ da configura[çc][ãa]o/i.test(prot.texto),
      `${prot.tipo}: ${prot.texto.slice(0, 240)}`,
    );

    await irPara(N, page, ROTA_LISTA);
    const protocolo = await page.evaluate(() => {
      const tr = document.querySelector("tr[data-pedido]");
      return tr?.getAttribute("data-pedido") ?? "";
    });
    R.conferir("1.2 o pedido aparece na lista, com protocolo", protocolo !== "", `protocolo lido: "${protocolo}"`);

    const href = await page.evaluate((p) => {
      const a = document.querySelector(`a[data-abrir-pedido="${p}"]`);
      return a?.getAttribute("href") ?? "";
    }, protocolo);
    R.conferir("1.3 a lista leva ao pedido", href.startsWith(ROTA_LISTA), href);
    await irPara(N, page, href);

    const prazoInicial = await conteudo(page, "[data-prazo-do-pedido] [data-limite]");
    const norma = await conteudo(page, "[data-prazo-do-pedido] [data-norma]");
    R.conferir(
      "1.4 a tela mostra a DATA e a NORMA que a fixa — nunca a data sozinha",
      /^\d{2}\/\d{2}\/\d{4}$/.test(prazoInicial) && /Lei federal/i.test(norma),
      `limite=${prazoInicial} · norma=${norma.slice(0, 120)}`,
    );

    // ══ 2. O RITO ANDA, E O PROCESSO ANDA JUNTO ═══════════════════════════════
    const dist = await preencherEEnviar(page, "distribuir-pedido", [
      { sel: 'select[name="setorDestinoId"]', valor: C.setorDestinoId, tipo: "select" },
      { sel: 'textarea[name="fundamentoInterno"]', valor: SEGREDO },
    ]);
    R.conferir(
      "2.1 encaminhar ao setor TRAMITA o processo no mesmo ato",
      dist.tipo === "ok" && /tramitação do processo/i.test(dist.texto),
      `${dist.tipo}: ${dist.texto.slice(0, 200)}`,
    );

    // ⚠️ REPETIR O MESMO ATO, E O QUE A PRIMEIRA EXECUÇÃO ENSINOU. A reserva de comando
    // (`__chave`) é um NÚMERO NOVO a cada envio: ela dá no-máximo-uma-vez para o clique duplo e
    // para o retry de rede, e não para "a pessoa mandou de novo". Então o segundo encaminhamento
    // NÃO é replay — é um ato novo, e quem o julga é o domínio. Ele recusa, com o motivo, e
    // NADA é gravado: a transação inteira volta atrás, inclusive o fato que já tinha sido
    // escrito antes da recusa do trâmite.
    const distDeNovo = await preencherEEnviar(page, "distribuir-pedido", [
      { sel: 'select[name="setorDestinoId"]', valor: C.setorDestinoId, tipo: "select" },
      { sel: 'textarea[name="fundamentoInterno"]', valor: SEGREDO },
    ]);
    R.conferir(
      "2.2 repetir o encaminhamento para o MESMO setor é recusado com o motivo — e nada é gravado",
      distDeNovo.tipo === "erro" && /j[áa] est[áa] neste setor/i.test(distDeNovo.texto) && /Nada foi gravado/i.test(distDeNovo.texto),
      `${distDeNovo.tipo}: ${distDeNovo.texto.slice(0, 220)}`,
    );

    await irPara(N, page, href);
    const trilhaDepoisDaRepeticao = await page.$$eval('[data-trilha-interna] li[data-fato="PEDIDO_DISTRIBUIDO"]', (n) => n.length);
    R.conferir(
      "2.3 recarregada, a trilha tem UM encaminhamento — a repetição não deixou rastro dobrado",
      trilhaDepoisDaRepeticao === 1,
      `encaminhamentos na trilha: ${trilhaDepoisDaRepeticao}`,
    );

    const rec = await preencherEEnviar(page, "receber-pedido", []);
    R.conferir(
      "2.4 o setor recebe, e o processo é recebido junto",
      rec.tipo === "ok" && /recebido no setor/i.test(rec.texto),
      `${rec.tipo}: ${rec.texto.slice(0, 200)}`,
    );

    // ══ 3. A PRORROGAÇÃO MUDA A DATA ══════════════════════════════════════════
    await irPara(N, page, href);
    // ⚠️ AQUI NÃO SE AFIRMA A MENSAGEM, E O MOTIVO É DO PRODUTO, NÃO DO ROTEIRO: a configuração
    // permite UMA prorrogação, então, assim que ela é registrada, o formulário SAI da tela — e
    // com ele a confirmação. O que se afirma é o EFEITO, que é o que importa e o que sobrevive
    // à recarga. (O aviso que fica quando um ato remove o próprio formulário é a pendência
    // `CONFIRMACAO-DE-ATO-QUE-SAI-DA-TELA`.)
    await preencherEEnviar(page, "prorrogar-pedido", [
      { sel: 'textarea[name="fundamentoInterno"]', valor: SEGREDO },
      { sel: 'textarea[name="mensagemAoRequerente"]', valor: "O prazo foi prorrogado para o levantamento dos documentos pedidos." },
    ]);

    await irPara(N, page, href);
    const prazoDepois = await conteudo(page, "[data-prazo-do-pedido] [data-limite]");
    const prorrogacoes = await conteudo(page, "[data-prazo-do-pedido] [data-prorrogacoes]");
    R.conferir(
      "3.1 recarregada, a DATA MUDOU e a contagem de prorrogações subiu — o prazo não é decorativo",
      prazoDepois !== prazoInicial && prorrogacoes === "1",
      `antes=${prazoInicial} depois=${prazoDepois} prorrogações=${prorrogacoes}`,
    );

    // A segunda prorrogação não cabe: a configuração permite uma. E a tela diz POR QUÊ.
    await irPara(N, page, href);
    const semSegunda = await conteudo(page, "[data-sem-prorrogacao]");
    R.conferir(
      "3.2 NEGATIVA: a segunda prorrogação não é oferecida, e a tela diz o MOTIVO em vez de sumir",
      semSegunda.includes("Prorrogar") && semSegunda.length > 40,
      semSegunda.slice(0, 200),
    );

    // ══ 4. A PRÉVIA NÃO É RESPOSTA ════════════════════════════════════════════
    const previa = await preencherEEnviar(page, "responder-pedido-previa", [
      { sel: 'textarea[name="fundamentoInterno"]', valor: `Minuta em elaboração pela assessoria (percurso ${C.sufixo}).` },
    ]);
    R.conferir(
      "4.1 a prévia é registrada, e a mensagem diz que ela NÃO foi entregue",
      previa.tipo === "ok" && /ainda n[ãa]o entregue/i.test(previa.texto) && /n[ãa]o inicia prazo de recurso/i.test(previa.texto),
      `${previa.tipo}: ${previa.texto.slice(0, 240)}`,
    );

    await irPara(N, page, href);
    const temPrevia = (await page.$('[data-trilha-interna] li[data-fato="RESPOSTA_PREVIA_REGISTRADA"]')) !== null;
    const semRespostaAoRequerente = (await page.$("[data-sem-resposta-ao-requerente]")) !== null;
    R.conferir(
      "4.2 a prévia está na trilha INTERNA e o requerente continua SEM resposta — as duas coisas ao mesmo tempo",
      temPrevia && semRespostaAoRequerente,
      `prévia na trilha=${temPrevia} · requerente sem resposta=${semRespostaAoRequerente}`,
    );

    // ══ 5. A RESPOSTA ENTREGUE ════════════════════════════════════════════════
    const RESPOSTA = "Segue a relação dos contratos de obras vigentes e os valores pagos, conforme solicitado.";
    const entrega = await preencherEEnviar(page, "responder-pedido-entregar", [
      { sel: 'select[name="classificacao"]', valor: "ACESSO_CONCEDIDO", tipo: "select" },
      { sel: 'textarea[name="mensagemAoRequerente"]', valor: RESPOSTA },
      { sel: 'textarea[name="fundamentoInterno"]', valor: SEGREDO },
    ]);
    R.conferir(
      "5.1 a resposta é ENTREGUE, e a mensagem diz que agora o prazo de recurso corre",
      entrega.tipo === "ok" && /ENTREGUE/i.test(entrega.texto) && /prazo de recurso/i.test(entrega.texto),
      `${entrega.tipo}: ${entrega.texto.slice(0, 240)}`,
    );

    const segunda = await preencherEEnviar(page, "responder-pedido-entregar", [
      { sel: 'select[name="classificacao"]', valor: "ACESSO_NEGADO", tipo: "select" },
      { sel: 'textarea[name="mensagemAoRequerente"]', valor: "Uma segunda resposta, que não pode existir." },
      { sel: 'textarea[name="fundamentoInterno"]', valor: SEGREDO },
    ]);
    R.conferir(
      "5.2 NEGATIVA: responder DUAS VEZES é recusado, e a recusa tem código próprio (não um 'não foi possível')",
      segunda.tipo === "erro" && /PEDIDO-JA-RESPONDIDO/.test(segunda.texto),
      `${segunda.tipo}: ${segunda.texto.slice(0, 240)}`,
    );

    // ══ 6. O RECURSO ══════════════════════════════════════════════════════════
    await irPara(N, page, href);
    const recurso = await preencherEEnviar(page, "interpor-recurso", [
      { sel: 'textarea[name="razoes"]', valor: "A relação veio sem os valores pagos, que é justamente o que eu pedi." },
    ]);
    R.conferir("6.1 o recurso do requerente é registrado pelo setor recursal", recurso.tipo === "ok", `${recurso.tipo}: ${recurso.texto.slice(0, 200)}`);

    await irPara(N, page, href);
    const decisao = await preencherEEnviar(page, "decidir-recurso", [
      { sel: 'select[name="resultado"]', valor: "PROVIDO_EM_PARTE", tipo: "select" },
      { sel: 'textarea[name="mensagemAoRequerente"]', valor: "O recurso foi provido em parte: os valores pagos serão enviados." },
      { sel: 'textarea[name="fundamentoInterno"]', valor: SEGREDO },
    ]);
    R.conferir("6.2 o recurso é decidido", decisao.tipo === "ok", `${decisao.tipo}: ${decisao.texto.slice(0, 200)}`);

    // ══ 7. A NEGATIVA POR FALTA DE AÇÃO ═══════════════════════════════════════
    await sair(N, page);
    await entrar(N, page, C.usuarioFraco, SENHA);
    await irPara(N, page, ROTA_LISTA);
    const semFormulario = await conteudo(page, "[data-sem-formulario]");
    const veALista = (await page.$("[data-lista-de-pedidos]")) !== null;
    R.conferir(
      "7.1 quem NÃO tem a ação não recebe o formulário — e lê o motivo, em vez de uma tela que some",
      /n[ãa]o tem a a[çc][ãa]o de protocolar/i.test(semFormulario) && veALista,
      `motivo="${semFormulario.slice(0, 160)}" · vê a lista=${veALista}`,
    );

    await irPara(N, page, href);
    const formsDoFraco = await page.$$eval("form[data-acao]", (n) => n.map((f) => f.getAttribute("data-acao")));
    R.conferir(
      "7.2 no detalhe, ele também não recebe nenhum formulário do rito — a tela não oferece o que o servidor recusaria",
      formsDoFraco.length === 0,
      `formulários oferecidos: ${JSON.stringify(formsDoFraco)}`,
    );

    // ══ 8. O CIDADÃO, SEM SESSÃO ══════════════════════════════════════════════
    const codigo = await (async (): Promise<string> => {
      await sair(N, page);
      await entrar(N, page, ADMIN, SENHA_ADMIN);
      await irPara(N, page, href);
      const t = await conteudo(page, "[data-visao-do-requerente]");
      void t;
      return page.evaluate(() => {
        const m = /o c[óo]digo ([A-Z0-9]{6,12})/.exec(document.body.textContent ?? "");
        return m?.[1] ?? "";
      });
    })();
    R.conferir("8.1 a tela interna mostra o código que o cidadão usa para consultar", codigo !== "", `código: ${codigo}`);

    await sair(N, page);
    const [numero, ano] = protocolo.split("/");
    await irPara(N, page, `/consulta?numero=${numero}&exercicio=${ano}&verificador=${codigo}`);
    const corpoPublico = await texto(page);
    const temPedido = (await page.$("[data-pedido-de-acesso]")) !== null;
    const respostaPublica = await conteudo(page, "[data-resposta-do-acesso]");
    R.conferir(
      "8.2 SEM SESSÃO, o cidadão vê o pedido dele: a data prometida, a norma e a resposta entregue",
      temPedido && respostaPublica.includes(RESPOSTA.slice(0, 40)) && /Lei federal/i.test(corpoPublico),
      `${corpoPublico.slice(0, 200)}`,
    );

    R.conferir(
      "8.3 NEGATIVA: o FUNDAMENTO INTERNO não atravessa, e a PRÉVIA não existe para ele",
      !corpoPublico.includes(SEGREDO) && !corpoPublico.toLowerCase().includes("minuta em elabora"),
      `o segredo aparece=${corpoPublico.includes(SEGREDO)}`,
    );

    R.conferir(
      "8.4 e a prorrogação que ele PRECISA saber está lá, com a mensagem que lhe foi dirigida",
      /prorrogado para o levantamento/i.test(corpoPublico),
      corpoPublico.slice(0, 200),
    );
  } finally {
    await navegador.close();
  }

  R.encerrar();
}

void main();
