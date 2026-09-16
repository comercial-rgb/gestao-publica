import { identidadePublica } from "../../lib/portas/identidade";
import { CabecalhoPublico } from "../../components/publico/CabecalhoPublico";
import { RodapeEngine } from "../../components/publico/RodapeEngine";

/**
 * A CASCA DAS TELAS PÚBLICAS (V9 N1).
 *
 * ⚠️ POR QUE UM GRUPO PRÓPRIO, E NÃO O `(areas)`. `(areas)` é a fronteira de SESSÃO: o layout
 * dele chama `exigirSessao()`, que redireciona para `/login`. Pôr a transparência lá dentro
 * trancaria a porta que a lei manda deixar aberta. E deixá-las soltas na raiz, como estavam,
 * dava a cada página pública uma casca própria — nenhuma tinha cabeçalho, nenhuma tinha rodapé,
 * e não havia como sair de `/servicos` para `/transparencia` sem digitar a URL.
 *
 * ⚠️ E A COLISÃO DE `/transparencia` FOI DESFEITA AQUI. Antes, `app/(areas)/transparencia`
 * (landing INTERNA, atrás de sessão) ocupava `/transparencia`, enquanto `app/transparencia/
 * contratos` e `/demonstrativos` — públicas — viviam no mesmo prefixo sob outra árvore de
 * layout. O endereço que um município divulga levava à tela de login. A landing interna passou
 * a `/administracao/transparencia` (ver `lib/navegacao.ts`), e este grupo é o dono único do
 * prefixo público.
 *
 * `dynamic = "force-dynamic"` porque a identidade vem do banco: um layout estático congelaria o
 * nome e o brasão do ente na build.
 */
export const dynamic = "force-dynamic";

export default async function LayoutPublico({
  children,
}: {
  readonly children: React.ReactNode;
}): Promise<React.ReactElement> {
  const identidade = await identidadePublica();
  return (
    <div className="flex min-h-screen flex-col bg-[color:var(--color-canvas)]" data-tema={identidade.ente?.tema ?? "PADRAO"}>
      {/* ⚠️ O SALTO PARA O CONTEÚDO vem antes de tudo: com teclado, sem ele, cada página começa
          percorrendo o cabeçalho inteiro de novo. */}
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-[var(--radius-md)] focus:bg-[color:var(--color-surface)] focus:px-3 focus:py-2 focus:text-sm focus:ring-2 focus:ring-[color:var(--color-primary)]"
      >
        Ir para o conteúdo
      </a>
      <CabecalhoPublico identidade={identidade} />
      <div id="conteudo" data-ancora className="flex-1">
        {children}
      </div>
      <RodapeEngine />
    </div>
  );
}
