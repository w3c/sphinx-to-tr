FROM?=../../webassembly/spec/core/index.html
OUT?=out
FRONT?=wasm-respec.html
TOP?=wasm-top.html
CFG?=wasm-cfg.yaml

$(OUT)/index.html: $(FROM) $(FRONT) $(TOP) ./bin/sphinx-to-tr SphinxToTr.js Makefile
	./bin/sphinx-to-tr $(CFG)
