#!/usr/bin/env python3
"""
Telc B1 kelimelerine örnek cümle + Türkçe çeviri üretir.
Kullanım: python generate_examples.py
Gereksinim: ANTHROPIC_API_KEY env var
"""

import json
import os
import sys
import time
import anthropic

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
FILES = {
    'eg_b1_1.json': 'B1.1',
    'eg_b1_2.json': 'B1.2',
}
BATCH_SIZE = 25  # kelime/istek


def make_prompt(words: list[dict]) -> str:
    lines = []
    for i, w in enumerate(words, 1):
        lines.append(f"{i}. DE: {w['de']} | TR: {w['tr']}")
    word_list = '\n'.join(lines)

    return f"""Aşağıdaki Almanca B1 seviye kelimeler için:
- Kısa, doğal bir Almanca örnek cümle yaz (B1 seviyesi, max 12 kelime)
- Cümlenin Türkçe çevirisini yaz

Sadece JSON array döndür, başka hiçbir şey yazma:
[
  {{"ex": "Almanca cümle.", "ex_tr": "Türkçe çeviri."}},
  ...
]

Kelimeler ({len(words)} adet):
{word_list}"""


def generate_batch(client: anthropic.Anthropic, words: list[dict]) -> list[dict]:
    prompt = make_prompt(words)
    message = client.messages.create(
        model='claude-haiku-4-5-20251001',
        max_tokens=4096,
        messages=[{'role': 'user', 'content': prompt}],
    )
    raw = message.content[0].text.strip()

    # JSON bloğunu çıkar
    start = raw.find('[')
    end = raw.rfind(']') + 1
    if start == -1 or end == 0:
        raise ValueError(f"JSON bulunamadı:\n{raw[:200]}")

    return json.loads(raw[start:end])


def process_file(client: anthropic.Anthropic, filename: str, label: str):
    path = os.path.join(DATA_DIR, filename)
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Zaten örnek cümlesi olanları atla
    todo = [i for i, w in enumerate(data) if not w.get('ex')]
    print(f'\n{label}: {len(data)} kelime, {len(todo)} tanesinde örnek cümle yok')

    if not todo:
        print('  → Tümü zaten dolu, atlanıyor.')
        return

    for batch_start in range(0, len(todo), BATCH_SIZE):
        batch_indices = todo[batch_start:batch_start + BATCH_SIZE]
        batch_words = [data[i] for i in batch_indices]
        batch_num = batch_start // BATCH_SIZE + 1
        total_batches = (len(todo) + BATCH_SIZE - 1) // BATCH_SIZE

        print(f'  Batch {batch_num}/{total_batches} ({len(batch_words)} kelime)...', end=' ', flush=True)

        retries = 0
        while retries < 3:
            try:
                results = generate_batch(client, batch_words)
                if len(results) != len(batch_words):
                    raise ValueError(f'Beklenen {len(batch_words)}, gelen {len(results)}')
                break
            except Exception as e:
                retries += 1
                print(f'Hata ({retries}/3): {e}', end=' ', flush=True)
                if retries == 3:
                    print('ATLANDI')
                    results = [{'ex': '', 'ex_tr': ''} for _ in batch_words]
                else:
                    time.sleep(2)

        for idx, result in zip(batch_indices, results):
            data[idx]['ex']    = result.get('ex', '')
            data[idx]['ex_tr'] = result.get('ex_tr', '')

        print('✓')

        # Rate limit için küçük bekleme
        if batch_num < total_batches:
            time.sleep(0.5)

    # Dosyayı güncelle
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    filled = sum(1 for w in data if w.get('ex'))
    print(f'  → Kaydedildi: {filled}/{len(data)} kelimede örnek cümle var')


def main():
    api_key = os.environ.get('ANTHROPIC_API_KEY')
    if not api_key:
        print('HATA: ANTHROPIC_API_KEY environment variable tanımlı değil.')
        print('VPS\'te: export ANTHROPIC_API_KEY=sk-ant-...')
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)
    print('Claude API bağlantısı kuruldu.')

    for filename, label in FILES.items():
        process_file(client, filename, label)

    print('\nTamamlandı! Sunucuyu yeniden başlat: pm2 restart deutsch-app')


if __name__ == '__main__':
    main()
