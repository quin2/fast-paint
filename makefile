make: buffer.c
	clang \
	--target=wasm32-unknown-wasi \
	-ferror-limit=50 \
	--sysroot /tmp/wasi-libc \
	-nostartfiles -Wl,\
	--import-memory -Wl,\
	--no-entry -Wl,\
	--export-all -Wl,\
	--stack-first -Wl,\
	--initial-memory=65536000 \
	-Os \
	-DNDEBUG \
	-o buffer.wasm buffer.c