#!/usr/bin/env python3
"""Import bazy pytań z pliku XLSX do formatu resources aplikacji.

Tworzy/aktualizuje:
  resources/<bank>/questions.json  - treść pytań (PL/EN/DE), odpowiedzi, media
  resources/<bank>/media/          - obrazy (kopiowane) i filmy (konwertowane WMV -> MP4)
  resources/banks.json             - rejestr dostępnych baz pytań

Skrypt korzysta wyłącznie z biblioteki standardowej Pythona. Do konwersji filmów
potrzebny jest ffmpeg (w PATH lub wskazany przez --ffmpeg). Bez ffmpeg pytania
są importowane, a filmy oznaczane jako brakujące - wystarczy uruchomić skrypt
ponownie po zainstalowaniu ffmpeg.

Ponowny import nie nadpisuje ręcznie ustawionych pól mediów (startAt) ani pytań
dodanych ręcznie do questions.json (pytania bez odpowiednika w XLSX zostają).

Przykład:
  python tools/import_bank.py --xlsx BAZA.xlsx --media-src katA --category A \\
      --bank katA --name-pl "Kategoria A" --name-en "Category A" --name-de "Klasse A"
"""
import argparse
import concurrent.futures
import json
import os
import re
import shutil
import subprocess
import sys
import zipfile
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESOURCES = os.path.join(ROOT, "resources")
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
VIDEO_EXT = {".wmv", ".avi", ".mpg", ".mpeg", ".mov", ".mkv", ".flv", ".mp4", ".webm"}
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}
LANGS = ("pl", "en", "de")

# Kolumny arkusza (nagłówki z oficjalnej bazy pytań)
COL = {
    "id": "Numer pytania",
    "text_pl": "Pytanie", "a_pl": "Odpowiedź A", "b_pl": "Odpowiedź B", "c_pl": "Odpowiedź C",
    "text_en": "Pytanie ENG", "a_en": "Odpowiedź ENG A", "b_en": "Odpowiedź ENG B", "c_en": "Odpowiedź ENG C",
    "text_de": "Pytanie DE", "a_de": "Odpowiedź DE A", "b_de": "Odpowiedź DE B", "c_de": "Odpowiedź DE C",
    "correct": "Poprawna odp", "media": "Media", "scope": "Zakres struktury",
    "points": "Liczba punktów", "categories": "Kategorie", "block": "Nazwa bloku",
}


def read_xlsx(path):
    """Zwraca wiersze pierwszego arkusza jako listę słowników {nagłówek: wartość}."""
    z = zipfile.ZipFile(path)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall(NS + "si"):
            shared.append("".join(t.text or "" for t in si.iter(NS + "t")))
    sheet = sorted(n for n in z.namelist() if re.match(r"xl/worksheets/sheet\d+\.xml$", n))[0]
    rows = []
    for r in ET.fromstring(z.read(sheet)).iter(NS + "row"):
        row = {}
        for c in r.findall(NS + "c"):
            col = 0
            for ch in re.match(r"[A-Z]+", c.get("r")).group():
                col = col * 26 + ord(ch) - 64
            t, v = c.get("t"), c.find(NS + "v")
            if t == "s":
                val = shared[int(v.text)]
            elif t == "inlineStr":
                val = "".join(x.text or "" for x in c.iter(NS + "t"))
            else:
                val = v.text if v is not None else ""
            row[col - 1] = (val or "").strip()
        rows.append([row.get(i, "") for i in range(max(row) + 1 if row else 0)])
    header = rows[0]
    return [dict(zip(header, r + [""] * (len(header) - len(r)))) for r in rows[1:] if any(r)]


def find_ffmpeg(explicit):
    if explicit:
        return explicit
    return shutil.which("ffmpeg") or shutil.which("ffmpeg.exe")


def convert_video(ffmpeg, src, dst):
    tmp = dst + ".part.mp4"
    cmd = [ffmpeg, "-y", "-loglevel", "error", "-i", src,
           "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-c:v", "libx264", "-preset", "veryfast",
           "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k",
           "-movflags", "+faststart", tmp]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        if os.path.exists(tmp):
            os.remove(tmp)
        return res.stderr.strip()[-300:] or "ffmpeg error"
    os.replace(tmp, dst)
    return None


def build_question(row):
    correct = row[COL["correct"]].upper()
    q = {
        "id": row[COL["id"]],
        "type": "yesno" if correct in ("T", "N") else "abc",
        "scope": "specialist" if row[COL["scope"]].upper().startswith("SPEC") else "basic",
        "points": int(row[COL["points"]] or 1),
        "block": row[COL["block"]],
        "categories": [c.strip() for c in row[COL["categories"]].split(",") if c.strip()],
        "text": {lang: row[COL["text_" + lang]] for lang in LANGS if row[COL["text_" + lang]]},
        "correct": correct,
    }
    if q["type"] == "abc":
        q["answers"] = {
            letter: {lang: row[COL[letter.lower() + "_" + lang]] for lang in LANGS
                     if row[COL[letter.lower() + "_" + lang]]}
            for letter in ("A", "B", "C")
        }
    return q


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--xlsx", required=True, help="plik XLSX z bazą pytań")
    ap.add_argument("--media-src", required=True, help="katalog z oryginalnymi materiałami multimedialnymi")
    ap.add_argument("--category", required=True, help="kategoria prawa jazdy do zaimportowania, np. A")
    ap.add_argument("--bank", required=True, help="identyfikator bazy (nazwa katalogu w resources), np. katA")
    ap.add_argument("--name-pl"), ap.add_argument("--name-en"), ap.add_argument("--name-de")
    ap.add_argument("--ffmpeg", help="ścieżka do ffmpeg (domyślnie z PATH)")
    ap.add_argument("--jobs", type=int, default=max(1, (os.cpu_count() or 2) - 1), help="równoległe konwersje")
    args = ap.parse_args()

    bank_dir = os.path.join(RESOURCES, args.bank)
    media_dir = os.path.join(bank_dir, "media")
    os.makedirs(media_dir, exist_ok=True)
    qpath = os.path.join(bank_dir, "questions.json")

    previous = {}
    if os.path.exists(qpath):
        with open(qpath, encoding="utf-8") as f:
            previous = {q["id"]: q for q in json.load(f).get("questions", [])}

    src_files = {f.lower(): f for f in os.listdir(args.media_src)}
    ffmpeg = find_ffmpeg(args.ffmpeg)
    if not ffmpeg:
        print("UWAGA: nie znaleziono ffmpeg - filmy nie zostaną skonwertowane (oznaczone jako brakujące).")

    rows = [r for r in read_xlsx(args.xlsx) if args.category in r[COL["categories"]].split(",")]
    questions, conversions, missing = [], {}, []
    for row in rows:
        q = build_question(row)
        name = row[COL["media"]]
        if name:
            base, ext = os.path.splitext(name)
            kind = "video" if ext.lower() in VIDEO_EXT else "image"
            out_name = base + ".mp4" if kind == "video" else name
            media = {"type": kind, "file": out_name, "source": name}
            if kind == "video":
                media["startAt"] = 0
            old = (previous.get(q["id"]) or {}).get("media") or {}
            if old.get("source") == name and "startAt" in old:
                media["startAt"] = old["startAt"]
            src = src_files.get(name.lower())
            dst = os.path.join(media_dir, out_name)
            if os.path.exists(dst):
                pass
            elif src is None:
                media["missing"] = True
                missing.append((q["id"], name))
            elif kind == "image":
                shutil.copy2(os.path.join(args.media_src, src), dst)
            elif ffmpeg:
                conversions[dst] = (os.path.join(args.media_src, src), media)
            else:
                media["missing"] = True
            q["media"] = media
        questions.append(q)

    if conversions:
        print(f"Konwersja {len(conversions)} filmów do MP4 ({args.jobs} równolegle)...")
        done = 0
        with concurrent.futures.ThreadPoolExecutor(args.jobs) as pool:
            futures = {pool.submit(convert_video, ffmpeg, src, dst): (dst, m) for dst, (src, m) in conversions.items()}
            for fut in concurrent.futures.as_completed(futures):
                dst, media = futures[fut]
                err = fut.result()
                done += 1
                if err:
                    media["missing"] = True
                    print(f"  BŁĄD {os.path.basename(dst)}: {err}")
                if done % 25 == 0 or done == len(conversions):
                    print(f"  {done}/{len(conversions)}")

    # pytania dodane ręcznie (spoza XLSX) zostają w bazie
    imported = {q["id"] for q in questions}
    questions += [q for qid, q in previous.items() if qid not in imported]

    names = {k: v for k, v in (("pl", args.name_pl), ("en", args.name_en), ("de", args.name_de)) if v}
    with open(qpath, "w", encoding="utf-8") as f:
        json.dump({"id": args.bank, "name": names or {"pl": args.bank}, "mediaDir": "media",
                   "questions": questions}, f, ensure_ascii=False, indent=1)

    banks_path = os.path.join(RESOURCES, "banks.json")
    banks = {"banks": []}
    if os.path.exists(banks_path):
        with open(banks_path, encoding="utf-8") as f:
            banks = json.load(f)
    entry = {"id": args.bank, "name": names or {"pl": args.bank}, "path": f"{args.bank}/questions.json"}
    banks["banks"] = [b for b in banks["banks"] if b["id"] != args.bank] + [entry]
    with open(banks_path, "w", encoding="utf-8") as f:
        json.dump(banks, f, ensure_ascii=False, indent=2)

    n_missing = sum(1 for q in questions if (q.get("media") or {}).get("missing"))
    print(f"Zapisano {len(questions)} pytań do {os.path.relpath(qpath, ROOT)}")
    print(f"Pytania z brakującymi mediami: {n_missing} (brak w katalogu źródłowym: {len(missing)})")
    if missing:
        report = os.path.join(bank_dir, "missing_media.txt")
        with open(report, "w", encoding="utf-8") as f:
            f.writelines(f"{qid}\t{name}\n" for qid, name in missing)
        print(f"Lista brakujących plików: {os.path.relpath(report, ROOT)}")


if __name__ == "__main__":
    sys.exit(main())
