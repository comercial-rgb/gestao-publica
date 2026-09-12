# Plano B -- Apresentacao Pregao 90023/2026

## Cenario 1: Internet cai
Sistema 100% local. Hotspot celular como backup.

## Cenario 2: Notebook trava
Notebook backup com mesmo estado (`git pull` + `pnpm install` + `pnpm demo:start`).

## Cenario 3: Bug ao vivo
Video demo-backup.mp4 no desktop. Nao debugar ao vivo.
"Vou mostrar pela gravacao que preparei."

## Cenario 4: Pedem algo que nao tem
Nao mentir. Foco no roadmap:
"Previsto para X dias pos-contrato, conforme cronograma."

## Cenario 5: Demora em alguma tela
"O sistema esta carregando dados reais do banco."
Mostra outra coisa enquanto carrega. NUNCA fique em silencio.

## Como gravar demo (macOS)
```bash
pnpm demo:reset-and-start
# Aguardar tudo verde, depois:
# Cmd+Shift+5 -> Gravar tela -> 10 min do fluxo completo
```
