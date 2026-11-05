import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    // three.js is large; put it in its own file so browsers can cache it
    // separately from our code.
    rolldownOptions: {
      output: {
        codeSplitting: { groups: [{ name: 'three', test: /node_modules[\\/]three/ }] },
      },
    },
    chunkSizeWarningLimit: 800,
  },
});
