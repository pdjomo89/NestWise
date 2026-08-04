// Convex wraps server errors like "[CONVEX A(stripe:checkout)] Server Error
// Uncaught Error: <real message> at <stack>". Pull out just the real message so
// the UI can show what the server actually said.
export function errorMessage(e: unknown): string {
  let msg = e instanceof Error ? e.message : String(e);
  const u = msg.lastIndexOf('Uncaught ');
  if (u >= 0) msg = msg.slice(u + 'Uncaught '.length);
  msg = msg.replace(/^(?:Convex)?Error:\s*/i, '');
  // Strip any inlined stack frames ("... at handler (file:line)").
  msg = msg.split(/\s+at\s+\S/)[0];
  return msg.trim();
}
