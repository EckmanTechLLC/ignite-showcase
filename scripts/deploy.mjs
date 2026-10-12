#!/usr/bin/env node
// Build every demo and commit the output to the orphan `deploy` branch (ADR-005 section 8).
// Usage: node scripts/deploy.mjs [--push]
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wt = join(root, '.deploy-worktree');
const BRANCH = 'deploy';
const DEMOS = ['launch', 'datacenter'];
const push = process.argv.includes('--push');

const run = (cmd, args, cwd = root, opts = {}) =>
  execFileSync(cmd, args, { cwd, stdio: opts.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit', encoding: 'utf8' });
const git = (args, cwd = root) => run('git', args, cwd, { capture: true }).trim();
const tryGit = (args, cwd = root) => {
  try {
    return git(args, cwd);
  } catch {
    return null;
  }
};

const sha = git(['rev-parse', 'HEAD']);
const shortSha = git(['rev-parse', '--short', 'HEAD']);
const dirty = git(['status', '--porcelain']) !== '';
if (dirty) console.warn('warning: working tree has uncommitted changes; BUILD.txt will say so');

// 1. build everything
run('npm', ['run', 'build']);
for (const d of DEMOS) {
  if (!existsSync(join(root, d, 'dist', 'index.html'))) throw new Error(`${d}/dist/index.html missing after build`);
}

// 2. worktree on the deploy branch (created as an orphan if it does not exist anywhere)
if (existsSync(wt)) tryGit(['worktree', 'remove', '--force', wt]);
rmSync(wt, { recursive: true, force: true });
git(['worktree', 'prune']);

const hasLocal = tryGit(['rev-parse', '--verify', '--quiet', `refs/heads/${BRANCH}`]) !== null;
if (hasLocal) {
  git(['worktree', 'add', wt, BRANCH]);
} else if (tryGit(['fetch', 'origin', BRANCH]) !== null) {
  git(['worktree', 'add', '-b', BRANCH, wt, `origin/${BRANCH}`]);
} else {
  git(['worktree', 'add', '--detach', wt]);
  git(['checkout', '--orphan', BRANCH], wt);
  git(['rm', '-rf', '--quiet', '.'], wt);
}

try {
  // 3. replace demo folders with dist contents
  for (const entry of readdirSync(wt)) {
    if (entry === '.git') continue;
    rmSync(join(wt, entry), { recursive: true, force: true });
  }
  for (const d of DEMOS) {
    mkdirSync(join(wt, d), { recursive: true });
    cpSync(join(root, d, 'dist'), join(wt, d), { recursive: true });
  }
  writeFileSync(join(wt, 'BUILD.txt'), `source: ${sha}${dirty ? ' (dirty)' : ''}\ndate: ${new Date().toISOString()}\n`);

  // 4. commit
  git(['add', '-A'], wt);
  if (tryGit(['diff', '--cached', '--quiet'], wt) !== null) {
    console.log('deploy: nothing changed');
  } else {
    git(['commit', '--quiet', '-m', `deploy: ${shortSha}`], wt);
    console.log(`committed deploy: ${shortSha}`);
  }
} finally {
  tryGit(['worktree', 'remove', '--force', wt]);
}

// 5. push only on request (never forced)
if (push) run('git', ['push', '-u', 'origin', BRANCH]);
else console.log('not pushing (pass --push to push the deploy branch)');
