#define _POSIX_C_SOURCE 200809L
#include <curl/curl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/wait.h>
#include <unistd.h>

#ifndef API_KEY
#error "Build with: make DEEPSEEK_API_KEY=sk-xxx"
#endif

#define MODEL "deepseek-v4-flash"
#define URL "https://api.deepseek.com/v1/chat/completions"
#define MAX_DIFF (100000 * 11 / 2)

#define BOLD "\033[1m"
#define CYAN "\033[36m"
#define GREEN "\033[32m"
#define DIM "\033[2m"
#define RESET "\033[0m"

struct buf {
	char *p;
	size_t n, cap;
};

static void die(const char *msg) {
	fprintf(stderr, "%s\n", msg);
	exit(1);
}

static void *xrealloc(void *p, size_t n) {
	void *q = realloc(p, n);
	if (!q)
		die("out of memory");
	return q;
}

static void buf_put(struct buf *b, const char *s, size_t n) {
	if (b->n + n + 1 > b->cap) {
		b->cap = b->cap ? b->cap * 2 : 4096;
		while (b->n + n + 1 > b->cap)
			b->cap *= 2;
		b->p = xrealloc(b->p, b->cap);
	}
	memcpy(b->p + b->n, s, n);
	b->n += n;
	b->p[b->n] = 0;
}

static void buf_puts(struct buf *b, const char *s) {
	buf_put(b, s, strlen(s));
}

static char *git(const char *args) {
	char cmd[512];
	snprintf(cmd, sizeof cmd, "git %s", args);
	FILE *fp = popen(cmd, "r");
	if (!fp)
		die("git failed");
	struct buf b = {0};
	char tmp[4096];
	size_t n;
	while ((n = fread(tmp, 1, sizeof tmp, fp)))
		buf_put(&b, tmp, n);
	int st = pclose(fp);
	if (st == -1 || !WIFEXITED(st) || WEXITSTATUS(st) != 0) {
		free(b.p);
		return NULL;
	}
	if (b.n && b.p[b.n - 1] == '\n')
		b.p[--b.n] = 0;
	if (!b.p)
		buf_puts(&b, "");
	return b.p;
}

static void json_escape(struct buf *b, const char *s) {
	for (; *s; s++) {
		unsigned char c = (unsigned char)*s;
		switch (c) {
		case '"':  buf_puts(b, "\\\""); break;
		case '\\': buf_puts(b, "\\\\"); break;
		case '\n': buf_puts(b, "\\n"); break;
		case '\r': buf_puts(b, "\\r"); break;
		case '\t': buf_puts(b, "\\t"); break;
		default:
			if (c < 0x20) {
				char u[8];
				snprintf(u, sizeof u, "\\u%04x", c);
				buf_puts(b, u);
			} else {
				buf_put(b, (char *)&c, 1);
			}
		}
	}
}

static char *json_string_at(const char *s) {
	while (*s == ' ' || *s == '\n' || *s == '\t' || *s == '\r')
		s++;
	if (*s != '"')
		return NULL;
	s++;
	struct buf b = {0};
	for (; *s && *s != '"'; s++) {
		if (*s == '\\' && s[1]) {
			s++;
			switch (*s) {
			case 'n': buf_puts(&b, "\n"); break;
			case 'r': buf_puts(&b, "\r"); break;
			case 't': buf_puts(&b, "\t"); break;
			case '"': buf_puts(&b, "\""); break;
			case '\\': buf_puts(&b, "\\"); break;
			case '/': buf_puts(&b, "/"); break;
			default: buf_put(&b, s, 1); break;
			}
		} else {
			buf_put(&b, s, 1);
		}
	}
	if (!b.p)
		buf_puts(&b, "");
	return b.p;
}

static const char *after_key(const char *json, const char *key) {
	char pat[64];
	snprintf(pat, sizeof pat, "\"%s\"", key);
	const char *p = strstr(json, pat);
	if (!p)
		return NULL;
	p += strlen(pat);
	while (*p == ' ' || *p == '\t' || *p == '\n' || *p == '\r')
		p++;
	if (*p != ':')
		return NULL;
	return p + 1;
}

static char *json_get(const char *json, const char *key) {
	const char *p = after_key(json, key);
	if (!p)
		return NULL;
	return json_string_at(p);
}

static size_t on_write(char *ptr, size_t size, size_t nmemb, void *ud) {
	size_t n = size * nmemb;
	buf_put(ud, ptr, n);
	return n;
}

static int commit(const char *subject, const char *body) {
	pid_t pid = fork();
	if (pid < 0)
		return -1;
	if (pid == 0) {
		if (body && body[0])
			execlp("git", "git", "commit", "-m", subject, "-m", body, (char *)0);
		else
			execlp("git", "git", "commit", "-m", subject, (char *)0);
		_exit(127);
	}
	int st;
	if (waitpid(pid, &st, 0) < 0)
		return -1;
	return (WIFEXITED(st) && WEXITSTATUS(st) == 0) ? 0 : -1;
}

int main(void) {
	if (!API_KEY[0])
		die("No API key configured.\n  Build with: make DEEPSEEK_API_KEY=sk-xxx");

	puts("Reading staged changes...");
	char *diff = git("diff --cached");
	if (!diff || !diff[0])
		die("No staged changes. Run 'git add' first.");

	char *files = git("diff --cached --name-only");
	char *history = git("log --pretty=format:%s -n 10");
	char *branch = git("rev-parse --abbrev-ref HEAD");
	if (!files)
		files = strdup("");
	if (!history || !history[0]) {
		free(history);
		history = strdup("Initial commit");
	}
	if (!branch || !branch[0]) {
		free(branch);
		branch = strdup("(detached)");
	}

	int nfiles = 0;
	for (char *p = files; *p; p++)
		if (*p == '\n')
			nfiles++;
	if (files[0])
		nfiles++;
	printf("   %d files\n", nfiles);
	printf("   model: deepseek/%s\n", MODEL);

	if (strlen(diff) > MAX_DIFF) {
		diff[MAX_DIFF] = 0;
		char *t = xrealloc(diff, MAX_DIFF + 80);
		diff = t;
		strcat(diff, "\n# Note: diff truncated.\n");
	}

	struct buf prompt = {0};
	buf_puts(&prompt, "Generate a single commit message based on the provided context.\n\n");
	buf_puts(&prompt, "## Branch\n");
	buf_puts(&prompt, branch);
	buf_puts(&prompt, "\n\n## Files Changed\n");
	for (char *p = files; *p; p++)
		if (*p == '\n')
			*p = ',';
	buf_puts(&prompt, files);
	buf_puts(&prompt, "\n\n## Diff\n```diff\n");
	buf_puts(&prompt, diff);
	buf_puts(&prompt, "\n```\n\n## Recent Commits\n```\n");
	buf_puts(&prompt, history);
	buf_puts(&prompt, "\n```\n\n## Requirements\n\n");
	buf_puts(&prompt,
		"- **Format**: No need to Follow Conventional Commits formats, Be chill and descriptive, keep it short, You don't need to mention accurately the exact changes we did. Just mention what is different from the project now after we did the commit message.\n"
		"- **Scope**: Should reflect the affected area (or be omitted if unclear)\n"
		"- **Style**: Capture the primary user-visible or developer-visible change in the subject\n\n"
		"## Body (optional)\n\n"
		"Include only if necessary to explain non-obvious changes.\n\n"
		"- Explain **what** changed and **why** (not how)\n"
		"- Use bullet points if multiple changes exist\n"
		"- Wrap lines at 72 characters\n\n"
		"## Output Format\n\n"
		"Respond with a JSON object only:\n"
		"{\n"
		"  \"subject\": \"A short descriptive commit message\",\n"
		"  \"body\": \"Optional body text explaining what changed and why. Use empty string if not needed.\"\n"
		"}\n");

	printf("   token estimate: %zu\n", prompt.n / 5);

	puts("Generating commit message...");

	struct buf body = {0};
	buf_puts(&body, "{\"model\":\"" MODEL "\",\"stream\":false,\"max_tokens\":500,"
			"\"response_format\":{\"type\":\"json_object\"},\"messages\":[");
	buf_puts(&body, "{\"role\":\"system\",\"content\":\"You write concise git commit messages. Respond in JSON format.\"},");
	buf_puts(&body, "{\"role\":\"user\",\"content\":\"");
	json_escape(&body, prompt.p);
	buf_puts(&body, "\"}]}");

	struct buf resp = {0};
	CURL *curl = curl_easy_init();
	if (!curl)
		die("curl init failed");
	struct curl_slist *hdr = NULL;
	hdr = curl_slist_append(hdr, "Content-Type: application/json");
	char auth[256];
	snprintf(auth, sizeof auth, "Authorization: Bearer %s", API_KEY);
	hdr = curl_slist_append(hdr, auth);
	curl_easy_setopt(curl, CURLOPT_URL, URL);
	curl_easy_setopt(curl, CURLOPT_HTTPHEADER, hdr);
	curl_easy_setopt(curl, CURLOPT_POSTFIELDS, body.p);
	curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE, (long)body.n);
	curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, on_write);
	curl_easy_setopt(curl, CURLOPT_WRITEDATA, &resp);
	curl_easy_setopt(curl, CURLOPT_TIMEOUT, 60L);
	CURLcode rc = curl_easy_perform(curl);
	long http = 0;
	curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &http);
	curl_slist_free_all(hdr);
	curl_easy_cleanup(curl);
	if (rc != CURLE_OK)
		die(curl_easy_strerror(rc));
	if (http != 200) {
		fprintf(stderr, "API error (%ld): %s\n", http, resp.p ? resp.p : "");
		return 1;
	}

	char *content = json_get(resp.p, "content");
	if (!content || !content[0])
		die("Empty response from API. Try again.");

	char *subject = json_get(content, "subject");
	char *cbody = json_get(content, "body");
	if (!subject || !subject[0]) {
		fprintf(stderr, "Failed to parse response:\n%s\n", content);
		return 1;
	}
	if (!cbody)
		cbody = strdup("");

	printf("\n" BOLD CYAN "%s" RESET, subject);
	if (cbody[0])
		printf("\n\n" DIM "%s" RESET, cbody);
	printf("\n\n" GREEN "cap" RESET " -> git commit -m ...\n");

	if (commit(subject, cbody) != 0)
		die("Commit failed");
	puts("Committed!");
	return 0;
}
