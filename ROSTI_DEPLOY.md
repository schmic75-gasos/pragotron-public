# Nasazení na Roští

Projekt je připravený jako Node.js aplikace. Roští očekává, že aplikace
poslouchá na portu `8080` a spustí se příkazem `npm start`.

## Nahrání do klasické Node.js aplikace

Nahrajte obsah projektu do `/srv/app` a v SSH konzoli spusťte:

```sh
cd /srv/app
npm install --omit=dev
supervisorctl restart app
```

Po restartu bude aplikace dostupná přes přidělenou doménu. `PORT` i `HOST`
se respektují z prostředí; bez nich aplikace použije `8080` a naslouchá na
všech rozhraních.

## WebSockety pro propojení tabulí

Pragotron používá WebSocket pro komunikaci správce s tabulemi. Pokud proxy
Roští WebSockety nepředává automaticky, doplňte do nginx konfigurace aplikace
hlavičky:

```nginx
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

Poté restartujte nginx:

```sh
supervisorctl restart nginx
```

Oficiální dokumentace Roští popisuje stejný postup v kapitole WebSockety:
https://docs.rosti.cz/cs/websockets/

## Ověření

Po nasazení otevřete `/platformTableManage.html`. V panelu **Živé odjezdy**
zůstává nastavená oficiální tabule Správy železnic. Pro běh živých dat musí
server umožnit odchozí HTTPS spojení na `provoz.spravazeleznic.cz`.
