-- M16 — as duas acoes da movimentacao bancaria (TR 5.62). Aditivo.
--
-- Acoes PROPRIAS, e nao reuso de TRANSFERIR_ENTRE_CONTAS: mover dinheiro entre
-- contas do ente e tirar dinheiro da conta sao atos diferentes, e quem pode um nao
-- necessariamente pode o outro. E desfazer e ato separado de registrar.
ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'REGISTRAR_MOVIMENTO_BANCARIO';
ALTER TYPE "AcaoDoSistema" ADD VALUE IF NOT EXISTS 'ESTORNAR_MOVIMENTO_BANCARIO';
