window.__ModuleLoader__.load({
  id: 'dsh-session-location',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Locale namespace owned by this plugin. */
    const NS = 'sessionLocation';
    /** Stable ids of the two Session-row seats this plugin fills. */
    const LEADING_ID = 'session-location';
    const TRAILING_ID = 'session-location-trailing';
    /** How long a resolved branch stays fresh before the next row mount re-reads it. */
    const BRANCH_TTL_MS = 60 * 1000;
    /** Upper bound on one workspace-file read. */
    const READ_TIMEOUT_MS = 5000;
    /** Plugin-owned class names; the style sheet below is the only host-DOM contract. */
    const CONTEXT_CLASS = 'dsh-sl-context';

    const en = {
      ungrouped: 'Ungrouped',
    };
    const zh = {
      ungrouped: '未分组',
    };

    /**
     * Flat-list presentation for one Session row.
     *
     * The host row is a single 32px line (16px lead cell, title, relative time,
     * trailing icons). This sheet gives a row that carries the location label one
     * extra text line under the title. Everything is scoped to the shipped flat
     * list (`[class*="_flatList"]`) and to the row's own `data-row-key`, so a
     * grouped list or an unknown row shape keeps the untouched layout.
     */
    const CSS = [
      '[data-row-key^="session:"]{position:relative}',
      '[class*="_flatList"] [data-row-key^="session:"]:has(.' + CONTEXT_CLASS + '){height:44px;align-items:flex-start;padding-top:4px;padding-bottom:4px}',
      '.' + CONTEXT_CLASS + '{display:none;position:absolute;' +
        'left:calc(var(--dsh-sidebar-row-padding,12px) - var(--dsh-sidebar-paint-inset,0px) + 16px + var(--dsh-sidebar-label-gap,6px));' +
        'right:8px;bottom:3px;align-items:center;gap:5px;min-width:0;' +
        'font-size:11px;line-height:14px;color:var(--dsw-alias-label-secondary);' +
        'pointer-events:none;white-space:nowrap;overflow:hidden}',
      '[class*="_flatList"] .' + CONTEXT_CLASS + '{display:flex}',
      '.dsh-sl-workspace{flex:0 1 auto;max-width:58%;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-sl-branch{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.9}',
      '.dsh-sl-sep{flex:none;opacity:.45}',
      '.dsh-sl-icon{flex:none;width:12px;height:12px;display:inline-flex;align-items:center;justify-content:center;opacity:.8}',
    ].join('\n');

    function basename(path) {
      if (typeof path !== 'string') return '';
      const trimmed = path.replace(/[\\/]+$/, '');
      const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
      return cut >= 0 ? trimmed.slice(cut + 1) : trimmed;
    }

    /** Turn the first line of a git HEAD file into a branch name. */
    function branchFromHeadText(text) {
      if (typeof text !== 'string') return undefined;
      const line = text.split('\n')[0].trim();
      if (line === '') return undefined;
      const ref = /^ref:\s*refs\/heads\/(.+)$/.exec(line);
      if (ref !== null) return ref[1].trim() || undefined;
      if (/^[0-9a-f]{7,40}$/i.test(line)) return line.slice(0, 7);
      return undefined;
    }

    /** Accept the value shapes a generated Remote result may arrive in. */
    function extractText(result) {
      if (result === null || result === undefined) return undefined;
      if (typeof result === 'string') return result;
      if (typeof result.text === 'string') return result.text;
      if (typeof result.value === 'object' && result.value !== null) return extractText(result.value);
      return undefined;
    }

    /** Resolved branches by working directory; one read per directory per TTL. */
    const branchCache = new Map();

    function peekBranch(directory) {
      const entry = branchCache.get(directory);
      if (entry === undefined || entry.promise !== undefined) return undefined;
      if (Date.now() - entry.at > BRANCH_TTL_MS) return undefined;
      return entry.value;
    }

    function requestBranch(directory, load) {
      const entry = branchCache.get(directory);
      if (entry !== undefined && entry.promise !== undefined) return entry.promise;
      if (entry !== undefined && Date.now() - entry.at <= BRANCH_TTL_MS) return Promise.resolve(entry.value);
      const promise = (async () => {
        let value = null;
        try {
          const loaded = await load();
          if (typeof loaded === 'string' && loaded !== '') value = loaded;
        } catch {
          value = null;
        }
        if (branchCache.size > 300) branchCache.clear();
        branchCache.set(directory, { value, at: Date.now(), promise: undefined });
        return value;
      })();
      branchCache.set(directory, { value: entry === undefined ? null : entry.value, at: Date.now(), promise });
      return promise;
    }

    /**
     * Read one Session workspace's current branch through the existing
     * `remote.workspaceFiles` face: `.git/HEAD` for a normal checkout, or the
     * `gitdir:` pointer file first for a linked worktree. Missing files, a
     * non-repository directory, or `to-large` failures simply yield no branch.
     */
    function createBranchReader(ctx) {
      return async function branchOf(sessionId, cwd) {
        if (typeof cwd !== 'string' || cwd === '') return null;
        const files = ctx.remote === undefined ? undefined : ctx.remote.workspaceFiles;
        if (files === undefined || typeof files.read !== 'function') return null;
        const base = cwd.replace(/[\\/]+$/, '');
        const readFirstLines = async (path) => {
          const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
            ? AbortSignal.timeout(READ_TIMEOUT_MS)
            : undefined;
          const result = await files.read(sessionId, path, { offset: 1, limit: 4 }, signal);
          return extractText(result);
        };
        try {
          const direct = branchFromHeadText(await readFirstLines(base + '/.git/HEAD'));
          if (direct !== undefined) return direct;
        } catch {
          /* not a checkout, or a linked-worktree pointer file: try the pointer. */
        }
        try {
          const pointer = await readFirstLines(base + '/.git');
          const match = pointer === undefined ? null : /gitdir:\s*(.+)/.exec(pointer);
          if (match !== null) {
            const gitdir = match[1].trim();
            const absolute = gitdir.charAt(0) === '/' ? gitdir : base + '/' + gitdir;
            const branch = branchFromHeadText(await readFirstLines(absolute.replace(/[\\/]+$/, '') + '/HEAD'));
            if (branch !== undefined) return branch;
          }
        } catch {
          /* no readable git administration directory. */
        }
        return null;
      };
    }

    function useBranch(directory, sessionId, branchReader) {
      const [branch, setBranch] = React.useState(() => {
        if (directory === undefined) return null;
        const cached = peekBranch(directory);
        return typeof cached === 'string' ? cached : null;
      });
      React.useEffect(() => {
        if (directory === undefined || branchReader === undefined) return undefined;
        let cancelled = false;
        const cached = peekBranch(directory);
        if (typeof cached === 'string') setBranch(cached);
        requestBranch(directory, () => branchReader(sessionId, directory)).then((value) => {
          if (!cancelled) setBranch(typeof value === 'string' ? value : null);
        });
        return () => {
          cancelled = true;
        };
      }, [directory, sessionId, branchReader]);
      return branch;
    }

    /** One frozen empty result, so a selector snapshot keeps a stable identity. */
    const EMPTY_ITEMS = Object.freeze([]);

    const SELECT_ITEMS = (state) => (state === undefined || state === null || !Array.isArray(state.items) ? EMPTY_ITEMS : state.items);

    function useLocation(props) {
      const { sessionId, useSessions, useWorkspaces, t, branchReader } = props;
      const selectSummary = React.useCallback(
        (state) => (state === undefined || state === null || state.byId === undefined ? undefined : state.byId[sessionId]),
        [sessionId],
      );
      const summary = typeof useSessions === 'function' ? useSessions(selectSummary) : undefined;
      const items = typeof useWorkspaces === 'function' ? useWorkspaces(SELECT_ITEMS) : EMPTY_ITEMS;
      const cwd = summary !== undefined && summary !== null && typeof summary.cwd === 'string' && summary.cwd !== ''
        ? summary.cwd
        : undefined;
      const workspaceName = React.useMemo(() => {
        for (const item of Array.isArray(items) ? items : []) {
          if (item === null || item === undefined || !Array.isArray(item.sessionIds)) continue;
          if (item.sessionIds.indexOf(sessionId) === -1) continue;
          const title = typeof item.title === 'string' && item.title !== '' ? item.title : basename(item.path);
          if (title !== '') return title;
        }
        return cwd === undefined ? t('ungrouped') : basename(cwd) || t('ungrouped');
      }, [items, sessionId, cwd, t]);
      const branch = useBranch(cwd, sessionId, branchReader);
      if (summary === undefined || summary === null) return null;
      return { workspaceName, branch };
    }

    /**
     * Closed-folder glyph copied from the Host's product icon set
     * (`dsh-client-ui-primitives` artwork for `folder-close`, regular weight),
     * so the label matches the folder rows and Workspace headings around it.
     */
    function folderIcon(key) {
      return h(
        'svg',
        {
          key,
          className: 'dsh-sl-icon',
          viewBox: '0 0 16 16',
          width: 12,
          height: 12,
          fill: 'none',
          strokeWidth: 1.2,
          'aria-hidden': 'true',
        },
        h('path', {
          d: 'M1.50439 3.11059C1.50439 2.55831 1.95211 2.1106 2.50439 2.1106H5.43389C5.67773 2.1106 5.91318 2.19969 6.09593 2.36113L7.71649 3.79265C7.89924 3.95409 8.1347 4.04319 8.3785 4.04319H13.4958C14.0481 4.04319 14.4958 4.4909 14.4958 5.04319V12.8894C14.4958 13.4417 14.0481 13.8894 13.4958 13.8894H2.50439C1.95211 13.8894 1.50439 13.4417 1.50439 12.8894V4.04319V3.11059Z',
          stroke: 'currentColor',
        }),
        h('path', { d: 'M3.63501 7.66614H12.3647', stroke: 'currentColor' }),
      );
    }

    /** Branch glyph from the same Host icon set (`branch-outline`, regular weight). */
    function branchIcon(key) {
      return h(
        'svg',
        {
          key,
          className: 'dsh-sl-icon',
          viewBox: '0 0 16 16',
          width: 12,
          height: 12,
          fill: 'none',
          strokeWidth: 1.2,
          'aria-hidden': 'true',
        },
        h('path', {
          d: 'M1.01503 8.0001L5.6964 8.0001C6.41913 8.0001 6.78049 8.0001 7.12115 7.91951C7.4232 7.84804 7.71233 7.73014 7.97821 7.57C8.27809 7.38939 8.5364 7.13669 9.05303 6.63129L11.3281 4.40564',
          stroke: 'currentColor',
        }),
        h('path', {
          d: 'M1.01221 7.9999L5.6964 7.9999C6.41913 7.9999 6.78049 7.9999 7.12115 8.08049C7.4232 8.15196 7.71233 8.26986 7.97821 8.43C8.27809 8.61061 8.5364 8.86331 9.05303 9.36871L11.3281 11.5944',
          stroke: 'currentColor',
        }),
        h('circle', { cx: 12.4502, cy: 3.3079, r: 1.56962, stroke: 'currentColor' }),
        h('circle', { cx: 12.4502, cy: 12.6921, r: 1.56962, stroke: 'currentColor' }),
      );
    }

    /** The workspace + branch line rendered under one Session title. */
    function LocationLabel(props) {
      const translate = typeof props.t === 'function' ? props.t : (key) => key;
      const location = useLocation({ ...props, t: translate });
      if (location === null) return null;
      const children = [folderIcon('folder'), h('span', { className: 'dsh-sl-workspace', key: 'ws' }, location.workspaceName)];
      if (typeof location.branch === 'string' && location.branch !== '') {
        children.push(h('span', { className: 'dsh-sl-sep', key: 'sep' }, '·'));
        children.push(branchIcon('branch-icon'));
        children.push(h('span', { className: 'dsh-sl-branch', key: 'branch' }, location.branch));
      }
      return h(
        'span',
        { className: CONTEXT_CLASS, 'data-dsh-session-location': '' },
        children,
      );
    }

    /**
     * Whether the row currently shows a status dot instead of the leading seat,
     * mirroring the host's own primary-state derivation.
     */
    function useHasStatusDot(useSessionStatus, sessionId) {
      const selectStatus = React.useCallback(
        (statuses) => (statuses !== undefined && statuses !== null && typeof statuses.get === 'function'
          ? statuses.get(sessionId)
          : undefined),
        [sessionId],
      );
      const status = typeof useSessionStatus === 'function' ? useSessionStatus(selectStatus) : undefined;
      if (status === undefined || status === null) return false;
      if (status.running === true) return true;
      if (status.completionUnread === true) return true;
      return status.pendingInteraction !== undefined && status.pendingInteraction !== null;
    }

    /**
     * Trailing counterpart of the leading seat. The host only renders the
     * leading seat for idle rows and hides the trailing seat's parent while the
     * row is hovered, so this seat covers exactly the rows whose state dot
     * replaces the leading one; idle rows are owned by the leading seat, which
     * keeps the line visible on hover.
     */
    function LocationLabelWhenRunning(props) {
      const active = useHasStatusDot(props.useSessionStatus, props.sessionId);
      if (!active) return null;
      return h(LocationLabel, props);
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'session-location: dictionaries');
      ctx.effect(() => {
        const sheet = document.createElement('style');
        sheet.setAttribute('data-plugin-style', 'dsh-session-location');
        sheet.textContent = CSS;
        document.head.appendChild(sheet);
        return () => {
          sheet.remove();
        };
      }, 'session-location: row label styles');

      const branchReader = createBranchReader(ctx);
      ctx.slots.inject('sidebar.session.row.leading', () => ctx.slots.register({
        name: 'sidebar.session.row.leading',
        id: LEADING_ID,
        order: 20,
        locale: NS,
        inject: () => ({ branchReader }),
      }, LocationLabel));
      ctx.slots.inject('sidebar.session.row.trailing', () => ctx.slots.register({
        name: 'sidebar.session.row.trailing',
        id: TRAILING_ID,
        order: 20,
        locale: NS,
        inject: () => ({ branchReader }),
      }, LocationLabelWhenRunning));
    }

    return { inject: ['slots', 'locale', 'remote', 'remote.workspaceFiles'], apply };
  },
});
