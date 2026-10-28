import { decodeBehaviorReply, rpcLimit } from "./team-rpc.mjs";
// Executed by docker exec inside the same untrusted worker; replies are data.
let input = "",
  inputBytes = 0;
for await (const chunk of process.stdin) {
  inputBytes += chunk.length;
  if (inputBytes > rpcLimit) process.exit(125);
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
  if (used > rpcLimit) process.exit(125);
  chunks.push(Buffer.from(chunk));
}
const bytes = new TextDecoder("utf-8", { fatal: true }).decode(
  Buffer.concat(chunks),
);
decodeBehaviorReply(bytes);
process.stdout.write(bytes);
