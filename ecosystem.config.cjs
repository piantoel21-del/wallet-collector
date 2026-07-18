module.exports = {
  apps: [
    {
      name: 'meteora-pool1',
      script: 'index.js',
      args: '--pool=1',
      cwd: __dirname,
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '200M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: 'logs/pool1-error.log',
      out_file: 'logs/pool1-output.log',
      merge_logs: true,
    },
    {
      name: 'meteora-pool2',
      script: 'index.js',
      args: '--pool=2',
      cwd: __dirname,
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '200M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: 'logs/pool2-error.log',
      out_file: 'logs/pool2-output.log',
      merge_logs: true,
    },
  ],
};
