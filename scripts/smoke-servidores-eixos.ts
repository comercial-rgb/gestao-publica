import "dotenv/config";
import pg from "pg";
import type { Browser, Page } from "puppeteer";
import {
  barrado,
  entrar,
  hrefDoRegistro,
  irPara,
  lancarNavegadorDoPercurso,
  preencherEEnviar,
  registroDePassos,
  sair,
  texto,
  type Navegador,
} from "./percursos-navegador.js";

/**
 * ═══ PERCURSO DOS EIXOS DE CONSULTA DE SERVIDOR (M32, TR 5.12.50) ═══
 *
 * A V11 V9.4 entregou os oito eixos como CONSULTA e mediu predicado, porta e suíte pelo banco.
 * O percurso de navegador nunca aconteceu — e `PESSOAL-RECUSA-DO-TETO-SEM-PERCURSO` está nomeado
 * justamente porque o ramo da recusa do teto **não tem prova**: a primeira guarda escrita para ele
 * casava com o TEXTO-FONTE do `page.tsx`, e a mutação `MUT-H` (trocar o ramo por `if (false && …)`)
 * deixou 26 testes VERDES. A guarda foi retirada em vez de mantida aparentando cobertura. Quem
 * prova esse ramo é esta tela, aberta de verdade.
 *
 * ⚠️ O QUE ESTE PERCURSO EXISTE PARA NÃO DEIXAR PASSAR — e é um achado do gerente que decidiu a
 * fixture inteira: **um filtro que nunca acha nada é indistinguível de um filtro correto sobre
 * dado ausente.** Ele provou isso por mutação: retirando as colunas do `SELECAO_ENXUTA`, os três
 * casos positivos ficaram vermelhos e o caso puramente NEGATIVO ficou VERDE. Por isso cada eixo
 * aqui tem de ACHAR ALGUÉM, e não só deixar de achar: toda asserção de eixo é um par — acha quem
 * casa, e não traz quem não casa.
 *
 * ═══ ⚠️ FUNÇÃO E CENTRO DE CUSTO NASCEM VERMELHOS, E ISSO É A PROVA DE QUE ESTE PERCURSO OS COBRE ═══
 *
 * Varredura de `lib/` e `app/` no commit em que este arquivo nasceu: `cadastrarFuncao` não tem
 * chamador fora de teste, não há descritor nem rota de funções, e o `select` de `movimentar`
 * oferece cinco tipos — `MUDANCA_CARGO`, `MUDANCA_LOTACAO`, `AFASTAMENTO`, `RETORNO_AFASTAMENTO`,
 * `MUDANCA_REGIME_PREVIDENCIARIO`. `DESIGNACAO_FUNCAO`, `DISPENSA_FUNCAO` e
 * `MUDANCA_CENTRO_DE_CUSTO` existem no enum e só os TESTES os gravam.
 *
 * Ou seja: os dois eixos novos têm FILTRO na tela e nenhuma porta de ENTRADA. O operador digita e
 * recebe vazio para sempre — não porque o filtro erre, mas porque nada pode ter sido designado.
 * Os passos 5 e 6 abaixo exercitam o cadastro e a designação PELA TELA e, enquanto ela não
 * existir, falham NOMEANDO a causa. Quando a entrada chegar, eles passam ou acusam — e nos dois
 * casos isso se descobre na PRIMEIRA corrida.
 *
 * ⚠️ E É POR ISSO QUE NADA AQUI É SEMEADO POR SQL PARA "FAZER O EIXO ACHAR". Semear função e
 * centro de custo por fora faria este percurso afirmar *"o operador acha por função"* sobre um
 * dado que operador nenhum consegue criar — um verde que descreve um sistema que não existe, e
 * que é pior que um passo não executado, porque o não executado se lê no relatório.
 *
 * ═══ O ÚNICO SQL DESTE ARQUIVO É VOLUME, E A DISTINÇÃO É O QUE O TORNA LEGÍTIMO ═══
 *
 * `semearCenarioDeVolume` insere `Pessoa` + `VersaoDePessoa` + `Servidor` **sem vínculo nenhum**.
 * Ele não cria nenhum fato que a interface devesse saber criar: cria CARDINALIDADE, que é o que
 * a tela não tem como produzir a mão (o teto são 5.000 servidores). NENHUMA asserção de eixo se
 * apoia nele — os servidores de volume não têm vínculo, e todo eixo de vínculo os exclui por
 * construção. Ele serve a dois passos e só a dois: a PAGINAÇÃO (abaixo do teto) e a RECUSA do
 * teto (acima dele).
 *
 * ═══ OS PAPÉIS ═══
 *   rh@          CONSULTAR_PESSOAL, e cadastra/admite/movimenta (ator POSITIVO)
 *   tesouraria@  NÃO tem CONSULTAR_PESSOAL (ator NEGATIVO)
 *
 * ⚠️ PROVENIÊNCIA DO ATOR NEGATIVO, CONFERIDA ANTES DE CONFIAR NO PAR. Nenhuma identidade do censo
 * das fixtures da suíte serviria: `semearUsuariosDeTeste` (`test/usuarios-teste.ts`) cria o perfil
 * `ADMIN` com `TODAS_AS_ACOES` e o vincula a TODAS elas. Este censo é outro —
 * `percursos-usuarios-por-papel.ts`, perfis restritos por papel — e `tesouraria@` tem quatro
 * consultas VIZINHAS da vigiada sem ser ela: `CONSULTAR_DESPESA`, `CONSULTAR_RECEITA`,
 * `CONSULTAR_FINANCEIRO`, `CONSULTAR_CADASTROS`. Nenhuma é `CONSULTAR_PESSOAL`.
 *
 * ═══ USO ═══
 *   PERCURSO_BANCO=<clone> PERCURSO_PORTA=<p> npm run percursos:servir     (no ARTEFATO)
 *   PERCURSO_BANCO=<clone> npx tsx scripts/trinco-de-maquina.ts 'eixos de servidor' -- \
 *     npx tsx scripts/smoke-servidores-eixos.ts http://localhost:<p>
 *
 * ⚠️ BANCO CLONADO POR EXECUÇÃO. Este percurso insere milhares de servidores e afirma TOTAIS da
 * lista; num banco compartilhado os totais seriam de quem passou antes. Reexecução no mesmo banco
 * é reconhecida e PULADA com aviso (saída 4).
 */
const N: Navegador = { base: process.argv[2] ?? "http://localhost:3010" };
const SENHA = process.env["PERCURSOS_SENHA_PAPEIS"] ?? "Percurso#2026";
const RH = "rh@percursos.local";
const TESOURARIA = "tesouraria@percursos.local";

/** Sufixo do cenário — separa execuções e nomeia tudo o que este percurso cria. */
const SUF = process.env["EIXOS_SUFIXO"] ?? "E1";

const SAIDA_PULADO = 4;
const SAIDA_AMBIENTE = 3;

/**
 * ⚠️ OS DOIS PATAMARES DE VOLUME, E A ORDEM ENTRE ELES É O DESENHO.
 * `TETO_DE_CANDIDATOS` é 5.000 (`lib/portas/recursos/pessoal-dados.ts`). O primeiro lote fica
 * ABAIXO dele para que a paginação seja exercitável no caminho lento; o segundo cruza o teto, e
 * a partir daí TODA consulta de caminho lento recusa — por isso o passo do teto é o ÚLTIMO.
 */
const VOLUME_ABAIXO_DO_TETO = 4900;
const VOLUME_QUE_CRUZA_O_TETO = 150;

const R = registroDePassos();
const naoExecutados: string[] = [];
function naoExecutado(passo: string, motivo: string): void {
  naoExecutados.push(`${passo} — ${motivo}`);
  console.error(`[NAO EXECUTADO] ${passo} — ${motivo}`);
}
function nota(t: string): void {
  console.log(`      [${t}]`);
}

// ═══ AS PESSOAS DO CENÁRIO — cada uma existe para UM par de asserções ═══════════
/** S1 usa NOME SOCIAL: a busca tem de achá-la pelos DOIS nomes. */
const S1_CIVIL = `Maria Aparecida Souza ${SUF}`;
const S1_SOCIAL = `Mariana Ferraz ${SUF}`;
const S1_MAT = `EIX1-${SUF}`;
/** S2 tem DUAS matrículas: prova que a conjunção é sobre o MESMO vínculo. */
const S2_NOME = `Joana Ribeiro Lima ${SUF}`;
const S2_MAT_PROF = `EIX2A-${SUF}`;
const S2_MAT_MOTO = `EIX2B-${SUF}`;
/** S3 é PROMOVIDO no meio do caminho: prova a data de referência. */
const S3_NOME = `Carlos Mendes Teixeira ${SUF}`;
const S3_MAT = `EIX3-${SUF}`;
const S3_PROMOCAO = "2024-07-01";
/** S4 cruza os DOIS eixos de regime: celetista no RPPS. */
const S4_NOME = `Antonio Barbosa Nunes ${SUF}`;
const S4_MAT = `EIX4-${SUF}`;

const CARGO_PROF = `PROF-${SUF}`;
const CARGO_MOTO = `MOTO-${SUF}`;
const CARGO_DIR = `DIR-${SUF}`;
const LOT_ESCOLA = `ESCOLA-${SUF}`;
const LOT_GARAGEM = `GARAGEM-${SUF}`;
const FUNCAO_DIR = `FG-DIR-${SUF}`;
const FUNCAO_COORD = `FG-COORD-${SUF}`;

/**
 * ⚠️ OS CENTROS DE CUSTO NÃO SÃO CRIADOS POR ESTE PERCURSO, E A RAZÃO É DE DOMÍNIO.
 * O centro de custo do pessoal é o `Setor` do M21 — decisão registrada no `MODULO.md` do M32
 * (`PESSOAL-SEM-CENTRO-DE-CUSTO`, resolvida): criar uma tabela só da folha seria a QUARTA
 * estrutura sobre o mesmo organograma. O banco base dos percursos já traz setores, e é por eles
 * que se filtra. Dois DIFERENTES, porque um só não distingue "o filtro acha" de "o filtro deixa
 * tudo passar".
 */
const CENTRO_A = "Protocolo";
const CENTRO_B = "Procuradoria";

/** CPF sintético COM dígito verificador — o cadastro único valida o DV. */
function cpfFicticio(semente: string): string {
  const base = `${semente.replace(/\D/g, "")}000000000`.slice(0, 9).split("").map(Number);
  const dv = (ds: readonly number[], peso: number): number => {
    const soma = ds.reduce((acc, d, i) => acc + d * (peso - i), 0);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(base, 10);
  const d2 = dv([...base, d1], 11);
  return `${base.join("")}${d1}${d2}`;
}

async function opcaoQueCasa(page: Page, seletor: string, trecho: string): Promise<string> {
  return page.evaluate(
    (sel, t) => {
      const s = document.querySelector(sel);
      if (!(s instanceof HTMLSelectElement)) return "";
      const o = Array.from(s.options).find((x) => x.textContent?.includes(t) === true);
      return o?.value ?? "";
    },
    seletor,
    trecho
  );
}

async function opcoesDe(page: Page, seletor: string): Promise<readonly string[]> {
  return page.evaluate((sel) => {
    const s = document.querySelector(sel);
    if (!(s instanceof HTMLSelectElement)) return [] as string[];
    return Array.from(s.options).map((o) => (o.textContent ?? "").trim());
  }, seletor);
}

/** As linhas da tabela da lista, como texto visível — é sobre elas que todo eixo se afirma. */
async function linhasDaLista(page: Page): Promise<readonly string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("tbody tr")).map((tr) => (tr.textContent ?? "").replace(/\s+/g, " ").trim())
  );
}

/**
 * O TOTAL que a lista declara. ⚠️ É ele que o defeito da paginação corrompia: com o filtro
 * aplicado DEPOIS do `skip`/`take`, o total virava "quantos casam NESTA PÁGINA".
 */
async function totalDaLista(page: Page): Promise<string> {
  // A paginação escreve `1–25 de 4904 servidores` (`components/ui/Paginacao.tsx`): o número que
  // importa é o que vem depois de "de", e é ele que o defeito corrompia.
  return page.evaluate(() => {
    const corpo = (document.body.innerText ?? "").replace(/\s+/g, " ");
    return /\d+\s*[–-]\s*\d+\s+de\s+(\d+)\s+servidores/i.exec(corpo)?.[1] ?? "";
  });
}

/** Uma consulta pela URL — a lista do molde é toda query string, e por isso é linkável. */
async function consultar(page: Page, params: Readonly<Record<string, string>>): Promise<readonly string[]> {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  await irPara(N, page, `/pessoal/servidores${qs === "" ? "" : `?${qs}`}`);
  return linhasDaLista(page);
}

/** Alguma linha da lista nomeia este servidor? */
const achou = (linhas: readonly string[], alvo: string): boolean => linhas.some((l) => l.includes(alvo));

/**
 * ═══ O CENÁRIO DE VOLUME — CARDINALIDADE, NUNCA UM FATO DE NEGÓCIO ═══
 *
 * Insere `Pessoa` + `VersaoDePessoa` + `Servidor`, SEM vínculo. Três razões para isto ser SQL e
 * não tela, e as três importam:
 *   1. o teto são 5.000 servidores — nenhuma interface produz isso a mão, e é exatamente por isso
 *      que o ramo da recusa nunca foi provado;
 *   2. o que se cria é VOLUME, não capacidade: nenhum servidor daqui tem vínculo, cargo, lotação,
 *      função ou centro de custo, então nenhum eixo os alcança e nenhuma asserção de eixo repousa
 *      sobre eles;
 *   3. eles são reconhecíveis pelo nome (`VOLUME …`) — se algum dia aparecerem numa asserção de
 *      eixo, é a asserção que está errada.
 *
 * ⚠️ O CPF É SINTÉTICO E NÃO PASSA PELO DOMÍNIO. O cadastro único valida DV no domínio; aqui a
 * inserção é direta, e o banco só exige unicidade e formato. É aceitável porque estes registros
 * são cenário descartável num clone nomeado — e inaceitável em qualquer outro lugar.
 */
async function semearCenarioDeVolume(quantos: number, faixa: number): Promise<number> {
  const bruta = process.env["DATABASE_URL_PERCURSOS"];
  const banco = process.env["PERCURSO_BANCO"] ?? "";
  if (bruta === undefined || bruta === "" || banco === "") throw new Error("cenário de volume: DATABASE_URL_PERCURSOS e PERCURSO_BANCO são obrigatórios");
  const u = new URL(bruta);
  u.pathname = `/${banco}`;
  const c = new pg.Client({ connectionString: u.toString() });
  await c.connect();
  try {
    /**
     * Três comandos diretos, na ordem das FKs. `ON CONFLICT DO NOTHING` torna a semeadura
     * idempotente: reexecutar o mesmo trecho não duplica nem estoura, e o número que vale é o
     * `count` lido DEPOIS — nunca o que eu pedi para inserir. Contar o pedido em vez do efeito
     * seria afirmar pela intenção.
     */
    const ate = faixa + quantos - 1;
    await c.query(
      `INSERT INTO "Pessoa" (id, documento, tipo, "criadoEm", "criadoPor")
       SELECT 'volpe${SUF}' || lpad(i::text, 7, '0'),
              lpad((90000000000::bigint + i)::text, 11, '0'), 'FISICA', now(), 'percurso-de-volume'
       FROM generate_series($1::int, $2::int) AS i
       ON CONFLICT DO NOTHING`,
      [faixa, ate]
    );
    await c.query(
      `INSERT INTO "VersaoDePessoa" (id, "pessoaId", nome, ativa, "criadoEm", "criadoPor")
       SELECT 'volve${SUF}' || lpad(i::text, 7, '0'), 'volpe${SUF}' || lpad(i::text, 7, '0'),
              'VOLUME ${SUF} ' || i, true, now(), 'percurso-de-volume'
       FROM generate_series($1::int, $2::int) AS i
       ON CONFLICT DO NOTHING`,
      [faixa, ate]
    );
    await c.query(
      `INSERT INTO "Servidor" (id, "pessoaId", "dataNascimento", sexo, "criadoEm", "criadoPor")
       SELECT 'volsv${SUF}' || lpad(i::text, 7, '0'), 'volpe${SUF}' || lpad(i::text, 7, '0'),
              '1985-07-20'::timestamp, 'FEMININO', now(), 'percurso-de-volume'
       FROM generate_series($1::int, $2::int) AS i
       ON CONFLICT DO NOTHING`,
      [faixa, ate]
    );
    const total = await c.query<{ n: string }>(`SELECT count(*)::text AS n FROM "Servidor"`);
    nota(`cenário de volume: faixa ${faixa}..${ate} · total de Servidor no banco agora = ${total.rows[0]?.n ?? "?"}`);
    return Number(total.rows[0]?.n ?? "0");
  } finally {
    await c.end();
  }
}

async function main(): Promise<void> {
  const banco = process.env["PERCURSO_BANCO"] ?? "";
  if (banco === "") {
    console.error(
      "[FALHA] PERCURSO_BANCO não declarado. Este percurso insere milhares de servidores e afirma\n" +
        "        TOTAIS da lista: num banco compartilhado os totais seriam de quem passou antes.\n" +
        "        Use um banco clonado por execução."
    );
    process.exit(SAIDA_AMBIENTE);
  }
  console.log(`      [sufixo ${SUF} · banco ${banco} · base ${N.base}]`);
  let navegador: Browser | null = null;
  try {
    navegador = await lancarNavegadorDoPercurso();
    const page = await navegador.newPage();
    await entrar(N, page, RH, SENHA);

    // ══ 1. A BARRA DE FILTROS OFERECE OS OITO EIXOS, COM RÓTULO ══════════════
    await irPara(N, page, "/pessoal/servidores");
    const barra = 'form[aria-label="Filtros da lista"]';
    const camposDaBarra = await page.evaluate((sel) => {
      const f = document.querySelector(sel);
      if (f === null) return [] as { readonly nome: string; readonly rotulo: string }[];
      return Array.from(f.querySelectorAll("input[name], select[name]")).map((el) => {
        const i = el as HTMLInputElement;
        return { nome: i.name, rotulo: (i.closest("label")?.textContent ?? "").replace(/\s+/g, " ").trim() };
      });
    }, barra);
    nota(`filtros oferecidos: ${camposDaBarra.map((c) => c.nome).join(", ")}`);
    /**
     * ⚠️ OS OITO DO TR, E "REGIME" SÃO DOIS. `regimeJuridico` é como a lei do ente nomeia o
     * vínculo; `regimePrev` decide qual tabela de contribuição a folha aplica. Fundi-los seria
     * erro de domínio — um estatutário pode estar no RGPS, e S4 é exatamente esse cruzamento.
     */
    const exigidos = ["matricula", "nome", "cargo", "regimeJuridico", "regimePrev", "lotacao", "admitidoDe", "admitidoAte", "funcao", "centroDeCusto", "dataRef"];
    const faltando = exigidos.filter((e) => !camposDaBarra.some((c) => c.nome === e));
    R.conferir(
      "1.1 a barra de filtros oferece os oito eixos do TR (com 'regime' como DOIS) mais a data de referência",
      camposDaBarra.length > 0 && faltando.length === 0,
      camposDaBarra.length === 0 ? "a barra de filtros não foi encontrada (não vale como prova)" : `faltaram: ${faltando.join(", ")}`
    );
    /**
     * ⚠️ RÓTULO EM TODO CAMPO — campo sem rótulo é caixa muda para leitor de tela, e a regra da
     * casa é explícita. Aqui isso não é zelo: são ONZE controles numa barra só.
     */
    const semRotulo = camposDaBarra.filter((c) => c.rotulo === "");
    R.conferir("1.2 todo campo da barra tem rótulo — nenhuma caixa muda", camposDaBarra.length > 0 && semRotulo.length === 0, `sem rótulo: ${semRotulo.map((c) => c.nome).join(", ")}`);

    // ══ 2. O CADASTRO BÁSICO: cargos e lotações ══════════════════════════════
    const cargo = async (codigo: string, denominacao: string): Promise<boolean> => {
      await irPara(N, page, "/pessoal/cargos");
      if ((await texto(page)).includes(codigo.toLowerCase())) return true;
      const r = await preencherEEnviar(page, "criar-cargos", [
        { sel: 'input[name="codigo"]', valor: codigo },
        { sel: 'input[name="denominacao"]', valor: denominacao },
        { sel: 'select[name="tipo"]', valor: "EFETIVO", tipo: "select" },
        { sel: 'input[name="vagasFixadas"]', valor: "50" },
        { sel: 'input[name="leiAutorizativa"]', valor: "Lei Municipal 1.234/2010 (percurso)" },
        { sel: 'input[name="dataPublicacaoLei"]', valor: "2010-05-01", tipo: "data" },
      ]);
      return r.tipo === "ok" || /já existe|unique/i.test(r.texto);
    };
    const lotacao = async (codigo: string, nome: string): Promise<boolean> => {
      await irPara(N, page, "/pessoal/lotacoes");
      if ((await texto(page)).includes(codigo.toLowerCase())) return true;
      const r = await preencherEEnviar(page, "criar-lotacoes", [
        { sel: 'input[name="codigo"]', valor: codigo },
        { sel: 'input[name="nome"]', valor: nome },
      ]);
      return r.tipo === "ok" || /já existe|unique/i.test(r.texto);
    };
    const base = [
      await cargo(CARGO_PROF, `Professor do percurso ${SUF}`),
      await cargo(CARGO_MOTO, `Motorista do percurso ${SUF}`),
      await cargo(CARGO_DIR, `Diretor do percurso ${SUF}`),
      await lotacao(LOT_ESCOLA, `Escola Central ${SUF}`),
      await lotacao(LOT_GARAGEM, `Garagem Municipal ${SUF}`),
    ];
    R.conferir("2.1 os três cargos e as duas lotações do cenário estão cadastrados", base.every((x) => x), `resultados: ${base.join(", ")}`);

    // ══ 3. AS PESSOAS E OS VÍNCULOS ══════════════════════════════════════════
    /** Devolve "" quando deu certo, ou o MOTIVO — nunca um `false` mudo telas atrás. */
    const criarServidor = async (nomeCivil: string, semente: string, nomeSocial: string | null): Promise<string> => {
      await irPara(N, page, "/cadastros/pessoas");
      const rp = await preencherEEnviar(page, "cadastrar-pessoa", [
        { sel: 'input[data-mascara="cpf-cnpj"]', valor: cpfFicticio(semente) },
        { sel: 'input[name="nome"]', valor: nomeCivil },
      ]);
      if (rp.tipo === "erro" && !/já existe|unique/i.test(rp.texto)) return `cadastrar-pessoa: ${rp.texto.slice(0, 160)}`;
      await irPara(N, page, "/pessoal/servidores");
      const idPessoa = await opcaoQueCasa(page, 'form[data-acao="criar-servidores"] select[name="pessoaId"]', nomeCivil);
      if (idPessoa === "") return `a pessoa "${nomeCivil}" não foi oferecida no seletor de criar servidor`;
      const rs = await preencherEEnviar(page, "criar-servidores", [
        { sel: 'select[name="pessoaId"]', valor: idPessoa, tipo: "select" },
        ...(nomeSocial === null ? [] : [{ sel: 'input[name="nomeSocial"]', valor: nomeSocial }]),
        { sel: 'input[name="dataNascimento"]', valor: "1985-07-20", tipo: "data" as const },
        { sel: 'select[name="sexo"]', valor: "FEMININO", tipo: "select" as const },
      ]);
      if (rs.tipo === "erro" && !/já existe|unique/i.test(rs.texto)) return `criar-servidores: ${rs.texto.slice(0, 160)}`;
      return "";
    };

    /**
     * ⚠️ A FICHA SE LOCALIZA PELO NOME QUE A TELA MOSTRA, E ELE NEM SEMPRE É O CIVIL.
     *
     * Este helper nasceu errado e a primeira corrida o pegou: ele buscava por `q=<nome civil>` —
     * o que funciona, porque a busca acha pelos dois — e depois procurava a LINHA pelo mesmo
     * nome civil. Só que a lista MOSTRA o nome social quando há (Lei 14.164/2021, Decreto
     * 8.727/2016), e é isso que o produto faz de CERTO. Resultado: a única servidora do cenário
     * que usa nome social era a única cuja ficha nunca abria — e caíram com ela a admissão, a
     * designação de função, o centro de custo, a dispensa e as consultas que dependiam da
     * matrícula dela. Doze passos vermelhos, um engano meu.
     *
     * A lição é a do repositório, do outro lado: o instrumento também não pode ENUMERAR a forma
     * que ele conhece. Quem exibe é a tela; quem busca são os dois.
     */
    const fichaDe = async (nomeParaBuscar: string, nomeExibido?: string): Promise<string> => {
      await irPara(N, page, `/pessoal/servidores?q=${encodeURIComponent(nomeParaBuscar)}`);
      return (await hrefDoRegistro(page, nomeExibido ?? nomeParaBuscar)) ?? "";
    };
    /** O nome pelo qual a TELA mostra cada servidor do cenário — social quando há. */
    const EXIBIDO: Readonly<Record<string, string>> = { [S1_CIVIL]: S1_SOCIAL };
    const fichaDoCenario = async (nomeCivil: string): Promise<string> => fichaDe(nomeCivil, EXIBIDO[nomeCivil] ?? nomeCivil);

    const admitir = async (
      nome: string,
      matricula: string,
      codigoCargo: string,
      codigoLotacao: string,
      regimeJuridico: string,
      regimePrev: string,
      admissao: string
    ): Promise<string> => {
      const href = await fichaDoCenario(nome);
      if (href === "") return `a ficha de "${nome}" não apareceu na busca`;
      await irPara(N, page, href);
      const idCargo = await opcaoQueCasa(page, 'form[data-acao="admitir"] select[name="cargoId"]', codigoCargo);
      const idLot = await opcaoQueCasa(page, 'form[data-acao="admitir"] select[name="lotacaoId"]', codigoLotacao);
      if (idCargo === "" || idLot === "") return `a admissão não ofereceu cargo (${codigoCargo}) ou lotação (${codigoLotacao})`;
      const r = await preencherEEnviar(page, "admitir", [
        { sel: 'input[name="matricula"]', valor: matricula },
        { sel: 'select[name="tipo"]', valor: "EFETIVO", tipo: "select" },
        { sel: 'input[name="regimeJuridico"]', valor: regimeJuridico },
        { sel: 'select[name="regimePrevidenciario"]', valor: regimePrev, tipo: "select" },
        { sel: 'input[name="dataAdmissao"]', valor: admissao, tipo: "data" },
        { sel: 'select[name="cargoId"]', valor: idCargo, tipo: "select" },
        { sel: 'select[name="lotacaoId"]', valor: idLot, tipo: "select" },
        { sel: 'input[data-mascara="valor"]', valor: "3.000,00" },
      ]);
      if (r.tipo === "erro" && !/já existe|unique/i.test(r.texto)) return `admitir ${matricula}: ${r.texto.slice(0, 200)}`;
      return "";
    };

    const e1 = await criarServidor(S1_CIVIL, `51${SUF}0001`, S1_SOCIAL);
    const e2 = await criarServidor(S2_NOME, `52${SUF}0002`, null);
    const e3 = await criarServidor(S3_NOME, `53${SUF}0003`, null);
    const e4 = await criarServidor(S4_NOME, `54${SUF}0004`, null);
    R.conferir("3.1 as quatro pessoas do cenário viraram servidores (uma delas com NOME SOCIAL)", [e1, e2, e3, e4].every((x) => x === ""), `S1=${e1 || "ok"} S2=${e2 || "ok"} S3=${e3 || "ok"} S4=${e4 || "ok"}`);

    const a1 = await admitir(S1_CIVIL, S1_MAT, CARGO_PROF, LOT_ESCOLA, "Estatutario", "RGPS", "2021-03-10");
    // ⚠️ AS DUAS MATRÍCULAS DE S2 SÃO O CASO DA CONJUNÇÃO: professora na Escola, motorista na Garagem.
    const a2a = await admitir(S2_NOME, S2_MAT_PROF, CARGO_PROF, LOT_ESCOLA, "Estatutario", "RGPS", "2019-02-01");
    const a2b = await admitir(S2_NOME, S2_MAT_MOTO, CARGO_MOTO, LOT_GARAGEM, "Estatutario", "RGPS", "2020-08-15");
    const a3 = await admitir(S3_NOME, S3_MAT, CARGO_PROF, LOT_ESCOLA, "Estatutario", "RGPS", "2019-05-20");
    // ⚠️ S4 CRUZA OS DOIS REGIMES: celetista no RPPS. Se os eixos fossem um só, este caso sumiria.
    const a4 = await admitir(S4_NOME, S4_MAT, CARGO_MOTO, LOT_GARAGEM, "CLT", "RPPS", "2022-11-05");
    R.conferir(
      "3.2 os cinco vínculos estão admitidos — S2 com DUAS matrículas, S4 celetista no RPPS",
      [a1, a2a, a2b, a3, a4].every((x) => x === ""),
      `S1=${a1 || "ok"} S2A=${a2a || "ok"} S2B=${a2b || "ok"} S3=${a3 || "ok"} S4=${a4 || "ok"}`
    );

    // ── 3.3 a PROMOÇÃO de S3, que é o que torna a data de referência mensurável ──
    const hrefS3 = await fichaDoCenario(S3_NOME);
    let promocao = `a ficha de ${S3_NOME} não apareceu`;
    if (hrefS3 !== "") {
      await irPara(N, page, hrefS3);
      const idV = await opcaoQueCasa(page, 'form[data-acao="movimentar"] select[name="vinculoId"]', S3_MAT);
      const idCargoDir = await opcaoQueCasa(page, 'form[data-acao="movimentar"] select[name="cargoId"]', CARGO_DIR);
      if (idV === "" || idCargoDir === "") {
        promocao = `movimentar não ofereceu o vínculo (${idV === "" ? "AUSENTE" : "ok"}) ou o cargo de destino (${idCargoDir === "" ? "AUSENTE" : "ok"})`;
      } else {
        const r = await preencherEEnviar(page, "movimentar", [
          { sel: 'select[name="vinculoId"]', valor: idV, tipo: "select" },
          { sel: 'select[name="tipo"]', valor: "MUDANCA_CARGO", tipo: "select" },
          { sel: 'input[name="data"]', valor: S3_PROMOCAO, tipo: "data" },
          { sel: 'select[name="cargoId"]', valor: idCargoDir, tipo: "select" },
          { sel: 'input[name="motivo"]', valor: "Portaria de designacao para a direcao (percurso)" },
        ]);
        promocao = r.tipo === "ok" ? "" : `${r.tipo}: ${r.texto.slice(0, 200)}`;
      }
    }
    R.conferir(`3.3 S3 muda de cargo em ${S3_PROMOCAO} — é esta mudança que torna a data de referência mensurável`, promocao === "", promocao);

    // ══ 4. OS EIXOS QUE JÁ TÊM CAMINHO — cada um ACHA e cada um RECUSA ═══════
    //
    // ⚠️ TODA ASSERÇÃO AQUI É UM PAR. "Não achou" sozinho é indistinguível de um filtro correto
    // sobre dado ausente — foi o que a mutação do gerente mostrou ao deixar o caso puramente
    // negativo VERDE com as colunas retiradas do SELECAO_ENXUTA.

    // ── 4.1 MATRÍCULA ──
    const porMatricula = await consultar(page, { matricula: S1_MAT });
    R.conferir(
      "4.1 matrícula: acha o vínculo pedido e NÃO traz os outros",
      achou(porMatricula, S1_CIVIL) || achou(porMatricula, S1_SOCIAL),
      `linhas: ${porMatricula.join(" || ").slice(0, 300)}`
    );
    R.conferir("4.1b e a busca por matrícula não traz quem tem outra", !achou(porMatricula, S4_NOME), porMatricula.join(" || ").slice(0, 300));

    // ── 4.2 NOME: pelos DOIS, civil e social ──
    /**
     * ⚠️ QUEM USA NOME SOCIAL E NÃO É ACHADO POR ELE É DEFEITO DE PRODUTO — e quem é procurado
     * pelo nome que está na portaria e não é achado também. A tela MOSTRA o social (Lei
     * 14.164/2021, Decreto 8.727/2016); a busca tem de ACHAR pelos dois.
     */
    const porCivil = await consultar(page, { nome: "Maria Aparecida" });
    R.conferir("4.2 nome: acha pelo nome CIVIL da pessoa", porCivil.length > 0 && (achou(porCivil, S1_SOCIAL) || achou(porCivil, S1_CIVIL)), `linhas: ${porCivil.join(" || ").slice(0, 300)}`);
    const porSocial = await consultar(page, { nome: "Mariana Ferraz" });
    R.conferir("4.2b ⚠️ nome: acha também pelo NOME SOCIAL — não ser achado por ele é defeito de produto", porSocial.length > 0 && achou(porSocial, S1_SOCIAL), `linhas: ${porSocial.join(" || ").slice(0, 300)}`);
    const porNomeAlheio = await consultar(page, { nome: "Antonio Barbosa" });
    R.conferir("4.2c e o eixo discrimina: procurar por outro nome não traz S1", !achou(porNomeAlheio, S1_SOCIAL) && achou(porNomeAlheio, S4_NOME), `linhas: ${porNomeAlheio.join(" || ").slice(0, 300)}`);

    // ── 4.3 CARGO (derivado) ──
    const porCargo = await consultar(page, { cargo: CARGO_MOTO });
    R.conferir("4.3 cargo: acha quem é motorista", achou(porCargo, S4_NOME) && achou(porCargo, S2_NOME), `linhas: ${porCargo.join(" || ").slice(0, 300)}`);
    R.conferir("4.3b e não traz quem só é professor", !achou(porCargo, S1_CIVIL) && !achou(porCargo, S1_SOCIAL), porCargo.join(" || ").slice(0, 300));

    // ── 4.4 LOCAL DE TRABALHO (derivado) ──
    const porLotacao = await consultar(page, { lotacao: LOT_ESCOLA });
    R.conferir("4.4 local de trabalho: acha quem está na Escola Central", achou(porLotacao, S3_NOME) && (achou(porLotacao, S1_SOCIAL) || achou(porLotacao, S1_CIVIL)), `linhas: ${porLotacao.join(" || ").slice(0, 300)}`);
    R.conferir("4.4b e não traz quem está só na Garagem", !achou(porLotacao, S4_NOME), porLotacao.join(" || ").slice(0, 300));

    // ── 4.5 OS DOIS EIXOS DE REGIME, que são DOIS ──
    const porJuridico = await consultar(page, { regimeJuridico: "CLT" });
    R.conferir("4.5 regime JURÍDICO: acha o celetista", achou(porJuridico, S4_NOME), `linhas: ${porJuridico.join(" || ").slice(0, 300)}`);
    R.conferir("4.5b e não traz os estatutários", !achou(porJuridico, S3_NOME), porJuridico.join(" || ").slice(0, 300));
    const porPrev = await consultar(page, { regimePrev: "RPPS" });
    R.conferir("4.5c regime PREVIDENCIÁRIO: acha o do RPPS — e é o MESMO servidor celetista, cruzamento que só existe se os eixos forem dois", achou(porPrev, S4_NOME), `linhas: ${porPrev.join(" || ").slice(0, 300)}`);
    R.conferir("4.5d e não traz os do RGPS", !achou(porPrev, S3_NOME), porPrev.join(" || ").slice(0, 300));

    // ── 4.6 DATA DE ADMISSÃO (janela inclusiva nas duas bordas) ──
    const naJanela = await consultar(page, { admitidoDe: "2022-11-05", admitidoAte: "2022-11-05" });
    R.conferir("4.6 data de admissão: a janela é INCLUSIVA nas duas bordas — o admitido no dia exato aparece", achou(naJanela, S4_NOME), `linhas: ${naJanela.join(" || ").slice(0, 300)}`);
    R.conferir("4.6b e a janela exclui quem está fora dela", !achou(naJanela, S3_NOME), naJanela.join(" || ").slice(0, 300));

    // ══ 5. A CONJUNÇÃO É SOBRE O MESMO VÍNCULO ═══════════════════════════════
    //
    // ⚠️ A PROFESSORA QUE TAMBÉM É MOTORISTA. S2 tem as duas matrículas; se cada eixo fosse
    // conferido contra o CONJUNTO dos vínculos dela, "motorista na Escola Central" a traria — e
    // seria uma resposta falsa sobre uma pessoa real.
    const cruzadoFalso = await consultar(page, { cargo: CARGO_MOTO, lotacao: LOT_ESCOLA });
    R.conferir(
      "5.1 ⚠️ conjunção sobre o MESMO vínculo: 'motorista NA Escola Central' NÃO traz quem é motorista na Garagem e professora na Escola",
      !achou(cruzadoFalso, S2_NOME),
      `linhas: ${cruzadoFalso.join(" || ").slice(0, 400)}`
    );
    // ⚠️ E O PAR POSITIVO, sem o qual o passo acima passaria por um filtro que nunca acha nada.
    const cruzadoCerto = await consultar(page, { cargo: CARGO_MOTO, lotacao: LOT_GARAGEM });
    R.conferir("5.2 e a mesma conjunção ACHA a combinação que existe: motorista NA Garagem", achou(cruzadoCerto, S2_NOME) && achou(cruzadoCerto, S4_NOME), `linhas: ${cruzadoCerto.join(" || ").slice(0, 400)}`);
    // ⚠️ E a linha mostra a MATRÍCULA QUE CASOU, não a primeira viva.
    R.conferir(
      "5.3 a linha mostra a matrícula que CASOU com os eixos, não a primeira viva do servidor",
      cruzadoCerto.some((l) => l.includes(S2_NOME) && l.includes(S2_MAT_MOTO)) && !cruzadoCerto.some((l) => l.includes(S2_NOME) && l.includes(S2_MAT_PROF)),
      `linhas: ${cruzadoCerto.join(" || ").slice(0, 400)}`
    );

    // ══ 6. A DATA DE REFERÊNCIA — e a COLUNA deriva na MESMA data ════════════
    //
    // ⚠️ "CARGO HOJE" E "CARGO NA COMPETÊNCIA DE MAIO" DÃO LISTAS DIFERENTES. S3 é professor até
    // 2024-06-30 e diretor a partir de 2024-07-01. Mostrar o cargo de HOJE sob um filtro DATADO
    // seria mentir na célula — e é a célula que o operador lê.
    const antesDaPromocao = await consultar(page, { cargo: CARGO_PROF, dataRef: "2024-01-15" });
    R.conferir("6.1 data de referência: em 2024-01-15 S3 ainda é PROFESSOR e o filtro o acha", achou(antesDaPromocao, S3_NOME), `linhas: ${antesDaPromocao.join(" || ").slice(0, 400)}`);
    const depoisDaPromocao = await consultar(page, { cargo: CARGO_PROF, dataRef: "2025-01-15" });
    R.conferir("6.2 e em 2025-01-15 ele NÃO é mais professor — a mesma pergunta em outra data dá outra lista", !achou(depoisDaPromocao, S3_NOME), `linhas: ${depoisDaPromocao.join(" || ").slice(0, 400)}`);
    const comoDiretor = await consultar(page, { cargo: CARGO_DIR, dataRef: "2025-01-15" });
    R.conferir("6.3 e o eixo o acha no cargo NOVO na data nova — o par que impede 'nunca acha nada'", achou(comoDiretor, S3_NOME), `linhas: ${comoDiretor.join(" || ").slice(0, 400)}`);
    /**
     * ⚠️ A CÉLULA TEM DE DERIVAR NA DATA DO FILTRO. Este é o passo que separa "o filtro está
     * certo" de "a tela está honesta": sob `dataRef=2024-01-15` a coluna "Cargo (na data de
     * referência)" tem de dizer PROFESSOR, mesmo que hoje ele seja diretor.
     */
    const linhaDatada = antesDaPromocao.find((l) => l.includes(S3_NOME)) ?? "";
    R.conferir(
      "6.4 ⚠️ a COLUNA do cargo deriva na MESMA data do filtro — mostrar o cargo de hoje sob filtro datado seria mentir na célula",
      linhaDatada.includes(`Professor do percurso ${SUF}`) && !linhaDatada.includes(`Diretor do percurso ${SUF}`),
      `linha de S3 sob dataRef=2024-01-15: ${linhaDatada.slice(0, 300)}`
    );

    // ══ 7. FUNÇÃO E CENTRO DE CUSTO — os dois eixos novos, PELA TELA ═════════
    //
    // ⚠️ ESTES PASSOS NASCEM VERMELHOS, E É ISSO QUE PROVA QUE ESTE PERCURSO OS COBRE.
    // No commit em que este arquivo nasceu não havia tela de funções nem os três tipos de evento
    // no `movimentar` — `cadastrarFuncao` sem chamador, `DESIGNACAO_FUNCAO`, `DISPENSA_FUNCAO` e
    // `MUDANCA_CENTRO_DE_CUSTO` gravados só por teste. O filtro existia e o dado não podia existir.
    // Quando a entrada chegar, estes passos passam; enquanto não chegar, eles falham NOMEANDO a
    // causa, que é o oposto de um verde sobre um sistema que não existe.
    const funcoes = await irPara(N, page, "/pessoal/funcoes").catch(() => "");
    const temTelaDeFuncoes = funcoes !== "" && (await page.$('form[data-acao="criar-funcoes"]')) !== null;
    R.conferir(
      "7.1 existe a tela de CADASTRO DE FUNÇÕES, e ela oferece o formulário de criação",
      temTelaDeFuncoes,
      `/pessoal/funcoes ${funcoes === "" ? "não respondeu" : "respondeu"}, formulário criar-funcoes ${temTelaDeFuncoes ? "presente" : "AUSENTE"} — sem ele, o eixo 'função' tem filtro e nenhuma porta de entrada`
    );
    let funcaoCriada = "a tela de funções não existe";
    if (temTelaDeFuncoes) {
      const cf = async (codigo: string, denominacao: string): Promise<boolean> => {
        await irPara(N, page, "/pessoal/funcoes");
        if ((await texto(page)).includes(codigo.toLowerCase())) return true;
        const r = await preencherEEnviar(page, "criar-funcoes", [
          { sel: 'input[name="codigo"]', valor: codigo },
          { sel: 'input[name="denominacao"]', valor: denominacao },
          { sel: 'input[name="leiAutorizativa"]', valor: "Lei Municipal 2.000/2015 (percurso)" },
          { sel: 'input[name="dataPublicacaoLei"]', valor: "2015-03-01", tipo: "data" },
        ]);
        return r.tipo === "ok" || /já existe|unique/i.test(r.texto);
      };
      const ok = (await cf(FUNCAO_DIR, `Direcao de Escola ${SUF}`)) && (await cf(FUNCAO_COORD, `Coordenacao Pedagogica ${SUF}`));
      funcaoCriada = ok ? "" : "o cadastro de função foi recusado";
    }
    R.conferir("7.2 as duas funções do cenário são cadastradas pela tela", funcaoCriada === "", funcaoCriada);

    /**
     * ⚠️ A DESIGNAÇÃO É EVENTO COM VIGÊNCIA, e é isso que distingue FUNÇÃO de CARGO: a função é
     * atribuição designada por ato, não a espécie do posto (`TipoCargo.FUNCAO_GRATIFICADA`) nem a
     * parcela que ela costuma pagar (`gratificacaoDescricao`). As três continuam existindo de
     * propósito; o que mudou é deixarem de ser a mesma coisa.
     */
    const hrefS1 = await fichaDoCenario(S1_CIVIL);
    let tiposDeMovimento: readonly string[] = [];
    if (hrefS1 !== "") {
      await irPara(N, page, hrefS1);
      tiposDeMovimento = await opcoesDe(page, 'form[data-acao="movimentar"] select[name="tipo"]');
    }
    nota(`tipos oferecidos em 'movimentar': ${tiposDeMovimento.join(" | ")}`);
    R.conferir(
      "7.3 o ato de MOVIMENTAR oferece designar função, dispensar função e mudar o centro de custo",
      tiposDeMovimento.some((t) => /designa/i.test(t)) && tiposDeMovimento.some((t) => /dispens/i.test(t)) && tiposDeMovimento.some((t) => /centro de custo/i.test(t)),
      `oferecidos: ${tiposDeMovimento.join(" | ")} — sem eles, `
        + `DESIGNACAO_FUNCAO / DISPENSA_FUNCAO / MUDANCA_CENTRO_DE_CUSTO existem no enum e só os testes os gravam`
    );

    const designar = async (nome: string, matricula: string, tipo: string, campo: string, alvo: string, data: string): Promise<string> => {
      const href = await fichaDoCenario(nome);
      if (href === "") return `a ficha de "${nome}" não apareceu`;
      await irPara(N, page, href);
      const idV = await opcaoQueCasa(page, 'form[data-acao="movimentar"] select[name="vinculoId"]', matricula);
      if (idV === "") return `movimentar não ofereceu a matrícula ${matricula}`;
      const idAlvo = await opcaoQueCasa(page, `form[data-acao="movimentar"] select[name="${campo}"]`, alvo);
      if (idAlvo === "") return `movimentar não ofereceu o campo "${campo}" com "${alvo}"`;
      const r = await preencherEEnviar(page, "movimentar", [
        { sel: 'select[name="vinculoId"]', valor: idV, tipo: "select" },
        { sel: 'select[name="tipo"]', valor: tipo, tipo: "select" },
        { sel: 'input[name="data"]', valor: data, tipo: "data" },
        { sel: `select[name="${campo}"]`, valor: idAlvo, tipo: "select" },
        { sel: 'input[name="motivo"]', valor: "Portaria do percurso dos eixos" },
      ]);
      return r.tipo === "ok" ? "" : `${r.tipo}: ${r.texto.slice(0, 200)}`;
    };

    let designacoes = "os tipos de movimento de função e centro de custo não são oferecidos pela tela";
    if (tiposDeMovimento.some((t) => /designa/i.test(t)) && tiposDeMovimento.some((t) => /centro de custo/i.test(t))) {
      const d1 = await designar(S1_CIVIL, S1_MAT, "DESIGNACAO_FUNCAO", "funcaoId", FUNCAO_DIR, "2022-03-01");
      const d2 = await designar(S1_CIVIL, S1_MAT, "MUDANCA_CENTRO_DE_CUSTO", "centroDeCustoId", CENTRO_A, "2022-03-01");
      const d3 = await designar(S4_NOME, S4_MAT, "MUDANCA_CENTRO_DE_CUSTO", "centroDeCustoId", CENTRO_B, "2022-11-05");
      designacoes = [d1, d2, d3].every((x) => x === "") ? "" : `S1/função=${d1 || "ok"} S1/centro=${d2 || "ok"} S4/centro=${d3 || "ok"}`;
    }
    R.conferir("7.4 a designação de função e a mudança de centro de custo são gravadas pela tela", designacoes === "", designacoes);

    // ── 7.5/7.6 os dois eixos novos ACHAM alguém, que é o que a fixture tem de garantir ──
    const porFuncao = await consultar(page, { funcao: FUNCAO_DIR });
    R.conferir(
      "7.5 ⚠️ função: ACHA quem foi designado — um filtro que nunca acha nada é indistinguível de um filtro correto sobre dado ausente",
      achou(porFuncao, S1_SOCIAL) || achou(porFuncao, S1_CIVIL),
      `linhas: ${porFuncao.join(" || ").slice(0, 300)}`
    );
    R.conferir("7.5b e a função NÃO traz quem não foi designado", !achou(porFuncao, S4_NOME), porFuncao.join(" || ").slice(0, 300));
    const porCentro = await consultar(page, { centroDeCusto: CENTRO_A });
    R.conferir("7.6 ⚠️ centro de custo: ACHA quem está apropriado nele", achou(porCentro, S1_SOCIAL) || achou(porCentro, S1_CIVIL), `linhas: ${porCentro.join(" || ").slice(0, 300)}`);
    R.conferir("7.6b e não traz quem está em outro centro de custo", !achou(porCentro, S4_NOME), porCentro.join(" || ").slice(0, 300));

    // ── 7.7 A DISPENSA ENCERRA A VIGÊNCIA, e é por isso que a função é EVENTO e não atributo ──
    //
    // ⚠️ A DISPENSA NÃO INFORMA QUAL FUNÇÃO — ela encerra a VIGENTE, e o campo de função nem
    // aparece para ela ("só designação — a dispensa encerra a vigente"). Informar qual seria
    // convidar a dispensar uma que não está em curso.
    const dispensa = await (async (): Promise<string> => {
      const href = await fichaDoCenario(S1_CIVIL);
      if (href === "") return `a ficha de "${S1_CIVIL}" não apareceu`;
      await irPara(N, page, href);
      const idV = await opcaoQueCasa(page, 'form[data-acao="movimentar"] select[name="vinculoId"]', S1_MAT);
      if (idV === "") return `movimentar não ofereceu a matrícula ${S1_MAT}`;
      const r = await preencherEEnviar(page, "movimentar", [
        { sel: 'select[name="vinculoId"]', valor: idV, tipo: "select" },
        { sel: 'select[name="tipo"]', valor: "DISPENSA_FUNCAO", tipo: "select" },
        { sel: 'input[name="data"]', valor: "2023-06-30", tipo: "data" },
        { sel: 'input[name="motivo"]', valor: "Portaria de dispensa (percurso)" },
      ]);
      return r.tipo === "ok" ? "" : `${r.tipo}: ${r.texto.slice(0, 200)}`;
    })();
    R.conferir("7.7 a DISPENSA de função é gravada sem informar qual função — ela encerra a vigente", dispensa === "", dispensa);
    /**
     * ⚠️ E O EFEITO DA DISPENSA SE MEDE PELA DATA DE REFERÊNCIA, que é o que separa a função
     * (ato datado, com vigência) de um atributo do cadastro. Designada em 01/03/2022 e dispensada
     * em 30/06/2023: em 2023-01-10 ela exerce; em 2024-01-10 não exerce mais.
     */
    const exercendoAntes = await consultar(page, { funcao: FUNCAO_DIR, dataRef: "2023-01-10" });
    R.conferir("7.8 na vigência da designação, o eixo função ACHA quem a exercia", achou(exercendoAntes, S1_SOCIAL) || achou(exercendoAntes, S1_CIVIL), `linhas: ${exercendoAntes.join(" || ").slice(0, 300)}`);
    const exercendoDepois = await consultar(page, { funcao: FUNCAO_DIR, dataRef: "2024-01-10" });
    /**
     * ⚠️ ESTE PASSO SÓ VALE SE O ANTERIOR ACHOU — e na primeira corrida ele passou por VACUIDADE:
     * ninguém tinha sido designado (a ficha de S1 não abria), então "não acha mais" era
     * trivialmente verdadeiro. "Sumiu depois da dispensa" e "nunca esteve lá" são estados
     * diferentes, e um passo que não os distingue mede o nada.
     */
    const houveDesignacaoVigente = achou(exercendoAntes, S1_SOCIAL) || achou(exercendoAntes, S1_CIVIL);
    R.conferir(
      "7.9 ⚠️ depois da dispensa, NÃO acha mais — a função é vigência, não carimbo permanente",
      houveDesignacaoVigente && !achou(exercendoDepois, S1_SOCIAL) && !achou(exercendoDepois, S1_CIVIL),
      !houveDesignacaoVigente
        ? "o passo 7.8 não achou ninguém na vigência — 'não acha mais' seria trivialmente verdadeiro, e este passo NÃO vale como prova"
        : `linhas: ${exercendoDepois.join(" || ").slice(0, 300)}`
    );

    /**
     * ⚠️ "EXERCENDO HOJE" É DERIVADO, NÃO CONTAGEM DE EVENTOS. Contar designações incluiria os
     * dispensados, e o número cresceria para sempre sem nunca cair — um contador que só sobe é
     * indistinguível de um contador quebrado. S1 foi designada e dispensada: ela NÃO conta mais.
     */
    const listaDeFuncoes = await irPara(N, page, "/pessoal/funcoes");
    /**
     * ⚠️ A CÉLULA SE LÊ COMO CÉLULA, NÃO POR REGEX SOBRE O TEXTO COLADO — e isto foi defeito
     * DESTE script, pego na primeira corrida. A linha vem concatenada como
     * `FG-DIR-E1Direcao de Escola E10VIGENTE`: o "0" de "Exercendo hoje" fica colado no "E1" do
     * sufixo, e uma expressão que exigisse fronteira de não-dígito antes dele **falha sobre o
     * valor certo**. O passo ficava vermelho sem defeito nenhum do produto.
     * As colunas são: código, denominação, "Exercendo hoje", situação.
     */
    const exercendo = await page.evaluate((cod) => {
      const tr = Array.from(document.querySelectorAll("tbody tr")).find((x) => (x.textContent ?? "").includes(cod));
      if (tr === undefined) return null;
      return Array.from(tr.querySelectorAll("td")).map((td) => (td.textContent ?? "").trim());
    }, FUNCAO_DIR);
    nota(`células da função ${FUNCAO_DIR}: ${JSON.stringify(exercendo)}`);
    R.conferir(
      "7.10 ⚠️ 'Exercendo hoje' é DERIVADO da vigência: quem foi dispensado não conta mais",
      exercendo !== null && exercendo[2] === "0",
      exercendo === null ? `a função ${FUNCAO_DIR} não apareceu na lista: ${listaDeFuncoes.slice(0, 200)}` : `células: ${JSON.stringify(exercendo)}`
    );

    // ══ 8. A PAGINAÇÃO — o defeito era invisível abaixo de 25 ════════════════
    //
    // ⚠️ O FILTRO `situacao` ERA APLICADO DEPOIS DO `skip`/`take`, sobre as 25 linhas já
    // recortadas: o total virava "quantos casam NESTA PÁGINA" e a página 2 perdia quem ficou na 1.
    // Com 25 servidores ou menos ninguém vê. Aqui o volume é de milhares, e a asserção é a que o
    // defeito quebrava: o TOTAL é o mesmo nas duas páginas, e a união delas não repete ninguém.
    const totalDeServidores = await semearCenarioDeVolume(VOLUME_ABAIXO_DO_TETO, 1);
    R.conferir(`8.0 o cenário de VOLUME está no banco e ainda abaixo do teto de 5000 (total=${totalDeServidores})`, totalDeServidores > 100 && totalDeServidores < 5000, `total de Servidor = ${totalDeServidores}`);

    await consultar(page, { situacao: "SEM_VINCULO" });
    const totalP1 = await totalDaLista(page);
    const p1 = await linhasDaLista(page);
    await consultar(page, { situacao: "SEM_VINCULO", pagina: "2" });
    const totalP2 = await totalDaLista(page);
    const p2 = await linhasDaLista(page);
    nota(`paginação: total p1="${totalP1}" total p2="${totalP2}" · ${p1.length} e ${p2.length} linhas`);
    R.conferir(
      "8.1 ⚠️ o TOTAL é o mesmo nas duas páginas — o defeito o fazia virar 'quantos casam nesta página'",
      totalP1 !== "" && totalP1 === totalP2,
      `p1="${totalP1}" p2="${totalP2}"`
    );
    R.conferir("8.2 as duas páginas vêm cheias (o volume é muito maior que uma página)", p1.length > 0 && p2.length > 0, `p1=${p1.length} linhas, p2=${p2.length} linhas`);
    const repetidas = p1.filter((l) => p2.includes(l));
    R.conferir("8.3 e a união das páginas não REPETE ninguém — a página 2 não devolve quem já saiu na 1", repetidas.length === 0, `${repetidas.length} linha(s) repetida(s): ${repetidas.slice(0, 2).join(" || ").slice(0, 200)}`);

    // ══ 9. A RECUSA DO TETO — `PESSOAL-RECUSA-DO-TETO-SEM-PERCURSO` ══════════
    //
    // ⚠️ É O ÚNICO PASSO QUE PROVA ESTE RAMO, e ele é o ÚLTIMO de propósito: cruzado o teto,
    // TODA consulta de caminho lento passa a recusar. A guarda anterior era inerte — casava com o
    // texto-fonte do `page.tsx`, e trocar o ramo por `if (false && …)` deixava a suíte verde.
    const totalAcimaDoTeto = await semearCenarioDeVolume(VOLUME_QUE_CRUZA_O_TETO, VOLUME_ABAIXO_DO_TETO + 1);
    R.conferir(`9.0 o volume cruzou o teto de 5000 (total=${totalAcimaDoTeto})`, totalAcimaDoTeto > 5000, `total de Servidor = ${totalAcimaDoTeto}`);

    await consultar(page, { situacao: "ATIVO" });
    const telaDoTeto = await page.evaluate(() => (document.body.innerText ?? "").replace(/\s+/g, " "));
    nota(`tela do teto: ${telaDoTeto.slice(0, 400)}`);
    R.conferir(
      "9.1 ⚠️ acima do teto, a tela mostra a RECUSA como estado — não a tela genérica de erro do Next, onde o operador veria só um digest",
      /Consulta muito abrangente/i.test(telaDoTeto),
      telaDoTeto.slice(0, 500)
    );
    /**
     * ⚠️ A MENSAGEM INTEIRA, NÃO O CÓDIGO. O que o operador precisa é (a) quantos a consulta
     * alcança, (b) o que fazer, e (c) a garantia de que NADA foi truncado — truncar devolveria
     * uma lista que parece completa com um total que parece certo.
     */
    R.conferir("9.2 e a recusa diz QUANTOS alcançou e qual é o teto", /abrange\s*\d+\s*servidores/i.test(telaDoTeto) && /limite de\s*5000/i.test(telaDoTeto), telaDoTeto.slice(0, 500));
    R.conferir("9.3 e diz o que fazer — estreitar por nome, matrícula, data de admissão ou regime jurídico", /Refine a pesquisa por nome, matr[íi]cula, data de admiss[ãa]o ou regime jur[íi]dico/i.test(telaDoTeto), telaDoTeto.slice(0, 500));
    R.conferir("9.4 ⚠️ e garante que NÃO truncou — truncar devolveria um total que parece certo", /nenhum resultado parcial foi exibido/i.test(telaDoTeto), telaDoTeto.slice(0, 500));
    /**
     * ⚠️ E O CAMINHO RÁPIDO CONTINUA ATENDENDO. A recusa é do caminho que apura por evento; uma
     * consulta sem eixo derivado nem situação recorta no banco e responde normalmente. Sem este
     * passo, "a tela recusou" seria compatível com a tela ter quebrado de vez.
     */
    const aindaResponde = await consultar(page, { matricula: S1_MAT });
    R.conferir(
      "9.5 e o caminho RÁPIDO continua respondendo — a recusa é do conjunto amplo, não da tela",
      achou(aindaResponde, S1_SOCIAL) || achou(aindaResponde, S1_CIVIL),
      `linhas: ${aindaResponde.join(" || ").slice(0, 300)}`
    );

    // ══ 10. AUTORIZAÇÃO — negativa e positiva PAREADAS, no servidor ══════════
    await sair(N, page);
    await entrar(N, page, TESOURARIA, SENHA);
    /**
     * ⚠️ CONTROLE POSITIVO DO ATOR NEGATIVO, ANTES DE CONFIAR NA RECUSA. "Não entrou" é compatível
     * com sessão morta, senha errada e tela quebrada. Esta mesma sessão lê a área que é dela.
     */
    const oQueEDele = await barrado(N, page, "/despesa/empenhos");
    R.conferir(
      "10.0 (controle positivo do ator negativo) a sessão da tesouraria está viva e LÊ a área que é dela",
      !oQueEDele.barrado,
      `url=${oQueEDele.url} status=${oQueEDele.status} — sem isto, o vermelho de 10.1 não distingue "sem permissão" de "sessão ruim"`
    );
    const semPessoal = await barrado(N, page, "/pessoal/servidores");
    R.conferir("10.1 NEGATIVA no servidor: sem CONSULTAR_PESSOAL, a consulta de servidores é BARRADA", semPessoal.barrado, `url=${semPessoal.url} status=${semPessoal.status}`);
    await sair(N, page);
    await entrar(N, page, RH, SENHA);
    const comPessoal = await irPara(N, page, `/pessoal/servidores?matricula=${encodeURIComponent(S1_MAT)}`);
    R.conferir("10.2 POSITIVA pareada: com CONSULTAR_PESSOAL, a MESMA rota abre e traz o servidor", comPessoal.toLowerCase().includes(S1_MAT.toLowerCase()), comPessoal.slice(0, 300));
  } catch (e) {
    R.falhou("execução", e instanceof Error ? e.message : String(e));
  } finally {
    await navegador?.close();
  }
  if (naoExecutados.length > 0) {
    console.error(`\n${naoExecutados.length} passo(s) NAO EXECUTADO(S) — contados como não executados, nunca como aprovados:`);
    for (const n of naoExecutados) console.error(` - ${n}`);
  }
  R.encerrar();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
