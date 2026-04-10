interface ArticleJsonLdProps {
  title: string;
  description: string;
  publishedAt: string;
  imageUrl?: string;
  articleUrl: string;
  tags?: string[];
}

export function ArticleJsonLd({ title, description, publishedAt, imageUrl, articleUrl, tags }: ArticleJsonLdProps) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": title,
    "description": description,
    "datePublished": publishedAt,
    "image": imageUrl || "https://legal.org.ua/og-image.png",
    "url": articleUrl,
    "author": {
      "@type": "Organization",
      "name": "SecondLayer",
      "url": "https://legal.org.ua"
    },
    "publisher": {
      "@type": "Organization",
      "name": "LEX by SecondLayer",
      "url": "https://legal.org.ua",
      "logo": {
        "@type": "ImageObject",
        "url": "https://legal.org.ua/icon-192x192.png"
      }
    },
    ...(tags?.length ? { "keywords": tags.join(", ") } : {})
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
