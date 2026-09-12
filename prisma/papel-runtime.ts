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
  await cliente.query(
    `ALTER ROLE ${id} NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION INHERIT`
  );

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
