FROM docker.io/cloudflare/sandbox:0.12.1@sha256:ea9b35e61c800eddbc4450fad333e5dd26033a06f7d36624388b0711bef9f8c5

# cloudflare/sandbox's server and backup tools (mksquashfs, fuse-overlayfs)
# expect to run as root inside the container. The user-facing toolchain is
# still isolated by the Sandbox runtime, so running as root here is correct.
RUN npm install -g pnpm@11.13.1 wrangler@4.132.0
