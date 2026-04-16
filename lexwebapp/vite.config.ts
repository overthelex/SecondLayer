import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { marked } from 'marked'

/**
 * Vite plugin that regenerates sitemap.xml at build time
 * by extracting article IDs/dates from articles.ts via regex.
 */
function sitemapPlugin(): Plugin {
  return {
    name: 'generate-sitemap',
    buildStart() {
      try {
        // Dynamic import won't work here for .ts, so we inline the minimal logic
        const root = path.resolve(__dirname)
        const articlesPath = path.resolve(root, 'src/pages/BlogPage/articles.ts')
        const src = fs.readFileSync(articlesPath, 'utf-8')

        const BASE_URL = 'https://legal.org.ua'

        // Extract article ids and dates
        const ids: string[] = []
        const dates: string[] = []
        let m: RegExpExecArray | null
        const idRe = /id:\s*'([^']+)'/g
        const dateRe = /publishedAt:\s*'([^']+)'/g
        while ((m = idRe.exec(src)) !== null) ids.push(m[1])
        while ((m = dateRe.exec(src)) !== null) dates.push(m[1])
        const count = Math.min(ids.length, dates.length)

        interface Entry { loc: string; changefreq: string; priority: string; lastmod?: string }

        const staticPages: Entry[] = [
          { loc: '/', changefreq: 'daily', priority: '1.0' },
          { loc: '/blog', changefreq: 'weekly', priority: '0.9' },
          { loc: '/lex-news', changefreq: 'weekly', priority: '0.7' },
          { loc: '/investor', changefreq: 'monthly', priority: '0.6' },
          { loc: '/uk_investor', changefreq: 'monthly', priority: '0.6' },
          { loc: '/uk_investor_simplified', changefreq: 'monthly', priority: '0.6' },
          { loc: '/pitch-deck.html', changefreq: 'monthly', priority: '0.6' },
          { loc: '/developer/docs', changefreq: 'weekly', priority: '0.9' },
        ]

        const blogArticles: Entry[] = []
        for (let i = 0; i < count; i++) {
          blogArticles.push({ loc: `/blog/${ids[i]}`, changefreq: 'monthly', priority: '0.8', lastmod: dates[i] })
        }

        const legalSlugs = ['offer', 'terms', 'privacy', 'dpa', 'ai-usage', 'ai-transparency', 'refund-policy', 'attorney-offer', 'developer-offer', 'marketplace-rules']
        const legalLangs = ['en', 'ua']
        const legalPages: Entry[] = []
        for (const slug of legalSlugs) {
          for (const lang of legalLangs) {
            legalPages.push({ loc: `/${lang}/${slug}`, changefreq: 'monthly', priority: '0.5' })
          }
        }

        const dataSourcePages: Entry[] = [
          '/us/data-sources', '/uk/data-sources', '/de/data-sources',
          '/fr/data-sources', '/nl/data-sources', '/ee/data-sources',
          '/ua/data-sources', '/eu/comparison',
        ].map(loc => ({ loc, changefreq: 'monthly', priority: '0.6' }))

        const allEntries = [...staticPages, ...blogArticles, ...legalPages, ...dataSourcePages]

        const urls = allEntries.map(e => {
          const parts = [
            `    <loc>${BASE_URL}${e.loc}</loc>`,
            e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
            `    <changefreq>${e.changefreq}</changefreq>`,
            `    <priority>${e.priority}</priority>`,
          ].filter(Boolean)
          return `  <url>\n${parts.join('\n')}\n  </url>`
        }).join('\n')

        const xml = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          urls,
          '</urlset>',
          '',
        ].join('\n')

        const outputPath = path.resolve(root, 'public/sitemap.xml')
        fs.writeFileSync(outputPath, xml)
        console.log(`[sitemap] Generated sitemap.xml with ${allEntries.length} URLs (${blogArticles.length} blog articles)`)
      } catch (err) {
        console.error('[sitemap] Failed to generate sitemap:', err)
      }
    },
  }
}

/**
 * Vite plugin that generates a static HTML shell for /developer/docs
 * so crawlers can index meta tags and content without executing JavaScript.
 * The React SPA still boots and takes over for interactive users.
 */
function prerenderDocsPlugin(): Plugin {
  return {
    name: 'prerender-developer-docs',
    closeBundle() {
      try {
        const root = path.resolve(__dirname)
        const distDir = path.resolve(root, 'dist')
        const indexHtml = fs.readFileSync(path.resolve(distDir, 'index.html'), 'utf-8')

        // Extract tool groups from source to build semantic HTML
        const toolsSrc = fs.readFileSync(
          path.resolve(root, 'src/pages/DeveloperDocsPage/index.tsx'), 'utf-8'
        )

        // Extract tool names and descriptions via regex
        const toolEntries: { name: string; desc: string }[] = []
        const toolRe = /name:\s*'([^']+)',\s*description:\s*'([^']+)'/g
        let tm: RegExpExecArray | null
        while ((tm = toolRe.exec(toolsSrc)) !== null) {
          toolEntries.push({ name: tm[1], desc: tm[2] })
        }

        // Extract group titles
        const groupTitles: string[] = []
        const groupRe = /title:\s*'([^']+)'/g
        let gm: RegExpExecArray | null
        while ((gm = groupRe.exec(toolsSrc)) !== null) {
          groupTitles.push(gm[1])
        }

        const title = 'LEX AI API — документація MCP сервера | 100+ юридичних інструментів'
        const description = 'Підключіть Claude Desktop, Cursor, VS Code або ChatGPT до MCP сервера LEX AI (mcp.legal.org.ua/sse). 100+ інструментів: судова практика, законодавство, реєстри, відкриті дані, due diligence. REST API та MCP SSE транспорт.'
        const ogDescription = 'Підключіть Claude, Cursor або ChatGPT до 100+ інструментів юридичного аналізу через MCP SSE. Судова практика, законодавство, реєстри України.'
        const canonical = 'https://legal.org.ua/developer/docs'

        // Build semantic HTML for crawlers
        const toolsHtml = toolEntries.map(t =>
          `<li><code>${t.name}</code> — ${t.desc}</li>`
        ).join('\n          ')

        const categoriesHtml = groupTitles.map(g => `<li>${g}</li>`).join('\n          ')

        const semanticContent = `
    <div id="developer-docs-seo" style="max-width:820px;margin:40px auto;font-family:system-ui,sans-serif;padding:0 24px">
      <h1>LEX AI Platform API — документація MCP сервера</h1>
      <p>${description}</p>

      <h2>Підключення MCP клієнта</h2>
      <p>SSE URL: <code>https://mcp.legal.org.ua/api/v1/sse</code></p>
      <p>REST API: <code>https://platform.legal.org.ua/api/tools/:toolName</code></p>
      <p>Підтримувані клієнти: Claude Desktop, Claude Code, Cursor, VS Code, ChatGPT, Continue.dev</p>
      <pre><code>{
  "mcpServers": {
    "secondlayer": {
      "type": "sse",
      "url": "https://mcp.legal.org.ua/api/v1/sse",
      "headers": {
        "Authorization": "Bearer YOUR_API_TOKEN"
      }
    }
  }
}</code></pre>

      <h2>Категорії інструментів</h2>
      <ul>
        ${categoriesHtml}
      </ul>

      <h2>Всі інструменти (${toolEntries.length})</h2>
      <ul>
        ${toolsHtml}
      </ul>

      <h2>Автентифікація</h2>
      <p>Всі запити потребують Bearer Token. Згенеруйте API ключ у розділі Профіль → API токени.</p>

      <h2>Правові документи</h2>
      <ul>
        <li><a href="/ua/developer-offer">Оферта розробника</a></li>
        <li><a href="/ua/privacy">Політика конфіденційності</a></li>
        <li><a href="/ua/dpa">DPA (обробка даних)</a></li>
      </ul>
    </div>`

        const jsonLd = JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebAPI",
          "name": "LEX AI MCP Server",
          "description": "MCP сервер для юридичного аналізу: 100+ інструментів — судова практика (110M+ рішень), законодавство, реєстри юридичних осіб, відкриті дані, due diligence. Підключається через SSE до Claude Desktop, Cursor, VS Code, ChatGPT.",
          "url": "https://mcp.legal.org.ua/sse",
          "documentation": canonical,
          "provider": { "@type": "Organization", "name": "SecondLayer", "url": "https://legal.org.ua" },
          "termsOfService": "https://legal.org.ua/ua/developer-offer"
        })

        // Replace head meta tags in the index.html shell
        let html = indexHtml
          .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
          .replace(
            /<meta name="description" content="[^"]*"\s*\/?>/,
            `<meta name="description" content="${description}" />`
          )
          .replace(
            /<meta property="og:title" content="[^"]*"\s*\/?>/,
            `<meta property="og:title" content="${title}" />`
          )
          .replace(
            /<meta property="og:description" content="[^"]*"\s*\/?>/,
            `<meta property="og:description" content="${ogDescription}" />`
          )
          .replace(
            /<meta property="og:url" content="[^"]*"\s*\/?>/,
            `<meta property="og:url" content="${canonical}" />`
          )
          .replace(
            /<meta name="twitter:title" content="[^"]*"\s*\/?>/,
            `<meta name="twitter:title" content="${title}" />`
          )
          .replace(
            /<meta name="twitter:description" content="[^"]*"\s*\/?>/,
            `<meta name="twitter:description" content="${ogDescription}" />`
          )
          .replace(
            /<link rel="canonical" href="[^"]*"\s*\/?>/,
            `<link rel="canonical" href="${canonical}" />`
          )

        // Add WebAPI JSON-LD before closing </head>
        html = html.replace(
          '</head>',
          `<script type="application/ld+json">${jsonLd}</script>\n  </head>`
        )

        // Add semantic content before <div id="root"> so crawlers see it
        // React will render into #root and the SPA takes over
        html = html.replace(
          '<div id="root"></div>',
          `${semanticContent}\n    <div id="root"></div>\n    <script>document.getElementById('developer-docs-seo')?.remove()</script>`
        )

        // Write to dist/developer/docs/index.html
        const outDir = path.resolve(distDir, 'developer', 'docs')
        fs.mkdirSync(outDir, { recursive: true })
        fs.writeFileSync(path.resolve(outDir, 'index.html'), html)
        console.log(`[prerender] Generated developer/docs/index.html (${toolEntries.length} tools)`)
      } catch (err) {
        console.error('[prerender] Failed to generate developer/docs page:', err)
      }
    },
  }
}

/**
 * Vite plugin that generates static HTML for /blog and /blog/:slug
 * so crawlers can index blog content without executing JavaScript.
 */
function prerenderBlogPlugin(): Plugin {
  return {
    name: 'prerender-blog',
    closeBundle() {
      try {
        const root = path.resolve(__dirname)
        const distDir = path.resolve(root, 'dist')
        const indexHtml = fs.readFileSync(path.resolve(distDir, 'index.html'), 'utf-8')
        const articlesPath = path.resolve(root, 'src/pages/BlogPage/articles.ts')
        const src = fs.readFileSync(articlesPath, 'utf-8')

        const BASE_URL = 'https://legal.org.ua'

        // Parse articles from source via regex (same approach as sitemap plugin)
        interface ParsedArticle {
          id: string
          title: string
          punchline: string
          category: string
          tags: string[]
          readTime: string
          publishedAt: string
          content: string
        }

        const articles: ParsedArticle[] = []

        // Split by article object boundaries
        const articleBlocks = src.split(/\n  \{[\s]*\n/).slice(1) // skip before first article
        for (const block of articleBlocks) {
          const get = (key: string) => {
            const m = block.match(new RegExp(`${key}:\\s*'([^']*)'`))
            return m ? m[1] : ''
          }
          const id = get('id')
          const title = get('title')
          const punchline = get('punchline')
          const category = get('category')
          const readTime = get('readTime')
          const publishedAt = get('publishedAt')

          // Extract tags array
          const tagsMatch = block.match(/tags:\s*\[([^\]]*)\]/)
          const tags = tagsMatch
            ? tagsMatch[1].match(/'([^']+)'/g)?.map(t => t.replace(/'/g, '')) || []
            : []

          // Extract content (between backticks)
          const contentMatch = block.match(/content:\s*`([\s\S]*?)`/)
          const content = contentMatch ? contentMatch[1] : ''

          if (id && title) {
            articles.push({ id, title, punchline, category, tags, readTime, publishedAt, content })
          }
        }

        if (articles.length === 0) {
          console.warn('[prerender-blog] No articles parsed, skipping')
          return
        }

        // Helper to replace meta tags in the HTML shell
        function replaceMeta(html: string, opts: {
          title: string, description: string, ogTitle: string, ogDescription: string,
          ogUrl: string, ogImage?: string, canonical: string
        }): string {
          return html
            .replace(/<title>[^<]*<\/title>/, `<title>${opts.title}</title>`)
            .replace(/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${opts.description.replace(/"/g, '&quot;')}" />`)
            .replace(/<meta property="og:title" content="[^"]*"\s*\/?>/, `<meta property="og:title" content="${opts.ogTitle.replace(/"/g, '&quot;')}" />`)
            .replace(/<meta property="og:description" content="[^"]*"\s*\/?>/, `<meta property="og:description" content="${opts.ogDescription.replace(/"/g, '&quot;')}" />`)
            .replace(/<meta property="og:url" content="[^"]*"\s*\/?>/, `<meta property="og:url" content="${opts.ogUrl}" />`)
            .replace(/<meta name="twitter:title" content="[^"]*"\s*\/?>/, `<meta name="twitter:title" content="${opts.ogTitle.replace(/"/g, '&quot;')}" />`)
            .replace(/<meta name="twitter:description" content="[^"]*"\s*\/?>/, `<meta name="twitter:description" content="${opts.ogDescription.replace(/"/g, '&quot;')}" />`)
            .replace(/<link rel="canonical" href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${opts.canonical}" />`)
            // Update og:image if provided
            .replace(/<meta property="og:image" content="[^"]*"\s*\/?>/, `<meta property="og:image" content="${opts.ogImage || `${BASE_URL}/og-image.png`}" />`)
            .replace(/<meta name="twitter:image" content="[^"]*"\s*\/?>/, `<meta name="twitter:image" content="${opts.ogImage || `${BASE_URL}/og-image.png`}" />`)
        }

        // --- Generate /blog/index.html (article listing) ---
        const blogListTitle = 'LEX Blog — AI Legal Tech Articles'
        const blogListDesc = 'Статті про AI в юриспруденції, юридичні технології, аналіз судових рішень, fine-tuning LLM на судовій практиці та цифрову трансформацію правничої практики.'
        const articleListHtml = articles
          .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
          .map(a => `
        <article>
          <h2><a href="/blog/${a.id}">${a.title}</a></h2>
          <p>${a.punchline}</p>
          <div>
            <span>${a.category === 'tech' ? 'TECH' : 'LEGAL'}</span>
            <time datetime="${a.publishedAt}">${a.publishedAt}</time>
            <span>${a.readTime}</span>
          </div>
          <div>${a.tags.map(t => `<span>#${t}</span>`).join(' ')}</div>
        </article>`).join('\n')

        const blogListJsonLd = JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Blog",
          "name": "LEX AI Blog",
          "description": blogListDesc,
          "url": `${BASE_URL}/blog`,
          "publisher": { "@type": "Organization", "name": "SecondLayer", "url": BASE_URL },
          "blogPost": articles.slice(0, 20).map(a => ({
            "@type": "BlogPosting",
            "headline": a.title,
            "description": a.punchline,
            "url": `${BASE_URL}/blog/${a.id}`,
            "datePublished": a.publishedAt,
            "keywords": a.tags.join(', '),
          }))
        })

        let blogListPage = replaceMeta(indexHtml, {
          title: blogListTitle,
          description: blogListDesc,
          ogTitle: blogListTitle,
          ogDescription: blogListDesc,
          ogUrl: `${BASE_URL}/blog`,
          canonical: `${BASE_URL}/blog`,
        })
        blogListPage = blogListPage.replace('</head>', `<script type="application/ld+json">${blogListJsonLd}</script>\n  </head>`)
        blogListPage = blogListPage.replace(
          '<div id="root"></div>',
          `<div id="blog-seo" style="max-width:820px;margin:40px auto;font-family:system-ui,sans-serif;padding:0 24px">
      <h1>LEX AI Blog</h1>
      <p>${blogListDesc}</p>
      ${articleListHtml}
    </div>
    <div id="root"></div>
    <script>document.getElementById('blog-seo')?.remove()</script>`
        )

        const blogDir = path.resolve(distDir, 'blog')
        fs.mkdirSync(blogDir, { recursive: true })
        fs.writeFileSync(path.resolve(blogDir, 'index.html'), blogListPage)

        // --- Generate /blog/:slug/index.html for each article ---
        let articleCount = 0
        for (const article of articles) {
          const articleUrl = `${BASE_URL}/blog/${article.id}`
          const ogImage = `${BASE_URL}/blog-banners/${article.id}.png`
          const truncatedPunchline = article.punchline.length > 200
            ? article.punchline.slice(0, 197) + '...'
            : article.punchline

          let articlePage = replaceMeta(indexHtml, {
            title: `${article.title} | LEX Blog`,
            description: truncatedPunchline,
            ogTitle: article.title,
            ogDescription: truncatedPunchline,
            ogUrl: articleUrl,
            ogImage,
            canonical: articleUrl,
          })

          // Add og:type article
          articlePage = articlePage.replace(
            '<meta property="og:type" content="website" />',
            '<meta property="og:type" content="article" />'
          )

          // JSON-LD BlogPosting
          const articleJsonLd = JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            "headline": article.title,
            "description": article.punchline,
            "url": articleUrl,
            "image": ogImage,
            "datePublished": article.publishedAt,
            "keywords": article.tags.join(', '),
            "articleSection": article.category === 'tech' ? 'Technology' : 'Legal',
            "inLanguage": "uk",
            "publisher": { "@type": "Organization", "name": "SecondLayer", "url": BASE_URL },
            "mainEntityOfPage": { "@type": "WebPage", "@id": articleUrl }
          })

          articlePage = articlePage.replace('</head>', `<script type="application/ld+json">${articleJsonLd}</script>\n  </head>`)

          // Convert markdown content to HTML for crawlers
          let contentHtml = ''
          try {
            contentHtml = marked.parse(article.content) as string
          } catch {
            contentHtml = `<pre>${article.content.replace(/</g, '&lt;')}</pre>`
          }

          const semanticArticle = `<article id="blog-article-seo" style="max-width:820px;margin:40px auto;font-family:system-ui,sans-serif;padding:0 24px">
      <header>
        <span>${article.category === 'tech' ? 'TECH' : 'LEGAL'}</span>
        <time datetime="${article.publishedAt}">${article.publishedAt}</time>
        <span>${article.readTime}</span>
      </header>
      <h1>${article.title}</h1>
      <p><em>${article.punchline}</em></p>
      ${contentHtml}
      <footer>
        <div>${article.tags.map(t => `<span>#${t}</span>`).join(' ')}</div>
        <nav><a href="/blog">← Всі статті</a></nav>
      </footer>
    </article>`

          articlePage = articlePage.replace(
            '<div id="root"></div>',
            `${semanticArticle}\n    <div id="root"></div>\n    <script>document.getElementById('blog-article-seo')?.remove()</script>`
          )

          const articleDir = path.resolve(blogDir, article.id)
          fs.mkdirSync(articleDir, { recursive: true })
          fs.writeFileSync(path.resolve(articleDir, 'index.html'), articlePage)
          articleCount++
        }

        console.log(`[prerender-blog] Generated blog/index.html + ${articleCount} article pages`)
      } catch (err) {
        console.error('[prerender-blog] Failed to generate blog pages:', err)
      }
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isDocker = !!process.env.DOCKER_ENV
  const certsDir = path.resolve(__dirname, 'certs')
  const certFile = path.join(certsDir, 'local.legal.org.ua+2.pem')
  const keyFile = path.join(certsDir, 'local.legal.org.ua+2-key.pem')
  const hasLocalCerts = !isDocker && fs.existsSync(certFile) && fs.existsSync(keyFile)

  return {
    plugins: [react(), sitemapPlugin(), prerenderDocsPlugin(), prerenderBlogPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    define: {
      'import.meta.env.VITE_BUILD_TIME': JSON.stringify(new Date().toISOString()),
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(
        process.env.APP_VERSION ||
        (() => { try { return execSync('git tag -l "v*" --sort=-version:refname 2>/dev/null').toString().trim().split('\n')[0]; } catch { return ''; } })() ||
        (() => { try { const v = fs.readFileSync(path.resolve(__dirname, '..', 'VERSION'), 'utf8'); const m = v.match(/BACKEND_VERSION=(.+)/); return m ? m[1] : v.trim(); } catch { return 'dev'; } })()
      ),
      'import.meta.env.VITE_APP_FRONTEND_VERSION': JSON.stringify(
        process.env.APP_FRONTEND_VERSION ||
        (() => { try { return execSync('git tag -l "fe-v*" --sort=-version:refname 2>/dev/null').toString().trim().split('\n')[0]; } catch { return ''; } })() ||
        (() => { try { const v = fs.readFileSync(path.resolve(__dirname, '..', 'VERSION'), 'utf8'); const m = v.match(/FRONTEND_VERSION=(.+)/); return m ? m[1] : ''; } catch { return ''; } })()
      ),
    },
    build: {
      outDir: mode === 'staging' ? 'dist-staging' : 'dist',
      sourcemap: mode === 'staging' || mode === 'development',
    },
    server: {
      host: true,
      allowedHosts: ['local.legal.org.ua', 'local-platform.legal.org.ua', 'usa.legal.org.ua', 'uk.legal.org.ua', 'de.legal.org.ua', 'fr.legal.org.ua', 'nl.legal.org.ua', 'ee.legal.org.ua', 'eu.legal.org.ua', 'ua.legal.org.ua'],
      ...(hasLocalCerts && {
        https: {
          cert: fs.readFileSync(certFile),
          key: fs.readFileSync(keyFile),
        },
      }),
      hmr: {
        host: 'local.legal.org.ua',
        ...(isDocker ? { clientPort: 443, protocol: 'wss' } : { port: 5173, protocol: 'wss' }),
      },
      watch: isDocker ? {
        usePolling: true,
        interval: 1000,
      } : undefined,
      proxy: mode === 'development' ? {
        '/api': {
          target: 'https://stage.legal.org.ua',
          changeOrigin: true,
        },
      } : undefined,
    },
  }
})
