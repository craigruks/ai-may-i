# List the recipes.
default:
    @just --list

# Lint, typecheck, limits and test: what every commit has to pass.
check: lint typecheck limits test

# Biome: format and lint rules, including no `Bun` global in src/.
lint:
    bunx biome check

# Strict tsc over src, tests and scripts. Emits nothing.
typecheck:
    bunx tsc -p tsconfig.json

# No runtime dependencies, and no file of 300 lines or more.
limits:
    bun scripts/check-deps.ts
    bun scripts/check-size.ts

# Run the tests. Pass a path through: `just test test/events.test.ts`.
test *args:
    bun test {{args}}

# Two outputs from one source: single-file binaries in bin/ (Bun), and ESM with types in dist/ (Node 22+).
build:
    rm -rf bin dist
    bun build src/main.ts --compile --outfile bin/may-i
    bun build src/hook-main.ts --compile --outfile bin/may-i-hook
    bunx tsc -p tsconfig.build.json
    chmod +x dist/main.js dist/hook-main.js

# Build, then link both binaries into a directory on your PATH (default ~/.local/bin).
install dir=(home_directory() / ".local" / "bin"): build
    mkdir -p {{ quote(dir) }}
    ln -sf "$PWD/bin/may-i" "$PWD/bin/may-i-hook" {{ quote(dir) }}/

# On a Mac, by hand: walk docs/manual-test.md with y/n prompts and write mac-check-results.md.
mac-check: build
    bun scripts/mac-check.ts

# Build the docs site into website/dist. It is its own package, so the CLI keeps zero runtime dependencies.
site:
    cd website && bun install --frozen-lockfile && bun run build

# Apply Biome's safe fixes and formatting.
fmt:
    bunx biome check --write
