#!/usr/bin/env python3
"""Generate blog banners for 4 new articles (2026-03-24)."""

import sys
sys.path.insert(0, '/home/vovkes/SecondLayer/scripts')

# Reuse the existing banner generation logic
exec(open('/home/vovkes/SecondLayer/scripts/generate-blog-banners.py').read().split("if __name__")[0])

banners = [
    {
        'article_id': 'ai-changes-lawyer-work-2026',
        'scheme_name': 'legal-amber',
        'category_label': 'Legal AI',
        'title_lines': ['Як AI змінює', 'роботу адвоката', 'у 2026 році'],
        'accent_words': ['AI', '2026'],
        'subtitle': '56 інструментів замість 12 вкладок. Екзоскелет для мозку юриста.',
        'keywords': ['AI', 'LegalTech', 'Адвокат', 'Автоматизація'],
        'fractal_type': 'julia',
        'seed': 5,
    },
    {
        'article_id': 'spain-legal-expansion',
        'scheme_name': 'tech-coral',
        'category_label': 'Expansion',
        'title_lines': ['Вихід на ринок', 'Іспанії: від Києва', 'до Мадрида'],
        'accent_words': ['Іспанії:', 'Мадрида'],
        'subtitle': 'BOE, CENDOJ, гео-детекція, 4 мови. Одна кодова база.',
        'keywords': ['Spain', 'i18n', 'BOE', 'CENDOJ'],
        'fractal_type': 'mandelbrot',
        'seed': 4,
    },
    {
        'article_id': 'developer-docs-api-guide',
        'scheme_name': 'tech-navy',
        'category_label': 'Developer Docs',
        'title_lines': ['56+ юридичних', 'MCP інструментів', 'через один API'],
        'accent_words': ['56+', 'API'],
        'subtitle': 'curl, TypeScript, Python, SSE. Claude Desktop за 2 хвилини.',
        'keywords': ['MCP', 'REST', 'SSE', 'Documentation'],
        'fractal_type': 'julia',
        'seed': 1,
    },
    {
        'article_id': 'diia-integration-challenges',
        'scheme_name': 'tech-purple',
        'category_label': 'Auth / Gov API',
        'title_lines': ['Дія.Підпис:', 'технічні виклики', 'інтеграції'],
        'accent_words': ['Дія.Підпис:'],
        'subtitle': 'ECDSA, Redis mismatch, nginx proto. 4 фікси за добу.',
        'keywords': ['Diia', 'ECDSA', 'Redis', 'Auth'],
        'fractal_type': 'mandelbrot',
        'seed': 2,
    },
]

print(f'Generating {len(banners)} banners...')
for b in banners:
    create_banner(**b)
print('Done!')
