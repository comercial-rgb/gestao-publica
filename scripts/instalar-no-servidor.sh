#!/usr/bin/env bash
# ═══ INSTALAÇÃO NO SERVIDOR — idempotente, revisável, com usuário próprio (V10 T5) ═══
#
# ⚠️ POR QUE UM SCRIPT, E NÃO TRECHOS NO DOCUMENTO. O roteiro trazia comandos de exemplo, e
# comandos de exemplo não se revisam nem se repetem: quem executa adapta na hora, e o que rodou
# de fato deixa de ser conhecido. Isto aqui roda inteiro, roda de novo sem estragar nada, e
# RECUSA quando uma pré-condição não está satisfeita.
#
# ⚠️ O QUE ELE **NÃO** FAZ, e está declarado:
#   · não cria a instância nem toca em nuvem nenhuma;
#   · não instala pacote do sistema por conta própria — ele CONFERE a versão do que já está
#     instalado e recusa quando não bate. Escolher versão de Postgres por `apt-get install
#     postgresql` é aceitar o que a distribuição quiser dar naquele dia;
#   · não gera segredo. `.env` é preparado por quem opera, e o script confere o que falta.
#
# USO (no servidor, como um usuário com sudo):
#   scripts/instalar-no-servidor.sh --pacote /tmp/gestao-publica-<cand>.tgz \
#       --manifesto /tmp/gestao-publica-<cand>.manifesto [--conferir]
#
#   --conferir  só verifica as pré-condições e sai; não instala nada.
set -euo pipefail

PACOTE=""
MANIFESTO=""
SO_CONFERIR=0
RAIZ="/opt/gestao-publica"
USUARIO="gestao-publica"

while [ $# -gt 0 ]; do
  case "$1" in
    --pacote) PACOTE="${2:-}"; shift 2 ;;
    --manifesto) MANIFESTO="${2:-}"; shift 2 ;;
    --conferir) SO_CONFERIR=1; shift ;;
    --raiz) RAIZ="${2:-}"; shift 2 ;;
    *) echo "argumento desconhecido: $1"; exit 2 ;;
  esac
done

# ⚠️ AS VERSÕES SÃO FIXADAS, E CONFERIDAS. "A mesma linha do package-lock" não é verificável
# depois; um número é. Estes vieram da máquina onde o candidato foi construído e testado.
NODE_MAIOR_ESPERADO=22
PG_MAIOR_ESPERADO=18

passo() { printf '\n[%s] %s\n' "$1" "$2"; }
erro() { echo "  ⚠️ $1"; exit "${2:-1}"; }

# ─────────────────────────────────────────────────────────────────────────────
passo 1 "as pré-condições do runtime"
# ⚠️ A CONFERÊNCIA MORA EM `scripts/conferir-runtime.sh`, e não aqui — para poder ser ENSAIADA
# sozinha, num container Linux, com binários de mentira no PATH. Ver
# `docs/operacao/ENSAIO-DA-INSTALACAO.md`: seis casos, cada recusa vista acontecendo.
"$(dirname "$0")/conferir-runtime.sh" || exit $?

# ─────────────────────────────────────────────────────────────────────────────
passo 2 "o pacote e o manifesto"
[ -n "$PACOTE" ] || erro "--pacote e obrigatorio." 2
[ -f "$PACOTE" ] || erro "pacote nao encontrado: $PACOTE" 2
[ -n "$MANIFESTO" ] || erro "--manifesto e obrigatorio: sem ele nao ha o que conferir depois da transferencia." 2
[ -f "$MANIFESTO" ] || erro "manifesto nao encontrado: $MANIFESTO" 2

CANDIDATO="$(grep '^candidato=' "$MANIFESTO" | cut -d= -f2-)"
SHA_ESPERADO="$(grep '^sha256-do-pacote=' "$MANIFESTO" | cut -d= -f2-)"
[ -n "$CANDIDATO" ] || erro "manifesto sem 'candidato='." 2
[ -n "$SHA_ESPERADO" ] || erro "manifesto sem 'sha256-do-pacote='." 2

# ⚠️ A INTEGRIDADE SE CONFERE DEPOIS DA TRANSFERÊNCIA, e é isto que o roteiro anterior não fazia.
SHA_ATUAL="$(sha256sum "$PACOTE" | cut -d' ' -f1)"
if [ "$SHA_ATUAL" != "$SHA_ESPERADO" ]; then
  echo "  esperado: $SHA_ESPERADO"
  echo "  no disco: $SHA_ATUAL"
  erro "o pacote transferido NAO e o que o manifesto descreve. Nao instalar." 13
fi
echo "  candidato: $CANDIDATO"
echo "  integridade: confere"

# ─────────────────────────────────────────────────────────────────────────────
passo 3 "o .env do servidor — conferido, nunca transportado do Mac"
ENV="$RAIZ/.env"
FALTANDO=""
if [ -f "$ENV" ]; then
  for chave in DATABASE_URL APP_DB_USUARIO APP_DB_SENHA ANEXOS_DIR SEED_IDENTIDADE; do
    grep -q "^${chave}=" "$ENV" || FALTANDO="$FALTANDO $chave"
  done
  [ -z "$FALTANDO" ] || erro "faltam no $ENV:$FALTANDO" 14
  echo "  $ENV: completo"
else
  echo "  $ENV ainda nao existe — ele e preparado por quem opera, com segredos proprios."
  echo "  ⚠️ O .env do Mac NAO e transportado: senha de desenvolvimento nao e senha de implantacao."
  [ "$SO_CONFERIR" -eq 1 ] || erro "crie o $ENV antes de instalar." 14
fi

if [ "$SO_CONFERIR" -eq 1 ]; then
  echo ""
  echo "CONFERENCIA CONCLUIDA — nada foi instalado."
  exit 0
fi

# ─────────────────────────────────────────────────────────────────────────────
passo 4 "o usuário do serviço e os diretórios"
# ⚠️ USUÁRIO DEDICADO, SEM SHELL. A unit anterior não declarava `User=` — e systemd, na
# ausência dela, roda como ROOT. A aplicação inteira, incluindo o que processa upload, rodaria
# com poder de administrador da máquina.
if ! id -u "$USUARIO" > /dev/null 2>&1; then
  sudo useradd --system --home-dir "$RAIZ" --shell /usr/sbin/nologin "$USUARIO"
  echo "  usuario $USUARIO criado (sistema, sem shell)"
else
  echo "  usuario $USUARIO ja existe"
fi
sudo mkdir -p "$RAIZ" "$RAIZ/anexos"
sudo chown -R "$USUARIO:$USUARIO" "$RAIZ"
sudo chmod 750 "$RAIZ"
# ⚠️ O .env guarda senha de banco: 640, do usuário do serviço. 644 o entregaria a qualquer
# conta da máquina.
[ -f "$ENV" ] && sudo chown "$USUARIO:$USUARIO" "$ENV" && sudo chmod 640 "$ENV"
echo "  diretorios e permissoes aplicados"

# ─────────────────────────────────────────────────────────────────────────────
passo 5 "o código"
# ⚠️ A ORDEM IMPORTA, e o roteiro anterior a tinha errada: ele mandava rodar os scripts de
# provisionamento ANTES de as dependências existirem. `npm run db:papel` é `tsx`, e `tsx` vem do
# `npm ci`. Aqui: extrair -> instalar dependências -> gerar cliente -> migrar -> SQL -> permissões.
sudo -u "$USUARIO" tar xzf "$PACOTE" -C "$RAIZ"
( cd "$RAIZ" && sudo -u "$USUARIO" npm ci --omit=dev --ignore-scripts && sudo -u "$USUARIO" npm ci )
echo "  dependencias instaladas contra o package-lock do pacote"

passo 6 "o cliente do Prisma, na arquitetura DESTE servidor"
( cd "$RAIZ" && sudo -u "$USUARIO" npx prisma generate )

passo 7 "o banco: dono migra, runtime opera"
# ⚠️ DUAS IDENTIDADES, E A PROVA DE QUE A SEGUNDA É MENOR. O dono aplica migrations (DDL); o
# runtime só lê e escreve, sem DDL, sem superusuário e sem BYPASSRLS. `npm run test:runtime`
# afirma isso contra o banco — não é uma promessa do documento.
( cd "$RAIZ" && sudo -u "$USUARIO" npx prisma migrate deploy )
( cd "$RAIZ" && sudo -u "$USUARIO" npm run db:papel )
( cd "$RAIZ" && sudo -u "$USUARIO" npm run db:sql )
( cd "$RAIZ" && sudo -u "$USUARIO" npm run permissoes:atualizar -- pendentes )
# ⚠️ O LICENCIAMENTO COMERCIAL (V10 T1). Sem ele o gate fecha os módulos contratáveis — e a
# mensagem que o operador leria nomeia exatamente este comando.
( cd "$RAIZ" && sudo -u "$USUARIO" npm run licenciamento:instalar -- --aplicar --demonstracao ) || \
  echo "  (licenciamento ja instalado, ou faltam LICENCA_NUMERO/LICENCA_CLIENTE no .env — conferir)"

passo 8 "o build, e a prova de que o PDF sai NESTE runtime"
( cd "$RAIZ" && sudo -u "$USUARIO" env NEXT_PUBLIC_BUILD_COMMIT="$(grep '^commit=' "$MANIFESTO" | cut -d= -f2- | cut -c1-7)" npx next build )
# ⚠️ CHROMIUM INSTALADO NÃO É PDF RENDERIZADO. Fonte faltando produz caixas no lugar das letras,
# e isso só aparece olhando o arquivo. O ensaio é aqui, antes de o serviço subir.
( cd "$RAIZ" && sudo -u "$USUARIO" npx tsx scripts/preflight-navegador.ts ) || \
  erro "o navegador/PDF nao passou no preflight NESTE servidor. Conferir chromium e fontes." 15

passo 9 "a unit do serviço"
sudo tee /etc/systemd/system/gestao-publica.service > /dev/null <<UNIT
[Unit]
Description=Gestao Publica
After=network.target postgresql.service

[Service]
# ⚠️ User= E Group= SAO OBRIGATORIOS. Sem eles o systemd roda como root, e a aplicacao inteira
# ganharia poder de administrador da maquina.
User=$USUARIO
Group=$USUARIO
WorkingDirectory=$RAIZ
EnvironmentFile=$RAIZ/.env
# ⚠️ A IDENTIDADE DO CANDIDATO vem do MANIFESTO, no mesmo passo em que o codigo e instalado.
# E ela que /release publica e que o aceite pos-DNS compara.
Environment=IDENTIDADE_DO_CANDIDATO=$CANDIDATO
# ⚠️ ESCUTA SO NA INTERFACE INTERNA. Sem -H, o Next abre em 0.0.0.0 e a porta 3000 fica
# acessivel de fora, contornando o proxy e o TLS.
ExecStart=/usr/bin/npx next start -H 127.0.0.1 -p 3000
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$RAIZ/anexos $RAIZ/.next

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now gestao-publica
echo "  servico habilitado e iniciado"

echo ""
echo "INSTALADO: candidato $CANDIDATO"
echo "Proximo passo: o proxy e o DNS. Depois, o aceite:"
echo "  scripts/pos-dns.sh --nome <nome> --ip <ip> --candidato $CANDIDATO"
