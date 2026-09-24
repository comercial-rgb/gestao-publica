-- V11 V9.4 (TR 5.12.50) — OS TRES VALORES NOVOS DO ENUM, E NADA MAIS NESTE ARQUIVO.
--
-- ⚠️ ESTA MIGRATION EXISTE SEPARADA POR UMA RESTRICAO DO POSTGRES, NAO POR ESTILO. Um valor
-- acrescentado a um tipo enumerado NAO PODE SER USADO na mesma transacao que o acrescentou
-- ("unsafe use of new value of enum type"). O Prisma roda cada arquivo numa transacao, e os CHECK
-- da migration seguinte CITAM 'DESIGNACAO_FUNCAO' e 'MUDANCA_CENTRO_DE_CUSTO' — juntar os dois
-- falha na APLICACAO, nao no code review. Mesmo fundamento de
-- `20261011090000_v11_v91_tipos_de_folha_do_decimo_terceiro` e
-- `20261015090000_v11_v94_tipo_da_folha_mensal_complementar`.
--
-- ⚠️ E A PASTA NASCE COM O ARQUIVO DENTRO, NO MESMO ATO. Uma pasta de migration vazia ja quebrou
-- `migrate deploy` aqui com P3015 e derrubou a suite inteira.
--
-- ADITIVA: tres valores novos. Nenhum valor existente muda de nome ou sai, nenhuma linha e
-- reescrita, e todo banco existente continua lendo os dez valores anteriores exatamente como antes.

-- FUNCAO NAO E CARGO. Cargo e o POSTO que a lei criou (com vagas fixadas); funcao e a ATRIBUICAO
-- exercida. A professora efetiva designada diretora continua professora — registrar isso como
-- MUDANCA_CARGO faria o plano de cargos do ente ganhar uma vaga de diretora que a lei nao criou.
ALTER TYPE "TipoEventoVinculo" ADD VALUE 'DESIGNACAO_FUNCAO';

-- E FUNCAO ACABA, ENQUANTO CARGO NAO. Depois da admissao sempre ha um cargo; funcao a maioria
-- nunca exerceu, e quem exerceu e dispensado um dia. Sem um evento que ENCERRA, dizer "nao exerce
-- mais" exigiria uma designacao para uma funcao-vazia (dado falso) ou um UPDATE no evento antigo
-- (que a razao append-only deste sistema nao admite).
ALTER TYPE "TipoEventoVinculo" ADD VALUE 'DISPENSA_FUNCAO';

-- CENTRO DE CUSTO NAO E LOTACAO. Lotacao e ONDE A PESSOA TRABALHA (organograma do RH); centro de
-- custo e ONDE A DESPESA E APROPRIADA (o `Setor` do M21). Coincidem com frequencia e divergem
-- quando importa: o servidor cedido continua lotado na origem e o custo dele e do destino.
ALTER TYPE "TipoEventoVinculo" ADD VALUE 'MUDANCA_CENTRO_DE_CUSTO';
