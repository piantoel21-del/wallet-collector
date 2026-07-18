module.exports = {
  apps: [
    {
      name: 'wallet-collector',
      script: 'index.js',
      cwd: __dirname,
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '200M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: 'logs/wallet-collector-error.log',
      out_file: 'logs/wallet-collector-output.log',
      merge_logs: true,
    },
  ],
};
