import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { criarUsuario, concederPerfil } from "../modules/m16-travamento/servico-usuarios.js";
import type { PrismaClient } from "../prisma/generated/client/client.js";
import type { AcaoDoSistema } from "../modules/m16-travamento/acoes.js";

/**
 * USUÁRIOS SINTÉTICOS POR PAPEL — banco dos PERCURSOS (V6 P1.3 / V4 §9).
 *
 * Cria, se não existirem, um perfil e um usuário por função, com o recorte de cada uma — nunca o
 * admin universal em todos os passos. A leitura é permissão (V3 4.1): cada perfil recebe o
 * CONSULTAR_<ÁREA> das áreas em que age. Concessões GLOBAIS (o ente): os smokes exercitam o ente
 * inteiro; a segregação por unidade continua provada pelo `operador.poc` (ENT10).
 *
 * Uso: `DATABASE_URL=<percursos> SEED_IDENTIDADE=admin@... npx tsx scripts/percursos-usuarios-por-papel.ts`
 * Senha: `PERCURSOS_SENHA_PAPEIS` (ou a padrão de demonstração abaixo). Não é produção.
 * Idempotente: usuário existente é no-op (senha inalterada); perfil órfão de execução anterior é refeito.
 */

const ADMIN = process.env["SEED_IDENTIDADE"] ?? "admin@cg.pb.gov.br";
const SENHA = process.env["PERCURSOS_SENHA_PAPEIS"] ?? "Percurso#2026";

interface Papel {
  readonly identificador: string;
  readonly nome: string;
  readonly perfil: string;
  readonly descricao: string;
  readonly acoes: readonly AcaoDoSistema[];
  /**
   * V6.2 — ações concedidas SÓ numa unidade (código da UO), e não globalmente. É o que o percurso
   * precisa para provar que o seletor e o caso de uso recortam pela unidade do ato.
   */
  readonly naUnidade?: { readonly codigo: string; readonly acoes: readonly AcaoDoSistema[] };
}

export const PAPEIS: readonly Papel[] = [
  {
    identificador: "compras@percursos.local",
    nome: "Servidor de Compras (percurso)",
    perfil: "COMPRAS — PERCURSO",
    descricao: "Solicita, autoriza, pesquisa preços, emite e vincula ordens. Não recebe, não empenha, não paga.",
    acoes: ["REGISTRAR_SOLICITACAO_DE_COMPRA", "MOVIMENTAR_SOLICITACAO_DE_COMPRA", "REGISTRAR_PESQUISA_DE_PRECOS", "EMITIR_ORDEM_DE_COMPRA", "ESTORNAR_ORDEM_DE_COMPRA", "CONSULTAR_LICITACOES", "CONSULTAR_CADASTROS"],
  },
  {
    identificador: "almoxarifado@percursos.local",
    nome: "Almoxarife (percurso)",
    perfil: "ALMOXARIFADO — PERCURSO",
    descricao: "Registra e confere o documento fiscal e o recebimento da ordem. Não emite ordem, não empenha.",
    acoes: ["REGISTRAR_RECEBIMENTO_DE_ORDEM", "REGISTRAR_DOCUMENTO_FISCAL", "CONFERIR_DOCUMENTO_FISCAL", "CONSULTAR_LICITACOES", "CONSULTAR_PATRIMONIO", "CONSULTAR_CADASTROS"],
  },
  {
    identificador: "contabilidade@percursos.local",
    nome: "Contador (percurso)",
    perfil: "CONTABILIDADE — PERCURSO",
    descricao: "Empenha e liquida; fecha e apropria a folha. Não paga, não compra, não cadastra pessoal.",
    acoes: ["EMPENHAR", "LIQUIDAR", "CONSULTAR_DESPESA", "CONSULTAR_LICITACOES", "CONSULTAR_PLANEJAMENTO", "CONSULTAR_CONTABILIDADE", "CONSULTAR_CADASTROS",
      // V6 P2.3 — FECHAR a folha é da contabilidade: o fechamento congela o cálculo que vira empenho.
      // V6 P2.3b — e é ela quem APROPRIA (parametriza os grupos e gera os empenhos). EMPENHAR ela
      // já tinha, e continua sendo exigida em cada empenho pelo M05: apropriar não a contorna.
      "FECHAR_FOLHA", "CONSULTAR_FOLHA", "CADASTRAR_GRUPO_DE_EMPENHO_DA_FOLHA", "APROPRIAR_FOLHA",
      // V6.2 — e APURA os encargos do empregador sobre a folha fechada (não os certifica).
      "APURAR_ENCARGOS_DA_FOLHA",
      // V7 M1 — o AJUSTE para baixo dos encargos anula pela despesa, e cada anulação cobra a própria ação.
      "ANULAR_LIQUIDACAO_PARCIAL", "ANULAR_EMPENHO_PARCIAL"],
  },
  {
    identificador: "tesouraria@percursos.local",
    nome: "Tesoureiro (percurso)",
    perfil: "TESOURARIA — PERCURSO",
    descricao: "Paga, arrecada e concilia. Não empenha, não compra.",
    acoes: ["PAGAR", "REGISTRAR_ARRECADACAO", "VINCULAR_CONCILIACAO", "ABRIR_CONCILIACAO", "ENCERRAR_CONCILIACAO", "REGISTRAR_PENDENCIA_MANUAL", "JUSTIFICAR_PENDENCIA", "ATRIBUIR_CONTA_A_ARRECADACAO", "CONSULTAR_DESPESA", "CONSULTAR_RECEITA", "CONSULTAR_FINANCEIRO", "CONSULTAR_CADASTROS"],
  },
  {
    identificador: "rh@percursos.local",
    nome: "Servidor do RH (percurso)",
    perfil: "PESSOAL — PERCURSO",
    descricao: "Cadastra cargos, lotações e servidores; admite, movimenta, remunera e desliga; anota a ficha. Não empenha, não paga, não compra.",
    acoes: ["CADASTRAR_PESSOA", "CADASTRAR_SERVIDOR", "ADMITIR_SERVIDOR", "MOVIMENTAR_SERVIDOR", "ALTERAR_REMUNERACAO", "DESLIGAR_SERVIDOR", "CADASTRAR_CARGO", "CADASTRAR_LOTACAO", "GERIR_DEPENDENTE", "BAIXAR_DEPENDENTE", "REGISTRAR_PORTARIA", "REGISTRAR_ANOTACAO", "REGISTRAR_TREINAMENTO", "CONSULTAR_PESSOAL", "CONSULTAR_CADASTROS",
      // V6 P2.3 — a folha: o RH parametriza, lança e CALCULA. Quem FECHA é a contabilidade (é o
      // fechamento que vai ao empenho), e essa separação é percorrida pelo smoke da folha.
      "CONFIGURAR_TABELAS_DA_FOLHA", "CADASTRAR_RUBRICA", "LANCAR_NA_FOLHA", "ABRIR_FOLHA", "CALCULAR_FOLHA", "CANCELAR_CALCULO_DA_FOLHA", "CONSULTAR_FOLHA"],
  },
  {
    identificador: "atestador@percursos.local",
    nome: "Responsavel designado para o atesto da folha (percurso)",
    perfil: "ATESTO DA FOLHA — PERCURSO",
    descricao: "CERTIFICA a folha fechada — e só com designação vigente do ente. Não calcula, não fecha, não empenha, não liquida, não paga.",
    // ⚠️ UMA AÇÃO DE ESCRITA, e ela NÃO BASTA: certificar exige também uma DESIGNAÇÃO vigente no
    // dia do ato. É de propósito que este papel não tenha CALCULAR_FOLHA nem FECHAR_FOLHA — quem
    // prepara não certifica, e o percurso prova a recusa nas duas pontas.
    acoes: ["CERTIFICAR_FOLHA", "CONSULTAR_FOLHA", "CONSULTAR_PESSOAL", "CONSULTAR_CADASTROS",
      // V6.2 — certificar os ENCARGOS é ação própria, e exige designação com a atribuição própria.
      "CERTIFICAR_ENCARGOS_DA_FOLHA"],
  },
  {
    identificador: "liquidante@percursos.local",
    nome: "Agente autorizado a liquidar a folha (percurso)",
    perfil: "LIQUIDACAO DA FOLHA — PERCURSO",
    descricao: "Reconhece a obrigação da folha CERTIFICADA pelo caminho da despesa. Não certifica, não fecha, não paga.",
    // ⚠️ AS DUAS AÇÕES, e não uma: LIQUIDAR_FOLHA autoriza o ATO sobre a folha, e LIQUIDAR é
    // exigida pelo M05 em CADA liquidação, na unidade da ficha. LIQUIDAR_FOLHA não contorna o M05.
    acoes: ["LIQUIDAR_FOLHA", "LIQUIDAR", "CONSULTAR_FOLHA", "CONSULTAR_DESPESA", "CONSULTAR_CADASTROS"],
  },
  {
    identificador: "aprovador-encargos@percursos.local",
    nome: "Conferente dos parâmetros de encargos (percurso)",
    perfil: "APROVACAO DE ENCARGOS — PERCURSO",
    descricao: "Aprova as versões de parâmetro dos encargos do empregador cadastradas por outra pessoa. Não cadastra, não apura, não certifica.",
    acoes: ["APROVAR_ENCARGO_DA_FOLHA", "CONSULTAR_FOLHA", "CONSULTAR_CADASTROS"],
  },
  {
    identificador: "planejamento@percursos.local",
    nome: "Servidor do Planejamento (percurso)",
    perfil: "PLANEJAMENTO — PERCURSO",
    descricao: "Cria fichas orçamentárias (sem crédito) e executa decretos de crédito adicional. Não empenha, não liquida, não paga.",
    // V6.2 U0 — CRIAR_FICHA ganhou tela. A ficha nasce sem dotação; o crédito vem do decreto.
    acoes: ["CRIAR_FICHA", "CRIAR_DECRETO_DE_CREDITO", "EXECUTAR_CREDITO", "CONSULTAR_PLANEJAMENTO", "CONSULTAR_CADASTROS"],
  },
  {
    identificador: "planejamento-ug@percursos.local",
    nome: "Planejamento de uma unidade só (percurso)",
    perfil: "PLANEJAMENTO DE UMA UNIDADE — PERCURSO",
    descricao: "Lê o planejamento do ente e cria ficha SÓ na unidade 99001. Prova o recorte do seletor e do caso de uso.",
    acoes: ["CONSULTAR_PLANEJAMENTO", "CONSULTAR_CADASTROS"],
    naUnidade: { codigo: "99001", acoes: ["CRIAR_FICHA"] },
  },
  {
    identificador: "servidor@percursos.local",
    nome: "Servidora do quadro (percurso)",
    perfil: "SERVIDOR — PERCURSO",
    descricao: "O quadro: vê a PRÓPRIA ficha e os PRÓPRIOS contracheques no portal do servidor. Não cadastra nada, não calcula folha, não abre o pessoal do ente.",
    // ⚠️ UMA AÇÃO SÓ, e é de leitura. O recorte por pessoa é da porta (`portal-do-servidor.ts`),
    // não da permissão: dar `CONSULTAR_PESSOAL` a cada servidor abriria a ficha de todo mundo.
    acoes: ["CONSULTAR_PORTAL_DO_SERVIDOR"],
  },
  // ── V6.2 P3 — a carta de serviços ──
  {
    identificador: "carta@percursos.local",
    nome: "Gestor da carta de serviços (percurso)",
    perfil: "CARTA DE SERVIÇOS — PERCURSO",
    descricao: "Configura e publica os serviços da carta e registra representações. Não decide solicitação nem pede serviço.",
    acoes: ["CONFIGURAR_CARTA_DE_SERVICOS", "REGISTRAR_REPRESENTACAO", "CONSULTAR_PROTOCOLO", "CONSULTAR_CADASTROS"],
  },
  {
    identificador: "mesa@percursos.local",
    nome: "Servidor da mesa de solicitações (percurso)",
    perfil: "MESA DE SOLICITAÇÕES — PERCURSO",
    descricao: "Recebe, emite exigência, decide e libera resposta às solicitações da carta. Deferir atualização cadastral exige também alterar pessoa.",
    acoes: ["CONSULTAR_PROTOCOLO", "DECIDIR_SOLICITACAO_DE_SERVICO", "RECEBER_PROCESSO", "TRAMITAR_PROCESSO", "ALTERAR_PESSOA", "CONSULTAR_CADASTROS"],
  },
  {
    identificador: "cidada-a@percursos.local",
    nome: "Cidadã A (percurso)",
    perfil: "REQUERENTE — PERCURSO",
    descricao: "Pede serviços da carta e acompanha os próprios pedidos. Não vê o protocolo do ente.",
    acoes: ["SOLICITAR_SERVICO", "CONSULTAR_MEUS_SERVICOS"],
  },
  {
    identificador: "cidada-b@percursos.local",
    nome: "Cidadã B (percurso)",
    perfil: "REQUERENTE B — PERCURSO",
    descricao: "A segunda requerente: prova que uma não alcança o pedido da outra.",
    acoes: ["SOLICITAR_SERVICO", "CONSULTAR_MEUS_SERVICOS"],
  },
  {
    identificador: "representante@percursos.local",
    nome: "Representante de fornecedor (percurso)",
    perfil: "REPRESENTANTE — PERCURSO",
    descricao: "Pede o complemento documental em nome da empresa enquanto a representação estiver vigente.",
    acoes: ["SOLICITAR_SERVICO", "CONSULTAR_MEUS_SERVICOS"],
  },
  // ── V7 M2.1 — o contrato acompanhado: três contas com AS MESMAS ações; só a designação no contrato as distingue ──
  {
    identificador: "gestora-contrato@percursos.local",
    nome: "Gestora de contrato (percurso)",
    perfil: "GESTÃO DE CONTRATO — PERCURSO",
    descricao: "Programa a fiscalização e resolve ocorrências nos contratos em que for designada gestora.",
    acoes: ["CONSULTAR_LICITACOES", "PROGRAMAR_FISCALIZACAO_DO_CONTRATO", "RESOLVER_OCORRENCIA_DE_FISCALIZACAO", "REGISTRAR_OCORRENCIA_DE_FISCALIZACAO", "REGISTRAR_MEDICAO_DE_OBRA",
      // V7 M2 — a ordem de serviço é ato do gestor designado; e o recebimento provisório, do fiscal (o mesmo perfil).
      "EMITIR_ORDEM_DE_SERVICO_DO_CONTRATO", "REGISTRAR_RECEBIMENTO_PROVISORIO"],
  },
  {
    identificador: "fiscal-contrato@percursos.local",
    nome: "Fiscal de contrato (percurso)",
    perfil: "FISCALIZAÇÃO DE CONTRATO — PERCURSO",
    descricao: "Registra ocorrência com evidência e mede por itens nos contratos em que for designado fiscal.",
    acoes: ["CONSULTAR_LICITACOES", "PROGRAMAR_FISCALIZACAO_DO_CONTRATO", "RESOLVER_OCORRENCIA_DE_FISCALIZACAO", "REGISTRAR_OCORRENCIA_DE_FISCALIZACAO", "REGISTRAR_MEDICAO_DE_OBRA",
      "EMITIR_ORDEM_DE_SERVICO_DO_CONTRATO", "REGISTRAR_RECEBIMENTO_PROVISORIO"],
  },
  {
    identificador: "outro-setor-contrato@percursos.local",
    nome: "Servidor de outro setor (percurso)",
    perfil: "OUTRO SETOR — CONTRATOS — PERCURSO",
    descricao: "As mesmas ações de gestor e fiscal, sem designação em contrato nenhum: prova que o perfil não basta.",
    acoes: ["CONSULTAR_LICITACOES", "PROGRAMAR_FISCALIZACAO_DO_CONTRATO", "RESOLVER_OCORRENCIA_DE_FISCALIZACAO", "REGISTRAR_OCORRENCIA_DE_FISCALIZACAO", "REGISTRAR_MEDICAO_DE_OBRA",
      "EMITIR_ORDEM_DE_SERVICO_DO_CONTRATO", "REGISTRAR_RECEBIMENTO_PROVISORIO", "REGISTRAR_RECEBIMENTO_DEFINITIVO"],
  },
  // ── V7 M2 — o recebedor definitivo (art. 140, I, b): papel próprio, designado no contrato ──
  {
    identificador: "recebedor-contrato@percursos.local",
    nome: "Recebedor definitivo (percurso)",
    perfil: "RECEBIMENTO DEFINITIVO — PERCURSO",
    descricao: "Decide a controvérsia e recebe em definitivo nos contratos em que for designado recebedor.",
    acoes: ["CONSULTAR_LICITACOES", "REGISTRAR_RECEBIMENTO_DEFINITIVO"],
  },
  // ── V7 M2 U5 — a área de contratos registra o aditivo por itens (ato do ente, sem designação no contrato) ──
  {
    identificador: "contratos-aditivos@percursos.local",
    nome: "Contratos — aditivos (percurso)",
    perfil: "CONTRATOS — ADITIVOS — PERCURSO",
    descricao: "Registra e estorna aditivos dos contratos, inclusive por itens.",
    acoes: ["CONSULTAR_LICITACOES", "REGISTRAR_ADITIVO", "ESTORNAR_MOVIMENTO_CONTRATUAL"],
  },
];

async function main(): Promise<void> {
  const url = process.env["DATABASE_URL"];
  if (url === undefined || url === "") throw new Error("DATABASE_URL não definida (.env).");
  const prisma = criarPrismaClient(url) as unknown as PrismaClient;
  try {
    for (const papel of PAPEIS) {
      const ja = await prisma.usuario.findUnique({ where: { identificador: papel.identificador }, select: { id: true } });
      if (ja !== null) {
        // ⚠️ IDEMPOTENTE, MAS NÃO INERTE: quando o papel ganha ações novas (a folha chegou depois
        // do pessoal), o perfil que já existe recebe SÓ as que faltam. Recriar o usuário perderia
        // a senha e o histórico; deixar como estava faria o percurso falhar por permissão, e
        // "falta de permissão" é a recusa mais fácil de confundir com defeito.
        const perfilExistente = await prisma.perfil.findFirst({ where: { nome: papel.perfil }, select: { id: true, permissoes: { select: { acao: true } } } });
        if (perfilExistente === null) {
          console.log(`[papéis] ${papel.identificador} existe mas o perfil "${papel.perfil}" não — nada a fazer aqui.`);
          continue;
        }
        const tem = new Set(perfilExistente.permissoes.map((x) => String(x.acao)));
        const faltam = papel.acoes.filter((a) => !tem.has(a));
        if (faltam.length === 0) {
          console.log(`[papéis] ${papel.identificador} já existe com as ${papel.acoes.length} ações — no-op.`);
          continue;
        }
        await prisma.permissaoDePerfil.createMany({ data: faltam.map((acao) => ({ perfilId: perfilExistente.id, acao, unidadeOrcId: null, criadoPor: ADMIN })) });
        console.log(`[papéis] ${papel.identificador} já existia — ${faltam.length} ação(ões) acrescentada(s): ${faltam.join(", ")}.`);
        continue;
      }
      const orfao = await prisma.perfil.findFirst({ where: { nome: papel.perfil }, select: { id: true } });
      if (orfao !== null) {
        await prisma.$transaction(async (tx) => {
          await tx.permissaoDePerfil.deleteMany({ where: { perfilId: orfao.id } });
          await tx.perfil.delete({ where: { id: orfao.id } });
        });
      }
      const perfil = await prisma.$transaction(async (tx) => {
        const p = await tx.perfil.create({ data: { nome: papel.perfil, descricao: papel.descricao, criadoPor: ADMIN }, select: { id: true } });
        await tx.permissaoDePerfil.createMany({ data: papel.acoes.map((acao) => ({ perfilId: p.id, acao, unidadeOrcId: null, criadoPor: ADMIN })) });
        if (papel.naUnidade !== undefined) {
          const uo = await tx.unidadeOrcamentaria.findUnique({ where: { codigo: papel.naUnidade.codigo }, select: { id: true } });
          if (uo === null) throw new Error(`a unidade ${papel.naUnidade.codigo} do papel ${papel.identificador} não existe neste banco`);
          await tx.permissaoDePerfil.createMany({ data: papel.naUnidade.acoes.map((acao) => ({ perfilId: p.id, acao, unidadeOrcId: uo.id, criadoPor: ADMIN })) });
        }
        return p;
      });
      const { usuarioId } = await criarUsuario(prisma, { nome: papel.nome, email: papel.identificador, senhaInicial: SENHA, criadoPor: ADMIN });
      await concederPerfil(prisma, { usuarioId, perfilId: perfil.id, criadoPor: ADMIN });
      console.log(`[papéis] ${papel.identificador} CRIADO — perfil "${papel.perfil}": ${papel.acoes.length} permissões globais.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error("[papéis] FALHOU:", e instanceof Error ? e.message : e);
  process.exit(1);
});
