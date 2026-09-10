import "dotenv/config";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import {
  criarAssunto,
  criarSetor,
  lotarUsuarioNoSetor,
} from "../../modules/m21-protocolo/cadastros.js";
import { criarTipoDeComunicado } from "../../modules/m23-comunicacao/servico.js";
import { definirCampoAdicional } from "../../modules/m25-campos-adicionais/servico.js";
import {
  criarNivelDeSeveridade,
  escreverAjudaDeRota,
} from "../../modules/m27-suporte/servico.js";

/**
 * SEED DO CENÁRIO DO ENT02 — a configuração mínima para o lote ser exercitado.
 *
 * ═══ ⚠️ SÓ CADASTRO. NENHUM PROCESSO, NENHUM COMUNICADO ═══
 * Este seed cria o que a ENTIDADE configuraria: setores, lotação, assuntos com roteiro,
 * tipos de comunicado, níveis de severidade, campos adicionais e a ajuda das rotas.
 *
 * Ele NÃO abre processo nem emite comunicado — esses são atos, e um seed que os
 * fabricasse produziria histórico que ninguém executou. Quem os cria é a TELA, no smoke
 * e no uso real. É a mesma disciplina do `cenario-aceite.ts` do ENT01.
 *
 * ⚠️ E ELE PASSA PELOS CASOS DE USO, não por `prisma.create` direto. Assim a autorização,
 * a unicidade e os guards valem também aqui — um seed que escreve por baixo é um seed
 * que pode criar o que o sistema recusaria.
 *
 * Uso:
 *   SEED_IDENTIDADE="usuario@ente.gov.br" npm run seed:ent02
 *
 * IDEMPOTENTE por recusa nomeada: rodar duas vezes acusa o que já existe, em vez de
 * duplicar. Não é `upsert` de propósito — um seed silenciosamente re-executável esconde
 * a diferença entre "estava lá" e "acabei de criar".
 */

function urlDoBanco(): string {
  const url = process.env["DATABASE_URL"];
  if (url === undefined || url.trim() === "") {
    throw new Error("DATABASE_URL não definida — veja .env.example.");
  }
  return url;
}

/**
 * ⚠️ A IDENTIDADE VEM DO AMBIENTE, SEM DEFAULT. Um `criadoPor: "SEED"` fixo seria uma
 * string que o funil do M16 recusa — e, pior, um autor que ninguém pode cobrar. Mesma
 * exigência do `cenario-aceite.ts`.
 */
function identidade(): string {
  const ident = process.env["SEED_IDENTIDADE"]?.trim();
  if (ident === undefined || ident === "") {
    throw new Error(
      "SEED_IDENTIDADE não definida.\n" +
        "Todo cadastro deste seed carrega a identidade de quem o criou, e essa identidade " +
        "tem de EXISTIR no cadastro de usuários — o funil do M16 recusa string livre.\n" +
        'Exemplo:\n  SEED_IDENTIDADE="admin@ente.gov.br" npm run seed:ent02'
    );
  }
  return ident;
}

async function main(): Promise<void> {
  const prisma = criarPrismaClient(urlDoBanco());
  const criadoPor = identidade();

  try {
    const unidade = await prisma.unidadeOrcamentaria.findFirst({
      select: { id: true, codigo: true, descricao: true },
      orderBy: { codigo: "asc" },
    });
    if (unidade === null) {
      throw new Error(
        "Nenhuma unidade orçamentária cadastrada. O setor pendura numa unidade gestora — " +
          "é o que faz a permissão por UG valer para a tramitação. Rode antes o seed do " +
          "M02 (npm run seed:m02)."
      );
    }
    console.log(
      `[ent02] unidade gestora: ${unidade.codigo} — ${unidade.descricao}`
    );

    // ── SETORES ───────────────────────────────────────────────────────────────
    const setores: Record<string, string> = {};
    for (const s of [
      { codigo: "PROT", nome: "Protocolo Geral" },
      { codigo: "JUR", nome: "Procuradoria" },
      { codigo: "GAB", nome: "Gabinete" },
    ]) {
      try {
        const r = await criarSetor(prisma, { ...s, unidadeOrcId: unidade.id, criadoPor });
        setores[s.codigo] = r.setorId;
        console.log(`[ent02] setor ${s.codigo} criado.`);
      } catch (e) {
        const existente = await prisma.setor.findUnique({
          where: { codigo: s.codigo },
          select: { id: true },
        });
        if (existente === null) throw e;
        setores[s.codigo] = existente.id;
        console.log(`[ent02] setor ${s.codigo} já existia.`);
      }
    }

    // ── LOTAÇÃO ───────────────────────────────────────────────────────────────
    // ⚠️ QUEM RODA O SEED É LOTADO EM TODOS OS SETORES. É deliberado e é declarado:
    // num ente de verdade cada servidor é lotado no seu, e a segregação é justamente
    // o que a lotação existe para dar. Aqui é o operador do cenário, que precisa
    // percorrer a cadeia inteira sozinho.
    for (const [codigo, setorId] of Object.entries(setores)) {
      await lotarUsuarioNoSetor(prisma, {
        usuarioIdent: criadoPor,
        setorId,
        criadoPor,
      });
      console.log(`[ent02] "${criadoPor}" lotado em ${codigo}.`);
    }

    // ── ASSUNTOS, COM ROTEIRO ─────────────────────────────────────────────────
    const assuntos = [
      {
        codigo: "REQ",
        nome: "Requerimento geral",
        textoOrientacao:
          "Descreva o que está sendo pedido e anexe os documentos comprobatórios.",
        roteiro: [
          { ordem: 1, setorId: setores["PROT"]!, prazoDias: 3, descricao: "Triagem no protocolo" },
          { ordem: 2, setorId: setores["JUR"]!, prazoDias: 10, descricao: "Análise jurídica" },
          { ordem: 3, setorId: setores["GAB"]!, prazoDias: 5, descricao: "Decisão do gabinete" },
        ],
      },
      {
        codigo: "OUV",
        nome: "Manifestação de ouvidoria",
        permiteAnonimo: true,
        sigiloPadrao: true,
        textoOrientacao:
          "Sua manifestação pode ser anônima. Informe um contato se quiser resposta.",
        roteiro: [
          { ordem: 1, setorId: setores["GAB"]!, prazoDias: 20, descricao: "Apuração" },
        ],
      },
      {
        codigo: "ALV",
        nome: "Alvará de funcionamento",
        bloqueiaTramiteComTaxaAberta: true,
        termoDeAceite:
          "Declaro que as informações prestadas são verdadeiras e que estou ciente de que a " +
          "falsidade sujeita o requerente às sanções legais cabíveis.",
        roteiro: [
          { ordem: 1, setorId: setores["PROT"]!, prazoDias: 2, descricao: "Conferência documental" },
          { ordem: 2, setorId: setores["JUR"]!, prazoDias: 15, descricao: "Análise do pedido" },
        ],
      },
    ];

    for (const a of assuntos) {
      try {
        await criarAssunto(prisma, { ...a, unidadeOrcId: unidade.id, criadoPor });
        console.log(`[ent02] assunto ${a.codigo} criado, com ${a.roteiro.length} etapa(s).`);
      } catch (e) {
        const existe = await prisma.assunto.findUnique({
          where: { codigo: a.codigo },
          select: { id: true },
        });
        if (existe === null) throw e;
        console.log(`[ent02] assunto ${a.codigo} já existia.`);
      }
    }

    // ── TIPOS DE COMUNICADO ───────────────────────────────────────────────────
    // ⚠️ MEMORANDO, OFÍCIO E CIRCULAR SÃO DADOS. Não são valores de enum, e é por isso
    // que estão aqui e não no schema: cada entidade cria os seus.
    for (const t of [
      { codigo: "MEMO", nome: "Memorando", aceitaResposta: true },
      { codigo: "OFIC", nome: "Ofício", aceitaResposta: true, modoDeAssinaturaExigido: "AVANCADA" as const },
      { codigo: "CIRC", nome: "Circular", aceitaResposta: false },
    ]) {
      try {
        await criarTipoDeComunicado(prisma, { ...t, criadoPor });
        console.log(`[ent02] tipo de comunicado ${t.codigo} criado.`);
      } catch {
        console.log(`[ent02] tipo de comunicado ${t.codigo} já existia.`);
      }
    }

    // ── SEVERIDADES DO SUPORTE ────────────────────────────────────────────────
    for (const s of [
      { codigo: "P1", nome: "Crítica — sistema parado", ordem: 1, prazoHoras: 4 },
      { codigo: "P2", nome: "Alta — função indisponível", ordem: 2, prazoHoras: 24 },
      { codigo: "P3", nome: "Dúvida de uso", ordem: 3, prazoHoras: 72 },
    ]) {
      try {
        await criarNivelDeSeveridade(prisma, { ...s, criadoPor });
        console.log(`[ent02] severidade ${s.codigo} criada.`);
      } catch {
        console.log(`[ent02] severidade ${s.codigo} já existia.`);
      }
    }

    // ── CAMPOS ADICIONAIS ─────────────────────────────────────────────────────
    // Um de cada família, para a tela do processo exercitar os tipos de verdade.
    for (const c of [
      {
        codigo: "protocolo_anterior",
        rotulo: "Protocolo anterior",
        tipo: "ALFANUMERICO" as const,
        ordem: 1,
      },
      {
        codigo: "valor_estimado",
        rotulo: "Valor estimado",
        tipo: "VALOR" as const,
        ordem: 2,
      },
      {
        codigo: "prazo_pretendido",
        rotulo: "Prazo pretendido",
        tipo: "DATA" as const,
        ordem: 3,
      },
      {
        codigo: "setor_responsavel",
        rotulo: "Setor responsável pela instrução",
        tipo: "LISTA_DINAMICA" as const,
        origemDinamica: "SETOR" as const,
        ordem: 4,
      },
      {
        codigo: "grau_de_urgencia",
        rotulo: "Grau de urgência declarado",
        tipo: "LISTA" as const,
        opcoes: ["Baixo", "Médio", "Alto"],
        ordem: 5,
      },
    ]) {
      try {
        await definirCampoAdicional(prisma, {
          ...c,
          unidadeOrcId: unidade.id,
          cadastro: "PROCESSO",
          criadoPor,
        });
        console.log(`[ent02] campo adicional ${c.codigo} definido.`);
      } catch {
        console.log(`[ent02] campo adicional ${c.codigo} já existia.`);
      }
    }

    // ── AJUDA CONTEXTUAL ──────────────────────────────────────────────────────
    for (const a of [
      {
        rota: "/protocolo/processos",
        titulo: "Abrindo e acompanhando processos",
        conteudo:
          "Escolha o assunto: ele traz o roteiro, os prazos e as regras. O roteiro é " +
          "COPIADO para o processo na abertura — reconfigurar o assunto depois não mexe " +
          "nos processos já abertos.\n\n" +
          "Você só enxerga os processos dos setores em que está lotado, os que abriu, os " +
          "que movimentou e os não sigilosos da sua unidade gestora.",
      },
      {
        rota: "/comunicacao/comunicados",
        titulo: "Comunicados internos",
        conteudo:
          "As caixas são calculadas para quem olha: o mesmo comunicado está na saída de " +
          "quem enviou e na entrada de quem recebeu.\n\n" +
          "Responder alcança apenas os setores já envolvidos. Para trazer alguém novo, " +
          "use encaminhar — e o encaminhamento fica registrado como tal.",
      },
    ]) {
      await escreverAjudaDeRota(prisma, { ...a, criadoPor });
      console.log(`[ent02] ajuda de ${a.rota} escrita.`);
    }

    console.log(
      "\n[ent02] cenário pronto. NENHUM processo e NENHUM comunicado foram criados — " +
        "esses são atos, e quem os cria é a tela."
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
