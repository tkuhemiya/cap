#include <curl/curl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/wait.h>
#include <unistd.h>

#ifndef API_KEY
#error "DEEPSEEK_API_KEY=sk-xxx ./install.sh"
#endif

static char diff[1 << 19], files[8192], hist[8192], branch[256], req[1 << 20], resp[1 << 16];

static void slurp(const char *cmd, char *dst, size_t cap) {
	FILE *fp = popen(cmd, "r");
	size_t n = fp ? fread(dst, 1, cap - 1, fp) : 0;
	if (fp)
		pclose(fp);
	dst[n] = 0;
}

int main(void) {
	slurp("git diff --cached", diff, sizeof diff);
	if (!diff[0]) {
		fputs("No staged changes. Run 'git add' first.\n", stderr);
		return 1;
	}
	slurp("git diff --cached --name-only", files, sizeof files);
	slurp("git log --pretty=format:%s -n 10", hist, sizeof hist);
	slurp("git rev-parse --abbrev-ref HEAD", branch, sizeof branch);
	puts("Generating commit message...");

	char *q = req + sprintf(req, "{\"model\":\"deepseek-v4-flash\",\"max_tokens\":500,\"messages\":[{\"role\":\"user\",\"content\":\"");
	char *src[] = {branch, files, hist, diff, NULL};
	char *tag[] = {"branch ", "files\\n", "recent\\n", "diff\\n"};
	for (int i = 0; src[i]; i++) {
		q += sprintf(q, "%s", tag[i]);
		for (char *p = src[i]; *p && q < req + sizeof req - 64; p++) {
			if (*p == '"' || *p == '\\')
				*q++ = '\\';
			if (*p == '\n') {
				*q++ = '\\';
				*q++ = 'n';
			} else
				*q++ = *p;
		}
		*q++ = '\\';
		*q++ = 'n';
	}
	strcpy(q, "First line = subject. Optional body after a blank line. No extras.\"}]}");

	FILE *out = tmpfile();
	CURL *c = curl_easy_init();
	struct curl_slist *h = curl_slist_append(NULL, "Content-Type: application/json");
	char auth[512];
	sprintf(auth, "Authorization: Bearer %s", API_KEY);
	h = curl_slist_append(h, auth);
	curl_easy_setopt(c, CURLOPT_URL, "https://api.deepseek.com/v1/chat/completions");
	curl_easy_setopt(c, CURLOPT_HTTPHEADER, h);
	curl_easy_setopt(c, CURLOPT_POSTFIELDS, req);
	curl_easy_setopt(c, CURLOPT_WRITEDATA, out);
	curl_easy_setopt(c, CURLOPT_TIMEOUT, 60L);
	if (curl_easy_perform(c) != CURLE_OK) {
		fputs("API request failed\n", stderr);
		return 1;
	}
	curl_easy_cleanup(c);
	curl_slist_free_all(h);
	rewind(out);
	resp[fread(resp, 1, sizeof resp - 1, out)] = 0;
	fclose(out);

	char *msg = strstr(resp, "\"content\":\"");
	if (!msg) {
		fputs(resp[0] ? resp : "Empty response from API.\n", stderr);
		return 1;
	}
	char text[4096], *t = text;
	for (msg += 11; *msg && *msg != '"' && t < text + sizeof text - 1; msg++) {
		if (*msg == '\\' && msg[1] == 'n') {
			*t++ = '\n';
			msg++;
		} else if (*msg == '\\' && msg[1])
			*t++ = *++msg;
		else
			*t++ = *msg;
	}
	*t = 0;
	char *body = strstr(text, "\n\n");
	if (body) {
		*body = 0;
		body += 2;
	}
	if (!text[0]) {
		fputs("Empty subject.\n", stderr);
		return 1;
	}
	printf("\n\033[1;36m%s\033[0m\n", text);
	if (body && *body)
		printf("\n\033[2m%s\033[0m\n", body);

	pid_t pid = fork();
	if (pid == 0) {
		if (body && *body)
			execlp("git", "git", "commit", "-m", text, "-m", body, (char *)0);
		else
			execlp("git", "git", "commit", "-m", text, (char *)0);
		_exit(1);
	}
	int st;
	waitpid(pid, &st, 0);
	if (!WIFEXITED(st) || WEXITSTATUS(st)) {
		fputs("Commit failed\n", stderr);
		return 1;
	}
	puts("Committed!");
	return 0;
}
