#!/usr/bin/env python3
"""Generate blog banner for the 'edrsr-vectorization-voyage' article."""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from importlib.machinery import SourceFileLoader
gen = SourceFileLoader('gen', os.path.join(os.path.dirname(__file__), 'generate-blog-banners.py')).load_module()

if __name__ == '__main__':
    gen.create_banner(
        article_id='edrsr-vectorization-voyage',
        scheme_name='tech-teal',
        category_label='Інфра / AI',
        title_lines=['33.7M судових', 'рішень у Qdrant:', 'як ми векторизуємо'],
        accent_words=['33.7M', 'Qdrant:'],
        subtitle='Voyage AI voyage-3.5, 1024 вимірів, два ключі round-robin, 63 docs/s у проді.',
        keywords=['Voyage AI', 'Qdrant', 'ЄДРСР', 'RAG'],
        fractal_type='julia',
        seed=11,
    )
    print('Done!')
