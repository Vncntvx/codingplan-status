const net = require('net');
const { SOCKET_PATH } = require('./daemon-utils');

function sendDaemonRequest(request, options = {}) {
  const timeoutMs = options.timeoutMs || 3000;

  return new Promise((resolve, reject) => {
    const socket = net.createConnection(SOCKET_PATH);
    let buffer = '';
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      socket.off('connect', onConnect);
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('close', onClose);
    };

    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      socket.destroy();
      if (err) {
        reject(err);
      } else {
        resolve(value);
      }
    };

    const onConnect = () => {
      socket.write(JSON.stringify(request) + '\n');
    };

    const onData = (data) => {
      buffer += data.toString();
      const newlineIdx = buffer.indexOf('\n');
      if (newlineIdx === -1) return;
      const raw = buffer.slice(0, newlineIdx);
      try {
        finish(null, JSON.parse(raw));
      } catch {
        finish(new Error('Invalid response'));
      }
    };

    const onError = (err) => finish(err);
    const onClose = () => {
      if (!settled) {
        finish(new Error('Connection closed'));
      }
    };

    const timer = setTimeout(() => {
      finish(new Error('Connection timeout'));
    }, timeoutMs);

    socket.on('connect', onConnect);
    socket.on('data', onData);
    socket.on('error', onError);
    socket.on('close', onClose);
  });
}

function sendDaemonCommand(command, options) {
  return sendDaemonRequest({ command }, options);
}

module.exports = {
  sendDaemonCommand,
  sendDaemonRequest,
};
