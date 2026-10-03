# Produção — Gestão Pública na AWS (EC2 São Paulo)

Instalado em 02–03/10/2026. **Sem segredos aqui:** senhas e chaves ficam em
`~/.gestao-publica-local/producao-credenciais.txt` e `~/.aws/credentials` (perfil `gestao-publica`) na máquina de
operação, nunca no repositório.

## O que existe

| Item | Valor |
|---|---|
| Máquina | EC2 `i-0816dfc956e108980`, `t3.small` (2 GB, 2 vCPU), Ubuntu 24.04, disco gp3 40 GB criptografado, região `sa-east-1` |
| IP fixo | `54.20.113.114` (Elastic IP `gestao-publica-ip`) |
| Domínio | `gestaopublica.enginesistemas.com.br` — registro A na GoDaddy **deve apontar para 54.20.113.114** |
| Grupo de segurança | `gestao-publica-web`: 80 e 443 públicos; 22 público só por chave (o GitHub Actions entra por ela; senha desligada) |
| Software | Node 22, PostgreSQL 18 (só localhost), Chrome estável como `chromium`, nginx, certbot, 4 GB de troca |
| Banco | `gestao_publica_esperanca`; dono `gestao_dono` (migra, sem superusuário); a aplicação conecta como `gestao_app` (`.env.runtime`) |
| Aplicação | `/opt/gestao-publica/versoes/<commit>`; unit `gestao-publica@3000` ou `@3001` (a ativa); nginx aponta pelo arquivo `/etc/nginx/conf.d/gestao-publica-upstream.conf` |
| Base de dados | instalação limpa: plano de contas do TCE-PB (7.864 contas), administrador, Lei 613/2025 com o PDF, contrato de licenciamento **provisório** (`PROVISORIO-ESPERANCA-2026`, 8 módulos) |
| Recursos marcados | todos com `projeto=gestao-publica`, `ambiente=producao` |

## Publicar uma alteração (como na frota)

```sh
npm run publicar
```

Confere a árvore, roda a conferência de tipos nesta máquina (o servidor de 2 GB não comporta), commita a aprovação
em `scripts/implantacao/aprovacao-de-tipos.json` e envia para a `main`. O GitHub Actions entra no servidor e roda
`scripts/atualizar-no-servidor.sh`: a versão nova é montada e sobe na outra porta, e só recebe o tráfego depois de
responder `/release` com o commit certo. Se falhar, a anterior continua no ar.

**Tempo medido no primeiro deploy:** cerca de 12 minutos, dos quais 6,5 de compilação do Next na máquina de 2 GB.
Acompanhar: `gh run watch` ou a aba Actions. Conferir: `https://gestaopublica.enginesistemas.com.br/release`.

## Pendências

- **DNS:** trocar o A `gestaopublica` de 54.233.77.161 (servidor da Saúde) para 54.20.113.114.
- **HTTPS:** depois do DNS, `sudo certbot --nginx -d gestaopublica.enginesistemas.com.br` no servidor. Até lá a tela
  de entrada só existe em HTTP pelo IP — não entrar com senha real antes do certificado.
- **Dados de Esperança:** código Poder/Órgão da STN (identidade do ente) e datas de início das unidades gestoras
  (`scripts/implantacao/esperanca-instalar-base.ts`); número do contrato comercial no lugar do provisório.
- **Backup:** ainda não há rotina de cópia do banco para fora da máquina (o disco não é apagado se a máquina for
  encerrada, mas isso não é backup).
- **Velocidade da publicação:** mover a compilação para o GitHub Actions e enviar o resultado pronto reduziria o
  tempo para poucos minutos e tiraria a carga da máquina.
- **Chaves:** desativar a Access key 1 do usuário `gestao-publica` (nunca usada, segredo perdido) e ligar o MFA do
  console; a chave 2 passou por conversa e deve ser trocada quando o projeto estabilizar.
