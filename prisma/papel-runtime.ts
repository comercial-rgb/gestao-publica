import type { Client } from "pg";

/**
 * O PAPEL DE RUNTIME — a conta com que a APLICAÇÃO fala com o banco.
 *
 * ═══ ⚠️ O QUE ESTE ARQUIVO CONSERTA, E ELE FOI MEDIDO, NÃO SUPOSTO ═══
 * O ENT00 provou contra `gestao_publica_test`, por SQL cru, que o append-only do razão
 * existia SÓ NO DOMÍNIO:
 *
 *     UPDATE "LancamentoContabil" SET "historico" = 'DEPOIS-MUTADO' ...  -> UPDATE 1
 *     DELETE FROM "LancamentoContabil" ...                              -> DELETE 1
 *
 * A causa também foi medida: `usesuper = t`, `tableowner = gestao`, `relrowsecurity = f`,
 * e ZERO ocorrências de GRANT/REVOKE/CREATE ROLE/ROW LEVEL SECURITY nas 63 migrations.
 * A aplicação conectava como SUPERUSUÁRIO DONO DAS TABELAS.
 *
 * O domínio protege quem passa por ele. Não protege de um script, de um console de banco,
 * nem de uma rota que um dia esqueça de chamar o funil. Um razão append-only cujo
 * append-only depende de todo mundo lembrar não é append-only: é uma convenção.
 *
 * ═══ ⚠️ POR QUE O PAPEL VEM ANTES DOS TESTES DE ISOLAMENTO, E NÃO DEPOIS ═══
 * Superusuário atravessa POLÍTICA DE LINHA e IGNORA grant. Um teste de isolamento rodado
 * com o papel de hoje PASSA — e passa provando nada. Testar isolamento com o papel errado
 * é o falso-verde da segurança: ele não avisa que não conferiu.
 *
 * ═══ A SUPERFÍCIE MUTÁVEL — CENSO, NÃO ESTIMATIVA ═══
 * Varredura de `update|updateMany|delete|deleteMany` em `modules/`, `adapters/`, `lib/`,
 * `packages/` e `app/`, fora de teste, seed e client gerado. O código de produção inteiro
 * dá UPDATE ou DELETE em TRÊS tabelas, em quatro sítios:
 *
 *   · `Usuario.ativo`                  — ativar/desativar (m16-travamento/servico-usuarios)
 *   · `FichaOrcamentaria` (4 saldos)   — o cache recalculado por SUM (m05/adapter-prisma)
 *   · `VinculoUsuarioPerfil` (DELETE)  — revogar perfil de usuário (m16)
 *
 * Todo o resto — o razão, o empenho, a liquidação, o pagamento, o movimento de dotação, a
 * auditoria, a sessão — só INSERE. Isso não é um acidente feliz: é o desenho append-only
 * do repositório, e é o que torna o grant abaixo possível sem quebrar nada.
 *
 * ⚠️ E O GRANT É POR COLUNA onde dá. `GRANT UPDATE ON "Usuario"` deixaria o runtime
 * reescrever `identificador` — a identidade que aparece no `criadoPor` de todo fato do
 * razão. Trocá-la reescreveria a autoria de tudo o que aquele usuário já fez, sem tocar
 * numa linha do razão. `GRANT UPDATE ("ativo")` fecha isso no banco.
 */

/**
 * O CENSO, EXAUSTIVO E TIPADO. Uma tabela que precise de UPDATE/DELETE tem de ENTRAR
 * aqui — e entrar aqui é uma decisão que alguém assina, não um efeito colateral de um
 * `prisma.x.update()` novo. `test/papel-runtime.test.ts` confronta esta lista com os
 * grants REAIS do banco nas duas direções: sobra aqui é grant esquecido, falta aqui é
 * privilégio que ninguém declarou.
 */
export const ESCRITA_MUTAVEL_DO_RUNTIME: Readonly<
  Record<string, { readonly update: readonly string[]; readonly delete: boolean }>
> = {
  Usuario: { update: ["ativo"], delete: false },
  FichaOrcamentaria: {
    update: [
      "saldoAutorizado",
      "saldoReservado",
      "saldoEmpenhado",
      "saldoDisponivel",
    ],
    delete: false,
  },
  VinculoUsuarioPerfil: { update: [], delete: true },

  // ⚠️ M09 V16 (TR 5.10.2.6) — O ROL DE FONTES DA CONTA É DECISÃO VIGENTE, e a ausência da linha
  // É a remoção. Mesma doutrina do vínculo acima e da `PermissaoDePerfil`: não há coluna de
  // revogação a marcar, e uma fonte "removida" que continuasse na tabela é a que alguém lê como
  // permitida. O rol não escritura nada — remover uma fonte NÃO invalida os movimentos que ela já
  // teve, que são fatos e continuam com a fonte que declararam.
  //
  // ⚠️ E ELE ENTROU AQUI PORQUE A TELA NASCEU. Até a V16 o único escritor desta tabela era o
  // BACKFILL da migration da ADR — que roda como DONO. A tela do rol é a primeira coisa que apaga
  // esta linha pelo runtime, e sem esta entrada ela falharia com "permission denied" no município,
  // com a suíte verde na máquina de quem escreveu: o teste roda como dono.
  FonteDaContaBancaria: { update: [], delete: true },

  // ⚠️ V11 V1.1 — A VERSÃO DA RUBRICA MUDA DE SITUAÇÃO, E SÓ ISSO.
  // Aprovar, revogar e fechar a vigência são atos; o CONTEÚDO da versão é congelado. Se o
  // runtime pudesse atualizar `formula`, `percentual`, `incideIrrf` ou `fundamentacaoLegal`,
  // versionar não serviria para nada: a folha de março passaria a ser explicada por uma fórmula
  // escrita em setembro, e a memória congelada do contracheque discordaria do cadastro sem que
  // nada registrasse a troca. Versão errada se REVOGA e se substitui por outra — não se edita.
  //
  // `competenciaFim` entra porque aprovar a versão n+1 fecha a vigência da n. É o único caminho
  // pela tela para suceder uma versão sem apagar a anterior.
  VersaoDaRubrica: {
    update: ["situacao", "aprovadoEm", "aprovadoPor", "revogadoEm", "revogadoPor", "motivoDaRevogacao", "competenciaFim"],
    delete: false,
  },

  // ⚠️ V11 V4.2 — A POLÍTICA DE PUBLICAÇÃO DE PESSOAL MUDA DE SITUAÇÃO, E SÓ ISSO.
  // `fundamentacaoLegal` e `competenciaInicio` ficam FORA do grant, e as COLUNAS declaradas
  // também (a tabela `ColunaPublicadaDePessoal` não aparece aqui: sem UPDATE e sem DELETE).
  // Se o runtime pudesse acrescentar uma coluna a uma política já APROVADA, a exposição de dado
  // pessoal cresceria sem ato novo e sem aprovador — exatamente o que o versionamento existe
  // para impedir. Ampliar o que se publica exige política NOVA, redigida e aprovada por outra
  // pessoa. `competenciaFim` entra porque aprovar a sucessora fecha a anterior.
  PoliticaDePublicacaoDePessoal: {
    update: ["situacao", "aprovadoEm", "aprovadoPor", "revogadoEm", "revogadoPor", "motivoDaRevogacao", "competenciaFim"],
    delete: false,
  },

  // ⚠️ V6.1 — AS DUAS CONTAS DA LIQUIDAÇÃO DO GRUPO DA FOLHA, e NADA MAIS desta tabela.
  // As colunas nasceram NULLABLE (migration aditiva, sem inventar conta para grupo já gravado), e
  // sem poder defini-las depois os grupos cadastrados antes desta entrega ficariam sem caminho
  // pela tela: a liquidação recusaria nomeando o grupo e não haveria como resolver. Criar um
  // grupo novo não serviria — uma rubrica pertence a um grupo só, e movê-la exigiria DELETE.
  //
  // ⚠️ POR COLUNA, e é aqui que está a proteção: `GRANT UPDATE ON "GrupoDeEmpenhoDaFolha"`
  // deixaria o runtime trocar `fichaId` de um grupo JÁ EMPENHADO — moveria a despesa de dotação
  // sem tocar num lançamento. `serie` reescreveria a numeração determinística; `porServidor`
  // trocaria o credor de todos os próximos empenhos. Nenhuma dessas colunas está no grant.
  //
  // As liquidações já gravadas não mudam: elas têm o seu lançamento no razão com as contas que
  // valiam no ato. Trocar aqui vale para as PRÓXIMAS.
  GrupoDeEmpenhoDaFolha: { update: ["contaVariacaoId", "contaObrigacaoId"], delete: false },
  // ⚠️ V20 — A CLASSIFICAÇÃO DA CONTA DE CONTROLE NA VIRADA É DECISÃO VIGENTE, não fato.
  //
  // `ContaNaVirada` diz se a conta das classes 5 e 6 ENCERRA (o orçamento é anual — o crédito não
  // empenhado caduca) ou TRANSFERE (o controle de restos a pagar atravessa a virada). Ela não
  // escritura nada: o que escritura é o LANÇAMENTO de encerramento, e esse é append-only e tem
  // estorno próprio. Trocar a classificação vale para a PRÓXIMA virada, exatamente como trocar as
  // contas de um grupo de empenho vale para as próximas liquidações.
  //
  // ⚠️ E ELE ENTROU AQUI PORQUE A TELA NASCEU — a mesma frase de `PermissaoDePerfil` e de
  // `FonteDaContaBancaria`, e pelo mesmo motivo medido. Até a V20 os ÚNICOS escritores desta tabela
  // eram arquivos de TESTE (medido: quatro ocorrências de `contaNaVirada.create`, todas em `.test.ts`),
  // e teste roda como DONO. Sem esta entrada a tela falharia com "permission denied" no município,
  // com a suíte verde na máquina de quem escreveu.
  //
  // ⚠️ `contaId` FICA FORA DO GRANT, e é aqui que está a proteção: `GRANT UPDATE ON "ContaNaVirada"`
  // deixaria o runtime apontar a classificação para OUTRA conta — a justificativa escrita para a
  // dotação passaria a explicar o destino do controle de restos a pagar, sem que nada registrasse a
  // troca. Reclassificar é trocar `destino` e `justificativa` da MESMA conta, e nada mais.
  ContaNaVirada: { update: ["destino", "justificativa"], delete: false },

  // V3 (4.5): a PUBLICAÇÃO de uma versão de roteiro é a única escrita depois da criação, e
  // só nestas três colunas — as contas e o motivo nunca mudam (para outro par, outra versão).
  VersaoDeRoteiro: { update: ["situacao", "publicadaEm", "publicadaPor"], delete: false },

  // ⚠️ ENT06 item 1 — REVOGAR UMA AÇÃO DE UM PERFIL APAGA A CONCESSÃO, e é a mesma doutrina
  // do vínculo acima: a concessão é o FATO, e a ausência dela é a revogação. Não há coluna
  // de revogação a marcar — marcá-la exigiria UPDATE numa linha que declara poder, e uma
  // permissão "revogada" que continua na tabela é a que alguém lê como concedida.
  //
  // ⚠️ E ELE ENTROU AQUI PORQUE O CASO DE USO NASCEU, NÃO ANTES. Até o ENT06 os únicos
  // escritores de `PermissaoDePerfil` eram o bootstrap de instalação e um teste — ambos
  // rodam como DONO, não pelo papel da aplicação. A tela de perfis é a primeira coisa que
  // apaga esta linha pelo runtime, e sem esta entrada ela falharia com "permission denied"
  // no município, com a suíte verde na máquina de quem escreveu: o teste roda como dono.
  //
  // A trava contra revogar a ÚLTIMA concessão de `CONCEDER_ACAO_A_PERFIL` NÃO mora aqui —
  // grant não sabe contar linhas. Ela é do caso de uso (`servico-perfis.ts`), e o teste
  // t9 a prova nas duas direções.
  PermissaoDePerfil: { update: [], delete: true },

  // ── ENT02 ─────────────────────────────────────────────────────────────────
  //
  // ⚠️ CINCO CADASTROS COM `ativo`, E NENHUM FATO. O protocolo e a comunicação
  // interna são append-only nos MOVIMENTOS — processo, trâmite, comunicado e
  // leitura só inserem. O que muda é CADASTRO: desativar um setor extinto, um
  // assunto que a entidade não usa mais, um tipo de comunicado. Mesma escolha do
  // `Usuario.ativo` do M16, e pelo mesmo motivo: apagar o cadastro levaria junto
  // o histórico de tudo o que tramitou por ele.
  Setor: { update: ["ativo"], delete: false },
  Assunto: { update: ["ativo"], delete: false },
  Subassunto: { update: ["ativo"], delete: false },
  TipoDeComunicado: { update: ["ativo"], delete: false },

  // ⚠️ V37 — A LOTAÇÃO NO SETOR É DECISÃO VIGENTE, e a ausência da linha É o desfazimento. Mesma doutrina do
  // `VinculoUsuarioPerfil` e da `PermissaoDePerfil` acima: não há coluna de encerramento a marcar, e uma lotação
  // "desfeita" que continuasse na tabela seria a que o escopo do protocolo lê como alcance vigente. O que o usuário
  // fez em nome do setor fica nos movimentos, que só inserem. Escritor: `desfazerLotacaoNoSetor` (M21).
  UsuarioDoSetor: { update: [], delete: true },

  // ⚠️ O RASCUNHO É O ÚNICO DOCUMENTO EDITÁVEL DO REPOSITÓRIO, e o grant é por
  // coluna justamente por isso. Um rascunho é um comunicado que ainda não foi
  // enviado (não há movimento `ENVIO`), e editá-lo antes de enviar é o que se
  // espera de um rascunho.
  //
  // O grant NÃO consegue dizer "só antes do envio" — quem diz isso é o caso de
  // uso. Então o envio grava, no movimento `ENVIO`, o SHA-256 de assunto+corpo:
  // se alguém alterar o texto depois, o hash deixa de bater e o histórico
  // denuncia. Sem esse carimbo, a edição de um documento já lido seria invisível.
  Comunicado: { update: ["assunto", "corpo"], delete: false },

  // Tirar um marcador não é reescrever história: a tag não afirma nada sobre o
  // documento, ela só ajuda quem procura.
  TagAplicadaAoComunicado: { update: [], delete: true },

  // ⚠️ MARCAR COMO LIDA É A ÚNICA MUTAÇÃO, e ela é do DESTINATÁRIO sobre a PRÓPRIA
  // notificação. `entregueEm` fica FORA do grant de propósito: quem carimba entrega
  // é o adaptador do canal, e hoje não existe nenhum — um runtime capaz de escrever
  // `entregueEm` poderia declarar entregue um e-mail que ninguém enviou.
  Notificacao: { update: ["lidaEm"], delete: false },

  // ⚠️ DESATIVAR UM CAMPO ADICIONAL, E SÓ ISSO. Os VALORES são append-only: corrigir um
  // campo é gravar outro valor, e o anterior continua na história — que é o que o
  // catálogo quer dizer com "versionado e auditado". O que muda é a DEFINIÇÃO deixar de
  // aparecer no formulário. Apagá-la levaria os valores junto, e com eles o histórico
  // de um dado que a entidade coletou de verdade.
  DefinicaoDeCampoAdicional: { update: ["ativo"], delete: false },

  // ⚠️ SESSÃO NOTURNA V4 (3) — A RESERVA DO COMANDO É COORDENAÇÃO, NÃO AUDITORIA. Uma chave de
  // comando é adquirida por INSERT sob índice único e depois CONCLUÍDA, LIBERADA ou RETOMADA —
  // são transições de estado, não fatos. A auditoria continua em `RegistroDeOperacao`,
  // append-only. `fingerprint`, `escopo`, `usuarioIdent`, `acao` e `chave` ficam FORA do grant:
  // a intenção é imutável, e o banco garante.
  ComandoDeBorda: {
    update: ["estado", "operacaoId", "tentativas", "reservadoEm", "concluidoEm", "tipoDoResultado", "resultadoRef"],
    delete: false,
  },

  // ⚠️ V10 T1 — O LICENCIAMENTO COMERCIAL. Duas tabelas com estado corrente, e o histórico
  // (`EventoDeLicenciamento`) FORA daqui: ele é append-only e não recebe UPDATE nenhum, que é o
  // que faz "suspender" ser um fato registrado em vez de uma linha reescrita.
  //
  // ⚠️ E O GRANT É POR COLUNA, com as de identidade de fora. `GRANT UPDATE ON
  // "ContratoComercial"` deixaria o runtime trocar `numero`, `cliente`, `inicio` ou
  // `demonstracao` de um contrato já assinado — reescrever o instrumento pela aplicação. Só
  // `situacao` muda, e só por `encerrarContratoComercial`.
  ContratoComercial: { update: ["situacao"], delete: false },
  // De `HabilitacaoDeModulo` mudam a situação, a vigência e o motivo — nunca `contratoId` nem
  // `modulo`: mover uma habilitação de contrato ou trocar o módulo dela apagaria, em silêncio, o
  // que o histórico diz ter acontecido.
  HabilitacaoDeModulo: {
    update: ["ativa", "inicio", "fim", "motivo", "atualizadoPor", "atualizadoEm"],
    delete: false,
  },

  // ⚠️ V10 T2 — O LANÇAMENTO TRIBUTÁRIO. Muda UMA coluna: a situação. `valor`, `memoria`,
  // `memoriaSha256`, `fatoGerador`, `versaoDoImovelId` e `tabelaId` ficam FORA do grant, e é
  // isso que faz a memória ser CONGELADA de verdade: um `GRANT UPDATE` na tabela inteira
  // deixaria o runtime reescrever o valor de um crédito já constituído sem deixar rastro, e a
  // certidão emitida sobre ele passaria a mentir.
  LancamentoTributario: { update: ["situacao"], delete: false },

  // ⚠️ A CERTIDÃO muda ao ser DECIDIDA, e só nisso. `protocolo`, `pessoaId`, `imovelId` e
  // `chaveDeAutenticidade` ficam fora: trocar a chave de uma certidão emitida quebraria toda
  // conferência já feita, e trocar o titular transformaria o documento em outro documento.
  // ⚠️ V10 T3 — A POLÍTICA DE DIVULGAÇÃO de uma localização. UMA coluna, e nada mais:
  // `GRANT UPDATE ON "LocalizacaoFisica"` deixaria o runtime trocar `descricao`, `setorId` ou
  // `paiId` de um lugar que já aparece em movimentos de bens — reescrevendo, em silêncio, para
  // onde o acervo foi. O histórico (`MudancaDaDivulgacaoDaLocalizacao`) fica FORA daqui: ele é
  // append-only, e é o que torna a decisão auditável.
  LocalizacaoFisica: { update: ["publicavelNaTransparencia"], delete: false },

  SolicitacaoDeCertidao: {
    update: [
      "situacao", "tipo", "validadeAte", "pendencia", "motivo",
      "emissao", "emissaoSha256", "modeloDaEmissao", "emitidaEm", "emitidaPor",
    ],
    delete: false,
  },

  // ⚠️ V22 — A CLASSIFICAÇÃO DO CADASTRO PARA O MANAD, e só ela. As colunas existiam desde o
  // gerador, fail-closed, e nada as escrevia: o arquivo da Receita recusava com o motivo certo e
  // não havia tela onde resolver. Coluna a coluna, de propósito: `GRANT UPDATE ON
  // "UnidadeOrcamentaria"` deixaria o runtime trocar o `codigo` de uma unidade que já está em
  // fichas e empenhos; em `NaturezaDespesa`, o código da rubrica. Escritor único:
  // `modules/m14-exports-federais/manad/classificacao.ts`, sob CADASTRAR_ENTIDADE_CONTABIL.
  UnidadeOrcamentaria: { update: ["tipoManad"], delete: false },
  Acao: { update: ["tipoManad"], delete: false },
  NaturezaDespesa: { update: ["indTipoContaManad", "nivelContaManad"], delete: false },
  NaturezaReceita: { update: ["indTipoContaManad", "nivelContaManad"], delete: false },

  // ⚠️ V22 — O INDICADOR DE CENTRALIZAÇÃO DA ESCRITURAÇÃO (MANAD 0000), e NENHUMA outra coluna do
  // `EnteConfig`: CNPJ, UF e código IBGE são a identidade fiscal do ente e continuam passo de
  // implantação, rodado como dono. O indicador é declaração da contabilidade — o serviço
  // `declararCentralizacaoDaEscrituracao` já existia, conferia a ação e devolvia o anterior; faltava
  // só o banco deixar a tela chamá-lo.
  EnteConfig: { update: ["indCentralizacao"], delete: false },

  // ⚠️ V39 — TRÊS `upsert` QUE NUNCA FUNCIONARAM EM PRODUÇÃO. O `upsert` do Prisma é `INSERT ... ON CONFLICT DO UPDATE`,
  // e o Postgres exige UPDATE nas colunas do SET já no primeiro uso. Medido em 10/10/2026: "permission denied for table
  // JustificativaDePendencia" ao justificar a primeira pendência da conciliação em produção. O desenvolvimento e a
  // suíte conectam como dono e nunca acusaram; `test/upsert-no-censo-de-escrita.test.ts` varre o código e cobra isto.
  //  · a justificativa da pendência: corrigir o texto substitui o motivo (uma vigente por pendência, o desenho do
  //    serviço); conciliação, lado e referência ficam fora — mover a justificativa de pendência a reescreveria;
  //  · o parâmetro de estoque (mínimo e máximo de um material no depósito) e a cota de consumo do setor: redefinir é
  //    trocar a quantidade; material, depósito, setor e competência ficam fora.
  JustificativaDePendencia: { update: ["motivo", "criadoPor"], delete: false },
  ParametroDeEstoque: { update: ["quantidadeMinima", "quantidadeMaxima"], delete: false },
  CotaDeConsumo: { update: ["quantidadeLimite"], delete: false },
};

/** Tabelas que o runtime NÃO lê nem escreve — controle do próprio Prisma. */
const FORA_DO_ALCANCE_DO_RUNTIME = ["_prisma_migrations"];

export interface PapelDeRuntime {
  readonly usuario: string;
  readonly senha: string;
}

/**
 * O usuário e a senha do papel, do ambiente. FAIL-HARD, SEM DEFAULT.
 *
 * Mesmo padrão do `SEED_ADMIN_SENHA` (prisma/seed/bootstrap-usuario.ts): uma senha com
 * default no código nasce IGUAL em toda instalação e fica versionada para sempre. Quem
 * provisiona escolhe a dela.
 */
export function papelDoAmbiente(
  env: NodeJS.ProcessEnv = process.env
): PapelDeRuntime {
  const usuario = env["APP_DB_USUARIO"]?.trim();
  const senha = env["APP_DB_SENHA"];

  if (usuario === undefined || usuario === "") {
    throw new Error(
      "APP_DB_USUARIO não está definida.\n" +
        "É o papel com que a aplicação conecta — sem superusuário, sem posse de tabela " +
        "e sem DDL.\n" +
        'Defina no .env, por exemplo:\n  APP_DB_USUARIO="gestao_app"'
    );
  }
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(usuario)) {
    throw new Error(
      `APP_DB_USUARIO inválido: "${usuario}". Use letras, dígitos e "_", começando por letra.`
    );
  }
  if (senha === undefined || senha.length < 16) {
    throw new Error(
      "APP_DB_SENHA não está definida (ou tem menos de 16 caracteres).\n" +
        "Sem default no código: um default nasceria igual em toda instalação.\n" +
        "Gere uma:\n  node -e \"console.log(require('crypto').randomBytes(24).toString('base64url'))\""
    );
  }

  return { usuario, senha };
}

/**
 * A URL do papel de runtime para um banco, a partir da URL do DONO.
 *
 * Deriva em vez de pedir uma quarta connection string ao ambiente: host, porta, database
 * e schema TÊM de ser os mesmos do dono — duas URLs escritas à mão divergem, e o dia em
 * que divergirem a aplicação escreve num banco e a migration noutro.
 */
export function urlDoRuntime(urlDoDono: string, papel: PapelDeRuntime): string {
  const u = new URL(urlDoDono);
  u.username = encodeURIComponent(papel.usuario);
  u.password = encodeURIComponent(papel.senha);
  return u.toString();
}

/**
 * Cria (ou realinha) o papel e aplica os privilégios. IDEMPOTENTE.
 *
 * `cliente` tem de estar conectado como o DONO do schema — só o dono concede sobre as
 * próprias tabelas. É por isso que este passo NÃO é uma migration: `prisma migrate deploy`
 * roda com a URL da aplicação, e a aplicação, por construção, não pode conceder a si mesma.
 */
export async function provisionarPapelDeRuntime(
  cliente: Client,
  papel: PapelDeRuntime,
  /**
   * O SCHEMA sobre o qual os privilégios são concedidos. Default `"public"` — o único
   * que existe hoje.
   *
   * ═══ ⚠️ POR QUE ISTO É PARÂMETRO, E NÃO A CONSTANTE QUE ERA ═══
   * A decisão de produto (`docs/adr/ADR-eixo-de-municipio.md`) é atender vários
   * municípios por **schema por município**. Nesse desenho é ESTE script que provisiona
   * o acesso da aplicação a cada schema novo — e ele não pode assumir `public`, ou o
   * município recém-criado nasceria sem grant nenhum e a aplicação responderia
   * "permission denied" na primeira leitura.
   *
   * ⚠️ E A MUDANÇA NÃO É SÓ NAS TRÊS LINHAS ÓBVIAS. Os `GRANT ... ON TABLE <t>` do
   * censo e do `FORA_DO_ALCANCE_DO_RUNTIME` eram **não qualificados**: resolviam pelo
   * `search_path` do dono. Com um schema por município, um `search_path` diferente do
   * esperado concederia privilégio na tabela do município ERRADO — e concederia em
   * silêncio, porque o SQL é válido. Agora toda referência é qualificada.
   *
   * ⚠️ ISTO NÃO IMPLANTA MULTI-TENANCY. Nada aqui cria schema, resolve município ou lê
   * membership. O parâmetro só para de dificultar o lote que fará isso.
   */
  schema: string = "public"
): Promise<void> {
  const id = cliente.escapeIdentifier(papel.usuario);
  const senha = cliente.escapeLiteral(papel.senha);
  const sch = cliente.escapeIdentifier(schema);
  /** `schema.tabela`, sempre — ver o aviso sobre `search_path` no parâmetro. */
  const tabelaEm = (t: string): string => `${sch}.${cliente.escapeIdentifier(t)}`;

  // (1) O papel. LOGIN e nada mais: sem SUPERUSER (atravessa tudo), sem BYPASSRLS
  //     (atravessa política de linha), sem CREATEDB/CREATEROLE (escalada), sem
  //     REPLICATION (lê o WAL inteiro, que contém as linhas que o grant nega).
  await cliente.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${cliente.escapeLiteral(papel.usuario)}) THEN
        CREATE ROLE ${id} LOGIN PASSWORD ${senha};
      ELSE
        ALTER ROLE ${id} LOGIN PASSWORD ${senha};
      END IF;
    END
    $$;
  `);
  // ⚠️ SÓ O QUE ESTÁ ERRADO, E ISSO NÃO AFROUXA NADA. No PostgreSQL 16+ mexer em BYPASSRLS ou
  // REPLICATION (até para TIRAR) exige superusuário, e o dono do banco de uma implantação de verdade
  // não é superusuário: o `ALTER ROLE ... NOBYPASSRLS NOREPLICATION` incondicional recusava a
  // instalação na EC2 (V29) com "permission denied to alter role". Um papel recém-criado com LOGIN
  // já nasce sem nenhum desses atributos; só um papel que JÁ os tem precisa do ALTER — e, nesse
  // caso, se o dono não puder tirá-los, a instalação PARA (fail-closed), que é o certo.
  const atual = await cliente.query(
    `SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolreplication, rolinherit
       FROM pg_roles WHERE rolname = ${cliente.escapeLiteral(papel.usuario)}`
  );
  const r = atual.rows[0] as
    | { rolsuper: boolean; rolcreatedb: boolean; rolcreaterole: boolean; rolbypassrls: boolean; rolreplication: boolean; rolinherit: boolean }
    | undefined;
  if (r === undefined) throw new Error(`O papel ${papel.usuario} não existe depois de criado.`);
  const ajustes = [
    r.rolsuper ? "NOSUPERUSER" : "",
    r.rolcreatedb ? "NOCREATEDB" : "",
    r.rolcreaterole ? "NOCREATEROLE" : "",
    r.rolbypassrls ? "NOBYPASSRLS" : "",
    r.rolreplication ? "NOREPLICATION" : "",
    r.rolinherit ? "" : "INHERIT",
  ].filter((x) => x !== "");
  if (ajustes.length > 0) await cliente.query(`ALTER ROLE ${id} ${ajustes.join(" ")}`);

  // (2) O schema: USAGE, nunca CREATE. Sem CREATE não há DDL — o runtime não cria
  //     tabela, não dropa índice e não altera coluna. É o que separa "a aplicação" de
  //     "a migration", e a separação vira física em vez de disciplinar.
  await cliente.query(`REVOKE ALL ON SCHEMA ${sch} FROM ${id}`);
  await cliente.query(`GRANT USAGE ON SCHEMA ${sch} TO ${id}`);

  // (3) O padrão do repositório é APPEND-ONLY: SELECT e INSERT, nada mais. Um REVOKE ALL
  //     antes, para que retirar uma tabela do censo de fato a retire (sem ele, o grant
  //     antigo sobreviveria a esta função e o censo mentiria).
  await cliente.query(`REVOKE ALL ON ALL TABLES IN SCHEMA ${sch} FROM ${id}`);
  await cliente.query(
    `GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA ${sch} TO ${id}`
  );
  await cliente.query(`GRANT USAGE ON ALL SEQUENCES IN SCHEMA ${sch} TO ${id}`);

  // (4) As três exceções do censo, por coluna onde a coluna importa.
  for (const [tabela, permissao] of Object.entries(ESCRITA_MUTAVEL_DO_RUNTIME)) {
    const t = tabelaEm(tabela);
    if (permissao.update.length > 0) {
      const colunas = permissao.update
        .map((c) => cliente.escapeIdentifier(c))
        .join(", ");
      await cliente.query(`GRANT UPDATE (${colunas}) ON TABLE ${t} TO ${id}`);
    }
    if (permissao.delete) {
      await cliente.query(`GRANT DELETE ON TABLE ${t} TO ${id}`);
    }
  }

  // (5) O histórico de migrations não é dado da aplicação. Só leitura — o Prisma Client
  //     consulta a tabela em algumas rotas de diagnóstico, mas quem escreve nela é o
  //     `migrate deploy`, que roda como dono.
  for (const tabela of FORA_DO_ALCANCE_DO_RUNTIME) {
    const t = tabelaEm(tabela);
    await cliente.query(`REVOKE ALL ON TABLE ${t} FROM ${id}`);
    await cliente.query(`GRANT SELECT ON TABLE ${t} TO ${id}`);
  }

  // (6) TABELA NOVA NASCE APPEND-ONLY. Sem isto, a migration seguinte criaria uma tabela
  //     SEM grant nenhum e a aplicação quebraria com "permission denied" — o que é
  //     fail-closed, mas fail-closed que derruba a operação inteira por uma tabela de
  //     apoio. Com isto ela nasce legível e inserível, e MUTÁVEL NUNCA: UPDATE e DELETE
  //     continuam saindo só do censo acima, que alguém assina.
  const dono = (await cliente.query<{ dono: string }>("SELECT current_user AS dono"))
    .rows[0]?.dono;
  if (dono === undefined) {
    throw new Error("Não foi possível resolver current_user para o ALTER DEFAULT PRIVILEGES.");
  }
  await cliente.query(
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${cliente.escapeIdentifier(dono)} IN SCHEMA ${sch} ` +
      `GRANT SELECT, INSERT ON TABLES TO ${id}`
  );
  await cliente.query(
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${cliente.escapeIdentifier(dono)} IN SCHEMA ${sch} ` +
      `GRANT USAGE ON SEQUENCES TO ${id}`
  );
}
