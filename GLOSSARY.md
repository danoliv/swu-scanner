# SWU Scanner

Sito personale, per telefono, che riconosce carte di Star Wars: Unlimited dalla fotocamera e le valuta con i prezzi Cardmarket.

## Language

**Carta**:
Una carta identificata dal suo nome completo (titolo e sottotitolo), indipendentemente dalla variante o dal set in cui è stampata. È ciò che il riconoscimento deve identificare; la Versione si sceglie a parte.
_Avoid_: Card (nell'interfaccia)

**Stampa**:
Una delle edizioni fisiche di una Carta (Standard, Foil, Hyperspace, Hyperspace Foil, Prestige, Showcase, promo, set diversi), ciascuna con un proprio Codice e un proprio prezzo Cardmarket.
_Avoid_: Variante, printing

**Prodotto**:
Una voce di Cardmarket (un `idProduct`) di una Carta, con il proprio Prezzo (uno o due: normale e foil) e una pagina dove l'utente può verificarlo. È ciò che il sito mostra per ogni versione della Carta; non sempre si sa a quale Stampa corrisponda. **Termine tecnico**: all'utente il sito mostra sempre "versioni" della carta, mai "prodotti". Un Prodotto non scompare mai da Cardmarket: può restare senza offerte in vendita, e allora non ha Prezzo.
_Avoid_: listing, articolo

**Versione**:
Quello che l'utente sceglie per una Carta: un Prodotto Cardmarket e, quando il Prodotto ha due prezzi (normale e foil), la finitura. Nei Prodotti l'etichetta V.1, V.2… segue il numero della carta in ordine crescente. L'utente può **sempre** sceglierla o cambiarla tra tutte le Stampe della Carta (promo comprese): il sito la preseleziona solo se il Codice la determina.
_Avoid_: Variante, edizione

**Promo**:
Stampa di una Carta con un codice di set proprio (per esempio `P26`, `P25`, `SECP`), nata da un evento o da un premio (Weekly Play, Prize Wall, Event Pack, Judge…). Ha un numero proprio e spesso nessun totale nel Codice. Il Catalogo ufficiale e swu-db nominano i set promo in modo diverso (`SECP` e `SECOP`).
_Avoid_: Edizione speciale, extra

**Codice**:
Set, lingua e numero stampati in basso a destra su ogni carta, nella forma `SET·LINGUA numero/totale` (es. `HMW·FR 124/272`). Identifica una Stampa in qualsiasi lingua; in alcuni set il solo numero basta, in altri no. Per le Promo il numero può comparire senza totale (es. `P26·EN 211`). La Versione si deduce dal numero: le Hyperspace hanno un numero diverso dalla normale, le Foil solo in alcuni set.
_Avoid_: ID, collector number

**Catalogo**:
L'elenco completo e locale di tutte le Carte e le loro Stampe (nomi, set, Codice, tipo di variante), usato come fonte di verità per riconoscere e per presentare i Prezzi.
_Avoid_: Dump, database

**Scansione**:
Un singolo atto di riconoscimento: da una foto scattata o caricata dalla galleria (una o più Carte).
_Avoid_: Scatto, lettura

**Lista**:
L'insieme delle Carte che l'utente ha confermato, con quantità e Versione scelta (Prodotto ed eventuale finitura).
_Avoid_: Collezione, inventario, carrello

**Prezzo**:
Il valore di tendenza (*trend*) in euro di un Prodotto (normale o foil), preso dal price guide Cardmarket aggiornato ogni giorno.
_Avoid_: Valore, quotazione

## Riconoscimento

**Esito**:
Il risultato del riconoscimento di una Carta in una foto: *Riconosciuta* (il nome giusto è proposto come sicuro), *Da scegliere* (il nome giusto è tra le prime 3 candidate) o *Non riconosciuta*.
_Avoid_: Risultato, match

**Riferimento**:
L'elenco, controllato a campione dall'utente, di quali Carte (e, dove noto, quali Stampe) ci sono in ciascuna foto del set di prova; è la verità contro cui si misura il riconoscimento. Non è perfetto: dove il sottotitolo non si legge registra solo il titolo, e per la Versione elenca le Stampe possibili.
Nei documenti di pianificazione si chiama anche "verità del set di prova".
_Avoid_: ground truth

**Modello di lettura**:
Il programma che legge il testo delle carte nelle foto. L'utente sceglie al primo avvio tra **Leggero** (più piccolo da scaricare, meno preciso) e **Preciso** (più grande, più preciso) e può cambiare scelta nelle impostazioni. Nell'interfaccia non si parla di OCR.
_Avoid_: Motore OCR (nell'interfaccia), IA

**Errore silenzioso**:
Un nome sbagliato proposto come sicuro, che entra nella Lista senza che l'utente se ne accorga.
_Avoid_: Falso positivo

