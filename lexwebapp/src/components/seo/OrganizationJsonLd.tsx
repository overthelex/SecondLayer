export function OrganizationJsonLd() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "SecondLayer",
    "legalName": "SecondLayer",
    "url": "https://legal.org.ua",
    "logo": "https://legal.org.ua/icon-192x192.png",
    "description": "AI-powered legal technology platform",
    "sameAs": [
      "https://github.com/overthelex"
    ],
    "contactPoint": {
      "@type": "ContactPoint",
      "contactType": "customer support",
      "url": "https://legal.org.ua"
    }
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
