# Explicit disposable integration, not a production runtime or CI dependency.
# Build context is tests/runtime only. TOOLCHAIN must name a locally reviewed
# immutable tooling image, checked by ID before building. Never add app data.
ARG TOOLCHAIN
FROM ${TOOLCHAIN} AS tooling
FROM docker@sha256:5e6baf67325a79f64ed3bed6863954d5e05d0f3d4e57cbdb14809346814bbfdb AS dockercli
FROM python@sha256:cb33f7f771ecec2ef1225cf39b159591a040391bd73e4c01f00fdfc4c47611d2
COPY --from=dockercli /usr/local/bin/docker /usr/local/bin/docker-real
COPY --from=tooling /usr/local/bin/node /opt/forecode-booking/bin/node
COPY --from=tooling /toolchain/node_modules /opt/forecode-booking/node_modules
COPY --from=tooling /toolchain/package.json /toolchain/package-lock.json /opt/forecode-booking/
COPY docker-shim.py /usr/local/bin/docker
RUN chmod 0755 /usr/local/bin/docker
CMD ["sleep", "3600"]
