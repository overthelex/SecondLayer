import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isDocker = !!process.env.DOCKER_ENV
  const certsDir = path.resolve(__dirname, 'certs')
  const certFile = path.join(certsDir, 'local.legal.org.ua+2.pem')
  const keyFile = path.join(certsDir, 'local.legal.org.ua+2-key.pem')
  const hasLocalCerts = !isDocker && fs.existsSync(certFile) && fs.existsSync(keyFile)

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_BUILD_TIME': JSON.stringify(new Date().toISOString()),
    },
    build: {
      outDir: mode === 'staging' ? 'dist-staging' : 'dist',
      sourcemap: mode === 'staging' || mode === 'development',
      rollupOptions: {
        output: {
          manualChunks: {
            'admin': [
              './src/pages/AdminOverviewPage.tsx',
              './src/pages/AdminMonitoringPage.tsx',
              './src/pages/AdminUsersPage.tsx',
              './src/pages/AdminCostsPage.tsx',
              './src/pages/AdminDataSourcesPage.tsx',
              './src/pages/AdminBillingPage.tsx',
              './src/pages/AdminInfrastructurePage.tsx',
              './src/pages/AdminContainersPage.tsx',
              './src/pages/AdminConfigPage.tsx',
              './src/pages/AdminDBComparePage.tsx',
              './src/pages/AdminServicePricingPage.tsx',
              './src/pages/AdminTerminalPage.tsx',
              './src/pages/AdminZOStatsPage.tsx',
              './src/pages/AdminUserActivityPage.tsx',
              './src/pages/AdminBulkScrapePage.tsx',
            ],
          },
        },
      },
    },
    server: {
      host: true,
      allowedHosts: ['local.legal.org.ua', 'usa.legal.org.ua', 'uk.legal.org.ua', 'de.legal.org.ua', 'fr.legal.org.ua', 'nl.legal.org.ua', 'ee.legal.org.ua', 'eu.legal.org.ua', 'ua.legal.org.ua'],
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
