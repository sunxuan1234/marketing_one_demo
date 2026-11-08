"""Assemble the reviewed specifications and SQL for a single GPT handoff."""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
docs = root / 'docs'
parts = ['# 营销一体化：GPT完整开发文档\n\n版本 V4.2 · 2026-11-09\n\n本文件由分章规格及SQL原文合并，基于当前优化后的原型。后端尚未实现，SQL尚未在数据库执行。修改时先编辑分章/生成源，再运行 scripts/build_delivery_doc.py。\n']
for name in ['01-成果分析与决策.md', '02-完整开发规格.md', '03-数据库字典.md', '04-原型映射与报表.md', '05-GPT开发指令.md', '06-验证记录.md']:
    parts.append('\n---\n\n' + (docs / name).read_text(encoding='utf-8'))
parts.append('\n---\n\n# 附录：SQL执行说明\n\n' + (docs / 'sql/README.md').read_text(encoding='utf-8'))
for name in ['001-baseline.sql', '002-unified-code.sql', '003-report-catalog.sql']:
    parts.append(f'\n## {name}\n\n```sql\n' + (docs / 'sql' / name).read_text(encoding='utf-8') + '\n```\n')
target = docs / '营销一体化-GPT完整开发文档.md'
target.write_text('\n'.join(parts), encoding='utf-8')
print(f'Generated {target.name}: {target.stat().st_size} bytes')
