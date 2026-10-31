// dsh-smart-namer: CLIENT half.
//
// Two sidebar entry points open one shared dialog. The dialog asks the Host
// route for three names, then renames through the ordinary Client services the
// rest of the UI uses. Escape and the backdrop only close it.

window.__ModuleLoader__.load({
  id: 'dsh-smart-namer',
  factory: (require) => {
    const React = require('react')
    const { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } = React

    const NS = 'dsh-smart-namer'
    const SESSION_MENU_SLOT = 'sidebar.workspaces.session.menu.item'
    const WORKSPACE_MENU_SLOT = 'sidebar.panellist.actions'
    const OVERLAY_SLOT = 'shell.overlay'
    const SESSION_ITEM_ID = 'dsh-smart-namer-session'
    const WORKSPACE_ITEM_ID = 'dsh-smart-namer-workspace'
    const OVERLAY_ID = 'dsh-smart-namer-overlay'
    const ROUTE = '/__dsh-smart-name/suggest'
    const PROMPT_ROUTE = '/__dsh-smart-name/prompts'
    const CONFIG_SLOT = 'plugins.row.config'
    const CONFIG_KEY = 'dsh-smart-namer#dsh-smart-namer'
    const TIMEOUT_MS = 4000

    const zh = {
      'menu.session': '智能重命名',
      'menu.workspace': '智能重命名工作区',
      'dialog.sessionTitle': '重命名会话',
      'dialog.workspaceTitle': '重命名工作区',
      'dialog.workspaceLabel': '工作区',
      'dialog.thinking': '正在想…',
      'dialog.noIdea': '没想出更好的',
      'dialog.renaming': '正在改名…',
      'dialog.renameFailed': '改名失败，请再试一次',
      'dialog.close': '关闭',
      'dialog.untitledSession': '未命名会话',
      'dialog.untitledWorkspace': '未命名工作区',
      'toast.renamed': '已改为 ',
      'config.session': '会话命名提示词',
      'config.workspace': '工作区命名提示词',
      'config.hint': '留空即使用内置模板；保存后立即生效，无需重启。',
      'config.placeholdersSession': '可用占位符：{project} {codes} {title} {user_samples} {last_assistant_text}',
      'config.placeholdersWorkspace': '可用占位符：{folder} {codes} {workspace_path} {titles} {first_user_message}',
      'config.save': '保存',
      'config.reset': '恢复默认',
      'config.loadDefault': '载入默认模板',
      'config.saved': '已保存',
      'config.saveFailed': '保存失败',
      'config.loadFailed': '读取失败',
    }

    const en = {
      'menu.session': 'Rename with AI',
      'menu.workspace': 'Rename workspace with AI',
      'dialog.sessionTitle': 'Rename session',
      'dialog.workspaceTitle': 'Rename workspace',
      'dialog.workspaceLabel': 'Workspace',
      'dialog.thinking': 'Thinking…',
      'dialog.noIdea': 'Couldn’t think of a better name',
      'dialog.renaming': 'Renaming…',
      'dialog.renameFailed': 'Rename failed, please try again',
      'dialog.close': 'Close',
      'dialog.untitledSession': 'Untitled session',
      'dialog.untitledWorkspace': 'Untitled workspace',
      'toast.renamed': 'Renamed to ',
      'config.session': 'Session naming prompt',
      'config.workspace': 'Workspace naming prompt',
      'config.hint': 'Leave empty to use the built-in template. Saves apply immediately, no restart.',
      'config.placeholdersSession': 'Placeholders: {project} {codes} {title} {user_samples} {last_assistant_text}',
      'config.placeholdersWorkspace': 'Placeholders: {folder} {codes} {workspace_path} {titles} {first_user_message}',
      'config.save': 'Save',
      'config.reset': 'Reset to default',
      'config.loadDefault': 'Load default template',
      'config.saved': 'Saved',
      'config.saveFailed': 'Save failed',
      'config.loadFailed': 'Could not load',
    }

    const CSS = `
.dsh-smart-namer-menu-item {
  display: flex;
  align-items: center;
  gap: 6px;
  box-sizing: border-box;
  width: 100%;
  margin: 0;
  padding: 6px 8px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  text-align: left;
  cursor: pointer;
}
.dsh-smart-namer-menu-item:hover,
.dsh-smart-namer-menu-item:focus-visible {
  background: var(--dsw-alias-interactive-bg-hover);
  outline: none;
}
.dsh-smart-namer-menu-item svg {
  flex: none;
  color: var(--dsw-alias-label-secondary);
}
.dsh-smart-namer-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2147482000;
  background: transparent;
}
.dsh-smart-namer-dialog {
  position: fixed;
  box-sizing: border-box;
  width: 360px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 96px);
  overflow: auto;
  padding: 20px;
  border: 0;
  border-radius: 20px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  box-shadow:
    0 0 0 0.5px var(--dsw-alias-border-l1),
    0 3px 8px color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent),
    0 0 20px color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent);
  outline: none;
}
.dsh-smart-namer-dialog.is-centered {
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
}
.dsh-smart-namer-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.dsh-smart-namer-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
}
.dsh-smart-namer-mark {
  flex: none;
  color: var(--dsw-alias-label-secondary);
}
.dsh-smart-namer-close {
  flex: none;
  width: 24px;
  height: 24px;
  margin: -2px -4px 0 0;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 18px;
  line-height: 24px;
  cursor: pointer;
}
.dsh-smart-namer-close:hover,
.dsh-smart-namer-close:focus-visible {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
  outline: none;
}
.dsh-smart-namer-target {
  margin: 4px 0 10px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 17px;
  overflow-wrap: anywhere;
}
.dsh-smart-namer-workspace {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 6px 0 10px;
}
.dsh-smart-namer-workspace-label {
  flex: none;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 17px;
}
.dsh-smart-namer-workspace-select {
  flex: 1;
  min-width: 0;
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
}
.dsh-smart-namer-workspace-select:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: -1px;
}
.dsh-smart-namer-workspace-select:disabled {
  color: var(--dsw-alias-label-secondary);
  cursor: default;
}
.dsh-smart-namer-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0 -10px;
}
.dsh-smart-namer-candidate {
  display: block;
  box-sizing: border-box;
  width: 100%;
  margin: 0;
  padding: 8px 10px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 14px;
  line-height: 20px;
  text-align: left;
  cursor: pointer;
}
.dsh-smart-namer-candidate:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-smart-namer-candidate:focus-visible:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: -2px;
}
.dsh-smart-namer-candidate:disabled {
  color: var(--dsw-alias-label-secondary);
  cursor: default;
}
.dsh-smart-namer-status {
  margin-top: 10px;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 20px;
}
.dsh-smart-namer-error {
  color: var(--dsw-alias-state-error-primary);
}
.dsh-smart-namer-toast {
  position: fixed;
  left: 50%;
  top: 56px;
  z-index: 2147482001;
  max-width: calc(100vw - 32px);
  overflow: hidden;
  padding: 8px 14px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 999px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  box-shadow:
    0 0 0 0.5px var(--dsw-alias-border-l1),
    0 8px 24px color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent);
  font-size: 13px;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
  transform: translateX(-50%);
  pointer-events: none;
}
`

    function createStore(initial) {
      let value = initial
      const listeners = new Set()
      return {
        getSnapshot: () => value,
        subscribe: (listener) => {
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
        set: (next) => {
          value = next
          for (const listener of [...listeners]) listener()
        },
      }
    }

    function installStyle() {
      const previous = document.querySelector('style[data-dsh-smart-namer]')
      if (previous) previous.remove()
      const style = document.createElement('style')
      style.setAttribute('data-dsh-smart-namer', '')
      style.textContent = CSS
      document.head.appendChild(style)
      return () => {
        if (style.parentNode) style.remove()
      }
    }

    /**
     * One mark for the menu entries and the dialog title: a large spark with a
     * smaller one beside it. Both are drawn as filled four-point stars, scaled
     * so the small star still reads at 16px instead of collapsing into a dot.
     */
    function MarkIcon({ size = 16 }) {
      return React.createElement('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'currentColor',
        'aria-hidden': 'true',
        className: 'dsh-smart-namer-mark',
      }, [
        React.createElement('path', {
          key: 'big',
          d: 'M9.6 3.4l1.9 5.7 5.7 1.9-5.7 1.9-1.9 5.7-1.9-5.7L1.99 11l5.71-1.9 1.9-5.7z',
        }),
        React.createElement('path', {
          key: 'small',
          d: 'M18.5 12.6l1.15 3.35 3.35 1.15-3.35 1.15-1.15 3.35-1.15-3.35-3.35-1.15 3.35-1.15 1.15-3.35z',
        }),
      ])
    }

    /** Latest activity across one Workspace's Sessions, in epoch milliseconds. */
    function workspaceActivity(workspace, byId) {
      let latest = Number.NEGATIVE_INFINITY
      for (const sessionId of workspace.sessionIds ?? []) {
        const session = byId[sessionId]
        if (session && typeof session.updatedAt === 'number') latest = Math.max(latest, session.updatedAt)
      }
      return latest === Number.NEGATIVE_INFINITY ? (Date.parse(workspace.createdAt) || 0) : latest
    }

    /** Choose the current Session's Workspace, else the most recently active one. */
    function pickWorkspace(workspaceState, sessionState) {
      const items = Array.isArray(workspaceState?.items) ? workspaceState.items : []
      if (items.length === 0) return undefined
      const byId = sessionState?.byId ?? {}
      const ids = Array.isArray(sessionState?.ids) ? sessionState.ids : Object.keys(byId)
      const currentId = ids.find((id) => (byId[id]?.retainedBy?.mainView ?? 0) > 0)
      if (currentId !== undefined) {
        const hit = items.find((workspace) => (workspace.sessionIds ?? []).includes(currentId))
        if (hit) return hit
      }
      let selected
      let selectedTime = Number.NEGATIVE_INFINITY
      for (const workspace of items) {
        const latest = workspaceActivity(workspace, byId)
        if (selected === undefined || latest > selectedTime) {
          selected = workspace
          selectedTime = latest
        }
      }
      return selected
    }

    /**
     * The Workspace picker's rows: the Session's current Workspace first, every
     * other Workspace by most recent activity.
     */
    function workspaceChoices(workspaceState, sessionState) {
      const items = Array.isArray(workspaceState?.items) ? workspaceState.items : []
      const current = pickWorkspace(workspaceState, sessionState)
      if (!current) return []
      const byId = sessionState?.byId ?? {}
      const rest = items
        .filter((workspace) => workspace.workspaceId !== current.workspaceId)
        .sort((left, right) => workspaceActivity(right, byId) - workspaceActivity(left, byId))
      return [current, ...rest]
    }

    /** Viewport rect of the row that opened the dialog, so it can sit beside it. */
    function anchorOf(event) {
      const node = event?.currentTarget
      if (!node || typeof node.getBoundingClientRect !== 'function') return undefined
      const rect = node.getBoundingClientRect()
      return { x: rect.left, y: rect.top, w: rect.width, h: rect.height }
    }

    function SessionMenuItem({ sessionId, displayTitle, useMenuOpenState, openRequest, t }) {
      const [, setMenuOpen] = useMenuOpenState()
      return React.createElement('button', {
        type: 'button',
        role: 'menuitem',
        className: 'dsh-smart-namer-menu-item',
        onClick: (event) => {
          setMenuOpen(false)
          openRequest({ kind: 'session', id: sessionId, title: displayTitle || '', anchor: anchorOf(event) })
        },
      }, [
        React.createElement(MarkIcon, { key: 'icon', size: 16 }),
        React.createElement('span', { key: 'label' }, t('menu.session')),
      ])
    }

    function WorkspaceMenuItem({ useSessions, useWorkspaces, onDismiss, openRequest, t }) {
      if (typeof useSessions !== 'function' || typeof useWorkspaces !== 'function') return null
      const workspaceState = useWorkspaces((state) => state)
      const sessionState = useSessions((state) => state)
      const choices = workspaceChoices(workspaceState, sessionState)
      const target = choices[0]
      if (!target) return null
      return React.createElement('button', {
        type: 'button',
        role: 'menuitem',
        className: 'dsh-smart-namer-menu-item',
        onClick: (event) => {
          const anchor = anchorOf(event)
          if (typeof onDismiss === 'function') onDismiss()
          openRequest({
            kind: 'workspace',
            id: target.workspaceId,
            title: target.title || '',
            anchor,
            choices: choices.map((workspace) => ({
              id: workspace.workspaceId,
              title: workspace.title || '',
            })),
          })
        },
      }, [
        React.createElement(MarkIcon, { key: 'icon', size: 16 }),
        React.createElement('span', { key: 'label' }, t('menu.workspace')),
      ])
    }

    function SmartNameDialog({ request, renameSession, renameWorkspace, closeRequest, showToast, t }) {
      const [state, setState] = useState({ status: 'loading', names: [], error: null })
      const [selectedId, setSelectedId] = useState(request.id)
      const [placement, setPlacement] = useState(null)
      const dialogRef = useRef(null)
      const mountedRef = useRef(true)
      const workspaceList = Array.isArray(request.choices) ? request.choices : []

      // Sit beside the row that opened the dialog; fall back to the middle of
      // the window when there is no anchor (or the window is too narrow).
      useLayoutEffect(() => {
        const node = dialogRef.current
        if (!node) return
        const anchor = request.anchor
        if (!anchor || window.innerWidth < 720) {
          setPlacement({ centered: true })
          return
        }
        const width = node.offsetWidth
        const height = node.offsetHeight
        // Take the closed menu's place: left edge at the menu's left edge, not
        // past its right edge, so the dialog reads as "this menu became a card".
        let left = anchor.x
        if (left + width > window.innerWidth - 12) left = Math.max(12, window.innerWidth - width - 12)
        const top = Math.max(12, Math.min(anchor.y - 8, window.innerHeight - height - 12))
        setPlacement({ left, top })
      }, [request.anchor, request.id, selectedId, state.status])
      const selectedWorkspace = workspaceList.find((workspace) => workspace.id === selectedId)

      useEffect(() => {
        mountedRef.current = true
        return () => {
          mountedRef.current = false
        }
      }, [])

      useEffect(() => {
        let cancelled = false
        const targetId = request.kind === 'workspace' ? selectedId : request.id
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
        fetch(ROUTE, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ kind: request.kind, id: targetId }),
          signal: controller.signal,
        })
          .then(async (response) => {
            let data = {}
            try {
              data = await response.json()
            } catch {
              throw new Error('invalid response')
            }
            if (!response.ok || data?.ok !== true || !Array.isArray(data.names) || data.names.length === 0) {
              throw new Error('no names')
            }
            return data.names.slice(0, 3)
          })
          .then((names) => {
            if (!cancelled && mountedRef.current) setState({ status: 'done', names, error: null })
          })
          .catch(() => {
            if (!cancelled && mountedRef.current) setState({ status: 'error', names: [], error: null })
          })
          .finally(() => clearTimeout(timer))
        return () => {
          cancelled = true
          clearTimeout(timer)
          controller.abort()
        }
      }, [request.kind, request.id, selectedId])

      useEffect(() => {
        const previous = document.activeElement
        const onKeyDown = (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            closeRequest()
          }
        }
        document.addEventListener('keydown', onKeyDown, true)
        if (dialogRef.current) dialogRef.current.focus()
        return () => {
          document.removeEventListener('keydown', onKeyDown, true)
          if (previous && typeof previous.focus === 'function') previous.focus()
        }
      }, [closeRequest])

      const choose = useCallback(async (name) => {
        setState((current) => (current.status === 'renaming' ? current : { ...current, status: 'renaming', error: null }))
        try {
          if (request.kind === 'session') await renameSession(request.id, name)
          else await renameWorkspace(selectedId, name)
          showToast(t('toast.renamed') + name)
          closeRequest()
        } catch (error) {
          if (mountedRef.current) setState((current) => ({
            ...current,
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
          }))
        }
      }, [request, selectedId, renameSession, renameWorkspace, showToast, closeRequest, t])

      const dialogTitle = request.kind === 'session' ? t('dialog.sessionTitle') : t('dialog.workspaceTitle')
      const target = request.kind === 'workspace'
        ? (selectedWorkspace?.title || request.title || t('dialog.untitledWorkspace'))
        : (request.title || t('dialog.untitledSession'))
      const busy = state.status === 'renaming'
      const showWorkspacePicker = request.kind === 'workspace' && workspaceList.length > 0

      const children = [
        React.createElement('div', { key: 'head', className: 'dsh-smart-namer-head' }, [
          React.createElement('span', { key: 'title', className: 'dsh-smart-namer-title' }, [
            React.createElement(MarkIcon, { key: 'mark', size: 18 }),
            dialogTitle,
          ]),
          React.createElement('button', {
            key: 'close',
            type: 'button',
            className: 'dsh-smart-namer-close',
            'aria-label': t('dialog.close'),
            onClick: closeRequest,
          }, '×'),
        ]),
      ]

      if (showWorkspacePicker) {
        children.push(React.createElement('label', {
          key: 'workspace',
          className: 'dsh-smart-namer-workspace',
        }, [
          React.createElement('span', {
            key: 'label',
            className: 'dsh-smart-namer-workspace-label',
          }, t('dialog.workspaceLabel')),
          React.createElement('select', {
            key: 'select',
            className: 'dsh-smart-namer-workspace-select',
            value: selectedId,
            disabled: busy,
            onChange: (event) => {
              const nextId = event.target.value
              if (nextId === selectedId) return
              setSelectedId(nextId)
              setState({ status: 'loading', names: [], error: null })
            },
          }, workspaceList.map((workspace) => React.createElement('option', {
            key: workspace.id,
            value: workspace.id,
          }, workspace.title || t('dialog.untitledWorkspace')))),
        ]))
      } else {
        children.push(React.createElement('div', { key: 'target', className: 'dsh-smart-namer-target' }, target))
      }

      if (state.status === 'loading') {
        children.push(React.createElement('div', { key: 'loading', className: 'dsh-smart-namer-status' }, t('dialog.thinking')))
      } else if (state.status === 'error') {
        children.push(React.createElement('div', {
          key: 'empty',
          className: 'dsh-smart-namer-status',
          role: 'status',
        }, t('dialog.noIdea')))
      } else {
        children.push(React.createElement('div', { key: 'names', className: 'dsh-smart-namer-list' },
          state.names.map((name, index) => React.createElement('button', {
            key: `${index}:${name}`,
            type: 'button',
            className: 'dsh-smart-namer-candidate',
            disabled: busy,
            onClick: () => choose(name),
          }, name))))
        if (busy) {
          children.push(React.createElement('div', {
            key: 'renaming',
            className: 'dsh-smart-namer-status',
            role: 'status',
          }, t('dialog.renaming')))
        } else if (state.status === 'failed') {
          children.push(React.createElement('div', {
            key: 'failed',
            className: 'dsh-smart-namer-status dsh-smart-namer-error',
            role: 'alert',
            title: state.error || '',
          }, t('dialog.renameFailed')))
        }
      }

      return React.createElement('div', {
        className: 'dsh-smart-namer-backdrop',
        onMouseDown: (event) => {
          if (event.target === event.currentTarget) closeRequest()
        },
      }, React.createElement('div', {
        className: 'dsh-smart-namer-dialog' + ((!request.anchor || placement?.centered) ? ' is-centered' : ''),
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': dialogTitle,
        tabIndex: -1,
        ref: dialogRef,
        style: placement && !placement.centered
          ? { left: `${placement.left}px`, top: `${placement.top}px` }
          : (request.anchor && placement === null ? { visibility: 'hidden' } : undefined),
      }, children))
    }

    function Overlay({ requestStore, toastStore, renameSession, renameWorkspace, closeRequest, showToast, t }) {
      const request = useSyncExternalStore(requestStore.subscribe, requestStore.getSnapshot, requestStore.getSnapshot)
      const toast = useSyncExternalStore(toastStore.subscribe, toastStore.getSnapshot, toastStore.getSnapshot)
      return React.createElement(React.Fragment, null, [
        request
          ? React.createElement(SmartNameDialog, {
            key: request.nonce,
            request,
            renameSession,
            renameWorkspace,
            closeRequest,
            showToast,
            t,
          })
          : null,
        toast
          ? React.createElement('div', { key: 'toast', className: 'dsh-smart-namer-toast', role: 'status' }, toast.text)
          : null,
      ])
    }

    const FIELD_STYLE = {
      width: '100%',
      minHeight: 150,
      boxSizing: 'border-box',
      padding: '8px 10px',
      border: '1px solid var(--dsw-alias-border-l2)',
      borderRadius: 10,
      background: 'var(--dsw-alias-bg-layer-1)',
      color: 'var(--dsw-alias-label-primary)',
      font: '12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace',
      resize: 'vertical',
    }
    const HINT_STYLE = {
      margin: '4px 0 6px',
      color: 'var(--dsw-alias-label-tertiary)',
      fontSize: 12,
      lineHeight: 1.6,
    }
    const BUTTON_STYLE = {
      padding: '6px 14px',
      border: '1px solid var(--dsw-alias-border-l2)',
      borderRadius: 999,
      background: 'var(--dsw-alias-bg-layer-1)',
      color: 'var(--dsw-alias-label-primary)',
      font: 'inherit',
      fontSize: 13,
      cursor: 'pointer',
    }

    /** Plugin page form: edit the two prompt templates, save over HTTP. */
    function PromptConfigForm({ view, t }) {
      const [session, setSession] = useState('')
      const [workspace, setWorkspace] = useState('')
      const [defaults, setDefaults] = useState({})
      const [notice, setNotice] = useState(null)
      const [saving, setSaving] = useState(false)

      useEffect(() => {
        let alive = true
        fetch(PROMPT_ROUTE)
          .then((response) => response.json())
          .then((data) => {
            if (!alive || !data?.ok) return
            setSession(data.session || '')
            setWorkspace(data.workspace || '')
            setDefaults(data.defaults || {})
          })
          .catch(() => {
            if (alive) setNotice({ kind: 'error', text: t('config.loadFailed') })
          })
        return () => {
          alive = false
        }
      }, [t])

      if (view === 'summary') return null

      const save = async (next) => {
        setSaving(true)
        setNotice(null)
        try {
          const response = await fetch(PROMPT_ROUTE, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(next),
          })
          const data = await response.json().catch(() => ({}))
          if (!response.ok || data?.ok !== true) throw new Error('save failed')
          setNotice({ kind: 'ok', text: t('config.saved') })
        } catch {
          setNotice({ kind: 'error', text: t('config.saveFailed') })
        } finally {
          setSaving(false)
        }
      }

      return React.createElement('div', { style: { display: 'grid', gap: 18 } }, [
        React.createElement('p', { key: 'hint', style: HINT_STYLE }, t('config.hint')),
        React.createElement('div', { key: 'session' }, [
          React.createElement('div', { key: 'label', style: { fontSize: 13, fontWeight: 500 } }, t('config.session')),
          React.createElement('p', { key: 'ph', style: HINT_STYLE }, t('config.placeholdersSession')),
          React.createElement('textarea', {
            key: 'field',
            style: FIELD_STYLE,
            value: session,
            placeholder: defaults.session || '',
            onChange: (event) => setSession(event.target.value),
          }),
        ]),
        React.createElement('div', { key: 'workspace' }, [
          React.createElement('div', { key: 'label', style: { fontSize: 13, fontWeight: 500 } }, t('config.workspace')),
          React.createElement('p', { key: 'ph', style: HINT_STYLE }, t('config.placeholdersWorkspace')),
          React.createElement('textarea', {
            key: 'field',
            style: FIELD_STYLE,
            value: workspace,
            placeholder: defaults.workspace || '',
            onChange: (event) => setWorkspace(event.target.value),
          }),
        ]),
        React.createElement('div', { key: 'actions', style: { display: 'flex', gap: 8, alignItems: 'center' } }, [
          React.createElement('button', {
            key: 'save',
            type: 'button',
            style: BUTTON_STYLE,
            disabled: saving,
            onClick: () => save({ session, workspace }),
          }, t('config.save')),
          React.createElement('button', {
            key: 'load',
            type: 'button',
            style: BUTTON_STYLE,
            disabled: saving || !defaults.session,
            onClick: () => {
              setSession(defaults.session || '')
              setWorkspace(defaults.workspace || '')
            },
          }, t('config.loadDefault')),
          React.createElement('button', {
            key: 'reset',
            type: 'button',
            style: BUTTON_STYLE,
            disabled: saving,
            onClick: () => {
              setSession('')
              setWorkspace('')
              save({ session: '', workspace: '' })
            },
          }, t('config.reset')),
          notice
            ? React.createElement('span', {
              key: 'notice',
              role: 'status',
              style: { fontSize: 12, color: notice.kind === 'error' ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-label-secondary)' },
            }, notice.text)
            : null,
        ]),
      ])
    }

    function apply(ctx) {
      const t = ctx.locale.bind(NS)
      const requestStore = createStore(null)
      const toastStore = createStore(null)
      let toastTimer = null

      const showToast = (text) => {
        if (toastTimer !== null) clearTimeout(toastTimer)
        toastStore.set({ text, id: Date.now() })
        toastTimer = setTimeout(() => {
          toastTimer = null
          toastStore.set(null)
        }, 2400)
      }
      const openRequest = (request) => requestStore.set({ ...request, nonce: Date.now() + Math.random() })
      const closeRequest = () => requestStore.set(null)

      const renameSession = async (sessionId, title) => {
        const sessions = ctx.get('sessions')
        if (!sessions || typeof sessions.using !== 'function') throw new Error('sessions service unavailable')
        const result = await sessions.using(sessionId, { source: 'workspaceOperation' }, (reference) => reference.binding.session.rename(title))
        if (!result || result.ok !== true) throw new Error(result?.error?.message || 'rename failed')
      }

      const renameWorkspace = async (workspaceId, title) => {
        const workspaces = ctx.get('workspaces')
        if (!workspaces || typeof workspaces.rename !== 'function') throw new Error('workspaces service unavailable')
        await workspaces.rename(workspaceId, title)
      }

      ctx.effect(() => ctx.locale.register(NS, { zh, en }))
      ctx.effect(() => installStyle())
      ctx.effect(() => () => {
        if (toastTimer !== null) {
          clearTimeout(toastTimer)
          toastTimer = null
        }
      })

      ctx.slots.inject(SESSION_MENU_SLOT, () => ctx.slots.register({
        name: SESSION_MENU_SLOT,
        id: SESSION_ITEM_ID,
        order: 250,
        locale: NS,
        inject: () => ({ openRequest }),
      }, SessionMenuItem))

      ctx.slots.inject(WORKSPACE_MENU_SLOT, () => ctx.slots.register({
        name: WORKSPACE_MENU_SLOT,
        id: WORKSPACE_ITEM_ID,
        order: 50,
        locale: NS,
        inject: () => ({ openRequest }),
      }, WorkspaceMenuItem))

      ctx.slots.inject(CONFIG_SLOT, () => ctx.slots.register({
        name: CONFIG_SLOT,
        key: CONFIG_KEY,
        locale: NS,
      }, PromptConfigForm))

      ctx.slots.inject(OVERLAY_SLOT, () => ctx.slots.register({
        name: OVERLAY_SLOT,
        id: OVERLAY_ID,
        order: 120,
        locale: NS,
        inject: () => ({
          requestStore,
          toastStore,
          renameSession,
          renameWorkspace,
          closeRequest,
          showToast,
        }),
      }, Overlay))
    }

    return { apply, inject: ['slots', 'locale'] }
  },
})
