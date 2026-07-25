#!/usr/bin/env python3
"""Generate blog banner for opendata-sync-pipeline-engineering article."""

import sys
sys.path.insert(0, '/home/vovkes/SecondLayer/scripts')

# Reuse the existing banner generation logic
exec(open('/home/vovkes/SecondLayer/scripts/generate-blog-banners.py').read().split("if __name__")[0])

banners = [
    {
        'article_id': 'opendata-sync-pipeline-engineering',
        'scheme_name': 'tech-navy',
        'category_label': 'Data Pipeline',
        'title_lines': ['340M+ записів.', '15 державних API.', 'Один pipeline.'],
        'accent_words': ['340M+', '15', 'pipeline'],
        'subtitle': 'Multi-IP імпорт, cron-scheduler, freshness-моніторинг для відкритих даних.',
        'keywords': ['OpenData', 'Multi-IP', 'Scheduler', 'PostgreSQL'],
        'fractal_type': 'mandelbrot',
        'seed': 5,
    },
]

print(f'Generating {len(banners)} banners...')
for b in banners:
    create_banner(**b)
print('Done!')
