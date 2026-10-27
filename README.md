# Egzamin teoretyczny – prawo jazdy (kat. A)

Aplikacja Angular (katalog `app/`) do nauki pytań i próbnych egzaminów w formie zbliżonej
do egzaminu państwowego. Języki: polski, angielski, niemiecki.

## Uruchomienie

```
./start.sh                   # WSL/Linux: buduje aplikację przy pierwszym uruchomieniu i startuje serwer
start.bat                    # Windows: wymaga wcześniej zbudowanej aplikacji (app/dist)
```
Otwórz http://localhost:8000. `tools/serve.py` serwuje zbudowaną aplikację (`app/dist/prawko/browser`)
i katalog `resources/`, obsługuje żądania Range (przewijanie filmów) oraz trasy aplikacji (`/learn` itd.).

## Praca nad kodem

Wymaga Node.js ≥ 22.22 (np. przez nvm). W katalogu `app/`:
```
npm install
npm run resources            # terminal 1: serwer resources/ na porcie 8000
npm start                    # terminal 2: ng serve na http://localhost:4200 (proxy /resources -> :8000)
npm run build                # wersja produkcyjna do app/dist/
```

Struktura `app/src/app/`:
- `core/` – modele, tłumaczenia interfejsu (`translations.ts`), serwisy: `BankService` (bazy pytań),
  `ProgressService` (postęp nauki w localStorage), `ExamService` (losowanie, punktacja, zasady `EXAM_RULES`),
  `I18nService` (język),
- `shared/question-media.ts` – obraz/film pytania z przyciskiem START i obsługą `startAt`,
- `pages/` – `home`, `learn`, `exam`, `result`.

## Filmy (WMV → MP4)

Przeglądarki nie odtwarzają WMV, dlatego filmy są konwertowane do MP4 (H.264) przez ffmpeg.
Zainstaluj ffmpeg (`winget install Gyan.FFmpeg` lub `sudo apt install ffmpeg`) i uruchom ponownie import:

```
python tools/import_bank.py --xlsx BAZA_pytań_na_egzamin_na_prawo_jazdy_15122020.xlsx --media-src katA --category A --bank katA --name-pl "Kategoria A" --name-en "Category A" --name-de "Klasse A"
```
Już skonwertowane pliki są pomijane, więc import można przerywać i wznawiać.

## Struktura zasobów

```
resources/
  banks.json                 rejestr baz pytań (aplikacja pokazuje wybór, gdy jest ich więcej)
  katA/questions.json        pytania: treść PL/EN/DE, odpowiedzi, poprawna odp., media
  katA/media/                obrazy i filmy MP4
  katA/missing_media.txt     pliki wymienione w XLSX, których brak w katalogu źródłowym
```

Przykładowe pytanie:
```json
{
 "id": "99", "type": "yesno", "scope": "basic", "points": 3, "block": "W16",
 "text": { "pl": "Czy w tej sytuacji…", "en": "Are you obliged…", "de": "Bist du…" },
 "correct": "T",
 "media": { "type": "video", "file": "AK_D05_06_org.mp4", "source": "AK_D05_06_org.wmv", "startAt": 0 }
}
```
- `type`: `yesno` (poprawna `T`/`N`) lub `abc` (dodatkowo `answers.A/B/C`, poprawna `A`/`B`/`C`),
- `media.startAt`: sekunda filmu, od której zaczyna się odtwarzanie (zachowywana przy ponownym imporcie),
- `media.missing`: plik niedostępny – pytanie jest pomijane w egzaminie (opcja na stronie głównej).

**Rozszerzanie:** nową bazę (np. kat. B) dodaje się tym samym skryptem z innymi `--category`/`--bank`;
istniejącą bazę można uzupełniać ręcznie, edytując `questions.json` (pytania spoza XLSX nie są
usuwane przy ponownym imporcie) i dokładając pliki do `media/`.

## Zasady egzaminu próbnego

32 pytania: 20 podstawowych (10×3, 6×2, 4×1 pkt) i 12 specjalistycznych (6×3, 4×2, 2×1 pkt),
maks. 74 pkt, zaliczenie od 68 pkt, 25 minut. Pytania podstawowe: 20 s na zapoznanie się,
START uruchamia film (odtwarzany raz), potem 15 s na odpowiedź. Pytania specjalistyczne: 50 s.
Bez możliwości powrotu do poprzedniego pytania. Parametry są w `EXAM_RULES` w `app/src/app/core/exam.service.ts`.
