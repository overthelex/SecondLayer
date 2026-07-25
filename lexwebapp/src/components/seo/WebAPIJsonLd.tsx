interface WebAPIJsonLdProps {
  name: string;
  description: string;
  url: string;
  documentationUrl: string;
  provider: {
    name: string;
    url: string;
  };
  termsOfService?: string;
}

export function WebAPIJsonLd({ name, description, url, documentationUrl, provider, termsOfService }: WebAPIJsonLdProps) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebAPI",
    "name": name,
    "description": description,
    "url": url,
    "documentation": documentationUrl,
    "provider": {
      "@type": "Organization",
      "name": provider.name,
      "url": provider.url
    },
    ...(termsOfService ? { "termsOfService": termsOfService } : {})
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
