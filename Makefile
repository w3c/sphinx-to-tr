FROM?=../../webassembly/spec/core/index.html
OUT?=out
FRONT?=wasm-respec.html
TOP?=wasm-top.html

$(OUT)/index.html: $(FROM) $(FRONT) $(TOP) ./bin/sphinx-to-tr SphinxToTr.js Makefile
	./bin/sphinx-to-tr $(FROM) $(FRONT) $(TOP) $(OUT)
