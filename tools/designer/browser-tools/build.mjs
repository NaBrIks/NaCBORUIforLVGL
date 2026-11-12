// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Oleg Kozhevnikov
// Node is used only by this build command; the emitted WebView module is browser-only.
import {build} from 'vite';
import {fileURLToPath} from 'node:url';
await build({configFile:false,root:fileURLToPath(new URL('./',import.meta.url)),build:{target:'es2022',outDir:fileURLToPath(new URL('../App/wwwroot/js/',import.meta.url)),emptyOutDir:false,minify:'esbuild',lib:{entry:fileURLToPath(new URL('./entry.js',import.meta.url)),formats:['es'],fileName:()=> 'browser-tools.js'},rollupOptions:{output:{inlineDynamicImports:true}}}});
