#!/usr/bin/env python3
"""Generate blog banner for the 'fast-builds-aws' article."""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from importlib.machinery import SourceFileLoader
gen = SourceFileLoader('gen', os.path.join(os.path.dirname(__file__), 'generate-blog-banners.py')).load_module()

if __name__ == '__main__':
    gen.create_banner(
        article_id='fast-builds-aws',
        scheme_name='tech-coral',
        category_label='DevOps / AWS',
        title_lines=['Швидкий білд в AWS:', 'коли ноутбук', 'уже не тягне'],
        accent_words=['AWS:', 'Швидкий'],
        subtitle='Переносимо CI/CD runners у хмару: EC2 Spot, EKS, -70% часу білду.',
        keywords=['AWS', 'CI/CD', 'GitHub Actions', 'DevOps'],
        fractal_type='julia',
        seed=7,
    )
    print('Done!')
