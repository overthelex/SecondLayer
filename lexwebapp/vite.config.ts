import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

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
          { loc: '/developer/docs', changefreq: 'monthly', priority: '0.7' },
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

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isDocker = !!process.env.DOCKER_ENV
  const certsDir = path.resolve(__dirname, 'certs')
  const certFile = path.join(certsDir, 'local.legal.org.ua+2.pem')
  const keyFile = path.join(certsDir, 'local.legal.org.ua+2-key.pem')
  const hasLocalCerts = !isDocker && fs.existsSync(certFile) && fs.existsSync(keyFile)

  return {
    plugins: [react(), sitemapPlugin()],
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
