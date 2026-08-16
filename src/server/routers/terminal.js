/**
 * Terminal router — WebSocket live terminal stream
 */
import { spawn } from 'child_process';

const activeTerminals = new Map();

export function handleConnection(ws, req) {
  const agentId = new URL(req.url, `http://${req.headers.host}`).searchParams.get('agentId');
  if (!agentId) {
    ws.close(4000, 'agentId required');
    return;
  }

  console.log(`[terminal] New connection for agent: ${agentId}`);

  // In a real impl, this would connect to the agent's PTY
  // For now, we simulate a terminal stream
  const interval = setInterval(() => {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({
        type: 'output',
        data: `[${new Date().toISOString()}] Agent ${agentId} heartbeat\n`,
      }));
    }
  }, 5000);

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'input') {
        // Echo back for demo
        ws.send(JSON.stringify({
          type: 'output',
          data: `$ ${msg.data}\n`,
        }));
      }
    } catch (e) {
      // Ignore parse errors
    }
  });

  ws.on('close', () => {
    clearInterval(interval);
    console.log(`[terminal] Connection closed for agent: ${agentId}`);
  });

  ws.on('error', (err) => {
    console.error('[terminal] error:', err);
    clearInterval(interval);
  });
}

export function createTerminal(agentId, command, args = []) {
  // Spawn actual process and return PTY-like interface
  const child = spawn(command, args, {
    env: { ...process.env, AGENT_ID: agentId },
  });

  activeTerminals.set(agentId, child);

  return {
    write: (data) => child.stdin.write(data),
    onOutput: (cb) => {
      child.stdout.on('data', (data) => cb(data.toString()));
      child.stderr.on('data', (data) => cb(data.toString()));
    },
    kill: () => child.kill(),
  };
}

export function killTerminal(agentId) {
  const child = activeTerminals.get(agentId);
  if (child) {
    child.kill();
    activeTerminals.delete(agentId);
  }
}