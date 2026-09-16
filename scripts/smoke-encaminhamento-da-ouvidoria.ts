import "dotenv/config";
import { execFileSync } from "node:child_process";
import type { Page } from "puppeteer";
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
 * ═══ O PERCURSO DO ENCAMINHAMENTO DA OUVIDORIA (V9 N3) ═══
 *
 * A jornada que estava faltando desde o V7: a ouvidoria recebe uma manifestação anônima, tria, e
 * **encaminha a quem de fato responde** — porque a maioria dos casos não é dela, é da saúde, da
 * obra, da fiscalização. Sem isso, a mesa da ouvidoria é uma caixa de entrada que só acumula.
 *
 * ⚠️ TRÊS PESSOAS COM AS MESMAS AÇÕES, e é esse o ponto do percurso. Ouvidor, saúde e obras têm
 * exatamente as mesmas quatro permissões, no ente inteiro. O que as separa é a LOTAÇÃO — e é a
 * lotação que decide quem vê e quem age numa manifestação sigilosa. Se o percurso passasse com
 * permissões diferentes, ele estaria provando a permissão, não o sigilo.
 *
 * ⚠️ E ELE CONFERE O ANÔNIMO NO FIM. O segredo é a única identidade que o manifestante tem; se o
 * encaminhamento o invalidasse, a manifestação viraria um buraco. E o despacho INTERNO entre
 * setores não pode aparecer para ele.
 */

const BASE = process.argv[2] ?? "http://localhost:3010";
const SENHA = process.env["PERCURSOS_SENHA_PAPEIS"] ?? "Percurso#2026";
const OUVIDOR = "ouvidor@percursos.local";
const SAUDE = "saude@percursos.local";
const OBRAS = "obras-alheio@percursos.local";
const n: Navegador = { base: BASE };
const r = registroDePassos();

/** A fixture é preparada pelo PRÓPRIO percurso, em banco de percurso — nunca em banco de valor. */
const preparado = JSON.parse(
  execFileSync("npx", ["tsx", "scripts/preparar-ouvidoria-percursos.ts"], {
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: process.env["DATABASE_URL_PERCURSOS"] ?? "" },
  }).trim().split("\n").at(-1) as string
) as { protocolo: string; segredo: string; setores: { ouvidoria: string; saude: string; obras: string } };

console.log(`[fixture] manifestação ${preparado.protocolo} criada para este percurso.`);

const MOTIVO = "Denúncia sobre fila na unidade básica: compete à Saúde apurar e responder ao manifestante.";

/**
 * ⚠️ O SELETOR É ESCOPADO PELO PROTOCOLO, E ISSO FOI MEDIDO (16/09/2026).
 *
 * A mesa da ouvidoria lista VÁRIAS manifestações, cada uma com o seu formulário. Um seletor
 * `form[data-acao="encaminhar-manifestacao"]` casa a PRIMEIRA da página — que pode ser de outro
 * caso. O envio ia para o cartão certo (o `__processo` é do cartão), mas a LEITURA do resultado
 * caía no formulário de outro cartão, que não tinha mensagem nenhuma: o percurso lia "silêncio" e
 * concluía que a tela não confirmou, com a confirmação visível na página ao lado.
 *
 * `data-manifestacao-alvo` existe nos formulários exatamente para isto.
 */
const doCartao = (acao: string): string => `form[data-acao="${acao}"][data-manifestacao-alvo="${preparado.protocolo}"]`;

/**
 * O CARTÃO DA MANIFESTAÇÃO, COM OS `<details>` ABERTOS.
 *
 * ⚠️ `innerText` DE UM `<details>` FECHADO É VAZIO. O histórico mora atrás de uma divulgação
 * progressiva; lê-lo fechado devolve silêncio, e o percurso concluiria "o histórico não registrou
 * o movimento" quando o movimento está lá. É o mesmo defeito que o percurso da medição pela
 * planilha já tinha corrigido do lado do formulário (`bc152d6`) — aqui é do lado da LEITURA.
 */
async function cartao(page: Page): Promise<string> {
  return page.evaluate((p) => {
    const li = document.querySelector(`[data-manifestacao="${p}"]`);
    if (li === null) return "";
    for (const d of li.querySelectorAll("details")) (d as HTMLDetailsElement).open = true;
    return (li as HTMLElement).innerText.replace(/\s+/g, " ").toLowerCase();
  }, preparado.protocolo);
}

const navegador = await lancarNavegadorDoPercurso();
try {
  const page = await navegador.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // ── 1. O OUVIDOR VÊ, TRIA E ENCAMINHA ───────────────────────────────────
  await entrar(n, page, OUVIDOR, SENHA);
  await irPara(n, page, "/protocolo/ouvidoria");
  const vistaDoOuvidor = await cartao(page);
  r.conferir("o ouvidor alcança a manifestação sigilosa (está lotado na ouvidoria)", vistaDoOuvidor !== "", "o cartão da manifestação não apareceu na mesa");
  r.conferir("a mesa diz ONDE a manifestação está", vistaDoOuvidor.includes("onde está") && vistaDoOuvidor.includes("ouvidoria"), vistaDoOuvidor.slice(0, 300));

  const triou = await preencherEEnviar(page, doCartao("triar-manifestacao"), [
    { sel: 'select[name="tipoConfirmado"]', valor: "DENUNCIA", tipo: "select" },
    { sel: 'textarea[name="anotacaoInterna"]', valor: "Triagem interna: procede; competência da Saúde." },
  ]);
  r.conferir("a triagem é registrada", triou.tipo !== "erro", triou.texto.slice(0, 200));

  await irPara(n, page, "/protocolo/ouvidoria");
  const encaminhou = await preencherEEnviar(page, doCartao("encaminhar-manifestacao"), [
    // ⚠️ O VALOR DA OPÇÃO É O ID DO SETOR, não o código. Medido em 16/09/2026: passando "SAU",
    // o `select` do puppeteer não casa opção nenhuma, o navegador fica com a PRIMEIRA opção
    // habilitada (Gabinete, por ordem de código) e o percurso encaminha para o setor errado —
    // e passa, porque encaminhar para o Gabinete também funciona. Um percurso que escolhe pelo
    // rótulo errado prova o mecanismo e não prova a escolha.
    { sel: 'select[name="setorDestinoId"]', valor: preparado.setores.saude, tipo: "select" },
    { sel: 'textarea[name="motivo"]', valor: MOTIVO },
  ]);
  r.conferir("o encaminhamento é aceito e a tela CONFIRMA", encaminhou.tipo === "ok", `${encaminhou.tipo}: ${encaminhou.texto.slice(0, 300)}`);
  r.conferir(
    "a mensagem diz que o prazo começa no RECEBIMENTO, não no envio",
    encaminhou.texto.toLowerCase().includes("receb"),
    encaminhou.texto.slice(0, 300)
  );

  const depoisDoEnvio = await irPara(n, page, "/protocolo/ouvidoria").then(() => cartao(page));
  r.conferir(
    "recarregada, a mesa mostra a manifestação NO DESTINO — a persistência, não o estado do componente",
    depoisDoEnvio.includes("secretaria de saúde") || depoisDoEnvio.includes("secretaria de saude"),
    depoisDoEnvio.slice(0, 400)
  );
  r.conferir("e diz que aguarda recebimento", depoisDoEnvio.includes("aguardando recebimento"), depoisDoEnvio.slice(0, 400));
  r.conferir("o histórico registra o movimento com o motivo", depoisDoEnvio.includes("encaminhada"), depoisDoEnvio.slice(0, 600));
  r.conferir(
    "o ouvidor NÃO pode receber em nome do destino",
    depoisDoEnvio.includes("só quem está lotado") || !depoisDoEnvio.includes("receber neste setor"),
    depoisDoEnvio.slice(0, 600)
  );
  await sair(n, page);

  // ── 2. O SETOR ALHEIO NÃO ALCANÇA ───────────────────────────────────────
  await entrar(n, page, OBRAS, SENHA);
  await irPara(n, page, "/protocolo/ouvidoria");
  const vistaDeObras = await cartao(page);
  r.conferir(
    "obras, com as MESMAS ações e sem lotação no caminho, NÃO alcança a manifestação sigilosa",
    vistaDeObras === "",
    `obras leu o cartão: ${vistaDeObras.slice(0, 300)}`
  );
  const corpoDeObras = await texto(page);
  r.conferir(
    "e o relato não aparece em lugar nenhum da página de obras",
    !corpoDeObras.includes("fila de três horas") && !corpoDeObras.includes("fila de tres horas"),
    corpoDeObras.slice(0, 300)
  );
  await sair(n, page);

  // ── 3. A SAÚDE RECEBE E TRABALHA O CASO ─────────────────────────────────
  await entrar(n, page, SAUDE, SENHA);
  await irPara(n, page, "/protocolo/ouvidoria");
  const vistaDaSaude = await cartao(page);
  r.conferir("a saúde passa a alcançar o caso encaminhado a ela", vistaDaSaude !== "", "o cartão não apareceu para o setor de destino");
  r.conferir("e lê o MOTIVO do encaminhamento no histórico", vistaDaSaude.includes("compete à saúde") || vistaDaSaude.includes("compete a saude"), vistaDaSaude.slice(0, 600));

  const recebeu = await preencherEEnviar(page, doCartao("receber-manifestacao"), []);
  r.conferir("o destino recebe", recebeu.tipo !== "erro", recebeu.texto.slice(0, 300));

  const depoisDeReceber = await irPara(n, page, "/protocolo/ouvidoria").then(() => cartao(page));
  r.conferir("recarregada, deixa de aguardar recebimento", !depoisDeReceber.includes("aguardando recebimento"), depoisDeReceber.slice(0, 400));

  const respondeu = await preencherEEnviar(page, doCartao("responder-manifestacao"), [
    { sel: 'textarea[name="texto"]', valor: "Apuramos a fila e reforçamos a escala de atendimento nas manhãs." },
  ]);
  r.conferir("e o setor de destino CONSEGUE TRABALHAR o caso: responde ao manifestante", respondeu.tipo !== "erro", respondeu.texto.slice(0, 300));
  await sair(n, page);

  // ── 4. O ANÔNIMO, SEM CONTA, CONTINUA ACOMPANHANDO ──────────────────────
  await page.goto(`${BASE}/ouvidoria/acompanhar`, { waitUntil: "domcontentloaded" });
  await preencherEEnviar(page, "acompanhar-manifestacao", [
    { sel: 'input[name="protocolo"]', valor: preparado.protocolo },
    { sel: 'input[name="segredo"]', valor: preparado.segredo },
  ]);
  // ⚠️ O RESULTADO DO ACOMPANHAMENTO MORA FORA DO FORMULÁRIO, numa `<section
  // data-acompanhamento>` — de propósito, porque ele não é a confirmação de um ato, é a consulta.
  // Lê-se de lá; procurá-lo dentro do form devolveria silêncio para uma consulta que funcionou.
  await page.waitForSelector("[data-acompanhamento], [data-manifestacao-nao-encontrada]", { timeout: 30000 });
  const acompanhamento = await page.evaluate(() => {
    const s = document.querySelector("[data-acompanhamento]");
    return s === null ? "" : (s as HTMLElement).innerText.replace(/\s+/g, " ");
  });
  const publico = acompanhamento.toLowerCase();
  r.conferir(
    "o MESMO segredo continua abrindo a manifestação depois do encaminhamento",
    publico.includes("escala"),
    acompanhamento.slice(0, 400) || "(nenhuma seção de acompanhamento na página)"
  );
  r.conferir(
    "o motivo do encaminhamento (despacho interno) NÃO aparece ao manifestante",
    !publico.includes("compete à saúde") && !publico.includes("compete a saude"),
    acompanhamento.slice(0, 400)
  );
  r.conferir(
    "nem a anotação interna da triagem",
    !publico.includes("triagem interna"),
    acompanhamento.slice(0, 400)
  );
} finally {
  await navegador.close();
}

r.encerrar();
