module.exports = {
  apps: [
    {
      name: 'wallet-collector',
      script: 'index.js',
      args: '--pool=1,2',
      cwd: '/home/ubuntu/wallet-collector',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '500M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: 'logs/wallet-collector-error.log',
      out_file: 'logs/wallet-collector-output.log',
      merge_logs: true,
    },
  ],
};
