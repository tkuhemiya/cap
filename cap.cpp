#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/wait.h>
#include <unistd.h>
#include <exception>

#include <baml_sdk.h>

#ifndef API_KEY
#error "DEEPSEEK_API_KEY=sk-xxx ./install.sh"
#endif

static char diff[1 << 19];
static char files[8192];
static char hist[8192];
static char branch[256];

static void slurp(const char *cmd, char *dst, size_t cap)
{
	FILE *fp;
	size_t n;

	fp = popen(cmd, "r");
	n = fp ? fread(dst, 1, cap - 1, fp) : 0;
	if (fp)
		pclose(fp);
	dst[n] = 0;
	if (n && dst[n - 1] == '\n')
		dst[n - 1] = 0;
}

static int git_commit(const char *subject, const char *body)
{
	pid_t pid;
	int st;

	pid = fork();
	if (pid == 0) {
		if (body && body[0])
			execlp("git", "git", "commit", "-m", subject, "-m", body, (char *)0);
		else
			execlp("git", "git", "commit", "-m", subject, (char *)0);
		_exit(1);
	}
	waitpid(pid, &st, 0);
	return WIFEXITED(st) && WEXITSTATUS(st) == 0;
}

int main(void)
{
	baml_sdk::CommitMessage msg;

	setenv("DEEPSEEK_API_KEY", API_KEY, 1);

	slurp("git diff --cached", diff, sizeof diff);
	if (!diff[0]) {
		fputs("No staged changes. Run 'git add' first.\n", stderr);
		return 1;
	}
	slurp("git diff --cached --name-only", files, sizeof files);
	slurp("git log --pretty=format:%s -n 10", hist, sizeof hist);
	slurp("git rev-parse --abbrev-ref HEAD", branch, sizeof branch);
	if (!hist[0])
		strcpy(hist, "Initial commit");
	if (!branch[0])
		strcpy(branch, "(detached)");

	puts("Generating commit message...");
	try {
		msg = baml_sdk::generate_commit_message(branch, files, diff, hist);
	} catch (const std::exception &e) {
		fprintf(stderr, "%s\n", e.what());
		return 1;
	}
	if (msg.subject.c_str()[0] == 0) {
		fputs("Empty subject.\n", stderr);
		return 1;
	}

	printf("\n\033[1;36m%s\033[0m\n", msg.subject.c_str());
	if (msg.body.c_str()[0])
		printf("\n\033[2m%s\033[0m\n", msg.body.c_str());

	if (!git_commit(msg.subject.c_str(), msg.body.c_str())) {
		fputs("Commit failed\n", stderr);
		return 1;
	}
	puts("Committed!");
	return 0;
}
