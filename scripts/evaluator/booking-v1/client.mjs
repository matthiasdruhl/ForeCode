// Executed by docker exec inside the same untrusted worker; replies are data.
let input = "",
  inputBytes = 0;
for await (const chunk of process.stdin) {
  inputBytes += chunk.length;
  if (inputBytes > 65536) process.exit(125);
  input += chunk;
}
const response = await fetch("http://127.0.0.1:4318", {
  method: "POST",
  body: input,
  signal: AbortSignal.timeout(2000),
});
const chunks = [];
let used = 0;
for await (const chunk of response.body) {
  used += chunk.length;
  if (used > 65536) process.exit(125);
  chunks.push(Buffer.from(chunk));
}
process.stdout.write(Buffer.concat(chunks));
