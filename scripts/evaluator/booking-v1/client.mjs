// Executed by docker exec inside the same untrusted worker; replies are data.
let input = "";
for await (const c of process.stdin) input += c;
const response = await fetch("http://127.0.0.1:4318", {
  method: "POST",
  body: input,
  signal: AbortSignal.timeout(2000),
});
const body = await response.text();
if (body.length > 65536) process.exit(125);
process.stdout.write(body);
