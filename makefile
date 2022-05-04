make: buffer.c
	$(wasi_8) \
	--sysroot=$(wasi_sysroot) \
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