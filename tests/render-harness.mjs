import fs from 'node:fs';
import assert from 'node:assert';

const source = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8');

let moduleDef;
globalThis.window = { __ModuleLoader__: { load: (def) => { moduleDef = def; } } };
const styleTags = [];
globalThis.document = {
  createElement: () => ({ setAttribute() {}, remove() {}, textContent: '' }),
  head: { appendChild: (el) => styleTags.push(el) },
};

// ---------- minimal React ----------
const Fragment = Symbol('Fragment');
function createElement(type, props, ...children) {
  const normalized = children.length === 0 ? undefined : children.length === 1 ? children[0] : children.flat();
  return { type, props: { ...(props || {}), children: normalized } };
}
function kidsOf(tree) {
  const kids = tree === null || tree === undefined ? undefined : tree.props.children;
  if (kids === undefined) return [];
  return Array.isArray(kids) ? kids.filter((k) => k !== null && k !== undefined) : [kids];
}
function findByClass(tree, className) {
  return kidsOf(tree).find((c) => c !== null && typeof c === 'object' && c.props && c.props.className === className);
}
let hooks = [], index = 0;
let pendingEffects = [];
function useState(init) {
  const i = index++;
  if (!(i in hooks)) hooks[i] = typeof init === 'function' ? init() : init;
  const set = (v) => { hooks[i] = typeof v === 'function' ? v(hooks[i]) : v; };
  return [hooks[i], set];
}
function useMemo(fn) { index++; return fn(); }
function useCallback(fn) { index++; return fn; }
function useEffect(fn) { index++; pendingEffects.push(fn); }
const FakeReact = { createElement, useState, useMemo, useCallback, useEffect, Fragment };

let cleanups = [];
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
async function mount(Component, props) {
  index = 0;
  pendingEffects = [];
  const tree = Component(props);
  const effects = pendingEffects;
  pendingEffects = [];
  for (const eff of effects) { const cleanup = eff(); if (typeof cleanup === 'function') cleanups.push(cleanup); }
  await flush();
  index = 0;
  return Component(props);
}

// ---------- load plugin ----------
new Function('window', source)(globalThis.window);
const exported = moduleDef.factory(() => FakeReact);

// ---------- fake ctx ----------
function makeCtx(reads) {
  const registrations = [];
  const dictionaries = new Map();
  const ctx = {
    effect(fn) { const d = fn(); return () => { if (typeof d === 'function') d(); }; },
    locale: {
      register(ns, dicts) { dictionaries.set(ns, dicts); return () => dictionaries.delete(ns); },
      bind(ns) { return (key) => (dictionaries.get(ns)?.en?.[key] ?? key); },
    },
    slots: {
      inject(name, factory) { const r = factory(); registrations.push({ name, ...r }); return () => {}; },
      register(options, Component) { return { options, Component }; },
    },
    remote: {
      workspaceFiles: {
        async read(sessionId, path, range, signal) {
          const entry = reads[path];
          if (entry === undefined) { const e = new Error('workspace-file/not-found'); e.code = 'workspace-file/not-found'; throw e; }
          return { text: entry, offset: 1, lines: 1, eof: true };
        },
      },
    },
  };
  return { ctx, registrations, dictionaries };
}

const WORKS = [{ workspaceId: 'w1', path: '/Users/x/projects/hermes', title: 'hermes', sessionIds: ['s1', 's2'] }];

function makeProps(overrides) {
  return {
    sessionId: 's1',
    t: (key) => ({ ungrouped: '未分组' }[key] ?? key),
    useSessions: (sel) => sel({ byId: { s1: { id: 's1', cwd: '/Users/x/projects/hermes', title: 'T' } } }),
    useWorkspaces: (sel) => sel({ items: WORKS }),
    useSessionStatus: (sel) => sel(new Map()),
    branchReader: async () => 'main',
    ...overrides,
  };
}

// 1) basic render + branch resolution
{
  hooks = []; cleanups = [];
  const { ctx, registrations } = makeCtx({ '/Users/x/projects/hermes/.git/HEAD': 'ref: refs/heads/main\n' });
  exported.apply(ctx);
  assert.strictEqual(registrations.length, 2, 'two seats registered');
  const leading = registrations.find((r) => r.name === 'sidebar.session.row.leading');
  assert.strictEqual(leading.options.locale, 'sessionLocation');
  const tree = await mount(leading.Component, makeProps(leading.options.inject()));
  assert.strictEqual(tree.type, 'span');
  assert.strictEqual(tree.props.className, 'dsh-sl-context');
  const ws = findByClass(tree, 'dsh-sl-workspace');
  assert.strictEqual(ws.props.children, 'hermes');
  const branch = findByClass(tree, 'dsh-sl-branch');
  assert.strictEqual(branch.props.children, 'main');
  console.log('ok basic render + branch');
}

// 2) no summary -> null
{
  const { ctx, registrations } = makeCtx({});
  exported.apply(ctx);
  const leading = registrations.find((r) => r.name === 'sidebar.session.row.leading');
  const tree = leading.Component(makeProps({ useSessions: (sel) => sel({ byId: {} }) }));
  assert.strictEqual(tree, null);
  console.log('ok missing summary');
}

// 3) no cwd -> localized ungrouped
{
  const { ctx, registrations } = makeCtx({});
  exported.apply(ctx);
  const leading = registrations.find((r) => r.name === 'sidebar.session.row.leading');
  const tree = leading.Component(makeProps({
    useSessions: (sel) => sel({ byId: { s1: { id: 's1' } } }),
    useWorkspaces: (sel) => sel({ items: [] }),
  }));
  const ws = findByClass(tree, 'dsh-sl-workspace');
  assert.strictEqual(ws.props.children, '未分组');
  console.log('ok ungrouped fallback');
}

// 4) worktree pointer file
{
  hooks = [];
  const { ctx, registrations } = makeCtx({
    '/Users/x/wt/.git': 'gitdir: /Users/x/repo/.git/worktrees/wt-feature\n',
    '/Users/x/repo/.git/worktrees/wt-feature/HEAD': 'ref: refs/heads/wt/feature\n',
  });
  exported.apply(ctx);
  const leading = registrations.find((r) => r.name === 'sidebar.session.row.leading');
  const props = makeProps({
    branchReader: async () => 'wt/feature',
    useSessions: (sel) => sel({ byId: { s1: { id: 's1', cwd: '/Users/x/wt' } } }),
    useWorkspaces: (sel) => sel({ items: [] }),
  });
  const tree = await mount(leading.Component, props);
  const branch = findByClass(tree, 'dsh-sl-branch');
  assert.strictEqual(branch.props.children, 'wt/feature');
  const ws = findByClass(tree, 'dsh-sl-workspace');
  assert.strictEqual(ws.props.children, 'wt');
  console.log('ok worktree branch + cwd basename');
}

// 5) trailing seat only for status rows
{
  const { ctx, registrations } = makeCtx({});
  exported.apply(ctx);
  const trailing = registrations.find((r) => r.name === 'sidebar.session.row.trailing');
  assert.strictEqual(trailing.Component(makeProps({ useSessionStatus: (sel) => sel(new Map()) })), null);
  const statuses = new Map([['s1', { running: true }]]);
  const wrapper = trailing.Component(makeProps({ useSessionStatus: (sel) => sel(statuses) }));
  assert.ok(wrapper !== null && typeof wrapper.type === 'function', 'running row renders the label component');
  hooks = []; cleanups = [];
  const tree = await mount(wrapper.type, wrapper.props);
  assert.strictEqual(tree.props.className, 'dsh-sl-context');
  console.log('ok trailing seat gating');
}

// 6) real reader against fake files: HEAD + notfound
{
  const { ctx } = makeCtx({ '/Users/x/projects/hermes/.git/HEAD': 'ref: refs/heads/main\n' });
  exported.apply(ctx);
  // reach the reader through a component render
  const regs = [];
  const spy = {
    ...ctx,
    slots: { inject: (name, f) => { regs.push({ name, ...f() }); return () => {}; }, register: (o, C) => ({ options: o, Component: C }) },
  };
  // re-apply against the fake files ctx to obtain reader
  const readCtx = makeCtx({ '/Users/x/projects/hermes/.git/HEAD': 'ref: refs/heads/main\n' });
  exported.apply(readCtx.ctx);
  const leading = readCtx.registrations.find((r) => r.name === 'sidebar.session.row.leading');
  const reader = leading.options.inject().branchReader;
  assert.strictEqual(await reader('s1', '/Users/x/projects/hermes'), 'main');
  assert.strictEqual(await reader('s1', '/Users/x/nogit'), null);
  console.log('ok branch reader parsing');
}

// 7) branch reader failure must not throw
{
  const readCtx = makeCtx({});
  readCtx.ctx.remote.workspaceFiles.read = async () => { throw new Error('boom'); };
  exported.apply(readCtx.ctx);
  const leading = readCtx.registrations.find((r) => r.name === 'sidebar.session.row.leading');
  const reader = leading.options.inject().branchReader;
  assert.strictEqual(await reader('s1', '/Users/x/projects/hermes'), null);
  console.log('ok reader failure tolerated');
}

console.log('ALL HARNESS CHECKS PASSED');
