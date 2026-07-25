#!/usr/bin/env python3
"""Generate blog banner for the 'distributed-monolith' article."""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

# Reuse the existing banner generator
from importlib.machinery import SourceFileLoader
gen = SourceFileLoader('gen', os.path.join(os.path.dirname(__file__), 'generate-blog-banners.py')).load_module()

if __name__ == '__main__':
    gen.create_banner(
        article_id='distributed-monolith',
        scheme_name='tech-purple',
        category_label='Architecture',
        title_lines=['Distributed Monolith:', 'коли мікросервіси —', 'це ілюзія'],
        accent_words=['Distributed', 'Monolith:'],
        subtitle='3 сервіси, 1 PostgreSQL, спільний Redis — і правильний план еволюції.',
        keywords=['Architecture', 'Scaling', 'Monolith', 'DevOps'],
        fractal_type='mandelbrot',
        seed=2,
    )
    print('Done!')
