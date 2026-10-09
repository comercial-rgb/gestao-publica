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
  // ⚠️ V11 V5.3 — O TRÂMITE E O RECEBIMENTO DO PROCESSO. Os dois viraram cascas que abrem a
  // transação e delegam a `tramitarNaTransacao` / `receberNaTransacao`, no MESMO arquivo, porque
  // o pedido de acesso à informação precisa dos mesmos corpos dentro da transação dele — e um
  // processo que tramita sem o fato do rito é uma trilha que conta o que não aconteceu.
  // A fechadura não saiu: ela está no corpo extraído, com a mesma ação.
  tramitar: "tramitarNaTransacao() — o corpo extraído, no mesmo arquivo",
  receberProcesso: "receberNaTransacao() — idem",
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
  // ⚠️ ENT03b — os movimentos COM LANÇAMENTO dos três cadastros novos. Mesmo desenho: cada
  // um é o MESMO corpo (travar, ler saldo, conferir o guard do tipo, resolver o roteiro,
  // lançar no razão, gravar) com um tipo e um guard diferentes. A ação continua nascendo no
  // corpo público — o t6b prova que é a certa —, e quem abre a transação e faz a chamada é
  // o helper.
  //
  // ⚠️ E A PRIMEIRA VERSÃO ESCOLHIA A AÇÃO DENTRO DO HELPER, por um `switch` sobre o tipo.
  // O t6 acusou os sete, e a acusação estava certa: quem lê `glosar` tem de ver, ali, qual
  // crachá ela exige. Hoje a ação é PARÂMETRO, passada pelo serviço público.
  // V6.2 — o atesto e a devolução dos ENCARGOS: o mesmo corpo, a ação passada como parâmetro.
  certificarEncargosDaFolha: "registrarAtestoDosEncargos() — o helper privado que abre a $transaction",
  devolverEncargosDaFolha: "registrarAtestoDosEncargos() — idem",
  aprovarPrestacaoDeContas: "movimentoComLancamento() — o helper privado que abre a $transaction",
  glosar: "movimentoComLancamento() — idem",
  registrarDevolucao: "movimentoComLancamento() — idem",
  inscreverPrecatorio: "comLancamento() — o helper privado que abre a $transaction",
  registrarAtualizacaoDePrecatorio: "comLancamento() — idem",
  cancelarPrecatorio: "comLancamento() — idem",
  repassarAoConsorcio: "comLancamento() — o helper privado que abre a $transaction",
  registrarDevolucaoDeConsorcio: "comLancamento() — idem",
  // ⚠️ V6.1 — o atesto da folha. Certificar e DEVOLVER são o mesmo corpo (montar o objeto,
  // conferir a designação vigente, conferir que o objeto não mudou, gravar o fato) com um tipo
  // diferente. A ação continua nascendo no corpo público, como PARÂMETRO — o t6b prova que cada
  // uma cobra a sua —, e quem abre a transação e faz a chamada é o helper.
  certificarFolha: "registrarFatoDaCertificacao() — o helper privado que abre a $transaction",
  devolverFolhaParaCorrecao: "registrarFatoDaCertificacao() — idem",
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

      // A SUA ação, no corpo público — e para os declarados, no ARQUIVO.
      //
      // ⚠️ A EXCEÇÃO DE ARQUIVO NASCEU EM V11 V5.3, E ELA ENFRAQUECE ESTE TESTE — por isso a
      // lista é curta e cada entrada diz qual helper. `tramitar` e `receberProcesso` viraram
      // cascas de uma linha (`return prisma.$transaction(tx => xNaTransacao(tx, d))`) porque o
      // pedido de acesso à informação precisa do MESMO corpo dentro da transação dele: separar
      // as transações deixaria o processo andando sem o fato do rito. O corpo público deixou de
      // conter a ação, e o t6b — que prova que a ação cobrada é a certa — passa a medir o
      // arquivo para estes nomes. Um arquivo com dois serviços poderia, em tese, cruzar as
      // ações; é o preço declarado, e é por isso que a lista não cresce sem motivo escrito.
      const passaASuaAcao = new RegExp(`ACAO_DO_SERVICO\\.${nome}\\b`).test(
        nome in AUTORIZA_EM_HELPER ? achado.arquivo : achado.corpo
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
    // + 5 (ENT02/M21 cadastros — criar setor, lotar usuário, criar assunto com roteiro,
    //   registrar e baixar taxa do processo) = 156.
    // + 5 (ENT03/M09 — o lote de pagamento e o borderô: criar lote, incluir item, fechar,
    //   gerar borderô e processar retorno bancário) = 161.
    // + 2 (ENT03a/M09 — a movimentação bancária: registrar e estornar movimento) = 163.
    // + 4 (ENT03a/M09 — a conciliação como objeto discreto: abrir, encerrar, registrar
    //   pendência manual e justificar pendência) = 167.
    //
    // ⚠️ `enviarBordero` NÃO entra: ele nunca grava. Sem convênio bancário configurado ele
    // sempre recusa, e uma ação para ele seria uma permissão que o ente concederia a
    // alguém para fazer nada — e que ficaria distribuída no dia em que o canal existisse,
    // sem ninguém ter decidido isso. Ele está em FORA_DO_CENSO, com o motivo.
    // + 25 (ENT03b — os cadastros do molde):
    //     6 convênios (cadastrar, liberar parcela, aprovar prestação, glosar, devolver,
    //       estornar movimento);
    //     5 precatórios (cadastrar, inscrever, atualizar, cancelar, estornar movimento);
    //     5 consórcios (cadastrar, registrar contrato de rateio, repassar, devolver,
    //       estornar movimento);
    //     2 medições de obra (registrar e APROVAR — crachás distintos, por segregação:
    //       quem mede não aprova);
    //     7 controle interno (abrir auditoria, responder checklist, registrar
    //       irregularidade, registrar providência, APRECIAR providência — outro crachá,
    //       pela mesma razão —, encerrar auditoria e emitir relatório circunstanciado)
    //   = 192.
    // + 16 (ENT05 — o eixo FÍSICO do almoxarifado, TR 5.18):
    //     4 cadastros (depósito, unidade de medida, grupo de material, material);
    //     1 parâmetro de estoque (o mínimo/máximo por material E depósito);
    //     4 movimentos (entrada física, saída física, estorno do movimento físico,
    //       transferência entre depósitos);
    //     2 requisição e cota (registrar requisição, definir cota de consumo);
    //     3 inventário (abrir, registrar contagem, fechar — três crachás, por
    //       segregação: quem conta não é quem fecha, e a divergência do fechamento
    //       manda lançar ajuste contábil);
    //     2 bloqueio (bloquear e encerrar bloqueio)
    //   = 208.
    // + 13 (ENT05 — o eixo de GESTÃO do bem, TR 5.19):
    //     5 cadastros (localização, comissão, motivo de baixa, tipo de incorporação,
    //       fórmula de avaliação);
    //     3 movimentos (registrar movimento de gestão, transferir entre entidades,
    //       estornar movimento de gestão);
    //     2 documentos (etiqueta com código de barras, termo patrimonial);
    //     3 inventário de bens (abrir, contar, fechar) — irmãos dos do estoque, e com
    //       crachás PRÓPRIOS: o inventário de bens exige comissão designada, e quem o
    //       fecha apura divergência sobre acervo tombado
    //   = 221.
    // + 1 (ENT05 ITEM 3 — `repontarConta`): a correção de eixo do plano de contas. Ação
    //   PRÓPRIA e do ENTE, nunca agrupada com "cadastrar conta": cadastrar cria linha;
    //   repontar MOVE SALDO que já existe, com lançamento que explica a mudança.
    //   = 222.
    // + 8 (ENT05 — A COMPRA, TR 5.17): relacionar marca, relacionar elemento, registrar
    //   solicitação, movimentar solicitação (autorizar/anular), registrar pesquisa de
    //   preços, emitir ordem, registrar recebimento e estornar ordem.
    //   ⚠️ `EMITIR_ORDEM_DE_COMPRA` e `REGISTRAR_RECEBIMENTO_DE_ORDEM` são crachás
    //   SEPARADOS de propósito: quem emite a ordem não é quem atesta que o material
    //   chegou — é a segregação do 6.4 no ponto onde ela mais vale.
    //   = 230.
    // + 3 (ENT06 item 1 — OS PERFIS: criarPerfil, concederAcaoAoPerfil e revogarAcaoDoPerfil).
    //   ⚠️ SEPARADAS DE `CONCEDER_PERFIL`, e a distinção é a razão de existirem: conceder um
    //   PERFIL a um usuário entrega um crachá que já existe; conceder uma AÇÃO a um perfil
    //   muda o que aquele crachá abre — para todos que o têm, de uma vez. Juntá-las daria, a
    //   quem só devia vincular servidores a perfis prontos, o poder de ampliar qualquer um.
    //   = 233.
    // + 2 (ENT07 — O ACERVO: cadastrarClasseDeBens e cadastrarBem).
    //   ⚠️ SÃO DOIS CRACHÁS, E NÃO UM, pelo mesmo motivo que separa contar prateleira de
    //   fechar inventário. Cadastrar a CLASSE amarra uma conta do ativo: é decisão contábil,
    //   e errá-la faz toda aquisição daquela classe lançar no lugar errado. Cadastrar o BEM
    //   põe uma coisa no acervo. Uma ação única daria, a quem só devia tombar um armário, o
    //   poder de decidir em que conta do razão o acervo inteiro entra.
    //   = 235.
    // + 2 (ENT11 — O EIXO FINANCEIRO: parametrizarRoteiroPatrimonial e
    //   parametrizarRoteiroResultadoAlienacao).
    //   ⚠️ SÃO DOIS SERVIÇOS E UMA AÇÃO SÓ, e é a primeira vez que isso acontece fora dos
    //   pares de conveniência. A razão é que as duas tabelas existem separadas por um
    //   detalhe de MODELO — as chaves vêm de enums diferentes, e uni-las não seria migration
    //   aditiva —, não por uma diferença de PODER. Quem parametriza em que conta a
    //   depreciação bate é quem parametriza em que conta o ganho da alienação bate. Dois
    //   crachás aqui inventariam uma segregação que o TR não pede, e cada um teria de ser
    //   concedido à mão em toda instalação existente.
    //   = 237 serviços, e o censo continua em 229 ações.
    expect(nomes.length).toBe(568); // +1 (V37) `alterarSituacaoDoSetor` (CRIAR_SETOR) — desativar e reativar o setor, nenhuma ação nova. // +1 (V37) `parametrizarRoteiroAlmoxarifado` (PARAMETRIZAR_ROTEIRO_PATRIMONIAL) — o roteiro contábil do almoxarifado, que não tinha escritor, nenhuma ação nova. // +1 (V36) `gerarCodigosReduzidosDoPlano` (CADASTRAR_PROGRAMA_PPA) — os códigos reduzidos da despesa do PPA, nenhuma ação nova. // +2 (V36) `registrarMultaDeTransito` e `baixarMultaDeTransito` (CADASTRAR_FROTA) — as multas de trânsito da frota, nenhuma ação nova. // +2 (V36) `emitirSubempenho` (EMPENHAR) e `anularSaldoDoSubempenho` (ANULAR_EMPENHO_PARCIAL) — o subempenho sobre o empenho global ou estimativo, nenhuma ação nova. // +1 (V36) `preverTransferenciaNoPpa` (CADASTRAR_PPA) — as transferências financeiras previstas no PPA, nenhuma ação nova. // +5 (V36) `criarPrevia`, `acrescentarLoteAPrevia`, `descartarPrevia` (CRIAR_DECRETO_DE_CREDITO), `aprovarPrevia` e `efetivarPrevia` (EXECUTAR_CREDITO) — a prévia da alteração orçamentária, nenhuma ação nova. // +2 (V36) `definirFontesDaNatureza` (PARAMETRIZAR_ROTEIRO_ORCAMENTARIO) e `preverReceitaPorRateio` (CRIAR_RECEITA_PREVISTA) — as fontes da natureza com percentual e a previsão rateada, nenhuma ação nova. // +4 (V36) `cadastrarEmendaAoPlanejamento`, `bloquearLinhaParaEmendas`, `revogarBloqueioDeEmendaAoPlanejamento` (CADASTRAR_EMENDA_AO_ORCAMENTO) e `sancionarEmendaAoPlanejamento` (SANCIONAR_EMENDA_AO_ORCAMENTO) — as emendas ao PPA e à LDO, nenhuma ação nova. // +2 (V36) `registrarChequeAvulso` (REGISTRAR_MOVIMENTO_BANCARIO) e `cancelarChequeAvulso` (ESTORNAR_MOVIMENTO_BANCARIO) — o cheque avulso, nenhuma ação nova. // +3 (V36) `cadastrarParceriaPublicoPrivada`, `registrarSituacaoDaParceria` e `informarParcelasDaParceria` — a parceria público-privada, sob CADASTRAR_CONTRATO (nenhuma ação nova). // +1 (V36) `declararPeriodicidadeDasCotas` — a periodicidade do controle das cotas, sob CRIAR_VERSAO_CMD (nenhuma ação nova). // +4 (V36) `criarObraPrevistaLdo` (CADASTRAR_LDO), `registrarAudienciaPublica`, `registrarSolicitacaoDaAudiencia` e `registrarSituacaoDaSolicitacao` (CADASTRAR_PPA) — obras previstas na LDO e audiências públicas, nenhuma ação nova. // +1 (V36) `publicarObraNoPortal` — a obra no portal da transparência, sob CADASTRAR_OBRA (nenhuma ação nova). // +1 (V36) `proporCmdPorPercentual` — o CMD pelo percentual de cada mês, sob CRIAR_VERSAO_CMD (nenhuma ação nova). // +1 (V36) `registrarDeducoesEmLote` — o lote de deduções da receita com uma conta, sob REGISTRAR_ARRECADACAO (nenhuma ação nova). // +1 (V36) `duplicarEmpenho` — a duplicação do empenho, sob EMPENHAR (nenhuma ação nova). // +4 (V36) `cadastrarEmendaAoOrcamento`, `bloquearDotacaoParaEmendas`, `revogarBloqueioDeEmenda` (CADASTRAR_EMENDA_AO_ORCAMENTO) e `sancionarEmendaAoOrcamento` (SANCIONAR_EMENDA_AO_ORCAMENTO) — as emendas ao projeto da LOA, duas ações novas. // +2 (V36) `informarParcelasDaDivida` e `substituirParcelaDaDivida` — o cronograma da dívida fundada, sob CADASTRAR_DIVIDA (nenhuma ação nova). // +1 (V36) `cadastrarContaBancaria` — a conta bancária nova pela tela, sob CADASTRAR_CONTA_BANCARIA (ação nova). // +1 (V35 A3) `declararContasDoControleDosRestos` — as contas 5.3/6.3 dos restos, sob PARAMETRIZAR_ROTEIRO_RESTOS_A_PAGAR (nenhuma ação nova). // +2 (V35) `registrarProjecaoAtuarialDoRreo` e `retirarProjecaoAtuarialDoRreo` — o Anexo 10 do RREO, sob CADASTRAR_LINHA_DEMONSTRATIVO (nenhuma ação nova). // +1 (V35) `baixarAdiantamentoDoDecimoTerceiro` — a baixa do adiantamento da 1ª parcela do 13º, sob LIQUIDAR_FOLHA (nenhuma ação nova). // +1 (V35) `apropriarEncargosPorCompetencia` — os encargos sobre o 13º e as férias apropriados, sob APROPRIAR_FOLHA (nenhuma ação nova). // +2 (V35 C2) `redigirNotaExplicativa` e `retirarNotaExplicativa` — as notas explicativas, sob CADASTRAR_LINHA_DEMONSTRATIVO (nenhuma ação nova). // +3 (V35) `declararParametroDeFerias` (CONFIGURAR_PARAMETRO_DO_DECIMO_TERCEIRO), `apropriarPorCompetencia` e `acertarDecimoTerceiro` (APROPRIAR_FOLHA) — a apropriação do 13º e das férias por competência, nenhuma ação nova. // +2 (V35) `declararPercentualDePerda` e `apurarAjusteDePerdas` — o ajuste para perdas da dívida ativa, sob ATUALIZAR_DIVIDA_ATIVA (nenhuma ação nova). // +1 (V35) `declararFonteForaDoLimiteDeSuplementacao` — as fontes que a LOA exclui do limite percentual de suplementação, sob CRIAR_LEI_DE_CREDITO (nenhuma ação nova). // +1 (V35) `declararParametroDoLimiteDoLegislativo` — população e base do art. 29-A, sob CADASTRAR_LINHA_DEMONSTRATIVO. // +1 (V35) `gerarDeParasDaLrf` — os de-paras da RCL, da base de impostos e do FUNDEB pelo ementário 2026, sob CADASTRAR_LINHA_DEMONSTRATIVO. // +2 (V35) `registrarDeducaoDaReceita` (REGISTRAR_ARRECADACAO) e `estornarDeducaoDaReceita` (ANULAR_ARRECADACAO) — a dedução do FUNDEB, nenhuma ação nova. // +1 (V35) `carregarReceitaDaLoa` — a receita prevista da LOA aprovada, sob CADASTRAR_LOA. // +1 (V35) `carregarQddDaLoa` — a carga do QDD da LOA aprovada, sob CADASTRAR_LOA (nenhuma ação nova). // +1 (V35) `carregarTabelaDeFontes` — a carga da tabela oficial de fontes e CO da STN, sob CADASTRAR_LOA (nenhuma ação nova). // +1 (V34) `atribuirEntidadeAoMovimentoExtra` — a regularização da entidade de um movimento extraorçamentário numa conta sem titular, sob ATRIBUIR_ENTIDADE_A_ARRECADACAO (nenhuma ação nova). // +1 (V33) `vincularUnidadeOrcamentariaAUg` — de qual UG é cada unidade orçamentária, sob CADASTRAR_ENTIDADE_CONTABIL (nenhuma ação nova). Medido: Object.keys(ACAO_DO_SERVICO) em 89a1f1c = 506, em bbd4972 = 507, delta = exatamente esta uma; zero removidas. // +1 (V32) `implantarSaldosIniciais` — a carga do balancete do sistema anterior, sob REGISTRAR_LANCAMENTO_MANUAL (nenhuma ação nova). // +4 (V32) `concederAdiantamento` e `registrarPrestacaoDeAdiantamento` sob EMPENHAR, `aprovarPrestacaoDeAdiantamento` e `rejeitarPrestacaoDeAdiantamento` sob APROVAR_PRESTACAO_DE_CONTAS — diárias e suprimento de fundos (nenhuma ação nova). // +1 (V32) `declararRoteiroPatrimonial` — o roteiro de precatório e de convênio pela tela, sob PARAMETRIZAR_ROTEIRO_ORCAMENTARIO (nenhuma ação nova). // +1 (V32) `fecharCompetenciaConferida` — fechar o mês pela tela depois da conferência de divergências, sob TRAVAR_COMPETENCIA (nenhuma ação nova). // +2 (V32) `arrecadarRecebendoDividaAtiva` e `arrecadarIngressoDaOperacaoDeCredito` — a guia da tela recebendo dívida ativa e ingressando operação de crédito, sob REGISTRAR_ARRECADACAO (nenhuma ação nova). // +3 (V29) `elaborarPropostaOrcamentaria`, `ajustarLinhaDaProposta` (CADASTRAR_LOA) e `efetivarPropostaOrcamentaria` (CRIAR_FICHA) — a proposta do exercício seguinte, nenhuma ação nova. // +1 (V28) `declararContaDaReceita` — a VPA da arrecadação por natureza, sob PARAMETRIZAR_ROTEIRO_ORCAMENTARIO (nenhuma ação nova). // +1 (V28) `apropriarCustoDaFolha` — o custo da folha pelo centro de custo de cada vínculo, sob APROPRIAR_CUSTO (nenhuma ação nova). // +1 (V28) `declararConsignacaoDaRubrica` — a consignação de cada rubrica de desconto da folha, sob GERIR_TIPOS_DE_CONSIGNACAO (nenhuma ação nova).  // +1 (V28) `declararContaDaLiquidacao` — a conta da liquidação por elemento, sob PARAMETRIZAR_ROTEIRO_ORCAMENTARIO (a autoridade de declararNaturezaDaFonte). // +1 (V28) `arrecadarQuitandoReconhecimento` — a guia da tela quitando o crédito reconhecido, sob REGISTRAR_ARRECADACAO (o mesmo ato de arrecadar; nenhuma ação nova). // +1 (V27) `informarProtocoloDaNorma` — o protocolo do banco de legislação que chega depois do registro da lei, sob CRIAR_LEI_DE_CREDITO (ZERO ações novas). // +1 (V27) `importarLicitacoesDoTribunal` — a lista de licitações dos dados abertos do Tribunal, sob CADASTRAR_PROCESSO (ZERO ações novas). // +11 (V27) frota e farmácia pública (SAGRES §4.50 a §4.57): `cadastrarVeiculo`, `publicarVersaoDoVeiculo`, `cadastrarMaquina`, `publicarVersaoDaMaquina`, `registrarSituacaoDaFrota` e `anularSituacaoDaFrota` sob CADASTRAR_FROTA; `registrarAbastecimento` e `anularAbastecimento` sob REGISTRAR_ABASTECIMENTO (quem abastece não altera o cadastro); `cadastrarFarmacia` e `publicarVersaoDaFarmacia` sob CADASTRAR_FARMACIA; `informarEstoqueDaFarmacia` sob INFORMAR_ESTOQUE_DA_FARMACIA. // +1 (V26) `capturarVersaoDoProjetoDaLoa` — a cópia do projeto da LOA no encaminhamento, sob CADASTRAR_LOA (quem cadastra o projeto registra a versão dele). // +1 (V26) `registrarAgrupamentoDaFolha` — o código da remessa de pessoal na liquidação da folha, sob LIQUIDAR_FOLHA (quem liquida a folha diz qual agrupamento a liquidação é). // +5 (V26) `cadastrarUnidadeGestora` e `encerrarUnidadeGestora` (sob CADASTRAR_ENTIDADE_CONTABIL: dizer por que UG a entidade presta contas é dizer quem ela é), `definirContabilizacaoDaTransferenciaEntreUgs` (sob PARAMETRIZAR_ROTEIRO_ORCAMENTARIO: em que conta o movimento bate), `registrarTransferenciaEntreUgs` (sob TRANSFERIR_ENTRE_CONTAS) e `estornarTransferenciaEntreUgs` (sob ESTORNAR_MOVIMENTO_BANCARIO) — CINCO servicos e ZERO acoes novas. // +1 (V26) `registrarNormaNoTce` — o protocolo da lei no banco de legislação do TCE-PB, sob CRIAR_LEI_DE_CREDITO (quem registra a lei de crédito registra o protocolo dela). // +1 (V26) `identificarNoTramita` — o número, a UG e a modalidade da licitação no Tramita, sob a ação de cadastrar o processo. // +1 (V26) `detalharReceitaPrevista` — sob CRIAR_RECEITA_PREVISTA (o subtipo da dedução e o documento da linha). // +5 (V26) `declararDadosDoPrograma`, `declararDadosDaAcao`, `designarOrdenador`, `encerrarDesignacaoDeOrdenador` (sob DECLARAR_DADOS_DA_UNIDADE_ORCAMENTARIA) e `declararResponsavelSiafic` (sob CADASTRAR_ENTIDADE_CONTABIL) — CINCO servicos e ZERO acoes novas. // +1 (V26) `regularizarConsignacaoPropria` — UM servico e ZERO acoes novas: baixar contra a receita o IR/ISS do proprio Tesouro que ficou na consignacao e registrar a receita que faltou, sob REGISTRAR_ARRECADACAO. // +1 (V26) `classificarRetencaoPropria` — UM servico e ZERO acoes novas: dizer que o IR e o ISS retidos sao receita do Tesouro (natureza, destinacao, contas) fica sob GERIR_TIPOS_DE_CONSIGNACAO, a mesma autoridade sobre o tipo que antes ia ao passivo; as leituras, a guarda e as duas pernas do pagamento estao em FORA_DO_CENSO. // +1 (V25) `registrarEstabelecimentoDaLotacao` — UM servico e ZERO acoes novas: o CNPJ do estabelecimento da lotacao e parametro do FAP, sob CADASTRAR_ENCARGO_DA_FOLHA. // +2 (V24) `cadastrarFatorAcidentario` e `aprovarFatorAcidentario` — DOIS servicos e ZERO acoes novas: o FAP e parametro do encargo, sob CADASTRAR_ENCARGO_DA_FOLHA e APROVAR_ENCARGO_DA_FOLHA (quem cadastra nao aprova); a leitura `fapVigente` esta em FORA_DO_CENSO. // +1 (V24) `registrarPerfilFiscal` — UM servico e ZERO acoes novas: o perfil fiscal do fornecedor fica sob ALTERAR_PESSOA (dado cadastral da pessoa); as leituras e o preparo das retencoes calculadas estao em FORA_DO_CENSO. // +1 (V23) `importarPlanoDoTribunal` — o plano de contas do Tribunal designado para o exercício, sob IMPORTAR_PLANO_DO_TRIBUNAL. // +2 (V22) `cadastrarLeiOrcamentariaAnual` e `registrarAprovacaoDaLeiOrcamentaria` — o projeto e a lei da LOA, sob CADASTRAR_LOA. // +1 (V22) `cadastrarCampanhaPublicitaria` — UM servico e ZERO acoes novas: a campanha fica sob CADASTRAR_CONTRATO (executada pelo contrato de publicidade); a soma `empenhadoLiquidoDaCampanha` esta em FORA_DO_CENSO. // +4 (V22) `classificarUnidadeParaOManad`, `classificarAcaoParaOManad`, `classificarNaturezaDespesaParaOManad` e `classificarNaturezaReceitaParaOManad` — QUATRO servicos e ZERO acoes novas: a classificacao do cadastro para o arquivo da Receita fica sob CADASTRAR_ENTIDADE_CONTABIL, a mesma dos responsaveis do MANAD. // +1 (V22) `cadastrarNaturezaReceita` — UM servico e ZERO acoes novas: o ementario da receita fica sob PARAMETRIZAR_ROTEIRO_ORCAMENTARIO, porque cadastrar a natureza e dizer em que classificacao do orcamento a arrecadacao entra — a mesma autoridade de `declararNaturezaDaFonte`. // +4 (V22) `solicitarEmpenho`, `cancelarSolicitacaoDeEmpenho`, `autorizarSolicitacaoDeEmpenho` e `rejeitarSolicitacaoDeEmpenho` — QUATRO servicos e DUAS acoes (SOLICITAR_EMPENHO e AUTORIZAR_SOLICITACAO_DE_EMPENHO): o corte e por QUEM FAZ, o setor pede e retira o pedido, a autoridade autoriza ou rejeita. // +3 (V22) `registrarContabilistaDoManad`, `registrarEmpresaGeradoraDoManad` e `declararCentralizacaoDaEscrituracao` — TRES servicos e ZERO acoes novas: os tres ficam sob CADASTRAR_ENTIDADE_CONTABIL, porque dizer quem responde pela escrituracao da entidade perante a Receita (contabilista, empresa geradora, centralizacao) e a mesma autoridade de dizer quem a entidade e. Por isso so ESTA contagem sobe, e a de acoes nao se mexe. // +1 (V20) `classificarContaNaVirada` — UM servico sob UMA acao nova (PARAMETRIZAR_VIRADA_DOS_CONTROLES). O encerramento dos controles (`encerrarControlesOrcamentarios`) e o estorno dele JA estavam no Record desde a V15: o que faltava era o ESCRITOR da tabela-parametro de que eles dependem — medido, `contaNaVirada.create` aparecia em quatro lugares e todos eram arquivos de TESTE. ⚠️ A LEITURA `contasDaVirada` esta em FORA_DO_CENSO, com o motivo: ela soma o razao das classes 5 e 6 no corte e nao muta. Medido: Object.keys(ACAO_DO_SERVICO) em 2688266 = 435, depois = 436, delta = exatamente este um; zero removidos. // +2 (V19/C05) `publicarCriterioDeRateio` e `apropriarCustoDaLiquidacao` — DOIS servicos sob DUAS acoes novas (PARAMETRIZAR_RATEIO_DE_CUSTO e APROPRIAR_CUSTO), e aqui as duas acoes NAO se fundem numa: publicar a regua do rateio e um ato NORMATIVO (o ente decide, por portaria, que 60 % do aluguel e da Educacao) e apropriar e um ato de EXECUCAO, repetido todo mes pelo contador. Fundir daria a quem lanca o poder de reescrever a regua pela qual ele proprio e medido. ⚠️ As CINCO leituras (custoPorCentro, composicaoDoCentro, criteriosDeRateio, centrosDeCusto e criterioVigenteDeRateio) estao em FORA_DO_CENSO, com o motivo: custo e DEMONSTRATIVO, lido sob a politica de leitura. Medido: Object.keys(ACAO_DO_SERVICO) em bbcf25d = 433, depois = 435, delta = exatamente estes dois; zero removidos. // +2 (V18/C13) `registrarAtoDeAlteracaoDoPlanejamento` e `acrescentarItemAoAtoDeAlteracao` — DOIS servicos sob UMA acao nova (ALTERAR_PLANEJAMENTO): registrar a lei que altera a peca e acrescentar mais uma linha a ela sao o mesmo poder, e partir em dois crachas daria ao ente a chance de conceder um sem o outro. ⚠️ As QUATRO leituras da alteracao (comparativoDaPeca, metasAnuaisVigentes, atosDaPeca, linhasAlteraveisDaPeca) estao em FORA_DO_CENSO, com o motivo — e a ausencia de acao para elas nao e esquecimento: o comparativo e DEMONSTRATIVO, lido sob CONSULTAR_PLANEJAMENTO. Medido: Object.keys(ACAO_DO_SERVICO) em 180ccd8 = 431, depois = 433, delta = exatamente estes dois; zero removidos. // +2 (V16 · TR 5.10.2.6) `acrescentarFonteAoRolDaConta` e `removerFonteDoRolDaConta` — DOIS servicos sob UMA acao nova (GERIR_ROL_DE_FONTES_DA_CONTA): acrescentar e remover fonte do rol sao o mesmo poder, e partir em dois crachas daria ao ente a chance de conceder um sem o outro, o que nao significaria nada. +1 (V15/C38) `publicarRoteiroRestosAPagar` — UM servico sob UMA acao nova (PARAMETRIZAR_ROTEIRO_RESTOS_A_PAGAR). ⚠️ E a V16/C30 somou ZERO: `DISTRIBUIR_RECEITA_FORA_DA_PREVISAO` e a segunda autorizacao cobrada DENTRO de `registrarArrecadacao` e nao tem servico proprio — por isso ela nao entra neste Record, e por isso este numero subiu 1 e nao 2. As sete funcoes das unidades V15 (tres leituras da composicao extra, uma composavel do recolhimento e as tres do roteiro dos restos) estao em FORA_DO_CENSO, com o motivo de cada uma. ⚠️ ESTE CONTA SERVICOS (`Object.keys(ACAO_DO_SERVICO)`), e o da linha do `TODAS_AS_ACOES` conta ACOES — sao numeros diferentes e ja se confundiram tres vezes nesta rodada; +2 (V11 V9.3/V9.4) `declararNaturezaDaFonte` e `cadastrarFuncao` — DOIS servicos e ZERO acoes novas, que e a razao de so ESTA contagem ter ficado vermelha enquanto a de acoes seguiu verde. `declararNaturezaDaFonte` (M01, DDR) fica sob PARAMETRIZAR_ROTEIRO_ORCAMENTARIO porque declarar de que NATUREZA a fonte e e a mesma autoridade de dizer em que conta o movimento entra — e o mesmo criterio que ja pos `publicarRoteiroOrcamentario` ali. `cadastrarFuncao` (M32, TR 5.12.50) fica sob CADASTRAR_CARGO porque a funcao de confianca e a gratificada sao o mesmo ato de estrutura de pessoal que o cargo: quem publica o quadro publica as duas, e um cracha a mais inventaria uma segregacao que o ente nao tem. ⚠️ O numero foi corrigido DEPOIS de medir quais chaves entraram (`Object.keys` em `8bdf23a` = 425, em HEAD = 427, delta = exatamente estas duas, zero removidas), nao ajustado para o observado: o censo estava certo e o que faltava era o registro destes dois. +1 (V13) `cadastrarParametroDoAdiantamentoSalarial` — UM servico sob UMA acao nova (CONFIGURAR_PARAMETRO_DO_ADIANTAMENTO_SALARIAL), o TERMO NOVO deste numero. Abrir, calcular e fechar a folha de vale NAO sao servicos novos: reusam `abrirFolha`, `calcularFolha` e `fecharFolha`, e o motor do vale e um ramo dentro do `calcularFolha` que ja existia. As TRES leituras (`parametroVigenteDaCompetencia`, `parametroQueApurouOCalculo`, `abatimentoDoAdiantamentoSalarialNaCompetencia`) estao em FORA_DO_CENSO, com o motivo; +1 (V11 V9.1) `cadastrarParametroDoDecimoTerceiro` — UM servico sob UMA acao nova (CONFIGURAR_PARAMETRO_DO_DECIMO_TERCEIRO). Abrir e calcular as folhas de 13o NAO sao servicos novos: reusam `abrirFolha` e `calcularFolha`, e o motor do 13o e um ramo dentro do `calcularFolha` que ja existia. A LEITURA `parametroVigenteDoExercicio` esta em FORA_DO_CENSO; +4 (V11 V9) a entidade contabil: cadastrar, publicar versao, declarar o titular da conta e atribuir entidade a arrecadacao — QUATRO SERVICOS sob TRES ACOES, porque publicar versao e a mesma autoridade de cadastrar (dizer quem a entidade e), e partir em duas daria ao ente a chance de conceder uma sem a outra, o que nao significaria nada; o precedente e vincularPessoaAoUsuario/desvincularPessoaDoUsuario; as tres LEITURAS (entidadesContabeis, titularVigenteDaConta, arrecadadoPorEntidade) estao em FORA_DO_CENSO; +2 (V11 V8.9) publicar o EIXO da dotacao adicional e o roteiro do ramo POR FONTE — as tres decisoes de roteiro compartilham PARAMETRIZAR_ROTEIRO_ORCAMENTARIO, porque sao a mesma autoridade (dizer em que conta o movimento entra); as quatro LEITURAS estao em FORA_DO_CENSO; +0 (V11 V8.12) `fecharDiaDeAtendimento` virou `declararExcecaoDeCalendario` — o SERVICO mudou de nome (ele passou a fechar, encolher ou devolver ao normal), a ACAO continua CONFIGURAR_AGENDA_DO_GUICHE e nenhuma concessao do ente se move; +1 (V11 V8.4) publicar o roteiro orcamentario pela tela (a LEITURA da versao vigente esta em FORA_DO_CENSO); +3 (V11 V8.3) o cadastro dos tipos de consignacao: cadastrar, redefinir a conta e desativar (a LEITURA da decisao vigente esta em FORA_DO_CENSO); +10 (V11 V8) a agenda do guiche: unidade, guiche, servico no guiche, janela, fechar dia, reservar, cancelar, reagendar, confirmar e registrar o atendimento (as duas LEITURAS estao em FORA_DO_CENSO); +1 (V11 V7.3) declarar a disponibilidade de recurso novo (acao PROPRIA: e ela que autoriza a despesa por superavit/excesso/operacao de credito, e quem apura o balanco nao e quem escreve o decreto); +7 (V11 V5.3) o RITO do acesso a informacao: protocolar, distribuir, receber, prorrogar, responder, interpor e decidir o recurso (cinco acoes proprias; `receberPedidoDeAcesso` usa RECEBER_PROCESSO e `interporRecursoDeAcesso` usa DECIDIR_RECURSO_, porque receber o pedido e receber o PROCESSO, e interpor e ato do REQUERENTE, que nao tem cracha — quem registra a peca e o setor recursal); +1 (V11 V5.1) publicar a configuracao do acesso a informacao (acao propria: CRIAR_ASSUNTO fixa prazo de ETAPA, interno; este declara com citacao de lei a data prometida a quem tem direito subjetivo, e o quanto ela se prorroga); +3 (V11 V4.2) a politica de publicacao de pessoal: cadastrar, aprovar e revogar (redigir e aprovar sao atos separados porque a politica autoriza expor dado pessoal em portal aberto); +3 (V11 V1.1) a rubrica versionada: criar a versao, aprovar e revogar (escrever e aprovar sao atos distintos); +1 (V10 T3) definir a divulgacao de uma localizacao (a leitura do historico esta em FORA_DO_CENSO); +8 (V10 T2) o lancamento tributario e a certidao: preparar o lote, preparar um, constituir, retificar, cancelar, solicitar, decidir e configurar a certidao (as seis LEITURAS estao em FORA_DO_CENSO); +6 (V10 T1) o licenciamento comercial: registrar e encerrar o contrato, habilitar, programar vigencia, suspender e reativar o modulo; +1 (V9 N4) estornar o recebimento definitivo; +5 (V7 B1) cadastro imobiliario (cadastrar, nova versao, vincular, encerrar) e a tabela de parametros; +6 (V7 M2 U8) tipo de ocorrencia (cadastrar, publicar versao, mudar situacao), reagendar, cancelar e realizar a fiscalizacao; +2 (V7 M2 U7) medir a ordem pela planilha e estornar a medicao da ordem; +4 (V7 M2 U6) previa, confirmacao, vinculo e revogacao da planilha da obra; +3 (V7 M2 U5) prever, registrar e estornar o aditivo por itens; +1 (V7 M2 U3) liquidar as parcelas recebidas do contrato; +9 (V7 M2 U1/U2) rascunho, emitir, descartar, cancelar saldo, suspender/retomar, medir a ordem, provisorio, decidir controversia, definitivo; +1 (V7 M2 U0.2) configurar regime de medicao; +2 (V7 M2 U0.1) definir e revogar administrador da fiscalizacao; +7 (V7 M2.1) designar, revogar, item, programar, ocorrência, resolver, medir por itens; +5 (V7 M1 U4) triar e responder a manifestacao, metodologia, avaliar atendimento, remover avaliacao (os atos publicos sem conta estao em FORA_DO_CENSO); +3 (V7 M1 U3.2) guia de recolhimento; // +1 (V7 M1 U3) ajuste para baixo dos encargos; +11 (V6.2 P3) carta de servicos e representacao; +9 (V6.2) encargos do empregador; +4 (V5) documento fiscal; +1 (V6 P0.1) apresentação; +2 (V6 P1.1) vínculo; +1 (V6 P1.2) conta da arrecadação; +17 (V6 P2) M32 pessoal; +9 (V6 P2.3) M33 folha; +2 (V6 P2.3b) apropriação; +6 (V6.1) atesto, liquidação e as contas do grupo // +1 (V21) `declararDadosDaUnidade` — UM servico sob UMA acao nova (DECLARAR_DADOS_DA_UNIDADE_ORCAMENTARIA); a leitura `unidadesComDeclaracao` e os geradores do SAGRES estao em FORA_DO_CENSO. // +2 (V21) `registrarRealocacao` e `anularRealocacao` — DOIS servicos sob DUAS acoes novas (REGISTRAR_REALOCACAO_DE_DOTACAO e ANULAR_REALOCACAO_DE_DOTACAO), a mesma segregacao de EXECUTAR_CREDITO e ANULAR_CREDITO. ⚠️ A LEITURA `listarRealocacoes` e o composavel `estornarMovimentoDotacao` (M05, chamado dentro de anularRealocacao, que e quem autoriza) estao em FORA_DO_CENSO, com o motivo. // +1 (V20) `classificarContaNaVirada` — UM servico sob UMA acao nova (PARAMETRIZAR_VIRADA_DOS_CONTROLES). O encerramento dos controles (`encerrarControlesOrcamentarios`) e o estorno dele JA estavam no Record desde a V15: o que faltava era o ESCRITOR da tabela-parametro de que eles dependem — medido, `contaNaVirada.create` aparecia em quatro lugares e todos eram arquivos de TESTE. ⚠️ A LEITURA `contasDaVirada` esta em FORA_DO_CENSO, com o motivo: ela soma o razao das classes 5 e 6 no corte e nao muta. Medido: Object.keys(ACAO_DO_SERVICO) em 2688266 = 435, depois = 436, delta = exatamente este um; zero removidos. // +2 (V19/C05) `publicarCriterioDeRateio` e `apropriarCustoDaLiquidacao` — DOIS servicos sob DUAS acoes novas (PARAMETRIZAR_RATEIO_DE_CUSTO e APROPRIAR_CUSTO), e aqui as duas acoes NAO se fundem numa: publicar a regua do rateio e um ato NORMATIVO (o ente decide, por portaria, que 60 % do aluguel e da Educacao) e apropriar e um ato de EXECUCAO, repetido todo mes pelo contador. Fundir daria a quem lanca o poder de reescrever a regua pela qual ele proprio e medido. ⚠️ As CINCO leituras (custoPorCentro, composicaoDoCentro, criteriosDeRateio, centrosDeCusto e criterioVigenteDeRateio) estao em FORA_DO_CENSO, com o motivo: custo e DEMONSTRATIVO, lido sob a politica de leitura. Medido: Object.keys(ACAO_DO_SERVICO) em bbcf25d = 433, depois = 435, delta = exatamente estes dois; zero removidos. // +2 (V18/C13) `registrarAtoDeAlteracaoDoPlanejamento` e `acrescentarItemAoAtoDeAlteracao` — DOIS servicos sob UMA acao nova (ALTERAR_PLANEJAMENTO): registrar a lei que altera a peca e acrescentar mais uma linha a ela sao o mesmo poder, e partir em dois crachas daria ao ente a chance de conceder um sem o outro. ⚠️ As QUATRO leituras da alteracao (comparativoDaPeca, metasAnuaisVigentes, atosDaPeca, linhasAlteraveisDaPeca) estao em FORA_DO_CENSO, com o motivo — e a ausencia de acao para elas nao e esquecimento: o comparativo e DEMONSTRATIVO, lido sob CONSULTAR_PLANEJAMENTO. Medido: Object.keys(ACAO_DO_SERVICO) em 180ccd8 = 431, depois = 433, delta = exatamente estes dois; zero removidos. // +2 (V16 · TR 5.10.2.6) `acrescentarFonteAoRolDaConta` e `removerFonteDoRolDaConta` — DOIS servicos sob UMA acao nova (GERIR_ROL_DE_FONTES_DA_CONTA): acrescentar e remover fonte do rol sao o mesmo poder, e partir em dois crachas daria ao ente a chance de conceder um sem o outro, o que nao significaria nada. +1 (V15/C38) `publicarRoteiroRestosAPagar` — UM servico sob UMA acao nova (PARAMETRIZAR_ROTEIRO_RESTOS_A_PAGAR). ⚠️ E a V16/C30 somou ZERO: `DISTRIBUIR_RECEITA_FORA_DA_PREVISAO` e a segunda autorizacao cobrada DENTRO de `registrarArrecadacao` e nao tem servico proprio — por isso ela nao entra neste Record, e por isso este numero subiu 1 e nao 2. As sete funcoes das unidades V15 (tres leituras da composicao extra, uma composavel do recolhimento e as tres do roteiro dos restos) estao em FORA_DO_CENSO, com o motivo de cada uma. ⚠️ ESTE CONTA SERVICOS (`Object.keys(ACAO_DO_SERVICO)`), e o da linha do `TODAS_AS_ACOES` conta ACOES — sao numeros diferentes e ja se confundiram tres vezes nesta rodada; +2 (V11 V9.3/V9.4) `declararNaturezaDaFonte` e `cadastrarFuncao` — DOIS servicos e ZERO acoes novas, que e a razao de so ESTA contagem ter ficado vermelha enquanto a de acoes seguiu verde. `declararNaturezaDaFonte` (M01, DDR) fica sob PARAMETRIZAR_ROTEIRO_ORCAMENTARIO porque declarar de que NATUREZA a fonte e e a mesma autoridade de dizer em que conta o movimento entra — e o mesmo criterio que ja pos `publicarRoteiroOrcamentario` ali. `cadastrarFuncao` (M32, TR 5.12.50) fica sob CADASTRAR_CARGO porque a funcao de confianca e a gratificada sao o mesmo ato de estrutura de pessoal que o cargo: quem publica o quadro publica as duas, e um cracha a mais inventaria uma segregacao que o ente nao tem. ⚠️ O numero foi corrigido DEPOIS de medir quais chaves entraram (`Object.keys` em `8bdf23a` = 425, em HEAD = 427, delta = exatamente estas duas, zero removidas), nao ajustado para o observado: o censo estava certo e o que faltava era o registro destes dois. +1 (V13) `cadastrarParametroDoAdiantamentoSalarial` — UM servico sob UMA acao nova (CONFIGURAR_PARAMETRO_DO_ADIANTAMENTO_SALARIAL), o TERMO NOVO deste numero. Abrir, calcular e fechar a folha de vale NAO sao servicos novos: reusam `abrirFolha`, `calcularFolha` e `fecharFolha`, e o motor do vale e um ramo dentro do `calcularFolha` que ja existia. As TRES leituras (`parametroVigenteDaCompetencia`, `parametroQueApurouOCalculo`, `abatimentoDoAdiantamentoSalarialNaCompetencia`) estao em FORA_DO_CENSO, com o motivo; +1 (V11 V9.1) `cadastrarParametroDoDecimoTerceiro` — UM servico sob UMA acao nova (CONFIGURAR_PARAMETRO_DO_DECIMO_TERCEIRO). Abrir e calcular as folhas de 13o NAO sao servicos novos: reusam `abrirFolha` e `calcularFolha`, e o motor do 13o e um ramo dentro do `calcularFolha` que ja existia. A LEITURA `parametroVigenteDoExercicio` esta em FORA_DO_CENSO; +4 (V11 V9) a entidade contabil: cadastrar, publicar versao, declarar o titular da conta e atribuir entidade a arrecadacao — QUATRO SERVICOS sob TRES ACOES, porque publicar versao e a mesma autoridade de cadastrar (dizer quem a entidade e), e partir em duas daria ao ente a chance de conceder uma sem a outra, o que nao significaria nada; o precedente e vincularPessoaAoUsuario/desvincularPessoaDoUsuario; as tres LEITURAS (entidadesContabeis, titularVigenteDaConta, arrecadadoPorEntidade) estao em FORA_DO_CENSO; +2 (V11 V8.9) publicar o EIXO da dotacao adicional e o roteiro do ramo POR FONTE — as tres decisoes de roteiro compartilham PARAMETRIZAR_ROTEIRO_ORCAMENTARIO, porque sao a mesma autoridade (dizer em que conta o movimento entra); as quatro LEITURAS estao em FORA_DO_CENSO; +0 (V11 V8.12) `fecharDiaDeAtendimento` virou `declararExcecaoDeCalendario` — o SERVICO mudou de nome (ele passou a fechar, encolher ou devolver ao normal), a ACAO continua CONFIGURAR_AGENDA_DO_GUICHE e nenhuma concessao do ente se move; +1 (V11 V8.4) publicar o roteiro orcamentario pela tela (a LEITURA da versao vigente esta em FORA_DO_CENSO); +3 (V11 V8.3) o cadastro dos tipos de consignacao: cadastrar, redefinir a conta e desativar (a LEITURA da decisao vigente esta em FORA_DO_CENSO); +10 (V11 V8) a agenda do guiche: unidade, guiche, servico no guiche, janela, fechar dia, reservar, cancelar, reagendar, confirmar e registrar o atendimento (as duas LEITURAS estao em FORA_DO_CENSO); +1 (V11 V7.3) declarar a disponibilidade de recurso novo (acao PROPRIA: e ela que autoriza a despesa por superavit/excesso/operacao de credito, e quem apura o balanco nao e quem escreve o decreto); +7 (V11 V5.3) o RITO do acesso a informacao: protocolar, distribuir, receber, prorrogar, responder, interpor e decidir o recurso (cinco acoes proprias; `receberPedidoDeAcesso` usa RECEBER_PROCESSO e `interporRecursoDeAcesso` usa DECIDIR_RECURSO_, porque receber o pedido e receber o PROCESSO, e interpor e ato do REQUERENTE, que nao tem cracha — quem registra a peca e o setor recursal); +1 (V11 V5.1) publicar a configuracao do acesso a informacao (acao propria: CRIAR_ASSUNTO fixa prazo de ETAPA, interno; este declara com citacao de lei a data prometida a quem tem direito subjetivo, e o quanto ela se prorroga); +3 (V11 V4.2) a politica de publicacao de pessoal: cadastrar, aprovar e revogar (redigir e aprovar sao atos separados porque a politica autoriza expor dado pessoal em portal aberto); +3 (V11 V1.1) a rubrica versionada: criar a versao, aprovar e revogar (escrever e aprovar sao atos distintos); +1 (V10 T3) definir a divulgacao de uma localizacao (a leitura do historico esta em FORA_DO_CENSO); +8 (V10 T2) o lancamento tributario e a certidao: preparar o lote, preparar um, constituir, retificar, cancelar, solicitar, decidir e configurar a certidao (as seis LEITURAS estao em FORA_DO_CENSO); +6 (V10 T1) o licenciamento comercial: registrar e encerrar o contrato, habilitar, programar vigencia, suspender e reativar o modulo; +1 (V9 N4) estornar o recebimento definitivo; +5 (V7 B1) cadastro imobiliario (cadastrar, nova versao, vincular, encerrar) e a tabela de parametros; +6 (V7 M2 U8) tipo de ocorrencia (cadastrar, publicar versao, mudar situacao), reagendar, cancelar e realizar a fiscalizacao; +2 (V7 M2 U7) medir a ordem pela planilha e estornar a medicao da ordem; +4 (V7 M2 U6) previa, confirmacao, vinculo e revogacao da planilha da obra; +3 (V7 M2 U5) prever, registrar e estornar o aditivo por itens; +1 (V7 M2 U3) liquidar as parcelas recebidas do contrato; +9 (V7 M2 U1/U2) rascunho, emitir, descartar, cancelar saldo, suspender/retomar, medir a ordem, provisorio, decidir controversia, definitivo; +1 (V7 M2 U0.2) configurar regime de medicao; +2 (V7 M2 U0.1) definir e revogar administrador da fiscalizacao; +7 (V7 M2.1) designar, revogar, item, programar, ocorrência, resolver, medir por itens; +5 (V7 M1 U4) triar e responder a manifestacao, metodologia, avaliar atendimento, remover avaliacao (os atos publicos sem conta estao em FORA_DO_CENSO); +3 (V7 M1 U3.2) guia de recolhimento; // +1 (V7 M1 U3) ajuste para baixo dos encargos; +11 (V6.2 P3) carta de servicos e representacao; +9 (V6.2) encargos do empregador; +4 (V5) documento fiscal; +1 (V6 P0.1) apresentação; +2 (V6 P1.1) vínculo; +1 (V6 P1.2) conta da arrecadação; +17 (V6 P2) M32 pessoal; +9 (V6 P2.3) M33 folha; +2 (V6 P2.3b) apropriação; +6 (V6.1) atesto, liquidação e as contas do grupo

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
    // 156 serviços, 149 ações distintas. Os cadastros do M21 têm ações próprias porque
    // CONFIGURAR NÃO É OPERAR: quem desenha o roteiro de um assunto decide por quantos
    // setores todo processo daquele tipo vai passar; quem abre o processo apenas o usa.
    // + 5 (ENT03/M09 — o lote e o borderô; ações PRÓPRIAS, e não reuso de PAGAR: compor a
    //   remessa e autorizar o pagamento são atos de pessoas diferentes) = 154.
    // + 2 (ENT03a/M09 — a movimentação bancária. Ações PRÓPRIAS, e não reuso de
    //   TRANSFERIR_ENTRE_CONTAS: mover dinheiro ENTRE contas do ente e TIRAR dinheiro da
    //   conta são atos diferentes, e quem pode um não necessariamente pode o outro. E
    //   ESTORNAR é separada de REGISTRAR pela mesma razão do ESTORNAR_VINCULO: desfazer
    //   um fato de caixa é poder próprio) = 156.
    // + 4 (ENT03a/M09 — a conciliação discreta. ABRIR e ENCERRAR são SEPARADAS: encerrar
    //   é o ato que o controle interno lê como "isto foi conferido", e quem opera a
    //   conciliação no dia a dia não é necessariamente quem assina o fechamento. É a
    //   mesma segregação do TR 6.4 que separa preparar e autorizar a ordem) = 160.
    // + 25 (ENT03b). ⚠️ AQUI OS SERVIÇOS E AS AÇÕES BATEM UM A UM, e isso é decisão: não há
    //   um par compartilhando crachá em nenhum dos cinco cadastros. Os dois casos em que a
    //   tentação de compartilhar era grande viraram SEPARAÇÃO deliberada, por segregação de
    //   função (TR 6.4 · CF art. 74):
    //     · LIBERAR_PARCELA_DE_CONVENIO × APROVAR_PRESTACAO_DE_CONTAS — quem transfere não dá
    //       quitação de si mesmo;
    //     · REGISTRAR_MEDICAO_DE_OBRA × APROVAR_MEDICAO_DE_OBRA — quem mede não atesta o
    //       próprio serviço, e a aprovação é o que libera a liquidação;
    //     · REGISTRAR_PROVIDENCIA × APRECIAR_PROVIDENCIA — o auditado relata, o auditor
    //       aceita; um crachá só faria o auditado declarar sanada a própria irregularidade.
    //   Os três guards de verdade estão no código, e não só no censo — ver
    //   `aprovarMedicao` e `apreciarProvidencia`, que recusam o MESMO usuário nas duas pontas.
    //   = 185.
    // + 16 (ENT05 — o eixo FÍSICO do almoxarifado): AÇÃO PRÓPRIA PARA CADA UM dos 16
    //   serviços, nenhuma compartilhada. É deliberado, e o caso que o mostra é o do
    //   inventário: quem CONTA a prateleira não é quem FECHA o inventário, porque o
    //   fechamento apura a divergência e manda lançar ajuste contábil sobre ela. Uma
    //   ação única "GESTAO_DE_ESTOQUE" daria, a quem só devia contar caixas, o poder de
    //   mexer no razão.
    //   = 201.
    // + 13 (ENT05 — o eixo de GESTÃO do bem): ação PRÓPRIA para cada serviço. Nenhuma é
    //   compartilhada com as do estoque, e isso é deliberado: `ABRIR_INVENTARIO_DE_BENS`
    //   e `ABRIR_INVENTARIO_DE_ESTOQUE` parecem a mesma coisa e não são — um percorre
    //   prateleira de almoxarifado, o outro exige comissão designada por portaria.
    //   = 214.
    // + 1 (REPONTAR_CONTA) = 215.
    // + 8 (ENT05 — A COMPRA): ação própria para cada serviço = 223.
    // + 3 (ENT06 item 1 — os perfis: criar, conceder ação e revogar ação) = 226.
    // + 2 (ENT07 — o acervo: CADASTRAR_CLASSE_DE_BENS e CADASTRAR_BEM, ação própria para
    //   cada serviço, pela segregação explicada acima) = 228.
    // + 1 (ENT11 — PARAMETRIZAR_ROTEIRO_PATRIMONIAL): UMA ação para os DOIS roteiros do
    //   eixo financeiro (`RoteiroPatrimonial` e `RoteiroResultadoAlienacao`). São dois
    //   serviços e dois modelos — as chaves vêm de enums diferentes —, mas o ato é o mesmo:
    //   dizer em que par de contas do PCASP um evento patrimonial bate. Duas ações
    //   inventariam segregação que o TR não pede. É o par de `encerrarExercicio` /
    //   `encerrarExercicioComRestos`, que já compartilham crachá pela mesma razão.
    //   = 229.
    // 229 de mutação (uma por serviço, com as duas fusões abaixo) + 18 de LEITURA
    // (`ACOES_DE_LEITURA`, uma por área de navegação — orquestração V3, 4.1).
    expect(TODAS_AS_ACOES.length).toBe(302 + 27 + 7 + 6 + 1 + 5 + 1 + 3 + 1 + 1 + 3 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 2 + 1 + 2 + 1 + 2 + 1 + 1 + 4 + 1 + 2); // +2 (V36) CADASTRAR_EMENDA_AO_ORCAMENTO e SANCIONAR_EMENDA_AO_ORCAMENTO — o TERMO NOVO e o ULTIMO da soma. +1 (V36) CADASTRAR_CONTA_BANCARIA — o termo anterior. +4 (V27) CADASTRAR_FROTA, REGISTRAR_ABASTECIMENTO, CADASTRAR_FARMACIA e INFORMAR_ESTOQUE_DA_FARMACIA — o TERMO NOVO e o ULTIMO da soma. +1 (V23) IMPORTAR_PLANO_DO_TRIBUNAL — o termo anterior: qual tabela de exigencias do Tribunal vale para o exercicio e decisao com fundamento, de quem responde pela prestacao de contas. // +1 (V22) CADASTRAR_LOA — o projeto e a lei da LOA, o TERMO NOVO e o ULTIMO da soma. // +2 (V22) SOLICITAR_EMPENHO e AUTORIZAR_SOLICITACAO_DE_EMPENHO — o TERMO NOVO e o ULTIMO da soma. Duas acoes e nao uma: quem pede a despesa nao e quem consente com ela, e a regra "quem solicita nao decide a propria solicitacao" e do caso de uso mesmo quando o ente da as duas a mesma pessoa. // +1 (V20) PARAMETRIZAR_VIRADA_DOS_CONTROLES — o TERMO NOVO e o ULTIMO da soma. Acao PROPRIA, e nao um ramo de ENCERRAR_CONTROLES_ORCAMENTARIOS, que ja existia: dizer que a dotacao CADUCA (art. 167, II da CF) e ato normativo do ente e enterrar o orcamento e ato de execucao, feito uma vez por ano. Fundir daria a quem executa o poder de reescrever a regua pela qual o proprio encerramento dele e medido. // +2 (V19/C05) PARAMETRIZAR_RATEIO_DE_CUSTO e APROPRIAR_CUSTO — os TERMOS NOVOS e os DOIS ULTIMOS da soma. Sao DUAS acoes e nao uma porque publicar a regua do rateio e ato NORMATIVO do ente (a portaria que diz que 60 % do aluguel e da Educacao) e apropriar e ato de EXECUCAO, mensal; fundir daria a quem lanca o poder de reescrever a regua pela qual ele proprio e medido — a mesma segregacao que separa PARAMETRIZAR_ROTEIRO_ORCAMENTARIO de EMPENHAR. // +1 (V18/C13) ALTERAR_PLANEJAMENTO — o TERMO NOVO e o ULTIMO da soma, e ela cobre DOIS servicos e AS DUAS pecas. Acao PROPRIA, e nao um ramo de CADASTRAR_PPA/CADASTRAR_LDO: digitar a peca que o Executivo monta e trabalho do setor de planejamento, e registrar a lei que altera a peca APROVADA pressupoe ato publicado — a mesma distincao que separa criarFicha de CRIAR_DECRETO_DE_CREDITO. ⚠️ E o erro nesta concessao nao tem detector adiante: o comparativo fecha, o total da peca fecha e o Anexo de Metas Fiscais fecha, porque o vigente e DERIVADO e soma o que houver — o que sobra e meta fiscal alterada sem lei, confrontada pelo RREO Anexo 6. Medido (npx tsx sobre acoes.ts): acoes distintas em 180ccd8 = 363, depois = 364, delta = exatamente esta; zero removidas. // +1 (V16 · TR 5.10.2.6) GERIR_ROL_DE_FONTES_DA_CONTA — UMA acao para DOIS servicos, e ela NAO acompanha DECLARAR_TITULAR_DA_CONTA_BANCARIA: o titular diz de quem e a conta, o rol diz que recurso ela abriga (controle de destinacao). +1 (V16/C30) DISTRIBUIR_RECEITA_FORA_DA_PREVISAO — o TERMO NOVO e o ULTIMO da soma. ⚠️ ELA CONTA AQUI E **NAO** NO `nomes.length`: e a segunda cobranca dentro de `registrarArrecadacao`, nao um servico, entao entra por `ACOES_SEM_SERVICO_PROPRIO` — o mesmo caminho de SELECIONAR_VINCULOS_DA_FOLHA, e pela mesma razao (por uma chave em `ACAO_DO_SERVICO` criaria no censo de servicos um nome que nenhuma funcao exporta). ⚠️ E ELA TEM DE ENTRAR AQUI, nao e opcional: `ACOES_DO_ENTE` (o que o bootstrap concede) e derivado de `TODAS_AS_ACOES`, entao uma acao fora desta uniao fica INALCANCAVEL — nem o admin da instalacao a recebe, e o sintoma seria ACESSO NEGADO para o usuario mais poderoso do ente. Medido: a instalacao limpa deixou de derivar 1 na v32 quando ela entrou aqui. +1 (V15/C38) PARAMETRIZAR_ROTEIRO_RESTOS_A_PAGAR — acao PROPRIA, e nao PARAMETRIZAR_ROTEIRO_ORCAMENTARIO: aquela decide as classes 5 e 6 do exercicio corrente, esta decide contra que PASSIVO uma obrigacao de exercicio ENCERRADO se baixa. +1 (V13) CONFIGURAR_PARAMETRO_DO_ADIANTAMENTO_SALARIAL — o TERMO NOVO e o ULTIMO da soma (os anteriores nao se mexeram). Acao PROPRIA, e nem mesmo um ramo de CONFIGURAR_PARAMETRO_DO_DECIMO_TERCEIRO: o criterio do avo e ANUAL e sai do estatuto do servidor; o percentual do vale e MENSAL e sai, na maioria dos entes, de decreto do prefeito — dois atos administrativos de origens e periodicidades diferentes. E o erro nesta concessao nao tem detector adiante: a folha de vale fecha, o empenho fecha, a mensal abate exatamente aquele valor e o total bate dos dois lados; quem percebe e o servidor, no contracheque. Medido: acoes distintas ANTES desta rodada = 359, DEPOIS = 360, delta = exatamente esta; zero removidas — o numero foi conferido contra o observado, nao ajustado para ele. ⚠️ ESTE CONTA ACOES, e o `nomes.length` acima conta SERVICOS — um servico novo nao implica uma acao nova, nem o contrario; +1 (V11 V9.5) SELECIONAR_VINCULOS_DA_FOLHA — o TERMO NOVO e o ULTIMO da soma (os anteriores nao se mexeram). ⚠️ ELA CONTA AQUI MESMO SEM SERVICO PROPRIO, e essa foi a confusao que deixou este numero vermelho: `TODAS_AS_ACOES` e a uniao de `ACAO_DO_SERVICO` MAIS `ACOES_DE_LEITURA` MAIS `ACOES_SEM_SERVICO_PROPRIO`, entao por em `ACOES_SEM_SERVICO_PROPRIO` (a decisao certa — ela e uma segunda cobranca dentro de `calcularFolha`, so no modo EXPLICITA, nao um servico) tira do censo de SERVICOS e NAO tira do de ACOES. Medido: acoes distintas em `8bdf23a` = 359, em HEAD = 360, delta = exatamente esta; zero removidas. +1 (V11 V9.1) CONFIGURAR_PARAMETRO_DO_DECIMO_TERCEIRO: acao PROPRIA, deliberada, que nao acompanha CONFIGURAR_TABELAS_DA_FOLHA — quem transcreve a portaria federal do IRRF nao decide, por isso, o criterio do avo do municipio, e um erro nessa concessao nao tem detector adiante (a folha de 13o fecha, o total bate, e a diferenca so aparece no contracheque de quem foi admitido perto da borda do mes); +3 V11 V9 CADASTRAR_ENTIDADE_CONTABIL, DECLARAR_TITULAR_DA_CONTA_BANCARIA e ATRIBUIR_ENTIDADE_A_ARRECADACAO (tres ACOES para QUATRO servicos: `publicarVersaoDaEntidadeContabil` fica sob CADASTRAR_ENTIDADE_CONTABIL porque e a mesma autoridade — dizer quem a entidade e —, como vincular/desvincular pessoa ao usuario; e ATRIBUIR_ENTIDADE_A_ARRECADACAO NAO se juntou a ATRIBUIR_CONTA_A_ARRECADACAO, apesar da mesma tela e do mesmo operador, porque dizer EM QUE CONTA o dinheiro entrou erra contra um detector — a conciliacao nao fecha — e dizer DE QUEM ele e erra contra nada: vira caixa da autarquia virando caixa da prefeitura numa consulta que ninguem confere contra extrato; as tres LEITURAS estao em FORA_DO_CENSO); +1 V11 V8.4 PARAMETRIZAR_ROTEIRO_ORCAMENTARIO (acao PROPRIA, e nao PARAMETRIZAR_ROTEIRO_PATRIMONIAL: sao dois subsistemas, e quem responde pelo orcamentario nao e necessariamente quem responde pelo patrimonial); +1 V11 V8.3 GERIR_TIPOS_DE_CONSIGNACAO (acao de PARAMETRIZACAO CONTABIL, e nao de execucao: quem escolhe em que conta do PCASP a retencao vira divida e a contabilidade do ente, nao quem paga — junta-la a PAGAR daria a quem executa o poder de reclassificar o passivo do municipio); +3 V11 V8 CONFIGURAR_AGENDA_DO_GUICHE, RESERVAR_ATENDIMENTO_NO_GUICHE e REGISTRAR_ATENDIMENTO_NO_GUICHE (tres, e nao dez: o corte e por QUEM FAZ — a chefia organiza, o balcao marca e remarca, o guiche confirma e registra que atendeu; e nenhuma de LEITURA, porque a area ja tem CONSULTAR_PROTOCOLO); +1 V11 V7.3 DECLARAR_DISPONIBILIDADE_DE_RECURSO_NOVO (acao PROPRIA, e nao CRIAR_DECRETO_DE_CREDITO: quem apura o superavit do balanco e a contabilidade, quem escreve o decreto e o planejamento, e este numero e o que AUTORIZA a despesa — juntar as duas daria a quem escreve o decreto o poder de declarar o proprio lastro); +5 V11 V5.3 PROTOCOLAR_, DISTRIBUIR_, PRORROGAR_, RESPONDER_ e DECIDIR_RECURSO_DE_ACESSO_A_INFORMACAO (cinco, e nao uma "GERIR PEDIDO DE ACESSO": cada uma tem responsavel diferente no ente, e juntar daria a qualquer delas o poder de todas — prorrogar estica a data prometida a quem tem direito subjetivo, e quem responde nao pode ser quem julga o recurso do proprio ato); +1 V11 V5.1 PUBLICAR_CONFIGURACAO_DO_ACESSO_A_INFORMACAO (acao PROPRIA, e nao GERIR_PARAMETROS_TRIBUTARIOS nem CRIAR_ASSUNTO: o prazo do acesso a informacao nao e parametro tributario, e o prazo de etapa do assunto e interno ao fluxo, enquanto este e promessa de data a quem tem direito subjetivo); +3 V11 V4.2 CADASTRAR_POLITICA_DE_PESSOAL, APROVAR_POLITICA_DE_PESSOAL e REVOGAR_POLITICA_DE_PESSOAL; +3 V11 V1.1 CADASTRAR_VERSAO_DE_RUBRICA, APROVAR_VERSAO_DE_RUBRICA e REVOGAR_VERSAO_DE_RUBRICA (quem escreve a formula nao e quem responde por ela valer na folha); +1 V10 T3 DEFINIR_DIVULGACAO_DA_LOCALIZACAO (acao propria: quem cadastra o deposito nao e quem decide o que vai ao portal); +6 V10 T2 as acoes do lancamento tributario e da certidao (preparar, constituir, retificar, cancelar, solicitar, decidir) — a CONFIGURACAO da certidao compartilha GERIR_PARAMETROS_TRIBUTARIOS, porque validade e fundamento sao parametro normativo do ente como a alíquota; +7 V10 T1 as acoes RESERVADAS do fornecedor (6 de mutacao + a leitura CONSULTAR_LICENCIAMENTO): o municipio nao concede a si proprio a habilitacao comercial, e `ACOES_DO_ENTE` = este censo MENOS elas; +1 V9 N4 ESTORNAR_RECEBIMENTO_DEFINITIVO (acao propria: receber e ordinario, desfazer e excepcional); +2 V7 B1 GERIR_CADASTRO_IMOBILIARIO e GERIR_PARAMETROS_TRIBUTARIOS; +1 V7 M2 U8 GERIR_TIPOS_DE_OCORRENCIA; +1 V7 M2 U6 GERIR_PLANILHA_DA_OBRA; +3 V7 M2 U1/U2 EMITIR_ORDEM_DE_SERVICO_DO_CONTRATO, REGISTRAR_RECEBIMENTO_PROVISORIO, REGISTRAR_RECEBIMENTO_DEFINITIVO; +1 V7 M2 U0.2 CONFIGURAR_EXECUCAO_DO_CONTRATO; +1 V7 M2 U0.1 DEFINIR_ADMINISTRADOR_DA_FISCALIZACAO; +5 V7 M2.1 contrato acompanhado; +2 V7 M1 U4 TRIAR_MANIFESTACAO_DE_OUVIDORIA e MODERAR_AVALIACAO_DE_SERVICO; +1 V7 M1 GERIR_GUIA_DE_RECOLHIMENTO; // +4 V6.2 P3 (configurar a carta, solicitar, decidir, registrar representacao) e a leitura CONSULTAR_MEUS_SERVICOS; +4 V6.2 encargos (cadastrar, aprovar, apurar, certificar os encargos); 271 de mutação (+15 V6 P2 pessoal, +7 V6 P2.3 folha, +2 V6 P2.3b apropriação, +3 V6.1 atesto/liquidação da folha) + 21 de leitura (+CONSULTAR_PESSOAL, +CONSULTAR_FOLHA, +CONSULTAR_PORTAL_DO_SERVIDOR) // +1 (V21) DECLARAR_DADOS_DA_UNIDADE_ORCAMENTARIA — o TERMO NOVO e o ULTIMO da soma: cadastro do ente, e nao ato de execucao. // +2 (V21) REGISTRAR_REALOCACAO_DE_DOTACAO e ANULAR_REALOCACAO_DE_DOTACAO — os TERMOS NOVOS e os DOIS ULTIMOS da soma. Acoes PROPRIAS, e nao EXECUTAR_CREDITO/ANULAR_CREDITO: a realocacao por lei especifica (CF art. 167, VI) nao traz recurso novo nem consome o limite da LOA, e quem abre credito nao passa, por isso, a mover dotacao entre orgaos. // +1 (V20) PARAMETRIZAR_VIRADA_DOS_CONTROLES — o TERMO NOVO e o ULTIMO da soma. Acao PROPRIA, e nao um ramo de ENCERRAR_CONTROLES_ORCAMENTARIOS, que ja existia: dizer que a dotacao CADUCA (art. 167, II da CF) e ato normativo do ente e enterrar o orcamento e ato de execucao, feito uma vez por ano. Fundir daria a quem executa o poder de reescrever a regua pela qual o proprio encerramento dele e medido. // +2 (V19/C05) PARAMETRIZAR_RATEIO_DE_CUSTO e APROPRIAR_CUSTO — os TERMOS NOVOS e os DOIS ULTIMOS da soma. Sao DUAS acoes e nao uma porque publicar a regua do rateio e ato NORMATIVO do ente (a portaria que diz que 60 % do aluguel e da Educacao) e apropriar e ato de EXECUCAO, mensal; fundir daria a quem lanca o poder de reescrever a regua pela qual ele proprio e medido — a mesma segregacao que separa PARAMETRIZAR_ROTEIRO_ORCAMENTARIO de EMPENHAR. // +1 (V18/C13) ALTERAR_PLANEJAMENTO — o TERMO NOVO e o ULTIMO da soma, e ela cobre DOIS servicos e AS DUAS pecas. Acao PROPRIA, e nao um ramo de CADASTRAR_PPA/CADASTRAR_LDO: digitar a peca que o Executivo monta e trabalho do setor de planejamento, e registrar a lei que altera a peca APROVADA pressupoe ato publicado — a mesma distincao que separa criarFicha de CRIAR_DECRETO_DE_CREDITO. ⚠️ E o erro nesta concessao nao tem detector adiante: o comparativo fecha, o total da peca fecha e o Anexo de Metas Fiscais fecha, porque o vigente e DERIVADO e soma o que houver — o que sobra e meta fiscal alterada sem lei, confrontada pelo RREO Anexo 6. Medido (npx tsx sobre acoes.ts): acoes distintas em 180ccd8 = 363, depois = 364, delta = exatamente esta; zero removidas. // +1 (V16 · TR 5.10.2.6) GERIR_ROL_DE_FONTES_DA_CONTA — UMA acao para DOIS servicos, e ela NAO acompanha DECLARAR_TITULAR_DA_CONTA_BANCARIA: o titular diz de quem e a conta, o rol diz que recurso ela abriga (controle de destinacao). +1 (V16/C30) DISTRIBUIR_RECEITA_FORA_DA_PREVISAO — o TERMO NOVO e o ULTIMO da soma. ⚠️ ELA CONTA AQUI E **NAO** NO `nomes.length`: e a segunda cobranca dentro de `registrarArrecadacao`, nao um servico, entao entra por `ACOES_SEM_SERVICO_PROPRIO` — o mesmo caminho de SELECIONAR_VINCULOS_DA_FOLHA, e pela mesma razao (por uma chave em `ACAO_DO_SERVICO` criaria no censo de servicos um nome que nenhuma funcao exporta). ⚠️ E ELA TEM DE ENTRAR AQUI, nao e opcional: `ACOES_DO_ENTE` (o que o bootstrap concede) e derivado de `TODAS_AS_ACOES`, entao uma acao fora desta uniao fica INALCANCAVEL — nem o admin da instalacao a recebe, e o sintoma seria ACESSO NEGADO para o usuario mais poderoso do ente. Medido: a instalacao limpa deixou de derivar 1 na v32 quando ela entrou aqui. +1 (V15/C38) PARAMETRIZAR_ROTEIRO_RESTOS_A_PAGAR — acao PROPRIA, e nao PARAMETRIZAR_ROTEIRO_ORCAMENTARIO: aquela decide as classes 5 e 6 do exercicio corrente, esta decide contra que PASSIVO uma obrigacao de exercicio ENCERRADO se baixa. +1 (V13) CONFIGURAR_PARAMETRO_DO_ADIANTAMENTO_SALARIAL — o TERMO NOVO e o ULTIMO da soma (os anteriores nao se mexeram). Acao PROPRIA, e nem mesmo um ramo de CONFIGURAR_PARAMETRO_DO_DECIMO_TERCEIRO: o criterio do avo e ANUAL e sai do estatuto do servidor; o percentual do vale e MENSAL e sai, na maioria dos entes, de decreto do prefeito — dois atos administrativos de origens e periodicidades diferentes. E o erro nesta concessao nao tem detector adiante: a folha de vale fecha, o empenho fecha, a mensal abate exatamente aquele valor e o total bate dos dois lados; quem percebe e o servidor, no contracheque. Medido: acoes distintas ANTES desta rodada = 359, DEPOIS = 360, delta = exatamente esta; zero removidas — o numero foi conferido contra o observado, nao ajustado para ele. ⚠️ ESTE CONTA ACOES, e o `nomes.length` acima conta SERVICOS — um servico novo nao implica uma acao nova, nem o contrario; +1 (V11 V9.5) SELECIONAR_VINCULOS_DA_FOLHA — o TERMO NOVO e o ULTIMO da soma (os anteriores nao se mexeram). ⚠️ ELA CONTA AQUI MESMO SEM SERVICO PROPRIO, e essa foi a confusao que deixou este numero vermelho: `TODAS_AS_ACOES` e a uniao de `ACAO_DO_SERVICO` MAIS `ACOES_DE_LEITURA` MAIS `ACOES_SEM_SERVICO_PROPRIO`, entao por em `ACOES_SEM_SERVICO_PROPRIO` (a decisao certa — ela e uma segunda cobranca dentro de `calcularFolha`, so no modo EXPLICITA, nao um servico) tira do censo de SERVICOS e NAO tira do de ACOES. Medido: acoes distintas em `8bdf23a` = 359, em HEAD = 360, delta = exatamente esta; zero removidas. +1 (V11 V9.1) CONFIGURAR_PARAMETRO_DO_DECIMO_TERCEIRO: acao PROPRIA, deliberada, que nao acompanha CONFIGURAR_TABELAS_DA_FOLHA — quem transcreve a portaria federal do IRRF nao decide, por isso, o criterio do avo do municipio, e um erro nessa concessao nao tem detector adiante (a folha de 13o fecha, o total bate, e a diferenca so aparece no contracheque de quem foi admitido perto da borda do mes); +3 V11 V9 CADASTRAR_ENTIDADE_CONTABIL, DECLARAR_TITULAR_DA_CONTA_BANCARIA e ATRIBUIR_ENTIDADE_A_ARRECADACAO (tres ACOES para QUATRO servicos: `publicarVersaoDaEntidadeContabil` fica sob CADASTRAR_ENTIDADE_CONTABIL porque e a mesma autoridade — dizer quem a entidade e —, como vincular/desvincular pessoa ao usuario; e ATRIBUIR_ENTIDADE_A_ARRECADACAO NAO se juntou a ATRIBUIR_CONTA_A_ARRECADACAO, apesar da mesma tela e do mesmo operador, porque dizer EM QUE CONTA o dinheiro entrou erra contra um detector — a conciliacao nao fecha — e dizer DE QUEM ele e erra contra nada: vira caixa da autarquia virando caixa da prefeitura numa consulta que ninguem confere contra extrato; as tres LEITURAS estao em FORA_DO_CENSO); +1 V11 V8.4 PARAMETRIZAR_ROTEIRO_ORCAMENTARIO (acao PROPRIA, e nao PARAMETRIZAR_ROTEIRO_PATRIMONIAL: sao dois subsistemas, e quem responde pelo orcamentario nao e necessariamente quem responde pelo patrimonial); +1 V11 V8.3 GERIR_TIPOS_DE_CONSIGNACAO (acao de PARAMETRIZACAO CONTABIL, e nao de execucao: quem escolhe em que conta do PCASP a retencao vira divida e a contabilidade do ente, nao quem paga — junta-la a PAGAR daria a quem executa o poder de reclassificar o passivo do municipio); +3 V11 V8 CONFIGURAR_AGENDA_DO_GUICHE, RESERVAR_ATENDIMENTO_NO_GUICHE e REGISTRAR_ATENDIMENTO_NO_GUICHE (tres, e nao dez: o corte e por QUEM FAZ — a chefia organiza, o balcao marca e remarca, o guiche confirma e registra que atendeu; e nenhuma de LEITURA, porque a area ja tem CONSULTAR_PROTOCOLO); +1 V11 V7.3 DECLARAR_DISPONIBILIDADE_DE_RECURSO_NOVO (acao PROPRIA, e nao CRIAR_DECRETO_DE_CREDITO: quem apura o superavit do balanco e a contabilidade, quem escreve o decreto e o planejamento, e este numero e o que AUTORIZA a despesa — juntar as duas daria a quem escreve o decreto o poder de declarar o proprio lastro); +5 V11 V5.3 PROTOCOLAR_, DISTRIBUIR_, PRORROGAR_, RESPONDER_ e DECIDIR_RECURSO_DE_ACESSO_A_INFORMACAO (cinco, e nao uma "GERIR PEDIDO DE ACESSO": cada uma tem responsavel diferente no ente, e juntar daria a qualquer delas o poder de todas — prorrogar estica a data prometida a quem tem direito subjetivo, e quem responde nao pode ser quem julga o recurso do proprio ato); +1 V11 V5.1 PUBLICAR_CONFIGURACAO_DO_ACESSO_A_INFORMACAO (acao PROPRIA, e nao GERIR_PARAMETROS_TRIBUTARIOS nem CRIAR_ASSUNTO: o prazo do acesso a informacao nao e parametro tributario, e o prazo de etapa do assunto e interno ao fluxo, enquanto este e promessa de data a quem tem direito subjetivo); +3 V11 V4.2 CADASTRAR_POLITICA_DE_PESSOAL, APROVAR_POLITICA_DE_PESSOAL e REVOGAR_POLITICA_DE_PESSOAL; +3 V11 V1.1 CADASTRAR_VERSAO_DE_RUBRICA, APROVAR_VERSAO_DE_RUBRICA e REVOGAR_VERSAO_DE_RUBRICA (quem escreve a formula nao e quem responde por ela valer na folha); +1 V10 T3 DEFINIR_DIVULGACAO_DA_LOCALIZACAO (acao propria: quem cadastra o deposito nao e quem decide o que vai ao portal); +6 V10 T2 as acoes do lancamento tributario e da certidao (preparar, constituir, retificar, cancelar, solicitar, decidir) — a CONFIGURACAO da certidao compartilha GERIR_PARAMETROS_TRIBUTARIOS, porque validade e fundamento sao parametro normativo do ente como a alíquota; +7 V10 T1 as acoes RESERVADAS do fornecedor (6 de mutacao + a leitura CONSULTAR_LICENCIAMENTO): o municipio nao concede a si proprio a habilitacao comercial, e `ACOES_DO_ENTE` = este censo MENOS elas; +1 V9 N4 ESTORNAR_RECEBIMENTO_DEFINITIVO (acao propria: receber e ordinario, desfazer e excepcional); +2 V7 B1 GERIR_CADASTRO_IMOBILIARIO e GERIR_PARAMETROS_TRIBUTARIOS; +1 V7 M2 U8 GERIR_TIPOS_DE_OCORRENCIA; +1 V7 M2 U6 GERIR_PLANILHA_DA_OBRA; +3 V7 M2 U1/U2 EMITIR_ORDEM_DE_SERVICO_DO_CONTRATO, REGISTRAR_RECEBIMENTO_PROVISORIO, REGISTRAR_RECEBIMENTO_DEFINITIVO; +1 V7 M2 U0.2 CONFIGURAR_EXECUCAO_DO_CONTRATO; +1 V7 M2 U0.1 DEFINIR_ADMINISTRADOR_DA_FISCALIZACAO; +5 V7 M2.1 contrato acompanhado; +2 V7 M1 U4 TRIAR_MANIFESTACAO_DE_OUVIDORIA e MODERAR_AVALIACAO_DE_SERVICO; +1 V7 M1 GERIR_GUIA_DE_RECOLHIMENTO; // +4 V6.2 P3 (configurar a carta, solicitar, decidir, registrar representacao) e a leitura CONSULTAR_MEUS_SERVICOS; +4 V6.2 encargos (cadastrar, aprovar, apurar, certificar os encargos); 271 de mutação (+15 V6 P2 pessoal, +7 V6 P2.3 folha, +2 V6 P2.3b apropriação, +3 V6.1 atesto/liquidação da folha) + 21 de leitura (+CONSULTAR_PESSOAL, +CONSULTAR_FOLHA, +CONSULTAR_PORTAL_DO_SERVIDOR)
    expect(ACAO_DO_SERVICO.encerrarExercicio).toBe("ENCERRAR_EXERCICIO");
    expect(ACAO_DO_SERVICO.encerrarExercicioComRestos).toBe("ENCERRAR_EXERCICIO");
    expect(ACAO_DO_SERVICO.importarExtrato).toBe("IMPORTAR_EXTRATO");
    expect(ACAO_DO_SERVICO.importarExtratoBb).toBe("IMPORTAR_EXTRATO");
    expect(ACAO_DO_SERVICO.registrarDocumentoFiscal).toBe("REGISTRAR_DOCUMENTO_FISCAL");
    expect(ACAO_DO_SERVICO.importarDocumentoFiscalDeXml).toBe("REGISTRAR_DOCUMENTO_FISCAL");

    // ⚠️ O LANÇAMENTO MANUAL (TR 5.95) TEM AÇÃO PRÓPRIA — é a chave-mestra do razão
    // (partidas arbitrárias, sem fato de origem), e o ente tem de poder concedê-la a UMA
    // pessoa sem conceder o resto.
    expect(ACAO_DO_SERVICO.registrarLancamento).toBe("REGISTRAR_LANCAMENTO_MANUAL");

    // sem duplicata na união (um nome, uma ação)
    expect(new Set(nomes).size).toBe(nomes.length);
  });
});
