import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { raizesExistentes } from "../../test/raizes-dominio.js";
import {
  ACAO_DO_SERVICO,
  FORA_DO_CENSO,
  TODAS_AS_ACOES,
  type NomeDeServico,
} from "./acoes.js";

/**
 * O GREP-TESTE DO CENSO — e ele existe porque o RECORD NÃO BASTA.
 *
 * ═══ ⚠️ O LIMITE DO COMPILADOR, DITO SEM RODEIO ═══
 * O `ACAO_DO_SERVICO` é um `Record<NomeDeServico, AcaoDoSistema>`. Ele garante que, se
 * alguém acrescentar um nome à união `NomeDeServico` e esquecer o mapeamento, o TypeScript
 * reclama.
 *
 * **Ele NÃO garante que um serviço NOVO apareça na união.** Quem escrever
 * `export async function pagarPrecatorio()` amanhã simplesmente não o declara — e o
 * compilador **não sabe que o serviço existe**. O Record fica calado, a suíte fica verde, e
 * o SIAFIC ganha uma porta sem fechadura.
 *
 * Foi por isso que o passo 0 deste bloco reportou que "serviço sem ação não compila" **não
 * é alcançável só com Record**. A rede que pega isso é ESTA: um grep, com a mesma anatomia
 * do grep-teste do funil (`m01-funil.test.ts`), e pela mesma razão — o compilador só enxerga
 * o que alguém declarou.
 *
 * ⚠️ E ELE TEM DUAS PONTAS. Um serviço fora do censo FALHA; mas uma entrada do censo que
 * NÃO corresponde a serviço nenhum também — senão o rol apodrece, cheio de permissões para
 * coisas que o sistema não faz mais, e o ente concede poderes que não existem.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));

function varrer(dir: string, achados: string[]): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "generated" || e.name === ".git") continue;
      varrer(p, achados);
      continue;
    }
    if (!e.name.endsWith(".ts") || e.name.endsWith(".test.ts")) continue;
    achados.push(p);
  }
}

/**
 * ONDE O DOMÍNIO MORA — e são DOIS lugares desde que os tribunais viraram adapters.
 *
 * ⚠️ A LISTA NÃO MORA MAIS AQUI, e essa é a correção que importa. Ela vive em
 * `test/raizes-dominio.ts`, importada por TODOS os scanners do repositório. Enumerar `"modules"`
 * à mão foi exatamente o que fez este censo (e o funil do M01) pararem de enxergar o M15/M18/M19
 * quando eles viraram `adapters/tribunais/tce-pb/` — com um agravante que o vermelho do t5b
 * escondia: o t6 e o t6b passaram a PULAR o `submeterCaptura` em silêncio
 * (`if (achado === undefined) continue`), deixando de verificar se ele cobra autorização.
 *
 * O `raizes-dominio.test.ts` agora falha se algum scanner voltar a escrever a lista na mão.
 */
function varrerDominio(arquivos: string[]): void {
  for (const abs of raizesExistentes(RAIZ)) varrer(abs, arquivos);
}

/** Todo `export async function nome(` do domínio, com arquivo e linha. */
function servicosExportados(): Map<string, string> {
  const arquivos: string[] = [];
  varrerDominio(arquivos);

  const achados = new Map<string, string>();
  for (const abs of arquivos) {
    const rel = abs.slice(RAIZ.length).replace(/^[\\/]/, "").replace(/\\/g, "/");
    readFileSync(abs, "utf8")
      .split("\n")
      .forEach((linha, i) => {
        const m = /^export async function ([a-z][a-zA-Z0-9_]*)\s*\(/.exec(linha);
        if (m !== null) achados.set(m[1]!, `${rel}:${i + 1}`);
      });
  }
  return achados;
}

/**
 * O CORPO de um serviço: da linha do `export async function` até o `}` da coluna 0 que o
 * fecha. Recortar assim (e não "até o próximo export") é de propósito: o bloco de comentário
 * do serviço SEGUINTE mora entre os dois, e ele mencionaria a ação DELE — o teste passaria a
 * enxergar, no corpo de um serviço, a chamada do vizinho.
 */
function corpoDoServico(linhas: readonly string[], inicio: number): string {
  for (let k = inicio + 1; k < linhas.length; k++) {
    if (linhas[k] === "}") return linhas.slice(inicio, k + 1).join("\n");
  }
  return linhas.slice(inicio).join("\n");
}

/** Onde cada serviço é exportado: nome -> { arquivo, linha, corpo }. */
function corposDosServicos(): Map<
  string,
  { readonly onde: string; readonly corpo: string; readonly arquivo: string }
> {
  const arquivos: string[] = [];
  varrerDominio(arquivos);

  const achados = new Map<
    string,
    { onde: string; corpo: string; arquivo: string }
  >();
  for (const abs of arquivos) {
    const rel = abs.slice(RAIZ.length).replace(/^[\\/]/, "").replace(/\\/g, "/");
    const conteudo = readFileSync(abs, "utf8");
    const linhas = conteudo.split("\n");
    linhas.forEach((linha, i) => {
      const m = /^export async function ([a-z][a-zA-Z0-9_]*)\s*\(/.exec(linha);
      if (m === null) return;
      achados.set(m[1]!, {
        onde: `${rel}:${i + 1}`,
        corpo: corpoDoServico(linhas, i),
        arquivo: conteudo,
      });
    });
  }
  return achados;
}

/** As três formas — e são três porque metade do repositório é hexagonal (ver `porta.ts`). */
const CHAMA_A_AUTORIZACAO = /(autorizarNo\(|autorizar\(|autz\.exigir\()/;

/**
 * ⚠️ OS SERVIÇOS QUE AUTORIZAM POR UM HELPER PRIVADO — e a lista é EXPLÍCITA, como o
 * `FORA_DO_CENSO`. Nada entra aqui por descuido: cada linha é uma decisão, com o motivo.
 *
 * Nestes, a AÇÃO ainda nasce no corpo público (`ACAO_DO_SERVICO.travar` está lá, e o t6b
 * continua provando que é a ação certa) — o que muda é que quem faz a chamada é uma função
 * privada do MESMO arquivo, porque é ela que abre a transação. Exigir a chamada literalmente
 * dentro do corpo público obrigaria a duplicar a transação inteira em `travar` e `destravar`,
 * e duas cópias de uma transação é um preço alto para agradar a um grep.
 *
 * A exigência que SOBRA é forte: o corpo público passa a SUA ação, e o arquivo tem a chamada.
 */
const AUTORIZA_EM_HELPER: Record<string, string> = {
  travar: "registrar() — o helper privado que abre a $transaction (a ação vem do corpo público)",
  destravar: "registrar() — idem",
  // ⚠️ M23 (ENT02) — os quatro movimentos PESSOAIS da caixa. Eles são o MESMO corpo com
  // um tipo diferente: carregar o comunicado, achar o setor pelo qual o usuário
  // participa dele, autorizar e inserir. A ação de cada um continua nascendo no corpo
  // público (o t6b prova que é a certa), e quem faz a chamada é o helper que abre a
  // transação — como em `travar`. Quatro cópias da mesma transação seriam quatro
  // lugares para alguém corrigir um guard e esquecer três.
  arquivarComunicado: "movimentoPessoal() — o helper privado que abre a $transaction",
  desarquivarComunicado: "movimentoPessoal() — idem",
  favoritarComunicado: "movimentoPessoal() — idem",
  desfavoritarComunicado: "movimentoPessoal() — idem",
};

describe("M16 — o CENSO das ações (TR 4.55/4.56)", () => {
  it("t5: todo serviço de mutação está no censo — e o grep pega o que o Record não pode", () => {
    const servicos = servicosExportados();
    expect(servicos.size).toBeGreaterThan(80); // o repositório tem muitos

    const semClassificacao: string[] = [];
    for (const [nome, onde] of servicos) {
      const noRecord = nome in ACAO_DO_SERVICO;
      const excluido = nome in FORA_DO_CENSO;
      if (noRecord && excluido) {
        throw new Error(
          `O serviço "${nome}" (${onde}) está NO CENSO **e** na lista de exclusões. ` +
            `Ele é uma ação ou não é — decida.`
        );
      }
      if (!noRecord && !excluido) semClassificacao.push(`${nome}  (${onde})`);
    }

    expect(
      semClassificacao,
      "\n\n⚠️ SERVIÇO SEM AÇÃO CLASSIFICADA.\n\n" +
        "Todo serviço de MUTAÇÃO tem de ter uma ação no censo (`acoes.ts`) — é ela que o " +
        "`autorizar` cobra, e é ela que o ente concede a um perfil (TR 4.56). Um serviço " +
        "fora do censo é uma PORTA SEM FECHADURA: ninguém pode negá-lo, porque ninguém " +
        "sabe que ele existe.\n\n" +
        "⚠️ E o COMPILADOR NÃO PEGA ISSO: o Record é exaustivo sobre a união `NomeDeServico`, " +
        "que é escrita à mão. Um serviço que ninguém declarou simplesmente não aparece para " +
        "ele. Por isso este grep existe.\n\n" +
        "Duas saídas, e as duas são DECISÕES:\n" +
        "  · é um ato do usuário  -> acrescente ao `NomeDeServico` + `ACAO_DO_SERVICO`;\n" +
        "  · é leitura, guard, composável interno, lock ou seed -> acrescente ao " +
        "`FORA_DO_CENSO`, COM O MOTIVO.\n\nSem classificação:\n"
    ).toEqual([]);
  });

  it("t5b: o censo não apodrece — toda entrada corresponde a um serviço que EXISTE", () => {
    const servicos = servicosExportados();

    // ⚠️ A OUTRA PONTA. Um censo cheio de ações para serviços que não existem mais faz o
    // ente conceder poderes fantasmas — e o TCE lê a lista de permissões acreditando nela.
    const fantasmas = (Object.keys(ACAO_DO_SERVICO) as NomeDeServico[]).filter(
      (nome) => !servicos.has(nome)
    );
    expect(
      fantasmas,
      "\n\n⚠️ AÇÃO FANTASMA: o censo mapeia serviços que NÃO EXISTEM no repositório. " +
        "O ente concederia um poder que nada exerce, e a lista de permissões que o TCE lê " +
        "estaria mentindo. Remova-os do `NomeDeServico`/`ACAO_DO_SERVICO`.\n\nFantasmas:\n"
    ).toEqual([]);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t6 — O GREP-TESTE DO ENFORCEMENT, E ELE TEM AS DUAS PONTAS.
  //
  // O censo (t5) prova que todo serviço TEM uma ação. Isso não prova NADA sobre o
  // enforcement: uma ação declarada e nunca cobrada é uma fechadura pendurada ao lado da
  // porta. Só o grep abaixo prova que a porta tem fechadura E que a chave é a certa.
  //
  // ⚠️ A SEGUNDA PONTA É A QUE MAIS IMPORTA, e ela é a lição do 498de7b: sem ela, alguém
  // copia o `empenhar` para escrever o `liquidar`, esquece de trocar a ação, e o sistema passa
  // a cobrar EMPENHAR de quem liquida. Os dois testes ficariam verdes — o serviço "tem
  // autorização", a ação "existe" — e a segregação do 6.4 estaria furada no lugar exato onde
  // ela foi desenhada para pegar. O grep exige a ação DAQUELE serviço, e recusa a do vizinho.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t6: todo serviço do censo COBRA a autorização — e o serviço sem a chamada falha nomeando", () => {
    const corpos = corposDosServicos();
    const semEnforcement: string[] = [];

    for (const nome of Object.keys(ACAO_DO_SERVICO) as NomeDeServico[]) {
      const achado = corpos.get(nome);
      if (achado === undefined) continue; // t5b já cobra a ação fantasma

      // A SUA ação, no corpo público. Sempre — não há exceção para isto.
      const passaASuaAcao = new RegExp(`ACAO_DO_SERVICO\\.${nome}\\b`).test(
        achado.corpo
      );

      // A chamada: no corpo, ou — para os declarados — num helper privado do mesmo arquivo.
      const chama =
        nome in AUTORIZA_EM_HELPER
          ? CHAMA_A_AUTORIZACAO.test(achado.arquivo)
          : CHAMA_A_AUTORIZACAO.test(achado.corpo);

      if (!passaASuaAcao || !chama) semEnforcement.push(`${nome}  (${achado.onde})`);
    }

    expect(
      semEnforcement,
      "\n\n⚠️ SERVIÇO DE MUTAÇÃO **SEM AUTORIZAÇÃO** — uma porta sem fechadura.\n\n" +
        "Todo serviço do censo tem de cobrar a SUA ação, como PRIMEIRA instrução depois do " +
        "Zod (a única coisa que pode vir antes é a leitura que descobre a UG do fato — não " +
        "dá para perguntar 'ele pode AQUI?' sem saber onde é 'aqui').\n\n" +
        "Uma das três formas, conforme o módulo:\n" +
        "  · prisma-direto -> await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.x, escopo);\n" +
        "  · hexagonal     -> await deps.autz.exigir(d.criadoPor, ACAO_DO_SERVICO.x, escopo);\n" +
        "  · o piloto      -> await autorizar(tx, d.criadoPor, acao);\n\n" +
        "⚠️ E O COMPILADOR NÃO PEGA ISSO: esquecer a chamada não é erro de tipo — é um " +
        "serviço que simplesmente NÃO PERGUNTA se pode. Ele grava, e ninguém foi negado.\n\n" +
        "Sem autorização:\n"
    ).toEqual([]);
  });

  it("t6b: a ação cobrada é a DO SERVIÇO — copiar o vizinho e esquecer de trocar a ação FALHA", () => {
    const corpos = corposDosServicos();
    const acaoTrocada: string[] = [];

    const nomes = Object.keys(ACAO_DO_SERVICO) as NomeDeServico[];
    for (const nome of nomes) {
      const achado = corpos.get(nome);
      if (achado === undefined) continue;

      // ⚠️ Qualquer OUTRO nome do censo citado no corpo deste serviço é a cópia mal-feita.
      const intrusos = nomes.filter(
        (outro) =>
          outro !== nome &&
          new RegExp(`ACAO_DO_SERVICO\\.${outro}\\b`).test(achado.corpo)
      );
      for (const intruso of intrusos) {
        acaoTrocada.push(
          `${nome} (${achado.onde}) cobra a ação de "${intruso}" ` +
            `(${ACAO_DO_SERVICO[intruso]}) — devia cobrar ${ACAO_DO_SERVICO[nome]}`
        );
      }
    }

    expect(
      acaoTrocada,
      "\n\n⚠️ AÇÃO TROCADA: um serviço está cobrando a permissão de OUTRO.\n\n" +
        "É o erro do copiar-colar, e ele é INVISÍVEL para o compilador e para os testes de " +
        "negócio: o serviço autoriza, o fluxo passa, e a suíte fica verde. Só que o ente " +
        "concedeu um poder e o sistema cobrou outro — e a segregação do 6.4 (quem empenha " +
        "não liquida) fura exatamente aí.\n\nTrocas:\n"
    ).toEqual([]);
  });

  it("t5c: o Record é EXAUSTIVO sobre a união — e as contagens batem", () => {
    // ⚠️ ESTA é a garantia que o compilador PODE dar: um nome na união sem entrada no
    // Record não compila. O teste apenas conta o que ele já provou.
    const nomes = Object.keys(ACAO_DO_SERVICO);
    // 78 (bloco 3) + 3 (reconhecimento) + 6 (programação) + 1 (reprevisarReceita — reestimativa M02).
    // 88 (até a 7.13) + 6 (administração de usuários, 7.14: criarUsuario, concederPerfil,
    // revogarPerfil, ativarUsuario, inativarUsuario, resetarSenha) = 94.
    // + 1 (importarExtratoBb, M17-a — import de extrato via API do BB) = 95.
    // + 1 (transferirEntreContas, S-massa — TR 5.61, ação própria TRANSFERIR_ENTRE_CONTAS) = 96.
    // + 1 (submeterCaptura, S3 — Captura 2.0, ação própria SUBMETER_CAPTURA) = 97.
    // + 2 (TRAVA-4/M20 — confirmarImportacaoFolha e confirmarImportacaoTributos, ações próprias
    //   IMPORTAR_FOLHA e IMPORTAR_TRIBUTOS) = 99.
    // + 3 (ENT01/M19 — cadastrarPessoa, alterarPessoa e moverPapelDePessoa, ações próprias
    //   CADASTRAR_PESSOA, ALTERAR_PESSOA e MOVER_PAPEL_DE_PESSOA) = 102.
    // + 3 (ENT01/T07 — prepararOrdemDePagamento, autorizarOrdemDePagamento e
    //   cancelarOrdemDePagamento, ações próprias) = 105.
    // + 14 (ENT02/M21 — o processo digital: abrir, tramitar, receber, complementar,
    //   solicitar e responder parecer, solicitar e atender readequação, encerrar,
    //   arquivar, reabrir, apensar, desapensar e tornar movimento sem efeito) = 119.
    // + 4 (ENT02/M22 — anexarArquivo, assinarDocumento, criarFilaDeAssinatura e
    //   assinarNaFila) = 123.
    // + 12 (ENT02/M23 — o comunicado interno: criar tipo, rascunhar, editar rascunho,
    //   enviar, responder, encaminhar, marcar leitura, arquivar, desarquivar,
    //   favoritar, desfavoritar e etiquetar) = 135.
    // + 3 (ENT02/M25 — definir, desativar e preencher campos adicionais) = 138.
    // + 6 (ENT02/M26 — o designer: criar modelo, nova versão, copiar, distribuir,
    //   retirar e executar) = 144.
    // + 7 (ENT02/M27 — ajuda de rota, nível de severidade, abrir, responder, encerrar
    //   e reabrir chamado, e a pesquisa de satisfação) = 151.
    expect(nomes.length).toBe(151);

    // 97 serviços, 93 ações distintas. Os pares que compartilham ação (4: importarExtratoBb
    // REUSA IMPORTAR_EXTRATO). transferirEntreContas tem AÇÃO PRÓPRIA (não compartilha) → +1 ação.
    //   · encerrarExercicio / encerrarExercicioComRestos → ENCERRAR_EXERCICIO
    //   · proporCmdDaLoa / registrarVersaoCmd            → CRIAR_VERSAO_CMD
    //   · proporMbaDaLoa / registrarVersaoMba            → CRIAR_VERSAO_MBA
    //   · importarExtrato / importarExtratoBb            → IMPORTAR_EXTRATO
    // 99 serviços, 95 ações distintas (os 2 importadores do M20 têm ação PRÓPRIA cada um).
    // 102 serviços, 98 ações distintas — os 3 do M19 têm ação PRÓPRIA cada um, e isso é
    // deliberado: cadastrar uma pessoa, corrigir o cadastro dela e conceder-lhe o papel de
    // CREDOR são poderes diferentes. Uma ação única "GESTAO_DE_PESSOAS" daria, a quem só
    // devia digitar endereço, o poder de tornar alguém credor do ente.
    // 105 serviços, 101 ações distintas. As três de T07 são PRÓPRIAS, e é nisso que a
    // separação consiste: preparar a ordem e AUTORIZÁ-LA têm de poder ser dadas a pessoas
    // diferentes. Uma ação única "GERIR_ORDEM_PAGAMENTO" juntaria de volta exatamente o
    // que a etapa existe para separar — quem pede o pagamento e quem consente com ele.
    // 119 serviços, 115 ações distintas. As 14 do M21 são PRÓPRIAS, uma por ato — e a
    // razão é a mesma de T07: quem atende o balcão abre e tramita, quem responde pelo
    // mérito encerra. Uma ação única "GERIR_PROCESSO" daria os três a quem precisa de um,
    // e o encerramento é justamente o que a ouvidoria mede.
    // 123 serviços, 119 ações distintas. As 4 do M22 também são próprias: assinar não
    // é anexar, e nenhuma das duas é tramitar. Juntar assinatura e trâmite faria do
    // despacho um ato assinado por quem apenas o encaminhou.
    // 135 serviços, 128 ações distintas. Os QUATRO movimentos pessoais da caixa do M23
    // compartilham `GERIR_MINHA_CAIXA` — arquivar, desarquivar, favoritar e
    // desfavoritar são o mesmo poder sobre a própria caixa, e nenhum deles muda o
    // documento para outra pessoa. Ninguém negaria um sem negar os outros três.
    // 138 serviços, 131 ações distintas. As 3 do M25 são próprias: definir o campo e
    // preenchê-lo são poderes diferentes — quem preenche o formulário não é quem decide
    // o que ele pergunta.
    // 144 serviços, 137 ações distintas. DISTRIBUIR tem ação própria porque o catálogo
    // pede permissão própria — e com razão: desenhar um relatório para a própria unidade
    // é uma coisa; empurrá-lo para outra entidade é outra, e envolve terceiros.
    // 151 serviços, 144 ações distintas. RESPONDER e ENCERRAR chamado são separadas de
    // propósito: quem abriu é quem sabe se o problema acabou, e encerrar junto com a
    // resposta faria a métrica de resolução medir a velocidade de digitar.
    expect(TODAS_AS_ACOES.length).toBe(144);
    expect(ACAO_DO_SERVICO.encerrarExercicio).toBe("ENCERRAR_EXERCICIO");
    expect(ACAO_DO_SERVICO.encerrarExercicioComRestos).toBe("ENCERRAR_EXERCICIO");
    expect(ACAO_DO_SERVICO.importarExtrato).toBe("IMPORTAR_EXTRATO");
    expect(ACAO_DO_SERVICO.importarExtratoBb).toBe("IMPORTAR_EXTRATO");

    // ⚠️ O LANÇAMENTO MANUAL (TR 5.95) TEM AÇÃO PRÓPRIA — é a chave-mestra do razão
    // (partidas arbitrárias, sem fato de origem), e o ente tem de poder concedê-la a UMA
    // pessoa sem conceder o resto.
    expect(ACAO_DO_SERVICO.registrarLancamento).toBe("REGISTRAR_LANCAMENTO_MANUAL");

    // sem duplicata na união (um nome, uma ação)
    expect(new Set(nomes).size).toBe(nomes.length);
  });
});
