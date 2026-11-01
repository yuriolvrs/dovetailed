// What this file is: WXT build config. It sets the extension manifest, permissions and Vite options.
// In plain terms: the settings that decide how the extension is built and what it may do.
import { defineConfig } from 'wxt';
import { ATS_ORIGINS } from './src/autofill/atsHosts';

// Public half of a locally made RSA key. Chrome derives the fixed extension ID
// kfcoedkklklmcjkiiocpdcacamiaddjj from it, and the proxy allows that origin.
// The private key was not kept. A public key is not a secret.
const CHROME_PUBLIC_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAv5Iyo4OKABjTstZpWBQCMaAgXiYjraEfhirOWXHPA6Ygnk6Zh3EXDMaUM/eNKd6BPtN2CzvapF43wWPUeJmlMJ77MyJ3nt34cGblWoX9OfEpkTE7qUi3XNgkXmCe+TpgPQlkgyyF3MLZEVkrdGE2f6DVtLOh0PiQhvJJlN0y+Y8nwLxOrK5ELeQ/uqHi9dhwabO0Yh3Z3BWIYpF1zxnXAkBHAL1UUZWyRNqhIVla8752QK8pVwUntLvkVA8AprFKLECrPxxrx2Jd8YqmU2B/mDHZVA5ctbW2g7gaWo8R0rpmR6YW+RiwUTujNyC8o2aG1UrgfdqfsYERVxW6zDZxYQIDAQAB';

const PROXY_URL_PRODUCTION = 'https://dovetailed-proxy.pimp-my-resume.workers.dev';
const PROXY_URL_DEV = 'http://localhost:8787';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: ({ browser }) => ({
    name: 'Dovetailed Autofill',
    description: 'Fills job application forms from your stored profile. It never submits a form.',
    action: {
      default_icon: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
    },
    permissions: ['activeTab', 'scripting', 'unlimitedStorage'],
    // The job boards are asked one by one. All sites is asked only when the user turns on the in-page button.
    optional_host_permissions: [...ATS_ORIGINS, '*://*/*'],
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'autofill@dovetailed.local',
              strict_min_version: '140.0',
              // Resume text goes to the proxy only after the user agrees (see ResumeSection).
              data_collection_permissions: { required: ['none'], optional: ['personallyIdentifyingInfo'] },
            },
          },
        }
      : { key: CHROME_PUBLIC_KEY }),
  }),
  // One copy of React for code imported from ../src.
  // The reused code in ../src reads import.meta.env.VITE_PROXY_URL. There is no .env file.
  vite: ({ mode }) => ({
    resolve: { dedupe: ['react', 'react-dom', 'lucide-react', 'pdfjs-dist'] },
    define: {
      'import.meta.env.VITE_PROXY_URL': JSON.stringify(mode === 'production' ? PROXY_URL_PRODUCTION : PROXY_URL_DEV),
    },
  }),
});
