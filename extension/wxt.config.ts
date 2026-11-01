// What this file is: WXT build config. It sets the extension manifest, permissions and Vite options.
// In plain terms: the settings that decide how the extension is built and what it may do.
import { defineConfig } from 'wxt';
import { ATS_ORIGINS } from './src/autofill/atsHosts';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: ({ browser }) => ({
    name: 'Dovetailed Autofill',
    description: 'Fills job application forms from your stored profile. It never submits a form.',
    permissions: ['activeTab', 'scripting', 'unlimitedStorage'],
    optional_host_permissions: ATS_ORIGINS,
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'autofill@dovetailed.local',
              strict_min_version: '140.0',
              data_collection_permissions: { required: ['none'] },
            },
          },
        }
      : {}),
  }),
  // One copy of React for code imported from ../src.
  vite: () => ({
    resolve: { dedupe: ['react', 'react-dom', 'lucide-react'] },
  }),
});
