# Operator-only recipe; this slice does not build/load or reconfigure any VM.
# Base digest observed in the existing operator's infrastructure grader.
FROM node@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d
WORKDIR /toolchain
COPY package.json package-lock.json ./
RUN chmod 0644 package.json package-lock.json && npm ci --ignore-scripts --no-audit --no-fund
ENV NEXT_TELEMETRY_DISABLED=1
USER 65534:65534
