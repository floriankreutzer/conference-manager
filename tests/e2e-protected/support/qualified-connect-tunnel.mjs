import { connect, Socket } from 'node:net';

// The caller has already admitted its fixed qualified host. This relay always
// targets loopback and transfers the TLS bytes without changing authentication.
export function connectQualifiedTunnel({ socket, head, edgePort, sockets }) {
  if (!(socket instanceof Socket) || !Buffer.isBuffer(head) || !(sockets instanceof Set)
    || !Number.isSafeInteger(edgePort) || edgePort < 1024 || edgePort > 65535) {
    throw new TypeError('PROTECTED_QUALIFIED_TUNNEL_INVALID');
  }
  const upstream = connect({ host: '127.0.0.1', port: edgePort });
  sockets.add(upstream);
  upstream.on('close', () => sockets.delete(upstream));
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
  socket.on('close', () => upstream.destroy());
  upstream.setTimeout(20000, () => { upstream.destroy(); socket.destroy(); });
  upstream.once('connect', () => {
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head.length) upstream.write(head);
    socket.pipe(upstream); upstream.pipe(socket);
  });
}
