module.exports = [
	{
		path: 'dist/smartfolder.cjs.production.min.js',
		limit: '500 KB',
		modifyEsbuildConfig: (config) => {
			// Mark Node.js built-in modules and large dependencies as external
			// This prevents esbuild from trying to bundle them
			config.external = [
				...(config.external || []),
				'fs',
				'fs/promises',
				'path',
				'os',
				'crypto',
				'stream',
				'util',
				'assert',
				'tty',
				'worker_threads',
				'pdf-parse',
				'chokidar',
				'minimatch',
				'node:fs',
				'node:fs/promises',
				'node:stream',
				'node:path',
				'readdirp',
			];
			return config;
		},
	},
	{
		path: 'dist/smartfolder.esm.js',
		limit: '500 KB',
		modifyEsbuildConfig: (config) => {
			// Mark Node.js built-in modules and large dependencies as external
			// This prevents esbuild from trying to bundle them
			config.external = [
				...(config.external || []),
				'fs',
				'fs/promises',
				'path',
				'os',
				'crypto',
				'stream',
				'util',
				'assert',
				'tty',
				'worker_threads',
				'pdf-parse',
				'chokidar',
				'minimatch',
				'node:fs',
				'node:fs/promises',
				'node:stream',
				'node:path',
				'readdirp',
			];
			return config;
		},
	},
];
