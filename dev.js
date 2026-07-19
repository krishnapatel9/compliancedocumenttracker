const { spawn } = require('child_process');

console.log('[+] Starting DocShield ecosystem launcher...');

// Under Windows process environments, child_process.spawn requires targeting 'npm.cmd' rather than 'npm'
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

// Start backend
const backend = spawn(npmCmd, ['run', 'dev', '--workspace=backend'], {
    stdio: 'inherit',
    shell: true
});

// Start frontend
const frontend = spawn(npmCmd, ['run', 'dev', '--workspace=frontend'], {
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
