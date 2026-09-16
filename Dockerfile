FROM docker.io/cloudflare/sandbox:0.12.9@sha256:4a56a37a3cfd9b38d65bb4b5d0b341e6490a3a4c0226274ae4c1cca4948e85fe

# cloudflare/sandbox's server and backup tools (mksquashfs, fuse-overlayfs)
# expect to run as root inside the container. The user-facing toolchain is
# still isolated by the Sandbox runtime, so running as root here is correct.
RUN npm install -g pnpm@12.4.2 wrangler@4.133.0
