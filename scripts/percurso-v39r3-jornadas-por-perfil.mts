import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { exigirDestinoDoPercurso } from "./destino-do-percurso.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V39-R3 (R3-030) — AS JORNADAS POR PERFIL, SEM ADMINISTRADOR.
 *
 * Para cada perfil do pedido, com o usuário de ensaio que o representa: a tela da sua área abre com o ato dela, e a tela de
 * outra área o leva para a tela de sem acesso NOMEANDO a ação que falta. A OPERAÇÃO de cada perfil está no percurso da R3
 * citado na linha (operado por esse mesmo usuário); recursos humanos opera aqui (anotação na ficha funcional) e o fiscal
 * de contrato não tem operação percorrida (a base R3 não tem contrato — dito na linha, não contado como operação).
 * GRAVA uma anotação (base de ensaio); na corrida seguinte, dita.
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

interface Jornada {
  readonly perfil: string;
  readonly usuario: string;
  readonly permitida: string;
  readonly marcador: string;
  readonly recusada: string;
  readonly acaoQueFalta: string;
  readonly operou: string;
}
const JORNADAS: readonly Jornada[] = [
  { perfil: "planejador", usuario: "planejador@ficticio.local", permitida: "/planejamento/fichas", marcador: "a[data-exportar-csv]", recusada: "/financeiro/lotes", acaoQueFalta: "CONSULTAR_FINANCEIRO", operou: "percurso-v39r3-projeto-e-emendas (projeto da LOA e emendas)" },
  { perfil: "comprador", usuario: "solicitante.compras@ficticio.local", permitida: "/licitacoes/solicitacoes", marcador: 'form[data-acao^="criar-"]', recusada: "/financeiro/lotes", acaoQueFalta: "CONSULTAR_FINANCEIRO", operou: "percurso-v39r3-solicitacao-no-processo e -pesquisa-de-precos (solicitação de compra)" },
  { perfil: "agente de contratação", usuario: "agente.contratacao@ficticio.local", permitida: "/licitacoes/processos", marcador: 'form[data-acao^="criar-"]', recusada: "/folha/folhas", acaoQueFalta: "CONSULTAR_FOLHA", operou: "percurso-v39r3-solicitacao-no-processo (itens do processo pelas solicitações)" },
  { perfil: "fiscal de contrato", usuario: "fiscal.contrato@ficticio.local", permitida: "/licitacoes/fiscalizacao", marcador: "h1", recusada: "/financeiro/lotes", acaoQueFalta: "CONSULTAR_FINANCEIRO", operou: "NÃO PERCORRIDA: a base R3 não tem contrato em que ele seja designado" },
  { perfil: "almoxarife", usuario: "almoxarife@ficticio.local", permitida: "/patrimonio/almoxarifado/estoque", marcador: "h1", recusada: "/planejamento/fichas", acaoQueFalta: "CONSULTAR_PLANEJAMENTO", operou: "percurso-v39r3-ajuste-do-inventario (contagem e ajuste)" },
  { perfil: "patrimônio", usuario: "patrimonio@ficticio.local", permitida: "/patrimonio/bens-patrimoniais", marcador: "a[data-exportar-csv]", recusada: "/folha/folhas", acaoQueFalta: "CONSULTAR_FOLHA", operou: "percurso-v39r3-patrimonio (incorporação, transferência, depreciação, baixa)" },
  { perfil: "recursos humanos", usuario: "rh@ficticio.local", permitida: "/pessoal/servidores", marcador: "a[data-exportar-csv]", recusada: "/financeiro/lotes", acaoQueFalta: "CONSULTAR_FINANCEIRO", operou: "este percurso (anotação na ficha funcional)" },
  { perfil: "contador", usuario: "custos.contabilidade@ficticio.local", permitida: "/contabilidade/custos", marcador: "h1", recusada: "/financeiro/lotes", acaoQueFalta: "CONSULTAR_FINANCEIRO", operou: "percurso-v39r3-custo-da-folha e -previa-do-siope; encerramento na cópia isolada (encerramento@)" },
  { perfil: "tesoureiro", usuario: "tesoureiro.lote@ficticio.local", permitida: "/financeiro/lotes", marcador: 'form[data-acao="criar-lote"]', recusada: "/pessoal/servidores", acaoQueFalta: "CONSULTAR_PESSOAL", operou: "percurso-v39r3-folha-ate-o-banco (ordem no lote, borderô, retorno e rejeição)" },
];

const nav = await lancarNavegadorDoPercurso();
try {
  for (const j of JORNADAS.filter((x) => process.env["SO_PERFIS"] === undefined || process.env["SO_PERFIS"].split(",").includes(x.perfil))) {
    const ctx = await nav.createBrowserContext();
    const p = await ctx.newPage();
    p.setDefaultTimeout(300000);
    await entrar(n, p, j.usuario, senha);
    // A página inicial termina de carregar antes da primeira navegação, como a pessoa faz. Medido: navegar enquanto o
    // redirecionamento do login ainda renderiza "/" derrubava a página seguinte com 500 no servidor de desenvolvimento
    // ("frame.join is not a function", na formatação do erro do próprio Next); sozinha, a mesma página responde 200.
    await irPara(n, p, "/");
    await p.waitForNetworkIdle({ idleTime: 1000, timeout: 120000 }).catch(() => undefined);
    await irPara(n, p, j.permitida);
    const abriu = new URL(p.url()).pathname === j.permitida && (await p.$(j.marcador)) !== null;
    await irPara(n, p, j.recusada);
    const recusa = new URL(p.url());
    const recusou = recusa.pathname === "/sem-acesso" && recusa.searchParams.get("acao") === j.acaoQueFalta;

    if (j.perfil === "recursos humanos") {
      const servidor = await prisma.servidor.findFirst({ orderBy: { criadoEm: "asc" }, select: { id: true } });
      const ja = await prisma.anotacaoServidor.count({ where: { criadoPor: j.usuario, titulo: "Participação no ensaio R3-030" } });
      if (servidor === null) conferir(false, "recursos humanos: a base não tem servidor");
      else if (ja > 0) nota("recursos humanos: a anotação já estava registrada numa corrida anterior");
      else {
        await irPara(n, p, `/pessoal/servidores/${servidor.id}`);
        const semAdmitirNemDesligar = (await p.$('form[data-acao="admitir"], form[data-acao="desligar"], form[data-acao="alterar-remuneracao"]')) === null;
        const r = await preencherEEnviar(p, "anotacao", [
          { sel: 'select[name="tipo"]', valor: "ELOGIO", tipo: "select" },
          { sel: 'input[name="data"]', valor: "2026-10-14", tipo: "data" },
          { sel: 'input[name="titulo"]', valor: "Participação no ensaio R3-030" },
          { sel: 'textarea[name="texto"]', valor: "Colaborou com a conferência das jornadas por perfil (ensaio)." },
        ]);
        const gravada = await prisma.anotacaoServidor.count({ where: { servidorId: servidor.id, criadoPor: j.usuario, titulo: "Participação no ensaio R3-030" } });
        conferir(r.tipo !== "erro" && gravada === 1 && semAdmitirNemDesligar, `recursos humanos anota na ficha funcional, com o nome de quem anotou, e não recebe admitir, desligar nem alterar remuneração (${r.texto.slice(0, 50)})`);
      }
    }
    conferir(abriu && recusou, `${j.perfil} (${j.usuario}): abre ${j.permitida} com o seu ato; ${j.recusada} vai para a tela de sem acesso por ${recusa.searchParams.get("acao") ?? "-"} · operação: ${j.operou}`);
    await ctx.close();
  }
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso das jornadas por perfil completo.");
