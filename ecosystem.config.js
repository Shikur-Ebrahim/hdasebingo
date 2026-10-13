module.exports = {
  apps: [
    {
      name: 'hdasebingo-bot',
      cwd: './bot',
      script: 'dist/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'hdasebingo-api',
      cwd: './api',
      script: 'dist/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: { NODE_ENV: 'production', PORT: 3002 },
    },
  ],
};
