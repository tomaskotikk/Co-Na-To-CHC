# Co na to CHC? 🎤

Stužkovací show Creative Hill College ve stylu „Co na to Češi“.
Notebook = projektor, tvůj telefon = ovladač, telefony týmů = připojení přes QR.

## Spuštění (na notebooku)

Poprvé: `npm install`

| Co | Příkaz |
|---|---|
| **Na ples (rychlé, produkce)** | `npm run show` nebo dvojklik na `SPUSTIT SHOW.bat` |
| Vývoj / úpravy | `npm run dev` |

Pak na notebooku otevři **http://localhost:3000** (důležité: `localhost`, jen tam se ukáže admin QR).

- **F** – celá obrazovka · **M** – ztlumit · **Shift+A** – nový admin QR (když ti umře telefon)
- Jednou klikni kamkoli na projektoru → zapne se zvuk (prohlížeč to vyžaduje).

## Průběh

1. Projektor ukáže **admin QR** → naskenuj telefonem → „Jsem admin“. QR zmizí, odkaz už nikdo jiný nepoužije.
2. Lobby: týmy naskenují QR / zadají 4místný kód a jméno týmu. (Tým jde přidat i ručně v záložce Týmy.)
3. Záložka **Hra**: „Spustit otázku“ → na projektoru intro + 6 zakrytých karet.
4. Někdo se trefí → klepni na odpověď → vyber tým → karta se otočí a tým dostane body.
5. Netrefí se → **BZZZ** → vyber tým → bzučák + velké X. Po 3 X je tým pro otázku vyřazený.
6. Každá akce má **2 s prodlevu** s tlačítkem **ZRUŠIT** (nastavitelné v ⚙). Navíc **↶ Zpět** vrátí poslední akci.
7. „Odkrýt zbytek“ ukáže neuhodnuté karty (bez bodů). Pak **›** další otázka, nakonec Pořadí a Finále 🏆.

Volitelně: **Bzučáky** – týmům se na telefonu objeví velké tlačítko, kdo zmáčkne první, ukáže se na projektoru.

## Otázky

V adminu záložka **Otázky** (jde i z notebooku – otevři stejný admin odkaz).
Odpověď + počet lidí, co ji řekli. Po uložení se seřadí: karta 1 = nejčastější. Násobič ×2/×3 pro finálové otázky.
Data jsou v `data/questions.json` (dá se upravit i ručně / přes JSON import). Stav hry se ukládá do `data/game.json`, takže restart notebooku nic nesmaže.

## Síť – důležité na plese

Telefony se připojují **na notebook**, takže musí být na **stejné Wi-Fi** (adresu typu `http://192.168.x.x:3000` ukáže konzole i QR kód).
Tip: nejspolehlivější je **hotspot z jednoho telefonu**, na který se připojí notebook i všichni hráči. Školní/hotelové Wi-Fi často zařízení mezi sebou blokuje.

**Bez společné Wi-Fi (hráči na mobilních datech)** – veřejný tunel:
```
npx cloudflared tunnel --url http://localhost:3000
```
Vypíše adresu `https://…trycloudflare.com` → vlož ji v adminu do ⚙ › Adresa v QR kódech. Projektor nech dál na `localhost`.

## Online (Render.com — zdarma)

Vercel **nejde** — běží jen na serverless funkcích, takže neudrží WebSockety ani stav hry v paměti. Render to umí:

1. render.com → přihlásit přes GitHub → **New › Blueprint** → vyber repo `Co-Na-To-CHC` (načte `render.yaml`).
2. Po nasazení: Dashboard › služba › **Environment** → zkopíruj hodnotu `SCREEN_KEY`.
3. Projektor otevři na `https://<tvoje-appka>.onrender.com/?klic=<SCREEN_KEY>` — jen s klíčem se ukáže admin QR.
4. Týmy a admin jdou normálně přes QR kódy (adresa se doplní sama).

Omezení free plánu: po ~15 min bez návštěvy server usne (první načtení pak trvá ~1 min) a při restartu se smaže stav hry i otázky upravené v adminu.
Otázky proto ulož i do repa (`data/questions.json`, export přes JSON v adminu). Na samotný ples je spolehlivější notebook + hotspot, nebo placený plán.

**Před plesem:** vyzkoušej to celé na místě s reálnou sítí a projektorem.
