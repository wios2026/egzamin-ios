# Egzamin IOŚ – aplikacja do nauki (PWA)

Aplikacja działa w przeglądarce i da się ją **zainstalować** jak zwykłą aplikację na Androidzie, iPhonie i komputerze.
Działa offline, a dane (odpowiedzi, statystyki) zapisuje **tylko lokalnie** w urządzeniu.

## Zawartość
| Plik | Do czego |
|---|---|
| `index.html`, `app.js`, `style.css` | aplikacja |
| `manifest.webmanifest`, `sw.js`, `icons/` | instalacja i tryb offline (PWA) |
| `data/questions.json` | **pytania i klucz odpowiedzi – to ten plik podmieniasz** |
| `build_offline.py` | buduje jednoplikową wersję `nauka-egzamin-ios-offline.html` |
| `nauka-egzamin-ios-offline.html` | wersja „jeden plik” (komputer; bez instalacji) |

## Format pliku z pytaniami (`data/questions.json`)
```json
{
  "zbior": "ios-2026-vii",
  "nazwa": "Egzamin IOŚ – część 1, VII edycja (2026)",
  "wersja": "2026-11-14",
  "pytania": [
    {
      "id": 1,
      "pytanie": "Treść pytania",
      "odpowiedzi": { "a": "…", "b": "…", "c": "…" },
      "poprawna": "a",
      "komentarz": null
    }
  ]
}
```
* `poprawna` – litera właściwej odpowiedzi albo `null` (brak klucza: aplikacja pokaże pytanie, ale nie sprawdzi odpowiedzi).
* `komentarz` – (wersja 2) wyjaśnienie pokazywane po odpowiedzi; `null` = brak. Opcjonalne pole `uwaga` – krótka notka pokazywana po odpowiedzi.
* Opcji może być więcej niż trzy (klucze `a`, `b`, `c`, `d`…). Znak nowej linii (`\n`) w tekście jest wyświetlany jako nowa linia.
* **`zbior`** – identyfikator zbioru. Postęp jest przypisany do `zbior` i numeru `id`. Uzupełnienie kluczy/komentarzy w tym samym zbiorze **nie kasuje postępu**. Nowy egzamin = nowy `zbior` (osobny postęp).
* **`wersja`** – data/wersja; przy konflikcie z wczytanym ręcznie plikiem wygrywa nowsza.

### Jak zaktualizować pytania
1. Wersja hostowana: podmień `data/questions.json` na serwerze (aplikacja pobiera go „najpierw z sieci”, więc po odświeżeniu będzie nowy).
2. Bez serwera: w aplikacji *Ustawienia → Wczytaj plik z pytaniami (JSON)*. Plik zostaje zapamiętany na tym urządzeniu.
3. Wersja jednoplikowa: uruchom `python3 build_offline.py` (ten skrypt wpisuje też numer wersji z `app.js` do adresów plików w `index.html`).

## Instalacja na telefonie – propozycja
Aby aplikację można było zainstalować na telefonie, musi być udostępniona pod adresem **https://**. To jednorazowa, darmowa czynność:

**Zalecane: GitHub Pages (lub Cloudflare Pages / Netlify)**
1. Załóż darmowe konto na github.com i utwórz repozytorium (np. `egzamin-ios`).
2. Wgraj do niego pliki z tego folderu (przycisk *Add file → Upload files*).
3. *Settings → Pages → Deploy from a branch → main / (root)*. Po minucie dostaniesz adres `https://<login>.github.io/egzamin-ios/`.
4. Otwórz adres na telefonie i zainstaluj (poniżej). Repozytorium może być **prywatne**, jeśli masz plan umożliwiający Pages dla prywatnych repo; w przeciwnym razie adres będzie publiczny, ale nie do odgadnięcia, a w aplikacji nie ma żadnych danych osobowych (same pytania).

**Instalacja**
* **Android (Chrome):** menu ⋮ → *Zainstaluj aplikację* (lub *Dodaj do ekranu głównego*).
* **iPhone (Safari):** przycisk *Udostępnij* → *Dodaj do ekranu początkowego*.
* **Komputer (Chrome/Edge):** ikona instalacji w pasku adresu albo menu → *Zainstaluj*.

**Inne opcje**
* *Wersja jednoplikowa (`nauka-egzamin-ios-offline.html`)* – na komputerze wystarczy otworzyć plik dwuklikiem. Na telefonie nie da się jej zainstalować jak aplikacji.
* *Własny serwer w sieci domowej* – nie polecam: instalacja PWA na telefonie wymaga HTTPS.
* *Prawdziwa aplikacja APK z Google Play / App Store* – możliwa (np. PWABuilder), ale wymaga kont deweloperskich i jest zbędna.

## Gdzie są dane i jak ich nie stracić
* Dane są w pamięci przeglądarki/aplikacji **na danym urządzeniu** (telefon i komputer mają osobny postęp).
* Czyszczenie danych przeglądarki lub odinstalowanie aplikacji kasuje postęp. Safari na iPhonie może usuwać dane stron, z których długo nie korzystasz – zainstalowana aplikacja (ekran początkowy) jest na to odporna.
* *Ustawienia → Pobierz kopię postępu* tworzy plik JSON; *Wczytaj kopię postępu* pozwala go **połączyć** z postępem na innym urządzeniu albo **zastąpić**.

## Zasady działania (skrót)
* Kolejność odpowiedzi a/b/c **nie jest mieszana** (w egzaminie liczy się kolejność, np. „wszystkie odpowiedzi są poprawne”).
* Przycisk/skrót *Pokaż odpowiedź* (P) użyty **przed własną próbą** liczy się w statystykach jako błędna odpowiedź (pytanie, którego nie znałeś). Użyty po błędnej odpowiedzi nic nie zmienia (błąd już jest zapisany).
* Po błędnej odpowiedzi: *Spróbuj ponownie* (błędnie wybrana opcja zostaje oznaczona) albo *Pokaż właściwą odpowiedź*.
* Statystyki liczą **pierwszą odpowiedź** na pytanie w danej sesji – ponowne próby po błędzie nie zaniżają wyniku.
* Status pytania: *Niewyświetlone*, *Do powtórki* (ostatnia pierwsza odpowiedź błędna), *W nauce*, *Opanowane* (dwie ostatnie pierwsze odpowiedzi poprawne).
* Skróty klawiszowe na komputerze: `a`/`b`/`c` – wybór, `Enter` – dalej, `R` – ponów, `P` – pokaż odpowiedź, `S` – pomiń.
* Przerwanie sesji (✕, gest/przycisk „cofnij” w telefonie albo kliknięcie w pasku nawigacji) wymaga potwierdzenia; udzielone odpowiedzi są już zapisane, a po potwierdzeniu wracasz na ekran główny ze statystykami sesji. Pojedyncze pytanie otwarte z listy zamyka się bez pytania.
* Po zakończeniu sesji (nie ma osobnego ekranu podsumowania) ekran główny pokazuje u góry sekcję *Statystyki z ostatniej sesji* (✕ zamyka) i pod nią okno *Błędne odpowiedzi z ostatniej sesji* z przyciskiem *Powtórz niepoprawione*. Pytanie szarzeje po poprawnej odpowiedzi **w pierwszym podejściu** (przy powtórce), okno można zamknąć przyciskiem ✕, znika też po poprawieniu wszystkich błędnych pytań. Nic z tego nie jest zapamiętywane po zamknięciu aplikacji.
* Gest „ściągnij w dół, aby odświeżyć” (Android) jest wyłączony.
* Pominięcie pytania nie jest odpowiedzią (nie wpływa na statystyki). W sesjach o długości ustawionej w *Długość sesji* pominięte pytanie jest zastępowane kolejnym z puli, więc sesja kończy się po zadanej liczbie odpowiedzi; gdy pula jest mniejsza niż limit (albo „bez limitu”, powtórka błędnych), sesja jest po prostu krótsza. W statystykach ostatniej sesji widać tylko liczbę pominiętych.
* Lista *Długość sesji* ma na końcu opcję „Inna liczba…”: po wybraniu pojawia się pole na dowolną liczbę od 1 do (liczba pytań − 1); wartość jest zapamiętywana i dodawana do listy jako „N pytań (własna)”.
* Ekran Statystyki pokazuje skuteczność z ostatnich 2 dni (wcześniej 7).
* W trakcie sesji można wrócić do pytań, na które już odpowiedziałeś(aś): przycisk *Poprzednie pytanie*, przesunięcie palca w prawo (albo strzałka ←). Pytania z odpowiedzią są tylko do odczytu, pytanie pominięte jest aktywne (po odpowiedzi znika z pominiętych, a dołożone za nie, jeszcze niewyświetlone pytanie jest usuwane z sesji). *Następne* / przesunięcie w lewo wraca w stronę bieżącego pytania.
* Przycisk *Odśwież* (pasek na komputerze) / *Ustawienia → Odśwież aplikację* zastępuje Ctrl+F5: pobiera najnowszą wersję z sieci i przeładowuje aplikację. Postęp i ustawienia zostają; bez sieci przycisk niczego nie zmienia.
* Po zmianie plików aplikacji (nie danych) zwiększ numer wersji `CACHE` w `sw.js`, aby urządzenia pobrały nową wersję.
