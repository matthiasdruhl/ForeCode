# Operator-only, credential-free worker image. No installation or model call.
# Supply an independently reviewed digest-pinned base containing the complete
# pinned Codex/Node executable closure. Never snapshot an authenticated VM.
ARG AGENT_BASE
FROM ${AGENT_BASE}
USER root
RUN test -x /usr/local/bin/codex && test -x /usr/local/bin/node
WORKDIR /workspace
USER 1000:1000
ENTRYPOINT ["/usr/local/bin/node", "/run/forecode-worker.mjs"]
