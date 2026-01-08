// PM2 configuration for production deployment
// Environment variables are loaded from backend/.env file
module.exports = {
  apps: [
    {
      name: 'helpdesk-backend',
      script: './dist/server.js',
      cwd: '/var/www/helpdesk/backend',
      instances: 1,
      exec_mode: 'fork',
      env_file: '.env', // Load environment variables from .env file
      error_file: '~/.pm2/logs/helpdesk-backend-error.log',
      out_file: '~/.pm2/logs/helpdesk-backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      restart_delay: 3000,
      max_restarts: 5,
      min_uptime: '10s'
    },
    {
      name: 'helpdesk-frontend',
      script: 'npx',
      args: 'serve dist -l 3001 -s',
      cwd: '/var/www/helpdesk/frontend',
      instances: 1,
      exec_mode: 'fork',
      error_file: '~/.pm2/logs/helpdesk-frontend-error.log',
      out_file: '~/.pm2/logs/helpdesk-frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M'
    }
  ]
};
