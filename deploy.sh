#!/bin/bash
# Deploy produkcyjny. Wykonuje się ZAWSZE na serwerze, niezależnie od tego, skąd go
# uruchomiono: odpalony lokalnie loguje się przez ssh i woła samego siebie po stronie
# serwera. Wcześniej trzeba było o tym pamiętać ręcznie — treść skryptu przesłana
# z Windowsa do powłoki serwera (`ssh gigatel 'bash -s' < deploy.sh`) niosła windowsowe
# końce linii i wywalała się na pierwszej komendzie.
#
# Cały skrypt siedzi w klamrze { }, bo bash wczytuje taki blok w CAŁOŚCI przed
# wykonaniem. Bez tego `git reset --hard` podmieniałby ten plik w trakcie własnego
# deployu, a bash doczytywałby dalsze linie już z nowej wersji, od starego offsetu.
{
set -e

SERVER=gigatel
APP_DIR=/srv/apps/erp

# Jedyny wyznacznik „jestem na serwerze" — katalog aplikacji. Na Windowsie nie istnieje,
# więc lokalne uruchomienie zawsze trafia w gałąź ssh. Rekurencji nie ma: po drugiej
# stronie katalog już jest i skrypt idzie prosto do deployu.
if [ ! -d "$APP_DIR" ]; then
    echo "==> lokalnie — przekazuję deploy na serwer ($SERVER)"
    exec ssh "$SERVER" "bash $APP_DIR/deploy.sh"
fi

echo "==> deploy na $(hostname)"
cd "$APP_DIR"
git fetch origin
git reset --hard origin/main
git log --oneline -1

cd apps
docker compose build --no-cache frontend backend
docker compose up -d frontend backend
docker compose ps frontend backend

exit 0
}
