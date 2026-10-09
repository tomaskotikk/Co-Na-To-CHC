# Co na to CHC?

Stužkovací show Creative Hill College ve stylu „Co na to Češi“.
Notebook = projektor, tvůj telefon = ovladač, telefony týmů = připojení přes QR.

## Spuštění (na notebooku)

Poprvé: `npm install`

| Co | Příkaz |
|---|---|
| **Na ples (rychlé, produkce)** | `npm run show` nebo dvojklik na `SPUSTIT SHOW.bat` |
| Vývoj / úpravy | `npm run dev` |

Pak na notebooku otevři **http://localhost:3000** (důležité: `localhost`, jen tam se ukáže admin QR).

- **F** – celá obrazovka · **M** – ztlumit · **T** – zvuková zkouška · **Shift+A** – nový admin QR (když ti umře telefon)
- Vlastní zvuky: dej mp3 do `public/sounds/` (jména v `public/sounds/README.md`), nahradí vestavěné.
- Jednou klikni kamkoli na projektoru → zapne se zvuk (prohlížeč to vyžaduje).

## Průběh

1. Projektor ukáže **admin QR** → naskenuj telefonem → „Jsem admin“. QR zmizí, odkaz už nikdo jiný nepoužije.
2. Lobby: týmy naskenují QR / zadají 4místný kód a jméno týmu. (Tým jde přidat i ručně v záložce Týmy.)
3. Záložka **Hra**: „Spustit otázku“ → na projektoru intro + 6 zakrytých karet.
4. Někdo se trefí → klepni na odpověď → vyber tým → karta se otočí a tým dostane body.
5. Netrefí se → **BZZZ** → vyber tým → bzučák + velké X. Po 3 X je tým pro otázku vyřazený.
6. Každá akce má **2 s prodlevu** s tlačítkem **ZRUŠIT** (nastavitelné v ⚙). Navíc **↶ Zpět** vrátí poslední akci.
7. „Odkrýt zbytek“ ukáže neuhodnuté karty (bez bodů). Pak **›** další otázka, nakonec Pořadí a Finále.

Volitelně: **Bzučáky** – týmům se na telefonu objeví velké tlačítko, kdo zmáčkne první, ukáže se na projektoru.

## Nová hra / reset

Server běží dál, i když zavřeš prohlížeč — hra „visí“ ve stavu, kde jsi skončil. Proto:

| Tlačítko (admin) | Co udělá |
|---|---|
| ⚙ › **Vynulovat body** | body na 0, týmy zůstanou |
| ⚙ › **Nová hra** | smaže týmy i body, nový kód hry, ty zůstaneš adminem |
| ⚙ › **Ukončit show a vše vynulovat** (i na konci po vyhlášení) | smaže vše a odpojí admin telefon — projektor znovu ukáže admin QR |

Na Renderu free se navíc server po ~15 min bez návštěvy uspí a při probuzení začne úplně načisto (nový admin QR).

## Otázky

V adminu záložka **Otázky** (jde i z notebooku – otevři stejný admin odkaz).
Odpověď + počet lidí, co ji řekli. Po uložení se seřadí: karta 1 = nejčastější. Násobič ×2/×3 pro finálové otázky.
Data jsou v `data/questions.json` (dá se upravit i ručně / přes JSON import). Stav hry se ukládá do `data/game.json`, takže restart notebooku nic nesmaže.

## Dotazník (sběr odpovědí před show)

Stránka **/dotaznik** (např. `https://co-na-to-chc.onrender.com/dotaznik`) — jméno, příjmení, žák/učitel (+ třída) a 30 otázek z `lib/survey.ts`.
Učitelé (39), učebny (27), předměty (61) a třídy (1.A–4.C: A filmaři, B grafici, C vývojáři) se vybírají ze seznamu ve stejném souboru — server nic mimo seznam neuloží.
Odpovědi jdou do Firestore (potřebuje Firebase klíč):

| Kde | Co |
|---|---|
| `survey_responses/{role-trida-jmeno-prijmeni}` | jedna odpověď: `firstName`, `lastName`, `role`, `className`, `answers.q01…q30`, `createdAt` |
| `survey/questions` | znění otázek k id `q01…q30` |

Proti spamu: jedno odeslání na zařízení (localStorage + cookie), jedno na jméno, skrytá past na boty, min. 30 s na vyplnění a limit odeslání z jedné IP.
Do hry (`data/questions.json`) se odpovědi zatím **nepřenáší**.

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

Omezení free plánu: po ~15 min bez návštěvy server usne (první načtení pak trvá ~1 min) a při restartu se smaže stav hry i otázky upravené v adminu — **pokud nemáš zapojený Firebase** (viz níže).
Na samotný ples je spolehlivější notebook + hotspot, nebo placený plán.

## Firebase (trvalé uložení)

S Firebase se stav hry i otázky ukládají do Firestore (kolekce `show`, dokumenty `game` a `questions`), takže přežijí restart Renderu i jiný notebook.
Do `data/` se ukládá pořád taky — když nejde internet, hra jede dál z lokální zálohy. Při startu se načte novější z obou.

1. console.firebase.google.com → **Add project** (Analytics není potřeba).
2. **Build › Firestore Database › Create database** → lokace `eur3` (nebo `europe-west3`) → *Start in production mode*.
3. ⚙ **Project settings › Service accounts › Generate new private key** → stáhne se JSON.
4. Lokálně: soubor přejmenuj na `firebase-key.json` a dej ho do kořene projektu (je v `.gitignore`, **nikdy ho necommituj**).
   Na Renderu: Environment › `FIREBASE_SERVICE_ACCOUNT` = celý obsah toho JSON souboru.
5. Spusť server — v konzoli musí být `Ukládání: Firebase (<projekt>) + záloha v data/`.

Bez klíče aplikace funguje jako dřív (jen `data/`).

**Před plesem:** vyzkoušej to celé na místě s reálnou sítí a projektorem.
