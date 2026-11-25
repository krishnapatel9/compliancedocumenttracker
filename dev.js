const { spawn } = require('child_process');

console.log('[+] Starting DocShield ecosystem launcher using npm workspaces...');

const pnpmCmd = 'npm';

// Start backend
const backend = spawn(pnpmCmd, ['run', 'dev', '--workspace=backend'], {
    stdio: 'inherit',
    shell: true
});

// Start frontend
const frontend = spawn(pnpmCmd, ['run', 'dev', '--workspace=frontend'], {
    stdio: 'inherit',
    shell: true
});

// Forward stop signals
const cleanup = () => {
    console.log('\n[-] Stopping server processes...');
    backend.kill();
    frontend.kill();
    process.exit();
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);
