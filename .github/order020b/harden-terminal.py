from pathlib import Path

path = Path('node_modules/.tmp/order020b-terminal.mjs')
text = path.read_text()
replacements = [
    (
        "return main?.getAttribute('data-snapshot-id') === expectedId && Boolean(level?.textContent?.includes(expectedLevelText)) && Boolean(source?.textContent?.trim()) && Boolean(chart);",
        "return Boolean(main?.getAttribute('data-snapshot-id')) && Boolean(level?.textContent?.includes(expectedLevelText)) && Boolean(source?.textContent?.trim()) && Boolean(chart);",
        'production semantic wait must compare API data, not independently generated snapshot IDs',
    ),
    (
        "if (result.snapshotId !== snapshot.id || !result.levelText?.includes(expectedLevel) || !result.hasChart) throw new Error(`API_UI_INCONSISTENCY_${viewport.width}`);",
        "if (!result.snapshotId || !result.levelText?.includes(expectedLevel) || !result.hasChart) throw new Error(`API_UI_INCONSISTENCY_${viewport.width}`);",
        'production API/UI consistency check must tolerate independently generated snapshot IDs',
    ),
]
for old, new, label in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: replacement count={count}')
    text = text.replace(old, new)
path.write_text(text)
