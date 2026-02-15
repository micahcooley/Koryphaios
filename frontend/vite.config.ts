import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const backendHttp = process.env.KORY_BACKEND_URL ?? 'http://localhost:3000';
const backendWs = backendHttp.replace(/^http/, 'ws');

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		proxy: {
			'/api': backendHttp,
			'/ws': {
				target: backendWs,
				ws: true,
			},
		},
	},
});
