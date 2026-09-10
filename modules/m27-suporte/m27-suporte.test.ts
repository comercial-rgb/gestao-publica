import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { ajudaDaRota, detalheDoChamado, listarChamados } from "./consultas.js";
import {
  abrirChamado,
  criarNivelDeSeveridade,
  encerrarChamado,
  escreverAjudaDeRota,
  reabrirChamado,
  responderChamado,
  responderPesquisaDeSatisfacao,
} from "./servico.js";

/**
 * M27 — AJUDA E SUPORTE, contra banco de verdade.
 *
 * ═══ O QUE ESTE ARQUIVO PROVA ═══
 * O teste 20 do lote: o chamado registra número único e a pesquisa de satisfação é
 * gravada. E o que o prompt cobra em voz alta: que os níveis de severidade sejam DADO
 * DE CONFIGURAÇÃO, não texto fixo na tela.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const USUARIO = "protocolo@cg.pb.gov.br";
const SUPORTE = "juridico@cg.pb.gov.br";
let critica = "";

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.orgao.create({ data: { id: "s-org", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.createMany({
    data: [
      { id: "s-uo1", codigo: "01001", descricao: "Administração", orgaoId: "s-org" },
      { id: "s-uo2", codigo: "01002", descricao: "Saúde", orgaoId: "s-org" },
    ],
  });
  critica = (
    await criarNivelDeSeveridade(prisma, {
      codigo: "P1", nome: "Crítica — sistema parado", ordem: 1, prazoHoras: 4,
      criadoPor: USUARIO,
    })
  ).severidadeId;
  await criarNivelDeSeveridade(prisma, {
    codigo: "P3", nome: "Dúvida de uso", ordem: 3, prazoHoras: 72, criadoPor: USUARIO,
  });
}

beforeEach(semear);

describe("M27 — a ajuda contextual", () => {
  it("t1: a ajuda é por rota e EDITAR é acrescentar versão — a anterior fica", async () => {
    await escreverAjudaDeRota(prisma, {
      rota: "/protocolo/processos",
      titulo: "Abrindo um processo",
      conteudo: "Escolha o assunto e informe o requerente do cadastro único.",
      criadoPor: USUARIO,
    });
    await escreverAjudaDeRota(prisma, {
      rota: "/protocolo/processos",
      titulo: "Abrindo um processo",
      conteudo: "Escolha o assunto. O requerente pode ser anônimo quando o assunto permitir.",
      criadoPor: SUPORTE,
    });

    const vigente = await ajudaDaRota(prisma, "/protocolo/processos");
    expect(vigente?.conteudo).toMatch(/pode ser anônimo/);
    expect(vigente?.por).toBe(SUPORTE);

    // ⚠️ A ANTERIOR CONTINUA NO BANCO. "Quem mudou este texto, e quando?" é pergunta
    // legítima no dia em que alguém seguiu a instrução antiga e errou.
    expect(await prisma.ajudaDeRota.count()).toBe(2);
  });

  it("t2: rota sem ajuda devolve null — e não um texto genérico de reserva", async () => {
    // Um "Ajuda não disponível" ensinaria o usuário a ignorar o ícone, e ele deixaria
    // de olhar justamente nas rotas onde a ajuda existe.
    expect(await ajudaDaRota(prisma, "/rota/sem/ajuda")).toBeNull();
  });

  it("t3: a rota é INTERNA — URL absoluta é recusada", async () => {
    await expect(
      escreverAjudaDeRota(prisma, {
        rota: "https://exemplo.invalido/phishing",
        titulo: "Ajuda", conteudo: "Clique aqui para continuar.", criadoPor: USUARIO,
      })
    ).rejects.toThrow(/rota da ajuda é INTERNA/);
  });
});

describe("M27 — os chamados", () => {
  it("t4: número ÚNICO no produto inteiro, atravessando entidades", async () => {
    const a = await abrirChamado(prisma, {
      unidadeOrcId: "s-uo1", severidadeId: critica,
      titulo: "Não consigo tramitar processo",
      descricao: "Ao clicar em tramitar, a tela devolve acesso negado.",
      rota: "/protocolo/processos", criadoPor: USUARIO,
    });
    const b = await abrirChamado(prisma, {
      unidadeOrcId: "s-uo2", severidadeId: critica,
      titulo: "Relatório não conclui",
      descricao: "A execução do relatório fica pendente e nunca termina.",
      criadoPor: USUARIO,
    });

    // ⚠️ ENTIDADES DIFERENTES, FILA ÚNICA. Dois chamados "1" na mesma tela de quem
    // atende é o começo de uma resposta enviada para o cliente errado.
    expect([a.numero, b.numero]).toEqual([1, 2]);
  });

  it("t5: duas aberturas CONCORRENTES não recebem o mesmo número", async () => {
    const abrir = (t: string) =>
      abrirChamado(prisma, {
        unidadeOrcId: "s-uo1", severidadeId: critica, titulo: t,
        descricao: "Descrição suficientemente longa para o Zod aceitar.",
        criadoPor: USUARIO,
      });
    const [x, y] = await Promise.all([abrir("Um problema"), abrir("Outro problema")]);
    expect([x.numero, y.numero].sort()).toEqual([1, 2]);
  });

  it("t6: severidade é CADASTRO — inexistente ou desativada é recusada", async () => {
    await expect(
      abrirChamado(prisma, {
        unidadeOrcId: "s-uo1", severidadeId: "nao-existe", titulo: "Teste",
        descricao: "Descrição suficientemente longa para o Zod aceitar.",
        criadoPor: USUARIO,
      })
    ).rejects.toThrow(/A escala de severidade é CADASTRO da entidade/);
  });

  it("t7: responder NÃO encerra — e a pesquisa só vem depois do encerramento", async () => {
    const c = await abrirChamado(prisma, {
      unidadeOrcId: "s-uo1", severidadeId: critica, titulo: "Erro ao anexar",
      descricao: "O anexo em PDF é recusado com formato não aceito.",
      criadoPor: USUARIO,
    });

    await responderChamado(prisma, {
      chamadoId: c.chamadoId, texto: "Confirme o tipo do arquivo; vamos verificar.",
      criadoPor: SUPORTE,
    });

    // ⚠️ RESPONDER NÃO FECHA. Quem abriu é quem sabe se o problema acabou — encerrar
    // junto faria a métrica medir a velocidade de digitar, não a de resolver.
    let d = await detalheDoChamado(prisma, c.chamadoId, USUARIO);
    expect(d?.situacao).toBe("RESPONDIDO");
    expect(d?.podeAvaliar).toBe(false);

    await expect(
      responderPesquisaDeSatisfacao(prisma, {
        chamadoId: c.chamadoId, nota: 5, criadoPor: USUARIO,
      })
    ).rejects.toThrow(/ainda está aberto[\s\S]*mede impaciência/);

    await encerrarChamado(prisma, {
      chamadoId: c.chamadoId, texto: "Corrigido: o tipo MIME estava fora do rol.",
      criadoPor: SUPORTE,
    });

    d = await detalheDoChamado(prisma, c.chamadoId, USUARIO);
    expect(d?.situacao).toBe("ENCERRADO");
    expect(d?.podeAvaliar).toBe(true);

    // A NOTIFICAÇÃO do encerramento chega a quem abriu, e ela pede a avaliação.
    const aviso = await prisma.notificacao.findFirstOrThrow({
      where: { evento: "CHAMADO_ENCERRADO" },
      select: { destinatario: true, corpo: true },
    });
    expect(aviso.destinatario).toBe(USUARIO);
    expect(aviso.corpo).toMatch(/avaliação/);
  });

  it("t8: a pesquisa é de QUEM ABRIU, e não se altera", async () => {
    const c = await abrirChamado(prisma, {
      unidadeOrcId: "s-uo1", severidadeId: critica, titulo: "Dúvida",
      descricao: "Não encontro a tela de comunicados internos.",
      criadoPor: USUARIO,
    });
    await encerrarChamado(prisma, {
      chamadoId: c.chamadoId, texto: "Fica em Comunicação interna.", criadoPor: SUPORTE,
    });

    // ⚠️ QUEM ATENDEU NÃO AVALIA O PRÓPRIO ATENDIMENTO.
    await expect(
      responderPesquisaDeSatisfacao(prisma, {
        chamadoId: c.chamadoId, nota: 5, criadoPor: SUPORTE,
      })
    ).rejects.toThrow(/transformaria a medida do atendimento numa autoavaliação/);

    await responderPesquisaDeSatisfacao(prisma, {
      chamadoId: c.chamadoId, nota: 4, comentario: "Rápido, mas a tela não é óbvia.",
      criadoPor: USUARIO,
    });

    // ⚠️ E ELA NÃO SE ALTERA: uma nota que muda depois de o suporte ver o resultado
    // não é pesquisa, é negociação.
    await expect(
      responderPesquisaDeSatisfacao(prisma, {
        chamadoId: c.chamadoId, nota: 1, criadoPor: USUARIO,
      })
    ).rejects.toThrow(/já foi respondida[\s\S]*negociação/);

    const d = await detalheDoChamado(prisma, c.chamadoId, USUARIO);
    expect(d?.nota).toBe(4);
    expect(d?.comentario).toBe("Rápido, mas a tela não é óbvia.");
  });

  it("t9: chamado encerrado não aceita resposta — a mensagem ensina a reabrir", async () => {
    const c = await abrirChamado(prisma, {
      unidadeOrcId: "s-uo1", severidadeId: critica, titulo: "Problema",
      descricao: "Descrição suficientemente longa para o Zod aceitar.",
      criadoPor: USUARIO,
    });
    await encerrarChamado(prisma, {
      chamadoId: c.chamadoId, texto: "Resolvido.", criadoPor: SUPORTE,
    });

    await expect(
      responderChamado(prisma, {
        chamadoId: c.chamadoId, texto: "Voltou a acontecer.", criadoPor: USUARIO,
      })
    ).rejects.toThrow(/ENCERRADO e não aceita resposta[\s\S]*REABRA/);

    await reabrirChamado(prisma, {
      chamadoId: c.chamadoId, texto: "O erro voltou depois da atualização.",
      criadoPor: USUARIO,
    });
    const d = await detalheDoChamado(prisma, c.chamadoId, USUARIO);
    expect(d?.situacao).toBe("ABERTO");
  });

  it("t10: quem abriu vê o seu; quem não é atendente não vê o dos outros", async () => {
    await abrirChamado(prisma, {
      unidadeOrcId: "s-uo1", severidadeId: critica, titulo: "Meu chamado",
      descricao: "Descrição suficientemente longa para o Zod aceitar.",
      criadoPor: USUARIO,
    });

    // ⚠️ ESTE USUÁRIO NÃO TEM PERMISSÃO GLOBAL — as identidades das fixtures têm, e um
    // teste escrito com elas não provaria nada.
    const espectador = await prisma.usuario.create({
      data: { identificador: "espectador@cg.pb.gov.br", nome: "Espectador", criadoPor: "SEED" },
      select: { id: true },
    });
    const perfil = await prisma.perfil.create({
      data: {
        nome: "SUPORTE_UO", descricao: "Abre chamado nesta unidade.", criadoPor: "SEED",
        permissoes: {
          create: [{ acao: "ABRIR_CHAMADO", unidadeOrcId: "s-uo1", criadoPor: "SEED" }],
        },
      },
      select: { id: true },
    });
    await prisma.vinculoUsuarioPerfil.create({
      data: { usuarioId: espectador.id, perfilId: perfil.id, criadoPor: "SEED" },
    });

    // Um chamado costuma descrever o que a pessoa NÃO conseguiu fazer; isso não é
    // assunto do setor dela.
    expect(await listarChamados(prisma, "espectador@cg.pb.gov.br")).toEqual([]);
    expect(await listarChamados(prisma, USUARIO)).toHaveLength(1);

    const alheio = await prisma.chamado.findFirstOrThrow({ select: { id: true } });
    expect(await detalheDoChamado(prisma, alheio.id, "espectador@cg.pb.gov.br")).toBeNull();
  });

  it("t11: a fila ordena pela severidade — o mais grave primeiro", async () => {
    const duvida = await prisma.nivelDeSeveridade.findFirstOrThrow({
      where: { codigo: "P3" }, select: { id: true },
    });
    await abrirChamado(prisma, {
      unidadeOrcId: "s-uo1", severidadeId: duvida.id, titulo: "Uma dúvida",
      descricao: "Descrição suficientemente longa para o Zod aceitar.",
      criadoPor: USUARIO,
    });
    await abrirChamado(prisma, {
      unidadeOrcId: "s-uo1", severidadeId: critica, titulo: "Sistema parado",
      descricao: "Ninguém consegue empenhar desde as 8h.",
      criadoPor: USUARIO,
    });

    const fila = await listarChamados(prisma, USUARIO);
    expect(fila.map((c) => c.titulo)).toEqual(["Sistema parado", "Uma dúvida"]);
    expect(fila[0]?.severidade).toBe("Crítica — sistema parado");
  });
});
