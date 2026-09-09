import "dotenv/config";
import { urlDoBancoDeTeste } from "./db-teste.js";

/**
 * SETUP por arquivo de teste — roda ANTES de o arquivo de teste ser importado.
 *
 * Os testes de integração leem `process.env.DATABASE_URL` no topo do módulo.
 * Aqui essa variável é REESCRITA para o banco de teste, de modo que
 * `criarPrismaClient()` dentro da suíte nunca consiga alcançar o banco de dev —
 * mesmo que alguém esqueça e use DATABASE_URL direto.
 *
 * O guarda-chuva roda de novo (além do global-setup) porque cada worker do
 * Vitest é um processo próprio: se ele fosse só global, um worker mal
 * configurado passaria batido.
 */
process.env["DATABASE_URL"] = urlDoBancoDeTeste();
