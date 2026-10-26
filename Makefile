CC ?= gcc
CFLAGS ?= -O2 -Wall -Wextra

ifeq ($(DEEPSEEK_API_KEY),)
$(error pass DEEPSEEK_API_KEY=sk-xxx — the key is compiled in, not read at runtime)
endif

.PHONY: all install clean

all: cap

cap: cap.c
	$(CC) $(CFLAGS) -DAPI_KEY='"$(DEEPSEEK_API_KEY)"' -o cap cap.c -lcurl

install: cap
	./install.sh

clean:
	rm -f cap
