import "dotenv/config";
import type { Page } from "puppeteer-core";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
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
import type { PrismaClient } from "../prisma/generated/client/client.js";

/**
 * ═══ O PERCURSO DO GUICHÊ (V11 V8 + V8.1) ═══
 *
 * TR 5.39.92: "Permitir o agendamento de atendimentos presenciais, conforme guichês organizados
 * pela contratante." O domínio ficou provado contra o Postgres na unidade anterior; **não estava
 * provado pela tela**, e "não declarar percurso concluído porque foi escrito ou tipado" vale aqui
 * inteiro.
 *
 * O que este percurso afirma, tudo PELA TELA e em instalação limpa:
 *
 *  1. A ORGANIZAÇÃO inteira entra pela tela: unidade, guichê, o que ele atende e a oferta de
 *     horários. E a AUSÊNCIA aparece: um guichê recém-criado diz, na tela, que não atende serviço
 *     nenhum e que não tem horário publicado — não um "8h às 17h" plausível.
 *  2. A OFERTA sai da janela publicada, com as vagas, e a MARCAÇÃO grava com código.
 *  3. ⚠️ O HORÁRIO LOTADO SOME DA LISTA. É a afirmação central da tela: as vagas que ela mostra
 *     saem da MESMA contagem que a gravação subtrai dentro da transação.
 *  4. OS FATOS mudam a reserva sem reescrevê-la: confirmar, remarcar (o horário de origem é
 *     LIBERADO na tela) e registrar o atendimento.
 *  5. FECHAR O DIA é recusado enquanto há gente marcada, NOMEANDO quantas — e passa depois que
 *     ela é cancelada, mesmo com um atendimento já realizado no mesmo dia.
 *  5. ⚠️ O CIDADÃO MARCA SOZINHO, SEM CONTA (V8.1). O ente ABRE o serviço à internet pela tela
 *     interna, e só então ele aparece no portal. O cidadão escolhe o dia, marca, recebe um
 *     código de acompanhamento que aparece UMA vez, consulta e cancela — e a marcação dele
 *     chega à agenda de quem atende, marcada como dados a conferir. Nada disso toca o cadastro
 *     de pessoas.
 *  6. A NEGATIVA tem motivo: a tela RENDERIZA o formulário para quem só lê o protocolo, e o
 *     SERVIDOR recusa dizendo qual ação falta.
 *
 * Uso: PERCURSO_BANCO=<banco> GUICHE_JSON='{...}' npx tsx scripts/smoke-guiche.ts [base]
 */

interface Cenario {
  readonly sufixo: string;
  readonly setorCodigo: string;
  readonly setorNome: string;
  readonly servicoId: string;
  readonly servicoTitulo: string;
  readonly documento: string;
  readonly nomeDaPessoa: string;
  readonly segunda: string;
  readonly segundaSeguinte: string;
  readonly usuarioFraco: string;
}

const N: Navegador = { base: process.argv[2] ?? "http://localhost:3010" };
const SENHA = process.env["PERCURSOS_SENHA_PAPEIS"] ?? "Percurso#2026";
const ADMIN = process.env["SEED_IDENTIDADE"] ?? "admin@cg.pb.gov.br";
const SENHA_ADMIN = process.env["SEED_ADMIN_SENHA"] ?? "";
const C: Cenario = JSON.parse(process.env["GUICHE_JSON"] ?? "null") as Cenario;

const UNIDADE = `PERC${C?.sufixo ?? "000000"}`;
const GUICHE = `Guiche do percurso ${C?.sufixo ?? "000000"}`;
const ORGANIZACAO = "/protocolo/guiches";

const br = (dia: string): string => dia.split("-").reverse().join("/");

/** Abre um painel de formulário clicando no botão que o revela — o que a pessoa faz. */
async function abrirPainel(page: Page, rotulo: string): Promise<boolean> {
  await page.bringToFront();
  const achou = await page.evaluate((r) => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.trim() === r);
    if (b === undefined || (b as HTMLButtonElement).disabled) return false;
    (b as HTMLButtonElement).click();
    return true;
  }, rotulo);
  if (achou) await page.waitForSelector("form[data-acao]", { timeout: 15000 });
  return achou;
}

/** Quando o envio some sem dizer nada, é isto que conta o que estava na tela. */
async function porQueNaoEnviou(page: Page, acao: string): Promise<string> {
  return page.evaluate((a) => {
    const f = document.querySelector(`form[data-acao="${a}"]`);
    if (f === null) return "o formulário NÃO ESTÁ na tela (fechou ou nunca abriu)";
    const b = f.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    const campos = [...f.querySelectorAll("input, select")]
      .map((e) => {
        const el = e as HTMLInputElement | HTMLSelectElement;
        return `${el.name !== "" ? el.name : "(sem nome)"}="${el.value}"`;
      })
      .join(" · ");
    const alerta = f.querySelector('[role="alert"]')?.textContent?.trim() ?? "";
    return `botão ${b === null ? "AUSENTE" : b.disabled ? "DESABILITADO" : "habilitado"} | alerta: ${
      alerta === "" ? "(nenhum)" : alerta
    } | campos: ${campos}`;
  }, acao);
}

/**
 * ESCOLHE UMA OPÇÃO PELO RÓTULO VISÍVEL — o que a pessoa faz.
 *
 * ⚠️ NÃO PELO `value`. Os ids de unidade e de guichê nascem NA TELA, neste percurso; procurá-los
 * no banco para depois escolhê-los aqui faria o percurso saber algo que a pessoa na frente do
 * computador não sabe — e deixaria de provar que a tela mostra o que ela precisa para escolher.
 *
 * ⚠️ E USA O SETTER DO PROTÓTIPO, pelo mesmo motivo do `tipo: "data"` do helper compartilhado:
 * num campo controlado pelo React a atribuição direta é ignorada, e o percurso enviaria o valor
 * vazio lendo "silêncio".
 */
async function escolherPorRotulo(page: Page, acao: string, campo: string, parte: string): Promise<boolean> {
  return page.evaluate(
    (a, c, t) => {
      const sel = document.querySelector(`form[data-acao="${a}"] select[name="${c}"]`);
      if (!(sel instanceof HTMLSelectElement)) return false;
      const op = [...sel.options].find((o) => o.textContent?.includes(t) === true);
      if (op === undefined) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
      if (setter !== undefined) setter.call(sel, op.value);
      else sel.value = op.value;
      sel.dispatchEvent(new Event("input", { bubbles: true }));
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      return sel.value === op.value && op.value !== "";
    },
    acao, campo, parte
  );
}

/** Os horários que o `select` da marcação está oferecendo, com os rótulos. */
async function horariosOferecidos(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => {
    const s = document.querySelector('form[data-acao="marcar-atendimento"] select[name="horaInicio"]');
    if (!(s instanceof HTMLSelectElement)) return [];
    return [...s.options].map((o) => o.value).filter((v) => v !== "");
  });
}

async function main(): Promise<void> {
  const R = registroDePassos();
  if (C === null) {
    R.conferir("preparação — GUICHE_JSON ausente: rode scripts/preparar-guiche.ts antes", false, "sem cenário");
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
  const url = process.env["DATABASE_URL"] ?? "";
  const prisma = url === "" ? null : (criarPrismaClient(url) as unknown as PrismaClient);

  try {
    console.log(`      [banco ${process.env["PERCURSO_BANCO"] ?? "não declarado"} · cenário ${C.sufixo} · segunda ${br(C.segunda)}]`);

    // ═══ 1. A ORGANIZAÇÃO, PELA TELA ═══════════════════════════════════════
    await entrar(N, page, ADMIN, SENHA_ADMIN);
    const corpo1 = await irPara(N, page, ORGANIZACAO);
    R.conferir("1.1 a tela do atendimento presencial abre", corpo1.includes("atendimento presencial"), corpo1.slice(0, 200));

    R.conferir("1.2 o painel da unidade abre", await abrirPainel(page, "Abrir unidade"), "o botão 'Abrir unidade' não está na tela");
    R.conferir(
      "1.2b o setor responsável é escolhido pelo NOME que a tela mostra",
      await escolherPorRotulo(page, "abrir-unidade-de-atendimento", "setorId", C.setorNome),
      `o setor "${C.setorNome}" não está no select da unidade`
    );
    const r1 = await preencherEEnviar(page, "abrir-unidade-de-atendimento", [
      { sel: 'input[name="codigo"]', valor: UNIDADE },
      { sel: 'input[name="nome"]', valor: `Sede do percurso ${C.sufixo}` },
      { sel: 'input[name="endereco"]', valor: "Praca Central, 1 - Centro" },
    ]);
    R.conferir(
      `1.3 a unidade ${UNIDADE} é aberta PELA TELA e o ato confirma`,
      r1.tipo === "ok" && r1.texto.includes(UNIDADE),
      r1.tipo === "silencio" ? await porQueNaoEnviou(page, "abrir-unidade-de-atendimento") : `${r1.tipo}: ${r1.texto}`
    );

    await irPara(N, page, ORGANIZACAO);
    await abrirPainel(page, "Criar guichê");
    await escolherPorRotulo(page, "abrir-guiche", "unidadeId", UNIDADE);
    const r2 = await preencherEEnviar(page, "abrir-guiche", [{ sel: 'input[name="nome"]', valor: GUICHE }]);
    R.conferir(
      `1.4 o guichê é criado e o ato confirma que ele nasce SEM serviço e SEM horário`,
      r2.tipo === "ok" && r2.texto.includes("não atende serviço nenhum"),
      r2.tipo === "silencio" ? await porQueNaoEnviou(page, "abrir-guiche") : `${r2.tipo}: ${r2.texto}`
    );

    // ⚠️ A AUSÊNCIA APARECE NA TELA. É a afirmação que separa este sistema de um que "assume"
    // um expediente: quem organiza precisa VER que o guichê ainda não oferece nada.
    const corpo2 = await irPara(N, page, ORGANIZACAO);
    R.conferir(
      "1.5 a tela DIZ que o guichê não atende nada e não tem oferta publicada",
      corpo2.includes("nenhum serviço") && corpo2.includes("sem oferta publicada"),
      "a tela não nomeia a ausência de serviço e de oferta"
    );

    await abrirPainel(page, "Gravar");
    await escolherPorRotulo(page, "definir-servico-do-guiche", "guicheId", GUICHE);
    await escolherPorRotulo(page, "definir-servico-do-guiche", "servicoId", C.servicoTitulo);
    const r3 = await preencherEEnviar(page, "definir-servico-do-guiche", [
      { sel: 'select[name="habilitado"]', valor: "sim", tipo: "select" },
    ]);
    R.conferir(
      "1.6 o serviço é habilitado no guichê PELA TELA",
      r3.tipo === "ok" && r3.texto.includes("habilitado"),
      r3.tipo === "silencio" ? await porQueNaoEnviou(page, "definir-servico-do-guiche") : `${r3.tipo}: ${r3.texto}`
    );

    await irPara(N, page, ORGANIZACAO);
    await abrirPainel(page, "Publicar oferta");
    await escolherPorRotulo(page, "publicar-oferta-de-horarios", "guicheId", GUICHE);
    const r4 = await preencherEEnviar(page, "publicar-oferta-de-horarios", [
      { sel: 'select[name="diaDaSemana"]', valor: "1", tipo: "select" },
      { sel: 'input[name="horaInicio"]', valor: "08:00", tipo: "data" },
      { sel: 'input[name="horaFim"]', valor: "10:00", tipo: "data" },
      { sel: 'input[name="duracaoMinutos"]', valor: "30", tipo: "data" },
      { sel: 'input[name="capacidade"]', valor: "1", tipo: "data" },
      { sel: 'input[name="vigenciaInicio"]', valor: C.segunda, tipo: "data" },
    ]);
    R.conferir(
      "1.7 a oferta é publicada e o ato diz QUANTOS horários ela gera",
      r4.tipo === "ok" && r4.texto.includes("4 horário(s)"),
      r4.tipo === "silencio" ? await porQueNaoEnviou(page, "publicar-oferta-de-horarios") : `${r4.tipo}: ${r4.texto}`
    );

    const corpo3 = await irPara(N, page, ORGANIZACAO);
    R.conferir(
      "1.8 a tela passa a listar a oferta: segunda, 08:00–10:00, 30 min",
      corpo3.includes("08:00–10:00") && corpo3.includes("30 min") && corpo3.includes("segunda"),
      "a janela publicada não aparece na tela"
    );

    // ═══ 2. A AGENDA E A MARCAÇÃO ══════════════════════════════════════════
    const guicheId = prisma === null ? "" : (await prisma.guicheDeAtendimento.findFirstOrThrow({ where: { nome: GUICHE }, select: { id: true } })).id;
    const rotaAgenda = `/protocolo/guiches/${guicheId}?dia=${C.segunda}`;

    const corpo4 = await irPara(N, page, rotaAgenda);
    R.conferir("2.1 a agenda do guichê abre no dia pedido", corpo4.includes(`agenda de ${br(C.segunda)}`), corpo4.slice(0, 200));
    R.conferir(
      "2.2 ela oferece os 4 horários da janela, com as vagas",
      corpo4.includes("08:00") && corpo4.includes("09:30") && corpo4.includes("1 de 1"),
      "a agenda não mostra os horários com as vagas"
    );

    await abrirPainel(page, "Marcar atendimento");
    const antes = await horariosOferecidos(page);
    R.conferir(
      "2.3 o select oferece os 4 horários — todos com vaga",
      antes.join(",") === "08:00,08:30,09:00,09:30",
      `oferecidos: ${antes.join(", ")}`
    );

    const r5 = await preencherEEnviar(page, "marcar-atendimento", [
      { sel: 'select[name="servicoId"]', valor: C.servicoId, tipo: "select" },
      { sel: 'input[name="documento"]', valor: C.documento },
      { sel: 'select[name="horaInicio"]', valor: "08:00", tipo: "select" },
    ]);
    // ⚠️ E ELA TRAZ O CÓDIGO DE ACOMPANHAMENTO PARA ENTREGAR (V11 V8.5). Sem ele, quem é atendido
    // no balcão tinha de VOLTAR ao balcão para desmarcar — cortesia virando deslocamento.
    R.conferir(
      "2.4 o atendimento é marcado PELA TELA e a confirmação traz o número e o código a ENTREGAR",
      r5.tipo === "ok" && r5.texto.includes("ENTREGUE à pessoa") && r5.texto.includes(br(C.segunda)),
      r5.tipo === "silencio" ? await porQueNaoEnviou(page, "marcar-atendimento") : `${r5.tipo}: ${r5.texto}`
    );

    const corpo5 = await irPara(N, page, rotaAgenda);
    R.conferir(
      "2.5 a pessoa aparece na agenda, no horário dela",
      corpo5.includes(C.nomeDaPessoa.toLowerCase()) && corpo5.includes("0 de 1"),
      "a pessoa marcada não aparece na agenda, ou a vaga não baixou"
    );

    // ⚠️ A AFIRMAÇÃO CENTRAL DA TELA: o horário lotado SOME da lista. Se ele continuasse lá, a
    // tela estaria oferecendo o que a transação recusa — e quem atende descobriria isso na frente
    // da pessoa.
    await abrirPainel(page, "Marcar atendimento");
    const depois = await horariosOferecidos(page);
    R.conferir(
      "2.6 o horário LOTADO some do select — a tela não oferece o que a gravação recusa",
      !depois.includes("08:00") && depois.join(",") === "08:30,09:00,09:30",
      `oferecidos depois de lotar as 08:00: ${depois.join(", ")}`
    );

    // ═══ 3. OS FATOS SOBRE A RESERVA ═══════════════════════════════════════
    await irPara(N, page, rotaAgenda);
    const clicou = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.trim() === "Confirmar presença");
      if (b === undefined) return false;
      (b as HTMLButtonElement).click();
      return true;
    });
    R.conferir("3.1 a agenda oferece CONFIRMAR PRESENÇA a quem está marcado", clicou, "o botão de confirmar não está na tela");
    await page.waitForSelector('[data-resultado-da-acao="confirmar-presenca"]', { timeout: 20000 }).catch(() => null);
    const corpo6 = await irPara(N, page, rotaAgenda);
    R.conferir("3.2 a situação passa a PRESENÇA CONFIRMADA", corpo6.includes("presença confirmada"), "a situação não mudou na tela");

    // Remarcar para as 09:00: o 08:00 tem de FICAR LIVRE de novo.
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.trim() === "Remarcar");
      if (b !== undefined) (b as HTMLButtonElement).click();
    });
    const r6 = await preencherEEnviar(page, "remarcar-atendimento", [
      { sel: 'input[name="dia"]', valor: C.segunda, tipo: "data" },
      { sel: 'input[name="horaInicio"]', valor: "09:00", tipo: "data" },
      { sel: 'input[name="motivo"]', valor: "A cidada pediu um horario mais tarde." },
    ]);
    R.conferir(
      "3.3 a remarcação grava e o ato diz que é a remarcação nº 1",
      r6.tipo === "ok" && r6.texto.includes("nº 1"),
      r6.tipo === "silencio" ? await porQueNaoEnviou(page, "remarcar-atendimento") : `${r6.tipo}: ${r6.texto}`
    );

    const corpo7 = await irPara(N, page, rotaAgenda);
    R.conferir("3.4 a tela mostra a marcação remarcada 1x", corpo7.includes("remarcada 1x"), "a tela não diz que houve remarcação");
    await abrirPainel(page, "Marcar atendimento");
    const liberou = await horariosOferecidos(page);
    R.conferir(
      "3.5 o horário de ORIGEM volta a ser oferecido, e o de DESTINO some",
      liberou.includes("08:00") && !liberou.includes("09:00"),
      `oferecidos depois da remarcação: ${liberou.join(", ")}`
    );

    await irPara(N, page, rotaAgenda);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.trim() === "Registrar atendimento");
      if (b !== undefined) (b as HTMLButtonElement).click();
    });
    const r7 = await preencherEEnviar(page, "registrar-atendimento", [
      { sel: 'input[name="atendidoPor"]', valor: "Servidora do guiche" },
      { sel: 'input[name="observacao"]', valor: "Segunda via entregue na hora." },
    ]);
    R.conferir(
      "3.6 o atendimento é registrado e o ato diz que a partir dali não se cancela nem se remarca",
      r7.tipo === "ok" && r7.texto.includes("não se cancela"),
      r7.tipo === "silencio" ? await porQueNaoEnviou(page, "registrar-atendimento") : `${r7.tipo}: ${r7.texto}`
    );

    const corpo8 = await irPara(N, page, rotaAgenda);
    R.conferir("3.7 a situação passa a ATENDIDA e os atos somem da tela", corpo8.includes("atendida") && !corpo8.includes("remarcar"), "a tela ainda oferece atos sobre o que já foi atendido");

    // ═══ 4. O FECHAMENTO DO DIA ════════════════════════════════════════════
    // Uma segunda marcação, que continua esperando — é ela que impede fechar.
    await abrirPainel(page, "Marcar atendimento");
    await preencherEEnviar(page, "marcar-atendimento", [
      { sel: 'select[name="servicoId"]', valor: C.servicoId, tipo: "select" },
      { sel: 'input[name="documento"]', valor: C.documento },
      { sel: 'select[name="horaInicio"]', valor: "08:30", tipo: "select" },
    ]);

    await irPara(N, page, ORGANIZACAO);
    await abrirPainel(page, "Declarar");
    await escolherPorRotulo(page, "fechar-dia-de-atendimento", "unidadeId", UNIDADE);
    await escolherPorRotulo(page, "fechar-dia-de-atendimento", "tipo", "Não abre");
    const r8 = await preencherEEnviar(page, "fechar-dia-de-atendimento", [
      { sel: 'input[name="dia"]', valor: C.segunda, tipo: "data" },
      { sel: 'input[name="motivo"]', valor: "Ponto facultativo municipal" },
    ]);
    R.conferir(
      "4.1 fechar um dia com gente ESPERANDO é recusado NOMEANDO quantas",
      r8.tipo === "erro" && /1 pessoa\(s\) marcada\(s\) e ainda não atendida\(s\)/.test(r8.texto),
      `${r8.tipo}: ${r8.texto}`
    );

    // Cancela a que espera; a ATENDIDA continua no dia e NÃO impede o fechamento.
    await irPara(N, page, rotaAgenda);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.trim() === "Cancelar");
      if (b !== undefined) (b as HTMLButtonElement).click();
    });
    const r9 = await preencherEEnviar(page, "cancelar-marcacao", [
      { sel: 'input[name="motivo"]', valor: "A cidada avisou que nao podera comparecer." },
    ]);
    R.conferir(
      "4.2 cancelar diz que o lugar voltou a ficar livre",
      r9.tipo === "ok" && r9.texto.includes("voltou a ficar livre"),
      r9.tipo === "silencio" ? await porQueNaoEnviou(page, "cancelar-marcacao") : `${r9.tipo}: ${r9.texto}`
    );

    await irPara(N, page, ORGANIZACAO);
    await abrirPainel(page, "Declarar");
    await escolherPorRotulo(page, "fechar-dia-de-atendimento", "unidadeId", UNIDADE);
    await escolherPorRotulo(page, "fechar-dia-de-atendimento", "tipo", "Não abre");
    const r10 = await preencherEEnviar(page, "fechar-dia-de-atendimento", [
      { sel: 'input[name="dia"]', valor: C.segunda, tipo: "data" },
      { sel: 'input[name="motivo"]', valor: "Ponto facultativo municipal" },
    ]);
    R.conferir(
      "4.3 sem ninguém esperando o dia FECHA — mesmo com um atendimento já realizado nele",
      r10.tipo === "ok" && r10.texto.includes("Ponto facultativo municipal"),
      r10.tipo === "silencio" ? await porQueNaoEnviou(page, "fechar-dia-de-atendimento") : `${r10.tipo}: ${r10.texto}`
    );

    const corpo9 = await irPara(N, page, rotaAgenda);
    R.conferir(
      "4.4 a agenda daquele dia passa a dizer o MOTIVO, e não uma lista vazia",
      corpo9.includes("não abre em") && corpo9.includes("ponto facultativo municipal"),
      "a agenda do dia fechado não diz o motivo"
    );

    if (prisma !== null) {
      // ⚠️ AS TRÊS CONTAGENS SÃO DESTE GUICHÊ, e não do banco inteiro. Uma contagem global
      // passaria na primeira corrida e quebraria na segunda — e uma falha que só aparece na
      // segunda execução é indistinguível de um defeito real do sistema.
      const reservas = await prisma.reservaDeAtendimento.count({ where: { guicheId } });
      const realizadas = await prisma.realizacaoDoAtendimento.count({ where: { reserva: { guicheId } } });
      const canceladas = await prisma.cancelamentoDaReserva.count({ where: { reserva: { guicheId } } });
      R.conferir(
        "4.5 no banco: DUAS reservas, uma realizada e uma cancelada — nada foi reescrito",
        reservas === 2 && realizadas === 1 && canceladas === 1,
        `reservas=${reservas} realizadas=${realizadas} canceladas=${canceladas}`
      );
    }

    // ═══ 5. O CIDADÃO MARCA SOZINHO, PELO PORTAL ══════════════════════════
    //
    // ⚠️ NA SEGUNDA SEGUINTE: a primeira foi FECHADA no passo 4.3. A mesma oferta publicada
    // serve — e isso prova, de graça, que ela vale em toda segunda dentro da vigência.
    const rotaPortal = `/agendamento?guiche=${guicheId}&servico=${C.servicoId}&dia=${C.segundaSeguinte}`;

    // ⚠️ A AFIRMAÇÃO É SOBRE **ESTE** SERVIÇO, e não sobre o portal inteiro estar vazio. A
    // primeira versão dizia "o portal não oferece nada", passou na estreia e caiu na segunda
    // corrida contra o mesmo banco — porque a corrida anterior tinha deixado o serviço DELA
    // aberto. Uma asserção que só vale em banco virgem acusa o sistema quando o sujo é o banco.
    const portalAntes = await irPara(N, page, "/agendamento");
    R.conferir(
      "5.1 antes de o ente abrir, ESTE serviço não aparece no portal",
      !portalAntes.includes(C.servicoTitulo.toLowerCase()),
      `"${C.servicoTitulo}" já aparecia no portal antes de ser aberto`
    );

    // A chefia abre o serviço à internet — pela tela interna, como qualquer outra decisão dela.
    await irPara(N, page, ORGANIZACAO);
    await abrirPainel(page, "Gravar");
    await escolherPorRotulo(page, "definir-servico-do-guiche", "guicheId", GUICHE);
    await escolherPorRotulo(page, "definir-servico-do-guiche", "servicoId", C.servicoTitulo);
    const r12 = await preencherEEnviar(page, "definir-servico-do-guiche", [
      { sel: 'select[name="habilitado"]', valor: "sim", tipo: "select" },
      { sel: 'select[name="agendamentoPublico"]', valor: "sim", tipo: "select" },
    ]);
    R.conferir(
      "5.2 a chefia ABRE o serviço à marcação pela internet, e o ato diz isso",
      r12.tipo === "ok" && r12.texto.includes("ABERTO à marcação pelo portal"),
      r12.tipo === "silencio" ? await porQueNaoEnviou(page, "definir-servico-do-guiche") : `${r12.tipo}: ${r12.texto}`
    );

    // ⚠️ DAQUI PARA A FRENTE, SEM SESSÃO. O cidadão não tem conta — se alguma destas telas
    // exigisse login, o percurso pararia aqui, que é exatamente o que se quer medir.
    await sair(N, page);
    const portalDepois = await irPara(N, page, "/agendamento");
    R.conferir(
      "5.3 o portal passa a listar o serviço, SEM sessão",
      portalDepois.includes(C.servicoTitulo.toLowerCase()) && !portalDepois.includes("entrar no sistema"),
      portalDepois.slice(0, 300)
    );

    const corpoDia = await irPara(N, page, rotaPortal);
    R.conferir(
      `5.4 escolhido o dia ${br(C.segundaSeguinte)}, a tela oferece horários`,
      corpoDia.includes("horário") && corpoDia.includes("08:00"),
      corpoDia.slice(0, 300)
    );

    const r13 = await preencherEEnviar(page, "agendar-atendimento", [
      { sel: 'input[name="nome"]', valor: "Carla Cidada do Portal" },
      { sel: 'input[name="documento"]', valor: "529.982.247-25" },
      { sel: 'select[name="horaInicio"]', valor: "08:00", tipo: "select" },
    ]);
    R.conferir(
      "5.5 o cidadão MARCA sozinho, e a tela devolve o número de atendimento",
      r13.tipo === "ok" && r13.texto.includes("Atendimento marcado"),
      r13.tipo === "silencio" ? await porQueNaoEnviou(page, "agendar-atendimento") : `${r13.tipo}: ${r13.texto}`
    );

    // ⚠️ O SEGREDO APARECE UMA VEZ, e a tela tem de DIZER isso — é a única credencial de quem
    // marcou sem conta. Uma tela que o mostrasse de passagem condenaria quem fechou a aba.
    const segredo = await page.evaluate(() => document.querySelector('[data-teste="segredo-do-cidadao"]')?.textContent?.trim() ?? "");
    const avisou = await page.evaluate(() => (document.body.textContent ?? "").includes("uma única vez"));
    R.conferir(
      "5.6 o código de acompanhamento aparece e a tela AVISA que ele não se recupera",
      /^[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(segredo) && avisou,
      `segredo="${segredo}" · avisou=${String(avisou)}`
    );

    if (prisma !== null) {
      const nova = await prisma.reservaDeAtendimento.findFirst({
        where: { guicheId, criadoPor: "PORTAL-DO-CIDADAO" },
        select: { pessoaId: true, nomeDeclarado: true, documentoDeclarado: true, segredoHash: true },
      });
      R.conferir(
        "5.7 no banco: titular DECLARADO, sem tocar no cadastro de pessoas, e o segredo só por hash",
        nova !== null && nova.pessoaId === null && nova.nomeDeclarado === "Carla Cidada do Portal" &&
          nova.documentoDeclarado === "52998224725" && /^[0-9a-f]{64}$/.test(nova.segredoHash ?? ""),
        `pessoaId=${String(nova?.pessoaId)} nome=${String(nova?.nomeDeclarado)} doc=${String(nova?.documentoDeclarado)}`
      );
    }

    // ⚠️ QUEM ATENDE PRECISA VER ESSA MARCAÇÃO — e saber que os dados não foram conferidos.
    await entrar(N, page, ADMIN, SENHA_ADMIN);
    const agendaSeguinte = await irPara(N, page, `/protocolo/guiches/${guicheId}?dia=${C.segundaSeguinte}`);
    R.conferir(
      "5.8 a marcação do portal aparece na agenda INTERNA, marcada como dados a conferir",
      agendaSeguinte.includes("carla cidada do portal") && agendaSeguinte.includes("pela internet, dados a conferir"),
      "a marcação do portal não aparece na agenda interna, ou não está marcada como declarada"
    );
    await sair(N, page);

    // O acompanhamento: código errado e inexistente respondem IGUAL.
    await irPara(N, page, "/agendamento/acompanhar");
    const r14 = await preencherEEnviar(page, "consultar-marcacao", [
      { sel: 'input[name="segredo"]', valor: "AAAAA-BBBBB-CCCCC-DDDDD" },
    ]);
    R.conferir(
      "5.9 código errado responde 'não encontramos' — a consulta não é oráculo",
      r14.tipo === "ok" && r14.texto.includes("Não encontramos"),
      `${r14.tipo}: ${r14.texto}`
    );

    await irPara(N, page, "/agendamento/acompanhar");
    const r15 = await preencherEEnviar(page, "consultar-marcacao", [{ sel: 'input[name="segredo"]', valor: segredo }]);
    const vista = await page.evaluate(() => ({
      dia: document.querySelector('[data-teste="dia-da-marcacao"]')?.textContent?.trim() ?? "",
      hora: document.querySelector('[data-teste="hora-da-marcacao"]')?.textContent?.trim() ?? "",
      situacao: document.querySelector('[data-teste="situacao-da-marcacao"]')?.textContent?.trim() ?? "",
    }));
    R.conferir(
      "5.10 com o código certo, a marcação aparece com dia, hora e situação",
      r15.tipo === "ok" && vista.dia === br(C.segundaSeguinte) && vista.hora === "08:00" && vista.situacao.includes("Marcada"),
      `${r15.tipo}: ${JSON.stringify(vista)}`
    );

    // Marcar de novo o MESMO documento para o MESMO serviço é recusado nomeando o anterior.
    await irPara(N, page, `/agendamento?guiche=${guicheId}&servico=${C.servicoId}&dia=${C.segundaSeguinte}`);
    const r16 = await preencherEEnviar(page, "agendar-atendimento", [
      { sel: 'input[name="nome"]', valor: "Carla Cidada do Portal" },
      { sel: 'input[name="documento"]', valor: "529.982.247-25" },
      { sel: 'select[name="horaInicio"]', valor: "08:30", tipo: "select" },
    ]);
    R.conferir(
      "5.11 o mesmo documento não marca duas vezes o mesmo serviço — e a recusa nomeia a anterior",
      r16.tipo === "erro" && r16.texto.includes("JA-TEM-MARCACAO"),
      `${r16.tipo}: ${r16.texto}`
    );

    // ⚠️ REMARCAR PELO PORTAL É UM ATO SÓ (V11 V8.5) — fecha GUICHE-PORTAL-SEM-REAGENDAMENTO.
    // Com "cancele e marque de novo", entre os dois atos o lugar volta para a fila.
    await irPara(N, page, "/agendamento/acompanhar");
    await preencherEEnviar(page, "consultar-marcacao", [{ sel: 'input[name="segredo"]', valor: segredo }]);
    const r18 = await preencherEEnviar(page, "remarcar-minha-marcacao", [
      { sel: 'input[name="segredo"]', valor: segredo },
      { sel: 'input[name="dia"]', valor: C.segundaSeguinte, tipo: "data" },
      { sel: 'input[name="horaInicio"]', valor: "09:00", tipo: "data" },
    ]);
    R.conferir(
      "5.11b o cidadão REMARCA sozinho, e a tela diz de onde para onde",
      r18.tipo === "ok" && r18.texto.includes("08:00") && r18.texto.includes("09:00"),
      r18.tipo === "silencio" ? await porQueNaoEnviou(page, "remarcar-minha-marcacao") : `${r18.tipo}: ${r18.texto}`
    );

    await irPara(N, page, "/agendamento/acompanhar");
    await preencherEEnviar(page, "consultar-marcacao", [{ sel: 'input[name="segredo"]', valor: segredo }]);
    const depoisDeRemarcar = await page.evaluate(
      () => document.querySelector('[data-teste="hora-da-marcacao"]')?.textContent?.trim() ?? ""
    );
    R.conferir(
      "5.11c a consulta passa a mostrar o horário NOVO",
      depoisDeRemarcar === "09:00",
      `hora depois de remarcar: "${depoisDeRemarcar}"`
    );

    // E o cidadão cancela a própria marcação, com o código.
    await irPara(N, page, "/agendamento/acompanhar");
    await preencherEEnviar(page, "consultar-marcacao", [{ sel: 'input[name="segredo"]', valor: segredo }]);
    const r17 = await preencherEEnviar(page, "cancelar-minha-marcacao", [
      { sel: 'input[name="segredo"]', valor: segredo },
      { sel: 'input[name="motivo"]', valor: "Resolvi pela internet." },
    ]);
    R.conferir(
      "5.12 o cidadão CANCELA a própria marcação, e a tela diz que o horário voltou a ficar livre",
      r17.tipo === "ok" && r17.texto.includes("voltou a ficar livre"),
      r17.tipo === "silencio" ? await porQueNaoEnviou(page, "cancelar-minha-marcacao") : `${r17.tipo}: ${r17.texto}`
    );

    if (prisma !== null) {
      const c = await prisma.cancelamentoDaReserva.findFirst({
        where: { criadoPor: "PORTAL-DO-CIDADAO" },
        select: { motivo: true },
      });
      R.conferir(
        "5.13 o cancelamento fica no histórico com o autor PORTAL-DO-CIDADAO — não com um servidor",
        c?.motivo === "Resolvi pela internet.",
        `cancelamento do portal: ${JSON.stringify(c)}`
      );
    }

    // ═══ 6. A NEGATIVA, COM MOTIVO ═════════════════════════════════════════
    await entrar(N, page, C.usuarioFraco, SENHA);
    const corpoFraco = await irPara(N, page, ORGANIZACAO);
    R.conferir("6.1 quem só LÊ o protocolo alcança a tela", corpoFraco.includes("atendimento presencial"), corpoFraco.slice(0, 200));

    R.conferir(
      "6.2 e a tela OFERECE o formulário a ele — botão oculto não é a proteção",
      await abrirPainel(page, "Criar guichê"),
      "o painel do guichê não abriu para o usuário fraco"
    );
    await escolherPorRotulo(page, "abrir-guiche", "unidadeId", UNIDADE);
    const r11 = await preencherEEnviar(page, "abrir-guiche", [
      { sel: 'input[name="nome"]', valor: `Guiche proibido ${C.sufixo}` },
    ]);
    R.conferir(
      "6.3 o SERVIDOR recusa e NOMEIA a ação que falta",
      r11.tipo === "erro" && r11.texto.includes("CONFIGURAR_AGENDA_DO_GUICHE"),
      `${r11.tipo}: ${r11.texto}`
    );

    if (prisma !== null) {
      const proibido = await prisma.guicheDeAtendimento.count({ where: { nome: `Guiche proibido ${C.sufixo}` } });
      R.conferir("6.4 e nada foi gravado pela recusa", proibido === 0, `${proibido} guichê(s) com o nome recusado`);
    }
  } catch (erro) {
    R.falhou("o percurso quebrou", erro instanceof Error ? `${erro.message}\n${await texto(page).catch(() => "")}`.slice(0, 900) : String(erro));
  } finally {
    await prisma?.$disconnect();
    await navegador.close();
  }

  R.encerrar();
}

await main();
