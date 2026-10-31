# Public command feedback reaches the native CLI as ordinary shell output.
# Do not recurse into checks or rewrite a command/history. Preserve its status.
trap 'forecode_status=$?; trap - EXIT; /usr/local/bin/node /run/team-workflow.mjs checkpoint; exit "$forecode_status"' EXIT
