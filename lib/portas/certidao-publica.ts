import { diaCivil } from "../../packages/datas/index.js";
import { conferirAutenticidade, type Autenticidade } from "../../modules/m34-tributario/certidao.js";
import { cliente } from "./cliente";

/**
 * ═══ A CONFERÊNCIA PÚBLICA DE UMA CERTIDÃO (V10 T2 · N5) ═══
 *
 * ⚠️ PORTA PRÓPRIA, SEPARADA DA ADMINISTRATIVA, e a razão não é organização. A página que serve
 * esta consulta vive em `app/(publico)/` — sem sessão, por desenho. Se ela importasse
 * `lib/portas/lancamento-tributario.ts`, puxaria junto `comEscritaAutenticada` e todo o caminho
 * de ESCRITA para dentro de uma rota pública. Nada quebraria hoje (o código não é chamado), e
 * é exatamente assim que, um dia, alguém chama.
 *
 * Aqui entra o mínimo: o domínio da certidão e o cliente do banco.
 */
export async function conferirCertidao(chave: string): Promise<Autenticidade> {
  return conferirAutenticidade(cliente(), chave, diaCivil(new Date()));
}

export type { Autenticidade };
