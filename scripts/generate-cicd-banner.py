#!/usr/bin/env python3
"""Generate blog banner for CI/CD blue-green article."""

import sys
sys.path.insert(0, '/home/vovkes/SecondLayer/scripts')

# Reuse the existing banner generation logic
exec(open('/home/vovkes/SecondLayer/scripts/generate-blog-banners.py').read().split("if __name__")[0])

banners = [
    {
        'article_id': 'ci-cd-blue-green-self-healing-tests',
        'scheme_name': 'tech-teal',
        'category_label': 'DevOps / CI/CD',
        'title_lines': ['CI/CD з blue-green', 'preview та', 'self-healing тестами'],
        'accent_words': ['blue-green', 'self-healing'],
        'subtitle': '17 PR за 4 дні. 422 тести. 8 ітерацій проти Vitest OOM.',
        'keywords': ['Blue-Green', 'Vitest', 'GitHub Actions', 'OOM'],
        'fractal_type': 'julia',
        'seed': 3,
    },
]

print(f'Generating {len(banners)} banners...')
for b in banners:
    create_banner(**b)
print('Done!')
