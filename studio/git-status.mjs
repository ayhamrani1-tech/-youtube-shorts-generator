// Read-only GitHub/git status report (never commits or pushes). Usage: node studio/git-status.mjs
import { spawnSync } from 'node:child_process';
import { ROOT } from './lib.mjs';

const git = (...a) => { const r = spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() : null; };
const line = (k, v) => console.log(`${k.padEnd(26)} ${v}`);

if (git('rev-parse', '--is-inside-work-tree') !== 'true') {
  line('repository', 'NONE — this folder is not a git repository (no .git)');
  line('remote / GitHub URL', 'none connected');
  line('media in git', 'n/a; .gitignore is prepared to EXCLUDE video/audio (*.mp4 *.wav *.m4a …), tools/ and out/');
  process.exit(0);
}
const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
const upstream = git('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}');
line('repository', git('rev-parse', '--show-toplevel'));
line('remote(s)', git('remote', '-v')?.split('\n').filter((l) => l.endsWith('(push)')).join(' | ') || 'none');
line('current branch', branch);
line('latest local commit', git('log', '-1', '--format=%h %ad %s', '--date=short') ?? 'no commits yet');
if (upstream) {
  spawnSync('git', ['fetch', '--quiet'], { cwd: ROOT }); // read-only update of remote refs
  line('upstream', upstream);
  line('latest remote commit', git('log', '-1', '--format=%h %ad %s', '--date=short', upstream));
  line('commits not pushed', git('rev-list', '--count', `${upstream}..HEAD`));
  line('commits not pulled', git('rev-list', '--count', `HEAD..${upstream}`));
} else line('upstream', 'none (branch has no remote tracking branch)');
const status = git('status', '--porcelain') ?? '';
line('uncommitted changes', status ? `${status.split('\n').length} file(s)` : 'none');
if (status) console.log(status.split('\n').slice(0, 30).map((s) => '   ' + s).join('\n'));
const tracked = (git('ls-files') ?? '').split('\n').filter((f) => /\.(mp4|mov|wav|m4a|mp3|aac|ogg)$/i.test(f));
line('media files tracked', tracked.length ? `${tracked.length} (e.g. ${tracked.slice(0, 3).join(', ')})` : 'none (excluded)');
